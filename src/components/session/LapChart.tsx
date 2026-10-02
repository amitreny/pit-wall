"use client";

import { useState } from "react";
import { formatLap } from "@/lib/format";

export interface LapSeries {
  number: number;
  code: string;
  colour: string;
  laps: { n: number; t: number; tyre: string; pit: boolean }[];
}

const W = 1200;
const H = 340;
const LEFT = 70;
const RIGHT = 1180;
const TOP = 20;
const BOTTOM = 300;

// Lap time by lap for the selected drivers. Dots are tinted by tyre compound;
// laps into or out of the pits are hollow. Slow laps (pit stops, safety car)
// are pinned to the top edge so they don't flatten the racing laps.
export function LapChart({ series, initial }: { series: LapSeries[]; initial: number[] }) {
  const [selected, setSelected] = useState(initial);
  const shown = series.filter((s) => selected.includes(s.number));

  const times = shown.flatMap((s) => s.laps.map((l) => l.t)).sort((a, b) => a - b);
  const min = times[0] ?? 0;
  const cap = times.length ? Math.max(times[Math.floor(times.length / 2)] * 1.06, min + 1) : 1;
  const maxLap = Math.max(1, ...series.flatMap((s) => s.laps.map((l) => l.n)));
  const lo = Math.floor(min);
  const hi = Math.ceil(cap);
  const x = (lap: number) => LEFT + ((lap - 1) / Math.max(1, maxLap - 1)) * (RIGHT - LEFT);
  const y = (t: number) => BOTTOM - ((Math.min(t, hi) - lo) / (hi - lo || 1)) * (BOTTOM - TOP);
  const step = Math.max(1, Math.ceil((hi - lo) / 7));
  const ticks = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const lapTicks = Array.from({ length: Math.floor(maxLap / 10) + 1 }, (_, i) => Math.max(1, i * 10));
  const seen = new Set<string>();

  function toggle(number: number) {
    setSelected((current) => (current.includes(number) ? current.filter((n) => n !== number) : [...current, number]));
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <span className="mr-1 t-label-micro text-on-surface-variant">Drivers</span>
        {series.map((s) => {
          const on = selected.includes(s.number);
          return (
            <button
              key={s.number}
              onClick={() => toggle(s.number)}
              aria-pressed={on}
              className={`rounded px-1.5 py-0.5 t-label-caps transition-colors ${
                on ? "text-black" : "bg-surface-container text-on-surface-variant hover:text-on-surface"
              }`}
              style={on ? { backgroundColor: s.colour } : undefined}
            >
              {s.code}
            </button>
          );
        })}
      </div>
      <div className="overflow-x-auto rounded bg-surface-container-lowest p-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[760px]" role="img" aria-label="Lap times by lap">
          <g stroke="#1f232d" strokeDasharray="2 3">
            {ticks.map((t) => (
              <line key={t} x1={LEFT} x2={RIGHT} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          <g fill="#9099a8" textAnchor="end" className="font-mono text-[11px]">
            {ticks.map((t) => (
              <text key={t} x={LEFT - 10} y={y(t) + 4}>
                {formatLap(t).replace(/\.000$/, ".0")}
                {t === hi ? "+" : ""}
              </text>
            ))}
          </g>
          <g fill="#9099a8" textAnchor="middle" className="font-mono text-[11px]">
            {lapTicks.map((lap) => (
              <text key={lap} x={x(lap)} y={BOTTOM + 24}>
                L{lap}
              </text>
            ))}
          </g>

          {shown.map((s) => {
            const dashed = seen.has(s.colour);
            seen.add(s.colour);
            const d = s.laps.map((l, i) => `${i ? "L" : "M"}${x(l.n).toFixed(1)} ${y(l.t).toFixed(1)}`).join(" ");
            return (
              <g key={s.number}>
                <path
                  d={d}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeDasharray={dashed ? "5 4" : undefined}
                />
                {s.laps.map((l) => (
                  <circle
                    key={l.n}
                    cx={x(l.n)}
                    cy={y(l.t)}
                    r="3"
                    fill={l.pit ? "#0d0e11" : l.tyre}
                    stroke={l.pit ? l.tyre : "#0d0e11"}
                    strokeWidth="1"
                  >
                    <title>{`${s.code} lap ${l.n}: ${formatLap(l.t)}${l.pit ? " (pit lap)" : ""}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {!shown.length && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill="#bbcbb8" className="font-mono text-[13px]">
              Select a driver above
            </text>
          )}
        </svg>
      </div>
      <p className="mt-1 t-label-micro text-on-surface-variant">
        Dot colour = tyre compound {"//"} hollow dot = pit in or out lap {"//"} laps slower than {formatLap(hi)} are pinned to
        the top edge
      </p>
    </div>
  );
}
