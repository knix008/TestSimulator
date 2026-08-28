/**
 * Opens / drives the separate play-history window (Electron child window or web popup).
 */

const HISTORY_CHANNEL = 'myvideoplayer-history-v1';

/** @type {Window|null} */
let webPopup = null;
/** @type {BroadcastChannel|null} */
let channel = null;
let electronOpen = false;

function getChannel() {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(HISTORY_CHANNEL);
  return channel;
}

export function isHistoryWindowSupported() {
  return Boolean(window.desktopAPI?.openHistoryWindow) || typeof window.open === 'function';
}

export function markHistoryWindowClosed() {
  electronOpen = false;
  webPopup = null;
}

export async function openHistoryWindow(initPayload = {}) {
  if (window.desktopAPI?.openHistoryWindow) {
    await window.desktopAPI.openHistoryWindow(initPayload);
    electronOpen = true;
    return true;
  }

  const url = new URL('history.html', window.location.href).href;
  if (webPopup && !webPopup.closed) {
    webPopup.focus();
    postHistoryMessage({ type: 'init', ...initPayload });
    return true;
  }

  webPopup = window.open(
    url,
    'MyVideoPlayerHistory',
    'width=380,height=560,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
  );
  if (!webPopup) return false;

  window.setTimeout(() => {
    postHistoryMessage({ type: 'init', ...initPayload });
  }, 120);
  return true;
}

export async function closeHistoryWindow() {
  if (window.desktopAPI?.closeHistoryWindow) {
    await window.desktopAPI.closeHistoryWindow();
    electronOpen = false;
    return;
  }
  if (webPopup && !webPopup.closed) {
    webPopup.close();
  }
  webPopup = null;
  postHistoryMessage({ type: 'close' });
}

export function focusHistoryWindow() {
  if (window.desktopAPI?.focusHistoryWindow) {
    window.desktopAPI.focusHistoryWindow();
    return;
  }
  if (webPopup && !webPopup.closed) webPopup.focus();
}

export function postHistoryMessage(message) {
  if (window.desktopAPI?.sendHistoryMessage) {
    window.desktopAPI.sendHistoryMessage(message);
  } else {
    try {
      getChannel()?.postMessage(message);
    } catch {
      /* ignore */
    }
    if (webPopup && !webPopup.closed) {
      try {
        webPopup.postMessage({ channel: HISTORY_CHANNEL, ...message }, window.location.origin);
      } catch {
        /* ignore */
      }
    }
  }
}

/** @param {(msg: any) => void} handler */
export function onHistoryWindowEvent(handler) {
  const unsubs = [];

  if (window.desktopAPI?.onHistoryWindowEvent) {
    unsubs.push(window.desktopAPI.onHistoryWindowEvent(handler));
  }

  const ch = getChannel();
  if (ch) {
    const onMsg = (e) => handler(e.data);
    ch.addEventListener('message', onMsg);
    unsubs.push(() => ch.removeEventListener('message', onMsg));
  }

  const onWindowMessage = (e) => {
    const data = e.data;
    if (!data || data.channel !== HISTORY_CHANNEL) return;
    handler(data);
  };
  window.addEventListener('message', onWindowMessage);
  unsubs.push(() => window.removeEventListener('message', onWindowMessage));

  return () => unsubs.forEach((fn) => fn?.());
}

export function getHistoryChannelName() {
  return HISTORY_CHANNEL;
}

export function isHistoryWindowMarkedOpen() {
  return electronOpen || Boolean(webPopup && !webPopup.closed);
}
