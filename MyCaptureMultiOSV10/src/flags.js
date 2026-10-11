// Language switch flags. The button shows the flag of the language it switches TO:
// the United Kingdom while the UI is Korean, Korea while it is English.

const unitedKingdom = `<svg class="flag" viewBox="0 0 60 30" aria-hidden="true">
  <clipPath id="flag-uk-clip"><path d="M0 0v30h60V0z"/></clipPath>
  <clipPath id="flag-uk-diag"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath>
  <g clip-path="url(#flag-uk-clip)">
    <path d="M0 0v30h60V0z" fill="#012169"/>
    <path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/>
    <path d="M0 0l60 30m0-30L0 30" clip-path="url(#flag-uk-diag)" stroke="#C8102E" stroke-width="4"/>
    <path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/>
    <path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/>
  </g>
</svg>`;

// Taegukgi: red-over-blue taeguk on the flag's diagonal, geon ☰ (top left),
// gon ☷ (bottom right), gam ☵ (top right) and ri ☲ (bottom left).
const korea = `<svg class="flag" viewBox="-36 -24 72 48" aria-hidden="true">
  <rect x="-36" y="-24" width="72" height="48" fill="#fff"/>
  <g transform="rotate(-56.31)">
    <g id="flag-kr-bars"><path id="flag-kr-bar" d="M-6-25H6M-6-22H6M-6-19H6" stroke="#000" stroke-width="2"/><use href="#flag-kr-bar" y="44"/></g>
    <path d="M0 17v10" stroke="#fff"/>
    <circle r="12" fill="#cd2e3a"/>
    <path d="M0-12A6 6 0 0 0 0 0a6 6 0 0 1 0 12 12 12 0 0 1 0-24z" fill="#0047a0"/>
  </g>
  <g transform="rotate(-123.69)">
    <use href="#flag-kr-bars"/>
    <path d="M0-23.5v3M0 17v3.5M0 23.5v3" stroke="#fff"/>
  </g>
</svg>`;

/** Flag for the button that switches away from `language`. */
export const switchFlag = (language) => (language === 'ko' ? unitedKingdom : korea);
