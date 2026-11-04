// A ruler along the design surface, in pixels of the device.

/** The label spacing, in device pixels, that keeps labels readable at this zoom. */
export function rulerStep(zoom) {
  for (const step of [10, 20, 50, 100, 200, 500, 1000]) {
    if (step * zoom >= 44) return step;
  }
  return 2000;
}

export function Ruler({ axis, length, zoom }) {
  const major = rulerStep(zoom);
  const minor = major / 5;
  const size = length * zoom;
  const horizontal = axis === "x";
  const marks = [];
  for (let at = 0; at <= length; at += minor) {
    const position = at * zoom + 0.5;
    const big = at % major === 0;
    const tick = big ? 22 : 16;
    marks.push(horizontal
      ? <line key={at} x1={position} x2={position} y1={tick} y2={22} />
      : <line key={at} y1={position} y2={position} x1={tick} x2={22} />);
    if (big) {
      marks.push(horizontal
        ? <text key={`t${at}`} x={position + 3} y={10}>{at}</text>
        : <text key={`t${at}`} x={3} y={position + 11}>{at}</text>);
    }
  }
  return (
    <svg
      className={`ruler ruler-${axis}`}
      data-ruler={axis}
      data-major={major}
      width={horizontal ? size + 1 : 22}
      height={horizontal ? 22 : size + 1}
      aria-hidden="true"
    >
      {marks}
    </svg>
  );
}
