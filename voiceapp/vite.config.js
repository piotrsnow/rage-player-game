import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const XTTS_BACKEND = process.env.XTTS_BACKEND_URL || 'http://localhost:5050';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: XTTS_BACKEND,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
