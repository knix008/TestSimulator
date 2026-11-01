// Start-screen cards the user moves and resizes, and "Auto arrange".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import StartScreen from '../src/components/StartScreen.jsx';
import { DEFAULT_SETTINGS, normalize } from '../src/lib/settings.js';
import {
  START_CARDS, MIN_CARD_W, MIN_CARD_H, normalizeStartLayout, measureLayout, clampLayout,
  moveCard, resizeCard, boardHeight,
} from '../src/lib/startlayout.js';

const layout = {
  hero: { x: 0, y: 0, w: 1000, h: 110 },
  begin: { x: 0, y: 126, w: 300, h: 400 },
  library: { x: 316, y: 126, w: 400, h: 450 },
  bg: { x: 732, y: 126, w: 268, h: 600 },
};

describe('start layout', () => {
  it('reads a saved layout and refuses a partial or damaged one', () => {
    expect(normalizeStartLayout(layout)).toEqual(layout);
    expect(normalizeStartLayout(null)).toBe(null);
    expect(normalizeStartLayout({ hero: layout.hero })).toBe(null);
    expect(normalizeStartLayout({ ...layout, bg: { x: 'a', y: 0, w: 1, h: 1 } })).toBe(null);
    const tiny = normalizeStartLayout({ ...layout, begin: { x: -5, y: -5, w: 10, h: 10 } });
    expect(tiny.begin).toEqual({ x: 0, y: 0, w: MIN_CARD_W, h: MIN_CARD_H });
  });

  it('is kept in the settings, automatic by default', () => {
    expect(DEFAULT_SETTINGS.startLayout).toBe(null);
    expect(normalize({}).startLayout).toBe(null);
    expect(normalize({ startLayout: layout }).startLayout).toEqual(layout);
    expect(normalize({ startLayout: 'grid' }).startLayout).toBe(null);
  });

  it('measures the cards where the grid put them', () => {
    const board = { left: 100, top: 50 };
    const rects = Object.fromEntries(START_CARDS.map((id, i) => [id, { left: 100 + i * 10, top: 60, width: 300, height: 200 }]));
    const m = measureLayout(board, rects);
    expect(m.begin).toEqual({ x: 10, y: 10, w: 300, h: 200 });
    expect(measureLayout(board, { hero: rects.hero })).toBe(null);
  });

  it('moves a card and keeps it inside the board', () => {
    const moved = moveCard(layout, 'begin', 50, 30, 1000);
    expect(moved.begin).toEqual({ x: 50, y: 156, w: 300, h: 400 });
    expect(moveCard(layout, 'begin', -500, -500, 1000).begin).toMatchObject({ x: 0, y: 0 });
    expect(moveCard(layout, 'begin', 5000, 0, 1000).begin.x).toBe(700);
    expect(moved.library).toBe(layout.library);
  });

  it('resizes a card from its corner, no smaller than the minimum and no wider than the board', () => {
    expect(resizeCard(layout, 'library', 40, 60, 1000).library).toMatchObject({ w: 440, h: 510 });
    expect(resizeCard(layout, 'library', -1000, -1000, 1000).library).toMatchObject({ w: MIN_CARD_W, h: MIN_CARD_H });
    expect(resizeCard(layout, 'library', 5000, 0, 1000).library.w).toBe(1000 - 316);
  });

  it('pulls cards back in when the window gets narrower', () => {
    const c = clampLayout(layout, 800);
    expect(c.bg.x + c.bg.w).toBeLessThanOrEqual(800);
    expect(c.hero.w).toBe(800);
  });

  it('makes the board as tall as its lowest card', () => {
    expect(boardHeight(layout)).toBe(726 + 16);
    expect(boardHeight(null)).toBe(0);
  });
});

describe('StartScreen cards', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  const renderStart = (settings, onSettings = vi.fn()) => {
    const utils = render(<StartScreen settings={{ ...DEFAULT_SETTINGS, ...settings }} entries={[]} onSettings={onSettings} />);
    return { ...utils, onSettings };
  };

  it('gives every card a move grip and a resize grip', () => {
    const { container } = renderStart({});
    for (const id of START_CARDS) {
      expect(container.querySelector(`[data-card="${id}"] [data-card-move="${id}"]`)).toBeTruthy();
      expect(container.querySelector(`[data-card="${id}"] [data-card-resize="${id}"]`)).toBeTruthy();
    }
    expect(container.querySelector('.start-board.free')).toBe(null);
  });

  it('places the cards where they were left, and Auto arrange puts them back', () => {
    const { container, onSettings } = renderStart({ startLayout: layout });
    expect(container.querySelector('.start-board.free')).toBeTruthy();
    const begin = container.querySelector('[data-card="begin"]');
    expect(begin.style.position).toBe('absolute');
    expect(begin.style.width).toBe('300px');
    const arrange = container.querySelector('[data-start-arrange]');
    expect(arrange.textContent).toContain('자동 정렬');
    fireEvent.click(arrange);
    expect(onSettings.mock.calls.at(-1)[0]()).toEqual({ startLayout: null });
  });

  it('shows Auto arrange at the top of the screen, always ready', () => {
    const { container } = renderStart({ startLayout: null });
    const arrange = container.querySelector('.start-tools [data-start-arrange]');
    expect(arrange).toBeTruthy();
    expect(arrange.disabled).toBe(false);
    // Above the board, not in the bottom bar.
    expect(arrange.compareDocumentPosition(container.querySelector('.start-board')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the move handle at the start of each title line (the intro card in its corner)', () => {
    const { container } = renderStart({});
    for (const id of ['begin', 'library', 'bg']) {
      const h2 = container.querySelector(`[data-card="${id}"] h2`);
      expect(h2.firstElementChild.matches(`[data-card-move="${id}"]`)).toBe(true);
    }
    expect(container.querySelector('[data-card="hero"] .card-handle-float [data-card-move="hero"]')).toBeTruthy();
  });
});

describe('StartScreen item menus', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  it('opens a menu for a recent row (as recent) and for a library book', () => {
    const entries = [{ path: 'C:/books/a.epub', name: 'a.epub', dir: 'C:/books', openedAt: 5, favorite: true }];
    const onEntryMenu = vi.fn();
    const { container } = render(<StartScreen settings={DEFAULT_SETTINGS} entries={entries} onEntryMenu={onEntryMenu} />);
    fireEvent.contextMenu(container.querySelector('.start-row'));
    expect(onEntryMenu).toHaveBeenLastCalledWith(expect.anything(), entries[0], { recent: true });
    fireEvent.contextMenu(container.querySelector('.start-library .book'));
    expect(onEntryMenu).toHaveBeenLastCalledWith(expect.anything(), entries[0]);
  });
});
