import { defineConfig } from 'vite';

// Two pages: the main app and the standalone site-detail map.
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: 'index.html', detail: 'detail.html' },
    },
  },
});
