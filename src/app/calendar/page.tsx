import Link from "next/link";
import { TrackMap } from "@/components/TrackMap";
import { Icon, LiveDot, TeamBar } from "@/components/ui";
import { formatDuration, lastValue, teamCode, teamColour } from "@/lib/format";
import { getCircuitInfoOutline } from "@/lib/openf1/circuit";
import { currentYear, getSeasonCalendar, type CalendarRound } from "@/lib/openf1/queries";
import type { Outline } from "@/lib/track";

export const dynamic = "force-dynamic";

// OpenF1 has data from the 2023 season onwards.
const FIRST_YEAR = 2023;
const FILTERS = [
  { value: "all", label: "All rounds" },
  { value: "upcoming", label: "Upcoming" },
  { value: "sprint", label: "Sprint only" },
  { value: "completed", label: "Completed" },
];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function dateRange(start: string, end: string): string {
  const a = new Date(start);
  const b = new Date(end);
  const day = (d: Date) => String(d.getUTCDate()).padStart(2, "0");
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${day(a)} – ${day(b)} ${MONTHS[b.getUTCMonth()]}`
    : `${day(a)} ${MONTHS[a.getUTCMonth()]} – ${day(b)} ${MONTHS[b.getUTCMonth()]}`;
}

function RoundCard({ entry, outline }: { entry: CalendarRound; outline: Outline | null }) {
  const { meeting, race, round, state, winner, hasSprint, daysToRace: days } = entry;
  const current = state === "current";
  const upcoming = state === "upcoming";
  const href = state === "finished" ? `/session/${race.session_key}` : current ? "/" : null;

  const body = (
    <>
      {current && <div className="absolute inset-x-0 top-0 h-0.5 bg-primary-container" />}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="t-label-caps text-primary">R{String(round).padStart(2, "0")}</span>
          <span className="t-label-caps text-on-surface-variant">{meeting.country_code}</span>
          {hasSprint && (
            <span className="rounded bg-secondary/20 px-1 t-label-micro font-bold text-secondary">Sprint</span>
          )}
          {current && (
            <span className="flex items-center gap-1 rounded bg-error-container px-1 t-label-micro font-bold text-error">
              <LiveDot className="h-1.5 w-1.5 bg-error" />
              {entry.weekendStarted ? "This weekend" : "Next"}
            </span>
          )}
        </div>
        <span className={`t-label-micro ${current ? "text-primary" : "text-on-surface-variant"}`}>
          {dateRange(meeting.date_start, meeting.date_end)}
        </span>
      </div>

      <div className={`my-1 flex h-28 items-center justify-center rounded bg-surface-container-lowest ${upcoming ? "opacity-40" : ""}`}>
        {outline ? (
          <TrackMap outline={outline} showCorners={false} className="h-full w-full" />
        ) : meeting.circuit_image ? (
          // Remote image on a host that varies by season; not worth an optimizer allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meeting.circuit_image} alt="" className="max-h-full w-auto object-contain" />
        ) : null}
      </div>

      <h2
        className={`font-display text-2xl leading-7 font-bold tracking-tight uppercase ${
          current ? "text-primary" : upcoming ? "text-on-surface-variant" : ""
        }`}
      >
        {meeting.meeting_name}
      </h2>
      <p className="t-body-sm text-on-surface-variant">
        {meeting.circuit_short_name} • {meeting.location}
      </p>

      <div className="mt-1 flex items-center justify-between rounded bg-surface-container-lowest px-1.5 py-1">
        {state === "finished" ? (
          winner ? (
            <>
              <div className="flex items-center gap-1.5">
                <TeamBar colour={teamColour(winner.driver?.team_colour)} className="h-6 w-1.5" />
                <div>
                  <div className="flex items-center gap-1">
                    <Icon name="emoji_events" className="text-[13px] text-primary" />
                    <span className="t-label-caps">{winner.driver?.name_acronym ?? winner.result.driver_number}</span>
                    <span className="t-label-micro text-on-surface-variant">{teamCode(winner.driver?.team_name)}</span>
                  </div>
                  <span className="t-label-micro text-on-surface-variant">
                    {formatDuration(lastValue(winner.result.duration))}
                  </span>
                </div>
              </div>
              <span className="t-label-caps text-on-surface-variant">Results →</span>
            </>
          ) : (
            <span className="t-label-micro text-on-surface-variant">Result not published</span>
          )
        ) : (
          <>
            <div>
              <span className="block t-label-micro text-on-surface-variant">{current ? "Race" : "Countdown"}</span>
              <span className="t-telemetry-cell">{days === 0 ? "TODAY" : `IN ${days} DAY${days === 1 ? "" : "S"}`}</span>
            </div>
            <div className="text-right">
              <span className="block t-label-micro text-on-surface-variant">Race start</span>
              <span className="t-telemetry-cell">{new Date(race.date_start).toISOString().slice(11, 16)} UTC</span>
            </div>
          </>
        )}
      </div>
    </>
  );

  const className = `relative flex flex-col rounded p-2 ${
    current ? "bg-surface-container shadow-[0_0_12px_rgba(46,230,107,0.25)]" : "bg-surface-container-low"
  } ${href ? "transition-colors hover:bg-surface-container" : ""}`;
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const query = await props.searchParams;
  const thisYear = currentYear();
  const requested = Number(query.year);
  const year = requested >= FIRST_YEAR && requested <= thisYear ? requested : thisYear;
  const filter = FILTERS.some((f) => f.value === query.filter) ? (query.filter as string) : "all";

  const rounds = await getSeasonCalendar(year);
  // Thumbnails don't need all ~800 points per circuit; a quarter keeps the page light.
  const thin = (o: Outline | null): Outline | null =>
    o && { ...o, x: o.x.filter((_, i) => i % 4 === 0), y: o.y.filter((_, i) => i % 4 === 0) };
  const outlines = (await Promise.all(rounds.map((r) => getCircuitInfoOutline(r.meeting)))).map(thin);

  const completed = rounds.filter((r) => r.state === "finished").length;
  const current = rounds.find((r) => r.state === "current");
  const visible = rounds
    .map((entry, i) => ({ entry, outline: outlines[i] }))
    .filter(({ entry }) =>
      filter === "upcoming"
        ? entry.state !== "finished"
        : filter === "completed"
          ? entry.state === "finished"
          : filter === "sprint"
            ? entry.hasSprint
            : true,
    );
  const link = (y: number, f: string) => `/calendar?year=${y}${f === "all" ? "" : `&filter=${f}`}`;
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

  return (
    <div className="flex w-full flex-col p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Icon name="calendar_month" className="text-[20px] text-primary" />
          <h1 className="t-headline-md uppercase">Season calendar</h1>
          <div className="flex items-center gap-0.5">
            {years.map((y) => (
              <Link
                key={y}
                href={link(y, filter)}
                aria-current={y === year ? "page" : undefined}
                className={`rounded px-1.5 py-0.5 t-label-caps ${
                  y === year
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded bg-surface-container-low p-0.5">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={link(year, f.value)}
                aria-current={f.value === filter ? "page" : undefined}
                className={`rounded px-2 py-1 t-label-caps ${
                  f.value === filter ? "bg-surface-container-high text-primary" : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded bg-surface-container-low px-2 py-1">
            <span className="t-label-micro text-on-surface-variant">Progress</span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full bg-primary-container"
                style={{ width: `${rounds.length ? (completed / rounds.length) * 100 : 0}%` }}
              />
            </div>
            <span className="t-telemetry-cell text-primary">
              {rounds.length ? Math.round((completed / rounds.length) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>

      <div className="mt-1 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 t-label-micro text-on-surface-variant">
        <span>
          Total: <span className="t-telemetry-cell text-on-surface">{rounds.length}</span> rounds
        </span>
        <span>
          Sprint:{" "}
          <span className="t-telemetry-cell text-secondary">{rounds.filter((r) => r.hasSprint).length}</span> weekends
        </span>
        <span>
          Completed:{" "}
          <span className="t-telemetry-cell text-primary">
            {completed}/{rounds.length}
          </span>
        </span>
        {current && year === thisYear && (
          <span>
            Current:{" "}
            <span className="t-telemetry-cell text-tertiary-container">
              R{current.round} {current.meeting.meeting_name}
            </span>
          </span>
        )}
      </div>

      {visible.length ? (
        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ entry, outline }) => (
            <RoundCard key={entry.meeting.meeting_key} entry={entry} outline={outline} />
          ))}
        </div>
      ) : (
        <p className="rounded bg-surface-container-low p-6 text-on-surface-variant">
          {rounds.length
            ? "No rounds match this filter."
            : "OpenF1 returned no calendar. Without sponsor credentials the API is locked while a session is live."}
        </p>
      )}
    </div>
  );
}
