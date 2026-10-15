// Batch actions: a named list of steps — edit settings
// recorded in the editor, auto levels, watermark, rotate, resize, rating,
// keywords and the output format — replayed on any number of photos.
// Each photo is decoded once; the edit steps go through the normal render
// pipeline, then resize, then it is encoded.
import { baseName, joinPath, parentOf } from '../catalog/catalog.js';
import { autoLevels } from '../edit/adjust.js';
import { fitSize } from '../edit/geometry.js';
import { prepareEdit } from '../edit/lut.js';
import { applyPreset, defaultEdit, normalizeEdit, presetOf, render } from '../edit/pipeline.js';
import { context2d, scaledCanvas } from '../formats/canvas.js';
import { decodeImage } from '../formats/decode.js';
import { encodeCanvas } from '../formats/encode.js';
import { isJpeg } from '../formats/jpeg-meta.js';
import { isImage, OUTPUT_FORMATS, outputFormatFor, stemOf } from '../formats/types.js';
import { plural, t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { app, reload, saveCatalogSoon, targetPaths } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { processFiles } from './batch.js';
import { confirmDialog, field, openDialog, promptDialog, selectEl, toast } from './dialog.js';
import { h } from './dom.js';
import { icon } from './icons.js';

export const STEP_KINDS = ['edit', 'autoLevels', 'watermark', 'rotate', 'resize', 'rating', 'keywords', 'format'];

const DEFAULT_STEP = {
  edit: () => ({ kind: 'edit', name: '', preset: presetOf(defaultEdit()) }),
  autoLevels: () => ({ kind: 'autoLevels' }),
  watermark: () => ({ kind: 'watermark', text: `© ${new Date().getFullYear()}`, size: 4, opacity: 70 }),
  rotate: () => ({ kind: 'rotate', degrees: 90 }),
  resize: () => ({ kind: 'resize', long: 1920 }),
  rating: () => ({ kind: 'rating', value: 5 }),
  keywords: () => ({ kind: 'keywords', words: [] }),
  format: () => ({ kind: 'format', format: 'jpeg', quality: 90 }),
};

export const actions = () => (app.settings.actions ?? []).filter((a) => a && typeof a.name === 'string' && Array.isArray(a.steps));
const saveActions = (list) => { app.settings.actions = list; app.saveSettings(); };

/** One line describing a step. */
export function stepLabel(step) {
  switch (step.kind) {
    case 'edit': return `${t('actions.step.edit')}${step.name ? `: ${step.name}` : ''}`;
    case 'watermark': return `${t('actions.step.watermark')}: ${step.text}`;
    case 'rotate': return `${t('actions.step.rotate')}: ${step.degrees}°`;
    case 'resize': return `${t('actions.step.resize')}: ${step.long} px`;
    case 'rating': return `${t('actions.step.rating')}: ${'★'.repeat(step.value) || '0'}`;
    case 'keywords': return `${t('actions.step.keywords')}: ${step.words.join(', ')}`;
    case 'format': return `${t('actions.step.format')}: ${OUTPUT_FORMATS.find((f) => f.id === step.format)?.label ?? step.format}`;
    default: return t(`actions.step.${step.kind}`);
  }
}

/** Adds the editor's current settings as an "edit" step of an action (new or existing). */
export async function recordEditStep(edit) {
  const list = actions();
  const target = selectEl([['', t('actions.newAction')], ...list.map((a, i) => [String(i), a.name])], list.length ? '0' : '');
  const label = h('input.input', { type: 'text', value: '', placeholder: t('actions.stepName'), dataset: { key: 'step-name' } });
  const ok = await openDialog({ title: t('actions.record'), id: 'record-step-dialog', body: h('div', h('p.hint', t('actions.recordHint')), field(t('actions.action'), target), field(t('actions.stepName'), label)), buttons: [{ label: t('common.cancel'), value: false }, { label: t('actions.add'), value: true, primary: true }] });
  if (!ok) return null;
  const step = { kind: 'edit', name: label.value.trim(), preset: presetOf(normalizeEdit(edit)) };
  if (target.value === '') {
    const name = await promptDialog(t('actions.name'), '', { title: t('actions.newAction') });
    if (!name?.trim()) return null;
    saveActions([...list.filter((a) => a.name !== name.trim()), { name: name.trim(), steps: [step] }]);
    toast(t('actions.recorded', { name: name.trim() }), 'success');
    return name.trim();
  }
  const action = list[Number(target.value)];
  action.steps.push(step);
  saveActions(list);
  toast(t('actions.recorded', { name: action.name }), 'success');
  return action.name;
}

// ───────────────────────── running

/** Runs an action on one file; returns the written path. */
export async function runActionOn(action, path, { suffix = '_action', overwrite = false } = {}) {
  const bytes = await fs.read(path);
  const decoded = await decodeImage(bytes, baseName(path));
  let edit = defaultEdit();
  let format = outputFormatFor(baseName(path)) ?? OUTPUT_FORMATS[0];
  let quality = app.settings.jpegQuality / 100;
  let long = 0;
  const catalogSteps = [];
  for (const step of action.steps) {
    if (step.kind === 'edit') edit = applyPreset(edit, step.preset);
    else if (step.kind === 'autoLevels') {
      const small = scaledCanvas(decoded.source, decoded.source.width, decoded.source.height, 600);
      edit.adjust.levels = autoLevels(context2d(small, { willReadFrequently: true }).getImageData(0, 0, small.width, small.height));
    } else if (step.kind === 'watermark') {
      edit.overlay.texts = [...edit.overlay.texts, { text: step.text, x: 0.97, y: 0.94, align: 'right', size: step.size ?? 4, opacity: step.opacity ?? 70, color: '#ffffff', bold: true, shadow: true, font: 'sans-serif' }];
    } else if (step.kind === 'rotate') edit.geometry.rotate = (((edit.geometry.rotate + Number(step.degrees)) % 360) + 360) % 360;
    else if (step.kind === 'resize') long = Number(step.long) || 0;
    else if (step.kind === 'format') { format = OUTPUT_FORMATS.find((f) => f.id === step.format) ?? format; quality = (Number(step.quality) || 90) / 100; }
    else catalogSteps.push(step);
  }
  await prepareEdit(edit);
  let canvas = render(decoded.source, edit, { scale: 1 });
  if (long && Math.max(canvas.width, canvas.height) !== long) {
    const size = fitSize(canvas.width, canvas.height, long, long, true);
    if (size.width < canvas.width) canvas = scaledCanvas(canvas, canvas.width, canvas.height, long);
    else {
      const up = document.createElement('canvas');
      up.width = size.width; up.height = size.height;
      const g = up.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(canvas, 0, 0, size.width, size.height);
      canvas = up;
    }
  }
  const target = overwrite && format.ext === outputFormatFor(baseName(path))?.ext ? path : joinPath(parentOf(path), `${stemOf(baseName(path))}${suffix}.${format.ext}`);
  const encoded = await encodeCanvas(canvas, format.id, { quality, original: isJpeg(bytes) ? bytes : null });
  if (target === path && fs.caps.originals) await fs.backupOriginal(path);
  await fs.write(target, encoded);
  thumbs.invalidate(target);
  if (target !== path) app.catalog.copyPath(path, target);
  for (const step of catalogSteps) {
    if (step.kind === 'rating') app.catalog.setRating([target], step.value);
    if (step.kind === 'keywords' && step.words.length) app.catalog.addKeywords([target], step.words);
  }
  app.catalog.markEdited(target, true);
  return target;
}

export async function runAction(action, paths, options = {}) {
  const list = paths.filter((p) => isImage(baseName(p)));
  if (!list.length) return { done: 0, failed: [] };
  const written = [];
  const result = await processFiles(list, t('actions.running', { name: action.name }), async (path) => { written.push(await runActionOn(action, path, options)); });
  saveCatalogSoon();
  await reload();
  return { ...result, written };
}

// ───────────────────────── the dialog: actions on the left, steps on the right

export async function actionsDialog(paths = targetPaths({ filesOnly: true })) {
  let list = actions().map((a) => ({ name: a.name, steps: a.steps.map((s) => ({ ...s })) }));
  let current = list.length ? 0 : -1;
  const names = h('div.action-list');
  const steps = h('div.step-list');
  const suffix = h('input.input', { type: 'text', value: '_action', dataset: { key: 'action-suffix' } });
  const overwrite = h('input', { type: 'checkbox', dataset: { key: 'action-overwrite' } });
  const runButton = h('button.btn.small.primary', { type: 'button', id: 'run-action', onclick: () => submit('run') }, h('span', { html: icon('play') }), t('actions.run', { n: paths.length }));
  let submit = () => {};

  const drawNames = () => {
    names.replaceChildren(...list.map((a, i) => h(`div.cat-row${i === current ? '.active' : ''}`, { role: 'button', dataset: { action: a.name }, onclick: () => { current = i; draw(); } },
      h('span.cat-icon', { html: icon('play') }), h('span.cat-label', a.name), h('span.cat-count', String(a.steps.length)))),
    h('div.row-buttons',
      h('button.btn.small', { type: 'button', id: 'new-action', onclick: async () => { const name = await promptDialog(t('actions.name'), '', { title: t('actions.newAction') }); if (!name?.trim()) return; list.push({ name: name.trim(), steps: [] }); current = list.length - 1; draw(); } }, h('span', { html: icon('plus') }), t('actions.newAction')),
      current >= 0 ? h('button.tool.small', { type: 'button', title: t('common.delete'), html: icon('trash'), onclick: async () => { if (!(await confirmDialog(t('actions.deleteAsk', { name: list[current].name }), { danger: true, ok: t('common.delete') }))) return; list.splice(current, 1); current = Math.min(current, list.length - 1); draw(); } }) : ''));
  };
  const stepEditor = (step, i) => {
    const input = (key, type = 'number', extra = {}) => {
      const el = h('input.input', { type, value: Array.isArray(step[key]) ? step[key].join(', ') : step[key], dataset: { step: `${i}-${key}` }, ...extra });
      el.addEventListener('input', () => { step[key] = key === 'words' ? el.value.split(/[,;]/).map((w) => w.trim()).filter(Boolean) : type === 'number' ? Number(el.value) : el.value; });
      return el;
    };
    const choose = (key, options) => { const el = selectEl(options, String(step[key]), (v) => { step[key] = typeof step[key] === 'number' ? Number(v) : v; }); el.dataset.step = `${i}-${key}`; return el; };
    switch (step.kind) {
      case 'watermark': return h('div.step-fields', input('text', 'text'), input('size', 'number', { min: 1, max: 30 }), input('opacity', 'number', { min: 5, max: 100 }));
      case 'rotate': return h('div.step-fields', choose('degrees', [[90, '90°'], [180, '180°'], [270, '270°']]));
      case 'resize': return h('div.step-fields', input('long', 'number', { min: 16, max: 20000 }), h('span.hint', t('resize.pixels')));
      case 'rating': return h('div.step-fields', choose('value', [0, 1, 2, 3, 4, 5].map((n) => [n, n ? '★'.repeat(n) : '0'])));
      case 'keywords': return h('div.step-fields', input('words', 'text', { placeholder: 'a, b, c' }));
      case 'format': return h('div.step-fields', choose('format', OUTPUT_FORMATS.map((f) => [f.id, f.label])), input('quality', 'number', { min: 10, max: 100 }));
      case 'edit': return h('div.step-fields', input('name', 'text', { placeholder: t('actions.stepName') }));
      default: return '';
    }
  };
  const drawSteps = () => {
    const action = list[current];
    if (!action) { steps.replaceChildren(h('div.hint', t('actions.none'))); return; }
    const presets = app.catalog.presets;
    const add = selectEl([['', t('actions.addStep')], ...STEP_KINDS.filter((k) => k !== 'edit').map((k) => [k, t(`actions.step.${k}`)]), ...presets.map((p) => [`preset:${p.name}`, `${t('actions.step.edit')}: ${p.name}`])], '', (v) => {
      if (!v) return;
      action.steps.push(v.startsWith('preset:') ? { kind: 'edit', name: v.slice(7), preset: presetOf(presets.find((p) => p.name === v.slice(7)).edit) } : DEFAULT_STEP[v]());
      drawSteps();
      drawNames();
    });
    add.dataset.key = 'add-step';
    steps.replaceChildren(
      ...action.steps.map((step, i) => h('div.step-row', { dataset: { stepIndex: String(i), kind: step.kind } },
        h('span.step-n', String(i + 1)), h('span.step-label', t(`actions.step.${step.kind}`)), stepEditor(step, i),
        h('button.tool.small', { type: 'button', title: t('edit.layerUp'), html: icon('up'), disabled: i === 0, onclick: () => { [action.steps[i - 1], action.steps[i]] = [action.steps[i], action.steps[i - 1]]; drawSteps(); } }),
        h('button.tool.small', { type: 'button', title: t('common.remove'), html: icon('close'), onclick: () => { action.steps.splice(i, 1); drawSteps(); drawNames(); } }))),
      action.steps.length ? '' : h('div.hint', t('actions.noSteps')),
      add);
    runButton.disabled = !action.steps.length || !paths.length;
  };
  const draw = () => { drawNames(); drawSteps(); };
  draw();
  const result = await openDialog({
    title: t('actions.title'), width: 760, id: 'actions-dialog',
    body: h('div.actions-dialog', h('div.actions-left', h('div.edit-subhead', t('actions.list')), names), h('div.actions-right', h('div.edit-subhead', t('actions.steps')), steps,
      h('div.actions-run', field(t('batch.suffix'), suffix), h('label.check', overwrite, t('batch.outOverwrite')), runButton))),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), value: 'save', primary: true }],
    onOpen: (box, close) => { submit = (value) => close(value); },
  });
  if (!result) return null;
  saveActions(list);
  if (result === 'run' && list[current]) return runAction(list[current], paths, { suffix: suffix.value, overwrite: overwrite.checked });
  return null;
}
