import type { ExtensionError } from '../shared/messages';

export type ErrorAction =
  | { kind: 'options'; label: string }
  | { kind: 'dashboard'; label: string; path: string };

export interface ErrorView {
  message: string;
  hint?: string;
  action?: ErrorAction;
}

/** Maps an ExtensionError code to user-facing copy and the next step. */
export function describeError(error: ExtensionError): ErrorView {
  const fallback = error.message || 'Something went wrong.';
  switch (error.code) {
    case 'NOT_CONNECTED':
      return {
        message: 'Connect Verba to use this.',
        hint: 'Add your server connection in Settings.',
        action: { kind: 'options', label: 'Open settings' },
      };
    case 'NO_PROVIDER_CONFIGURED':
      return {
        message: 'No AI provider is set up yet.',
        hint: 'Add an AI or translation provider in the dashboard.',
        action: { kind: 'dashboard', label: 'Open providers', path: '/settings/providers' },
      };
    case 'PERMISSION_DENIED':
      return {
        message: 'Verba needs permission to reach your server.',
        hint: 'Grant access again in Settings.',
        action: { kind: 'options', label: 'Open settings' },
      };
    case 'NETWORK_ERROR':
      return { message: fallback, hint: 'Check that your Verba server is running.' };
    default:
      return { message: fallback };
  }
}

/** Builds a client-side error for failures that did not come from the background worker. */
export function localError(message: string): ExtensionError {
  return { code: 'INTERNAL', message };
}
