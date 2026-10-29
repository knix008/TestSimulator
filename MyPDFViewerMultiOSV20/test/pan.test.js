// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  PAN_CLICK_SLOP, canPanView, panScrollTo, panMoved, textAtPoint, isBackgroundPanTarget,
} from '../src/lib/pan.js';

describe('canPanView', () => {
  it('pans when the sheet is wider than the pane', () => {
    expect(canPanView({ scrollWidth: 1400, clientWidth: 900, clientHeight: 700 }, [600])).toBe(true);
  });
  it('pans when a page is taller than the pane', () => {
    expect(canPanView({ scrollWidth: 900, clientWidth: 900, clientHeight: 700 }, [500, 1200])).toBe(true);
  });
  it('does not pan a fitted page, even in a long continuous document', () => {
    expect(canPanView({ scrollWidth: 900, clientWidth: 900, clientHeight: 700 }, [690, 690, 690])).toBe(false);
    expect(canPanView({ scrollWidth: 901, clientWidth: 900, clientHeight: 700 }, [701])).toBe(false);
    expect(canPanView()).toBe(false);
  });
});

describe('panScrollTo / panMoved', () => {
  const start = { x: 100, y: 100, scrollLeft: 500, scrollTop: 300 };
  it('moves the content with the hand', () => {
    expect(panScrollTo(start, 140, 80)).toEqual({ left: 460, top: 320 });
  });
  it('treats a tiny wobble as a click', () => {
    expect(panMoved(start, 100 + PAN_CLICK_SLOP, 100 - PAN_CLICK_SLOP)).toBe(false);
    expect(panMoved(start, 100 + PAN_CLICK_SLOP + 1, 100)).toBe(true);
  });
});

describe('textAtPoint', () => {
  const layerWith = (rects) => {
    const layer = document.createElement('div');
    for (const r of rects) {
      const span = document.createElement('span');
      span.textContent = r.text ?? 'abc';
      if (r.cls) span.className = r.cls;
      span.getBoundingClientRect = () => ({
        left: r.x, top: r.y, right: r.x + r.w, bottom: r.y + r.h, width: r.w, height: r.h,
      });
      layer.append(span);
    }
    return layer;
  };

  it('finds a run of text under the pointer, with a little slack', () => {
    const layer = layerWith([{ x: 50, y: 50, w: 100, h: 12 }]);
    expect(textAtPoint(layer, 60, 55)).toBe(true);
    expect(textAtPoint(layer, 48, 55)).toBe(true);
    expect(textAtPoint(layer, 60, 90)).toBe(false);
  });
  it('ignores marked-content wrappers, empty and zero-size spans', () => {
    const layer = layerWith([
      { x: 0, y: 0, w: 500, h: 500, cls: 'markedContent' },
      { x: 0, y: 0, w: 500, h: 500, text: '' },
      { x: 10, y: 10, w: 0, h: 0 },
    ]);
    expect(textAtPoint(layer, 10, 10)).toBe(false);
    expect(textAtPoint(null, 0, 0)).toBe(false);
  });
});

describe('isBackgroundPanTarget', () => {
  document.body.innerHTML = `
    <div class="pageview"><div class="pagestack" id="stack">
      <div class="page"><canvas id="canvas"></canvas><a class="pdf-link" id="link"></a></div>
      <button id="btn"></button>
    </div></div>`;
  const $ = (id) => document.getElementById(id);

  it('pans from the grey around the pages', () => {
    expect(isBackgroundPanTarget($('stack'))).toBe(true);
  });
  it('leaves the page itself and controls alone', () => {
    expect(isBackgroundPanTarget($('canvas'))).toBe(false);
    expect(isBackgroundPanTarget($('link'))).toBe(false);
    expect(isBackgroundPanTarget($('btn'))).toBe(false);
    expect(isBackgroundPanTarget(null)).toBe(false);
  });
});
