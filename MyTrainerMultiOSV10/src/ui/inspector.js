// The right panel:
//   • a selected neuron / channel / cell → what it computes, step by step
//   • a selected layer → its properties (edited without code), shape, parameter
//     count, the PyTorch module it becomes, its weights and gradients
//   • nothing selected → the model summary and its problems
import { incoming, nodeById } from '../domain/graph.js';
import { LAYER_GROUPS, LAYERS, shapeText } from '../domain/layers.js';
import { explainUnit, unitValues } from '../engine/internals.js';
import { icon } from '../icons.js';
import { stepperHtml } from '../stepper.js';
import { barChart, colorOf, drawHeatmap, fmt, histogramChart, lineChart, range, setupCanvas } from './charts.js';
import { escapeHtml } from './dom.js';

const STEP = { units: 1, filters: 1, kernelSize: 1, strides: 1, poolSize: 1, size: 1, inputDim: 1, outputDim: 1 };

export function inspectorHtml(app) {
  const t = app.t;
  const unit = app.selectedUnit();
  if (unit) return neuronHtml(app, unit);
  const ids = app.selectedNodes();
  if (ids.length === 1) return layerHtml(app, ids[0]);
  if (ids.length > 1) return `<div class="panel-section"><h3>${icon('selectAll')}<span>${escapeHtml(t('inspector.multi', { count: ids.length }))}</span></h3>
    <div class="inspector-actions">
      <button class="button small" data-insp="duplicate">${icon('duplicateLayer')}<span>${escapeHtml(t('graph.duplicate'))}</span></button>
      <button class="button small danger" data-insp="delete">${icon('trash')}<span>${escapeHtml(t('graph.delete'))}</span></button>
    </div></div>`;
  return summaryHtml(app);
}

function summaryHtml(app) {
  const t = app.t;
  const info = app.modelInfo();
  const problems = app.problems();
  const rows = [
    [t('inspector.layers'), info.layers],
    [t('inspector.params'), info.params.total.toLocaleString()],
    [t('inspector.trainable'), info.params.trainable.toLocaleString()],
    [t('inspector.input'), info.inputShape ? shapeText(info.inputShape) : '—'],
    [t('inspector.output'), info.outputShape ? shapeText(info.outputShape) : '—'],
    [t('inspector.task'), info.task ? t(`task.${info.task.kind}`) + (info.task.classes ? ` · ${info.task.classes} ${t('inspector.classes')}` : '') : '—'],
    [t('inspector.engine'), app.engineLabel()],
  ];
  return `<div class="panel-section"><h3>${icon('tabModel')}<span>${escapeHtml(t('inspector.model'))}</span></h3>
    <dl class="kv">${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl></div>
    <div class="panel-section"><h3>${icon(problems.some((p) => p.level === 'error') ? 'error' : 'check')}<span>${escapeHtml(t('inspector.problems'))}</span></h3>
    ${problems.length ? `<ul class="problem-list">${problems.map((p) => `<li class="${p.level}" ${p.nodeId ? `data-reveal="${p.nodeId}"` : ''}>${icon(p.level === 'error' ? 'error' : 'warning')}<span>${escapeHtml(app.problemText(p))}</span></li>`).join('')}</ul>` : `<p class="muted small">${escapeHtml(t('inspector.noProblems'))}</p>`}</div>
    <div class="panel-section"><h3>${icon('bulb')}<span>${escapeHtml(t('inspector.howTo'))}</span></h3>
    <ul class="hint-list">${['hint.drag', 'hint.connect', 'hint.quick', 'hint.neurons', 'hint.train'].map((key) => `<li>${escapeHtml(t(key))}</li>`).join('')}</ul></div>`;
}

function paramControl(app, node, param) {
  const t = app.t;
  const value = node.params[param.key];
  const label = t(`param.${param.key}`);
  if (param.kind === 'int' || param.kind === 'number') {
    return stepperHtml({ key: `param:${param.key}`, value, min: param.min, max: param.max, step: param.kind === 'int' ? STEP[param.key] ?? 1 : param.step, label });
  }
  if (param.kind === 'bool') {
    return `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-param="${param.key}" ${value ? 'checked' : ''} aria-label="${escapeHtml(label)}"/><span class="switch" aria-hidden="true"></span></label>`;
  }
  if (param.kind === 'select') {
    return `<select data-param="${param.key}" aria-label="${escapeHtml(label)}">${param.options.map((option) => `<option value="${option}" ${option === value ? 'selected' : ''}>${escapeHtml(t(`opt.${option}`, null, option))}</option>`).join('')}</select>`;
  }
  return `<input type="text" data-param="${param.key}" value="${escapeHtml(value)}" spellcheck="false" aria-label="${escapeHtml(label)}"/>`;
}

function layerHtml(app, id) {
  const t = app.t;
  const node = nodeById(app.model(), id);
  if (!node) return summaryHtml(app);
  const def = LAYERS[node.type];
  const info = app.shapes().get(id);
  const problems = app.problems().filter((p) => p.nodeId === id);
  const entry = app.snapshot()?.nodes?.[id];
  const fromData = node.type === 'input';
  const typeOptions = LAYER_GROUPS.flatMap(([group, types]) => types.filter((type) => (type === 'input') === (node.type === 'input')).map((type) => ({ group, type })));
  const params = def.params.map((param) => {
    const disabled = fromData && param.key === 'shape';
    return `<div class="prop-row"><span class="prop-label" title="${escapeHtml(t(`paramTip.${param.key}`, null, t(`param.${param.key}`)))}">${escapeHtml(t(`param.${param.key}`))}</span>
      <span class="prop-control">${disabled ? `<span class="muted">${escapeHtml(info?.shape ? shapeText(info.shape) : node.params.shape)} · ${escapeHtml(t('inspector.fromData'))}</span>` : paramControl(app, node, param)}</span></div>`;
  }).join('');
  const weights = entry?.weights ? Object.entries(entry.stats ?? {}).map(([key, stats]) => `<div class="weight-hist">
      <div class="weight-head"><b>${escapeHtml(t(`weight.${key}`, null, key))}</b><span class="muted">${escapeHtml(shapeText(entry.weights[key]?.shape))} · μ ${fmt(stats.mean)} · σ ${fmt(stats.std)}</span>
      ${entry.grads?.[key] ? `<span class="grad-chip" title="${escapeHtml(t('inspector.gradTip'))}">∇ ${fmt(entry.grads[key].meanAbs)}</span>` : ''}</div>
      <canvas class="hist-canvas" data-hist="${escapeHtml(key)}"></canvas></div>`).join('') : '';
  const kernelView = entry?.weights?.kernel?.data && (node.type === 'conv2d') ? `<div class="panel-section"><h3>${icon('lyConv2d')}<span>${escapeHtml(t('inspector.filters'))}</span></h3><canvas class="filters-canvas" data-filters="${id}"></canvas></div>` : '';
  const actView = entry?.act?.data ? `<div class="panel-section"><h3>${icon('neuron')}<span>${escapeHtml(t('inspector.activations'))}</span></h3><canvas class="act-canvas" data-act="${id}"></canvas><p class="muted small">${escapeHtml(t('inspector.actHint'))}</p></div>` : '';
  return `<div class="panel-section layer-head">
      <div class="layer-title">${icon(def.icon)}<input class="name-input" data-rename="${id}" value="${escapeHtml(node.name)}" spellcheck="false" aria-label="${escapeHtml(t('inspector.name'))}" title="${escapeHtml(t('inspector.name'))}"/></div>
      <div class="prop-row"><span class="prop-label">${escapeHtml(t('inspector.type'))}</span><span class="prop-control"><select data-retype="${id}" ${node.type === 'input' ? 'disabled' : ''}>${typeOptions.map(({ type }) => `<option value="${type}" ${type === node.type ? 'selected' : ''}>${escapeHtml(t(`layer.${type}`))}</option>`).join('')}</select></span></div>
      <p class="layer-desc">${escapeHtml(t(`layerDesc.${node.type}`))}</p>
    </div>
    <div class="panel-section"><h3>${icon('gear')}<span>${escapeHtml(t('inspector.params'))}</span></h3>${params || `<p class="muted small">${escapeHtml(t('inspector.noParams'))}</p>`}</div>
    <div class="panel-section"><h3>${icon('info')}<span>${escapeHtml(t('inspector.shapes'))}</span></h3>
      <dl class="kv">
        <dt>${escapeHtml(t('inspector.inputShape'))}</dt><dd>${escapeHtml(incoming(app.model(), id).map((edge) => shapeText(app.shapes().get(edge.from)?.shape)).join(' · ') || '—')}</dd>
        <dt>${escapeHtml(t('inspector.outputShape'))}</dt><dd>${escapeHtml(info?.shape ? shapeText(info.shape) : '—')}</dd>
        <dt>${escapeHtml(t('inspector.params'))}</dt><dd>${escapeHtml((info?.params?.total ?? 0).toLocaleString())}${info?.params && info.params.total !== info.params.trainable ? ` (${escapeHtml(t('inspector.trainable'))} ${info.params.trainable.toLocaleString()})` : ''}</dd>
        <dt>PyTorch</dt><dd><code>${escapeHtml(def.torch)}</code></dd>
      </dl>
      ${problems.map((p) => `<div class="problem ${p.level}">${icon(p.level === 'error' ? 'error' : 'warning')}<span>${escapeHtml(app.problemText(p))}</span></div>`).join('')}
    </div>
    ${actView}${kernelView}
    ${weights ? `<div class="panel-section"><h3>${icon('histogram')}<span>${escapeHtml(t('inspector.weights'))}</span></h3>${weights}</div>` : ''}`;
}

function neuronHtml(app, sel) {
  const t = app.t;
  const node = nodeById(app.model(), sel.nodeId);
  const snapshot = app.snapshot();
  const e = node && snapshot ? explainUnit(app.model(), app.explainContext(), sel.nodeId, sel.unit, sel.position) : null;
  const where = sel.position?.row != null ? ` · (${sel.position.row}, ${sel.position.col})` : sel.position?.t != null ? ` · t = ${sel.position.t}` : '';
  const head = `<div class="panel-section neuron-head"><h3>${icon('neuron')}<span>${escapeHtml(node?.name ?? '?')} · ${escapeHtml(t('neuron.unit'))} ${sel.unit}${escapeHtml(where)}</span>
    <button class="icon-button" data-insp="clearUnit" title="${escapeHtml(t('common.close'))}" aria-label="${escapeHtml(t('common.close'))}">${icon('close')}</button></h3>
    <p class="muted small">${escapeHtml(t(`layer.${node?.type}`))} · ${escapeHtml(t('neuron.probeIs', { label: snapshot?.probeLabel ?? t('neuron.probeSample') }))}</p></div>`;
  if (!e) return `${head}<div class="panel-section"><p class="muted">${escapeHtml(t('neuron.noSnapshot'))}</p></div>`;
  const check = e.actual != null && e.a != null ? `<span class="check ${Math.abs(e.actual - e.a) <= 1e-3 * Math.max(1, Math.abs(e.actual)) ? 'ok' : 'off'}" title="${escapeHtml(t('neuron.checkTip'))}">${icon(Math.abs(e.actual - e.a) <= 1e-3 * Math.max(1, Math.abs(e.actual)) ? 'check' : 'warning')} ${escapeHtml(t('neuron.engine'))} ${fmt(e.actual, 5)}</span>` : '';
  const result = `<div class="formula-result"><span>a = <b>${fmt(e.a, 5)}</b></span>${check}</div>`;
  let body = '';
  switch (e.kind) {
    case 'neuron':
    case 'conv': {
      const sum = e.shown.reduce((s, item) => s + item.contribution, 0) + e.rest;
      body = `<div class="panel-section"><h3>${icon('lyDense')}<span>${escapeHtml(t('neuron.weightedSum'))}</span></h3>
        <div class="formula">z = Σ xᵢ·wᵢ + b = ${fmt(sum, 4)} + (${fmt(e.bias, 4)}) = <b>${fmt(e.z, 5)}</b></div>
        <p class="muted small">${escapeHtml(t('neuron.contribHint', { count: e.count, shown: e.shown.length }))}</p>
        <canvas class="links-canvas" data-links="1"></canvas>
        <canvas class="bar-canvas" data-bars="contrib"></canvas>
        ${e.hidden ? `<p class="muted small">${escapeHtml(t('neuron.rest', { n: e.hidden, value: fmt(e.rest, 4) }))}</p>` : ''}
        <table class="contrib-table"><thead><tr><th>${escapeHtml(t('neuron.input'))}</th><th>x</th><th>w</th><th>x·w</th></tr></thead>
        <tbody>${e.shown.slice(0, 10).map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${fmt(item.x, 3)}</td><td>${fmt(item.w, 3)}</td><td class="${item.contribution < 0 ? 'neg' : 'pos'}">${fmt(item.contribution, 3)}</td></tr>`).join('')}</tbody></table>
      </div>
      ${e.kind === 'conv' ? `<div class="panel-section"><h3>${icon('lyConv2d')}<span>${escapeHtml(t('neuron.kernel', { k: e.kernelSize }))}</span></h3><canvas class="kernel-canvas" data-kernel="1"></canvas></div>` : ''}
      <div class="panel-section"><h3>${icon('lyActivation')}<span>${escapeHtml(t('neuron.activation'))}: ${escapeHtml(t(`opt.${e.activation}`, null, e.activation))}</span></h3>
        <div class="formula">${escapeHtml(e.formula ?? '')}</div>
        <canvas class="act-fn-canvas" data-actfn="1"></canvas>
        ${result}</div>`;
      break;
    }
    case 'elementwise':
      body = `<div class="panel-section"><div class="formula">z = ${fmt(e.x, 5)}</div><div class="formula">${escapeHtml(e.formula ?? '')}</div>${result}</div>`;
      break;
    case 'dropout':
      body = `<div class="panel-section"><p>${escapeHtml(t('neuron.dropoutText', { rate: Math.round(e.rate * 100) }))}</p><div class="formula">a = x = ${fmt(e.x, 5)}</div>${result}</div>`;
      break;
    case 'batchNorm':
      body = `<div class="panel-section"><div class="formula">x̂ = (x − μ) / √(σ² + ε) = (${fmt(e.x, 4)} − ${fmt(e.mean, 4)}) / √${fmt(e.variance, 4)} = ${fmt(e.normalized, 4)}</div>
        <div class="formula">a = γ·x̂ + β = ${fmt(e.gamma, 4)} × ${fmt(e.normalized, 4)} + ${fmt(e.beta, 4)}</div>${result}</div>`;
      break;
    case 'pool':
      body = `<div class="panel-section"><div class="formula">a = ${e.mode}(${e.values.map((v) => fmt(v.value, 3)).join(', ')})</div>${result}</div>`;
      break;
    case 'embedding':
      body = `<div class="panel-section"><p>${escapeHtml(t('neuron.embeddingText', { t: e.t, token: e.token, word: e.word ?? '?' }))}</p>${e.positionPart != null ? `<div class="formula">a = E[${e.token}] + P[${e.t}] = ${fmt(e.tokenPart, 4)} + ${fmt(e.positionPart, 4)}</div>` : ''}<canvas class="bar-canvas" data-bars="vector"></canvas>${result}</div>`;
      break;
    case 'attention':
      body = `<div class="panel-section"><h3>${icon('lyAttention')}<span>${escapeHtml(t('neuron.attention', { t: e.t }))}</span></h3>
        <p class="muted small">${escapeHtml(t('neuron.attentionHint'))}</p>
        <canvas class="attention-canvas" data-attention="1"></canvas>
        <div class="formula">softmax(q·kᵀ/√d) · V → Wo: z = Σ mixᵢ·woᵢ + b = <b>${fmt(e.z, 5)}</b></div>
        <canvas class="bar-canvas" data-bars="contrib"></canvas>${result}</div>`;
      break;
    case 'recurrent':
      body = `<div class="panel-section"><h3>${icon('lyLstm')}<span>${escapeHtml(t('neuron.overTime'))}</span></h3>
        <p class="muted small">${escapeHtml(t(`neuron.gates.${e.type}`))}</p>
        <canvas class="gates-canvas" data-gates="1"></canvas>${result}</div>`;
      break;
    case 'add':
      body = `<div class="panel-section"><div class="formula">a = ${e.parts.map((part) => `${escapeHtml(part.name)} (${fmt(part.value, 3)})`).join(' + ')}</div>${result}</div>`;
      break;
    case 'concat':
      body = `<div class="panel-section"><p>${escapeHtml(t('neuron.concatText', { from: e.from, unit: e.fromUnit }))}</p>${result}</div>`;
      break;
    default:
      body = `<div class="panel-section">${result}</div>`;
  }
  return head + body;
}

/** Draws the canvases the inspector HTML contains. */
export function drawInspector(app, host) {
  const unit = app.selectedUnit();
  const snapshot = app.snapshot();
  const t = app.t;
  if (unit && snapshot) {
    const e = explainUnit(app.model(), app.explainContext(), unit.nodeId, unit.unit, unit.position);
    if (!e) return;
    const links = host.querySelector('[data-links]');
    if (links && e.shown) drawNeuronLinks(links, e, app);
    const contrib = host.querySelector('[data-bars="contrib"]');
    if (contrib) barChart(contrib, e.shown.map((item) => ({ label: item.label, value: item.contribution })), { labelWidth: 78 });
    const vector = host.querySelector('[data-bars="vector"]');
    if (vector) barChart(vector, e.vector.map((value, d) => ({ label: `d${d}`, value, highlight: d === unit.unit })));
    const kernel = host.querySelector('[data-kernel]');
    if (kernel && e.kernelSlices) {
      const shown = Math.min(e.kernelSlices.length, 8);
      const size = 54;
      kernel.style.height = `${size + 18}px`;
      const ratio = Math.min(3, devicePixelRatio || 1);
      kernel.width = kernel.clientWidth * ratio; kernel.height = (size + 18) * ratio;
      const ctx = kernel.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const all = range(e.kernelSlices.flat());
      // Square cells: a 3×1 kernel is drawn three cells high and one wide.
      const kh = e.kernelH ?? e.kernelSize;
      const kw = e.kernelW ?? e.kernelSize;
      const cell = size / Math.max(kh, kw);
      for (let c = 0; c < shown; c++) {
        drawHeatmap(ctx, e.kernelSlices[c], kh, kw, 4 + c * (size + 8), 2, cell * kw, cell * kh, { min: all.min, max: all.max, map: 'diverging', dark: app.dark() });
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
        ctx.font = '10px system-ui'; ctx.fillText(`c${e.depthwiseChannel ?? c}`, 4 + c * (size + 8), size + 14);
      }
    }
    const attention = host.querySelector('[data-attention]');
    if (attention && e.weights) drawAttention(attention, e, app);
    const actFn = host.querySelector('[data-actfn]');
    if (actFn && e.activation) drawActivationFunction(actFn, e.activation, e.z, e.a);
    const gates = host.querySelector('[data-gates]');
    if (gates && e.steps) {
      const names = e.type === 'lstm' ? ['i', 'f', 'g', 'o'] : e.type === 'gru' ? ['z', 'r', 'n'] : [];
      const colors = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759'];
      const series = names.map((name, k) => ({ name: t(`gate.${name}`), color: colors[k], values: e.steps.map((s, i) => [i, s.gates[name]]) }));
      series.push({ name: 'h', color: '#b07aa1', width: 2.6, values: e.steps.map((s, i) => [i, s.h]) });
      if (e.type === 'lstm') series.push({ name: 'c', color: '#9c755f', dash: [4, 3], values: e.steps.map((s, i) => [i, s.c]) });
      gates.style.height = '190px';
      lineChart(gates, series, { xLabel: 't' });
    }
    return;
  }
  const ids = app.selectedNodes();
  if (ids.length !== 1) return;
  const entry = snapshot?.nodes?.[ids[0]];
  for (const canvas of host.querySelectorAll('[data-hist]')) histogramChart(canvas, entry?.stats?.[canvas.dataset.hist]);
  const act = host.querySelector('[data-act]');
  if (act && entry?.act?.data) drawActivations(act, entry.act, app);
  const filters = host.querySelector('[data-filters]');
  if (filters && entry?.weights?.kernel?.data) drawFilters(filters, entry.weights.kernel, app);
}

function drawActivationFunction(canvas, activation, z, a) {
  if (activation === 'softmax') {
    canvas.style.display = 'none';
    return;
  }
  const xs = Array.from({ length: 81 }, (_, i) => -4 + i * 0.1);
  const fnName = activation;
  const f = {
    linear: (x) => x, relu: (x) => Math.max(0, x), relu6: (x) => Math.min(6, Math.max(0, x)), elu: (x) => (x >= 0 ? x : Math.exp(x) - 1), selu: (x) => 1.0507 * (x >= 0 ? x : 1.6733 * (Math.exp(x) - 1)),
    sigmoid: (x) => 1 / (1 + Math.exp(-x)), hardSigmoid: (x) => Math.min(1, Math.max(0, 0.2 * x + 0.5)), tanh: Math.tanh, softplus: (x) => Math.log1p(Math.exp(x)), softsign: (x) => x / (1 + Math.abs(x)),
    swish: (x) => x / (1 + Math.exp(-x)), mish: (x) => x * Math.tanh(Math.log1p(Math.exp(x))), gelu: (x) => 0.5 * x * (1 + Math.tanh(0.79788456 * (x + 0.044715 * x ** 3))),
  }[fnName] ?? ((x) => x);
  canvas.style.height = '120px';
  const zc = Math.max(-4, Math.min(4, z ?? 0));
  lineChart(canvas, [
    { name: fnName, color: '#4e79a7', values: xs.map((x) => [x, f(x)]), dots: false },
    { name: 'z', color: '#e15759', values: [[zc, f(zc)]], width: 6 },
  ], { legend: false });
  void a;
}

function drawActivations(canvas, act, app) {
  const shape = act.shape;
  const ratio = Math.min(3, devicePixelRatio || 1);
  const width = canvas.clientWidth || 300;
  if (shape.length === 3) {
    const [h, w, c] = shape;
    const shown = Math.min(c, 16);
    const per = Math.min(6, shown);
    const size = Math.floor((width - (per - 1) * 4) / per);
    const rows = Math.ceil(shown / per);
    const height = rows * (size + 4);
    canvas.style.height = `${height}px`;
    canvas.width = width * ratio; canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const all = range(act.data);
    for (let k = 0; k < shown; k++) {
      const values = unitValues(act, k);
      drawHeatmap(ctx, values, h, w, (k % per) * (size + 4), Math.floor(k / per) * (size + 4), size, size, { min: all.min, max: all.max, map: all.min < 0 ? 'diverging' : 'viridis', dark: app.dark() });
    }
  } else if (shape.length === 2) {
    canvas.style.height = '110px';
    canvas.width = width * ratio; canvas.height = 110 * ratio;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const [steps, c] = shape;
    const values = new Float32Array(steps * c);
    for (let u = 0; u < c; u++) for (let s = 0; s < steps; s++) values[u * steps + s] = act.data[s * c + u];
    drawHeatmap(ctx, values, c, steps, 0, 0, width, 110, { map: app.settings().colorMap, dark: app.dark() });
  } else {
    barChart(canvas, Array.from(act.data.slice(0, 32)).map((value, i) => ({ label: `${i}`, value })), { labelWidth: 26 });
  }
}

function drawFilters(canvas, kernel, app) {
  const [k, , cin, filters] = kernel.shape;
  const shown = Math.min(filters, 32);
  const per = 8;
  const width = canvas.clientWidth || 300;
  const size = Math.floor((width - (per - 1) * 4) / per);
  const rows = Math.ceil(shown / per);
  const height = rows * (size + 4);
  const ratio = Math.min(3, devicePixelRatio || 1);
  canvas.style.height = `${height}px`;
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const all = range(kernel.data);
  for (let f = 0; f < shown; f++) {
    // The first input channel's k×k weights of each filter (sum over channels when there are several).
    const values = new Float32Array(k * k);
    for (let i = 0; i < k * k; i++) for (let c = 0; c < cin; c++) values[i] += kernel.data[(i * cin + c) * filters + f] / cin;
    drawHeatmap(ctx, values, k, k, (f % per) * (size + 4), Math.floor(f / per) * (size + 4), size, size, { min: all.min / Math.max(1, cin / 2), max: all.max / Math.max(1, cin / 2), map: 'diverging', dark: app.dark() });
  }
}

/**
 * The selected neuron and its strongest inputs as a small network: input circles (colour = value x)
 * joined to the neuron (colour = output a) by lines coloured and sized by the weight w; x and w are written.
 */
function drawNeuronLinks(canvas, e, app) {
  const items = e.shown.slice(0, 12);
  const rowH = 24;
  const height = Math.max(120, items.length * rowH + 20);
  canvas.style.height = `${height}px`;
  const ratio = Math.min(3, devicePixelRatio || 1);
  const width = canvas.clientWidth || 300;
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const style = getComputedStyle(document.documentElement);
  const text = style.getPropertyValue('--text').trim();
  const muted = style.getPropertyValue('--muted').trim();
  const dark = app.dark();
  const xs = range(items.map((item) => item.x));
  const ws = Math.max(...items.map((item) => Math.abs(item.w)), 1e-9);
  const inX = 96; const outX = width - 46; const outY = height / 2;
  items.forEach((item, k) => {
    const y = 10 + rowH / 2 + k * rowH;
    const strength = Math.min(1, Math.abs(item.w) / ws);
    ctx.strokeStyle = item.w < 0 ? '#3170d6' : '#de463c';
    ctx.globalAlpha = 0.25 + strength * 0.75;
    ctx.lineWidth = 0.8 + strength * 4;
    ctx.beginPath(); ctx.moveTo(inX + 8, y); ctx.bezierCurveTo((inX + outX) / 2, y, (inX + outX) / 2, outY, outX - 16, outY); ctx.stroke();
    ctx.globalAlpha = 1;
    const c = colorOf(item.x, Math.min(0, xs.min), Math.max(0, xs.max), 'diverging', dark);
    ctx.fillStyle = `rgb(${c.join(',')})`;
    ctx.beginPath(); ctx.arc(inX, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = text; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(`${String(item.label).slice(0, 10)}  ${fmt(item.x, 2)}`, inX - 11, y);
    // w on the line, a third of the way along.
    const lx = inX + (outX - inX) * 0.3;
    const ly = y + (outY - y) * 0.12;
    const label = `w ${fmt(item.w, 2)}`;
    ctx.font = '9px system-ui, sans-serif';
    const lw = ctx.measureText(label).width + 4;
    ctx.fillStyle = dark ? 'rgba(20,24,32,0.85)' : 'rgba(255,255,255,0.85)';
    ctx.fillRect(lx - lw / 2, ly - 6, lw, 12);
    ctx.fillStyle = item.w < 0 ? '#3170d6' : '#de463c'; ctx.textAlign = 'center';
    ctx.fillText(label, lx, ly);
  });
  const ca = colorOf(e.a ?? 0, -Math.abs(e.a ?? 1), Math.abs(e.a ?? 1), 'diverging', dark);
  ctx.fillStyle = `rgb(${ca.join(',')})`;
  ctx.beginPath(); ctx.arc(outX, outY, 15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = style.getPropertyValue('--accent').trim(); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = text; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`a ${fmt(e.a, 3)}`, outX, outY + 19);
  ctx.textBaseline = 'bottom'; ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = muted;
  ctx.fillText(`b ${fmt(e.bias, 2)}`, outX, outY - 19);
}

/**
 * Attention as lines: the tokens in a row at the bottom, the chosen token on top; one line per
 * (head, token), as wide and as opaque as its attention weight. Masked (later) tokens are dimmed.
 */
function drawAttention(canvas, e, app) {
  const n = e.tokens.length;
  const width = canvas.clientWidth || 300;
  // Every token fits the panel; the letters shrink with the cells.
  const cellW = Math.min(28, (width - 8) / n);
  const fontSize = Math.max(8, Math.min(12, cellW * 0.8));
  const height = 150;
  const { ctx } = setupCanvas(canvas, null, height);
  const css = getComputedStyle(document.documentElement);
  const text = css.getPropertyValue('--text').trim() || '#222';
  const muted = css.getPropertyValue('--muted').trim() || '#888';
  const accent = css.getPropertyValue('--accent').trim() || '#3a6cf0';
  const total = cellW * n;
  const x0 = Math.max(4, (width - total) / 2);
  const xOf = (i) => x0 + cellW * (i + 0.5);
  const yTop = 22; const yBottom = height - 26;
  const colors = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7'];
  ctx.lineCap = 'round';
  for (let h = 0; h < e.heads; h++) {
    for (let i = 0; i < n; i++) {
      const w = e.weights[h][i];
      if (w < 0.01) continue;
      ctx.strokeStyle = colors[h % colors.length];
      ctx.globalAlpha = Math.min(0.95, 0.15 + w);
      ctx.lineWidth = 0.6 + w * 7;
      const spread = (h - (e.heads - 1) / 2) * 3;
      ctx.beginPath();
      ctx.moveTo(xOf(e.t) + spread, yTop + 8);
      ctx.bezierCurveTo(xOf(e.t) + spread, (yTop + yBottom) / 2, xOf(i), (yTop + yBottom) / 2, xOf(i), yBottom - 10);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 ${fontSize}px system-ui`;
  for (let i = 0; i < n; i++) {
    const masked = e.causal && i > e.t;
    ctx.fillStyle = i === e.t ? accent : masked ? muted : text;
    ctx.globalAlpha = masked ? 0.35 : 1;
    ctx.fillText(e.tokens[i], xOf(i), yBottom);
    ctx.font = `${Math.max(7, fontSize - 3)}px system-ui`; ctx.fillStyle = muted; ctx.fillText(String(i), xOf(i), yBottom + 13); ctx.font = `600 ${fontSize}px system-ui`;
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent; ctx.font = '700 13px system-ui';
  ctx.fillText(e.tokens[e.t], xOf(e.t), yTop);
  // head legend
  ctx.font = '10px system-ui'; ctx.textAlign = 'left';
  for (let h = 0; h < e.heads; h++) { ctx.fillStyle = colors[h % colors.length]; ctx.fillRect(4 + h * 52, 4, 10, 4); ctx.fillStyle = muted; ctx.fillText(`${app.t('neuron.head')} ${h + 1}`, 17 + h * 52, 7); }
}
