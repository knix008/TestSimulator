// Flag glyphs for the language switch. The button shows the flag of the
// language you switch to: the Union Jack while the UI is Korean, the Taegukgi
// while it is English.

export function UnionJack({ size = 20 }: { size?: number }) {
  const w = size * 1.5
  const h = size
  return (
    <svg width={w} height={h} viewBox="0 0 60 40" role="img" aria-label="English" data-testid="flag-en">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" strokeWidth="8" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 V40 M0,20 H60" stroke="#ffffff" strokeWidth="13" />
      <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="8" />
    </svg>
  )
}

export function Taegukgi({ size = 20 }: { size?: number }) {
  const w = size * 1.5
  const h = size
  const bar = (x: number, y: number, rotate: number, gaps: number[]) => (
    <g transform={`rotate(${rotate} ${x} ${y})`} key={`${x}-${y}-${rotate}`}>
      {gaps.map((gap, index) => {
        const offset = (index - 1) * 4
        return gap === 1
          ? <rect key={index} x={x - 9} y={y + offset - 1.2} width="18" height="2.4" fill="#000000" />
          : (
            <g key={index}>
              <rect x={x - 9} y={y + offset - 1.2} width="7.6" height="2.4" fill="#000000" />
              <rect x={x + 1.4} y={y + offset - 1.2} width="7.6" height="2.4" fill="#000000" />
            </g>
          )
      })}
    </g>
  )
  return (
    <svg width={w} height={h} viewBox="0 0 60 40" role="img" aria-label="한국어" data-testid="flag-ko">
      <rect width="60" height="40" fill="#ffffff" />
      <g transform="rotate(-33.69 30 20)">
        <circle cx="30" cy="20" r="9" fill="#CD2E3A" />
        <path d="M21,20 a4.5,4.5 0 0,1 9,0 a4.5,4.5 0 0,0 9,0 a9,9 0 0,1 -18,0" fill="#0047A0" />
      </g>
      {bar(11, 9, 56.3, [1, 1, 1])}
      {bar(49, 9, -56.3, [0, 1, 0])}
      {bar(11, 31, -56.3, [1, 0, 1])}
      {bar(49, 31, 56.3, [0, 0, 0])}
    </svg>
  )
}

/** The flag for the language the button switches to. */
export function LanguageFlag({ language, size = 20 }: { language: 'ko' | 'en'; size?: number }) {
  return language === 'ko' ? <UnionJack size={size} /> : <Taegukgi size={size} />
}
