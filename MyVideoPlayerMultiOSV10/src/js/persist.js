/**
 * Durable string storage.
 * - Electron: userData/persist.json via desktopAPI (survives random localhost ports)
 * - Web: localStorage
 */

function desktopPersist() {
  return typeof window !== 'undefined' && window.desktopAPI?.persistGetItem
    ? window.desktopAPI
    : null;
}

export function persistGetItem(key) {
  const api = desktopPersist();
  if (api) {
    try {
      const value = api.persistGetItem(key);
      if (value != null) return value;
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function persistSetItem(key, value) {
  const text = String(value);
  const api = desktopPersist();
  if (api) {
    try {
      api.persistSetItem(key, text);
    } catch {
      /* still mirror to localStorage */
    }
  }
  try {
    localStorage.setItem(key, text);
  } catch {
    /* ignore quota / private mode */
  }
}

export function persistRemoveItem(key) {
  const api = desktopPersist();
  if (api) {
    try {
      api.persistRemoveItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
