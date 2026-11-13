import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @verba/shared ships TypeScript source — bundle it so `node dist/index.js` works standalone.
  noExternal: ['@verba/shared'],
});
