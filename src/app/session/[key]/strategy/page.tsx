import { LapChart, type LapSeries } from "@/components/session/LapChart";
import { SessionFrame, SessionNotFound } from "@/components/session/SessionFrame";
import { Icon, TeamBar, TyreBadge } from "@/components/ui";
import { compound, COMPOUNDS, formatLap, teamCode, teamColour } from "@/lib/format";
import { getCircuitOutline } from "@/lib/openf1/circuit";
import { bestLaps, compoundAt, getSessionContext, getSessionData } from "@/lib/openf1/session";

export const dynamic = "force-dynamic";

function RankTable({
  icon,
  title,
  note,
  unit,
  rows,
}: {
  icon: string;
  title: string;
  note: string;
  unit: string;
  rows: { key: string; name: string; team: string; colour: string; detail: React.ReactNode; value: string }[];
}) {
  return (
    <div className="rounded bg-surface-container-low p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Icon name={icon} className="text-[18px] text-primary" />
          <h3 className="t-headline-md uppercase">{title}</h3>
        </div>
        <span className="t-label-micro text-on-surface-variant">{note}</span>
      </div>
      <div className="flex flex-col divide-y divide-surface-container-highest/20">
        {rows.map((row, i) => (
          <div key={row.key} className={`flex items-center justify-between gap-2 px-1 py-1.5 ${i === 0 ? "bg-surface-container" : ""}`}>
            <div className="flex items-center gap-2">
              <span className={`w-5 t-headline-md italic ${i === 0 ? "text-primary" : ""}`}>{i + 1}</span>
              <TeamBar colour={row.colour} className="h-6 w-1" />
              <div className="flex flex-col">
                <span className="t-label-caps tracking-widest">{row.name}</span>
                <span className="t-label-micro" style={{ color: row.colour }}>
                  {row.team}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="t-telemetry-cell text-on-surface-variant">{row.detail}</span>
              <span className={`t-telemetry-cell text-base ${i === 0 ? "text-primary" : ""}`}>
                {row.value}
                <span className="ml-0.5 t-label-micro text-on-surface-variant">{unit}</span>
              </span>
            </div>
          </div>
        ))}
        {!rows.length && <p className="p-2 t-body-sm text-on-surface-variant">No data for this session.</p>}
      </div>
    </div>
  );
}

export default async function StrategyPage(props: PageProps<"/session/[key]/strategy">) {
  const { key } = await props.params;
  const context = await getSessionContext(key);
  if (!context) return <SessionNotFound />;

  const { session, meeting, siblings, drivers } = context;
  const [data, outline] = await Promise.all([
    getSessionData(context),
    meeting ? getCircuitOutline(meeting, siblings) : null,
  ]);
  const { results, laps, stints, pits } = data;
  const isRace = session.session_type === "Race";

  // Lanes in classification order; cars without a result go last by number.
  const order = [
    ...results.map((r) => r.driver_number),
    ...[...drivers.keys()].filter((n) => !results.some((r) => r.driver_number === n)).sort((a, b) => a - b),
  ];
  const resultOf = new Map(results.map((r) => [r.driver_number, r]));
  const totalLaps = Math.max(1, ...stints.map((s) => s.lap_end ?? 0), ...laps.map((l) => l.lap_number));
  const info = (number: number) => {
    const d = drivers.get(number);
    return {
      code: d?.name_acronym ?? String(number),
      name: d?.full_name ?? `Car ${number}`,
      team: d?.team_name ?? "",
      colour: teamColour(d?.team_colour),
    };
  };

  const pitLaps = new Map<number, Set<number>>();
  for (const p of pits) {
    if (!pitLaps.has(p.driver_number)) pitLaps.set(p.driver_number, new Set());
    pitLaps.get(p.driver_number)!.add(p.lap_number);
  }

  const series: LapSeries[] = order.map((number) => ({
    number,
    code: info(number).code,
    colour: info(number).colour,
    laps: laps
      .filter((l) => l.driver_number === number && l.lap_duration != null)
      .sort((a, b) => a.lap_number - b.lap_number)
      .map((l) => ({
        n: l.lap_number,
        t: l.lap_duration!,
        tyre: compound(compoundAt(stints, number, l.lap_number)).colour,
        pit: l.is_pit_out_lap || (pitLaps.get(number)?.has(l.lap_number) ?? false),
      })),
  }));

  // Newer data has the stationary time; older sessions only the time spent in the pit lane.
  const hasStationary = pits.some((p) => p.stop_duration != null);
  const pitTime = (p: (typeof pits)[number]) => (hasStationary ? p.stop_duration : (p.lane_duration ?? p.pit_duration));
  const fastestStops = pits
    .filter((p) => pitTime(p) != null)
    .sort((a, b) => pitTime(a)! - pitTime(b)!)
    .slice(0, 5);

  const topSpeeds = order
    .map((number) => ({
      number,
      speed: Math.max(0, ...laps.filter((l) => l.driver_number === number).map((l) => l.st_speed ?? 0)),
    }))
    .filter((s) => s.speed > 0)
    .sort((a, b) => b.speed - a.speed)
    .slice(0, 5);

  const fastestLaps = bestLaps(laps, stints).slice(0, 5);
  const lapTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * totalLaps));

  return (
    <SessionFrame context={context} active="/strategy" weather={data.weather} outline={outline}>
      <div className="rounded bg-surface-container-low p-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="donut_large" className="text-[22px] text-primary" />
            <div>
              <h2 className="t-headline-md uppercase">Tyre strategy &amp; stint summary</h2>
              <p className="t-label-micro text-on-surface-variant">
                {isRace ? `${totalLaps} laps` : "Stints by run"} {"//"} {session.circuit_short_name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-label-micro text-on-surface-variant">Compounds:</span>
            {Object.keys(COMPOUNDS).map((name) => (
              <span key={name} className="flex items-center gap-1 t-label-micro">
                <TyreBadge name={name} />
                {name}
              </span>
            ))}
            <span className="flex items-center gap-1 t-label-micro">
              <span className="h-3 w-1.5 bg-error-container" /> Pit stop
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex min-w-[760px] flex-col gap-0.5">
            <div className="grid grid-cols-[110px_1fr] t-label-micro text-on-surface-variant">
              <span>Pos / car</span>
              <span className="flex justify-between">
                {lapTicks.map((lap, i) => (
                  <span key={i}>L{lap}</span>
                ))}
              </span>
            </div>
            {order.map((number, i) => {
              const d = info(number);
              const result = resultOf.get(number);
              const out = result?.dnf || result?.dns || result?.dsq;
              return (
                <div
                  key={number}
                  className={`grid grid-cols-[110px_1fr] items-center ${i % 2 ? "" : "bg-surface-container/50"}`}
                >
                  <div className="flex items-center gap-1.5 pl-1">
                    <TeamBar colour={d.colour} className="h-5 w-1.5" />
                    <span className={`w-7 t-headline-md italic ${out ? "text-error" : ""}`}>
                      {out ? "–" : (result?.position ?? "")}
                    </span>
                    <span className="t-label-caps">{d.code}</span>
                    <span className="hidden t-label-micro text-on-surface-variant sm:inline">{teamCode(d.team)}</span>
                  </div>
                  <div className={`relative h-6 bg-surface-container-lowest ${out ? "opacity-60" : ""}`}>
                    {stints
                      .filter((s) => s.driver_number === number && s.lap_start != null)
                      .map((s) => {
                        const start = s.lap_start!;
                        const end = s.lap_end ?? start;
                        const count = end - start + 1;
                        const tyre = compound(s.compound);
                        return (
                          <div
                            key={s.stint_number}
                            title={`${s.compound ?? "Unknown"}: laps ${start}–${end} (${count} laps, tyre age at start ${s.tyre_age_at_start ?? 0})`}
                            className="absolute top-1 flex h-4 items-center justify-center overflow-hidden font-mono text-[10px] font-bold whitespace-nowrap text-black"
                            style={{
                              left: `${((start - 1) / totalLaps) * 100}%`,
                              width: `${(count / totalLaps) * 100}%`,
                              backgroundColor: tyre.colour,
                            }}
                          >
                            {tyre.letter} · {count}L
                          </div>
                        );
                      })}
                    {isRace &&
                      pits
                        .filter((p) => p.driver_number === number)
                        .map((p) => (
                          <div
                            key={p.lap_number}
                            title={`Pit stop lap ${p.lap_number}${pitTime(p) != null ? `: ${pitTime(p)!.toFixed(1)} s` : ""}`}
                            className="absolute top-0.5 z-10 h-5 w-1.5 bg-error-container ring-1 ring-surface-container-lowest"
                            style={{ left: `${(p.lap_number / totalLaps) * 100}%` }}
                          />
                        ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 rounded bg-surface-container-low p-2">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="ssid_chart" className="text-[22px] text-primary" />
          <div>
            <h2 className="t-headline-md uppercase">Lap times</h2>
            <p className="t-label-micro text-on-surface-variant">Lap-by-lap comparison {"//"} pick drivers to overlay</p>
          </div>
        </div>
        <LapChart key={session.session_key} series={series} initial={order.slice(0, 5)} />
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-3">
        <RankTable
          icon="timer"
          title="Fastest pit stops"
          note={hasStationary ? "Stationary time" : "Time in pit lane"}
          unit="s"
          rows={fastestStops.map((p) => ({
            key: `${p.driver_number}-${p.lap_number}`,
            ...info(p.driver_number),
            detail: `L${p.lap_number}`,
            value: pitTime(p)!.toFixed(2),
          }))}
        />
        <RankTable
          icon="speed"
          title="Fastest laps"
          note="Best lap per driver"
          unit=""
          rows={fastestLaps.map((b) => ({
            key: String(b.driver),
            ...info(b.driver),
            detail: (
              <span className="flex items-center gap-1.5">
                L{b.lap} <TyreBadge name={b.compound} />
              </span>
            ),
            value: formatLap(b.time),
          }))}
        />
        <RankTable
          icon="bolt"
          title="Top speeds"
          note="Speed trap"
          unit="km/h"
          rows={topSpeeds.map((s) => ({
            key: String(s.number),
            ...info(s.number),
            detail: "",
            value: String(s.speed),
          }))}
        />
      </div>
    </SessionFrame>
  );
}
