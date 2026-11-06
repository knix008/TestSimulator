// 100 fill patterns for shapes: each a small SVG tile drawn in the shape's second colour over its
// fill colour ({c} in a tile's body). Pure data, used by the renderer and the pattern gallery.
const list = [];
const add = (id, ko, en, size, body) => list.push({ id: `p-${id}`, name: { ko, en }, size, body });
const line = (d, w = 1.2) => `<path d="${d}" fill="none" stroke="{c}" stroke-width="${w}" stroke-linecap="square"/>`;
const round = (d, w = 1.2) => `<path d="${d}" fill="none" stroke="{c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d) => `<path d="${d}" fill="{c}"/>`;
const dot = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="{c}"/>`;
const ring = (x, y, r, w = 1.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="{c}" stroke-width="${w}"/>`;
const box = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="{c}"/>`;
const star = (cx, cy, r, inner = 0.42, points = 5) => {
  let d = '';
  for (let i = 0; i < points * 2; i += 1) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const k = i % 2 ? r * inner : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * k).toFixed(2)} ${(cy + Math.sin(a) * k).toFixed(2)}`;
  }
  return fill(`${d}Z`);
};
const WEIGHTS = [['가는', 'Thin', 1, 6], ['보통', 'Medium', 2, 8], ['굵은', 'Bold', 4, 10], ['넓은', 'Wide', 2, 14]];

// Stripes (16)
for (const [ko, en, w, s] of WEIGHTS) {
  add(`h${s}`, `${ko} 가로줄`, `${en} horizontal stripes`, s, box(0, (s - w) / 2, s, w));
  add(`v${s}`, `${ko} 세로줄`, `${en} vertical stripes`, s, box((s - w) / 2, 0, w, s));
  add(`up${s}`, `${ko} 오른쪽 빗금`, `${en} rising diagonal`, s, line(`M0 ${s}L${s} 0M${-s / 2} ${s / 2}L${s / 2} ${-s / 2}M${s / 2} ${s * 1.5}L${s * 1.5} ${s / 2}`, w));
  add(`down${s}`, `${ko} 왼쪽 빗금`, `${en} falling diagonal`, s, line(`M0 0L${s} ${s}M${-s / 2} ${s / 2}L${s / 2} ${s * 1.5}M${s / 2} ${-s / 2}L${s * 1.5} ${s / 2}`, w));
}
// Grids and checks (9)
for (const [ko, en, s] of [['촘촘한', 'Fine', 6], ['보통', 'Medium', 10], ['넓은', 'Wide', 16]]) {
  add(`grid${s}`, `${ko} 격자`, `${en} grid`, s, line(`M${s / 2} 0V${s}M0 ${s / 2}H${s}`, 1));
  add(`check${s}`, `${ko} 바둑판`, `${en} checks`, s, box(0, 0, s / 2, s / 2) + box(s / 2, s / 2, s / 2, s / 2));
  add(`lattice${s}`, `${ko} 마름모 격자`, `${en} lattice`, s, line(`M0 0L${s} ${s}M${s} 0L0 ${s}`, 1));
}
// Dots and rings (10)
for (const [ko, en, s, r] of [['작은', 'Small', 6, 0.9], ['보통', 'Medium', 8, 1.6], ['큰', 'Large', 12, 3], ['넓은', 'Sparse', 16, 1.6]]) add(`dot${s}`, `${ko} 점`, `${en} dots`, s, dot(s / 2, s / 2, r));
for (const [ko, en, s, r] of [['작은', 'Small', 8, 0.9], ['보통', 'Medium', 12, 1.6], ['큰', 'Large', 16, 2.6]]) add(`stagger${s}`, `${ko} 엇갈린 점`, `${en} staggered dots`, s, dot(s / 4, s / 4, r) + dot((s * 3) / 4, (s * 3) / 4, r));
for (const [ko, en, s, r] of [['작은', 'Small', 8, 2.4], ['보통', 'Medium', 12, 4], ['큰', 'Large', 18, 6.5]]) add(`ring${s}`, `${ko} 고리`, `${en} rings`, s, ring(s / 2, s / 2, r, 1));
// Plus, crosses, dashes (6)
add('plus8', '작은 더하기', 'Small plus', 8, line('M4 2V6M2 4H6', 1));
add('plus14', '큰 더하기', 'Large plus', 14, line('M7 3V11M3 7H11', 1.6));
add('x8', '작은 곱하기', 'Small crosses', 8, line('M2.500 2.500L5.500 5.500M5.500 2.500L2.500 5.500', 1));
add('x14', '큰 곱하기', 'Large crosses', 14, line('M4 4L10 10M10 4L4 10', 1.6));
add('dashH', '가로 파선', 'Horizontal dashes', 12, box(1, 2, 6, 1.4) + box(7, 8, 4, 1.4) + box(0, 8, 1, 1.4));
add('dashV', '세로 파선', 'Vertical dashes', 12, box(2, 1, 1.4, 6) + box(8, 7, 1.4, 4) + box(8, 0, 1.4, 1));
// Waves, zigzags, chevrons, scales (11)
for (const [ko, en, w, h, sw] of [['잔', 'Fine', 12, 8, 1], ['보통', 'Medium', 20, 12, 1.4], ['큰', 'Large', 32, 18, 2]]) add(`wave${w}`, `${ko} 물결`, `${en} waves`, w, round(`M0 ${w / 2}Q${w / 4} ${w / 2 - h / 2} ${w / 2} ${w / 2}T${w} ${w / 2}`, sw));
for (const [ko, en, s, sw] of [['잔', 'Fine', 8, 1], ['보통', 'Medium', 14, 1.5], ['큰', 'Large', 22, 2.2]]) add(`zig${s}`, `${ko} 지그재그`, `${en} zigzag`, s, line(`M0 ${s * 0.7}L${s / 2} ${s * 0.3}L${s} ${s * 0.7}`, sw));
add('chevron12', '작은 갈매기', 'Small chevrons', 12, line('M0 8L6 2L12 8M0 14L6 8L12 14M0 2L6 -4L12 2', 1.6));
add('chevron20', '큰 갈매기', 'Large chevrons', 20, line('M0 13L10 3L20 13M0 23L10 13L20 23M0 3L10 -7L20 3', 3));
for (const [ko, en, s] of [['작은', 'Small', 12], ['보통', 'Medium', 20], ['큰', 'Large', 30]]) add(`scale${s}`, `${ko} 비늘`, `${en} scales`, s, round(`M0 ${s / 2}A${s / 2} ${s / 2} 0 0 0 ${s} ${s / 2}M${-s / 2} ${s}A${s / 2} ${s / 2} 0 0 0 ${s / 2} ${s}A${s / 2} ${s / 2} 0 0 0 ${s * 1.5} ${s}M${-s / 2} 0A${s / 2} ${s / 2} 0 0 0 ${s / 2} 0A${s / 2} ${s / 2} 0 0 0 ${s * 1.5} 0`, 1));
// Bricks, weaves, tiles (9)
for (const [ko, en, s] of [['작은', 'Small', 12], ['보통', 'Medium', 20], ['큰', 'Large', 32]]) add(`brick${s}`, `${ko} 벽돌`, `${en} bricks`, s, line(`M0 ${s / 4}H${s}M0 ${(s * 3) / 4}H${s}M${s / 2} 0V${s / 4}M${s / 2} ${(s * 3) / 4}V${s}M0 ${s / 4}V${(s * 3) / 4}`, 1));
add('weave12', '바구니 짜임', 'Basket weave', 12, box(0, 1, 6, 1.4) + box(0, 4, 6, 1.4) + box(7, 6, 1.4, 6) + box(10, 6, 1.4, 6));
add('weave20', '큰 바구니 짜임', 'Large basket weave', 20, box(0, 2, 10, 2) + box(0, 6, 10, 2) + box(12, 10, 2, 10) + box(16, 10, 2, 10));
add('herring12', '헤링본', 'Herringbone', 12, line('M0 12L6 6L0 0M6 12L12 6L6 0', 1));
add('herring20', '큰 헤링본', 'Large herringbone', 20, line('M0 20L10 10L0 0M10 20L20 10L10 0', 1.8));
add('tile16', '타일', 'Tiles', 16, line('M0 0H16V16H0Z', 1) + box(5, 5, 6, 6));
add('tile24', '큰 타일', 'Large tiles', 24, line('M0 0H24V24H0Z', 1.4) + ring(12, 12, 6, 1.4));
// Shapes (17)
for (const [ko, en, s] of [['작은', 'Small', 10], ['보통', 'Medium', 16], ['큰', 'Large', 24]]) {
  add(`tri${s}`, `${ko} 삼각형`, `${en} triangles`, s, fill(`M${s / 2} ${s * 0.18}L${s * 0.85} ${s * 0.82}H${s * 0.15}Z`));
  add(`hex${s}`, `${ko} 육각형`, `${en} hexagons`, s * 2, line(`M${s} 0L${s * 1.87} ${s * 0.5}V${s * 1.5}L${s} ${s * 2}L${s * 0.13} ${s * 1.5}V${s * 0.5}Z`, 1));
  add(`star${s}`, `${ko} 별`, `${en} stars`, s, star(s / 2, s / 2, s * 0.36));
  add(`square${s}`, `${ko} 네모`, `${en} squares`, s, box(s * 0.25, s * 0.25, s * 0.5, s * 0.5));
}
for (const [ko, en, s] of [['작은', 'Small', 10], ['보통', 'Medium', 16], ['큰', 'Large', 24]]) add(`diamond${s}`, `${ko} 다이아몬드`, `${en} diamonds`, s, fill(`M${s / 2} ${s * 0.12}L${s * 0.88} ${s / 2}L${s / 2} ${s * 0.88}L${s * 0.12} ${s / 2}Z`));
add('diamondOpen', '마름모 테두리', 'Open diamonds', 16, line('M8 2L14 8L8 14L2 8Z', 1.2));
add('heart', '하트', 'Hearts', 16, fill('M8 13C3 9.500 2.500 7 2.500 5.500C2.500 3.500 5.500 2.500 8 5C10.500 2.500 13.500 3.500 13.500 5.500C13.500 7 13 9.500 8 13Z'));
// Traditional and decorative (22)
add('meander', '번개무늬', 'Meander', 16, line('M0 13H13V3H5V9H9', 1.4));
add('cloudMotif', '구름무늬', 'Cloud motif', 24, round('M3 15C3 11 8 11 9 13C9 8 17 8 17 13C19 11 22 13 21 16H3', 1.3));
add('sevenTreasure', '칠보무늬', 'Interlocked circles', 20, ring(0, 0, 10, 1) + ring(20, 0, 10, 1) + ring(0, 20, 10, 1) + ring(20, 20, 10, 1) + ring(10, 10, 10, 1));
add('turtle', '귀갑무늬', 'Tortoise shell', 28, line('M14 0L26 7V21L14 28L2 21V7ZM14 7L20 11V17L14 21L8 17V11Z', 1));
add('flowerSmall', '작은 꽃', 'Small flowers', 14, dot(7, 3.500, 1.7) + dot(7, 10.500, 1.7) + dot(3.500, 7, 1.7) + dot(10.500, 7, 1.7));
add('flower', '꽃', 'Flowers', 22, dot(11, 5, 3) + dot(11, 17, 3) + dot(5, 11, 3) + dot(17, 11, 3) + dot(11, 11, 1.6));
add('flowerOpen', '꽃 테두리', 'Open flowers', 24, ring(12, 6, 4, 1) + ring(12, 18, 4, 1) + ring(6, 12, 4, 1) + ring(18, 12, 4, 1));
add('leaf', '잎', 'Leaves', 18, fill('M4 14C4 7 9 3 15 3C15 9 11 14 4 14Z'));
add('leafLine', '잎맥', 'Leaf outlines', 22, round('M4 18C4 9 11 4 18 4C18 11 13 18 4 18ZM4 18L14 8', 1));
add('snow', '눈송이', 'Snowflakes', 20, round('M10 3V17M4 6.500L16 13.500M16 6.500L4 13.500', 1));
add('knot', '매듭', 'Knots', 16, line('M0 4H10V16M6 0V12H16', 1.4));
add('sun', '해', 'Suns', 22, dot(11, 11, 3.500) + round('M11 2V5M11 17V20M2 11H5M17 11H20M4.700 4.700L6.800 6.800M15.200 15.200L17.300 17.300M17.300 4.700L15.200 6.800M6.800 15.200L4.700 17.300', 1));
add('moon', '달', 'Moons', 18, fill('M12 3A6.500 6.500 0 1 0 12 15A5 5 0 1 1 12 3Z'));
add('arrowsUp', '화살표', 'Arrows', 16, line('M8 13V4M4 8L8 4L12 8', 1.4));
add('arrowsRight', '오른쪽 화살표', 'Right arrows', 16, line('M3 8H12M8 4L12 8L8 12', 1.4));
add('sandFine', '고운 모래', 'Fine sand', 16, dot(2, 3, 0.6) + dot(9, 2, 0.6) + dot(14, 6, 0.6) + dot(5, 8, 0.6) + dot(11, 11, 0.6) + dot(3, 13, 0.6) + dot(8, 14, 0.6));
add('sand', '모래', 'Sand', 24, dot(3, 5, 1) + dot(13, 3, 0.8) + dot(21, 7, 1) + dot(8, 11, 0.8) + dot(17, 14, 1) + dot(4, 19, 0.8) + dot(12, 21, 1) + dot(22, 20, 0.8));
add('pebble', '자갈', 'Pebbles', 28, ring(7, 8, 5, 1) + ring(20, 6, 3.500, 1) + ring(21, 19, 5.500, 1) + ring(8, 21, 3.500, 1));
add('confetti', '색종이', 'Confetti', 24, box(3, 4, 4, 2) + box(15, 3, 2, 4) + box(9, 11, 4, 2) + box(19, 13, 2, 4) + box(4, 17, 2, 4) + box(13, 19, 4, 2));
add('rain', '빗방울', 'Raindrops', 16, fill('M4 2C5.500 4.500 6 5.500 6 6.500A2 2 0 1 1 2 6.500C2 5.500 2.500 4.500 4 2Z') + fill('M12 9C13.500 11.500 14 12.500 14 13.500A2 2 0 1 1 10 13.500C10 12.500 10.500 11.500 12 9Z'));
add('bamboo', '대나무', 'Bamboo', 18, box(4, 0, 2.500, 18) + box(12, 0, 2.500, 18) + box(3, 8, 4.500, 1.200) + box(11, 2, 4.500, 1.200));
add('ribbon', '리본', 'Ribbons', 22, line('M2 7H20L16 11L20 15H2L6 11Z', 1));

export const PATTERNS = list;
const byId = new Map(list.map((pattern) => [pattern.id, pattern]));
export const patternById = (id) => byId.get(id) ?? null;

/** One tile for a `<pattern>` element: fill colour under the second colour. */
export function patternTile(pattern, background, colour, id) {
  const { size } = pattern;
  return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><rect width="${size}" height="${size}" fill="${background}"/>${pattern.body.replaceAll('{c}', colour)}</pattern>`;
}
