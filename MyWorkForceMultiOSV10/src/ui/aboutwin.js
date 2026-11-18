// The program information window (index.html?tool=about): a fixed-size window of its own with the same content
// as the about dialog it replaces — the program, its description and the build information.

import { L } from '../i18n.js';
import { appInfo } from '../platform/native.js';
import { aboutDialog } from './chrome.js';

const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';

function draw(info) {
  const html = aboutDialog({ ui: { about: info }, version: VERSION, settings: {} });
  // The dialog's frame becomes the window's page.
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const dialog = holder.querySelector('.modal.about');
  dialog.classList.add('about-window');
  dialog.querySelector('h2 .popup-close')?.remove();
  document.querySelector('#about-app').replaceChildren(dialog);
}

export function startAboutWindow() {
  document.title = `MyWorkForce — ${L('프로그램 정보', 'About')}`;
  document.body.classList.add('tool-window', 'about-window-body');
  document.body.innerHTML = '<div id="about-app"></div>';
  draw({});
  appInfo().then(draw).catch(() => {});
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'modal-cancel') window.close();
    if (button.dataset.action === 'copy-about') {
      const lines = [...document.querySelectorAll('#about-rows dt')].map((row) => `${row.textContent.trim()}: ${row.nextElementSibling?.textContent.trim() || ''}`);
      navigator.clipboard?.writeText(lines.join('\n')).then(() => { button.querySelector('span').textContent = L('복사했습니다', 'Copied'); }).catch(() => {});
    }
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') window.close(); });
}
