// The tutorial on screen: what a step talks about is lit, a card lists what to do, and doing the work by hand ticks it off. The window
// stays usable underneath, and the card can be dragged out of the way.
import { TUTORIAL_STEPS, taskStates, tasksOf } from '../core/tutorial.js';
import { h, replace } from './dom.js';
import { getLanguage, t } from './i18n.js';
import { icon } from './icons.js';

const CARD_WIDTH = 400;
const EDGE = 12;
const words = (o) => (getLanguage() === 'en' ? o.en : o.ko);
const touches = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

export function createTutorial(app) {
  const root = h('div', { className: 'tutorial', dataset: { testid: 'tutorial' } });
  const card = h('div', { className: 'tutorial-card', dataset: { testid: 'tutorial-card' } });
  root.append(card);
  let index = 0;
  let memo = {};
  let timer = 0;
  let dragged = null;
  let spots = [];
  let signature = '';

  const env = () => {
    const view = app.editorsOf('view3d')[0]?.api?.state ?? null;
    return {
      doc: app.doc,
      view,
      result: app.renderResult,
      rendering: app.isRendering?.() ?? false,
      op: (id, props) => app.op(id, props),
      touch: () => { app.commit?.(t('Tutorial', '튜토리얼')); app.invalidate(); },
      setFrame: (n) => app.setFrame(n),
      render: () => app.op('render.render'),
    };
  };

  const placeCard = (rects) => {
    const height = card.offsetHeight || 240;
    const { innerWidth: width, innerHeight: windowHeight } = window;
    if (dragged) {
      card.style.left = `${Math.max(EDGE, Math.min(width - CARD_WIDTH - EDGE, dragged.left))}px`;
      card.style.top = `${Math.max(EDGE, Math.min(windowHeight - height - EDGE, dragged.top))}px`;
      return;
    }
    const bottom = windowHeight - height - 34;
    const places = [{ left: EDGE + 40, top: bottom }, { left: (width - CARD_WIDTH) / 2, top: bottom }, { left: width - CARD_WIDTH - EDGE, top: bottom }, { left: (width - CARD_WIDTH) / 2, top: 48 }];
    const free = !rects.length ? { left: (width - CARD_WIDTH) / 2, top: (windowHeight - height) / 2 } : (places.find((p) => !rects.some((r) => touches({ ...p, right: p.left + CARD_WIDTH, bottom: p.top + height }, r))) ?? places[0]);
    card.style.left = `${Math.max(EDGE, free.left)}px`;
    card.style.top = `${Math.max(EDGE, free.top)}px`;
  };

  const measure = () => {
    const step = TUTORIAL_STEPS[index];
    const rects = (step.selectors ?? []).map((s) => document.querySelector(s)?.getBoundingClientRect()).filter((b) => b?.width && b.height);
    while (spots.length > rects.length) spots.pop().remove();
    while (spots.length < rects.length) { const el = h('div', { className: 'tutorial-spot', dataset: { testid: 'tutorial-spot' } }); spots.push(el); root.insertBefore(el, card); }
    rects.forEach((r, i) => Object.assign(spots[i].style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` }));
    root.classList.toggle('dim', !rects.length);
    placeCard(rects);
  };

  const render = () => {
    const step = TUTORIAL_STEPS[index];
    const e = env();
    const states = taskStates(step, e, memo);
    const done = states.every((s) => s.done);
    const last = index === TUTORIAL_STEPS.length - 1;
    const next = `${index}|${states.map((s) => s.done).join()}|${getLanguage()}`;
    if (next === signature) return;
    signature = next;
    const head = h('header', { onPointerdown: moveCard }, icon('tutorial', 16), h('strong', { dataset: { testid: 'tutorial-title' } }, words(step.title)), h('span', { className: 'tutorial-count', dataset: { testid: 'tutorial-count' } }, `${index + 1} / ${TUTORIAL_STEPS.length}`));
    const list = tasksOf(step).length ? h('ul', { className: 'tutorial-tasks', dataset: { testid: 'tutorial-tasks' } }, states.map(({ task, done: ok }) => h('li', { className: ok ? 'done' : '', dataset: { testid: `tutorial-task-${task.id}`, done: ok ? 'yes' : 'no' } }, icon(ok ? 'check' : 'right', 13), h('span', null, words(task))))) : null;
    const foot = h('footer', null,
      h('button', { type: 'button', dataset: { testid: 'tutorial-close' }, onClick: () => close() }, icon('close', 12), last ? t('Close', '닫기') : t('Stop', '그만하기')),
      h('span', { className: 'tutorial-gap' }),
      h('button', { type: 'button', disabled: index === 0, dataset: { testid: 'tutorial-prev' }, onClick: () => go(index - 1) }, icon('left', 11), t('Back', '이전')),
      !done ? h('button', { type: 'button', dataset: { testid: 'tutorial-do' }, onClick: () => doIt() }, icon('check', 12), t('Do It for Me', '대신 해 주기')) : null,
      last
        ? h('button', { type: 'button', className: 'primary', dataset: { testid: 'tutorial-done' }, onClick: () => close() }, icon('check', 12), t('Finish', '마치기'))
        : h('button', { type: 'button', className: 'primary', disabled: !done, title: done ? '' : t('Finish what is listed first', '먼저 목록의 일을 마치세요'), dataset: { testid: 'tutorial-next' }, onClick: () => go(index + 1) }, t('Next', '다음'), icon('right', 11)));
    replace(card, head, h('p', { dataset: { testid: 'tutorial-text' } }, words(step.text)), list, h('div', { className: 'tutorial-progress' }, h('i', { style: { width: `${((index + 1) / TUTORIAL_STEPS.length) * 100}%` } })), foot);
    measure();
  };

  function moveCard(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const box = card.getBoundingClientRect();
    const [dx, dy] = [event.clientX - box.left, event.clientY - box.top];
    const move = (m) => { dragged = { left: m.clientX - dx, top: m.clientY - dy }; placeCard([]); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function go(next) {
    index = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, next));
    const step = TUTORIAL_STEPS[index];
    if (step.workspace) app.setWorkspace(step.workspace);
    memo = step.begin?.(env()) ?? {};
    app.invalidate();
    signature = '';
    render();
  }

  function doIt() {
    const step = TUTORIAL_STEPS[index];
    for (const { task, done } of taskStates(step, env(), memo)) if (!done) task.run(env(), memo);
    app.invalidate();
    render();
  }

  const onKey = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (event.target.closest?.('input, textarea, select, .menu') || document.querySelector('.menu')) return;
    if (app.editorsOf('view3d').some((v) => v.api?.modal?.())) return;
    close();
  };

  function close() {
    clearInterval(timer);
    timer = 0;
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', measure);
    root.remove();
    for (const el of spots) el.remove();
    spots = [];
    app.invalidate();
  }

  return {
    isOpen: () => root.isConnected,
    /** Opens it on a fresh scene. */
    start() {
      index = 0;
      dragged = null;
      signature = '';
      document.querySelector('.app').append(root);
      go(0);
      clearInterval(timer);
      timer = setInterval(() => { render(); measure(); }, 200);
      window.addEventListener('keydown', onKey);
      window.addEventListener('resize', measure);
    },
    close,
    step: () => TUTORIAL_STEPS[index],
    goTo: go,
    doIt,
  };
}
