import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SHORTCUTS, TRANSLATE_IN_PLACE_COMMAND } from '@verba/shared';
import { describe, expect, it } from 'vitest';

interface ManifestCommand {
  suggested_key?: { default?: string };
}

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public', 'manifest.json'), 'utf8')) as {
  commands: Record<string, ManifestCommand>;
  minimum_chrome_version: string;
};

describe('manifest.json and the shared guide facts', () => {
  it('suggests the same shortcut to open the popup that the guide and popup show', () => {
    expect(manifest.commands._execute_action?.suggested_key?.default).toBe(DEFAULT_SHORTCUTS.openPopup);
  });

  it('suggests the same shortcut to translate in place that the guide and popup show', () => {
    expect(manifest.commands[TRANSLATE_IN_PLACE_COMMAND]?.suggested_key?.default).toBe(DEFAULT_SHORTCUTS.translateInPlace);
  });
});
