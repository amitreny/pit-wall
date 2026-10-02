export interface PositionSeries {
  key: number;
  label: string;
  colour: string;
  /** [lap, position] steps, in order. */
  points: [number, number][];
  /** Lap the car stopped on, when it retired. */
  retiredAt?: number;
}

const W = 1200;
const LEFT = 60;
const RIGHT = 1130;
const TOP = 16;
const ROW = 22;

// Position by lap, one line per driver. A team-mate sharing a colour with a
// car already drawn gets a dashed line.
export function PositionChart({
  series,
  laps,
  cars,
  neutralised,
}: {
  series: PositionSeries[];
  laps: number;
  cars: number;
  neutralised: { from: number; to: number; virtual: boolean }[];
}) {
  const bottom = TOP + (cars - 1) * ROW;
  const height = bottom + 40;
  const x = (lap: number) => LEFT + (Math.min(lap, laps) / laps) * (RIGHT - LEFT);
  const y = (position: number) => TOP + (position - 1) * ROW;
  const lapTicks = Array.from({ length: Math.floor(laps / 10) + 1 }, (_, i) => i * 10);
  const seen = new Set<string>();

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label="Position by lap">
      {neutralised.map((p, i) => (
        <rect
          key={i}
          x={x(p.from)}
          y={TOP - 10}
          width={Math.max(2, x(p.to) - x(p.from))}
          height={bottom - TOP + 20}
          fill="#ffd21f"
          opacity={p.virtual ? 0.08 : 0.16}
        />
      ))}
      <g stroke="#1f232d">
        {lapTicks.map((lap) => (
          <line key={lap} x1={x(lap)} x2={x(lap)} y1={TOP - 10} y2={bottom + 10} />
        ))}
      </g>
      <g fill="#9099a8" textAnchor="middle" className="font-mono text-[10px]">
        {lapTicks.map((lap) => (
          <text key={lap} x={x(lap)} y={bottom + 28}>
            L{lap}
          </text>
        ))}
      </g>
      <g fill="#7fff96" textAnchor="end" className="font-mono text-[11px] font-bold">
        {Array.from({ length: cars }, (_, i) => i + 1)
          .filter((p) => p === 1 || p % 5 === 0)
          .map((p) => (
            <text key={p} x={LEFT - 14} y={y(p) + 4}>
              P{p}
            </text>
          ))}
      </g>

      {series.map((s) => {
        const dashed = seen.has(s.colour);
        seen.add(s.colour);
        const end = s.retiredAt ?? laps;
        let d = "";
        s.points.forEach(([lap, position], i) => {
          if (lap > end) return;
          // Hold the previous position until the change, then step to the new one.
          d += i === 0 ? `M${x(lap)} ${y(position)}` : ` H${x(lap)} L${x(lap) + 3} ${y(position)}`;
        });
        const last = s.points.filter(([lap]) => lap <= end).at(-1);
        if (!last) return null;
        d += ` H${x(end)}`;
        return (
          <g key={s.key}>
            <path
              d={d}
              fill="none"
              stroke={s.colour}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeDasharray={dashed ? "5 4" : undefined}
              opacity={s.retiredAt != null ? 0.6 : 0.95}
            />
            {s.retiredAt != null ? (
              <>
                <circle cx={x(end)} cy={y(last[1])} r="4" fill="#93000a" stroke="#ffb4ab" />
                <text x={x(end) + 8} y={y(last[1]) + 4} fill="#ffb4ab" className="font-mono text-[10px] font-bold">
                  {`${s.label} OUT L${s.retiredAt}`}
                </text>
              </>
            ) : (
              <>
                <circle cx={x(end)} cy={y(last[1])} r="3.5" fill={s.colour} />
                <text x={x(end) + 10} y={y(last[1]) + 4} fill={s.colour} className="font-mono text-[11px] font-bold">
                  {s.label}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
