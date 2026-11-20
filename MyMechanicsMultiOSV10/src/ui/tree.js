// The FeatureManager design tree (left panel): the part's planes, origin and features in build order,
// each sketch under the feature that uses it, failed features in red, under defined sketches with "(-)",
// the rollback bar; an assembly's components ("(f)" fixed, "(-)" free to move) and mates; a drawing's
// sheet and views. HTML only — app.js binds the data-* attributes.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { nameKey } from '../cad/features.js';
import { materialName } from '../cad/materials.js';

export const FEATURE_ICONS = {
  import: 'stepFile',
  sketch: 'featSketch', plane: 'refPlane', 'boss-extrude': 'featExtrude', 'cut-extrude': 'featCut', 'boss-revolve': 'featRevolve', 'cut-revolve': 'featCutRevolve',
  fillet: 'featFillet', chamfer: 'featChamfer', shell: 'featShell', hole: 'featHole', linearPattern: 'featLinPattern', circularPattern: 'featCirPattern', mirror: 'featMirror',
};
export const featureIcon = (f) => FEATURE_ICONS[nameKey(f)] ?? 'part';
export const MATE_ICONS = { coincident: 'mateCoincident', concentric: 'mateConcentric', distance: 'mateDistance', parallel: 'mateParallel', perpendicular: 'matePerpendicular', angle: 'mateAngle' };

const row = ({ key, glyph, label, depth = 0, cls = '', toggle = null, open = true, extra = '', title = '' }) => `<div class="tree-row ${cls}" data-tree="${escapeHtml(key)}" style="--depth:${depth}" title="${escapeHtml(title || label)}" role="treeitem" tabindex="-1">
  <span class="tree-toggle">${toggle ? `<button class="tree-twisty" data-tree-toggle="${escapeHtml(toggle)}" aria-label="toggle">${icon(open ? 'caretDown' : 'caretRight', 'icon tiny')}</button>` : ''}</span>
  ${icon(glyph)}<span class="tree-label">${label}</span>${extra}</div>`;

/** The tree of the active document. `api`: { t, lang, project, active (doc), kind, build (part results), selection keys, collapsed, sketchStatus(id) }. */
export function treeHtml(api) {
  if (api.kind === 'part') return partTree(api);
  if (api.kind === 'assembly') return assemblyTree(api);
  if (api.kind === 'drawing') return drawingTree(api);
  return '';
}

const selected = (api, key) => (api.selection.has(key) ? 'selected' : '');

function partTree(api) {
  const { t } = api;
  const part = api.doc;
  const results = api.build?.results ?? new Map();
  const rollback = part.rollback ?? part.features.length;
  const used = new Set(part.features.map((f) => f.sketch).filter(Boolean));
  const out = [];
  out.push(row({ key: 'doc', glyph: 'part', label: `<b>${escapeHtml(part.name)}</b>`, cls: `tree-root ${selected(api, 'doc')}` }));
  out.push(row({ key: 'material', glyph: 'material', label: escapeHtml(`${t('tree.material')} <${materialName(part.material, api.lang)}>`), depth: 1, cls: selected(api, 'material') }));
  for (const [id, glyph] of [['front', 'planeFront'], ['top', 'planeTop'], ['right', 'planeRight']]) {
    out.push(row({ key: `plane:${id}`, glyph, label: escapeHtml(t(`plane.${id}`)), depth: 1, cls: `${selected(api, `plane:${id}`)} ${api.hiddenPlanes?.has(id) ? 'hidden-item' : ''}` }));
  }
  out.push(row({ key: 'origin', glyph: 'origin', label: escapeHtml(t('tree.origin')), depth: 1, cls: selected(api, 'origin') }));
  part.features.forEach((f, i) => {
    if (i === rollback) out.push(rollbackRow(t));
    if (f.type === 'sketch' && used.has(f.id)) return;
    const child = f.sketch ? part.features.find((x) => x.id === f.sketch) : null;
    out.push(featureRow(api, f, results.get(f.id), i >= rollback, child ? `f:${f.id}` : null));
    if (child && !api.collapsed.has(`f:${f.id}`)) out.push(featureRow(api, child, results.get(child.id), i >= rollback, null, 2));
  });
  if (rollback >= part.features.length) out.push(rollbackRow(t));
  return `<div class="tree" role="tree">${out.join('')}</div>`;
}

function rollbackRow(t) {
  return `<div class="tree-rollback" data-rollback-bar title="${escapeHtml(t('tree.rollbackTip'))}" role="separator"><span class="rollback-grip">${icon('rollback', 'icon tiny')}</span><span class="rollback-line"></span></div>`;
}

function featureRow(api, f, r, rolled, toggle, depth = 1) {
  const { t } = api;
  let prefix = '';
  if (f.type === 'sketch') {
    const st = api.sketchStatus?.(f);
    if (st === 'under') prefix = '(-) ';
    else if (st === 'over') prefix = '(+) ';
  }
  const failed = r && r.ok === false;
  const cls = ['tree-feature', selected(api, `feat:${f.id}`), failed ? 'error' : '', f.suppressed ? 'suppressed' : '', rolled ? 'rolled' : '', api.editingId === f.id ? 'editing' : ''].join(' ');
  const badge = failed ? `<span class="tree-badge error" title="${escapeHtml(t(`rebuild.${r.error}`, null, r.error))}">${icon('error', 'icon tiny')}</span>` : '';
  const title = failed ? `${f.name} — ${t(`rebuild.${r.error}`, null, r.error)}` : f.name;
  return row({ key: `feat:${f.id}`, glyph: featureIcon(f), label: `${escapeHtml(prefix)}${escapeHtml(f.name)}`, depth, cls, toggle, open: !api.collapsed.has(toggle), extra: badge, title });
}

function assemblyTree(api) {
  const { t } = api;
  const asm = api.doc;
  const out = [];
  out.push(row({ key: 'doc', glyph: 'assembly', label: `<b>${escapeHtml(asm.name)}</b>`, cls: `tree-root ${selected(api, 'doc')}` }));
  for (const [id, glyph] of [['front', 'planeFront'], ['top', 'planeTop'], ['right', 'planeRight']]) out.push(row({ key: `plane:${id}`, glyph, label: escapeHtml(t(`plane.${id}`)), depth: 1, cls: selected(api, `plane:${id}`) }));
  out.push(row({ key: 'origin', glyph: 'origin', label: escapeHtml(t('tree.origin')), depth: 1 }));
  for (const c of asm.components) {
    const st = api.mateStatus?.get(c.id);
    const prefix = c.fixed ? '(f) ' : st === 'defined' ? '' : '(-) ';
    const part = api.project.parts.find((p) => p.id === c.part);
    const failed = !part;
    out.push(row({ key: `comp:${c.id}`, glyph: 'part', label: `${escapeHtml(prefix)}${escapeHtml(c.name)}`, depth: 1, cls: `${selected(api, `comp:${c.id}`)} ${c.hidden ? 'hidden-item' : ''} ${failed ? 'error' : ''}`, title: part ? `${c.name} — ${part.name}` : c.name }));
  }
  const failedMates = api.failedMates ?? new Set();
  out.push(row({ key: 'mates', glyph: 'mate', label: escapeHtml(`${t('tree.mates')} (${asm.mates.length})`), depth: 1, toggle: 'mates', open: !api.collapsed.has('mates'), cls: failedMates.size ? 'warn' : '' }));
  if (!api.collapsed.has('mates')) {
    for (const m of asm.mates) {
      const a = asm.components.find((c) => c.id === m.a.comp)?.name ?? '?';
      const b = asm.components.find((c) => c.id === m.b.comp)?.name ?? '?';
      const label = `${m.name || t(`mate.${m.type}`)} (${a}, ${b})`;
      out.push(row({ key: `mate:${m.id}`, glyph: MATE_ICONS[m.type] ?? 'mate', label: escapeHtml(label), depth: 2, cls: `${selected(api, `mate:${m.id}`)} ${failedMates.has(m.id) ? 'error' : ''} ${m.suppressed ? 'suppressed' : ''}` }));
    }
  }
  return `<div class="tree" role="tree">${out.join('')}</div>`;
}

function drawingTree(api) {
  const { t } = api;
  const d = api.doc;
  const out = [];
  out.push(row({ key: 'doc', glyph: 'drawing', label: `<b>${escapeHtml(d.name)}</b>`, cls: `tree-root ${selected(api, 'doc')}` }));
  out.push(row({ key: 'sheet', glyph: 'sheet', label: escapeHtml(`${t('tree.sheet')} (${d.sheet})`), depth: 1, toggle: 'sheet', open: !api.collapsed.has('sheet') }));
  if (!api.collapsed.has('sheet')) {
    for (const v of d.views) out.push(row({ key: `view:${v.id}`, glyph: v.type === 'iso' || v.type === 'dimetric' ? 'isoView' : 'drawingView', label: escapeHtml(t(`view.${v.type}`)), depth: 2, cls: selected(api, `view:${v.id}`) }));
  }
  const src = d.source?.kind === 'assembly' ? api.project.assemblies.find((a) => a.id === d.source.id) : api.project.parts.find((p) => p.id === d.source?.id);
  out.push(row({ key: 'source', glyph: d.source?.kind === 'assembly' ? 'assembly' : 'part', label: escapeHtml(`${t('tree.source')}: ${src?.name ?? '—'}`), depth: 1, cls: src ? '' : 'error' }));
  return `<div class="tree" role="tree">${out.join('')}</div>`;
}
