// Test tab: run the trained model on one input and watch it flow through the
// network — a test sample, a picture drawn by hand, a point clicked on the plane,
// typed words or feature values — then the whole test set: accuracy, confusion
// matrix (click a cell to see those samples), per-class precision / recall / F1,
// the misclassified samples, or predicted-vs-actual for regression.
import { icon } from '../icons.js';
import { barChart, CLASS_COLORS, confusionChart, drawHeatmap, drawPicture, fmt, histogramChart, scatterPlot, sequenceChart, setupCanvas, theme } from './charts.js';
import { cardTitle, escapeHtml } from './dom.js';
import { drawSpectrogram } from './media.js';
import { tokensText, videoFrames } from '../domain/datasets-media.js';

export function testViewHtml(app) {
  const t = app.t;
  const prepared = app.prepared();
  const data = app.data();
  const test = app.testState();
  if (!prepared) return `<div class="empty-view">${icon('tabTest')}<b>${escapeHtml(t('test.noData'))}</b></div>`;
  const kind = prepared.kind;
  const part = prepared.test.n ? prepared.test : prepared.val;
  const custom = kind === 'image' || kind === 'points2d' || kind === 'tokens' || kind === 'vector' || kind === 'function1d';
  const report = app.report();
  const inputPanel = `
    <section class="panel-section"><h3 title="${escapeHtml(t('card.inputTip'))}">${icon('probe')}<span>${escapeHtml(t('test.input'))}</span></h3>
      <span class="segmented" role="radiogroup">
        <button class="segment ${test.mode === 'sample' ? 'active' : ''}" data-test-mode="sample">${icon('dataset')}<span>${escapeHtml(t('test.sample'))}</span></button>
        ${custom ? `<button class="segment ${test.mode === 'custom' ? 'active' : ''}" data-test-mode="custom">${icon(kind === 'image' ? 'pencil' : kind === 'points2d' ? 'pointer' : 'edit')}<span>${escapeHtml(t(kind === 'image' ? 'test.draw' : kind === 'points2d' ? 'test.click' : 'test.type'))}</span></button>` : ''}
      </span>
      ${test.mode === 'sample' ? `<div class="sample-nav">
          <button class="icon-button" data-test="prev" title="${escapeHtml(t('test.prev'))}">${icon('chevronLeft')}</button>
          <input type="text" class="sample-index" data-test="index" value="${test.index}" aria-label="${escapeHtml(t('test.index'))}"/>
          <span class="muted">/ ${part.n}</span>
          <button class="icon-button" data-test="next" title="${escapeHtml(t('test.next'))}">${icon('chevronRight')}</button>
          <button class="icon-button" data-test="random" title="${escapeHtml(t('test.random'))}">${icon('dice')}</button>
          ${kind === 'audio' ? `<button class="icon-button" data-test="play" title="${escapeHtml(t('test.play'))}">${icon('volume')}</button>` : ''}
          ${report?.wrong?.length ? `<label class="inline-check" title="${escapeHtml(t('test.errorsOnlyTip'))}"><input type="checkbox" data-test="errorsOnly" ${test.errorsOnly ? 'checked' : ''}/><span>${escapeHtml(t('test.errorsOnly', { n: report.wrong.length }))}</span></label>` : ''}
        </div>
        <div class="sample-view"><canvas data-test-canvas="sample"></canvas></div>` : customHtml(app, kind)}
      <p class="muted small">${escapeHtml(app.engineReadyText())}</p>
    </section>
    ${liveHtml(app)}
    ${batchHtml(app)}
    <section class="panel-section"><h3 title="${escapeHtml(t('card.outputTip'))}">${icon('blkHead')}<span>${escapeHtml(t('test.output'))}</span></h3>
      <div class="prediction-head">${predictionHead(app)}</div>
      <canvas data-test-canvas="output"></canvas>
    </section>`;
  const evaluation = report ? evaluationHtml(app, report) : `<p class="muted">${escapeHtml(t('test.noEvaluation'))}</p>
    <button class="button small" data-test="evaluate">${icon('confusion')}<span>${escapeHtml(t('test.evaluate'))}</span></button>`;
  return `<div class="test-view">
    <aside class="test-side">${inputPanel}</aside>
    <div class="test-main">
      <div class="chart-card neuron-card big">${cardTitle(icon('nodesView', 'icon tiny'), t('test.flow'), t('card.flowTip'))}<div class="neuron-host" data-neuron="test"></div></div>
      <div class="chart-card evaluation">${cardTitle(icon('confusion', 'icon tiny'), t('test.evaluation', { part: t(`test.part.${report?.summary?.part ?? 'test'}`) }), t('card.evalTip'))}${evaluation}</div>
    </div>
  </div>`;
  void data;
}

function customHtml(app, kind) {
  const t = app.t;
  const test = app.testState();
  const prepared = app.prepared();
  if (kind === 'image') {
    return `<div class="draw-pad-wrap"><canvas class="draw-pad" data-test-canvas="pad" width="224" height="224"></canvas></div>
      <div class="control-row">
        <button class="button small" data-test="clearPad">${icon('trash')}<span>${escapeHtml(t('test.clear'))}</span></button>
        <button class="button small" data-test="loadSample">${icon('dataset')}<span>${escapeHtml(t('test.fromSample'))}</span></button>
        <label class="inline-check"><span>${escapeHtml(t('test.brush'))}</span><input type="range" min="1" max="4" step="0.5" value="${test.brush}" data-test="brush"/></label>
      </div><p class="muted small">${escapeHtml(t('test.drawHint'))}</p>`;
  }
  if (kind === 'points2d') return `<div class="sample-view"><canvas data-test-canvas="plane"></canvas></div><p class="muted small">${escapeHtml(t('test.clickHint'))}</p>`;
  if (kind === 'tokens' && app.data().media?.charLevel) {
    const gen = app.testState().generation ?? {};
    return `<input type="text" class="wide" data-test="sentence" value="${escapeHtml(test.sentence)}" spellcheck="false" aria-label="${escapeHtml(t('test.prompt'))}" placeholder="${escapeHtml(t('test.prompt'))}"/>
      <div class="gen-panel"><h4>${icon('generate', 'icon tiny')} ${escapeHtml(t('test.generateTitle'))}</h4>
        <div class="control-row">
          <label class="inline-check">${escapeHtml(t('test.genLength'))}<select data-test="genLength">${[20, 40, 80, 160].map((n) => `<option value="${n}" ${(gen.length ?? 40) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="inline-check">${escapeHtml(t('test.temperature'))}<select data-test="temperature">${[0, 0.3, 0.6, 0.8, 1, 1.3].map((n) => `<option value="${n}" ${(gen.temperature ?? 0.6) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <button class="button small primary" data-test="generate" ${gen.running ? 'disabled' : ''}>${icon('generate')}<span>${escapeHtml(gen.running ? t('test.generating') : t('test.generate'))}</span></button>
        </div>
        <div class="gen-output" data-gen-output>${gen.text != null ? `<span class="gen-prompt">${escapeHtml(gen.prompt ?? '')}</span><span class="gen-new">${escapeHtml(gen.text)}</span>` : `<span class="muted small">${escapeHtml(t('test.generateHint'))}</span>`}</div>
      </div>`;
  }
  if (kind === 'tokens') {
    return `<input type="text" class="wide" data-test="sentence" value="${escapeHtml(test.sentence)}" spellcheck="false" aria-label="${escapeHtml(t('test.sentence'))}"/>
      <p class="muted small">${escapeHtml(t('test.vocabHint'))}</p><div class="vocab">${(app.data().vocab ?? []).slice(2).map((word) => `<button class="chip" data-word="${escapeHtml(word)}">${escapeHtml(word)}</button>`).join('')}</div>`;
  }
  const names = app.data().featureNames ?? [];
  return `<div class="feature-inputs">${(test.values ?? []).map((value, i) => `<label class="prop-row"><span class="prop-label">${escapeHtml(names[i] ?? `x${i + 1}`)}</span><span class="prop-control"><input type="text" data-feature-value="${i}" value="${value}"/></span></label>`).join('')}</div>
    <p class="muted small">${escapeHtml(t('test.rawHint'))}</p>`;
  void prepared;
}

/** Live input: the microphone for speech models, the webcam for picture and motion-clip models. */
function liveHtml(app) {
  const t = app.t;
  const data = app.data();
  const live = app.liveState();
  const kind = data?.kind === 'audio' && data.media ? 'audio' : data?.kind === 'image' ? 'image' : data?.kind === 'video' && data.media ? 'video' : null;
  if (!kind) return '';
  const r = live.result;
  const result = r ? `<div class="live-result ${r.quiet ? 'quiet' : ''}"><b>${escapeHtml(r.quiet ? t('live.quiet') : r.prediction ?? '')}</b>${!r.quiet && r.confidence != null ? `<span>${fmt(r.confidence * 100, 1)}%</span>` : ''}${r.inverted ? `<span class="muted small">${escapeHtml(t('batch.inverted'))}</span>` : ''}</div><canvas class="live-bars" data-live-canvas="bars"></canvas>` : '';
  const busy = live.busy ? 'disabled' : '';
  let controls = '';
  if (kind === 'audio') {
    controls = `<button class="button small ${live.mode === 'say' ? 'primary' : ''}" data-live="say" ${busy}>${icon('microphone')}<span>${escapeHtml(live.mode === 'say' ? t('live.listening') : t('live.say'))}</span></button>
      <button class="button small ${live.mode === 'listen' ? 'active' : ''}" data-live="listen">${icon(live.mode === 'listen' ? 'trainStop' : 'waveform')}<span>${escapeHtml(live.mode === 'listen' ? t('live.stopListening') : t('live.listen'))}</span></button>`;
  } else {
    controls = `<button class="button small ${live.camera ? 'active' : ''}" data-live="camera">${icon('camera')}<span>${escapeHtml(live.camera ? t('live.cameraOff') : t('live.cameraOn'))}</span></button>
      ${live.camera ? `<button class="button small primary" data-live="snap" ${busy}>${icon(kind === 'video' ? 'record' : 'capture')}<span>${escapeHtml(kind === 'video' ? t('live.record', { n: data.media.frames }) : t('live.snap'))}</span></button>
      <button class="button small ${live.mode === 'watch' ? 'active' : ''}" data-live="watch">${icon(live.mode === 'watch' ? 'trainStop' : 'eye')}<span>${escapeHtml(live.mode === 'watch' ? t('live.stopWatching') : t('live.watch'))}</span></button>` : ''}`;
  }
  return `<section class="panel-section live-section"><h3>${icon(kind === 'audio' ? 'microphone' : 'camera')}<span>${escapeHtml(t(kind === 'audio' ? 'live.titleMic' : 'live.titleCamera'))}</span></h3>
    <p class="muted small">${escapeHtml(t(`live.hint.${kind}`))}</p>
    <div class="control-row">${controls}</div>
    ${kind === 'audio' ? `<div class="live-level" title="${escapeHtml(t('live.level'))}"><i data-live-level style="width:${Math.round((live.level ?? 0) * 100)}%"></i><b class="live-threshold" style="left:${Math.min(100, Math.round(app.settings().micThreshold * 6 * 100))}%" title="${escapeHtml(t('live.threshold'))}"></b></div>
      <div class="live-sliders">
        <label class="prop-row"><span class="prop-label">${escapeHtml(t('live.gain'))}</span><span class="prop-control"><input type="range" min="0.25" max="8" step="0.25" value="${app.settings().micGain}" data-live-setting="micGain"/><output>×${app.settings().micGain}</output></span></label>
        <label class="prop-row" title="${escapeHtml(t('live.thresholdTip'))}"><span class="prop-label">${escapeHtml(t('live.threshold'))}</span><span class="prop-control"><input type="range" min="0.002" max="0.1" step="0.002" value="${app.settings().micThreshold}" data-live-setting="micThreshold"/><output>${app.settings().micThreshold.toFixed(3)}</output></span></label>
      </div>` : `<div class="live-camera" data-live-video-host ${live.camera ? '' : 'hidden'}></div>`}
    ${live.error ? `<p class="small error-text">${escapeHtml(live.error)}</p>` : ''}
    <div class="live-preview"><canvas data-live-canvas="input" ${live.preview ? '' : 'hidden'}></canvas>${result}</div>
  </section>`;
}

function batchHtml(app) {
  const t = app.t;
  const spec = app.inputKind();
  const batch = app.batchState();
  if (!spec) return `<section class="panel-section"><h3>${icon('folderRun')}<span>${escapeHtml(t('batch.title'))}</span></h3><p class="muted small">${escapeHtml(t('batch.unsupported'))}</p></section>`;
  const rows = batch.items.map((item, i) => `<tr data-batch-row="${i}" class="${batch.selected === i ? 'selected' : ''} ${item.error ? 'error' : ''}" title="${escapeHtml(item.label ?? item.name)}">
      <td>${escapeHtml(item.name)}</td><td><b>${escapeHtml(item.error ? t('batch.error') : item.prediction ?? '')}</b></td><td>${item.confidence != null ? `${fmt(item.confidence * 100, 1)}%` : ''}</td>
      <td class="muted">${escapeHtml(item.error ?? (item.note === 'inverted' ? t('batch.inverted') : item.note ?? ''))}</td></tr>`).join('');
  return `<section class="panel-section batch-section"><h3>${icon('folderRun')}<span>${escapeHtml(t('batch.title'))}</span></h3>
    <p class="muted small">${escapeHtml(t(`batch.hint.${spec.kind}`))}</p>
    <div class="control-row">
      <button class="button small" data-batch="files" ${batch.running ? 'disabled' : ''}>${icon('folderOpen')}<span>${escapeHtml(t('batch.files'))}</span></button>
      ${spec.folder ? `<button class="button small" data-batch="folder" ${batch.running ? 'disabled' : ''}>${icon('folder')}<span>${escapeHtml(t('batch.folder'))}</span></button>` : ''}
    </div>
    ${batch.message ? `<p class="small ${batch.running ? 'muted' : ''}">${escapeHtml(batch.message)}</p>` : ''}
    ${rows ? `<div class="batch-table-wrap"><table class="batch-table"><thead><tr><th>${escapeHtml(t('batch.input'))}</th><th>${escapeHtml(t('test.output'))}</th><th>%</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="control-row"><button class="button small" data-batch="save">${icon('save')}<span>${escapeHtml(t('batch.save'))}</span></button><button class="button small" data-batch="clear">${icon('clear')}<span>${escapeHtml(t('batch.clear'))}</span></button></div>` : ''}
  </section>`;
}

function predictionHead(app) {
  const t = app.t;
  const out = app.probeOutput();
  const data = app.data();
  if (!out) return `<span class="muted">${escapeHtml(t('test.noPrediction'))}</span>`;
  if (data.task.kind === 'classification') {
    const probs = out.length === 1 ? [1 - out[0], out[0]] : Array.from(out);
    const best = probs.indexOf(Math.max(...probs));
    const actual = app.probeLabel();
    const ok = actual == null ? null : actual === best;
    return `<span class="prediction ${ok === true ? 'ok' : ok === false ? 'bad' : ''}">${icon(ok === false ? 'error' : 'check')}<b>${escapeHtml(data.labels?.[best] ?? `C${best}`)}</b> <span class="muted">${fmt(probs[best] * 100, 1)}%</span></span>${actual != null ? `<span class="muted small">${escapeHtml(t('test.actual'))}: ${escapeHtml(data.labels?.[actual] ?? actual)}</span>` : ''}`;
  }
  if (data.task.kind === 'regression') {
    const actual = app.probeTarget();
    return `<span class="prediction"><b>${fmt(out[0], 4)}</b></span>${actual != null ? `<span class="muted small">${escapeHtml(t('test.actual'))}: ${fmt(actual, 4)} · ${escapeHtml(t('test.error'))} ${fmt(out[0] - actual, 4)}</span>` : ''}`;
  }
  return `<span class="muted">${escapeHtml(t('test.reconstruction'))}</span>`;
}

function evaluationHtml(app, report) {
  const t = app.t;
  const data = app.data();
  if (report.kind === 'classification') {
    return `<div class="eval-grid">
      <div><div class="metric-row">
        <div class="metric"><span>${escapeHtml(t('test.accuracy'))}</span><b>${fmt(report.accuracy * 100, 1)}%</b></div>
        <div class="metric"><span>${escapeHtml(t('test.macroF1'))}</span><b>${fmt(report.macroF1, 3)}</b></div>
        <div class="metric"><span>${escapeHtml(t('test.loss'))}</span><b>${fmt(report.summary?.loss, 4)}</b></div>
        <div class="metric"><span>${escapeHtml(t('test.errors'))}</span><b>${report.wrong.length}</b></div>
      </div>
      <table class="report-table"><thead><tr><th>${escapeHtml(t('test.class'))}</th><th>${escapeHtml(t('test.precision'))}</th><th>${escapeHtml(t('test.recall'))}</th><th>F1</th><th>${escapeHtml(t('test.support'))}</th></tr></thead>
      <tbody>${report.perClass.map((c, k) => `<tr><td><i class="dot" style="background:${CLASS_COLORS[k % CLASS_COLORS.length]}"></i>${escapeHtml(data.labels?.[k] ?? `C${k}`)}</td><td>${fmt(c.precision, 3)}</td><td>${fmt(c.recall, 3)}</td><td>${fmt(c.f1, 3)}</td><td>${c.support}</td></tr>`).join('')}</tbody></table></div>
      <div class="confusion-wrap"><canvas data-test-canvas="confusion"></canvas><p class="muted small">${escapeHtml(t('test.confusionHint'))}</p></div>
    </div>
    ${report.wrong.length ? `<h4>${escapeHtml(t('test.mistakes'))}</h4><div class="mistakes"><canvas data-test-canvas="mistakes"></canvas></div>` : ''}`;
  }
  return `<div class="eval-grid">
    <div class="metric-row">
      <div class="metric"><span>MAE</span><b>${fmt(report.mae, 4)}</b></div>
      <div class="metric"><span>RMSE</span><b>${fmt(report.rmse, 4)}</b></div>
      ${data.task.kind === 'regression' ? `<div class="metric"><span>R²</span><b>${fmt(report.r2, 3)}</b></div>` : ''}
      <div class="metric"><span>${escapeHtml(t('test.loss'))}</span><b>${fmt(report.summary?.loss, 4)}</b></div>
    </div>
    <div class="regression-charts"><canvas data-test-canvas="pva"></canvas><canvas data-test-canvas="residuals"></canvas></div>
  </div>`;
}

/** Draws the test view's canvases. */
export function drawTestView(app, host) {
  const t = app.t;
  const prepared = app.prepared();
  if (!prepared) return;
  const data = app.data();
  const test = app.testState();
  const part = prepared.test.n ? prepared.test : prepared.val;
  const s = prepared.inputShape.reduce((a, b) => a * b, 1);
  const sample = host.querySelector('[data-test-canvas="sample"]');
  if (sample && part.n) {
    const i = Math.min(test.index, part.n - 1);
    const x = part.x.subarray(i * s, (i + 1) * s);
    if (prepared.kind === 'image') {
      const { ctx, width, height } = setupCanvas(sample);
      const size = Math.min(width, height) - 4;
      drawPicture(ctx, x, prepared.inputShape, (width - size) / 2, 2, size, size);
    } else if (prepared.kind === 'points2d' && s === 2) {
      scatterPlot(sample, part.x, Array.from(part.y), { highlight: i, boundary: app.visual().boundary });
    } else if (prepared.kind === 'audio') {
      const { ctx, width, height } = setupCanvas(sample);
      const size = Math.min(width, height) - 4;
      drawSpectrogram(ctx, x, prepared.inputShape, (width - size) / 2, 2, size, size, theme().dark);
    } else if (prepared.kind === 'video') {
      const { ctx, width } = setupCanvas(sample);
      const media = prepared.media;
      const cols = Math.ceil(media.frames / 2);
      const frame = Math.floor((width - 10) / cols) - 4;
      const half = Math.ceil(media.frames / 2);
      const frames = videoFrames(x, media);
      frames.forEach((values, f) => drawHeatmap(ctx, values, media.size, media.size, 5 + (f % half) * (frame + 4), 4 + Math.floor(f / half) * (frame + 14), frame, frame, { map: 'gray' }));
      ctx.fillStyle = theme().muted; ctx.font = '10px system-ui';
      frames.forEach((_, f) => ctx.fillText(`t${f}`, 5 + (f % half) * (frame + 4), 4 + Math.floor(f / half) * (frame + 14) + frame + 10));
    } else if (prepared.kind === 'sequence') {
      sequenceChart(sample, x, prepared.inputShape, { title: `#${i}` });
    } else {
      const { ctx, width } = setupCanvas(sample);
      ctx.fillStyle = theme().text; ctx.font = '12px system-ui';
      const words = prepared.kind === 'tokens' ? tokensText(x, data) : Array.from(x).map((v) => fmt(v, 3)).join(', ');
      wrapText(ctx, words, 6, 18, width - 12, 16);
    }
  }
  const plane = host.querySelector('[data-test-canvas="plane"]');
  if (plane) {
    scatterPlot(plane, part.x, Array.from(part.y), { boundary: app.visual().boundary });
    if (test.point && plane.plotBox) {
      const { box, bounds } = plane.plotBox;
      const ctx = plane.getContext('2d');
      const px = box.x + ((test.point[0] - bounds.minX) / (bounds.maxX - bounds.minX)) * box.w;
      const py = box.y + box.h - ((test.point[1] - bounds.minY) / (bounds.maxY - bounds.minY)) * box.h;
      ctx.strokeStyle = theme().text; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px - 8, py); ctx.lineTo(px + 8, py); ctx.moveTo(px, py - 8); ctx.lineTo(px, py + 8); ctx.stroke();
    }
  }
  const pad = host.querySelector('[data-test-canvas="pad"]');
  if (pad && !pad.dataset.ready) app.bindDrawPad(pad);
  const output = host.querySelector('[data-test-canvas="output"]');
  const out = app.probeOutput();
  if (output) {
    if (!out) { setupCanvas(output, null, 10); output.style.height = '10px'; }
    else if (data.task.kind === 'classification') {
      const probs = out.length === 1 ? [1 - out[0], out[0]] : Array.from(out);
      barChart(output, probs.map((p, c) => ({ label: data.labels?.[c] ?? `C${c}`, value: p, color: CLASS_COLORS[c % CLASS_COLORS.length], highlight: c === probs.indexOf(Math.max(...probs)) })), { min: 0, max: 1, format: (v) => `${fmt(v * 100, 1)}%`, labelWidth: 84 });
    } else if (data.task.kind === 'reconstruction') {
      const { ctx, width } = setupCanvas(output, null, 140);
      output.style.height = '140px';
      const size = Math.min(120, (width - 30) / 2);
      drawPicture(ctx, app.snapshot()?.input?.data, prepared.inputShape, 6, 14, size, size);
      drawPicture(ctx, out, prepared.inputShape, 20 + size, 14, size, size);
      ctx.fillStyle = theme().muted; ctx.font = '11px system-ui';
      ctx.fillText(t('train.original'), 6, 10); ctx.fillText(t('train.reconstructed'), 20 + size, 10);
    } else {
      barChart(output, Array.from(out).slice(0, 10).map((value, i) => ({ label: `y${i}`, value })), { labelWidth: 30 });
    }
  }
  const report = app.report();
  const confusion = host.querySelector('[data-test-canvas="confusion"]');
  if (confusion && report?.matrix) {
    confusion.style.height = `${Math.min(340, 70 + report.matrix.length * 32)}px`;
    confusionChart(confusion, report.matrix, data.labels);
  }
  const mistakes = host.querySelector('[data-test-canvas="mistakes"]');
  if (mistakes && report?.wrong) drawMistakes(app, mistakes, report, part, s);
  const pva = host.querySelector('[data-test-canvas="pva"]');
  if (pva && report?.kind === 'regression') {
    const evaluation = app.evaluation();
    const preds = Float32Array.from(evaluation.predictions);
    const targets = Float32Array.from(evaluation.targets);
    drawPredVsActual(pva, preds, targets.length === preds.length ? targets : preds, t);
    const residuals = host.querySelector('[data-test-canvas="residuals"]');
    let min = Infinity; let max = -Infinity;
    for (const e of report.errors) { min = Math.min(min, e); max = Math.max(max, e); }
    const counts = new Array(30).fill(0);
    for (const e of report.errors) counts[Math.min(29, Math.floor(((e - min) / ((max - min) || 1)) * 30))]++;
    histogramChart(residuals, { min, max, counts }, { title: t('test.residuals') });
  }
}

function drawPredVsActual(canvas, preds, targets, t) {
  const { ctx, width, height } = setupCanvas(canvas);
  const th = theme();
  const n = Math.min(preds.length, 3000);
  let lo = Infinity; let hi = -Infinity;
  for (let i = 0; i < n; i++) { lo = Math.min(lo, preds[i], targets[i]); hi = Math.max(hi, preds[i], targets[i]); }
  const box = { x: 34, y: 18, w: width - 44, h: height - 38 };
  const p = (v, size) => ((v - lo) / ((hi - lo) || 1)) * size;
  ctx.strokeStyle = th.border; ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = th.muted; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(box.x, box.y + box.h); ctx.lineTo(box.x + box.w, box.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = CLASS_COLORS[0]; ctx.globalAlpha = 0.55;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(box.x + p(targets[i], box.w), box.y + box.h - p(preds[i], box.h), 2.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.fillStyle = th.text; ctx.font = '600 11px system-ui'; ctx.fillText(t('test.predVsActual'), 6, 12);
  ctx.fillStyle = th.muted; ctx.font = '10px system-ui'; ctx.fillText(t('test.actual'), box.x + box.w - 40, box.y + box.h + 14);
}

function drawMistakes(app, canvas, report, part, s) {
  const prepared = app.prepared();
  const data = app.data();
  const t = theme();
  const list = app.testState().cell ? report.wrong.filter((i) => Math.round(part.y[i]) === app.testState().cell[0] && report.predicted[i] === app.testState().cell[1]) : report.wrong;
  const size = prepared.kind === 'image' ? 52 : 0;
  const shown = list.slice(0, 40);
  if (prepared.kind !== 'image') {
    const { ctx } = setupCanvas(canvas, null, 22 * Math.min(8, shown.length) + 6);
    canvas.style.height = `${22 * Math.min(8, shown.length) + 6}px`;
    ctx.font = '12px system-ui';
    shown.slice(0, 8).forEach((i, k) => {
      ctx.fillStyle = t.text;
      ctx.fillText(`#${i}: ${data.labels?.[Math.round(part.y[i])] ?? part.y[i]} → ${data.labels?.[report.predicted[i]] ?? report.predicted[i]}`, 6, 18 + k * 22);
    });
    canvas.hits = shown.slice(0, 8).map((i, k) => ({ x: 0, y: 4 + k * 22, w: 400, h: 22, index: i }));
    return;
  }
  const width = canvas.parentElement.clientWidth || 600;
  const per = Math.max(1, Math.floor(width / (size + 10)));
  const rows = Math.ceil(shown.length / per);
  const { ctx } = setupCanvas(canvas, width, rows * (size + 22) + 4);
  canvas.style.height = `${rows * (size + 22) + 4}px`;
  canvas.hits = [];
  shown.forEach((i, k) => {
    const x = 4 + (k % per) * (size + 10);
    const y = 4 + Math.floor(k / per) * (size + 22);
    drawPicture(ctx, part.x.subarray(i * s, (i + 1) * s), prepared.inputShape, x, y, size, size);
    ctx.fillStyle = '#e15759'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`${data.labels?.[Math.round(part.y[i])] ?? ''}→${data.labels?.[report.predicted[i]] ?? ''}`, x + size / 2, y + size + 12);
    canvas.hits.push({ x, y, w: size, h: size, index: i });
  });
}

function wrapText(ctx, text, x, y, width, lineHeight) {
  const words = String(text).split(' ');
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { ctx.fillText(line, x, y); y += lineHeight; line = word; } else line = next;
  }
  if (line) ctx.fillText(line, x, y);
}
