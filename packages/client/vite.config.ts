import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy Socket.IO (and any future REST) to the server on :3000 so the
// client can connect to its own origin both in dev and in the prod container.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
      '/healthz': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
