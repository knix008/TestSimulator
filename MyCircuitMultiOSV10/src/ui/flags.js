// Small inline flags for the language toggle. The button shows the flag of
// the language it switches TO: the UK flag while the UI is Korean, the Korean
// flag while it is English.

export const UK_FLAG = `<svg class="flag" viewBox="0 0 60 30" width="24" height="12" aria-hidden="true">
<clipPath id="ukc"><rect width="60" height="30"/></clipPath>
<g clip-path="url(#ukc)">
<rect width="60" height="30" fill="#012169"/>
<path d="M0,0 60,30 M60,0 0,30" stroke="#fff" stroke-width="6"/>
<path d="M0,0 60,30 M60,0 0,30" stroke="#C8102E" stroke-width="2.4"/>
<path d="M30,0 V30 M0,15 H60" stroke="#fff" stroke-width="10"/>
<path d="M30,0 V30 M0,15 H60" stroke="#C8102E" stroke-width="6"/>
</g></svg>`;

export const KR_FLAG = `<svg class="flag" viewBox="0 0 36 24" width="24" height="16" aria-hidden="true">
<rect width="36" height="24" fill="#fff"/>
<g transform="translate(18 12) rotate(33.69)">
<path d="M-6,0 a6,6 0 0 1 12,0 a3,3 0 0 1 -6,0 a3,3 0 0 0 -6,0z" fill="#CD2E3A"/>
<path d="M6,0 a6,6 0 0 1 -12,0 a3,3 0 0 1 6,0 a3,3 0 0 0 6,0z" fill="#0047A0"/>
</g>
<g fill="#000">
<g transform="translate(18 12) rotate(-56.31) translate(0 -10)"><rect x="-3" y="-1.6" width="6" height="0.8"/><rect x="-3" y="-0.4" width="6" height="0.8"/><rect x="-3" y="0.8" width="6" height="0.8"/></g>
<g transform="translate(18 12) rotate(56.31) translate(0 -10)"><rect x="-3" y="-1.6" width="6" height="0.8"/><rect x="-3" y="-0.4" width="2.6" height="0.8"/><rect x="0.4" y="-0.4" width="2.6" height="0.8"/><rect x="-3" y="0.8" width="6" height="0.8"/></g>
<g transform="translate(18 12) rotate(123.69) translate(0 -10)"><rect x="-3" y="-1.6" width="2.6" height="0.8"/><rect x="0.4" y="-1.6" width="2.6" height="0.8"/><rect x="-3" y="-0.4" width="6" height="0.8"/><rect x="-3" y="0.8" width="2.6" height="0.8"/><rect x="0.4" y="0.8" width="2.6" height="0.8"/></g>
<g transform="translate(18 12) rotate(-123.69) translate(0 -10)"><rect x="-3" y="-1.6" width="2.6" height="0.8"/><rect x="0.4" y="-1.6" width="2.6" height="0.8"/><rect x="-3" y="-0.4" width="2.6" height="0.8"/><rect x="0.4" y="-0.4" width="2.6" height="0.8"/><rect x="-3" y="0.8" width="2.6" height="0.8"/><rect x="0.4" y="0.8" width="2.6" height="0.8"/></g>
</g>
<rect width="36" height="24" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="0.6"/>
</svg>`;
