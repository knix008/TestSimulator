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

/**
 * Taegukgi, drawn to the proportions of the standard: a 3:2 field, a taeguk of
 * one third the width in the middle, and the four trigrams on the diagonals.
 *
 * Each trigram is stacked along its diagonal, so every bar is perpendicular to
 * the line that runs from it to the centre of the flag. With the flag 3:2 that
 * diagonal is at 33.69°, which puts the bars at 56.31° from the horizontal.
 */
export function Taegukgi({ size = 20 }: { size?: number }) {
  const w = size * 1.5
  const h = size

  const BAR = 12 // length of one bar
  const THICK = 2 // its thickness
  const STEP = 3.6 // distance between the three bars
  const SPLIT = 2 // gap in the middle of a broken bar

  /** One trigram: three bars, `solid` reading from the outside inwards. */
  const trigram = (cx: number, cy: number, rotate: number, solid: boolean[]) => (
    <g transform={`rotate(${rotate} ${cx} ${cy})`} key={`${cx}-${cy}`}>
      {solid.map((whole, index) => {
        const y = cy + (index - 1) * STEP - THICK / 2
        if (whole) {
          return <rect key={index} x={cx - BAR / 2} y={y} width={BAR} height={THICK} fill="#000000" />
        }
        const half = (BAR - SPLIT) / 2
        return (
          <g key={index}>
            <rect x={cx - BAR / 2} y={y} width={half} height={THICK} fill="#000000" />
            <rect x={cx + SPLIT / 2} y={y} width={half} height={THICK} fill="#000000" />
          </g>
        )
      })}
    </g>
  )

  return (
    <svg width={w} height={h} viewBox="0 0 60 40" role="img" aria-label="한국어" data-testid="flag-ko">
      <rect width="60" height="40" fill="#ffffff" />
      {/* Taeguk: red above, blue below, the axis tilted along the diagonal. */}
      {/* Mirrored, then tilted along the diagonal: red on top with its head at
          the hoist, blue below with its head at the fly, as the flag has it. */}
      <g transform="rotate(-33.69 30 20) translate(60 0) scale(-1 1)">
        <circle cx="30" cy="20" r="10" fill="#CD2E3A" />
        <path d="M20,20 a5,5 0 0,1 10,0 a5,5 0 0,0 10,0 a10,10 0 0,1 -20,0" fill="#0047A0" />
      </g>
      {/* 건 ☰ hoist top, 감 ☵ fly top, 리 ☲ hoist bottom, 곤 ☷ fly bottom. */}
      {trigram(10.6, 7.1, -56.31, [true, true, true])}
      {trigram(49.4, 7.1, 56.31, [false, true, false])}
      {trigram(10.6, 32.9, -123.69, [true, false, true])}
      {trigram(49.4, 32.9, 123.69, [false, false, false])}
    </svg>
  )
}

/** The flag for the language the button switches to. */
export function LanguageFlag({ language, size = 20 }: { language: 'ko' | 'en'; size?: number }) {
  return language === 'ko' ? <UnionJack size={size} /> : <Taegukgi size={size} />
}
