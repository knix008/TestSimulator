// The tutorial, as plain data: making a little scene step by step in the program itself. Each step lights what it talks about and lists
// what to do; a task looks at the scene, so doing the work by hand ticks it off, and "Do It for Me" is one press away. No DOM here, so
// the tests can walk through every step.
//
// A step's `begin(env)` runs when the step opens and returns what its tasks compare with. `env` is what the program gives:
//   env.doc      the scene
//   env.view     the state of the 3D view (yaw, pitch, dist, target, camView), or null
//   env.op(id, props)   runs an operator
//   env.result   the last rendered image, or null
//   env.render() starts a render (the tutorial's "Do It for Me")
import { getMaterial, selectOnly } from './doc.js';

const named = (doc, name) => doc.objects.find((o) => o.name === name) ?? null;
const ball = (doc) => doc.objects.find((o) => o.type === 'MESH' && /sphere/i.test(o.name)) ?? null;
const cube = (doc) => named(doc, 'Cube');
const select = (env, obj) => { if (obj) { selectOnly(env.doc, obj); env.touch?.(); } };
const baseColor = (doc, obj) => getMaterial(doc, obj?.materials?.[0])?.baseColor ?? null;
const DEFAULT_GREY = 0.8;

export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: { en: 'Welcome', ko: '환영합니다' },
    text: {
      en: 'In about ten minutes you will make a little scene: a cube with a ball on top, smooth and coloured, moved in time and rendered to a picture. Every step can be done by hand or with Do It for Me. You can drag this card out of the way.',
      ko: '약 10분 동안 작은 장면을 만듭니다. 큐브 위에 공을 올리고, 부드럽게 다듬어 색을 입히고, 움직임을 준 뒤 그림으로 렌더링합니다. 단계마다 직접 하거나 대신 해 주기를 누르면 됩니다. 이 카드는 끌어서 옮길 수 있습니다.',
    },
  },
  {
    id: 'workspaces',
    title: { en: 'The window', ko: '창의 구성' },
    text: {
      en: 'The tabs at the top are workspaces: ready-made arrangements for each kind of work. In the middle is the 3D view, on the right the Outliner lists everything in the scene and Properties edits what is selected, and at the bottom is the timeline.',
      ko: '맨 위의 탭은 워크스페이스입니다. 작업 종류마다 알맞게 배치된 화면입니다. 가운데는 3D 뷰, 오른쪽 위 아웃라이너는 장면의 모든 것을 보여 주고, 그 아래 속성 편집기는 선택한 것을 편집하며, 맨 아래는 타임라인입니다.',
    },
    selectors: ['[data-testid=workspaces]', '[data-testid=area-outliner]', '[data-testid=area-properties]', '[data-testid=area-timeline]'],
    workspace: 'layout',
  },
  {
    id: 'orbit',
    title: { en: 'Turn the view', ko: '보기 돌리기' },
    text: {
      en: 'Press the right mouse button in the 3D view and drag: the view turns around the scene. The scene itself does not change. With Shift the same drag moves the view instead.',
      ko: '3D 뷰에서 오른쪽 버튼을 누른 채 끌면 장면을 중심으로 보기가 돕니다. 장면 자체는 바뀌지 않습니다. Shift를 누르고 끌면 보기가 이동합니다.',
    },
    selectors: ['[data-testid=area-view3d]'],
    begin: (env) => ({ yaw: env.view?.yaw ?? 0, pitch: env.view?.pitch ?? 0 }),
    tasks: [{
      id: 'turn', en: 'Drag with the right button in the 3D view', ko: '3D 뷰에서 오른쪽 버튼으로 끌기',
      done: (env, memo) => Boolean(env.view) && Math.abs(env.view.yaw - memo.yaw) + Math.abs(env.view.pitch - memo.pitch) > 5,
      run: (env) => { env.view.yaw -= 25; env.view.pitch += 6; env.touch?.(); },
    }],
  },
  {
    id: 'zoom',
    title: { en: 'Zoom', ko: '확대와 축소' },
    text: {
      en: 'Roll the mouse wheel over the 3D view. Watch the grid: every fifth line is heavier, and the spacing changes by five as you go in and out.',
      ko: '3D 뷰 위에서 마우스 휠을 굴립니다. 격자를 보세요. 다섯 칸마다 굵은 선이 있고, 확대·축소하면 간격이 5배씩 바뀝니다.',
    },
    selectors: ['[data-testid=area-view3d]'],
    begin: (env) => ({ dist: env.view?.dist ?? 0 }),
    tasks: [{
      id: 'wheel', en: 'Roll the wheel', ko: '휠 굴리기',
      done: (env, memo) => Boolean(env.view) && Math.abs(env.view.dist - memo.dist) > 0.01,
      run: (env) => { env.view.dist *= 0.8; env.touch?.(); },
    }],
  },
  {
    id: 'select',
    title: { en: 'Select', ko: '선택' },
    text: {
      en: 'Click the cube with the left button. What is selected gets an orange outline, its row lights up in the Outliner, and the Properties editor shows its values.',
      ko: '왼쪽 버튼으로 큐브를 누릅니다. 선택한 것은 주황색 윤곽선이 생기고, 아웃라이너의 줄이 밝아지며, 속성 편집기에 값이 나타납니다.',
    },
    selectors: ['[data-testid=area-view3d]', '[data-testid=area-outliner]'],
    // Start from nothing selected, so that the click is what ticks this off.
    begin: (env) => { env.op('object.select_all', { action: 'DESELECT' }); return {}; },
    tasks: [{
      id: 'click', en: 'Click the cube', ko: '큐브 누르기',
      done: (env) => env.doc.selected.includes(cube(env.doc)?.id),
      run: (env) => select(env, cube(env.doc)),
    }],
  },
  {
    id: 'add',
    title: { en: 'Add a ball', ko: '공 추가' },
    text: {
      en: 'New things appear at the 3D cursor, the small red and white ring. Open the Add menu in the header of the 3D view, then Mesh, then UV Sphere.',
      ko: '새로 만드는 것은 빨갛고 흰 작은 고리인 3D 커서 위치에 나타납니다. 3D 뷰 머리글의 추가 메뉴에서 메시, UV 구를 고릅니다.',
    },
    selectors: ['[data-testid=area-view3d] .area-header'],
    tasks: [{
      id: 'sphere', en: 'Add › Mesh › UV Sphere', ko: '추가 › 메시 › UV 구',
      done: (env) => Boolean(ball(env.doc)),
      run: (env) => env.op('mesh.primitive_uv_sphere_add', {}),
    }],
  },
  {
    id: 'move',
    title: { en: 'Put it on top', ko: '위로 올리기' },
    text: {
      en: 'The ball is inside the cube. With the ball selected, press G, then Z to move only upward, move the mouse and click. Or type a number: in Properties, set Location Z to 2.',
      ko: '공이 큐브 안에 있습니다. 공을 선택한 채 G, Z를 차례로 누르면 위아래로만 움직입니다. 마우스를 움직이고 누릅니다. 속성 편집기에서 위치 Z를 2로 입력해도 됩니다.',
    },
    selectors: ['[data-testid=area-view3d]', '[data-testid=area-properties]'],
    tasks: [{
      id: 'up', en: 'Raise the ball above the cube (Z at least 1.5)', ko: '공을 큐브 위로 올리기 (Z가 1.5 이상)',
      done: (env) => (ball(env.doc)?.location[2] ?? 0) >= 1.5,
      run: (env) => { const b = ball(env.doc); if (b) { b.location[2] = 2; env.touch?.(); } },
    }],
  },
  {
    id: 'smooth',
    title: { en: 'Smooth', ko: '부드럽게' },
    text: {
      en: 'A sphere is made of flat faces, and you can see them. Right-click in the 3D view and choose Shade Smooth: the same faces, shaded as one curved surface.',
      ko: '구는 평평한 면들로 이루어져 있어 면이 보입니다. 3D 뷰에서 오른쪽 버튼을 눌러 부드러운 셰이딩을 고릅니다. 면은 그대로이고 하나의 곡면처럼 칠해집니다.',
    },
    selectors: ['[data-testid=area-view3d]'],
    begin: (env) => { select(env, ball(env.doc)); return {}; },
    tasks: [{
      id: 'shade', en: 'Right-click › Shade Smooth', ko: '오른쪽 버튼 › 부드러운 셰이딩',
      done: (env) => Boolean(ball(env.doc)?.data.smooth),
      run: (env) => { select(env, ball(env.doc)); env.op('object.shade_smooth', {}); },
    }],
  },
  {
    id: 'modifier',
    title: { en: 'A modifier', ko: '모디파이어' },
    text: {
      en: 'Modifiers change a shape without touching its data, and can be taken off again. Select the cube, open the wrench tab in Properties and add Subdivision Surface: the cube rounds off. It still looks faceted, so right-click it and choose Shade Smooth too.',
      ko: '모디파이어는 원본을 건드리지 않고 모양을 바꾸며, 언제든 뺄 수 있습니다. 큐브를 선택하고 속성 편집기의 렌치 탭에서 서브디비전 표면을 추가합니다. 큐브가 둥글어집니다. 아직 각져 보이니 오른쪽 버튼을 눌러 부드러운 셰이딩도 고릅니다.',
    },
    selectors: ['[data-testid=area-properties]', '[data-testid=area-view3d]'],
    begin: (env) => { select(env, cube(env.doc)); return {}; },
    tasks: [{
      id: 'subsurf', en: 'Add a Subdivision Surface modifier to the cube', ko: '큐브에 서브디비전 표면 추가',
      done: (env) => Boolean(cube(env.doc)?.modifiers?.some((m) => m.type === 'SUBSURF')),
      run: (env) => { select(env, cube(env.doc)); env.op('object.modifier_add', { type: 'SUBSURF' }); },
    }, {
      id: 'cubesmooth', en: 'Right-click › Shade Smooth on the cube', ko: '큐브에 오른쪽 버튼 › 부드러운 셰이딩',
      done: (env) => Boolean(cube(env.doc)?.data.smooth),
      run: (env) => { select(env, cube(env.doc)); env.op('object.shade_smooth', {}); },
    }],
  },
  {
    id: 'material',
    title: { en: 'Colour', ko: '색 입히기' },
    text: {
      en: 'Select the ball and open the Material tab, the round icon in Properties. Press New if there is no material, then change Base Color.',
      ko: '공을 선택하고 속성 편집기의 둥근 재질 탭을 엽니다. 재질이 없으면 새로 만들기를 누르고 기본 색을 바꿉니다.',
    },
    selectors: ['[data-testid=area-properties]'],
    begin: (env) => { select(env, ball(env.doc)); if (env.view) env.view.shading = 'MATERIAL'; return {}; },
    tasks: [{
      id: 'colour', en: 'Give the ball a colour of its own', ko: '공에 색 입히기',
      done: (env) => { const c = baseColor(env.doc, ball(env.doc)); return Boolean(c) && c.some((v) => Math.abs(v - DEFAULT_GREY) > 0.05); },
      run: (env) => {
        const b = ball(env.doc);
        select(env, b);

        if (!b.materials?.length) env.op('material.new', {});
        const m = getMaterial(env.doc, ball(env.doc).materials[0]);
        if (m) m.baseColor = [0.9, 0.25, 0.1];
        env.touch?.();
      },
    }],
  },
  {
    id: 'keyframes',
    title: { en: 'Make it move', ko: '움직이기' },
    text: {
      en: 'A keyframe stores a value at a moment. With the ball selected and the timeline at frame 1, press I over the 3D view. Go to frame 40, raise the ball, and press I again. Press Space to play.',
      ko: '키프레임은 어느 순간의 값을 기억합니다. 공을 선택하고 타임라인이 1 프레임일 때 3D 뷰 위에서 I를 누릅니다. 40 프레임으로 가서 공을 올리고 다시 I를 누릅니다. 스페이스로 재생합니다.',
    },
    selectors: ['[data-testid=area-timeline]', '[data-testid=area-view3d]'],
    begin: (env) => { select(env, ball(env.doc)); return {}; },
    tasks: [{
      id: 'two', en: 'Two keyframes on the ball, at different frames', ko: '공에 서로 다른 프레임의 키프레임 두 개',
      done: (env) => {
        const curves = Object.values(ball(env.doc)?.anim?.fcurves ?? {});
        return curves.some((c) => new Set(c.map((k) => k.f)).size >= 2);
      },
      run: (env) => {
        const b = ball(env.doc);
        select(env, b);
        env.setFrame(1);
        b.location[2] = 2;
        env.op('anim.keyframe_insert', { type: 'Location' });
        env.setFrame(40);
        b.location[2] = 4;
        env.op('anim.keyframe_insert', { type: 'Location' });
        env.setFrame(1);
      },
    }],
  },
  {
    id: 'camera',
    title: { en: 'Through the camera', ko: '카메라로 보기' },
    text: {
      en: 'The picture is what the camera sees, not what you see now. Press Numpad 0, or the camera button at the right of the 3D view, to look through it.',
      ko: '그림에 담기는 것은 지금 보이는 화면이 아니라 카메라가 보는 것입니다. 숫자패드 0이나 3D 뷰 오른쪽의 카메라 단추를 누르면 카메라로 봅니다.',
    },
    selectors: ['[data-testid=nav-camera]'],
    begin: (env) => {
      const camera = env.doc.objects.find((o) => o.id === env.doc.activeCamera);
      if (camera && camera.location[1] > -8) { camera.location = camera.location.map((v) => v * 1.5); camera.location[2] += 1.5; env.touch?.(); }
      return {};
    },
    tasks: [{
      id: 'look', en: 'Look through the camera', ko: '카메라로 보기',
      done: (env) => Boolean(env.view?.camView),
      run: (env) => { env.view.camView = true; env.touch?.(); },
    }],
  },
  {
    id: 'render',
    title: { en: 'Render', ko: '렌더링' },
    text: {
      en: 'Press F12, or Render › Render Image at the top. The path tracer follows light through the scene, and the picture grows clearer as it goes.',
      ko: 'F12를 누르거나 맨 위 렌더 메뉴에서 이미지 렌더링을 고릅니다. 경로 추적기가 장면 속 빛을 따라가며, 진행될수록 그림이 또렷해집니다.',
    },
    selectors: ['[data-testid=menu-render]'],
    begin: (env) => { env.op('object.select_all', { action: 'DESELECT' }); return { before: env.result }; },
    tasks: [{
      id: 'image', en: 'Render an image', ko: '이미지 렌더링',
      done: (env, memo) => Boolean(env.result) && env.result !== memo.before && !env.rendering,
      run: (env) => env.render(),
    }],
  },
  {
    id: 'finish',
    title: { en: 'Well done', ko: '수고하셨습니다' },
    text: {
      en: 'That is the whole road: model, shade, animate, render. Save with Ctrl+S. The Samples on the start screen go further, from beginner to advanced, and the User\'s Guide in the Help menu covers everything else.',
      ko: '모델링, 재질, 애니메이션, 렌더링까지 한 바퀴를 돌았습니다. Ctrl+S로 저장합니다. 시작 화면의 샘플로 초급부터 고급까지 더 나아갈 수 있고, 도움말의 사용자 설명서에 나머지가 모두 있습니다.',
    },
    selectors: ['[data-testid=start-toggle]', '[data-testid=menu-help]'],
  },
];

export const tasksOf = (step) => step.tasks ?? [];

/** What each task of a step says at the moment. */
export const taskStates = (step, env, memo) => tasksOf(step).map((task) => ({ task, done: Boolean(task.done(env, memo ?? {})) }));

