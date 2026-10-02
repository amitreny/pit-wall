import "server-only";

// OAuth2 token for the OpenF1 sponsor tier (needed for live data and MQTT).
// Credentials stay on the server; the token lasts one hour.

const TOKEN_URL = "https://api.openf1.org/token";
const REFRESH_MARGIN_MS = 60_000;

let cached: { token: string; expiresAt: number } | null = null;
let pending: Promise<string> | null = null;

export function hasCredentials(): boolean {
  return Boolean(process.env.OPENF1_USERNAME && process.env.OPENF1_PASSWORD);
}

async function requestToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: process.env.OPENF1_USERNAME!,
      password: process.env.OPENF1_PASSWORD!,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OpenF1 token request failed: ${res.status}`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number | string };
  cached = {
    token: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in) * 1000 - REFRESH_MARGIN_MS,
  };
  return cached.token;
}

/** Returns a valid access token, or null when no credentials are configured. */
export async function getAccessToken(): Promise<string | null> {
  if (!hasCredentials()) return null;
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  pending ??= requestToken().finally(() => {
    pending = null;
  });
  return pending;
}
