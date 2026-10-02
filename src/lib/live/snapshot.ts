import "server-only";
import { openf1Safe, type Query } from "../openf1/client";
import { isFinished, sessionTtl } from "../openf1/queries";
import type { Endpoint, Session } from "../openf1/types";
import { applyMessage, classification, createState, type LiveState } from "./state";

const byDate = (a: { date?: string | null }, b: { date?: string | null }) =>
  Date.parse(a.date ?? "") - Date.parse(b.date ?? "");

/** Current state of a session rebuilt from the REST API: the seed for the live screen. */
export async function getSessionSnapshot(session: Session): Promise<LiveState> {
  const state = createState(session.session_key);
  const ttl = sessionTtl(session);
  const key = { session_key: session.session_key };
  const load = async (endpoint: Endpoint, query: Query = key) => {
    const rows = await openf1Safe(endpoint, query, ttl);
    return rows as unknown as Record<string, unknown>[];
  };
  const replay = (topic: string, rows: Record<string, unknown>[]) => {
    for (const data of rows) applyMessage(state, topic, data);
  };

  const [drivers, results, laps, stints, pits, raceControl, radio, weather] = await Promise.all([
    load("drivers"),
    load("session_result"),
    load("laps"),
    load("stints"),
    load("pit"),
    load("race_control"),
    load("team_radio"),
    load("weather"),
  ]);

  replay("drivers", drivers);
  replay("laps", laps);
  replay("stints", stints);
  replay("pit", pits);
  replay("race_control", [...raceControl].sort(byDate));
  replay("team_radio", radio);
  if (weather.length) applyMessage(state, "weather", weather[weather.length - 1]);

  if (results.length) {
    replay("session_result", results);
    // Results only carry the gap to the leader; derive the gap to the car ahead.
    const rows = classification(state);
    rows.forEach((r, i) => {
      const ahead = rows[i - 1];
      r.interval =
        ahead && typeof r.gap === "number" && typeof ahead.gap === "number" ? r.gap - ahead.gap : i ? r.gap : null;
    });
  } else if (!isFinished(session)) {
    // Session in progress: positions change rarely, intervals every few seconds.
    const recent = new Date(Date.now() - 2 * 60_000).toISOString().replace("Z", "");
    const [positions, intervals] = await Promise.all([
      load("position"),
      load("intervals", { ...key, date: { op: ">=", value: recent } }),
    ]);
    replay("position", [...positions].sort(byDate));
    replay("intervals", [...intervals].sort(byDate));
  }

  return state;
}
