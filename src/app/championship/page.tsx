import Link from "next/link";
import { TitleFightChart } from "@/components/championship/TitleFightChart";
import { Icon, Kerb, TeamBar } from "@/components/ui";
import { teamCode, teamColour } from "@/lib/format";
import { getSeasonStandings, type StandingRow } from "@/lib/openf1/queries";

export const dynamic = "force-dynamic";

interface Entry extends StandingRow {
  key: string;
  name: string;
  /** Three-letter code for drivers; absent for teams. */
  code?: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  squares: string[];
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function squareClass(label: string, isDriver: boolean): string {
  if (!isDriver) {
    return label === "0" ? "bg-surface-container text-on-surface-variant" : "bg-surface-container-high text-on-surface";
  }
  if (label === "1") return "bg-[#ffd700] text-black font-bold";
  if (label === "2") return "bg-[#c0c0c0] text-black font-bold";
  if (label === "3") return "bg-[#cd7f32] text-black font-bold";
  if (label === "R" || label === "DQ" || label === "DNS") return "bg-error-container text-error font-bold";
  if (label === "–") return "text-on-surface-variant";
  return Number(label) <= 10 ? "bg-surface-container-high text-on-surface" : "bg-surface-container text-on-surface-variant";
}

function PodiumCard({ entry, leader }: { entry: Entry; leader: boolean }) {
  const colour = teamColour(entry.colour);
  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded md:col-span-4 ${
        leader ? "order-first bg-surface-container p-3 md:order-none md:-mt-3" : "bg-surface-container-low p-2"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 ${leader ? "h-1.5" : "h-1"}`} style={{ backgroundColor: colour }} />
      {leader && (
        <div
          className="absolute top-3 right-14 flex items-center gap-0.5 rounded px-1 py-0.5"
          style={{ backgroundColor: `${colour}33`, color: colour }}
        >
          <Icon name="emoji_events" className="text-[13px]" />
          <span className="t-label-micro font-bold tracking-wider">Championship leader</span>
        </div>
      )}
      <div className={`flex items-start justify-between ${leader ? "mt-6" : "mt-1"}`}>
        <div className="flex min-w-0 items-center gap-1">
          <div className={`shrink-0 rounded-full ${leader ? "h-9 w-1.5" : "h-7 w-1"}`} style={{ backgroundColor: colour }} />
          <div className="min-w-0">
            <span className="t-label-micro text-on-surface-variant">{entry.subtitle}</span>
            <h2 className={`leading-none tracking-tight uppercase italic ${leader ? "t-headline-xl" : "t-headline-lg"}`}>
              {entry.name}
            </h2>
          </div>
        </div>
        <span className="t-headline-xl leading-none" style={{ color: colour }}>
          {entry.position}
        </span>
      </div>
      <div
        className={`my-2 flex items-baseline justify-between ${leader ? "rounded bg-surface-container-lowest/70 p-2" : ""}`}
      >
        <div>
          <span className="t-telemetry-display">{entry.points}</span>
          <span className="ml-1 t-label-caps text-on-surface-variant">PTS</span>
        </div>
        <div className="rounded bg-surface-container px-2 py-0.5 text-right">
          <span className={`t-label-micro ${leader ? "text-primary" : "text-error"}`}>
            {leader ? "Lead over P2" : "Deficit to P1"}
          </span>
          <div className={`t-telemetry-cell font-bold ${leader ? "text-primary" : "text-error"}`}>
            {entry.stats.find((s) => s.label === "Margin")?.value}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-0.5 font-mono text-[11px]">
        {entry.stats
          .filter((s) => s.label !== "Margin")
          .map((stat) => (
            <div key={stat.label} className="rounded bg-surface-container-lowest/60 p-1.5">
              <div className="t-label-micro text-on-surface-variant">{stat.label}</div>
              <div className="font-bold">{stat.value}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

export default async function ChampionshipPage(props: PageProps<"/championship">) {
  const { view } = await props.searchParams;
  const isDriver = view !== "teams";
  const standings = await getSeasonStandings();

  if (!standings) {
    return (
      <div className="rounded bg-surface-container-low p-6">
        <h1 className="t-headline-lg uppercase">No standings yet</h1>
        <p className="mt-2 text-on-surface-variant">
          Standings appear after the first race of the season. Without sponsor credentials the API is also locked while a
          session is live.
        </p>
      </div>
    );
  }

  const { latest, rounds, remaining, totalRounds } = standings;
  const lastLabel = latest.session_name === "Race" ? "Last GP" : "Last sprint";
  const second = (isDriver ? standings.drivers : standings.teams)[1];
  const margin = (row: StandingRow) =>
    row.gapToLeader === 0 ? `${signed(row.points - (second?.points ?? 0))} PTS` : `${row.gapToLeader} PTS`;

  const entries: Entry[] = isDriver
    ? standings.drivers.map((d) => ({
        ...d,
        key: String(d.driver_number),
        name: d.driver?.full_name ?? `Car ${d.driver_number}`,
        code: d.driver?.name_acronym ?? String(d.driver_number),
        subtitle: d.driver?.team_name ?? "",
        stats: [
          { label: "Margin", value: margin(d) },
          { label: "Wins", value: String(d.wins) },
          { label: "Podiums", value: String(d.podiums) },
          { label: lastLabel, value: `${signed(d.lastGain)} pts` },
        ],
        squares: d.form,
      }))
    : standings.teams.map((t) => ({
        ...t,
        key: t.team_name,
        name: t.team_name,
        subtitle: "Constructor",
        stats: [
          { label: "Margin", value: margin(t) },
          { label: "Best round", value: `${Math.max(0, ...t.roundPoints)} pts` },
          { label: "Per round", value: (t.points / Math.max(1, rounds.length)).toFixed(1) },
          { label: lastLabel, value: `${signed(t.lastGain)} pts` },
        ],
        squares: t.roundPoints.map(String),
      }));

  const [first, runnerUp, third] = entries;
  const tabClass = (active: boolean) =>
    `relative flex items-center gap-1 px-4 py-1 t-label-caps transition-colors [clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,0_100%)] ${
      active
        ? "bg-surface-container-high text-primary"
        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
    }`;

  return (
    <div className="flex w-full flex-col p-2">
      <div className="flex flex-col justify-between gap-1 pb-1 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded bg-surface-container-high px-2 py-0.5">
            <span className="h-2 w-2 rounded-full bg-primary-container" />
            <span className="t-label-caps text-primary">
              After {latest.session_name === "Race" ? "race" : "sprint"}
            </span>
          </div>
          <span className="t-label-caps tracking-widest text-on-surface-variant">
            Round {rounds.length} of {totalRounds} {"//"} {standings.year} FIA Formula One World Championship {"//"}{" "}
            {latest.location}
          </span>
        </div>
      </div>

      <div className="mt-0.5 mb-5 flex items-center justify-between border-b border-surface-container-highest/30">
        <div className="flex items-end gap-0.5">
          <Link href="/championship" className={tabClass(isDriver)}>
            {isDriver && <div className="absolute inset-x-0 top-0 h-0.5 bg-primary-container" />}
            Drivers&apos; championship
          </Link>
          <Link href="/championship?view=teams" className={tabClass(!isDriver)}>
            {!isDriver && <div className="absolute inset-x-0 top-0 h-0.5 bg-primary-container" />}
            Constructors&apos; championship
          </Link>
        </div>
        <div className="hidden items-center gap-3 t-label-micro text-on-surface-variant md:flex">
          <span>
            <span className="t-telemetry-cell text-on-surface">{remaining.grandsPrix}</span>{" "}
            {remaining.grandsPrix === 1 ? "grand prix" : "grands prix"}
            {remaining.sprints ? ` + ${remaining.sprints} ${remaining.sprints === 1 ? "sprint" : "sprints"}` : ""}{" "}
            remaining
          </span>
          <div className="h-3 w-px bg-surface-container-highest" />
          <span>
            <span className="t-telemetry-cell text-primary">
              {isDriver ? remaining.maxDriverPoints : remaining.maxTeamPoints}
            </span>{" "}
            max pts still available
          </span>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-1 items-end gap-1 md:grid-cols-12">
        {runnerUp && <PodiumCard entry={runnerUp} leader={false} />}
        {first && <PodiumCard entry={first} leader />}
        {third && <PodiumCard entry={third} leader={false} />}
      </div>

      <Kerb className="mb-2 opacity-80" />

      <div className="mb-2 rounded bg-surface-container-low p-2">
        <div className="mb-2 flex flex-col items-start justify-between gap-1 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 bg-primary-container" />
            <h3 className="t-headline-md tracking-wide uppercase">Title fight {"//"} cumulative points</h3>
            <span className="rounded bg-surface-container px-1 py-0.5 t-label-micro text-on-surface-variant">
              Rounds 1 → {rounds.length} of {totalRounds}
            </span>
          </div>
          <span className="t-label-micro text-on-surface-variant">
            Top 5 highlighted{isDriver ? " // dashed = team-mate sharing a colour" : ""}
          </span>
        </div>
        <div className="rounded bg-surface-container-lowest p-1">
          <TitleFightChart
            rounds={rounds.map((s) => s.country_code)}
            series={entries.map((e) => ({
              key: e.key,
              label: e.code ?? teamCode(e.name),
              colour: teamColour(e.colour),
              points: e.series,
            }))}
          />
        </div>
      </div>

      <div className="mb-2 overflow-hidden rounded bg-surface-container-low">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-container-highest/40 bg-surface-container px-2 py-1">
          <div className="flex items-center gap-1">
            <Icon name="format_list_numbered" className="text-[18px] text-primary" />
            <span className="t-headline-md tracking-wide uppercase">
              {isDriver ? "Drivers'" : "Constructors'"} world championship standings
            </span>
            <span className="ml-1 t-label-micro text-on-surface-variant">
              After round {rounds.length} {"//"} {latest.location}
            </span>
          </div>
          {isDriver ? (
            <div className="flex items-center gap-2 t-label-micro">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#ffd700]" /> Win
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#c0c0c0]" /> P2
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#cd7f32]" /> P3
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-surface-container-high" /> Points (P4–P10)
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-error-container" /> Retired
              </span>
            </div>
          ) : (
            <span className="t-label-micro text-on-surface-variant">Points scored at each round</span>
          )}
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-left">
            <thead>
              <tr className="h-7 border-b border-surface-container-highest/20 bg-surface-container-lowest font-mono text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
                <th className="w-12 px-1 text-center">Pos</th>
                <th className="w-10 px-0.5 text-center">Chg</th>
                <th className="w-64 px-2">{isDriver ? "Driver" : "Team"}</th>
                {isDriver && <th className="w-44 px-2">Team</th>}
                <th className="w-20 px-2 text-right">Pts</th>
                <th className="w-24 px-2 text-right">Gap</th>
                <th className="w-20 px-2 text-center">{latest.country_code} (+/−)</th>
                <th className="px-2">
                  {isDriver ? "Grand prix results" : "Points per round"} (rounds 1 — {rounds.length})
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-highest/15 font-mono text-[12px] font-semibold">
              {entries.map((entry, i) => (
                <tr
                  key={entry.key}
                  className={`h-8 transition-colors hover:bg-surface-container ${
                    i % 2 ? "bg-surface-container-lowest" : "bg-surface-container-low"
                  }`}
                >
                  <td className="px-1 text-center t-headline-md italic">{entry.position}</td>
                  <td
                    className={`px-0.5 text-center text-[10px] ${
                      entry.change > 0 ? "text-primary" : entry.change < 0 ? "text-error" : "text-on-surface-variant"
                    }`}
                  >
                    {entry.change > 0 ? `▲${entry.change}` : entry.change < 0 ? `▼${-entry.change}` : "—"}
                  </td>
                  <td className="px-2">
                    <div className="flex items-center gap-1">
                      <TeamBar colour={teamColour(entry.colour)} className="h-5 w-1" />
                      {entry.code && <span className="font-display text-[14px] font-bold">{entry.code}</span>}
                      <span className={`font-sans text-[12px] font-normal ${entry.code ? "text-on-surface-variant" : ""}`}>
                        {entry.name}
                      </span>
                    </div>
                  </td>
                  {isDriver && (
                    <td className="truncate px-2 font-sans text-[11px] font-normal text-on-surface-variant">
                      {entry.subtitle}
                    </td>
                  )}
                  <td className="px-2 text-right text-[15px] font-bold">{entry.points}</td>
                  <td className="px-2 text-right text-[11px]">
                    {entry.gapToLeader === 0 ? (
                      <span className="t-label-caps text-primary">Leader</span>
                    ) : (
                      <span className="text-on-surface-variant">{entry.gapToLeader}</span>
                    )}
                  </td>
                  <td className="bg-surface-container-highest/20 px-2 text-center font-bold">{signed(entry.lastGain)}</td>
                  <td className="px-2">
                    <div className="flex items-center gap-1 text-[9px]">
                      {entry.squares.map((label, round) => (
                        <span
                          key={round}
                          title={rounds[round]?.country_name}
                          className={`flex h-4 items-center justify-center rounded-xs ${isDriver ? "w-5" : "w-6"} ${squareClass(
                            label,
                            isDriver,
                          )} ${round === entry.squares.length - 1 ? "ring-1 ring-primary" : ""}`}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
