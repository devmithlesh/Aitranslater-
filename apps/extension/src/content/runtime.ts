import { installPageBridge, startFocusTracking } from './focused-field';
import { startStateSync } from './state';

/** Wires state sync, focus tracking and the popup bridge. No overlay, selection watcher or shortcuts. */
export function startContentRuntime(): void {
  startStateSync();
  startFocusTracking();
  installPageBridge();
}
