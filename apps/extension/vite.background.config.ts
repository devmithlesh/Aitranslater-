import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/** Build 3/3 — background service worker (manifest declares "type": "module"). */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: false,
    target: 'chrome116',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/background/service-worker.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'service-worker.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
