// The simulation app's part of the popups (run inside popup.js, which supplies the frame and the
// controls through `api`): Settings › Simulation — units, result display, meshing and animation.

import { SYSTEMS as UNIT_SYSTEMS } from './sim/units.js';

export function renderCadSettings(api) {
  const { row, toggle, numberField, t, s, escapeHtml, icon } = api;
  const set = s();
  const left = [
    `<h3 class="section-title">${icon('units')}${escapeHtml(t('settings.sectionUnits'))}</h3>`,
    row('units', t('settings.unitSystem'), api.select('data-select', 'unitSystem', UNIT_SYSTEMS.map((k) => [k, t(`units.${k}`)]), set.unitSystem ?? 'mm', t('settings.unitSystem'))),
    `<h3 class="section-title">${icon('palette')}${escapeHtml(t('settings.sectionResults'))}</h3>`,
    row('palette', t('res.colormap'), api.select('data-select', 'colormap', ['rainbow', 'viridis', 'coolwarm', 'thermal', 'grayscale'].map((c) => [c, t(`cmap.${c}`)]), set.colormap ?? 'rainbow', t('res.colormap'))),
    row('bands', t('res.bands'), api.select('data-select', 'contourBands', [[0, t('opt.smooth')], [8, '8'], [12, '12'], [16, '16']], Number(set.contourBands ?? 0), t('res.bands'))),
    row('deform', t('res.deformation'), api.select('data-select', 'deformScale', [['auto', t('opt.autoScale')], ['true', t('opt.trueScale')], ['undeformed', t('opt.undeformed')]], set.deformScale ?? 'auto', t('res.deformation'))),
    toggle('showUndeformed', t('cmd.showUndeformed'), 'deform'),
    toggle('showMaxMin', t('cmd.showMaxMin'), 'maxMin'),
    row('play', t('settings.animFps'), numberField('animFps', set.animFps ?? 18, 4, 60, 1, 'fps', t('settings.animFps'))),
    row('opacity', t('settings.sliceOpacity'), numberField('sliceOpacity', set.sliceOpacity ?? 85, 10, 100, 5, '%', t('settings.sliceOpacity'))),
  ].join('');
  const right = [
    `<h3 class="section-title">${icon('mesh')}${escapeHtml(t('settings.sectionMesh'))}</h3>`,
    row('order', t('mesh.order'), api.select('data-select', 'defaultOrder', [[1, t('mesh.linear')], [2, t('mesh.quadratic')]], Number(set.defaultOrder ?? 2), t('mesh.order'))),
    `<h3 class="section-title">${icon('geometry')}${escapeHtml(t('settings.sectionView'))}</h3>`,
    toggle('perspectiveView', t('view.perspective'), 'perspective'),
    `<h3 class="section-title">${icon('cursor')}${escapeHtml(t('settings.sectionPick'))}</h3>`,
    toggle('pickReplace', t('settings.pickReplace'), 'cursor'),
    toggle('showAllBcs', t('settings.showAllBcs'), 'bcForce'),
    toggle('showProbes', t('cmd.showProbes'), 'probe'),
    toggle('showArrows', t('cmd.showArrows'), 'arrowField'),
    row('arrowField', t('res.arrowCount'), numberField('arrowCount', set.arrowCount ?? 300, 20, 3000, 20, '', t('res.arrowCount'))),
    row('styleShaded', t('settings.displayStyle'), api.select('data-select', 'displayStyle', [['shadedEdges', t('style.shadedEdges')], ['shaded', t('style.shaded')], ['mesh', t('style.mesh')], ['wireframe', t('style.wireframe')]], set.displayStyle ?? 'shadedEdges', t('settings.displayStyle'))),
  ].join('');
  // Two columns side by side: the page fits the fixed settings window without scrolling or clipping.
  return `<div class="settings-two"><div class="settings-col">${left}</div><div class="settings-col">${right}</div></div>`;
}

export function renderCadPopup() { return false; }
export function cadPopupAction() { return false; }
export function cadHostMessage() { return false; }
