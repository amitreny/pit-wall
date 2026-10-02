import Link from "next/link";
import { connection } from "next/server";
import { circuitTime, compassPoint } from "@/lib/format";
import { getCurrentWeekend, getLatestWeather } from "@/lib/openf1/queries";
import { Icon, LiveDot } from "../ui";
import { NavRail, NavTabs } from "./NavLinks";

function Reading({ label, value, className = "text-on-surface" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="t-label-micro text-on-surface-variant">{label}</span>
      <span className={`t-telemetry-cell ${className}`}>{value}</span>
    </div>
  );
}

// Fixed console frame: status strip, header, kerb, tab bar and icon rail.
export async function Shell({ children }: { children: React.ReactNode }) {
  // Everything here depends on the current time, so never prerender it.
  await connection();
  const weekend = await getCurrentWeekend();
  const weather = weekend ? await getLatestWeather(weekend.meeting.meeting_key) : null;
  const { meeting, liveSession, nextSession } = weekend ?? {};
  const next = nextSession && meeting ? circuitTime(nextSession.date_start, meeting.gmt_offset) : null;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 bg-surface-container-lowest">
        <div className={`h-1 w-full ${liveSession ? "bg-signal-red" : "bg-primary-container"}`} />
        <div className="flex h-14 items-center justify-between gap-3 px-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-surface-container-high">
                <Icon name="show_chart" className="text-[18px] text-primary" />
              </div>
              <div>
                <span className="t-headline-md uppercase tracking-wider">Pit Wall</span>
                <div className="mt-0.5 flex items-center gap-0.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-error-container" />
                  ))}
                </div>
              </div>
            </Link>
            {meeting && (
              <>
                <div className="hidden h-6 w-px bg-surface-container-high xl:block" />
                <div className="hidden flex-col xl:flex">
                  <span className="font-display text-2xl leading-7 font-bold uppercase tracking-tight">
                    {meeting.meeting_name}
                  </span>
                  <span className="t-label-micro tracking-widest text-on-surface-variant">
                    {meeting.circuit_short_name} {"//"} {meeting.country_name}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            {liveSession ? (
              <Link href="/live" className="flex items-center gap-2 rounded bg-surface-container px-2 py-1">
                <LiveDot />
                <span className="t-label-caps text-error">Live</span>
                <div className="h-3 w-px bg-surface-container-highest" />
                <span className="t-label-caps">{liveSession.session_name}</span>
              </Link>
            ) : (
              nextSession &&
              next && (
                <div className="hidden items-center gap-2 rounded bg-surface-container px-2 py-1 sm:flex">
                  <span className="t-label-micro text-on-surface-variant">Next</span>
                  <span className="t-label-caps">{nextSession.session_name}</span>
                  <div className="h-3 w-px bg-surface-container-highest" />
                  <span className="t-telemetry-cell text-primary">
                    {next.day} {next.time}
                  </span>
                  <span className="t-label-micro text-on-surface-variant">Local</span>
                </div>
              )
            )}
            {weather && (
              <div className="hidden items-center gap-2 rounded bg-surface-container-low px-2 py-1 lg:flex">
                <Reading label="Air" value={`${weather.air_temperature.toFixed(1)}°C`} />
                <Reading label="Track" value={`${weather.track_temperature.toFixed(1)}°C`} className="text-tertiary" />
                <Reading label="Hum" value={`${Math.round(weather.humidity)}%`} />
                <Reading
                  label="Wind"
                  value={`${weather.wind_speed.toFixed(1)} m/s ${compassPoint(weather.wind_direction)}`}
                />
                <Reading
                  label="Rain"
                  value={weather.rainfall ? "WET" : "DRY"}
                  className={weather.rainfall ? "text-secondary" : "text-primary"}
                />
              </div>
            )}
          </div>
        </div>
        <div className="kerb-pattern h-0.5 w-full" />
        <div className="flex h-9 items-center justify-between bg-surface-container-low px-3">
          <NavTabs />
          <div className="hidden items-center gap-1 sm:flex">
            <span className="t-label-micro text-on-surface-variant">Data: OpenF1</span>
            <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
          </div>
        </div>
      </div>

      <aside className="fixed top-[98px] bottom-0 left-0 z-40 hidden w-16 flex-col items-center bg-surface-container-low py-2 md:flex">
        <NavRail />
      </aside>

      <div className="md:pl-16">
        <main className="min-h-screen w-full bg-surface-container-lowest px-0.5 pt-[100px] pb-0.5">{children}</main>
        <footer className="mx-0.5 mb-0.5 bg-surface-container-low px-3 py-2">
          <div className="kerb-pattern mb-2 h-1 w-full" />
          <span className="t-label-caps text-on-surface-variant">
            Unofficial. Not affiliated with Formula 1. Data from OpenF1.
          </span>
        </footer>
      </div>
    </>
  );
}
