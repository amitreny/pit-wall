import { LiveConsole, type ConsoleMode } from "@/components/live/LiveConsole";
import { getSessionSnapshot } from "@/lib/live/snapshot";
import { hasCredentials } from "@/lib/openf1/auth";
import { getCircuitOutline } from "@/lib/openf1/circuit";
import { openf1Safe, TTL } from "@/lib/openf1/client";
import { getLatestSession, getSeasonSessions, isLive } from "@/lib/openf1/queries";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const session = await getLatestSession();
  if (!session) {
    return (
      <div className="rounded bg-surface-container-low p-6">
        <h1 className="t-headline-lg uppercase">No session data</h1>
        <p className="mt-2 text-on-surface-variant">
          OpenF1 returned no sessions. Without sponsor credentials the API is locked while a session is live.
        </p>
      </div>
    );
  }

  const [snapshot, meetings, sessions] = await Promise.all([
    getSessionSnapshot(session),
    openf1Safe("meetings", { year: session.year }, TTL.SLOW),
    getSeasonSessions(session.year),
  ]);
  const meeting = meetings.find((m) => m.meeting_key === session.meeting_key) ?? null;
  const outline = meeting
    ? await getCircuitOutline(
        meeting,
        sessions.filter((s) => s.meeting_key === meeting.meeting_key),
      )
    : null;

  const mode: ConsoleMode = !isLive(session) ? "replay" : hasCredentials() ? "live" : "locked";
  // The API has no scheduled race distance; once the race is over the winner's lap count is it.
  const totalLaps =
    session.session_type === "Race" && mode === "replay" && snapshot.lap > 0 ? snapshot.lap : null;

  return (
    <LiveConsole
      key={session.session_key}
      snapshot={snapshot}
      session={session}
      meeting={meeting}
      outline={outline}
      mode={mode}
      totalLaps={totalLaps}
    />
  );
}
