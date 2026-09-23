'use strict';

/**
 * 16px menu glyphs, authored at 64x64 and downscaled.
 *
 * Native menus are drawn on a light or a dark background depending on the OS
 * theme, so every glyph uses mid-tone colours that stay legible on both and
 * avoids thin hairlines that disappear at 16px.
 */

const BLUE = '#3d6fd6';
const GREY = '#6b7684';
const AMBER = '#e08a1e';
const GREEN = '#1f9d61';
const RED = '#d2453b';
const VIOLET = '#7a4fd0';

/** A cog outline with `teeth` trapezoidal teeth, matching the dock glyph. */
function gear(cx, cy, rOuter, rRoot, teeth) {
  const step = (Math.PI * 2) / teeth;
  const half = step * 0.5;
  const tip = step * 0.17;
  const root = step * 0.30;
  const parts = [];

  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    const at = (angle, r) => `${(cx + Math.cos(angle) * r).toFixed(2)},${(cy + Math.sin(angle) * r).toFixed(2)}`;
    parts.push(`${i === 0 ? 'M' : 'L'}${at(a - tip, rOuter)}`);
    parts.push(`L${at(a + tip, rOuter)}`);
    parts.push(`L${at(a + half - root, rRoot)}`);
    parts.push(`L${at(a + half + root, rRoot)}`);
  }
  return `${parts.join('')}Z`;
}

function wrap(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${body}</svg>`;
}

/** A small check badge in the lower-right corner, marking the active choice. */
const CHECK_BADGE = `
  <circle cx="48" cy="48" r="15" fill="#ffffff"/>
  <circle cx="48" cy="48" r="13" fill="${GREEN}"/>
  <path d="M41 48.5l4.5 4.5L55 43" fill="none" stroke="#ffffff" stroke-width="5"
        stroke-linecap="round" stroke-linejoin="round"/>`;

/** Outline of a display, with one edge filled to show where the dock sits. */
function screenWithEdge(edge) {
  const bars = {
    bottom: '<rect x="12" y="38" width="40" height="10" rx="3"/>',
    top: '<rect x="12" y="16" width="40" height="10" rx="3"/>',
    left: '<rect x="12" y="16" width="10" height="32" rx="3"/>',
    right: '<rect x="42" y="16" width="10" height="32" rx="3"/>',
  };
  return `
  <rect x="6" y="10" width="52" height="44" rx="7" fill="none" stroke="${GREY}" stroke-width="5"/>
  <g fill="${BLUE}">${bars[edge]}</g>`;
}

const GLYPHS = {
  dock: `
  <rect x="4" y="34" width="56" height="18" rx="8" fill="${BLUE}" opacity=".28"/>
  <rect x="4" y="34" width="56" height="18" rx="8" fill="none" stroke="${BLUE}" stroke-width="4"/>
  <rect x="12" y="20" width="12" height="18" rx="3" fill="${AMBER}"/>
  <rect x="26" y="12" width="12" height="26" rx="3" fill="${BLUE}"/>
  <rect x="40" y="20" width="12" height="18" rx="3" fill="${VIOLET}"/>`,

  show: `
  <rect x="6" y="12" width="52" height="40" rx="7" fill="none" stroke="${GREY}" stroke-width="5"/>
  <rect x="14" y="34" width="36" height="10" rx="4" fill="${BLUE}"/>
  <circle cx="32" cy="24" r="6" fill="${GREY}"/>`,

  theme: `
  <path d="M32 8a24 24 0 1 0 0 48c4 0 6-2 6-5 0-4-4-4-4-8 0-3 3-5 7-5h5a10 10 0 0 0 10-10C56 17 45 8 32 8z"
        fill="none" stroke="${GREY}" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="22" cy="22" r="4.5" fill="${RED}"/>
  <circle cx="17" cy="35" r="4.5" fill="${BLUE}"/>
  <circle cx="26" cy="46" r="4.5" fill="${AMBER}"/>
  <circle cx="35" cy="18" r="4.5" fill="${VIOLET}"/>`,

  settings: `
  <path d="${gear(32, 32, 28, 20, 9)}" fill="${BLUE}" stroke="${BLUE}"
        stroke-width="2" stroke-linejoin="round"/>
  <circle cx="32" cy="32" r="9" fill="#ffffff"/>
  <circle cx="32" cy="32" r="9" fill="none" stroke="${BLUE}" stroke-width="2.5"/>`,

  reload: `
  <path d="M52 32a20 20 0 1 1-6-14" fill="none" stroke="${BLUE}" stroke-width="6" stroke-linecap="round"/>
  <path d="M48 6v14H34" fill="none" stroke="${BLUE}" stroke-width="6"
        stroke-linecap="round" stroke-linejoin="round"/>`,

  quit: `
  <path d="M32 8v24" fill="none" stroke="${RED}" stroke-width="7" stroke-linecap="round"/>
  <path d="M18 17a20 20 0 1 0 28 0" fill="none" stroke="${RED}" stroke-width="6" stroke-linecap="round"/>`,

  open: `
  <path d="M34 10H14a6 6 0 0 0-6 6v34a6 6 0 0 0 6 6h34a6 6 0 0 0 6-6V30"
        fill="none" stroke="${GREY}" stroke-width="5" stroke-linecap="round"/>
  <path d="M36 28L56 8" fill="none" stroke="${BLUE}" stroke-width="6" stroke-linecap="round"/>
  <path d="M42 8h14v14" fill="none" stroke="${BLUE}" stroke-width="6"
        stroke-linecap="round" stroke-linejoin="round"/>`,

  reveal: `
  <path d="M6 18h16l5 6h31a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z"
        fill="${AMBER}" fill-opacity=".85"/>
  <circle cx="40" cy="38" r="10" fill="none" stroke="#ffffff" stroke-width="5"/>
  <path d="M47 45l8 8" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>`,

  edit: `
  <path d="M14 42L42 14l10 10-28 28-13 3z" fill="${BLUE}" fill-opacity=".25"/>
  <path d="M14 42L42 14l10 10-28 28-13 3z" fill="none" stroke="${BLUE}" stroke-width="5"
        stroke-linejoin="round"/>
  <path d="M38 18l10 10" stroke="${BLUE}" stroke-width="5" stroke-linecap="round"/>`,

  remove: `
  <circle cx="32" cy="32" r="23" fill="none" stroke="${RED}" stroke-width="6"/>
  <path d="M21 32h22" stroke="${RED}" stroke-width="7" stroke-linecap="round"/>`,

  'add-app': `
  <rect x="7" y="7" width="30" height="30" rx="7" fill="${BLUE}" fill-opacity=".8"/>
  <circle cx="45" cy="45" r="16" fill="${GREEN}"/>
  <path d="M45 37v16M37 45h16" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>`,

  'add-folder': `
  <path d="M5 14h16l5 6h28a4 4 0 0 1 4 4v10H5z" fill="${AMBER}"/>
  <path d="M5 30h53v22a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="${AMBER}" fill-opacity=".62"/>
  <circle cx="46" cy="46" r="15" fill="${GREEN}"/>
  <path d="M46 39v14M39 46h14" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>`,

  separator: `
  <rect x="4" y="18" width="20" height="28" rx="5" fill="${GREY}" fill-opacity=".38"/>
  <rect x="40" y="18" width="20" height="28" rx="5" fill="${GREY}" fill-opacity=".38"/>
  <rect x="28" y="8" width="8" height="48" rx="4" fill="${BLUE}"/>`,

  app: `
  <rect x="9" y="9" width="46" height="46" rx="11" fill="${BLUE}" fill-opacity=".22"/>
  <rect x="9" y="9" width="46" height="46" rx="11" fill="none" stroke="${BLUE}" stroke-width="5"/>
  <circle cx="32" cy="32" r="8" fill="${BLUE}"/>`,

  link: `
  <circle cx="32" cy="32" r="23" fill="none" stroke="${BLUE}" stroke-width="5"/>
  <ellipse cx="32" cy="32" rx="10" ry="23" fill="none" stroke="${BLUE}" stroke-width="4"/>
  <path d="M10 24h44M10 40h44" stroke="${BLUE}" stroke-width="4" stroke-linecap="round"/>`,

  'toggle-on': `
  <rect x="4" y="18" width="56" height="28" rx="14" fill="${GREEN}"/>
  <circle cx="46" cy="32" r="10" fill="#ffffff"/>`,

  'toggle-off': `
  <rect x="4" y="18" width="56" height="28" rx="14" fill="${GREY}" fill-opacity=".55"/>
  <circle cx="18" cy="32" r="10" fill="#ffffff"/>`,

  language: `
  <circle cx="32" cy="32" r="24" fill="none" stroke="${BLUE}" stroke-width="5"/>
  <ellipse cx="32" cy="32" rx="10" ry="24" fill="none" stroke="${BLUE}" stroke-width="4"/>
  <path d="M9 24h46M9 40h46" stroke="${BLUE}" stroke-width="4" stroke-linecap="round"/>
  <path d="M32 8v48" stroke="${BLUE}" stroke-width="4"/>`,

  locked: `
  <rect x="14" y="28" width="36" height="28" rx="6" fill="${BLUE}"/>
  <path d="M23 28v-8a9 9 0 0 1 18 0v8" fill="none" stroke="${BLUE}" stroke-width="6"
        stroke-linecap="round"/>
  <circle cx="32" cy="41" r="4.5" fill="#ffffff"/>
  <rect x="30" y="41" width="4" height="9" rx="2" fill="#ffffff"/>`,

  unlocked: `
  <rect x="14" y="28" width="36" height="28" rx="6" fill="${GREY}" fill-opacity=".55"/>
  <path d="M23 28v-8a9 9 0 0 1 17-4" fill="none" stroke="${GREY}" stroke-width="6"
        stroke-linecap="round"/>
  <circle cx="32" cy="41" r="4.5" fill="#ffffff"/>
  <rect x="30" y="41" width="4" height="9" rx="2" fill="#ffffff"/>`,

  'trash-empty': `
  <path d="M18 20h28l-3 34a5 5 0 0 1-5 5H26a5 5 0 0 1-5-5z" fill="${GREY}" fill-opacity=".3"
        stroke="${GREY}" stroke-width="3.5" stroke-linejoin="round"/>
  <rect x="14" y="14" width="36" height="6" rx="3" fill="${GREY}"/>
  <rect x="26" y="7" width="12" height="6" rx="2.5" fill="${GREY}"/>
  <path d="M44 44l14 14M58 44L44 58" stroke="${RED}" stroke-width="5" stroke-linecap="round"/>`,

  'pos-bottom': screenWithEdge('bottom'),
  'pos-top': screenWithEdge('top'),
  'pos-left': screenWithEdge('left'),
  'pos-right': screenWithEdge('right'),
};

// Every "choose one of these" entry gets an -active twin carrying a check badge,
// because a menu item that owns an icon cannot also show a radio mark.
for (const name of ['theme', 'language', 'pos-bottom', 'pos-top', 'pos-left', 'pos-right']) {
  GLYPHS[`${name}-active`] = GLYPHS[name] + CHECK_BADGE;
}

const NAMES = Object.keys(GLYPHS);

function svg(name) {
  const body = GLYPHS[name];
  if (!body) throw new Error(`unknown menu glyph: ${name}`);
  return wrap(body);
}

module.exports = { svg, NAMES, GLYPHS };
