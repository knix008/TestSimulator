// The points an SVG path passes through (its end points and corners), for the
// tests that check a line still reaches both of its topics. Handles the
// commands the layout and renderer write: M L H V C Q A Z, absolute and relative.
export function pathPoints(d) {
  const out = [];
  const tokens = String(d).match(/[MLHVCQAZmlhvcqaz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; sx = x; sy = y; out.push([x, y]); if (cmd === 'M') cmd = 'L'; else cmd = 'l'; break; }
      case 'L': { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; out.push([x, y]); break; }
      case 'H': { const nx = num(); x = rel ? x + nx : nx; out.push([x, y]); break; }
      case 'V': { const ny = num(); y = rel ? y + ny : ny; out.push([x, y]); break; }
      case 'C': { num(); num(); num(); num(); const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; out.push([x, y]); break; }
      case 'Q': { num(); num(); const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; out.push([x, y]); break; }
      case 'A': { num(); num(); num(); num(); num(); const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; out.push([x, y]); break; }
      case 'Z': x = sx; y = sy; break;
      default: i++;
    }
  }
  return out;
}
