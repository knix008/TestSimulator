// PCB artwork: Gerber RS-274X / X2 (the open standard for copper, mask and
// silkscreen layers) and Excellon drill files. Read only.
//   Gerber: format/units, standard apertures (C, R, O, P), draws (G01/G02/G03,
//   single and multi quadrant), flashes, regions (G36/G37). Tracks keep their
//   aperture width as the line width; regions become solid hatches.
//   Excellon: tools, metric/inch, decimal or implied-decimal coordinates,
//   G85 slots.
import { createDrawing } from './drawing.js';

export const looksLikeGerber = (text) => /%FS[LTD]?[AI]X\d\dY\d\d\*%/.test(String(text).slice(0, 4000)) || /^G04[ \w]/m.test(String(text).slice(0, 400)) && /D0?[123]\*/.test(String(text));
export const looksLikeExcellon = (text) => { const head = String(text).slice(0, 2000); return /^M48\s*$/m.test(head) || (/^(METRIC|INCH)\b/m.test(head) && /^T\d+C[\d.]+/m.test(head)); };

const layer = (id, name, color) => ({ id, name, color, lineType: 'continuous', lineWidth: 0.25, visible: true, locked: false });

/** Reads a Gerber file. Returns { drawing, imported, skipped }. */
export function importGerber(text, { title = 'Gerber', language = 'ko' } = {}) {
  const drawing = createDrawing({ title, language });
  drawing.layers.push(layer('gbr-tracks', 'Tracks', '#c47a1a'), layer('gbr-pads', 'Pads', '#b5651d'), layer('gbr-regions', 'Regions', '#d89b4a'));
  const entities = [];
  const skipped = {};
  const skip = (what) => { skipped[what] = (skipped[what] ?? 0) + 1; };
  let unit = 25.4; // inch unless %MOMM%
  let fmt = { x: [2, 4], y: [2, 4], trailing: false, incremental: false };
  const apertures = new Map();
  let aperture = null;
  let mode = 'G01';
  let quadrant = 'multi';
  let region = null; // list of contours: [[{x, y}]]
  let x = 0; let y = 0;

  const number = (digits, axis) => {
    if (digits === undefined) return null;
    if (digits.includes('.')) return Number(digits) * unit;
    const [int, dec] = fmt[axis];
    const negative = digits.startsWith('-');
    let d = digits.replace(/^[+-]/, '');
    if (fmt.trailing) d = d.padEnd(int + dec, '0');
    const value = Number(d) / 10 ** dec;
    return (negative ? -value : value) * unit;
  };
  const sampleArc = (c, r, a0, a1) => {
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 6));
    return Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }; });
  };
  const width = () => { const a = apertures.get(aperture); return a ? (a.shape === 'C' ? a.d : Math.min(a.w ?? a.d, a.h ?? a.d)) : 0.1; };

  const flash = (at) => {
    const a = apertures.get(aperture);
    if (!a) return skip('flash without aperture');
    const base = { layer: 'gbr-pads' };
    if (a.shape === 'C') entities.push({ type: 'circle', cx: at.x, cy: at.y, r: a.d / 2, ...base });
    else if (a.shape === 'R') entities.push({ type: 'rect', x: at.x - a.w / 2, y: at.y - a.h / 2, width: a.w, height: a.h, ...base });
    else if (a.shape === 'O') entities.push({ type: 'rect', x: at.x - a.w / 2, y: at.y - a.h / 2, width: a.w, height: a.h, radius: Math.min(a.w, a.h) / 2, ...base });
    else if (a.shape === 'P') entities.push({ type: 'polygon', cx: at.x, cy: at.y, r: a.d / 2, sides: Math.max(3, Math.min(12, a.n)), angle: a.rot ?? 0, ...base });
    else { entities.push({ type: 'point', x: at.x, y: at.y, ...base }); skip(`macro aperture ${a.shape}`); }
  };

  // Tokens: extended commands %…% and word commands …*
  const source = String(text).replace(/\r/g, '');
  const tokens = [];
  for (let i = 0; i < source.length;) {
    if (/\s/.test(source[i])) { i++; continue; }
    if (source[i] === '%') {
      const end = source.indexOf('%', i + 1);
      const block = source.slice(i + 1, end < 0 ? undefined : end);
      for (const part of block.split('*')) if (part.trim()) tokens.push({ ext: true, text: part.replace(/\s+/g, '') });
      i = end < 0 ? source.length : end + 1;
    } else {
      const end = source.indexOf('*', i);
      const word = source.slice(i, end < 0 ? undefined : end).replace(/\s+/g, '');
      if (word) tokens.push({ ext: false, text: word });
      i = end < 0 ? source.length : end + 1;
    }
  }
  let macro = false;
  for (const token of tokens) {
    const t = token.text;
    if (token.ext) {
      if (macro && !/^(AM|AD|FS|MO|LP|LM|LR|LS|SR|AB|TF|TA|TO|TD|IP|OF|SF|IN|LN)/.test(t)) continue; // macro primitives
      macro = false;
      let m;
      if ((m = /^FS([LTD]?)([AI])X(\d)(\d)Y(\d)(\d)/.exec(t))) fmt = { x: [Number(m[3]), Number(m[4])], y: [Number(m[5]), Number(m[6])], trailing: m[1] === 'T', incremental: m[2] === 'I' };
      else if (t.startsWith('MOMM')) unit = 1;
      else if (t.startsWith('MOIN')) unit = 25.4;
      else if ((m = /^ADD(\d+)([A-Za-z_.$][\w.$]*),?(.*)$/.exec(t))) {
        const [, id, shape, rest] = m;
        const v = rest ? rest.split('X').map(Number) : [];
        const a = { shape };
        if (shape === 'C') a.d = (v[0] || 0) * unit;
        else if (shape === 'R' || shape === 'O') { a.w = (v[0] || 0) * unit; a.h = (v[1] ?? v[0] ?? 0) * unit; }
        else if (shape === 'P') { a.d = (v[0] || 0) * unit; a.n = v[1] || 3; a.rot = v[2] || 0; }
        apertures.set(Number(id), a);
      } else if (t.startsWith('AM')) macro = true;
      else if (/^(LP|TF|TA|TO|TD|IP|OF|SF|IN|LN|AB|SR|LM|LR|LS)/.test(t)) { /* attributes and image options: no geometry */ } else skip(`%${t.slice(0, 2)}`);
      continue;
    }
    if (t.startsWith('G04') || t === 'M02' || t === 'M00' || t === 'M01') continue;
    let rest = t;
    let m;
    while ((m = /^G0?(\d+)/.exec(rest))) {
      const g = Number(m[1]);
      if (g === 1 || g === 2 || g === 3) mode = `G0${g}`;
      else if (g === 74) quadrant = 'single';
      else if (g === 75) quadrant = 'multi';
      else if (g === 36) region = [];
      else if (g === 37) {
        const loops = (region ?? []).filter((loop) => loop.length >= 3);
        if (loops.length) entities.push({ type: 'hatch', pattern: 'solid', loops, layer: 'gbr-regions' });
        region = null;
      } else if (g === 54 || g === 55 || g === 70 || g === 71 || g === 90 || g === 91) {
        if (g === 70) unit = 25.4; if (g === 71) unit = 1;
      } else skip(`G${g}`);
      rest = rest.slice(m[0].length);
    }
    if (!rest) continue;
    const select = /^D(\d+)$/.exec(rest);
    if (select && Number(select[1]) >= 10) { aperture = Number(select[1]); continue; }
    const words = {};
    for (const w of rest.matchAll(/([XYIJD])([+-]?[\d.]+)/g)) words[w[1]] = w[2];
    const d = words.D !== undefined ? Number(words.D) : (rest.match(/^[XYIJ]/) ? 1 : null);
    if (d !== null && d >= 10) { aperture = d; continue; }
    const nx = words.X !== undefined ? number(words.X, 'x') + (fmt.incremental ? x : 0) : x;
    const ny = words.Y !== undefined ? number(words.Y, 'y') + (fmt.incremental ? y : 0) : y;
    const from = { x, y };
    const to = { x: nx, y: ny };
    if (d === 2) {
      if (region) region.push([to]);
    } else if (d === 3) flash(to);
    else if (d === 1) {
      let path;
      if (mode === 'G01') path = [from, to];
      else {
        const ci = number(words.I ?? '0', 'x');
        const cj = number(words.J ?? '0', 'y');
        let centre = { x: from.x + ci, y: from.y + cj };
        if (quadrant === 'single') {
          const candidates = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => ({ x: from.x + sx * Math.abs(ci), y: from.y + sy * Math.abs(cj) }));
          centre = candidates.reduce((best, c) => (Math.abs(Math.hypot(to.x - c.x, to.y - c.y) - Math.hypot(from.x - c.x, from.y - c.y)) < Math.abs(Math.hypot(to.x - best.x, to.y - best.y) - Math.hypot(from.x - best.x, from.y - best.y)) ? c : best));
        }
        const r = Math.hypot(from.x - centre.x, from.y - centre.y);
        let a0 = (Math.atan2(from.y - centre.y, from.x - centre.x) * 180) / Math.PI;
        let a1 = (Math.atan2(to.y - centre.y, to.x - centre.x) * 180) / Math.PI;
        const full = Math.hypot(from.x - to.x, from.y - to.y) < 1e-9 && quadrant === 'multi';
        if (mode === 'G03') { if (a1 <= a0) a1 += 360; if (full) a1 = a0 + 360; } else { if (a1 >= a0) a1 -= 360; if (full) a1 = a0 - 360; }
        if (region) path = sampleArc(centre, r, a0, a1);
        else {
          const style = { layer: 'gbr-tracks', lineWidth: width() };
          if (full) entities.push({ type: 'circle', cx: centre.x, cy: centre.y, r, ...style });
          else if (r > 0) entities.push({ type: 'arc', cx: centre.x, cy: centre.y, r, start: mode === 'G03' ? a0 : a1, end: mode === 'G03' ? a1 : a0, ...style });
          path = null;
        }
      }
      if (path) {
        if (region) {
          if (!region.length) region.push([from]);
          region.at(-1).push(...path.slice(1));
        } else entities.push({ type: 'line', x1: from.x, y1: from.y, x2: to.x, y2: to.y, layer: 'gbr-tracks', lineWidth: width() });
      }
    }
    x = nx; y = ny;
  }
  drawing.entities = entities;
  return { drawing, imported: entities.length, skipped };
}

/** Reads an Excellon drill file: holes as circles of the tool diameter, slots as rounded outlines. */
export function importExcellon(text, { title = 'Drill', language = 'ko' } = {}) {
  const drawing = createDrawing({ title, language });
  drawing.layers.push(layer('drill', 'Drill', '#3a6cf0'));
  const entities = [];
  const skipped = {};
  let unit = 25.4;
  let format = [2, 4];
  let zeros = 'LZ'; // leading zeros kept (trailing suppressed)
  const tools = new Map();
  let tool = null;
  let x = 0; let y = 0;
  let incremental = false;
  const coord = (text) => {
    if (text === undefined) return null;
    if (text.includes('.')) return Number(text) * unit;
    const negative = text.startsWith('-');
    let d = text.replace(/^[+-]/, '');
    const [int, dec] = format;
    if (zeros === 'LZ') d = d.padEnd(int + dec, '0');
    const value = Number(d) / 10 ** dec;
    return (negative ? -value : value) * unit;
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    let m;
    if ((m = /^(METRIC|INCH)(?:,(LZ|TZ))?(?:,(0+)\.(0+))?/.exec(line))) {
      unit = m[1] === 'METRIC' ? 1 : 25.4;
      format = m[1] === 'METRIC' ? [3, 3] : [2, 4];
      if (m[2]) zeros = m[2];
      if (m[3]) format = [m[3].length, m[4].length];
      continue;
    }
    if (line === 'M71') { unit = 1; continue; }
    if (line === 'M72') { unit = 25.4; continue; }
    if (line === 'G90') { incremental = false; continue; }
    if (line === 'G91') { incremental = true; continue; }
    if ((m = /^T(\d+)(?:F[\d.]+|S[\d.]+)*C([\d.]+)/.exec(line))) { tools.set(Number(m[1]), Number(m[2]) * unit); continue; }
    if ((m = /^T(\d+)$/.exec(line))) { tool = Number(m[1]); continue; }
    if (/^(M48|M95|%|M30|M00|FMAT|ICI|VER|G05|G00|M15|M16|M17|DETECT|ATC|R,|\/)/.test(line)) continue;
    if ((m = /^(?:G01)?X([+-]?[\d.]+)?Y?([+-]?[\d.]+)?G85X([+-]?[\d.]+)?Y?([+-]?[\d.]+)?$/.exec(line.replace(/Y/g, 'Y')))) {
      const sx = coord(m[1]) ?? x; const sy = coord(m[2]) ?? y; const ex = coord(m[3]) ?? sx; const ey = coord(m[4]) ?? sy;
      const d = tools.get(tool) ?? 1;
      const len = Math.hypot(ex - sx, ey - sy);
      const angle = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI;
      // A rectangle turns about its corner: place the corner so the slot is centred on its two ends.
      const a = (angle * Math.PI) / 180;
      const ox = -(len + d) / 2; const oy = -d / 2;
      entities.push({ type: 'rect', x: (sx + ex) / 2 + ox * Math.cos(a) - oy * Math.sin(a), y: (sy + ey) / 2 + ox * Math.sin(a) + oy * Math.cos(a), width: len + d, height: d, radius: d / 2, angle, layer: 'drill' });
      x = ex; y = ey;
      continue;
    }
    const xm = /X([+-]?[\d.]+)/.exec(line);
    const ym = /Y([+-]?[\d.]+)/.exec(line);
    if (xm || ym) {
      const nx = xm ? coord(xm[1]) + (incremental ? x : 0) : x;
      const ny = ym ? coord(ym[1]) + (incremental ? y : 0) : y;
      const d = tools.get(tool) ?? 1;
      entities.push({ type: 'circle', cx: nx, cy: ny, r: d / 2, centerMark: true, layer: 'drill' });
      x = nx; y = ny;
      continue;
    }
    skipped[line.slice(0, 4)] = (skipped[line.slice(0, 4)] ?? 0) + 1;
  }
  drawing.entities = entities;
  return { drawing, imported: entities.length, skipped };
}
