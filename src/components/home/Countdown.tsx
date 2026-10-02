"use client";

import { useNow } from "@/lib/useNow";

const pad = (n: number) => String(n).padStart(2, "0");

// One more light comes on as the session gets closer, like the start sequence.
const LIGHT_THRESHOLDS_H = [72, 24, 12, 3, 1];

/** Start-light gantry plus days/hours/minutes/seconds to `target`. */
export function Countdown({ target }: { target: string }) {
  const now = useNow();
  const remaining = now == null ? null : Math.max(0, Date.parse(target) - now);
  const seconds = remaining == null ? null : Math.floor(remaining / 1000);
  const lit = remaining == null ? 0 : LIGHT_THRESHOLDS_H.filter((h) => remaining <= h * 3_600_000).length;

  const units = [
    { label: "Days", value: seconds == null ? null : Math.floor(seconds / 86400), className: "text-on-surface" },
    { label: "Hours", value: seconds == null ? null : Math.floor((seconds % 86400) / 3600), className: "text-on-surface" },
    { label: "Mins", value: seconds == null ? null : Math.floor((seconds % 3600) / 60), className: "text-primary" },
    { label: "Secs", value: seconds == null ? null : seconds % 60, className: "text-error" },
  ];

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-1 rounded bg-surface-container px-2 py-1">
        <div className="hidden t-label-micro tracking-widest text-on-surface-variant sm:block">Start gantry</div>
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1 rounded bg-surface-container-lowest px-2 py-1.5">
              <span
                className={`h-3.5 w-3.5 rounded-full ${
                  i < lit ? "bg-signal-red shadow-[0_0_8px_rgba(255,45,45,0.8)]" : "bg-surface-container-high"
                }`}
              />
              <span className="h-3.5 w-3.5 rounded-full bg-surface-container-high" />
            </div>
          ))}
        </div>
        <div className="rounded bg-surface-container-lowest px-1 py-0.5 t-label-caps text-error">
          {lit === 5 ? "5 lights" : `${lit} / 5 lights`}
        </div>
      </div>
      <div className="my-1 grid grid-cols-4 gap-0.5 text-center">
        {units.map((unit) => (
          <div key={unit.label} className="flex flex-col justify-center rounded bg-surface-container p-1">
            <span className={`t-telemetry-display lg:text-[2.5rem] lg:leading-[2.75rem] ${unit.className}`}>
              {unit.value == null ? "--" : pad(unit.value)}
            </span>
            <span className="mt-1 t-label-micro tracking-widest text-on-surface-variant">{unit.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Time left in a running session, with a progress bar. */
export function SessionClock({ start, end }: { start: string; end: string }) {
  const now = useNow();
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const left = now == null ? null : Math.max(0, Math.floor((endMs - now) / 1000));
  const progress = now == null ? 0 : Math.min(1, Math.max(0, (now - startMs) / (endMs - startMs)));
  const waiting = now != null && now < startMs;

  return (
    <div className="mt-1 rounded bg-surface-container-lowest p-1">
      <div className="flex items-center justify-between">
        <span className="t-label-micro text-on-surface-variant">{waiting ? "Starts in" : "Time remaining"}</span>
        <span className="t-telemetry-display text-error">
          {now == null
            ? "--:--"
            : waiting
              ? `${pad(Math.floor((startMs - now) / 60000))}:${pad(Math.floor(((startMs - now) % 60000) / 1000))}`
              : `${pad(Math.floor(left! / 60))}:${pad(left! % 60)}`}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div className="h-full bg-signal-red" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
