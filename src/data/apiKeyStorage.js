// Local storage for the user's own Anthropic API key — on the user's own
// device, in their own browser, never transmitted to or held by anything
// we run. This is the core of the BYOK model: Parlance is never the
// holder of the key in any meaningful sense (no database row, no server
// log, no backup containing it) — it lives exactly where the user put it.
//
// The backend proxy (api/run-agent.js, api/files/[id].js) receives this
// key once per request, uses it immediately to call Anthropic, and never
// writes it anywhere — see those files for that side of the contract.
//
// Deliberately kept separate from the workflow reducer state — the key
// should never be part of exported/serialized workflow data, and should
// never flow through anything that might log or transmit full app state
// elsewhere.

const STORAGE_KEY = 'parlance.anthropicApiKey';

export function getApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // localStorage can throw in some contexts (private browsing, blocked
    // storage). Treat as "no key set" rather than crashing the app.
    return '';
  }
}

export function setApiKey(key) {
  try {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function hasApiKey() {
  return getApiKey().trim().length > 0;
}

/** Masks all but the last 4 characters, for display without re-exposing the full key. */
export function maskApiKey(key) {
  if (!key || key.length <= 4) return key ? '••••' : '';
  return `${'•'.repeat(Math.min(key.length - 4, 24))}${key.slice(-4)}`;
}
