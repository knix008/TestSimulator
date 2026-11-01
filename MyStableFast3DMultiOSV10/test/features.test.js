import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gridFor, shotsFor, resolveLandscape, framePages, clampCopies, choosePrinter, LAYOUT_VIEWS, PRINT_LAYOUTS } from '../src/lib/print.js';
import { STEPS, CHAPTERS, stepText, dwellOf } from '../src/lib/tutorialSteps.js';
import {
  START_CARDS, normalizeStartLayout, moveCard, resizeCard, clampLayout, MIN_CARD_W, snapBox, snapLayout, placeCard, columnStep, GRID_ROW,
} from '../src/lib/startlayout.js';
import { VIEW_PRESETS } from '../src/lib/viewer3d.js';
import { normalize } from '../src/lib/settings.js';
import { clampPopupPos } from '../src/lib/popup-pos.js';

describe('printing', () => {
  it('lays the views out on A4', () => {
    expect(gridFor(1, true)).toEqual([1, 1]);
    expect(gridFor(4, false)).toEqual([2, 2]);
    expect(gridFor(6, true)).toEqual([2, 3]);
    expect(gridFor(6, false)).toEqual([3, 2]);
    for (const layout of PRINT_LAYOUTS) {
      const shots = shotsFor(layout, resolveLandscape('auto', layout));
      expect(shots).toHaveLength(LAYOUT_VIEWS[layout].length);
      for (const s of shots) {
        expect(s.width).toBeGreaterThan(199);
        if (s.direction) expect(VIEW_PRESETS[s.direction]).toBeTruthy();
      }
    }
  });

  it('turns the sheet to suit the layout unless told', () => {
    expect(resolveLandscape('auto', 'views6')).toBe(true);
    expect(resolveLandscape('auto', 'views4')).toBe(false);
    expect(resolveLandscape('portrait', 'views6')).toBe(false);
    expect(resolveLandscape('landscape', 'views4')).toBe(true);
  });

  it('frames the sheets for the host', () => {
    const out = framePages([new Uint8Array([1, 2, 3]), new Uint8Array([9])]);
    const v = new DataView(out.buffer);
    expect(v.getUint32(0, true)).toBe(2);
    expect(v.getUint32(4, true)).toBe(3);
    expect(v.getUint32(8, true)).toBe(1);
    expect([...out.slice(12)]).toEqual([1, 2, 3, 9]);
  });

  it('keeps copies and the printer sensible', () => {
    expect(clampCopies(0)).toBe(1);
    expect(clampCopies(250)).toBe(99);
    expect(choosePrinter('gone', { printers: ['A', 'B'], default: 'B' })).toBe('B');
    expect(choosePrinter('A', { printers: ['A', 'B'], default: 'B' })).toBe('A');
    expect(choosePrinter('', { printers: [] })).toBe('');
  });

  it('remembers valid print settings only', () => {
    const s = normalize({ printLayout: 'poster', printOrientation: 'diagonal' });
    expect(s.printLayout).toBe('views4');
    expect(s.printOrientation).toBe('auto');
  });
});

describe('tutorial', () => {
  it('every step belongs to a chapter and has both languages', () => {
    const ids = new Set();
    for (const st of STEPS) {
      expect(CHAPTERS.some((c) => c.id === st.chapter)).toBe(true);
      expect(ids.has(st.id)).toBe(false);
      ids.add(st.id);
      for (const lang of ['ko', 'en']) {
        const { title, body } = stepText(st, lang);
        expect(title.length).toBeGreaterThan(1);
        expect(body.length).toBeGreaterThan(10);
      }
      expect(dwellOf(st, 'ko')).toBeGreaterThanOrEqual(4500);
    }
    // Every chapter has steps, in the chapters' order.
    const order = STEPS.map((s) => s.chapter).filter((c, i, a) => a.indexOf(c) === i);
    expect(order).toEqual(CHAPTERS.map((c) => c.id));
  });

  it('only uses known actions and existing samples', () => {
    const index = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 'index.json'), 'utf8'));
    const files = new Set(['images', 'models', 'results'].flatMap((g) => index[g].map((e) => e.file)));
    for (const st of STEPS) {
      for (const op of st.action || []) {
        const [kind, ...rest] = op.split(':');
        expect(['start', 'work', 'image', 'model', 'tab', 'panels', 'menu', 'settings', 'print', 'light']).toContain(kind);
        if (kind === 'image' || kind === 'model') expect(files.has(rest.join(':'))).toBe(true);
      }
    }
  });

  it('offers itself at start-up by default', () => {
    const s = normalize({});
    expect(s.tutorialAsk).toBe(true);
    expect(s.tutorialIndex).toBe(0);
  });
});

describe('start screen layout', () => {
  const full = Object.fromEntries(START_CARDS.map((id, i) => [id, { x: 0, y: i * 200, w: 400, h: 180 }]));

  it('keeps only complete layouts', () => {
    expect(normalizeStartLayout(null)).toBeNull();
    expect(normalizeStartLayout({ hero: full.hero })).toBeNull();
    expect(Object.keys(normalizeStartLayout(full))).toEqual(START_CARDS);
  });

  it('moves and resizes inside the board', () => {
    const moved = moveCard(full, 'how', 5000, -50, 1000);
    expect(moved.how.x).toBe(600);
    expect(resizeCard(full, 'bg', -1000, 0, 1000).bg.w).toBe(MIN_CARD_W);
    expect(clampLayout(moved, 500).how.x).toBe(100);
  });
});

describe('samples', () => {
  it('index lists files that exist', () => {
    const dir = path.join(__dirname, '..', 'samples');
    const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    expect(index.images.length).toBeGreaterThanOrEqual(5);
    expect(new Set(index.models.map((m) => m.format))).toEqual(new Set(['glb', 'gltf', 'obj', 'stl', 'ply', 'usdz']));
    for (const e of ['images', 'models', 'results'].flatMap((g) => index[g])) {
      for (const f of [e.file, ...(e.files || [])]) expect(fs.existsSync(path.join(dir, f))).toBe(true);
      expect(e.ko && e.en).toBeTruthy();
    }
  });
});

describe('context menu placement', () => {
  it('stays inside the window', () => {
    expect(clampPopupPos({ x: 990, y: 10, width: 200, height: 100, viewW: 1000, viewH: 800 }).x).toBe(794);
    expect(clampPopupPos({ x: 10, y: 790, width: 200, height: 300, viewW: 1000, viewH: 800 }).y).toBe(490);
  });
});

describe('start screen grid', () => {
  const W = 1180;
  const full = Object.fromEntries(START_CARDS.map((id, i) => [id, { x: 0, y: i * 200, w: 400, h: 180 }]));
  const onGrid = (b) => {
    const step = columnStep(W);
    return Math.abs(b.x / step - Math.round(b.x / step)) < 0.02 && b.y % GRID_ROW === 0;
  };
  const clash = (l) => START_CARDS.some((a) => START_CARDS.some((b) => a !== b
    && l[a].x < l[b].x + l[b].w && l[b].x < l[a].x + l[a].w && l[a].y < l[b].y + l[b].h && l[b].y < l[a].y + l[a].h));

  it('snaps a box to the columns and rows, at least the minimum size', () => {
    const b = snapBox({ x: 107, y: 50, w: 300, h: 20 }, W);
    expect(onGrid(b)).toBe(true);
    expect(b.w).toBeGreaterThanOrEqual(MIN_CARD_W);
    expect(b.h).toBeGreaterThanOrEqual(110);
    expect(snapBox({ x: 5000, y: -40, w: 400, h: 200 }, W).x + 400).toBeLessThanOrEqual(W + 20);
  });

  it('pushes the cards in the way down and lets them back', () => {
    const base = snapLayout(full, W);
    expect(clash(base)).toBe(false);
    // Drop "how" onto "recent": recent makes way, nothing overlaps.
    const placed = placeCard(base, 'how', { ...base.how, y: base.recent.y }, W);
    expect(placed.how.y).toBe(base.recent.y);
    expect(placed.recent.y).toBeGreaterThan(base.recent.y);
    expect(clash(placed)).toBe(false);
    // Moved off to the side again: recent is back where it was.
    const away = placeCard(base, 'how', { ...base.how, x: 800, y: 4000 }, W);
    expect(away.recent).toEqual(base.recent);
    expect(clash(away)).toBe(false);
  });

  it('a card made taller pushes the ones below it', () => {
    const base = snapLayout(full, W);
    const tall = placeCard(base, 'hero', { ...base.hero, h: 900 }, W);
    expect(tall.how.y).toBeGreaterThanOrEqual(tall.hero.y + tall.hero.h);
    expect(clash(tall)).toBe(false);
  });
});
