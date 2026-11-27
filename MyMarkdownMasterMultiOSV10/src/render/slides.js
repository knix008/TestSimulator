// Pure helpers of the presentation modes (presentation.js): splitting rendered HTML into slides at top-level
// <hr>, and the reading presentation's preferences.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/** The HTML split at <hr> elements that are not inside any other element. Empty slides are dropped. */
export function splitSlides(html) {
  const text = String(html ?? '');
  const slides = [];
  const tag = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let depth = 0;
  let start = 0;
  let raw = null; // inside <script>/<style>…: only its end tag counts
  let m;
  while ((m = tag.exec(text))) {
    if (m[0].startsWith('<!--')) continue;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    if (raw) { if (closing && name === raw) raw = null; continue; }
    if (closing) { depth = Math.max(0, depth - 1); continue; }
    if (name === 'hr') {
      if (depth === 0) { slides.push(text.slice(start, m.index)); start = m.index + m[0].length; }
      continue;
    }
    if (VOID.has(name) || /\/\s*$/.test(m[3])) continue;
    if (RAW_TEXT.has(name)) { raw = name; continue; }
    depth += 1;
  }
  slides.push(text.slice(start));
  return slides.filter((s) => s.replace(/<!--[\s\S]*?-->/g, '').trim() !== '');
}

// ───────── reading presentation (Markdific's presentation mode)

export const READING_THEMES = ['app', 'original', 'dark', 'creamy', 'solarized', 'contrast'];
export const READING_DEFAULTS = Object.freeze({ fontSize: 26, lineHeight: 1.7, width: 900, contrast: 'normal', theme: 'app', speed: 40 });
export const READING_LIMITS = Object.freeze({ fontSize: [14, 72], lineHeight: [1.1, 2.6], width: [480, 1800], speed: [5, 300] });

const clampNum = (value, [min, max], fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Stored preferences (anything) → complete, valid preferences. */
export function normalizeReadingPrefs(prefs) {
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  return {
    fontSize: Math.round(clampNum(p.fontSize, READING_LIMITS.fontSize, READING_DEFAULTS.fontSize)),
    lineHeight: Math.round(clampNum(p.lineHeight, READING_LIMITS.lineHeight, READING_DEFAULTS.lineHeight) * 10) / 10,
    width: Math.round(clampNum(p.width, READING_LIMITS.width, READING_DEFAULTS.width)),
    contrast: p.contrast === 'high' ? 'high' : 'normal',
    theme: READING_THEMES.includes(p.theme) ? p.theme : READING_DEFAULTS.theme,
    speed: Math.round(clampNum(p.speed, READING_LIMITS.speed, READING_DEFAULTS.speed)),
  };
}
