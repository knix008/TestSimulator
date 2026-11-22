// Design checker: a project checked against a standard — a named set of rules with their parameters, kept as JSON
// (.mmstd) so a company can share it. Each rule looks at one aspect of the parts, assemblies or drawings and reports
// findings { rule, severity, doc, target, args }; many of them can be corrected in place (applyFix).
// The rules that need the modeller (rebuild errors, mate failures) take them from `ctx`; the rest read the project.
// No DOM; the app translates the findings (dc.msg.<rule>, with `args`).
import { analyse } from './sketch.js';
import { baseNameOf, nameKey } from './features.js';
import { STANDARD_SCALES } from './drawing.js';
import { applySheetFormat, ISO_SHEETS, ANSI_SHEETS } from './drawing-annot.js';

export const SEVERITIES = ['error', 'warning', 'info'];
export const CATEGORIES = ['document', 'part', 'assembly', 'drawing'];

// Clearance holes (ISO 273 fine / medium / coarse), tap drills for ISO coarse threads M1.6–M36, and drills in half
// millimetres from 1 to 20: the sizes a "standard hole" may have.
const ISO273 = [1.7, 1.8, 2, 2.2, 2.4, 2.6, 2.9, 3.1, 3.2, 3.4, 3.6, 4.3, 4.5, 4.8, 5.3, 5.5, 5.8, 6.4, 6.6, 7, 8.4, 9, 10, 10.5, 11, 12, 13, 13.5, 14.5, 15, 15.5, 16.5, 17, 17.5, 18.5, 19, 20, 21, 22, 23, 24, 25, 26, 28, 30, 31, 33, 35, 37, 39, 42];
const TAP_DRILLS = [1.25, 1.6, 2.05, 2.5, 2.9, 3.3, 4.2, 5, 6, 6.8, 8.5, 10.2, 12, 14, 15.5, 17.5, 19.5, 21, 24, 26.5, 29.5, 32];
export const STANDARD_HOLES = [...new Set([...ISO273, ...TAP_DRILLS, ...Array.from({ length: 39 }, (_, i) => 1 + i * 0.5)])].sort((a, b) => a - b);

/**
 * The rules: id → { category, severity (default), params (defaults), fix (can be corrected) }.
 * Order is the order of the report.
 */
export const RULES = {
  units: { category: 'document', severity: 'error', params: { units: 'mm' }, fix: true },
  docNames: { category: 'document', severity: 'warning', params: { pattern: '^[A-Za-z0-9가-힣][A-Za-z0-9가-힣 _.()-]*$' } },
  partProps: { category: 'part', severity: 'error', params: { fields: ['partNo', 'description'] } },
  material: { category: 'part', severity: 'warning', params: { materials: [] } },
  suppressed: { category: 'part', severity: 'warning', params: {} },
  rollback: { category: 'part', severity: 'error', params: {}, fix: true },
  rebuild: { category: 'part', severity: 'error', params: {} },
  sketchDefined: { category: 'part', severity: 'warning', params: { allowUnder: false } },
  defaultNames: { category: 'part', severity: 'info', params: { types: ['extrude', 'revolve', 'hole', 'fillet', 'chamfer', 'shell'] } },
  minFillet: { category: 'part', severity: 'error', params: { radius: 0.5, chamfer: 0.3 }, fix: true },
  holeSizes: { category: 'part', severity: 'warning', params: { sizes: STANDARD_HOLES, tolerance: 0.01 }, fix: true },
  fixedComponent: { category: 'assembly', severity: 'error', params: {}, fix: true },
  mates: { category: 'assembly', severity: 'error', params: {} },
  drawingStandard: { category: 'drawing', severity: 'error', params: { standard: 'ISO', projection: 'first' }, fix: true },
  sheetSizes: { category: 'drawing', severity: 'warning', params: { sizes: [...ISO_SHEETS] } },
  titleBlock: { category: 'drawing', severity: 'error', params: { fields: ['drawnBy', 'checkedBy', 'date', 'partNo', 'revision'] }, fix: true },
  revision: { category: 'drawing', severity: 'warning', params: { pattern: '^[A-Z]{1,2}$' }, fix: true },
  dateFormat: { category: 'drawing', severity: 'warning', params: { pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, fix: true },
  viewScale: { category: 'drawing', severity: 'warning', params: { scales: STANDARD_SCALES.slice() }, fix: true },
  dimPrecision: { category: 'drawing', severity: 'warning', params: { max: 2 }, fix: true },
  overriddenDims: { category: 'drawing', severity: 'warning', params: {}, fix: true },
  textHeight: { category: 'drawing', severity: 'warning', params: { min: 2.5 }, fix: true },
  danglingAnnotations: { category: 'drawing', severity: 'error', params: {}, fix: true },
};

/** A standard with every rule on at its defaults. */
export function defaultStandard(name = 'Standard') {
  return { format: 'mymechanics-standard', version: 1, name, rules: Object.fromEntries(Object.entries(RULES).map(([id, r]) => [id, { on: true, severity: r.severity, ...structuredClone(r.params) }])) };
}

/** A standard read from JSON: unknown rules dropped, missing ones and missing parameters filled from the defaults. */
export function normalizeStandard(raw) {
  if (!raw || typeof raw !== 'object' || (raw.format && raw.format !== 'mymechanics-standard')) throw Object.assign(new Error('not a standard'), { code: 'bad-standard' });
  const base = defaultStandard(String(raw.name ?? 'Standard'));
  for (const [id, r] of Object.entries(raw.rules ?? {})) {
    if (!base.rules[id] || !r || typeof r !== 'object') continue;
    const def = base.rules[id];
    for (const [k, v] of Object.entries(r)) {
      if (k === 'on') def.on = v !== false;
      else if (k === 'severity') { if (SEVERITIES.includes(v)) def.severity = v; }
      else if (k in def && (Array.isArray(def[k]) === Array.isArray(v)) && (Array.isArray(v) || typeof v === typeof def[k])) def[k] = v;
    }
  }
  return base;
}

const regex = (src) => { try { return new RegExp(src); } catch { return null; } };
const docRef = (kind, d) => ({ kind, id: d.id, name: d.name });
const precisionOf = (a) => (a.precision == null || a.precision === '' ? null : Number(a.precision));
const TEXT_KINDS = { note: 3.5, drwDim: 3.2, dimension: 3.2 };

/** A standard learnt from a project: its units, the drawing standard / projection / sheet and the dimension precision in use. */
export function learnStandard(project, { name = 'Learnt standard', units = null } = {}) {
  const s = defaultStandard(name);
  if (units) s.rules.units.units = units;
  const d = project.drawings?.[0];
  if (d) {
    const standard = d.format?.standard ?? (d.projection === 'third' ? 'ANSI' : 'ISO');
    s.rules.drawingStandard.standard = standard;
    s.rules.drawingStandard.projection = d.projection ?? (standard === 'ANSI' ? 'third' : 'first');
    s.rules.sheetSizes.sizes = standard === 'ANSI' ? ANSI_SHEETS.map(([, k]) => k) : [...ISO_SHEETS];
    const precisions = project.drawings.flatMap((x) => (x.annotations ?? []).filter((a) => a.kind === 'drwDim').map(precisionOf)).filter((p) => p != null);
    if (precisions.length) s.rules.dimPrecision.max = Math.max(...precisions);
    const filled = Object.entries(d.title ?? {}).filter(([, v]) => String(v ?? '').trim()).map(([k]) => k);
    if (filled.length) s.rules.titleBlock.fields = filled;
  }
  const mats = [...new Set((project.parts ?? []).map((p) => p.material).filter(Boolean))];
  if (mats.length) s.rules.material.materials = mats;
  return s;
}

/**
 * Checks `project` against `standard`. ctx: { units (the document's), rebuildErrors(part) → [{ feature, error }],
 * mateFailures(asm) → [mateId], sketchStatus(sketch) → { under, over } }.
 * Returns { findings, checked: [ruleId], skipped: [ruleId], passed: [ruleId], counts: { error, warning, info } }.
 */
export function runCheck(project, standard, ctx = {}) {
  const S = normalizeStandard(standard);
  const findings = [];
  const add = (rule, doc, target, args = {}) => findings.push({ rule, severity: S.rules[rule].severity, doc, target, args, fixable: Boolean(RULES[rule].fix) && fixApplies(rule, args) });
  const on = (id) => S.rules[id]?.on !== false;
  const P = (id) => S.rules[id];
  const parts = project.parts ?? [], asms = project.assemblies ?? [], drws = project.drawings ?? [];

  if (on('units')) { const u = ctx.units ?? project.units ?? 'mm'; if (u !== P('units').units) add('units', { kind: 'project', id: null, name: project.name }, null, { found: u, want: P('units').units }); }
  if (on('docNames')) {
    const re = regex(P('docNames').pattern);
    if (re) for (const [kind, list] of [['part', parts], ['assembly', asms], ['drawing', drws]]) for (const d of list) if (!re.test(String(d.name ?? ''))) add('docNames', docRef(kind, d), null, { name: d.name });
  }
  for (const part of parts) {
    const doc = docRef('part', part);
    if (on('partProps')) for (const f of P('partProps').fields) if (!String(part[f] ?? part.properties?.[f] ?? '').trim()) add('partProps', doc, null, { field: f });
    if (on('material')) { const list = P('material').materials; if (!part.material || (list.length && !list.includes(part.material))) add('material', doc, null, { found: part.material ?? '', want: list.join(', ') }); }
    const feats = part.features ?? [];
    if (on('suppressed')) for (const f of feats) if (f.suppressed) add('suppressed', doc, { kind: 'feature', id: f.id, name: f.name });
    if (on('rollback') && part.rollback != null) add('rollback', doc, null, { at: part.rollback });
    if (on('rebuild') && ctx.rebuildErrors) for (const e of ctx.rebuildErrors(part) ?? []) add('rebuild', doc, { kind: 'feature', id: e.feature.id, name: e.feature.name }, { error: e.error ?? '' });
    if (on('sketchDefined')) for (const f of feats) {
      if (f.type !== 'sketch' || f.suppressed) continue;
      const st = ctx.sketchStatus ? ctx.sketchStatus(f) : sketchStatus(f);
      if (!st) continue;
      if (st.over) add('sketchDefined', doc, { kind: 'feature', id: f.id, name: f.name }, { state: 'over', count: st.over });
      else if (st.under && !P('sketchDefined').allowUnder) add('sketchDefined', doc, { kind: 'feature', id: f.id, name: f.name }, { state: 'under', count: st.under });
    }
    if (on('defaultNames')) {
      const types = P('defaultNames').types;
      for (const f of feats) {
        if (!types.includes(f.type)) continue;
        const bases = [baseNameOf(f), ctx.localBaseName?.(nameKey(f))].filter(Boolean);
        if (bases.some((b) => new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+$`).test(String(f.name ?? '')))) add('defaultNames', doc, { kind: 'feature', id: f.id, name: f.name });
      }
    }
    if (on('minFillet')) for (const f of feats) {
      if (f.suppressed) continue;
      if (f.type === 'fillet' && Number(f.radius) < P('minFillet').radius) add('minFillet', doc, { kind: 'feature', id: f.id, name: f.name }, { value: Number(f.radius), min: P('minFillet').radius, what: 'radius' });
      if (f.type === 'chamfer' && Number(f.distance) < P('minFillet').chamfer) add('minFillet', doc, { kind: 'feature', id: f.id, name: f.name }, { value: Number(f.distance), min: P('minFillet').chamfer, what: 'distance' });
    }
    if (on('holeSizes')) for (const f of feats) {
      if (f.type !== 'hole' || f.suppressed || f.kind === 'tapped') continue;
      const d = Number(f.diameter), sizes = P('holeSizes').sizes, tol = P('holeSizes').tolerance;
      if (!sizes.some((s) => Math.abs(s - d) <= tol)) add('holeSizes', doc, { kind: 'feature', id: f.id, name: f.name }, { value: d, nearest: nearest(sizes, d) });
    }
  }
  for (const asm of asms) {
    const doc = docRef('assembly', asm);
    if (on('fixedComponent') && (asm.components ?? []).length && !(asm.components ?? []).some((c) => c.fixed)) add('fixedComponent', doc, null, { first: asm.components[0].id });
    if (on('mates') && ctx.mateFailures) for (const id of ctx.mateFailures(asm) ?? []) { const m = asm.mates.find((x) => x.id === id); add('mates', doc, { kind: 'mate', id, name: m?.name ?? id }); }
  }
  for (const d of drws) {
    const doc = docRef('drawing', d);
    const standardOf = d.format?.standard ?? (d.projection === 'third' ? 'ANSI' : 'ISO');
    if (on('drawingStandard')) {
      const want = P('drawingStandard');
      if (standardOf !== want.standard || (d.projection ?? 'third') !== want.projection) add('drawingStandard', doc, null, { found: `${standardOf} / ${d.projection}`, want: `${want.standard} / ${want.projection}`, standard: want.standard, projection: want.projection });
    }
    if (on('sheetSizes') && !P('sheetSizes').sizes.includes(d.sheet)) add('sheetSizes', doc, null, { found: d.sheet, want: P('sheetSizes').sizes.join(', ') });
    const title = d.title ?? {};
    const source = parts.find((p) => p.id === d.source?.id) ?? null;
    if (on('titleBlock')) for (const f of P('titleBlock').fields) if (!String(title[f] ?? '').trim()) add('titleBlock', doc, null, { field: f, fill: fillFor(f, source) });
    if (on('revision') && String(title.revision ?? '').trim()) { const re = regex(P('revision').pattern); if (re && !re.test(String(title.revision))) add('revision', doc, null, { found: title.revision, fix: re.test(String(title.revision).trim().toUpperCase()) ? String(title.revision).trim().toUpperCase() : null }); }
    if (on('dateFormat') && String(title.date ?? '').trim()) { const re = regex(P('dateFormat').pattern); if (re && !re.test(String(title.date))) add('dateFormat', doc, null, { found: title.date, fix: isoDate(title.date) }); }
    if (on('viewScale')) {
      const scales = P('viewScale').scales;
      const check = (s, target) => { if (Number.isFinite(s) && s > 0 && !scales.some((x) => Math.abs(x - s) / x < 1e-6)) add('viewScale', doc, target, { found: scaleText(s), fix: scales.filter((x) => x <= s).sort((a, b) => b - a)[0] ?? Math.min(...scales) }); };
      if (!d.autoScale) check(Number(d.scale), null);
      for (const v of d.views ?? []) if (Number.isFinite(Number(v.scale)) && v.ownScale !== false && v.scale != null) check(Number(v.scale), { kind: 'view', id: v.id, name: v.label ?? v.type ?? v.id });
    }
    const views = new Set((d.views ?? []).map((v) => v.id));
    for (const a of d.annotations ?? []) {
      const target = { kind: 'annotation', id: a.id, name: a.kind === 'drwDim' ? dimName(a) : a.text ?? a.kind };
      if (on('dimPrecision') && a.kind === 'drwDim' && precisionOf(a) != null && precisionOf(a) > P('dimPrecision').max) add('dimPrecision', doc, target, { found: precisionOf(a), max: P('dimPrecision').max });
      if (on('overriddenDims') && a.kind === 'drwDim' && a.text != null && String(a.text) !== '') add('overriddenDims', doc, target, { text: a.text });
      if (on('textHeight') && a.kind in TEXT_KINDS) { const h = Number(a.size) > 0 ? Number(a.size) : TEXT_KINDS[a.kind]; if (h < P('textHeight').min) add('textHeight', doc, target, { found: h, min: P('textHeight').min }); }
      if (on('danglingAnnotations') && a.view != null && !views.has(a.view)) add('danglingAnnotations', doc, target, { view: a.view });
    }
  }
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  // Rules that need the modeller and were not given it are skipped, not passed.
  const skipped = [...(!ctx.rebuildErrors ? ['rebuild'] : []), ...(!ctx.mateFailures ? ['mates'] : [])].filter(on);
  const checked = Object.keys(RULES).filter((r) => on(r) && !skipped.includes(r));
  const failed = new Set(findings.map((f) => f.rule));
  return { standard: S.name, findings, checked, skipped, passed: checked.filter((r) => !failed.has(r)), counts };
}

/** Whether a finding of `rule` with these args can be corrected (some only when a value to use is known). */
function fixApplies(rule, args) {
  if (rule === 'titleBlock') return args.fill != null;
  if (rule === 'revision' || rule === 'dateFormat') return args.fix != null;
  return true;
}

const nearest = (list, v) => list.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), list[0]);
const scaleText = (s) => (s >= 1 ? `${+s.toFixed(4)}:1` : `1:${+(1 / s).toFixed(4)}`);
const dimName = (a) => `${a.dtype ?? 'dim'}${a.id ? ` ${a.id.slice(-4)}` : ''}`;
function fillFor(field, source) {
  if (field === 'date') return new Date().toISOString().slice(0, 10);
  if (field === 'partNo' && source?.partNo) return source.partNo;
  if (field === 'revision') return 'A';
  return null;
}
/** A date in another common form (YYYY.MM.DD, YYYY/MM/DD, DD.MM.YYYY) as YYYY-MM-DD, or null. */
function isoDate(text) {
  const s = String(text).trim();
  let m = s.match(/^(\d{4})[./ ](\d{1,2})[./ ](\d{1,2})\.?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Under- and over-defined entity counts of a sketch as saved (construction geometry not counted). */
export function sketchStatus(sketch) {
  try {
    const r = analyse(structuredClone(sketch));
    const real = (sketch.entities ?? []).filter((e) => !e.construction && e.type !== 'point' && e.type !== 'text');
    const values = real.map((e) => r.status?.[e.id]);
    return { under: values.filter((v) => v === 'under').length, over: r.over ? Math.max(1, values.filter((v) => v === 'over').length) : 0, dof: r.dof };
  } catch { return null; }
}

/** Corrects one finding in `project` (mutates). Returns true when something changed. `ctx.setUnits(u)` for units. */
export function applyFix(project, finding, ctx = {}) {
  const { rule, doc, target, args } = finding;
  const list = { part: project.parts, assembly: project.assemblies, drawing: project.drawings }[doc?.kind] ?? [];
  const d = list?.find((x) => x.id === doc.id);
  const feat = target?.kind === 'feature' ? d?.features?.find((f) => f.id === target.id) : null;
  const ann = target?.kind === 'annotation' ? d?.annotations?.find((a) => a.id === target.id) : null;
  switch (rule) {
    case 'units': if (ctx.setUnits) { ctx.setUnits(args.want); project.units = args.want; return true; } project.units = args.want; return true;
    case 'rollback': if (d) { d.rollback = null; return true; } return false;
    case 'minFillet': if (feat) { if (args.what === 'radius') feat.radius = args.min; else feat.distance = args.min; return true; } return false;
    case 'holeSizes': if (feat) { feat.diameter = args.nearest; return true; } return false;
    case 'fixedComponent': { const c = d?.components?.find((x) => x.id === args.first); if (c) { c.fixed = true; return true; } return false; }
    case 'drawingStandard': if (d) { applySheetFormat(d, { standard: args.standard, projection: args.projection, sheet: d.sheet, zones: d.format?.zones !== false }); return true; } return false;
    case 'titleBlock': if (d && args.fill != null) { d.title = { ...(d.title ?? {}), [args.field]: args.fill }; return true; } return false;
    case 'revision': case 'dateFormat': if (d && args.fix != null) { d.title = { ...(d.title ?? {}), [rule === 'revision' ? 'revision' : 'date']: args.fix }; return true; } return false;
    case 'viewScale': if (!d) return false; if (target?.kind === 'view') { const v = d.views.find((x) => x.id === target.id); if (!v) return false; v.scale = args.fix; return true; } d.scale = args.fix; return true;
    case 'dimPrecision': if (ann) { ann.precision = args.max; return true; } return false;
    case 'overriddenDims': if (ann) { delete ann.text; return true; } return false;
    case 'textHeight': if (ann) { ann.size = args.min; return true; } return false;
    case 'danglingAnnotations': if (d && ann) { d.annotations = d.annotations.filter((a) => a !== ann); return true; } return false;
    default: return false;
  }
}

/** Corrects every fixable finding; returns how many changed. */
export function applyAllFixes(project, findings, ctx = {}) {
  let n = 0;
  // Deletions last, so the ids of the other findings stay valid.
  const order = [...findings].filter((f) => f.fixable).sort((a, b) => (a.rule === 'danglingAnnotations') - (b.rule === 'danglingAnnotations'));
  for (const f of order) if (applyFix(project, f, ctx)) n++;
  return n;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * A stand-alone HTML report. `text(finding)` the translated message, `labels`: { title, project, standard, date,
 * severity: { error, warning, info }, rule: (id) → name, ruleHeader, passed, none, doc, item, message }.
 */
export function reportHtml(result, { project = '', text = (f) => f.rule, labels = {} } = {}) {
  const L = { title: 'Design check', project: 'Project', standard: 'Standard', date: 'Date', passed: 'Passed rules', none: 'No findings.', ruleHeader: 'Rule', doc: 'Document', item: 'Item', message: 'Finding', rule: (id) => id, severity: { error: 'Error', warning: 'Warning', info: 'Info' }, ...labels };
  const colour = { error: '#b91c1c', warning: '#b45309', info: '#1d4ed8' };
  const rows = result.findings.map((f) => `<tr><td style="color:${colour[f.severity]};font-weight:600">${esc(L.severity[f.severity])}</td><td>${esc(L.rule(f.rule))}</td><td>${esc(f.doc?.name ?? '')}</td><td>${esc(f.target?.name ?? '')}</td><td>${esc(text(f))}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(L.title)} — ${esc(project)}</title><style>body{font:14px system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f3f4f6}.sum span{margin-right:16px}</style></head><body>
<h1>${esc(L.title)}</h1><p>${esc(L.project)}: <b>${esc(project)}</b> · ${esc(L.standard)}: <b>${esc(result.standard)}</b> · ${esc(L.date)}: ${new Date().toISOString().slice(0, 10)}</p>
<p class="sum">${SEVERITIES.map((s) => `<span style="color:${colour[s]}">${esc(L.severity[s])}: <b>${result.counts[s]}</b></span>`).join('')}</p>
${result.findings.length ? `<table><thead><tr><th></th><th>${esc(L.ruleHeader)}</th><th>${esc(L.doc)}</th><th>${esc(L.item)}</th><th>${esc(L.message)}</th></tr></thead><tbody>${rows}</tbody></table>` : `<p>${esc(L.none)}</p>`}
<h2>${esc(L.passed)}</h2><ul>${result.passed.map((r) => `<li>${esc(L.rule(r))}</li>`).join('')}</ul></body></html>`;
}

