// Timing state for one session, plus the reducer that folds OpenF1 messages
// into it. The server builds a snapshot by replaying REST rows through
// `applyMessage`; the browser then applies live stream messages with the same
// function, so there is one definition of how each endpoint updates the screen.

import { lastValue } from "../format";

export interface DriverInfo {
  number: number;
  code: string;
  name: string;
  team: string;
  colour: string | null;
}

export interface TimingRow {
  driver: number;
  position: number | null;
  gap: number | string | null;
  interval: number | string | null;
  lapNumber: number;
  lastLap: number | null;
  bestLap: number | null;
  lastSectors: (number | null)[];
  bestSectors: (number | null)[];
  topSpeed: number | null;
  pitLaps: number[];
  out: "DNF" | "DNS" | "DSQ" | null;
}

export interface StintInfo {
  number: number;
  compound: string | null;
  lapStart: number;
  lapEnd: number;
  ageAtStart: number;
}

export interface RaceControlMessage {
  date: string;
  category: string;
  flag: string | null;
  message: string;
  lap: number | null;
}

export interface RadioMessage {
  date: string;
  driver: number;
  url: string;
}

export interface WeatherInfo {
  air: number;
  track: number;
  humidity: number;
  pressure: number;
  rainfall: number;
  windSpeed: number;
  windDirection: number;
}

export interface CarTelemetry {
  speed: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  drs: number | null;
}

export type TrackFlag = "GREEN" | "YELLOW" | "DOUBLE YELLOW" | "RED" | "SC" | "VSC" | "CHEQUERED";

export interface LiveState {
  sessionKey: number;
  drivers: Record<number, DriverInfo>;
  rows: Record<number, TimingRow>;
  stints: Record<number, StintInfo[]>;
  /** Newest first. */
  raceControl: RaceControlMessage[];
  /** Newest first. */
  radio: RadioMessage[];
  weather: WeatherInfo | null;
  track: { flag: TrackFlag; message: string; date: string };
  best: { lap: number | null; lapDriver: number | null; sectors: (number | null)[]; sectorDrivers: (number | null)[] };
  /** Highest lap number any car has started. */
  lap: number;
  /** Latest [x, y] per car; only populated from the live stream. */
  locations: Record<number, [number, number]>;
  /** Latest telemetry sample per car; only populated from the live stream. */
  cars: Record<number, CarTelemetry>;
}

const MAX_RACE_CONTROL = 40;
const MAX_RADIO = 12;

export function createState(sessionKey: number): LiveState {
  return {
    sessionKey,
    drivers: {},
    rows: {},
    stints: {},
    raceControl: [],
    radio: [],
    weather: null,
    track: { flag: "GREEN", message: "Track clear", date: "" },
    best: { lap: null, lapDriver: null, sectors: [null, null, null], sectorDrivers: [null, null, null] },
    lap: 0,
    locations: {},
    cars: {},
  };
}

function row(state: LiveState, driver: number): TimingRow {
  return (state.rows[driver] ??= {
    driver,
    position: null,
    gap: null,
    interval: null,
    lapNumber: 0,
    lastLap: null,
    bestLap: null,
    lastSectors: [null, null, null],
    bestSectors: [null, null, null],
    topSpeed: null,
    pitLaps: [],
    out: null,
  });
}

type Data = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function trackStatus(msg: Data): { flag: TrackFlag; message: string } | null {
  const text = String(msg.message ?? "").toUpperCase();
  if (msg.category === "SafetyCar") {
    if (text.includes("VIRTUAL SAFETY CAR")) {
      return text.includes("ENDING") ? null : { flag: "VSC", message: "Virtual safety car" };
    }
    return text.includes("DEPLOYED") ? { flag: "SC", message: "Safety car deployed" } : null;
  }
  if (msg.category !== "Flag") return null;
  const sector = msg.sector != null ? ` sector ${msg.sector}` : "";
  switch (msg.flag) {
    case "RED":
      return { flag: "RED", message: "Red flag" };
    case "CHEQUERED":
      return { flag: "CHEQUERED", message: "Chequered flag" };
    case "GREEN":
      return { flag: "GREEN", message: "Track clear" };
    case "CLEAR":
      return { flag: "GREEN", message: msg.scope === "Sector" ? `Clear in${sector}` : "Track clear" };
    case "YELLOW":
      return { flag: "YELLOW", message: `Yellow flag${sector}` };
    case "DOUBLE YELLOW":
      return { flag: "DOUBLE YELLOW", message: `Double yellow${sector}` };
    default:
      return null;
  }
}

/** Folds one OpenF1 message into the state. `topic` is the endpoint name. Mutates `state`. */
export function applyMessage(state: LiveState, topic: string, data: Data): void {
  if (data.session_key != null && data.session_key !== state.sessionKey) return;
  const driver = num(data.driver_number);

  switch (topic) {
    case "drivers": {
      if (driver == null) return;
      state.drivers[driver] = {
        number: driver,
        code: String(data.name_acronym ?? driver),
        name: String(data.full_name ?? data.broadcast_name ?? driver),
        team: String(data.team_name ?? ""),
        colour: (data.team_colour as string | null) ?? null,
      };
      row(state, driver);
      return;
    }
    case "position": {
      if (driver != null) row(state, driver).position = num(data.position);
      return;
    }
    case "intervals": {
      if (driver == null) return;
      const r = row(state, driver);
      r.gap = (data.gap_to_leader as number | string | null) ?? null;
      r.interval = (data.interval as number | string | null) ?? null;
      return;
    }
    case "session_result": {
      if (driver == null) return;
      const r = row(state, driver);
      r.position = num(data.position);
      r.gap = lastValue(data.gap_to_leader as number | string | (number | string | null)[] | null);
      r.out = data.dsq ? "DSQ" : data.dns ? "DNS" : data.dnf ? "DNF" : null;
      return;
    }
    case "laps": {
      const lapNumber = num(data.lap_number);
      if (driver == null || lapNumber == null) return;
      const r = row(state, driver);
      state.lap = Math.max(state.lap, lapNumber);

      const sectors = [num(data.duration_sector_1), num(data.duration_sector_2), num(data.duration_sector_3)];
      sectors.forEach((s, i) => {
        if (s == null) return;
        if (r.bestSectors[i] == null || s < r.bestSectors[i]!) r.bestSectors[i] = s;
        if (state.best.sectors[i] == null || s < state.best.sectors[i]!) {
          state.best.sectors[i] = s;
          state.best.sectorDrivers[i] = driver;
        }
      });
      const speed = num(data.st_speed);
      if (speed != null && (r.topSpeed == null || speed > r.topSpeed)) r.topSpeed = speed;

      const duration = num(data.lap_duration);
      if (duration != null) {
        if (r.bestLap == null || duration < r.bestLap) r.bestLap = duration;
        if (state.best.lap == null || duration < state.best.lap) {
          state.best.lap = duration;
          state.best.lapDriver = driver;
        }
      }
      // Lap documents are re-sent as sectors complete; only the newest lap drives the "last" columns.
      if (lapNumber >= r.lapNumber) {
        if (lapNumber > r.lapNumber) r.lastSectors = [null, null, null];
        r.lapNumber = lapNumber;
        sectors.forEach((s, i) => {
          if (s != null) r.lastSectors[i] = s;
        });
        if (duration != null) r.lastLap = duration;
      }
      return;
    }
    case "stints": {
      const number = num(data.stint_number);
      if (driver == null || number == null) return;
      const stint: StintInfo = {
        number,
        compound: (data.compound as string | null) ?? null,
        lapStart: num(data.lap_start) ?? 1,
        lapEnd: num(data.lap_end) ?? num(data.lap_start) ?? 1,
        ageAtStart: num(data.tyre_age_at_start) ?? 0,
      };
      const list = (state.stints[driver] ??= []);
      const at = list.findIndex((s) => s.number === number);
      if (at >= 0) list[at] = stint;
      else list.push(stint);
      list.sort((a, b) => a.number - b.number);
      return;
    }
    case "pit": {
      const lap = num(data.lap_number);
      if (driver == null || lap == null) return;
      const r = row(state, driver);
      if (!r.pitLaps.includes(lap)) r.pitLaps.push(lap);
      return;
    }
    case "race_control": {
      const date = String(data.date ?? "");
      const message = String(data.message ?? "");
      if (state.raceControl.some((m) => m.date === date && m.message === message)) return;
      state.raceControl.unshift({
        date,
        category: String(data.category ?? ""),
        flag: (data.flag as string | null) ?? null,
        message,
        lap: num(data.lap_number),
      });
      state.raceControl.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      state.raceControl.length = Math.min(state.raceControl.length, MAX_RACE_CONTROL);

      const status = trackStatus(data);
      if (status && (!state.track.date || Date.parse(date) >= Date.parse(state.track.date))) {
        state.track = { ...status, date };
      }
      return;
    }
    case "team_radio": {
      const url = String(data.recording_url ?? "");
      if (driver == null || !url || state.radio.some((m) => m.url === url)) return;
      state.radio.unshift({ date: String(data.date ?? ""), driver, url });
      state.radio.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      state.radio.length = Math.min(state.radio.length, MAX_RADIO);
      return;
    }
    case "weather": {
      state.weather = {
        air: num(data.air_temperature) ?? 0,
        track: num(data.track_temperature) ?? 0,
        humidity: num(data.humidity) ?? 0,
        pressure: num(data.pressure) ?? 0,
        rainfall: num(data.rainfall) ?? 0,
        windSpeed: num(data.wind_speed) ?? 0,
        windDirection: num(data.wind_direction) ?? 0,
      };
      return;
    }
    case "locations": {
      // Batched by the stream route: { "<driver number>": [x, y], ... }.
      for (const [number, point] of Object.entries(data)) {
        if (Array.isArray(point)) state.locations[Number(number)] = point as [number, number];
      }
      return;
    }
    case "car_data": {
      if (driver == null) return;
      state.cars[driver] = {
        speed: num(data.speed) ?? 0,
        rpm: num(data.rpm) ?? 0,
        gear: num(data.n_gear) ?? 0,
        throttle: num(data.throttle) ?? 0,
        brake: num(data.brake) ?? 0,
        drs: num(data.drs),
      };
      return;
    }
  }
}

/** Rows in classification order; cars without a position go last. */
export function classification(state: LiveState): TimingRow[] {
  return Object.values(state.rows).sort(
    (a, b) => (a.position ?? 999) - (b.position ?? 999) || a.driver - b.driver,
  );
}
