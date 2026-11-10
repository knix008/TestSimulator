// The language button shows the flag of the language it switches to:
// the United Kingdom while the UI is Korean, Korea while it is English.
// Each call gets its own clip ids, so two buttons on one page both paint.

let seq = 0;

function unitedKingdom(id) {
  return `<svg class="flag" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <clipPath id="${id}-clip"><path d="M0 0v30h60V0z"/></clipPath>
  <clipPath id="${id}-diag"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath>
  <g clip-path="url(#${id}-clip)">
    <path d="M0 0v30h60V0z" fill="#012169"/>
    <path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/>
    <path d="M0 0l60 30m0-30L0 30" clip-path="url(#${id}-diag)" stroke="#C8102E" stroke-width="4"/>
    <path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/>
    <path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/>
  </g>
</svg>`;
}

function korea(id) {
  return `<svg class="flag" viewBox="-36 -24 72 48" aria-hidden="true">
  <rect x="-36" y="-24" width="72" height="48" fill="#fff"/>
  <g transform="rotate(-56.31)">
    <g id="${id}-bars"><path id="${id}-bar" d="M-6-25H6M-6-22H6M-6-19H6" stroke="#000" stroke-width="2"/><use href="#${id}-bar" y="44"/></g>
    <path d="M0 17v10" stroke="#fff"/>
    <circle r="12" fill="#cd2e3a"/>
    <path d="M0-12A6 6 0 0 0 0 0a6 6 0 0 1 0 12 12 12 0 0 1 0-24z" fill="#0047a0"/>
  </g>
  <g transform="rotate(-123.69)">
    <use href="#${id}-bars"/>
    <path d="M0-23.5v3M0 17v3.5M0 23.5v3" stroke="#fff"/>
  </g>
</svg>`;
}

/** The flag of a language: `ko` is Korea, anything else is the United Kingdom. */
export function languageFlag(language) {
  const id = `flag${seq++}`;
  return language === 'ko' ? korea(id) : unitedKingdom(id);
}

/** Flag for the button that switches away from `language`. */
export const switchFlag = (language) => languageFlag(language === 'ko' ? 'en' : 'ko');
