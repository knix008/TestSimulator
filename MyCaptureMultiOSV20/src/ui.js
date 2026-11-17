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

/** Widgets that read the current settings through `settings()`. */
export function widgets(settings) {
  return {
    segmented(key, options, current, disabled = false, titles = {}) {
      return `<div class="segmented" role="radiogroup">
        ${options.map(([value, label]) => `
          <button role="radio" class="segment ${current === value ? 'active' : ''}" aria-checked="${current === value}"
            data-action="setting" data-key="${key}" data-value="${value}" ${titles[value] ? `title="${escapeHtml(titles[value])}"` : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>`).join('')}
      </div>`;
    },
    toggle(key, title, detail, disabled = false, glyph = '') {
      return `<label class="toggle ${disabled ? 'disabled' : ''}">
        <span class="toggle-text">${glyph ? icon(glyph) : ''}<span><strong>${title}</strong><small>${escapeHtml(detail)}</small></span></span>
        <input type="checkbox" data-toggle="${key}" ${settings()[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
        <span class="switch" aria-hidden="true"></span>
      </label>`;
    },
    imageFormatSelect() {
      return `<select class="select" data-select="imageFormat" aria-label="${t('tool.format')}">
        ${IMAGE_FORMATS.map((format) => `<option value="${format}" ${settings().imageFormat === format ? 'selected' : ''}>${format.toUpperCase()}</option>`).join('')}
      </select>`;
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
