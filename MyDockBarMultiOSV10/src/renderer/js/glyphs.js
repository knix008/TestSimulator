/* Built-in icons for the dock's own entries and for targets whose real icon
 * could not be extracted. Drawn with gradients + a highlight so they sit
 * comfortably next to real, glossy application icons. */
(function () {
  'use strict';

  function svg(body, defs) {
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<defs>${defs || ''}
<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/>
  <stop offset=".5" stop-color="#ffffff" stop-opacity=".08"/>
  <stop offset=".5" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<filter id="drop" x="-30%" y="-30%" width="160%" height="160%">
  <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".38"/>
</filter>
</defs>${body}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}`;
  }

  /**
   * A cog outline: `teeth` trapezoidal teeth around a ring. Built as a path so
   * it stays crisp at any icon size.
   */
  function gear(cx, cy, rOuter, rRoot, teeth) {
    const step = (Math.PI * 2) / teeth;
    const half = step * 0.5;
    const tip = step * 0.17;      // half-width of a tooth at its tip
    const root = step * 0.30;     // half-width of the valley between teeth
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

  function plate(from, to, id) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
  }

  const rounded = (fill) =>
    `<rect x="10" y="10" width="108" height="108" rx="26" fill="${fill}" filter="url(#drop)"/>
     <rect x="10" y="10" width="108" height="108" rx="26" fill="url(#gloss)"/>`;

  const GLYPHS = {
    'system:home': svg(
      `${rounded('url(#bgHome)')}
       <path d="M64 34 30 62v32a6 6 0 0 0 6 6h18V78h20v22h18a6 6 0 0 0 6-6V62z"
             fill="#fff" fill-opacity=".95"/>
       <path d="M64 30 26 62l5 6 33-27 33 27 5-6z" fill="#fff"/>`,
      plate('#5aa9ff', '#1d5fd0', 'bgHome')),

    // Empty: a plain bin, lid closed, nothing inside.
    'system:trash': svg(
      `${rounded('url(#bgTrash)')}
       <path d="M44 48h40l-4 48a6 6 0 0 1-6 6H54a6 6 0 0 1-6-6z" fill="#fff" fill-opacity=".92"/>
       <rect x="38" y="38" width="52" height="9" rx="4" fill="#fff"/>
       <rect x="56" y="30" width="16" height="8" rx="3" fill="#fff"/>
       <g stroke="#9aa4b2" stroke-width="3" stroke-linecap="round">
         <path d="M58 60v30M64 60v30M70 60v30"/></g>`,
      plate('#9aa4b2', '#4a5563', 'bgTrash')),

    // Full: the lid is tilted off and paper is piled above the rim.
    'system:trash-full': svg(
      `${rounded('url(#bgTrashF)')}
       <g fill="#ffe9a8">
         <path d="M52 40l10-14 9 7-7 11z"/>
         <path d="M68 34l13-9 6 9-11 8z"/>
         <path d="M44 42l7-12 8 6-5 10z"/>
       </g>
       <path d="M44 48h40l-4 48a6 6 0 0 1-6 6H54a6 6 0 0 1-6-6z" fill="#fff" fill-opacity=".97"/>
       <rect x="36" y="38" width="56" height="9" rx="4" fill="#fff"
             transform="rotate(-6 64 42)"/>
       <g stroke="#6f7987" stroke-width="3" stroke-linecap="round">
         <path d="M58 60v30M64 60v30M70 60v30"/></g>`,
      plate('#ffc860', '#c07a12', 'bgTrashF')),

    'system:show-desktop': svg(
      `${rounded('url(#bgDesk)')}
       <rect x="28" y="36" width="72" height="46" rx="6" fill="#fff" fill-opacity=".95"/>
       <rect x="34" y="42" width="60" height="34" rx="3" fill="#2b6cb0" fill-opacity=".55"/>
       <path d="M52 92h24l4 8H48z" fill="#fff" fill-opacity=".9"/>`,
      plate('#57cf9a', '#12855c', 'bgDesk')),

    'system:documents': svg(
      `${rounded('url(#bgDoc)')}
       <path d="M44 32h28l18 18v46a4 4 0 0 1-4 4H44a4 4 0 0 1-4-4V36a4 4 0 0 1 4-4z"
             fill="#fff" fill-opacity=".95"/>
       <path d="M72 32l18 18H76a4 4 0 0 1-4-4z" fill="#c9d6e6"/>
       <g stroke="#8fa0b5" stroke-width="4" stroke-linecap="round">
         <path d="M52 62h28M52 74h28M52 86h18"/></g>`,
      plate('#ffc860', '#e08a1e', 'bgDoc')),

    'system:downloads': svg(
      `${rounded('url(#bgDl)')}
       <path d="M64 30v40" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
       <path d="M44 62l20 20 20-20" fill="none" stroke="#fff" stroke-width="10"
             stroke-linecap="round" stroke-linejoin="round"/>
       <rect x="36" y="88" width="56" height="10" rx="5" fill="#fff"/>`,
      plate('#7b8cff', '#3b3fc4', 'bgDl')),

    'dock:settings': svg(
      `${rounded('url(#bgSet)')}
       <path d="${gear(64, 64, 42, 31, 9)}" fill="#ffffff" fill-opacity=".96"
             stroke="#e2e8f0" stroke-width="1.5" stroke-linejoin="round"/>
       <path d="${gear(64, 64, 42, 31, 9)}" fill="url(#gloss)"/>
       <circle cx="64" cy="64" r="15" fill="#5d6875"/>
       <circle cx="64" cy="64" r="15" fill="none" stroke="#39414c" stroke-width="2"/>
       <circle cx="64" cy="64" r="8" fill="#8f9aa8"/>`,
      plate('#c8d2e0', '#5d6875', 'bgSet')),

    folder: svg(
      `${rounded('url(#bgFolder)')}
       <path d="M32 44h22l8 8h34a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4V48a4 4 0 0 1 4-4z"
             fill="#fff" fill-opacity=".95"/>
       <path d="M28 62h72v30a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4z" fill="#ffe9b0"/>`,
      plate('#ffd36e', '#e39a17', 'bgFolder')),

    url: svg(
      `${rounded('url(#bgUrl)')}
       <circle cx="64" cy="64" r="28" fill="none" stroke="#fff" stroke-width="7"/>
       <ellipse cx="64" cy="64" rx="12" ry="28" fill="none" stroke="#fff" stroke-width="5"/>
       <path d="M38 52h52M38 76h52" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
      plate('#4fd0e0', '#1585a8', 'bgUrl')),

    unknown: svg(
      `${rounded('url(#bgUnk)')}
       <path d="M64 84V72c9 0 14-5 14-12a14 14 0 0 0-28 0" fill="none" stroke="#fff"
             stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="64" cy="98" r="6" fill="#fff"/>`,
      plate('#8e97a6', '#49525f', 'bgUnk')),
  };

  window.DockGlyphs = {
    /** Best available image for an item, falling back by type. */
    forItem(item) {
      if (item.iconUrl) return item.iconUrl;
      if (GLYPHS[item.path]) return GLYPHS[item.path];
      if (item.type === 'folder') return GLYPHS.folder;
      if (item.type === 'url') return GLYPHS.url;
      return GLYPHS.unknown;
    },
    get: (key) => GLYPHS[key] || GLYPHS.unknown,
    all: GLYPHS,
  };
})();
