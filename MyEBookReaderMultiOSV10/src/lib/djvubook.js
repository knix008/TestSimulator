// A DjVu document, presented as a book.
//
// Like a PDF, a DjVu is fixed-layout: a section is a page, and the reading
// view paints it. The text layer, when the file has one, is what search and
// "select all" read.
import { openDjvuDocument, djvuPageText } from './djvu.js';

export async function openDjvuBook(data, { name = '' } = {}) {
  const doc = await openDjvuDocument(data);
  const count = doc.page_count();
  if (!count) {
    try { doc.free(); } catch { /* nothing was opened */ }
    throw new Error('This DjVu file has no pages.');
  }

  const sections = Array.from({ length: count }, (_, index) => ({
    index,
    id: `page-${index + 1}`,
    href: `#page-${index + 1}`,
    kind: 'djvu',
    label: `${index + 1}`,
  }));

  const textCache = new Map();

  return {
    format: 'djvu',
    formatLabel: 'DjVu',
    meta: {
      title: String(name || '').replace(/\.[^.]+$/, ''),
      author: '',
      pages: count,
    },
    sections,
    toc: sections.map((section, index) => ({
      label: `${index + 1}`, section: index, anchor: '', children: [],
    })),
    coverPath: '',
    resource() { return null; },
    loadSection(index) {
      if (index < 0 || index >= count) throw new Error(`This document has no page ${index + 1}.`);
      return {
        kind: 'djvu',
        index,
        page: index + 1,
        href: `#page-${index + 1}`,
        html: '',
        headings: [],
        title: `${index + 1}`,
        text: textCache.get(index) || '',
      };
    },
    sectionText(index) {
      return textCache.get(index) || '';
    },
    async readSectionText(index) {
      if (textCache.has(index)) return textCache.get(index);
      const text = djvuPageText(doc, index + 1);
      textCache.set(index, text);
      return text;
    },
    djvu: doc,
    destroy() {
      try { doc.free(); } catch { /* already gone */ }
    },
  };
}
