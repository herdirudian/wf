import { EventEmitter } from "events";

class KavlingEventEmitter extends EventEmitter {}

// Global singleton for the event emitter
const globalBus = global as unknown as { kavlingBus?: KavlingEventEmitter };
if (!globalBus.kavlingBus) {
  globalBus.kavlingBus = new KavlingEventEmitter();
  // Increase max listeners since many clients might connect
  globalBus.kavlingBus.setMaxListeners(1000);
}

export const kavlingBus = globalBus.kavlingBus;

export const KAVLING_EVENTS = {
  UPDATED: "kavling_updated",
};

export function notifyKavlingUpdated() {
  kavlingBus.emit(KAVLING_EVENTS.UPDATED, { timestamp: Date.now() });
}
