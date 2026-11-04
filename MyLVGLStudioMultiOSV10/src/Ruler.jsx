// Rulers along the edges of the design area, in pixels of the device. They stay at the edges;
// their zero follows the device screen, and a red line follows the pointer.
import { forwardRef } from "react";

export const RULER_SIZE = 22;

/** The label spacing, in device pixels, that keeps labels readable at this zoom. */
export function rulerStep(zoom) {
  for (const step of [10, 20, 50, 100, 200, 500, 1000]) {
    if (step * zoom >= 44) return step;
  }
  return 2000;
}

/** `origin`: where device pixel 0 falls in this strip. `length`: the strip's length. */
export const Ruler = forwardRef(function Ruler({ axis, length, origin, zoom }, marker) {
  const major = rulerStep(zoom);
  const minor = major / 5;
  const horizontal = axis === "x";
  const first = Math.floor(-origin / zoom / minor) * minor;
  const last = Math.ceil((length - origin) / zoom / minor) * minor;
  const marks = [];
  for (let at = first; at <= last; at += minor) {
    const position = Math.round(origin + at * zoom) + 0.5;
    const big = at % major === 0;
    const tick = big ? 12 : 17;
    marks.push(horizontal
      ? <line key={at} x1={position} x2={position} y1={tick} y2={RULER_SIZE} data-zero={at === 0 ? "" : undefined} />
      : <line key={at} y1={position} y2={position} x1={tick} x2={RULER_SIZE} data-zero={at === 0 ? "" : undefined} />);
    if (big) {
      marks.push(horizontal
        ? <text key={`t${at}`} x={position + 3} y={10}>{at}</text>
        : <text key={`t${at}`} x={2} y={position + 11}>{at}</text>);
    }
  }
  return (
    <div className={`ruler-strip ruler-${axis}`}>
      <svg className="ruler" data-ruler={axis} data-major={major} width={horizontal ? length : RULER_SIZE} height={horizontal ? RULER_SIZE : length} aria-hidden="true">
        {marks}
      </svg>
      <i ref={marker} className="ruler-marker" data-ruler-marker={axis} />
    </div>
  );
});
