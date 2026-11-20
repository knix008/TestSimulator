// A projector window (index.html?projector=<which>): the program, the preview, the multiview, a scene or a
// source, full window and black around it. Its picture comes from the main window over a local WebRTC
// connection (bc/engine/whip.js connectProjector). Double-click: full screen on / off; Esc: leave full
// screen; right-click: always on top, close. The virtual camera is this window with ?vcam=1 (no cursor).
import { getCurrentWindow } from '@tauri-apps/api/window';
import { connectProjector } from './bc/engine/whip.js';
import { t } from './i18n.js';

const params = new URLSearchParams(location.search);
const which = decodeURIComponent(params.get('projector') ?? 'program');
const vcam = params.has('vcam');
const desktop = Boolean(window.__TAURI_INTERNALS__);
const win = desktop ? getCurrentWindow() : null;

document.documentElement.classList.add('is-projector');
document.body.innerHTML = `<div class="projector ${vcam ? 'vcam' : ''}"><video autoplay muted playsinline></video><div class="projector-wait">${t('projector.waiting')}</div></div>`;
const video = document.querySelector('video');
const wait = document.querySelector('.projector-wait');
video.addEventListener('playing', () => { wait.hidden = true; });

const link = connectProjector(which, video, { onClose: () => (desktop ? win.close() : window.close()) });
window.addEventListener('beforeunload', () => link.close());

async function toggleFullscreen() {
  if (desktop) { const on = await win.isFullscreen().catch(() => false); await win.setFullscreen(!on).catch(() => {}); }
  else if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
}
document.addEventListener('dblclick', toggleFullscreen);
document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') { if (desktop && (await win.isFullscreen().catch(() => false))) win.setFullscreen(false); else if (document.fullscreenElement) document.exitFullscreen(); }
  if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
});
let onTop = false;
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!desktop) return;
  onTop = !onTop;
  win.setAlwaysOnTop(onTop).catch(() => {});
});

window.__mybroadcastingProjector = { which, video, link };
