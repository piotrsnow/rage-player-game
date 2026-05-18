import { defineConfig } from 'vitest/config';

// Dedicated Vitest config (no @vitejs/plugin-react) so backend + shared unit
// tests run in Node without the browser-oriented Vite app config breaking globals.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.{js,jsx}',
      'shared/**/*.{test,spec}.js',
      'backend/src/**/*.{test,spec}.js',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/.claude/**',
      '**/.cursor/**',
    ],
  },
});
