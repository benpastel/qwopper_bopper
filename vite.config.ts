import { defineConfig } from 'vite';

// the lobby server's port, as in src/server/index.ts
const server = Number(process.env.PORT) || 8080;

export default defineConfig({
  server: {
    proxy: {
      '/ws': { target: `ws://localhost:${server}`, ws: true },
    },
  },
});
