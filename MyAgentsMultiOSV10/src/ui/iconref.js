// IconRefs (ARCHITECTURE.md §4): the one way a project, issue type, priority, label, board, user …
// carries a picture. Stored as a string in any `icon` / `avatar` column, usable in Markdown as `:icon[<ref>]`.
//
//   b:<name>            built-in vector icon (icons-catalog.js, several hundred), coloured by its tone
//   b:<name>#rrggbb     built-in icon tinted
//   e:<emoji>           an emoji (system emoji font)
//   u:<iconId>          an uploaded picture, served by the core at GET /api/icons/<id>
//   l:<text>#rrggbb     a letter avatar: 1–2 letters on a colour
//
// renderIconRef returns HTML (safe to insert: every value is escaped or validated). Unknown or empty refs
// render a neutral dot, so a broken row never breaks a page.
import { CATALOG } from '../icons-catalog.js';
import { EMOJI } from './emoji-data.js';
import { toneOf } from '../icon-tones.js';
import { escapeHtml } from './dom.js';

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** Other spellings of catalogue names (the core's defaults use 'priority-highest' …). */
export const ICON_ALIASES = {
  'priority-highest': 'highest', 'priority-high': 'high', 'priority-medium': 'medium', 'priority-low': 'low', 'priority-lowest': 'lowest',
  priority: 'high', 'in-progress': 'inProgress', doing: 'inProgress', 'to-do': 'todo',
};

/** The catalogue name for a built-in name: itself, an alias, or its camelCase form ('check-circle' → 'checkCircle'). */
export function resolveBuiltin(name) {
  const raw = String(name ?? '');
  if (Object.hasOwn(CATALOG, raw)) return raw;
  const alias = ICON_ALIASES[raw] ?? ICON_ALIASES[raw.toLowerCase()];
  if (alias && Object.hasOwn(CATALOG, alias)) return alias;
  const camel = raw.toLowerCase().replace(/[-_ ]+([a-z0-9])/g, (m, c) => c.toUpperCase());
  return Object.hasOwn(CATALOG, camel) ? camel : null;
}

/** '#abc' / 'abc' / '#aabbcc' → '#aabbcc' (lowercase), or null. */
export function normalizeColor(value) {
  const m = HEX.exec(String(value ?? '').trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${hex.toLowerCase()}`;
}

/** Text colour that reads on `background` (#rrggbb): near-black or white. */
export function readableOn(background) {
  const hex = normalizeColor(background) ?? '#888888';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#1b1f24' : '#ffffff';
}

/**
 * Parses an IconRef: { kind: 'builtin'|'emoji'|'upload'|'letters'|'none', name?, emoji?, id?, text?, color? }.
 * A ref without a known prefix is read as an emoji when it looks like one, else as a built-in name.
 */
export function parseIconRef(ref) {
  const raw = String(ref ?? '').trim();
  if (!raw) return { kind: 'none' };
  const prefix = raw.slice(0, 2);
  const body = raw.slice(2);
  if (prefix === 'b:') {
    const at = body.lastIndexOf('#');
    const written = at >= 0 ? body.slice(0, at) : body;
    const resolved = resolveBuiltin(written);
    return { kind: 'builtin', name: resolved ?? written, color: at >= 0 ? normalizeColor(body.slice(at + 1)) : null, known: Boolean(resolved) };
  }
  if (prefix === 'e:') return body ? { kind: 'emoji', emoji: body } : { kind: 'none' };
  if (prefix === 'u:') return /^[A-Za-z0-9_-]{1,64}$/.test(body) ? { kind: 'upload', id: body } : { kind: 'none' };
  if (prefix === 'l:') {
    const at = body.lastIndexOf('#');
    const text = (at >= 0 ? body.slice(0, at) : body).trim();
    return { kind: 'letters', text: [...text].slice(0, 2).join('').toUpperCase(), color: at >= 0 ? normalizeColor(body.slice(at + 1)) : null };
  }
  if (/\p{Extended_Pictographic}/u.test(raw)) return { kind: 'emoji', emoji: raw };
  if (resolveBuiltin(raw)) return { kind: 'builtin', name: resolveBuiltin(raw), color: null, known: true };
  return { kind: 'none' };
}

/** Builds a ref string from parts (the icon picker's result). */
export function makeIconRef({ kind, name, emoji, id, text, color } = {}) {
  const tint = normalizeColor(color);
  if (kind === 'builtin' && name) return `b:${name}${tint ? tint : ''}`;
  if (kind === 'emoji' && emoji) return `e:${emoji}`;
  if (kind === 'upload' && id) return `u:${id}`;
  if (kind === 'letters' && text) return `l:${[...String(text).trim()].slice(0, 2).join('')}${tint ?? '#5b6ee1'}`;
  return '';
}

/** A stable colour for a name (letter avatars of users without one). */
export function colorFor(name) {
  const palette = ['#5b6ee1', '#2f9e8f', '#d9822b', '#c2417a', '#7a5af8', '#3b82c4', '#5f9e35', '#b4533a', '#8a6d3b', '#4f6d7a'];
  let h = 7;
  for (const c of String(name ?? '')) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return palette[h % palette.length];
}

/** The SVG of a built-in catalogue icon (its inner markup is trusted data from icons-catalog.js). */
export function builtinSvg(name, { size = 18, color = null, className = 'iconref' } = {}) {
  const entry = CATALOG[name];
  const body = entry ? entry.d : '<circle cx="12" cy="12" r="3" fill="currentColor"/>';
  const tint = normalizeColor(color);
  const style = `width:${size}px;height:${size}px${tint ? `;color:${tint}` : ''}`;
  return `<svg class="${className} iconref-b" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${tint ? '' : ` data-tone="${toneOf(name)}"`} style="${style}" aria-hidden="true">${body}</svg>`;
}

let apiBaseOf = () => '/api';
/** Where uploaded icons are served (the app sets it once the core's address is known). */
export function setIconApiBase(base) { apiBaseOf = typeof base === 'function' ? base : () => base; }
export const uploadedIconUrl = (id) => `${String(apiBaseOf() ?? '/api').replace(/\/$/, '')}/icons/${encodeURIComponent(id)}`;

/**
 * HTML for an IconRef. `size` in px; `title` adds a tooltip; `className` is added to the element.
 * `fallback`: an IconRef used when `ref` is empty or unknown (e.g. 'l:AB#5b6ee1' for a user without an avatar).
 */
export function renderIconRef(ref, { size = 18, title = '', className = '', fallback = '' } = {}) {
  let parsed = parseIconRef(ref);
  if ((parsed.kind === 'none' || (parsed.kind === 'builtin' && !parsed.known)) && fallback) parsed = parseIconRef(fallback);
  const tip = title ? ` title="${escapeHtml(title)}"` : '';
  const cls = className ? ` ${escapeHtml(className)}` : '';
  switch (parsed.kind) {
    case 'builtin':
      return builtinSvg(parsed.known ? parsed.name : '', { size, color: parsed.color, className: `iconref${cls}` }).replace('<svg ', `<svg${tip} `);
    case 'emoji':
      return `<span class="iconref iconref-e${cls}"${tip} style="font-size:${Math.round(size * 0.92)}px;width:${size}px;height:${size}px" role="img" aria-label="${escapeHtml(title || parsed.emoji)}">${escapeHtml(parsed.emoji)}</span>`;
    case 'upload':
      return `<img class="iconref iconref-u${cls}"${tip} src="${escapeHtml(uploadedIconUrl(parsed.id))}" alt="${escapeHtml(title)}" width="${size}" height="${size}" loading="lazy" draggable="false" />`;
    case 'letters': {
      const bg = parsed.color ?? colorFor(parsed.text);
      return `<span class="iconref iconref-l${cls}"${tip} style="width:${size}px;height:${size}px;font-size:${Math.max(8, Math.round(size * (parsed.text.length > 1 ? 0.42 : 0.52)))}px;background:${bg};color:${readableOn(bg)}" role="img" aria-label="${escapeHtml(title || parsed.text)}">${escapeHtml(parsed.text || '?')}</span>`;
    }
    default:
      return `<span class="iconref iconref-none${cls}"${tip} style="width:${size}px;height:${size}px" aria-hidden="true"></span>`;
  }
}

/**
 * Replaces `:icon[<ref>]` in already-escaped HTML text with the icon (Markdown rendering calls this
 * after escaping). The ref inside the brackets is unescaped first (it was escaped with the text).
 */
export function renderIconRefsInHtml(html, { size = 16 } = {}) {
  const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return String(html ?? '').replace(/:icon\[([^\]\n]{1,120})\]/g, (match, ref) => renderIconRef(unescape(ref), { size, className: 'iconref-inline' }));
}

/** A short readable name of a ref (tooltips, screen readers). */
// An emoji's readable name: its keywords in the emoji list (ko or en), e.g. '돋보기 검색', else ''.
let emojiNames = null;
function emojiName(emoji, language) {
  emojiNames ??= new Map(EMOJI.map(([e, , en, ko]) => [e.replace(/️/g, ''), { en: String(en ?? ''), ko: String(ko ?? '') }]));
  const entry = emojiNames.get(String(emoji).replace(/️/g, ''));
  return entry ? (language === 'en' ? entry.en : entry.ko || entry.en) : '';
}

export function iconRefLabel(ref, language = 'ko') {
  const p = parseIconRef(ref);
  if (p.kind === 'builtin') return CATALOG[p.name]?.[language === 'en' ? 'en' : 'ko'] ?? p.name;
  if (p.kind === 'emoji') return emojiName(p.emoji, language) || p.emoji;
  if (p.kind === 'letters') return p.text;
  if (p.kind === 'upload') return language === 'en' ? 'Uploaded picture' : '올린 그림';
  return '';
}
