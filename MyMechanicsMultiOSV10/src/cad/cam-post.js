// Post-processing (no DOM): toolpaths → ISO G-code in the dialect of a control, a G-code reader that replays a
// program into moves (to check a post against its toolpaths), and the set-up sheet.
//
// Dialects (mill): 'fanuc', 'haas', 'linuxcnc', 'iso'; (lathe): 'fanucLathe', 'linuxcncLathe'. Coordinates are
// moved into the work offset (G54): milling from model to the WCS origin (stock top centre by default),
// turning to Z0 at the part's front face and X as a diameter. Modal words are written only when they change.
import { expandMoves } from './cam-ops.js';

export const POSTS = {
  fanuc: { kind: 'mill', percent: true, oNumber: true, trailingDot: true, end: 'M30', home: ['G91 G28 Z0.', 'G28 X0. Y0.', 'G90'], tap: 'G84', lineNumbers: true },
  haas: { kind: 'mill', percent: true, oNumber: true, trailingDot: true, end: 'M30', home: ['G53 G0 Z0.', 'G53 G0 Y0.'], tap: 'G84', lineNumbers: true, haas: true },
  linuxcnc: { kind: 'mill', percent: true, oNumber: false, trailingDot: false, end: 'M2', home: ['G53 G0 Z0'], tap: 'G33.1', lineNumbers: false },
  iso: { kind: 'mill', percent: true, oNumber: true, trailingDot: false, end: 'M30', home: ['G28 G91 Z0', 'G90'], tap: 'G84', lineNumbers: true },
  fanucLathe: { kind: 'lathe', percent: true, oNumber: true, trailingDot: true, end: 'M30', home: ['G28 U0. W0.'], thread: 'G32', lineNumbers: true },
  linuxcncLathe: { kind: 'lathe', percent: true, oNumber: false, trailingDot: false, end: 'M2', home: ['G53 G0 X0 Z0'], thread: 'G33', lineNumbers: false },
};
export const POST_IDS = Object.keys(POSTS);
export const WCS_ORIGINS = ['stockTopCenter', 'stockTopCorner', 'partTopCenter', 'model'];

/** The G54 origin in model coordinates. */
export function wcsOrigin(stock, wcs = 'stockTopCenter', bounds = null) {
  if (stock.kind === 'bar') return [stock.cx ?? 0, stock.cy ?? 0, bounds ? bounds.hi[2] : stock.z1];
  if (wcs === 'model') return [0, 0, 0];
  if (wcs === 'stockTopCorner') return [stock.x0, stock.y0, stock.z1];
  if (wcs === 'partTopCenter' && bounds) return [(bounds.lo[0] + bounds.hi[0]) / 2, (bounds.lo[1] + bounds.hi[1]) / 2, bounds.hi[2]];
  return [(stock.x0 + stock.x1) / 2, (stock.y0 + stock.y1) / 2, stock.z1];
}

/** A number for the control: up to `digits` decimals, trailing zeros dropped (Fanuc keeps the point). */
export function fmtNum(v, post, digits = 4) {
  let s = (Math.round(v * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/0+$/, '');
  if (s === '-0.' || s === '-0') s = '0.';
  if (s.endsWith('.')) return post.trailingDot ? (s === '-.' ? '0.' : s) : s.slice(0, -1) || '0';
  return s;
}

const sanitize = (s) => String(s ?? '').replace(/[()]/g, '').replace(/[^\x20-\x7e]/g, '?').slice(0, 60);

/**
 * G-code for toolpaths. program: { number, name, tools: [tool], paths, stock, wcs, bounds, post, coolant,
 * date, ops? }. Returns the text (lines end with \n).
 */
export function postProcess({ number = 1001, name = 'PART', tools, paths, stock, wcs = 'stockTopCenter', bounds = null, post: postId = 'fanuc', coolant = true, date = '', ops = [] }) {
  const post = POSTS[postId] ?? POSTS.fanuc;
  const lathe = post.kind === 'lathe';
  const origin = wcsOrigin(stock, wcs, bounds);
  const toolMap = new Map(tools.map((t) => [t.id, t]));
  const lines = [];
  let n = 0;
  const emit = (text) => { if (!text) return; for (const t of String(text).split('\n')) lines.push(post.lineNumbers && !t.startsWith('(') && !t.startsWith('%') && !t.startsWith('O') ? `N${(n += 10)} ${t}` : t); };
  const f = (v, d) => fmtNum(v, post, d);
  if (post.percent) lines.push('%');
  if (post.oNumber) lines.push(`O${String(number).padStart(4, '0')} (${sanitize(name)})`);
  else lines.push(`(${sanitize(name)} PROGRAM ${number})`);
  lines.push(`(MYMECHANICS CAM${date ? ` ${sanitize(date)}` : ''})`);
  const used = [...new Set(paths.map((p) => p.tool))].map((id) => toolMap.get(id)).filter(Boolean);
  for (const t of used) lines.push(`(T${t.T} ${t.type.toUpperCase()} D${f(t.d, 3)}${t.rc ? ` R${f(t.rc, 3)}` : ''}${t.thread ? ` ${t.thread}` : ''})`);
  if (lathe) emit(postId === 'linuxcncLathe' ? 'G7 G18 G21 G40 G80 G90' : 'G18 G21 G40 G80 G99');
  else emit('G17 G21 G40 G49 G80 G90');
  emit('G54');
  const modal = { g: null, x: null, y: null, z: null, f: null };
  const reset = () => { Object.assign(modal, { g: null, x: null, y: null, z: null, f: null }); };
  let lastTool = null;
  let needsG43 = false;
  for (const tp of paths) {
    const tool = toolMap.get(tp.tool);
    if (!tool) continue;
    const op = ops.find((o) => o.id === tp.op);
    if (op) lines.push(`(${sanitize(op.name ?? op.type)})`);
    if (lastTool !== tool.id) {
      if (lastTool) { emit(coolant ? 'M9' : ''); emit('M5'); for (const h of post.home) emit(h); }
      if (lathe) emit(postId === 'fanucLathe' ? `T${String(tool.T).padStart(2, '0')}${String(tool.T).padStart(2, '0')}` : `T${tool.T} M6 G43`);
      else emit(`T${tool.T} M6`);
      lastTool = tool.id;
      reset();
      needsG43 = !lathe;
    }
    if (lathe) {
      if (tp.css && tool.type !== 'thread' && tool.type !== 'turnDrill') {
        emit(postId === 'fanucLathe' ? `G50 S${Math.round(tp.maxRpm)}` : '');
        emit(postId === 'fanucLathe' ? `G96 S${Math.round(tp.vc)} M3` : `G96 D${Math.round(tp.maxRpm)} S${Math.round(tp.vc)} M3`);
      } else emit(`G97 S${Math.round(tp.rpm)} M3`);
      emit(postId === 'fanucLathe' ? 'G99' : 'G95');
    } else emit(`S${Math.round(tp.rpm)} M3`);
    if (coolant) emit('M8');
    for (const m of tp.moves) {
      if (!lathe && needsG43) {
        // First move of a tool: XY first, then the length offset with the Z move.
        const p = m.k === 'cyc' ? [m.p[0], m.p[1], m.init] : m.p;
        const fx = f(p[0] - origin[0], 4); const fy = f(p[1] - origin[1], 4); const fz = f(p[2] - origin[2], 4);
        emit(`G0 G90 X${fx} Y${fy}`);
        emit(`G43 H${tool.T} Z${fz}`);
        Object.assign(modal, { g: 'G0', x: fx, y: fy, z: fz });
        needsG43 = false;
        if (m.k === 'r') continue;
      }
      if (m.k === 'cyc') { emit(cycleLine(m, post, postId, origin, lathe, f)); modal.g = null; modal.x = f(lathe ? 0 : m.p[0] - origin[0], 4); modal.y = f(m.p[1] - origin[1], 4); modal.z = f(m.init - origin[2], 4); continue; }
      const [x, y, z] = m.p;
      const X = lathe ? 2 * x : x - origin[0]; const Y = y - origin[1]; const Z = z - origin[2];
      const g = m.k === 'r' ? 'G0' : m.k === 't' ? (post.thread ?? 'G32') : 'G1';
      const thread = g === 'G32' || g === 'G33';
      const words = [];
      if (g !== modal.g || thread) words.push(g);
      const fx = f(X, 4); const fy = f(Y, 4); const fz = f(Z, 4);
      let moved = false;
      if (fx !== modal.x) { words.push(`X${fx}`); moved = true; }
      if (!lathe && fy !== modal.y) { words.push(`Y${fy}`); moved = true; }
      if (fz !== modal.z) { words.push(`Z${fz}`); moved = true; }
      if (!moved) continue;
      if (thread) words.push(g === 'G33' ? `K${f(m.f, 4)}` : `F${f(m.f, 4)}`);
      else if (g === 'G1') { const ff = lathe ? f(m.f, 4) : String(Math.round(m.f)); if (ff !== modal.f) { words.push(`F${ff}`); modal.f = ff; } }
      modal.g = thread ? 'thread' : g; modal.x = fx; modal.y = fy; modal.z = fz;
      emit(words.join(' '));
    }
  }
  if (coolant) emit('M9');
  emit('M5');
  for (const h of post.home) emit(h);
  emit(post.end);
  if (post.percent) lines.push('%');
  return `${lines.join('\n')}\n`;
}

function cycleLine(m, post, postId, origin, lathe, f) {
  const [x, y, zb] = m.p;
  const X = lathe ? 0 : x - origin[0]; const Y = y - origin[1];
  const Z = zb - origin[2]; const R = m.r - origin[2];
  const xy = lathe ? '' : `X${f(X)} Y${f(Y)} `;
  const head = lathe ? 'G0 X0. ' : '';
  if (m.cycle === 'tap') {
    if (post.tap === 'G33.1') return `G0 ${xy.trim()}\nG0 Z${f(R)}\nG33.1 Z${f(Z)} K${f(m.pitch, 4)}\nG0 Z${f(m.init - origin[2])}`;
    return `G98 G84 ${xy}Z${f(Z)} R${f(R)} F${f(m.f, 2)}\nG80`;
  }
  const word = m.cycle === 'peck' ? 'G83' : m.cycle === 'chip' ? 'G73' : m.dwell > 0 ? 'G82' : 'G81';
  const q = m.q > 0 ? ` Q${f(m.q)}` : '';
  const p = m.dwell > 0 ? ` P${Math.round(m.dwell * 1000)}` : '';
  const feed = lathe ? f(m.f, 4) : String(Math.round(m.f));
  return `${head}${lathe ? '' : 'G98 '}${word} ${xy}Z${f(Z)} R${f(R)}${q}${p} F${feed}\nG80`;
}

// ───────────────────────── reading G-code

/**
 * Replays a program into moves in WCS coordinates: [{ k: 'r' | 'f' | 't', p: [x, y, z] }] (lathe: x the radius,
 * y 0). Understands G0 G1 G2 G3 (I J K or R), G32 / G33, G81 G82 G83 G73 G84 G33.1 with G98 / G99, G80, G90 /
 * G91, G20 / G21, comments in parentheses and after ';', N numbers, and lathe diameter mode.
 */
export function parseGcode(text, { lathe = false, start = null } = {}) {
  const moves = [];
  let pos = start ? [...start] : [0, 0, 0];
  let started = Boolean(start);
  let motion = null; let abs = true; let scale = 1; let cycle = null; let retractInit = true;
  let initZ = null; let feed = 0;
  const lines = String(text).split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').trim().toUpperCase();
    if (!line || line === '%' || /^O\d+/.test(line)) continue;
    const words = [...line.matchAll(/([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g)].map((w) => [w[1], Number(w[2])]);
    const get = (L) => { const w = words.find((x) => x[0] === L); return w ? w[1] : null; };
    const gs = words.filter((w) => w[0] === 'G').map((w) => w[1]);
    if (gs.includes(28) || gs.includes(53)) continue; // home moves: not part of the path
    for (const g of gs) {
      if (g === 90) abs = true; else if (g === 91) abs = false;
      else if (g === 20) scale = 25.4; else if (g === 21) scale = 1;
      else if (g === 98) retractInit = true; else if (!lathe && g === 99) retractInit = false;
      else if (g === 80) { cycle = null; motion = null; }
      else if ([0, 1, 2, 3, 32, 33].includes(g)) { motion = g; cycle = null; }
      else if ([81, 82, 83, 73, 84, 33.1].includes(g)) { cycle = g; motion = null; initZ = pos[2]; }
    }
    const F = get('F'); if (F != null) feed = F;
    const X = get('X'); const Y = get('Y'); const Z = get('Z');
    if (X == null && Y == null && Z == null) continue;
    const target = [...pos];
    const axis = (v, i, k = 1) => { if (v == null) return; const val = v * scale * k; target[i] = abs ? val : pos[i] + val; };
    axis(X, 0, lathe ? 0.5 : 1); axis(Y, 1); axis(Z, 2);
    if (!started) { pos = target; started = true; if (motion === 0) { moves.push({ k: 'r', p: [...pos] }); continue; } }
    if (cycle != null) {
      // A canned cycle at this position: Z the bottom, R the retract plane.
      const R = get('R') != null ? get('R') * scale : (cycle === 33.1 ? pos[2] : pos[2]);
      const zb = Z != null ? Z * scale : pos[2];
      const x = target[0]; const y = target[1];
      const init = initZ ?? pos[2];
      if (cycle === 33.1) {
        moves.push({ k: 'f', p: [x, y, zb] }); moves.push({ k: 'f', p: [x, y, pos[2]] });
        pos = [x, y, pos[2]]; cycle = null; continue;
      }
      const q = get('Q') != null ? get('Q') * scale : 0;
      moves.push({ k: 'r', p: [x, y, init] });
      moves.push({ k: 'r', p: [x, y, R] });
      if ((cycle === 83 || cycle === 73) && q > 0) {
        let z = R;
        while (z - q > zb + 1e-9) {
          const nz = z - q;
          moves.push({ k: 'f', p: [x, y, nz] });
          if (cycle === 83) { moves.push({ k: 'r', p: [x, y, R] }); moves.push({ k: 'r', p: [x, y, nz + 0.5] }); } else moves.push({ k: 'r', p: [x, y, nz + 0.5] });
          z = nz;
          if (cycle === 73) moves.push({ k: 'f', p: [x, y, z] });
        }
      }
      moves.push({ k: 'f', p: [x, y, zb] });
      if (cycle === 84) { moves.push({ k: 'f', p: [x, y, R] }); if (retractInit && Math.abs(init - R) > 1e-9) moves.push({ k: 'r', p: [x, y, init] }); pos = [x, y, retractInit ? init : R]; }
      else { const back = retractInit ? init : R; moves.push({ k: 'r', p: [x, y, back] }); pos = [x, y, back]; }
      continue;
    }
    if (motion === 2 || motion === 3) {
      // Arc in the XY plane (G17).
      const I = get('I'); const J = get('J'); const Rw = get('R');
      let cx; let cy;
      if (I != null || J != null) { cx = pos[0] + (I ?? 0) * scale; cy = pos[1] + (J ?? 0) * scale; }
      else if (Rw != null) {
        const r = Rw * scale; const dx = target[0] - pos[0]; const dy = target[1] - pos[1]; const d = Math.hypot(dx, dy);
        const h = Math.sqrt(Math.max(0, r * r - (d * d) / 4)) * ((motion === 2) === (r > 0) ? -1 : 1);
        cx = pos[0] + dx / 2 - (dy / d) * h; cy = pos[1] + dy / 2 + (dx / d) * h;
      } else { cx = pos[0]; cy = pos[1]; }
      const r = Math.hypot(pos[0] - cx, pos[1] - cy);
      let a0 = Math.atan2(pos[1] - cy, pos[0] - cx); let a1 = Math.atan2(target[1] - cy, target[0] - cx);
      if (motion === 2) { while (a1 >= a0 - 1e-12) a1 -= 2 * Math.PI; } else { while (a1 <= a0 + 1e-12) a1 += 2 * Math.PI; }
      const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / 0.2));
      for (let k = 1; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; moves.push({ k: 'f', p: [cx + r * Math.cos(a), cy + r * Math.sin(a), pos[2] + ((target[2] - pos[2]) * k) / n] }); }
      pos = target; continue;
    }
    const k = motion === 0 ? 'r' : motion === 32 || motion === 33 ? 't' : 'f';
    moves.push({ k, p: [...target], f: feed });
    pos = target;
  }
  return moves;
}

/**
 * Toolpaths' moves in WCS coordinates, expanded the way the reader expands cycles (to compare with a replay):
 * [{ k, p }].
 */
export function wcsMoves(paths, stock, wcs = 'stockTopCenter', bounds = null, start = null) {
  const origin = wcsOrigin(stock, wcs, bounds);
  const out = [];
  let cur = start ? [...start] : [0, 0, 0];
  let lastTool = null;
  for (const tp of paths) {
    const change = tp.tool !== lastTool;
    lastTool = tp.tool;
    let first = true;
    for (const m of expandMoves(tp.moves)) {
      if (!m.p || m.k === 'dwell') continue;
      const p = tp.kind === 'turn' ? [m.p[0], 0, m.p[2] - origin[2]] : [m.p[0] - origin[0], m.p[1] - origin[1], m.p[2] - origin[2]];
      // A post writes a tool's first position as XY, then Z with the length offset.
      if (first && change && tp.kind !== 'turn') out.push({ k: 'r', p: [p[0], p[1], cur[2]] });
      first = false;
      out.push({ k: m.k === 't' ? 't' : m.k === 'r' ? 'r' : 'f', p });
      cur = p;
    }
  }
  return out;
}

/** The largest distance between two move lists after dropping zero-length moves (Infinity when the counts differ). */
export function compareMoves(a, b) {
  const clean = (list) => { const out = []; for (const m of list) { const last = out.at(-1); if (last && Math.hypot(m.p[0] - last.p[0], m.p[1] - last.p[1], m.p[2] - last.p[2]) < 1e-6) continue; out.push(m); } return out; };
  const A = clean(a); const B = clean(b);
  if (A.length !== B.length) return { max: Infinity, count: [A.length, B.length] };
  let max = 0; let kinds = 0;
  for (let i = 0; i < A.length; i++) { max = Math.max(max, Math.hypot(A[i].p[0] - B[i].p[0], A[i].p[1] - B[i].p[1], A[i].p[2] - B[i].p[2])); if (A[i].k !== B[i].k) kinds++; }
  return { max, kinds, count: [A.length, B.length] };
}

// ───────────────────────── set-up sheet

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (s) => { const m = Math.floor(s / 60); const r = Math.round(s - m * 60); return `${m}:${String(r).padStart(2, '0')}`; };

/**
 * The set-up sheet (a printable HTML page): part, material, machine, post, stock and work offset, the tools and
 * the operations with speeds, feeds and times. labels: translated texts by key.
 */
export function setupSheetHtml({ name, material, machine, post, stock, wcs, origin, tools, ops, paths, times, labels = {}, date = '', lang = 'en' }) {
  const L = (k, d) => esc(labels[k] ?? d);
  const used = new Set(paths.map((p) => p.tool));
  const stockText = stock.kind === 'bar' ? `Ø${(2 * stock.r).toFixed(2)} × ${(stock.z1 - stock.z0).toFixed(2)}` : `${(stock.x1 - stock.x0).toFixed(2)} × ${(stock.y1 - stock.y0).toFixed(2)} × ${(stock.z1 - stock.z0).toFixed(2)}`;
  const toolRows = tools.filter((t) => used.has(t.id)).map((t) => `<tr><td>T${t.T}</td><td>${esc(labels[`tool.${t.type}`] ?? t.type)}</td><td>${t.d}</td><td>${t.flutes ?? ''}</td><td>${t.rc ?? t.nose ?? ''}</td><td>${t.length ?? ''}</td><td>${esc(t.thread ?? t.insert ?? '')}</td></tr>`).join('');
  const opRows = paths.map((p, i) => {
    const op = ops.find((o) => o.id === p.op) ?? {};
    const t = tools.find((x) => x.id === p.tool) ?? {};
    return `<tr><td>${i + 1}</td><td>${esc(op.name ?? op.type)}</td><td>${esc(labels[`op.${op.type}`] ?? op.type)}</td><td>T${t.T ?? '?'}</td><td>${p.css ? `${Math.round(p.vc)} m/min` : Math.round(p.rpm)}</td><td>${p.kind === 'turn' ? `${p.feed} mm/rev` : `${Math.round(p.feed)}`}</td><td>${op.stepdown ?? ''}</td><td>${op.stepover != null ? `${Math.round(op.stepover * 100)}%` : ''}</td><td>${fmtTime(times.perOp[i] ?? 0)}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><title>${L('sheet.title', 'Set-up sheet')} — ${esc(name)}</title>
<style>body{font:13px/1.45 system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#eef1f5}.kv td:first-child{width:28%;font-weight:600}.total{font-weight:700}@media print{body{margin:8mm}}</style></head><body>
<h1>${L('sheet.title', 'Set-up sheet')}: ${esc(name)}</h1><div>${esc(date)}</div>
<h2>${L('sheet.job', 'Job')}</h2><table class="kv">
<tr><td>${L('sheet.material', 'Material')}</td><td>${esc(material)}</td></tr>
<tr><td>${L('sheet.machine', 'Machine')}</td><td>${esc(machine)}</td></tr>
<tr><td>${L('sheet.post', 'Post-processor')}</td><td>${esc(post)}</td></tr>
<tr><td>${L('sheet.stock', 'Stock')}</td><td>${esc(stockText)} mm</td></tr>
<tr><td>${L('sheet.wcs', 'Work offset (G54)')}</td><td>${esc(labels[`wcs.${wcs}`] ?? wcs)} — X${origin[0].toFixed(3)} Y${origin[1].toFixed(3)} Z${origin[2].toFixed(3)}</td></tr>
<tr><td>${L('sheet.cycle', 'Cycle time')}</td><td class="total">${fmtTime(times.total)} (${L('sheet.cutting', 'cutting')} ${fmtTime(times.cutting)}, ${L('sheet.rapid', 'rapid')} ${fmtTime(times.rapid)}, ${L('sheet.changes', 'tool changes')} ${times.changes})</td></tr>
</table>
<h2>${L('sheet.tools', 'Tools')}</h2><table><tr><th>T</th><th>${L('sheet.type', 'Type')}</th><th>Ø</th><th>${L('sheet.flutes', 'Flutes')}</th><th>${L('sheet.corner', 'Corner / nose R')}</th><th>${L('sheet.length', 'Length')}</th><th>${L('sheet.note', 'Note')}</th></tr>${toolRows}</table>
<h2>${L('sheet.ops', 'Operations')}</h2><table><tr><th>#</th><th>${L('sheet.name', 'Name')}</th><th>${L('sheet.type', 'Type')}</th><th>T</th><th>${L('sheet.speed', 'Speed')}</th><th>${L('sheet.feed', 'Feed')}</th><th>${L('sheet.stepdown', 'Stepdown')}</th><th>${L('sheet.stepover', 'Stepover')}</th><th>${L('sheet.time', 'Time')}</th></tr>${opRows}</table>
</body></html>`;
}
