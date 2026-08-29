import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { env } from '@/lib/env';

const STORAGE_MODE_KEY = 'setux.auth.persistent';

/**
 * Whether the session should outlive the browser tab.
 *
 * Read back from `localStorage` on start-up so a reload keeps whatever the user
 * chose at sign-in. Only this flag is stored — never a token.
 */
const isPersistentMode = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_MODE_KEY) !== 'false';
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Falling back
    // to the tab-scoped store is the safer of the two defaults.
    return false;
  }
};

/**
 * Selects where the session is kept, backing the "Remember me" control.
 *
 * `localStorage` survives a browser restart; `sessionStorage` ends with the
 * tab. Call before signing in, so the session is written to the right store.
 */
export const setSessionStorageMode = (persistent: boolean): void => {
  try {
    window.localStorage.setItem(STORAGE_MODE_KEY, String(persistent));
  } catch {
    // A machine that cannot store the preference simply gets the default.
  }
};

/**
 * Storage adapter that routes reads and writes to whichever store the current
 * mode selects.
 *
 * Resolved per call rather than captured once, so a mode chosen at sign-in
 * takes effect for the session written moments later. Every method is guarded:
 * a browser with storage disabled must degrade to "not signed in", not throw
 * on start-up.
 */
const modeAwareStorage: SupportedStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      const store = isPersistentMode() ? window.localStorage : window.sessionStorage;
      // Clear the other store so one session cannot shadow the other.
      const other = isPersistentMode() ? window.sessionStorage : window.localStorage;
      other.removeItem(key);
      store.setItem(key, value);
    } catch {
      // Nothing to persist to; the session lives in memory for this page only.
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      // Already unreachable; nothing to clean up.
    }
  },
};

/**
 * The single Supabase client in the browser.
 *
 * It exists for one job: holding and refreshing the authentication session.
 * SetuX data is read and written through the backend API, which enforces RBAC
 * and ownership; this client is not a second data path.
 *
 * Session storage and refresh are delegated to the library rather than
 * hand-rolled. `docs/API/auth-api.md` §25 is explicit that SetuX must not build
 * its own persistent-token system, and a custom implementation is exactly where
 * refresh races and stale-token bugs come from. The adapter above only chooses
 * *which* browser store the SDK writes to; it never touches token contents.
 */
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    // Restores the session on reload — the "Remember me" behaviour of the
    // approved auth screen (auth-api.md §25).
    persistSession: true,
    // Renews the access token before it expires, so a working session does not
    // die mid-use.
    autoRefreshToken: true,
    // SetuX has no OAuth redirect flow yet; leaving this on would make the
    // client parse fragments it should ignore.
    detectSessionInUrl: false,
    storage: modeAwareStorage,
  },
});
