// The simulation app's part of the popups (run inside popup.js, which supplies the frame and the
// controls through `api`): Settings › Simulation — units, result display, meshing and animation.

export function renderCadSettings(api) {
  const { row, toggle, segmented, numberField, t, s, escapeHtml, icon } = api;
  const set = s();
  return [
    `<h3 class="section-title">${icon('units')}${escapeHtml(t('settings.sectionUnits'))}</h3>`,
    row('units', t('settings.unitSystem'), segmented('unitSystem', [['mm', t('units.mm'), 'units'], ['si', t('units.si'), 'units']], set.unitSystem ?? 'mm')),
    `<h3 class="section-title">${icon('palette')}${escapeHtml(t('settings.sectionResults'))}</h3>`,
    row('palette', t('res.colormap'), segmented('colormap', ['rainbow', 'viridis', 'coolwarm', 'thermal', 'grayscale'].map((c) => [c, t(`cmap.${c}`), 'palette']), set.colormap ?? 'rainbow')),
    row('bands', t('res.bands'), segmented('contourBands', [[0, t('opt.smooth'), 'bands'], [8, '8', 'bands'], [12, '12', 'bands'], [16, '16', 'bands']], Number(set.contourBands ?? 0))),
    row('deform', t('res.deformation'), segmented('deformScale', [['auto', t('opt.autoScale'), 'deform'], ['true', t('opt.trueScale'), 'deform'], ['undeformed', t('opt.undeformed'), 'deform']], set.deformScale ?? 'auto')),
    toggle('showUndeformed', t('cmd.showUndeformed'), 'deform'),
    toggle('showMaxMin', t('cmd.showMaxMin'), 'maxMin'),
    row('play', t('settings.animFps'), numberField('animFps', set.animFps ?? 18, 4, 60, 1, 'fps', t('settings.animFps'))),
    row('opacity', t('settings.sliceOpacity'), numberField('sliceOpacity', set.sliceOpacity ?? 85, 10, 100, 5, '%', t('settings.sliceOpacity'))),
    `<h3 class="section-title">${icon('mesh')}${escapeHtml(t('settings.sectionMesh'))}</h3>`,
    row('order', t('mesh.order'), segmented('defaultOrder', [[1, t('mesh.linear'), 'meshLinear'], [2, t('mesh.quadratic'), 'meshQuadratic']], Number(set.defaultOrder ?? 2))),
    `<h3 class="section-title">${icon('geometry')}${escapeHtml(t('settings.sectionView'))}</h3>`,
    toggle('perspectiveView', t('view.perspective'), 'perspective'),
    row('styleShaded', t('settings.displayStyle'), segmented('displayStyle', [['shadedEdges', t('style.shadedEdges'), 'styleShaded'], ['shaded', t('style.shaded'), 'styleWhite'], ['mesh', t('style.mesh'), 'mesh'], ['wireframe', t('style.wireframe'), 'styleWireframe']], set.displayStyle ?? 'shadedEdges')),
  ].join('');
}

export function renderCadPopup() { return false; }
export function cadPopupAction() { return false; }
export function cadHostMessage() { return false; }
