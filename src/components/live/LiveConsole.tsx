"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TrackMap, type TrackCar } from "@/components/TrackMap";
import { Icon, Kerb, LiveDot, TeamBar, TyreBadge } from "@/components/ui";
import { compassPoint, compound, formatGap, formatLap, teamCode, teamColour } from "@/lib/format";
import {
  applyMessage,
  classification,
  type LiveState,
  type StintInfo,
  type TimingRow,
  type TrackFlag,
} from "@/lib/live/state";
import type { Meeting, Session } from "@/lib/openf1/types";
import type { Outline } from "@/lib/track";
import { useNow } from "@/lib/useNow";

/** live: streaming now. replay: finished session. locked: session is live but there are no sponsor credentials. */
export type ConsoleMode = "live" | "replay" | "locked";

const STREAM_TOPICS = [
  "drivers",
  "position",
  "intervals",
  "laps",
  "stints",
  "pit",
  "race_control",
  "weather",
  "team_radio",
  "locations",
];
const RENDER_INTERVAL_MS = 250;
const MAX_RPM = 13000;

// Messages arrive far faster than the screen needs to repaint, so the state is
// mutated in place and subscribers are notified at most four times a second.
function createStore(initial: LiveState) {
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  return {
    state: initial,
    apply(topic: string, data: Record<string, unknown>) {
      applyMessage(this.state, topic, data);
      timer ??= setTimeout(() => {
        timer = null;
        version++;
        listeners.forEach((l) => l());
      }, RENDER_INTERVAL_MS);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
  };
}

const FLAG_STYLE: Record<TrackFlag, string> = {
  GREEN: "bg-primary-container text-on-primary-container",
  YELLOW: "bg-timing-yellow text-black",
  "DOUBLE YELLOW": "bg-timing-yellow text-black",
  SC: "bg-timing-yellow text-black",
  VSC: "bg-timing-yellow text-black",
  RED: "bg-signal-red text-black",
  CHEQUERED: "bg-on-surface text-surface",
};

const clock = (iso: string) => (iso ? new Date(iso).toISOString().slice(11, 19) : "");

function lapColour(time: number | null, row: TimingRow, overallBest: number | null): string {
  if (time == null) return "text-on-surface-variant";
  if (time === overallBest) return "text-timing-purple";
  return time === row.bestLap ? "text-timing-green" : "text-timing-yellow";
}

function currentStint(stints: StintInfo[] | undefined) {
  const stint = stints?.[stints.length - 1];
  return stint ? { compound: stint.compound, age: stint.ageAtStart + (stint.lapEnd - stint.lapStart + 1) } : null;
}

function Readout({ label, value, className = "text-on-surface" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="t-label-micro text-on-surface-variant">{label}</span>
      <span className={`t-telemetry-cell ${className}`}>{value}</span>
    </div>
  );
}

function PanelHeader({ icon, title, note }: { icon: string; title: string; note?: string }) {
  return (
    <div className="flex items-center justify-between bg-surface-container-high px-2 py-0.5">
      <div className="flex items-center gap-1.5">
        <Icon name={icon} className="text-[16px] text-primary" />
        <span className="t-label-caps">{title}</span>
      </div>
      {note && <span className="t-label-micro text-on-surface-variant">{note}</span>}
    </div>
  );
}

export function LiveConsole({
  snapshot,
  session,
  meeting,
  outline,
  mode,
  totalLaps,
}: {
  snapshot: LiveState;
  session: Session;
  meeting: Meeting | null;
  outline: Outline | null;
  mode: ConsoleMode;
  totalLaps: number | null;
}) {
  const [store] = useState(() => createStore(structuredClone(snapshot)));
  useSyncExternalStore(store.subscribe, store.getVersion, () => 0);
  const state = store.state;

  const isRace = session.session_type === "Race";
  const rows = classification(state);
  const [selected, setSelected] = useState<number | null>(null);
  const [lapMode, setLapMode] = useState<"last" | "best">(isRace ? "last" : "best");
  const [feed, setFeed] = useState(mode === "live" ? "connecting" : "off");
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const now = useNow();

  const selectedNumber = selected ?? rows[0]?.driver ?? null;
  const selectedRow = selectedNumber != null ? state.rows[selectedNumber] : undefined;
  const selectedDriver = selectedNumber != null ? state.drivers[selectedNumber] : undefined;
  const telemetry = selectedNumber != null ? state.cars[selectedNumber] : undefined;

  useEffect(() => {
    if (mode !== "live") return;
    const source = new EventSource("/api/live");
    for (const topic of STREAM_TOPICS) {
      source.addEventListener(topic, (event) => store.apply(topic, JSON.parse((event as MessageEvent).data)));
    }
    source.addEventListener("status", (event) => setFeed(JSON.parse((event as MessageEvent).data)));
    source.onerror = () => setFeed("connecting");
    return () => source.close();
  }, [mode, store]);

  // Telemetry is ~4 samples a second per car, so only the selected car is streamed.
  useEffect(() => {
    if (mode !== "live" || selectedNumber == null) return;
    const source = new EventSource(`/api/live?topics=none&driver=${selectedNumber}`);
    source.addEventListener("car_data", (event) => store.apply("car_data", JSON.parse((event as MessageEvent).data)));
    return () => source.close();
  }, [mode, selectedNumber, store]);

  useEffect(() => () => audio.current?.pause(), []);

  function toggleRadio(url: string) {
    audio.current?.pause();
    if (playing === url) return setPlaying(null);
    const clip = new Audio(url);
    clip.onended = () => setPlaying(null);
    clip.play().catch(() => setPlaying(null));
    audio.current = clip;
    setPlaying(url);
  }

  const cars: TrackCar[] = Object.entries(state.locations).flatMap(([number, [x, y]]) => {
    const driver = state.drivers[Number(number)];
    // Cars in the garage report 0,0.
    if (!driver || (x === 0 && y === 0)) return [];
    return [
      {
        number: driver.number,
        code: driver.code,
        colour: teamColour(driver.colour),
        x,
        y,
        highlight: driver.number === selectedNumber,
      },
    ];
  });

  const speedTrap = rows
    .filter((r) => r.topSpeed != null)
    .sort((a, b) => b.topSpeed! - a.topSpeed!)
    .slice(0, 5);
  const lapCount = Math.max(totalLaps ?? 0, state.lap, 1);
  const weather = state.weather;

  const strip =
    mode === "locked"
      ? { style: "bg-signal-red text-black", title: "Live feed locked", detail: "Add OpenF1 sponsor credentials to .env to stream this session" }
      : mode === "replay"
        ? { style: FLAG_STYLE.CHEQUERED, title: "Session finished", detail: "Final classification" }
        : { style: FLAG_STYLE[state.track.flag], title: `Track status: ${state.track.flag}`, detail: state.track.message };

  return (
    <div className="flex w-full flex-col">
      <div className={`flex items-center justify-between px-2 py-0.5 t-label-caps tracking-wider ${strip.style}`}>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            {mode === "live" && <span className="h-2 w-2 animate-ping rounded-full bg-current" />}
            {strip.title}
          </span>
          <span className="opacity-40">|</span>
          <span>{strip.detail}</span>
          {mode === "live" && (
            <>
              <span className="opacity-40">|</span>
              <span>Feed: {feed}</span>
            </>
          )}
        </div>
        <span className="hidden font-mono text-xs sm:inline">UTC {now == null ? "--:--:--" : clock(new Date(now).toISOString())}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-container-low px-2 py-0.5">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="t-headline-md leading-none tracking-tight uppercase">
              {meeting?.meeting_official_name ?? `${session.country_name} ${session.year}`}
            </span>
            <span className="t-label-micro tracking-widest text-on-surface-variant">
              {session.circuit_short_name} {"//"} {isRace && totalLaps ? `${totalLaps} laps` : session.session_type}
            </span>
          </div>
          <div className="flex items-center gap-0.5 rounded bg-surface-container px-2 py-0.5">
            <span className="t-label-caps text-on-surface-variant">Session:</span>
            <span className="t-telemetry-cell font-bold text-primary uppercase">{session.session_name}</span>
          </div>
          {isRace && state.lap > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-surface-container px-2 py-0.5">
              {mode === "live" && <LiveDot />}
              <span className="t-label-micro text-on-surface-variant">Lap</span>
              <span className="t-telemetry-cell font-bold">
                {state.lap}
                {totalLaps ? `/${totalLaps}` : ""}
              </span>
            </div>
          )}
        </div>
        {weather && (
          <div className="flex flex-wrap items-center gap-4 rounded bg-surface-container-lowest px-2 py-1">
            <Readout label="Air" value={`${weather.air.toFixed(1)}°C`} />
            <Readout label="Track" value={`${weather.track.toFixed(1)}°C`} className="text-tertiary-container" />
            <Readout label="Hum" value={`${Math.round(weather.humidity)}%`} />
            <Readout label="Wind" value={`${weather.windSpeed.toFixed(1)} m/s ${compassPoint(weather.windDirection)}`} />
            <Readout label="Pressure" value={`${Math.round(weather.pressure)} hPa`} />
            <Readout
              label="Rain"
              value={weather.rainfall ? "YES" : "NO"}
              className={weather.rainfall ? "text-secondary" : "text-primary"}
            />
          </div>
        )}
      </div>

      <Kerb />

      <div className="grid grid-cols-1 gap-0.5 p-0.5 xl:grid-cols-12">
        {/* Timing tower */}
        <div className="flex flex-col overflow-hidden rounded bg-surface-container-low xl:col-span-4">
          <div className="flex items-center justify-between bg-surface-container px-2 py-0.5">
            <div className="flex items-center gap-0.5">
              <Icon name="format_list_numbered" className="text-[16px] text-primary" />
              <span className="t-label-caps tracking-wider">Timing tower {"//"} classification</span>
            </div>
            <div className="flex items-center gap-1 t-label-micro">
              {(["last", "best"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setLapMode(m)}
                  aria-pressed={lapMode === m}
                  className={`rounded px-1.5 py-0.5 ${
                    lapMode === m
                      ? "bg-surface-container-high font-bold text-primary"
                      : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {m} lap
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-12 bg-surface-container-lowest px-2 py-1 t-label-micro tracking-wider text-on-surface-variant">
            <span className="col-span-1 text-center">Pos</span>
            <span className="col-span-3">Driver</span>
            <span className="col-span-2 text-right">Gap</span>
            <span className="col-span-2 text-right">Int</span>
            <span className="col-span-2 text-right">{lapMode}</span>
            <span className="col-span-1 text-center">Tyre</span>
            <span className="col-span-1 text-center">Pit</span>
          </div>
          <div className="flex max-h-[720px] flex-col divide-y divide-surface-container-high/40 overflow-y-auto">
            {rows.map((r, i) => {
              const driver = state.drivers[r.driver];
              const stint = currentStint(state.stints[r.driver]);
              const lap = lapMode === "last" ? r.lastLap : r.bestLap;
              const isSelected = r.driver === selectedNumber;
              return (
                <button
                  key={r.driver}
                  onClick={() => setSelected(r.driver)}
                  aria-pressed={isSelected}
                  className={`grid grid-cols-12 items-center px-2 py-1 text-left t-telemetry-cell hover:bg-surface-container-high/50 ${
                    isSelected ? "bg-primary/10" : i % 2 ? "bg-surface-container-lowest" : "bg-surface-container-low"
                  }`}
                >
                  <div className={`col-span-1 text-center t-headline-md italic ${isSelected ? "text-primary" : ""}`}>
                    {r.position ?? "–"}
                  </div>
                  <div className="col-span-3 flex items-center gap-1.5">
                    <TeamBar colour={teamColour(driver?.colour)} />
                    <span className="font-bold tracking-tight">{driver?.code ?? r.driver}</span>
                    <span className="t-label-micro text-on-surface-variant">{teamCode(driver?.team)}</span>
                  </div>
                  {r.out ? (
                    <div className="col-span-4 text-right font-bold text-error">{r.out}</div>
                  ) : (
                    <>
                      <div className="col-span-2 text-right">
                        {r.position === 1 ? <span className="t-label-caps text-primary">Leader</span> : formatGap(r.gap) || "–"}
                      </div>
                      <div className="col-span-2 text-right">{r.position === 1 ? "–" : formatGap(r.interval) || "–"}</div>
                    </>
                  )}
                  <div className={`col-span-2 text-right ${lapColour(lap, r, state.best.lap)}`}>{formatLap(lap)}</div>
                  <div className="col-span-1 flex items-center justify-center">
                    {stint ? <TyreBadge name={stint.compound} age={stint.age} /> : "–"}
                  </div>
                  <div className="col-span-1 text-center t-label-micro text-on-surface-variant">{r.pitLaps.length}</div>
                </button>
              );
            })}
            {!rows.length && (
              <p className="p-4 t-body-sm text-on-surface-variant">No timing data for this session yet.</p>
            )}
          </div>
        </div>

        {/* Track map */}
        <div className="relative flex flex-col overflow-hidden rounded bg-surface-container-lowest xl:col-span-5">
          <div className="flex items-center justify-between bg-surface-container-low/80 px-2 py-0.5">
            <span className="t-label-caps tracking-wider">{session.circuit_short_name} track map</span>
            <span
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 t-label-micro ${
                cars.length ? "bg-primary/20 text-primary" : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {cars.length > 0 && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
              {cars.length ? "Live car positions" : "Car positions show during live sessions"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-0.5 bg-surface-container-low px-2 py-0.5 text-[11px]">
            {[0, 1, 2].map((i) => {
              const holder = state.best.sectorDrivers[i];
              return (
                <div key={i} className="flex items-center justify-between rounded bg-surface-container px-2 py-1">
                  <span className="t-label-micro text-on-surface-variant">Best S{i + 1}</span>
                  <span className="t-telemetry-cell text-timing-purple">
                    {formatLap(state.best.sectors[i])}{" "}
                    <span className="text-on-surface-variant">{holder != null ? state.drivers[holder]?.code : ""}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="relative flex h-[540px] w-full items-center justify-center overflow-hidden p-2">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(#e3e2e61a_1px,transparent_1px),linear-gradient(90deg,#e3e2e61a_1px,transparent_1px)] [background-size:40px_40px] opacity-40" />
            {outline ? (
              <TrackMap outline={outline} cars={cars} className="relative h-full max-h-[500px] w-full" />
            ) : (
              <span className="relative t-label-caps text-on-surface-variant">Circuit outline not available yet</span>
            )}
            {weather && (
              <div className="absolute top-3 right-3 flex items-center gap-2 rounded bg-surface-container/90 px-2.5 py-1.5">
                <Icon name="navigation" className="text-[18px] text-primary" />
                <div className="flex flex-col">
                  <span className="t-label-micro text-on-surface-variant">Wind</span>
                  <span className="t-telemetry-cell font-bold">
                    {weather.windSpeed.toFixed(1)} m/s {compassPoint(weather.windDirection)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 bg-surface-container-high px-2 py-1 t-label-micro text-on-surface-variant">
            <span className="font-bold text-on-surface">Speed trap:</span>
            {speedTrap.map((r, i) => (
              <span key={r.driver}>
                {i + 1}. {state.drivers[r.driver]?.code ?? r.driver} {r.topSpeed}
              </span>
            ))}
            {!speedTrap.length && <span>No speeds recorded</span>}
          </div>
        </div>

        {/* Selected car, race control, radio */}
        <div className="flex flex-col gap-0.5 xl:col-span-3">
          <div className="flex flex-col overflow-hidden rounded bg-surface-container">
            <div className="flex items-center justify-between bg-surface-container-high px-2 py-0.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${telemetry ? "animate-pulse bg-primary" : "bg-surface-bright"}`} />
                <span className="t-label-caps">
                  Car #{selectedNumber ?? "–"} {"//"} {selectedDriver?.name ?? "No car selected"}
                </span>
              </div>
              {selectedDriver && (
                <span
                  className="rounded px-1.5 py-0.5 t-label-micro font-bold text-black"
                  style={{ backgroundColor: teamColour(selectedDriver.colour) }}
                >
                  {selectedDriver.team}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 bg-surface-container-lowest p-2">
              {telemetry ? (
                <>
                  <div className="flex w-full items-center justify-between gap-1 p-1">
                    {Array.from({ length: 15 }, (_, i) => {
                      const on = telemetry.rpm / MAX_RPM > i / 15;
                      const colour = i < 5 ? "bg-[#2ee66b]" : i < 10 ? "bg-[#e80020]" : "bg-[#6692ff]";
                      return (
                        <span key={i} className={`h-2 w-full rounded-xs ${on ? colour : "bg-surface-container-highest"}`} />
                      );
                    })}
                  </div>
                  <div className="flex items-end justify-between px-0.5">
                    <div className="flex flex-col">
                      <span className="t-label-micro text-on-surface-variant">Speed</span>
                      <div className="flex items-baseline gap-1">
                        <span className="t-headline-xl leading-none tracking-tighter">{telemetry.speed}</span>
                        <span className="font-mono text-xs font-bold text-primary">KM/H</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="t-label-micro text-on-surface-variant">Gear</span>
                      <span className="t-headline-xl leading-none text-primary">{telemetry.gear || "N"}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="t-label-micro text-on-surface-variant">Engine RPM</span>
                      <span className="t-telemetry-display leading-none">{telemetry.rpm.toLocaleString("en-US")}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pt-0.5">
                    {[
                      { label: "Throttle", value: telemetry.throttle, bar: "bg-primary-container", text: "text-primary" },
                      { label: "Brake", value: telemetry.brake, bar: "bg-signal-red", text: "text-error" },
                    ].map((meter) => (
                      <div key={meter.label} className="flex flex-col gap-1">
                        <span className={`t-label-micro font-bold ${meter.text}`}>
                          {meter.label} ({Math.round(meter.value)}%)
                        </span>
                        <div className="flex h-3 w-full overflow-hidden rounded-xs bg-surface-container-high">
                          <div className={`h-full ${meter.bar}`} style={{ width: `${Math.min(100, meter.value)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="t-label-micro text-on-surface-variant">
                  Speed, gear and pedal traces stream here during live sessions. Session figures for this car:
                </p>
              )}
              <div className="grid grid-cols-3 gap-0.5 pt-1">
                {[
                  { label: "Best lap", value: formatLap(selectedRow?.bestLap), purple: selectedRow?.bestLap === state.best.lap },
                  { label: "Last lap", value: formatLap(selectedRow?.lastLap) },
                  { label: "Top speed", value: selectedRow?.topSpeed != null ? `${selectedRow.topSpeed}` : "–" },
                  ...[0, 1, 2].map((i) => ({
                    label: `Best S${i + 1}`,
                    value: formatLap(selectedRow?.bestSectors[i]),
                    purple: selectedRow?.bestSectors[i] != null && selectedRow.bestSectors[i] === state.best.sectors[i],
                  })),
                ].map((cell) => (
                  <div key={cell.label} className="flex flex-col items-center justify-center rounded bg-surface-container p-1">
                    <span className="t-label-micro text-on-surface-variant">{cell.label}</span>
                    <span className={`t-telemetry-cell font-bold ${"purple" in cell && cell.purple ? "text-timing-purple" : ""}`}>
                      {cell.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded bg-surface-container">
            <PanelHeader icon="flag" title="Race control" note={`${state.raceControl.length} messages`} />
            <div className="flex max-h-64 flex-col divide-y divide-surface-container-high overflow-y-auto bg-surface-container-lowest p-0.5">
              {state.raceControl.map((msg) => {
                const tag = msg.flag ?? msg.category;
                const style =
                  msg.flag === "GREEN" || msg.flag === "CLEAR"
                    ? "bg-primary/20 text-primary"
                    : msg.flag?.includes("YELLOW") || msg.category === "SafetyCar"
                      ? "bg-timing-yellow/20 text-timing-yellow"
                      : msg.flag === "RED" || msg.flag === "BLACK AND WHITE"
                        ? "bg-error-container text-error"
                        : msg.flag === "BLUE"
                          ? "bg-[#6692ff]/20 text-[#6692ff]"
                          : "bg-surface-container-high text-on-surface-variant";
                return (
                  <div key={msg.date + msg.message} className="flex items-start gap-2 px-1 py-1">
                    <span className="mt-0.5 t-label-micro text-on-surface-variant">{clock(msg.date)}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1 font-mono text-[9px] font-bold uppercase ${style}`}>{tag}</span>
                      <span className="font-mono text-[11px] font-semibold">{msg.message}</span>
                    </div>
                  </div>
                );
              })}
              {!state.raceControl.length && <p className="p-2 t-body-sm text-on-surface-variant">No messages.</p>}
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded bg-surface-container">
            <PanelHeader icon="headset_mic" title="Team radio" note="Audio clips" />
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto bg-surface-container-lowest p-0.5">
              {state.radio.map((msg) => {
                const driver = state.drivers[msg.driver];
                const active = playing === msg.url;
                return (
                  <div key={msg.url} className="flex items-center justify-between rounded bg-surface-container p-1.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleRadio(msg.url)}
                        aria-label={`${active ? "Stop" : "Play"} radio from ${driver?.name ?? msg.driver}`}
                        className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                          active
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container-high hover:bg-primary hover:text-on-primary"
                        }`}
                      >
                        <Icon name={active ? "pause" : "play_arrow"} className="text-[14px]" />
                      </button>
                      <span className="t-label-caps" style={{ color: teamColour(driver?.colour) }}>
                        {driver?.code ?? msg.driver}
                      </span>
                      <span className="t-label-micro text-on-surface-variant">{driver?.team}</span>
                    </div>
                    <span className="t-label-micro text-on-surface-variant">{clock(msg.date)}</span>
                  </div>
                );
              })}
              {!state.radio.length && <p className="p-2 t-body-sm text-on-surface-variant">No radio clips.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Tyre stints */}
      <div className="m-0.5 flex flex-col rounded bg-surface-container-low p-2">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <span className="t-label-caps tracking-wider">
            Tyre stints {isRace ? `// lap ${state.lap}${totalLaps ? ` of ${totalLaps}` : ""}` : "// by run"}
          </span>
          <div className="flex items-center gap-2 t-label-micro">
            {["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].map((name) => (
              <span key={name} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: compound(name).colour }} />
                {name}
              </span>
            ))}
          </div>
        </div>
        <div className="w-full overflow-x-auto">
          <div className="flex min-w-[700px] flex-col gap-1">
            <div className="grid grid-cols-12 border-b border-surface-container-high pb-1 t-label-micro text-on-surface-variant">
              <span className="col-span-1">Drv</span>
              <span className="col-span-11 flex justify-between px-1">
                {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                  <span key={f}>L{Math.round(f * lapCount)}</span>
                ))}
              </span>
            </div>
            {rows.map((r) => (
              <div key={r.driver} className="grid grid-cols-12 items-center py-0.5 font-mono text-xs font-semibold">
                <span className="col-span-1">
                  {r.position ?? "–"}. {state.drivers[r.driver]?.code ?? r.driver}
                </span>
                <div className="relative col-span-11 flex h-5 items-center overflow-hidden rounded bg-surface-container-lowest px-0.5">
                  {(state.stints[r.driver] ?? []).map((stint) => {
                    const laps = stint.lapEnd - stint.lapStart + 1;
                    const tyre = compound(stint.compound);
                    return (
                      <div
                        key={stint.number}
                        title={`${stint.compound ?? "Unknown"}: laps ${stint.lapStart}–${stint.lapEnd}`}
                        className="flex h-3.5 items-center justify-center overflow-hidden border-r-2 border-surface-container-lowest text-[9px] font-bold text-black first:rounded-l last:rounded-r"
                        style={{ width: `${(laps / lapCount) * 100}%`, backgroundColor: tyre.colour }}
                      >
                        {tyre.letter} ({laps}L)
                      </div>
                    );
                  })}
                  {mode === "live" && isRace && (
                    <div
                      className="absolute top-0 bottom-0 z-20 w-0.5 bg-primary"
                      style={{ left: `${(state.lap / lapCount) * 100}%` }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
