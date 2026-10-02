import "server-only";
import type { Outline } from "../track";
import { openf1Safe, TTL } from "./client";
import { isFinished } from "./queries";
import type { Meeting, Session } from "./types";

const outlines = new Map<number, Outline>();

// OpenF1 meetings link to MultiViewer's circuit description, which has a clean
// outline, corner positions and the conventional map rotation.
async function fromCircuitInfo(url: string): Promise<Outline | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const info = (await res.json()) as {
      x?: number[];
      y?: number[];
      rotation?: number;
      corners?: { number: number; trackPosition: { x: number; y: number } }[];
    };
    if (!info.x?.length || info.x.length !== info.y?.length) return null;
    return {
      x: info.x,
      y: info.y,
      rotation: info.rotation ?? 0,
      corners: (info.corners ?? []).map((c) => ({ number: c.number, x: c.trackPosition.x, y: c.trackPosition.y })),
    };
  } catch {
    return null;
  }
}

// Fallback: trace the fastest lap of a finished session from car location samples.
async function fromFastestLap(session: Session): Promise<Outline | null> {
  const laps = await openf1Safe("laps", { session_key: session.session_key }, TTL.STATIC);
  const timed = laps.filter((l) => l.lap_duration && l.date_start && !l.is_pit_out_lap);
  if (!timed.length) return null;
  const lap = timed.reduce((best, l) => (l.lap_duration! < best.lap_duration! ? l : best));
  const start = Date.parse(lap.date_start!);
  const stamp = (ms: number) => new Date(ms).toISOString().replace("Z", "");
  const points = await openf1Safe(
    "location",
    {
      session_key: session.session_key,
      driver_number: lap.driver_number,
      date: [
        { op: ">=", value: stamp(start) },
        { op: "<=", value: stamp(start + lap.lap_duration! * 1000) },
      ],
    },
    TTL.STATIC,
  );
  if (points.length < 50) return null;
  return { x: points.map((p) => p.x), y: points.map((p) => p.y), corners: [], rotation: 0 };
}

/** Outline from the circuit description only: no OpenF1 requests, so it is safe to call for a whole season. */
export async function getCircuitInfoOutline(meeting: Meeting): Promise<Outline | null> {
  const cached = outlines.get(meeting.meeting_key);
  if (cached) return cached;
  const outline = meeting.circuit_info_url ? await fromCircuitInfo(meeting.circuit_info_url) : null;
  if (outline) outlines.set(meeting.meeting_key, outline);
  return outline;
}

/** Outline of a meeting's circuit, or null when neither source has it yet. */
export async function getCircuitOutline(meeting: Meeting, sessions: Session[]): Promise<Outline | null> {
  const cached = outlines.get(meeting.meeting_key);
  if (cached) return cached;

  let outline = meeting.circuit_info_url ? await fromCircuitInfo(meeting.circuit_info_url) : null;
  if (!outline) {
    for (const session of sessions.filter((s) => isFinished(s)).reverse()) {
      outline = await fromFastestLap(session);
      if (outline) break;
    }
  }
  if (outline) outlines.set(meeting.meeting_key, outline);
  return outline;
}
