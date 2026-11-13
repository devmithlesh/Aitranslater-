import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Build 2/3 — content script. Must be a single classic (IIFE) file: content
 * scripts cannot be ES modules. CSS is imported with `?inline` and injected
 * into a Shadow DOM, so nothing leaks into (or from) the host page.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: false,
    target: 'chrome116',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/content/content.ts', import.meta.url)),
      name: 'VerbaContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
