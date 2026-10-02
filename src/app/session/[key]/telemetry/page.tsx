import { SessionFrame, SessionNotFound } from "@/components/session/SessionFrame";
import { TelemetryCompare } from "@/components/session/TelemetryCompare";
import { formatLap } from "@/lib/format";
import { getCircuitOutline } from "@/lib/openf1/circuit";
import { bestLaps, getSessionContext, getSessionData } from "@/lib/openf1/session";
import { compareLaps } from "@/lib/openf1/telemetry";
import type { Lap } from "@/lib/openf1/types";

export const dynamic = "force-dynamic";

// Fixed pair from the design, so team-mates in the same livery stay distinguishable.
const COLOUR_A = "#ffb7af";
const COLOUR_B = "#e1b6ff";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function TelemetryPage(props: PageProps<"/session/[key]/telemetry">) {
  const { key } = await props.params;
  const query = await props.searchParams;
  const context = await getSessionContext(key);
  if (!context) return <SessionNotFound />;

  const { session, meeting, siblings, drivers } = context;
  const [data, outline] = await Promise.all([
    getSessionData(context),
    meeting ? getCircuitOutline(meeting, siblings) : null,
  ]);
  const { laps, stints, results } = data;

  // Only laps with a start time and a duration can be matched to telemetry.
  const usable = laps.filter((l) => l.date_start && l.lap_duration != null);
  const lapsOf = (driver: number) =>
    usable.filter((l) => l.driver_number === driver).sort((a, b) => a.lap_number - b.lap_number);
  const fastestOf = (driver: number): Lap | undefined =>
    lapsOf(driver).reduce<Lap | undefined>((best, l) => (!best || l.lap_duration! < best.lap_duration! ? l : best), undefined);

  // Default pairing: the top two finishers of a race, otherwise the two quickest cars.
  const ranked =
    session.session_type === "Race" && results.length
      ? results.map((r) => r.driver_number)
      : bestLaps(laps, stints).map((b) => b.driver);
  const candidates = ranked.filter((n) => lapsOf(n).length > 0);
  const pick = (param: string, fallback: number | undefined) => {
    const n = Number(first(query[param]));
    return candidates.includes(n) ? n : fallback;
  };
  const driverA = pick("a", candidates[0]);
  const driverB = pick("b", candidates.find((n) => n !== driverA));
  const lapFor = (driver: number | undefined, param: string) => {
    if (driver == null) return undefined;
    const wanted = Number(first(query[param]));
    return lapsOf(driver).find((l) => l.lap_number === wanted) ?? fastestOf(driver);
  };
  const lapA = lapFor(driverA, "la");
  const lapB = lapFor(driverB, "lb");

  const comparison = lapA && lapB ? await compareLaps(session, lapA, lapB) : null;
  const code = (n: number | undefined) => (n != null ? (drivers.get(n)?.name_acronym ?? String(n)) : "–");
  const delta = lapA && lapB ? lapA.lap_duration! - lapB.lap_duration! : null;
  const sectorDelta = (n: 1 | 2 | 3) => {
    const a = lapA?.[`duration_sector_${n}`];
    const b = lapB?.[`duration_sector_${n}`];
    return a != null && b != null ? a - b : null;
  };
  const signed = (v: number | null, digits = 3) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}s`);
  const tone = (v: number | null) => (v == null ? "" : v <= 0 ? "text-primary" : "text-error");
  const trap = lapA?.st_speed != null && lapB?.st_speed != null ? lapA.st_speed - lapB.st_speed : null;

  const selectClass =
    "h-8 rounded border border-surface-container-highest bg-surface-container-lowest px-2 font-mono text-xs font-semibold text-on-surface focus:border-primary-container focus:outline-none";

  const selector = (slot: "a" | "b", driver: number | undefined, lap: Lap | undefined, colour: string) => {
    const best = driver != null ? fastestOf(driver) : undefined;
    return (
      <div className="flex items-center gap-1.5 rounded bg-surface-container px-2 py-1.5">
        <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: colour }} />
        <label className="flex flex-col gap-0.5">
          <span className="t-label-micro text-on-surface-variant">Driver {slot.toUpperCase()}</span>
          <select name={slot} defaultValue={driver} className={selectClass}>
            {candidates.map((n) => (
              <option key={n} value={n}>
                {code(n)} — {drivers.get(n)?.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="t-label-micro text-on-surface-variant">Lap</span>
          <select name={`l${slot}`} defaultValue={lap && lap !== best ? lap.lap_number : ""} className={selectClass}>
            <option value="">Fastest{best ? ` (L${best.lap_number})` : ""}</option>
            {(driver != null ? lapsOf(driver) : []).map((l) => (
              <option key={l.lap_number} value={l.lap_number}>
                L{l.lap_number} — {formatLap(l.lap_duration)}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };

  return (
    <SessionFrame context={context} active="/telemetry" weather={data.weather} outline={outline}>
      <form method="get" className="mb-0.5 flex flex-wrap items-end gap-2 rounded bg-surface-container-low p-2">
        {selector("a", driverA, lapA, COLOUR_A)}
        <span className="pb-2 t-label-caps text-on-surface-variant">vs</span>
        {selector("b", driverB, lapB, COLOUR_B)}
        <button
          type="submit"
          className="h-8 rounded bg-primary-container px-4 t-label-caps text-on-primary-container transition-colors hover:bg-primary"
        >
          Compare
        </button>
        <span className="pb-2 t-label-micro text-on-surface-variant">
          Changing a driver resets their lap to the fastest unless that lap number exists for them.
        </span>
      </form>

      {lapA && lapB && (
        <div className="mb-0.5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded bg-surface-container-low p-2">
          <div>
            <span className="block t-label-micro" style={{ color: COLOUR_A }}>
              {code(driverA)} lap {lapA.lap_number}
            </span>
            <span className="t-telemetry-display text-[2rem]" style={{ color: COLOUR_A }}>
              {formatLap(lapA.lap_duration)}
            </span>
          </div>
          <div>
            <span className="block t-label-micro" style={{ color: COLOUR_B }}>
              {code(driverB)} lap {lapB.lap_number}
            </span>
            <span className="t-telemetry-display text-[2rem]" style={{ color: COLOUR_B }}>
              {formatLap(lapB.lap_duration)}
            </span>
          </div>
          <div className="rounded bg-surface-container px-3 py-1 text-center">
            <span className="block t-label-micro text-on-surface-variant">Delta (lap)</span>
            <span className={`t-telemetry-display text-[2rem] ${tone(delta)}`}>{signed(delta)}</span>
            <span className="block t-label-micro text-on-surface-variant">
              {delta == null || delta === 0 ? "Level" : `${code(delta < 0 ? driverA : driverB)} faster`}
            </span>
          </div>
          {([1, 2, 3] as const).map((n) => (
            <div key={n}>
              <span className="block t-label-micro text-on-surface-variant">S{n} delta</span>
              <span className={`t-telemetry-cell text-base ${tone(sectorDelta(n))}`}>{signed(sectorDelta(n))}</span>
            </div>
          ))}
          <div>
            <span className="block t-label-micro text-on-surface-variant">Speed trap</span>
            <span className="t-telemetry-cell text-base">
              {trap == null ? "–" : `${code(trap >= 0 ? driverA : driverB)} +${Math.abs(trap)} km/h`}
            </span>
          </div>
        </div>
      )}

      {comparison ? (
        <TelemetryCompare
          key={`${lapA!.driver_number}-${lapA!.lap_number}-${lapB!.driver_number}-${lapB!.lap_number}`}
          comparison={comparison}
          a={{ code: code(driverA), colour: COLOUR_A }}
          b={{ code: code(driverB), colour: COLOUR_B }}
          outline={outline}
        />
      ) : (
        <div className="rounded bg-surface-container-low p-6">
          <h2 className="t-headline-md uppercase">No telemetry for this pairing</h2>
          <p className="mt-1 text-on-surface-variant">
            {candidates.length < 2
              ? "This session has no timed laps yet."
              : "OpenF1 has no car data for one of these laps. Try another lap or driver."}
          </p>
        </div>
      )}
    </SessionFrame>
  );
}
