import Link from "next/link";
import { TrackMap } from "@/components/TrackMap";
import { circuitTime, compassPoint, utcOffsetLabel } from "@/lib/format";
import type { SessionContext } from "@/lib/openf1/session";
import type { Weather } from "@/lib/openf1/types";
import type { Outline } from "@/lib/track";

const TABS = [
  { slug: "", label: "Results" },
  { slug: "/strategy", label: "Strategy & lap times" },
  { slug: "/telemetry", label: "Telemetry compare" },
];

// Header, weekend session picker and tab bar shared by the session screens.
export function SessionFrame({
  context,
  active,
  weather,
  outline,
  children,
}: {
  context: SessionContext;
  active: "" | "/strategy" | "/telemetry";
  weather?: Weather | null;
  outline?: Outline | null;
  children: React.ReactNode;
}) {
  const { session, meeting, siblings } = context;
  const when = circuitTime(session.date_start, session.gmt_offset);
  const date = new Date(session.date_start).toISOString().slice(0, 10);

  return (
    <div className="flex w-full flex-col p-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-headline-lg leading-none tracking-wide uppercase">
            {meeting?.meeting_official_name ?? `${session.country_name} ${session.year}`}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary-container px-1 py-0.5 t-label-caps text-on-primary-container">
              {session.session_name}
            </span>
            <span className="t-label-caps tracking-widest text-primary">
              {date} {"//"} {when.day} {when.time} local ({utcOffsetLabel(session.gmt_offset)}) {"//"}{" "}
              {session.circuit_short_name}, {session.country_name}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {weather && (
            <div className="grid grid-cols-3 gap-x-3 rounded bg-surface-container-low px-2 py-1">
              {[
                { label: "Air", value: `${weather.air_temperature.toFixed(1)}°C`, className: "" },
                { label: "Track", value: `${weather.track_temperature.toFixed(1)}°C`, className: "text-tertiary-container" },
                { label: "Hum", value: `${Math.round(weather.humidity)}%`, className: "" },
                {
                  label: "Wind",
                  value: `${weather.wind_speed.toFixed(1)} m/s ${compassPoint(weather.wind_direction)}`,
                  className: "",
                },
                {
                  label: "Track",
                  value: weather.rainfall ? "WET" : "DRY",
                  className: weather.rainfall ? "text-secondary" : "text-primary",
                },
              ].map((r, i) => (
                <div key={i} className={i === 3 ? "col-span-2" : ""}>
                  <span className="block t-label-micro text-on-surface-variant">{r.label}</span>
                  <span className={`t-telemetry-cell ${r.className}`}>{r.value}</span>
                </div>
              ))}
            </div>
          )}
          {outline && (
            <div className="hidden h-16 w-28 rounded bg-surface-container-low p-1 sm:block">
              <TrackMap outline={outline} showCorners={false} className="h-full w-full" />
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-0.5">
        <span className="mr-1 t-label-micro text-on-surface-variant">Weekend sessions</span>
        {siblings.map((s) => (
          <Link
            key={s.session_key}
            href={`/session/${s.session_key}${active}`}
            aria-current={s.session_key === session.session_key ? "page" : undefined}
            className={`rounded px-2 py-0.5 t-label-caps transition-colors ${
              s.session_key === session.session_key
                ? "bg-surface-container-high text-primary"
                : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {s.session_name}
          </Link>
        ))}
      </div>

      <div className="mt-2 mb-2 flex items-end gap-0.5 border-b border-surface-container-highest/30">
        {TABS.map((tab) => {
          const current = tab.slug === active;
          return (
            <Link
              key={tab.slug}
              href={`/session/${session.session_key}${tab.slug}`}
              aria-current={current ? "page" : undefined}
              className={`relative px-4 py-1 t-label-caps transition-colors [clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,0_100%)] ${
                current
                  ? "bg-surface-container-high text-primary"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              }`}
            >
              {current && <div className="absolute inset-x-0 top-0 h-0.5 bg-primary-container" />}
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}

export function SessionNotFound() {
  return (
    <div className="rounded bg-surface-container-low p-6">
      <h1 className="t-headline-lg uppercase">Session not found</h1>
      <p className="mt-2 text-on-surface-variant">
        OpenF1 has no session with that key, or the API is locked because a session is live and no sponsor credentials
        are configured.
      </p>
      <Link href="/calendar" className="mt-3 inline-block t-label-caps text-primary">
        Open the season calendar →
      </Link>
    </div>
  );
}
