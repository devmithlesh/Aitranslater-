import { encodeConnectionCode } from '@verba/shared';
import { loadConfig } from '../config/env';
import { loadSecrets } from '../config/secrets';

/** Prints the access token and the connection code for the dashboard and extension. */
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const secrets = await loadSecrets(config);
  const apiUrl = `http://localhost:${config.port}`;
  console.log(`Access token:\n${secrets.accessToken}\n`);
  console.log(`Connection code (${apiUrl}):\n${encodeConnectionCode(apiUrl, secrets.accessToken)}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
