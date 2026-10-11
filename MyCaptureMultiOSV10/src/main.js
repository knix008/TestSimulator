// One bundle serves two kinds of windows: the main app and the
// region-selection overlays (labels "overlay-…") and the recording controls ("recbar").
import { loadSettings } from './domain/settings.js';
import { setLanguage } from './i18n.js';

setLanguage(loadSettings(globalThis.localStorage).language);
const label = window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? 'main';

if (label.startsWith('overlay-')) {
  import('./overlay.js');
} else if (label === 'recbar') {
  import('./recbar.js');
} else {
  import('./app.js');
}
