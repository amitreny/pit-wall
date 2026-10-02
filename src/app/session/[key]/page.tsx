import { PositionChart, type PositionSeries } from "@/components/session/PositionChart";
import { SessionFrame, SessionNotFound } from "@/components/session/SessionFrame";
import { TeamBar } from "@/components/ui";
import { compound, formatDuration, formatGap, formatLap, lastValue, teamColour } from "@/lib/format";
import { getCircuitOutline } from "@/lib/openf1/circuit";
import { bestLaps, getSessionContext, getSessionData, neutralisedLaps } from "@/lib/openf1/session";

export const dynamic = "force-dynamic";

export default async function SessionResultsPage(props: PageProps<"/session/[key]">) {
  const { key } = await props.params;
  const context = await getSessionContext(key);
  if (!context) return <SessionNotFound />;

  const { session, meeting, siblings, drivers } = context;
  const [data, outline] = await Promise.all([
    getSessionData(context),
    meeting ? getCircuitOutline(meeting, siblings) : null,
  ]);
  const { results, laps, stints, pits, positions, grid } = data;

  const isRace = session.session_type === "Race";
  const isQualifying = session.session_type === "Qualifying";
  const fastest = bestLaps(laps, stints);
  const bestByDriver = new Map(fastest.map((b) => [b.driver, b]));
  const overall = fastest[0];
  const classified = results.filter((r) => !r.dnf && !r.dns && !r.dsq);
  const unclassified = results.filter((r) => r.dnf || r.dns || r.dsq);
  const winner = classified[0];
  const totalLaps = winner?.number_of_laps ?? Math.max(0, ...laps.map((l) => l.lap_number));

  const tyres = (driver: number) =>
    stints.filter((s) => s.driver_number === driver).map((s) => compound(s.compound));
  const stops = (driver: number) => new Set(pits.filter((p) => p.driver_number === driver).map((p) => p.lap_number)).size;

  // --- position chart (races only) ---
  let series: PositionSeries[] = [];
  if (isRace && winner && positions.length) {
    // Lap boundaries of the winner turn timestamps into a lap axis.
    const boundaries = laps
      .filter((l) => l.driver_number === winner.driver_number && l.date_start)
      .map((l) => ({ lap: l.lap_number - 1, at: Date.parse(l.date_start!) }))
      .sort((a, b) => a.at - b.at);
    const lapAt = (date: string) => {
      const t = Date.parse(date);
      let i = -1;
      while (i + 1 < boundaries.length && boundaries[i + 1].at <= t) i++;
      if (i < 0) return 0;
      const here = boundaries[i];
      const next = boundaries[i + 1];
      return next ? here.lap + ((t - here.at) / (next.at - here.at)) * (next.lap - here.lap) : here.lap;
    };
    series = results.map((r) => {
      const driver = drivers.get(r.driver_number);
      const points: [number, number][] = [];
      const start = grid.get(r.driver_number);
      if (start != null) points.push([0, start]);
      for (const p of positions) {
        if (p.driver_number !== r.driver_number) continue;
        const lap = lapAt(p.date);
        // Everything before the first racing lap collapses into the starting position.
        if (lap === 0 && points.length) points[points.length - 1] = [0, start ?? p.position];
        else points.push([lap, p.position]);
      }
      return {
        key: r.driver_number,
        label: driver?.name_acronym ?? String(r.driver_number),
        colour: teamColour(driver?.team_colour),
        points,
        retiredAt: r.dnf ? (r.number_of_laps ?? 0) : undefined,
      };
    });
  }

  const movers = classified
    .filter((r) => grid.has(r.driver_number) && r.position != null)
    .map((r) => ({ r, gain: grid.get(r.driver_number)! - r.position! }))
    .sort((a, b) => b.gain - a.gain);
  const mover = movers[0];

  return (
    <SessionFrame context={context} active="" weather={data.weather} outline={outline}>
      <div className="overflow-hidden rounded bg-surface-container-low">
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1">
          <div className="flex items-center gap-2">
            <h2 className="t-headline-md uppercase">Classification</h2>
            {isRace && totalLaps > 0 && (
              <span className="rounded bg-surface-container px-1 py-0.5 t-label-micro text-on-surface-variant">
                {totalLaps} laps
              </span>
            )}
          </div>
          {overall && (
            <span className="flex items-center gap-1 t-label-micro text-on-surface-variant">
              <span className="h-2 w-2 rounded-full bg-timing-purple" />
              Fastest lap: {formatLap(overall.time)} ({drivers.get(overall.driver)?.name_acronym ?? overall.driver} L
              {overall.lap})
            </span>
          )}
        </div>

        {results.length ? (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="h-7 bg-surface-container font-mono text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
                  <th className="w-12 px-1 text-center">Pos</th>
                  {isRace && <th className="w-16 px-1 text-center">Grid</th>}
                  <th className="px-2">Driver</th>
                  <th className="px-2">Constructor</th>
                  <th className="w-14 px-2 text-right">Laps</th>
                  {isQualifying ? (
                    <>
                      <th className="w-24 px-2 text-right">Q1</th>
                      <th className="w-24 px-2 text-right">Q2</th>
                      <th className="w-24 px-2 text-right">Q3</th>
                    </>
                  ) : (
                    <th className="w-32 px-2 text-right">{isRace ? "Time / gap" : "Best time"}</th>
                  )}
                  {!isRace && <th className="w-24 px-2 text-right">Gap</th>}
                  {isRace && <th className="w-36 px-2">Best lap</th>}
                  <th className="w-32 px-2">Tyres</th>
                  {isRace && <th className="w-12 px-2 text-right">Pts</th>}
                </tr>
              </thead>
              <tbody className="font-mono text-[13px] font-semibold tabular-nums">
                {classified.map((r, i) => {
                  const driver = drivers.get(r.driver_number);
                  const start = grid.get(r.driver_number);
                  const gain = start != null && r.position != null ? start - r.position : 0;
                  const best = bestByDriver.get(r.driver_number);
                  const isFastest = best != null && best.driver === overall?.driver;
                  const durations = Array.isArray(r.duration) ? r.duration : [r.duration];
                  const gap = lastValue(r.gap_to_leader);
                  return (
                    <tr
                      key={r.driver_number}
                      className={`h-8 hover:bg-surface-container ${i % 2 ? "bg-surface-container-lowest" : ""}`}
                    >
                      <td className={`px-1 text-center t-headline-md italic ${i === 0 ? "text-primary" : ""}`}>
                        {r.position}
                      </td>
                      {isRace && (
                        <td className="px-1 text-center text-[10px]">
                          <span className="text-on-surface-variant">P{start ?? "–"}</span>{" "}
                          <span className={gain > 0 ? "text-primary" : gain < 0 ? "text-error" : "text-on-surface-variant"}>
                            {gain > 0 ? `▲${gain}` : gain < 0 ? `▼${-gain}` : "–"}
                          </span>
                        </td>
                      )}
                      <td className="px-2">
                        <div className="flex items-center gap-1.5">
                          <TeamBar colour={teamColour(driver?.team_colour)} className="h-5 w-1" />
                          <span className="font-bold">{driver?.name_acronym ?? r.driver_number}</span>
                          <span className="font-normal text-on-surface-variant">{driver?.full_name}</span>
                        </div>
                      </td>
                      <td className="px-2 font-normal text-on-surface-variant">{driver?.team_name}</td>
                      <td className="px-2 text-right">{r.number_of_laps ?? "–"}</td>
                      {isQualifying ? (
                        [0, 1, 2].map((q) => (
                          <td key={q} className="px-2 text-right">
                            {formatLap(durations[q])}
                          </td>
                        ))
                      ) : (
                        <td className={`px-2 text-right ${i === 0 ? "font-bold text-primary" : ""}`}>
                          {isRace
                            ? i === 0
                              ? formatDuration(lastValue(r.duration))
                              : formatGap(gap) || "–"
                            : formatLap(lastValue(r.duration))}
                        </td>
                      )}
                      {!isRace && (
                        <td className="px-2 text-right text-on-surface-variant">{i === 0 ? "–" : formatGap(gap) || "–"}</td>
                      )}
                      {isRace && (
                        <td className="px-2">
                          {best ? (
                            <span
                              className={
                                isFastest ? "rounded bg-timing-purple px-1.5 py-0.5 text-black" : "text-on-surface-variant"
                              }
                            >
                              L{best.lap} {formatLap(best.time)}
                            </span>
                          ) : (
                            "–"
                          )}
                        </td>
                      )}
                      <td className="px-2">
                        <div className="flex items-center gap-1">
                          {isRace && (
                            <span className="mr-1 text-[10px] text-on-surface-variant">{stops(r.driver_number)}</span>
                          )}
                          {tyres(r.driver_number)
                            .slice(0, 8)
                            .map((tyre, n) => (
                              <span
                                key={n}
                                className="flex h-4 w-4 items-center justify-center rounded-full border-2 text-[9px] font-bold"
                                style={{ borderColor: tyre.colour, color: tyre.colour }}
                              >
                                {tyre.letter}
                              </span>
                            ))}
                        </div>
                      </td>
                      {isRace && (
                        <td className={`px-2 text-right ${r.points ? "font-bold text-primary" : "text-on-surface-variant"}`}>
                          {r.points ?? 0}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-on-surface-variant">The classification for this session has not been published yet.</p>
        )}

        {unclassified.length > 0 && (
          <div className="border-t border-surface-container-highest/30 px-2 py-1">
            <h3 className="mb-1 t-label-caps tracking-widest text-tertiary-container">Not classified</h3>
            {unclassified.map((r) => {
              const driver = drivers.get(r.driver_number);
              return (
                <div key={r.driver_number} className="flex items-center justify-between py-0.5 font-mono text-[12px]">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-error-container px-1 text-[10px] font-bold text-error">
                      {r.dsq ? "DSQ" : r.dns ? "DNS" : "DNF"}
                    </span>
                    <TeamBar colour={teamColour(driver?.team_colour)} />
                    <span className="font-bold">{driver?.name_acronym ?? r.driver_number}</span>
                    <span className="text-on-surface-variant">
                      {driver?.full_name} ({driver?.team_name})
                    </span>
                  </div>
                  <span className="t-label-caps text-on-surface-variant">
                    {r.dns ? "Did not start" : `${r.number_of_laps ?? 0} laps completed`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {series.length > 0 && (
        <div className="mt-2 rounded bg-surface-container-low p-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="t-headline-md uppercase">
              Lap-by-lap positions (L0 – L{totalLaps})
            </h2>
            <span className="flex items-center gap-1 rounded bg-surface-container px-2 py-0.5 t-label-micro text-on-surface-variant">
              <span className="h-2 w-3 bg-timing-yellow/40" />
              {data.raceControl.some((m) => m.category === "SafetyCar")
                ? "Safety car / virtual safety car periods"
                : "No safety car deployed"}
            </span>
          </div>
          <div className="overflow-x-auto rounded bg-surface-container-lowest p-1">
            <div className="min-w-[760px]">
              <PositionChart
                series={series}
                laps={totalLaps}
                cars={results.length}
                neutralised={neutralisedLaps(data.raceControl)}
              />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <span className="block t-label-micro text-on-surface-variant">Total race time</span>
              <span className="t-telemetry-display text-[1.25rem]">{formatDuration(lastValue(winner?.duration))}</span>
            </div>
            {mover && mover.gain > 0 && (
              <div>
                <span className="block t-label-micro text-on-surface-variant">Biggest mover</span>
                <span className="t-telemetry-display text-[1.25rem] text-primary">
                  {drivers.get(mover.r.driver_number)?.name_acronym} (+{mover.gain} pos)
                </span>
                <span className="block t-label-micro text-on-surface-variant">
                  P{grid.get(mover.r.driver_number)} on grid → P{mover.r.position} finish
                </span>
              </div>
            )}
            {overall && (
              <div>
                <span className="block t-label-micro text-on-surface-variant">Race fastest lap</span>
                <span className="t-telemetry-display text-[1.25rem] text-timing-purple">{formatLap(overall.time)}</span>
                <span className="block t-label-micro text-on-surface-variant">
                  {drivers.get(overall.driver)?.full_name} (lap {overall.lap})
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </SessionFrame>
  );
}
