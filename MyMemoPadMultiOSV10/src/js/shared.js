export const DEFAULT_LOOK = {
  fontName: 'Malgun Gothic',
  fontSize: 12,
  fontStyle: 'Regular',
  foreColor: '#000000',
  editorBackColor: '#F8E18C',
  formBackColor: '#F8E18C',
  transparencyPercent: 0
};

export const DEFAULT_SETTINGS = {
  ...DEFAULT_LOOK,
  language: 'ko',
  windowTransparencyPercent: 0
};

export const PRESET_BACK_COLORS = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
  '#E6B3FF', '#B3FFD9', '#FFD1DC', '#F0E68C', '#D8BFD8',
  '#C1E1C1', '#F5DEB3', '#E0FFFF',
  '#FFE4E1', '#E6E6FA', '#F0FFF0', '#FFF0F5', '#FAFAD2',
  '#F5F5DC', '#DFFFD6', '#FFCCE5', '#C9E4DE', '#D4E6F1',
  '#FDEBD0', '#C7CEEA', '#E2F0CB'
];

export function clampTransparency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function transparencyToOpacity(percent) {
  return Math.min(1, Math.max(0.15, 1 - clampTransparency(percent) / 100));
}

export function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return rgbToHex(mix(r), mix(g), mix(b));
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return { r: 248, g: 225, b: 140 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const SETTINGS_FACE = '#F0F0F0';

export function isSettingsRole() {
  return (
    document.documentElement.classList.contains('role-settings') ||
    document.body.classList.contains('role-settings') ||
    document.documentElement.dataset.role === 'settings'
  );
}

export function lockSettingsTheme() {
  const html = document.documentElement;
  const body = document.body;
  html.classList.add('role-settings');
  body?.classList.add('role-settings');
  html.dataset.role = 'settings';
  for (const el of [html, body]) {
    if (!el) continue;
    el.style.background = SETTINGS_FACE;
    el.style.removeProperty('--memo-back');
    el.style.removeProperty('--toolbar');
    el.style.removeProperty('--card-face');
    el.style.removeProperty('--card-selected');
  }
}

export function applyThemeVars(color) {
  if (isSettingsRole()) {
    lockSettingsTheme();
    return;
  }
  const back = color || DEFAULT_LOOK.editorBackColor;
  document.documentElement.style.setProperty('--memo-back', back);
  document.documentElement.style.setProperty('--toolbar', back);
  document.documentElement.style.setProperty('--card-face', lighten(back, 0.12));
  document.documentElement.style.setProperty('--card-selected', lighten(back, 0.28));
  document.body.style.background = back;
}

export function htmlToPlain(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.innerText || div.textContent || '').replace(/\u00a0/g, ' ');
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function rtfToPlain(rtf) {
  return String(rtf)
    .replace(/\\'[0-9a-fA-F]{2}/g, (m) => String.fromCharCode(parseInt(m.slice(2), 16)))
    .replace(/\\par[d]?/gi, '\n')
    .replace(/\\tab/gi, '\t')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\r?\n+/g, '\n')
    .trim();
}

export function storedToHtml(stored) {
  if (!stored) return '';
  const text = String(stored);
  const trimmed = text.trim();
  if (trimmed.startsWith('{\\rtf')) {
    return escapeHtml(rtfToPlain(text)).replace(/\n/g, '<br>');
  }
  if (trimmed.startsWith('<')) return text;
  return escapeHtml(text).replace(/\n/g, '<br>');
}

export function fileToHtml(ext, content) {
  if (!content) return '';
  if (String(ext).toLowerCase() === '.rtf' || String(content).trim().startsWith('{\\rtf')) {
    return storedToHtml(content);
  }
  if (String(ext).toLowerCase() === '.html' || String(content).trim().startsWith('<')) {
    return content;
  }
  return escapeHtml(content).replace(/\n/g, '<br>');
}

export function lookFromSettings(settings) {
  const src = settings || DEFAULT_SETTINGS;
  return {
    fontName: src.fontName || DEFAULT_LOOK.fontName,
    fontSize: src.fontSize || DEFAULT_LOOK.fontSize,
    fontStyle: src.fontStyle || DEFAULT_LOOK.fontStyle,
    foreColor: src.foreColor || DEFAULT_LOOK.foreColor,
    editorBackColor: src.editorBackColor || DEFAULT_LOOK.editorBackColor,
    formBackColor: src.formBackColor || src.editorBackColor || DEFAULT_LOOK.formBackColor,
    transparencyPercent: clampTransparency(src.transparencyPercent ?? src.windowTransparencyPercent)
  };
}

export function saveMemo(items, sourceIndex, sourceMemo, html) {
  const list = items.slice();
  let index = sourceIndex;
  let source = sourceMemo;
  let updated = false;
  if (index >= 0 && index < list.length) {
    list[index] = html;
    source = html;
    updated = true;
  } else if (source != null) {
    const found = list.findIndex((m) => m === source);
    if (found >= 0) {
      list[found] = html;
      index = found;
      source = html;
      updated = true;
    } else {
      list.push(html);
      index = list.length - 1;
      source = html;
    }
  } else {
    list.push(html);
    index = list.length - 1;
    source = html;
  }
  return { items: list, sourceIndex: index, sourceMemo: source, updated };
}

export function tryDelete(items, sourceIndex, sourceMemo, currentHtml) {
  const list = items.slice();
  let idx = -1;
  if (sourceMemo != null) idx = list.findIndex((m) => m === sourceMemo);
  if (idx < 0 && sourceIndex >= 0 && sourceIndex < list.length) idx = sourceIndex;
  if (idx < 0 && currentHtml) idx = list.findIndex((m) => m === currentHtml);
  if (idx < 0) return null;
  list.splice(idx, 1);
  return { items: list, removedIndex: idx };
}

export function ensureReadableFore(backHex, foreHex) {
  const back = hexToRgb(backHex);
  const fore = hexToRgb(foreHex);
  const luma = (c) => (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
  if (Math.abs(luma(back) - luma(fore)) < 60) {
    return luma(back) > 140 ? '#000000' : '#FFFFFF';
  }
  return foreHex;
}
