import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Dev only: forward /api to a remote server (e.g. the live API) so the browser stays same-origin and
  // that server's CORS list doesn't need localhost. Set VITE_API_PROXY_TARGET in .env.local to enable.
  const proxyTarget = loadEnv(mode, process.cwd(), '').VITE_API_PROXY_TARGET;

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
              secure: true,
              configure: (proxy) => {
                // Same-origin for the browser; don't forward localhost as the Origin to the remote server.
                proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
              },
            },
          }
        : undefined,
    },
    preview: { port: 4173 },
    build: {
      // No source maps in the deployed site: they would publish the full frontend source.
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            redux: ['@reduxjs/toolkit', 'react-redux'],
          },
        },
      },
    },
  };
});
