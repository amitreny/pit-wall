import "server-only";
import { getAccessToken, hasCredentials } from "./auth";
import type { Endpoint, EndpointMap } from "./types";

const BASE_URL = "https://api.openf1.org/v1";

// OpenF1 limits: free 3 req/s + 30 req/min, sponsor 6 req/s + 60 req/min.
// Stay one under the per-minute limit to leave room for clock skew.
const LIMITS = hasCredentials()
  ? { minGapMs: 1000 / 6, perMinute: 59 }
  : { minGapMs: 1000 / 3, perMinute: 29 };

export const TTL = {
  /** Finished sessions and past seasons never change. */
  STATIC: 24 * 60 * 60 * 1000,
  /** Season-wide data that only changes when a session finishes. */
  SLOW: 10 * 60 * 1000,
  /** Schedules and data for sessions that have not finished. */
  DEFAULT: 60 * 1000,
  /** Anything read while a session is running. */
  LIVE: 4 * 1000,
} as const;

export class OpenF1Error extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A value, or a comparison such as `{ op: ">=", value: 3 }` → `?field>=3`. */
export type Filter =
  | string
  | number
  | boolean
  | { op: ">" | "<" | ">=" | "<="; value: string | number };

export type Query = Record<string, Filter | Filter[] | undefined>;

function buildUrl(endpoint: string, query: Query): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined) continue;
    for (const f of Array.isArray(raw) ? raw : [raw]) {
      const [op, value] = typeof f === "object" ? [f.op, f.value] : ["=", f];
      parts.push(`${encodeURIComponent(key)}${op}${encodeURIComponent(String(value))}`);
    }
  }
  parts.sort();
  return `${BASE_URL}/${endpoint}${parts.length ? `?${parts.join("&")}` : ""}`;
}

// --- throttle: requests run one at a time, spaced to respect both limits ---

const sent: number[] = [];
let queue: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] >= 60_000) sent.shift();
    const last = sent[sent.length - 1];
    const gapWait = last === undefined ? 0 : last + LIMITS.minGapMs - now;
    const minuteWait = sent.length >= LIMITS.perMinute ? sent[0] + 60_000 - now : 0;
    const wait = Math.max(gapWait, minuteWait);
    if (wait <= 0) break;
    await sleep(wait);
  }
  sent.push(Date.now());
}

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(waitForSlot).then(task);
  queue = run.catch(() => {});
  return run;
}

// --- cache: in-process, keyed by full URL; concurrent callers share a request ---

const MAX_ENTRIES = 500;
const cache = new Map<string, { expiresAt: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function request(url: string): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  // The API answers 404 with {"detail":"No results found."} for empty result sets.
  if (res.status === 404) return [];
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OpenF1Error(res.status, `OpenF1 ${res.status} for ${url}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

export async function openf1<E extends Endpoint>(
  endpoint: E,
  query: Query = {},
  ttl: number = TTL.DEFAULT,
): Promise<EndpointMap[E][]> {
  const url = buildUrl(endpoint, query);

  const hit = cache.get(url);
  if (hit && hit.expiresAt > Date.now()) return hit.data as EndpointMap[E][];

  let promise = inflight.get(url);
  if (!promise) {
    promise = throttled(() => request(url))
      .then((data) => {
        if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
        cache.delete(url);
        cache.set(url, { expiresAt: Date.now() + ttl, data });
        return data;
      })
      .catch((err) => {
        // Without sponsor credentials the API is locked while a session is live;
        // keep serving the last good copy instead of failing the page.
        if (hit) return hit.data;
        throw err;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, promise);
  }
  return promise as Promise<EndpointMap[E][]>;
}

/** Like `openf1`, but resolves to an empty list when the API is unreachable or locked. */
export async function openf1Safe<E extends Endpoint>(
  endpoint: E,
  query: Query = {},
  ttl: number = TTL.DEFAULT,
): Promise<EndpointMap[E][]> {
  try {
    return await openf1(endpoint, query, ttl);
  } catch (err) {
    console.warn(`[openf1] ${endpoint} unavailable:`, err instanceof Error ? err.message : err);
    return [];
  }
}
