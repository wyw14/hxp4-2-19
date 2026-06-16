import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 42036,
    proxy: {
      '/api': {
        target: 'http://localhost:42037',
        changeOrigin: true,
      },
    },
  },
});
