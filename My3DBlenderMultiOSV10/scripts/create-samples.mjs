// npm run samples — writes the sample projects: sample/<level>/<id>.my3d, a rendered picture of each, sample/index.json and
// sample/README.md, and a copy in public/sample so that the program ships them. Every sample is built with the same operators
// and functions the program uses, so a sample that stops working means something broke.
//   --no-pictures   skips rendering (keeps the pictures already there)
//   --only=<id>     just one
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { Matrix4, Quaternion, Vector3 } from 'three';
import * as anim from '../src/core/anim.js';
import { createArmature, createBone } from '../src/core/armature.js';
import { BUILTIN_ADDONS, disableAddon, enableAddon } from '../src/core/addons.js';
import { activeObject, addObject, createDocument, defaultCamera, defaultLight, defaultMaterial, newId, rotationFromQuat, serialize, setFrame, createConstraint, getObject } from '../src/core/doc.js';
import { circleMesh, coneMesh, cubeMesh, cylinderMesh, gridMesh, icoSphereMesh, planeMesh, setEdgeMark, edgeMap, torusMesh, uvSphereMesh } from '../src/core/mesh.js';
import { History } from '../src/core/history.js';
import { createModifier, catmullClark } from '../src/core/modifiers.js';
import { addLink, createNode, defaultCompositorGraph, defaultGeometryGraph, defaultShaderGraph, defaultWorldGraph, makeGroup, syncGroupInstances, createGroupNode } from '../src/core/nodes.js';
import { nurbsPrimitive } from '../src/core/nurbs.js';
import { run } from '../src/core/ops.js';
import { DEFAULT_OSL } from '../src/core/osl.js';
import { createImageBuffer, encodePNGDataUrl, paintDabImage, texturePaintDab } from '../src/core/paint.js';
import { buildRenderScene, denoiseImage, renderImage, toDisplay } from '../src/core/pathtracer.js';
import { defaultCloth, defaultParticles, defaultRigidBody, defaultSoftBody } from '../src/core/physics.js';
import { runPython } from '../src/core/python.js';
import { multiresAddLevel, multiresSculpt } from '../src/core/remesh.js';
import { sculptDab } from '../src/core/sculpt.js';
import { addStrip, addTransition, createStrip } from '../src/core/sequencer.js';
import { newScene, switchScene } from '../src/core/scenes.js';
import { clearSimCache, defaultDynamicPaint, defaultLiquidDomain, defaultSmokeDomain, defaultSmokeFlow } from '../src/core/simulation.js';
import { createTrack } from '../src/core/tracking.js';
import { unwrapSeams } from '../src/core/unwrap.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─────────────── small helpers

function start({ world = [0.5, 0.56, 0.68], floor = [0.62, 0.62, 0.6], camera = [7, -7.5, 5], target = [0, 0, 0.8], lens = 50, sun = true, frameEnd = 120 } = {}) {
  const doc = createDocument();
  doc.world.color = world;
  doc.frameEnd = frameEnd;
  const history = new History();
  history.reset(doc);
  const ctx = { doc, history };
  if (floor) {
    const m = material(doc, 'Floor', { baseColor: floor, roughness: 0.75 });
    addObject(doc, { type: 'MESH', name: 'Floor', data: planeMesh(60), materials: [m.id] });
  }
  if (sun) addObject(doc, { type: 'LIGHT', name: 'Sun', location: [5, -3, 9], rotation: [38, 12, 28], data: { ...defaultLight('SUN'), energy: 2.4, radius: 0.08 } });
  addCamera(doc, camera, target, lens);
  return ctx;
}

function addCamera(doc, position, target, lens = 50) {
  const m = new Matrix4().lookAt(new Vector3(...position), new Vector3(...target), new Vector3(0, 0, 1));
  const q = new Quaternion().setFromRotationMatrix(m);
  const camera = addObject(doc, { type: 'CAMERA', name: 'Camera', location: position, rotation: rotationFromQuat(q), data: { ...defaultCamera(), lens } });
  doc.activeCamera = camera.id;
  return camera;
}

function material(doc, name, values = {}) {
  const m = { ...defaultMaterial(name), ...values };
  doc.materials.push(m);
  return m;
}

function shape(ctx, name, mesh, { location = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], mat = null, smooth = false, ...rest } = {}) {
  mesh.smooth = smooth || mesh.smooth;
  const obj = addObject(ctx.doc, { type: 'MESH', name, data: mesh, location, rotation, scale, materials: mat ? [mat.id] : [], ...rest });
  ctx.doc.activeId = obj.id;
  ctx.doc.selected = [obj.id];
  return obj;
}

const key = (obj, frame, values) => {
  for (const [path, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((v, k) => anim.insertKey(obj, `${path}.${k}`, frame, v, 'BEZIER'));
    else anim.insertKey(obj, path, frame, value, 'BEZIER');
  }
};
const use = (obj, mod, values = {}) => { const m = { ...createModifier(mod), ...values }; obj.modifiers.push(m); return m; };
const useNodes = (m) => { m.useNodes = true; m.nodes = defaultShaderGraph(m); return m.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED'); };

const PALETTE = { red: [0.75, 0.08, 0.06], orange: [0.9, 0.42, 0.08], yellow: [0.95, 0.75, 0.15], green: [0.12, 0.55, 0.2], blue: [0.08, 0.25, 0.75], purple: [0.4, 0.12, 0.7], white: [0.9, 0.9, 0.88], dark: [0.04, 0.04, 0.05], wood: [0.45, 0.26, 0.12], skin: [0.8, 0.6, 0.48] };

const s = (id, level, en, ko, topics, descEn, descKo, tryEn, tryKo, build, extra = {}) => ({ id, level, title: { en, ko }, topics, description: { en: descEn, ko: descKo }, tryThis: { en: tryEn, ko: tryKo }, build, ...extra });

// ─────────────── the samples

export const SAMPLES = [
  // ── Beginner: one idea each, nothing but moving, adding and choosing colours.
  s('first-cube', 'beginner', 'First Cube', '첫 번째 큐브', ['objects', 'material'], 'A cube, a light and a camera: where everything starts.', '큐브, 조명, 카메라. 모든 작업의 출발점입니다.', 'Select the cube and press R, then Z, then 45, then Enter.', '큐브를 선택하고 R, Z, 45, Enter를 차례로 눌러 보세요.', () => {
    const ctx = start({ camera: [5, -5, 3.6], target: [0, 0, 1] });
    shape(ctx, 'Cube', cubeMesh(2), { location: [0, 0, 1], mat: material(ctx.doc, 'Orange', { baseColor: PALETTE.orange, roughness: 0.4 }) });
    return ctx;
  }),
  s('primitives', 'beginner', 'Every Primitive', '모든 기본 도형', ['objects', 'add menu'], 'All the shapes of the Add menu, in a row.', '추가 메뉴의 모든 도형을 한 줄로 놓았습니다.', 'Press Shift+A in the 3D view and add one more.', '3D 뷰에서 Shift+A를 눌러 하나 더 추가해 보세요.', () => {
    const ctx = start({ camera: [0, -30, 9], target: [0, 0, 0.6], lens: 45 });
    const colors = Object.values(PALETTE);
    [['Plane', planeMesh(1.8)], ['Cube', cubeMesh(1.6)], ['Sphere', uvSphereMesh(32, 16, 1)], ['Ico', icoSphereMesh(2, 1)], ['Cylinder', cylinderMesh(32, 0.9, 1.8)], ['Cone', coneMesh(32, 1, 2)], ['Torus', torusMesh(48, 16, 0.8, 0.28)], ['Grid', gridMesh(6, 6, 1.8)]].forEach(([name, mesh], i) => {
      shape(ctx, name, mesh, { location: [(i - 3.5) * 2.5, 0, name === 'Plane' || name === 'Grid' ? 0.02 : 1], mat: material(ctx.doc, name, { baseColor: colors[i % colors.length] }), smooth: name === 'Sphere' || name === 'Torus' });
    });
    return ctx;
  }),
  s('snowman', 'beginner', 'Snowman', '눈사람', ['objects', 'smooth shading'], 'Three spheres, a cone and a little scaling make a figure.', '구 세 개와 원뿔, 약간의 크기 조절로 인물을 만듭니다.', 'Change the nose colour in the Material tab.', '재질 탭에서 코의 색을 바꿔 보세요.', () => {
    const ctx = start({ world: [0.62, 0.72, 0.85], floor: [0.82, 0.85, 0.9], camera: [8, -13, 5], target: [0, 0, 2.2] });
    const snow = material(ctx.doc, 'Snow', { baseColor: [0.95, 0.96, 0.98], roughness: 0.8 });
    for (const [r, z, n] of [[1.2, 1.1, 'Bottom'], [0.85, 2.75, 'Middle'], [0.6, 3.9, 'Head']]) shape(ctx, n, uvSphereMesh(32, 16, r), { location: [0, 0, z], mat: snow, smooth: true });
    shape(ctx, 'Nose', coneMesh(24, 0.13, 0.7), { location: [0, -0.8, 3.92], rotation: [90, 0, 0], mat: material(ctx.doc, 'Carrot', { baseColor: PALETTE.orange }) });
    const coal = material(ctx.doc, 'Coal', { baseColor: PALETTE.dark, roughness: 0.9 });
    for (const x of [-0.22, 0.22]) shape(ctx, 'Eye', uvSphereMesh(16, 8, 0.07), { location: [x, -0.55, 4.1], mat: coal, smooth: true });
    for (const z of [2.45, 2.85, 3.25]) shape(ctx, 'Button', uvSphereMesh(16, 8, 0.08), { location: [0, -0.85 + Math.abs(z - 2.85) * 0.25, z], mat: coal, smooth: true });
    return ctx;
  }),
  s('block-tower', 'beginner', 'Block Tower', '블록 탑', ['objects', 'materials'], 'Coloured blocks stacked by hand: Shift+D and G are all it takes.', '색 블록을 손으로 쌓습니다. Shift+D와 G면 충분합니다.', 'Duplicate a block with Shift+D and put it on top.', 'Shift+D로 블록을 복제해 맨 위에 올려 보세요.', () => {
    const ctx = start({ camera: [8, -11, 5.5], target: [0, 0, 1.9] });
    const colors = [PALETTE.red, PALETTE.orange, PALETTE.yellow, PALETTE.green, PALETTE.blue];
    let z = 0.4;
    [[2.4, 1.6], [2, 1.5], [1.6, 1.3], [1.2, 1.1], [0.8, 0.9]].forEach(([w, d], i) => {
      shape(ctx, 'Block', cubeMesh(1), { location: [i % 2 ? 0.12 : -0.12, 0, z], rotation: [0, 0, i * 9], scale: [w, d, 0.8], mat: material(ctx.doc, `Block ${i + 1}`, { baseColor: colors[i], roughness: 0.45 }) });
      z += 0.8;
    });
    return ctx;
  }),
  s('table-chair', 'beginner', 'Table and Chair', '탁자와 의자', ['objects', 'scale', 'parent'], 'Furniture from stretched cubes: scale is all it takes.', '늘린 큐브로 만든 가구입니다. 크기 조절만으로 충분합니다.', 'Select the table top, press G and move it: the legs are separate.', '탁자 상판을 선택하고 G로 옮겨 보세요. 다리는 따로 움직입니다.', () => {
    const ctx = start({ camera: [6, -7, 4], target: [0.5, 0, 1] });
    const wood = material(ctx.doc, 'Wood', { baseColor: PALETTE.wood, roughness: 0.55 });
    shape(ctx, 'Table Top', cubeMesh(1), { location: [0, 0, 1.5], scale: [3, 1.8, 0.1], mat: wood });
    for (const [x, y] of [[-1.35, -0.75], [1.35, -0.75], [-1.35, 0.75], [1.35, 0.75]]) shape(ctx, 'Table Leg', cubeMesh(1), { location: [x, y, 0.72], scale: [0.12, 0.12, 1.45], mat: wood });
    const blue = material(ctx.doc, 'Chair', { baseColor: PALETTE.blue, roughness: 0.5 });
    shape(ctx, 'Seat', cubeMesh(1), { location: [2.8, -0.5, 0.85], scale: [0.9, 0.9, 0.09], mat: blue });
    shape(ctx, 'Back', cubeMesh(1), { location: [3.2, -0.5, 1.3], scale: [0.09, 0.9, 0.9], mat: blue });
    for (const [x, y] of [[2.42, -0.88], [3.18, -0.88], [2.42, -0.12], [3.18, -0.12]]) shape(ctx, 'Chair Leg', cubeMesh(1), { location: [x, y, 0.42], scale: [0.08, 0.08, 0.84], mat: blue });
    return ctx;
  }),
  s('color-balls', 'beginner', 'Colourful Balls', '알록달록 공', ['materials'], 'Twelve materials from dull to shiny, to compare side by side.', '거친 것부터 매끈한 것까지 재질 12종을 나란히 비교합니다.', 'Switch the view to Material Preview with the buttons at the top right.', '오른쪽 위 버튼으로 뷰를 재질 미리보기로 바꿔 보세요.', () => {
    const ctx = start({ camera: [0, -17, 7], target: [0, 0, 0.5] });
    const colors = [PALETTE.red, PALETTE.orange, PALETTE.yellow, PALETTE.green, PALETTE.blue, PALETTE.purple];
    colors.forEach((c, i) => { for (let row = 0; row < 2; row++) shape(ctx, 'Ball', uvSphereMesh(32, 16, 0.6), { location: [(i - 2.5) * 1.5, row * 1.6 - 0.4, 0.6], smooth: true, mat: material(ctx.doc, 'Ball', { baseColor: c, roughness: row ? 0.75 : 0.12 }) }); });
    return ctx;
  }),
  s('three-point', 'beginner', 'Three-Point Lighting', '3점 조명', ['lights'], 'Key, fill and rim: the classic way to light a subject.', '키, 필, 림 조명. 대상을 비추는 고전적인 방법입니다.', 'Select a light and turn it off with the eye in the Outliner: see what each one does.', '아웃라이너의 눈 아이콘으로 조명을 하나씩 꺼서 각각의 역할을 확인해 보세요.', () => {
    const ctx = start({ world: [0.02, 0.02, 0.03], sun: false, floor: [0.3, 0.3, 0.32], camera: [0, -8, 2.4], target: [0, 0, 1.2] });
    shape(ctx, 'Subject', uvSphereMesh(48, 24, 1.2), { location: [0, 0, 1.2], smooth: true, mat: material(ctx.doc, 'Clay', { baseColor: [0.7, 0.6, 0.55], roughness: 0.5 }) });
    const light = (name, loc, energy, color) => addObject(ctx.doc, { type: 'LIGHT', name, location: loc, data: { ...defaultLight('POINT'), energy, color, radius: 0.3 } });
    light('Key', [4, -4, 5], 500, [1, 0.92, 0.8]);
    light('Fill', [-5, -3, 2], 120, [0.7, 0.8, 1]);
    light('Rim', [0, 4, 4], 300, [1, 1, 1]);
    return ctx;
  }),
  s('hello-text', 'beginner', 'Hello Text', '글자 만들기', ['text'], 'A text object with depth. Change the words in the Object Data tab.', '두께가 있는 텍스트 오브젝트입니다. 오브젝트 데이터 탭에서 글자를 바꿀 수 있습니다.', 'Open the Object Data tab and change the text.', '오브젝트 데이터 탭을 열어 글자를 바꿔 보세요.', () => {
    const ctx = start({ camera: [1.8, -13, 3.4], target: [1.8, 0, 0.9] });
    const obj = addObject(ctx.doc, { type: 'TEXT', name: 'Text', rotation: [90, 0, 0], location: [-1.2, 0, 0.2], data: { body: 'Hello', size: 1.6, extrude: 0.25, align: 'LEFT' }, materials: [material(ctx.doc, 'Letters', { baseColor: PALETTE.blue, roughness: 0.3 }).id] });
    ctx.doc.activeId = obj.id;
    ctx.doc.selected = [obj.id];
    return ctx;
  }),
  s('mirror-shape', 'beginner', 'Half a Shape, Mirrored', '반쪽 모델링', ['modifier', 'mirror'], 'Model one side; the Mirror modifier makes the other.', '한쪽만 모델링하면 미러 모디파이어가 반대쪽을 만듭니다.', 'Press Tab and move a vertex: the other side follows.', 'Tab을 누르고 꼭짓점을 옮겨 보세요. 반대쪽이 따라옵니다.', () => {
    const ctx = start({ camera: [5, -6, 3], target: [0, 0, 1] });
    const mesh = cubeMesh(1.4);
    mesh.verts = mesh.verts.map(([x, y, z]) => [x + 0.7, y, z * (x > 0 ? 0.5 : 1)]);
    const obj = shape(ctx, 'Half', mesh, { location: [0, 0, 1], mat: material(ctx.doc, 'Teal', { baseColor: [0.1, 0.55, 0.55], roughness: 0.35 }) });
    use(obj, 'MIRROR');
    return ctx;
  }),
  s('array-fence', 'beginner', 'A Long Fence', '긴 울타리', ['modifier', 'array'], 'One post and the Array modifier: as many as you like.', '기둥 하나와 배열 모디파이어로 원하는 만큼 늘립니다.', 'In the Modifiers tab raise Count.', '모디파이어 탭에서 개수(Count)를 늘려 보세요.', () => {
    const ctx = start({ camera: [9, -11, 4], target: [3, 0, 0.8], lens: 45 });
    const wood = material(ctx.doc, 'Wood', { baseColor: PALETTE.wood, roughness: 0.7 });
    const post = shape(ctx, 'Post', cubeMesh(1), { location: [-6, 0, 0.8], scale: [0.2, 0.2, 1.6], mat: wood });
    use(post, 'ARRAY', { count: 15, offsetX: 5, offsetY: 0, offsetZ: 0 });
    for (const z of [0.55, 1.2]) shape(ctx, 'Rail', cubeMesh(1), { location: [1, 0, z], scale: [14.4, 0.07, 0.15], mat: wood });
    return ctx;
  }),
  s('bouncing-ball', 'beginner', 'Bouncing Ball', '튀는 공', ['animation', 'keyframes'], 'Keyframes on height, with a bounce in the timing. Press Space.', '높이에 키프레임을 넣고 타이밍으로 튕김을 만듭니다. 스페이스를 누르세요.', 'Press Space to play. Then move a key in the Dope Sheet.', '스페이스로 재생한 뒤 도프 시트에서 키를 옮겨 보세요.', () => {
    const ctx = start({ camera: [7, -9, 3.6], target: [0, 0, 1.4], frameEnd: 72 });
    const ball = shape(ctx, 'Ball', uvSphereMesh(32, 16, 0.5), { location: [-3, 0, 3], smooth: true, mat: material(ctx.doc, 'Red', { baseColor: PALETTE.red, roughness: 0.25 }) });
    const heights = [3, 0.5, 2, 0.5, 1.2, 0.5, 0.8, 0.5];
    heights.forEach((z, i) => {
      const f = 1 + i * 10;
      anim.insertKey(ball, 'location.2', f, z, z === 0.5 ? 'QUAD' : 'SINE');
      anim.insertKey(ball, 'location.0', f, -3 + i * 0.9, 'LINEAR');
    });
    setFrame(ctx.doc, 22);
    return ctx;
  }, { workspace: 'animation', thumbFrame: 22 }),
  s('turntable', 'beginner', 'Turntable', '턴테이블', ['animation', 'camera', 'parent'], 'The camera circles the subject by being a child of a turning empty.', '회전하는 엠프티의 자식이 된 카메라가 대상을 돕니다.', 'Press Numpad 0 for the camera view, then Space.', '숫자패드 0으로 카메라 시점에 맞춘 뒤 스페이스를 누르세요.', () => {
    const ctx = start({ frameEnd: 96, camera: [0, -7, 3], target: [0, 0, 1] });
    shape(ctx, 'Subject', torusMesh(64, 24, 1, 0.35), { location: [0, 0, 1.2], rotation: [55, 0, 0], smooth: true, mat: material(ctx.doc, 'Gold', { baseColor: [1, 0.76, 0.33], metallic: 1, roughness: 0.25 }) });
    const rig = addObject(ctx.doc, { type: 'EMPTY', name: 'Rig', data: { display: 'ARROWS', size: 1 } });
    getObject(ctx.doc, ctx.doc.activeCamera).parent = rig.id;
    anim.insertKey(rig, 'rotation.2', 1, 0, 'LINEAR');
    anim.insertKey(rig, 'rotation.2', 97, 360, 'LINEAR');
    return ctx;
  }, { workspace: 'animation' }),
  s('depth-of-field', 'beginner', 'Depth of Field', '피사계 심도', ['camera', 'render'], 'Near and far blur away from the one in focus.', '초점 밖의 앞뒤가 흐려집니다.', 'Press F12. In the camera\'s data tab change the f-stop.', 'F12를 누른 뒤 카메라의 데이터 탭에서 조리개 값을 바꿔 보세요.', () => {
    const ctx = start({ camera: [0, -9, 1.2], target: [0, 0, 0.7], lens: 85, world: [0.6, 0.62, 0.68] });
    const camera = getObject(ctx.doc, ctx.doc.activeCamera);
    camera.data = { ...camera.data, dofEnabled: true, fstop: 0.5, dofFocus: 9 };
    [-3, 0, 4, 9].forEach((y, i) => shape(ctx, 'Pawn', uvSphereMesh(32, 16, 0.7), { location: [(i % 2 ? -1 : 1) * 0.9, y, 0.7], smooth: true, mat: material(ctx.doc, 'Pawn', { baseColor: Object.values(PALETTE)[i], roughness: 0.35 }) }));
    return ctx;
  }, { thumbSamples: 48 }),
  s('glass-metal', 'beginner', 'Glass and Metal', '유리와 금속', ['materials', 'render'], 'What a path tracer is for: reflections and refraction.', '경로 추적 렌더러의 진가, 반사와 굴절입니다.', 'Press F12 to render. Look at what the glass does to the stripes.', 'F12로 렌더해 유리가 줄무늬를 어떻게 휘게 하는지 보세요.', () => {
    const ctx = start({ camera: [0, -8, 2.8], target: [0, 0, 1] });
    shape(ctx, 'Glass', uvSphereMesh(48, 24, 1), { location: [-1.3, 0, 1], smooth: true, mat: material(ctx.doc, 'Glass', { baseColor: [1, 1, 1], transmission: 1, ior: 1.5, roughness: 0 }) });
    shape(ctx, 'Chrome', uvSphereMesh(48, 24, 1), { location: [1.3, 0, 1], smooth: true, mat: material(ctx.doc, 'Chrome', { baseColor: [0.95, 0.95, 0.95], metallic: 1, roughness: 0.05 }) });
    Object.values(PALETTE).slice(0, 7).forEach((c, i) => shape(ctx, 'Stripe', cubeMesh(1), { location: [(i - 3) * 1.6, 4, 1.5], scale: [0.9, 0.2, 3], mat: material(ctx.doc, 'Stripe', { baseColor: c, roughness: 0.6 }) }));
    return ctx;
  }, { thumbSamples: 48 }),
  s('solar-parent', 'beginner', 'A Little Solar System', '작은 태양계', ['parent', 'animation'], 'Moon follows Earth follows Sun: parenting makes it effortless.', '달은 지구를, 지구는 태양을 따릅니다. 부모 관계면 간단합니다.', 'Press Space. Then select the Earth and move it.', '스페이스를 누른 뒤 지구를 선택해 옮겨 보세요.', () => {
    const ctx = start({ world: [0.003, 0.003, 0.01], floor: null, sun: false, camera: [0, -11, 6], target: [1.5, 0, 0], frameEnd: 240 });
    const sun = shape(ctx, 'Sun', uvSphereMesh(48, 24, 1.3), { smooth: true, mat: material(ctx.doc, 'Sun', { baseColor: [0, 0, 0], emission: [1, 0.6, 0.15], emissionStrength: 1.6 }) });
    addObject(ctx.doc, { type: 'LIGHT', name: 'Sunlight', data: { ...defaultLight('POINT'), energy: 3000, radius: 1, castShadow: false } });
    const orbit1 = addObject(ctx.doc, { type: 'EMPTY', name: 'Earth Orbit', parent: sun.id, data: { display: 'CIRCLE', size: 5 } });
    const earth = shape(ctx, 'Earth', uvSphereMesh(32, 16, 0.8), { location: [5, 0, 0], parent: orbit1.id, smooth: true, mat: material(ctx.doc, 'Earth', { baseColor: PALETTE.blue, roughness: 0.5 }) });
    const orbit2 = addObject(ctx.doc, { type: 'EMPTY', name: 'Moon Orbit', parent: earth.id, data: { display: 'CIRCLE', size: 1.4 } });
    shape(ctx, 'Moon', uvSphereMesh(24, 12, 0.25), { location: [1.4, 0, 0], parent: orbit2.id, smooth: true, mat: material(ctx.doc, 'Moon', { baseColor: [0.7, 0.7, 0.7] }) });
    for (const [o, turns] of [[orbit1, 1], [orbit2, 6]]) { anim.insertKey(o, 'rotation.2', 1, 0, 'LINEAR'); anim.insertKey(o, 'rotation.2', 241, 360 * turns, 'LINEAR'); }
    setFrame(ctx.doc, 20);
    return ctx;
  }, { thumbFrame: 20 }),
  s('curve-ribbon', 'beginner', 'A Thick Curve', '두꺼운 커브', ['curve'], 'A curve is a line until it has a Bevel Depth.', '커브는 베벨 깊이를 주기 전까지 선일 뿐입니다.', 'Change Bevel Depth in the Object Data tab.', '오브젝트 데이터 탭에서 베벨 깊이를 바꿔 보세요.', () => {
    const ctx = start({ camera: [0, -8, 3.4], target: [0, 0, 1.2] });
    const points = Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * Math.PI * 4; return [Math.cos(a) * (2.4 - i * 0.12), Math.sin(a) * (2.4 - i * 0.12), 0.3 + i * 0.2]; });
    addObject(ctx.doc, { type: 'CURVE', name: 'Spiral', data: { splines: [{ kind: 'BEZIER', cyclic: false, points }], bevelDepth: 0.12, resolution: 16 }, materials: [material(ctx.doc, 'Tube', { baseColor: PALETTE.purple, roughness: 0.3 }).id] });
    return ctx;
  }),
  s('duplicate-stairs', 'beginner', 'Stairs', '계단', ['duplicate', 'array'], 'One step and an offset in three directions.', '계단 하나를 세 방향으로 띄워 쌓습니다.', 'Change the Array offsets and see the stairs turn into a ramp.', '배열 오프셋을 바꿔 계단이 경사로로 변하는 것을 보세요.', () => {
    const ctx = start({ camera: [14, -15, 8], target: [3, 0, 2], lens: 45 });
    const step = shape(ctx, 'Step', cubeMesh(1), { location: [-3, 0, 0.15], scale: [1, 3, 0.3], mat: material(ctx.doc, 'Stone', { baseColor: [0.62, 0.3, 0.16], roughness: 0.7 }) });
    use(step, 'ARRAY', { count: 14, offsetX: 1, offsetY: 0, offsetZ: 1 });
    return ctx;
  }),

  // ── Intermediate: modifiers working together, node trees, rigs and simple simulations.
  s('subsurf-mug', 'intermediate', 'Mug', '머그잔', ['edit mode', 'subdivision'], 'A cylinder, an inset, an extrude and Subdivision Surface.', '원기둥에 인셋과 돌출, 서브디비전 표면을 더합니다.', 'Press Tab to see the few faces it really is.', 'Tab을 눌러 실제로는 면이 얼마 안 된다는 것을 확인해 보세요.', () => {
    const ctx = start({ camera: [4.4, -5.2, 3.6], target: [0, 0, 1], lens: 60 });
    const mug = shape(ctx, 'Mug', cylinderMesh(16, 1, 2), { location: [0, 0, 1], smooth: true, mat: material(ctx.doc, 'Glaze', { baseColor: [0.85, 0.3, 0.2], roughness: 0.15 }) });
    run(ctx, 'object.editmode_toggle');
    const m = mug.data;
    const top = m.faces.findIndex((f) => f.length === 16 && f.every((i) => m.verts[i][2] > 0));
    m.selMode = 'face';
    m.selF = [top];
    m.selV = [...m.faces[top]];
    run(ctx, 'mesh.inset', { thickness: 0.12 });
    run(ctx, 'mesh.extrude_region', { offset: -1.75 });
    run(ctx, 'object.editmode_toggle');
    use(mug, 'SUBSURF', { levels: 2 });
    const handle = shape(ctx, 'Handle', torusMesh(32, 12, 0.55, 0.11), { location: [1.05, 0, 1.05], rotation: [90, 0, 0], smooth: true, mat: mug.materials.length ? { id: mug.materials[0] } : null });
    void handle;
    return ctx;
  }, { workspace: 'modeling' }),
  s('street-lamp', 'intermediate', 'Street Lamp', '가로등', ['lights', 'parent'], 'A pole, an arm and a warm point light in the dusk.', '기둥과 팔, 해질녘의 따뜻한 점광원입니다.', 'Select the light and change its colour in the Data tab.', '조명을 골라 데이터 탭에서 색을 바꿔 보세요.', () => {
    const ctx = start({ world: [0.09, 0.11, 0.2], floor: [0.34, 0.35, 0.38], camera: [7, -11, 3.6], target: [0.3, 0, 2.3], sun: false });
    const iron = material(ctx.doc, 'Iron', { baseColor: PALETTE.dark, roughness: 0.4, metallic: 0.8 });
    shape(ctx, 'Base', cylinderMesh(32, 0.32, 0.3), { location: [0, 0, 0.15], mat: iron, smooth: true });
    shape(ctx, 'Pole', cylinderMesh(32, 0.09, 4.4), { location: [0, 0, 2.3], mat: iron, smooth: true });
    shape(ctx, 'Arm', cylinderMesh(24, 0.06, 1.2), { location: [0.55, 0, 4.45], rotation: [0, 90, 0], mat: iron, smooth: true });
    shape(ctx, 'Shade', coneMesh(32, 0.42, 0.4), { location: [1.15, 0, 4.3], mat: iron, smooth: true });
    shape(ctx, 'Bulb', uvSphereMesh(24, 12, 0.16), { location: [1.15, 0, 4.03], mat: material(ctx.doc, 'Glass', { baseColor: PALETTE.yellow, roughness: 0.2 }), smooth: true });
    addObject(ctx.doc, { type: 'LIGHT', name: 'Lamp', location: [1.15, 0, 3.7], data: { ...defaultLight('POINT'), energy: 260, color: [1, 0.78, 0.48], radius: 0.2, castShadow: true } });
    shape(ctx, 'Bench', cubeMesh(1), { location: [2.1, -1.3, 0.5], scale: [1.8, 0.5, 0.08], mat: material(ctx.doc, 'Wood', { baseColor: PALETTE.wood, roughness: 0.6 }) });
    for (const x of [1.4, 2.8]) shape(ctx, 'Bench Leg', cubeMesh(1), { location: [x, -1.3, 0.24], scale: [0.1, 0.45, 0.48], mat: iron });
    return ctx;
  }),
  s('screw-spring', 'intermediate', 'Spring', '용수철', ['modifier', 'screw'], 'A small circle swept up by the Screw modifier.', '작은 원을 스크류 모디파이어로 쓸어 올립니다.', 'Change Angle and Height in the Modifiers tab.', '모디파이어 탭에서 각도와 높이를 바꿔 보세요.', () => {
    const ctx = start({ camera: [8, -10, 4.5], target: [0, 0, 1.9], lens: 60 });
    const profile = circleMesh(12, 0.12, 'NOTHING');
    profile.verts = profile.verts.map(([x, y]) => [x + 1, 0, y]);
    const obj = shape(ctx, 'Spring', profile, { location: [0, 0, 0.2], smooth: true, mat: material(ctx.doc, 'Steel', { baseColor: [0.75, 0.76, 0.78], metallic: 1, roughness: 0.25 }) });
    use(obj, 'SCREW', { angle: 2160, steps: 120, height: 3.4, axis: 'Z' });
    return ctx;
  }),
  s('boolean-cheese', 'intermediate', 'Cheese', '구멍 뚫린 치즈', ['modifier', 'boolean'], 'A block with holes: spheres cut by Boolean modifiers.', '불리언 모디파이어로 구를 빼서 구멍을 냅니다.', 'Select a hidden cutter in the Outliner, show it and move it.', '아웃라이너에서 숨긴 커터를 보이게 해 옮겨 보세요.', () => {
    const ctx = start({ camera: [5, -6.5, 4.2], target: [0, 0, 0.8], lens: 60 });
    const cheese = shape(ctx, 'Cheese', cubeMesh(1), { location: [0, 0, 0.8], scale: [3.4, 2.2, 1.6], mat: material(ctx.doc, 'Cheese', { baseColor: [0.95, 0.72, 0.15], roughness: 0.5 }) });
    [[-1.2, -1, 0.95, 0.45], [0.4, -1.05, 0.5, 0.35], [0.9, -0.9, 1.3, 0.28], [1.6, 0.4, 1.5, 0.5], [-0.6, 0.2, 1.65, 0.4], [-1.6, 0.6, 0.5, 0.3]].forEach(([x, y, z, r], i) => {
      const cutter = shape(ctx, `Cutter ${i + 1}`, icoSphereMesh(2, r), { location: [x, y, z], hide: true, hideRender: true, smooth: true });
      use(cheese, 'BOOLEAN', { operation: 'DIFFERENCE', object: cutter.id });
    });
    ctx.doc.activeId = cheese.id;
    ctx.doc.selected = [cheese.id];
    return ctx;
  }),
  s('noise-material', 'intermediate', 'Marble', '대리석', ['shader nodes'], 'A noise texture through a colour ramp into Base Color.', '노이즈 텍스처를 컬러 램프로 거쳐 기본 색에 연결합니다.', 'In the Shading workspace change the Noise Scale.', '셰이딩 워크스페이스에서 노이즈 크기를 바꿔 보세요.', () => {
    const ctx = start({ camera: [4, -5, 2.8], target: [0, 0, 1], lens: 60 });
    const m = material(ctx.doc, 'Marble', { roughness: 0.15 });
    const bsdf = useNodes(m);
    bsdf.values.Roughness = 0.15;
    const noise = createNode('TEX_NOISE', -560, 60, { Scale: 3, Detail: 6, Roughness: 0.6 });
    const ramp = createNode('COLOR_RAMP', -280, 60, { stops: [{ pos: 0.35, color: [0.12, 0.12, 0.16] }, { pos: 0.5, color: [0.85, 0.85, 0.8] }, { pos: 0.72, color: [0.98, 0.97, 0.95] }] });
    m.nodes.nodes.push(noise, ramp);
    addLink(m.nodes, noise.id, 'Fac', ramp.id, 'Fac');
    addLink(m.nodes, ramp.id, 'Color', bsdf.id, 'Base Color');
    shape(ctx, 'Sphere', uvSphereMesh(64, 32, 1), { location: [0, 0, 1], smooth: true, mat: m });
    return ctx;
  }, { workspace: 'shading' }),
  s('sky-world', 'intermediate', 'Sky World', '하늘 월드', ['world nodes'], 'The whole sky comes from a node tree; nothing lights the scene but it.', '하늘 전체가 노드 트리에서 나오고, 그것만으로 장면을 비춥니다.', 'Change the sky\'s Horizon colour in the World tree.', '월드 트리에서 하늘의 지평선 색을 바꿔 보세요.', () => {
    const ctx = start({ sun: false, camera: [6, -7, 2.2], target: [0, 0, 1], floor: [0.5, 0.45, 0.38] });
    const w = ctx.doc.world;
    w.useNodes = true;
    w.nodes = defaultWorldGraph([0.5, 0.6, 0.8], 1.5);
    const sky = createNode('TEX_SKY', 0, 80, { Zenith: [0.1, 0.25, 0.65], Horizon: [0.95, 0.65, 0.4], Ground: [0.25, 0.2, 0.18] });
    w.nodes.nodes.push(sky);
    addLink(w.nodes, sky.id, 'Color', w.nodes.nodes[0].id, 'Color');
    [[0, 0, 1], [-2.2, 1, 0.7], [2, 1.6, 1.2]].forEach(([x, y, r], i) => shape(ctx, 'Rock', icoSphereMesh(2, r), { location: [x, y, r * 0.8], mat: material(ctx.doc, 'Rock', { baseColor: [0.5 + i * 0.08, 0.5, 0.48], roughness: 0.9 }) }));
    return ctx;
  }, { thumbSamples: 32 }),
  s('robot-arm', 'intermediate', 'Robot Arm', '로봇 팔', ['armature', 'skinning'], 'A tube bent by three bones, with automatic weights and a keyed pose.', '자동 가중치로 뼈 세 개에 묶인 관을 키 포즈로 구부립니다.', 'Press Space. Then enter Pose Mode and turn a bone.', '스페이스를 누른 뒤 포즈 모드에서 뼈를 돌려 보세요.', () => {
    const ctx = start({ camera: [8, -9, 4], target: [0, 0, 2.4], frameEnd: 80, lens: 45 });
    const arm = createArmature();
    arm.bones = [createBone('Base', [0, 0, 0], [0, 0, 1.5], null), createBone('Mid', [0, 0, 1.5], [0, 0, 3], 0), createBone('Tip', [0, 0, 3], [0, 0, 4.5], 1)];
    const rig = addObject(ctx.doc, { type: 'ARMATURE', name: 'Arm', data: arm });
    const tube = shape(ctx, 'Tube', cylinderMesh(16, 0.32, 4.5), { location: [0, 0, 2.25], smooth: true, mat: material(ctx.doc, 'Paint', { baseColor: PALETTE.orange, roughness: 0.35 }) });
    const sliced = tube.data;
    for (let i = 0; i < 3; i++) { sliced.selV = sliced.verts.map((_, k) => k); sliced.selMode = 'vert'; run(ctx, 'object.editmode_toggle'); run(ctx, 'mesh.select_all', { action: 'SELECT' }); run(ctx, 'mesh.subdivide', { cuts: 1 }); run(ctx, 'object.editmode_toggle'); }
    ctx.doc.selected = [tube.id, rig.id];
    ctx.doc.activeId = rig.id;
    run(ctx, 'object.parent_set', { type: 'ARMATURE_AUTO' });
    for (const [frame, a, b] of [[1, 0, 0], [40, 35, 45], [80, -25, 30]]) {
      anim.insertKey(arm.bones[1], 'pose.rotation.0', frame, a, 'BEZIER');
      anim.insertKey(arm.bones[2], 'pose.rotation.0', frame, b, 'BEZIER');
    }
    arm.bones[1].pose.rotation[0] = 35;
    arm.bones[2].pose.rotation[0] = 45;
    ctx.doc.selected = [tube.id];
    ctx.doc.activeId = tube.id;
    return ctx;
  }, { workspace: 'animation' }),
  s('cloth-flag', 'intermediate', 'Flag', '깃발', ['cloth', 'wind'], 'A cloth pinned along one edge, in the wind.', '한쪽 가장자리를 고정한 천이 바람에 날립니다.', 'Press Space. Change the wind strength and bake again.', '스페이스를 누른 뒤 바람 세기를 바꿔 다시 베이크해 보세요.', () => {
    const ctx = start({ camera: [2, -11, 4], target: [1, 0, 3], frameEnd: 80, lens: 45 });
    shape(ctx, 'Pole', cylinderMesh(16, 0.06, 6), { location: [-2, 0, 3], smooth: true, mat: material(ctx.doc, 'Pole', { baseColor: [0.7, 0.7, 0.72], metallic: 1, roughness: 0.3 }) });
    const mesh = gridMesh(20, 12, 1);
    mesh.verts = mesh.verts.map(([x, y]) => [(x + 0.5) * 4, 0, (y + 0.5) * 2.4]);
    mesh.vgroups = [{ name: 'Pin', w: Object.fromEntries(mesh.verts.map((v, i) => [i, v[0] < 1e-6 ? 1 : 0]).filter(([, w]) => w)) }];
    const flag = shape(ctx, 'Flag', mesh, { location: [-2, 0, 3.4], smooth: true, mat: material(ctx.doc, 'Cloth', { baseColor: PALETTE.red, roughness: 0.7 }), cloth: { ...defaultCloth(), pinGroup: 'Pin' } });
    run(ctx, 'object.forcefield_add', { kind: 'WIND' });
    const wind = activeObject(ctx.doc);
    wind.location = [-4, -2, 4];
    wind.rotation = [0, 90, 15];
    wind.field.strength = 9;
    ctx.doc.activeId = flag.id;
    ctx.doc.selected = [flag.id];
    return ctx;
  }, { workspace: 'animation', bake: true, thumbFrame: 60 }),
  s('dominoes', 'intermediate', 'Falling Boxes', '떨어지는 상자들', ['rigid body'], 'A stack of rigid boxes dropped on the floor.', '쌓인 강체 상자들을 바닥에 떨어뜨립니다.', 'Press Space. Add another box and bake again.', '스페이스를 누른 뒤 상자를 더 넣고 다시 베이크해 보세요.', () => {
    const ctx = start({ camera: [9, -11, 6], target: [0, 0, 2], frameEnd: 96, lens: 45 });
    getObject(ctx.doc, ctx.doc.objects.find((o) => o.name === 'Floor').id).rigidBody = defaultRigidBody('PASSIVE');
    const colors = Object.values(PALETTE);
    for (let i = 0; i < 18; i++) {
      const [x, y, z] = [((i * 7) % 5) * 1.05 - 2, ((i * 3) % 3) * 1.05 - 1, 1.2 + Math.floor(i / 4) * 1.5];
      shape(ctx, 'Box', cubeMesh(0.9), { location: [x, y, z], mat: material(ctx.doc, 'Box', { baseColor: colors[i % colors.length] }), rigidBody: defaultRigidBody('ACTIVE') });
    }
    return ctx;
  }, { workspace: 'animation', bake: true, thumbFrame: 40 }),
  s('fountain', 'intermediate', 'Fountain', '분수', ['particles'], 'Particles thrown up from a disc, falling back under gravity.', '원판에서 위로 쏜 입자가 중력으로 떨어집니다.', 'Change Velocity and Count in the Particles tab.', '파티클 탭에서 속도와 개수를 바꿔 보세요.', () => {
    const ctx = start({ camera: [6, -8, 4], target: [0, 0, 1.6], frameEnd: 120 });
    const disc = shape(ctx, 'Nozzle', circleMesh(32, 0.3, 'NGON'), { location: [0, 0, 0.6], mat: material(ctx.doc, 'Water', { baseColor: [0.1, 0.4, 0.95], roughness: 0.3 }) });
    disc.particles = [{ ...defaultParticles(), count: 2500, velocity: 5.5, randomVelocity: 1, lifetime: 70, frameEnd: 120, size: 0.07 }];
    shape(ctx, 'Basin', cylinderMesh(48, 2.2, 0.3), { location: [0, 0, 0.15], mat: material(ctx.doc, 'Stone', { baseColor: [0.55, 0.53, 0.5] }) });
    setFrame(ctx.doc, 80);
    return ctx;
  }, { workspace: 'animation', thumbFrame: 80 }),
  s('shape-keys', 'intermediate', 'Morphing Shape', '모양 바꾸기', ['shape keys', 'animation'], 'A cube turns into a sphere with one shape key and two keyframes.', '셰이프 키 하나와 키프레임 둘로 큐브가 구로 바뀝니다.', 'Drag the shape key\'s value in the Object Data tab.', '오브젝트 데이터 탭에서 셰이프 키 값을 끌어 보세요.', () => {
    const ctx = start({ camera: [7, -9, 4.4], target: [0, 0, 1.3], frameEnd: 60 });
    // A cube with many faces, so that it can become a sphere. Its corners are bevelled a little by the subdivision.
    const mesh = catmullClark(catmullClark(catmullClark(cubeMesh(2))));
    const obj = shape(ctx, 'Morph', mesh, { location: [0, 0, 1.4], mat: material(ctx.doc, 'Clay', { baseColor: [0.2, 0.5, 0.7], roughness: 0.3 }) });
    mesh.verts = mesh.verts.map(([x, y, z]) => { const k = 1 / Math.max(Math.abs(x), Math.abs(y), Math.abs(z)); return [x * k, y * k, z * k]; });
    mesh.smooth = true;
    const sphere = catmullClark(catmullClark(catmullClark(cubeMesh(2)))).verts.map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [(x / l) * 1.3, (y / l) * 1.3, (z / l) * 1.3]; });
    mesh.shapeKeys = [{ name: 'Sphere', value: 0.6, verts: sphere }];
    anim.insertKey(mesh, 'shapeKeys.0.value', 1, 0, 'BEZIER');
    anim.insertKey(mesh, 'shapeKeys.0.value', 60, 1, 'BEZIER');
    void obj;
    return ctx;
  }),
  s('track-to', 'intermediate', 'Eyes on the Ball', '공을 쫓는 눈', ['constraints'], 'Track To keeps the spotlight and the camera on a moving ball.', '따라보기 컨스트레인트로 조명과 카메라가 움직이는 공을 놓치지 않습니다.', 'Press Space, then move the ball by hand.', '스페이스를 누른 뒤 공을 직접 옮겨 보세요.', () => {
    const ctx = start({ world: [0.04, 0.04, 0.06], sun: false, camera: [8, -9, 5], target: [0, 0, 1], frameEnd: 96 });
    const ball = shape(ctx, 'Ball', uvSphereMesh(32, 16, 0.6), { location: [0, 0, 0.6], smooth: true, mat: material(ctx.doc, 'Ball', { baseColor: PALETTE.yellow, roughness: 0.3 }) });
    for (const [f, x, y] of [[1, -4, -2], [32, 3, -1], [64, 1, 4], [96, -4, -2]]) { anim.insertKey(ball, 'location.0', f, x); anim.insertKey(ball, 'location.1', f, y); }
    const spot = addObject(ctx.doc, { type: 'LIGHT', name: 'Spot', location: [0, 0, 8], data: { ...defaultLight('SPOT'), energy: 2500, spotSize: 30, spotBlend: 0.4 } });
    spot.constraints.push({ ...createConstraint('TRACK_TO'), target: ball.id });
    getObject(ctx.doc, ctx.doc.activeCamera).constraints.push({ ...createConstraint('TRACK_TO'), target: ball.id });
    addObject(ctx.doc, { type: 'LIGHT', name: 'Fill', location: [-6, -6, 5], data: { ...defaultLight('POINT'), energy: 200 } });
    setFrame(ctx.doc, 32);
    return ctx;
  }, { thumbFrame: 32 }),
  s('lattice-bend', 'intermediate', 'Bending with a Lattice', '래티스로 구부리기', ['lattice', 'deform'], 'Move the corners of a cage and the shape inside follows.', '바깥 틀의 모서리를 옮기면 안의 모양이 따라옵니다.', 'Select the lattice; change its points by script or move the object.', '래티스를 선택해 옮겨 보세요. 안의 모양이 바뀝니다.', () => {
    const ctx = start({ camera: [6, -7, 4], target: [0, 0, 1.6] });
    const mesh = catmullClark(catmullClark(catmullClark(cubeMesh(2))));
    const obj = shape(ctx, 'Blob', mesh, { location: [0, 0, 1.2], scale: [0.8, 0.8, 1.4], smooth: true, mat: material(ctx.doc, 'Green', { baseColor: PALETTE.green, roughness: 0.4 }) });
    run(ctx, 'object.lattice_add');
    const lat = activeObject(ctx.doc);
    lat.location = [0, 0, 1.2];
    lat.scale = [2.2, 2.2, 3.6];
    lat.data.points = lat.data.rest.map(([x, y, z]) => (z > 0 ? [x * 0.35 + 0.35, y * 0.35, z] : [x * 1.2, y * 1.2, z]));
    use(obj, 'LATTICE', { object: lat.id });
    return ctx;
  }),
  s('collection-city', 'intermediate', 'Instanced City', '인스턴스 도시', ['collections', 'instancing'], 'One small block of buildings repeated many times, for the price of one.', '건물 한 블록을 여러 번 반복합니다. 비용은 한 블록치입니다.', 'Change a building in the Block collection: every block changes.', 'Block 컬렉션의 건물을 바꿔 보세요. 모든 블록이 바뀝니다.', () => {
    const ctx = start({ camera: [20, -24, 15], target: [0, 0, 1], lens: 40, world: [0.6, 0.66, 0.78] });
    const doc = ctx.doc;
    run(ctx, 'collection.create', { name: 'Block' });
    const block = doc.collections.at(-1);
    block.exclude = true;
    const colors = [[0.55, 0.56, 0.6], [0.7, 0.62, 0.5], [0.45, 0.5, 0.55], [0.65, 0.65, 0.68]];
    [[-1.5, -1.5, 3], [1.5, -1.5, 5.5], [-1.5, 1.5, 2], [1.5, 1.5, 7]].forEach(([x, y, h2], i) => {
      addObject(doc, { type: 'MESH', name: `Building ${i + 1}`, collection: block.id, data: cubeMesh(1), location: [x, y, h2 / 2], scale: [2.3, 2.3, h2], materials: [material(doc, 'Wall', { baseColor: colors[i], roughness: 0.65 }).id] });
    });
    doc.activeCollection = 'col_root';
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      addObject(doc, { type: 'EMPTY', name: 'City Block', location: [i * 8, j * 8, 0], rotation: [0, 0, ((i + j) % 2) * 90], data: { display: 'PLAIN_AXES', size: 0.5, instanceCollection: block.id } });
    }
    return ctx;
  }, { thumbSamples: 24 }),
  s('studs-faces', 'intermediate', 'Studded Sphere', '돌기 달린 구', ['instancing'], 'A child object repeated on every face, turned to its normal.', '자식 오브젝트를 모든 면에, 면의 방향으로 돌려 반복합니다.', 'Change the parent\'s subdivisions in Object Data, or use Instancing › On Vertices.', '오브젝트 메뉴의 인스턴싱에서 꼭짓점에 놓기로 바꿔 보세요.', () => {
    const ctx = start({ camera: [8, -10, 5.5], target: [0, 0, 1.6], lens: 60 });
    const ball = shape(ctx, 'Base', icoSphereMesh(2, 1.4), { location: [0, 0, 1.6], mat: material(ctx.doc, 'Base', { baseColor: [0.15, 0.17, 0.2], roughness: 0.4 }), instancing: { mode: 'FACES', scaleByArea: false, hideSources: true } });
    shape(ctx, 'Stud', coneMesh(12, 0.12, 0.35), { parent: ball.id, location: [0, 0, 0.18], mat: material(ctx.doc, 'Stud', { baseColor: [0.95, 0.72, 0.2], metallic: 1, roughness: 0.3 }) });
    ctx.doc.activeId = ball.id;
    ctx.doc.selected = [ball.id];
    return ctx;
  }),
  s('glare-compositor', 'intermediate', 'Glow in the Compositor', '합성 글로우', ['compositor'], 'Bright lamps get a glare and a vignette after the render.', '렌더 뒤에 밝은 조명에 글레어와 비네트를 더합니다.', 'Press F12, then raise the Glare Strength in the Compositing workspace.', 'F12를 누른 뒤 합성 워크스페이스에서 글레어 세기를 올려 보세요.', () => {
    const ctx = start({ world: [0.01, 0.01, 0.02], floor: [0.12, 0.12, 0.14], sun: false, camera: [0, -9, 2.5], target: [0, 0, 1.1] });
    [PALETTE.red, PALETTE.yellow, PALETTE.green, PALETTE.blue, PALETTE.purple].forEach((c, i) => shape(ctx, 'Lamp', uvSphereMesh(32, 16, 0.42), { location: [(i - 2) * 1.5, 0, 1.1], smooth: true, mat: material(ctx.doc, 'Lamp', { baseColor: [0, 0, 0], emission: c, emissionStrength: 14 }) }));
    const doc = ctx.doc;
    doc.compositorEnabled = true;
    doc.compositor = defaultCompositorGraph();
    const g = doc.compositor;
    const layers = g.nodes.find((n) => n.type === 'CMP_RENDER_LAYERS');
    const out = g.nodes.find((n) => n.type === 'CMP_OUTPUT');
    const glare = createNode('CMP_GLARE', 300, 60, { Threshold: 1, Size: 14, Strength: 1.2 });
    const vignette = createNode('CMP_VIGNETTE', 560, 60, { Amount: 0.5 });
    g.nodes.push(glare, vignette);
    addLink(g, layers.id, 'Image', glare.id, 'Image');
    addLink(g, glare.id, 'Image', vignette.id, 'Image');
    addLink(g, vignette.id, 'Image', out.id, 'Image');
    return ctx;
  }, { workspace: 'compositing' }),
  s('metaballs', 'intermediate', 'Lava Lamp', '라바 램프', ['metaballs', 'animation'], 'Metaballs melt into each other as they rise and sink.', '메타볼이 오르내리며 서로 녹아듭니다.', 'Press Space. Move an element in the Object Data tab.', '스페이스를 누른 뒤 오브젝트 데이터 탭에서 요소를 옮겨 보세요.', () => {
    const ctx = start({ world: [0.03, 0.02, 0.05], floor: [0.1, 0.1, 0.12], sun: false, camera: [0, -14, 5], target: [0, 0, 2.2], frameEnd: 120, lens: 60 });
    const elements = [{ co: [0, 0, 1], radius: 1, stiffness: 2 }, { co: [0.4, 0.2, 2.6], radius: 0.8, stiffness: 2 }, { co: [-0.4, -0.2, 3.3], radius: 0.7, stiffness: 2 }, { co: [0.2, 0, 2], radius: 0.75, stiffness: 2 }];
    const m = material(ctx.doc, 'Wax', { baseColor: [1, 0.25, 0.1], roughness: 0.3, emission: [1, 0.2, 0.05], emissionStrength: 1.4 });
    const obj = addObject(ctx.doc, { type: 'META', name: 'Lava', data: { elements, threshold: 0.6, resolution: 0.12 }, materials: [m.id] });
    elements.forEach((_, i) => {
      for (let f = 0; f <= 4; f++) anim.insertKey(obj.data, `elements.${i}.co.2`, 1 + f * 30, [1, 2.6, 3.3, 2][i] + Math.sin(f * 1.57 + i * 1.3) * 0.8, 'SINE');
    });
    addObject(ctx.doc, { type: 'LIGHT', name: 'Lamp', location: [0, -3, 5], data: { ...defaultLight('POINT'), energy: 200 } });
    return ctx;
  }),

  // ── Advanced: simulations, scripting, node programs, and several editors working together.
  s('geo-scatter', 'advanced', 'Geometry Nodes: Forest', '지오메트리 노드: 숲', ['geometry nodes'], 'A node program scatters cones on a bumpy ground and sizes them at random.', '노드 프로그램이 울퉁불퉁한 땅에 원뿔을 뿌리고 크기를 무작위로 정합니다.', 'In the Geo Nodes workspace raise Density.', '지오 노드 워크스페이스에서 밀도를 올려 보세요.', () => {
    const ctx = start({ floor: null, camera: [15, -19, 11], target: [0, 0, 1], lens: 45, world: [0.65, 0.72, 0.85] });
    const obj = shape(ctx, 'Forest', gridMesh(40, 40, 16), { smooth: true, mat: material(ctx.doc, 'Grass', { baseColor: [0.2, 0.4, 0.12], roughness: 0.9 }) });
    const mod = use(obj, 'NODES');
    mod.graph = defaultGeometryGraph();
    const g = mod.graph;
    const [input, output] = [g.nodes.find((n) => n.type === 'GROUP_INPUT'), g.nodes.find((n) => n.type === 'GROUP_OUTPUT')];
    g.links = [];
    const pos = createNode('POSITION', -500, 300);
    const noise = createNode('TEX_NOISE', -280, 300, { Scale: 0.35, Detail: 3 });
    const up = createNode('COMBINE_XYZ', -60, 300);
    const lift = createNode('MATH', -280, 460, { operation: 'MULTIPLY', B: 3 });
    const bump = createNode('SET_POSITION', 80, 80);
    const points = createNode('DISTRIBUTE_POINTS', 320, 240, { Density: 0.8, Seed: 5 });
    const tree = createNode('MESH_CONE', 320, 460, { Vertices: 12, Radius: 0.42, Depth: 1.7 });
    const treeUp = createNode('TRANSFORM_GEOMETRY', 520, 460, { Translation: [0, 0, 0.85] });
    const random = createNode('RANDOM_VALUE', 520, 660, { Min: 0.5, Max: 1.5, Seed: 2 });
    const inst = createNode('INSTANCE_ON_POINTS', 760, 240);
    const join = createNode('JOIN_GEOMETRY', 1000, 80);
    g.nodes.push(pos, noise, up, lift, bump, points, tree, treeUp, random, inst, join);
    addLink(g, pos.id, 'Position', noise.id, 'Vector');
    addLink(g, noise.id, 'Fac', lift.id, 'A');
    addLink(g, lift.id, 'Value', up.id, 'Z');
    addLink(g, input.id, 'Geometry', bump.id, 'Geometry');
    addLink(g, up.id, 'Vector', bump.id, 'Offset');
    addLink(g, bump.id, 'Geometry', points.id, 'Mesh');
    addLink(g, tree.id, 'Mesh', treeUp.id, 'Geometry');
    addLink(g, points.id, 'Points', inst.id, 'Points');
    addLink(g, treeUp.id, 'Geometry', inst.id, 'Instance');
    addLink(g, random.id, 'Value', inst.id, 'Scale');
    addLink(g, bump.id, 'Geometry', join.id, 'A');
    addLink(g, inst.id, 'Instances', join.id, 'B');
    addLink(g, join.id, 'Geometry', output.id, 'Geometry');
    return ctx;
  }, { workspace: 'geonodes' }),
  s('smoke-plume', 'advanced', 'Smoke Plume', '연기 기둥', ['smoke', 'volume'], 'Hot smoke rises and curls in a domain. It is baked when it opens.', '뜨거운 연기가 도메인 안에서 소용돌이치며 오릅니다. 열 때 베이크합니다.', 'Press Space. Raise Vorticity in the Physics tab and bake again.', '스페이스를 누른 뒤 물리 탭에서 와류를 올리고 다시 베이크해 보세요.', () => {
    const ctx = start({ world: [0.3, 0.36, 0.48], floor: [0.35, 0.36, 0.38], camera: [11, -12, 4.5], target: [0, 0, 3], frameEnd: 60, lens: 45 });
    shape(ctx, 'Domain', cubeMesh(1), { location: [0, 0, 3], scale: [4, 4, 6], smoke: { ...defaultSmokeDomain(), res: 32, density: 14, buoyancy: 2.6, colour: [0.95, 0.95, 0.97], vorticity: 0.5 } });
    shape(ctx, 'Emitter', uvSphereMesh(16, 8, 0.8), { location: [0, 0, 0.9], smokeFlow: { ...defaultSmokeFlow(), amount: 2 } });
    return ctx;
  }, { bake: true, thumbFrame: 58, thumbSamples: 24 }),
  s('campfire', 'advanced', 'Campfire', '모닥불', ['fire', 'volume'], 'Fuel burns into flame and smoke among some logs.', '장작 사이에서 연료가 불꽃과 연기로 탑니다.', 'Press Space. Change Flame Strength in the Physics tab.', '스페이스를 누른 뒤 물리 탭에서 불꽃 세기를 바꿔 보세요.', () => {
    const ctx = start({ world: [0.01, 0.015, 0.03], floor: [0.14, 0.12, 0.1], sun: false, camera: [5, -7, 3], target: [0, 0, 1.3], frameEnd: 50, lens: 50 });
    const wood = material(ctx.doc, 'Log', { baseColor: [0.2, 0.11, 0.06], roughness: 0.9 });
    for (let i = 0; i < 5; i++) { const a = (i * 72); shape(ctx, 'Log', cylinderMesh(12, 0.13, 2), { location: [Math.cos((a * Math.PI) / 180) * 0.6, Math.sin((a * Math.PI) / 180) * 0.6, 0.35], rotation: [68, 0, a + 90], mat: wood, smooth: true }); }
    shape(ctx, 'Domain', cubeMesh(1), { location: [0, 0, 2.4], scale: [3, 3, 4.8], smoke: { ...defaultSmokeDomain(), res: 32, density: 8, colour: [0.25, 0.24, 0.24], buoyancy: 1.8, flameStrength: 5 } });
    shape(ctx, 'Fuel', cubeMesh(0.9), { location: [0, 0, 0.5], smokeFlow: { ...defaultSmokeFlow(), kind: 'BOTH', amount: 1 } });
    addObject(ctx.doc, { type: 'LIGHT', name: 'Glow', location: [0, 0, 1.3], data: { ...defaultLight('POINT'), energy: 60, color: [1, 0.55, 0.2], radius: 0.5 } });
    return ctx;
  }, { bake: true, thumbFrame: 44, thumbSamples: 16 }),
  s('water-tank', 'advanced', 'Water in a Tank', '수조의 물', ['liquid', 'FLIP'], 'A block of water collapses and sloshes round a box. It is baked when it opens.', '물 덩어리가 무너져 상자 주위를 출렁입니다. 열 때 베이크합니다.', 'Press Space. Raise Resolution in the Physics tab, and bake again.', '스페이스를 누른 뒤 물리 탭에서 해상도를 올리고 다시 베이크해 보세요.', () => {
    const ctx = start({ camera: [8, -9, 5.4], target: [0, 0, 1], frameEnd: 40, lens: 50, world: [0.7, 0.75, 0.85] });
    const water = material(ctx.doc, 'Water', { baseColor: [0.55, 0.8, 1], transmission: 1, ior: 1.33, roughness: 0.02 });
    shape(ctx, 'Domain', cubeMesh(1), { location: [0, 0, 1.5], scale: [5, 3, 3], mat: water, fluid: { ...defaultLiquidDomain(), res: 22 } });
    shape(ctx, 'Water Block', cubeMesh(1), { location: [-1.5, 0, 1.3], scale: [1.8, 2.8, 2.4], fluidFlow: { kind: 'GEOMETRY', velocity: [0, 0, 0] } });
    shape(ctx, 'Rock', cubeMesh(1), { location: [1.2, 0, 0.45], scale: [1, 1.4, 0.9], mat: material(ctx.doc, 'Rock', { baseColor: [0.4, 0.38, 0.35] }), collision: { friction: 0.5 } });
    return ctx;
  }, { bake: true, thumbFrame: 24, thumbSamples: 24 }),
  s('ocean-sunset', 'advanced', 'Ocean at Sunset', '노을 바다', ['ocean', 'world'], 'The Ocean modifier makes a moving sea; the sky lights it.', '오션 모디파이어로 움직이는 바다를 만들고 하늘이 비춥니다.', 'Press Space. Change Wind Speed in the Modifiers tab.', '스페이스를 누른 뒤 모디파이어 탭에서 풍속을 바꿔 보세요.', () => {
    const ctx = start({ floor: null, sun: false, camera: [0, -32, 7], target: [0, 10, 0], lens: 32, frameEnd: 120 });
    const w = ctx.doc.world;
    w.useNodes = true;
    w.nodes = defaultWorldGraph([0.5, 0.5, 0.5], 1.6);
    const sky = createNode('TEX_SKY', 0, 80, { Zenith: [0.1, 0.12, 0.35], Horizon: [1, 0.45, 0.18], Ground: [0.05, 0.05, 0.08] });
    w.nodes.nodes.push(sky);
    addLink(w.nodes, sky.id, 'Color', w.nodes.nodes[0].id, 'Color');
    const sea = shape(ctx, 'Sea', planeMesh(2), { smooth: true, mat: material(ctx.doc, 'Sea', { baseColor: [0.03, 0.14, 0.2], metallic: 0, roughness: 0.08, specular: 1 }) });
    use(sea, 'OCEAN', { resolution: 128, size: 120, windSpeed: 11, choppiness: 1.1, waveScale: 1, seed: 7 });
    addObject(ctx.doc, { type: 'LIGHT', name: 'Low Sun', location: [0, 30, 6], rotation: [-80, 0, 0], data: { ...defaultLight('SUN'), energy: 4, color: [1, 0.6, 0.3], radius: 0.05 } });
    setFrame(ctx.doc, 30);
    return ctx;
  }, { thumbFrame: 30, thumbSamples: 24 }),
  s('dynamic-paint', 'advanced', 'Paint Trail', '페인트 자국', ['dynamic paint', 'animation'], 'A moving ball leaves paint behind on a floor that dents and slowly dries.', '움직이는 공이 바닥에 자국을 남깁니다. 바닥은 패이고 천천히 마릅니다.', 'Press Space. Change Fade and Spread in the Physics tab, and bake again.', '스페이스를 누른 뒤 물리 탭에서 옅어짐과 번짐을 바꾸고 다시 베이크해 보세요.', () => {
    const ctx = start({ floor: null, camera: [0, -9, 8], target: [0, 0, 0], frameEnd: 90 });
    const canvas = shape(ctx, 'Canvas', gridMesh(120, 80, 1), { scale: [1, 1, 1], smooth: true, mat: material(ctx.doc, 'Canvas', { baseColor: [1, 1, 1], roughness: 0.6 }), dynamicPaint: { ...defaultDynamicPaint('CANVAS'), fade: 0.004, spread: 0.05, displace: -0.05, base: [0.92, 0.9, 0.85] } });
    canvas.data.verts = canvas.data.verts.map(([x, y]) => [x * 12, y * 8, 0]);
    const brush = shape(ctx, 'Brush', uvSphereMesh(24, 12, 0.4), { location: [-5, -2, 0.4], smooth: true, mat: material(ctx.doc, 'Ball', { baseColor: PALETTE.blue, roughness: 0.2 }), dynamicPaint: { ...defaultDynamicPaint('BRUSH'), radius: 0.35, color: [0.1, 0.25, 0.8] } });
    for (let i = 0; i <= 9; i++) { const f = 1 + i * 10; anim.insertKey(brush, 'location.0', f, -5 + i * 1.1, 'LINEAR'); anim.insertKey(brush, 'location.1', f, Math.sin(i * 1.1) * 2.4, 'BEZIER'); }
    return ctx;
  }, { bake: true, thumbFrame: 70, workspace: 'animation' }),
  s('python-tower', 'advanced', 'Python: Twisted Tower', 'Python: 꼬인 탑', ['python', 'scripting'], 'Every floor of this tower was placed by the Python script in the Text Editor.', '이 탑의 모든 층은 텍스트 에디터의 Python 스크립트가 놓았습니다.', 'In the Scripting workspace change a number and press Ctrl+Enter.', '스크립팅 워크스페이스에서 숫자를 바꾸고 Ctrl+Enter를 눌러 보세요.', () => {
    const ctx = start({ camera: [22, -26, 13], target: [0, 0, 5], lens: 45 });
    const source = `# Builds a twisted tower, floor by floor. Change the numbers and press Ctrl+Enter.
import bpy
import math

FLOORS = 24
TWIST = 7.5        # degrees per floor
HEIGHT = 0.42

def floor_colour(i):
    t = i / (FLOORS - 1)
    return (0.15 + 0.8 * t, 0.3 + 0.3 * math.sin(t * math.pi), 0.9 - 0.75 * t)

for i in range(FLOORS):
    t = i / FLOORS
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.3 + i * HEIGHT))
    block = bpy.context.active_object
    block.name = f"Floor {i + 1:02d}"
    width = 3.4 - 2.2 * t
    block.scale = (width, width, 0.36)
    block.rotation[2] = i * TWIST
    bpy.ops.material.new()
    mat = bpy.data.materials[-1]
    mat.baseColor = list(floor_colour(i))
    mat.roughness = 0.35

print("Built", FLOORS, "floors:", len(bpy.data.objects), "objects in all")
`;
    ctx.doc.texts.push({ id: newId('txt'), name: 'tower.py', body: source });
    const result = runPython(ctx, source);
    if (!result.ok) throw new Error(result.error);
    return ctx;
  }, { workspace: 'scripting' }),
  s('python-grid', 'advanced', 'Python: Sine Field', 'Python: 사인 들판', ['python', 'classes'], 'A class and a comprehension lay out a field of columns from a formula.', '클래스와 컴프리헨션으로 수식에 따라 기둥 들판을 만듭니다.', 'Change wave() in the script, and press Ctrl+Enter.', '스크립트의 wave()를 바꾸고 Ctrl+Enter를 눌러 보세요.', () => {
    const ctx = start({ camera: [17, -20, 14], target: [0, 0, 0.8], lens: 45 });
    const source = `import bpy
from math import sin, cos, hypot

class Field:
    def __init__(self, size, spacing):
        self.size = size
        self.spacing = spacing

    def points(self):
        half = self.size // 2
        return [(x * self.spacing, y * self.spacing) for x in range(-half, half + 1) for y in range(-half, half + 1)]

def wave(x, y):
    d = hypot(x, y)
    return 1.1 + cos(d * 1.1) * 0.9

field = Field(size=14, spacing=0.8)
shared = None
for x, y in field.points():
    h = wave(x, y)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, h / 2))
    column = bpy.context.active_object
    column.scale = (0.68, 0.68, h)
    if shared is None:
        bpy.ops.material.new()
        shared = bpy.data.materials[-1]
        shared.baseColor = [0.1, 0.55, 0.75]
        shared.roughness = 0.3
    column.materials = [shared.id]
print(len(field.points()), "columns")
`;
    ctx.doc.texts.push({ id: newId('txt'), name: 'field.py', body: source });
    const result = runPython(ctx, source);
    if (!result.ok) throw new Error(result.error);
    return ctx;
  }, { workspace: 'scripting', thumbSamples: 10 }),
  s('addon-gears', 'advanced', 'Add-on: Gears', '애드온: 기어', ['add-on', 'python'], 'Gears made by the Add Gear add-on, meshing and turning at their proper ratio.', 'Add Gear 애드온으로 만든 기어들이 맞물려 비율대로 돕니다.', 'Turn on Add Gear in Preferences › Add-ons, then find Gear with F3.', '환경 설정 › 애드온에서 Add Gear를 켜고 F3으로 Gear를 찾아보세요.', () => {
    const ctx = start({ camera: [0, -12, 9], target: [0, 0, 0.3], lens: 55 });
    const addon = BUILTIN_ADDONS.find((a) => a.id === 'add_mesh_gear');
    enableAddon(ctx, addon);
    const steel = material(ctx.doc, 'Steel', { baseColor: [0.72, 0.73, 0.76], metallic: 1, roughness: 0.3 });
    const brass = material(ctx.doc, 'Brass', { baseColor: [0.9, 0.68, 0.3], metallic: 1, roughness: 0.3 });
    [[24, 1.5, [-1.2, 0, 0.3], steel, 1], [12, 0.75, [1.15, 0, 0.3], brass, -2]].forEach(([teeth, radius, location, m, ratio]) => {
      ctx.doc.cursor = location;
      run(ctx, 'mesh.gear_add', { teeth, radius, depth: 0.14, width: 0.4 });
      const gear = activeObject(ctx.doc);
      gear.materials = [m.id];
      anim.insertKey(gear, 'rotation.2', 1, 0, 'LINEAR');
      anim.insertKey(gear, 'rotation.2', 121, 90 * ratio, 'LINEAR');
    });
    ctx.doc.cursor = [0, 0, 0];
    disableAddon(addon.id);
    return ctx;
  }),
  s('node-group-shared', 'advanced', 'Shared Node Group', '공유 노드 그룹', ['node groups', 'shader nodes'], 'Three materials share one "Banded" group; each feeds it a different colour.', '재질 세 개가 "Banded" 그룹을 공유하고 각자 다른 색을 넣습니다.', 'Select a material, select the group node and press Tab to edit it: all three change.', '재질의 그룹 노드를 선택하고 Tab으로 들어가 고쳐 보세요. 세 재질이 함께 바뀝니다.', () => {
    const ctx = start({ camera: [0, -9, 3.4], target: [0, 0, 1], lens: 50 });
    const doc = ctx.doc;
    let groupDef = null;
    [PALETTE.red, PALETTE.green, PALETTE.blue].forEach((c, i) => {
      const m = material(doc, `Banded ${i + 1}`, { roughness: 0.3 });
      const bsdf = useNodes(m);
      const g = m.nodes;
      let groupNode;
      if (!groupDef) {
        const coords = createNode('GEOMETRY_INFO', -900, 60);
        const sep = createNode('SEPARATE_XYZ', -700, 60);
        const times = createNode('MATH', -500, 60, { operation: 'MULTIPLY', B: 7 });
        const sine = createNode('MATH', -300, 60, { operation: 'SINE' });
        const mix = createNode('MIX_RGB', -100, 60, { A: [0.92, 0.9, 0.85], B: c });
        g.nodes.push(coords, sep, times, sine, mix);
        addLink(g, coords.id, 'Position', sep.id, 'Vector');
        addLink(g, sep.id, 'Z', times.id, 'A');
        addLink(g, times.id, 'Value', sine.id, 'A');
        addLink(g, sine.id, 'Value', mix.id, 'Fac');
        addLink(g, mix.id, 'Result', bsdf.id, 'Base Color');
        // The colour becomes the group's input: a value node outside, linked in before grouping.
        const colorIn = createNode('RGB', -300, 300, { color: c });
        g.nodes.push(colorIn);
        addLink(g, colorIn.id, 'Color', mix.id, 'B');
        groupNode = makeGroup(g, [coords.id, sep.id, times.id, sine.id, mix.id], 'Banded');
        groupDef = groupNode.group;
        syncGroupInstances(doc, groupDef);
      } else {
        groupNode = createGroupNode(groupDef, -100, 60);
        const colorIn = createNode('RGB', -300, 300, { color: c });
        g.nodes.push(groupNode, colorIn);
        addLink(g, colorIn.id, 'Color', groupNode.id, groupDef.inputs[0].name);
        addLink(g, groupNode.id, groupDef.outputs[0].name, bsdf.id, 'Base Color');
      }
      shape(ctx, `Ball ${i + 1}`, uvSphereMesh(48, 24, 1), { location: [(i - 1) * 2.4, 0, 1], smooth: true, mat: m });
    });
    return ctx;
  }, { workspace: 'shading' }),
  s('osl-shader', 'advanced', 'OSL Script Shader', 'OSL 스크립트 셰이더', ['OSL', 'shader nodes'], 'A checker written as a few lines of Open Shading Language. Its parameters are sockets.', '몇 줄의 Open Shading Language로 쓴 체커입니다. 매개변수가 소켓이 됩니다.', 'In the Shading workspace edit the source inside the node.', '셰이딩 워크스페이스에서 노드 안의 코드를 고쳐 보세요.', () => {
    const ctx = start({ camera: [4.4, -5.6, 3.2], target: [0, 0, 1], lens: 55 });
    const m = material(ctx.doc, 'Script', { roughness: 0.25 });
    const bsdf = useNodes(m);
    const source = `shader Rings(float Scale = 7, color A = color(0.95, 0.75, 0.2), color B = color(0.1, 0.1, 0.3), output color Color = 0)
{
    float d = length(P) * Scale;
    float wobble = noise("perlin", P * 2) * 1.5;
    float t = smoothstep(0.4, 0.6, fract(d + wobble));
    Color = mix(A, B, t);
}
`;
    const script = createNode('SCRIPT_OSL', -420, 60, { source });
    m.nodes.nodes.push(script);
    addLink(m.nodes, script.id, 'Color', bsdf.id, 'Base Color');
    void DEFAULT_OSL;
    shape(ctx, 'Sphere', uvSphereMesh(64, 32, 1), { location: [0, 0, 1], smooth: true, mat: m });
    return ctx;
  }, { workspace: 'shading' }),
  s('story-scenes', 'advanced', 'Two Scenes, One Film', '장면 둘, 영상 하나', ['scenes', 'sequencer'], 'Two scenes in one file, cut together with a cross and a title in the Video Sequencer.', '한 파일의 두 장면을 비디오 시퀀서에서 크로스 전환과 제목으로 잇습니다.', 'In the Video workspace press Space. Export Video writes a WebM.', '영상 워크스페이스에서 스페이스를 누르세요. 동영상 내보내기로 WebM을 만듭니다.', () => {
    const ctx = start({ camera: [5, -6, 3], target: [0, 0, 1], frameEnd: 100, world: [0.6, 0.65, 0.8] });
    const doc = ctx.doc;
    const a = shape(ctx, 'Red Cube', cubeMesh(1.6), { location: [0, 0, 0.8], mat: material(doc, 'Red', { baseColor: PALETTE.red }) });
    anim.insertKey(a, 'rotation.2', 1, 0, 'LINEAR');
    anim.insertKey(a, 'rotation.2', 101, 360, 'LINEAR');
    const first = doc.activeScene;
    const second = newScene(doc, { name: 'Night' });
    doc.world.color = [0.02, 0.03, 0.08];
    addObject(doc, { type: 'MESH', name: 'Floor', data: planeMesh(40), materials: [material(doc, 'Dark', { baseColor: [0.2, 0.2, 0.25] }).id] });
    addCamera(doc, [5, -6, 3], [0, 0, 1]);
    const b = addObject(doc, { type: 'MESH', name: 'Lamp Ball', data: { ...uvSphereMesh(32, 16, 0.9), smooth: true }, location: [0, 0, 0.9], materials: [material(doc, 'Glow', { baseColor: [0, 0, 0], emission: [1, 0.8, 0.3], emissionStrength: 4 }).id] });
    anim.insertKey(b, 'location.2', 1, 0.9, 'SINE');
    anim.insertKey(b, 'location.2', 51, 2.2, 'SINE');
    anim.insertKey(b, 'location.2', 101, 0.9, 'SINE');
    addObject(doc, { type: 'LIGHT', name: 'Moon', location: [3, -3, 6], data: { ...defaultLight('POINT'), energy: 180 } });
    switchScene(doc, first);
    doc.scenes.find((x) => x.id === first).name = 'Day';
    const seq = doc.sequence;
    const day = addStrip(seq, createStrip('SCENE', { name: 'Day', scene: first, start: 1, length: 60, channel: 1 }));
    const night = addStrip(seq, createStrip('SCENE', { name: 'Night', scene: second, start: 45, length: 56, channel: 2 }));
    addTransition(seq, day, night, 'CROSS');
    addStrip(seq, createStrip('TEXT', { name: 'Title', text: 'Day and Night', start: 1, length: 30, channel: 4, color: [1, 1, 1], size: 0.12, y: 0.3 }));
    return ctx;
  }, { workspace: 'video' }),
  s('title-card', 'advanced', 'Title Sequence', '타이틀 시퀀스', ['sequencer', 'titles'], 'Colour strips, wipes and text, with no 3D at all.', '색 스트립, 와이프, 글자만으로 만든 영상입니다.', 'Press K at the playhead to cut a strip. Move strips by dragging.', '재생 헤드에서 K로 스트립을 자르고, 끌어서 옮겨 보세요.', () => {
    const ctx = start({ floor: null, sun: false, world: [0.05, 0.05, 0.08], camera: [0, -6, 2], target: [0, 0, 0], frameEnd: 96 });
    const seq = ctx.doc.sequence;
    const blue = addStrip(seq, createStrip('COLOR', { name: 'Blue', color: [0.08, 0.15, 0.45], start: 1, length: 48, channel: 1 }));
    const amber = addStrip(seq, createStrip('COLOR', { name: 'Amber', color: [0.75, 0.42, 0.08], start: 36, length: 61, channel: 2 }));
    addTransition(seq, blue, amber, 'WIPE');
    addStrip(seq, createStrip('TEXT', { name: 'Title', text: 'My3DBlender', start: 6, length: 34, channel: 4, color: [1, 1, 1], size: 0.14 }));
    addStrip(seq, createStrip('TEXT', { name: 'Credit', text: 'Made with strips', start: 52, length: 40, channel: 4, color: [0.1, 0.05, 0], size: 0.09, y: -0.2 }));
    addStrip(seq, createStrip('COLOR', { name: 'Fade Band', color: [1, 1, 1], start: 52, length: 40, channel: 3, opacity: 0.25, scale: 0.6 }));
    return ctx;
  }, { workspace: 'video' }),
  s('camera-solve', 'advanced', 'Motion Tracking', '모션 트래킹', ['tracking', 'clip editor'], 'A short clip of dots seen by a turning camera. The tracks are already made: solve them.', '돌아가는 카메라로 찍은 점들의 짧은 클립입니다. 트랙은 이미 있으니 풀어 보세요.', 'In the Tracking workspace press Solve Camera: the 3D points appear.', '트래킹 워크스페이스에서 카메라 풀기를 누르면 3D 점들이 나타납니다.', () => {
    const ctx = start({ camera: [6, -7, 4], target: [0, 0, 0], frameEnd: 16 });
    const doc = ctx.doc;
    const [w, h2] = [160, 120];
    const points = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0.2, 0.4, 1.5]];
    const frames = [];
    const tracks = points.map((_, i) => createTrack(`Track.${String(i + 1).padStart(3, '0')}`, 0, 0, 0));
    for (let f = 0; f < 16; f++) {
      const [a, b] = [f * 0.05, 0.35 + f * 0.015];
      const image = createImageBuffer(w, h2, [0.12, 0.13, 0.16, 1]);
      points.forEach(([x, y, z], i) => {
        const x1 = Math.cos(a) * x + Math.sin(a) * z;
        const z1 = -Math.sin(a) * x + Math.cos(a) * z;
        const y1 = Math.cos(b) * y - Math.sin(b) * z1;
        const [px, py] = [w / 2 + x1 * 26, h2 / 2 - y1 * 26];
        tracks[i].points[f] = [px, py];
        paintDabImage(image, px / w, 1 - py / h2, { radius: 4.5, color: [1, 1, 0.9], strength: 1 });
      });
      frames.push({ dataUrl: encodePNGDataUrl(image) });
    }
    doc.clips = [{ id: newId('clip'), name: 'Dots', kind: 'IMAGES', frames, width: w, height: h2, fps: doc.fps, start: 1, tracks }];
    return ctx;
  }, { workspace: 'tracking' }),
  s('nurbs-vase', 'advanced', 'NURBS Vase', 'NURBS 꽃병', ['NURBS', 'surfaces'], 'A rational surface: move the control points in Edit Mode and the curve stays smooth.', '유리 곡면입니다. 편집 모드에서 조정점을 옮겨도 곡선이 매끄럽게 유지됩니다.', 'Press Tab and move a control point.', 'Tab을 누르고 조정점을 옮겨 보세요.', () => {
    const ctx = start({ camera: [8, -10, 5], target: [0, 0, 1.7], lens: 55 });
    const data = nurbsPrimitive('CYLINDER');
    const profile = [0.75, 0.95, 1.2, 0.55, 0.38, 0.5, 0.82];
    const [nu, nv] = [8, profile.length];
    const points = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = (i / nu) * Math.PI * 2; points.push([Math.cos(a) * profile[j], Math.sin(a) * profile[j], (j / (nv - 1)) * 3.4, 1]); }
    Object.assign(data, { pointsU: nu, pointsV: nv, points, resolutionU: 8, resolutionV: 8 });
    addObject(ctx.doc, { type: 'SURFACE', name: 'Vase', location: [0, 0, 0.02], data, materials: [material(ctx.doc, 'Ceramic', { baseColor: [0.1, 0.35, 0.55], roughness: 0.1 }).id] });
    return ctx;
  }),
  s('texture-painted', 'advanced', 'Texture Painting', '텍스처 페인팅', ['texture paint', 'UV'], 'Seams, an unwrap and a painted picture: paint crosses islands without a break.', '심과 언랩, 칠한 그림입니다. 페인트가 UV 섬을 넘어 끊김 없이 이어집니다.', 'In the Paint workspace, paint on the cube, and watch the picture on the left.', '페인트 워크스페이스에서 큐브에 칠하고 왼쪽의 그림을 보세요.', () => {
    const ctx = start({ camera: [4.6, -5, 3.8], target: [0, 0, 1], lens: 55 });
    const obj = shape(ctx, 'Cube', cubeMesh(2), { location: [0, 0, 1], mat: material(ctx.doc, 'Painted', { roughness: 0.45 }) });
    const mesh = obj.data;
    for (const e of edgeMap(mesh).values()) setEdgeMark(mesh, 'seam', e.a, e.b, true);
    unwrapSeams(mesh);
    const image = createImageBuffer(256, 256, [0.85, 0.82, 0.72, 1]);
    const colors = [PALETTE.red, PALETTE.blue, PALETTE.green, PALETTE.orange, PALETTE.purple];
    for (let i = 0; i < 60; i++) {
      const a = i * 0.62;
      const p = [Math.cos(a) * 1.1, Math.sin(a) * 1.1, 1 - (i / 59) * 2];
      texturePaintDab(mesh, image, p, { radius: 0.34, strength: 0.9, color: colors[Math.floor(i / 12)] });
    }
    const data = { id: newId('img'), name: 'Cube Base Color', dataUrl: encodePNGDataUrl(image), width: 256, height: 256 };
    ctx.doc.images.push(data);
    const m = ctx.doc.materials.at(-1);
    const bsdf = useNodes(m);
    const tex = createNode('TEX_IMAGE', -320, 60, { image: data.id });
    m.nodes.nodes.push(tex);
    addLink(m.nodes, tex.id, 'Color', bsdf.id, 'Base Color');
    return ctx;
  }, { workspace: 'paint', images: true }),
  s('freestyle-toon', 'advanced', 'Cartoon Lines', '만화 선', ['freestyle', 'render'], 'Flat colours and Freestyle outlines, drawn from the real edges.', '평평한 색과 실제 엣지에서 그린 Freestyle 윤곽선입니다.', 'Press F12. Change the Thickness in the Render tab.', 'F12를 누른 뒤 렌더 탭에서 두께를 바꿔 보세요.', () => {
    const ctx = start({ world: [0.85, 0.85, 0.85], floor: [0.95, 0.92, 0.82], sun: false, camera: [6, -7.5, 4.4], target: [0, 0, 1] });
    const doc = ctx.doc;
    doc.render.freestyle = { enabled: true, thickness: 2.4, color: [0.02, 0.02, 0.03], crease: 35, silhouette: true, border: false, creases: true };
    doc.render.viewTransform = 'STANDARD';
    shape(ctx, 'Box', cubeMesh(1.8), { location: [-1.3, 0, 0.9], rotation: [0, 0, 24], mat: material(doc, 'Toon A', { baseColor: [0.95, 0.5, 0.25], roughness: 1, specular: 0 }) });
    shape(ctx, 'Ball', uvSphereMesh(32, 16, 1), { location: [1.3, -0.5, 1], smooth: true, mat: material(doc, 'Toon B', { baseColor: [0.3, 0.65, 0.95], roughness: 1, specular: 0 }) });
    shape(ctx, 'Cone', coneMesh(32, 0.8, 1.8), { location: [0.2, 1.8, 0.9], mat: material(doc, 'Toon C', { baseColor: [0.95, 0.8, 0.25], roughness: 1, specular: 0 }) });
    addObject(doc, { type: 'LIGHT', name: 'Key', location: [4, -4, 7], data: { ...defaultLight('POINT'), energy: 400 } });
    return ctx;
  }, { thumbFreestyle: true }),
  s('multires-sculpt', 'advanced', 'Sculpted Head', '조각한 머리', ['sculpt', 'multiresolution'], 'A form pushed by brushes on Multiresolution levels; the base mesh stays eight corners.', '멀티레졸루션 단계 위에 브러시로 밀어 만든 형태입니다. 원본은 꼭짓점 8개 그대로입니다.', 'In the Sculpting workspace, drag with a brush. Lower Levels in the Modifiers tab.', '스컬프팅 워크스페이스에서 브러시로 끌어 보고, 모디파이어 탭에서 레벨을 내려 보세요.', () => {
    const ctx = start({ camera: [2.2, -9.5, 3], target: [0, 0, 1.9], lens: 60 });
    addObject(ctx.doc, { type: 'LIGHT', name: 'Side', location: [-5, -5, 5], data: { ...defaultLight('POINT'), energy: 260 } });
    const obj = shape(ctx, 'Head', cubeMesh(2), { location: [0, 0, 1.9], smooth: true, mat: material(ctx.doc, 'Clay', { baseColor: PALETTE.skin, roughness: 0.55 }) });
    const mod = use(obj, 'MULTIRES', { levels: 1, total: 1 });
    for (let i = 0; i < 3; i++) multiresAddLevel(obj.data, mod, catmullClark);
    // Each dab lands on the surface as it is by then: the vertex furthest out in the direction given.
    const onSurface = (mesh, dir) => {
      const d = Math.hypot(...dir);
      let best = mesh.verts[0];
      let score = -Infinity;
      for (const v of mesh.verts) { const k = (v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]) / d; if (k > score) { score = k; best = v; } }
      return best;
    };
    // Several passes, as a hand would go over a place more than once.
    const stroke = (brush, directions, opts) => multiresSculpt(obj.data, mod, catmullClark, (mesh) => { for (let pass = 0; pass < 6; pass++) for (const dir of directions) sculptDab(mesh, brush, onSurface(mesh, dir), opts); });
    // A rounder, longer form first.
    multiresSculpt(obj.data, mod, catmullClark, (mesh) => {
      mesh.verts = mesh.verts.map(([x, y, z]) => { const l = Math.hypot(x, y, z) || 1; return [(x / l) * 1.15, (y / l) * 1.05, (z / l) * 1.45]; });
    });
    const front = { normal: [0, -1, 0] };
    stroke('DRAW', [[0, -1, -0.05], [0, -1, -0.16]], { radius: 0.3, strength: 1, ...front });      // nose
    stroke('INFLATE', [[0, -1, -0.28]], { radius: 0.2, strength: 0.7 });
    stroke('DRAW', [[-0.42, -1, 0.34], [0.42, -1, 0.34]], { radius: 0.34, strength: 0.9, invert: true, ...front }); // eye sockets
    stroke('DRAW', [[-0.42, -1, 0.34], [0.42, -1, 0.34]], { radius: 0.15, strength: 0.7, ...front });  // eyes
    stroke('DRAW', [[-0.42, -1, 0.56], [0, -1, 0.6], [0.42, -1, 0.56]], { radius: 0.24, strength: 0.5, ...front }); // brow
    stroke('CREASE', [[-0.3, -1, -0.62], [-0.15, -1, -0.68], [0, -1, -0.7], [0.15, -1, -0.68], [0.3, -1, -0.62]], { radius: 0.12, strength: 1, ...front }); // mouth
    stroke('DRAW', [[1, 0, 0.1], [-1, 0, 0.1]], { radius: 0.24, strength: 1 });                     // ears
    stroke('SMOOTH', [[0, -1, 0.1]], { radius: 0.8, strength: 0.25 });
    return ctx;
  }, { workspace: 'sculpting' }),
  s('skin-tree', 'advanced', 'Skin: A Tree', '스킨: 나무', ['skin', 'remesh'], 'A few edges with radii become one flowing surface, then a Remesh evens it out.', '반지름을 준 엣지 몇 개가 하나의 면으로 이어지고, 리메시로 고르게 합니다.', 'Press Tab, select a vertex, and use Skin Radius from F3.', 'Tab을 누르고 꼭짓점을 고른 뒤 F3에서 Skin Radius를 실행해 보세요.', () => {
    const ctx = start({ camera: [6, -8.4, 4.6], target: [0, 0, 2.4], lens: 45, floor: [0.45, 0.52, 0.3] });
    const verts = [[0, 0, 0], [0, 0, 1.6], [0.9, 0.2, 2.6], [-0.8, -0.3, 2.7], [1.6, 0.6, 3.1], [0.6, -0.6, 3.4], [-1.4, 0.3, 3.4], [-0.4, -0.9, 3.5], [0.1, 0.3, 3.2], [0.2, 0.6, 4.2]];
    const edges = [[0, 1], [1, 2], [1, 3], [2, 4], [2, 5], [3, 6], [3, 7], [1, 8], [8, 9]];
    const mesh = { ...planeMesh(1), verts, faces: [], uvs: null, loose: edges, skin: { 0: 0.42, 1: 0.3, 2: 0.17, 3: 0.17, 4: 0.07, 5: 0.07, 6: 0.07, 7: 0.07, 8: 0.2, 9: 0.05 } };
    const tree = shape(ctx, 'Tree', mesh, { smooth: true, mat: material(ctx.doc, 'Bark', { baseColor: [0.32, 0.2, 0.11], roughness: 0.85 }) });
    use(tree, 'SKIN', { method: 'SMOOTH', radius: 0.1, resolution: 0.075, blend: 0.14 });
    const leaf = material(ctx.doc, 'Leaves', { baseColor: [0.2, 0.5, 0.15], roughness: 0.8 });
    for (const [x, y, z, r] of [[1.6, 0.6, 3.4, 0.75], [0.6, -0.6, 3.7, 0.65], [-1.4, 0.3, 3.7, 0.75], [-0.4, -0.9, 3.8, 0.6], [0.2, 0.6, 4.5, 0.85]]) {
      const canopy = shape(ctx, 'Canopy', icoSphereMesh(3, r), { location: [x, y, z], smooth: true, mat: leaf });
      use(canopy, 'DISPLACE', { strength: 0.35, scale: 3, midlevel: 0.5 });
    }
    ctx.doc.activeId = tree.id;
    ctx.doc.selected = [tree.id];
    return ctx;
  }),
  s('god-rays', 'advanced', 'Light Shafts', '빛줄기', ['volume', 'lights'], 'Fog in a room with a slit: a spot of light becomes a shaft you can see.', '틈이 있는 방의 안개 속에서 빛이 눈에 보이는 줄기가 됩니다.', 'Press F12. Change the Volume\'s Density in the Object Data tab.', 'F12를 누른 뒤 오브젝트 데이터 탭에서 볼륨 밀도를 바꿔 보세요.', () => {
    const ctx = start({ world: [0.003, 0.003, 0.006], floor: [0.3, 0.3, 0.32], sun: false, camera: [0, -9, 2.2], target: [0, 0, 2], lens: 40 });
    const wall = material(ctx.doc, 'Wall', { baseColor: [0.4, 0.38, 0.35], roughness: 0.9 });
    shape(ctx, 'Wall Left', cubeMesh(1), { location: [-3.4, 3, 3], scale: [5.2, 0.3, 6], mat: wall });
    shape(ctx, 'Wall Right', cubeMesh(1), { location: [3.4, 3, 3], scale: [5.2, 0.3, 6], mat: wall });
    shape(ctx, 'Column', cylinderMesh(24, 0.45, 4), { location: [0.9, -0.8, 2], smooth: true, mat: wall });
    addObject(ctx.doc, { type: 'VOLUME', name: 'Fog', location: [0, 0, 3], scale: [7, 7, 3.2], data: { kind: 'CONSTANT', density: 0.09, res: 8, colour: [0.92, 0.92, 0.95], emission: [0, 0, 0], emissionStrength: 1, scale: 4, threshold: 0.45 } });
    const m = new Matrix4().lookAt(new Vector3(0, 11, 5.6), new Vector3(0, -1, 0.5), new Vector3(0, 0, 1));
    addObject(ctx.doc, { type: 'LIGHT', name: 'Shaft', location: [0, 11, 5.6], rotation: rotationFromQuat(new Quaternion().setFromRotationMatrix(m)), data: { ...defaultLight('SPOT'), energy: 16000, spotSize: 28, spotBlend: 0.2, color: [1, 0.92, 0.75], radius: 0 } });
    return ctx;
  }, { thumbSamples: 48 }),
  s('motion-paths', 'advanced', 'Motion Paths', '모션 경로', ['animation', 'graph editor', 'onion skin'], 'A throw shown with its whole path and its ghosts around the current frame.', '던진 공의 전체 경로와 현재 프레임 주변의 잔상을 함께 보여 줍니다.', 'Move a key in the Graph Editor, then Object › Animation › Calculate Motion Path.', '그래프 에디터에서 키를 옮긴 뒤 오브젝트 › 애니메이션 › 모션 경로 계산을 실행해 보세요.', () => {
    const ctx = start({ camera: [0, -12, 4.4], target: [0, 0, 2], frameEnd: 60, lens: 45 });
    const ball = shape(ctx, 'Ball', uvSphereMesh(32, 16, 0.4), { location: [-5, 0, 0.4], smooth: true, mat: material(ctx.doc, 'Ball', { baseColor: PALETTE.orange, roughness: 0.3 }) });
    for (let i = 0; i <= 12; i++) {
      const f = 1 + i * 5;
      const t = i / 12;
      anim.insertKey(ball, 'location.0', f, -5 + t * 10, 'LINEAR');
      anim.insertKey(ball, 'location.2', f, 0.4 + Math.abs(Math.sin(t * Math.PI * 2.5)) * 4 * (1 - t * 0.55), 'BEZIER');
      anim.insertKey(ball, 'rotation.1', f, t * 720, 'LINEAR');
    }
    setFrame(ctx.doc, 22);
    run(ctx, 'object.paths_calculate', { start: 1, end: 61 });
    run(ctx, 'object.onion_set', { before: 3, after: 3, every: 4 });
    return ctx;
  }, { workspace: 'animation', thumbFrame: 22 }),
];

// ─────────────── writing it all

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [o, i] = [y * (width * 3 + 1) + 1 + x * 3, (y * width + x) * 4];
    raw[o] = rgba[i]; raw[o + 1] = rgba[i + 1]; raw[o + 2] = rgba[i + 2];
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Decodes the document's plain PNG images for rendering in Node (they are written uncompressed by paint.js). */
async function decodeForRender(doc) {
  const { inflateSync } = await import('node:zlib');
  const images = {};
  for (const image of doc.images) {
    const bytes = Buffer.from(image.dataUrl.split(',')[1], 'base64');
    let o = 8;
    let width = 0;
    let height = 0;
    const parts = [];
    while (o < bytes.length) {
      const len = bytes.readUInt32BE(o);
      const type = bytes.toString('latin1', o + 4, o + 8);
      if (type === 'IHDR') { width = bytes.readUInt32BE(o + 8); height = bytes.readUInt32BE(o + 12); }
      if (type === 'IDAT') parts.push(bytes.subarray(o + 8, o + 8 + len));
      o += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(parts));
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) rgba.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
    images[image.id] = { width, height, rgba };
  }
  return images;
}

export async function buildPicture(sample, ctx) {
  const { doc } = ctx;
  if (sample.bake) run(ctx, 'ptcache.bake_all');
  const frame = sample.thumbFrame ?? doc.frame;
  setFrame(doc, frame);
  if (['title-card', 'story-scenes'].includes(sample.id)) return sequencePicture(sample, doc);
  if (sample.id === 'camera-solve') return clipPicture(doc);
  doc.render = { ...doc.render, samples: sample.thumbSamples ?? 20, bounces: 4, width: 320, height: 180, percent: 100, seed: 1 };
  const scene = buildRenderScene(doc, { frame });
  scene.images = await decodeForRender(doc);
  let image = renderImage(scene, { samples: doc.render.samples });
  image = denoiseImage(image, 1, 0.3);
  if (doc.render.freestyle?.enabled) {
    const { drawFreestyle } = await import('../src/core/freestyle.js');
    image = drawFreestyle(doc, scene, image);
  }
  if (doc.compositorEnabled && doc.compositor) {
    const { evalCompositor } = await import('../src/core/nodes.js');
    image = evalCompositor(doc.compositor, image, null);
  }
  return { width: 320, height: 180, rgba: toDisplay(image, { viewTransform: doc.render.viewTransform }) };
}

/** Sequencer samples show a colour-strip layout: the composite for what can be drawn without a screen. */
async function sequencePicture(sample, doc) {
  const { compositeFrame } = await import('../src/core/sequencer.js');
  const scenes = doc.scenes?.length > 1;
  const provider = (strip) => {
    if (strip.type !== 'SCENE') return null;
    // A scene strip's picture, rendered small.
    const state = doc.scenes.find((x) => x.id === strip.scene)?.state;
    const view = { ...doc, ...(state ?? {}) };
    view.render = { ...view.render, samples: 8, bounces: 3, width: 320, height: 180, percent: 100 };
    const image = renderImage(buildRenderScene(view, { frame: 20 }), { samples: 24 });
    return { width: 320, height: 180, rgba: toDisplay(image, {}) };
  };
  void scenes;
  return { width: 320, height: 180, rgba: compositeFrame(doc.sequence, sample.id === 'title-card' ? 42 : 52, 320, 180, provider) };
}

async function clipPicture(doc) {
  const clip = doc.clips[0];
  const fake = { ...doc, images: [{ id: 'f', dataUrl: clip.frames[8].dataUrl }] };
  const decoded = await decodeForRender(fake);
  const { f } = decoded;
  const rgba = new Uint8ClampedArray(320 * 180 * 4);
  for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
    const [sx, sy] = [Math.min(f.width - 1, Math.floor((x / 320) * f.width)), Math.min(f.height - 1, Math.floor((y / 180) * f.height))];
    const [i, j] = [(y * 320 + x) * 4, (sy * f.width + sx) * 4];
    rgba[i] = f.rgba[j]; rgba[i + 1] = f.rgba[j + 1]; rgba[i + 2] = f.rgba[j + 2]; rgba[i + 3] = 255;
  }
  for (const track of clip.tracks) {
    const [px, py] = track.points[8];
    const [cx, cy] = [Math.round((px / f.width) * 320), Math.round((py / f.height) * 180)];
    for (let k = -7; k <= 7; k++) for (const [dx, dy] of [[k, -7], [k, 7], [-7, k], [7, k]]) {
      const i = ((cy + dy) * 320 + cx + dx) * 4;
      if (i >= 0 && i < rgba.length) { rgba[i] = 90; rgba[i + 1] = 230; rgba[i + 2] = 90; }
    }
  }
  return { width: 320, height: 180, rgba };
}

const LEVEL_NAMES = { beginner: ['Beginner', '초급'], intermediate: ['Intermediate', '중급'], advanced: ['Advanced', '고급'] };

async function main() {
  const args = process.argv.slice(2);
  const pictures = !args.includes('--no-pictures');
  const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  const out = path.join(root, 'sample');
  fs.mkdirSync(path.join(out, 'thumb'), { recursive: true });
  const index = [];
  for (const sample of SAMPLES) {
    const file = `${sample.level}/${sample.id}.my3d`;
    const thumb = `thumb/${sample.id}.png`;
    const entry = { id: sample.id, level: sample.level, title: sample.title, description: sample.description, tryThis: sample.tryThis, topics: sample.topics, file, thumb, workspace: sample.workspace ?? null, bake: Boolean(sample.bake) };
    index.push(entry);
    if (only && !only.includes(sample.id)) continue;
    const started = Date.now();
    clearSimCache();
    const ctx = sample.build();
    ctx.doc.name = sample.title.en;
    ctx.doc.sample = { id: sample.id, level: sample.level };
    ctx.doc.selected = ctx.doc.selected.filter((id) => getObject(ctx.doc, id));
    ctx.doc.mode = 'OBJECT';
    // Saved before the bake: a bake never goes into a file.
    const text = serialize(ctx.doc);
    fs.mkdirSync(path.join(out, sample.level), { recursive: true });
    fs.writeFileSync(path.join(out, file), text);
    if (pictures) {
      const p = await buildPicture(sample, ctx);
      fs.writeFileSync(path.join(out, thumb), png(p.width, p.height, p.rgba));
    }
    console.log(`  ${sample.level.padEnd(13)} ${sample.id.padEnd(20)} ${String(Math.round(text.length / 1024)).padStart(6)} KB  ${((Date.now() - started) / 1000).toFixed(1).padStart(6)} s`);
  }
  fs.writeFileSync(path.join(out, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  const table = (lang) => Object.keys(LEVEL_NAMES).map((level) => {
    const rows = index.filter((e) => e.level === level);
    const title = lang === 'ko' ? LEVEL_NAMES[level][1] : LEVEL_NAMES[level][0];
    return `## ${title} (${rows.length})\n\n| ${lang === 'ko' ? '샘플' : 'Sample'} | ${lang === 'ko' ? '다루는 것' : 'Topics'} | ${lang === 'ko' ? '내용' : 'What it shows'} |\n|---|---|---|\n${rows.map((e) => `| [${e.title[lang]}](${e.file}) | ${e.topics.join(', ')} | ${e.description[lang]} |`).join('\n')}\n`;
  }).join('\n');
  fs.writeFileSync(path.join(out, 'README.md'), `# 샘플 프로젝트 / Sample projects\n\n시작 화면이나 파일 › 샘플에서 열 수 있습니다. \`npm run samples\`로 다시 만듭니다.\n\nOpen them from the start screen or File › Samples. \`npm run samples\` makes them again.\n\n${table('ko')}\n---\n\n${table('en')}`);
  // The program ships them.
  const shipped = path.join(root, 'public', 'sample');
  fs.rmSync(shipped, { recursive: true, force: true });
  fs.cpSync(out, shipped, { recursive: true, filter: (f) => !f.endsWith('README.md') });
  const levels = Object.fromEntries(Object.keys(LEVEL_NAMES).map((l) => [l, index.filter((e) => e.level === l).length]));
  console.log(`\n${index.length} samples: ${JSON.stringify(levels)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

void cubeMesh; void defaultSoftBody;
