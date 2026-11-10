// HTML of the side panels: the library and material browsers and the tool
// palette (left), the outliner and the editors — Entity Info, Materials, Tags,
// Scenes, Styles, Shadows, Levels (right). Pure string builders; app.js binds
// the data-* attributes they emit.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { CATEGORIES, catalogItem, categoryCounts, itemName, itemParams, searchItems } from '../library/catalog.js';
import { MATERIAL_CATEGORIES, MATERIAL_PRESETS, customMaterials, presetOf } from '../engine/materials.js';
import { formatArea, formatLength, polygonArea, roomArea, toUnits, wallHeight } from '../engine/document.js';
import { wallLength } from '../engine/walls.js';
import { curveChain, curveInfo } from '../engine/planedit.js';
import { doorSideRooms } from '../engine/doorswing.js';
import { STYLE_MODES } from '../engine/viewport.js';

const L = () => getLanguage();
const name = (o) => (L() === 'ko' ? o.ko ?? o.en : o.en ?? o.ko);
const attr = escapeHtml;

/** The tool palette (SketchUp's Large Tool Set), grouped; `active` = current tool id. */
export const TOOL_GROUPS = [
  ['groupSelect', ['select', 'eraser', 'paint']],
  ['groupInterior', ['wall', 'column', 'stairs', 'room', 'door', 'window']],
  ['groupDraw', ['line', 'rectangle', 'circle', 'arc', 'polygon', 'freehand']],
  ['groupModify', ['pushpull', 'move', 'rotate', 'scale', 'offset', 'followme']],
  ['groupConstruct', ['tape', 'dimension', 'protractor', 'text', 'section', 'axes']],
  ['groupCamera', ['orbit', 'pan', 'zoom', 'zoomExtents', 'walk', 'lookAround']],
];

export function paletteHtml(app, compact = false) {
  return `<div class="tool-palette ${compact ? 'compact' : ''}">${TOOL_GROUPS.map(([group, ids]) => `<div class="palette-group" title="${attr(t(`palette.${group}`))}">${ids.map((id) => {
    const command = app.commands[`tool:${id}`] ?? app.commands[id];
    if (!command) return '';
    const active = app.state.tool === id || (id === 'door' && app.state.placeCategory === 'doors') || (id === 'window' && app.state.placeCategory === 'windows');
    return `<button class="palette-button ${active ? 'active' : ''}" data-command="${app.commands[`tool:${id}`] ? `tool:${id}` : id}" title="${attr(app.commandTip(app.commands[`tool:${id}`] ? `tool:${id}` : id))}" aria-pressed="${active}">${icon(command.icon)}<span>${escapeHtml(t(command.label))}</span></button>`;
  }).join('')}</div>`).join('')}</div>`;
}

// ───────────────────────── library

export function libraryHtml(app) {
  const s = app.state;
  const counts = categoryCounts();
  const cat = s.libraryCategory;
  const items = searchItems({ category: cat === 'all' ? null : cat, query: s.libraryQuery });
  const size = app.settings().librarySize;
  const chips = [['all', 'libAll', t('library.all'), Object.values(counts).reduce((a, b) => a + b, 0)], ...CATEGORIES.map((c) => [c.id, c.icon, name(c), counts[c.id] ?? 0])]
    .map(([id, glyph, label, n]) => `<button class="lib-chip ${cat === id ? 'active' : ''}" data-lib-category="${id}" title="${attr(`${label} (${n})`)}" aria-pressed="${cat === id}">${icon(glyph)}<span>${escapeHtml(label)}</span><i>${n}</i></button>`).join('');
  const cards = items.map((item) => libraryCard(app, item)).join('');
  return `<div class="lib-search"><label class="search-box" title="${attr(t('library.searchTip'))}">${icon('search')}<input id="library-search" type="search" value="${attr(s.libraryQuery)}" placeholder="${attr(t('library.search'))}" /></label>
      <button class="icon-button" data-command="importModel" title="${attr(app.commandTip('importModel'))}">${icon('importModel')}</button>
      <button class="icon-button" data-lib-size title="${attr(t('library.size'))}">${icon(size === 'small' ? 'gridView' : 'libAll')}</button></div>
    <div class="lib-chips">${chips}</div>
    <div class="lib-grid size-${size}">${cards || `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t(cat === 'mine' ? 'library.mineEmpty' : 'library.empty'))}</span></p>`}</div>
    <p class="lib-foot">${icon('info')}<span>${escapeHtml(t('library.hint'))}</span></p>`;
}

function libraryCard(app, item) {
  const thumb = app.thumbnailOf(item);
  const tip = `${itemName(item, L())}${item.size ? ` — ${item.size.map((v) => formatLength(v, app.units(), { suffix: false })).join(' × ')} ${app.units()}` : ''}`;
  const badge = item.kind === 'asset' ? `<span class="lib-badge hq" title="${attr(t('library.hq'))}">HQ</span>` : item.kind === 'parametric' ? `<span class="lib-badge" title="${attr(t('library.parametric'))}">${icon('scaleTool', 'icon tiny')}</span>` : '';
  return `<button class="lib-card ${app.state.placeItem === item.id ? 'active' : ''}" data-item="${attr(item.id)}" draggable="false" title="${attr(tip)}">
    <span class="lib-thumb">${thumb ? `<img src="${attr(thumb)}" alt="" loading="lazy" decoding="async" />` : `<span class="lib-pending" data-thumb="${attr(item.id)}">${icon(CATEGORIES.find((c) => c.id === item.category)?.icon ?? 'cube')}</span>`}${badge}</span>
    <span class="lib-name">${escapeHtml(itemName(item, L()))}</span></button>`;
}

// ───────────────────────── materials

export function materialsHtml(app) {
  const s = app.state;
  const cat = s.materialCategory;
  const list = [...MATERIAL_PRESETS, ...customMaterials()].filter((m) => (cat === 'all' || m.category === cat) && m.id !== 'back-face' && (!s.materialQuery || `${m.ko} ${m.en} ${m.id}`.toLowerCase().includes(s.materialQuery.toLowerCase())));
  const chips = [['all', t('library.all')], ...MATERIAL_CATEGORIES.map((c) => [c.id, name(c)])].map(([id, label]) => `<button class="lib-chip ${cat === id ? 'active' : ''}" data-mat-category="${id}" aria-pressed="${cat === id}"><span>${escapeHtml(label)}</span></button>`).join('');
  const brush = app.brush();
  return `<div class="mat-current">${swatch(app, brush, true)}<div><b>${escapeHtml(name(presetOf(brush)))}</b><small>${escapeHtml(t('materials.brushHint'))}</small></div>
      <button class="button small" data-command="tool:paint" title="${attr(app.commandTip('tool:paint'))}">${icon('paintBucket')}<span>${escapeHtml(t('tool.paint'))}</span></button></div>
    <div class="lib-search"><label class="search-box">${icon('search')}<input id="material-search" type="search" value="${attr(s.materialQuery)}" placeholder="${attr(t('materials.search'))}" /></label>
      <button class="icon-button" data-material-new title="${attr(t('materials.new'))}">${icon('plus')}</button></div>
    <div class="lib-chips">${chips}</div>
    <div class="mat-grid">${list.map((m) => `<button class="mat-card ${brush === m.id ? 'active' : ''}" data-material="${attr(m.id)}" title="${attr(name(m))}">${swatch(app, m.id)}<span>${escapeHtml(name(m))}</span></button>`).join('')}</div>`;
}

function swatch(app, id, big = false) {
  const url = app.materialThumbnail(id);
  const p = presetOf(id);
  return `<span class="mat-swatch ${big ? 'big' : ''}" style="background:${attr(p.color)}">${url ? `<img src="${attr(url)}" alt="" />` : `<i data-mat-thumb="${attr(id)}"></i>`}</span>`;
}

/** A material picker button for properties (opens the material menu). */
function materialField(app, label, target, value) {
  const p = presetOf(value);
  return `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control"><button class="mat-field" data-pick-material="${attr(target)}" title="${attr(t('materials.choose'))}">${swatch(app, value)}<span>${escapeHtml(name(p))}</span>${icon('chevronDown', 'icon tiny')}</button></span></div>`;
}

// ───────────────────────── outliner (levels → kinds → entities)

export function outlinerHtml(app) {
  const project = app.project();
  if (!project) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('editors.noProject'))}</span></p>`;
  const sel = new Set(app.selection());
  const q = app.state.outlinerQuery.trim().toLowerCase();
  const row = (e, kind, glyph, label, depth) => {
    if (q && !label.toLowerCase().includes(q)) return '';
    return `<div class="ol-row ${sel.has(e.id) ? 'selected' : ''} ${e.hidden ? 'hidden-entity' : ''}" data-ol-select="${attr(e.id)}" style="padding-left:${8 + depth * 14}px" title="${attr(label)}">
      ${icon(glyph)}<span class="ol-name">${escapeHtml(label)}</span>
      ${e.locked ? `<span class="ol-flag">${icon('lock', 'icon tiny')}</span>` : ''}
      <button class="ol-eye" data-ol-hide="${attr(e.id)}" title="${attr(t(e.hidden ? 'outliner.show' : 'outliner.hide'))}">${icon(e.hidden ? 'eyeOff' : 'eye', 'icon tiny')}</button></div>`;
  };
  const collapsed = app.state.outlinerCollapsed;
  const section = (key, glyph, label, rows, depth) => {
    if (!rows.length) return '';
    const open = !collapsed.has(key);
    return `<div class="ol-group" style="padding-left:${4 + depth * 14}px"><button class="ol-toggle" data-ol-toggle="${attr(key)}" aria-expanded="${open}">${icon(open ? 'caretDown' : 'caretRight', 'icon tiny')}${icon(glyph)}<span>${escapeHtml(label)}</span><i>${rows.length}</i></button></div>${open ? rows.join('') : ''}`;
  };
  return project.levels.map((level) => {
    const walls = project.walls.filter((w) => w.level === level.id);
    const wallIds = new Set(walls.map((w) => w.id));
    const parts = [
      section(`${level.id}:rooms`, 'roomTool', t('outliner.rooms'), project.rooms.filter((r) => r.level === level.id).map((r) => row(r, 'room', 'roomTool', r.name || t('kind.room'), 2)), 1),
      section(`${level.id}:walls`, 'wallTool', t('outliner.walls'), walls.map((w, i) => row(w, 'wall', 'wallTool', w.name || `${t('kind.wall')} ${i + 1} · ${formatLength(wallLength(w), app.units())}`, 2)), 1),
      section(`${level.id}:openings`, 'doorTool', t('outliner.openings'), project.openings.filter((o) => wallIds.has(o.wall)).map((o) => row(o, 'opening', catalogItem(o.item)?.category === 'windows' ? 'windowTool' : 'doorTool', itemName(catalogItem(o.item), L()) || o.item, 2)), 1),
      section(`${level.id}:objects`, 'furniture', t('outliner.objects'), project.objects.filter((o) => o.level === level.id).map((o) => row(o, 'object', CATEGORIES.find((c) => c.id === catalogItem(o.item)?.category)?.icon ?? 'cube', o.name || itemName(catalogItem(o.item), L()) || o.item, 2)), 1),
      section(`${level.id}:models`, 'cube', t('outliner.models'), project.models.filter((m) => m.level === level.id).map((m) => row(m, 'model', m.component ? 'makeGroup' : 'cube', m.name || t('kind.model'), 2)), 1),
    ].join('');
    const active = project.activeLevel === level.id;
    return `<div class="ol-level ${active ? 'active' : ''}"><button class="ol-level-head" data-level-activate="${attr(level.id)}" title="${attr(t('levels.activate'))}">${icon('level')}<span>${escapeHtml(level.name)}</span><small>${escapeHtml(formatLength(level.elevation, app.units()))}</small>${active ? `<b>${escapeHtml(t('levels.active'))}</b>` : ''}</button>${parts || `<p class="ol-empty">${escapeHtml(t('outliner.empty'))}</p>`}</div>`;
  }).join('');
}

// ───────────────────────── Entity Info (properties)

const numberRow = (label, field, value, units, { step = null, min = null, title = '' } = {}) => `<div class="prop-row" title="${attr(title || label)}"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control unit-input"><input type="text" inputmode="decimal" data-prop="${attr(field)}" value="${attr(value)}" ${step ? `data-step="${step}"` : ''} ${min != null ? `data-min="${min}"` : ''} /><em>${escapeHtml(units)}</em></span></div>`;
const textRow = (label, field, value) => `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control"><input type="text" data-prop="${attr(field)}" value="${attr(value ?? '')}" /></span></div>`;
const checkRow = (label, field, value) => `<label class="prop-row check"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control"><input type="checkbox" data-prop="${attr(field)}" ${value ? 'checked' : ''} /></span></label>`;
const selectRow = (label, field, value, options) => `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control"><select data-prop="${attr(field)}">${options.map(([v, l, glyph]) => `<option value="${attr(v)}" ${String(v) === String(value) ? 'selected' : ''} ${glyph ? `data-icon="${glyph}"` : ''}>${escapeHtml(l)}</option>`).join('')}</select></span></div>`;
const valueRow = (label, value) => `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control"><b class="prop-value">${escapeHtml(value)}</b></span></div>`;
const section = (glyph, title, body, extra = '') => `<section class="prop-section"><header><span class="section-toggle">${icon(glyph)}<span>${escapeHtml(title)}</span></span>${extra}</header><div class="props">${body}</div></section>`;

export function entityInfoHtml(app) {
  const project = app.project();
  if (!project) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('editors.noProject'))}</span></p>`;
  const ids = app.selection();
  const units = app.units();
  const len = (v) => formatLength(v, units, { suffix: false });
  if (!ids.length) return projectInfoHtml(app);
  if (ids.length > 1) {
    // All the pieces of one curved wall (double-click on a piece): the curve as a whole.
    const curveWalls = ids.map((id) => project.walls.find((w) => w.id === id));
    const curve = curveWalls.every(Boolean) ? curveInfo(curveWalls) : null;
    if (curve) {
      return section('arcTool', t('entity.curve'), `
        ${valueRow(t('entity.curveRadius'), formatLength(curve.r, units))}
        ${valueRow(t('entity.curveSegments'), String(curve.segments))}
        ${valueRow(t('entity.curveLength'), formatLength(curve.length, units))}
        ${valueRow(t('entity.thickness'), formatLength(curveWalls[0].thickness ?? 0.15, units))}`, actionButtons(app, ['hide', 'lock', 'delete']));
    }
    return section('selectAll', t('status.selected', { count: ids.length }), `<p class="panel-hint">${escapeHtml(t('entity.multi'))}</p>
      <div class="prop-actions">${['makeGroup', 'hide', 'lock', 'unlock', 'delete'].map((c) => app.commands[c] ? `<button class="button small" data-command="${c}">${icon(app.commands[c].icon)}<span>${escapeHtml(t(app.commands[c].label))}</span></button>` : '').join('')}</div>`);
  }
  const hit = app.entity(ids[0]);
  if (!hit) return '';
  const { kind, entity: e } = hit;
  const common = `${checkRow(t('entity.hidden'), 'hidden', e.hidden)}${checkRow(t('entity.locked'), 'locked', e.locked)}`;
  if (kind === 'walls') {
    const h = wallHeight(project, e);
    const curve = e.curve ? curveInfo(curveChain(project, e)) : null;
    return section('wallTool', t('kind.wall'), `
      <p class="panel-hint">${icon('info')}<span>${escapeHtml(t(curve ? 'entity.curveHint' : 'entity.wallGrips'))}</span></p>
      ${curve ? `${valueRow(t('entity.curveRadius'), formatLength(curve.r, units))}${valueRow(t('entity.curveSegments'), String(curve.segments))}` : ''}
      ${textRow(t('entity.name'), 'name', e.name)}
      ${numberRow(t('entity.length'), 'wall.length', len(wallLength(e)), units)}
      ${numberRow(t('entity.thickness'), 'wall.thickness', len(e.thickness ?? 0.15), units)}
      ${selectRow(t('entity.wallAlign'), 'wall.align', e.align ?? 'center', [['center', t('entity.alignCenter'), 'alignCenter'], ['left', t('entity.alignLeft'), 'alignLeft'], ['right', t('entity.alignRight'), 'alignRight']])}
      ${numberRow(t('entity.height'), 'wall.height', len(h), units, { title: t('entity.heightTip') })}
      ${checkRow(t('entity.heightLevel'), 'wall.heightAuto', e.height == null)}
      ${materialField(app, t('entity.sideLeft'), 'wall.left', e.material?.left ?? 'wall-paint-white')}
      ${materialField(app, t('entity.sideRight'), 'wall.right', e.material?.right ?? 'wall-paint-white')}
      ${tagRow(app, e)}${common}`, actionButtons(app, ['splitWall', 'flipWall']));
  }
  if (kind === 'rooms') {
    return section('roomTool', t('kind.room'), `
      ${textRow(t('entity.name'), 'name', e.name)}
      <div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('entity.area'))}</span></span><span class="prop-control"><b class="prop-value">${escapeHtml(formatArea(roomArea(e), units))}</b> <small>(${escapeHtml((roomArea(e) / 3.3058).toFixed(1))} ${escapeHtml(t('unit.pyeong'))})</small></span></div>
      ${materialField(app, t('entity.floor'), 'room.floor', e.floor ?? 'floor-oak')}
      ${checkRow(t('entity.showCeiling'), 'showCeiling', e.showCeiling)}
      ${materialField(app, t('entity.ceiling'), 'room.ceiling', e.ceiling ?? 'wall-paint-white')}
      ${common}`);
  }
  const item = catalogItem(e.item);
  if (kind === 'openings') {
    // Swinging doors: the hinge jamb and the side the leaf opens to, named by the rooms on each side.
    const door = doorSideRooms(project, e, item);
    const roomSide = (s) => {
      const name = door?.rooms[s];
      if (name) return t('entity.swingInto', { room: name });
      if (door?.rooms[s === 'left' ? 'right' : 'left']) return t('entity.swingOutside');
      return t(s === 'left' ? 'entity.swingLeftFace' : 'entity.swingRightFace');
    };
    const direction = door ? `
      ${door.hinge ? selectRow(t('entity.hingeSide'), 'doorHinge', door.hinge, [['left', t('entity.hingeLeft'), 'arrowStart'], ['right', t('entity.hingeRight'), 'arrowEnd']]) : ''}
      ${selectRow(t('entity.swingTo'), 'doorSwing', door.swing, [['left', roomSide('left'), 'arrowUp'], ['right', roomSide('right'), 'arrowDown']])}
      <p class="panel-hint">${escapeHtml(t(door.hinge ? 'entity.swingHint' : 'entity.swingHintPair'))}</p>` : `
      ${checkRow(t('entity.flipHinge'), 'flip', e.flip)}
      ${selectRow(t('entity.facing'), 'side', e.side ?? 'left', [['left', t('entity.facingLeft'), 'arrowUp'], ['right', t('entity.facingRight'), 'arrowDown']])}`;
    return section(item?.category === 'windows' ? 'windowTool' : 'doorTool', itemName(item, L()) || t('kind.opening'), `
      ${numberRow(t('entity.width'), 'op.width', len(e.width), units)}
      ${numberRow(t('entity.height'), 'op.height', len(e.height), units)}
      ${numberRow(t('entity.sill'), 'op.sill', len(e.sill ?? 0), units)}
      ${numberRow(t('entity.offset'), 'op.offset', len(e.offset), units, { title: t('entity.offsetTip') })}
      ${direction}
      ${paramsHtml(app, item, e, door?.hinge ? ['width', 'height', 'sill', 'hinge'] : ['width', 'height', 'sill'])}`, actionButtons(app, door ? ['flipDoorSwing', ...(door.hinge ? ['flipDoorHinge'] : []), 'replaceItem'] : ['replaceItem']));
  }
  if (kind === 'objects') {
    const deg = Math.round(((e.rotation[1] * 180) / Math.PI) * 10) / 10;
    const box = app.builder.worldBox(e.id);
    const size = box ? box.getSize(new (box.min.constructor)()) : null;
    return section(CATEGORIES.find((c) => c.id === item?.category)?.icon ?? 'cube', e.name || itemName(item, L()) || e.item, `
      ${textRow(t('entity.name'), 'name', e.name)}
      <div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('entity.item'))}</span></span><span class="prop-control"><span class="prop-value">${escapeHtml(itemName(item, L()) || e.item)}</span></span></div>
      ${size ? `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('entity.size'))}</span></span><span class="prop-control"><span class="prop-value">${escapeHtml([size.x, size.y, size.z].map(len).join(' × '))} ${escapeHtml(units)}</span></span></div>` : ''}
      ${numberRow('X', 'pos.0', len(e.position[0]), units)}
      ${numberRow(t('entity.elevation'), 'pos.1', len(e.position[1]), units)}
      ${numberRow('Z', 'pos.2', len(e.position[2]), units)}
      ${numberRow(t('entity.rotation'), 'rot.1', deg, '°')}
      ${numberRow(t('entity.scale'), 'scale', Number(e.scale[0].toFixed(3)), '×')}
      ${tagRow(app, e)}${common}`, actionButtons(app, ['rotate90', 'mirrorObject', 'replaceItem']))
      + lampHtml(app, e)
      + (item?.params?.length ? section(/^column(-|$)/.test(e.item) ? 'columnTool' : 'scaleTool', t(/^column(-|$)/.test(e.item) ? 'entity.column' : 'entity.parameters'), paramsHtml(app, item, e, /^column(-|$)/.test(e.item) ? [...(e.params?.shape === 'rect' ? [] : ['depth']), ...(e.params?.fitLevel ? ['height'] : [])] : [])) : '')
      + materialsOfObjectHtml(app, e);
  }
  if (kind === 'models') {
    return section('cube', e.name || t('kind.model'), `${textRow(t('entity.name'), 'name', e.name)}${checkRow(t('entity.component'), 'component', e.component)}
      ${numberRow(t('entity.elevation'), 'pos.1', len(e.position[1]), units)}${tagRow(app, e)}${common}
      <div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('entity.geometry'))}</span></span><span class="prop-control"><span class="prop-value">${escapeHtml(app.modelStats(e))}</span></span></div>`, actionButtons(app, ['editModel', 'explodeModel']));
  }
  if (kind === 'dimensions' || kind === 'texts' || kind === 'guides' || kind === 'sections') {
    return section(kind === 'texts' ? 'label3d' : kind === 'sections' ? 'sectionPlane' : kind === 'guides' ? 'guide' : 'dimension', t(`kind.${kind}`), kind === 'texts' ? textRow(t('text.label'), 'text', e.text) : kind === 'sections' ? checkRow(t('entity.activeSection'), 'active', e.active) : '');
  }
  return '';
}

/** A lamp's light: on/off, brightness, colour, reach and (spots) beam angle. */
function lampHtml(app, e) {
  const spec = app.builder?.lampInfo?.(e);
  if (!spec) return '';
  const units = app.units();
  const lightsOn = Boolean(app.project()?.style?.lightsOn);
  return section('lightsOn', t('lamp.title'), `
    ${checkRow(t('lamp.on'), 'light.on', spec.on)}
    ${numberRow(t('lamp.lumens'), 'light.lumens', spec.lumens, 'lm', { step: 50, min: 0 })}
    <div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('lamp.color'))}</span></span><span class="prop-control"><input type="color" data-prop="light.color" value="${attr(spec.color)}" /></span></div>
    ${numberRow(t('lamp.distance'), 'light.distance', formatLength(spec.distance, units, { suffix: false }), units)}
    ${spec.type === 'spot' ? numberRow(t('lamp.beam'), 'light.beam', spec.beam, '°', { step: 5, min: 5 }) : ''}
    <p class="panel-hint small">${escapeHtml(t(lightsOn ? 'lamp.hint' : 'lamp.hintOff'))}</p>`,
  `<span class="section-actions">${app.commands.lightsOn ? `<button class="icon-button ${lightsOn ? 'active' : ''}" data-command="lightsOn" title="${attr(app.commandTip('lightsOn'))}">${icon('lightsOn')}</button>` : ''}<button class="icon-button" data-command="resetLamp" title="${attr(t('lamp.reset'))}">${icon('undo')}</button></span>`);
}

function actionButtons(app, ids) {
  return `<span class="section-actions">${ids.filter((c) => app.commands[c] && app.commandEnabled(c)).map((c) => `<button class="icon-button" data-command="${c}" title="${attr(app.commandTip(c))}">${icon(app.commands[c].icon)}</button>`).join('')}</span>`;
}

function tagRow(app, e) {
  const tags = app.project().tags;
  return selectRow(t('entity.tag'), 'tag', e.tag ?? 'untagged', tags.map((tag) => [tag.id, tag.name || t('tags.untagged'), 'tagsPanel']));
}

/** The item's own parameters (width, seats, fabric …) as editable rows. */
function paramsHtml(app, item, e, skip) {
  if (!item?.params?.length) return '';
  const values = itemParams(item, e.params);
  const units = app.units();
  // `showIf(values)`: a param that only matters for some choices (e.g. the gap of a U-shaped stair).
  return item.params.filter((p) => !skip.includes(p.key) && !(p.showIf && !p.showIf(values))).map((p) => {
    const label = name(p);
    const v = values[p.key];
    const field = `param.${p.key}`;
    if (p.type === 'length') return numberRow(label, field, formatLength(v, units, { suffix: false }), units);
    if (p.type === 'int' || p.type === 'number') return `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control"><span class="stepper" data-stepper><button class="stepper-button" data-param-step="${attr(p.key)}" data-delta="-${p.step ?? 1}">${icon('minus')}</button><input class="stepper-value" type="text" data-prop="${attr(field)}" value="${attr(v)}" /><button class="stepper-button" data-param-step="${attr(p.key)}" data-delta="${p.step ?? 1}">${icon('plus')}</button></span></span></div>`;
    if (p.type === 'bool') return checkRow(label, field, v);
    if (p.type === 'enum') return selectRow(label, field, v, p.options.map(([val, ko, en]) => [val, L() === 'ko' ? ko : en]));
    if (p.type === 'material') return materialField(app, label, `param.${p.key}`, v);
    if (p.type === 'color') return `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control"><input type="color" data-prop="${attr(field)}" value="${attr(v)}" /></span></div>`;
    return textRow(label, field, v);
  }).join('') + itemInfoHtml(item, values, units);
}

/** Read-only facts an item computes from its params (stairs: risers, riser height, going, 2R + G). */
function itemInfoHtml(item, values, units) {
  const info = item.info?.(values);
  if (!info || info.n == null) return '';
  const row = (label, value, warn = false) => `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control"><span class="prop-value ${warn ? 'warn' : ''}">${escapeHtml(value)}</span></span></div>`;
  return row(t('stairs.info.risers'), t('stairs.info.risersValue', { n: info.n, treads: info.treads, riser: formatLength(info.riser, units) }), info.riser > 0.2)
    + row(t('stairs.info.going'), formatLength(info.going, units), info.going < 0.22)
    + row(t('stairs.info.blondel'), `${formatLength(info.blondel, units)} · ${t(info.comfortable ? 'stairs.info.comfortable' : 'stairs.info.uncomfortable')}`, !info.comfortable);
}

/** Materials used by a placed object: each can be swapped (stored as overrides). */
function materialsOfObjectHtml(app, e) {
  const used = app.materialsOf(e.id);
  if (!used.length) return '';
  return section('materialsPanel', t('entity.materials'), used.map((preset) => materialField(app, name(presetOf(preset)), `objmat.${preset}`, e.materials?.[preset] ?? preset)).join('')
    + (Object.keys(e.materials ?? {}).length ? `<div class="prop-actions"><button class="button small" data-command="resetMaterials">${icon('refresh')}<span>${escapeHtml(t('action.resetMaterials'))}</span></button></div>` : ''));
}

function projectInfoHtml(app) {
  const project = app.project();
  const units = app.units();
  const area = project.rooms.reduce((sum, r) => sum + polygonArea(r.points), 0);
  return section('entityInfo', t('entity.project'), `
    ${textRow(t('entity.projectName'), 'project.name', project.name)}
    ${selectRow(t('settings.units'), 'project.units', project.units, [['mm', t('unit.mm'), 'units'], ['cm', t('unit.cm'), 'units'], ['m', t('unit.m'), 'units'], ['in', t('unit.in'), 'units'], ['ft', t('unit.ft'), 'units']])}
    <div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('entity.totalArea'))}</span></span><span class="prop-control"><b class="prop-value">${escapeHtml(formatArea(area, units))}</b> <small>(${escapeHtml((area / 3.3058).toFixed(1))} ${escapeHtml(t('unit.pyeong'))})</small></span></div>
    <div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('entity.counts'))}</span></span><span class="prop-control"><span class="prop-value">${escapeHtml(t('entity.countsValue', { walls: project.walls.length, rooms: project.rooms.length, objects: project.objects.length, openings: project.openings.length }))}</span></span></div>`)
    + (app.underlayHtml?.() ?? '') // plan pictures of the active level (ui/plan-import.js)
    + `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('entity.selectHint'))}</span></p>`;
}

// ───────────────────────── tags, scenes, styles, shadows, levels

export function tagsHtml(app) {
  const project = app.project();
  if (!project) return '';
  return section('tagsPanel', t('editors.tags'), `<div class="tag-list">${project.tags.map((tag) => `<div class="tag-row">
      <button class="ol-eye" data-tag-visible="${attr(tag.id)}" title="${attr(t(tag.visible === false ? 'outliner.show' : 'outliner.hide'))}">${icon(tag.visible === false ? 'eyeOff' : 'eye')}</button>
      <i class="tag-color" style="background:${attr(tag.color ?? '#999')}"></i>
      ${tag.id === 'untagged' ? `<span class="tag-name">${escapeHtml(t('tags.untagged'))}</span>` : `<input type="text" data-tag-name="${attr(tag.id)}" value="${attr(tag.name)}" />`}
      <span class="tag-count">${project.objects.filter((o) => (o.tag ?? 'untagged') === tag.id).length + project.models.filter((o) => (o.tag ?? 'untagged') === tag.id).length + project.walls.filter((o) => (o.tag ?? 'untagged') === tag.id).length}</span>
      ${tag.id === 'untagged' ? '' : `<button class="icon-button" data-tag-delete="${attr(tag.id)}" title="${attr(t('tags.delete'))}">${icon('trash')}</button>`}</div>`).join('')}</div>`,
  `<span class="section-actions"><button class="icon-button" data-tag-add title="${attr(t('tags.add'))}">${icon('plus')}</button></span>`);
}

export function scenesHtml(app) {
  const project = app.project();
  if (!project) return '';
  return section('scene', t('editors.scenes'), `<div class="tag-list">${project.scenes.map((sc) => `<div class="tag-row ${project.activeScene === sc.id ? 'active' : ''}">
      <button class="icon-button" data-scene-go="${attr(sc.id)}" title="${attr(t('scenes.go'))}">${icon('scene')}</button>
      <input type="text" data-scene-name="${attr(sc.id)}" value="${attr(sc.name)}" />
      <button class="icon-button" data-scene-update="${attr(sc.id)}" title="${attr(t('scenes.update'))}">${icon('refresh')}</button>
      <button class="icon-button" data-scene-delete="${attr(sc.id)}" title="${attr(t('scenes.delete'))}">${icon('trash')}</button></div>`).join('') || `<p class="panel-hint">${escapeHtml(t('scenes.empty'))}</p>`}</div>`,
  `<span class="section-actions"><button class="icon-button" data-command="addScene" title="${attr(app.commandTip('addScene'))}">${icon('sceneAdd')}</button></span>`);
}

export function stylesHtml(app) {
  const project = app.project();
  if (!project) return '';
  const st = project.style;
  const s = app.settings();
  const modes = STYLE_MODES.map((m) => `<button class="seg-button ${st.mode === m ? 'active' : ''}" data-command="style:${m}" title="${attr(t(`style.${m}`))}">${icon(app.commands[`style:${m}`].icon)}<span>${escapeHtml(t(`style.${m}`))}</span></button>`).join('');
  const envs = app.environments();
  return section('styleTextured', t('editors.styles'), `<div class="seg-grid">${modes}</div>
      ${checkRow(t('style.edges'), 'style.edges', st.edges !== false)}
      ${checkRow(t('style.lightsOn'), 'style.lightsOn', st.lightsOn)}
      ${selectRow(t('style.background'), 'style.background', st.background ?? 'theme', [['theme', t('style.bgTheme'), 'palette'], ['sky', t('style.bgSky'), 'sun'], ['white', t('style.bgWhite'), 'styleWhite'], ['dark', t('style.bgDark'), 'moon'], ['environment', t('style.bgEnvironment'), 'environment']])}
      ${selectRow(t('style.environment'), 'style.environment', st.environment ?? 'room', envs.map((e) => [e.id, name(e), 'environment']))}
      <div class="prop-row"><span class="prop-label"></span><span class="prop-control"><button class="button" data-command="importEnvironment" title="${attr(app.commandTip('importEnvironment'))}">${icon('environment')}<span>${escapeHtml(t('style.importEnvironment'))}</span></button></span></div>
      <div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('style.exposure'))}</span></span><span class="prop-control"><input type="range" min="0.3" max="2.5" step="0.05" data-prop="style.exposure" value="${attr(st.exposure ?? 1)}" /><output>${Number(st.exposure ?? 1).toFixed(2)}</output></span></div>`)
    + section('quality', t('editors.quality'), `
      ${selectRow(t('settings.renderQuality'), 'settings.renderQuality', s.renderQuality, [['fast', t('quality.fast'), 'fps'], ['balanced', t('quality.balanced'), 'quality'], ['high', t('quality.high'), 'renderPhoto']])}
      ${checkRow(t('settings.ambientOcclusion'), 'settings.ambientOcclusion', s.ambientOcclusion)}
      ${checkRow(t('settings.antialias'), 'settings.antialias', s.antialias)}
      ${selectRow(t('settings.shadowQuality'), 'settings.shadowQuality', s.shadowQuality, [['low', t('quality.low'), 'shadowToggle'], ['medium', t('quality.medium'), 'shadowToggle'], ['high', t('quality.high'), 'shadowToggle']])}`);
}

/** The sun's X/Y/Z and distance in the project's units (typing one moves the sun there). */
function sunCoordinateRows(app) {
  const at = app.sunCoordinates?.();
  if (!at) return '';
  const units = app.units();
  const len = (v) => formatLength(v, units, { suffix: false });
  const distance = app.sunDistance?.();
  return ['x', 'y', 'z'].map((axis, i) => numberRow(t(`sun.${axis}`), `sun.${axis}`, len(at[i]), units, { title: t('sun.coordTip') })).join('')
    + (distance != null ? numberRow(t('sun.distance'), 'sun.distance', len(distance), units, { title: t('sun.distanceTip') }) : '');
}

export function shadowsHtml(app) {
  const project = app.project();
  if (!project) return '';
  const sun = project.sun;
  const s = app.settings();
  const [mm, dd] = sun.date.split('-').map(Number);
  const [hh, mi] = sun.time.split(':').map(Number);
  const dayOfYear = new Date(2026, mm - 1, dd).getTime();
  const doy = Math.round((dayOfYear - new Date(2026, 0, 1).getTime()) / 86400000) + 1;
  const manual = sun.mode === 'manual';
  const ang = app.sunAngles ? app.sunAngles(sun) : { azimuth: sun.azimuth ?? 0, altitude: sun.altitude ?? 45 };
  const night = ang.altitude < 0;
  return section('sun', t('sun.title'), `
    ${checkRow(t('sun.on'), 'sun.on', sun.on !== false)}
    ${checkRow(t('shadows.show'), 'settings.shadows', s.shadows)}
    <div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('sun.state'))}</span></span><span class="prop-control"><span class="prop-value">${icon(night ? 'moon' : 'sun')} ${escapeHtml(t(night ? 'sun.isNight' : 'sun.isDay'))} · ${escapeHtml(t('sun.angles', { az: ang.azimuth.toFixed(0), alt: ang.altitude.toFixed(0) }))}</span></span></div>
    ${selectRow(t('sun.mode'), 'sun.mode', manual ? 'manual' : 'time', [['time', t('sun.modeTime'), 'clock'], ['manual', t('sun.modeManual'), 'sun']])}
    ${manual ? numberRow(t('sun.azimuth'), 'sun.azimuth', Math.round(ang.azimuth * 10) / 10, '°', { step: 5, title: t('sun.azimuthTip') }) + numberRow(t('sun.altitude'), 'sun.altitude', Math.round(ang.altitude * 10) / 10, '°', { step: 5, title: t('sun.altitudeTip') }) : ''}
    ${sunCoordinateRows(app)}
    ${numberRow(t('sun.intensity'), 'sun.intensity', Math.round((sun.intensity ?? 1) * 100), '%', { step: 10, min: 0 })}
    <div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('sun.color'))}</span></span><span class="prop-control"><input type="color" data-prop="sun.color" value="${attr(sun.color ?? '#fff1dc')}" /></span></div>
    <p class="panel-hint small">${escapeHtml(t('sun.hint'))}</p>
    ${manual ? '' : `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('shadows.time'))}</span></span><span class="prop-control"><input type="range" min="0" max="1435" step="5" data-prop="sun.minutes" value="${hh * 60 + mi}" /><output>${escapeHtml(sun.time)}</output></span></div>`}
    ${manual ? '' : `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('shadows.date'))}</span></span><span class="prop-control"><input type="range" min="1" max="365" step="1" data-prop="sun.day" value="${doy}" /><output>${escapeHtml(`${mm}/${dd}`)}</output></span></div>
    ${numberRow(t('shadows.latitude'), 'sun.latitude', sun.latitude, '°')}
    ${numberRow(t('shadows.longitude'), 'sun.longitude', sun.longitude, '°')}`}
    ${numberRow(t('shadows.north'), 'sun.north', sun.north ?? 0, '°', { title: t('shadows.northTip') })}
    ${selectRow(t('shadows.place'), 'sun.place', '', [['', t('shadows.placeChoose'), 'globe'], ...PLACES.map(([id, ko, en]) => [id, L() === 'ko' ? ko : en, 'globe'])])}`);
}

export const PLACES = [
  ['seoul', '서울', 'Seoul', 37.57, 126.98, 9], ['busan', '부산', 'Busan', 35.18, 129.08, 9], ['jeju', '제주', 'Jeju', 33.5, 126.53, 9],
  ['tokyo', '도쿄', 'Tokyo', 35.68, 139.69, 9], ['newyork', '뉴욕', 'New York', 40.71, -74.0, -5], ['london', '런던', 'London', 51.51, -0.13, 0],
  ['paris', '파리', 'Paris', 48.86, 2.35, 1], ['sydney', '시드니', 'Sydney', -33.87, 151.21, 10], ['singapore', '싱가포르', 'Singapore', 1.35, 103.82, 8],
];

export function levelsHtml(app) {
  const project = app.project();
  if (!project) return '';
  const units = app.units();
  return section('level', t('editors.levels'), `<div class="tag-list">${[...project.levels].reverse().map((level) => `<div class="tag-row ${project.activeLevel === level.id ? 'active' : ''}">
      <button class="icon-button" data-level-activate="${attr(level.id)}" title="${attr(t('levels.activate'))}">${icon(project.activeLevel === level.id ? 'check' : 'level')}</button>
      <input type="text" data-level-name="${attr(level.id)}" value="${attr(level.name)}" />
      <span class="unit-input small"><input type="text" data-level-elevation="${attr(level.id)}" value="${attr(formatLength(level.elevation, units, { suffix: false }))}" title="${attr(t('levels.elevation'))}" /></span>
      <span class="unit-input small"><input type="text" data-level-height="${attr(level.id)}" value="${attr(formatLength(level.height, units, { suffix: false }))}" title="${attr(t('levels.height'))}" /></span>
      <button class="ol-eye" data-level-visible="${attr(level.id)}" title="${attr(t(level.visible === false ? 'outliner.show' : 'outliner.hide'))}">${icon(level.visible === false ? 'eyeOff' : 'eye')}</button>
      ${project.levels.length > 1 ? `<button class="icon-button" data-level-delete="${attr(level.id)}" title="${attr(t('levels.delete'))}">${icon('trash')}</button>` : ''}</div>`).join('')}</div>
    <p class="panel-hint small">${escapeHtml(t('levels.hint', { units }))}</p>`,
  `<span class="section-actions"><button class="icon-button" data-command="addLevel" title="${attr(app.commandTip('addLevel'))}">${icon('levelAdd')}</button></span>`);
}

export { toUnits };
