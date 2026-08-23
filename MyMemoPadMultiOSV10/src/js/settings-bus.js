const CHANNEL = 'mymemopad-settings';
const CTX_KEY = 'mymemopad-settings-ctx';

function webChannel() {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
}

export function openSettingsWindow(context) {
  if (window.desktopAPI?.openSettings) {
    return window.desktopAPI.openSettings(context);
  }
  try {
    localStorage.setItem(CTX_KEY, JSON.stringify(context || {}));
  } catch {
    /* ignore */
  }
  const ch = webChannel();
  ch?.postMessage({ type: 'load', context });
  const url = new URL(location.href);
  url.search = 'role=settings';
  window.open(url.toString(), 'mymemopad-settings', 'width=500,height=560');
}

export function sendSettingsCommand(cmd) {
  if (window.desktopAPI?.sendSettingsCommand) {
    window.desktopAPI.sendSettingsCommand(cmd);
    return;
  }
  webChannel()?.postMessage(cmd);
}

export function onSettingsLoad(callback) {
  if (window.desktopAPI?.onSettingsLoad) {
    return window.desktopAPI.onSettingsLoad(callback);
  }
  try {
    const raw = localStorage.getItem(CTX_KEY);
    if (raw) callback(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  const ch = webChannel();
  const handler = (event) => {
    if (event.data?.type === 'load') callback(event.data.context);
  };
  ch?.addEventListener('message', handler);
  return () => ch?.removeEventListener('message', handler);
}

export function onSettingsCommand(callback) {
  if (window.desktopAPI?.onSettingsCommand) {
    return window.desktopAPI.onSettingsCommand(callback);
  }
  const ch = webChannel();
  const handler = (event) => {
    const data = event.data;
    if (data?.type && data.type !== 'load') callback(data);
  };
  ch?.addEventListener('message', handler);
  return () => ch?.removeEventListener('message', handler);
}
