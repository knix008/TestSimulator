import { describe, it, expect, vi, afterEach } from 'vitest';
import { chapterFrame, elementScale, freezePage, visibleClip } from '../src/lib/freezePage.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function line(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

// jsdom's Range cannot say where text was painted. The tests stand that in.
function rangeRects() {
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () => [];
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => line(0, 0, 0, 0);
  }
}

describe('freezePage', () => {
  it('keeps a line that is on the page and drops one that is not', () => {
    const page = document.createElement('article');
    const seen = document.createElement('p');
    seen.textContent = 'The page being left';
    const later = document.createElement('p');
    later.textContent = 'The page not on screen';
    page.append(seen, later);
    document.body.append(page);
    rangeRects();

    const onPage = line(16, 40, 180, 22);
    const off = line(4000, 40, 180, 22);
    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function mockRects() {
      const text = String(this.startContainer?.textContent || '');
      if (text.includes('The page being left')) return [onPage];
      if (text.includes('The page not on screen')) return [off];
      return [];
    });
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function mockBox() {
      const list = this.getClientRects();
      return list[0] || line(0, 0, 0, 0);
    });

    const frozen = freezePage(page, {
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, scale: 1,
    });
    expect(frozen.pieces).toHaveLength(1);
    expect(frozen.pieces[0].text).toBe('The page being left');
    expect(frozen.pieces[0].left).toBe(16);
    expect(frozen.pieces[0].top).toBe(40);
    expect(frozen.pieces[0].width).toBe(180);
    expect(frozen.width).toBe(800);
  });

  it('brings a scaled page back to the page\'s own pixels', () => {
    const page = document.createElement('p');
    page.textContent = 'Zoomed line';
    document.body.append(page);
    rangeRects();
    const painted = line(50, 50, 100, 20);
    vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([painted]);
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(painted);

    const frozen = freezePage(page, {
      left: 10, top: 20, right: 810, bottom: 620, width: 400, height: 300, scale: 2,
    });
    expect(frozen.pieces[0]).toMatchObject({ left: 20, top: 15, width: 50, height: 10 });
  });

  it('has nothing to hold when the page has not been laid out', () => {
    const page = document.createElement('p');
    page.textContent = 'Unread';
    document.body.append(page);
    expect(freezePage(page, null)).toBeNull();
    expect(freezePage(page, { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, scale: 1 })).toBeNull();
  });

  it('reads the pane from its own size, and the chapter box when it has one', () => {
    const pane = document.createElement('div');
    document.body.append(pane);
    expect(visibleClip(pane)).toBeNull();
    Object.defineProperty(pane, 'clientWidth', { value: 720 });
    Object.defineProperty(pane, 'clientHeight', { value: 780 });
    const clip = visibleClip(pane);
    expect(clip.width).toBe(720);
    expect(clip.height).toBe(780);
    expect(elementScale(pane)).toBe(1);

    const chapter = document.createElement('article');
    document.body.append(chapter);
    expect(chapterFrame(chapter)).toBeNull();
    Object.defineProperty(chapter, 'offsetWidth', { value: 720 });
    Object.defineProperty(chapter, 'offsetHeight', { value: 780 });
    expect(chapterFrame(chapter)).toMatchObject({ width: 720, height: 780 });
  });
});
