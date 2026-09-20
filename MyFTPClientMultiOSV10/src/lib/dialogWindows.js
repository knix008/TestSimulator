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
    if (msg && msg.name && waiters.has(msg.name)) settle(msg.name, null);
  });
}

export function detachedDialogsEnabled() {
  return !!(electron && electron.openDialog && typeof window !== 'undefined' && window.__mfcDetachedDialogs);
}

export function openDetachedDialog(name, payload) {
  ensureWired();
  const pending = addWaiter(name);
  return electron.openDialog(name, payload).then(() => pending);
}
