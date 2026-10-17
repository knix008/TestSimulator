// The start screen: which landscape is shown, how transparent and how fast it moves,
// whether it opens when the program starts, and the same controls on the settings tab.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://127.0.0.1:5185/', width: 1280, height: 800 });
for (const [name, value] of Object.entries({
  window: win,
  document: win.document,
  navigator: win.navigator,
  HTMLElement: win.HTMLElement,
  HTMLInputElement: win.HTMLInputElement,
  Element: win.Element,
  Node: win.Node,
  DocumentFragment: win.DocumentFragment,
  MutationObserver: win.MutationObserver,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
  KeyboardEvent: win.KeyboardEvent,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  try { globalThis[name] = value; }
  catch { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); }
}

const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { t, setLanguage } = await import('../src/lib/i18n.js');
const { SETTINGS_DEFAULTS, SETTINGS_KEYS, showStartAtLaunch } = await import('../src/lib/settings.js');
const { START_SCENES, START_MOTION_DEFAULT, StartPage } = await import('../src/components/StartPage.jsx');
const { motionScale, startIsStill, startRates, startSceneId } = await import('../src/lib/startscenes.js');
const { sceneOf } = await import('../src/lib/start3d/scenes.js');
const { TUTORIAL_STEPS, Tutorial } = await import('../src/components/Tutorial.jsx');
const { SettingsDialog } = await import('../src/dialogs/SettingsDialog.jsx');

after(() => win.happyDOM.close());

const rootDir = path.join(import.meta.dirname, '..');

function buttonNamed(scope, name) {
  return [...scope.querySelectorAll('button')].find((b) => b.textContent.replace(/\s+/g, ' ').includes(name));
}

async function mount(node) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(node); });
  return {
    host,
    async click(el) { await act(async () => { el.click(); }); },
    async unmount() {
      await act(async () => { root.unmount(); });
      host.remove();
    },
  };
}

// A start page that applies each change, the way the app saves it into the session.
function LiveStart({ recent = [], initial = {}, log }) {
  const [folders, setFolders] = React.useState(recent);
  const [state, setState] = React.useState({
    scene: 'valley', transparency: 0, motion: START_MOTION_DEFAULT, showAtLaunch: true, ...initial,
  });
  return React.createElement(StartPage, {
    recent: folders,
    scene: state.scene,
    transparency: state.transparency,
    motion: state.motion,
    showAtLaunch: state.showAtLaunch,
    onBackground(patch) {
      log.patches.push(patch);
      setState((s) => ({
        ...s,
        ...(Object.prototype.hasOwnProperty.call(patch, 'startScene') ? { scene: patch.startScene } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, 'startTransparency') ? { transparency: patch.startTransparency } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, 'startMotion') ? { motion: patch.startMotion } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, 'startAtLaunch') ? { showAtLaunch: patch.startAtLaunch } : {}),
      }));
    },
    onRun(id) { log.run = id; },
    onRecent(p) { log.recent = p; },
    onRecentRemove(p) { log.removed = p; setFolders((list) => list.filter((x) => x !== p)); },
    onRecentClear() { log.cleared = true; setFolders([]); },
  });
}

test('twenty moving 3D worlds, and a missing choice falls back to the valley', () => {
  assert.equal(START_SCENES.length, 20);
  assert.equal(new Set(START_SCENES).size, 20);
  assert.equal(startSceneId('nope'), 'valley');
  assert.equal(startSceneId('ocean'), 'ocean');
  for (const id of START_SCENES) {
    const scene = sceneOf(id);
    assert.equal(typeof scene.build, 'function', id);
    assert.equal(typeof scene.draw, 'function', id);
  }
});

test('speed 0 holds the world still; 20 is the designed pace; 100 is five times that', () => {
  assert.equal(motionScale(0), 0);
  assert.equal(motionScale(-10), 0);
  assert.equal(motionScale(20), 1);
  assert.equal(motionScale(100), 5);
  assert.equal(motionScale(500), 5);
  assert.equal(motionScale(Number.NaN), 1);
  assert.deepEqual(startRates(0), { camera: 0, objects: 0, sky: 0 });
  assert.equal(startIsStill(startRates(0)), true);
  assert.equal(startIsStill(startRates(20)), false);
  assert.equal(START_MOTION_DEFAULT, 20);
});

test('a new session opens the start screen; only an explicit false skips it', () => {
  assert.equal(SETTINGS_DEFAULTS.startAtLaunch, true);
  assert.equal(SETTINGS_DEFAULTS.startScene, 'valley');
  assert.equal(SETTINGS_DEFAULTS.startTransparency, 0);
  assert.equal(SETTINGS_DEFAULTS.startMotion, 20);
  for (const key of ['startAtLaunch', 'startScene', 'startTransparency', 'startMotion']) {
    assert.ok(SETTINGS_KEYS.includes(key), key);
  }
  assert.equal(showStartAtLaunch(null), true);
  assert.equal(showStartAtLaunch({}), true);
  assert.equal(showStartAtLaunch({ startAtLaunch: true }), true);
  assert.equal(showStartAtLaunch({ startAtLaunch: false }), false);
});

test('every landscape has a Korean name, an English name and a painted swatch', () => {
  setLanguage('ko');
  const css = fs.readFileSync(path.join(rootDir, 'src/styles.css'), 'utf8');
  for (const id of START_SCENES) {
    assert.notEqual(t(`start_scene_${id}`), `start_scene_${id}`);
    setLanguage('en');
    assert.notEqual(t(`start_scene_${id}`), `start_scene_${id}`);
    setLanguage('ko');
    assert.ok(css.includes(`.start-swatch[data-scene='${id}']`), id);
  }
  assert.ok(css.includes('.start-launch'));
  assert.ok(css.includes('.start-bg-canvas'));
});

test('the start page lists the ways to begin, the tasks, and at most ten recent folders', async () => {
  setLanguage('ko');
  const recent = ['C:\\Music', 'D:\\work\\samples', 'E:\\src', 'F:\\one', 'G:\\two', 'H:\\three', 'I:\\four', 'J:\\five', 'K:\\six', 'L:\\seven', 'M:\\hidden'];
  const log = { patches: [], run: null, recent: null };
  const view = await mount(React.createElement(LiveStart, { recent, log }));
  try {
    const begin = view.host.querySelector('.start-actions');
    assert.ok(buttonNamed(begin, '튜토리얼'));
    assert.ok(buttonNamed(begin, '사용 설명'));
    assert.ok(buttonNamed(begin, '파일 관리'));
    assert.equal(begin.querySelectorAll('button').length, 9);
    const tasks = view.host.querySelector('.task-grid');
    for (const name of ['복사', '이동', '압축', '압축 해제', '다중 이름 바꾸기', '폴더 비교', '보기', '인쇄', '즐겨찾는 폴더', '새 탭']) {
      assert.ok(buttonNamed(tasks, name), name);
    }
    const items = [...view.host.querySelectorAll('.recent-item')];
    assert.deepEqual(items.map((b) => b.textContent.trim()), ['Music', 'samples', 'src', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']);
    assert.equal(view.host.textContent.includes('hidden'), false);
    await view.click(items[1]);
    assert.equal(log.recent, 'D:\\work\\samples');
    await view.click(view.host.querySelector('.recent-x'));
    assert.equal(log.removed, 'C:\\Music');
    assert.equal(view.host.querySelectorAll('.recent-item').length, 10);
    assert.equal(view.host.textContent.includes('hidden'), true);
    await view.click(view.host.querySelector('.recent-clear'));
    assert.equal(log.cleared, true);
    assert.equal(view.host.querySelectorAll('.recent-item').length, 0);
    await view.click(buttonNamed(begin, '튜토리얼'));
    assert.equal(log.run, 'tutorial');
    await view.click(buttonNamed(begin, '사용 설명'));
    assert.equal(log.run, 'manual');
    await view.click(buttonNamed(begin, '파일 관리'));
    assert.equal(log.run, 'files');
  } finally {
    await view.unmount();
  }
});

test('no recent folders shows the empty line', async () => {
  setLanguage('ko');
  const view = await mount(React.createElement(StartPage, { recent: [], onBackground() {}, onRun() {}, onRecent() {} }));
  try {
    assert.equal(view.host.querySelectorAll('.recent-item').length, 0);
    assert.match(view.host.textContent, /아직 연 폴더가 없습니다/);
  } finally {
    await view.unmount();
  }
});

test('choosing a landscape, transparency and speed updates the page and leaves the launch choice alone', async () => {
  setLanguage('ko');
  const log = { patches: [], run: null, recent: null };
  const view = await mount(React.createElement(LiveStart, { log, initial: { scene: 'nope', transparency: 45, motion: 0 } }));
  try {
    const bg = () => view.host.querySelector('.start-bg');
    assert.equal(bg().getAttribute('data-scene'), 'valley');
    assert.equal(bg().style.getPropertyValue('--start-opacity'), '0.55');
    assert.ok(bg().classList.contains('is-still'));
    assert.ok(bg().querySelector('canvas') || bg().classList.contains('start-bg-fallback'));
    assert.ok(buttonNamed(view.host, '계곡').classList.contains('on'));

    await view.click(buttonNamed(view.host, '오로라'));
    assert.deepEqual(log.patches.at(-1), { startScene: 'aurora' });
    assert.equal(bg().getAttribute('data-scene'), 'aurora');
    assert.ok(buttonNamed(view.host, '오로라').classList.contains('on'));
    assert.equal(buttonNamed(view.host, '계곡').classList.contains('on'), false);

    const sliders = view.host.querySelectorAll('.start-speed input');
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
      set.call(sliders[0], '80');
      sliders[0].dispatchEvent(new win.Event('input', { bubbles: true }));
      set.call(sliders[1], '100');
      sliders[1].dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    assert.deepEqual(log.patches.at(-2), { startTransparency: 80 });
    assert.deepEqual(log.patches.at(-1), { startMotion: 100 });
    assert.ok(Math.abs(Number(bg().style.getPropertyValue('--start-opacity')) - 0.2) < 1e-9);
    assert.equal(bg().classList.contains('is-still'), false);
    assert.equal(view.host.querySelectorAll('.start-speed-value')[0].textContent, '80%');
    assert.equal(view.host.querySelectorAll('.start-speed-value')[1].textContent, '100');

    await view.click(buttonNamed(view.host, '초기화'));
    assert.deepEqual(log.patches.at(-1), { startTransparency: 0, startMotion: 20 });
    assert.equal(Object.prototype.hasOwnProperty.call(log.patches.at(-1), 'startAtLaunch'), false);
    assert.equal(bg().style.getPropertyValue('--start-opacity'), '1');
    assert.equal(view.host.querySelectorAll('.start-speed-value')[1].textContent, '20');
    const row = (n) => view.host.querySelectorAll('.start-speed')[n];
    const stepBtn = (n, title) => row(n).querySelector(`button[title="${title}"]`);
    assert.equal(stepBtn(0, '감소').disabled, true);
    assert.equal(stepBtn(1, '증가').disabled, false);
    await view.click(stepBtn(0, '증가'));
    assert.deepEqual(log.patches.at(-1), { startTransparency: 5 });
    assert.equal(stepBtn(0, '감소').disabled, false);
    await view.click(stepBtn(1, '감소'));
    assert.deepEqual(log.patches.at(-1), { startMotion: 15 });
  } finally {
    await view.unmount();
  }
});

test('the launch checkbox is on the start page and on the settings start-screen tab', async () => {
  setLanguage('ko');
  const log = { patches: [], run: null, recent: null };
  const page = await mount(React.createElement(LiveStart, { log }));
  try {
    const box = page.host.querySelector('.start-launch input');
    assert.equal(box.checked, true);
    assert.match(page.host.querySelector('.start-launch').textContent, /시작 시 홈 보여주기/);
    await page.click(box);
    assert.deepEqual(log.patches.at(-1), { startAtLaunch: false });
    assert.equal(box.checked, false);
    await page.click(box);
    assert.deepEqual(log.patches.at(-1), { startAtLaunch: true });
    assert.equal(box.checked, true);
  } finally {
    await page.unmount();
  }

  const seen = [];
  const recentLog = [];
  const dialog = await mount(React.createElement(SettingsDialog, {
    spec: {
      values: { ...SETTINGS_DEFAULTS, startAtLaunch: false, startScene: 'aurora', startTransparency: 40, startMotion: 20 },
      shells: [],
      recent: ['C:\\Music', 'D:\\work\\samples'],
      onRecent(list) { recentLog.push(list); },
      onChange(v) { seen.push({ startAtLaunch: v.startAtLaunch, startScene: v.startScene }); },
    },
    done() {},
  }));
  try {
    await dialog.click(buttonNamed(dialog.host, '시작 화면'));
    const box = dialog.host.querySelector('.start-launch input');
    assert.equal(box.checked, false);
    assert.match(box.closest('.start-launch').textContent, /시작 시 홈 보여주기/);
    assert.equal(dialog.host.querySelector('.start-speed-value').textContent, '40%');
    assert.ok(buttonNamed(dialog.host, '오로라').classList.contains('on'));
    await dialog.click(box);
    assert.equal(box.checked, true);
    assert.equal(seen.at(-1).startAtLaunch, true);
    assert.equal(seen.at(-1).startScene, 'aurora');
    await dialog.click(buttonNamed(dialog.host, '바다'));
    assert.equal(seen.at(-1).startScene, 'ocean');
    assert.equal(seen.at(-1).startAtLaunch, true);
    assert.equal(dialog.host.querySelectorAll('.recent-item').length, 2);
    await dialog.click(dialog.host.querySelector('.recent-x'));
    assert.deepEqual(recentLog.at(-1), ['D:\\work\\samples']);
    await dialog.click(dialog.host.querySelector('.recent-clear'));
    assert.deepEqual(recentLog.at(-1), []);
    assert.equal(dialog.host.querySelectorAll('.recent-item').length, 0);
  } finally {
    await dialog.unmount();
  }
});

test('English names the same controls', async () => {
  setLanguage('en');
  const view = await mount(React.createElement(StartPage, {
    recent: [], scene: 'ocean', transparency: 0, motion: 20, showAtLaunch: false, onBackground() {}, onRun() {}, onRecent() {},
  }));
  try {
    assert.match(view.host.querySelector('.start-launch').textContent, /Show Home at startup/);
    assert.equal(view.host.querySelector('.start-scene.on').textContent.trim(), 'Ocean');
    assert.equal(view.host.querySelector('.start-speed-reset').textContent.trim(), 'Reset');
    assert.equal(view.host.querySelector('.start-launch input').checked, false);
  } finally {
    await view.unmount();
    setLanguage('ko');
  }
});

test('the tour stops on the background and explains the launch checkbox', async () => {
  setLanguage('ko');
  const background = TUTORIAL_STEPS.find((s) => s.id === 'background');
  assert.equal(background.place, 'start');
  assert.equal(background.target, '[data-group="scenes"]');
  const prepared = [];
  let closed = false;
  const view = await mount(React.createElement(Tutorial, {
    onClose() { closed = true; }, onPrepare(step) { prepared.push(step.id); },
  }));
  try {
    assert.equal(prepared[0], 'welcome');
    const press = async (key) => {
      await act(async () => {
        win.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      });
    };
    for (let i = 0; i < TUTORIAL_STEPS.findIndex((s) => s.id === 'background'); i += 1) await press('ArrowRight');
    assert.equal(prepared.at(-1), 'background');
    assert.match(view.host.textContent, /시작 시 홈 보여주기/);
    await press('ArrowLeft');
    assert.equal(prepared.at(-1), 'recent');
    await press('Escape');
    assert.equal(closed, true);
  } finally {
    await view.unmount();
  }
});

test('the written tutorial describes the launch checkbox', () => {
  const doc = fs.readFileSync(path.join(rootDir, 'doc/Tutorial.md'), 'utf8');
  assert.match(doc, /시작 시 홈 보여주기/);
  assert.match(doc, /시작 화면 탭/);
});
