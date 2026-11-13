/**
 * Verba background service worker (MV3). Stateless between wakes: every value
 * is read from chrome.storage. All listeners are registered synchronously at
 * the top level so events that wake the worker are never missed.
 */
import { handleRequest } from './router';
import { runScheduledSync } from './sync';

const SYNC_ALARM = 'verba-sync';
const SYNC_PERIOD_MINUTES = 15;

function ensureAlarm(): void {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void handleRequest(message, sender).then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  void runScheduledSync();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  void runScheduledSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void runScheduledSync();
});
