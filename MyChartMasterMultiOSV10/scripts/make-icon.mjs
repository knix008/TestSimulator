// npm run build:icon3d — writes assets/icon.svg (the 3D program icon); then npm run build:icons renders every size.
// Writes assets/icon.svg: a 3D program icon — an extruded tile, an isometric platform with lit 3D columns, a trend
// line of glossy spheres and a 3D donut badge with thickness.
import fs from 'node:fs';
const out = process.argv[2] ?? new URL('../assets/icon.svg', import.meta.url);
const r = (v) => Math.round(v * 10) / 10;
const shade = (hex, t) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
// Isometric depth: x right / up.
const DX = 40;
const DY = -24;
const defs = [];
const parts = [];
const grad = (id, a, b, x2 = 0, y2 = 1) => defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`);

// Platform (a slab under the columns).
const px0 = 214; const px1 = 748; const py = 700; const thick = 26;
grad('slabTop', '#e0e7ff', '#a5b4fc', 1, 1);
grad('slabFront', '#6366f1', '#3730a3');
grad('slabSide', '#4338ca', '#1e1b4b');
parts.push(`<polygon points="${px0},${py} ${px0 + DX * 2.2},${py + DY * 2.2} ${px1 + DX * 2.2},${py + DY * 2.2} ${px1},${py}" fill="url(#slabTop)" opacity="0.95"/>`);
parts.push(`<rect x="${px0}" y="${py}" width="${px1 - px0}" height="${thick}" fill="url(#slabFront)"/>`);
parts.push(`<polygon points="${px1},${py} ${px1 + DX * 2.2},${py + DY * 2.2} ${px1 + DX * 2.2},${py + DY * 2.2 + thick} ${px1},${py + thick}" fill="url(#slabSide)"/>`);

// Columns: front face (gradient), right side (darker), top (lighter).
const bars = [['#f59e0b', 250, 200], ['#e11d48', 375, 300], ['#10b981', 500, 245], ['#0ea5e9', 625, 380]];
const w = 84;
const base = py + DY * 1.1;
bars.forEach(([color, x0, h], i) => {
  const x = x0 + DX * 0.55;
  const y = base;
  grad(`f${i}`, shade(color, 0.35), color);
  grad(`s${i}`, shade(color, -0.25), shade(color, -0.5));
  parts.push(`<polygon points="${x + w},${y - h} ${x + w + DX},${y - h + DY} ${x + w + DX},${y + DY} ${x + w},${y}" fill="url(#s${i})"/>`);
  parts.push(`<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="url(#f${i})"/>`);
  parts.push(`<polygon points="${x},${y - h} ${x + DX},${y - h + DY} ${x + w + DX},${y - h + DY} ${x + w},${y - h}" fill="${shade(color, 0.55)}"/>`);
  parts.push(`<rect x="${x + 8}" y="${y - h + 8}" width="12" height="${h - 16}" rx="6" fill="#ffffff" opacity="0.28"/>`);
});

// Trend line over the columns, with glossy spheres.
const pts = bars.map(([, x0, h]) => [x0 + DX * 0.55 + w / 2 + DX / 2, base - h + DY / 2 - 70]);
defs.push('<radialGradient id="ball" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#c7d2fe"/><stop offset="1" stop-color="#4338ca"/></radialGradient>');
parts.push(`<polyline points="${pts.map((p) => p.map(r).join(',')).join(' ')}" fill="none" stroke="#1e1b4b" stroke-opacity="0.35" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" transform="translate(6 10)"/>`);
parts.push(`<polyline points="${pts.map((p) => p.map(r).join(',')).join(' ')}" fill="none" stroke="#ffffff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`);
for (const [x, y] of pts) parts.push(`<circle cx="${r(x)}" cy="${r(y)}" r="30" fill="url(#ball)" filter="url(#soft)"/>`);

// 3D donut badge: a cylinder seen from above at an angle, three slices, a hole.
const cx = 770; const cy = 760; const rx = 138; const ry = 92; const depth = 40;
const at = (t, k = 1, dy = 0) => [cx + rx * k * Math.cos(t), cy + dy + ry * k * Math.sin(t)];
const slices = [[0, 0.42, '#f97316'], [0.42, 0.72, '#8b5cf6'], [0.72, 1, '#14b8a6']].map(([a, b, c]) => [a * Math.PI * 2 - Math.PI / 2, b * Math.PI * 2 - Math.PI / 2, c]);
const arc = (a, b, k, dy, sweep = 1) => { const [x, y] = at(b, k, dy); return `A${r(rx * k)},${r(ry * k)} 0 ${Math.abs(b - a) > Math.PI ? 1 : 0} ${sweep} ${r(x)},${r(y)}`; };
const badge = [];
badge.push(`<ellipse cx="${cx}" cy="${cy + depth + 10}" rx="${rx + 10}" ry="${ry + 8}" fill="#0b1030" opacity="0.35"/>`);
// Sides: the front half (angles 0..π) of each slice, from the top edge down by the depth.
for (const [a, b, c] of slices) {
  const lo = Math.max(a, 0);
  const hi = Math.min(b, Math.PI);
  const pieces = [[lo, hi]];
  if (b > Math.PI * 2) pieces.push([Math.max(a, Math.PI * 2), Math.min(b, Math.PI * 3)].map((v) => v - Math.PI * 2));
  for (const [s0, s1] of pieces) {
    if (s1 <= s0) continue;
    const [x0, y0] = at(s0);
    const [x1b, y1b] = at(s1, 1, depth);
    badge.push(`<path d="M${r(x0)},${r(y0)} ${arc(s0, s1, 1, 0)} L${r(x1b)},${r(y1b)} ${arc(s1, s0, 1, depth, 0)} Z" fill="${shade(c, -0.35)}"/>`);
  }
}
// Top faces.
for (const [a, b, c] of slices) {
  const [x0, y0] = at(a);
  const [xi, yi] = at(b, 0.46);
  badge.push(`<path d="M${r(x0)},${r(y0)} ${arc(a, b, 1, 0)} L${r(xi)},${r(yi)} ${arc(b, a, 0.46, 0, 0)} Z" fill="${c}" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>`);
}
// The hole: its back wall (darker) and the opening.
badge.push(`<ellipse cx="${cx}" cy="${cy}" rx="${r(rx * 0.46)}" ry="${r(ry * 0.46)}" fill="#1e1b4b"/>`);
badge.push(`<path d="M${r(at(Math.PI, 0.46)[0])},${r(cy)} A${r(rx * 0.46)},${r(ry * 0.46)} 0 0 1 ${r(at(0, 0.46)[0])},${r(cy)} L${r(at(0, 0.46)[0])},${r(cy + depth * 0.6)} A${r(rx * 0.46)},${r(ry * 0.46)} 0 0 0 ${r(at(Math.PI, 0.46)[0])},${r(cy + depth * 0.6)} Z" fill="#312e81" opacity="0.9"/>`);
badge.push(`<ellipse cx="${cx - 40}" cy="${cy - 40}" rx="70" ry="22" fill="#ffffff" opacity="0.28" transform="rotate(-14 ${cx - 40} ${cy - 40})"/>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <!-- Tile: a teal-to-indigo gradient face over a darker extruded side (a 3D slab). -->
    <linearGradient id="face" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="0.45" stop-color="#2563eb"/><stop offset="1" stop-color="#4c1d95"/></linearGradient>
    <linearGradient id="side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#170f3d"/></linearGradient>
    <radialGradient id="glow" cx="0.26" cy="0.12" r="0.85"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0.1"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.65"/><stop offset="0.12" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
    <linearGradient id="side2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b5bdb"/><stop offset="0.55" stop-color="#25308f"/><stop offset="1" stop-color="#140b38"/></linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.72"><stop offset="0.6" stop-color="#0b1030" stop-opacity="0"/><stop offset="1" stop-color="#0b1030" stop-opacity="0.38"/></radialGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.42"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/></linearGradient>
    <linearGradient id="bevel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/><stop offset="0.35" stop-color="#ffffff" stop-opacity="0.12"/><stop offset="0.65" stop-color="#0b1030" stop-opacity="0.1"/><stop offset="1" stop-color="#0b1030" stop-opacity="0.55"/></linearGradient>
    <filter id="blur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#0b1030" flood-opacity="0.5"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="4" dy="8" stdDeviation="7" flood-color="#0b1030" flood-opacity="0.4"/></filter>
    ${defs.join('\n    ')}
  </defs>
  <!-- The tile as a thick slab: a soft floor shadow, the extruded side (lit from the top left), the face. -->
  <ellipse cx="530" cy="968" rx="420" ry="34" fill="#0b1030" opacity="0.35" filter="url(#blur)"/>
  <rect x="96" y="128" width="856" height="856" rx="196" fill="url(#side)"/>
  <rect x="90" y="104" width="856" height="856" rx="196" fill="url(#side2)"/>
  <rect x="84" y="72" width="856" height="856" rx="196" fill="url(#face)" filter="url(#shadow)"/>
  <!-- Lighting on the face: a vignette, a glossy dome on the top half, a bevel (light top-left edge, dark bottom-right). -->
  <rect x="84" y="72" width="856" height="856" rx="196" fill="url(#vignette)"/>
  <rect x="84" y="72" width="856" height="856" rx="196" fill="url(#glow)"/>
  <path d="M84,268 C84,160 172,72 280,72 H744 C852,72 940,160 940,268 V420 C760,350 520,330 84,440 Z" fill="url(#gloss)"/>
  <rect x="96" y="84" width="832" height="832" rx="186" fill="none" stroke="url(#bevel)" stroke-width="18"/>
  <rect x="86" y="74" width="852" height="852" rx="194" fill="none" stroke="url(#rim)" stroke-width="5"/>
  <g filter="url(#soft)">
    ${parts.join('\n    ')}
  </g>
  <g filter="url(#shadow)">
    ${badge.join('\n    ')}
  </g>
</svg>
`;
fs.writeFileSync(out, svg);
console.log('written', svg.length);
