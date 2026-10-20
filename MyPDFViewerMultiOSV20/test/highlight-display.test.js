// How highlights saved into a PDF are shown when the file is opened again.
import { describe, it, expect } from 'vitest';
import { showsCommentCard, commentMarkFill, isMarkupKind, normalizeComment } from '../src/lib/comments.js';
import { droppedPaths } from '../src/lib/platform.js';

const saved = {
  id: 'pdf-1',
  kind: 'highlight',
  text: 'Line 3: The quick brown fox',
  author: 'MyPDFViewer',
  color: 'rgba(255, 214, 0, 0.42)',
};

describe('highlights read back from the PDF', () => {
  it('do not keep a card open over the next lines', () => {
    expect(showsCommentCard(saved, null)).toBe(false);
    expect(showsCommentCard(saved, 'other')).toBe(false);
  });

  it('show their card while picked in the comments panel', () => {
    expect(showsCommentCard(saved, 'pdf-1')).toBe(true);
  });

  it('are painted once, by the page canvas, not again by the overlay', () => {
    expect(commentMarkFill(saved)).toBe('transparent');
    for (const kind of ['underline', 'squiggly', 'strikeout']) {
      expect(isMarkupKind(kind)).toBe(true);
      expect(commentMarkFill({ ...saved, kind })).toBe('transparent');
    }
  });

  it('leave sticky notes and other comments as they were', () => {
    const note = { id: 'n1', kind: 'text', text: 'Check this', author: 'Kim', color: 'rgba(1,2,3,0.4)' };
    expect(showsCommentCard(note, null)).toBe(true);
    expect(commentMarkFill(note)).toBe('rgba(1,2,3,0.4)');
    expect(showsCommentCard({ id: 'x', kind: 'text', text: '', author: '' }, null)).toBe(false);
    expect(showsCommentCard(null, null)).toBe(false);
  });

  it('are recognised as highlight comments with their text and author', () => {
    const c = normalizeComment({
      id: '12R',
      subtype: 'Highlight',
      annotationType: 9,
      color: new Uint8ClampedArray([255, 214, 0]),
      contentsObj: { str: 'Line 3: The quick brown fox' },
      titleObj: { str: 'MyPDFViewer' },
      quadPoints: [[{ x: 10, y: 50 }, { x: 110, y: 50 }, { x: 10, y: 40 }, { x: 110, y: 40 }].flatMap((p) => [p.x, p.y])],
      rect: [10, 40, 110, 50],
    }, { id: 'pdf-1' });
    expect(c.kind).toBe('highlight');
    expect(c.text).toBe('Line 3: The quick brown fox');
    expect(showsCommentCard(c, null)).toBe(false);
  });
});

describe('files dropped from the file manager', () => {
  it('keeps real paths in order, once each', () => {
    expect(droppedPaths(['C:\\a.pdf', '', 'C:\\b.pdfvw', 'C:\\a.pdf', 3, null, '  '])).toEqual(['C:\\a.pdf', 'C:\\b.pdfvw']);
    expect(droppedPaths(undefined)).toEqual([]);
  });
});
