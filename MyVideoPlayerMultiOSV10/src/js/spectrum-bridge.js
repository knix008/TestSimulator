/**
 * Opens / drives the separate spectrum display window (Electron child window or web popup).
 */

const SPECTRUM_CHANNEL = 'myvideoplayer-spectrum-v1';

/** @type {Window|null} */
let webPopup = null;
/** @type {BroadcastChannel|null} */
let channel = null;
let electronOpen = false;

function getChannel() {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(SPECTRUM_CHANNEL);
  return channel;
}

export function isSpectrumWindowSupported() {
  return Boolean(window.desktopAPI?.openSpectrumWindow) || typeof window.open === 'function';
}

export function markSpectrumWindowClosed() {
  electronOpen = false;
  webPopup = null;
}

export async function openSpectrumWindow(initPayload = {}) {
  if (window.desktopAPI?.openSpectrumWindow) {
    await window.desktopAPI.openSpectrumWindow(initPayload);
    electronOpen = true;
    return true;
  }

  const url = new URL('spectrum.html', window.location.href).href;
  if (webPopup && !webPopup.closed) {
    webPopup.focus();
    postSpectrumMessage({ type: 'init', ...initPayload });
    return true;
  }

  webPopup = window.open(
    url,
    'MyVideoPlayerSpectrum',
    'width=520,height=320,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
  );
  if (!webPopup) return false;

  // Give the popup a moment to boot, then send init (also via BroadcastChannel).
  window.setTimeout(() => {
    postSpectrumMessage({ type: 'init', ...initPayload });
  }, 120);
  return true;
}

export async function closeSpectrumWindow() {
  if (window.desktopAPI?.closeSpectrumWindow) {
    await window.desktopAPI.closeSpectrumWindow();
    electronOpen = false;
    return;
  }
  if (webPopup && !webPopup.closed) {
    webPopup.close();
  }
  webPopup = null;
  postSpectrumMessage({ type: 'close' });
}

export function focusSpectrumWindow() {
  if (window.desktopAPI?.focusSpectrumWindow) {
    window.desktopAPI.focusSpectrumWindow();
    return;
  }
  if (webPopup && !webPopup.closed) webPopup.focus();
}

export function postSpectrumMessage(message) {
  if (window.desktopAPI?.sendSpectrumMessage) {
    // Main process ignores messages when the spectrum window is closed.
    window.desktopAPI.sendSpectrumMessage(message);
  } else {
    try {
      getChannel()?.postMessage(message);
    } catch {
      /* ignore */
    }
    if (webPopup && !webPopup.closed) {
      try {
        webPopup.postMessage({ channel: SPECTRUM_CHANNEL, ...message }, window.location.origin);
      } catch {
        /* ignore */
      }
    }
  }
}

/** @param {(msg: any) => void} handler */
export function onSpectrumWindowEvent(handler) {
  const unsubs = [];

  if (window.desktopAPI?.onSpectrumWindowEvent) {
    unsubs.push(window.desktopAPI.onSpectrumWindowEvent(handler));
  }

  const ch = getChannel();
  if (ch) {
    const onMsg = (e) => handler(e.data);
    ch.addEventListener('message', onMsg);
    unsubs.push(() => ch.removeEventListener('message', onMsg));
  }

  const onWindowMessage = (e) => {
    const data = e.data;
    if (!data || data.channel !== SPECTRUM_CHANNEL) return;
    handler(data);
  };
  window.addEventListener('message', onWindowMessage);
  unsubs.push(() => window.removeEventListener('message', onWindowMessage));

  return () => unsubs.forEach((fn) => fn?.());
}

export function getSpectrumChannelName() {
  return SPECTRUM_CHANNEL;
}
