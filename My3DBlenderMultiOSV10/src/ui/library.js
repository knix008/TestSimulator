// The Tools & Library panel on the left of every workspace: a search box over folding sections of tools and libraries.
//   Tools        the 3D view's tools and the everyday operations on objects, the view, animation and rendering
//   Add          every kind of object; a click adds it at the 3D cursor, a drag drops it where it is let go in a 3D view
//   Modifiers    every modifier, for the active object
//   Materials    ready-made materials (the Asset Browser's built-in ones); a click gives one to the selection, a drag to
//                the object it is dropped on
//   Assets       ready-made objects, this file's assets and My Library; a click adds at the cursor, a drag where it lands
//   Physics      the simulations an object can take part in, and Bake All
// Everything is an operator or an asset use, as it is from the menus. Folding is remembered in the settings.
import { BUILTIN_ASSETS, applyAsset, assetName, fileAssets } from '../core/assets.js';
import { getObject, selectOnly } from '../core/doc.js';
import { MODIFIERS } from '../core/modifiers.js';
import { getOp } from '../core/ops.js';
import { userLibrary } from './editors/assets.js';
import { h, replace } from './dom.js';
import { getLanguage, nameOf, t } from './i18n.js';
import { icon } from './icons.js';
import { sidePanel } from './widgets.js';

export const LIBRARY_MIME = 'application/x-my3d-library';

// The colour of each kind of item's icon, as the start screen colours its tiles.
const TONE = { tool: '#3b82f6', object: '#f59e0b', view: '#14b8a6', anim: '#a855f7', render: '#ef4444', mesh: '#f59e0b', light: '#eab308', other: '#0ea5e9', modifier: '#3b82f6', deform: '#a855f7', material: '#ec4899', asset: '#10b981', physics: '#22c55e' };

/** The sections and their items. An item: { id, icon, tone, label, tip, run(), drag (payload for a 3D view) }. */
export function librarySections(app) {
  const view = () => app.editorsOf?.('view3d')?.[0]?.api ?? null;
  const op = (id, props = {}, { iconName = null, tone = 'tool', label = null, drag = false } = {}) => {
    const o = getOp(id);
    if (!o) return null;
    return { id: `op:${id}:${JSON.stringify(props)}`, op: id, icon: iconName ?? o.icon ?? 'run', tone, label: label ?? nameOf(o), tip: nameOf(o), run: () => app.op(id, props), enabled: () => app.canRun(id), drag: drag ? { kind: 'op', id, props } : null };
  };
  const tool = (name, iconName, en, ko) => ({ id: `tool:${name}`, icon: iconName, tone: 'tool', label: t(en, ko), tip: t(`${en} tool in the 3D view`, `3D 뷰의 ${ko} 도구`), run: () => { const v = view(); if (v) v.setTool(name); else app.status(t('Open a 3D view first', '먼저 3D 뷰를 여세요'), true); } });
  const L = getLanguage();
  const assetItem = (asset, tone) => ({
    id: `asset:${asset.id}`, icon: asset.kind === 'MATERIAL' ? 'material' : 'mesh', tone, label: assetName(asset, L), tip: assetName(asset, L), swatch: asset.kind === 'MATERIAL' ? asset.material?.baseColor : null,
    run: () => app.libraryUse({ kind: 'asset', id: asset.id }), drag: { kind: 'asset', id: asset.id },
  });
  const modifierGroups = {};
  for (const [type, m] of Object.entries(MODIFIERS)) (modifierGroups[m.group ?? 'other'] ??= []).push([type, m]);
  const allAssets = [...BUILTIN_ASSETS, ...fileAssets(app.doc), ...userLibrary()];
  return [
    { id: 'tools', icon: 'tool', title: t('Tools', '도구'), items: [
      tool('select', 'tool-select', 'Select', '선택'), tool('cursor', 'tool-cursor', '3D Cursor', '3D 커서'), tool('move', 'tool-move', 'Move', '이동'), tool('rotate', 'tool-rotate', 'Rotate', '회전'), tool('scale', 'tool-scale', 'Scale', '크기'), tool('transform', 'tool-transform', 'Transform', '변형'), tool('measure', 'tool-measure', 'Measure', '측정'), tool('annotate', 'tool-annotate', 'Annotate', '주석'),
      op('object.duplicate', {}, { tone: 'object', iconName: 'duplicate', label: t('Duplicate', '복제') }), op('object.delete', {}, { tone: 'object', iconName: 'delete', label: t('Delete', '삭제') }), op('object.join', {}, { tone: 'object', iconName: 'join', label: t('Join', '합치기') }), op('object.shade_smooth', {}, { tone: 'object', iconName: 'shade-smooth', label: t('Smooth', '부드럽게') }), op('object.shade_flat', {}, { tone: 'object', iconName: 'shade-flat', label: t('Flat', '각지게') }), op('object.transform_apply', {}, { tone: 'object', iconName: 'check', label: t('Apply', '변형 적용') }), op('object.origin_set', {}, { tone: 'object', iconName: 'tool-cursor', label: t('Origin', '원점 설정') }), op('object.parent_set', {}, { tone: 'object', iconName: 'constraint', label: t('Parent', '부모 설정') }),
      op('view3d.snap_cursor_to_selected', {}, { tone: 'view', iconName: 'snap', label: t('Cursor to Selected', '커서→선택') }), op('view3d.snap_selected_to_cursor', {}, { tone: 'view', iconName: 'snap', label: t('Selected to Cursor', '선택→커서') }), op('view3d.snap_cursor_to_center', {}, { tone: 'view', iconName: 'home', label: t('Cursor to Origin', '커서 원점') }),
      { id: 'view:frame', icon: 'maximize2', tone: 'view', label: t('Frame All', '모두 보기'), tip: t('Fit everything in the 3D view', '3D 뷰에 모두 맞추기'), run: () => view()?.frameAll() },
      { id: 'view:selected', icon: 'search', tone: 'view', label: t('Frame Selected', '선택 보기'), tip: t('Fit the selection in the 3D view', '3D 뷰에 선택 항목 맞추기'), run: () => view()?.frameSelected() },
      op('anim.keyframe_insert', {}, { tone: 'anim', iconName: 'keyframe', label: t('Keyframe', '키프레임') }), op('render.render', {}, { tone: 'render', iconName: 'camera-render', label: t('Render', '렌더') }), op('render.animation', {}, { tone: 'render', iconName: 'play', label: t('Animation', '애니메이션') }),
    ].filter(Boolean) },
    { id: 'add', icon: 'add', title: t('Add', '추가'), items: [
      ...['plane', 'cube', 'circle', 'uv_sphere', 'ico_sphere', 'cylinder', 'cone', 'torus', 'grid'].map((p) => op(`mesh.primitive_${p}_add`, {}, { tone: 'mesh', drag: true })),
      op('mesh.primitive_nurbs_surface_add', {}, { tone: 'mesh', drag: true }),
      ...[['POINT', 'Point Light', '점 조명'], ['SUN', 'Sun', '태양'], ['SPOT', 'Spot Light', '스폿 조명'], ['AREA', 'Area Light', '면 조명']].map(([kind, en, ko]) => op('object.light_add', { kind }, { tone: 'light', label: t(en, ko), drag: true })),
      op('object.camera_add', {}, { tone: 'other', drag: true }), op('object.empty_add', {}, { tone: 'other', drag: true }), op('object.armature_add', {}, { tone: 'other', drag: true }),
      ...[['BEZIER', 'Bézier Curve', '베지어 커브'], ['CIRCLE', 'Curve Circle', '커브 원'], ['PATH', 'Path', '경로']].map(([kind, en, ko]) => op('object.curve_add', { kind }, { tone: 'other', label: t(en, ko), drag: true })),
      op('object.text_add', {}, { tone: 'other', drag: true }), op('object.metaball_add', {}, { tone: 'other', drag: true }), op('object.lattice_add', {}, { tone: 'other', drag: true }), op('object.gpencil_add', {}, { tone: 'other', drag: true }), op('object.volume_add', {}, { tone: 'other', drag: true }), op('object.forcefield_add', {}, { tone: 'physics', drag: true }),
    ].filter(Boolean) },
    { id: 'modifiers', icon: 'modifier', title: t('Modifiers', '모디파이어'), items: Object.entries(modifierGroups).flatMap(([group, list]) => list.map(([type, m]) => ({
      id: `modifier:${type}`, icon: m.icon ?? 'modifier', tone: group === 'deform' ? 'deform' : 'modifier', label: nameOf(m), tip: t(`Add a ${m.en} modifier to the active object`, `활성 오브젝트에 ${m.ko} 모디파이어 추가`),
      run: () => app.op('object.modifier_add', { type }), enabled: () => app.canRun('object.modifier_add'),
    }))) },
    { id: 'materials', icon: 'material', title: t('Materials', '재질'), items: allAssets.filter((a) => a.kind === 'MATERIAL').map((a) => assetItem(a, 'material')) },
    { id: 'assets', icon: 'ed-assets', title: t('Assets', '애셋'), items: allAssets.filter((a) => a.kind !== 'MATERIAL').map((a) => assetItem(a, 'asset')) },
    { id: 'physics', icon: 'physics', title: t('Physics', '물리'), items: [
      op('rigidbody.object_add', {}, { tone: 'physics' }), op('object.collision_toggle', {}, { tone: 'physics' }), op('object.cloth_toggle', {}, { tone: 'physics' }), op('object.softbody_toggle', {}, { tone: 'physics' }), op('object.particle_system_add', {}, { tone: 'physics' }),
      op('object.smoke_domain_toggle', {}, { tone: 'physics' }), op('object.smoke_flow_toggle', {}, { tone: 'physics' }), op('object.fluid_domain_toggle', {}, { tone: 'physics' }), op('object.fluid_flow_toggle', {}, { tone: 'physics' }), op('object.dynamicpaint_toggle', {}, { tone: 'physics' }),
      op('ptcache.bake_all', {}, { tone: 'render' }),
    ].filter(Boolean) },
  ];
}

/** The panel itself; `app.settings` keeps whether it and each section are folded. */
export function createLibraryPanel(app, { saveSettings }) {
  const settings = app.settings;
  const body = h('div', { className: 'library', dataset: { testid: 'library' } });
  const search = h('input', { type: 'search', className: 'library-search', placeholder: t('Search tools and libraries', '도구와 라이브러리 검색'), dataset: { testid: 'library-search' }, onInput: () => fill() });
  search.addEventListener('keydown', (e) => e.stopPropagation());
  const list = h('div', { className: 'library-sections' });
  body.append(search, list);
  let sections = [];
  const closed = () => (settings.libraryClosed ??= {});
  const fill = () => {
    sections = librarySections(app);
    const needle = search.value.trim().toLowerCase();
    replace(list, ...sections.map((section) => {
      const items = section.items.filter((item) => !needle || item.label.toLowerCase().includes(needle) || section.title.toLowerCase().includes(needle));
      if (needle && !items.length) return null;
      const open = needle ? true : !closed()[section.id];
      const head = h('button', { type: 'button', className: 'library-head', ariaExpanded: String(open), dataset: { testid: `library-head-${section.id}` }, onClick: () => { closed()[section.id] = open; saveSettings(); fill(); } },
        icon(open ? 'down' : 'right', 10), icon(section.icon, 14), h('span', { className: 'grow' }, section.title), h('span', { className: 'library-count' }, String(items.length)));
      const grid = open ? h('div', { className: 'library-grid' }, items.map((item) => {
        const mark = icon(item.icon, 15);
        mark.style.color = TONE[item.tone] ?? 'var(--accent)';
        const button = h('button', {
          type: 'button', className: 'library-item', title: item.tip + (item.drag ? t(' — click, or drag into a 3D view', ' — 누르거나 3D 뷰로 끌어 놓기') : ''), draggable: Boolean(item.drag),
          dataset: { testid: `library-${item.id.replace(/[^a-z0-9_.-]+/gi, '-').replace(/-+$/, '')}`, item: item.id },
          onClick: () => { item.run(); app.invalidate(); },
          onDragstart: (e) => { if (!item.drag) return; e.dataTransfer.setData(LIBRARY_MIME, JSON.stringify(item.drag)); e.dataTransfer.effectAllowed = 'copy'; },
        }, item.swatch ? h('span', { className: 'library-swatch', style: { background: `rgb(${item.swatch.map((c) => Math.round(Math.min(1, c) ** (1 / 2.2) * 255)).join(',')})` } }) : mark, h('span', { className: 'library-label' }, item.label));
        return button;
      })) : null;
      return h('section', { className: `library-section${open ? ' open' : ''}`, dataset: { testid: `library-section-${section.id}` } }, head, grid);
    }));
    syncEnabled();
  };
  // Items that cannot run now are dimmed, not hidden, so the panel keeps its shape.
  const syncEnabled = () => {
    const byId = new Map(sections.flatMap((s) => s.items).map((i) => [i.id, i]));
    for (const el of list.querySelectorAll('.library-item')) {
      const item = byId.get(el.dataset.item);
      let ok = true;
      try { ok = item?.enabled ? Boolean(item.enabled()) : true; } catch { ok = false; }
      el.classList.toggle('dim', !ok);
    }
  };
  const root = sidePanel({ id: 'library', side: 'left', icon: 'ed-assets', title: () => t('Tools & Library', '도구와 라이브러리'), body, store: settings, onChange: () => { saveSettings(); app.invalidate(); app.requestFrame?.(); } });
  fill();
  let lastKey = '';
  return {
    root,
    rebuild: () => { search.placeholder = t('Search tools and libraries', '도구와 라이브러리 검색'); fill(); root.querySelector('.side-title') && (root.querySelector('.side-title').textContent = t('Tools & Library', '도구와 라이브러리')); },
    /** Called on every change: what can run follows the selection and mode; new file assets appear. */
    update() {
      const key = `${app.doc.mode}|${app.doc.activeId}|${app.doc.selected.length}|${fileAssets(app.doc).length}|${getLanguage()}`;
      if (key === lastKey) return;
      const languageChanged = !lastKey.endsWith(`|${getLanguage()}`);
      lastKey = key;
      if (languageChanged || list.querySelectorAll('.library-item').length === 0) fill(); else syncEnabled();
    },
  };
}

/** Using an item without a drop (a click), or with one: { point, objectId } in the 3D view. */
export function useLibraryItem(app, item, drop = null) {
  const doc = app.doc;
  if (item.kind === 'op') {
    if (drop) {
      const cursor = [...doc.cursor];
      doc.cursor = drop.point;
      try { app.op(item.id, item.props ?? {}); } finally { app.doc.cursor = cursor; }
      app.invalidate();
      return true;
    }
    app.op(item.id, item.props ?? {});
    return true;
  }
  if (item.kind === 'asset') {
    const asset = [...BUILTIN_ASSETS, ...fileAssets(doc), ...userLibrary()].find((a) => a.id === item.id);
    if (!asset) return false;
    if (asset.kind === 'MATERIAL' && drop?.objectId) {
      const target = getObject(doc, drop.objectId);
      if (target) selectOnly(doc, target);
    }
    const cursor = [...doc.cursor];
    if (drop && asset.kind !== 'MATERIAL') doc.cursor = drop.point;
    const made = applyAsset(doc, asset, getLanguage());
    doc.cursor = cursor;
    if (!made) { app.status(t('Select an object to give this material to', '이 재질을 줄 오브젝트를 선택하세요'), true); return false; }
    app.commit(t(`Use ${assetName(asset, 'en')}`, `${assetName(asset, 'ko')} 사용`));
    app.status(t(`${assetName(asset, 'en')} added`, `${assetName(asset, 'ko')} 추가됨`));
    return true;
  }
  return false;
}
