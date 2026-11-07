// What the program opens with, in the design of My LVGL Studio and My Git Master: a moving background behind a scrolling board of
// translucent cards on a three-column grid. A card moves by its handle (a see-through copy follows the pointer and a dashed outline
// shows where it lands) and resizes by its corner; double-clicking the corner fits it to its content again.
import { h, replace, svg, themeSwatch } from './dom.js';
import { t, getLanguage } from './i18n.js';
import { icon } from './icons.js';
import { ANIMATIONS, AnimatedBackground } from './background.js';
import { COLS, GAP, ROW, autoArrange, cardsOf, compact, layoutValue, place, rowsFor } from './startlayout.js';
import { THEMES, themesByMode } from '../core/themes.js';

const drawing = (inner, size, viewBox) => svg(`<svg width="${size}" height="${size}" viewBox="${viewBox}" aria-hidden="true">${inner}</svg>`);

const BG_NAMES = {
  wirecubes: ['Wire Cubes', '철사 큐브', '#f59e0b', 'M12 3l7 4v10l-7 4-7-4V7zM5 7l7 4 7-4M12 11v10'],
  floorgrid: ['Floor Grid', '바닥 격자', '#14b8a6', 'M3 20L9 6M21 20L15 6M3 20h18M6 13h12M8 8h8M12 6v14'],
  nodegraph: ['Node Graph', '노드 그래프', '#3b82f6', 'M3 5h6v5H3zM15 14h6v5h-6zM9 7.500c5 0 1 9 6 9'],
  meshwave: ['Mesh Wave', '메시 물결', '#8b5cf6', 'M3 9c3-3 6-3 9 0s6 3 9 0M3 15c3-3 6-3 9 0s6 3 9 0M7 7v10M12 9v6M17 8v9'],
  keyframes: ['Keyframes', '키프레임', '#f97316', 'M7 5l3 3-3 3-3-3zM16 5l3 3-3 3-3-3zM11 14l3 3-3 3-3-3zM2 8h22M2 17h22'],
  raytrace: ['Light Paths', '빛의 경로', '#22c55e', 'M3 20L11 5l5 9 5-8'],
  aurora: ['Aurora', '오로라', '#10b981', 'M3 18c3-10 5-12 7-12s1 8 4 8 3-6 7-9'],
  waves: ['Waves', '물결', '#0ea5e9', 'M3 8c3-3 6-3 9 0s6 3 9 0M3 13c3-3 6-3 9 0s6 3 9 0M3 18c3-3 6-3 9 0s6 3 9 0'],
  particles: ['Particles', '입자', '#ec4899', 'M6 7h.01M15 5h.01M19 12h.01M10 13h.01M5 18h.01M15 19h.01'],
  constellation: ['Constellation', '별자리', '#6366f1', 'M5 6l7 4 7-5M12 10l-3 9 10-3'],
  bubbles: ['Bubbles', '거품', '#06b6d4', 'M14 14a5 5 0 1 1-10 0 5 5 0 0 1 10 0zM20 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  gridflow: ['Flowing Grid', '격자 흐름', '#64748b', 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18'],
  starfield: ['Star Field', '별빛', '#eab308', 'M12 3l2.600 6 6.400.600-4.800 4.200 1.400 6.200-5.600-3.300L6.400 20l1.400-6.200L3 9.600 9.400 9z'],
  snow: ['Snow', '눈', '#38bdf8', 'M12 3v18M4.200 7.500l15.600 9M19.800 7.500l-15.600 9'],
  fireflies: ['Fireflies', '반딧불', '#a3e635', 'M7 8h.01M17 7h.01M14 16h.01M6 18h.01'],
  ripples: ['Ripples', '잔물결', '#2dd4bf', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM17.500 12a5.500 5.500 0 1 1-11 0 5.500 5.500 0 0 1 11 0z'],
  hexagons: ['Honeycomb', '벌집', '#d97706', 'M8 3l4 2.300v4.600L8 12.200 4 9.900V5.300zM16 3l4 2.300v4.600l-4 2.300-4-2.300V5.300z'],
  orbits: ['Orbits', '궤도', '#a855f7', 'M22 12c0 2.200-4.500 4-10 4S2 14.200 2 12s4.500-4 10-4 10 1.800 10 4zM14.500 12a2.500 2.500 0 1 1-5 0 2.500 2.500 0 0 1 5 0z'],
  lava: ['Lava Lamp', '라바 램프', '#ef4444', 'M8 3h8l1 3-1 3c3 3 3 12-4 12S5 12 8 9L7 6z'],
  ribbons: ['Ribbons', '리본', '#f43f5e', 'M3 7c5-4 7 8 12 4s4-5 6-5M3 15c5-4 7 8 12 4s4-5 6-5'],
};

/** The backgrounds as [id, name], for the preferences. */
export const backgroundOptions = () => ANIMATIONS.map((kind) => [kind, t(BG_NAMES[kind][0], BG_NAMES[kind][1])]);

export const LEVELS = {
  beginner: { en: 'Beginner', ko: '초급' },
  intermediate: { en: 'Intermediate', ko: '중급' },
  advanced: { en: 'Advanced', ko: '고급' },
};
const words = (o) => (getLanguage() === 'en' ? o.en : o.ko);

let manifest = null;
/** The list of sample projects; shipped with the program. */
export async function loadSamples() {
  if (manifest) return manifest;
  const response = await fetch('./sample/index.json');
  if (!response.ok) throw new Error('The sample list is missing');
  manifest = await response.json();
  return manifest;
}

/** Sample projects with level chips: one-line tiles in their own section of the start screen, a gallery of pictures in File › Samples. */
export function sampleBrowser(app, state, { onOpen, tiles = false }) {
  const chips = h('div', { className: 'level-chips', dataset: { testid: 'sample-levels' } });
  const grid = h('div', { className: tiles ? 'sample-tiles' : 'sample-grid', dataset: { testid: 'sample-grid' } });
  const fill = async () => {
    let list;
    try { list = await loadSamples(); } catch (error) { grid.replaceChildren(h('div', { className: 'note-line' }, error.message)); return; }
    const count = (level) => list.filter((s) => s.level === level).length;
    replace(chips, ...[['all', { en: 'All', ko: '전체' }], ...Object.entries(LEVELS)].map(([id, name]) => h('button', {
      type: 'button', className: `level-chip${state.level === id ? ' on' : ''}`, dataset: { testid: `sample-level-${id}` },
      onClick: () => { state.level = id; fill(); },
    }, `${words(name)} ${id === 'all' ? list.length : count(id)}`)));
    grid.replaceChildren(...list.filter((s) => state.level === 'all' || s.level === state.level).map((s) => h('button', {
      type: 'button', className: `sample-card${tiles ? ' start-tile' : ''}`, title: `${words(s.title)}\n${words(s.description)}`, dataset: { testid: `sample-${s.id}` }, onClick: () => onOpen(s),
    },
    h('img', { src: `./sample/${s.thumb}`, alt: '', loading: 'lazy', draggable: false }),
    h(tiles ? 'b' : 'strong', null, words(s.title)),
    h('small', null, h('span', { className: `level-${s.level}` }, words(LEVELS[s.level])), ` · ${s.topics.slice(0, 2).join(', ')}`))));
  };
  fill();
  return { chips, grid, refresh: fill };
}

const FIT_SHRINK_ROWS = 1;
const START_CARDS = ['hero', 'actions', 'recent', 'samples', 'theme', 'background'];
const DEFAULT_SPAN = { hero: 3, actions: 3, recent: 3, samples: 3, theme: 3, background: 3 };
const SHUFFLE_SECONDS = 20;

/** A see-through copy of the dragged card that follows the pointer. */
function dragGhost(element, event, container) {
  const rect = element.getBoundingClientRect();
  const offX = event.clientX - rect.left;
  const offY = event.clientY - rect.top;
  const ghost = element.cloneNode(true);
  ghost.classList.add('start-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  // A copy must not answer for the card it was made from.
  for (const node of [ghost, ...ghost.querySelectorAll('*')]) for (const name of [...node.getAttributeNames()]) if (name.startsWith('data-')) node.removeAttribute(name);
  Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, transformOrigin: `${offX}px ${offY}px`, gridColumn: 'auto', gridRow: 'auto' });
  let last = { x: event.clientX, y: event.clientY };
  const put = () => {
    const c = container.getBoundingClientRect();
    ghost.style.left = `${last.x - offX - c.left}px`;
    ghost.style.top = `${last.y - offY - c.top}px`;
  };
  put();
  container.append(ghost);
  return {
    topLeft: () => ({ x: last.x - offX, y: last.y - offY }),
    move(next) { last = { x: next.clientX, y: next.clientY }; put(); },
    destroy: () => ghost.remove(),
  };
}

/** [−] [slider bar] [value] [+]. */
function rangeStepper({ name, label, min, max, step, suffix, value, onChange }) {
  const clamp = (next) => Math.max(min, Math.min(max, Math.round(next / step) * step));
  const fill = h('span', { className: 'range-fill' });
  const thumb = h('span', { className: 'range-thumb' });
  const bar = h('div', { className: 'range-bar', role: 'slider', tabIndex: 0, title: label, ariaLabel: label, dataset: { testid: name } }, fill, thumb);
  const field = h('input', { type: 'number', min, max, step, ariaLabel: label, dataset: { testid: `${name}-value` } });
  const down = h('button', { type: 'button', className: 'range-step', title: `${label} −`, dataset: { step: `${name}:down` } }, '−');
  const up = h('button', { type: 'button', className: 'range-step', title: `${label} +`, dataset: { step: `${name}:up` } }, '+');
  let current = value;
  const show = () => {
    const fraction = Math.max(0, Math.min(1, (current - min) / (max - min || 1)));
    fill.style.width = `${fraction * 100}%`;
    thumb.style.left = `${fraction * 100}%`;
    field.value = String(current);
    down.disabled = current <= min;
    up.disabled = current >= max;
  };
  const set = (next) => { const v = clamp(next); if (v !== current) { current = v; onChange(v); } show(); };
  down.addEventListener('click', () => set(current - step));
  up.addEventListener('click', () => set(current + step));
  const commit = () => { const n = Number(field.value); if (field.value.trim() !== '' && Number.isFinite(n)) set(n); else show(); };
  field.addEventListener('blur', commit);
  field.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); });
  const fromPointer = (x) => { const r = bar.getBoundingClientRect(); return min + ((x - r.left) / (r.width || 1)) * (max - min); };
  bar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    bar.focus();
    set(fromPointer(event.clientX));
    const move = (e) => set(fromPointer(e.clientX));
    const done = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', done);
  });
  bar.addEventListener('keydown', (e) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
    if (delta) { e.preventDefault(); e.stopPropagation(); set(current + delta); }
  });
  show();
  return h('span', { className: 'range-stepper', dataset: { range: name } }, down, bar, h('span', { className: 'range-value' }, field, suffix ? h('span', { className: 'range-suffix' }, suffix) : null), up);
}

export function createStartScreen(app, actions) {
  const settings = app.settings;
  const speed = () => settings.startBgSpeed ?? 100;
  const opacity = () => settings.startCardOpacity ?? 85;
  const canvas = h('canvas', { className: 'start-canvas', dataset: { testid: 'start-canvas' } });
  const scroller = h('div', { className: 'start-scroll' });
  const root = h('div', { className: 'start', dataset: { testid: 'start-screen' } }, canvas, scroller);
  const colors = () => {
    const style = getComputedStyle(root);
    const read = (name) => style.getPropertyValue(name).trim();
    const bg = read('--bg') || '#222222';
    const hex = /^#[0-9a-f]{6}$/i.test(bg) ? parseInt(bg.slice(1), 16) : 0x222222;
    const lum = (0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255)) / 255;
    return { bg, accent: read('--accent'), accent2: read('--accent'), text: read('--text'), danger: read('--danger'), dark: lum < 0.45 };
  };
  let engine = null;
  let shuffleTimer = 0;
  const startEngine = () => {
    engine?.destroy();
    engine = new AnimatedBackground(canvas, { colors, speed: () => Math.max(0, Number(speed()) || 0) / 100, kind: settings.startBg ?? 'wirecubes', vivid: true });
    canvas.__background = engine;
    engine.resize();
    engine.start();
  };
  const applyOpacity = () => root.style.setProperty('--start-card-alpha', `${opacity()}%`);
  const setBackground = (kind) => {
    settings.startBg = kind;
    actions.saveSettings();
    engine?.setKind(kind);
    root.querySelectorAll('[data-bg-card]').forEach((c) => c.classList.toggle('on', c.dataset.bgCard === kind));
  };
  const runShuffle = () => {
    clearInterval(shuffleTimer);
    if (!settings.startBgShuffle) return;
    shuffleTimer = setInterval(() => {
      const i = ANIMATIONS.indexOf(settings.startBg ?? 'wirecubes');
      setBackground(ANIMATIONS[(i + 1) % ANIMATIONS.length]);
    }, SHUFFLE_SECONDS * 1000);
  };

  // ── The board
  const board = h('div', { className: 'start-board', dataset: { testid: 'start-board' } });
  const outline = h('div', { className: 'card-drop-outline', ariaHidden: 'true' });
  const cards = {};
  let drag = null;
  let measured = {};
  let burst = { at: 0, n: 0 };
  let rects = new Map();
  const saved = () => cardsOf(settings.startLayout, START_CARDS, DEFAULT_SPAN, measured);
  const cellStyle = (cell) => ({ gridColumn: `${cell.col + 1} / span ${cell.w}`, gridRow: `${cell.row + 1} / span ${cell.h}` });
  const render = () => {
    const base = saved();
    const shown = drag?.target ? place(base, drag.id, drag.target) : base;
    for (const [id, el] of Object.entries(cards)) {
      const mine = drag?.id === id;
      const cell = mine ? base[id] : shown[id];
      Object.assign(el.style, cellStyle(cell), { height: cell.fit ? '' : `${cell.h * ROW - GAP}px` });
      el.classList.toggle('fit', cell.fit);
      el.classList.toggle('fixed-height', !cell.fit);
      el.classList.toggle('drag-origin', mine && drag.mode === 'move');
      el.classList.toggle('resizing', mine && drag.mode === 'resize');
    }
    if (drag?.target) {
      const cell = shown[drag.id];
      Object.assign(outline.style, cellStyle(cell), { height: `${cell.h * ROW - GAP}px` });
      if (!outline.isConnected) board.append(outline);
    } else outline.remove();
    // The other cards slide to their new places rather than jumping.
    const now = new Map();
    for (const [id, el] of Object.entries(cards)) {
      const rect = el.getBoundingClientRect();
      now.set(id, rect);
      const old = rects.get(id);
      if (!old || el.classList.contains('drag-origin')) continue;
      const dx = old.left - rect.left;
      const dy = old.top + rects.scroll - (rect.top + scroller.scrollTop);
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
    }
    now.scroll = scroller.scrollTop;
    rects = now;
  };
  // Fit cards take the height of their content, measured in rows.
  const measure = () => {
    if (root.style.display === 'none' || !root.isConnected) return;
    const next = {};
    for (const [id, el] of Object.entries(cards)) if (el.classList.contains('fit') && el.offsetHeight) next[id] = rowsFor(el.offsetHeight);
    // Growing always applies; shrinking by a single row does not, so a card whose height depends on where compaction put it
    // cannot flip between two heights.
    const changed = Object.keys(next).filter((key) => measured[key] === undefined || next[key] > measured[key] || measured[key] - next[key] > FIT_SHRINK_ROWS);
    if (!changed.length) return;
    const now = performance.now();
    if (now - burst.at > 1000) burst = { at: now, n: 0 };
    if (burst.n > 12) return;
    burst.n += 1;
    measured = { ...measured, ...Object.fromEntries(changed.map((key) => [key, next[key]])) };
    render();
    measure();
  };
  const sizes = new ResizeObserver(() => measure());
  sizes.observe(board);
  const saveLayout = (next) => {
    settings.startLayout = layoutValue(compact(next));
    actions.saveSettings();
    render();
  };
  const follow = (move, done) => {
    const up = (event) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      done(event);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const autoScroll = (event) => {
    const rect = scroller.getBoundingClientRect();
    if (event.clientY > rect.bottom - 36) scroller.scrollTop += 14;
    else if (event.clientY < rect.top + 36) scroller.scrollTop -= 14;
  };
  const columnWidth = () => (board.getBoundingClientRect().width - GAP * (COLS - 1)) / COLS;
  const cellAt = (x, y, w) => {
    const rect = board.getBoundingClientRect();
    return { col: Math.max(0, Math.min(COLS - w, Math.round((x - rect.left) / (columnWidth() + GAP)))), row: Math.max(0, Math.round((y - rect.top) / ROW)) };
  };
  const startMove = (event, id) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const ghost = dragGhost(cards[id], event, board);
    const base = saved();
    const cell = base[id];
    let target = { col: cell.col, row: cell.row };
    drag = { id, mode: 'move', target };
    render();
    follow((moved) => {
      // Scroll first: the ghost is placed against the board, which scrolling moves.
      autoScroll(moved);
      ghost.move(moved);
      const point = ghost.topLeft();
      const next = cellAt(point.x, point.y, cell.w);
      if (next.col !== target.col || next.row !== target.row) {
        target = next;
        drag = { id, mode: 'move', target };
        render();
      }
    }, (ended) => {
      ghost.destroy();
      drag = null;
      if (ended.type === 'pointerup' && (target.col !== cell.col || target.row !== cell.row)) saveLayout(place(base, id, target));
      else render();
    });
  };
  const startResize = (event, id) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = cards[id].getBoundingClientRect();
    const size = columnWidth();
    const base = saved();
    const cell = base[id];
    const { clientX: startX, clientY: startY } = event;
    let target = { w: cell.w, h: cell.h };
    drag = { id, mode: 'resize', target: null };
    render();
    follow((moved) => {
      autoScroll(moved);
      const w = Math.max(1, Math.min(COLS - cell.col, Math.round((rect.width + moved.clientX - startX + GAP) / (size + GAP))));
      const hh = Math.max(4, Math.round((rect.height + moved.clientY - startY + GAP) / ROW));
      if (w !== target.w || hh !== target.h) {
        target = { w, h: hh };
        drag = { id, mode: 'resize', target: { ...target, fit: false } };
        render();
      }
    }, (ended) => {
      drag = null;
      if (ended.type === 'pointerup' && (target.w !== cell.w || target.h !== cell.h)) saveLayout(place(base, id, { ...target, fit: false }));
      else render();
    });
  };
  const GRIP = () => drawing('<g fill="currentColor"><circle cx="10.500" cy="1.500" r="1.100"/><circle cx="6" cy="6" r="1.100"/><circle cx="10.500" cy="6" r="1.100"/><circle cx="1.500" cy="10.500" r="1.100"/><circle cx="6" cy="10.500" r="1.100"/><circle cx="10.500" cy="10.500" r="1.100"/></g>', 14, '0 0 12 12');
  const makeCard = (id, iconName, title, body, { extra = null, bare = false } = {}) => {
    const handle = h('button', { type: 'button', className: 'card-handle', title: t('Move card', '카드 옮기기'), ariaLabel: t('Move card', '카드 옮기기'), dataset: { cardHandle: id }, onPointerdown: (e) => startMove(e, id) }, icon('drag', 14));
    const grip = h('span', {
      className: 'card-resize', title: t('Resize card (double-click to fit its content)', '카드 크기 조절 (두 번 클릭하면 내용에 맞춤)'), dataset: { cardResize: id },
      onPointerdown: (e) => startResize(e, id),
      onDblclick: () => saveLayout(place(saved(), id, { fit: true })),
    }, GRIP());
    const el = h('section', { className: `start-card start-card-${id}${bare ? ' bare' : ''}`, dataset: { testid: `start-card-${id}`, card: id } },
      bare ? h('span', { className: 'card-handle-float' }, handle)
        : h('h2', null, handle, icon(iconName, 16), h('span', { className: 'start-card-title' }, title), h('span', { className: 'grow' }), extra),
      h('div', { className: 'card-body' }, ...body),
      grip);
    cards[id] = el;
    board.append(el);
    sizes.observe(el);
  };

  // ── Contents (rebuilt when the language changes)
  const tile = (id, iconName, color, label, tip, onClick, flag) => {
    const mark = flag ?? icon(iconName, 20);
    if (!flag) mark.style.color = color;
    return h('button', { type: 'button', className: 'start-tile', title: tip, dataset: { testid: id }, onClick }, flag ? h('span', { className: 'flag-slot' }, mark) : mark, h('b', null, label), h('small', null, tip));
  };
  const button = (id, iconName, label, onClick, { primary = false, title = null } = {}) => h('button', { type: 'button', className: `start-btn${primary ? ' primary' : ''}`, title, dataset: { testid: id }, onClick }, icon(iconName, 16), h('span', null, label));
  const bgTiles = () => h('div', { className: 'bg-grid', dataset: { testid: 'bg-cards' } }, ANIMATIONS.map((kind) => {
    const [en, ko, color, path] = BG_NAMES[kind];
    return h('button', { type: 'button', className: `bg-tile${kind === (settings.startBg ?? 'wirecubes') ? ' on' : ''}`, title: t(en, ko), dataset: { bgCard: kind }, onClick: () => setBackground(kind) },
      drawing(`<path d="${path}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`, 18, '0 0 24 24'), h('span', null, t(en, ko)));
  }), h('button', {
    type: 'button', role: 'switch', className: `bg-tile shuffle${settings.startBgShuffle ? ' on' : ''}`, title: t(`Change background every ${SHUFFLE_SECONDS} s`, `${SHUFFLE_SECONDS}초마다 배경 변경`), dataset: { testid: 'start-shuffle' },
    onClick: (e) => { settings.startBgShuffle = !settings.startBgShuffle; actions.saveSettings(); e.currentTarget.classList.toggle('on', settings.startBgShuffle); runShuffle(); },
  }, icon('sync', 18), h('span', null, t('Auto change', '자동 변경'))));
  const themeTile = (theme) => h('button', {
    type: 'button', className: `bg-tile st-theme-tile${settings.theme === theme.id ? ' on' : ''}`, title: actions.themeName(theme), dataset: { startTheme: theme.id },
    onClick: () => {
      settings.theme = theme.id;
      actions.saveSettings();
      actions.applyTheme();
      root.querySelectorAll('[data-start-theme]').forEach((c) => c.classList.toggle('on', c.dataset.startTheme === theme.id));
      const note = root.querySelector('.start-card-note');
      if (note) note.textContent = actions.themeName(theme);
    },
  }, themeSwatch(theme, 14), h('span', null, actions.themeName(theme)));
  const themeGroup = (mode, iconName, name) => h('section', { className: 'st-theme-group', dataset: { themeKind: mode } },
    h('h3', null, icon(iconName, 14), h('span', null, name)),
    h('div', { className: 'bg-grid st-theme-tiles' }, themesByMode(mode).map(themeTile)));

  const sampleState = { level: 'all' };
  let gridWatchers = [];
  const closeLastRow = (grid) => {
    const items = [...grid.children];
    for (const item of items) item.style.gridColumn = '';
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const over = items.length % columns;
    if (items.length && over) items.at(-1).style.gridColumn = `span ${columns - over + 1}`;
  };
  const watchGrids = () => {
    for (const w of gridWatchers) w.disconnect();
    gridWatchers = [];
    for (const grid of board.querySelectorAll('.start-actions, .sample-tiles, .bg-grid')) {
      const check = () => closeLastRow(grid);
      const resized = new ResizeObserver(check);
      resized.observe(grid);
      const changed = new MutationObserver(check);
      changed.observe(grid, { childList: true });
      gridWatchers.push(resized, changed);
      check();
    }
  };
  const build = () => {
    const top = scroller.scrollTop;
    rects = new Map();
    measured = {};
    for (const el of Object.values(cards)) { sizes.unobserve(el); el.remove(); }
    for (const key of Object.keys(cards)) delete cards[key];
    makeCard('hero', 'home', '', [
      h('img', { className: 'start-icon', src: './icon.png', width: 76, height: 76, alt: '' }),
      h('div', { className: 'start-hero-text' },
        h('h1', null, h('span', null, 'My3DBlender'), h('small', null, `v${__APP_VERSION__}`)),
        h('p', null, t('Modeling, sculpting, nodes, animation, simulation, rendering and video in one program.', '모델링·스컬프팅·노드·애니메이션·시뮬레이션·렌더링·영상 편집을 한 프로그램에서.'))),
      h('div', { className: 'start-hero-actions' },
        button('start-new', 'new', t('New Project', '새 프로젝트'), () => actions.newProject(), { primary: true, title: t('A cube, a light and a camera', '큐브, 조명, 카메라') }),
        button('start-open', 'open', t('Open...', '열기...'), () => actions.open(), { title: t('Open a .my3d project', '.my3d 프로젝트 열기') }),
        button('start-samples', 'samples', t('Samples', '샘플'), () => root.querySelector('[data-testid=start-card-samples]').scrollIntoView({ block: 'start', behavior: 'smooth' }), { title: t('Go to the sample projects', '샘플 프로젝트로 이동') }),
        button('start-tutorial', 'tutorial', t('Tutorial', '튜토리얼'), () => actions.startTutorial(), { title: t('Learn by doing, step by step', '따라 하며 배우기') }),
        button('start-guide', 'guide', t("User's Guide", '사용자 설명서'), () => actions.openDoc('UsersGuide'), { title: t('Everything the program does', '프로그램의 모든 기능') })),
    ], { bare: true });
    makeCard('actions', 'grid', t('Menu', '메뉴'), [h('div', { className: 'start-actions' },
      tile('start-action-new', 'new', '#3b82f6', t('New Project', '새 프로젝트'), t('A cube, a light and a camera', '큐브, 조명, 카메라'), () => actions.newProject()),
      tile('start-empty', 'add', '#22c55e', t('Empty Scene', '빈 장면'), t('Nothing at all', '아무것도 없는 장면'), () => actions.newEmpty()),
      tile('start-action-open', 'open', '#f59e0b', t('Open...', '열기...'), t('A .my3d project', '.my3d 프로젝트'), () => actions.open()),
      tile('start-import', 'import', '#14b8a6', t('Import...', '가져오기...'), t('.blend, FBX, glTF, OBJ…', '.blend, FBX, glTF, OBJ…'), () => actions.importMenu()),
      tile('start-action-samples', 'samples', '#10b981', t('Samples...', '샘플...'), t('The gallery, by level', '난이도별 샘플 모음'), () => actions.samples()),
      tile('start-action-theme', 'palette', '#a855f7', t('Theme', '테마'), t('Dark and light themes', '어두운 테마와 밝은 테마'), () => root.querySelector('[data-testid=start-card-theme]').scrollIntoView({ block: 'nearest', behavior: 'smooth' })),
      tile('start-action-language', null, null, getLanguage() === 'en' ? '한국어' : 'English', t('Switch between Korean and English', '한국어와 English를 전환합니다'), () => actions.toggleLanguage(), actions.flag()),
      tile('start-action-preferences', 'settings', '#64748b', t('Preferences...', '환경 설정...'), t('Language, themes, keys, add-ons', '언어, 테마, 단축키, 애드온'), () => actions.preferences()),
      tile('start-action-start', 'home', '#f97316', t('Start Screen Settings', '시작 화면 설정'), t('Background, speed, card opacity', '배경, 속도, 카드 불투명도'), () => actions.preferences()),
      tile('start-action-about', 'ed-info', '#0ea5e9', t('About...', '정보...'), t('Version and license information', '버전과 라이선스 정보'), () => actions.about()),
      actions.canExit ? tile('start-action-exit', 'power', '#ef4444', t('Exit', '끝내기'), t('Quit My3DBlender', 'My3DBlender를 끝냅니다'), () => actions.exit()) : null,
    )]);
    const browser = sampleBrowser(app, sampleState, { onOpen: (s) => actions.openSample(s), tiles: true });
    const recent = actions.recentFiles();
    const baseName = (p) => p.split(/[\\/]/).pop();
    makeCard('recent', 'clock', t('Recent projects', '최근 프로젝트'), [recent.length
      ? h('div', { className: 'start-list', dataset: { testid: 'start-recent' } }, recent.map((p) => h('div', { className: 'start-row' },
        h('button', { type: 'button', className: 'start-link', title: p, onClick: () => actions.openRecent(p) }, icon('ed-view3d', 16), h('span', { className: 'name' }, baseName(p).replace(/\.[^.]+$/, '')), h('span', { className: 'path' }, p.slice(0, -baseName(p).length - 1))),
        h('button', { type: 'button', className: 'start-row-remove', title: t('Remove from list', '목록에서 제거'), onClick: () => { actions.setRecent(actions.recentFiles().filter((x) => x !== p)); build(); } }, icon('delete', 14)))))
      : h('div', { className: 'start-empty', dataset: { testid: 'start-recent-empty' } }, icon('ed-info', 14), h('span', null, t('No recent projects yet.', '최근에 연 프로젝트가 없습니다.')))],
    { extra: recent.length ? h('button', { type: 'button', className: 'start-btn small', dataset: { testid: 'start-clear-recent' }, onClick: () => { actions.setRecent([]); build(); } }, icon('delete', 14), h('span', null, t('Clear All', '모두 지우기'))) : null });
    makeCard('samples', 'samples', t('Sample Projects', '샘플 프로젝트'), [browser.grid], { extra: browser.chips });
    makeCard('theme', 'palette', t('Theme', '테마'), [h('div', { className: 'st-theme-columns' }, themeGroup('dark', 'moon', t('Dark', '어두운 테마')), themeGroup('light', 'sun', t('Light', '밝은 테마')))],
      { extra: h('span', { className: 'start-card-note' }, actions.themeName(THEMES.find((x) => x.id === settings.theme) ?? THEMES[0])) });
    makeCard('background', 'ed-image', t('Background', '배경'), [
      bgTiles(),
      h('div', { className: 'start-ranges', dataset: { testid: 'start-bg-controls' } },
        h('div', { className: 'start-range' }, h('span', { className: 'start-range-label' }, icon('ed-timeline', 14), t('Speed', '속도')),
          rangeStepper({ name: 'start-speed', label: t('Speed', '속도'), min: 0, max: 300, step: 10, suffix: '%', value: speed(), onChange: (v) => { settings.startBgSpeed = v; actions.saveSettings(); } })),
        h('div', { className: 'start-range' }, h('span', { className: 'start-range-label' }, icon('eye', 14), t('Card opacity', '카드 불투명도')),
          rangeStepper({ name: 'start-opacity', label: t('Card opacity', '카드 불투명도'), min: 20, max: 100, step: 5, suffix: '%', value: opacity(), onChange: (v) => { settings.startCardOpacity = v; actions.saveSettings(); applyOpacity(); } }))),
    ]);
    const tools = h('div', { className: 'start-tools' },
      h('label', { className: 'start-btn start-startup', title: t('Show at startup', '시작할 때 표시') },
        h('input', { type: 'checkbox', checked: settings.showStart !== false, dataset: { testid: 'start-option' }, onChange: (e) => { settings.showStart = e.target.checked; actions.saveSettings(); } }),
        h('span', null, t('Show at startup', '시작할 때 표시'))),
      button('start-settings', 'settings', t('Start Screen Settings', '시작 화면 설정'), () => actions.preferences()),
      button('start-arrange', 'grid', t('Auto Arrange', '자동 정렬'), () => saveLayout(autoArrange(START_CARDS, DEFAULT_SPAN, measured)), { title: t('Put the cards back in their default arrangement', '카드를 기본 배치로 정렬합니다') }));
    const footer = h('footer', { className: 'start-foot', dataset: { testid: 'start-footer' } },
      icon('ed-info', 14),
      h('span', { className: 'grow' }, `My3DBlender V${__APP_VERSION__}`),
      h('span', { className: 'muted', dataset: { testid: 'start-author' } }, '© SHKWON (knix008@naver.com)'));
    replace(scroller, h('div', { className: 'start-inner' }, tools, board, footer));
    render();
    watchGrids();
    measure();
    scroller.scrollTop = top;
  };

  return {
    root,
    show() {
      root.style.display = '';
      applyOpacity();
      build();
      scroller.scrollTop = 0;
      startEngine();
      runShuffle();
    },
    hide() {
      root.style.display = 'none';
      clearInterval(shuffleTimer);
      engine?.destroy();
      engine = null;
    },
    rebuild: () => build(),
    /** The preferences changed something this screen shows. */
    sync() {
      applyOpacity();
      if (root.style.display !== 'none') { engine?.setKind(settings.startBg ?? 'wirecubes'); runShuffle(); build(); }
    },
    isOpen: () => root.style.display !== 'none',
  };
}
