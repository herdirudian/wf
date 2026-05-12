import { kavlingBus, KAVLING_EVENTS } from "@/lib/realtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const listener = (data: any) => {
        const chunk = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      kavlingBus.on(KAVLING_EVENTS.UPDATED, listener);

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 30000);

      // Clean up when client disconnects
      // Note: In Next.js App Router, detecting client disconnect can be tricky 
      // but usually the stream closure handles it or we can use a signal if available.
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
    },
  });
}
