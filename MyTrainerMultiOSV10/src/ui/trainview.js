// Train tab: the engine and training settings, the controls, and live charts —
// loss and accuracy (train / validation), learning rate, the decision boundary
// (2-D data) or the fitted curve (1-D data) or reconstructions, the gradient flow
// through the layers (mean |∇|, to spot vanishing / exploding gradients), the
// weight distribution of every layer, and a compact neuron view of the probe input.
import { LOSSES, OPTIMIZERS, SCHEDULES } from '../domain/project.js';
import { nodeById } from '../domain/graph.js';
import { icon } from '../icons.js';
import { stepperHtml } from '../stepper.js';
import { barChart, CLASS_COLORS, drawPicture, fmt, histogramChart, lineChart, scatterPlot, SERIES, setupCanvas, theme } from './charts.js';
import { escapeHtml } from './dom.js';

/** Advanced training settings: only the ones that apply to the chosen optimizer, schedule and stopping. */
function advancedHtml(app, { row, step, busy }) {
  const t = app.t;
  const train = app.project().train;
  const check = (key) => `<label class="switch-wrap"><input type="checkbox" data-train="${key}" ${train[key] ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span class="switch"></span></label>`;
  const choose = (key, options, label = (o) => o) => `<select data-train="${key}" ${busy ? 'disabled' : ''}>${options.map((o) => `<option value="${o}" ${String(train[key]) === String(o) ? 'selected' : ''}>${escapeHtml(label(o))}</option>`).join('')}</select>`;
  const rows = [];
  const o = train.optimizer;
  if (o === 'momentum') rows.push(row(t('train.momentum'), step('momentum', 0, 0.999, 0.01, t('train.momentum')), t('train.momentumTip')), row(t('train.nesterov'), check('nesterov'), t('train.nesterovTip')));
  if (o === 'adam' || o === 'adamax') rows.push(row('β₁', step('beta1', 0, 0.999, 0.01, 'beta1'), t('train.beta1Tip')), row('β₂', step('beta2', 0.9, 0.9999, 0.0001, 'beta2'), t('train.beta2Tip')));
  if (o === 'rmsprop' || o === 'adadelta') rows.push(row('ρ (rho)', step('rho', 0, 0.999, 0.01, 'rho'), t('train.rhoTip')));
  if (['adam', 'adamax', 'rmsprop', 'adadelta'].includes(o)) rows.push(row('ε (epsilon)', choose('epsilon', [1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3]), t('train.epsilonTip')));
  const s = train.schedule;
  if (s === 'step') rows.push(row(t('train.stepSize'), step('stepSize', 0, 1000, 1, t('train.stepSize')), t('train.stepSizeTip')));
  if (s === 'step' || s === 'exponential') rows.push(row(t('train.decayRate'), step('decayRate', 0, 1, 0.01, t('train.decayRate')), t('train.decayRateTip')));
  if (s !== 'none') rows.push(row(t('train.minLearningRate'), choose('minLearningRate', [0, 1e-6, 1e-5, 1e-4, 1e-3]), t('train.minLearningRateTip')));
  rows.push(row(t('train.warmupEpochs'), step('warmupEpochs', 0, 100, 1, t('train.warmupEpochs')), t('train.warmupTip')));
  if (train.earlyStop) {
    rows.push(row(t('train.monitor'), choose('monitor', ['val_loss', 'loss', 'val_acc', 'acc'], (m) => t(`train.monitor.${m}`)), t('train.monitorTip')));
    rows.push(row(t('train.minDelta'), choose('minDelta', [0, 0.0001, 0.001, 0.005, 0.01, 0.05]), t('train.minDeltaTip')));
    rows.push(row(t('train.restoreBest'), check('restoreBest'), t('train.restoreBestTip')));
  }
  rows.push(row(t('train.shuffle'), check('shuffle'), t('train.shuffleTip')));
  if (app.task()?.kind === 'classification') rows.push(row(t('train.labelSmoothing'), choose('labelSmoothing', [0, 0.05, 0.1, 0.15, 0.2]), t('train.labelSmoothingTip')));
  return `<details class="panel-section advanced-train" ${app.view().trainAdvanced ? 'open' : ''}><summary data-train-advanced>${icon('tune')}<span>${escapeHtml(t('train.advanced'))}</span></summary>
    ${rows.join('')}
    <p class="muted small">${escapeHtml(t('train.advancedHint'))}</p></details>`;
}

export function trainViewHtml(app) {
  const t = app.t;
  const project = app.project();
  const train = project.train;
  const run = app.run();
  const status = run.state;
  const busy = status === 'training' || status === 'paused';
  const engine = project.engine;
  const select = (key, options, labelPrefix) => `<select data-train="${key}" ${busy ? 'disabled' : ''}>${options.map((option) => `<option value="${option}" ${train[key] === option ? 'selected' : ''}>${escapeHtml(t(`${labelPrefix}.${option}`))}</option>`).join('')}</select>`;
  const row = (label, control, tip = '') => `<div class="prop-row" ${tip ? `title="${escapeHtml(tip)}"` : ''}><span class="prop-label">${escapeHtml(label)}</span><span class="prop-control">${control}</span></div>`;
  const step = (key, min, max, s, label) => stepperHtml({ key: `train:${key}`, value: train[key], min, max, step: s, label, disabled: busy });
  const progress = run.epochs ? Math.min(100, (100 * (run.epoch - run.from)) / run.epochs) : 0;
  const last = run.history.at(-1);
  const pyInfo = app.pythonInfo();
  const variants = project.variants;
  const variantHtml = variants ? `<section class="panel-section"><h3>${icon('tabModel')}<span>${escapeHtml(t('train.variant'))}</span></h3>
        <span class="segmented variant-switch" role="radiogroup">${variants.list.map((v) => `<button class="segment ${v.id === variants.current ? 'active' : ''}" data-variant="${escapeHtml(v.id)}" ${busy ? 'disabled' : ''}>${escapeHtml(v.name)}</button>`).join('')}</span>
        <p class="muted small">${escapeHtml(variants.list.find((v) => v.id === variants.current)?.description ?? '')}</p>
      </section>` : '';
  return `<div class="train-view">
    <aside class="train-side">
      ${variantHtml}
      <section class="panel-section"><h3>${icon('gpu')}<span>${escapeHtml(t('train.engine'))}</span></h3>
        <span class="segmented engine-switch" role="radiogroup">
          <button class="segment ${engine === 'tfjs' ? 'active' : ''}" data-engine="tfjs" ${busy ? 'disabled' : ''}>${icon('engineTf')}<span>TensorFlow.js</span></button>
          <button class="segment ${engine === 'torch' ? 'active' : ''}" data-engine="torch" ${busy || !app.desktop ? 'disabled' : ''} title="${escapeHtml(app.desktop ? t('train.torchTip') : t('web.desktopOnly'))}">${icon('engineTorch')}<span>PyTorch</span></button>
        </span>
        <p class="muted small engine-line">${escapeHtml(engine === 'tfjs' ? t('train.tfjsInfo', { backend: app.tfBackend() ?? '…' }) : pyInfo ? t('train.torchInfo', { torch: pyInfo.torch ?? '–', python: pyInfo.version, device: pyInfo.cuda ? `CUDA (${pyInfo.gpu ?? 'GPU'})` : pyInfo.mps ? 'Apple MPS' : 'CPU' }) : t('train.torchMissing'))}</p>
        ${engine === 'torch' ? `<div class="data-import"><button class="button small" data-train-action="pyenv">${icon('python')}<span>${escapeHtml(t('train.pyenv'))}</span></button>
          <button class="button small" data-train-action="openCode">${icon('tabCode')}<span>${escapeHtml(t('train.showCode'))}</span></button></div>
          ${project.code.custom ? `<p class="muted small">${icon('edit', 'icon tiny')} ${escapeHtml(t('train.customCode'))}</p>` : ''}` : ''}
      </section>
      <section class="panel-section"><h3>${icon('gear')}<span>${escapeHtml(t('train.settings'))}</span></h3>
        ${row(t('train.optimizer'), select('optimizer', OPTIMIZERS, 'optimizer'), t('train.optimizerTip'))}
        ${row(t('train.learningRate'), `<input type="number" class="lr-input" data-train="learningRate" value="${train.learningRate}" min="0.000001" max="10" step="any" list="mt-lr-presets" ${busy ? 'disabled' : ''} aria-label="${escapeHtml(t('train.learningRate'))}"/><datalist id="mt-lr-presets">${[0.3, 0.1, 0.05, 0.03, 0.01, 0.005, 0.003, 0.001, 0.0005, 0.0001].map((v) => `<option value="${v}"></option>`).join('')}</datalist>`, t('train.learningRateTip'))}
        ${row(t('train.epochs'), step('epochs', 1, 2000, 1, t('train.epochs')))}
        ${row(t('train.batchSize'), step('batchSize', 1, 1024, 1, t('train.batchSize')), t('train.batchTip'))}
        ${row(t('train.loss'), select('loss', LOSSES, 'loss'), t('train.lossTip'))}
        ${row(t('train.schedule'), select('schedule', SCHEDULES, 'schedule'))}
        ${row(t('train.weightDecay'), `<select data-train="weightDecay" ${busy ? 'disabled' : ''}>${[0, 0.00001, 0.0001, 0.001, 0.01].map((v) => `<option value="${v}" ${train.weightDecay === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`, t('train.weightDecayTip'))}
        ${row(t('train.earlyStop'), `<label class="switch-wrap"><input type="checkbox" data-train="earlyStop" ${train.earlyStop ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span class="switch"></span></label>`)}
        ${train.earlyStop ? row(t('train.patience'), step('patience', 1, 200, 1, t('train.patience'))) : ''}
        ${row(t('train.snapshotEvery'), step('snapshotEvery', 1, 100, 1, t('train.snapshotEvery')), t('train.snapshotTip'))}
      </section>
      ${advancedHtml(app, { row, step, busy })}
      <section class="panel-section train-controls">
        <div class="control-row">
          <button class="button primary" data-train-action="train" ${busy ? 'disabled' : ''}>${icon('train')}<span>${escapeHtml(run.epoch && engine === 'tfjs' && run.canContinue ? t('train.continue') : t('train.start'))}</span></button>
          ${status === 'paused' ? `<button class="button" data-train-action="resume">${icon('play')}<span>${escapeHtml(t('train.resume'))}</span></button>` : `<button class="button" data-train-action="pause" ${status !== 'training' ? 'disabled' : ''}>${icon('trainPause')}<span>${escapeHtml(t('train.pause'))}</span></button>`}
        </div>
        <div class="control-row">
          <button class="button" data-train-action="step" ${!busy ? 'disabled' : ''} title="${escapeHtml(t('train.stepTip'))}">${icon('trainStep')}<span>${escapeHtml(t('train.step'))}</span></button>
          <button class="button danger" data-train-action="stop" ${!busy && status !== 'serving' ? 'disabled' : ''}>${icon('trainStop')}<span>${escapeHtml(status === 'serving' ? t('train.endRun') : t('train.stop'))}</span></button>
          <button class="button" data-train-action="reset" ${busy ? 'disabled' : ''} title="${escapeHtml(t('train.resetTip'))}">${icon('resetWeights')}<span>${escapeHtml(t('train.reset'))}</span></button>
        </div>
        <div class="progress-line"><i style="width:${progress}%"></i></div>
        <p class="muted small status-line">${escapeHtml(statusText(app))}</p>
        ${last ? `<dl class="kv compact"><dt>${escapeHtml(t('train.lossShort'))}</dt><dd>${fmt(last.loss, 4)}${last.valLoss != null ? ` / ${fmt(last.valLoss, 4)}` : ''}</dd>${last.acc != null ? `<dt>${escapeHtml(t('train.accShort'))}</dt><dd>${fmt(last.acc * 100, 1)}%${last.valAcc != null ? ` / ${fmt(last.valAcc * 100, 1)}%` : ''}</dd>` : ''}</dl>` : ''}
      </section>
    </aside>
    <div class="train-main">
      <div class="chart-grid">
        <div class="chart-card"><canvas data-chart="loss"></canvas></div>
        <div class="chart-card"><canvas data-chart="acc"></canvas></div>
        <div class="chart-card"><canvas data-chart="visual"></canvas></div>
        <div class="chart-card"><h4>${icon('lyActivation', 'icon tiny')} ${escapeHtml(t('train.gradFlow'))}</h4><canvas data-chart="grads"></canvas><p class="muted small">${escapeHtml(t('train.gradHint'))}</p></div>
      </div>
      <div class="chart-card hist-row"><h4>${icon('histogram', 'icon tiny')} ${escapeHtml(t('train.weightHists'))}</h4><div class="hist-strip" data-chart="hists"></div></div>
      <div class="chart-card neuron-card"><h4>${icon('nodesView', 'icon tiny')} ${escapeHtml(t('train.neurons'))}</h4><div class="neuron-host" data-neuron="train"></div></div>
    </div>
  </div>`;
}

export function statusText(app) {
  const t = app.t;
  const run = app.run();
  const time = run.history.at(-1)?.time;
  switch (run.state) {
    case 'training': return t('train.statusTraining', { epoch: run.epoch, total: run.from + run.epochs, time: time ? `${(time / 1000).toFixed(1)} s` : '' });
    case 'paused': return t('train.statusPaused', { epoch: run.epoch });
    case 'serving': return t('train.statusServing');
    case 'preparing': return t('train.statusPreparing');
    default: return run.history.length ? t('train.statusDone', { epoch: run.epoch, time: time ? `${(time / 1000).toFixed(1)} s` : '' }) : t('train.statusIdle');
  }
}

/** Draws the charts (called on every epoch / snapshot). */
export function drawTrainView(app, host) {
  const t = app.t;
  const run = app.run();
  const h = run.history;
  const past = app.project().runs?.slice(-3) ?? [];
  const loss = host.querySelector('[data-chart="loss"]');
  if (loss) {
    const series = [
      { name: t('train.trainLoss'), color: SERIES.train, values: h.map((e) => [e.epoch, e.loss]) },
      { name: t('train.valLoss'), color: SERIES.val, values: h.map((e) => [e.epoch, e.valLoss]) },
    ];
    for (const old of past) if (old.history?.length && old !== run.saved) series.unshift({ name: '', color: theme().border, values: old.history.map((e) => [e.epoch, e.loss]), dash: [3, 3], width: 1, dots: false });
    lineChart(loss, series, { title: t('train.lossChart'), xLabel: t('train.epoch'), emptyText: t('train.noRun') });
  }
  const acc = host.querySelector('[data-chart="acc"]');
  if (acc) {
    const classification = app.task()?.kind === 'classification';
    if (classification) {
      lineChart(acc, [
        { name: t('train.trainAcc'), color: SERIES.train, values: h.map((e) => [e.epoch, e.acc == null ? null : e.acc * 100]) },
        { name: t('train.valAcc'), color: SERIES.val, values: h.map((e) => [e.epoch, e.valAcc == null ? null : e.valAcc * 100]) },
      ], { title: t('train.accChart'), xLabel: t('train.epoch'), yMin: 0, yMax: 100, emptyText: t('train.noRun') });
    } else {
      lineChart(acc, [{ name: t('train.lr'), color: SERIES.lr, values: h.map((e) => [e.epoch, e.lr]) }], { title: t('train.lrChart'), xLabel: t('train.epoch'), emptyText: t('train.noRun') });
    }
  }
  drawVisual(app, host.querySelector('[data-chart="visual"]'));
  const grads = host.querySelector('[data-chart="grads"]');
  if (grads) {
    const snapshot = app.snapshot();
    const items = [];
    for (const node of app.orderedNodes()) {
      const g = snapshot?.nodes?.[node.id]?.grads;
      if (!g) continue;
      const value = g.kernel?.meanAbs ?? g.embeddings?.meanAbs ?? Object.values(g)[0]?.meanAbs ?? 0;
      items.push({ label: node.name, value });
    }
    if (items.length) {
      const max = Math.max(...items.map((i) => i.value)) || 1;
      barChart(grads, items.map((item) => ({ ...item, color: item.value < max * 0.01 ? '#e15759' : undefined })), { format: (v) => v.toExponential(1), labelWidth: 80, min: 0 });
    } else {
      const { ctx } = setupCanvas(grads, null, 40);
      grads.style.height = '40px';
      ctx.fillStyle = theme().muted; ctx.font = '12px system-ui'; ctx.fillText(t('train.noSnapshot'), 6, 22);
    }
  }
  const hists = host.querySelector('[data-chart="hists"]');
  if (hists) {
    const snapshot = app.snapshot();
    const cards = [];
    for (const node of app.orderedNodes()) {
      const stats = snapshot?.nodes?.[node.id]?.stats;
      const main = stats?.kernel ?? stats?.embeddings ?? stats?.gamma;
      if (main) cards.push({ node, main });
    }
    hists.innerHTML = cards.length ? cards.map(({ node, main }, i) => `<div class="hist-card" data-reveal="${node.id}" title="${escapeHtml(node.name)}"><b>${escapeHtml(node.name)}</b><span class="muted">σ ${fmt(main.std, 3)}</span><canvas data-hist-index="${i}"></canvas></div>`).join('') : `<p class="muted small">${escapeHtml(t('train.noSnapshot'))}</p>`;
    cards.forEach(({ main }, i) => {
      const canvas = hists.querySelector(`[data-hist-index="${i}"]`);
      canvas.style.height = '58px';
      histogramChart(canvas, main, { color: CLASS_COLORS[i % CLASS_COLORS.length] });
    });
  }
}

/** Decision boundary / fitted curve / reconstruction / probe output, whichever fits the data. */
function drawVisual(app, canvas) {
  if (!canvas) return;
  const t = app.t;
  const prepared = app.prepared();
  const data = app.data();
  const visual = app.visual();
  const snapshot = app.snapshot();
  if (prepared?.kind === 'points2d' && prepared.inputShape[0] === 2) {
    scatterPlot(canvas, prepared.train.x, Array.from(prepared.train.y), { boundary: visual.boundary, classes: data.task.classes, align: 'left' });
    labelCanvas(canvas, t('train.boundary'));
  } else if (prepared?.kind === 'function1d' && prepared.inputShape[0] === 1) {
    scatterPlot(canvas, prepared.train.x, Array.from(prepared.train.y), { task: 'regression', curve: visual.curve });
    labelCanvas(canvas, t('train.curve'));
  } else if (prepared?.task.kind === 'reconstruction' && snapshot?.input?.data) {
    const { ctx, width, height } = setupCanvas(canvas);
    const out = snapshot.nodes[app.outputId()]?.act;
    const shape = prepared.inputShape;
    const size = Math.min(height - 40, (width - 40) / 2);
    drawPicture(ctx, snapshot.input.data, shape, 10, 26, size, size);
    if (out?.data) drawPicture(ctx, out.data, shape, 30 + size, 26, size, size);
    ctx.fillStyle = theme().muted; ctx.font = '11px system-ui';
    ctx.fillText(t('train.original'), 10, 20); ctx.fillText(t('train.reconstructed'), 30 + size, 20);
  } else if (snapshot?.nodes?.[app.outputId()]?.act?.data) {
    const out = snapshot.nodes[app.outputId()].act.data;
    const labels = data?.labels;
    if (data?.task.kind === 'classification') {
      const probs = out.length === 1 ? [1 - out[0], out[0]] : Array.from(out);
      barChart(canvas, probs.map((p, c) => ({ label: labels?.[c] ?? `C${c}`, value: p, color: CLASS_COLORS[c % CLASS_COLORS.length], highlight: c === snapshot.label })), { min: 0, max: 1, labelWidth: 80 });
    } else {
      barChart(canvas, Array.from(out).slice(0, 12).map((value, i) => ({ label: `y${i}`, value })), { labelWidth: 40 });
    }
  } else {
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.fillStyle = theme().muted; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(t('train.noRun'), width / 2, height / 2);
  }
}

function labelCanvas(canvas, text) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = theme().text; ctx.font = '600 11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(text, 6, 4);
}

export { nodeById };
