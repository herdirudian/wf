import { EventEmitter } from "events";
import { prisma } from "./prisma";

class KavlingEventEmitter extends EventEmitter {}

// Global singleton for the event emitter
const globalBus = global as unknown as { kavlingBus?: KavlingEventEmitter; kavlingPollStarted?: boolean };
if (!globalBus.kavlingBus) {
  globalBus.kavlingBus = new KavlingEventEmitter();
  globalBus.kavlingBus.setMaxListeners(1000);
}

export const kavlingBus = globalBus.kavlingBus;

export const KAVLING_EVENTS = {
  UPDATED: "kavling_updated",
};

let lastSignalValue = "";

// Cross-process synchronization using DB polling
if (!globalBus.kavlingPollStarted && typeof window === "undefined") {
  globalBus.kavlingPollStarted = true;
  
  setInterval(async () => {
    try {
      const signal = await prisma.realtimeSignal.findUnique({
        where: { name: "kavling_update" },
        select: { value: true }
      });
      
      if (signal && signal.value !== lastSignalValue) {
        lastSignalValue = signal.value;
        kavlingBus.emit(KAVLING_EVENTS.UPDATED, { timestamp: Date.now(), source: "db" });
      }
    } catch (e) {
      // Ignore DB errors during poll
    }
  }, 1500); // Check every 1.5s
}

export async function notifyKavlingUpdated() {
  const newValue = Date.now().toString();
  lastSignalValue = newValue;
  
  try {
    await prisma.realtimeSignal.upsert({
      where: { name: "kavling_update" },
      create: { name: "kavling_update", value: newValue },
      update: { value: newValue }
    });
  } catch (e) {
    console.error("Failed to update realtime signal in DB", e);
  }
  
  // Local emit for current process
  kavlingBus.emit(KAVLING_EVENTS.UPDATED, { timestamp: Date.now(), source: "local" });
}
