// Text drawing with a TeX subset (^ _ {} greek letters, \bf \it \rm and
// common symbols) for any Canvas 2D-like context (canvas or the SVG recorder).

const SYM = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', sigma: 'σ', varsigma: 'ς',
  tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', bullet: '•', circ: '∘', deg: '°', infty: '∞', partial: '∂', nabla: '∇',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝', cong: '≅',
  leftarrow: '←', rightarrow: '→', uparrow: '↑', downarrow: '↓', leftrightarrow: '↔', Leftarrow: '⇐', Rightarrow: '⇒', to: '→',
  sum: '∑', prod: '∏', int: '∫', oint: '∮', sqrt: '√', forall: '∀', exists: '∃', in: '∈', notin: '∉', subset: '⊂', supset: '⊃',
  cup: '∪', cap: '∩', wedge: '∧', vee: '∨', neg: '¬', emptyset: '∅', ldots: '…', cdots: '⋯', prime: '′', angle: '∠', perp: '⊥',
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', copyright: '©', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', hbar: 'ℏ', ell: 'ℓ',
  '{': '{', '}': '}', '\\': '\\', '_': '_', '^': '^', '%': '%', '$': '$', '&': '&', '#': '#', ' ': ' ',
};

/**
 * Parses TeX-subset text into runs: [{text, level (0 base, ±1 sup/sub, ±2 ...), bold, italic}].
 */
export function parseTex(s, interpreter = 'tex') {
  if (interpreter === 'none') return [{ text: s, level: 0, bold: false, italic: false }];
  if (interpreter === 'latex') s = s.replace(/\$/g, '');
  const runs = [];
  let i = 0;
  const push = (text, st) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.level === st.level && last.bold === st.bold && last.italic === st.italic) last.text += text;
    else runs.push({ text, level: st.level, bold: st.bold, italic: st.italic });
  };
  const parseGroup = (st, stopAtBrace) => {
    const local = { ...st };
    while (i < s.length) {
      const ch = s[i];
      if (ch === '}' && stopAtBrace) { i++; return; }
      if (ch === '{') { i++; parseGroup(local, true); continue; }
      if (ch === '^' || ch === '_') {
        i++;
        const sub = { ...local, level: local.level + (ch === '^' ? 1 : -1) };
        if (s[i] === '{') { i++; parseGroup(sub, true); } else if (s[i] === '\\') { parseCommand(sub, true); } else if (i < s.length) { push(s[i], sub); i++; }
        continue;
      }
      if (ch === '\\') { parseCommand(local, false); continue; }
      push(ch, local);
      i++;
    }
  };
  const parseCommand = (st, single) => {
    i++; // backslash
    let name = '';
    if (i < s.length && !/[A-Za-z]/.test(s[i])) { name = s[i]; i++; } else { while (i < s.length && /[A-Za-z]/.test(s[i])) { name += s[i]; i++; } }
    if (name === 'bf') { st.bold = true; return; }
    if (name === 'it' || name === 'sl') { st.italic = true; return; }
    if (name === 'rm') { st.bold = false; st.italic = false; return; }
    if (name === 'mathrm' || name === 'textrm' || name === 'mathbf' || name === 'mathit' || name === 'text') {
      const sub = { ...st, bold: name === 'mathbf' || st.bold, italic: name === 'mathit' };
      if (s[i] === '{') { i++; parseGroup(sub, true); }
      return;
    }
    if (name === 'frac') { // \frac{a}{b} → a/b
      if (s[i] === '{') { i++; parseGroup(st, true); }
      push('/', st);
      if (s[i] === '{') { i++; parseGroup(st, true); }
      return;
    }
    if (name === 'fontsize' || name === 'color' || name === 'fontname') { // skip {arg}
      if (s[i] === '{') { const j = s.indexOf('}', i); i = j < 0 ? s.length : j + 1; }
      return;
    }
    if (SYM[name] != null) { push(SYM[name], st); if (s[i] === ' ' && /[A-Za-z]/.test(name)) i++; return; }
    push('\\' + name, st);
    void single;
  };
  parseGroup({ level: 0, bold: false, italic: false }, false);
  return runs;
}

const fontOf = (size, bold, italic, family) => `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${Math.max(1, size).toFixed(1)}px ${family}`;
export const DEFAULT_FAMILY = "'Segoe UI', 'Noto Sans KR', 'Malgun Gothic', Helvetica, Arial, sans-serif";

/** Lays out one line: {width, runs:[{text, x, dy, font}], ascent, descent}. */
export function layoutLine(ctx, line, size, opts = {}) {
  const runs = parseTex(line, opts.interpreter || 'tex');
  const family = opts.family || DEFAULT_FAMILY;
  let x = 0;
  const out = [];
  let up = 0, down = 0;
  for (const r of runs) {
    const lvl = Math.max(-2, Math.min(2, r.level));
    const sz = lvl === 0 ? size : size * (Math.abs(lvl) === 1 ? 0.7 : 0.55);
    const dy = lvl === 0 ? 0 : lvl > 0 ? -size * 0.38 * lvl : size * 0.22 * -lvl;
    const font = fontOf(sz, r.bold || opts.bold, r.italic || opts.italic, family);
    ctx.font = font;
    const w = ctx.measureText(r.text).width;
    out.push({ text: r.text, x, dy, font });
    x += w;
    up = Math.max(up, -dy + sz * 0.8);
    down = Math.max(down, dy + sz * 0.25);
  }
  return { width: x, runs: out, ascent: Math.max(up, size * 0.8), descent: Math.max(down, size * 0.25) };
}

/** Lines of a String value (string, array, or text with \n). */
export function linesOf(s) {
  if (s == null) return [];
  if (Array.isArray(s)) return s.flatMap((x) => String(x).split('\n'));
  return String(s).split('\n');
}

/** Size of multi-line TeX text: {width, height, lines}. */
export function measureTex(ctx, s, size, opts = {}) {
  const lines = linesOf(s).map((l) => layoutLine(ctx, l, size, opts));
  const lh = size * 1.25;
  return { width: lines.reduce((w, l) => Math.max(w, l.width), 0), height: lines.length ? lh * lines.length : 0, lines, lineHeight: lh };
}

/**
 * Draws TeX text. align: 'left'|'center'|'right'; valign: 'top'|'middle'|
 * 'bottom'|'baseline'|'cap'; rotation in degrees (counter-clockwise).
 * Returns the box {width, height} drawn.
 */
export function drawTex(ctx, s, x, y, opts = {}) {
  const size = opts.size || 12;
  const m = measureTex(ctx, s, size, opts);
  if (!m.lines.length) return { width: 0, height: 0 };
  ctx.save();
  ctx.translate(x, y);
  if (opts.rotation) ctx.rotate((-opts.rotation * Math.PI) / 180);
  const align = opts.align || 'left';
  const valign = opts.valign || 'middle';
  let top;
  if (valign === 'top') top = 0;
  else if (valign === 'bottom') top = -m.height;
  else if (valign === 'cap') top = -size * 0.15;
  else if (valign === 'baseline') top = -(m.height - m.lineHeight) - size * 0.95;
  else top = -m.height / 2;
  if (opts.background && opts.background !== 'none' || opts.edge && opts.edge !== 'none') {
    const pad = opts.margin != null ? opts.margin : 3;
    const bx = align === 'left' ? -pad : align === 'right' ? -m.width - pad : -m.width / 2 - pad;
    if (opts.background && opts.background !== 'none') { ctx.fillStyle = opts.background; ctx.fillRect(bx, top - pad, m.width + 2 * pad, m.height + 2 * pad); }
    if (opts.edge && opts.edge !== 'none') { ctx.strokeStyle = opts.edge; ctx.lineWidth = 1; ctx.strokeRect(bx, top - pad, m.width + 2 * pad, m.height + 2 * pad); }
  }
  ctx.fillStyle = opts.color || '#000';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  m.lines.forEach((ln, k) => {
    const lx = align === 'left' ? 0 : align === 'right' ? -ln.width : (align === 'center' ? -ln.width / 2 : 0);
    const base = top + k * m.lineHeight + size * 0.95;
    for (const r of ln.runs) { ctx.font = r.font; ctx.fillText(r.text, lx + r.x, base + r.dy); }
  });
  ctx.restore();
  return { width: m.width, height: m.height };
}
