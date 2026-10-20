import { describe, it, expect } from 'vitest';
import {
  WORKSPACE_EXT, WORKSPACE_FORMAT, WORKSPACE_VERSION,
  serializeWorkspace, parseWorkspace, isWorkspacePath, bytesToText, looksLikePdf,
} from '../src/lib/workspace.js';
import { buildPdf, pdfWithJunkPrefix } from './fixtures/pdf.js';

describe('workspace constants', () => {
  it('uses the .pdfvw extension and format name', () => {
    expect(WORKSPACE_EXT).toBe('pdfvw');
    expect(WORKSPACE_FORMAT).toBe('mypdfviewer-workspace');
    expect(WORKSPACE_VERSION).toBe(1);
  });
});

describe('serializeWorkspace / parseWorkspace', () => {
  const sample = {
    file: { path: 'C:/Docs/report.pdf', name: 'report.pdf', size: 123456 },
    page: 3,
    view: { zoomMode: 'fit-page', zoom: 1.25, rotation: 90, pageLayout: 'continuous' },
    workspace: {
      annotations: [{ id: 'a1', page: 1, kind: 'highlight', rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 }, color: '#ff0', text: 'hi' }],
      clips: [{ id: 'c1', kind: 'text', page: 2, content: 'copied', at: 1 }],
      bookmarks: [{ id: 'b1', page: 3, label: 'Chapter' }],
      rotation: 90,
    },
  };

  it('round-trips a full workspace', () => {
    const json = serializeWorkspace(sample);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = parseWorkspace(json);
    expect(parsed.pdfPath).toBe(sample.file.path);
    expect(parsed.pdfName).toBe('report.pdf');
    expect(parsed.view.page).toBe(3);
    expect(parsed.view.zoomMode).toBe('fit-page');
    expect(parsed.view.zoom).toBe(1.25);
    expect(parsed.view.rotation).toBe(90);
    expect(parsed.view.pageLayout).toBe('continuous');
    expect(parsed.workspace.annotations).toHaveLength(1);
    expect(parsed.workspace.clips[0].content).toBe('copied');
    expect(parsed.workspace.bookmarks[0].label).toBe('Chapter');
    expect(parsed.workspace.attachments).toEqual([]);
    expect(parsed.workspace.rotation).toBe(90);
  });

  it('round-trips comment notes together with bookmarks', () => {
    const json = serializeWorkspace({
      file: { name: 'a.pdf' },
      workspace: {
        annotations: [{ id: 'n1', page: 2, kind: 'note', text: 'remember', rect: { x: 0.1, y: 0.2, w: 0.4, h: 0.08 } }],
        bookmarks: [{ id: 'b1', page: 2, label: 'spot' }],
      },
    });
    const parsed = parseWorkspace(json);
    expect(parsed.workspace.annotations[0].kind).toBe('note');
    expect(parsed.workspace.annotations[0].text).toBe('remember');
    expect(parsed.workspace.bookmarks[0].label).toBe('spot');
  });

  it('round-trips a file attachment', () => {
    const json = serializeWorkspace({
      file: { name: 'a.pdf' },
      workspace: {
        attachments: [{ id: 'f1', page: 1, kind: 'fileattachment', name: 'note.txt', data: 'aGVsbG8=', mime: 'text/plain', y: 0.2 }],
      },
    });
    const parsed = parseWorkspace(json);
    expect(parsed.workspace.attachments[0]).toMatchObject({ id: 'f1', name: 'note.txt', data: 'aGVsbG8=' });
  });

  it('pretty-prints JSON with format and version', () => {
    const data = JSON.parse(serializeWorkspace(sample));
    expect(data.format).toBe(WORKSPACE_FORMAT);
    expect(data.version).toBe(WORKSPACE_VERSION);
    expect(data.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.pdf.size).toBe(123456);
  });

  it('fills defaults when fields are missing', () => {
    const json = serializeWorkspace({});
    const parsed = parseWorkspace(json);
    expect(parsed.pdfPath).toBe(null);
    expect(parsed.pdfName).toBe('');
    expect(parsed.view.page).toBe(1);
    expect(parsed.workspace.annotations).toEqual([]);
    expect(parsed.workspace.clips).toEqual([]);
    expect(parsed.workspace.bookmarks).toEqual([]);
    expect(parsed.workspace.attachments).toEqual([]);
    expect(parsed.workspace.rotation).toBe(0);
  });

  it('serializes null path when the file has no path (web)', () => {
    const data = JSON.parse(serializeWorkspace({ file: { name: 'a.pdf', size: 10 } }));
    expect(data.pdf.path).toBe(null);
    expect(data.pdf.name).toBe('a.pdf');
  });

  it('throws a parse error for broken JSON', () => {
    expect(() => parseWorkspace('{not json')).toThrow(/JSON could not be parsed/);
    expect(() => parseWorkspace('')).toThrow(/JSON could not be parsed/);
  });

  it('rejects a different format name', () => {
    expect(() => parseWorkspace('{"format":"other","version":1}')).toThrow(/expected format/);
    expect(() => parseWorkspace('{"format":"other","version":1}')).toThrow(/other/);
  });

  it('rejects a missing format', () => {
    expect(() => parseWorkspace('{"version":1}')).toThrow(/nothing/);
  });

  it('rejects a null payload', () => {
    expect(() => parseWorkspace('null')).toThrow(/nothing/);
  });

  it('rejects a newer workspace version', () => {
    const newer = JSON.stringify({ format: WORKSPACE_FORMAT, version: 99, pdf: {}, view: {}, workspace: {} });
    expect(() => parseWorkspace(newer)).toThrow(/newer version/);
    expect(() => parseWorkspace(newer)).toThrow(/v99/);
  });

  it('accepts version 1 and numeric string version 1', () => {
    const raw = JSON.stringify({ format: WORKSPACE_FORMAT, version: '1', pdf: { name: 'x.pdf' }, workspace: {} });
    expect(parseWorkspace(raw).pdfName).toBe('x.pdf');
  });

  it('tolerates missing nested workspace arrays', () => {
    const raw = JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, pdf: {}, view: null, workspace: {} });
    const parsed = parseWorkspace(raw);
    expect(parsed.workspace.annotations).toEqual([]);
    expect(parsed.view).toEqual({});
  });

  it('preserves Korean file names', () => {
    const json = serializeWorkspace({ file: { name: '한글 문서.pdf', path: 'D:/자료/한글 문서.pdf' } });
    const parsed = parseWorkspace(json);
    expect(parsed.pdfName).toBe('한글 문서.pdf');
    expect(parsed.pdfPath).toContain('한글');
  });
});

describe('isWorkspacePath', () => {
  it('matches .pdfvw case-insensitively', () => {
    expect(isWorkspacePath('notes.pdfvw')).toBe(true);
    expect(isWorkspacePath('NOTES.PDFVW')).toBe(true);
    expect(isWorkspacePath('C:\\Work\\a.PdfVw')).toBe(true);
  });

  it('rejects other paths', () => {
    expect(isWorkspacePath('notes.pdf')).toBe(false);
    expect(isWorkspacePath('pdfvw')).toBe(false);
    expect(isWorkspacePath('')).toBe(false);
    expect(isWorkspacePath(null)).toBe(false);
    expect(isWorkspacePath(undefined)).toBe(false);
  });
});

describe('bytesToText', () => {
  it('decodes UTF-8 including Korean', () => {
    const bytes = new TextEncoder().encode('안녕 PDF');
    expect(bytesToText(bytes)).toBe('안녕 PDF');
  });

  it('decodes an empty buffer', () => {
    expect(bytesToText(new Uint8Array())).toBe('');
  });
});

describe('looksLikePdf', () => {
  const real = buildPdf();

  it('accepts a well-formed PDF', () => {
    expect(looksLikePdf(real)).toBe(true);
  });

  it('accepts a PDF with junk before the header', () => {
    expect(looksLikePdf(pdfWithJunkPrefix(real))).toBe(true);
  });

  it('rejects empty, short, or unrelated bytes', () => {
    expect(looksLikePdf(null)).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
    expect(looksLikePdf(new Uint8Array([1, 2, 3, 4]))).toBe(false);
    expect(looksLikePdf(new TextEncoder().encode('hello'))).toBe(false);
    expect(looksLikePdf(new TextEncoder().encode('%PD'))).toBe(false);
  });

  it('rejects a workspace JSON that happens to be named .pdf', () => {
    expect(looksLikePdf(new TextEncoder().encode('{"format":"mypdfviewer-workspace"}'))).toBe(false);
  });

  it('finds %PDF- only inside the first kilobyte', () => {
    const padding = new Uint8Array(1100);
    padding.fill(0x20);
    const sig = new TextEncoder().encode('%PDF-');
    padding.set(sig, 1050);
    expect(looksLikePdf(padding)).toBe(false);
  });
});
