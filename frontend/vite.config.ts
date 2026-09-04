import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Fail rather than drift to the next free port.
    //
    // The backend's CORS allowlist names this exact origin (`CORS_ORIGIN` in
    // `backend/.env`). Vite's default behaviour on a busy port is to move
    // silently to 5174, 5175, … — and every API call from that origin is then
    // rejected by the browser before it reaches a SetuX handler, so sign-in and
    // registration fail with an opaque network error rather than anything that
    // points at the port. Refusing to start is the far cheaper failure: it names
    // the problem at the moment it occurs.
    strictPort: true,
  },
});
