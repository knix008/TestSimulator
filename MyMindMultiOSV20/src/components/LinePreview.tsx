import type { ReactNode } from 'react'
import type { EndCap, LinePattern, LineType } from '../types'

const W = 34
const H = 16
const MID = H / 2

function dash(pattern: LinePattern): string | undefined {
  if (pattern === 'dashed') return '6 4'
  if (pattern === 'dotted') return '1.5 4'
  if (pattern === 'dashdot') return '8 4 1.5 4'
  return undefined
}

function capMarker(cap: EndCap, x: number, dir: 1 | -1): ReactNode {
  if (cap === 'arrow') {
    return <path d={`M ${x} ${MID} L ${x - dir * 7} ${MID - 4} L ${x - dir * 7} ${MID + 4} Z`} fill="currentColor" />
  }
  if (cap === 'dot') {
    return <circle cx={x - dir * 3} cy={MID} r={3.2} fill="currentColor" />
  }
  if (cap === 'diamond') {
    const c = x - dir * 4
    return <path d={`M ${c} ${MID - 4} L ${c + 4} ${MID} L ${c} ${MID + 4} L ${c - 4} ${MID} Z`} fill="currentColor" />
  }
  return null
}

/** A small horizontal preview of a line's shape / pattern / end caps. */
export function LinePreview({
  lineType,
  pattern = 'solid',
  startCap = 'none',
  endCap = 'none',
}: {
  lineType?: LineType
  pattern?: LinePattern
  startCap?: EndCap
  endCap?: EndCap
}) {
  let body: ReactNode
  if (lineType === 'curve') {
    body = <path d={`M 3 ${MID} C 11 2, 23 ${H - 2}, 31 ${MID}`} fill="none" stroke="currentColor" strokeWidth={2} />
  } else if (lineType === 'elbow') {
    body = <path d={`M 3 4 H 17 V ${H - 4} H 31`} fill="none" stroke="currentColor" strokeWidth={2} />
  } else if (lineType === 'root') {
    body = <path d={`M 3 4 C 14 4, 20 ${MID}, 31 ${MID} C 20 ${MID}, 14 ${H - 4}, 3 ${H - 4} Z`} fill="currentColor" />
  } else {
    body = (
      <line
        x1={3}
        y1={MID}
        x2={31}
        y2={MID}
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray={dash(pattern)}
        strokeLinecap="round"
      />
    )
  }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      {body}
      {capMarker(startCap, 3, -1)}
      {capMarker(endCap, 31, 1)}
    </svg>
  )
}
