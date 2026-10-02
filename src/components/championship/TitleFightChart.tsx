export interface ChartSeries {
  key: string;
  label: string;
  colour: string;
  /** Cumulative points after each round. */
  points: number[];
}

const W = 1100;
const H = 300;
const LEFT = 60;
const RIGHT = 1010;
const TOP = 20;
const BOTTOM = 255;
const BRIGHT = 5;

function niceStep(max: number): number {
  const rough = max / 6;
  const pow = 10 ** Math.floor(Math.log10(rough || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10;
}

// Cumulative points per round. The top five are drawn bright, the rest dimmed;
// a team-mate sharing a colour with a higher-placed driver gets a dashed line.
export function TitleFightChart({ series, rounds }: { series: ChartSeries[]; rounds: string[] }) {
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => (rounds.length > 1 ? LEFT + (i * (RIGHT - LEFT)) / (rounds.length - 1) : (LEFT + RIGHT) / 2);
  const y = (points: number) => BOTTOM - (points / top) * (BOTTOM - TOP);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const seen = new Set<string>();
  const lines = series.map((s, rank) => {
    const duplicate = seen.has(s.colour);
    seen.add(s.colour);
    return { ...s, rank, duplicate };
  });

  // Keep end labels from overlapping when contenders are close on points.
  const labels = lines
    .slice(0, BRIGHT)
    .map((s) => ({ ...s, y: y(s.points[s.points.length - 1] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 15);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Cumulative championship points by round">
      <g stroke="#1f232d" strokeDasharray="2 3">
        {ticks.map((t) => (
          <line key={t} x1={LEFT - 10} x2={RIGHT} y1={y(t)} y2={y(t)} />
        ))}
      </g>
      <g fill="#717887" textAnchor="end" className="font-mono text-[10px]">
        {ticks.map((t) => (
          <text key={t} x={LEFT - 16} y={y(t) + 3}>
            {t}
          </text>
        ))}
      </g>
      <g stroke="#161820">
        {rounds.map((_, i) => (
          <line key={i} x1={x(i)} x2={x(i)} y1={TOP - 10} y2={BOTTOM} />
        ))}
      </g>
      <g fill="#9099a8" textAnchor="middle" className="font-mono text-[9px]">
        {rounds.map((label, i) => (
          <text key={i} x={x(i)} y={BOTTOM + 18}>
            {label}
          </text>
        ))}
      </g>

      {[...lines].reverse().map((s) => {
        const bright = s.rank < BRIGHT;
        const d = s.points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
        const last = s.points.length - 1;
        return (
          <g key={s.key} opacity={bright ? 1 : 0.25}>
            <path
              d={d}
              fill="none"
              stroke={s.colour}
              strokeWidth={bright ? Math.max(2, 4 - s.rank * 0.5) : 1.2}
              strokeDasharray={s.duplicate ? "6 4" : undefined}
              strokeLinejoin="round"
            />
            {bright && <circle cx={x(last)} cy={y(s.points[last])} r={5 - s.rank * 0.4} fill={s.colour} />}
          </g>
        );
      })}

      <g className="font-mono text-[11px] font-bold">
        {labels.map((s) => (
          <text key={s.key} x={RIGHT + 12} y={s.y + 4} fill={s.colour}>
            {s.label} <tspan fill="#e3e2e6">{s.points[s.points.length - 1]}</tspan>
          </text>
        ))}
      </g>
    </svg>
  );
}
