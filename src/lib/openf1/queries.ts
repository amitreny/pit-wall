import "server-only";
import { openf1Safe, TTL } from "./client";
import type { Driver, Meeting, Session, SessionResult, Weather } from "./types";

// Live data is served from 30 minutes before a session to 30 minutes after it.
const LIVE_WINDOW_MS = 30 * 60 * 1000;

export function isLive(session: Session, now = Date.now()): boolean {
  return (
    !session.is_cancelled &&
    now >= Date.parse(session.date_start) - LIVE_WINDOW_MS &&
    now <= Date.parse(session.date_end) + LIVE_WINDOW_MS
  );
}

export function isFinished(session: Session, now = Date.now()): boolean {
  return now > Date.parse(session.date_end) + LIVE_WINDOW_MS;
}

/** Cache lifetime for data belonging to a session. */
export function sessionTtl(session: Session): number {
  if (isFinished(session)) return TTL.STATIC;
  return isLive(session) ? TTL.LIVE : TTL.DEFAULT;
}

const byStart = (a: { date_start: string }, b: { date_start: string }) =>
  Date.parse(a.date_start) - Date.parse(b.date_start);

export const currentYear = () => new Date().getUTCFullYear();

export async function getSeasonSessions(year = currentYear()): Promise<Session[]> {
  return (await openf1Safe("sessions", { year }, TTL.SLOW)).filter((s) => !s.is_cancelled).sort(byStart);
}

export interface RaceWeekend {
  meeting: Meeting;
  sessions: Session[];
  liveSession: Session | null;
  nextSession: Session | null;
  /** 1-based position of the meeting among the season's grands prix. */
  round: number;
}

/** The meeting in progress, or else the next one, or else the last of the season. */
export async function getCurrentWeekend(year = currentYear()): Promise<RaceWeekend | null> {
  const [meetings, allSessions] = await Promise.all([
    openf1Safe("meetings", { year }, TTL.SLOW),
    getSeasonSessions(year),
  ]);
  const active = meetings.filter((m) => !m.is_cancelled).sort(byStart);
  if (!active.length) return null;
  const now = Date.now();
  const meeting = active.find((m) => Date.parse(m.date_end) + LIVE_WINDOW_MS >= now) ?? active[active.length - 1];
  const sessions = allSessions.filter((s) => s.meeting_key === meeting.meeting_key);
  // Pre-season testing is a meeting but not a championship round.
  const rounds = active.filter((m) => allSessions.some((s) => s.meeting_key === m.meeting_key && s.session_name === "Race"));
  return {
    meeting,
    sessions,
    liveSession: sessions.find((s) => isLive(s, now)) ?? null,
    nextSession: sessions.find((s) => Date.parse(s.date_start) > now) ?? null,
    round: rounds.findIndex((m) => m.meeting_key === meeting.meeting_key) + 1,
  };
}

/** The session to show on the live screen: the one running now, else the most recent one. */
export async function getLatestSession(year = currentYear()): Promise<Session | null> {
  const sessions = await getSeasonSessions(year);
  const now = Date.now();
  return (
    sessions.find((s) => isLive(s, now)) ??
    [...sessions].reverse().find((s) => Date.parse(s.date_start) <= now) ??
    null
  );
}

export async function getDrivers(query: { session_key: number } | { meeting_key: number }): Promise<Map<number, Driver>> {
  const drivers = await openf1Safe("drivers", query, TTL.SLOW);
  return new Map(drivers.map((d) => [d.driver_number, d]));
}

export async function getLatestWeather(meetingKey: number): Promise<Weather | null> {
  const weather = await openf1Safe("weather", { meeting_key: meetingKey });
  return weather.length ? weather[weather.length - 1] : null;
}

export interface SessionSummary {
  session: Session;
  state: "finished" | "live" | "upcoming";
  top: SessionResult[];
}

/** Each session of a weekend with its top three, where it has been classified. */
export function getWeekendSummaries(sessions: Session[]): Promise<SessionSummary[]> {
  const now = Date.now();
  return Promise.all(
    sessions.map(async (session): Promise<SessionSummary> => {
      if (Date.parse(session.date_start) > now && !isLive(session, now)) {
        return { session, state: "upcoming", top: [] };
      }
      const top = await openf1Safe(
        "session_result",
        { session_key: session.session_key, position: { op: "<=", value: 3 } },
        sessionTtl(session),
      );
      top.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
      return { session, state: isFinished(session, now) ? "finished" : "live", top };
    }),
  );
}

// --- season calendar ---

export interface CalendarRound {
  round: number;
  meeting: Meeting;
  race: Session;
  hasSprint: boolean;
  state: "finished" | "current" | "upcoming";
  /** Whole days until the race starts; 0 on race day and after. */
  daysToRace: number;
  /** True once the first session of the weekend has begun. */
  weekendStarted: boolean;
  winner: { result: SessionResult; driver: Driver | undefined } | null;
}

export async function getSeasonCalendar(year: number): Promise<CalendarRound[]> {
  const [meetings, sessions] = await Promise.all([
    openf1Safe("meetings", { year }, TTL.SLOW),
    getSeasonSessions(year),
  ]);
  const now = Date.now();
  // Pre-season testing is a meeting but not a championship round.
  const rounds = meetings
    .filter((m) => !m.is_cancelled)
    .sort(byStart)
    .flatMap((meeting) => {
      const own = sessions.filter((s) => s.meeting_key === meeting.meeting_key);
      const race = own.find((s) => s.session_name === "Race");
      return race ? [{ meeting, race, hasSprint: own.some((s) => s.session_name === "Sprint") }] : [];
    });
  const current = rounds.find((r) => Date.parse(r.meeting.date_end) + LIVE_WINDOW_MS >= now);

  const finished = rounds.filter((r) => isFinished(r.race, now));
  const winners = new Map<number, SessionResult>();
  const winnerInfo = new Map<string, Driver>();
  if (finished.length) {
    const keys = finished.map((r) => r.race.session_key);
    const range = [
      { op: ">=" as const, value: Math.min(...keys) },
      { op: "<=" as const, value: Math.max(...keys) },
    ];
    const results = await openf1Safe("session_result", { session_key: range, position: 1 }, TTL.SLOW);
    for (const r of results) if (keys.includes(r.session_key)) winners.set(r.session_key, r);
    // Entry lists are per session; one request covers every winner at every race.
    const numbers = [...new Set([...winners.values()].map((r) => r.driver_number))];
    if (numbers.length) {
      const entries = await openf1Safe("drivers", { session_key: range, driver_number: numbers }, TTL.SLOW);
      for (const d of entries) winnerInfo.set(`${d.session_key}:${d.driver_number}`, d);
    }
  }

  return rounds.map((r, i) => {
    const result = winners.get(r.race.session_key);
    return {
      ...r,
      round: i + 1,
      state: r === current ? "current" : isFinished(r.race, now) ? "finished" : "upcoming",
      daysToRace: Math.max(0, Math.ceil((Date.parse(r.race.date_start) - now) / 86_400_000)),
      weekendStarted: Date.parse(r.meeting.date_start) <= now,
      winner: result
        ? { result, driver: winnerInfo.get(`${r.race.session_key}:${result.driver_number}`) }
        : null,
    };
  });
}

// --- championship ---

// Points for a win. No fastest-lap point since 2025.
const GP_WIN_POINTS = 25;
const SPRINT_WIN_POINTS = 8;
// A team's best possible weekend: first and second place.
const GP_TEAM_POINTS = 25 + 18;
const SPRINT_TEAM_POINTS = 8 + 7;

export interface StandingRow {
  position: number;
  /** Places gained (+) or lost (−) at the last race or sprint. */
  change: number;
  points: number;
  gapToLeader: number;
  /** Points scored at the last race or sprint. */
  lastGain: number;
  /** Championship points after each grand prix so far. */
  series: number[];
  colour: string | null;
}

export interface DriverStanding extends StandingRow {
  driver_number: number;
  driver: Driver | undefined;
  /** Grand prix result per round: a finishing position, "R", "DNS", "DQ" or "–". */
  form: string[];
  wins: number;
  podiums: number;
}

export interface TeamStanding extends StandingRow {
  team_name: string;
  /** Points scored at each round (grand prix plus any sprint that weekend). */
  roundPoints: number[];
}

export interface SeasonStandings {
  year: number;
  /** The race or sprint the standings were computed after. */
  latest: Session;
  /** Grands prix completed so far, in order. */
  rounds: Session[];
  totalRounds: number;
  remaining: { grandsPrix: number; sprints: number; maxDriverPoints: number; maxTeamPoints: number };
  drivers: DriverStanding[];
  teams: TeamStanding[];
}

export async function getSeasonStandings(year = currentYear()): Promise<SeasonStandings | null> {
  const sessions = await getSeasonSessions(year);
  // Standings only exist for sessions of type "Race" (grands prix and sprints).
  const races = sessions.filter((s) => s.session_type === "Race");
  const finished = races.filter((s) => isFinished(s));
  if (!finished.length) return null;

  const keys = finished.map((s) => s.session_key);
  const range = {
    session_key: [
      { op: ">=" as const, value: Math.min(...keys) },
      { op: "<=" as const, value: Math.max(...keys) },
    ],
  };
  const [driverRows, teamRows, results] = await Promise.all([
    openf1Safe("championship_drivers", range, TTL.SLOW),
    openf1Safe("championship_teams", range, TTL.SLOW),
    openf1Safe("session_result", range, TTL.SLOW),
  ]);

  // The newest race can lag behind while results are processed, so use the last one that has standings.
  const withStandings = finished.filter((s) => driverRows.some((r) => r.session_key === s.session_key));
  const latest = withStandings[withStandings.length - 1];
  if (!latest) return null;
  const rounds = withStandings.filter((s) => s.session_name === "Race");

  // Entry lists are per session, so a driver who missed the latest race is absent from it.
  // Look those drivers up in the last session they have a result for.
  const driverInfo = await getDrivers({ session_key: latest.session_key });
  const order = new Map(sessions.map((s, i) => [s.session_key, i]));
  const lastSeen = new Map<number, number>();
  for (const r of results) {
    if (driverInfo.has(r.driver_number)) continue;
    const seen = lastSeen.get(r.driver_number);
    if (seen == null || (order.get(r.session_key) ?? -1) > (order.get(seen) ?? -1)) {
      lastSeen.set(r.driver_number, r.session_key);
    }
  }
  for (const sessionKey of new Set(lastSeen.values())) {
    for (const [number, driver] of await getDrivers({ session_key: sessionKey })) {
      if (!driverInfo.has(number)) driverInfo.set(number, driver);
    }
  }
  const teamColours = new Map<string, string | null>();
  for (const d of driverInfo.values()) teamColours.set(d.team_name, d.team_colour);

  const resultAt = new Map(results.map((r) => [`${r.session_key}:${r.driver_number}`, r]));
  const formLabel = (r: SessionResult | undefined) =>
    !r ? "–" : r.dsq ? "DQ" : r.dns ? "DNS" : r.dnf ? "R" : String(r.position ?? "–");

  function series<T extends { session_key: number; points_current: number }>(rows: T[]): number[] {
    const at = new Map(rows.map((r) => [r.session_key, r.points_current]));
    let last = 0;
    return rounds.map((s) => (last = at.get(s.session_key) ?? last));
  }

  const latestDriverRows = driverRows
    .filter((r) => r.session_key === latest.session_key)
    .sort((a, b) => a.position_current - b.position_current);
  const leaderPoints = latestDriverRows[0]?.points_current ?? 0;

  const drivers = latestDriverRows.map((row): DriverStanding => {
    const gpResults = rounds.map((s) => resultAt.get(`${s.session_key}:${row.driver_number}`));
    const classified = gpResults.filter((r) => r && !r.dnf && !r.dns && !r.dsq && r.position != null);
    const driver = driverInfo.get(row.driver_number);
    return {
      driver_number: row.driver_number,
      driver,
      colour: driver?.team_colour ?? null,
      position: row.position_current,
      change: row.position_start != null ? row.position_start - row.position_current : 0,
      points: row.points_current,
      gapToLeader: row.points_current - leaderPoints,
      lastGain: row.points_current - row.points_start,
      series: series(driverRows.filter((r) => r.driver_number === row.driver_number)),
      form: gpResults.map(formLabel),
      wins: classified.filter((r) => r!.position === 1).length,
      podiums: classified.filter((r) => r!.position! <= 3).length,
    };
  });

  const latestTeamRows = teamRows
    .filter((r) => r.session_key === latest.session_key)
    .sort((a, b) => a.position_current - b.position_current);
  const teamLeaderPoints = latestTeamRows[0]?.points_current ?? 0;

  const teams = latestTeamRows.map((row): TeamStanding => {
    const points = series(teamRows.filter((r) => r.team_name === row.team_name));
    return {
      team_name: row.team_name,
      colour: teamColours.get(row.team_name) ?? null,
      position: row.position_current,
      change: row.position_start != null ? row.position_start - row.position_current : 0,
      points: row.points_current,
      gapToLeader: row.points_current - teamLeaderPoints,
      lastGain: row.points_current - row.points_start,
      series: points,
      roundPoints: points.map((p, i) => p - (i ? points[i - 1] : 0)),
    };
  });

  const upcoming = races.filter((s) => Date.parse(s.date_start) > Date.parse(latest.date_start));
  const grandsPrix = upcoming.filter((s) => s.session_name === "Race").length;
  const sprints = upcoming.length - grandsPrix;

  return {
    year,
    latest,
    rounds,
    totalRounds: races.filter((s) => s.session_name === "Race").length,
    remaining: {
      grandsPrix,
      sprints,
      maxDriverPoints: grandsPrix * GP_WIN_POINTS + sprints * SPRINT_WIN_POINTS,
      maxTeamPoints: grandsPrix * GP_TEAM_POINTS + sprints * SPRINT_TEAM_POINTS,
    },
    drivers,
    teams,
  };
}
