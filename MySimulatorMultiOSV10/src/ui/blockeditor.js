// The graphical editor of a block diagram (the Simulink way of drawing a model): the
// diagram's text "name = block(input, key = value)" / "name = expression" shown as blocks
// and wires. Every block has an input expression; its input ports are the signal names in
// it, so a wire drawn to a port puts the source's name there. Block places are kept in a
// "# layout:" comment line (the engine skips comments).
import { h, replace } from './dom.js';
import { popup } from './dialogs.js';
import { t } from '../core/i18n.js';

/** Block types: input taken?, parameters with defaults, icon, names. */
export const BLOCK_TYPES = {
  integrator: { input: true, params: { x0: '0' }, icon: '∫', ko: '적분기', en: 'Integrator' },
  tf: { input: true, params: { num: '[1]', den: '[1, 1]' }, icon: 'H(s)', ko: '전달함수', en: 'Transfer function' },
  pid: { input: true, params: { kp: '1', ki: '0', kd: '0' }, icon: 'PID', ko: 'PID', en: 'PID' },
  delay: { input: true, params: { t: '1' }, icon: 'e⁻ˢᵀ', ko: '시간 지연', en: 'Time delay' },
  unitdelay: { input: true, params: { ts: '0.1' }, icon: 'z⁻¹', ko: '단위 지연', en: 'Unit delay' },
  zoh: { input: true, params: { ts: '0.1' }, icon: 'ZOH', ko: '영차 유지', en: 'Zero-order hold' },
  derivative: { input: true, params: {}, icon: 'd/dt', ko: '미분', en: 'Derivative' },
  ratelimit: { input: true, params: { rise: '1' }, icon: '⟋', ko: '기울기 제한', en: 'Rate limiter' },
  relay: { input: true, params: { on: '0.5', off: '-0.5', high: '1', low: '0' }, icon: '⎍', ko: '릴레이', en: 'Relay' },
  saturation: { input: true, params: { lo: '-1', hi: '1' }, icon: '⟓', ko: '포화', en: 'Saturation' },
  deadzone: { input: true, params: { lo: '-0.5', hi: '0.5' }, icon: '⊣⊢', ko: '데드존', en: 'Dead zone' },
  lookup: { input: true, params: { x: '[0, 1]', y: '[0, 1]' }, icon: '⌗', ko: '룩업 표', en: 'Lookup table' },
  step: { input: false, params: { t0: '1', a: '1' }, icon: '⎍', ko: '계단', en: 'Step' },
  sine: { input: false, params: { f: '1', a: '1' }, icon: '∿', ko: '정현파', en: 'Sine' },
  square: { input: false, params: { f: '1', a: '1' }, icon: '⊓', ko: '구형파', en: 'Square' },
  pulse: { input: false, params: { period: '1', width: '0.5', a: '1' }, icon: '⊓', ko: '펄스', en: 'Pulse' },
  ramp: { input: false, params: { slope: '1' }, icon: '⟋', ko: '램프', en: 'Ramp' },
  noise: { input: false, params: { std: '0.1' }, icon: '≋', ko: '잡음', en: 'Noise' },
  input: { input: false, params: { column: '' }, icon: '⇥', ko: '입력 열', en: 'Input column' },
};
/** Expression blocks offered on the palette. */
const EXPRESSIONS = [
  { name: 'sum', expr: 'a - b', icon: 'Σ', ko: '합 (a − b)', en: 'Sum (a − b)' },
  { name: 'gain', expr: '2*a', icon: 'K', ko: '이득 (K·a)', en: 'Gain (K·a)' },
  { name: 'product', expr: 'a*b', icon: '×', ko: '곱', en: 'Product' },
  { name: 'f', expr: 'sin(a)', icon: 'ƒ', ko: '식', en: 'Expression' },
];
const RESERVED = new Set(['t', 'pi', 'e', 'true', 'false']);
const W = 132;
const PORT = 18;

/** Top-level comma split (brackets and parentheses kept). */
function splitTop(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of text) {
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Names an expression reads (functions and constants left out). */
export function readsOf(expr) {
  const out = [];
  for (const m of String(expr ?? '').matchAll(/[A-Za-z_][A-Za-z0-9_]*(\s*\()?/g)) {
    if (m[1]) continue;
    const name = m[0];
    if (!RESERVED.has(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/** The diagram text → { blocks, comments }. */
export function parseDiagram(text) {
  const blocks = [];
  const comments = [];
  let layout = {};
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const m = /^#\s*layout:\s*(.*)$/i.exec(line);
      if (m) {
        for (const item of m[1].split(';')) {
          const [name, x, y] = item.trim().split(/\s+/);
          if (name && Number.isFinite(+x) && Number.isFinite(+y)) layout[name] = { x: +x, y: +y };
        }
      } else comments.push(raw);
      continue;
    }
    const at = line.indexOf('=');
    if (at < 0) continue;
    const name = line.slice(0, at).trim();
    const rhs = line.slice(at + 1).trim();
    const call = /^([A-Za-z_]\w*)\s*\(([\s\S]*)\)\s*$/.exec(rhs);
    if (call && BLOCK_TYPES[call[1].toLowerCase()]) {
      const kind = call[1].toLowerCase();
      const args = splitTop(call[2]);
      const params = {};
      let input = '';
      for (const a of args) {
        const eq = a.indexOf('=');
        if (eq > 0 && /^[A-Za-z_]\w*$/.test(a.slice(0, eq).trim())) params[a.slice(0, eq).trim()] = a.slice(eq + 1).trim();
        else if (!input) input = a;
      }
      blocks.push({ name, kind, input, params });
    } else blocks.push({ name, kind: 'expr', input: rhs, params: {} });
  }
  // Places: kept ones, or columns by the longest chain from the sources.
  const depth = {};
  const visit = (b, stack) => {
    if (depth[b.name] != null) return depth[b.name];
    if (stack.has(b.name)) return 0;
    stack.add(b.name);
    let d = 0;
    for (const n of readsOf(b.input)) {
      const src = blocks.find((x) => x.name === n);
      if (src) d = Math.max(d, visit(src, stack) + 1);
    }
    stack.delete(b.name);
    depth[b.name] = d;
    return d;
  };
  const rows = {};
  for (const b of blocks) {
    const d = visit(b, new Set());
    rows[d] = (rows[d] ?? 0) + 1;
    b.x = layout[b.name]?.x ?? 30 + d * 190;
    b.y = layout[b.name]?.y ?? 30 + (rows[d] - 1) * 110;
  }
  return { blocks, comments };
}

/** Blocks → the diagram text (with the layout comment). */
export function writeDiagram({ blocks, comments }) {
  const lines = [...comments];
  for (const b of blocks) {
    if (b.kind === 'expr') lines.push(`${b.name} = ${b.input || '0'}`);
    else {
      const args = [];
      if (BLOCK_TYPES[b.kind].input) args.push(b.input || '0');
      for (const [k, v] of Object.entries(b.params)) if (String(v).trim() !== '') args.push(`${k} = ${v}`);
      lines.push(`${b.name} = ${b.kind}(${args.join(', ')})`);
    }
  }
  lines.push(`# layout: ${blocks.map((b) => `${b.name} ${Math.round(b.x)} ${Math.round(b.y)}`).join('; ')}`);
  return lines.join('\n');
}

/** Replaces the whole word `from` with `to` in an expression. */
function renameIn(expr, from, to) {
  return String(expr).replace(new RegExp(`(?<![A-Za-z0-9_.])${from}(?![A-Za-z0-9_]|\\s*\\()`, 'g'), to);
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, String(v));
  for (const c of children) node.append(c);
  return node;
};

/** Opens the editor on `text`; onSave(text) gets the new diagram. */
export function openBlockEditor({ text, lang, onSave, constants = [] }) {
  const model = parseDiagram(text);
  let selected = null;
  let wire = null; // { from, x, y } while drawing a wire
  const ko = lang !== 'en';
  const canvas = el('svg', { class: 'block-canvas', 'data-testid': 'block-canvas' });
  const side = h('div', { className: 'block-side', dataset: { testid: 'block-side' } });
  const height = (b) => 44 + Math.max(1, readsOf(b.input).length) * PORT;
  // Ports: the names an input reads, without the node's constants.
  const portsOf = (b) => (b.kind === 'expr' || BLOCK_TYPES[b.kind]?.input ? readsOf(b.input).filter((n) => !constants.includes(n)) : []);
  const portY = (b, i) => b.y + 36 + i * PORT;
  const outY = (b) => b.y + height(b) / 2;
  const unique = (base) => {
    let k = 1;
    while (model.blocks.some((b) => b.name === `${base}${k}`)) k++;
    return `${base}${k}`;
  };

  function draw() {
    while (canvas.firstChild) canvas.firstChild.remove();
    const maxX = Math.max(860, ...model.blocks.map((b) => b.x + W + 60));
    const maxY = Math.max(520, ...model.blocks.map((b) => b.y + height(b) + 40));
    canvas.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
    // Scaled to the panel's width (the pointer maps through the viewBox).
    canvas.setAttribute('width', '100%');
    canvas.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    canvas.append(el('defs', {}, el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'block-arrow' }))));
    // Wires: from each source's output to the ports that read it.
    for (const b of model.blocks) {
      portsOf(b).forEach((name, i) => {
        const src = model.blocks.find((x) => x.name === name);
        if (!src) return;
        const x1 = src.x + W;
        const y1 = outY(src);
        const x2 = b.x;
        const y2 = portY(b, i);
        const back = x2 < x1 + 20;
        const d = back
          ? `M${x1},${y1} h18 V${Math.max(src.y + height(src), b.y + height(b)) + 24} H${x2 - 18} V${y2} H${x2}`
          : `M${x1},${y1} C${x1 + 50},${y1} ${x2 - 50},${y2} ${x2},${y2}`;
        const path = el('path', { d, class: `block-wire${back ? ' feedback' : ''}`, 'marker-end': 'url(#arrow)', 'data-testid': `wire-${src.name}-${b.name}` });
        path.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
          // Pick the wire up: the port goes back to an unnamed input.
          b.input = renameIn(b.input, name, unique('in'));
          draw();
        });
        canvas.append(path);
      });
    }
    for (const b of model.blocks) {
      const type = BLOCK_TYPES[b.kind];
      const g = el('g', { class: `block${selected === b ? ' selected' : ''}`, 'data-testid': `block-${b.name}`, transform: `translate(${b.x},${b.y})` });
      g.append(el('rect', { width: W, height: height(b), rx: 6, class: `block-box ${b.kind}` }));
      const title = el('text', { x: 8, y: 16, class: 'block-name' });
      title.textContent = b.name;
      const kind = el('text', { x: W - 8, y: 16, class: 'block-kind', 'text-anchor': 'end' });
      kind.textContent = type?.icon ?? 'ƒ';
      g.append(title, kind);
      const sub = el('text', { x: 8, y: 30, class: 'block-sub' });
      sub.textContent = b.kind === 'expr' ? b.input.slice(0, 20) : Object.entries(b.params).map(([k, v]) => `${k}=${v}`).join(' ').slice(0, 22);
      g.append(sub);
      portsOf(b).forEach((name, i) => {
        const connected = model.blocks.some((x) => x.name === name);
        const port = el('circle', { cx: 0, cy: portY(b, i) - b.y, r: 5, class: `block-port in${connected ? ' on' : ''}`, 'data-port': `${b.name}:${i}`, 'data-testid': `port-${b.name}-${name}` });
        const label = el('text', { x: 9, y: portY(b, i) - b.y + 4, class: 'block-port-label' });
        label.textContent = name;
        g.append(port, label);
      });
      if (type && !type.input && b.kind !== 'expr') g.append(el('text', { x: 8, y: 44, class: 'block-port-label' }));
      const out = el('circle', { cx: W, cy: outY(b) - b.y, r: 6, class: 'block-port out', 'data-testid': `out-${b.name}` });
      out.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        const p = point(event);
        wire = { from: b, x: p.x, y: p.y };
        canvas.setPointerCapture(event.pointerId);
      });
      g.append(out);
      g.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        selected = b;
        const p = point(event);
        drag = { b, dx: p.x - b.x, dy: p.y - b.y };
        canvas.setPointerCapture(event.pointerId);
        draw();
        renderSide();
      });
      canvas.append(g);
    }
    if (wire) {
      canvas.append(el('path', { d: `M${wire.from.x + W},${outY(wire.from)} L${wire.x},${wire.y}`, class: 'block-wire drawing' }));
    }
  }

  let drag = null;
  const point = (event) => {
    const r = canvas.getBoundingClientRect();
    const vb = canvas.viewBox.baseVal;
    return { x: ((event.clientX - r.left) / r.width) * vb.width, y: ((event.clientY - r.top) / r.height) * vb.height };
  };
  canvas.addEventListener('pointermove', (event) => {
    const p = point(event);
    if (drag) {
      drag.b.x = Math.max(0, Math.round((p.x - drag.dx) / 10) * 10);
      drag.b.y = Math.max(0, Math.round((p.y - drag.dy) / 10) * 10);
      draw();
    } else if (wire) {
      wire.x = p.x;
      wire.y = p.y;
      draw();
    }
  });
  canvas.addEventListener('pointerup', (event) => {
    if (wire) {
      // Dropped on an input port, or on a block body (its first port, or its empty input).
      const p = point(event);
      const target = model.blocks.find((b) => p.x >= b.x - 10 && p.x <= b.x + W && p.y >= b.y && p.y <= b.y + height(b));
      if (target && target !== wire.from && (target.kind === 'expr' || BLOCK_TYPES[target.kind].input)) {
        const ports = portsOf(target);
        const i = ports.length ? Math.max(0, Math.min(ports.length - 1, Math.round((p.y - target.y - 36) / PORT))) : -1;
        target.input = i >= 0 ? renameIn(target.input, ports[i], wire.from.name) : wire.from.name;
        selected = target;
      }
      wire = null;
      draw();
      renderSide();
    }
    drag = null;
  });
  canvas.addEventListener('pointerdown', () => {
    selected = null;
    draw();
    renderSide();
  });

  function renderSide() {
    if (!selected) {
      replace(side, h('p', { className: 'muted' }, ko ? '블록을 누르면 이름·입력·설정을 고칩니다. 출력 포트(오른쪽 ●)를 끌어 다른 블록의 입력 포트에 놓으면 연결됩니다. 연결선을 누르면 끊깁니다.' : 'Click a block to edit its name, input and settings. Drag an output port (● on the right) onto another block\'s input port to wire them; click a wire to cut it.'));
      return;
    }
    const b = selected;
    const field = (label, value, onChange, testid) => h('label', { className: 'block-field' }, h('span', null, label), h('input', { type: 'text', value, dataset: { testid }, onChange: (event) => { onChange(event.target.value.trim()); draw(); renderSide(); } }));
    const items = [
      h('div', { className: 'block-side-title' }, `${BLOCK_TYPES[b.kind]?.icon ?? 'ƒ'} ${b.kind === 'expr' ? (ko ? '식' : 'Expression') : (ko ? BLOCK_TYPES[b.kind].ko : BLOCK_TYPES[b.kind].en)}`),
      field(ko ? '이름' : 'Name', b.name, (v) => {
        if (!/^[A-Za-z_]\w*$/.test(v) || model.blocks.some((x) => x !== b && x.name === v)) return;
        for (const x of model.blocks) x.input = renameIn(x.input, b.name, v);
        b.name = v;
      }, 'block-name'),
    ];
    if (b.kind === 'expr' || BLOCK_TYPES[b.kind].input) items.push(field(b.kind === 'expr' ? (ko ? '식' : 'Expression') : (ko ? '입력 (식)' : 'Input (expression)'), b.input, (v) => { b.input = v; }, 'block-input'));
    for (const key of Object.keys({ ...(BLOCK_TYPES[b.kind]?.params ?? {}), ...b.params })) {
      items.push(field(key, b.params[key] ?? '', (v) => { b.params[key] = v; }, `block-param-${key}`));
    }
    items.push(h('button', { type: 'button', dataset: { testid: 'block-delete' }, onClick: () => { model.blocks = model.blocks.filter((x) => x !== b); selected = null; draw(); renderSide(); } }, `🗑 ${ko ? '블록 삭제' : 'Delete block'}`));
    replace(side, ...items);
  }

  const add = (kind, expr = null, base = kind) => {
    const name = unique(base);
    const free = 30 + model.blocks.length * 12;
    const params = kind === 'expr' ? {} : { ...BLOCK_TYPES[kind].params };
    const b = { name, kind, input: expr ?? (BLOCK_TYPES[kind]?.input ? unique('in') : ''), params, x: free, y: free };
    model.blocks.push(b);
    selected = b;
    draw();
    renderSide();
  };
  const palette = h('div', { className: 'block-palette', dataset: { testid: 'block-palette' } },
    h('div', { className: 'block-palette-title' }, ko ? '식 블록' : 'Expression blocks'),
    ...EXPRESSIONS.map((x) => h('button', { type: 'button', dataset: { testid: `block-add-${x.name}` }, onClick: () => add('expr', x.expr, x.name) }, `${x.icon} ${ko ? x.ko : x.en}`)),
    h('div', { className: 'block-palette-title' }, ko ? '블록' : 'Blocks'),
    ...Object.entries(BLOCK_TYPES).map(([kind, x]) => h('button', { type: 'button', dataset: { testid: `block-add-${kind}` }, onClick: () => add(kind) }, `${x.icon} ${ko ? x.ko : x.en}`)));
  draw();
  renderSide();
  const body = h('div', { className: 'block-editor' }, palette, h('div', { className: 'block-canvas-wrap' }, canvas), side);
  popup({
    id: 'blockeditor', title: ko ? '블록 다이어그램 편집기' : 'Block diagram editor', icon: '⧈', width: 1180, height: 680, body,
    actions: [
      { label: t('cancel'), onClick: (close) => close() },
      { label: ko ? '적용' : 'Apply', primary: true, testid: 'block-apply', onClick: (close) => { onSave(writeDiagram(model)); close(); } },
    ],
  });
}
