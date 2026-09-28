// A PDF, presented as a book.
//
// PDFs are fixed-layout: a "section" is a page, and rendering means painting a
// canvas rather than laying out HTML. Keeping that behind the same interface as
// the reflowable formats is what lets the reading view, the contents panel, the
// search box and the print dialog work the same way for every format.
import {
  loadDocument, getOutline, destToLocation, getDocumentInfo, getPageText,
} from './pdf.js';

export async function openPdfBook(data, { name = '', onProgress, onPassword } = {}) {
  const task = loadDocument({
    data,
    onProgress: onProgress ? ({ loaded, total }) => onProgress({ done: loaded, total }) : undefined,
    onPassword,
  });
  const doc = await task.promise;

  const info = await getDocumentInfo(doc);
  const outline = await getOutline(doc);

  // Outline destinations are resolved once, here: each lookup costs a page
  // fetch, and doing it while the reader scrolls would stall the view.
  const resolveOutline = async (nodes) => {
    const out = [];
    for (const node of nodes) {
      const loc = node.dest ? await destToLocation(doc, node.dest) : null;
      out.push({
        label: node.title || '—',
        section: loc?.page != null ? loc.page - 1 : null,
        anchor: '',
        url: node.url || '',
        children: node.items?.length ? await resolveOutline(node.items) : [],
      });
    }
    return out;
  };
  let toc = [];
  try { toc = await resolveOutline(outline); } catch { toc = []; }

  const sections = Array.from({ length: doc.numPages }, (_, index) => ({
    index,
    id: `page-${index + 1}`,
    href: `#page-${index + 1}`,
    kind: 'pdf',
    label: `${index + 1}`,
  }));

  const textCache = new Map();

  return {
    format: 'pdf',
    meta: {
      title: info.title || String(name || '').replace(/\.[^.]+$/, ''),
      author: info.author,
      subject: info.subject,
      keywords: info.keywords,
      creator: info.creator,
      publisher: info.producer,
      date: info.creationDate,
      version: info.version,
      pages: doc.numPages,
    },
    sections,
    toc: toc.length ? toc : sections.map((section, index) => ({
      label: `${index + 1}`, section: index, anchor: '', children: [],
    })),
    coverPath: '',
    resource() { return null; },
    loadSection(index) {
      if (index < 0 || index >= doc.numPages) throw new Error(`This document has no page ${index + 1}.`);
      return {
        kind: 'pdf',
        index,
        page: index + 1,
        href: `#page-${index + 1}`,
        html: '',
        headings: [],
        title: `${index + 1}`,
        text: '',
      };
    },
    sectionText(index) {
      // Synchronous by contract (search and export call it in a loop), so the
      // text of a page is only available once it has been read and cached.
      return textCache.get(index) || '';
    },
    /** Reads and caches a page's text; used by search and text export. */
    async readSectionText(index) {
      if (textCache.has(index)) return textCache.get(index);
      const page = await doc.getPage(index + 1);
      const text = await getPageText(page);
      page.cleanup();
      textCache.set(index, text);
      return text;
    },
    pdf: doc,
    destroy() {
      try { doc.destroy(); } catch { /* already gone */ }
    },
  };
}
