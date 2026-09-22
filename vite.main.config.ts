import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // koffi is a native module and has to stay external so that
      // `require('koffi')` resolves against node_modules at runtime instead of
      // being bundled. Shared by both main entries: main.ts and icon-worker.ts.
      external: ['koffi'],
    },
  },
});
