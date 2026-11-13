import { loadConfig } from './config/env';
import type { AppConfig } from './config/env';
import { loadSecrets } from './config/secrets';
import { createApp } from './app';
import { encodeConnectionCode } from '@verba/shared';
import { createStorage } from './storage';
import type { Storage } from './storage/types';
import { ensureAdminAccount } from './services/auth.service';
import { pruneExpiredHistory } from './services/history.service';

const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SHUTDOWN_TIMEOUT_MS = 5000;

/** Prints a boxed block so the one-time token and connection code are easy to copy. */
function printBox(lines: string[]): void {
  const width = Math.max(...lines.map((line) => line.length)) + 4;
  const border = `+${'-'.repeat(width)}+`;
  console.log(border);
  for (const line of lines) console.log(`|  ${line.padEnd(width - 2)}|`);
  console.log(border);
}

/** Seeds the ADMIN_EMAIL account and drops expired sessions. Logs one line per outcome, never a secret. */
async function bootAccounts(config: AppConfig, storage: Storage): Promise<void> {
  const admin = await ensureAdminAccount(storage, config);
  if (admin.result === 'created') console.log(`Admin account created for ${admin.email}.`);
  if (admin.result === 'promoted') console.log(`Account ${admin.email} was promoted to admin.`);
  if (admin.result === 'missing-password') {
    console.warn(`ADMIN_EMAIL is set but no account exists for it. Set ADMIN_PASSWORD to create the admin.`);
  }
  const expired = await storage.pruneExpiredSessions(new Date().toISOString());
  if (expired > 0) console.log(`Removed ${expired} expired session(s).`);
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const secrets = await loadSecrets(config);
  const storage = createStorage(config);
  await storage.init();
  await bootAccounts(config, storage);

  const app = createApp({
    config,
    storage,
    accessToken: secrets.accessToken,
    encryptionKey: secrets.encryptionKey,
  });

  const localUrl = `http://localhost:${config.port}`;
  const server = app.listen(config.port, config.host, () => {
    console.log(`Verba API listening on http://${config.host}:${config.port} (storage: ${storage.kind})`);
    if (secrets.tokenWasGenerated) {
      printBox([
        'New access token generated (shown once).',
        '',
        `Token:           ${secrets.accessToken}`,
        `Connection code: ${encodeConnectionCode(localUrl, secrets.accessToken)}`,
        '',
        'Run "npm run token -w @verba/backend" to print them again.',
      ]);
    }
  });

  const runPrune = (): void => {
    pruneExpiredHistory(storage).then(
      (removed) => {
        if (removed > 0) console.log(`Pruned ${removed} expired history item(s).`);
      },
      (err: unknown) => console.error('History retention prune failed:', err instanceof Error ? err.message : err),
    );
  };
  runPrune();
  const pruneTimer = setInterval(runPrune, PRUNE_INTERVAL_MS);
  pruneTimer.unref();

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down.`);
    clearInterval(pruneTimer);
    const forced = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
    forced.unref();
    server.close(() => {
      storage
        .close()
        .catch((err: unknown) => console.error('Storage close failed:', err instanceof Error ? err.message : err))
        .finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
