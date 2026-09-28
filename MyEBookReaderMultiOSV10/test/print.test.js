import { describe, it, expect, vi } from 'vitest';
import {
  PAPER_SIZES, paperById, paperSizeMm, buildPrintHtml, buildImagePrintHtml,
  chaptersForPrint, previewScale, inlineImages, PRINT_CSS,
} from '../src/lib/print.js';

describe('paper sizes', () => {
  it('offers the usual sizes', () => {
    expect(PAPER_SIZES.map((p) => p.id)).toContain('A4');
    expect(PAPER_SIZES.map((p) => p.id)).toContain('Letter');
  });

  it('defaults to A4 for an unknown id', () => {
    expect(paperById('nope').id).toBe('A4');
  });

  it('swaps the sides for landscape', () => {
    expect(paperSizeMm('A4', false)).toEqual([210, 297]);
    expect(paperSizeMm('A4', true)).toEqual([297, 210]);
  });
});

describe('buildPrintHtml', () => {
  const chapters = [
    { label: '1. First', html: '<p>one</p>' },
    { label: '2. Second', html: '<p>two</p>' },
  ];

  it('puts the paper size and the margin in an @page rule', () => {
    const html = buildPrintHtml({ chapters, paper: 'A5', marginMm: 20 });
    expect(html).toContain('@page { size: 148mm 210mm; margin: 20mm; }');
  });

  it('honours landscape', () => {
    expect(buildPrintHtml({ chapters, paper: 'A4', landscape: true })).toContain('size: 297mm 210mm');
  });

  it('breaks the page between chapters', () => {
    const html = buildPrintHtml({ chapters });
    expect(html.match(/class="chapter"/g)).toHaveLength(2);
    expect(PRINT_CSS).toContain('page-break-after: always');
  });

  it('prints the chapter titles, or leaves them out', () => {
    expect(buildPrintHtml({ chapters })).toContain('1. First');
    expect(buildPrintHtml({ chapters, showTitles: false })).not.toContain('1. First');
  });

  it('applies the reading font and size to the printed text', () => {
    const html = buildPrintHtml({ chapters, fontFamily: 'Nanum Myeongjo', fontSize: 14, lineHeight: 1.8 });
    expect(html).toContain("'Nanum Myeongjo'");
    expect(html).toContain('font-size: 14pt');
    expect(html).toContain('line-height: 1.8');
  });

  it('escapes the document title', () => {
    expect(buildPrintHtml({ chapters, title: '<script>x</script>' })).not.toContain('<script>');
  });

  it('clamps an absurd margin', () => {
    expect(buildPrintHtml({ chapters, marginMm: 999 })).toContain('margin: 40mm');
  });
});

describe('buildImagePrintHtml', () => {
  it('makes one full-page sheet per image', () => {
    const html = buildImagePrintHtml({ images: ['data:1', 'data:2'], paper: 'Letter' });
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html).toContain('size: 215.9mm 279.4mm');
  });

  it('sizes the sheet to the printable area', () => {
    expect(buildImagePrintHtml({ images: ['data:1'], paper: 'A4', marginMm: 10 }))
      .toContain('height: calc(297mm - 20mm)');
  });
});

describe('chaptersForPrint', () => {
  it('collects the chosen sections in order', () => {
    const book = { sections: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] };
    const rows = chaptersForPrint(book, [1, 3], (index) => ({ html: `<p>${index}</p>` }));
    expect(rows).toEqual([
      { label: '1. a', html: '<p>0</p>' },
      { label: '3. c', html: '<p>2</p>' },
    ]);
  });

  it('skips a page the book does not have', () => {
    const book = { sections: [{ label: '1' }] };
    expect(chaptersForPrint(book, [5], () => ({ html: '' }))).toEqual([]);
  });

  it('does not repeat a numeric label', () => {
    const book = { sections: [{ label: '1' }] };
    expect(chaptersForPrint(book, [1], () => ({ html: 'x' }))[0].label).toBe('1');
  });
});

describe('previewScale', () => {
  it('fits the sheet into the preview box', () => {
    expect(previewScale({ paper: 'A4', landscape: false, boxWidth: 210, boxHeight: 297 })).toBeCloseTo(1, 5);
    expect(previewScale({ paper: 'A4', landscape: false, boxWidth: 105, boxHeight: 297 })).toBeCloseTo(0.5, 5);
  });
});

describe('inlineImages', () => {
  it('leaves html without blob URLs alone', async () => {
    expect(await inlineImages('<p><img src="data:image/png;base64,AA"></p>'))
      .toBe('<p><img src="data:image/png;base64,AA"></p>');
  });

  it('converts a blob URL into a data URL', async () => {
    // A blob URL belongs to the window that made it, so printing — which happens
    // in another window — needs the bytes inline.
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    globalThis.fetch = vi.fn(async () => ({ blob: async () => blob }));
    const out = await inlineImages('<img src="blob:test/1"><img src="blob:test/1">');
    expect(out).not.toContain('blob:');
    expect(out.match(/data:image\/png/g)).toHaveLength(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);   // fetched once, reused
  });

  it('keeps going when one picture cannot be read', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('gone'); });
    const out = await inlineImages('<img src="blob:test/x">');
    expect(out).toContain('blob:test/x');
  });
});
