// Right-click menus in the menu bar's style (coloured icons, shortcut column): the text
// editor and the text tabs. The waveform keeps its own menu (#waveformContextMenu), drawn in
// the same style. items: [{ label, icon, key?, disabled?, danger?, run }] or '-' for a line.
import { icon } from './icons.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let layer = null;
let current = [];

export function closeContextMenu() {
  layer?.remove();
  layer = null;
  current = [];
}

export function showContextMenu(x, y, items, label = '메뉴') {
  closeContextMenu();
  current = items;
  layer = document.createElement('div');
  layer.className = 'menu-layer context-layer';
  layer.innerHTML = `<div class="popup-menu context-menu" role="menu" aria-label="${escapeHtml(label)}">${items.map((item, index) => (item === '-'
    ? '<div class="menu-sep" role="separator"></div>'
    : `<button type="button" class="menu-item ${item.danger ? 'danger' : ''}" role="menuitem" data-context-index="${index}" ${item.disabled ? 'disabled' : ''}><span class="menu-icon">${icon(item.icon)}</span><span>${escapeHtml(item.label)}</span><span class="menu-key">${escapeHtml(item.key ?? '')}</span><span></span></button>`)).join('')}</div>`;
  document.body.appendChild(layer);
  const menu = layer.firstElementChild;
  const pad = 6;
  const left = Math.max(pad, Math.min(x, innerWidth - menu.offsetWidth - pad));
  const top = Math.max(pad, Math.min(y, innerHeight - menu.offsetHeight - pad));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.addEventListener('mousedown', (event) => event.preventDefault()); // keep the editor's selection
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-context-index]');
    if (!button || button.disabled) return;
    const item = current[Number(button.dataset.contextIndex)];
    closeContextMenu();
    Promise.resolve().then(() => item.run?.()).catch((error) => console.error(error));
  });
}

document.addEventListener('pointerdown', (event) => { if (layer && !event.target.closest('.context-menu')) closeContextMenu(); }, true);
document.addEventListener('keydown', (event) => { if (layer && event.key === 'Escape') closeContextMenu(); });
window.addEventListener('blur', closeContextMenu);
window.addEventListener('resize', closeContextMenu);
document.addEventListener('scroll', closeContextMenu, true);
