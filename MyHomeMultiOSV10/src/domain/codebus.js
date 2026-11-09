// The keys through which the main window and the code editor window talk (localStorage, which
// every window of the app shares and whose changes each window hears).

/** Requests for the code editor: [{ id, type: 'open-path' | 'open-content' | 'site-code' | 'new', … }]. */
export const CODE_INBOX_KEY = 'myhomemaker.code.inbox';
/** The code editor's messages: [{ id, type: 'site-code' | 'open-packages' | 'install-packages', … }]. */
export const CODE_OUTBOX_KEY = 'myhomemaker.code.outbox';
/** The open site's code as the main window has it: { siteId, name, code: { css, js, head } } or null. */
export const CODE_SITE_KEY = 'myhomemaker.code.site';
/** The code editor's open files and view, for next time. */
export const CODE_SESSION_KEY = 'myhomemaker.code.session';

export function readQueue(key, storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(key) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Adds a message to a queue; false when it could not be kept (storage full: a file too large to pass this way). */
export function pushQueue(key, message, storage = globalThis.localStorage) {
  const list = readQueue(key, storage);
  list.push({ ...message, id: message.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  try {
    storage?.setItem(key, JSON.stringify(list.slice(-50)));
    return true;
  } catch {
    return false;
  }
}

/** Takes every message out of a queue (they are handled once). */
export function drainQueue(key, storage = globalThis.localStorage) {
  const list = readQueue(key, storage);
  if (list.length) try { storage?.setItem(key, '[]'); } catch { /* left for next time */ }
  return list;
}
