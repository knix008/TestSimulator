/**
 * The two flags on the language button. Drawn inline so they render the same
 * on every platform, at any size, in any theme. The button shows the flag of
 * the language it would switch *to*: the Union Jack while the interface is
 * Korean, the Taegukgi while it is English.
 */
export function FlagKorea({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size * 2 / 3} viewBox="0 0 36 24" aria-hidden>
      <rect width="36" height="24" rx="2" fill="#ffffff" stroke="#c8c8c8" strokeWidth="0.5" />
      <g transform="translate(18 12)">
        <g transform="rotate(-33.7)">
          <circle r="5.4" fill="#cd2e3a" />
          <path d="M-5.4 0a5.4 5.4 0 0 0 10.8 0a2.7 2.7 0 0 1-5.4 0a2.7 2.7 0 0 0-5.4 0z" fill="#0047a0" />
          <g fill="#000000">
            <rect x="-9.3" y="-1" width="3" height="0.55" transform="rotate(0)" />
          </g>
        </g>
        <g fill="#000000" transform="rotate(-33.7)">
          <rect x="-11" y="-1.9" width="4" height="0.7" />
          <rect x="-11" y="-0.35" width="4" height="0.7" />
          <rect x="-11" y="1.2" width="4" height="0.7" />
          <rect x="7" y="-1.9" width="1.8" height="0.7" /><rect x="9.2" y="-1.9" width="1.8" height="0.7" />
          <rect x="7" y="-0.35" width="1.8" height="0.7" /><rect x="9.2" y="-0.35" width="1.8" height="0.7" />
          <rect x="7" y="1.2" width="1.8" height="0.7" /><rect x="9.2" y="1.2" width="1.8" height="0.7" />
        </g>
        <g fill="#000000" transform="rotate(33.7)">
          <rect x="-11" y="-1.9" width="4" height="0.7" />
          <rect x="-11" y="-0.35" width="1.8" height="0.7" /><rect x="-8.8" y="-0.35" width="1.8" height="0.7" />
          <rect x="-11" y="1.2" width="4" height="0.7" />
          <rect x="7" y="-1.9" width="1.8" height="0.7" /><rect x="9.2" y="-1.9" width="1.8" height="0.7" />
          <rect x="7" y="-0.35" width="4" height="0.7" />
          <rect x="7" y="1.2" width="1.8" height="0.7" /><rect x="9.2" y="1.2" width="1.8" height="0.7" />
        </g>
      </g>
    </svg>
  )
}

export function FlagUnitedKingdom({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size * 2 / 3} viewBox="0 0 36 24" aria-hidden>
      <clipPath id="uk-clip"><rect width="36" height="24" rx="2" /></clipPath>
      <g clipPath="url(#uk-clip)">
        <rect width="36" height="24" fill="#012169" />
        <path d="M0 0l36 24M36 0L0 24" stroke="#ffffff" strokeWidth="4.8" />
        <path d="M0 0l36 24M36 0L0 24" stroke="#c8102e" strokeWidth="1.6" />
        <path d="M18 0v24M0 12h36" stroke="#ffffff" strokeWidth="8" />
        <path d="M18 0v24M0 12h36" stroke="#c8102e" strokeWidth="4.8" />
      </g>
    </svg>
  )
}
