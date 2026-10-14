// Small national flags for the language toggle (inline SVG: emoji flags do not
// render on Windows). The button shows the flag of the language it switches TO.

/** Korea (Taegukgi), drawn to the official proportions (3:2). */
export const FLAG_KO = `<svg class="flag" viewBox="-36 -24 72 48" aria-hidden="true">
<rect x="-36" y="-24" width="72" height="48" fill="#fff"/>
<g transform="rotate(-56.3099)"><path d="M-6-25H6M-6-22H6M-6-19H6M-6 19H6M-6 22H6M-6 25H6" stroke="#000" stroke-width="2"/><path d="M0 17v10" stroke="#fff"/>
<circle r="12" fill="#cd2e3a"/><path d="M0-12A6 6 0 0 0 0 0A6 6 0 0 1 0 12A12 12 0 0 1 0-12Z" fill="#0047a0"/></g>
<g transform="rotate(-123.6901)"><path d="M-6-25H6M-6-22H6M-6-19H6M-6 19H6M-6 22H6M-6 25H6" stroke="#000" stroke-width="2"/><path d="M0-23.5v3M0 17v3.5M0 23.5v3" stroke="#fff"/></g>
<rect x="-35.5" y="-23.5" width="71" height="47" fill="none" stroke="#000" stroke-opacity="0.25"/>
</svg>`;

/** United Kingdom (Union Jack, 2:1). */
export const FLAG_EN = `<svg class="flag" viewBox="0 0 60 30" aria-hidden="true">
<rect width="60" height="30" fill="#012169"/>
<path d="M0 0L60 30M60 0L0 30" stroke="#fff" stroke-width="6"/>
<path d="M0 0L30 15M60 30L30 15" stroke="#c8102e" stroke-width="2" transform="translate(0 -1.3)"/>
<path d="M60 0L30 15M0 30L30 15" stroke="#c8102e" stroke-width="2" transform="translate(0 1.3)"/>
<path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/>
<path d="M30 0v30M0 15h60" stroke="#c8102e" stroke-width="6"/>
</svg>`;
