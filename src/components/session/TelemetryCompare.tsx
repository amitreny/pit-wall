"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import type { Comparison, Trace } from "@/lib/openf1/telemetry";
import { createProjector, type Outline } from "@/lib/track";

export interface CompareCar {
  code: string;
  colour: string;
}

type Channel = "speed" | "throttle" | "brake" | "gear";

const CHART_W = 1000;
const CHART_H = 100;

function linePath(values: number[], min: number, max: number, stepped = false): string {
  const last = values.length - 1;
  const y = (v: number) => CHART_H - 4 - ((v - min) / (max - min || 1)) * (CHART_H - 8);
  return values
    .map((v, i) => {
      const x = (i / last) * CHART_W;
      if (i === 0) return `M0 ${y(v).toFixed(1)}`;
      return stepped ? `H${x.toFixed(1)} V${y(v).toFixed(1)}` : `L${x.toFixed(1)} ${y(v).toFixed(1)}`;
    })
    .join(" ");
}

function ChartRow({
  index,
  title,
  unit,
  readout,
  axis,
  children,
}: {
  index: number;
  title: string;
  unit: string;
  readout: React.ReactNode;
  axis: [string, string];
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-surface-container-highest/20 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2 pr-1">
        <span className="t-label-caps tracking-widest">
          {index}. {title} <span className="t-label-micro text-on-surface-variant">{unit}</span>
        </span>
        <span className="rounded bg-surface-container px-2 py-0.5 t-telemetry-cell">{readout}</span>
      </div>
      <div className="relative h-24">
        <span className="absolute top-0 left-0 t-label-micro text-on-surface-variant">{axis[1]}</span>
        <span className="absolute bottom-0 left-0 t-label-micro text-on-surface-variant">{axis[0]}</span>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="h-full w-full">
          {children}
        </svg>
      </div>
    </div>
  );
}

// Two laps overlaid on a shared distance axis. Moving the pointer over the
// traces moves one cursor through every chart and along the circuit map.
export function TelemetryCompare({
  comparison,
  a,
  b,
  outline,
}: {
  comparison: Comparison;
  a: CompareCar;
  b: CompareCar;
  outline: Outline | null;
}) {
  const { distance, delta, miniSectors } = comparison;
  const last = distance.length - 1;
  const [cursor, setCursor] = useState<number | null>(null);
  const at = cursor ?? last;
  const fraction = at / last;

  function onMove(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setCursor(Math.round(f * last));
  }

  // --- circuit map, coloured by who was quicker through each slice ---
  const lapOutline: Outline = {
    x: comparison.a.x,
    y: comparison.a.y,
    corners: outline?.corners ?? [],
    rotation: outline?.rotation ?? 0,
  };
  const projector = createProjector(lapOutline, 800, 560, 40);
  const points = comparison.a.x.map((x, i) => projector.project(x, comparison.a.y[i]));
  const per = Math.floor(distance.length / miniSectors.length);
  const segments = miniSectors.map((winner, s) => {
    const from = s * per;
    const to = s === miniSectors.length - 1 ? last : (s + 1) * per;
    const d = points
      .slice(from, to + 1)
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ");
    return { d, colour: winner === "a" ? a.colour : b.colour };
  });
  const share = Math.round((miniSectors.filter((m) => m === "a").length / miniSectors.length) * 100);
  const [markerX, markerY] = points[at];

  const pair = (channel: Channel, format: (v: number) => string) => (
    <>
      <span style={{ color: a.colour }}>
        {a.code}: {format(comparison.a[channel][at])}
      </span>
      <span className="mx-1.5 text-on-surface-variant">|</span>
      <span style={{ color: b.colour }}>
        {b.code}: {format(comparison.b[channel][at])}
      </span>
    </>
  );
  const traces = (channel: Channel, min: number, max: number, stepped = false) =>
    ([
      [comparison.b, b],
      [comparison.a, a],
    ] as [Trace, CompareCar][]).map(([trace, car]) => (
      <path
        key={car.code + channel}
        d={linePath(trace[channel], min, max, stepped)}
        fill="none"
        stroke={car.colour}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    ));

  const maxSpeed = Math.ceil(Math.max(...comparison.a.speed, ...comparison.b.speed) / 50) * 50;
  const maxDelta = Math.max(0.1, ...delta.map(Math.abs));
  const deltaY = (v: number) => CHART_H / 2 - (v / maxDelta) * (CHART_H / 2 - 4);
  const deltaLine = delta.map((v, i) => `${i ? "L" : "M"}${((i / last) * CHART_W).toFixed(1)} ${deltaY(v).toFixed(1)}`).join(" ");
  const speedGap = comparison.a.speed[at] - comparison.b.speed[at];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((f * distance[last]) / 10) * 10);

  return (
    <div className="grid grid-cols-1 gap-0.5 xl:grid-cols-12">
      <div className="rounded bg-surface-container-low p-2 xl:col-span-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Icon name="route" className="text-[20px] text-primary" />
            <h2 className="t-headline-md uppercase">Circuit delta map</h2>
          </div>
          <span className="rounded bg-surface-container px-2 py-0.5 t-label-micro text-on-surface-variant">
            Cursor: <span className="t-telemetry-cell text-primary">{distance[at].toLocaleString("en-US")} m</span>
          </span>
        </div>
        <p className="t-label-micro text-on-surface-variant">Coloured by the quicker car through each of {miniSectors.length} slices</p>
        <div className="relative mt-1 rounded bg-surface-container-lowest">
          <svg viewBox="0 0 800 560" fill="none" className="h-auto w-full" role="img" aria-label="Circuit map showing which car was faster where">
            <path d={projector.path} stroke="#1c2029" strokeWidth="18" strokeLinejoin="round" />
            {segments.map((s, i) => (
              <path key={i} d={s.d} stroke={s.colour} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {lapOutline.corners.map((corner) => {
              const [x, y] = projector.project(corner.x, corner.y);
              return (
                <text key={corner.number} x={x} y={y - 14} textAnchor="middle" fill="#bbcbb8" className="font-mono text-[11px] font-bold">
                  T{corner.number}
                </text>
              );
            })}
            <circle cx={points[0][0]} cy={points[0][1]} r="5" fill="#ffffff" />
            <circle cx={markerX} cy={markerY} r="9" fill="none" stroke="#7fff96" strokeWidth="2" />
            <circle cx={markerX} cy={markerY} r="4" fill="#7fff96" />
          </svg>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 rounded bg-surface-container px-2 py-1 t-label-caps">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3" style={{ backgroundColor: a.colour }} />
            {a.code} faster ({share}% of lap)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3" style={{ backgroundColor: b.colour }} />
            {b.code} faster ({100 - share}% of lap)
          </span>
        </div>
      </div>

      <div className="rounded bg-surface-container-low p-2 xl:col-span-7">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Icon name="show_chart" className="text-[20px] text-primary" />
            <h2 className="t-headline-md uppercase">Synchronized telemetry traces</h2>
          </div>
          <div className="flex items-center gap-3 t-label-caps">
            <span className="flex items-center gap-1" style={{ color: a.colour }}>
              <span className="h-1 w-3" style={{ backgroundColor: a.colour }} /> {a.code}
            </span>
            <span className="flex items-center gap-1" style={{ color: b.colour }}>
              <span className="h-1 w-3" style={{ backgroundColor: b.colour }} /> {b.code}
            </span>
          </div>
        </div>

        <div
          className="relative cursor-crosshair touch-none"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setCursor(null)}
        >
          <ChartRow
            index={1}
            title="Speed"
            unit="km/h"
            axis={["0", String(maxSpeed)]}
            readout={
              <>
                {pair("speed", (v) => `${v}`)}
                <span className="ml-2 text-primary">
                  Δ {speedGap > 0 ? "+" : ""}
                  {speedGap}
                </span>
              </>
            }
          >
            {traces("speed", 0, maxSpeed)}
          </ChartRow>
          <ChartRow index={2} title="Throttle" unit="%" axis={["0%", "100%"]} readout={pair("throttle", (v) => `${v}%`)}>
            {traces("throttle", 0, 100)}
          </ChartRow>
          <ChartRow index={3} title="Brake" unit="on / off" axis={["off", "on"]} readout={pair("brake", (v) => (v ? "ON" : "OFF"))}>
            {traces("brake", 0, 100, true)}
          </ChartRow>
          <ChartRow index={4} title="Gear" unit="1 – 8" axis={["1", "8"]} readout={pair("gear", (v) => `G${v}`)}>
            {traces("gear", 1, 8, true)}
          </ChartRow>
          <ChartRow
            index={5}
            title="Time delta"
            unit={`cumulative seconds, ${a.code} vs ${b.code}`}
            axis={[`-${maxDelta.toFixed(2)}s (${a.code} ahead)`, `+${maxDelta.toFixed(2)}s (${a.code} behind)`]}
            readout={
              <span className={delta[at] <= 0 ? "text-primary" : "text-error"}>
                {a.code} {delta[at] <= 0 ? "ahead by" : "behind by"} {Math.abs(delta[at]).toFixed(3)}s
              </span>
            }
          >
            <line x1="0" x2={CHART_W} y1={CHART_H / 2} y2={CHART_H / 2} stroke="#343538" vectorEffect="non-scaling-stroke" />
            <path d={`${deltaLine} L${CHART_W} ${CHART_H / 2} L0 ${CHART_H / 2} Z`} fill="#2ee66b" opacity="0.15" />
            <path d={deltaLine} fill="none" stroke="#2ee66b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </ChartRow>
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary"
            style={{ left: `${fraction * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between rounded bg-surface-container-lowest px-1 py-1 t-label-micro text-on-surface-variant">
          {ticks.map((t, i) => (
            <span key={i}>{t.toLocaleString("en-US")} m</span>
          ))}
        </div>
      </div>
    </div>
  );
}
