// The Properties editor: tabs for render, output, view layer, scene, world, object, modifiers, particles, physics,
// constraints, object data and material. Every field goes through app.changed, so it is undoable and redraws the views.
import { BONE_CONSTRAINTS } from '../../core/armature.js';
import { BAKE_TYPES } from '../../core/bake.js';
import { GP_EASINGS, GP_MODIFIERS, GP_SCULPT_TOOLS } from '../../core/gpencil.js';
import { FIELD_KINDS, RIGID_SHAPES } from '../../core/physics.js';
import { RIGID_CONSTRAINT_PROPS, RIGID_CONSTRAINT_TYPES } from '../../core/rigid.js';
import { CONSTRAINTS, CONSTRAINT_GROUPS, GEOMETRY_TYPES, activeObject, getMaterial } from '../../core/doc.js';
import { insertKey } from '../../core/anim.js';
import { MODIFIERS } from '../../core/modifiers.js';
import { simBaked } from '../../core/simulation.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { enumName, nameOf, propName, t } from '../i18n.js';
import { openMenu, openMenuBelow } from '../menus.js';
import { button, colorField, emptyNote, numField, panel, row, select, textField, toggle, vecField } from '../widgets.js';

const TABS = [
  ['render', 'render', 'Render', '렌더'], ['output', 'output', 'Output', '출력'], ['viewlayer', 'view-layer', 'View Layer', '뷰 레이어'], ['scene', 'scene', 'Scene', '장면'], ['world', 'world', 'World', '월드'], null,
  ['object', 'object', 'Object', '오브젝트'], ['modifiers', 'modifier', 'Modifiers', '모디파이어'], ['particles', 'particles', 'Particles', '파티클'], ['physics', 'physics', 'Physics', '물리'], ['constraints', 'constraint', 'Constraints', '컨스트레인트'], ['data', 'data', 'Object Data', '오브젝트 데이터'], ['material', 'material', 'Material', '재질'],
];
const NEEDS_OBJECT = new Set(['object', 'modifiers', 'particles', 'physics', 'constraints', 'data', 'material']);
const NEEDS_MESH = new Set(['particles', 'physics']);
const NEEDS_GEOMETRY = new Set(['modifiers', 'material']);

export function createProperties(app, el, area) {
  const state = area.state ??= { tab: area.tab ?? 'object', slot: 0 };
  const tabsEl = h('div', { className: 'props-tabs', dataset: { testid: 'props-tabs' } });
  const content = h('div', { className: 'props-content scroll-y', dataset: { testid: 'props-content' } });
  const root = h('div', { className: 'props-layout', dataset: { testid: 'properties' } }, tabsEl, content);
  el.append(root);

  /** Binds a field of a target object: number, colour, toggle, list or text. `path` is a key on target. */
  const changed = (label) => (v, final) => app.changed(label, final);
  const animatable = (target, key, control, index) => {
    if (!target.id || !['location', 'rotation', 'scale'].includes(key) === false) return control;
    return control;
    void index;
  };
  const num = (target, key, label, opts = {}) => row(label ?? propName(key), numField({ value: target[key] ?? opts.def, testid: opts.testid ?? `prop-${key}`, step: opts.step ?? 0.1, min: opts.min, max: opts.max, int: opts.int, suffix: opts.suffix, onChange: (v, final) => { target[key] = v; app.changed(label ?? key, final); } }));
  const col = (target, key, label) => row(label ?? propName(key), colorField({ value: target[key], testid: `prop-${key}`, onChange: (v, final) => { target[key] = v; app.changed(label ?? key, final); } }));
  const chk = (target, key, label) => toggle({ value: target[key], label: label ?? propName(key), testid: `prop-${key}`, onChange: (v) => { target[key] = v; app.changed(label ?? key, true); } });
  const sel = (target, key, options, label) => row(label ?? propName(key), select({ value: target[key], options, testid: `prop-${key}`, onChange: (v) => { target[key] = v; app.changed(label ?? key, true); } }));
  const ikObject = (bone, key, label, i) => row(label, select({ value: bone.ik[key] ?? '', options: [['', t('(none)', '(없음)')], ...app.doc.objects.filter((o) => o.type !== 'ARMATURE').map((o) => [o.id, o.name])], testid: `ik-${key}-${i}`, onChange: (v) => { bone.ik[key] = v || null; app.changed(label, true); } }));
  const txt = (target, key, label) => row(label ?? propName(key), textField({ value: target[key], testid: `prop-${key}`, onChange: (v) => { target[key] = v; app.changed(label ?? key, true); } }));
  const vec = (target, key, label, opts = {}) => [h('div', { className: 'note-line' }, label), vecField({ value: [...target[key]], step: opts.step ?? 0.1, testid: `prop-${key}`, onChange: (next, final) => { target[key] = next; app.changed(label, final); } })];

  const objectChoices = (kind) => [[null, t('(none)', '(없음)')], ...app.doc.objects.filter((o) => o.id !== app.doc.activeId && (kind === true || o.type === kind)).map((o) => [o.id, o.name])];

  /** A generic form from a table of property specs (modifiers, constraints). */
  /** Lists a constraint picks from: clips, a clip's tracks, cache files, a cache's paths, an armature's bones. */
  const choicesFor = (target, p) => {
    const none = [['', t('(none)', '(없음)')]];
    const clip = () => (app.doc.clips ?? []).find((c) => c.id === target.clip) ?? (app.doc.clips ?? [])[0];
    if (p.choices === 'clips') return [...none, ...(app.doc.clips ?? []).filter((c) => c.kind !== 'SOUND').map((c) => [c.id, c.name])];
    if (p.choices === 'tracks') return [...none, ...(clip()?.tracks ?? []).map((x) => [x.name, x.name])];
    if (p.choices === 'caches') return [...none, ...(app.doc.caches ?? []).map((c) => [c.id, c.name])];
    if (p.choices === 'cachePaths') return [...none, ...Object.keys((app.doc.caches ?? []).find((c) => c.id === target.cache)?.samples ?? {}).map((x) => [x, x])];
    const rig = app.doc.objects.find((o) => o.id === target[p.bone]);
    return [...none, ...(rig?.type === 'ARMATURE' ? rig.data.bones.map((b) => [b.name, b.name]) : [])];
  };
  const specForm = (target, props) => Object.entries(props).map(([key, p]) => {
    if (p.choices || p.bone) return row(propName(key), select({ value: target[key] ?? '', options: choicesFor(target, p), testid: `prop-${key}`, onChange: (v) => { target[key] = v; app.changed(key, true); } }));
    if (p.action) return row(t('Action', '액션'), select({ value: target[key] ?? '', options: [['', t('(none)', '(없음)')], ...(app.doc.actions ?? []).map((a) => [a.id, a.name])], testid: `prop-${key}`, onChange: (v) => { target[key] = v; app.changed(key, true); } }));
    if (p.object !== undefined) return row(propName(key), select({ value: target[key], options: objectChoices(p.object), testid: `prop-${key}`, onChange: (v) => { target[key] = v || null; app.changed(key, true); } }));
    if (p.options) return sel(target, key, p.options);
    if (typeof p.def === 'boolean') return chk(target, key);
    if (typeof p.def === 'number') return num(target, key, null, { step: p.step, min: p.min, max: p.max, int: p.int });
    return txt(target, key);
  });

  // A bone may answer to any object, itself included (its own bones through the Bone field): unlike objects' constraints.
  const boneConstraintForm = (c) => Object.entries(BONE_CONSTRAINTS[c.type].props).map(([key, p]) => {
    if (p.action) return row(t('Action', '액션'), select({ value: c[key] ?? '', options: [['', t('(none)', '(없음)')], ...(app.doc.actions ?? []).map((a) => [a.id, a.name])], testid: `prop-${key}`, onChange: (v) => { c[key] = v; app.changed(key, true); } }));
    if (p.object !== undefined) return row(propName(key), select({ value: c[key], options: [[null, t('(none)', '(없음)')], ...app.doc.objects.filter((o) => c.type !== 'SPLINE_IK' || o.type === 'CURVE').map((o) => [o.id, o.name])], testid: `prop-${key}`, onChange: (v) => { c[key] = v || null; app.changed(key, true); } }));
    return specForm(c, { [key]: p })[0];
  });

  const tabRender = () => {
    const r = app.doc.render;
    return [
      panel('r-freestyle', t('Freestyle', 'Freestyle'), (() => { r.freestyle ??= { enabled: false, thickness: 1.5, color: [0, 0, 0], crease: 40, silhouette: true, border: true, creases: true }; const f = r.freestyle; return [chk(f, 'enabled', t('Draw Lines', '선 그리기')), num(f, 'thickness', t('Thickness', '두께'), { step: 0.25, min: 0.25 }), num(f, 'crease', t('Crease Angle', '크리즈 각도'), { step: 5, min: 0, max: 180 }), chk(f, 'silhouette', t('Silhouettes', '실루엣')), chk(f, 'creases', t('Creases', '크리즈')), chk(f, 'border', t('Borders', '경계')), row(t('Color', '색'), colorField({ value: f.color, onChange: (v, final) => { f.color = v; app.changed('Line Color', final); } }))]; })(), { closed: true }),
      panel('r-engine', t('Render Engine', '렌더 엔진'), [
        sel(r, 'engine', [['PATH', t('Path Tracing (CPU)', '경로 추적 (CPU)')], ['GPU', t('Path Tracing (GPU)', '경로 추적 (GPU)')], ['REALTIME', t('Real-time (GPU)', '실시간 (GPU)')]], t('Engine', '엔진')),
        num(r, 'samples', t('Samples', '샘플'), { int: true, min: 1, max: 10000, step: 1 }),
        num(r, 'bounces', t('Light Bounces', '빛 반사 횟수'), { int: true, min: 0, max: 64, step: 1 }),
        chk(r, 'denoise', t('Denoise', '디노이즈')),
        num(r, 'seed', t('Seed', '시드'), { int: true, min: 0, step: 1 }),
      ], { icon: 'render' }),
      panel('r-film', t('Film and Color', '필름과 색'), [
        chk(r, 'filmTransparent', t('Transparent Background', '투명 배경')),
        sel(r, 'viewTransform', ['FILMIC', 'STANDARD'], t('View Transform', '뷰 변환')),
        num(r, 'exposure', t('Exposure', '노출'), { step: 0.1 }),
        num(r, 'gamma', t('Gamma', '감마'), { step: 0.05, min: 0.1 }),
      ]),
      panel('r-bake', t('Bake', '베이크'), (() => {
        const b = (r.bake ??= { type: 'DIFFUSE', size: 512, distance: 0.5 });
        return [
          sel(b, 'type', BAKE_TYPES, t('Type', '종류')),
          num(b, 'size', t('Size', '크기'), { int: true, min: 8, max: 8192, step: 64, suffix: ' px' }),
          num(b, 'distance', t('Distance', '거리'), { step: 0.05, min: 0.001 }),
          button(t('Bake', '베이크'), () => app.op('object.bake', { type: b.type, size: b.size, distance: b.distance }), { className: 'block', testid: 'bake-run' }),
          button(t('Bake from Multiresolution', '멀티레졸루션에서 베이크'), () => app.op('object.bake', { type: b.type === 'NORMAL' ? 'NORMAL' : 'DISPLACEMENT', size: b.size, distance: b.distance, fromMultires: true }), { className: 'block', testid: 'bake-multires' }),
        ];
      })(), { icon: 'render', closed: true }),
      panel('r-run', t('Render', '렌더'), [
        button(t('Render Image', '이미지 렌더'), () => app.op('render.render'), { icon: 'render', className: 'block primary', testid: 'render-image' }),
        button(t('Render Animation', '애니메이션 렌더'), () => app.op('render.animation'), { icon: 'play', className: 'block' }),
      ]),
    ];
  };
  const tabOutput = () => {
    const r = app.doc.render;
    const doc = app.doc;
    return [
      panel('o-format', t('Format', '형식'), [
        num(r, 'width', t('Resolution X', '해상도 X'), { int: true, min: 1, step: 1, suffix: ' px' }),
        num(r, 'height', t('Resolution Y', '해상도 Y'), { int: true, min: 1, step: 1, suffix: ' px' }),
        num(r, 'percent', t('Scale', '배율'), { int: true, min: 1, max: 1000, step: 5, suffix: ' %' }),
        num(doc, 'fps', t('Frame Rate', '프레임 속도'), { int: true, min: 1, max: 240, step: 1, suffix: ' fps' }),
        (r.movieFormat ??= 'PNG', sel(r, 'movieFormat', ['PNG', 'MP4', 'AVI'], t('Animation File', '애니메이션 파일'))),
      ], { icon: 'output' }),
      panel('o-range', t('Frame Range', '프레임 범위'), [
        num(doc, 'frameStart', t('Frame Start', '시작 프레임'), { int: true, step: 1 }),
        num(doc, 'frameEnd', t('End', '끝'), { int: true, step: 1 }),
        num(doc, 'frameStep', t('Step', '단계'), { int: true, min: 1, step: 1 }),
      ]),
    ];
  };
  /** Which light group an object or the world adds to: one of the view layer's, or one it names that the view layer lacks. */
  const lightGroupField = (target) => {
    const names = (app.doc.viewLayers[0].lightGroups ?? []).map((g) => g.name);
    const stray = target.lightGroup && !names.includes(target.lightGroup) ? [[target.lightGroup, `${target.lightGroup} (${t('not in the view layer', '뷰 레이어에 없음')})`]] : [];
    return row(t('Light Group', '라이트 그룹'), select({ value: target.lightGroup ?? '', options: [['', t('(none)', '(없음)')], ...names.map((n) => [n, n]), ...stray], testid: 'prop-lightGroup', onChange: (v) => { target.lightGroup = v || undefined; app.changed('Light Group', true); } }));
  };
  const tabViewLayer = () => {
    const layer = app.doc.viewLayers[0];
    return [
      panel('vl', t('Passes', '패스'), [
        txt(layer, 'name', t('Name', '이름')),
        chk(layer.usePass, 'combined', t('Combined', '결합')),
        chk(layer.usePass, 'z', t('Depth', '깊이')),
        chk(layer.usePass, 'normal', t('Normal', '노멀')),
      ], { icon: 'view-layer' }),
      // The light passes: the path tracer always gathers them; these put them on the Render Layers node.
      panel('vl-light', t('Light', '빛'), [
        ...[['Diffuse', '디퓨즈'], ['Glossy', '글로시'], ['Transmission', '투과']].flatMap(([en, ko]) => [
          h('div', { className: 'sub-head' }, t(en, ko)),
          chk(layer.usePass, `${en.toLowerCase()}Direct`, t('Direct', '직접')), chk(layer.usePass, `${en.toLowerCase()}Indirect`, t('Indirect', '간접')), chk(layer.usePass, `${en.toLowerCase()}Color`, t('Color', '색')),
        ]),
        h('div', { className: 'sub-head' }, t('Volume', '볼륨')),
        chk(layer.usePass, 'volumeDirect', t('Direct', '직접')), chk(layer.usePass, 'volumeIndirect', t('Indirect', '간접')),
        h('div', { className: 'sub-head' }, t('Other', '기타')),
        chk(layer.usePass, 'emit', t('Emission', '방출')), chk(layer.usePass, 'environment', t('Environment', '환경')), chk(layer.usePass, 'ambientOcclusion', t('Ambient Occlusion', '앰비언트 오클루전')),
        h('div', { className: 'sub-head' }, t('Data', '데이터')),
        chk(layer.usePass, 'mist', t('Mist', '안개')),
      ], { closed: true }),
      panel('vl-crypto', t('Cryptomatte', '크립토매트'), [chk(layer.usePass, 'cryptoObject', t('Object', '오브젝트')), chk(layer.usePass, 'cryptoMaterial', t('Material', '재질')), chk(layer.usePass, 'cryptoAsset', t('Asset', '애셋'))], { closed: true }),
      panel('vl-groups', t('Light Groups', '라이트 그룹'), [
        ...(layer.lightGroups ?? []).map((g, i) => h('div', { className: 'sub-head' },
          textField({ value: g.name, testid: `lightgroup-${i}`, onChange: (v) => {
            const old = g.name;
            g.name = v.trim() || old;
            // Renaming a group renames it where it is used.
            for (const o of app.doc.objects) if (o.lightGroup === old) o.lightGroup = g.name;
            if (app.doc.world.lightGroup === old) app.doc.world.lightGroup = g.name;
            app.changed('Light Group', true);
          } }),
          h('button', { type: 'button', className: 'icon-btn', dataset: { testid: `lightgroup-remove-${i}` }, onClick: () => app.op('scene.view_layer_remove_lightgroup', { index: i }) }, icon('close', 12)))),
        h('div', { className: 'btn-row' },
          button(t('Add Used', '사용 중인 것 추가'), () => app.op('scene.view_layer_add_used_lightgroups'), { testid: 'lightgroup-add-used' }),
          button(t('Remove Unused', '안 쓰는 것 제거'), () => app.op('scene.view_layer_remove_unused_lightgroups'), { testid: 'lightgroup-remove-unused' })),
      ], { closed: !(layer.lightGroups ?? []).length, actions: h('button', { type: 'button', className: 'icon-btn', title: t('Add Light Group', '라이트 그룹 추가'), dataset: { testid: 'lightgroup-add' }, onClick: () => app.op('scene.view_layer_add_lightgroup') }, icon('add', 12)) }),
    ];
  };
  const tabScene = () => {
    const doc = app.doc;
    return [
      panel('s-scene', t('Scene', '장면'), [
        row(t('Camera', '카메라'), select({ value: doc.activeCamera, options: [[null, t('(none)', '(없음)')], ...doc.objects.filter((o) => o.type === 'CAMERA').map((o) => [o.id, o.name])], testid: 'prop-activeCamera', onChange: (v) => { doc.activeCamera = v || null; app.changed('Active Camera', true); } })),
        ...vec(doc, 'cursor', t('3D Cursor', '3D 커서')),
      ], { icon: 'scene' }),
      panel('s-gravity', t('Gravity', '중력'), vec(doc, 'gravity', t('Gravity', '중력'), { step: 0.1 })),
      panel('s-units', t('Units', '단위'), [sel(doc, 'unitSystem', ['METRIC', 'IMPERIAL'], t('Unit System', '단위계')), num(doc, 'unitScale', t('Unit Scale', '단위 배율'), { step: 0.1, min: 0.0001 })]),
      panel('s-compositor', t('Compositing', '합성'), [
        chk(doc, 'compositorEnabled', t('Use Compositor Nodes', '컴포지터 노드 사용')),
        !doc.compositor ? button(t('Create Compositor Tree', '컴포지터 트리 만들기'), () => app.op('compositor.use_nodes'), { className: 'block' }) : null,
      ]),
    ];
  };
  const tabWorld = () => {
    const w = app.doc.world;
    return [panel('w-surface', t('Surface', '표면'), [
      col(w, 'color', t('Color', '색')),
      num(w, 'strength', t('Strength', '강도'), { step: 0.1, min: 0 }),
      w.useNodes ? h('div', { className: 'note-line' }, t('Node tree is in use: edit it in the Node Editor (World).', '노드 트리를 쓰는 중입니다. 노드 에디터(월드)에서 편집하세요.')) : button(t('Use Nodes', '노드 사용'), () => app.op('world.use_nodes'), { className: 'block', testid: 'world-use-nodes' }),
      w.useNodes ? chk(w, 'useNodes', t('Use Nodes', '노드 사용')) : null,
    ], { icon: 'world' }),
    panel('w-mist', t('Mist Pass', '안개 패스'), [
      num(w.mist ??= { start: 5, depth: 25, falloff: 'QUADRATIC' }, 'start', t('Start', '시작'), { step: 0.5, min: 0 }),
      num(w.mist, 'depth', t('Depth', '깊이'), { step: 0.5, min: 0.001 }),
      sel(w.mist, 'falloff', ['QUADRATIC', 'LINEAR', 'INVERSE_QUADRATIC'], t('Falloff', '감쇠')),
    ], { closed: true }),
    panel('w-ao', t('Ambient Occlusion', '앰비언트 오클루전'), [num(w, 'aoDistance', t('Distance', '거리'), { step: 0.5, min: 0.001, def: 10 })], { closed: true }),
    panel('w-lightgroup', t('Light Group', '라이트 그룹'), [lightGroupField(w)], { closed: !w.lightGroup })];
  };
  const tabObject = (obj) => {
    const items = [
      panel('ob-transform', t('Transform', '트랜스폼'), [
        ...vec(obj, 'location', t('Location', '위치')),
        ...vec(obj, 'rotation', t('Rotation', '회전'), { step: 1 }),
        ...vec(obj, 'scale', t('Scale', '크기'), { step: 0.05 }),
        sel(obj, 'rotationMode', ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'], t('Rotation Mode', '회전 순서')),
        h('div', { className: 'btn-row' },
          button(t('Key', '키'), () => app.op('anim.keyframe_insert'), { icon: 'keyframe', testid: 'key-transform', title: t('Insert a keyframe on location, rotation and scale', '위치·회전·크기에 키프레임 삽입') })),
      ], { icon: 'tool-transform' }),
      panel('ob-relations', t('Relations', '관계'), [
        row(t('Parent', '부모'), select({ value: obj.parent, options: objectChoices(true), testid: 'prop-parent', onChange: (v) => { obj.parent = v || null; if (!v) delete obj.parentInverse; app.changed('Parent', true); } })),
        row(t('Collection', '컬렉션'), select({ value: obj.collection, options: app.doc.collections.map((c) => [c.id, c.name]), testid: 'prop-collection', onChange: (v) => { obj.collection = v; app.changed('Collection', true); } })),
      ], { closed: true }),
      panel('ob-visibility', t('Visibility', '표시'), [
        chk(obj, 'hide', t('Hide in Viewport', '뷰포트에서 숨기기')),
        chk(obj, 'hideRender', t('Hide in Renders', '렌더에서 숨기기')),
        chk(obj, 'hideSelect', t('Not Selectable', '선택 불가')),
        chk(obj, 'showWire', t('Show Wireframe', '와이어프레임 표시')),
      ], { closed: true }),
      panel('ob-passindex', t('Pass Index', '패스 인덱스'), [num(obj, 'passIndex', t('Pass Index', '패스 인덱스'), { int: true, step: 1, min: 0, def: 0 })], { closed: true }),
      ...(obj.type === 'LIGHT' || GEOMETRY_TYPES.has(obj.type) ? [panel('ob-shading', t('Shading', '셰이딩'), [lightGroupField(obj)], { closed: !obj.lightGroup })] : []),
      panel('ob-custom', t('Drivers', '드라이버'), [
        ...(obj.drivers ?? []).map((d, i) => h('div', { className: 'sub-panel' },
          h('div', { className: 'sub-head' }, h('span', { className: 'name' }, d.path), h('button', { type: 'button', className: 'icon-btn', onClick: () => { obj.drivers.splice(i, 1); app.changed('Remove Driver', true); } }, icon('close', 12))),
          txt(d, 'path', t('Property', '속성')), txt(d, 'expression', t('Expression', '식')))),
        button(t('Add Driver', '드라이버 추가'), () => app.op('object.driver_add'), { icon: 'add', className: 'block' }),
      ], { closed: true }),
    ];
    return items;
  };
  const tabModifiers = (obj) => {
    const groups = { generate: t('Generate', '생성'), deform: t('Deform', '변형') };
    const addMenu = () => Object.entries(groups).map(([key, label]) => ({
      label,
      items: Object.entries(MODIFIERS).filter(([, m]) => m.group === key).map(([type, m]) => ({ label: nameOf(m), icon: m.icon, testid: `add-mod-${type}`, disabled: !app.canRun('object.modifier_add'), onClick: () => app.op('object.modifier_add', { type }) })),
    }));
    const list = [button(t('Add Modifier', '모디파이어 추가'), (e) => openMenuBelow(e.currentTarget, addMenu()), { icon: 'add', className: 'block', testid: 'add-modifier' })];
    if (!app.canRun('object.modifier_add') && app.doc.mode !== 'OBJECT') list.push(h('div', { className: 'note-line' }, t('Modifiers can be added in Object Mode.', '모디파이어는 오브젝트 모드에서 추가할 수 있습니다.')));
    obj.modifiers.forEach((mod, index) => {
      const spec = MODIFIERS[mod.type];
      list.push(panel(`mod-${obj.id}-${index}`, nameOf(spec), [
        ...specForm(mod, spec.props),
        mod.type === 'NODES' ? button(t('Open in Node Editor', '노드 에디터에서 열기'), () => app.setWorkspace('geonodes'), { className: 'block' }) : null,
        h('div', { className: 'btn-row' },
          button(t('Apply', '적용'), () => app.op('object.modifier_apply', { index }), { testid: `mod-apply-${index}`, disabled: !app.canRun('object.modifier_apply') })),
          mod.type === 'MULTIRES' ? button(t('Subdivide', '세분화'), () => app.op('object.multires_subdivide'), { className: 'block', testid: 'mod-multires-subdivide' }) : null,
      ], {
        icon: spec.icon,
        actions: [
          h('button', { type: 'button', className: 'icon-btn', title: t('Show in Viewport', '뷰포트에 표시'), style: { color: mod.show === false ? '' : 'var(--accent)' }, dataset: { testid: `mod-show-${index}` }, onClick: () => { mod.show = mod.show === false; app.changed('Toggle Modifier', true); } }, icon(mod.show === false ? 'eye-off' : 'eye', 13)),
          h('button', { type: 'button', className: 'icon-btn', title: t('Show in Renders', '렌더에 표시'), style: { color: mod.showRender === false ? '' : 'var(--accent)' }, onClick: () => { mod.showRender = mod.showRender === false; app.changed('Toggle Modifier', true); } }, icon('camera-render', 13)),
          h('button', { type: 'button', className: 'icon-btn', title: t('Move up', '위로'), onClick: () => app.op('object.modifier_move', { index, to: index - 1 }) }, icon('up', 11)),
          h('button', { type: 'button', className: 'icon-btn', title: t('Move down', '아래로'), onClick: () => app.op('object.modifier_move', { index, to: index + 1 }) }, icon('down', 11)),
          h('button', { type: 'button', className: 'icon-btn', title: t('Remove', '제거'), dataset: { testid: `mod-remove-${index}` }, onClick: () => app.op('object.modifier_remove', { index }) }, icon('close', 12)),
        ],
      }));
    });
    if (!obj.modifiers.length) list.push(emptyNote(t('No modifiers', '모디파이어 없음')));
    return list;
  };
  const tabParticles = (obj) => {
    const list = [h('div', { className: 'btn-row' },
      button(t('Add Emitter', '방출기 추가'), () => app.op('object.particle_system_add', { kind: 'EMITTER' }), { icon: 'add', testid: 'add-particles' }),
      button(t('Add Hair', '헤어 추가'), () => app.op('object.particle_system_add', { kind: 'HAIR' }), { icon: 'add' }))];
    (obj.particles ?? []).forEach((p, index) => {
      list.push(panel(`ps-${index}`, p.name, [
        txt(p, 'name', t('Name', '이름')),
        num(p, 'count', t('Number', '개수'), { int: true, min: 0, step: 10 }),
        p.kind === 'HAIR' ? [num(p, 'hairLength', null, { step: 0.05, min: 0 }), num(p, 'hairSegments', null, { int: true, min: 1, step: 1 })] : [
          num(p, 'frameStart', null, { step: 1 }), num(p, 'frameEnd', null, { step: 1 }), num(p, 'lifetime', null, { step: 1, min: 1 }),
          num(p, 'velocity', null, { step: 0.1 }), num(p, 'randomVelocity', null, { step: 0.1, min: 0 }), num(p, 'gravity', null, { step: 0.1 }),
        ],
        num(p, 'seed', null, { int: true, min: 0, step: 1 }),
        p.kind === 'HAIR' ? null : num(p, 'bounce', null, { step: 0.05, min: 0, max: 1 }),
        num(p, 'children', null, { int: true, min: 0, step: 1 }), num(p, 'childRadius', null, { step: 0.01, min: 0 }),
        p.kind === 'HAIR' ? null : sel(p, 'renderAs', ['POINT', 'OBJECT']),
        p.kind === 'HAIR' ? null : row(propName('instanceObject'), select({ value: p.instanceObject, options: objectChoices('MESH'), testid: 'prop-instanceObject', onChange: (v) => { p.instanceObject = v || null; app.changed('instanceObject', true); } })),
        p.kind === 'HAIR' ? null : num(p, 'size', null, { step: 0.01, min: 0.001 }),
      ].filter(Boolean), { icon: 'particles', actions: h('button', { type: 'button', className: 'icon-btn', onClick: () => app.op('object.particle_system_remove', { index }) }, icon('close', 12)) }));
    });
    if (!obj.particles?.length) list.push(emptyNote(t('No particle systems', '파티클 시스템 없음')));
    return list;
  };
  const tabPhysics = (obj) => {
    const out = [panel('ph-add', t('Enable Physics', '물리 켜기'), [
      h('div', { className: 'btn-row' },
        button(t('Rigid Body', '강체'), () => (obj.rigidBody ? app.op('rigidbody.object_remove') : app.op('rigidbody.object_add')), { className: obj.rigidBody ? 'primary' : '', testid: 'phys-rigid' }),
        button(t('Cloth', '천'), () => app.op('object.cloth_toggle'), { className: obj.cloth ? 'primary' : '', testid: 'phys-cloth' })),
      h('div', { className: 'btn-row' },
        button(t('Soft Body', '소프트 바디'), () => app.op('object.softbody_toggle'), { className: obj.softBody ? 'primary' : '', testid: 'phys-soft' }),
        button(t('Collision', '충돌'), () => app.op('object.collision_toggle'), { className: obj.collision ? 'primary' : '', testid: 'phys-collision' })),
      h('div', { className: 'btn-row' },
        button(t('Smoke Domain', '연기 도메인'), () => app.op('object.smoke_domain_toggle'), { className: obj.smoke ? 'primary' : '', testid: 'phys-smoke-domain' }),
        button(t('Smoke Flow', '연기 흐름'), () => app.op('object.smoke_flow_toggle'), { className: obj.smokeFlow ? 'primary' : '', testid: 'phys-smoke-flow' })),
      h('div', { className: 'btn-row' },
        button(t('Liquid Domain', '액체 도메인'), () => app.op('object.fluid_domain_toggle'), { className: obj.fluid ? 'primary' : '', testid: 'phys-fluid-domain' }),
        button(t('Liquid Flow', '액체 흐름'), () => app.op('object.fluid_flow_toggle'), { className: obj.fluidFlow ? 'primary' : '', testid: 'phys-fluid-flow' })),
      h('div', { className: 'btn-row' },
        button(t('Paint Canvas', '페인트 캔버스'), () => app.op('object.dynamicpaint_toggle', { role: 'CANVAS' }), { className: obj.dynamicPaint?.role === 'CANVAS' ? 'primary' : '', testid: 'phys-paint-canvas' }),
        button(t('Paint Brush', '페인트 브러시'), () => app.op('object.dynamicpaint_toggle', { role: 'BRUSH' }), { className: obj.dynamicPaint?.role === 'BRUSH' ? 'primary' : '', testid: 'phys-paint-brush' })),
    ], { icon: 'physics' })];
    if (obj.smoke) {
      const s = obj.smoke;
      out.push(panel('ph-smoke', t('Smoke Domain', '연기 도메인'), [num(s, 'res', t('Resolution', '해상도'), { int: true, step: 4, min: 8, max: 128 }), num(s, 'buoyancy', t('Buoyancy', '부력'), { step: 0.1 }), num(s, 'vorticity', t('Vorticity', '와류'), { step: 0.05, min: 0 }), num(s, 'dissipation', t('Dissipation', '소산'), { step: 0.001, min: 0.9, max: 1 }), num(s, 'density', t('Density', '밀도'), { step: 0.5, min: 0.01 }), row(t('Smoke Color', '연기 색'), colorField({ value: s.colour, onChange: (v, final) => { s.colour = v; app.changed('Smoke Color', final); } })), row(t('Flame Color', '불꽃 색'), colorField({ value: s.flame, onChange: (v, final) => { s.flame = v; app.changed('Flame Color', final); } })), num(s, 'flameStrength', t('Flame Strength', '불꽃 세기'), { step: 1, min: 0 }), h('div', { className: 'note-line' }, simBaked(obj) ? t('Baked', '베이크됨') : t('Not baked yet: press Bake All Simulations', '아직 베이크 전: 모든 시뮬레이션 베이크를 누르세요'))]));
    }
    if (obj.smokeFlow) {
      const s = obj.smokeFlow;
      out.push(panel('ph-smoke-flow', t('Smoke Flow', '연기 흐름'), [sel(s, 'kind', ['SMOKE', 'FIRE', 'BOTH'], t('Type', '종류')), num(s, 'amount', t('Amount', '양'), { step: 0.1, min: 0 }), num(s, 'temperature', t('Heat', '열'), { step: 0.1 }), num(s, 'start', t('Start', '시작'), { int: true, step: 1 }), num(s, 'end', t('End', '끝'), { int: true, step: 1 })]));
    }
    if (obj.fluid) {
      const s = obj.fluid;
      out.push(panel('ph-fluid', t('Liquid Domain', '액체 도메인'), [num(s, 'res', t('Resolution', '해상도'), { int: true, step: 2, min: 6, max: 64 }), num(s, 'flip', t('FLIP Ratio', 'FLIP 비율'), { step: 0.01, min: 0, max: 1 }), num(s, 'particlesPerCell', t('Particles per Cell', '셀당 입자'), { int: true, step: 1, min: 1, max: 27 }),
        (s.viscosity ??= 0, num(s, 'viscosity', t('Viscosity', '점성'), { step: 0.01, min: 0 })),
        (s.surfaceTension ??= 0, num(s, 'surfaceTension', t('Surface Tension', '표면 장력'), { step: 0.01, min: 0 })),
        (s.foam ??= false, chk(s, 'foam', t('Foam, Spray and Bubbles', '거품·물보라·기포'))),
        ...(s.foam ? [
          (s.foamThreshold ??= 1.5, num(s, 'foamThreshold', t('Speed Threshold', '속도 기준'), { step: 0.1, min: 0 })),
          (s.foamRate ??= 60, num(s, 'foamRate', t('Rate', '생성량'), { step: 5, min: 0 })),
          (s.foamLife ??= 1.5, num(s, 'foamLife', t('Lifetime', '수명'), { step: 0.1, min: 0.05, suffix: ' s' })),
          (s.foamSize ??= 0.15, num(s, 'foamSize', t('Size', '크기'), { step: 0.01, min: 0.01 })),
          obj.materials.filter(Boolean).length < 2 ? button(t('Add Foam Material', '거품 재질 추가'), () => app.op('object.fluid_foam_material'), { className: 'block', testid: 'fluid-foam-material' }) : null,
        ].filter(Boolean) : []),
        h('div', { className: 'note-line' }, simBaked(obj) ? t('Baked', '베이크됨') : t('Not baked yet: press Bake All Simulations', '아직 베이크 전: 모든 시뮬레이션 베이크를 누르세요'))]));
    }
    if (obj.fluidFlow) {
      const s = obj.fluidFlow;
      out.push(panel('ph-fluid-flow', t('Liquid Flow', '액체 흐름'), [sel(s, 'kind', ['GEOMETRY', 'INFLOW'], t('Type', '종류'))]));
    }
    if (obj.dynamicPaint?.role === 'CANVAS') {
      const s = obj.dynamicPaint;
      s.surface ??= 'PAINT';
      out.push(panel('ph-paint', t('Paint Canvas', '페인트 캔버스'), [sel(s, 'surface', [['PAINT', t('Paint', '페인트')], ['WEIGHT', t('Weight', '웨이트')], ['WAVE', t('Waves', '파동')]], t('Surface', '표면')),
        ...(s.surface === 'WEIGHT' ? [row(t('Output Group', '출력 그룹'), textField({ value: s.outputGroup ?? 'dp_weight', testid: 'prop-outputGroup', onChange: (v) => { s.outputGroup = v || 'dp_weight'; app.changed('Output Group', true); } }))] : []),
        ...(s.surface === 'PAINT' ? [button(t('Save Image Sequence', '이미지 시퀀스 저장'), () => app.op('dpaint.output_images'), { icon: 'image', testid: 'dpaint-images' })] : []),
        ...(s.surface === 'WAVE' ? [(s.waveSpeed ??= 0.4, num(s, 'waveSpeed', t('Wave Speed', '파동 속도'), { step: 0.05, min: 0.01, max: 0.5 })), (s.waveDamping ??= 0.04, num(s, 'waveDamping', t('Damping', '감쇠'), { step: 0.01, min: 0, max: 1 })), (s.waveStrength ??= 0.3, num(s, 'waveStrength', t('Depth', '깊이'), { step: 0.05 }))] : []),
        num(s, 'fade', t('Fade', '옅어짐'), { step: 0.005, min: 0, max: 1 }), num(s, 'spread', t('Spread', '번짐'), { step: 0.05, min: 0, max: 1 }), num(s, 'displace', t('Dent', '패임'), { step: 0.01 }), row(t('Base Color', '바탕색'), colorField({ value: s.base, onChange: (v, final) => { s.base = v; app.changed('Base Color', final); } }))]));
    }
    if (obj.dynamicPaint?.role === 'BRUSH') {
      const s = obj.dynamicPaint;
      out.push(panel('ph-paint-brush', t('Paint Brush', '페인트 브러시'), [num(s, 'radius', t('Radius', '반지름'), { step: 0.05, min: 0.001 }), num(s, 'strength', t('Strength', '세기'), { step: 0.05, min: 0, max: 1 }), row(t('Color', '색'), colorField({ value: s.color, onChange: (v, final) => { s.color = v; app.changed('Brush Color', final); } }))]));
    }
    if (obj.rigidBody) {
      const b = obj.rigidBody;
      out.push(panel('ph-rigid', t('Rigid Body', '강체'), [sel(b, 'type', ['ACTIVE', 'PASSIVE']), chk(b, 'enabled', t('Dynamic', '움직임')), chk(b, 'kinematic', t('Animated', '애니메이션')), sel(b, 'shape', RIGID_SHAPES), num(b, 'angularDamping', null, { step: 0.01, min: 0, max: 1 }), num(b, 'mass', null, { step: 0.1, min: 0.001 }), num(b, 'restitution', null, { step: 0.05, min: 0, max: 1 }), num(b, 'friction', null, { step: 0.05, min: 0, max: 1 }), num(b, 'damping', null, { step: 0.01, min: 0, max: 1 })]));
    }
    {
      const menu = () => RIGID_CONSTRAINT_TYPES.map((type) => ({ label: enumName(type), onClick: () => app.op('rigidbody.connect', { type }) }));
      out.push(panel('ph-rigid-tools', t('Rigid Body Tools', '강체 도구'), [
        button(t('Connect Selected...', '선택한 것 연결...'), (e) => openMenuBelow(e.currentTarget, menu()), { icon: 'constraint', className: 'block', testid: 'rigid-connect' }),
        button(t('Bake to Keyframes', '키프레임으로 베이크'), () => app.op('rigidbody.bake_to_keyframes'), { className: 'block', testid: 'rigid-bake-keys' }),
        obj.rigidConstraint
          ? button(t('Remove Constraint', '제약 제거'), () => app.op('rigidbody.constraint_remove'), { className: 'block', testid: 'rigid-constraint-remove' })
          : button(t('Make a Constraint Here', '여기에 제약 만들기'), () => app.op('rigidbody.constraint_add'), { className: 'block', testid: 'rigid-constraint-add' }),
      ], { icon: 'constraint' }));
    }
    if (obj.rigidConstraint) {
      const c = obj.rigidConstraint;
      out.push(panel('ph-rigid-constraint', t('Rigid Body Constraint', '강체 제약'), [sel(c, 'type', RIGID_CONSTRAINT_TYPES), chk(c, 'enabled', t('Enabled', '켜기')), ...specForm(c, RIGID_CONSTRAINT_PROPS)], { icon: 'constraint' }));
    }
    if (obj.cloth) {
      const c = obj.cloth;
      out.push(panel('ph-cloth', t('Cloth', '천'), [num(c, 'stiffness', null, { step: 0.05, min: 0, max: 1 }), num(c, 'damping', null, { step: 0.01, min: 0, max: 1 }), num(c, 'gravityScale', null, { step: 0.1 }), num(c, 'iterations', null, { int: true, step: 1, min: 1, max: 100 }), num(c, 'pressure', null, { step: 0.5, def: 0 }), chk(c, 'sewing', t('Sewing', '재봉')), num(c, 'sewingForce', null, { step: 0.05, min: 0, max: 1, def: 1 }), chk(c, 'selfCollision', t('Self Collision', '자기 충돌')), num(c, 'selfDistance', null, { step: 0.005, min: 0.001 }), row(propName('pinGroup'), select({ value: c.pinGroup, options: [['', t('(none)', '(없음)')], ...(obj.data.vgroups ?? []).map((g) => [g.name, g.name])], onChange: (v) => { c.pinGroup = v; app.changed('Pin Group', true); } }))]));
    }
    if (obj.softBody) {
      const s = obj.softBody;
      out.push(panel('ph-soft', t('Soft Body', '소프트 바디'), [num(s, 'stiffness', null, { step: 0.05, min: 0, max: 1 }), num(s, 'goal', null, { step: 0.05, min: 0, max: 1 }), num(s, 'damping', null, { step: 0.01, min: 0, max: 1 }), num(s, 'pressure', null, { step: 0.5 }), num(s, 'aero', null, { step: 0.5, min: 0, def: 0 }), chk(s, 'selfCollision', t('Self Collision', '자기 충돌')), num(s, 'ballSize', null, { step: 0.01, min: 0.001, def: 0.05 })]));
    }
    if (obj.field) out.push(panel('ph-field', t('Force Field', '역장'), [sel(obj.field, 'kind', FIELD_KINDS), num(obj.field, 'strength', null, { step: 0.5 }), num(obj.field, 'falloff', null, { step: 0.1, min: 0 }), ...(obj.field.kind === 'CHARGE' ? [num(obj.field, 'charge', null, { step: 0.5, def: 1 })] : []), ...(obj.field.kind === 'GUIDE' ? [row(propName('curve'), select({ value: obj.field.curve ?? '', options: [['', t('(this object)', '(이 오브젝트)')], ...app.doc.objects.filter((o) => o.type === 'CURVE').map((o) => [o.id, o.name])], testid: 'prop-guideCurve', onChange: (v) => { obj.field.curve = v || null; app.changed('Curve', true); } })), num(obj.field, 'guideMinDistance', null, { step: 0.1, min: 0, def: 0 }), num(obj.field, 'guideFree', null, { step: 0.05, min: 0, max: 1, def: 0.5 })] : [])]));
    out.push(panel('ph-bake', t('Bake', '베이크'), [
      button(t('Bake All Dynamics', '모든 시뮬레이션 베이크'), () => app.op('ptcache.bake_all'), { icon: 'physics', className: 'block primary', testid: 'bake-all' }),
      button(t('Free All Bakes', '베이크 지우기'), () => app.op('ptcache.free_all'), { className: 'block' }),
    ]));
    return out;
  };
  const tabConstraints = (obj) => {
    const menu = () => CONSTRAINT_GROUPS.map((g) => ({ label: nameOf(g), testid: `con-group-${g.en.replace(/ /g, '-').toLowerCase()}`, items: g.types.map((type) => ({ label: nameOf(CONSTRAINTS[type]), testid: `con-add-${type}`, onClick: () => app.op('object.constraint_add', { type }) })) }));
    const list = [button(t('Add Constraint', '컨스트레인트 추가'), (e) => openMenuBelow(e.currentTarget, menu()), { icon: 'add', className: 'block', testid: 'add-constraint' })];
    obj.constraints.forEach((c, index) => {
      const spec = CONSTRAINTS[c.type];
      const more = c.type === 'TRANSFORM_CACHE' ? [button(t('Open Cache File...', '캐시 파일 열기...'), () => app.op('cachefile.open'), { icon: 'open', className: 'block', testid: `cache-open-${index}` })]
        : (c.type === 'CAMERA_SOLVER' || c.type === 'OBJECT_SOLVER') && !(app.doc.clips ?? []).some((x) => x.solve?.camera?.length) ? [emptyNote(t('Solve the camera in the Movie Clip Editor first.', '먼저 무비 클립 에디터에서 카메라를 푸세요.'))] : [];
      list.push(panel(`con-${obj.id}-${index}`, nameOf(spec), [chk(c, 'enabled', t('Enabled', '켜기')), ...specForm(c, spec.props), ...more], { icon: 'constraint', actions: h('button', { type: 'button', className: 'icon-btn', onClick: () => app.op('object.constraint_remove', { index }) }, icon('close', 12)) }));
    });
    if (!obj.constraints.length) list.push(emptyNote(t('No constraints', '컨스트레인트 없음')));
    return list;
  };
  const tabData = (obj) => {
    const d = obj.data;
    switch (obj.type) {
      case 'MESH': {
        const groups = d.vgroups ?? [];
        return [
          panel('d-mesh', t('Geometry', '지오메트리'), [
            h('div', { className: 'note-line', dataset: { testid: 'mesh-counts' } }, `${t('Vertices', '꼭짓점')} ${d.verts.length} · ${t('Faces', '면')} ${d.faces.length}`),
            chk(d, 'smooth', t('Shade Smooth', '부드러운 셰이딩')),
          ], { icon: 'mesh' }),
          panel('d-groups', t('Vertex Groups', '꼭짓점 그룹'), [
            h('div', { className: 'slot-list' }, groups.map((g, i) => h('div', { className: 'slot' }, h('span', { className: 'name' }, g.name), h('small', null, Object.keys(g.w).length), h('button', { type: 'button', className: 'icon-btn', title: t('Assign selected vertices', '선택 꼭짓점 지정'), disabled: !app.canRun('object.vertex_group_assign'), onClick: () => app.op('object.vertex_group_assign', { group: i }) }, icon('check', 12))))),
            button(t('Add Group', '그룹 추가'), () => app.op('object.vertex_group_add'), { icon: 'add', className: 'block', testid: 'add-vgroup' }),
          ], { closed: !groups.length }),
          panel('d-shape', t('Shape Keys', '셰이프 키'), [
            ...(d.shapeKeys ?? []).map((k) => num(k, 'value', k.name, { step: 0.05, min: 0, max: 1, testid: `shape-${k.name}` })),
            button(t('Add Shape Key', '셰이프 키 추가'), () => app.op('object.shape_key_add'), { icon: 'add', className: 'block', testid: 'add-shapekey' }),
          ], { closed: !d.shapeKeys?.length }),
          panel('d-uv', t('UV Maps', 'UV 맵'), [
            h('div', { className: 'note-line' }, d.uvs ? t('Has a UV map', 'UV 맵 있음') : t('No UV map', 'UV 맵 없음')),
            button(t('Smart UV Project', '스마트 UV 투영'), () => app.op('uv.smart_project'), { className: 'block' }),
          ], { closed: true }),
        ];
      }
      case 'LIGHT':
        return [panel('d-light', t('Light', '조명'), [
          sel(d, 'kind', ['POINT', 'SUN', 'SPOT', 'AREA'], t('Type', '종류')),
          col(d, 'color', t('Color', '색')),
          num(d, 'energy', d.kind === 'SUN' ? t('Strength', '강도') : t('Power', '파워'), { step: d.kind === 'SUN' ? 0.1 : 10, min: 0, suffix: d.kind === 'SUN' ? '' : ' W' }),
          num(d, 'radius', t('Radius', '반지름'), { step: 0.01, min: 0 }),
          d.kind === 'SPOT' ? [num(d, 'spotSize', t('Spot Size', '스폿 크기'), { step: 1, min: 1, max: 180, suffix: '°' }), num(d, 'spotBlend', t('Blend', '혼합'), { step: 0.05, min: 0, max: 1 })] : null,
          d.kind === 'AREA' ? num(d, 'size', t('Size', '크기'), { step: 0.1, min: 0 }) : null,
          chk(d, 'castShadow', t('Cast Shadow', '그림자')),
        ], { icon: 'light' })];
      case 'CAMERA':
        return [
          panel('d-camera', t('Lens', '렌즈'), [
            sel(d, 'kind', ['PERSP', 'ORTHO'], t('Type', '종류')),
            d.kind === 'ORTHO' ? num(d, 'orthoScale', t('Orthographic Scale', '직교 배율'), { step: 0.1, min: 0.001 }) : num(d, 'lens', t('Focal Length', '초점 거리'), { step: 1, min: 1, suffix: ' mm' }),
            num(d, 'sensor', t('Sensor Width', '센서 폭'), { step: 1, min: 1, suffix: ' mm' }),
            num(d, 'clipStart', t('Clip Start', '클립 시작'), { step: 0.01, min: 0.0001 }),
            num(d, 'clipEnd', t('Clip End', '클립 끝'), { step: 10, min: 0.01 }),
            button(t('Set as Active Camera', '활성 카메라로 설정'), () => app.op('object.camera_set_active'), { className: 'block' }),
          ], { icon: 'camera' }),
          panel('d-dof', t('Depth of Field', '피사계 심도'), [chk(d, 'dofEnabled', t('Enabled', '켜기')), num(d, 'dofFocus', t('Focus Distance', '초점 거리'), { step: 0.1, min: 0 }), num(d, 'fstop', t('F-Stop', '조리개'), { step: 0.1, min: 0.1 })], { closed: true }),
        ];
      case 'EMPTY':
        return [panel('d-empty', t('Empty', '엠프티'), [sel(d, 'display', ['PLAIN_AXES', 'ARROWS', 'CUBE', 'SPHERE', 'CIRCLE'], t('Display', '표시')), num(d, 'size', t('Size', '크기'), { step: 0.1, min: 0 })], { icon: 'empty' })];
      case 'VOLUME':
        return [panel('d-volume', t('Volume', '볼륨'), [sel(d, 'kind', ['CONSTANT', 'SPHERE', 'NOISE'], t('Density Shape', '밀도 모양')), num(d, 'density', t('Density', '밀도'), { step: 0.5, min: 0 }), num(d, 'res', t('Resolution', '해상도'), { int: true, step: 4, min: 4, max: 96 }), num(d, 'scale', t('Noise Scale', '노이즈 크기'), { step: 0.5, min: 0.1 }), num(d, 'threshold', t('Noise Threshold', '노이즈 임계값'), { step: 0.05, min: 0, max: 1 }), row(t('Color', '색'), colorField({ value: d.colour, onChange: (v, final) => { d.colour = v; app.changed('Volume Color', final); } })), row(t('Emission', '발광'), colorField({ value: d.emission, onChange: (v, final) => { d.emission = v; app.changed('Volume Emission', final); } })), num(d, 'emissionStrength', t('Emission Strength', '발광 세기'), { step: 0.5, min: 0 })], { icon: 'empty' })];
      case 'SURFACE':
        return [panel('d-surface', t('NURBS Surface', 'NURBS 서피스'), [num(d, 'resolutionU', t('Resolution U', '해상도 U'), { int: true, step: 1, min: 1, max: 128 }), num(d, 'resolutionV', t('Resolution V', '해상도 V'), { int: true, step: 1, min: 1, max: 128 }), num(d, 'orderU', t('Order U', '차수 U'), { int: true, step: 1, min: 2, max: 6 }), num(d, 'orderV', t('Order V', '차수 V'), { int: true, step: 1, min: 2, max: 6 }), chk(d, 'cyclicU', t('Cyclic U', '순환 U')), chk(d, 'cyclicV', t('Cyclic V', '순환 V'))], { icon: 'curve' })];
      case 'CURVE':
        return [panel('d-curve', t('Geometry', '지오메트리'), [num(d, 'bevelDepth', t('Bevel Depth', '베벨 깊이'), { step: 0.01, min: 0 }), num(d, 'resolution', t('Resolution', '해상도'), { int: true, step: 1, min: 1, max: 128 })], { icon: 'curve' })];
      case 'TEXT':
        return [panel('d-text', t('Text', '텍스트'), [txt(d, 'body', t('Text', '내용')), app.fontPicker(d), h('div', { className: 'note-line' }, t('Press Shift+Enter in the box above for a new line: type \\n.', '위 칸에 \\n 을 쓰면 줄을 바꿉니다.')), num(d, 'size', t('Size', '크기'), { step: 0.1, min: 0.01 }), num(d, 'extrude', t('Extrude', '두께'), { step: 0.05, min: 0 }), num(d, 'spacing', t('Character Spacing', '글자 간격'), { step: 0.01 }), num(d, 'lineHeight', t('Line Height', '줄 간격'), { step: 0.05, min: 0.1 }), sel(d, 'align', ['LEFT', 'CENTER', 'RIGHT'], t('Align', '정렬')), h('div', { className: 'note-line' }, t('The bundled typeface has Latin letters only.', '내장 글꼴은 라틴 문자만 지원합니다.'))], { icon: 'text' })];
      case 'META':
        return [panel('d-meta', t('Metaball', '메타볼'), [
          num(d, 'threshold', t('Threshold', '임계값'), { step: 0.05, min: 0.01 }), num(d, 'resolution', t('Resolution', '해상도'), { step: 0.01, min: 0.03 }),
          ...d.elements.map((e, i) => h('div', { className: 'sub-panel' }, h('div', { className: 'sub-head' }, h('span', { className: 'name' }, `${t('Element', '요소')} ${i + 1}`)), num(e, 'radius', t('Radius', '반지름'), { step: 0.05, min: 0.01 }), ...vec(e, 'co', t('Location', '위치')))),
          button(t('Add Element', '요소 추가'), () => { d.elements.push({ co: [d.elements.length * 1.2, 0, 0], radius: 1, stiffness: 2 }); app.changed('Add Element', true); }, { icon: 'add', className: 'block' }),
        ], { icon: 'meta' })];
      case 'ARMATURE':
        return [panel('d-arm', t('Bones', '본'), [
          ...d.bones.map((b, i) => panel(`bone-${i}`, b.name, [
            ...vec(b.pose, 'rotation', t('Pose Rotation', '포즈 회전'), { step: 5 }),
            ...vec(b.pose, 'location', t('Pose Location', '포즈 위치')),
            ...(b.ik ? [
              h('div', { className: 'note-line' }, t('Inverse Kinematics', '역운동학')),
              ikObject(b, 'target', t('Target', '목표'), i),
              (b.ik.subtarget ??= '', txt(b.ik, 'subtarget', t('Target Bone', '목표 본'))),
              ikObject(b, 'pole', t('Pole', '폴'), i),
              num(b.ik, 'chain', t('Chain Length', '체인 길이'), { step: 1, min: 1, int: true, testid: `ik-chain-${i}` }),
              num(b.ik, 'poleAngle', t('Pole Angle', '폴 각도'), { step: 5, testid: `ik-angle-${i}` }),
              num(b.ik, 'influence', t('Influence', '영향'), { step: 0.05, min: 0, max: 1, testid: `ik-influence-${i}` }),
              button(t('Remove IK', 'IK 제거'), () => app.op('pose.ik_clear', { bone: i }), { className: 'block', testid: `ik-remove-${i}` }),
            ] : [button(t('Add IK', 'IK 추가'), () => app.op('pose.ik_add', { bone: i, chain: Math.min(2, i + 1) }), { className: 'block', icon: 'add', testid: `ik-add-${i}` })]),
            (b.useRoll ??= false, chk(b, 'useRoll', t('Use Roll', '롤 사용'))),
            b.useRoll ? num(b, 'roll', t('Roll', '롤'), { step: 5, suffix: '°' }) : null,
            ...(b.constraints ?? []).map((c, index) => panel(`bone-${i}-con-${index}`, nameOf(BONE_CONSTRAINTS[c.type]), [chk(c, 'enabled', t('Enabled', '켜기')), ...boneConstraintForm(c)], { icon: 'constraint', actions: h('button', { type: 'button', className: 'icon-btn', dataset: { testid: `bone-con-remove-${i}-${index}` }, onClick: () => app.op('pose.constraint_remove', { bone: i, index }) }, icon('close', 12)) })),
            button(t('Add Bone Constraint', '본 컨스트레인트 추가'), (e) => openMenuBelow(e.currentTarget, Object.entries(BONE_CONSTRAINTS).map(([type, spec]) => ({ label: nameOf(spec), onClick: () => app.op('pose.constraint_add', { bone: i, type }) }))), { icon: 'add', className: 'block', testid: `bone-con-add-${i}` }),
            button(t('Key Pose', '포즈 키'), () => app.op('pose.keyframe_insert', { bone: i }), { className: 'block', icon: 'keyframe', testid: `bone-key-${i}` }),
            button(t('Calculate Bone Path', '본 경로 계산'), () => app.op('pose.paths_calculate', { bone: i, start: app.doc.frameStart, end: app.doc.frameEnd }), { className: 'block', testid: `bone-path-${i}` }),
          ].filter(Boolean), { closed: d.bones.length > 2 })),
          button(t('Add Bone', '본 추가'), () => app.op('armature.bone_add'), { icon: 'add', className: 'block', testid: 'add-bone' }),
          button(t('Key All Bones', '모든 본 키'), () => app.op('pose.keyframe_insert', { bone: -1 }), { className: 'block', icon: 'keyframe', testid: 'bones-key-all' }),
          button(t('Clear Pose', '포즈 지우기'), () => app.op('pose.transforms_clear'), { className: 'block' }),
        ], { icon: 'armature' })];
      case 'LATTICE':
        return [panel('d-lat', t('Lattice', '래티스'), [...d.points.map((p, i) => h('div', { className: 'sub-panel' }, h('div', { className: 'sub-head' }, `${t('Point', '점')} ${i + 1}`), vecField({ value: [...p], onChange: (next, final) => { d.points[i] = next; app.changed('Lattice', final); } })))], { icon: 'lattice' })];
      case 'GPENCIL':
        return [panel('d-gp', t('Layers', '레이어'), [
          h('div', { className: 'slot-list' }, d.layers.map((l, i) => h('div', { className: `slot${d.activeLayer === i ? ' on' : ''}`, onClick: () => { d.activeLayer = i; app.changed('Active Layer', true); } }, h('span', { className: 'name' }, l.name), h('small', null, l.strokes.length)))),
          button(t('Add Layer', '레이어 추가'), () => app.op('gpencil.layer_add'), { icon: 'add', className: 'block' }),
          button(t('Remove Layer', '레이어 제거'), () => app.op('gpencil.layer_remove'), { className: 'block', testid: 'gp-layer-remove' }),
          button(t('Clear Layer', '레이어 지우기'), () => app.op('gpencil.clear'), { className: 'block' }),
          h('div', { className: 'note-line' }, t('Switch to Draw mode and drag in the 3D view.', '그리기 모드로 바꾸고 3D 뷰에서 끌어 그립니다.')),
        ], { icon: 'gpencil' }), (() => {
          const l = d.layers[d.activeLayer];
          if (!l) return null;
          l.thickness ??= 1; l.opacity ??= 1; l.fill ??= false; l.fillColor ??= [0.5, 0.5, 0.5]; l.keyed ??= false;
          return panel('d-gp-layer', t('Active Layer', '활성 레이어'), [
            txt(l, 'name', t('Name', '이름')),
            row(t('Color', '색'), colorField({ value: l.color, onChange: (v, final) => { l.color = v; app.changed('Color', final); } })),
            num(l, 'thickness', t('Thickness', '두께'), { step: 0.1, min: 0 }),
            num(l, 'opacity', t('Opacity', '불투명도'), { step: 0.05, min: 0, max: 1 }),
            chk(l, 'fill', t('Fill', '채우기')),
            row(t('Fill Color', '채우기 색'), colorField({ value: l.fillColor, onChange: (v, final) => { l.fillColor = v; app.changed('Fill Color', final); } })),
            chk(l, 'keyed', t('Hold Drawings per Frame', '프레임별 그림 유지')),
            chk(l, 'hide', t('Hide', '숨기기')),
          ], { icon: 'gpencil' });
        })(), panel('d-gp-tools', t('Strokes', '스트로크'), [
          (d.tool ??= 'DRAW', sel(d, 'tool', ['DRAW', 'ERASE', 'SCULPT'], t('Tool', '도구'))),
          ...(d.tool === 'SCULPT' ? [
            (d.sculptTool ??= 'SMOOTH', sel(d, 'sculptTool', GP_SCULPT_TOOLS, t('Brush', '브러시'))),
            (d.sculptRadius ??= 0.3, num(d, 'sculptRadius', t('Radius', '반지름'), { step: 0.05, min: 0.01 })),
            (d.sculptStrength ??= 0.5, num(d, 'sculptStrength', t('Strength', '세기'), { step: 0.05, min: 0, max: 1 })),
            (d.sculptInvert ??= false, chk(d, 'sculptInvert', t('Invert', '반대로'))),
            h('div', { className: 'note-line' }, t('Drag over strokes in Draw mode to sculpt them.', '그리기 모드에서 스트로크 위를 끌면 다듬어집니다.')),
          ] : []),
          button(t('Smooth', '부드럽게'), () => app.op('gpencil.stroke_smooth'), { className: 'block', testid: 'gp-smooth' }),
          button(t('Simplify', '단순화'), () => app.op('gpencil.stroke_simplify'), { className: 'block', testid: 'gp-simplify' }),
          button(t('Subdivide', '세분'), () => app.op('gpencil.stroke_subdivide'), { className: 'block', testid: 'gp-subdivide' }),
          button(t('Convert to Mesh', '메시로 변환'), () => app.op('gpencil.convert'), { className: 'block', testid: 'gp-convert' }),
        ], { icon: 'gpencil' }), panel('d-gp-interp', t('Interpolate', '보간'), [
          (d.easing ??= 'LINEAR', sel(d, 'easing', GP_EASINGS, t('Easing', '가감속'))),
          button(t('Interpolate at Current Frame', '현재 프레임 보간'), () => app.op('gpencil.interpolate', { easing: d.easing }), { className: 'block', testid: 'gp-interpolate' }),
          button(t('Interpolate Sequence', '시퀀스 보간'), () => app.op('gpencil.interpolate_sequence', { easing: d.easing }), { className: 'block', testid: 'gp-interpolate-seq' }),
          h('div', { className: 'note-line' }, t('Between the drawings before and after the current frame, stroke by stroke in drawing order.', '현재 프레임 앞뒤의 그림 사이를, 그린 순서대로 스트로크끼리 잇습니다.')),
        ], { icon: 'gpencil' }), panel('d-gp-mods', t('Grease Pencil Modifiers', '그리스 펜슬 모디파이어'), [
          ...(d.modifiers ?? []).map((m, index) => panel(`gp-mod-${index}`, nameOf(GP_MODIFIERS[m.type]), [
            chk(m, 'enabled', t('Enabled', '켜기')),
            row(t('Layer', '레이어'), select({ value: m.layer ?? '', options: [['', t('(all)', '(전체)')], ...d.layers.map((l) => [l.name, l.name])], onChange: (v) => { m.layer = v; app.changed('Layer', true); } })),
            ...Object.entries(GP_MODIFIERS[m.type].props).flatMap(([key, p]) => (p.color ? [col(m, key)] : Array.isArray(p.def) ? vec(m, key, propName(key)) : specForm(m, { [key]: p }))),
          ], { icon: 'modifier', actions: h('button', { type: 'button', className: 'icon-btn', dataset: { testid: `gp-mod-remove-${index}` }, onClick: () => app.op('gpencil.modifier_remove', { index }) }, icon('close', 12)) })),
          button(t('Add Modifier', '모디파이어 추가'), (e) => openMenuBelow(e.currentTarget, Object.entries(GP_MODIFIERS).map(([type, spec]) => ({ label: nameOf(spec), onClick: () => app.op('gpencil.modifier_add', { type }) }))), { icon: 'add', className: 'block', testid: 'gp-mod-add' }),
        ], { icon: 'modifier' })].filter(Boolean);
      default: return [emptyNote(t('This object has no data settings.', '이 오브젝트에는 데이터 설정이 없습니다.'))];
    }
  };
  const tabMaterial = (obj) => {
    const doc = app.doc;
    state.slot = Math.min(state.slot, Math.max(0, obj.materials.length - 1));
    const slot = state.slot;
    const mat = getMaterial(doc, obj.materials[slot]);
    const list = [h('div', { className: 'slot-list', dataset: { testid: 'material-slots' } }, obj.materials.map((id, i) => {
      const m = getMaterial(doc, id);
      return h('div', { className: `slot${i === slot ? ' on' : ''}`, onClick: () => { state.slot = i; update(); } }, icon('material', 13), h('span', { className: 'name' }, m?.name ?? t('(empty)', '(비어 있음)')));
    }))];
    list.push(h('div', { className: 'btn-row' },
      button('', () => app.op('object.material_slot_add'), { icon: 'add', title: t('Add Slot', '슬롯 추가'), testid: 'slot-add' }),
      button('', () => { app.op('object.material_slot_remove', { index: slot }); }, { icon: 'remove', title: t('Remove Slot', '슬롯 제거'), disabled: !obj.materials.length }),
      button(t('Assign', '지정'), () => app.op('object.material_slot_assign', { slot }), { disabled: !app.canRun('object.material_slot_assign') })));
    list.push(row(t('Material', '재질'), select({ value: obj.materials[slot] ?? '', options: [['', t('(none)', '(없음)')], ...doc.materials.map((m) => [m.id, m.name])], testid: 'material-pick', onChange: (v) => { if (!obj.materials.length) obj.materials.push(v || null); else obj.materials[slot] = v || null; app.changed('Assign Material', true); } })));
    list.push(button(t('New Material', '새 재질'), () => { app.ctx.activeSlot = slot; app.op('material.new'); }, { icon: 'add', className: 'block', testid: 'material-new' }));
    if (mat) {
      list.push(panel('m-surface', t('Surface', '표면'), [
        txt(mat, 'name', t('Name', '이름')),
        mat.useNodes ? h('div', { className: 'note-line' }, t('Uses a node tree: edit it in the Shading workspace.', '노드 트리를 사용합니다. 셰이딩 워크스페이스에서 편집하세요.')) : button(t('Use Nodes', '노드 사용'), () => app.op('material.use_nodes'), { className: 'block', testid: 'material-use-nodes' }),
        mat.useNodes ? null : [
          col(mat, 'baseColor', t('Base Color', '기본 색')),
          num(mat, 'metallic', t('Metallic', '금속성'), { step: 0.05, min: 0, max: 1 }),
          num(mat, 'roughness', t('Roughness', '거칠기'), { step: 0.05, min: 0, max: 1, testid: 'prop-roughness' }),
          num(mat, 'specular', t('Specular', '반사'), { step: 0.05, min: 0, max: 1 }),
          num(mat, 'ior', t('IOR', '굴절률'), { step: 0.01, min: 1 }),
          num(mat, 'transmission', t('Transmission', '투과'), { step: 0.05, min: 0, max: 1 }),
          num(mat, 'alpha', t('Alpha', '알파'), { step: 0.05, min: 0, max: 1 }),
          col(mat, 'emission', t('Emission', '방출')),
          num(mat, 'emissionStrength', t('Emission Strength', '방출 강도'), { step: 0.1, min: 0 }),
          h('div', { className: 'btn-row' }, button(t('Key Roughness', '거칠기 키'), () => { insertKey(mat, 'roughness', doc.frame); app.changed('Keyframe', true); }, { icon: 'keyframe' })),
        ],
      ], { icon: 'material' }));
    }
    return list;
  };

  function build() {
    const doc = app.doc;
    const obj = activeObject(doc);
    const usable = (id) => {
      if (NEEDS_OBJECT.has(id) && !obj) return false;
      if (NEEDS_MESH.has(id) && obj?.type !== 'MESH' && !(id === 'physics' && obj)) return false;
      if (NEEDS_GEOMETRY.has(id) && !GEOMETRY_TYPES.has(obj?.type)) return false;
      return true;
    };
    if (!usable(state.tab)) state.tab = obj ? 'object' : 'scene';
    tabsEl.replaceChildren(...TABS.map((tab) => {
      if (!tab) return h('div', { className: 'props-tab-gap' });
      const [id, name, en, ko] = tab;
      if (!usable(id)) return null;
      return h('button', { type: 'button', className: `props-tab${state.tab === id ? ' on' : ''}`, title: t(en, ko), dataset: { testid: `tab-${id}` }, onClick: () => { state.tab = id; update(); } }, icon(name, 15));
    }).filter(Boolean));
    const crumb = NEEDS_OBJECT.has(state.tab) && obj ? h('div', { className: 'crumb' }, icon('object', 13), h('b', null, obj.name)) : null;
    const body = {
      render: tabRender, output: tabOutput, viewlayer: tabViewLayer, scene: tabScene, world: tabWorld,
      object: () => tabObject(obj), modifiers: () => tabModifiers(obj), particles: () => tabParticles(obj), physics: () => tabPhysics(obj), constraints: () => tabConstraints(obj), data: () => tabData(obj), material: () => tabMaterial(obj),
    }[state.tab]();
    const scroll = content.scrollTop;
    const tabInfo = TABS.find((x) => x && x[0] === state.tab);
    const search = h('input', { className: 'props-search', type: 'search', placeholder: t('Search settings', '설정 검색'), value: state.search ?? '', dataset: { testid: 'props-search' }, onInput: (e) => { state.search = e.target.value; filterPanels(); }, onKeydown: (e) => { e.stopPropagation(); if (e.key === 'Escape') { state.search = ''; e.target.value = ''; filterPanels(); e.target.blur(); } } });
    const head = h('div', { className: 'props-head', dataset: { testid: 'props-head' } }, tabInfo ? icon(tabInfo[1], 14) : null, h('strong', null, tabInfo ? t(tabInfo[2], tabInfo[3]) : ''), search);
    content.replaceChildren(...[head, crumb, ...body.flat(Infinity)].filter(Boolean));
    filterPanels();
    content.scrollTop = scroll;
  }
  /** Keeps the panels and rows that match what was typed, opening folded panels that hold a match. */
  function filterPanels() {
    const query = (state.search ?? '').trim().toLowerCase();
    let shown = 0;
    for (const panelEl of content.querySelectorAll(':scope > .panel, :scope > section.panel')) {
      panelEl.classList.toggle('search-open', Boolean(query));
      const title = panelEl.querySelector('.panel-title')?.textContent.toLowerCase() ?? '';
      const rows = [...panelEl.querySelectorAll('.prop-row, .toggle')];
      if (!query || title.includes(query)) {
        panelEl.style.display = '';
        for (const row of rows) row.style.display = '';
        shown++;
        continue;
      }
      let any = false;
      for (const row of rows) { const hit = row.textContent.toLowerCase().includes(query); row.style.display = hit ? '' : 'none'; any ||= hit; }
      panelEl.style.display = any ? '' : 'none';
      if (any) shown++;
    }
    let none = content.querySelector('.props-none');
    if (query && !shown) { if (!none) content.append(h('div', { className: 'props-none', dataset: { testid: 'props-none' } }, t('Nothing on this tab matches.', '이 탭에 맞는 설정이 없습니다.'))); } else none?.remove();
  }
  function update() {
    if (app.widgetActive(root)) return;
    build();
  }
  build();
  void animatable; void changed; void enumName; void openMenu;
  return { update, dispose() { root.remove(); }, api: { state, setTab: (id) => { state.tab = id; update(); } } };
}
