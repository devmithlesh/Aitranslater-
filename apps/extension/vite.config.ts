import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Build 1/3 — extension pages (popup + options + side panel). Copies public/ (manifest.json, icons)
 * into dist/. Does NOT empty dist/: the `build` script removes it once up front, and
 * `dev` runs this build in watch mode next to the content and background builds, which
 * would otherwise wipe their output on every rebuild.
 */
export default defineConfig({
  root: 'src/pages',
  // Read .env files from apps/extension (like the content and background builds), not from src/pages,
  // so VITE_API_URL / VITE_DASHBOARD_URL are the same in every bundle.
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  base: '',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  css: { postcss: fileURLToPath(new URL('./postcss.config.js', import.meta.url)) },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: false,
    target: 'chrome116',
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: fileURLToPath(new URL('./src/pages/popup.html', import.meta.url)),
        options: fileURLToPath(new URL('./src/pages/options.html', import.meta.url)),
        sidepanel: fileURLToPath(new URL('./src/pages/sidepanel.html', import.meta.url)),
      },
    },
  },
});
