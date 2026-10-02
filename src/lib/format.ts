// Display helpers shared by server and client components.

/** 93.412 → "1:33.412", 27.81 → "27.810". */
export function formatLap(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "–";
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s.replace(/^0/, "");
}

/** 5882.143 → "1:38:02.143" (race durations). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "–";
  if (seconds < 3600) return formatLap(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds - h * 3600) / 60);
  const s = (seconds - h * 3600 - m * 60).toFixed(3).padStart(6, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

/** 2.184 → "+2.184", 63.45 → "+1:03.450", "+1 LAP" stays as is. */
export function formatGap(gap: number | string | null | undefined): string {
  if (gap == null || gap === 0) return "";
  if (typeof gap === "string") return gap.toUpperCase();
  return `+${formatLap(gap)}`;
}

/** OpenF1 returns one value per qualifying segment for qualifying sessions; take the last set one. */
export function lastValue<T>(value: T | (T | null)[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) if (value[i] != null) return value[i];
    return null;
  }
  return value ?? null;
}

const TEAM_CODES: Record<string, string> = {
  McLaren: "MCL",
  "Red Bull Racing": "RBR",
  "Racing Bulls": "RB",
  "Aston Martin": "AMR",
  "Haas F1 Team": "HAA",
  "Kick Sauber": "SAU",
};

export function teamCode(team: string | null | undefined): string {
  if (!team) return "";
  return TEAM_CODES[team] ?? team.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

export function teamColour(hex: string | null | undefined): string {
  return hex ? `#${hex.replace(/^#/, "")}` : "#859583";
}

export const COMPOUNDS: Record<string, { letter: string; colour: string }> = {
  SOFT: { letter: "S", colour: "#ff2d2d" },
  MEDIUM: { letter: "M", colour: "#e6b800" },
  HARD: { letter: "H", colour: "#eaeaea" },
  INTERMEDIATE: { letter: "I", colour: "#39b54a" },
  WET: { letter: "W", colour: "#00a3e0" },
};

export function compound(name: string | null | undefined): { letter: string; colour: string } {
  return COMPOUNDS[name?.toUpperCase() ?? ""] ?? { letter: "?", colour: "#859583" };
}

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function compassPoint(degrees: number): string {
  return POINTS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Formats an instant in the circuit's local time using OpenF1's gmt_offset ("08:00:00", "-05:00:00"). */
export function circuitTime(iso: string, gmtOffset: string): { day: string; time: string } {
  const sign = gmtOffset.startsWith("-") ? -1 : 1;
  const [h, m] = gmtOffset.replace(/^[+-]/, "").split(":").map(Number);
  const local = new Date(Date.parse(iso) + sign * (h * 60 + (m || 0)) * 60_000);
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  return { day: DAYS[local.getUTCDay()], time: `${hh}:${mm}` };
}

/** "08:00:00" → "UTC+8", "-05:00:00" → "UTC-5", "05:30:00" → "UTC+5:30". */
export function utcOffsetLabel(gmtOffset: string): string {
  const sign = gmtOffset.startsWith("-") ? "-" : "+";
  const [h, m] = gmtOffset.replace(/^[+-]/, "").split(":").map(Number);
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}
