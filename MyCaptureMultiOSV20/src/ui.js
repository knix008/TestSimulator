// HTML building blocks shared by the main window and the popup windows.
import { IMAGE_FORMATS } from './domain/settings.js';
import { t } from './i18n.js';
import { icon } from './icons.js';

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const swatch = (theme) =>
  `<span class="theme-swatch" aria-hidden="true">${theme.swatch.map((color) => `<i style="background:${color}"></i>`).join('')}</span>`;

export const settingRow = (label, control) =>
  `<div class="setting-row"><span class="setting-label">${label}</span><div class="setting-control">${control}</div></div>`;

export const formatNote = (format) => t(`format.note.${format}`);

/**
 * The icon of each option of the segmented controls (toolbar and settings), by
 * `key:value`, so the same option looks the same in both places.
 */
export const SEGMENT_ICONS = Object.freeze({
  'engine:display': 'window', 'engine:native': 'engine',
  'videoFormat:mp4': 'video', 'videoFormat:webm': 'globe',
  'fps:15': 'gaugeLow', 'fps:30': 'gaugeMid', 'fps:60': 'gaugeHigh',
  'language:ko': 'globe', 'language:en': 'globe',
  'sidebarCollapsed:false': 'panelLeftFilled', 'sidebarCollapsed:true': 'panelLeft',
  'historyCollapsed:false': 'panelRightFilled', 'historyCollapsed:true': 'panelRight',
  'startBgMotion:animated': 'play', 'startBgMotion:still': 'pause', 'startBgMotion:off': 'stop',
  'startBgShuffle:0': 'stop', 'startBgShuffle:30': 'clock', 'startBgShuffle:60': 'clock', 'startBgShuffle:300': 'clock',
  'customMode:dark': 'moon', 'customMode:light': 'sun',
});

/** The icon of each image format in the format menu. */
export const FORMAT_ICONS = Object.freeze({ jpg: 'camera', png: 'images', gif: 'play', avif: 'quality', webp: 'globe', tiff: 'save', bmp: 'grid' });

/** Items of the image format menu (the app's own menu window, with colour icons). */
export const imageFormatItems = (current) => IMAGE_FORMATS.map((format) => ({
  command: `image-format:${format}`, icon: FORMAT_ICONS[format] ?? 'images', label: format.toUpperCase(), hint: format === current ? '✓' : '',
}));

/**
 * Opens the image format menu under `button` (screen CSS px). The choice comes back as
 * an `image-format:<format>` menu command to the window named `origin`. The popup module
 * is loaded here, not at the top: this file is also used outside the app (unit tests).
 */
export async function openFormatMenu(button, origin, win = globalThis.window) {
  const { openPopup } = await import('./platform/popups.js');
  const box = button.getBoundingClientRect();
  const current = button.closest('[data-format]')?.dataset.format ?? button.querySelector('span')?.textContent.toLowerCase();
  await openPopup('menu', {
    params: { items: imageFormatItems(current), origin },
    anchor: { x: win.screenX + box.left, y: win.screenY + box.bottom + 2 },
  }).catch(() => {});
}

/** Widgets that read the current settings through `settings()`. */
export function widgets(settings) {
  return {
    segmented(key, options, current, disabled = false, titles = {}) {
      return `<div class="segmented" role="radiogroup">
        ${options.map(([value, label]) => {
          const glyph = SEGMENT_ICONS[`${key}:${value}`];
          return `
          <button role="radio" class="segment ${current === value ? 'active' : ''}" aria-checked="${current === value}"
            data-action="setting" data-key="${key}" data-value="${value}" ${titles[value] ? `title="${escapeHtml(titles[value])}"` : ''} ${disabled ? 'disabled' : ''}>${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`;
        }).join('')}
      </div>`;
    },
    /** The image format: a button that opens the format menu (a native <select> list has no icons). */
    imageFormatPicker(disabled = false) {
      const format = settings().imageFormat;
      return `<button type="button" class="select format-pick" data-action="format-menu" aria-haspopup="menu" aria-label="${t('tool.format')}: ${format.toUpperCase()}" title="${t('tool.format')}" ${disabled ? 'disabled' : ''}>
        ${icon(FORMAT_ICONS[format] ?? 'images')}<span>${format.toUpperCase()}</span>${icon('chevronDown', 'icon format-pick-chevron')}
      </button>`;
    },
    toggle(key, title, detail, disabled = false, glyph = '') {
      return `<label class="toggle ${disabled ? 'disabled' : ''}">
        <span class="toggle-text">${glyph ? icon(glyph) : ''}<span><strong>${title}</strong><small>${escapeHtml(detail)}</small></span></span>
        <input type="checkbox" data-toggle="${key}" ${settings()[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
        <span class="switch" aria-hidden="true"></span>
      </label>`;
    },
    qualitySlider() {
      return `<span class="quality">
        <input type="range" min="40" max="100" step="1" value="${settings().jpegQuality}" data-input="jpegQuality" aria-label="${t('tool.jpgQuality')}" />
        <output data-output="jpegQuality">${settings().jpegQuality}</output>
      </span>`;
    },
    folderRow(kind, directory, disabled = false) {
      return `<div class="folder">
        <span class="folder-path" title="${escapeHtml(directory ?? '')}">${escapeHtml(directory ?? t('save.none'))}</span>
        <button class="button small" data-action="choose-folder" data-value="${kind}" ${disabled ? 'disabled' : ''}>${icon('folder')}<span>${t('save.change')}</span></button>
      </div>`;
    },
  };
}
