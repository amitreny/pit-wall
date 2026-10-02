import "server-only";
import { EventEmitter } from "node:events";
import mqtt, { type MqttClient } from "mqtt";
import { getAccessToken, hasCredentials } from "../openf1/auth";

// One MQTT connection to OpenF1 for the whole server process, fanned out to
// every browser over Server-Sent Events. The sponsor tier allows 10 concurrent
// connections, so browsers must never connect to the broker themselves.

const BROKER_URL = "mqtts://mqtt.openf1.org:8883";
const TOKEN_REFRESH_MS = 50 * 60 * 1000;

/** car_data and location are high-rate; the stream route batches or filters them per browser. */
export const LIVE_TOPICS = [
  "v1/location",
  "v1/car_data",
  "v1/sessions",
  "v1/drivers",
  "v1/position",
  "v1/intervals",
  "v1/laps",
  "v1/stints",
  "v1/pit",
  "v1/race_control",
  "v1/weather",
  "v1/overtakes",
  "v1/team_radio",
] as const;

export interface LiveMessage {
  /** Endpoint name, e.g. "position". */
  topic: string;
  data: Record<string, unknown>;
}

export type LiveStatus = "disabled" | "connecting" | "connected" | "error";

interface Hub {
  emitter: EventEmitter;
  client: MqttClient | null;
  status: LiveStatus;
  starting: Promise<void> | null;
}

// Kept on globalThis so dev hot reloads reuse the connection instead of leaking one.
const globalHub = globalThis as typeof globalThis & { __openf1Hub?: Hub };
const hub: Hub = (globalHub.__openf1Hub ??= {
  emitter: new EventEmitter().setMaxListeners(0),
  client: null,
  status: hasCredentials() ? "connecting" : "disabled",
  starting: null,
});

function setStatus(status: LiveStatus) {
  hub.status = status;
  hub.emitter.emit("status", status);
}

async function start(): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;

  const client = mqtt.connect(BROKER_URL, {
    // Any non-empty username; the access token is the password.
    username: "openf1",
    password: token,
    reconnectPeriod: 5000,
  });
  hub.client = client;

  // Tokens expire after an hour; keep a fresh one ready for the next reconnect.
  const refresh = setInterval(async () => {
    try {
      const next = await getAccessToken();
      if (next) client.options.password = next;
    } catch (err) {
      console.error("[live] token refresh failed", err);
    }
  }, TOKEN_REFRESH_MS);
  refresh.unref();

  client.on("connect", () => {
    client.subscribe([...LIVE_TOPICS], (err) => {
      if (err) console.error("[live] subscribe failed", err);
    });
    setStatus("connected");
  });
  client.on("reconnect", () => setStatus("connecting"));
  client.on("error", (err) => {
    console.error("[live] mqtt error", err.message);
    setStatus("error");
  });
  client.on("message", (topic, payload) => {
    try {
      const message: LiveMessage = {
        topic: topic.replace(/^v1\//, ""),
        data: JSON.parse(payload.toString()),
      };
      hub.emitter.emit("message", message);
    } catch {
      // Ignore payloads that are not JSON.
    }
  });
}

export function getLiveStatus(): LiveStatus {
  return hub.status;
}

/** Subscribes to live messages; connects to the broker on first use. Returns an unsubscribe function. */
export function subscribeLive(handlers: {
  onMessage: (message: LiveMessage) => void;
  onStatus: (status: LiveStatus) => void;
}): () => void {
  if (hasCredentials() && !hub.client) {
    hub.starting ??= start().catch((err) => {
      console.error("[live] failed to start", err);
      hub.starting = null;
      setStatus("error");
    });
  }
  hub.emitter.on("message", handlers.onMessage);
  hub.emitter.on("status", handlers.onStatus);
  return () => {
    hub.emitter.off("message", handlers.onMessage);
    hub.emitter.off("status", handlers.onStatus);
  };
}
