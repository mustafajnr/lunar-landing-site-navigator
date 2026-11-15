import { defineConfig } from 'vite';

// Three pages: the main app, the standalone site-detail map and the user guide.
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: 'index.html', detail: 'detail.html', guide: 'guide.html' },
    },
  },
});
