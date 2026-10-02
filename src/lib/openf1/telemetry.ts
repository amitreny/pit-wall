import "server-only";
import { openf1Safe } from "./client";
import { sessionTtl } from "./queries";
import type { Lap, Session } from "./types";

const GRID_POINTS = 400;
const MINI_SECTORS = 25;

export interface Trace {
  /** Seconds since the start of the lap at each grid distance. */
  time: number[];
  speed: number[];
  throttle: number[];
  brake: number[];
  gear: number[];
  x: number[];
  y: number[];
}

export interface Comparison {
  /** Metres from the start line; shared by both traces. */
  distance: number[];
  a: Trace;
  b: Trace;
  /** Time of A minus time of B at each distance: negative means A is ahead. */
  delta: number[];
  /** Which car was quicker through each slice of the lap. */
  miniSectors: ("a" | "b")[];
}

interface Samples {
  time: number[];
  distance: number[];
  speed: number[];
  throttle: number[];
  brake: number[];
  gear: number[];
  locTime: number[];
  x: number[];
  y: number[];
}

const stamp = (ms: number) => new Date(ms).toISOString().replace("Z", "");

async function loadLap(session: Session, lap: Lap): Promise<Samples | null> {
  if (!lap.date_start || !lap.lap_duration) return null;
  const start = Date.parse(lap.date_start);
  const query = {
    session_key: session.session_key,
    driver_number: lap.driver_number,
    date: [
      { op: ">=" as const, value: stamp(start) },
      { op: "<=" as const, value: stamp(start + lap.lap_duration * 1000) },
    ],
  };
  const ttl = sessionTtl(session);
  const [car, location] = await Promise.all([openf1Safe("car_data", query, ttl), openf1Safe("location", query, ttl)]);
  if (car.length < 50 || location.length < 50) return null;

  const time = car.map((c) => (Date.parse(c.date) - start) / 1000);
  // Distance is not in the feed: integrate speed (km/h) over time.
  const distance = [0];
  for (let i = 1; i < car.length; i++) {
    distance.push(distance[i - 1] + (car[i - 1].speed / 3.6) * (time[i] - time[i - 1]));
  }
  return {
    time,
    distance,
    speed: car.map((c) => c.speed),
    throttle: car.map((c) => c.throttle),
    brake: car.map((c) => c.brake),
    gear: car.map((c) => c.n_gear),
    locTime: location.map((l) => (Date.parse(l.date) - start) / 1000),
    x: location.map((l) => l.x),
    y: location.map((l) => l.y),
  };
}

/** Index of the last element of ascending `xs` that is <= `value`. */
function floorIndex(xs: number[], value: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function lerp(xs: number[], ys: number[], value: number): number {
  const i = floorIndex(xs, value);
  const j = Math.min(i + 1, xs.length - 1);
  const span = xs[j] - xs[i];
  return span > 0 ? ys[i] + ((value - xs[i]) / span) * (ys[j] - ys[i]) : ys[i];
}

function resample(samples: Samples, grid: number[], length: number): Trace {
  // Integration error differs per car, so stretch each lap onto the common length.
  const scale = length / (samples.distance[samples.distance.length - 1] || 1);
  const distance = samples.distance.map((d) => d * scale);
  const trace: Trace = { time: [], speed: [], throttle: [], brake: [], gear: [], x: [], y: [] };
  for (const g of grid) {
    const t = lerp(distance, samples.time, g);
    const i = floorIndex(distance, g);
    trace.time.push(t);
    trace.speed.push(Math.round(lerp(distance, samples.speed, g)));
    trace.throttle.push(samples.throttle[i]);
    trace.brake.push(samples.brake[i]);
    trace.gear.push(samples.gear[i]);
    trace.x.push(Math.round(lerp(samples.locTime, samples.x, t)));
    trace.y.push(Math.round(lerp(samples.locTime, samples.y, t)));
  }
  return trace;
}

/** Two laps aligned on distance, or null when telemetry for either is missing. */
export async function compareLaps(session: Session, lapA: Lap, lapB: Lap): Promise<Comparison | null> {
  const [a, b] = await Promise.all([loadLap(session, lapA), loadLap(session, lapB)]);
  if (!a || !b) return null;

  const length = (a.distance[a.distance.length - 1] + b.distance[b.distance.length - 1]) / 2;
  const distance = Array.from({ length: GRID_POINTS }, (_, i) => Math.round((i / (GRID_POINTS - 1)) * length));
  const traceA = resample(a, distance, length);
  const traceB = resample(b, distance, length);

  const per = Math.floor(GRID_POINTS / MINI_SECTORS);
  const miniSectors = Array.from({ length: MINI_SECTORS }, (_, s) => {
    const from = s * per;
    const to = s === MINI_SECTORS - 1 ? GRID_POINTS - 1 : (s + 1) * per;
    return traceA.time[to] - traceA.time[from] <= traceB.time[to] - traceB.time[from] ? ("a" as const) : ("b" as const);
  });

  return {
    distance,
    a: traceA,
    b: traceB,
    delta: distance.map((_, i) => traceA.time[i] - traceB.time[i]),
    miniSectors,
  };
}
