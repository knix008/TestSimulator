// Neuron view (canvas): the network drawn at the level of single units, left
// to right in computation order, for the current probe input.
//   vectors      → a column of neurons, coloured by activation
//   pictures     → one tile per channel (feature map)
//   sequences    → one strip per unit across the time steps
// Dense → dense connections are drawn one by one, coloured by weight (blue −, red +).
// Click a unit (or a pixel of a feature map, or a time step) to see exactly what
// it computes in the inspector; when a new snapshot arrives the signal sweeps
// through the network from the input to the output.
import { incoming, nodeById, topoOrder } from '../domain/graph.js';
import { shapeText } from '../domain/layers.js';
import { colorOf, drawHeatmap, range, rgb, theme, fmt, CLASS_COLORS } from './charts.js';

export class NeuronView {
  constructor(host, app, { compact = false } = {}) {
    this.host = host;
    this.app = app;
    this.compact = compact;
    this.hits = [];
    this.wave = 1;
    this.hover = null;
    host.innerHTML = '<div class="neuron-scroll"><canvas class="neuron-canvas"></canvas></div><div class="neuron-tip" hidden></div><div class="neuron-empty" hidden></div>';
    this.scroll = host.querySelector('.neuron-scroll');
    this.canvas = host.querySelector('canvas');
    this.canvas.view = this;
    this.tip = host.querySelector('.neuron-tip');
    this.empty = host.querySelector('.neuron-empty');
    this.canvas.addEventListener('click', (event) => this.click(event));
    this.canvas.addEventListener('pointermove', (event) => this.move(event));
    this.canvas.addEventListener('pointerleave', () => { this.tip.hidden = true; this.hover = null; });
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(host);
  }

  /** Sweeps the signal through the columns (a new snapshot). */
  animate() {
    if (!this.app.settings().animateFlow) { this.wave = 1; this.render(); return; }
    const start = performance.now();
    const duration = 900;
    cancelAnimationFrame(this.waveFrame);
    const step = (now) => {
      this.wave = Math.min(1, (now - start) / duration);
      this.render();
      if (this.wave < 1) this.waveFrame = requestAnimationFrame(step);
    };
    this.waveFrame = requestAnimationFrame(step);
  }

  columns(model, snapshot) {
    let order;
    try { order = topoOrder(model); } catch { return []; }
    const max = this.app.settings().maxNeurons;
    return order.map((id) => {
      const node = nodeById(model, id);
      const act = snapshot?.nodes?.[id]?.act ?? null;
      const shape = act?.shape ?? this.app.shapes().get(id)?.shape ?? null;
      const kind = !shape ? 'none' : shape.length === 3 ? 'maps' : shape.length === 2 ? 'sequence' : 'vector';
      const units = shape ? shape.at(-1) : 0;
      const limit = kind === 'maps' ? Math.min(max, 16) : kind === 'sequence' ? Math.min(max, 16) : max;
      const shown = Math.min(units, limit);
      const index = Array.from({ length: shown }, (_, k) => (shown === units ? k : Math.round((k * (units - 1)) / Math.max(1, shown - 1))));
      const width = kind === 'maps' ? 74 : kind === 'sequence' ? 92 : 46;
      return { id, node, act, shape, kind, units, index, width };
    });
  }

  render() {
    const model = this.app.model();
    const snapshot = this.app.snapshot();
    const t = theme();
    const settings = this.app.settings();
    const cols = this.columns(model, snapshot);
    this.empty.hidden = Boolean(cols.length);
    if (!cols.length) {
      this.empty.textContent = this.app.t('neuron.empty');
      this.canvas.style.display = 'none';
      return;
    }
    this.canvas.style.display = '';
    const hostW = this.host.clientWidth;
    const hostH = Math.max(160, this.host.clientHeight - 4);
    const minGap = this.compact ? 38 : 64;
    const right = this.compact ? 50 : 70;
    const need = cols.reduce((sum, c) => sum + c.width, 0) + minGap * (cols.length - 1) + 20 + right;
    const width = Math.max(hostW, need);
    const ratio = Math.min(3, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(hostH * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${hostH}px`;
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, hostH);
    const gap = cols.length > 1 ? (width - 20 - right - cols.reduce((sum, c) => sum + c.width, 0)) / (cols.length - 1) : 0;
    const top = this.compact ? 30 : 44;
    const bottom = hostH - 18;
    let x = 20;
    for (const col of cols) { col.x = x; x += col.width + gap; }
    const byId = new Map(cols.map((c) => [c.id, c]));
    this.hits = [];
    const selected = this.app.selectedUnit?.();
    // unit positions
    for (const col of cols) {
      const n = Math.max(1, col.index.length);
      const avail = bottom - top;
      if (col.kind === 'vector') {
        col.r = Math.max(3, Math.min(13, avail / n / 2.6));
        col.ys = col.index.map((_, k) => top + (avail * (k + 0.5)) / n);
      } else {
        col.tile = Math.max(8, Math.min(col.width - 8, avail / n - 6));
        col.ys = col.index.map((_, k) => top + (avail * (k + 0.5)) / n);
      }
    }
    // connections: every layer pair, as lines between the units they connect (coloured by weight when there is one)
    const waveCol = this.wave * (cols.length - 1 + 0.999);
    if (settings.showLinks !== false) {
      for (const [ci, col] of cols.entries()) {
        const sources = incoming(model, col.id).map((edge) => byId.get(edge.from)).filter(Boolean);
        let offset = 0;
        for (const src of sources) {
          const si = cols.indexOf(src);
          const links = this.links(src, col, snapshot, offset);
          offset += src.units;
          this.drawLinks(ctx, src, col, links, { lit: si <= waveCol, far: ci - si > 1, selected, top, dark: t.dark });
        }
      }
    }
    // units
    cols.forEach((col, ci) => {
      const lit = ci <= waveCol;
      const front = this.wave < 1 && Math.abs(ci - waveCol) < 0.6;
      ctx.globalAlpha = lit ? 1 : 0.28;
      ctx.fillStyle = t.text;
      ctx.font = `600 ${this.compact ? 10 : 11}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(col.node.name.slice(0, 14), col.x + col.width / 2, top - (this.compact ? 14 : 22));
      if (!this.compact) {
        ctx.fillStyle = t.muted;
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(col.shape ? shapeText(col.shape) : '', col.x + col.width / 2, top - 9);
      }
      const act = col.act;
      const r = act?.data ? range(act.data) : { min: 0, max: 1 };
      const map = col.kind === 'vector' ? settings.colorMap : (settings.colorMap === 'diverging' ? (r.min < 0 ? 'diverging' : 'viridis') : settings.colorMap);
      col.index.forEach((unit, k) => {
        const cy = col.ys[k];
        const isSel = selected && selected.nodeId === col.id && selected.unit === unit;
        if (col.kind === 'vector') {
          const cx = col.x + col.width / 2;
          const value = act?.data ? act.data[unit] : null;
          ctx.beginPath();
          ctx.arc(cx, cy, col.r, 0, Math.PI * 2);
          ctx.fillStyle = value == null ? t.surface : rgb(colorOf(value, r.min, r.max, map, t.dark));
          ctx.fill();
          ctx.lineWidth = isSel ? 3 : front ? 2 : 1;
          ctx.strokeStyle = isSel ? t.accent : front ? '#f5a524' : t.border;
          ctx.stroke();
          this.hits.push({ kind: 'circle', x: cx, y: cy, r: col.r + 2, nodeId: col.id, unit, value, col });
          const label = this.unitLabel(col, unit);
          if (label && col.r >= 5 && !this.compact) {
            ctx.fillStyle = t.muted; ctx.font = '10px system-ui, sans-serif';
            const right = ci === cols.length - 1;
            ctx.textAlign = right ? 'left' : 'right';
            ctx.fillText(label, right ? cx + col.r + 5 : cx - col.r - 5, cy + 3);
            if (right && value != null) { ctx.fillStyle = t.text; ctx.fillText(fmt(value, 2), cx + col.r + 5, cy + 14); }
          }
        } else if (col.kind === 'maps') {
          const size = col.tile;
          const tx = col.x + (col.width - size) / 2;
          const ty = cy - size / 2;
          if (act?.data) {
            const [h, w, c] = act.shape;
            const values = new Float32Array(h * w);
            for (let i = 0; i < h * w; i++) values[i] = act.data[i * c + unit];
            drawHeatmap(ctx, values, h, w, tx, ty, size, size, { min: r.min, max: r.max, map, dark: t.dark });
            if (isSel && selected.position?.row != null) {
              ctx.strokeStyle = '#f5a524'; ctx.lineWidth = 2;
              ctx.strokeRect(tx + (selected.position.col / w) * size, ty + (selected.position.row / h) * size, size / w, size / h);
            }
          } else { ctx.fillStyle = t.surface; ctx.fillRect(tx, ty, size, size); }
          ctx.lineWidth = isSel ? 3 : 1;
          ctx.strokeStyle = isSel ? t.accent : front ? '#f5a524' : t.border;
          ctx.strokeRect(tx, ty, size, size);
          this.hits.push({ kind: 'tile', x: tx, y: ty, w: size, h: size, nodeId: col.id, unit, col });
        } else if (col.kind === 'sequence') {
          const h = Math.max(4, Math.min(col.tile, 18));
          const tx = col.x;
          const ty = cy - h / 2;
          if (act?.data) {
            const [steps, c] = act.shape;
            const values = new Float32Array(steps);
            for (let s = 0; s < steps; s++) values[s] = act.data[s * c + unit];
            drawHeatmap(ctx, values, 1, steps, tx, ty, col.width, h, { min: r.min, max: r.max, map, dark: t.dark });
            if (isSel && selected.position?.t != null) {
              ctx.strokeStyle = '#f5a524'; ctx.lineWidth = 2;
              ctx.strokeRect(tx + (selected.position.t / steps) * col.width, ty, col.width / steps, h);
            }
          }
          ctx.lineWidth = isSel ? 2.5 : 1;
          ctx.strokeStyle = isSel ? t.accent : t.border;
          ctx.strokeRect(tx, ty, col.width, h);
          this.hits.push({ kind: 'strip', x: tx, y: ty, w: col.width, h, nodeId: col.id, unit, col });
        }
      });
      if (col.units > col.index.length) {
        ctx.fillStyle = t.muted; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(this.app.t('neuron.more', { n: col.units - col.index.length }), col.x + col.width / 2, bottom + 12);
      }
      ctx.globalAlpha = 1;
    });
    if (this.wave < 1) {
      // The signal front.
      const fx = 20 + this.wave * (width - 40);
      const gradient = ctx.createLinearGradient(fx - 40, 0, fx + 10, 0);
      gradient.addColorStop(0, 'rgba(245,165,36,0)');
      gradient.addColorStop(1, 'rgba(245,165,36,0.25)');
      ctx.fillStyle = gradient;
      ctx.fillRect(fx - 40, top - 4, 50, bottom - top + 8);
    }
    if (!snapshot && !this.compact) {
      ctx.fillStyle = t.muted; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(this.app.t('neuron.noSnapshot'), width / 2, hostH - 4);
    }
  }

  /** Where a link leaves (side 'out') or enters (side 'in') a drawn unit. */
  anchor(col, k, side) {
    const y = col.ys[k];
    if (col.kind === 'vector') return [col.x + col.width / 2 + (side === 'out' ? col.r : -col.r), y];
    if (col.kind === 'maps') return [col.x + (col.width + (side === 'out' ? col.tile : -col.tile)) / 2, y];
    return [side === 'out' ? col.x + col.width : col.x, y];
  }

  /**
   * The links between the shown units of a source and a target column: [[sourceK, targetK, weight|null]].
   * Dense, convolution, recurrent and embedding links carry weights; channel-wise layers link unit to unit;
   * Flatten links each value to the channel it comes from; Concatenate places each input after the ones before.
   */
  links(src, col, snapshot, offset) {
    const out = [];
    const entry = snapshot?.nodes?.[col.id];
    const w = entry?.weights ?? {};
    const type = col.node.type;
    const srcPos = new Map(src.index.map((unit, k) => [unit, k]));
    const all = (weight = () => null) => { src.index.forEach((i, a) => col.index.forEach((j, b) => out.push([a, b, weight(i, j)]))); };
    const oneToOne = (map = (j) => j, weight = () => null) => {
      col.index.forEach((j, b) => { const a = srcPos.get(map(j)); if (a != null) out.push([a, b, weight(j)]); });
    };
    switch (type) {
      case 'dense': {
        const kernel = w.kernel;
        if (kernel?.data && kernel.shape[0] === src.units) all((i, j) => kernel.data[i * kernel.shape[1] + j]);
        else all();
        break;
      }
      case 'conv2d':
      case 'conv1d': {
        const kernel = w.kernel;
        if (kernel?.data) {
          const cin = kernel.shape.at(-2); const cout = kernel.shape.at(-1);
          const spatial = kernel.data.length / (cin * cout);
          all((c, f) => { let sum = 0; for (let p = 0; p < spatial; p++) sum += kernel.data[(p * cin + c) * cout + f]; return sum; });
        } else all();
        break;
      }
      case 'simpleRnn':
      case 'lstm':
      case 'gru': {
        const kernel = w.kernel;
        const units = col.node.params.units;
        // The candidate (cell input) weights: what each input feature writes into the unit.
        const gate = type === 'simpleRnn' ? 0 : 2;
        if (kernel?.data) all((f, u) => kernel.data[f * kernel.shape[1] + gate * units + u]);
        else all();
        break;
      }
      case 'depthwiseConv2d': {
        // Output channel j reads input channel ⌊j / m⌋ only; the line carries that kernel's sum.
        const kernel = w.kernel;
        const m = col.node.params.depthMultiplier;
        oneToOne((j) => Math.floor(j / m), (j) => {
          if (!kernel?.data) return null;
          const [kh, kw, cin] = kernel.shape;
          const c = Math.floor(j / m);
          let sum = 0;
          for (let p = 0; p < kh * kw; p++) sum += kernel.data[(p * cin + c) * m + (j % m)];
          return sum;
        });
        break;
      }
      case 'selfAttention': {
        // Feature → feature through the values and the output projection (Wv·Wo); the token-to-token
        // weights are drawn in the inspector when a unit is picked.
        const v = w.value; const o = w.output;
        if (v?.data && o?.data && v.shape[0] === src.units) {
          const d = v.shape[1];
          const product = (i, j) => { let sum = 0; for (let k = 0; k < d; k++) sum += v.data[i * d + k] * o.data[k * d + j]; return sum; };
          all(product);
        } else all();
        break;
      }
      case 'tokenPositionEmbedding':
      case 'embedding': {
        const table = w.embeddings;
        const tokens = snapshot?.nodes?.[src.id]?.act?.data ?? (src.node.type === 'input' ? snapshot?.input?.data : null);
        if (table?.data && tokens) all((t, d) => table.data[Math.round(tokens[t]) * table.shape[1] + d]);
        else all();
        break;
      }
      case 'flatten':
        oneToOne((j) => j % src.units);
        break;
      case 'freqAvgPool': case 'lastStep':
      case 'globalAvgPool2d':
      case 'globalAvgPool1d':
      case 'maxPool2d': case 'avgPool2d': case 'maxPool1d': case 'upSampling2d':
      case 'activation': case 'leakyRelu': case 'dropout': case 'layerNorm':
        oneToOne();
        break;
      case 'batchNorm':
        oneToOne((j) => j, (j) => w.gamma?.data?.[j] ?? null);
        break;
      case 'add':
        // A one-channel input is broadcast to every channel.
        oneToOne((j) => (src.units === 1 ? src.index[0] : j));
        break;
      case 'concatenate':
        oneToOne((j) => j - offset);
        break;
      default:
        all();
    }
    // Keep the drawing readable: at most ~900 lines per layer pair.
    if (out.length > 900) return out.filter((_, i) => i % Math.ceil(out.length / 900) === 0);
    return out;
  }

  drawLinks(ctx, src, col, links, { lit, far, selected, top, dark }) {
    if (!links.length) return;
    const weights = links.map((l) => l[2]).filter((v) => v != null);
    const limit = weights.length ? Math.max(...weights.map(Math.abs)) || 1 : 1;
    const focusIn = selected && selected.nodeId === col.id ? selected.unit : null;
    const focusOut = selected && selected.nodeId === src.id ? selected.unit : null;
    const labels = [];
    for (const [a, b, weight] of links) {
      const [x1, y1] = this.anchor(src, a, 'out');
      const [x2, y2] = this.anchor(col, b, 'in');
      const strength = weight == null ? 0.45 : Math.min(1, Math.abs(weight) / limit);
      const focused = (focusIn != null && col.index[b] === focusIn) || (focusOut != null && src.index[a] === focusOut);
      const dimmed = (focusIn != null || focusOut != null) && !focused;
      ctx.strokeStyle = weight == null ? (dark ? '#8fa8ff' : '#5b6fd6') : weight < 0 ? '#3170d6' : '#de463c';
      ctx.globalAlpha = dimmed ? 0.03 + strength * 0.06 : focused ? 0.35 + strength * 0.65 : (lit ? 0.1 + strength * 0.55 : 0.05);
      ctx.lineWidth = focused ? 1.2 + strength * 3 : 0.5 + strength * 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      if (far) {
        // A skip connection jumps over the layers between: a curve above them.
        const lift = Math.min(y1, y2) - 30 - Math.abs(x2 - x1) * 0.06;
        ctx.bezierCurveTo(x1 + 40, Math.max(top - 26, lift), x2 - 40, Math.max(top - 26, lift), x2, y2);
      } else {
        const mx = (x1 + x2) / 2;
        ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
      }
      ctx.stroke();
      if (focused && focusIn != null && weight != null) labels.push([(x1 + x2) / 2, (y1 + y2) / 2, weight]);
    }
    ctx.globalAlpha = 1;
    // The selected unit's incoming weights, written on their lines when there are few.
    if (labels.length && labels.length <= 16) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [x, y, weight] of labels) {
        const text = fmt(weight, 2);
        const width = ctx.measureText(text).width + 6;
        ctx.fillStyle = dark ? 'rgba(20,24,32,0.85)' : 'rgba(255,255,255,0.9)';
        ctx.fillRect(x - width / 2, y - 7, width, 14);
        ctx.fillStyle = weight < 0 ? '#3170d6' : '#de463c';
        ctx.fillText(text, x, y);
      }
    }
  }

  unitLabel(col, unit) {
    const snapshot = this.app.snapshot();
    if (col.node.type === 'input' && snapshot?.featureNames?.[unit]) return snapshot.featureNames[unit];
    const outputs = this.app.outputId?.();
    if (col.id === outputs && snapshot?.labels) {
      if (col.units === 1 && snapshot.labels.length === 2) return snapshot.labels[1];
      return snapshot.labels[unit] ?? null;
    }
    return null;
  }

  hitAt(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    for (const hit of this.hits) {
      if (hit.kind === 'circle' && Math.hypot(x - hit.x, y - hit.y) <= hit.r) return { hit };
      if (hit.kind !== 'circle' && x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
        const shape = hit.col.act?.shape ?? hit.col.shape;
        if (hit.kind === 'tile' && shape) return { hit, position: { row: Math.min(shape[0] - 1, Math.floor(((y - hit.y) / hit.h) * shape[0])), col: Math.min(shape[1] - 1, Math.floor(((x - hit.x) / hit.w) * shape[1])) } };
        if (hit.kind === 'strip' && shape) return { hit, position: { t: Math.min(shape[0] - 1, Math.floor(((x - hit.x) / hit.w) * shape[0])) } };
        return { hit };
      }
    }
    return null;
  }

  click(event) {
    const found = this.hitAt(event);
    if (!found) { this.app.selectUnit(null); return; }
    this.app.selectUnit({ nodeId: found.hit.nodeId, unit: found.hit.unit, position: found.position ?? {} });
  }

  move(event) {
    const found = this.hitAt(event);
    if (!found) { this.tip.hidden = true; this.canvas.style.cursor = ''; return; }
    this.canvas.style.cursor = 'pointer';
    const { hit, position } = found;
    let value = hit.value;
    const act = hit.col.act;
    if (act?.data && position) {
      const shape = act.shape;
      if (position.row != null) value = act.data[(position.row * shape[1] + position.col) * shape[2] + hit.unit];
      if (position.t != null) value = act.data[position.t * shape[1] + hit.unit];
    }
    const where = position?.row != null ? ` (${position.row}, ${position.col})` : position?.t != null ? ` t=${position.t}` : '';
    this.tip.textContent = `${hit.col.node.name} · ${this.app.t('neuron.unit')} ${hit.unit}${where}: ${fmt(value, 4)}`;
    const rect = this.host.getBoundingClientRect();
    this.tip.style.left = `${event.clientX - rect.left + 12}px`;
    this.tip.style.top = `${event.clientY - rect.top + 12}px`;
    this.tip.hidden = false;
  }

  destroy() {
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.waveFrame);
  }
}

export { CLASS_COLORS };
