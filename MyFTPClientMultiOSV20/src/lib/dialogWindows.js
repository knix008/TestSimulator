// Opens a named dialog as its own Electron window and waits for the result.
// Several callers of the same name share one window: the existing one is
// focused and they all resolve when it submits or closes.
const electron = typeof window !== 'undefined' ? window.myFtpClient : null;

const waiters = new Map(); // name → [resolve]

function addWaiter(name) {
  return new Promise((resolve) => {
    const list = waiters.get(name) || [];
    list.push(resolve);
    waiters.set(name, list);
  });
}

function settle(name, data) {
  const list = waiters.get(name) || [];
  waiters.delete(name);
  for (const resolve of list) resolve(data);
}

let wired = false;
function ensureWired() {
  if (wired || !electron || !electron.onDialogResult) return;
  wired = true;
  electron.onDialogResult((msg) => { if (msg && msg.name) settle(msg.name, msg.data); });
  electron.onDialogClosed((msg) => {
    // Result is the source of truth. Closed is only a fallback for Alt+F4 /
    // the window being destroyed before submit; wait a tick so a pending
    // result is not overwritten with null.
    if (!msg || !msg.name) return;
    const closedName = msg.name;
    setTimeout(() => { if (waiters.has(closedName)) settle(closedName, null); }, 0);
  });
}

export function serializablePayload(payload) {
  try {
    return JSON.parse(JSON.stringify(payload, (_k, v) => (typeof v === 'function' ? undefined : v)));
  } catch {
    const out = {};
    for (const [k, v] of Object.entries(payload || {})) {
      if (typeof v === 'function') continue;
      try {
        JSON.stringify(v);
        out[k] = v;
      } catch { /* skip non-cloneable */ }
    }
    return out;
  }
}

export function detachedDialogsEnabled() {
  return !!(electron && electron.openDialog && typeof window !== 'undefined' && window.__mfcDetachedDialogs);
}

export function openDetachedDialog(name, payload) {
  ensureWired();
  const pending = addWaiter(name);
  return electron.openDialog(name, serializablePayload(payload)).then(
    () => pending,
    (err) => {
      settle(name, null);
      return Promise.reject(err);
    },
  );
}
