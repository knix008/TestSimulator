// PropertyManager of the OpenSCAD feature: the Customizer (the program's parameters as sliders, fields,
// drop-downs and switches, grouped by its tabs), the source (edited in place, applied when the field is left or
// with Ctrl+Enter), the files it uses, and what it printed (echo) or warned the last time it ran.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { scadParams, scadReport } from '../cad/openscad-feature.js';
import { toStr } from '../cad/openscad/values.js';
import { group } from './propertymanager.js';

const literal = (v) => toStr(v, false);

function paramRow(p) {
  const name = escapeHtml(p.name);
  const label = `<span class="pm-label" title="${escapeHtml(p.description || p.name)}">${escapeHtml(p.name)}</span>`;
  const v = p.current;
  if (p.options) {
    const opts = p.options.map((o) => `<option value="${escapeHtml(JSON.stringify(o.value))}" ${JSON.stringify(o.value) === JSON.stringify(v) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
    return `<label class="pm-field scad-param">${icon('list')}${label}<select data-scad-param="${name}" data-kind="json">${opts}</select></label>`;
  }
  if (p.kind === 'bool') return `<label class="pm-check scad-param"><input type="checkbox" data-scad-param="${name}" data-kind="bool" ${v ? 'checked' : ''}/>${icon('check')}<span title="${escapeHtml(p.description || p.name)}">${escapeHtml(p.name)}</span></label>`;
  if (p.kind === 'number' && p.min != null && p.max != null) {
    const step = p.step ?? (Number.isInteger(p.min) && Number.isInteger(p.max) && Number.isInteger(p.value) ? 1 : (p.max - p.min) / 100);
    return `<label class="pm-field scad-param">${icon('smartDim')}${label}<input type="range" min="${p.min}" max="${p.max}" step="${step}" value="${Number(v)}" data-scad-param="${name}" data-kind="number"/></label>`;
  }
  if (p.kind === 'number') return `<label class="pm-field scad-param">${icon('smartDim')}${label}<input type="text" class="pm-text short" data-scad-param="${name}" data-kind="number" value="${escapeHtml(String(v))}" spellcheck="false"/></label>`;
  if (p.kind === 'string') return `<label class="pm-field scad-param">${icon('textTool')}${label}<input type="text" class="pm-text" data-scad-param="${name}" data-kind="string" value="${escapeHtml(String(v))}" ${p.maxLength ? `maxlength="${p.maxLength}"` : ''} spellcheck="false"/></label>`;
  return `<label class="pm-field scad-param">${icon('list')}${label}<input type="text" class="pm-text" data-scad-param="${name}" data-kind="vector" value="${escapeHtml(literal(v))}" spellcheck="false"/></label>`;
}

export function openscadPm(api, f) {
  const { t } = api;
  const out = [];
  const params = scadParams(f);
  if (params.length) {
    const groups = new Map();
    for (const p of params) { if (!groups.has(p.group)) groups.set(p.group, []); groups.get(p.group).push(p); }
    const body = [...groups].map(([g, list]) => `${groups.size > 1 ? `<h4 class="scad-tab">${escapeHtml(g)}</h4>` : ''}${list.map(paramRow).join('')}`).join('');
    const changed = Object.keys(f.overrides ?? {}).length;
    out.push(group('configurations', t('scad.customizer'), `${body}<div class="pm-row"><button type="button" class="small-button" data-pm="scadReset" ${changed ? '' : 'disabled'}>${icon('rollback')}<span>${escapeHtml(t('scad.reset'))}</span></button></div>`));
  }
  const files = Object.keys(f.files ?? {});
  out.push(group('scadFile', t('scad.source'), `<p class="pm-note">${icon('scadFile', 'icon tiny')} ${escapeHtml(f.fileName || 'model.scad')}${files.length ? ` · ${escapeHtml(t('scad.files', { count: files.length }))}` : ''}</p>
    <textarea class="scad-code" data-scad-source spellcheck="false" wrap="off" rows="14" aria-label="${escapeHtml(t('scad.source'))}">${escapeHtml(f.source ?? '')}</textarea>
    <p class="pm-note">${escapeHtml(t('scad.sourceHelp'))}</p>
    ${files.length ? `<ul class="scad-files">${files.map((k) => `<li>${icon('file', 'icon tiny')}<span>${escapeHtml(k)}</span></li>`).join('')}</ul>` : ''}`));
  const report = scadReport(f);
  if (report?.missing?.length) {
    out.push(group('warning', t('scad.missingTitle'), `<ul class="scad-files">${report.missing.map((k) => `<li class="warn">${icon('warning', 'icon tiny')}<span>${escapeHtml(k)}</span></li>`).join('')}</ul><p class="pm-note">${escapeHtml(t('scad.missingHelp'))}</p><div class="pm-row"><button type="button" class="small-button" data-pm="scadFolder">${icon('folderOpen')}<span>${escapeHtml(t('scad.chooseFolder'))}</span></button></div>`));
  }
  if (report) {
    const lines = [
      ...(report.error ? [`<li class="error">${icon('error', 'icon tiny')}<span>${escapeHtml(report.error)}</span></li>`] : []),
      ...(report.echoes ?? []).map((l) => `<li>${icon('chevronRight', 'icon tiny')}<span>${escapeHtml(l)}</span></li>`),
      ...(report.warnings ?? []).map((l) => `<li class="warn">${icon('warning', 'icon tiny')}<span>${escapeHtml(l)}</span></li>`),
    ];
    const stats = report.triangles ? `<p class="pm-note">${escapeHtml(t('scad.triangles', { count: report.triangles }))}</p>` : '';
    out.push(group('info', t('scad.console'), `${stats}${lines.length ? `<ul class="scad-console">${lines.join('')}</ul>` : `<p class="pm-note">${escapeHtml(t('scad.quiet'))}</p>`}`));
  }
  return out.join('');
}
