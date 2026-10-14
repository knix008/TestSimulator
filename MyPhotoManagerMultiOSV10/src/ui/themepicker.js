// Theme choice: the header list and the Settings field (system, 20 dark and 20
// light themes in two columns with their colours, custom), and the editor of
// the custom theme with live preview.
import { t } from '../i18n.js';
import { app } from '../store.js';
import { applyTheme, customTheme, DEFAULT_CUSTOM, THEMES, themeVars } from '../themes.js';
import { field, openDialog, selectEl } from './dialog.js';
import { colorSwatches } from './colorswatch.js';
import { h } from './dom.js';

export const EDIT_CUSTOM = '__edit-custom';

/** The colours a theme shows as dots: background, panel, text, accent. */
function themeDots(theme) {
  const v = themeVars(theme);
  return h('span.theme-dots', [v['--bg'], v['--panel'], v['--text'], v['--accent']].map((color) => h('span.theme-dot', { style: { background: color } })));
}

function themeFor(id, custom) {
  if (id === 'system') return null;
  return id === 'custom' ? customTheme(custom) : THEMES.find((x) => x.id === id) ?? null;
}

/**
 * Theme chooser: a button with the theme's colour dots and name; it opens a
 * list in two columns (dark | light), every theme with its colours, plus
 * "system" and the custom theme. Behaves like a <select>: `.value`, 'change'.
 */
export function themeSelect(value, { withEdit = false, onChange } = {}) {
  let current = value;
  const button = h('button.theme-select', { type: 'button', title: t('menu.theme'), dataset: { key: 'theme' }, 'aria-haspopup': 'listbox' });
  const label = () => (current === 'system' ? t('settings.system') : current === 'custom' ? t('theme.custom') : THEMES.find((x) => x.id === current)?.name ?? current);
  const draw = () => {
    const theme = themeFor(current, app.settings.customTheme);
    button.replaceChildren(theme ? themeDots(theme) : h('span.theme-dots.system', h('span.theme-dot.half')), h('span.theme-select-name', label()), h('span.theme-select-arrow', '▾'));
  };
  draw();
  let popup = null;
  const close = () => { popup?.remove(); popup = null; };
  const choose = (id) => {
    close();
    if (id !== EDIT_CUSTOM) { current = id; draw(); }
    button.dispatchEvent(Object.assign(new Event('change', { bubbles: true }), { themeId: id }));
  };
  const item = (id, name, theme) => h(`button.theme-item${id === current ? '.on' : ''}`, { type: 'button', role: 'option', dataset: { theme: id }, onclick: () => choose(id) },
    theme ? themeDots(theme) : h('span.theme-dots.system', h('span.theme-dot.half')), h('span.theme-item-name', name));
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (popup) { close(); return; }
    const doc = button.ownerDocument;
    const column = (mode, title) => h('div.theme-column', h('div.theme-column-title', title), THEMES.filter((x) => x.mode === mode).map((x) => item(x.id, x.name, x)));
    popup = h('div.theme-popup', { role: 'listbox' },
      h('div.theme-popup-top', item('system', t('settings.system'), null), item('custom', t('theme.custom'), customTheme(app.settings.customTheme)),
        withEdit ? h('button.theme-item.edit', { type: 'button', dataset: { theme: EDIT_CUSTOM }, onclick: () => choose(EDIT_CUSTOM) }, h('span', '✎'), h('span.theme-item-name', t('theme.editCustom'))) : ''),
      h('div.theme-columns', column('dark', t('settings.dark')), column('light', t('settings.light'))));
    doc.body.append(popup);
    const rect = button.getBoundingClientRect();
    const width = popup.offsetWidth;
    const viewport = doc.defaultView.innerWidth;
    popup.style.left = `${Math.max(4, Math.min(rect.left, viewport - width - 4))}px`;
    popup.style.top = `${rect.bottom + 4}px`;
    popup.style.maxHeight = `${doc.defaultView.innerHeight - rect.bottom - 12}px`;
    popup.querySelector('.theme-item.on')?.scrollIntoView({ block: 'nearest' });
    const away = (e) => { if (!popup?.contains(e.target) && e.target !== button) { close(); doc.removeEventListener('pointerdown', away, true); } };
    doc.addEventListener('pointerdown', away, true);
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });
  });
  // <select> compatible: setting .value and dispatching 'change' chooses a theme.
  Object.defineProperty(button, 'value', { get: () => current, set: (v) => { if (v !== EDIT_CUSTOM) { current = v; draw(); } else button._pending = v; } });
  button.addEventListener('change', (event) => {
    const id = event.themeId ?? button._pending ?? current;
    button._pending = undefined;
    onChange?.(id);
  });
  return button;
}

/** Edits settings.customTheme with a live preview. Resolves true when saved. */
export async function customThemeDialog({ onPreview } = {}) {
  const start = customTheme(app.settings.customTheme);
  const mode = selectEl([['dark', t('settings.dark')], ['light', t('settings.light')]], start.mode);
  // Palettes from the built-in themes (backgrounds of the chosen base, texts, accents).
  const pick = (field, mode) => [...new Set(THEMES.filter((x) => !mode || x.mode === mode).map((x) => x[field]))].slice(0, 12);
  const color = (value, key, palette) => colorSwatches(value || '#000000', { key, palette });
  const bg = color(start.bg, 'bg', [...pick('bg', 'dark').slice(0, 6), ...pick('bg', 'light').slice(0, 6)]);
  const panel = color(start.panel || start.bg, 'panel', [...pick('bg', 'dark').slice(6, 12), ...pick('bg', 'light').slice(6, 12)]);
  const usePanel = h('input', { type: 'checkbox', checked: Boolean(start.panel) });
  const text = color(start.text, 'text', [...pick('text', 'dark').slice(0, 6), ...pick('text', 'light').slice(0, 6)]);
  const accent = color(start.accent, 'accent', pick('accent'));
  const read = () => ({ mode: mode.value, bg: bg.value, panel: usePanel.checked ? panel.value : '', text: text.value, accent: accent.value });
  const preview = () => { const theme = applyTheme(customTheme(read())); onPreview?.(theme); };
  for (const input of [mode, bg, panel, usePanel, text, accent]) input.addEventListener('input', preview);
  mode.addEventListener('change', preview);
  const presets = h('div.row-buttons', THEMES.filter((_, i) => i % 5 === 0).map((theme) => h('button.btn.small', {
    type: 'button', title: t('theme.startFrom'),
    onclick: () => { mode.value = theme.mode; bg.value = theme.bg; text.value = theme.text; accent.value = theme.accent; usePanel.checked = false; preview(); },
  }, theme.name)));
  const reset = h('button.btn.small', { type: 'button', onclick: () => { mode.value = DEFAULT_CUSTOM.mode; bg.value = DEFAULT_CUSTOM.bg; text.value = DEFAULT_CUSTOM.text; accent.value = DEFAULT_CUSTOM.accent; usePanel.checked = false; preview(); } }, t('edit.reset'));
  preview();
  const ok = await openDialog({
    title: t('theme.customTitle'), width: 520, id: 'custom-theme-dialog',
    body: h('div',
      h('p.hint', t('theme.customHint')),
      field(t('theme.base'), mode),
      field(t('theme.background'), bg), field(t('theme.text'), text), field(t('theme.accent'), accent),
      field(t('theme.panel'), panel), h('label.check', usePanel, t('theme.usePanel')),
      h('div.field-label', t('theme.startFrom')), presets, h('div.row-buttons', reset)),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), value: true, primary: true }],
  });
  if (ok) {
    app.settings.customTheme = read();
    app.settings.theme = 'custom';
    app.saveSettings();
  }
  return Boolean(ok);
}
