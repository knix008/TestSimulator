import { describe, it, expect } from 'vitest';
import {
  normalizeOutlineTitle, stripTrailingPageNumber, matchOutlineTitle,
  lineTextNearPoint, namedActionPage, outlineActiveId,
} from '../src/lib/nav.js';

describe('normalizeOutlineTitle / stripTrailingPageNumber', () => {
  it('collapses dots, bullets and whitespace and lowercases', () => {
    expect(normalizeOutlineTitle('  Chapter 1 · Intro...  ')).toBe('chapter 1 intro');
    expect(normalizeOutlineTitle('1.2\u00adTitle\u2022A')).toBe('1 2title a');
  });

  it('drops a trailing printed page number', () => {
    expect(stripTrailingPageNumber('Introduction  12')).toBe('Introduction');
    expect(stripTrailingPageNumber('Chapter 1')).toBe('Chapter');
    expect(stripTrailingPageNumber('no number')).toBe('no number');
  });
});

describe('matchOutlineTitle', () => {
  const outline = [
    { title: 'Introduction', page: 2, dest: 'intro', items: [] },
    {
      title: 'Chapter One',
      page: 5,
      dest: 'ch1',
      items: [{ title: '1.1 Details', page: 6, dest: 'd11', items: [] }],
    },
  ];

  it('matches an exact TOC line and a line with a trailing page number', () => {
    expect(matchOutlineTitle('Introduction', outline).page).toBe(2);
    expect(matchOutlineTitle('Chapter One ........ 12', outline).dest).toBe('ch1');
    expect(matchOutlineTitle('1.1 Details', outline).page).toBe(6);
  });

  it('matches when the clicked line starts with the outline title', () => {
    expect(matchOutlineTitle('Introduction — overview', outline).page).toBe(2);
  });

  it('returns null for short, empty, or unrelated lines', () => {
    expect(matchOutlineTitle('', outline)).toBe(null);
    expect(matchOutlineTitle('x', outline)).toBe(null);
    expect(matchOutlineTitle('Unrelated heading', outline)).toBe(null);
    expect(matchOutlineTitle('Introduction', [])).toBe(null);
    expect(matchOutlineTitle('Introduction', [{ title: 'Introduction', page: null }])).toBe(null);
  });
});

describe('outlineActiveId', () => {
  const outline = [
    {
      id: 'ch', title: 'Chapter', page: 5, level: 0,
      items: [
        { id: 's1', title: 'A', page: 5, level: 1, items: [] },
        { id: 's2', title: 'B', page: 5, level: 1, items: [] },
        { id: 's3', title: 'C', page: 6, level: 1, items: [] },
      ],
    },
  ];

  it('paints only the deepest entry on a page that has several headings', () => {
    expect(outlineActiveId(outline, 5)).toBe('s2');
    expect(outlineActiveId(outline, 6)).toBe('s3');
  });

  it('returns null when no entry lives on that page', () => {
    expect(outlineActiveId(outline, 1)).toBe(null);
    expect(outlineActiveId([], 5)).toBe(null);
    expect(outlineActiveId(outline, null)).toBe(null);
  });
});

describe('lineTextNearPoint', () => {
  it('joins spans on the same row, left to right', () => {
    const layer = {
      querySelectorAll: () => [
        { getAttribute: () => null, textContent: 'Two', getBoundingClientRect: () => ({ top: 40, bottom: 56, left: 80, height: 16 }) },
        { getAttribute: () => null, textContent: 'One', getBoundingClientRect: () => ({ top: 40, bottom: 56, left: 10, height: 16 }) },
        { getAttribute: () => null, textContent: 'Other', getBoundingClientRect: () => ({ top: 80, bottom: 96, left: 10, height: 16 }) },
        { getAttribute: () => 'img', textContent: 'skip', getBoundingClientRect: () => ({ top: 40, bottom: 56, left: 40, height: 16 }) },
      ],
    };
    expect(lineTextNearPoint(layer, 12, 48)).toBe('OneTwo');
    expect(lineTextNearPoint(layer, 12, 88)).toBe('Other');
    expect(lineTextNearPoint(null, 0, 0)).toBe('');
  });
});

describe('namedActionPage', () => {
  it('maps First / Last / Next / Prev', () => {
    expect(namedActionPage('FirstPage', 4, 10)).toBe(1);
    expect(namedActionPage('LastPage', 4, 10)).toBe(10);
    expect(namedActionPage('NextPage', 4, 10)).toBe(5);
    expect(namedActionPage('NextPage', 10, 10)).toBe(10);
    expect(namedActionPage('PrevPage', 4, 10)).toBe(3);
    expect(namedActionPage('PreviousPage', 1, 10)).toBe(1);
    expect(namedActionPage('GoTo', 4, 10)).toBe(null);
    expect(namedActionPage('', 4, 10)).toBe(null);
  });
});
