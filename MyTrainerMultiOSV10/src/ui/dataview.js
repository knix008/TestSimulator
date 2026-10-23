// Data tab: where the data comes from (a built-in generator, a CSV file or a
// folder of pictures), the preprocessing pipeline, the train / validation / test
// split, and previews of the data before and after preprocessing — samples,
// class balance and feature statistics. Clicking a sample makes it the probe
// input that the neuron view follows.
import { classCounts, featureStats, GENERATOR_GROUPS, GENERATOR_IDS, GENERATORS, sampleX } from '../domain/datasets.js';
import { STEP_IDS, STEPS, stepApplies } from '../domain/preprocess.js';
import { shapeText } from '../domain/layers.js';
import { icon } from '../icons.js';
import { stepperHtml } from '../stepper.js';
import { barChart, CLASS_COLORS, drawPicture, fmt, histogramChart, scatterPlot, sequenceChart, setupCanvas, theme } from './charts.js';
import { cardTitle, escapeHtml } from './dom.js';
import { drawFrameStrip, drawPlayBadge, drawSpectrogram } from './media.js';
import { SOUND_BANKS, tokensText } from '../domain/datasets-media.js';

export function dataViewHtml(app) {
  const t = app.t;
  const project = app.project();
  const ds = project.dataset;
  const source = ds.source;
  const data = app.data();
  const prepared = app.prepared();
  const genOptions = GENERATOR_GROUPS.map((group) => `<optgroup label="${escapeHtml(t(`genGroup.${group}`))}">${GENERATOR_IDS.filter((id) => GENERATORS[id].group === group).map((id) => `<option value="gen:${id}" ${source.kind === 'generator' && source.id === id ? 'selected' : ''}>${escapeHtml(t(`gen.${id}`))}</option>`).join('')}</optgroup>`).join('');
  const sourceSelect = `<select data-data="source" aria-label="${escapeHtml(t('data.source'))}">${genOptions}
    ${source.kind === 'table' ? `<option value="table" selected>${escapeHtml(t('data.csvFile'))}: ${escapeHtml(source.name)}</option>` : ''}
    ${source.kind === 'images' ? `<option value="images" selected>${escapeHtml(t('data.imageFolder'))}: ${escapeHtml(source.name)}</option>` : ''}
    <optgroup label="${escapeHtml(t('genGroup.recorded'))}">${Object.keys(SOUND_BANKS).map((bank) => `<option value="bank:${bank}" ${source.kind === 'sounds' && source.bank === bank ? 'selected' : ''}>${escapeHtml(t(`bank.${bank}`))}</option>`).join('')}</optgroup>
    ${source.kind === 'sounds' && !source.bank ? `<option value="sounds" selected>${escapeHtml(t('data.soundFolder'))}: ${escapeHtml(source.name)}</option>` : ''}
  </select>`;
  const genParams = source.kind === 'generator' ? GENERATORS[source.id].params.map(([key, , min, max, step]) => `<div class="prop-row"><span class="prop-label">${escapeHtml(t(`genParam.${key}`, null, key))}</span><span class="prop-control">${stepperHtml({ key: `gen:${key}`, value: source.params[key], min, max, step, label: t(`genParam.${key}`, null, key) })}</span></div>`).join('') : '';
  const tableOptions = source.kind === 'table' ? tableHtml(app, source) : '';
  const soundOptions = source.kind === 'sounds' ? `<div class="prop-row"><span class="prop-label">${escapeHtml(t('genParam.copies'))}</span><span class="prop-control">${stepperHtml({ key: 'snd:copies', value: source.copies, min: 1, max: 8, step: 1, label: t('genParam.copies') })}</span></div>
    <div class="prop-row"><span class="prop-label">${escapeHtml(t('genParam.seed'))}</span><span class="prop-control">${stepperHtml({ key: 'snd:seed', value: source.seed, min: 1, max: 9999, step: 1, label: t('genParam.seed') })}</span></div>
    <label class="inline-check"><input type="checkbox" data-data="noiseClass" ${source.noiseClass ? 'checked' : ''}/>${escapeHtml(t('data.noiseClass'))}</label>` : '';
  const steps = ds.steps.map((step, i) => {
    const def = STEPS[step.type];
    const applies = !data || stepApplies(step.type, data.kind);
    return `<div class="step-card ${step.enabled ? '' : 'off'} ${applies ? '' : 'na'}" data-step-index="${i}">
      <div class="step-head">${icon(def.icon)}<b>${escapeHtml(t(`step.${step.type}`))}</b><span class="grow"></span>
        <label class="switch-wrap small" title="${escapeHtml(t('data.stepOn'))}"><input type="checkbox" data-step-toggle="${i}" ${step.enabled ? 'checked' : ''}/><span class="switch"></span></label>
        <button class="icon-button" data-step-move="${i}:-1" title="${escapeHtml(t('data.stepUp'))}" ${i === 0 ? 'disabled' : ''}>${icon('chevronUp')}</button>
        <button class="icon-button" data-step-move="${i}:1" title="${escapeHtml(t('data.stepDown'))}" ${i === ds.steps.length - 1 ? 'disabled' : ''}>${icon('chevronDown')}</button>
        <button class="icon-button" data-step-remove="${i}" title="${escapeHtml(t('data.stepRemove'))}">${icon('close')}</button></div>
      <p class="muted small">${escapeHtml(t(`stepDesc.${step.type}`))}${applies ? '' : ` — ${escapeHtml(t('data.stepNotApplied'))}`}</p>
      ${def.params.map(([key, , min, max, s]) => `<div class="prop-row"><span class="prop-label">${escapeHtml(t(`stepParam.${key}`, null, key))}</span><span class="prop-control">${stepperHtml({ key: `step:${i}:${key}`, value: step.params[key], min, max, step: s, label: t(`stepParam.${key}`, null, key) })}</span></div>`).join('')}
    </div>`;
  }).join('');
  const split = ds.split;
  const summary = prepared ? `<dl class="kv">
      <dt>${escapeHtml(t('data.samples'))}</dt><dd>${data.n.toLocaleString()}</dd>
      <dt>${escapeHtml(t('data.parts'))}</dt><dd>${prepared.train.n} / ${prepared.val.n} / ${prepared.test.n}</dd>
      <dt>${escapeHtml(t('data.inputShape'))}</dt><dd>${escapeHtml(shapeText(prepared.inputShape))}</dd>
      <dt>${escapeHtml(t('data.task'))}</dt><dd>${escapeHtml(t(`task.${data.task.kind}`))}${data.task.classes ? ` · ${data.task.classes} ${escapeHtml(t('inspector.classes'))}` : ''}</dd>
    </dl>` : `<p class="muted">${escapeHtml(app.dataError() ?? t('data.none'))}</p>`;
  return `<div class="data-view">
    <aside class="data-side">
      <section class="panel-section"><h3>${icon('dataset')}<span>${escapeHtml(t('data.source'))}</span></h3>
        ${sourceSelect}
        <div class="data-import">
          <button class="button small" data-data="csv">${icon('csvImport')}<span>${escapeHtml(t('data.importCsv'))}</span></button>
          <button class="button small" data-data="images">${icon('imageFolder')}<span>${escapeHtml(t('data.importImages'))}</span></button>
          <button class="button small" data-data="sounds">${icon('volume')}<span>${escapeHtml(t('data.importSounds'))}</span></button>
        </div>
        <p class="muted small">${escapeHtml(source.kind === 'generator' ? t(`genDesc.${source.id}`) : source.kind === 'table' ? t('data.csvDesc') : source.kind === 'sounds' ? (source.bank ? t(`bankDesc.${source.bank}`) : t('data.soundsDesc')) : t('data.imagesDesc'))}</p>
        ${bankHtml(app, source)}
        ${genParams}${tableOptions}${soundOptions}
      </section>
      <section class="panel-section"><h3>${icon('ppStandardize')}<span>${escapeHtml(t('data.pipeline'))}</span></h3>
        <div class="steps">${steps || `<p class="muted small">${escapeHtml(t('data.noSteps'))}</p>`}</div>
        <select data-data="addStep" aria-label="${escapeHtml(t('data.addStep'))}"><option value="">＋ ${escapeHtml(t('data.addStep'))}</option>${STEP_IDS.map((id) => `<option value="${id}" ${data && !stepApplies(id, data.kind) ? 'disabled' : ''}>${escapeHtml(t(`step.${id}`))}</option>`).join('')}</select>
      </section>
      <section class="panel-section"><h3>${icon('split')}<span>${escapeHtml(t('data.split'))}</span></h3>
        <div class="prop-row"><span class="prop-label">${escapeHtml(t('data.val'))}</span><span class="prop-control">${stepperHtml({ key: 'split:val', value: Math.round(split.val * 100), min: 0, max: 50, step: 5, unit: '%', label: t('data.val') })}</span></div>
        <div class="prop-row"><span class="prop-label">${escapeHtml(t('data.test'))}</span><span class="prop-control">${stepperHtml({ key: 'split:test', value: Math.round(split.test * 100), min: 0, max: 50, step: 5, unit: '%', label: t('data.test') })}</span></div>
        <div class="prop-row"><span class="prop-label">${escapeHtml(t('data.seed'))}</span><span class="prop-control">${stepperHtml({ key: 'split:seed', value: split.seed, min: 1, max: 99999, step: 1, label: t('data.seed') })}</span></div>
        <div class="prop-row"><span class="prop-label">${escapeHtml(t('data.stratify'))}</span><span class="prop-control"><label class="switch-wrap"><input type="checkbox" data-data="stratify" ${split.stratify ? 'checked' : ''}/><span class="switch"></span></label></span></div>
        <div class="split-bar" title="${escapeHtml(t('data.parts'))}"><i class="train" style="flex:${1 - split.val - split.test}">${escapeHtml(t('data.train'))}</i><i class="val" style="flex:${split.val}">${split.val ? escapeHtml(t('data.valShort')) : ''}</i><i class="test" style="flex:${split.test}">${split.test ? escapeHtml(t('data.testShort')) : ''}</i></div>
      </section>
      <section class="panel-section"><h3>${icon('info')}<span>${escapeHtml(t('data.summary'))}</span></h3>${summary}</section>
    </aside>
    <div class="data-main">
      <div class="data-toolbar">
        <span class="segmented" role="radiogroup">
          <button class="segment ${app.view.dataStage !== 'prepared' ? 'active' : ''}" data-stage="raw">${icon('dataset')}<span>${escapeHtml(t('data.raw'))}</span></button>
          <button class="segment ${app.view.dataStage === 'prepared' ? 'active' : ''}" data-stage="prepared">${icon('ppStandardize')}<span>${escapeHtml(t('data.prepared'))}</span></button>
        </span>
        <span class="grow"></span>
        <span class="muted small">${escapeHtml(t('data.clickProbe'))}</span>
      </div>
      <div class="data-preview">${cardTitle(icon('dataset', 'icon tiny'), t('card.preview'), t('card.previewTip'))}<canvas class="preview-canvas" data-preview="main"></canvas></div>
      <div class="data-stats">
        <div class="stat-card">${cardTitle('', t('data.balance'), t('card.balanceTip'))}<canvas data-preview="balance"></canvas></div>
        <div class="stat-card wide">${cardTitle('', t('data.features'), t('card.featuresTip'))}<div class="feature-grid" data-preview="features"></div></div>
      </div>
    </div>
  </div>`;
}

function tableHtml(app, source) {
  const t = app.t;
  const columns = app.tableColumns();
  if (!columns) return '';
  return `<div class="prop-row"><span class="prop-label">${escapeHtml(t('data.target'))}</span><span class="prop-control"><select data-data="target">${columns.map((c) => `<option value="${escapeHtml(c.name)}" ${c.name === (source.target ?? columns.at(-1).name) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></span></div>
    <div class="prop-row"><span class="prop-label">${escapeHtml(t('data.taskKind'))}</span><span class="prop-control"><select data-data="task">${['auto', 'classification', 'regression'].map((k) => `<option value="${k}" ${source.task === k ? 'selected' : ''}>${escapeHtml(t(`task.${k}`))}</option>`).join('')}</select></span></div>
    <div class="feature-pick">${columns.filter((c) => c.name !== (source.target ?? columns.at(-1).name)).map((c) => `<label class="inline-check"><input type="checkbox" data-feature="${escapeHtml(c.name)}" ${!source.features || source.features.includes(c.name) ? 'checked' : ''}/><span>${escapeHtml(c.name)}${c.numeric ? '' : ' ⓐ'}</span></label>`).join('')}</div>`;
}

/** Draws the previews (called after the HTML is in place, and when data changes). */
export function drawDataView(app, host) {
  const data = app.data();
  const prepared = app.prepared();
  const canvas = host.querySelector('[data-preview="main"]');
  if (!canvas || !data) return;
  const stagePrepared = app.view.dataStage === 'prepared' && prepared;
  const view = stagePrepared
    ? { x: prepared.train.x, y: prepared.train.y, n: prepared.train.n, inputShape: prepared.inputShape, kind: prepared.kind, task: prepared.task, labels: data.labels, vocab: data.vocab, featureNames: prepared.featureNames, media: data.media, rawIndex: (k) => prepared.train.index[k] }
    : data;
  canvas.hits = [];
  const t = theme();
  const probe = app.probeIndex();
  if (view.kind === 'points2d' && view.inputShape[0] === 2) {
    scatterPlot(canvas, view.x, Array.from(view.y), { classes: view.task.classes, highlight: stagePrepared ? null : probe });
  } else if (view.kind === 'points2d' || view.kind === 'vector') {
    drawTable(canvas, view, app);
  } else if (view.kind === 'function1d' && view.inputShape[0] === 1) {
    scatterPlot(canvas, view.x, Array.from(view.y), { task: 'regression' });
  } else if (view.kind === 'image') {
    drawImageGrid(canvas, view, app, stagePrepared ? null : probe);
  } else if (view.kind === 'sequence') {
    drawSequenceGrid(canvas, view, app, stagePrepared ? null : probe);
  } else if (view.kind === 'tokens') {
    drawTokens(canvas, view, app, stagePrepared ? null : probe);
  } else if (view.kind === 'audio') {
    drawAudioGrid(canvas, view, app, stagePrepared ? null : probe);
  } else if (view.kind === 'video') {
    drawVideoRows(canvas, view, app, stagePrepared ? null : probe);
  }
  void t;
  const balance = host.querySelector('[data-preview="balance"]');
  const counts = classCounts(data);
  if (balance) {
    if (counts) barChart(balance, counts.map((count, c) => ({ label: data.labels?.[c] ?? `C${c}`, value: count, color: CLASS_COLORS[c % CLASS_COLORS.length] })), { format: (v) => String(Math.round(v)), labelWidth: 76 });
    else {
      const { ctx, width } = setupCanvas(balance, null, 40);
      balance.style.height = '40px';
      ctx.fillStyle = theme().muted; ctx.font = '12px system-ui'; ctx.fillText(app.t('data.noClasses'), 8, 22);
      void width;
    }
  }
  const features = host.querySelector('[data-preview="features"]');
  if (features) {
    const stats = featureStats(stagePrepared ? view : data, 12);
    features.innerHTML = stats.map((st, i) => `<div class="feature-card"><b>${escapeHtml(st.name)}</b><span class="muted">μ ${fmt(st.mean)} · σ ${fmt(st.std)}</span><span class="muted">[${fmt(st.min)}, ${fmt(st.max)}]</span><canvas data-feature-hist="${i}"></canvas></div>`).join('');
    const source = stagePrepared ? view : data;
    stats.forEach((st, i) => {
      const histCanvas = features.querySelector(`[data-feature-hist="${i}"]`);
      histCanvas.style.height = '46px';
      histogramChart(histCanvas, featureHistogram(source, i, stats.length));
    });
  }
}

function featureHistogram(data, index, groups) {
  const s = data.inputShape.reduce((a, b) => a * b, 1);
  const perFeature = data.kind === 'vector' || data.kind === 'points2d' || data.kind === 'function1d';
  const values = [];
  const limit = Math.min(data.n, 2000);
  for (let i = 0; i < limit; i++) {
    if (perFeature) values.push(data.x[i * s + index]);
    else for (let j = index; j < s; j += groups) values.push(data.x[i * s + j]);
  }
  let min = Infinity; let max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  const bins = 24;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor(((v - min) / ((max - min) || 1)) * bins))]++;
  return { min, max, counts };
}

function drawImageGrid(canvas, data, app, probe) {
  const { ctx, width, height } = setupCanvas(canvas);
  const t = theme();
  const size = 64;
  const gap = 10;
  const per = Math.max(1, Math.floor((width - gap) / (size + gap)));
  const rows = Math.max(1, Math.floor((height - gap) / (size + gap + 14)));
  const count = Math.min(data.n, per * rows);
  const start = app.view.dataPage * count;
  for (let k = 0; k < count; k++) {
    const i = (start + k) % data.n;
    const x = gap + (k % per) * (size + gap);
    const y = gap + Math.floor(k / per) * (size + gap + 14);
    drawPicture(ctx, sampleX(data, i), data.inputShape, x, y, size, size, { map: 'gray', autoscale: true });
    ctx.strokeStyle = i === probe ? t.accent : t.border; ctx.lineWidth = i === probe ? 3 : 1;
    ctx.strokeRect(x - 0.5, y - 0.5, size + 1, size + 1);
    ctx.fillStyle = t.muted; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
    const label = data.task.kind === 'classification' ? (data.labels?.[data.y[i]] ?? data.y[i]) : `#${i}`;
    ctx.fillText(String(label), x + size / 2, y + size + 12);
    canvas.hits.push({ x, y, w: size, h: size, index: data.rawIndex ? data.rawIndex(i) : i });
  }
}

function drawSequenceGrid(canvas, data, app, probe) {
  const { width, height } = setupCanvas(canvas);
  const cols = width > 900 ? 3 : 2;
  const rows = 3;
  const cellW = width / cols;
  const cellH = height / rows;
  const off = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const t = theme();
  const s = data.inputShape.reduce((a, b) => a * b, 1);
  const start = app.view.dataPage * cols * rows;
  for (let k = 0; k < cols * rows; k++) {
    const i = (start + k) % data.n;
    const label = data.task.kind === 'classification' ? (data.labels?.[data.y[i]] ?? data.y[i]) : `y = ${fmt(data.y[i], 3)}`;
    sequenceChart(off, data.x.subarray(i * s, (i + 1) * s), data.inputShape, { title: `#${i} · ${label}`, width: cellW - 8, height: cellH - 8 });
    const x = (k % cols) * cellW + 4;
    const y = Math.floor(k / cols) * cellH + 4;
    ctx.drawImage(off, x, y, cellW - 8, cellH - 8);
    ctx.strokeStyle = i === probe ? t.accent : t.border; ctx.lineWidth = i === probe ? 2.5 : 1;
    ctx.strokeRect(x, y, cellW - 8, cellH - 8);
    canvas.hits.push({ x, y, w: cellW - 8, h: cellH - 8, index: data.rawIndex ? data.rawIndex(i) : i });
  }
}

function drawTokens(canvas, data, app, probe) {
  const { ctx, width, height } = setupCanvas(canvas);
  const t = theme();
  const s = data.inputShape[0];
  const rowH = 26;
  const rows = Math.floor((height - 10) / rowH);
  const start = app.view.dataPage * rows;
  ctx.font = '13px system-ui';
  for (let k = 0; k < rows; k++) {
    const i = (start + k) % data.n;
    const y = 8 + k * rowH;
    const text = tokensText(data.x.subarray(i * s, (i + 1) * s), data);
    const label = data.labels?.[data.y[i]] ?? data.y[i];
    ctx.fillStyle = i === probe ? t.accent : t.text;
    ctx.textAlign = 'left';
    ctx.fillText(`#${i}  ${text}`, 10, y + 16);
    ctx.fillStyle = CLASS_COLORS[data.y[i] % CLASS_COLORS.length];
    ctx.textAlign = 'right';
    ctx.fillText(String(label), width - 10, y + 16);
    canvas.hits.push({ x: 0, y, w: width, h: rowH, index: data.rawIndex ? data.rawIndex(i) : i });
  }
}

function drawTable(canvas, data, app) {
  const { ctx, width, height } = setupCanvas(canvas);
  const t = theme();
  const s = data.inputShape[0];
  const names = data.featureNames ?? Array.from({ length: s }, (_, i) => `x${i + 1}`);
  const cols = Math.min(s, Math.floor((width - 120) / 84));
  const rowH = 22;
  const rows = Math.floor((height - 30) / rowH);
  const start = app.view.dataPage * rows;
  ctx.font = '600 11px system-ui'; ctx.fillStyle = t.muted; ctx.textAlign = 'right';
  ctx.fillText('#', 40, 18);
  names.slice(0, cols).forEach((name, c) => ctx.fillText(String(name).slice(0, 10), 120 + c * 84, 18));
  ctx.fillText(app.t('data.targetShort'), width - 12, 18);
  ctx.font = '12px system-ui';
  for (let k = 0; k < rows; k++) {
    const i = (start + k) % data.n;
    const y = 30 + k * rowH;
    if (k % 2) { ctx.fillStyle = t.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'; ctx.fillRect(0, y, width, rowH); }
    ctx.fillStyle = i === app.probeIndex() ? t.accent : t.text;
    ctx.fillText(String(i), 40, y + 15);
    for (let c = 0; c < cols; c++) ctx.fillText(fmt(data.x[i * s + c], 3), 120 + c * 84, y + 15);
    const target = data.task.kind === 'classification' ? (data.labels?.[data.y[i]] ?? data.y[i]) : fmt(data.y[i], 3);
    ctx.fillText(String(target), width - 12, y + 15);
    canvas.hits.push({ x: 0, y, w: width, h: rowH, index: data.rawIndex ? data.rawIndex(i) : i });
  }
}

/** Speech: spectrogram tiles (frequency up, time right) with their word; a click plays the sound. */
function drawAudioGrid(canvas, data, app, probe) {
  const { ctx, width, height } = setupCanvas(canvas);
  const t = theme();
  const size = 76;
  const gap = 12;
  const per = Math.max(1, Math.floor((width - gap) / (size + gap)));
  const rows = Math.max(1, Math.floor((height - gap) / (size + gap + 14)));
  const count = Math.min(data.n, per * rows);
  const start = app.view.dataPage * count;
  const s = data.inputShape.reduce((a, b) => a * b, 1);
  for (let k = 0; k < count; k++) {
    const i = (start + k) % data.n;
    const x = gap + (k % per) * (size + gap);
    const y = gap + Math.floor(k / per) * (size + gap + 14);
    drawSpectrogram(ctx, data.x.subarray(i * s, (i + 1) * s), data.inputShape, x, y, size, size, t.dark);
    drawPlayBadge(ctx, x + size - 17, y + 3);
    const raw = data.rawIndex ? data.rawIndex(i) : i;
    ctx.strokeStyle = raw === probe ? t.accent : t.border; ctx.lineWidth = raw === probe ? 3 : 1;
    ctx.strokeRect(x - 0.5, y - 0.5, size + 1, size + 1);
    ctx.fillStyle = t.muted; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(String(data.labels?.[data.y[i]] ?? data.y[i]), x + size / 2, y + size + 12);
    canvas.hits.push({ x, y, w: size, h: size, index: raw, play: true });
  }
}

/** Video: one clip per row, its frames side by side, then its label. */
function drawVideoRows(canvas, data, app, probe) {
  const { ctx, width, height } = setupCanvas(canvas);
  const t = theme();
  const media = data.media;
  const s = data.inputShape.reduce((a, b) => a * b, 1);
  const frameSize = Math.max(18, Math.min(46, Math.floor((width - 140) / (media.frames * 1.1))));
  const rowH = frameSize + 10;
  const rows = Math.max(1, Math.floor((height - 10) / rowH));
  const start = app.view.dataPage * rows;
  for (let k = 0; k < rows; k++) {
    const i = (start + k) % data.n;
    const y = 6 + k * rowH;
    const raw = data.rawIndex ? data.rawIndex(i) : i;
    const used = drawFrameStrip(ctx, data.x.subarray(i * s, (i + 1) * s), media, 10, y, frameSize, 3, t.dark);
    ctx.strokeStyle = raw === probe ? t.accent : t.border; ctx.lineWidth = raw === probe ? 2.5 : 1;
    ctx.strokeRect(8, y - 2, used + 4, frameSize + 4);
    ctx.fillStyle = CLASS_COLORS[data.y[i] % CLASS_COLORS.length]; ctx.font = '600 12px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(`#${raw} ${data.labels?.[data.y[i]] ?? data.y[i]}`, used + 22, y + frameSize / 2 + 4);
    canvas.hits.push({ x: 0, y, w: width, h: frameSize, index: raw });
  }
}

/** A built-in sound bank: how many clips each word has, how many voices, and where the files are. */
function bankHtml(app, source) {
  if (source.kind !== 'sounds' || !source.bank) return '';
  const t = app.t;
  const info = app.bankInfo(source.bank);
  if (!info) return '';
  const counts = Object.entries(info.counts).map(([label, n]) => `<span class="bank-count"><b>${escapeHtml(label)}</b> ${n.toLocaleString()}</span>`).join('');
  return `<div class="bank-info">
    <p class="small">${escapeHtml(t('bank.stats', { n: info.total.toLocaleString(), voices: info.voices, copies: source.copies ?? 1 }))}</p>
    <div class="bank-counts">${counts}</div>
    <p class="muted small">${escapeHtml(t('bank.where', { file: `public/${SOUND_BANKS[source.bank].file}`, folder: `data/audio/${source.bank}/`, script: 'scripts/make-kws-ko.py' }))}</p>
  </div>`;
}
