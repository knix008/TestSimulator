import { describe, it, expect } from 'vitest';
import {
  commentKind, isCommentAnnotation, annotText, annotAuthor, annotColor,
  viewportRect, normalizeQuadGroups, quadsToRects, commentCardPos,
  normalizeComment, workspaceNoteToComment, workspaceAttachmentToComment,
  isWorkspaceComment,
  commentAnchorY, listWorkspaceComments, commentPreview, mergeCommentList,
} from '../src/lib/comments.js';

describe('comment classification', () => {
  it('maps pdf.js types and subtypes, skipping links and widgets', () => {
    expect(commentKind({ annotationType: 9 })).toBe('highlight');
    expect(commentKind({ subtype: 'FreeText' })).toBe('freetext');
    expect(isCommentAnnotation({ annotationType: 9 })).toBe(true);
    expect(isCommentAnnotation({ annotationType: 2 })).toBe(false);
    expect(isCommentAnnotation({ subtype: 'Link' })).toBe(false);
    expect(isCommentAnnotation({ annotationType: 20 })).toBe(false);
  });

  it('reads author and contents from the usual pdf.js fields', () => {
    expect(annotText({ contentsObj: { str: '  hello  ' } })).toBe('hello');
    expect(annotText({ contents: 'a\nnote' })).toBe('a note');
    expect(annotAuthor({ titleObj: { str: 'Kim' } })).toBe('Kim');
    expect(annotAuthor({ title: 'Lee' })).toBe('Lee');
  });

  it('turns a colour triple into rgba, including 0..1 channels', () => {
    expect(annotColor([1, 1, 0])).toBe('rgba(255, 255, 0, 0.42)');
    expect(annotColor([255, 0, 0])).toBe('rgba(255, 0, 0, 0.42)');
    expect(annotColor(null, 'rgba(1,2,3,0.4)')).toBe('rgba(1,2,3,0.4)');
  });
});

describe('rects', () => {
  const flip = (r) => [r[0], 800 - r[3], r[2], 800 - r[1]];

  it('normalises a PDF rectangle through the viewport converter', () => {
    expect(viewportRect([10, 700, 40, 730], flip)).toEqual({ x: 10, y: 70, width: 30, height: 30 });
  });

  it('accepts flat, grouped and point-list quadPoints', () => {
    expect(normalizeQuadGroups([0, 0, 10, 0, 0, 4, 10, 4])).toEqual([[0, 0, 10, 0, 0, 4, 10, 4]]);
    expect(normalizeQuadGroups([[0, 0, 10, 0, 0, 4, 10, 4]])).toHaveLength(1);
    expect(normalizeQuadGroups([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 4 }, { x: 10, y: 4 },
    ])).toEqual([[0, 0, 10, 0, 0, 4, 10, 4]]);
    expect(quadsToRects([0, 0, 10, 0, 0, 4, 10, 4])[0]).toMatchObject({ x: 0, y: 0, width: 10, height: 4 });
  });

  it('parks the comment card beside the mark without leaving the page', () => {
    const beside = commentCardPos({ x: 10, y: 20, width: 40, height: 12 }, 400, 600);
    expect(beside.left).toBeGreaterThan(50);
    const flipped = commentCardPos({ x: 350, y: 20, width: 40, height: 12 }, 400, 600);
    expect(flipped.left).toBeLessThan(350);
  });
});

describe('normalizeComment / workspace notes', () => {
  it('keeps the marked region and the written text together', () => {
    const c = normalizeComment({
      annotationType: 9,
      subtype: 'Highlight',
      id: 'h1',
      rect: [0, 0, 20, 8],
      contents: 'look here',
      title: 'Ada',
      color: [1, 1, 0],
    });
    expect(c).toMatchObject({ id: 'h1', kind: 'highlight', text: 'look here', author: 'Ada' });
    expect(c.rects[0].width).toBe(20);
  });

  it('drops links and empty stamps', () => {
    expect(normalizeComment({ annotationType: 2, dest: 'x', rect: [0, 0, 1, 1] })).toBe(null);
    expect(normalizeComment({ annotationType: 13, subtype: 'Stamp', rect: [0, 0, 1, 1] })).toBe(null);
  });

  it('converts a workspace note into the same on-page shape', () => {
    const c = workspaceNoteToComment({
      id: 'n1', kind: 'note', text: 'memo',
      rects: [{ x: 0.1, y: 0.2, w: 0.2, h: 0.05 }],
    }, 200, 400);
    expect(c.text).toBe('memo');
    expect(c.rects[0]).toEqual({ x: 20, y: 80, width: 40, height: 20 });
  });

  it('lists workspace notes for the left comments tool, in page order', () => {
    expect(isWorkspaceComment({ kind: 'note' })).toBe(true);
    expect(isWorkspaceComment({ kind: 'highlight' })).toBe(false);
    expect(commentAnchorY({ rect: { y: 0.4 } })).toBe(0.4);
    expect(commentPreview({ text: '  a   long   note  ' })).toBe('a long note');
    const listed = listWorkspaceComments([
      { id: 'h', kind: 'highlight', page: 1, text: 'mark' },
      { id: 'n2', kind: 'note', page: 3, text: 'later', rect: { y: 0.1 } },
      { id: 'n1', kind: 'note', page: 1, text: 'first', rect: { y: 0.8 } },
    ]);
    expect(listed.map((c) => c.id)).toEqual(['n1', 'n2']);
  });

  it('merges PDF comments with workspace notes and prefers fracY for jumping', () => {
    expect(commentAnchorY({ fracY: 0.22, rect: { y: 0.9 } })).toBe(0.22);
    const merged = mergeCommentList(
      [{ id: 'H1', page: 2, text: 'check this', fracY: 0.3 }],
      [{ id: 'n1', kind: 'note', page: 1, text: 'mine', rect: { y: 0.5 } }],
    );
    expect(merged.map((c) => c.id)).toEqual(['n1', 'H1']);
    expect(merged[0]).toMatchObject({ source: 'workspace', removable: true, fracY: 0.5 });
    expect(merged[1]).toMatchObject({ source: 'pdf', removable: false, fracY: 0.3 });
  });

  it('keeps a PDF file attachment even without a written note', () => {
    const c = normalizeComment({
      annotationType: 17,
      subtype: 'FileAttachment',
      id: 'f1',
      rect: [10, 10, 28, 28],
      file: { filename: 'brief.pdf' },
    });
    expect(c).toMatchObject({ kind: 'fileattachment', filename: 'brief.pdf', text: 'brief.pdf' });
  });

  it('turns a workspace attachment into an on-page mark', () => {
    const c = workspaceAttachmentToComment({ id: 'a1', name: 'scan.png', y: 0.25 }, 200, 400);
    expect(c.kind).toBe('fileattachment');
    expect(c.text).toBe('scan.png');
    expect(c.rects[0].y).toBeCloseTo(100);
  });
});
