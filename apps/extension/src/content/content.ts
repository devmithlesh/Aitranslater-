/**
 * Content script entry (built as a single classic IIFE). Runs once per frame:
 * a window flag stops a second copy from starting if the script is injected twice.
 */
import { startContentRuntime } from './runtime';

const GUARD_KEY = '__verbaContentLoaded';

const scope = window as unknown as Record<string, unknown>;
if (!scope[GUARD_KEY]) {
  scope[GUARD_KEY] = true;
  startContentRuntime();
}
