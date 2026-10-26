// National flags as inline SVG (emoji flags do not render on Windows).
// Korea: the Taegukgi (white field, red-over-blue taeguk, four trigrams);
// UK: the Union Jack. Both drawn without ids so any number can be on a page.
import React from 'react';

const BARS = 'M-6-25H6M-6-22H6M-6-19H6M-6 19H6M-6 22H6M-6 25H6';

export function FlagKR({ width = 22, height = 15, title }) {
  return (
    <svg className="flag flag-kr" width={width} height={height} viewBox="-36 -24 72 48" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'}>
      <rect x="-36" y="-24" width="72" height="48" fill="#fff" />
      <g transform="rotate(-56.31)">
        <path d={BARS} stroke="#000" strokeWidth="2" />
        <path stroke="#fff" strokeWidth="1" d="M0,17v10" />
        <circle fill="#cd2e3a" r="12" />
        <path fill="#0047a0" d="M0-12A6,6 0 0 0 0,0A6,6 0 0 1 0,12A12,12 0 0,1 0-12Z" />
      </g>
      <g transform="rotate(-123.69)">
        <path d={BARS} stroke="#000" strokeWidth="2" />
        <path stroke="#fff" strokeWidth="1" d="M0-23.5v3M0,17v3.5M0,23.5v3" />
      </g>
    </svg>
  );
}

export function FlagGB({ width = 22, height = 15, title }) {
  return (
    <svg className="flag flag-gb" width={width} height={height} viewBox="0 0 60 30" preserveAspectRatio="none" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'}>
      <clipPath id="gb-t-clip"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#gb-t-clip)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

export const LANGUAGES = [
  { value: 'ko', label: '한국어', short: 'KO', Flag: FlagKR },
  { value: 'en', label: 'English', short: 'EN', Flag: FlagGB },
];

export function LangFlag({ lang, ...rest }) {
  const L = (LANGUAGES.find((l) => l.value === lang) || LANGUAGES[0]).Flag;
  return <L {...rest} />;
}

/** IconSelect options for the language with flags. */
export function languageOptions() {
  return LANGUAGES.map((l) => ({ value: l.value, label: l.label, flag: l.value, iconNode: <l.Flag width={20} height={14} /> }));
}
