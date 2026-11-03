// A folder of pictures, presented as a book.
//
// Comics and scanned books come either as one archive or as a folder of page
// pictures (often the same archive, extracted). A folder opens like a comic:
// every picture in it is a page, in reading order — "page2.jpg" before
// "page10.jpg" — and pictures in sub-folders ("ch1/001.jpg") follow their
// folder's place in that order. Any picture format the reader knows can be a
// page; ones the browser cannot show itself are converted when first needed.
//
// The caller reads the files (the desktop host does the I/O); this module only
// turns { name, bytes } pairs into the book interface of ./book.js.
import { naturalCompare } from './cbz.js';
import { isImageName, pictureResource } from './imagebook.js';

/** True for a path that should not be a page: macOS resource forks, hidden files. */
function isJunkPath(name) {
  return String(name || '').split(/[\\/]/).some((part) => part.startsWith('.') || /^__MACOSX$/i.test(part));
}

/**
 * The pictures among a folder's files, in reading order.
 * @param {Array<{name: string}>} files names may include sub-folders ("ch1/001.jpg")
 */
export function pictureFilesOf(files) {
  return (files || [])
    .filter((f) => f && isImageName(f.name) && !isJunkPath(f.name))
    .sort((a, b) => naturalCompare(String(a.name).replace(/\\/g, '/'), String(b.name).replace(/\\/g, '/')));
}

/**
 * Opens pictures as a book.
 * @param {object} options
 *   - `name`  the folder (or archive) name, which becomes the title
 *   - `pages` [{ name, bytes }] in reading order (see pictureFilesOf)
 */
export function openPictureFolder({ name = '', pages = [] } = {}) {
  if (!pages.length) throw new Error(`"${name || 'This folder'}" has no pictures in it, so there is nothing to show as a book.`);

  const byName = new Map(pages.map((p) => [p.name, p]));
  const sections = pages.map((p, index) => ({
    index,
    id: `page-${index}`,
    href: p.name,
    kind: 'image',
    label: `${index + 1}`,
  }));
  const cache = new Map();

  return {
    format: 'pictures',
    formatLabel: 'Pictures',
    reflowable: false,
    meta: {
      title: String(name || ''),
      author: '',
      pages: pages.length,
    },
    sections,
    toc: sections.map((section, index) => ({
      label: section.href.split('/').pop(),
      section: index,
      anchor: '',
      children: [],
    })),
    coverPath: pages[0].name,
    resource(path) {
      if (cache.has(path)) return cache.get(path);
      const page = byName.get(path);
      if (!page) return null;
      const value = pictureResource(page.bytes, page.name);
      cache.set(path, value);
      return value;
    },
    loadSection(index, { resolveSrc } = {}) {
      const section = sections[index];
      if (!section) throw new Error(`This book has no page ${index + 1}.`);
      const url = resolveSrc ? resolveSrc(section.href) : section.href;
      return {
        index,
        href: section.href,
        kind: 'image',
        src: url,
        html: `<div class="comic-page"><img src="${url}" alt=""></div>`,
        headings: [],
        title: section.href.split('/').pop(),
        text: '',
      };
    },
    sectionText() { return ''; },
    /** Lets the page's bytes go once the book closes. */
    destroy() {
      cache.clear();
      byName.clear();
    },
  };
}
