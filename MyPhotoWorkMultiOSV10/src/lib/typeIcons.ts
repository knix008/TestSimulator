import { createElement, type ReactNode, type SVGProps } from 'react'

/*
 * The type tools' icons. A T with an arrow says which way the words run, which no
 * stock icon does: the nearest ones are about aligning boxes. Built with createElement,
 * and not JSX, because the catalog that lists them is plain TypeScript.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function icon(...shapes: ReactNode[]) {
  return ({ size = 24, ...rest }: IconProps) =>
    createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...rest }, ...shapes)
}

const path = (key: string, d: string) => createElement('path', { key, d })

/** Words running across: a T over an arrow to the right. */
export const TypeHorizontalIcon = icon(path('t', 'M5 3h12M11 3v11'), path('line', 'M3 20h17'), path('head', 'M17 17l3 3-3 3'))

/** Words running down: a T beside an arrow pointing down. */
export const TypeVerticalIcon = icon(path('t', 'M3 5h11M8.5 5v13'), path('line', 'M20 3v17'), path('head', 'M17 17l3 3 3-3'))

/** Type that becomes a selection: a T inside the marching ants. */
export const TypeMaskIcon = icon(
  createElement('rect', { key: 'ants', x: 3, y: 3, width: 18, height: 18, rx: 1, strokeDasharray: '3 3' }),
  path('t', 'M8 8.5h8M12 8.5v8'),
)
