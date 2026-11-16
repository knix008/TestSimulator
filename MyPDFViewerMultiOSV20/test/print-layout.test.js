import { describe, it, expect } from 'vitest';
import {
  PAPERS, PRINT_OPTION_DEFAULTS, normalizePrintOptions, clampScalePercent, applySubset, paperSize, contentBox,
  gridFor, sheetCells, placePage, resolveOrientation, planSheets, printPlan, layoutSheet, cssPageSize, MM_PER_PT,
} from '../src/lib/print-layout.js';
import { buildPrintHtml } from '../src/lib/print-html.js';
import { normalize, DEFAULT_SETTINGS } from '../src/lib/settings.js';

const A4_ASPECT = 210 / 297;
const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('page setup values', () => {
  it('falls back to the defaults for anything unknown', () => {
    expect(normalizePrintOptions(null)).toEqual(PRINT_OPTION_DEFAULTS);
    expect(normalizePrintOptions([1])).toEqual(PRINT_OPTION_DEFAULTS);
    expect(normalizePrintOptions({ paper: 'x', margin: 'huge', perSheet: 3, scaleMode: 'zoom', subset: 'some', color: 'red' }))
      .toEqual(PRINT_OPTION_DEFAULTS);
    expect(normalizePrintOptions({ paper: 'legal', perSheet: '6', scalePercent: '250' }))
      .toMatchObject({ paper: 'legal', perSheet: 6, scalePercent: 250 });
  });

  it('keeps the percent between 10 and 400', () => {
    expect(clampScalePercent(5)).toBe(10);
    expect(clampScalePercent(1000)).toBe(400);
    expect(clampScalePercent('abc')).toBe(100);
    expect(clampScalePercent(87.6)).toBe(88);
  });

  it('is kept in the settings', () => {
    expect(DEFAULT_SETTINGS.printOptions).toEqual(PRINT_OPTION_DEFAULTS);
    expect(normalize({ printOptions: { paper: 'a3', margin: 'bad' } }).printOptions).toMatchObject({ paper: 'a3', margin: 'normal' });
    expect(normalize({ printOrientation: 'sideways' }).printOrientation).toBe('auto');
  });
});

describe('odd and even pages', () => {
  it('filters by page number', () => {
    expect(applySubset([1, 2, 3, 4, 5], 'odd')).toEqual([1, 3, 5]);
    expect(applySubset([1, 2, 3, 4, 5], 'even')).toEqual([2, 4]);
    expect(applySubset([3, 8], 'all')).toEqual([3, 8]);
  });
});

describe('paper', () => {
  it('knows the sizes and turns them for landscape', () => {
    expect(paperSize('a4')).toEqual({ w: 210, h: 297 });
    expect(paperSize('a4', true)).toEqual({ w: 297, h: 210 });
    expect(paperSize('letter')).toEqual(PAPERS.letter);
    expect(paperSize('nope')).toEqual({ w: 210, h: 297 });
  });

  it('takes the margins off every side', () => {
    expect(contentBox('a4', false, 'normal')).toEqual({ x: 10, y: 10, w: 190, h: 277 });
    expect(contentBox('a4', true, 'none')).toEqual({ x: 0, y: 0, w: 297, h: 210 });
    expect(contentBox('a5', false, 'wide')).toEqual({ x: 20, y: 20, w: 108, h: 170 });
  });

  it('gives the browser the paper size', () => {
    expect(cssPageSize({ w: 210, h: 297 })).toBe('210mm 297mm');
    expect(cssPageSize({ w: 279.4, h: 215.9 })).toBe('279.4mm 215.9mm');
    const html = buildPrintHtml([{ src: 'a.jpg' }], 'x', { pageSize: '210mm 297mm' });
    expect(html).toContain('@page { size: 210mm 297mm; margin: 0; }');
    expect(buildPrintHtml([{ src: 'a.jpg' }], 'x')).toContain('@page { size: auto; margin: 8mm; }');
  });
});

describe('pages per sheet', () => {
  const box = { w: 190, h: 277 };

  it('picks the split where the pages come out largest', () => {
    expect(gridFor(1, box, A4_ASPECT)).toEqual({ cols: 1, rows: 1 });
    expect(gridFor(2, box, A4_ASPECT)).toEqual({ cols: 1, rows: 2 });
    expect(gridFor(4, box, A4_ASPECT)).toEqual({ cols: 2, rows: 2 });
    expect(gridFor(6, box, A4_ASPECT)).toEqual({ cols: 2, rows: 3 });
    expect(gridFor(9, box, A4_ASPECT)).toEqual({ cols: 3, rows: 3 });
    // Two landscape pages on a portrait sheet stand one above the other.
    expect(gridFor(2, box, 297 / 210)).toEqual({ cols: 1, rows: 2 });
    // Two portrait pages on a landscape sheet stand side by side.
    expect(gridFor(2, { w: 277, h: 190 }, A4_ASPECT)).toEqual({ cols: 2, rows: 1 });
  });

  it('lays the cells out in reading order with a gap between them', () => {
    const { cells } = sheetCells({ paper: 'a4', landscape: false, margin: 'normal', perSheet: 4, aspect: A4_ASPECT });
    expect(cells).toHaveLength(4);
    expect(cells[0]).toMatchObject({ x: 10, y: 10 });
    close(cells[1].x, 10 + cells[0].w + 4);
    close(cells[2].y, 10 + cells[0].h + 4);
    close(cells[3].x + cells[3].w, 200);
    close(cells[3].y + cells[3].h, 287);
  });

  it('splits the pages into sheets', () => {
    expect(planSheets([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(planSheets([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
    expect(planSheets([], 4)).toEqual([]);
  });
});

describe('scale', () => {
  const cell = { x: 10, y: 10, w: 190, h: 277 };

  it('fits the page to the cell, centred', () => {
    // A4 in a 190 × 277 box: the width is what limits it.
    const p = placePage(cell, 210, 297, { scaleMode: 'fit' });
    close(p.w, 190);
    close(p.x, 10);
    close(p.y + p.h / 2, 148.5);
  });

  it('prints at the real size or a chosen percent, centred and cut at the cell', () => {
    const actual = placePage(cell, 100, 100, { scaleMode: 'actual' });
    expect(actual).toMatchObject({ w: 100, h: 100, scale: 1, x: 55, y: 98.5 });
    const half = placePage(cell, 100, 100, { scaleMode: 'custom', scalePercent: 50 });
    expect(half).toMatchObject({ w: 50, h: 50, scale: 0.5 });
    const big = placePage(cell, 300, 300, { scaleMode: 'actual' });
    expect(big.x).toBeLessThan(cell.x);
    expect(big.clip).toEqual(cell);
  });
});

describe('orientation', () => {
  it('follows the choice, or picks what fits the pages for auto', () => {
    expect(resolveOrientation('landscape', {})).toBe(true);
    expect(resolveOrientation('portrait', { aspect: 2 })).toBe(false);
    expect(resolveOrientation('auto', { aspect: A4_ASPECT })).toBe(false);
    expect(resolveOrientation('auto', { aspect: 297 / 210 })).toBe(true);
    expect(resolveOrientation('auto', { aspect: A4_ASPECT, perSheet: 2 })).toBe(true);
    expect(resolveOrientation('auto', { aspect: A4_ASPECT, perSheet: 4 })).toBe(false);
  });
});

describe('the plan', () => {
  it('applies odd/even, splits into sheets and sizes the paper', () => {
    const plan = printPlan({ pages: [1, 2, 3, 4, 5, 6], options: { subset: 'odd', perSheet: 2, paper: 'a5' }, orientation: 'auto', aspect: A4_ASPECT });
    expect(plan.pages).toEqual([1, 3, 5]);
    expect(plan.sheets).toEqual([[1, 3], [5]]);
    expect(plan.landscape).toBe(true);
    expect(plan.paper).toEqual({ w: 210, h: 148 });
  });

  it('places each page of a sheet from its size in points', () => {
    const plan = printPlan({ pages: [1, 2], options: { perSheet: 2, margin: 'none' }, orientation: 'landscape', aspect: A4_ASPECT });
    const placed = layoutSheet(plan, [1, 2], [{ w: 595.28, h: 841.89 }, { w: 595.28, h: 841.89 }]);
    expect(placed.map((p) => p.page)).toEqual([1, 2]);
    // Side by side on landscape A4, each as wide as half the paper less the gap.
    close(placed[0].w, (297 - 4) / 2);
    expect(placed[1].x).toBeGreaterThan(placed[0].x + placed[0].w);
    expect(MM_PER_PT * 72).toBeCloseTo(25.4);
  });
});
