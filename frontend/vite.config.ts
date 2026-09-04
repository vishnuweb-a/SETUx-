import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

/**
 * Where the dev server forwards `/api` calls.
 *
 * `127.0.0.1` rather than `localhost` on purpose: on Windows `localhost`
 * resolves to `::1` first, and a backend that happened to bind IPv4 only would
 * make the proxy fail with `ECONNREFUSED` while `curl` still worked. Pinning the
 * family removes that whole class of "works in the terminal, not in the browser".
 */
const DEFAULT_BACKEND_ORIGIN = 'http://127.0.0.1:3000';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname), '');
  const backendOrigin = env.BACKEND_ORIGIN ?? DEFAULT_BACKEND_ORIGIN;

  return {
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
      // Vite's default behaviour on a busy port is to move silently to 5174,
      // 5175, … Refusing to start is the far cheaper failure: it names the
      // problem at the moment it occurs instead of surfacing later as an opaque
      // network error from an origin nobody expected.
      strictPort: true,

      // Listen on every interface, so the app answers on `localhost`,
      // `127.0.0.1` and `[::1]` alike. Vite's default binds one loopback family
      // only, which left `http://127.0.0.1:5173` dead and made the browser send
      // an `Origin` of `http://[::1]:5173` that the API's CORS allowlist did not
      // name — sign-in then failed with a network error that pointed nowhere
      // near the real cause.
      host: true,

      /**
       * Same-origin path to the API in development.
       *
       * With this, the browser calls `/api/v1/...` on the Vite origin and Vite
       * forwards it to the backend. No cross-origin request is made, so CORS,
       * preflights and the IPv4/IPv6 origin mismatch cannot break sign-in at
       * all. `VITE_API_BASE_URL` is left free to point straight at the backend
       * for anyone who prefers the direct route.
       */
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
  };
});
