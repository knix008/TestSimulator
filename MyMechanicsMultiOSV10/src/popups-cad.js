// The CAD app's own popups (run inside popup.js, which supplies the frame and controls through
// `api`): Settings › Modeling, the Mass Properties window and the Interference Detection results.

/** Settings › Modeling: units, sketching, display and navigation. */
export function renderCadSettings(api) {
  const { row, toggle, segmented, numberField, t, s, escapeHtml, icon } = api;
  const set = s();
  return [
    `<h3 class="section-title">${icon('units')}${escapeHtml(t('settings.sectionModel'))}</h3>`,
    row('units', t('settings.units'), segmented('units', [['mm', 'mm'], ['cm', 'cm'], ['in', 'in']], set.units)),
    row('smartDim', t('settings.decimals'), numberField('decimals', set.decimals ?? 2, 0, 6, 1, '', t('settings.decimals'))),
    toggle('snapToGrid', t('settings.snapGrid'), 'grid'),
    toggle('autoRelations', t('settings.autoRelations'), 'addRelation'),
    toggle('editDimOnCreate', t('settings.editDimOnCreate'), 'smartDim'),
    row('drawing', t('settings.projection'), segmented('projection', [['third', t('drawing.third')], ['first', t('drawing.first')]], set.projection ?? 'third')),
    `<h3 class="section-title">${icon('styleShaded')}${escapeHtml(t('settings.sectionDisplay'))}</h3>`,
    row('styleShaded', t('settings.displayStyle'), segmented('displayStyle', [['shadedEdges', t('style.shadedEdges'), 'styleShaded'], ['shaded', t('style.shaded'), 'styleWhite'], ['hiddenRemoved', t('style.hiddenRemoved'), 'styleHidden'], ['wireframe', t('style.wireframe'), 'styleWireframe']], set.displayStyle ?? 'shadedEdges')),
    toggle('showPlanes', t('settings.showPlanes'), 'refPlane'),
    toggle('showOrigin', t('settings.showOrigin'), 'origin'),
    toggle('showSketches', t('settings.showSketches'), 'featSketch'),
    toggle('perspectiveView', t('settings.perspective'), 'perspective'),
    row('quality', t('settings.meshQuality'), segmented('meshQuality', [['coarse', t('quality.low')], ['normal', t('quality.medium')], ['fine', t('quality.high')]], set.meshQuality ?? 'normal')),
    toggle('modelledThreads', t('settings.modelledThreads'), 'featThread'),
    `<h3 class="section-title">${icon('orbitTool')}${escapeHtml(t('settings.sectionNavigation'))}</h3>`,
    row('info', '', `<span class="muted">${escapeHtml(t('settings.mouseHelp'))}</span>`),
    toggle('invertZoom', t('settings.invertZoom'), 'zoomTool'),
  ].join('');
}

const fmt = (v, d = 3) => (Number.isFinite(v) ? Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) }) : '—');

export function renderCadPopup(kind, api) {
  const { t, escapeHtml, icon, frame, button, P, root } = api;
  if (kind === 'massprops') {
    const p = P();
    const rows = (p.rows ?? []).map(([glyph, label, value]) => `<dt title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join('');
    root.innerHTML = frame({
      glyph: 'massProps', title: t('mass.title'),
      body: `<div class="about mass-props">
        <div class="mass-head">${icon(p.kind === 'assembly' ? 'assembly' : 'part', 'icon big')}<div><div class="about-name">${escapeHtml(p.name ?? '')}</div><div class="muted">${escapeHtml(p.material ?? '')}</div></div></div>
        <dl class="about-table">${rows}</dl>
        <p class="muted hint">${escapeHtml(t('mass.note'))}</p>
      </div>`,
      foot: `${button('copy-mass', t('action.copy'), 'copy')}<span class="grow"></span>${button('close', t('common.done'), 'check', 'primary')}`,
    });
    api.fitHeight();
    api.ready();
    return true;
  }
  if (kind === 'interference') {
    const p = P();
    const list = p.items ?? [];
    root.innerHTML = frame({
      glyph: 'interference', title: t('interference.title'),
      body: `<div class="confirm">
        <div class="confirm-message">${icon(list.length ? 'warning' : 'check', 'icon big')}<p>${escapeHtml(list.length ? t('interference.found', { count: list.length }) : t('interference.none'))}</p></div>
        ${list.length ? `<ul class="confirm-items">${list.slice(0, 12).map((it) => `<li title="${escapeHtml(`${it.a} ↔ ${it.b}`)}">${icon('interference')}<span>${escapeHtml(`${it.a} ↔ ${it.b}`)} — ${escapeHtml(fmt(it.volume))} mm³</span></li>`).join('')}</ul>` : ''}
      </div>`,
      foot: `<span class="grow"></span>${button('close', t('common.done'), 'check', 'primary')}`,
    });
    api.fitHeight();
    api.ready();
    return true;
  }
  return false;
}

export function cadPopupAction(kind, target, api, type = 'click') {
  if (type !== 'click') return false;
  if (kind === 'massprops' && target.dataset?.action === 'copy-mass') {
    const text = (api.P().rows ?? []).map(([, label, value]) => `${label}\t${value}`).join('\n');
    api.action('copy-text', { text });
    return true;
  }
  return false;
}

export const cadHostMessage = () => false;
