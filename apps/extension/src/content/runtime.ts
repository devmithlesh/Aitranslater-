import { installPageBridge, startFocusTracking } from './focused-field';
import { startLauncher } from './launcher';
import { startStateSync } from './state';

/** Wires state sync, focus tracking, the popup bridge and the webmail button. No selection watcher or shortcuts. */
export function startContentRuntime(): void {
  startStateSync();
  startFocusTracking();
  installPageBridge();
  startLauncher();
}
