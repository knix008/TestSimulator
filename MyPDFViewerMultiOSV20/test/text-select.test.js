import { describe, it, expect } from 'vitest';
import {
  MIN_TEXT_DRAG, normalizeClientBox, isTextDrag, spanHitsBox, joinSpanText,
  collectSpansInBox, nearestSpanRange, boxToLayerRect, dragPageRect,
  inflateBox, hitBoxForDrag, caretOffsetAtX, applyStreamSelection,
} from '../src/lib/text-select.js';

describe('boxToLayerRect', () => {
  it('maps a client box into the text layer', () => {
    expect(boxToLayerRect(
      { left: 120, top: 80, width: 40, height: 20 },
      { left: 100, top: 50 },
    )).toEqual({ left: 20, top: 30, width: 40, height: 20 });
    expect(boxToLayerRect(null, { left: 0, top: 0 })).toBe(null);
  });
});

describe('normalizeClientBox / isTextDrag', () => {
  it('orders a drag drawn in any direction', () => {
    expect(normalizeClientBox(20, 30, 10, 12)).toEqual({
      left: 10, top: 12, right: 20, bottom: 30, width: 10, height: 18,
    });
  });

  it('rejects a click-sized drag', () => {
    expect(isTextDrag(normalizeClientBox(5, 5, 6, 6))).toBe(false);
    expect(isTextDrag(normalizeClientBox(0, 0, MIN_TEXT_DRAG, MIN_TEXT_DRAG))).toBe(true);
  });

  it('accepts a flat swipe along a line', () => {
    expect(isTextDrag(normalizeClientBox(10, 20, 80, 22))).toBe(true);
    expect(isTextDrag(normalizeClientBox(10, 20, 12, 80))).toBe(true);
  });
});

describe('dragPageRect / inflateBox / hitBoxForDrag', () => {
  it('builds one page-local rectangle from any drag direction', () => {
    expect(dragPageRect(40, 30, 10, 12)).toEqual({ left: 10, top: 12, width: 30, height: 18 });
  });

  it('grows only the thin side of a drag for hit-testing', () => {
    const box = { left: 10, top: 20, right: 90, bottom: 23, width: 80, height: 3 };
    expect(inflateBox(box, 0, 10)).toEqual({
      left: 10, top: 10, right: 90, bottom: 33, width: 80, height: 23,
    });
    const hit = hitBoxForDrag(box);
    expect(hit.top).toBeLessThan(box.top);
    expect(hit.left).toBe(box.left);
    expect(hitBoxForDrag({ left: 0, top: 0, right: 80, bottom: 60, width: 80, height: 60 })).toEqual({
      left: 0, top: 0, right: 80, bottom: 60, width: 80, height: 60,
    });
  });
});

describe('spanHitsBox', () => {
  const word = { left: 100, top: 40, right: 160, bottom: 56, width: 60, height: 16 };

  it('selects a span whose centre sits in the box', () => {
    expect(spanHitsBox(word, { left: 120, top: 30, right: 200, bottom: 80 })).toBe(true);
  });

  it('ignores a span that is only nicked at the corner', () => {
    expect(spanHitsBox(word, { left: 158, top: 54, right: 200, bottom: 90 })).toBe(false);
  });

  it('selects a span that is mostly covered even if the centre is just out', () => {
    const box = { left: 100, top: 40, right: 155, bottom: 56 };
    expect(spanHitsBox(word, box)).toBe(true);
  });

  it('rejects empty inputs', () => {
    expect(spanHitsBox(null, word)).toBe(false);
    expect(spanHitsBox(word, null)).toBe(false);
  });
});

describe('joinSpanText', () => {
  const line = (left, text, top = 10) => ({
    text,
    r: { left, right: left + text.length * 8, top, bottom: top + 14, height: 14, width: text.length * 8 },
  });

  it('concatenates a tight English run with spaces at word gaps', () => {
    const hits = [line(0, 'Hello'), line(50, 'World')];
    expect(joinSpanText(hits)).toBe('Hello World');
  });

  it('does not insert a space between adjacent CJK runs', () => {
    const hits = [
      { text: '한글', r: { left: 0, right: 32, top: 10, bottom: 24, height: 14, width: 32 } },
      { text: '문서', r: { left: 33, right: 65, top: 10, bottom: 24, height: 14, width: 32 } },
    ];
    expect(joinSpanText(hits)).toBe('한글문서');
  });

  it('inserts a newline when the next span is on another line', () => {
    const hits = [line(0, 'one', 10), line(0, 'two', 40)];
    expect(joinSpanText(hits)).toBe('one\ntwo');
  });

  it('keeps an existing trailing space', () => {
    expect(joinSpanText([line(0, 'Hello '), line(56, 'World')])).toBe('Hello World');
  });

  it('returns empty for no hits', () => {
    expect(joinSpanText([])).toBe('');
  });
});

function fakeSpan(text, box) {
  const span = document.createElement('span');
  span.textContent = text;
  span.getBoundingClientRect = () => ({
    left: box.left, top: box.top, right: box.right, bottom: box.bottom,
    width: box.right - box.left, height: box.bottom - box.top,
    x: box.left, y: box.top, toJSON() { return this; },
  });
  return span;
}

describe('collectSpansInBox / nearestSpanRange', () => {
  it('returns only the spans whose boxes sit in the drag rectangle', () => {
    const layer = document.createElement('div');
    layer.append(
      fakeSpan('keep', { left: 10, top: 10, right: 50, bottom: 24 }),
      fakeSpan('skip', { left: 200, top: 10, right: 240, bottom: 24 }),
      fakeSpan('also', { left: 12, top: 30, right: 48, bottom: 44 }),
    );
    const hits = collectSpansInBox(layer, { left: 0, top: 0, right: 80, bottom: 50 });
    expect(hits.map((h) => h.text)).toEqual(['keep', 'also']);
  });

  it('skips image role spans and empty ones', () => {
    const layer = document.createElement('div');
    const img = fakeSpan(' ', { left: 10, top: 10, right: 40, bottom: 24 });
    img.setAttribute('role', 'img');
    img.textContent = 'xx';
    layer.append(img, fakeSpan('', { left: 10, top: 10, right: 40, bottom: 24 }));
    expect(collectSpansInBox(layer, { left: 0, top: 0, right: 80, bottom: 80 })).toEqual([]);
  });

  it('places the caret on the nearest span when the click is in a gap', () => {
    const layer = document.createElement('div');
    layer.append(fakeSpan('Hello', { left: 10, top: 10, right: 80, bottom: 26 }));
    document.body.append(layer);
    const range = nearestSpanRange(layer, 200, 12);
    expect(range).toBeTruthy();
    expect(range.startContainer.textContent).toBe('Hello');
    layer.remove();
  });
});

describe('caretOffsetAtX / applyStreamSelection', () => {
  it('picks the column whose glyph edge is closest to x', () => {
    const span = document.createElement('span');
    span.textContent = 'Hello';
    document.body.append(span);
    const orig = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const i = this.startOffset;
      return { left: 10 + i * 8, top: 0, right: 10 + i * 8, bottom: 14, width: 0, height: 14 };
    };
    expect(caretOffsetAtX(span, 10)).toBe(0);
    expect(caretOffsetAtX(span, 26)).toBe(2);
    expect(caretOffsetAtX(span, 50)).toBe(5);
    Range.prototype.getBoundingClientRect = orig;
    span.remove();
  });

  it('selects from a start column to an end column in either direction', () => {
    const p = document.createElement('div');
    p.textContent = 'abcdef';
    document.body.append(p);
    const node = p.firstChild;
    expect(applyStreamSelection({ node, offset: 1 }, { node, offset: 4 })).toBe(true);
    expect(window.getSelection().toString()).toBe('bcd');
    expect(applyStreamSelection({ node, offset: 5 }, { node, offset: 2 })).toBe(true);
    expect(window.getSelection().toString()).toBe('cde');
    p.remove();
  });
});
