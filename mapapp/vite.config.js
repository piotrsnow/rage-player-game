// Separate Vite app for Map Studio + Map Editor.
//
// Dev: runs on :5174, proxies /v1/* to the backend container at :3001 so the
// JWT cookies set on the main RPGon origin are reused without CORS juggling.
//
// Prod: the built assets are served by the backend under /map-studio/* (see
// plan). `base: '/map-studio/'` keeps asset URLs correct when mounted there.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const BACKEND_ORIGIN = process.env.MAPAPP_BACKEND_URL || 'http://localhost:3001';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/map-studio/' : '/',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@mapSchemas': path.resolve(__dirname, '../shared/mapSchemas'),
    },
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      '/v1': {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/health': { target: BACKEND_ORIGIN, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
}));
