// Small flags for the language buttons: the flag of the language the button switches TO (the United Kingdom
// for English, Korea for 한국어). Drawn as SVG so they look the same on every system (Windows shows no flag emoji).

let seq = 0;

function unionJack() {
  const id = `uk-clip-${seq += 1}`;
  return `<svg class="flag" viewBox="0 0 60 30" width="22" height="11" aria-hidden="true">
    <clipPath id="${id}"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>
    <rect width="60" height="30" fill="#012169"/>
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/>
    <path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#${id})" stroke="#C8102E" stroke-width="4"/>
    <path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/>
    <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/>
  </svg>`;
}

/** The Korean flag: the red and blue circle and the four black trigrams on white. */
function taegukgi() {
  // A trigram: three bars, broken (two pieces) where `broken` is true; drawn upright, then turned into place.
  const bars = (broken, x, y, turn) => broken.map((split, i) => {
    const by = -3 + i * 2.2;
    return split
      ? `<rect x="-3" y="${by}" width="2.6" height="1.4"/><rect x="0.4" y="${by}" width="2.6" height="1.4"/>`
      : `<rect x="-3" y="${by}" width="6" height="1.4"/>`;
  }).join('').replace(/^/, `<g transform="translate(${x},${y}) rotate(${turn})">`) + '</g>';
  return `<svg class="flag" viewBox="0 0 36 24" width="22" height="15" aria-hidden="true">
    <rect width="36" height="24" fill="#fff" stroke="#c9ced6" stroke-width="0.6"/>
    <g transform="translate(18,12) rotate(33.69)">
      <circle r="6" fill="#0047A0"/>
      <path d="M-6,0 A6,6 0 0 1 6,0 A3,3 0 0 1 0,0 A3,3 0 0 0 -6,0 Z" fill="#CD2E3A"/>
    </g>
    <g fill="#000">
      ${bars([false, false, false], 6.5, 5, -56.31)}
      ${bars([true, true, true], 29.5, 19, -56.31)}
      ${bars([false, true, false], 29.5, 5, 56.31)}
      ${bars([true, false, true], 6.5, 19, 56.31)}
    </g>
  </svg>`;
}

/** The flag for a language code: 'en' → the United Kingdom, 'ko' → Korea. */
export function flag(lang) {
  return lang === 'en' ? unionJack() : taegukgi();
}
