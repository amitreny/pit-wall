import { getLiveStatus, subscribeLive } from "@/lib/live/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;
const LOCATION_FLUSH_MS = 500;

// Server-Sent Events stream of live timing messages.
//   event: status     data: "disabled" | "connecting" | "connected" | "error"
//   event: <topic>    data: the OpenF1 message for that endpoint (position, intervals, ...)
//   event: locations  data: { "<driver number>": [x, y], ... } — car positions, batched twice a second
// Query: ?topics=position,intervals narrows the stream (default: everything except car_data);
//        ?driver=44 adds that car's telemetry (car_data).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const wanted = params.get("topics")?.split(",").filter(Boolean);
  const telemetryDriver = params.has("driver") ? Number(params.get("driver")) : null;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream already closed; the abort handler cleans up.
        }
      };
      const wants = (topic: string) => !wanted || wanted.includes(topic);

      let locations: Record<number, [number, number]> = {};
      let sessionKey: unknown;
      let dirty = false;

      send("status", getLiveStatus());
      const unsubscribe = subscribeLive({
        onMessage: ({ topic, data }) => {
          if (topic === "location") {
            if (!wants("locations")) return;
            locations[data.driver_number as number] = [data.x as number, data.y as number];
            sessionKey = data.session_key;
            dirty = true;
          } else if (topic === "car_data") {
            if (data.driver_number === telemetryDriver) send(topic, data);
          } else if (wants(topic)) {
            send(topic, data);
          }
        },
        onStatus: (status) => send("status", status),
      });

      const flush = setInterval(() => {
        if (!dirty) return;
        send("locations", { ...locations, session_key: sessionKey });
        locations = {};
        dirty = false;
      }, LOCATION_FLUSH_MS);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {}
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        clearInterval(flush);
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
