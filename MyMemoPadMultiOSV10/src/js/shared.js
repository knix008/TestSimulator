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

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P',
  'PRE', 'SECTION', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'UL'
]);

/**
 * Plain text of memo HTML with its line breaks.
 * innerText of a detached element ignores layout and so drops every <br>/<div> break \u2014
 * the memo list showed each memo as one run-on line. Walk the nodes instead.
 */
export function htmlToPlain(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  let out = '';
  const breakLine = () => {
    if (out && !out.endsWith('\n')) out += '\n';
  };
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        out += child.nodeValue.replace(/\r\n?/g, '\n');
      } else if (child.nodeType === 1) {
        const tag = child.tagName;
        if (tag === 'BR') {
          out += '\n';
        } else if (tag === 'SCRIPT' || tag === 'STYLE') {
          // not text
        } else if (BLOCK_TAGS.has(tag)) {
          breakLine();
          walk(child);
          breakLine();
        } else {
          if (tag === 'TD' || tag === 'TH') {
            if (out && !/[\t\n]$/.test(out)) out += '\t';
          }
          walk(child);
        }
      }
    }
  };
  walk(div);
  return out.replace(/\u00a0/g, ' ');
}

const HTML_TAG_RE = /<\/?(?:a|b|blockquote|br|code|div|em|font|h[1-6]|hr|i|img|li|ol|p|pre|s|span|strike|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul)\b[^>]*>/i;
const HTML_ENTITY_RE = /&(?:amp|lt|gt|quot|nbsp|#\d+|#x[0-9a-f]+);/i;
/** Markup that was escaped into visible text, e.g. "&lt;br&gt;" or "&amp;lt;div&amp;gt;". */
const ESCAPED_TAG_RE = /&(?:amp;)*lt;\/?(?:br|div|p|span|b|i|u|font)\b[^<>]*?&(?:amp;)*gt;/i;
const OVER_ESCAPED_RE = /&amp;(?:amp;)*(?:lt|gt|amp|quot|nbsp|#\d+);|&lt;\/?(?:br|div|p|span|b|i|u|font)\b[^<>]*?&gt;/i;

function unescapeOnce(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/**
 * Undoes the repeated escaping earlier builds did: a memo whose HTML began with text
 * (not "<") was taken for plain text and escaped again on every open, so its line breaks
 * turned into "&lt;br&gt;" text and the memo read as one line.
 */
export function repairEscapedHtml(text) {
  let s = String(text ?? '');
  if (!ESCAPED_TAG_RE.test(s)) return s;
  for (let guard = 0; guard < 20 && OVER_ESCAPED_RE.test(s); guard += 1) {
    s = unescapeOnce(s);
  }
  return s;
}

/** True when a stored memo is HTML (what the editor saves) rather than legacy plain text. */
export function looksLikeHtml(text) {
  return HTML_TAG_RE.test(text) || HTML_ENTITY_RE.test(text);
}

export function plainToHtml(text) {
  return escapeHtml(text).replace(/\r\n|\r|\n/g, '<br>');
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
    return plainToHtml(rtfToPlain(text));
  }
  // The editor saves innerHTML, which often starts with a text node ("Title<br>…"), so a
  // leading "<" is not a test for HTML — that test escaped such memos again on every open.
  const repaired = repairEscapedHtml(text);
  if (looksLikeHtml(repaired)) return repaired;
  return plainToHtml(repaired);
}

export function fileToHtml(ext, content) {
  if (!content) return '';
  if (String(ext).toLowerCase() === '.rtf' || String(content).trim().startsWith('{\\rtf')) {
    return storedToHtml(content);
  }
  if (String(ext).toLowerCase() === '.html' || String(content).trim().startsWith('<')) {
    return content;
  }
  return plainToHtml(content);
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
