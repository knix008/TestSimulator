// Floor plan PICTURES for the 2D plan workbench (File › Import floor plan… → clean up in 2D → 3D) and the start
// page's "2D samples" card: the app's templates drawn the way plans really arrive as pictures — a real-estate
// listing with solid black walls, a colour sales brochure, a hatched CAD print, a blueprint, a pencil sketch, a phone
// photo of a printout, a fax, a dark-screen capture, a grey scan — in the picture formats the import reads.
//
//   node scripts/make-plan-image-samples.mjs   → samples/plan-images/*  (+ index.json, thumbs/)
//                                                 and a copy in public/plan-samples/ (the start page loads them)
//
// The CAD-style samples of samples/plans (DXF, SVG, PDF and their pictures) are copied to public/plan-samples/ too,
// so the start page's card offers drawings and pictures side by side.
// Everything is seeded: the files are the same on every run. Each picture records its scale (pixels per metre),
// tilt and the template's counts in index.json; test/unit/plan-image-samples.test.js reads them with the
// app's own wall detection.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildTemplate } from '../src/engine/templates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'samples', 'plan-images');
const publicDir = path.join(root, 'public', 'plan-samples');
for (const dir of [outDir, path.join(outDir, 'thumbs'), publicDir, path.join(publicDir, 'thumbs')]) fs.mkdirSync(dir, { recursive: true });

const NAMES = {
  living: ['거실', 'Living'], kitchen: ['주방', 'Kitchen'], dining: ['식당', 'Dining'], bedroom: ['안방', 'Master bed'], bedroom2: ['침실2', 'Bedroom 2'], bedroom3: ['침실3', 'Bedroom 3'],
  bedroom4: ['침실4', 'Bedroom 4'], bath: ['욕실', 'Bath'], bath2: ['욕실2', 'Bath 2'], dressing: ['드레스룸', 'Dressing'], laundry: ['다용도실', 'Laundry'], utility: ['다용도실', 'Utility'],
  hall: ['복도', 'Hall'], entry: ['현관', 'Entry'], reception: ['RECEPTION', 'Reception'], openoffice: ['OPEN OFFICE', 'Open office'], meeting: ['MEETING', 'Meeting'], director: ['DIRECTOR', 'Director'],
  pantry: ['PANTRY', 'Pantry'], toilet: ['WC', 'WC'], office: ['서재', 'Study'], room: ['방', 'Room'], shop: ['매장', 'Shop'], hall2: ['매장', 'Sales floor'], storage: ['창고', 'Storage'], studio: ['원룸', 'Studio'], loft: ['거실', 'Living'],
};
const nameOf = (key, lang = 0) => (NAMES[key] ?? [key, key])[lang];

// ───────────────────────── the samples

/**
 * id, template, title / note (ko, en), style (drawing), effects (after drawing), format, px per metre.
 * The styles and effects are below; `english` draws the room names in English.
 */
const SAMPLES = [
  { id: 'apt49-listing', template: 'apt49', style: 'solid', format: 'jpg', ppm: 70, title: ['49㎡ 아파트 · 부동산 평면도', '49 m² apartment · listing plan'], note: ['검은 벽, 방 이름과 넓이 (JPG)', 'Solid black walls, room names and areas (JPG)'] },
  { id: 'apt59-photo', template: 'apt59', style: 'solid', format: 'jpg', ppm: 60, effects: { tilt: 4, light: 0.32, tint: [1.0, 0.97, 0.9], noise: 7, blur: 0.7, shadow: true, quality: 72 }, title: ['59㎡ 아파트 · 휴대폰 사진', '59 m² apartment · phone photo'], note: ['인쇄물을 찍은 사진: 기울어짐, 그늘, 잡음 (JPG)', 'A photo of a printout: tilted, shaded, noisy (JPG)'] },
  { id: 'apt74-brochure', template: 'apt74', style: 'brochure', format: 'png', ppm: 64, title: ['74㎡ 아파트 · 분양 홍보 컬러', '74 m² apartment · colour brochure'], note: ['바닥 색, 가구, 치수, 방위 (PNG)', 'Floor colours, furniture, dimensions, compass (PNG)'] },
  { id: 'apt84-cad-print', template: 'apt84', style: 'cad', format: 'png', ppm: 56, title: ['84㎡ 아파트 · CAD 출력(해치)', '84 m² apartment · CAD print (hatched)'], note: ['두 줄 벽과 빗금, 치수선 (PNG)', 'Double-line walls with hatching, dimension lines (PNG)'] },
  { id: 'apt104-blueprint', template: 'apt104', style: 'blueprint', format: 'png', ppm: 52, title: ['104㎡ 아파트 · 청사진', '104 m² apartment · blueprint'], note: ['파란 바탕에 흰 선 (PNG)', 'White lines on blue (PNG)'] },
  { id: 'house-sketch', template: 'house', style: 'sketch', format: 'jpg', ppm: 64, effects: { paper: true, noise: 5, quality: 80 }, title: ['단독주택 · 연필 스케치', 'House · pencil sketch'], note: ['종이에 자를 대고 그린 연필 도면 (JPG)', 'Drawn in pencil with a ruler, on paper (JPG)'] },
  // Freehand: the lines bow, so the automatic detection finds only part of the plan — the workbench does the rest.
  { id: 'apt49-freehand', template: 'apt49', style: 'sketch', format: 'jpg', ppm: 64, hard: true, effects: { warp: 1.6, paper: true, noise: 5, quality: 80 }, title: ['49㎡ 아파트 · 손 스케치', '49 m² apartment · freehand sketch'], note: ['자 없이 그린 선: 자동 인식 뒤 2D 정리가 많이 필요합니다 (JPG)', 'Freehand lines: needs a lot of 2D cleanup after detection (JPG)'] },
  { id: 'officetel-fax', template: 'officetel', style: 'cad', format: 'gif', ppm: 44, effects: { tilt: -1.5, noise: 18, fax: true }, title: ['오피스텔 · 팩스', 'Officetel · fax'], note: ['흑백 1비트, 낮은 해상도 (GIF)', '1-bit black and white, low resolution (GIF)'] },
  { id: 'office-dark', template: 'smalloffice', style: 'dark', format: 'webp', ppm: 60, english: true, title: ['작은 사무실 · 어두운 화면 캡처', 'Small office · dark screen capture'], note: ['어두운 바탕에 밝은 벽 (WebP)', 'Light walls on a dark background (WebP)'] },
  { id: 'studio-bmp', template: 'studio', style: 'solid', format: 'bmp', ppm: 80, title: ['원룸 · 비트맵', 'Studio flat · bitmap'], note: ['압축 없는 24비트 (BMP)', 'Uncompressed 24-bit (BMP)'] },
  { id: 'shop-tga', template: 'shop', style: 'cad', format: 'tga', ppm: 64, english: true, title: ['상가 · TGA', 'Shop · TGA'], note: ['두 줄 벽 CAD 그림 (TGA)', 'Double-line CAD picture (TGA)'] },
  { id: 'loft-avif', template: 'loft', style: 'brochure', format: 'avif', ppm: 64, title: ['복층 1층 · 컬러', 'Loft ground floor · colour'], note: ['홍보용 컬러 평면 (AVIF)', 'Colour sales plan (AVIF)'] },
  { id: 'house3-scan', template: 'house3', style: 'cad', format: 'tif', ppm: 72, effects: { tilt: 2.5, light: 0.18, noise: 9, grey: true, specks: true }, title: ['3층 주택 1층 · 회색 스캔', '3-storey house, ground floor · grey scan'], note: ['스캐너로 읽은 회색조, 약간 기울어짐 (TIFF)', 'A greyscale scan, slightly tilted (TIFF)'] },
];

// The drawings and pictures of samples/plans offered next to these (start page card).
const CAD_SAMPLES = [
  { id: 'apartment-59-dxf', file: 'apartment-59.dxf', thumbFrom: 'apartment-59.png', title: ['59㎡ 아파트 · DXF', '59 m² apartment · DXF'], note: ['CAD 도면: 벽·문·창 레이어, 가구 블록', 'CAD drawing: wall, door, window layers, furniture blocks'] },
  { id: 'apartment-84-dxf', file: 'apartment-84.dxf', thumbFrom: 'apartment-84.png', title: ['84㎡ 아파트 · DXF', '84 m² apartment · DXF'], note: ['문 블록(회전·대칭), 폴리라인 벽', 'Door blocks (turned, mirrored), polyline walls'] },
  { id: 'house-2room-dxf', file: 'house-2room.dxf', thumbFrom: 'house-2room.png', title: ['방 2개 주택 · DXF', 'Two-room house · DXF'], note: ['단순한 CAD 도면', 'A simple CAD drawing'] },
  { id: 'small-office-svg', file: 'small-office.svg', thumbFrom: 'small-office.png', title: ['작은 사무실 · SVG', 'Small office · SVG'], note: ['선으로 그린 SVG 도면', 'An SVG line drawing'] },
  { id: 'apartment-59-pdf', file: 'apartment-59.pdf', thumbFrom: 'apartment-59.png', title: ['59㎡ 아파트 · PDF', '59 m² apartment · PDF'], note: ['CAD에서 내보낸 A3 PDF (축척 1:100)', 'An A3 PDF exported from CAD (1:100)'] },
  { id: 'apartment-59-scan', file: 'apartment-59-scan.png', thumbFrom: 'apartment-59-scan.png', title: ['59㎡ 아파트 · 스캔', '59 m² apartment · scan'], note: ['7° 기울어진 스캔 (PNG)', 'A scan turned by 7° (PNG)'] },
];

// ───────────────────────── seeded randomness

function rng(seed) {
  let s = seed >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return { next, gauss: () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next()) };
}
const seedOf = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// ───────────────────────── plan of a template (ground floor)

function planOf(sample) {
  const project = buildTemplate(sample.template, {});
  const level = project.levels[0].id;
  const walls = project.walls.filter((w) => w.level === level);
  const ids = new Set(walls.map((w) => w.id));
  const openings = project.openings.filter((o) => ids.has(o.wall)).map((o) => ({ ...o, w: walls.find((w) => w.id === o.wall) }));
  const rooms = project.rooms.filter((r) => r.level === level);
  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]); const zs = walls.flatMap((w) => [w.a[1], w.b[1]]);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  const doors = openings.filter((o) => o.item.startsWith('door') && o.item !== 'door-cased-opening').length;
  return { walls, openings, rooms, box, counts: { walls: walls.length, doors, windows: openings.length - doors, rooms: rooms.length } };
}

const area = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const f = (v) => (Math.round(v * 100) / 100).toString();

// ───────────────────────── drawing (SVG, plan metres → pixels)

const STYLES = {
  solid: { bg: '#ffffff', ink: '#1b1b1b', wall: 'fill', wallFill: '#1b1b1b', text: '#333333', sub: '#777777', areas: true, furniture: '#b9b9b9', dims: false, font: 'Malgun Gothic' },
  brochure: { bg: '#fbfaf6', ink: '#3c3c3c', wall: 'fill', wallFill: '#4a4a4a', text: '#2d2d2d', sub: '#7a6a55', areas: true, floors: true, furniture: '#8d7f6c', dims: true, compass: true, font: 'Malgun Gothic' },
  cad: { bg: '#ffffff', ink: '#000000', wall: 'hatch', wallFill: '#ffffff', text: '#000000', sub: '#444444', areas: false, furniture: null, dims: true, font: 'Malgun Gothic' },
  blueprint: { bg: '#1d4f91', ink: '#eef6ff', wall: 'outline', wallFill: '#1d4f91', text: '#eef6ff', sub: '#b8d4f5', areas: true, furniture: '#7fa8d8', dims: true, grid: '#2d63a8', font: 'Malgun Gothic' },
  sketch: { bg: '#f6f1e4', ink: '#33322f', wall: 'pencil', wallFill: '#4a4844', text: '#3b3a37', sub: '#6b6862', areas: false, furniture: '#8a867d', dims: false, font: 'Segoe Print, Comic Sans MS, Malgun Gothic' },
  dark: { bg: '#1c1f24', ink: '#e8eaed', wall: 'fill', wallFill: '#d9dce1', text: '#e8eaed', sub: '#9aa0a6', areas: true, furniture: '#5f6670', dims: false, font: 'Segoe UI, Malgun Gothic' },
};
const FLOOR_COLOURS = { bath: '#c9d8de', bath2: '#c9d8de', toilet: '#c9d8de', laundry: '#d6d6cf', utility: '#d6d6cf', entry: '#dcd6cb', hall: '#e6dccb', kitchen: '#e9e2d4', pantry: '#e9e2d4' };

function drawSvg(sample, plan) {
  const st = STYLES[sample.style];
  const k = sample.ppm;
  const margin = st.dims ? 1.6 : 1.0;
  const { box } = plan;
  const W = Math.round((box.x1 - box.x0 + 2 * margin) * k); const H = Math.round((box.z1 - box.z0 + 2 * margin) * k);
  const X = (x) => (x - box.x0 + margin) * k; const Z = (z) => (z - box.z0 + margin) * k;
  const lang = sample.english ? 1 : 0;
  const r = rng(seedOf(sample.id));
  const lw = Math.max(1.4, k * 0.022); // line width of outlines (px)
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  out.push(`<defs><pattern id="hatch" width="${f(k * 0.12)}" height="${f(k * 0.12)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${f(k * 0.12)}" stroke="${st.ink}" stroke-width="${f(lw * 0.6)}"/></pattern>
    <pattern id="pencil" width="${f(k * 0.06)}" height="${f(k * 0.06)}" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)"><line x1="0" y1="0" x2="0" y2="${f(k * 0.06)}" stroke="${st.wallFill}" stroke-width="${f(k * 0.042)}"/></pattern></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="${st.bg}"/>`);
  if (st.grid) {
    const g = [];
    for (let x = 0; x < W; x += k * 0.5) g.push(`<line x1="${f(x)}" y1="0" x2="${f(x)}" y2="${H}"/>`);
    for (let y = 0; y < H; y += k * 0.5) g.push(`<line x1="0" y1="${f(y)}" x2="${W}" y2="${f(y)}"/>`);
    out.push(`<g stroke="${st.grid}" stroke-width="1">${g.join('')}</g>`);
  }
  // Floors (brochure): wood in the rooms, tiles in wet rooms.
  if (st.floors) {
    for (const room of plan.rooms) {
      const colour = FLOOR_COLOURS[room.key] ?? '#ead8b8';
      out.push(`<polygon points="${room.points.map((p) => `${f(X(p[0]))},${f(Z(p[1]))}`).join(' ')}" fill="${colour}"/>`);
      if (!FLOOR_COLOURS[room.key]) {
        // Plank lines.
        const xs = room.points.map((p) => p[0]); const zs = room.points.map((p) => p[1]);
        const lines = [];
        for (let z = Math.min(...zs) + 0.18; z < Math.max(...zs); z += 0.18) lines.push(`<line x1="${f(X(Math.min(...xs)))}" y1="${f(Z(z))}" x2="${f(X(Math.max(...xs)))}" y2="${f(Z(z))}"/>`);
        out.push(`<g stroke="#d9c39c" stroke-width="1">${lines.join('')}</g>`);
      } else {
        const xs = room.points.map((p) => p[0]); const zs = room.points.map((p) => p[1]);
        const lines = [];
        for (let z = Math.min(...zs) + 0.3; z < Math.max(...zs); z += 0.3) lines.push(`<line x1="${f(X(Math.min(...xs)))}" y1="${f(Z(z))}" x2="${f(X(Math.max(...xs)))}" y2="${f(Z(z))}"/>`);
        for (let x = Math.min(...xs) + 0.3; x < Math.max(...xs); x += 0.3) lines.push(`<line x1="${f(X(x))}" y1="${f(Z(Math.min(...zs)))}" x2="${f(X(x))}" y2="${f(Z(Math.max(...zs)))}"/>`);
        out.push(`<g stroke="#ffffff" stroke-opacity="0.7" stroke-width="1">${lines.join('')}</g>`);
      }
    }
  }
  if (st.furniture) out.push(furniture(plan, st, X, Z, k, r));
  // Walls: bands extended by half a thickness at their ends (corners close).
  const bands = plan.walls.map((w) => {
    const h = w.thickness / 2;
    const x0 = Math.min(w.a[0], w.b[0]) - h; const x1 = Math.max(w.a[0], w.b[0]) + h;
    const z0 = Math.min(w.a[1], w.b[1]) - h; const z1 = Math.max(w.a[1], w.b[1]) + h;
    return `<rect x="${f(X(x0))}" y="${f(Z(z0))}" width="${f((x1 - x0) * k)}" height="${f((z1 - z0) * k)}"/>`;
  }).join('');
  const gapFill = st.floors ? '#ead8b8' : st.bg;
  if (st.wall === 'fill') out.push(`<g fill="${st.wallFill}">${bands}</g>`);
  else {
    // The outline of the union of the bands: every band stroked wide, then filled over (inner edges vanish).
    out.push(`<g fill="${st.ink}" stroke="${st.ink}" stroke-width="${f(lw * 2)}" stroke-linejoin="miter">${bands}</g>`);
    // Inside: the background first (the hatch and pencil patterns are transparent between their strokes).
    out.push(`<g fill="${st.wall === 'outline' ? st.wallFill : st.bg}">${bands}</g>`);
    if (st.wall === 'hatch' || st.wall === 'pencil') out.push(`<g fill="url(#${st.wall})">${bands}</g>`);
  }
  // Openings: a gap through the wall, jamb lines, then the symbol.
  for (const o of plan.openings) {
    const w = o.w;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]; const n = [-u[1], u[0]];
    const T = w.thickness;
    const P = (s, j) => [X(w.a[0] + u[0] * s + n[0] * j), Z(w.a[1] + u[1] * s + n[1] * j)];
    const s0 = o.offset - o.width / 2; const s1 = o.offset + o.width / 2;
    const ext = T / 2 + (lw * 1.2) / k;
    const gap = [P(s0, -ext), P(s1, -ext), P(s1, ext), P(s0, ext)];
    out.push(`<polygon points="${gap.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${gapFill}"/>`);
    const line = (a, b, width = lw, colour = st.ink) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${colour}" stroke-width="${f(width)}"/>`;
    const sym = [];
    const wallInk = st.wall === 'fill' ? st.wallFill : st.ink;
    if (st.wall !== 'fill') { sym.push(line(P(s0, -T / 2), P(s0, T / 2), lw, wallInk)); sym.push(line(P(s1, -T / 2), P(s1, T / 2), lw, wallInk)); }
    if (o.item.startsWith('window')) {
      const four = o.item === 'window-sliding' || o.width >= 2.4;
      const offs = four ? [-T / 2, -T * 0.12, T * 0.12, T / 2] : [-T / 2 + T * 0.15, 0, T / 2 - T * 0.15];
      for (const j of offs) sym.push(line(P(s0, j), P(s1, j), Math.max(1, lw * 0.75), st.ink));
    } else if (/sliding|bypass|barn|pocket|folding|bifold/.test(o.item)) {
      const leaf = (a, b, j) => { const p = [P(a, j - T * 0.12), P(b, j - T * 0.12), P(b, j + T * 0.12), P(a, j + T * 0.12)]; return `<polygon points="${p.map((q) => `${f(q[0])},${f(q[1])}`).join(' ')}" fill="none" stroke="${st.ink}" stroke-width="${f(lw * 0.8)}"/>`; };
      sym.push(leaf(s0, o.offset + o.width * 0.05, -T * 0.18), leaf(o.offset - o.width * 0.05, s1, T * 0.18));
    } else {
      // Swing doors (double: two leaves): leaf line and quarter arc from the hinge, on the side it opens to.
      const side = (o.side ?? 'left') === 'left' ? 1 : -1;
      const hingeLeft = (o.params?.hinge ?? 'left') === 'left';
      const leaves = o.item === 'door-double' ? [[s0, 1, o.width / 2], [s1, -1, o.width / 2]] : [[hingeLeft === (side > 0) ? s0 : s1, hingeLeft === (side > 0) ? 1 : -1, o.width]];
      for (const [hs, dir, len] of leaves) {
        const Hs = hs; const hj = side * (T / 2);
        const Hp = P(Hs, hj); const C = P(Hs + dir * len, hj); const O = P(Hs, hj + side * len);
        const cross = (C[0] - Hp[0]) * (O[1] - Hp[1]) - (C[1] - Hp[1]) * (O[0] - Hp[0]);
        sym.push(line(Hp, O, Math.max(1.2, lw * 0.9)));
        sym.push(`<path d="M${f(C[0])} ${f(C[1])} A${f(len * k)} ${f(len * k)} 0 0 ${cross > 0 ? 1 : 0} ${f(O[0])} ${f(O[1])}" fill="none" stroke="${st.ink}" stroke-width="${f(Math.max(1, lw * 0.6))}"${st.style === 'blueprint' ? '' : ''}/>`);
      }
    }
    out.push(sym.join(''));
  }
  // Room names (and areas).
  const fs1 = Math.max(12, k * 0.26); const fs2 = Math.max(10, k * 0.18);
  for (const room of plan.rooms) {
    const [cx, cz] = centroid(room.points);
    const label = nameOf(room.key, lang);
    out.push(`<text x="${f(X(cx))}" y="${f(Z(cz))}" font-family="${st.font}" font-size="${f(fs1)}" font-weight="600" text-anchor="middle" fill="${st.text}">${label}</text>`);
    if (st.areas) out.push(`<text x="${f(X(cx))}" y="${f(Z(cz) + fs1 * 1.05)}" font-family="${st.font}" font-size="${f(fs2)}" text-anchor="middle" fill="${st.sub}">${area(room.points).toFixed(2)}㎡</text>`);
  }
  if (st.dims) out.push(dimensions(plan, st, X, Z, k, lw));
  if (st.compass) {
    const cx = W - k * 0.8; const cy = k * 0.8; const R = k * 0.4;
    out.push(`<g stroke="${st.ink}" stroke-width="1.5" fill="none"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}"/><path d="M${f(cx)} ${f(cy - R)} L${f(cx + R * 0.3)} ${f(cy + R * 0.5)} L${f(cx)} ${f(cy + R * 0.2)} L${f(cx - R * 0.3)} ${f(cy + R * 0.5)} Z" fill="${st.ink}"/></g><text x="${f(cx)}" y="${f(cy - R - 4)}" font-family="${st.font}" font-size="${f(fs2)}" text-anchor="middle" fill="${st.text}">N</text>`);
  }
  out.push('</svg>');
  return { svg: out.join('\n'), width: W, height: H, topLeft: [box.x0 - margin, box.z0 - margin] };
}

/** Furniture symbols by room kind (beds, sofa, table, bath fixtures), clear of the room's walls. */
function furniture(plan, st, X, Z, k, r) {
  const parts = [];
  const rect = (x, z, w, d, rx = 0.05) => parts.push(`<rect x="${f(X(x))}" y="${f(Z(z))}" width="${f(w * k)}" height="${f(d * k)}" rx="${f(rx * k)}"/>`);
  for (const room of plan.rooms) {
    const xs = room.points.map((p) => p[0]); const zs = room.points.map((p) => p[1]);
    const x0 = Math.min(...xs) + 0.35; const x1 = Math.max(...xs) - 0.35; const z0 = Math.min(...zs) + 0.35; const z1 = Math.max(...zs) - 0.35;
    const w = x1 - x0; const d = z1 - z0;
    if (w < 1 || d < 1) continue;
    if (/^bedroom/.test(room.key)) {
      const bw = Math.min(1.6, w * 0.6); const bd = Math.min(2.0, d * 0.7);
      rect(x0 + (w - bw) / 2, z0, bw, bd);
      rect(x0 + (w - bw) / 2 + 0.1, z0 + 0.08, bw / 2 - 0.15, 0.4);
      rect(x0 + w / 2 + 0.05, z0 + 0.08, bw / 2 - 0.15, 0.4);
    } else if (room.key === 'living' || room.key === 'loft') {
      const sw = Math.min(2.4, w * 0.6);
      rect(x0 + (w - sw) / 2, z1 - 0.85, sw, 0.85, 0.12);
      rect(x0 + (w - sw * 0.5) / 2, z1 - 1.9, sw * 0.5, 0.6, 0.06);
      if (w > 3) { rect(x0, z0, 0.5, Math.min(2.2, d * 0.5)); }
    } else if (/^bath|toilet/.test(room.key)) {
      if (d > 1.6) rect(x0, z0, Math.min(1.5, w * 0.8), 0.7, 0.25);
      parts.push(`<ellipse cx="${f(X(x1 - 0.25))}" cy="${f(Z(z1 - 0.35))}" rx="${f(0.2 * k)}" ry="${f(0.28 * k)}"/>`);
    } else if (room.key === 'meeting' || room.key === 'dining' || room.key === 'openoffice') {
      const tw = Math.min(2.4, w * 0.6); const td = Math.min(1.1, d * 0.5);
      rect(x0 + (w - tw) / 2, z0 + (d - td) / 2, tw, td);
    }
  }
  return `<g fill="none" stroke="${st.furniture}" stroke-width="${f(Math.max(1, k * 0.015))}">${parts.join('')}</g>`;
}

/** Overall dimension chains above and left of the plan (outer wall corners and the openings' sides). */
function dimensions(plan, st, X, Z, k, lw) {
  const { box } = plan;
  const g = [];
  const yLine = box.z0 - 0.9; const xLine = box.x0 - 0.9;
  const xs = [...new Set(plan.walls.filter((w) => Math.abs(w.a[1] - w.b[1]) < 1e-6).flatMap((w) => [w.a[0], w.b[0]]).map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  const zs = [...new Set(plan.walls.filter((w) => Math.abs(w.a[0] - w.b[0]) < 1e-6).flatMap((w) => [w.a[1], w.b[1]]).map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  const fsz = Math.max(10, k * 0.16);
  const tick = (x, y) => g.push(`<line x1="${f(x - 4)}" y1="${f(y + 4)}" x2="${f(x + 4)}" y2="${f(y - 4)}"/>`);
  g.push(`<line x1="${f(X(xs[0]))}" y1="${f(Z(yLine))}" x2="${f(X(xs.at(-1)))}" y2="${f(Z(yLine))}"/>`);
  for (let i = 0; i < xs.length; i++) {
    tick(X(xs[i]), Z(yLine));
    g.push(`<line x1="${f(X(xs[i]))}" y1="${f(Z(yLine) + 6)}" x2="${f(X(xs[i]))}" y2="${f(Z(box.z0) - k * 0.35)}" stroke-dasharray="3 3"/>`);
    if (i) g.push(`<text x="${f((X(xs[i - 1]) + X(xs[i])) / 2)}" y="${f(Z(yLine) - 5)}" text-anchor="middle" stroke="none" fill="${st.sub}" font-size="${f(fsz)}" font-family="${st.font}">${Math.round((xs[i] - xs[i - 1]) * 1000)}</text>`);
  }
  g.push(`<line x1="${f(X(xLine))}" y1="${f(Z(zs[0]))}" x2="${f(X(xLine))}" y2="${f(Z(zs.at(-1)))}"/>`);
  for (let i = 0; i < zs.length; i++) {
    tick(X(xLine), Z(zs[i]));
    g.push(`<line x1="${f(X(xLine) + 6)}" y1="${f(Z(zs[i]))}" x2="${f(X(box.x0) - k * 0.35)}" y2="${f(Z(zs[i]))}" stroke-dasharray="3 3"/>`);
    if (i) { const cy = (Z(zs[i - 1]) + Z(zs[i])) / 2; g.push(`<text x="${f(X(xLine) - 6)}" y="${f(cy)}" text-anchor="middle" stroke="none" fill="${st.sub}" font-size="${f(fsz)}" font-family="${st.font}" transform="rotate(-90 ${f(X(xLine) - 6)} ${f(cy)})">${Math.round((zs[i] - zs[i - 1]) * 1000)}</text>`); }
  }
  return `<g stroke="${st.sub}" stroke-width="${f(Math.max(1, lw * 0.5))}" fill="none">${g.join('')}</g>`;
}

// ───────────────────────── effects on the pixels (RGB)

/**
 * Warp (hand drawing), paper grain, tilt (phone / scanner), light fall-off, a shadow band, tint, noise, specks,
 * blur, grey, fax (1-bit with a little dither). Returns { data (RGB), width, height }.
 */
async function applyEffects(png, e, seed, bg) {
  let img = sharp(png).removeAlpha();
  if (e.blur) img = img.blur(e.blur);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width; const h = info.height;
  const r = rng(seed);
  const t = ((e.tilt ?? 0) * Math.PI) / 180; const c = Math.cos(t); const s = Math.sin(t);
  const W = e.tilt ? Math.ceil(w * Math.abs(c) + h * Math.abs(s)) + 30 : w;
  const H = e.tilt ? Math.ceil(w * Math.abs(s) + h * Math.abs(c)) + 30 : h;
  const back = hex(bg);
  const sample = (x, y, ch) => {
    const X0 = Math.floor(x); const Y0 = Math.floor(y); const tx = x - X0; const ty = y - Y0;
    const at = (X, Y) => (X < 0 || Y < 0 || X >= w || Y >= h ? back[ch] : data[(Y * w + X) * 3 + ch]);
    return (at(X0, Y0) * (1 - tx) + at(X0 + 1, Y0) * tx) * (1 - ty) + (at(X0, Y0 + 1) * (1 - tx) + at(X0 + 1, Y0 + 1) * tx) * ty;
  };
  const out = Buffer.alloc(W * H * 3);
  const wave = (v, k1, k2) => Math.sin(v / k1) * 0.6 + Math.sin(v / k2 + 1.3) * 0.4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sx = x; let sy = y;
      if (e.tilt) { const qx = x + 0.5 - W / 2; const qy = y + 0.5 - H / 2; sx = w / 2 + c * qx - s * qy - 0.5; sy = h / 2 + s * qx + c * qy - 0.5; }
      // A hand drawing bows gently over long runs (not a ripple: the walls stay readable as lines).
      if (e.warp) { sx += e.warp * wave(y, 71, 167); sy += e.warp * wave(x, 83, 191); }
      let light = 1;
      if (e.light) light *= 1 - e.light * ((x / W) * 0.6 + (y / H) * 0.4) ** 1.4;
      if (e.shadow) { const d = (x + y * 0.6) / (W + H * 0.6); if (d > 0.62 && d < 0.78) light *= 0.86; }
      const grain = e.paper ? (r.next() - 0.5) * 10 + Math.sin(x / 3.1 + y / 7.3) * 2 : 0;
      const n = e.noise ? r.gauss() * e.noise : 0;
      const speck = e.specks && r.next() < 0.0015 ? (r.next() < 0.5 ? -140 : 60) : 0;
      for (let ch = 0; ch < 3; ch++) {
        let v = sample(sx, sy, ch) * light * (e.tint?.[ch] ?? 1) + grain + n + speck;
        out[(y * W + x) * 3 + ch] = Math.max(0, Math.min(255, Math.round(v)));
      }
      if (e.grey || e.fax) {
        const i = (y * W + x) * 3;
        let g = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
        if (e.fax) g = g + (r.next() - 0.5) * 50 < 150 ? 0 : 255;
        out[i] = out[i + 1] = out[i + 2] = Math.round(g);
      }
    }
  }
  return { data: out, width: W, height: H };
}
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

// ───────────────────────── encoders (BMP, TGA: by hand; the rest: sharp)

function bmp({ data, width, height }) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * height);
  buf.write('BM', 0); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(row * height, 34); buf.writeInt32LE(2835, 38); buf.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const o = 54 + (height - 1 - y) * row;
    for (let x = 0; x < width; x++) { const i = (y * width + x) * 3; buf[o + x * 3] = data[i + 2]; buf[o + x * 3 + 1] = data[i + 1]; buf[o + x * 3 + 2] = data[i]; }
  }
  return buf;
}

/** TGA, 24-bit, run-length encoded (type 10), top-left origin. */
function tga({ data, width, height }) {
  const parts = [];
  const head = Buffer.alloc(18);
  head[2] = 10; head.writeUInt16LE(width, 12); head.writeUInt16LE(height, 14); head[16] = 24; head[17] = 0x20;
  parts.push(head);
  for (let y = 0; y < height; y++) {
    let x = 0;
    const px = (i) => [data[(y * width + i) * 3 + 2], data[(y * width + i) * 3 + 1], data[(y * width + i) * 3]];
    const same = (i, j) => data[(y * width + i) * 3] === data[(y * width + j) * 3] && data[(y * width + i) * 3 + 1] === data[(y * width + j) * 3 + 1] && data[(y * width + i) * 3 + 2] === data[(y * width + j) * 3 + 2];
    while (x < width) {
      let run = 1;
      while (x + run < width && run < 128 && same(x, x + run)) run++;
      if (run > 1) { parts.push(Buffer.from([0x80 | (run - 1), ...px(x)])); x += run; continue; }
      let raw = 1;
      while (x + raw < width && raw < 128 && !(x + raw + 1 < width && same(x + raw, x + raw + 1))) raw++;
      const chunk = [raw - 1];
      for (let i = 0; i < raw; i++) chunk.push(...px(x + i));
      parts.push(Buffer.from(chunk));
      x += raw;
    }
  }
  return Buffer.concat(parts);
}

async function encode(pixels, format, e = {}) {
  const raw = () => sharp(pixels.data, { raw: { width: pixels.width, height: pixels.height, channels: 3 } });
  const grey = e.grey || e.fax;
  if (format === 'bmp') return bmp(pixels);
  if (format === 'tga') return tga(pixels);
  if (format === 'jpg') return raw().jpeg({ quality: e.quality ?? 86, mozjpeg: true }).toBuffer();
  if (format === 'png') return raw().png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
  if (format === 'webp') return raw().webp({ quality: 88 }).toBuffer();
  if (format === 'avif') return raw().avif({ quality: 60 }).toBuffer();
  if (format === 'gif') return raw().gif({ colours: e.fax ? 2 : 64, dither: 0 }).toBuffer();
  if (format === 'tif') return (grey ? raw().toColourspace('b-w') : raw()).tiff({ compression: 'lzw', predictor: 'horizontal' }).toBuffer();
  throw new Error(`format ${format}`);
}

// ───────────────────────── run

const index = { pictures: [], drawings: [] };
for (const sample of SAMPLES) {
  const plan = planOf(sample);
  const drawn = drawSvg(sample, plan);
  const png = await sharp(Buffer.from(drawn.svg)).png().toBuffer();
  const e = sample.effects ?? {};
  const pixels = await applyEffects(png, e, seedOf(sample.id), STYLES[sample.style].bg);
  const bytes = await encode(pixels, sample.format, e);
  const file = `${sample.id}.${sample.format}`;
  fs.writeFileSync(path.join(outDir, file), bytes);
  const thumb = await sharp(pixels.data, { raw: { width: pixels.width, height: pixels.height, channels: 3 } }).resize(320, 220, { fit: 'contain', background: STYLES[sample.style].bg }).webp({ quality: 80 }).toBuffer();
  fs.writeFileSync(path.join(outDir, 'thumbs', `${sample.id}.webp`), thumb);
  index.pictures.push({
    id: sample.id, file, format: sample.format, template: sample.template, style: sample.style, title: sample.title, note: sample.note, ...(sample.hard ? { hard: true } : {}),
    // The picture's real width (m) when it is not tilted (the import asks for it; tilted pictures are a little wider).
    pxPerMetre: sample.ppm, size: [pixels.width, pixels.height], widthMetres: Math.round((pixels.width / sample.ppm) * 100) / 100, tilt: e.tilt ?? 0,
    drawnSize: [drawn.width, drawn.height], topLeft: drawn.topLeft, counts: plan.counts, bytes: bytes.length,
  });
  console.log(`  ${file.padEnd(26)} ${String(pixels.width).padStart(5)} × ${String(pixels.height).padEnd(5)} ${(bytes.length / 1024).toFixed(0).padStart(5)} KB  ${sample.style}${e.tilt ? ` · ${e.tilt}°` : ''}`);
}

// The CAD drawings and the scan of samples/plans, with a thumbnail from their picture.
const plansDir = path.join(root, 'samples', 'plans');
for (const d of CAD_SAMPLES) {
  const src = path.join(plansDir, d.file);
  if (!fs.existsSync(src)) { console.warn(`  (missing ${d.file}: run scripts/make-plan-samples.mjs)`); continue; }
  const thumb = await sharp(path.join(plansDir, d.thumbFrom)).flatten({ background: '#ffffff' }).resize(320, 220, { fit: 'contain', background: '#ffffff' }).webp({ quality: 80 }).toBuffer();
  fs.writeFileSync(path.join(outDir, 'thumbs', `${d.id}.webp`), thumb);
  index.drawings.push({ id: d.id, file: d.file, format: path.extname(d.file).slice(1), title: d.title, note: d.note, bytes: fs.statSync(src).size });
}
fs.writeFileSync(path.join(outDir, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);

// The start page loads them from public/plan-samples/ (served by the dev server, inside web and desktop builds).
for (const name of fs.readdirSync(publicDir)) if (name !== 'thumbs') fs.rmSync(path.join(publicDir, name), { force: true });
for (const p of index.pictures) fs.copyFileSync(path.join(outDir, p.file), path.join(publicDir, p.file));
for (const d of index.drawings) fs.copyFileSync(path.join(plansDir, d.file), path.join(publicDir, d.file));
for (const name of fs.readdirSync(path.join(outDir, 'thumbs'))) fs.copyFileSync(path.join(outDir, 'thumbs', name), path.join(publicDir, 'thumbs', name));
fs.copyFileSync(path.join(outDir, 'index.json'), path.join(publicDir, 'index.json'));
const total = [...index.pictures, ...index.drawings].reduce((s, x) => s + x.bytes, 0);
console.log(`${index.pictures.length} pictures + ${index.drawings.length} drawings → samples/plan-images/ and public/plan-samples/ (${(total / 1024 / 1024).toFixed(1)} MB)`);
