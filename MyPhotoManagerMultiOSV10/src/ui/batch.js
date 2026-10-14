// Batch tools: rotate/flip (lossless for JPEG), rename, resize, convert,
// automatic adjustment, date/time changes, copy/move to a folder.
import { baseName, joinPath, parentOf } from '../catalog/catalog.js';
import { planRename, renameSteps } from '../catalog/rename.js';
import { autoLevels } from '../edit/adjust.js';
import { fitSize } from '../edit/geometry.js';
import { applyPreset, defaultEdit, render } from '../edit/pipeline.js';
import { prepareEdit } from '../edit/lut.js';
import { context2d, scaledCanvas } from '../formats/canvas.js';
import { decodeImage } from '../formats/decode.js';
import { encodeCanvas } from '../formats/encode.js';
import { isJpeg, readOrientation, rewriteExifDates, writeOrientation } from '../formats/jpeg-meta.js';
import { flipOrientation, rotateOrientation } from '../formats/orientation.js';
import { canWriteBack, extensionOf, isImage, OUTPUT_FORMATS, outputFormatFor, stemOf } from '../formats/types.js';
import { plural, t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { chooseFolder, errorText, isDesktop } from '../platform/native.js';
import { app, reload, saveCatalogSoon, selectedFiles, targetPaths, transfer } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatDateTime } from '../util/format.js';
import { alertDialog, confirmDialog, field, openDialog, progressDialog, selectEl, toast } from './dialog.js';
import { colorSwatches } from './colorswatch.js';
import { h } from './dom.js';

const isJpegName = (name) => ['jpg', 'jpeg', 'jpe', 'jfif'].includes(extensionOf(name));

/** Runs `work(path, i)` over paths with a progress dialog; returns { done, failed: [[path, error]] }. */
export async function processFiles(paths, title, work) {
  const progress = progressDialog(title);
  const failed = [];
  let done = 0;
  for (let i = 0; i < paths.length; i++) {
    if (progress.cancelled) break;
    progress.update(i, paths.length, baseName(paths[i]));
    try {
      await work(paths[i], i);
      done += 1;
    } catch (error) {
      failed.push([paths[i], errorText(error)]);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  progress.close();
  if (failed.length) {
    await alertDialog(h('div', h('p', t('batch.someFailed', { done, failed: failed.length })), h('ul.error-list', failed.slice(0, 20).map(([p, e]) => h('li', `${baseName(p)}: ${e}`)))), title);
  } else if (done) {
    toast(t('batch.done', { n: done }), 'success');
  }
  return { done, failed };
}

async function afterWrite(path) {
  thumbs.invalidate(path);
  fs.releaseUrl?.(path);
  const [stat] = await fs.stat([path]).catch(() => [null]);
  const item = app.state.items.find((i) => i.path === path);
  if (item && stat) { item.size = stat.size; item.modified = stat.modified; }
}

/** Decodes, transforms and re-encodes one file (for formats without lossless rotation). */
async function reencode(path, editChange, { format = null, quality = null, target = path } = {}) {
  const bytes = await fs.read(path);
  const decoded = await decodeImage(bytes, baseName(path));
  const edit = defaultEdit();
  editChange(edit, decoded.source);
  await prepareEdit(edit);
  const output = render(decoded.source, edit, { scale: 1 });
  const spec = format ?? outputFormatFor(baseName(target))?.id ?? 'jpeg';
  const encoded = await encodeCanvas(output, spec, { quality: quality ?? app.settings.jpegQuality / 100, original: isJpeg(bytes) ? bytes : null });
  if (target === path && fs.caps.originals) await fs.backupOriginal(path);
  await fs.write(target, encoded);
  await afterWrite(target);
}

// ───────────────────────── rotate / flip

/** Rotates by quarter turns (±) or flips: JPEG losslessly (EXIF orientation), others re-encoded. */
export async function rotateFiles(paths, turns = 0, flip = null) {
  const list = paths.filter((p) => isImage(baseName(p)));
  if (!list.length) return;
  if (!fs.caps.write) { toast(t('batch.readOnly'), 'error'); return; }
  const readOnly = list.filter((p) => fs.isReadOnly?.(p));
  if (readOnly.length) { toast(t('batch.readOnly'), 'error'); return; }
  const lossy = list.filter((p) => !isJpegName(p) && canWriteBack(baseName(p)));
  const unsupported = list.filter((p) => !isJpegName(p) && !canWriteBack(baseName(p)));
  if (unsupported.length && unsupported.length === list.length) { toast(t('batch.cannotRotate'), 'error'); return; }
  if (lossy.length && !(await confirmDialog(t('batch.rotateReencode', { n: lossy.length })))) return;
  const work = async (path) => {
    if (isJpegName(path)) {
      const bytes = await fs.read(path);
      const current = readOrientation(bytes);
      const next = flip ? flipOrientation(current, flip === 'v') : rotateOrientation(current, turns);
      await fs.write(path, writeOrientation(bytes, next));
      await afterWrite(path);
      const record = app.catalog.get(path);
      if (record?.width && (turns % 2 !== 0)) [record.width, record.height] = [record.height, record.width];
    } else if (canWriteBack(baseName(path))) {
      await reencode(path, (edit) => { edit.geometry.rotate = ((turns * 90) % 360 + 360) % 360; edit.geometry.flipH = flip === 'h'; edit.geometry.flipV = flip === 'v'; });
    } else {
      throw new Error(t('batch.cannotRotate'));
    }
  };
  if (list.length === 1) {
    try { await work(list[0]); } catch (error) { toast(errorText(error), 'error', 6000); return; }
  } else {
    await processFiles(list, t('batch.rotating'), work);
  }
  saveCatalogSoon();
  app.emit('items', {});
  app.emit('rotated', list);
}

// ───────────────────────── rename

export async function batchRename(paths = targetPaths({ filesOnly: true })) {
  if (!paths.length || !fs.caps.rename) return;
  const files = paths.map((path) => {
    const item = app.state.items.find((i) => i.path === path) ?? { path, name: baseName(path) };
    return { path, name: item.name, modified: item.modified, record: app.catalog.get(path) };
  });
  const template = h('input.input', { type: 'text', value: app.settings.renameTemplate ?? '{date:YYYYMMDD}_###', dataset: { key: 'template' } });
  const start = h('input.input', { type: 'number', value: 1, min: 0 });
  const caseMode = selectEl([['keep', t('rename.caseKeep')], ['lower', t('rename.caseLower')], ['upper', t('rename.caseUpper')], ['title', t('rename.caseTitle')]], 'keep');
  const extCase = selectEl([['keep', t('rename.caseKeep')], ['lower', t('rename.caseLower')], ['upper', t('rename.caseUpper')]], 'lower');
  const find = h('input.input', { type: 'text' });
  const replace = h('input.input', { type: 'text' });
  const regex = h('input', { type: 'checkbox' });
  const table = h('div.rename-preview');
  const existingByFolder = new Map();
  for (const item of app.state.items) {
    const folder = parentOf(item.path);
    if (!existingByFolder.has(folder)) existingByFolder.set(folder, new Set());
    existingByFolder.get(folder).add(item.name.toLowerCase());
  }
  const existing = new Set([...existingByFolder.values()].flatMap((set) => [...set]));
  let plan = [];
  const options = () => ({ template: template.value, start: Number(start.value) || 0, caseMode: caseMode.value, extCase: extCase.value, find: find.value, replace: replace.value, regex: regex.checked });
  const update = () => {
    plan = planRename(files, options(), existing);
    table.replaceChildren(h('table.preview-table', h('tr', h('th', t('rename.from')), h('th', t('rename.to'))),
      plan.slice(0, 200).map((entry) => h(`tr${entry.problem ? '.problem' : ''}`, h('td', entry.from), h('td', { title: entry.problem ? t(`rename.problem.${entry.problem}`) : '' }, entry.to, entry.problem ? ` ⚠ ${t(`rename.problem.${entry.problem}`)}` : '')))));
  };
  for (const input of [template, start, caseMode, extCase, find, replace, regex]) input.addEventListener('input', update);
  update();
  const ok = await openDialog({
    title: plural('rename.title', files.length),
    width: 720,
    body: h('div',
      field(t('rename.template'), template, t('rename.templateHelp')),
      h('div.field-row', field(t('rename.start'), start), field(t('rename.case'), caseMode), field(t('rename.extCase'), extCase)),
      h('div.field-row', field(t('rename.find'), find), field(t('rename.replace'), replace)),
      h('label.check', regex, t('rename.regex')),
      table),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('rename.run'), value: true, primary: true }],
    onSubmit: (v) => !v || !plan.some((entry) => entry.problem),
  });
  if (!ok) return;
  app.settings.renameTemplate = template.value;
  const steps = renameSteps(plan);
  // Two phases: temporary names first where needed, so swaps never collide.
  const current = new Map(steps.map((s) => [s.path, s.path]));
  await processFiles(steps.filter((s) => s.temp).map((s) => s.path), t('rename.running'), async (path) => {
    const s = steps.find((x) => x.path === path);
    const moved = await fs.rename(path, s.temp);
    app.catalog.movePath(path, moved);
    current.set(path, moved);
  });
  await processFiles(steps.map((s) => s.path), t('rename.running'), async (path) => {
    const s = steps.find((x) => x.path === path);
    const from = current.get(path);
    const moved = await fs.rename(from, s.to);
    app.catalog.movePath(from, moved);
    thumbs.invalidate(from);
  });
  await reload();
}

// ───────────────────────── output options shared by resize / convert / adjust

function outputControls({ allowOverwrite = true, suffix = '_resized' } = {}) {
  const mode = selectEl([
    ...(allowOverwrite && fs.caps.write ? [['overwrite', t('batch.outOverwrite')]] : []),
    ['suffix', t('batch.outSuffix')],
    ...(isDesktop() ? [['folder', t('batch.outFolder')]] : []),
  ], 'suffix');
  const suffixInput = h('input.input', { type: 'text', value: suffix });
  let folder = null;
  const folderLabel = h('span.folder-label', '');
  const choose = h('button.btn.small', { type: 'button', onclick: async () => { folder = await chooseFolder(); folderLabel.textContent = folder ?? ''; } }, t('batch.chooseFolder'));
  const update = () => { suffixInput.closest('.field').hidden = mode.value !== 'suffix'; choose.parentElement.hidden = mode.value !== 'folder'; };
  mode.addEventListener('change', update);
  const box = h('div', field(t('batch.output'), mode), field(t('batch.suffix'), suffixInput), h('div.row-buttons', choose, folderLabel));
  requestAnimationFrame(update);
  return {
    el: box,
    target(path, ext) {
      const name = `${stemOf(baseName(path))}.${ext}`;
      if (mode.value === 'overwrite') return extensionOf(path) === ext ? path : joinPath(parentOf(path), name);
      if (mode.value === 'folder') { if (!folder) throw new Error(t('batch.noFolder')); return joinPath(folder, name); }
      return joinPath(parentOf(path), `${stemOf(baseName(path))}${suffixInput.value}.${ext}`);
    },
    get mode() { return mode.value; },
    get folder() { return folder; },
  };
}

function formatControls(defaultId = 'keep') {
  const format = selectEl([['keep', t('batch.keepFormat')], ...OUTPUT_FORMATS.map((f) => [f.id, f.label])], defaultId);
  const quality = h('input.slider', { type: 'range', min: 10, max: 100, value: app.settings.jpegQuality });
  const value = h('span.slider-value', String(app.settings.jpegQuality));
  quality.addEventListener('input', () => { value.textContent = quality.value; });
  return {
    el: h('div', field(t('edit.format'), format), h('div.slider-row', h('div.slider-head', h('span', t('edit.quality')), value), quality)),
    spec(path) {
      if (format.value === 'keep') return outputFormatFor(baseName(path)) ?? OUTPUT_FORMATS[0];
      return OUTPUT_FORMATS.find((f) => f.id === format.value);
    },
    get quality() { return Number(quality.value) / 100; },
  };
}

async function finishBatch(written) {
  for (const [source, target] of written) {
    if (source !== target) app.catalog.copyPath(source, target);
  }
  saveCatalogSoon();
  await reload();
}

// ───────────────────────── resize

export async function batchResize(paths = targetPaths({ filesOnly: true })) {
  const list = paths.filter((p) => isImage(baseName(p)));
  if (!list.length) return;
  const how = selectEl([['long', t('resize.longSide')], ['box', t('resize.box')], ['percent', t('resize.percent')]], 'long');
  const a = h('input.input', { type: 'number', value: 1920, min: 1 });
  const b = h('input.input', { type: 'number', value: 1080, min: 1 });
  const enlarge = h('input', { type: 'checkbox' });
  const output = outputControls({ suffix: '_resized' });
  const formats = formatControls();
  const update = () => { b.closest('.field').hidden = how.value !== 'box'; a.closest('.field').querySelector('.field-label').textContent = how.value === 'percent' ? t('resize.percentValue') : how.value === 'long' ? t('resize.pixels') : t('edit.width'); };
  how.addEventListener('change', update);
  const ok = await openDialog({
    title: plural('resize.title', list.length), width: 520,
    body: h('div', field(t('resize.how'), how), h('div.field-row', field(t('resize.pixels'), a), field(t('edit.height'), b)), h('label.check', enlarge, t('resize.enlarge')), formats.el, output.el),
    onOpen: update,
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('resize.run'), value: true, primary: true }],
  });
  if (!ok) return;
  const written = [];
  await processFiles(list, t('resize.running'), async (path) => {
    const spec = formats.spec(path);
    const target = output.target(path, spec.ext);
    const bytes = await fs.read(path);
    const decoded = await decodeImage(bytes, baseName(path));
    const { width, height } = decoded.source;
    let size;
    if (how.value === 'percent') size = { width: Math.max(1, Math.round((width * Number(a.value)) / 100)), height: Math.max(1, Math.round((height * Number(a.value)) / 100)) };
    else if (how.value === 'box') size = fitSize(width, height, Number(a.value), Number(b.value), enlarge.checked);
    else size = fitSize(width, height, Number(a.value), Number(a.value), enlarge.checked);
    const canvas = size.width < width ? scaledCanvas(decoded.source, width, height, Math.max(size.width, size.height)) : (() => {
      const c = document.createElement('canvas');
      c.width = size.width; c.height = size.height;
      const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(decoded.source, 0, 0, size.width, size.height);
      return c;
    })();
    const encoded = await encodeCanvas(canvas, spec.id, { quality: formats.quality, original: isJpeg(bytes) ? bytes : null });
    if (target === path && fs.caps.originals) await fs.backupOriginal(path);
    await fs.write(target, encoded);
    await afterWrite(target);
    written.push([path, target]);
  });
  await finishBatch(written);
}

// ───────────────────────── convert

export async function batchConvert(paths = targetPaths({ filesOnly: true })) {
  const list = paths.filter((p) => isImage(baseName(p)));
  if (!list.length) return;
  const formats = formatControls('jpeg');
  const output = outputControls({ allowOverwrite: false, suffix: '' });
  const removeSource = h('input', { type: 'checkbox' });
  const ok = await openDialog({
    title: plural('convert.title', list.length), width: 500,
    body: h('div', formats.el, output.el, fs.caps.trash ? h('label.check', removeSource, t('convert.removeSource')) : null),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('convert.run'), value: true, primary: true }],
  });
  if (!ok) return;
  const written = [];
  await processFiles(list, t('convert.running'), async (path) => {
    const spec = formats.spec(path);
    let target = output.target(path, spec.ext);
    if (target === path) target = joinPath(parentOf(path), `${stemOf(baseName(path))}_converted.${spec.ext}`);
    await reencode(path, () => {}, { format: spec.id, quality: formats.quality, target });
    written.push([path, target]);
  });
  if (removeSource.checked && written.length) {
    await fs.remove(written.map(([source]) => source), true);
    app.catalog.removePaths(written.map(([source]) => source));
  }
  await finishBatch(written);
}

// ───────────────────────── automatic adjustment

export async function batchAdjust(paths = targetPaths({ filesOnly: true })) {
  const list = paths.filter((p) => isImage(baseName(p)));
  if (!list.length) return;
  const auto = h('input', { type: 'checkbox', checked: true });
  const exposure = h('input.input', { type: 'number', value: 0, step: 0.1, min: -3, max: 3 });
  const contrast = h('input.input', { type: 'number', value: 0, min: -100, max: 100 });
  const saturation = h('input.input', { type: 'number', value: 0, min: -100, max: 100 });
  const sharpen = h('input.input', { type: 'number', value: 0, min: 0, max: 200 });
  const effect = selectEl(['none', 'grayscale', 'sepia'].map((e) => [e, t(`effect.${e}`)]), 'none');
  const output = outputControls({ suffix: '_adjusted' });
  const ok = await openDialog({
    title: plural('adjust.title', list.length), width: 520,
    body: h('div', h('label.check', auto, t('adjust.autoLevels')),
      h('div.field-row', field(t('edit.exposure'), exposure), field(t('edit.contrast'), contrast)),
      h('div.field-row', field(t('edit.saturation'), saturation), field(t('edit.sharpen'), sharpen)),
      field(t('edit.effect'), effect), output.el),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('adjust.run'), value: true, primary: true }],
  });
  if (!ok) return;
  const written = [];
  await processFiles(list, t('adjust.running'), async (path) => {
    const spec = outputFormatFor(baseName(path)) ?? OUTPUT_FORMATS[0];
    const target = output.target(path, spec.ext);
    await reencode(path, (edit, source) => {
      if (auto.checked) {
        const small = scaledCanvas(source, source.width, source.height, 600);
        edit.adjust.levels = autoLevels(context2d(small, { willReadFrequently: true }).getImageData(0, 0, small.width, small.height));
      }
      edit.adjust.exposure = Number(exposure.value) || 0;
      edit.adjust.contrast = Number(contrast.value) || 0;
      edit.adjust.saturation = Number(saturation.value) || 0;
      edit.adjust.effect = effect.value;
      edit.detail.sharpen = Number(sharpen.value) || 0;
    }, { target });
    app.catalog.markEdited(target, true);
    written.push([path, target]);
  });
  await finishBatch(written);
}

// ───────────────────────── date and time

/**
 * Applies edit settings (a saved preset or settings copied in the editor) to
 * many photos at once. `preset`: a presetOf() object (asks when null).
 */
export async function batchApplyPreset(paths = targetPaths({ filesOnly: true }), preset = null) {
  const list = paths.filter((p) => isImage(baseName(p)));
  if (!list.length) return;
  const { editClipboard } = await import('./editor.js');
  let chosen = preset;
  const output = outputControls({ suffix: '_edited' });
  if (!chosen) {
    const options = [...(editClipboard.preset ? [['clipboard', t('batch.copiedSettings')]] : []), ...app.catalog.presets.map((p) => [`preset:${p.name}`, p.name])];
    if (!options.length) { toast(t('batch.noPresets'), 'info', 6000); return; }
    const select = selectEl(options, options[0][0]);
    const ok = await openDialog({
      title: plural('batch.presetTitle', list.length), width: 500,
      body: h('div', field(t('batch.preset'), select), output.el),
      buttons: [{ label: t('common.cancel'), value: false }, { label: t('batch.apply'), value: true, primary: true }],
    });
    if (!ok) return;
    chosen = select.value === 'clipboard' ? editClipboard.preset : app.catalog.presets.find((p) => `preset:${p.name}` === select.value)?.edit;
  }
  const written = [];
  await processFiles(list, t('batch.applying'), async (path) => {
    const spec = outputFormatFor(baseName(path)) ?? OUTPUT_FORMATS[0];
    const target = output.target(path, spec.ext);
    await reencode(path, (edit) => Object.assign(edit, applyPreset(edit, chosen)), { target });
    app.catalog.markEdited(target, true);
    written.push([path, target]);
  });
  await finishBatch(written);
}

/** Batch watermark: a text added to every photo. */
export async function batchWatermark(paths = targetPaths({ filesOnly: true })) {
  const list = paths.filter((p) => isImage(baseName(p)));
  if (!list.length) return;
  const text = h('input.input', { type: 'text', value: `© ${new Date().getFullYear()}`, dataset: { key: 'watermark' } });
  const position = selectEl([['br', t('batch.posBottomRight')], ['bl', t('batch.posBottomLeft')], ['bc', t('batch.posBottom')], ['c', t('batch.posCenter')], ['tr', t('batch.posTopRight')]], 'br');
  const size = h('input.input', { type: 'number', min: 1, max: 30, value: 4 });
  const opacity = h('input.input', { type: 'number', min: 5, max: 100, value: 70 });
  const color = colorSwatches('#ffffff', { key: 'watermark-color' });
  const output = outputControls({ suffix: '_wm' });
  const ok = await openDialog({
    title: plural('batch.watermarkTitle', list.length), width: 520,
    body: h('div', field(t('edit.text'), text), h('div.field-row', field(t('batch.position'), position), field(t('edit.textSize'), size), field(t('edit.opacity'), opacity), field(t('edit.textColor'), color)), output.el),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('batch.apply'), value: true, primary: true }],
  });
  if (!ok || !text.value.trim()) return;
  const places = { br: [0.97, 0.94, 'right'], bl: [0.03, 0.94, 'left'], bc: [0.5, 0.94, 'center'], c: [0.5, 0.5, 'center'], tr: [0.97, 0.06, 'right'] };
  const [x, y, align] = places[position.value];
  const preset = { overlay: { border: 0, borderColor: '#ffffff', texts: [{ text: text.value, x, y, align, size: Number(size.value) || 4, opacity: Number(opacity.value) || 70, color: color.value, bold: true, shadow: true, font: 'sans-serif' }] } };
  const written = [];
  await processFiles(list, t('batch.applying'), async (path) => {
    const spec = outputFormatFor(baseName(path)) ?? OUTPUT_FORMATS[0];
    const target = output.target(path, spec.ext);
    await reencode(path, (edit) => Object.assign(edit, applyPreset(edit, preset)), { target });
    written.push([path, target]);
  });
  await finishBatch(written);
}

/** Turns JPEGs upright for good (pixels rotated, EXIF orientation reset to 1). */
export async function autoRotate(paths = targetPaths({ filesOnly: true })) {
  const candidates = [];
  for (const path of paths) {
    if (!isJpegName(path) || fs.isReadOnly?.(path)) continue;
    if (readOrientation(await fs.read(path)) !== 1) candidates.push(path);
  }
  if (!candidates.length) { toast(t('batch.allUpright'), 'info'); return; }
  await processFiles(candidates, t('batch.rotating'), async (path) => {
    await reencode(path, () => {}, { quality: 0.97 });
    const record = app.catalog.get(path);
    if (record?.meta) record.meta.orientation = 1;
  });
  saveCatalogSoon();
  await reload();
}

/** File modified time ← date taken (EXIF). */
export async function fileTimeFromTaken(paths = targetPaths({ filesOnly: true })) {
  const list = paths.filter((p) => app.catalog.get(p)?.meta?.taken && !fs.isReadOnly?.(p));
  if (!list.length || !fs.caps.setTime) { toast(t('batch.noDates'), 'info'); return; }
  await processFiles(list, t('dates.running'), async (path) => {
    const taken = app.catalog.get(path).meta.taken;
    await fs.setModified(path, taken);
    app.catalog.get(path).modified = taken;
  });
  saveCatalogSoon();
  await reload();
}

export async function adjustDates(paths = targetPaths({ filesOnly: true })) {
  if (!paths.length) return;
  const mode = selectEl([['shift', t('dates.shift')], ['set', t('dates.set')]], 'shift');
  const days = h('input.input', { type: 'number', value: 0 });
  const hours = h('input.input', { type: 'number', value: 0 });
  const minutes = h('input.input', { type: 'number', value: 0 });
  const first = app.catalog.get(paths[0])?.meta?.taken ?? Date.now();
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(first);
  const when = h('input.input', { type: 'datetime-local', value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` });
  const writeExif = h('input', { type: 'checkbox', checked: fs.caps.write });
  const fileTime = h('input', { type: 'checkbox', checked: false, disabled: !fs.caps.setTime });
  const preview = h('div.hint');
  const delta = () => ((Number(days.value) || 0) * 24 * 60 + (Number(hours.value) || 0) * 60 + (Number(minutes.value) || 0)) * 60000;
  const update = () => {
    for (const el of [days, hours, minutes]) el.closest('.field').hidden = mode.value !== 'shift';
    when.closest('.field').hidden = mode.value !== 'set';
    const target = mode.value === 'shift' ? first + delta() : new Date(when.value).getTime();
    preview.textContent = `${formatDateTime(first)} → ${formatDateTime(target)}`;
  };
  for (const el of [mode, days, hours, minutes, when]) el.addEventListener('input', update);
  const ok = await openDialog({
    title: plural('dates.title', paths.length), width: 520,
    body: h('div', field(t('dates.mode'), mode), h('div.field-row', field(t('dates.days'), days), field(t('dates.hours'), hours), field(t('dates.minutes'), minutes)),
      field(t('dates.when'), when), preview, h('label.check', writeExif, t('dates.writeExif')), h('label.check', fileTime, t('dates.fileTime'))),
    onOpen: update,
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('dates.run'), value: true, primary: true }],
  });
  if (!ok) return;
  const setTo = new Date(when.value).getTime();
  const change = (date) => new Date(mode.value === 'shift' ? date.getTime() + delta() : setTo);
  await processFiles(paths, t('dates.running'), async (path) => {
    const record = app.catalog.get(path) ?? app.catalog.ensure(path);
    const old = record.meta?.taken ?? record.modified ?? Date.now();
    const next = change(new Date(old)).getTime();
    if (writeExif.checked && isJpegName(path) && !fs.isReadOnly?.(path)) {
      const bytes = await fs.read(path);
      const rewritten = rewriteExifDates(bytes, change);
      if (rewritten) { await fs.write(path, rewritten); await afterWrite(path); }
    }
    if (fileTime.checked) await fs.setModified(path, next);
    record.meta = { ...(record.meta ?? {}), taken: next };
  });
  app.catalog.changed(paths, 'dates');
  saveCatalogSoon();
  await reload();
}

// ───────────────────────── copy / move to a folder

export async function copyMoveTo(move, paths = targetPaths()) {
  if (!paths.length) return;
  let dir = null;
  if (isDesktop()) {
    dir = await chooseFolder(app.state.source.type === 'folder' ? app.state.source.path : undefined);
  } else {
    const places = (await fs.places()).filter((p) => !p.readOnly);
    const recent = app.settings.recentFolders.filter((f) => !fs.isReadOnly?.(f));
    const options = [...new Set([...recent, ...places.map((p) => p.path)])];
    if (!options.length) { toast(t('web.needWritableFolder'), 'error'); return; }
    const select = selectEl(options.map((p) => [p, p.replace(/^@\d+:/, '')]), options[0]);
    const ok = await openDialog({ title: move ? t('file.moveTo') : t('file.copyTo'), body: field(t('file.destination'), select), buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.ok'), value: true, primary: true }] });
    if (ok) dir = select.value;
  }
  if (!dir) return;
  await transfer(paths, dir, { move });
}

export const selectedImagePaths = () => selectedFiles().filter((i) => isImage(i.name)).map((i) => i.path);
