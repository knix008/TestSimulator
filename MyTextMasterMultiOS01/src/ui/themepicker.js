// The toolbar's theme drop-down, as in MyUMLMaker: a panel under the ▾ button with the system
// setting and the custom theme on top, the dark and the light themes in two columns (colour swatch,
// name, ✓ on the current one), and at the bottom: edit the custom theme, a random theme, close.
// Picking a theme applies it and closes the panel; Esc or a click outside closes it.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { DARK_THEMES, LIGHT_THEMES, themeName } from '../themes.js';

let current = null;

export const themePickerOpen = () => Boolean(current);

export function closeThemePicker() {
  if (!current) return;
  const { panel, cleanup } = current;
  current = null;
  cleanup();
  panel.remove();
}

/** anchor: the element it opens under. hooks: theme() (current id), pick(id), editCustom(), random() */
export function showThemePicker(anchor, hooks) {
  if (current) { closeThemePicker(); return; }
  const L = getLanguage();
  const theme = hooks.theme();
  const item = (id, lead) => `<button type="button" class="picker-item ${theme === id ? 'active' : ''}" data-pick-theme="${id}" role="radio" aria-checked="${theme === id}" title="${escapeHtml(themeName(id, L))}">${lead}<span class="theme-name">${escapeHtml(themeName(id, L))}</span>${theme === id ? icon('check', 'icon check') : ''}</button>`;
  const swatch = (entry) => `<span class="theme-swatch">${entry.swatch.map((color) => `<i style="background:${color}"></i>`).join('')}</span>`;
  const column = (glyph, title, list) => `<div class="picker-column" role="radiogroup" aria-label="${escapeHtml(title)}"><h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>${list.map((entry) => item(entry.id, swatch(entry))).join('')}</div>`;

  const panel = document.createElement('section');
  panel.className = 'popup theme-dropdown';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('action.themeChoose'));
  panel.innerHTML = `
    <header class="popup-head"><h2>${icon('palette')}<span>${escapeHtml(t('action.themeChoose'))}</span></h2>
      <button type="button" class="window-button" data-theme-action="close" title="${escapeHtml(t('action.close'))}" aria-label="${escapeHtml(t('action.close'))}">${icon('winClose')}</button></header>
    <div class="popup-body"><div class="theme-picker">
      <div class="picker-top">${item('system', icon('sun'))}${item('custom', icon('palette'))}</div>
      <div class="picker-columns">${column('moon', t('theme.darkGroup', { count: DARK_THEMES.length }), DARK_THEMES)}${column('sun', t('theme.lightGroup', { count: LIGHT_THEMES.length }), LIGHT_THEMES)}</div>
    </div></div>
    <footer class="popup-foot">
      <button type="button" class="button small" data-theme-action="edit" title="${escapeHtml(t('theme.editCustom'))}">${icon('edit')}<span>${escapeHtml(t('theme.editCustom'))}</span></button>
      <button type="button" class="button small" data-theme-action="random" title="${escapeHtml(t('action.themeRandom'))}">${icon('dice')}<span>${escapeHtml(t('action.themeRandom'))}</span></button>
      <span class="grow"></span>
      <button type="button" class="button small" data-theme-action="close">${icon('close')}<span>${escapeHtml(t('action.close'))}</span></button>
    </footer>`;
  document.body.appendChild(panel);

  // Under the button, its right edge on the button's right edge (the button sits at the toolbar's right end), inside the window.
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(620, window.innerWidth - 16);
  const height = Math.min(panel.offsetHeight, window.innerHeight - rect.bottom - 12);
  panel.style.width = `${width}px`;
  panel.style.height = `${Math.max(320, height)}px`;
  panel.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))}px`;
  panel.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - Math.max(320, height) - 8)}px`;
  panel.querySelector('.picker-item.active')?.scrollIntoView({ block: 'nearest' });
  panel.querySelector('.picker-item.active, .picker-item')?.focus({ preventScroll: true });

  panel.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-pick-theme]');
    if (pick) { closeThemePicker(); hooks.pick(pick.dataset.pickTheme); return; }
    const action = event.target.closest('[data-theme-action]')?.dataset.themeAction;
    if (action === 'close') closeThemePicker();
    else if (action === 'edit') { closeThemePicker(); hooks.editCustom(); }
    else if (action === 'random') { closeThemePicker(); hooks.random(); }
  });
  // Arrow keys move through the themes (both columns in one list), Enter picks, Esc closes.
  const onKey = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeThemePicker(); anchor.focus?.(); return; }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const columns = [...panel.querySelectorAll('.picker-column')].map((c) => [...c.querySelectorAll('.picker-item')]);
    const top = [...panel.querySelectorAll('.picker-top .picker-item')];
    const all = [...top, ...columns.flat()];
    const index = all.indexOf(document.activeElement);
    if (index < 0) { all[0]?.focus(); event.preventDefault(); return; }
    let next = index;
    const col = columns.findIndex((c) => c.includes(document.activeElement));
    if (event.key === 'ArrowDown') next = Math.min(all.length - 1, index + 1);
    if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && col >= 0) {
      const row = columns[col].indexOf(document.activeElement);
      const other = columns[col === 0 ? 1 : 0];
      other[Math.min(row, other.length - 1)]?.focus();
      event.preventDefault();
      return;
    }
    all[next]?.focus();
    all[next]?.scrollIntoView({ block: 'nearest' });
    event.preventDefault();
  };
  const onOutside = (event) => { if (!panel.contains(event.target) && !anchor.contains(event.target)) closeThemePicker(); };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('resize', closeThemePicker);
  current = {
    panel,
    cleanup: () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('resize', closeThemePicker);
    },
  };
}
