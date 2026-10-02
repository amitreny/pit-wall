import { compound } from "@/lib/format";

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}

export function Kerb({ className = "" }: { className?: string }) {
  return <div className={`kerb-pattern h-1 w-full ${className}`} />;
}

/** Vertical bar in the team's colour, the marker for a driver or team everywhere. */
export function TeamBar({ colour, className = "h-4 w-1" }: { colour: string; className?: string }) {
  return <span className={`shrink-0 rounded-xs ${className}`} style={{ backgroundColor: colour }} />;
}

export function TyreBadge({ name, age }: { name: string | null | undefined; age?: number | null }) {
  const { letter, colour } = compound(name);
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-bold" title={name ?? "Unknown"}>
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full border-2 bg-surface-container-lowest"
        style={{ borderColor: colour, color: colour }}
      >
        {letter}
      </span>
      {age != null && <span className="text-[8px] text-on-surface-variant">{age}</span>}
    </span>
  );
}

export function LiveDot({ className = "bg-signal-red" }: { className?: string }) {
  return <span className={`h-2 w-2 animate-pulse rounded-full ${className}`} />;
}
