import "server-only";
import { openf1Safe, TTL } from "./client";
import { getDrivers, getSeasonSessions, isFinished, sessionTtl } from "./queries";
import type { Driver, Lap, Meeting, Pit, Position, RaceControl, Session, SessionResult, Stint, Weather } from "./types";

const byStart = (a: { date_start: string }, b: { date_start: string }) =>
  Date.parse(a.date_start) - Date.parse(b.date_start);

/** A session by key, or "latest" for the most recent finished one. */
export async function resolveSession(key: string): Promise<Session | null> {
  if (key === "latest") {
    const sessions = await getSeasonSessions();
    const now = Date.now();
    return (
      [...sessions].reverse().find((s) => isFinished(s, now)) ??
      [...sessions].reverse().find((s) => Date.parse(s.date_start) <= now) ??
      null
    );
  }
  const sessionKey = Number(key);
  if (!Number.isInteger(sessionKey)) return null;
  const [session] = await openf1Safe("sessions", { session_key: sessionKey }, TTL.SLOW);
  return session ?? null;
}

export interface SessionContext {
  session: Session;
  meeting: Meeting | null;
  /** All sessions of the same weekend, in order. */
  siblings: Session[];
  drivers: Map<number, Driver>;
}

export async function getSessionContext(key: string): Promise<SessionContext | null> {
  const session = await resolveSession(key);
  if (!session) return null;
  const [meetings, siblings, drivers] = await Promise.all([
    openf1Safe("meetings", { meeting_key: session.meeting_key }, TTL.SLOW),
    openf1Safe("sessions", { meeting_key: session.meeting_key }, TTL.SLOW),
    getDrivers({ session_key: session.session_key }),
  ]);
  return {
    session,
    meeting: meetings[0] ?? null,
    siblings: siblings.filter((s) => !s.is_cancelled).sort(byStart),
    drivers,
  };
}

export interface SessionData {
  results: SessionResult[];
  laps: Lap[];
  stints: Stint[];
  pits: Pit[];
  positions: Position[];
  raceControl: RaceControl[];
  weather: Weather | null;
  /** Starting position per driver number; empty for sessions without a grid. */
  grid: Map<number, number>;
}

const order = (r: SessionResult) => (r.position ?? 900) + (r.dsq ? 300 : r.dns ? 200 : r.dnf ? 100 : 0);

/** Everything the results and strategy screens need for one session. */
export async function getSessionData({ session, siblings }: SessionContext): Promise<SessionData> {
  const ttl = sessionTtl(session);
  const key = { session_key: session.session_key };
  const isRace = session.session_type === "Race";

  const [results, laps, stints, pits, positions, raceControl, weather, gridRows] = await Promise.all([
    openf1Safe("session_result", key, ttl),
    openf1Safe("laps", key, ttl),
    openf1Safe("stints", key, ttl),
    openf1Safe("pit", key, ttl),
    isRace ? openf1Safe("position", key, ttl) : Promise.resolve([]),
    openf1Safe("race_control", key, ttl),
    openf1Safe("weather", key, ttl),
    isRace ? openf1Safe("starting_grid", { meeting_key: session.meeting_key }, ttl) : Promise.resolve([]),
  ]);

  positions.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  // The grid is filed under the qualifying session that set it.
  const qualifyingName = session.session_name === "Sprint" ? "Sprint Qualifying" : "Qualifying";
  const qualifying = siblings.find((s) => s.session_name === qualifyingName);
  const grid = new Map<number, number>();
  for (const row of gridRows) {
    if (!qualifying || row.session_key === qualifying.session_key) grid.set(row.driver_number, row.position);
  }
  // Fallback: each car's first recorded position is where it lined up.
  if (!grid.size) {
    for (const p of positions) if (!grid.has(p.driver_number)) grid.set(p.driver_number, p.position);
  }

  return {
    results: [...results].sort((a, b) => order(a) - order(b)),
    laps,
    stints: [...stints].sort((a, b) => a.stint_number - b.stint_number),
    pits,
    positions,
    raceControl,
    weather: weather.length ? weather[weather.length - 1] : null,
    grid,
  };
}

export interface BestLap {
  driver: number;
  lap: number;
  time: number;
  compound: string | null;
}

/** Each driver's fastest lap, quickest first. */
export function bestLaps(laps: Lap[], stints: Stint[]): BestLap[] {
  const best = new Map<number, Lap>();
  for (const lap of laps) {
    if (lap.lap_duration == null) continue;
    const current = best.get(lap.driver_number);
    if (!current || lap.lap_duration < current.lap_duration!) best.set(lap.driver_number, lap);
  }
  return [...best.values()]
    .map((lap) => ({
      driver: lap.driver_number,
      lap: lap.lap_number,
      time: lap.lap_duration!,
      compound: compoundAt(stints, lap.driver_number, lap.lap_number),
    }))
    .sort((a, b) => a.time - b.time);
}

export function compoundAt(stints: Stint[], driver: number, lap: number): string | null {
  const stint = stints.find(
    (s) => s.driver_number === driver && (s.lap_start ?? 0) <= lap && lap <= (s.lap_end ?? Infinity),
  );
  return stint?.compound ?? null;
}

/** Lap ranges run under the safety car or virtual safety car. */
export function neutralisedLaps(raceControl: RaceControl[]): { from: number; to: number; virtual: boolean }[] {
  const periods: { from: number; to: number; virtual: boolean }[] = [];
  let open: { from: number; virtual: boolean } | null = null;
  const messages = raceControl
    .filter((m) => m.category === "SafetyCar" && m.lap_number != null)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  for (const m of messages) {
    const text = m.message.toUpperCase();
    if (text.includes("DEPLOYED")) {
      open ??= { from: m.lap_number!, virtual: text.includes("VIRTUAL") };
    } else if (open && (text.includes("IN THIS LAP") || text.includes("ENDING"))) {
      periods.push({ ...open, to: m.lap_number! + 1 });
      open = null;
    }
  }
  return periods;
}
