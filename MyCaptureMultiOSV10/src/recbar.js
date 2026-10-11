// Floating recording controls (window "recbar"), shown while a whole screen is
// recorded. The main window owns the recording; this page only mirrors its
// state ("recording-state" events) and sends commands back ("recbar-command").
import './recbar.css';
import { emit, listen } from '@tauri-apps/api/event';
import { elapsedMs, initialSession } from './domain/session.js';
import { formatDuration } from './domain/naming.js';
import { t } from './i18n.js';
import { icon } from './icons.js';

const root = document.querySelector('#app');
let session = initialSession;

function render() {
  const paused = session.phase === 'paused';
  const stopping = session.phase === 'stopping';
  root.innerHTML = `
    <div class="recbar" data-tauri-drag-region>
      <span class="recbar-dot ${paused ? 'paused' : ''}" data-tauri-drag-region></span>
      <span class="recbar-state" data-tauri-drag-region>${t(stopping ? 'busy.finishing' : paused ? 'recbar.paused' : 'recbar.recording')}</span>
      <span class="recbar-time" id="time" data-tauri-drag-region>00:00</span>
      <button class="recbar-button ${paused ? 'resume' : 'pause'}" data-command="${paused ? 'resume' : 'pause'}" title="${t(paused ? 'action.resume' : 'action.pause')}" aria-label="${t(paused ? 'action.resume' : 'action.pause')}" ${stopping ? 'disabled' : ''}>${icon(paused ? 'play' : 'pause')}</button>
      <button class="recbar-button stop" data-command="stop" title="${t('action.stop')}" aria-label="${t('action.stop')}" ${stopping ? 'disabled' : ''}>${icon('stop')}</button>
      <button class="recbar-button" data-command="show" title="${t('recbar.showMain')}" aria-label="${t('recbar.showMain')}">${icon('winMaximize')}</button>
    </div>`;
  tick();
}

function tick() {
  const time = document.querySelector('#time');
  if (time) time.textContent = formatDuration(elapsedMs(session, Date.now()));
}

window.addEventListener('contextmenu', (event) => event.preventDefault());

root.addEventListener('click', (event) => {
  const button = event.target.closest('[data-command]');
  if (button && !button.disabled) emit('recbar-command', { command: button.dataset.command });
});

await listen('recording-state', (event) => {
  session = event.payload;
  render();
});
render();
setInterval(tick, 250);
emit('recbar-command', { command: 'ready' });
