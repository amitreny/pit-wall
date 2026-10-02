import Link from "next/link";
import { Countdown, SessionClock } from "@/components/home/Countdown";
import { TrackMap } from "@/components/TrackMap";
import { Icon, Kerb, LiveDot, TeamBar } from "@/components/ui";
import {
  circuitTime,
  formatDuration,
  formatGap,
  formatLap,
  lastValue,
  teamCode,
  teamColour,
  utcOffsetLabel,
} from "@/lib/format";
import { getCircuitOutline } from "@/lib/openf1/circuit";
import {
  getCurrentWeekend,
  getDrivers,
  getLatestWeather,
  getSeasonStandings,
  getWeekendSummaries,
  type SessionSummary,
  type StandingRow,
} from "@/lib/openf1/queries";
import type { Driver, Meeting } from "@/lib/openf1/types";

export const dynamic = "force-dynamic";

function SessionCard({
  summary,
  meeting,
  drivers,
}: {
  summary: SessionSummary;
  meeting: Meeting;
  drivers: Map<number, Driver>;
}) {
  const { session, state, top } = summary;
  const when = circuitTime(session.date_start, meeting.gmt_offset);
  const isRace = session.session_type === "Race";

  if (state === "live") {
    return (
      <div className="relative flex flex-col justify-between overflow-hidden rounded bg-surface-container p-2 shadow-[0_0_16px_rgba(255,45,45,0.25)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-signal-red" />
        <div>
          <div className="mb-0.5 flex items-center justify-between">
            <div className="flex items-center gap-1 rounded bg-error-container px-1 py-0.5">
              <LiveDot className="bg-error" />
              <span className="t-label-caps text-error">Live window</span>
            </div>
            <span className="t-label-micro font-bold text-error">
              {when.day} {when.time}
            </span>
          </div>
          <span className="mt-1 block t-headline-md uppercase">{session.session_name}</span>
          <SessionClock start={session.date_start} end={session.date_end} />
        </div>
        <Link
          href="/live"
          className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded bg-signal-red font-display text-xl font-bold tracking-wider text-surface-container-lowest uppercase transition-colors hover:bg-error"
        >
          <Icon name="visibility" className="text-[16px]" />
          Watch live timing
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between rounded bg-surface-container-low p-2 transition-colors hover:bg-surface-container">
      <div>
        <div className="mb-0.5 flex items-center justify-between">
          <span className={`t-label-caps ${state === "upcoming" ? "text-primary" : "text-on-surface-variant"}`}>
            {state} {"//"} {when.day} {when.time}
          </span>
          {state === "upcoming" ? (
            <Icon name="schedule" className="text-[16px] text-primary" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-surface-bright" />
          )}
        </div>
        <span className="block t-headline-md uppercase">{session.session_name}</span>
        <div className="my-0.5 h-0.5 w-8 bg-surface-container-high" />

        {state === "finished" ? (
          <div className="mt-1 flex flex-col gap-0.5">
            {top.map((result, i) => {
              const driver = drivers.get(result.driver_number);
              const time = lastValue(result.duration);
              return (
                <div
                  key={result.driver_number}
                  className={`flex items-center justify-between rounded px-1 py-0.5 ${
                    i === 0 ? "bg-surface-container-lowest" : "bg-surface-container"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="t-label-caps text-on-surface-variant">{result.position}</span>
                    <TeamBar colour={teamColour(driver?.team_colour)} className="h-3.5 w-1" />
                    <span className="t-label-caps">{driver?.name_acronym ?? result.driver_number}</span>
                    <span className="t-label-micro text-on-surface-variant">{teamCode(driver?.team_name)}</span>
                  </div>
                  {i === 0 ? (
                    <span className="t-telemetry-cell font-bold text-secondary">
                      {isRace ? formatDuration(time) : formatLap(time)}
                    </span>
                  ) : (
                    <span className="t-telemetry-cell text-on-surface-variant">
                      {formatGap(lastValue(result.gap_to_leader)) || "–"}
                    </span>
                  )}
                </div>
              );
            })}
            {!top.length && <span className="t-body-sm text-on-surface-variant">Classification not published yet.</span>}
          </div>
        ) : (
          <div className="mt-1 flex flex-col gap-0.5 t-body-sm text-on-surface-variant">
            <div className="flex justify-between rounded bg-surface-container px-1 py-0.5">
              <span>STARTS (UTC)</span>
              <span className="t-telemetry-cell text-on-surface">
                {new Date(session.date_start).toISOString().slice(5, 16).replace("T", " ")}
              </span>
            </div>
            <div className="flex justify-between rounded bg-surface-container px-1 py-0.5">
              <span>SCHEDULED LENGTH</span>
              <span className="t-telemetry-cell text-primary">
                {Math.round((Date.parse(session.date_end) - Date.parse(session.date_start)) / 60000)} MIN
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between pt-0.5 t-label-micro text-on-surface-variant">
        <span>{session.session_type}</span>
        {state === "finished" ? (
          <Link href={`/session/${session.session_key}`} className="font-bold text-primary hover:text-on-surface">
            Full results →
          </Link>
        ) : (
          <span className="text-primary">{when.time} local</span>
        )}
      </div>
    </div>
  );
}

function StandingsPanel({
  title,
  rows,
}: {
  title: string;
  rows: (StandingRow & { key: string; name: string; code?: string; tag?: string })[];
}) {
  const leader = rows[0]?.points || 1;
  return (
    <div className="flex flex-col rounded bg-surface-container-low p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="t-headline-md uppercase tracking-wider">{title}</span>
          <span className="rounded bg-surface-container px-1 py-0.5 t-label-micro text-primary">Top 5</span>
        </div>
        <Link href="/championship" className="t-label-caps text-primary transition-colors hover:text-on-surface">
          Full standings →
        </Link>
      </div>
      <div className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-1 rounded bg-surface-container p-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <span className="w-6 t-headline-md font-extrabold italic">{row.position}</span>
                <TeamBar colour={teamColour(row.colour)} className="h-5 w-1.5" />
                <div className="flex min-w-0 items-baseline gap-1">
                  <span className="truncate t-headline-md uppercase">{row.name}</span>
                  {row.code && <span className="t-label-caps text-on-surface-variant">{row.code}</span>}
                </div>
                {row.tag && (
                  <span className="hidden rounded bg-surface-container-high px-0.5 py-0.5 t-label-micro text-on-surface-variant sm:inline">
                    {row.tag}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-baseline gap-2">
                {row.gapToLeader === 0 ? (
                  <span className="t-label-micro font-bold text-primary">Leader</span>
                ) : (
                  <span className="t-telemetry-cell text-on-surface-variant">{row.gapToLeader} PTS</span>
                )}
                <span className="t-telemetry-display">
                  {row.points} <span className="t-label-micro text-on-surface-variant">PTS</span>
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-lowest">
              <div
                className="h-full"
                style={{ width: `${(row.points / leader) * 100}%`, backgroundColor: teamColour(row.colour) }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Home() {
  const weekend = await getCurrentWeekend();
  if (!weekend) {
    return (
      <div className="rounded bg-surface-container-low p-6">
        <h1 className="t-headline-lg uppercase">No race weekend data</h1>
        <p className="mt-2 text-on-surface-variant">
          OpenF1 returned nothing. Without sponsor credentials the API is locked while a session is live.
        </p>
      </div>
    );
  }

  const { meeting, sessions, liveSession, nextSession, round } = weekend;
  const [summaries, drivers, standings, outline, weather] = await Promise.all([
    getWeekendSummaries(sessions),
    getDrivers({ meeting_key: meeting.meeting_key }),
    getSeasonStandings(meeting.year),
    getCircuitOutline(meeting, sessions),
    getLatestWeather(meeting.meeting_key),
  ]);
  const next = nextSession ? circuitTime(nextSession.date_start, meeting.gmt_offset) : null;

  const specs = [
    { label: "Circuit", value: meeting.circuit_short_name },
    { label: "Type", value: meeting.circuit_type ?? "–" },
    { label: "Turns", value: outline?.corners.length ? String(outline.corners.length) : "–" },
    { label: "Sessions", value: String(sessions.length) },
    { label: "Local time", value: utcOffsetLabel(meeting.gmt_offset) },
  ];

  return (
    <div className="flex w-full flex-col gap-0.5 pb-4">
      <Kerb />

      <section className="grid w-full grid-cols-1 gap-0.5 lg:grid-cols-12">
        <div className="relative flex flex-col justify-between overflow-hidden bg-surface-container-low p-3 lg:col-span-7">
          <div className="pointer-events-none absolute -top-8 -right-8 font-display text-[9rem] leading-none font-extrabold tracking-tighter text-surface-container-high italic opacity-40 select-none">
            {meeting.country_code}
            {String(meeting.year).slice(2)}
          </div>
          <div className="relative z-10 flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1">
              <div className="flex items-center rounded bg-surface-container-high py-0.5 pr-4 pl-2 [clip-path:polygon(0_0,calc(100%-8px)_0,100%_100%,0_100%)]">
                <span className="t-label-caps tracking-widest text-primary">
                  {round ? `Round ${round} // ` : ""}
                  {meeting.year} FIA Formula One World Championship
                </span>
              </div>
              {weather && (
                <div className="rounded bg-surface-container px-1 py-0.5 t-label-micro text-on-surface-variant">
                  Track {weather.track_temperature.toFixed(1)}°C {weather.rainfall ? "wet" : "dry"}
                </div>
              )}
            </div>
            <div className="mt-0.5">
              <p className="font-display text-xl leading-6 font-bold tracking-wide text-on-surface-variant uppercase">
                {meeting.meeting_official_name}
              </p>
              <h1 className="t-headline-xl tracking-tight text-primary uppercase italic lg:text-[4rem] lg:leading-[3.75rem]">
                {meeting.meeting_name} {meeting.year}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="t-label-caps tracking-wider">
                  {meeting.circuit_short_name} {"//"} {meeting.location}, {meeting.country_name}
                </span>
                <span className="t-telemetry-cell text-on-surface-variant">
                  Circuit time {utcOffsetLabel(meeting.gmt_offset)}
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-4 rounded bg-surface-container-lowest p-2">
            <div className="mb-1 flex flex-col items-start justify-between gap-2 rounded bg-surface-container-low px-2 py-1 sm:flex-row sm:items-center">
              <div className="flex items-center gap-1">
                <Icon name="sports_score" className="text-[18px] text-error" />
                <span className="t-label-caps tracking-wider">
                  {liveSession
                    ? `Live window: ${liveSession.session_name}`
                    : nextSession && next
                      ? `Next session: ${nextSession.session_name} // ${next.day} ${next.time} local`
                      : "Weekend complete"}
                </span>
              </div>
            </div>
            {liveSession ? (
              <SessionClock start={liveSession.date_start} end={liveSession.date_end} />
            ) : nextSession ? (
              <Countdown target={nextSession.date_start} />
            ) : null}
            <div className="mt-2 flex items-center gap-1 pt-0.5">
              <Link
                href="/live"
                className="flex h-10 flex-1 items-center justify-center gap-1 rounded bg-signal-red t-headline-md font-bold tracking-wider text-surface-container-lowest uppercase transition-colors hover:bg-error"
              >
                {liveSession && <span className="h-2 w-2 animate-pulse rounded-full bg-surface-container-lowest" />}
                {liveSession ? "Enter live timing" : "Open timing console"}
              </Link>
              <Link
                href="/championship"
                className="flex h-10 items-center justify-center gap-0.5 rounded bg-surface-container px-3 t-label-caps transition-colors hover:bg-surface-container-high"
              >
                <Icon name="emoji_events" className="text-[16px] text-on-surface-variant" />
                Standings
              </Link>
            </div>
          </div>
        </div>

        <div className="relative flex flex-col justify-between overflow-hidden bg-surface-container-low p-3 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="t-headline-md uppercase tracking-wider">Circuit map</span>
              <p className="t-label-micro tracking-wider text-on-surface-variant">
                {meeting.circuit_short_name} {"//"} {meeting.country_name}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded bg-surface-container px-1 py-0.5">
              <span className={`h-2 w-2 rounded-full ${liveSession ? "bg-signal-red" : "bg-primary-container"}`} />
              <span className="t-label-micro">{liveSession ? "Session live" : "Track clear"}</span>
            </div>
          </div>
          <div className="relative my-1 flex h-[300px] w-full items-center justify-center">
            <div className="absolute inset-0 bg-[radial-gradient(#292a2d_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
            {outline ? (
              <TrackMap outline={outline} className="relative h-full w-full" />
            ) : meeting.circuit_image ? (
              // Remote image on a host that varies by season; not worth an optimizer allowlist.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meeting.circuit_image}
                alt={`${meeting.circuit_short_name} circuit`}
                className="relative max-h-full w-auto object-contain"
              />
            ) : (
              <span className="relative t-label-caps text-on-surface-variant">Circuit map available after first session</span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-0.5 rounded bg-surface-container p-1 text-center">
            {specs.map((spec) => (
              <div key={spec.label}>
                <span className="block t-label-micro text-on-surface-variant">{spec.label}</span>
                <span className="t-telemetry-cell font-bold">{spec.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full">
        <div className="my-0.5 flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1">
            <span className="t-headline-md uppercase tracking-wider">Weekend timetable</span>
            <span className="rounded bg-surface-container px-1 py-0.5 t-label-micro text-on-surface-variant">
              Local {utcOffsetLabel(meeting.gmt_offset)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-0.5 md:grid-cols-3 lg:grid-cols-5">
          {summaries.map((summary) => (
            <SessionCard key={summary.session.session_key} summary={summary} meeting={meeting} drivers={drivers} />
          ))}
        </div>
      </section>

      {standings && (
        <section className="grid w-full grid-cols-1 gap-0.5 lg:grid-cols-2">
          <StandingsPanel
            title={`${standings.year} Drivers' championship`}
            rows={standings.drivers.slice(0, 5).map((d) => ({
              ...d,
              key: String(d.driver_number),
              name: d.driver?.full_name ?? `Car ${d.driver_number}`,
              code: d.driver?.name_acronym,
              tag: d.driver?.team_name,
            }))}
          />
          <StandingsPanel
            title={`${standings.year} Constructors' championship`}
            rows={standings.teams.slice(0, 5).map((t) => ({ ...t, key: t.team_name, name: t.team_name }))}
          />
        </section>
      )}
    </div>
  );
}
