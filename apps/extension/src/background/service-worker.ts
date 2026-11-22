/**
 * Verba background service worker (MV3). Stateless between wakes: every value
 * is read from chrome.storage. All listeners are registered synchronously at
 * the top level so events that wake the worker are never missed. The
 * "Explain with Verba" context menu is created on install; it persists across
 * browser restarts, so onStartup does not need to recreate it.
 */
import { handleRequest } from './router';
import { handleExternalRequest } from './external';
import { runScheduledSync } from './sync';
import { handleExplainClick, registerExplainMenu } from './explain-menu';
import { DEFAULT_DASHBOARD_URL } from '../shared/messages';

const SYNC_ALARM = 'verba-sync';
const SYNC_PERIOD_MINUTES = 15;

function ensureAlarm(): void {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void handleRequest(message, sender).then(sendResponse);
  return true;
});

// Website messages (see externally_connectable). Kept apart from handleRequest so web pages never reach the internal API.
chrome.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) => {
  void handleExternalRequest(message, sender).then(sendResponse);
  return true;
});

chrome.contextMenus.onClicked.addListener(handleExplainClick);

chrome.runtime.onInstalled.addListener((details) => {
  // First install only: open the welcome page, so a new user sees what Verba does and how to start.
  if (details.reason === 'install') void chrome.tabs.create({ url: DEFAULT_DASHBOARD_URL }).catch(() => undefined);
  ensureAlarm();
  registerExplainMenu();
  void runScheduledSync();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  void runScheduledSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void runScheduledSync();
});
