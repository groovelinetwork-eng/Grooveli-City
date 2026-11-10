import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * City app. Served under /city/ so it works both standalone
 * (http://localhost:3001/city/) and same-origin through the web app's
 * /city rewrite (http://localhost:3000/city). See docs/DECISION_LOG.md D8.
 */
export default defineConfig({
  base: '/city/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // packages/shared reads process.env.API_URL at import time; define it so the
  // shared package is browser-safe without modifying it (D3).
  define: {
    'process.env.API_URL': JSON.stringify(process.env.VITE_API_URL ?? 'http://localhost:4000/api'),
  },
  server: {
    port: 3001,
    strictPort: true,
    open: false,
    // HMR connects directly to Vite even when the page is proxied via :3000.
    hmr: { clientPort: 3001 },
  },
  preview: { port: 3001, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
});
