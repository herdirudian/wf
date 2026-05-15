import { kavlingBus, KAVLING_EVENTS } from "@/lib/realtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const listener = (data: any) => {
        try {
          const chunk = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch (e) {
          console.error("SSE enqueue error:", e);
        }
      };

      kavlingBus.on(KAVLING_EVENTS.UPDATED, listener);

      // Heartbeat to keep connection alive (Cloudflare timeout is 100s, let's do 15s)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch (e) {
          clearInterval(heartbeat);
          kavlingBus.off(KAVLING_EVENTS.UPDATED, listener);
        }
      }, 15000);

      // Next.js App Router doesn't have a clean way to detect close in Response(stream)
      // but the heartbeat error above will eventually clean up if the stream is closed.
    },
    cancel() {
      // Cleanup is usually handled by individual frameworks/runtimes
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
