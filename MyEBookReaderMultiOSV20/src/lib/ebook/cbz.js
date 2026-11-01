// Comic archive reader (.cbz / .zip of images).
//
// Every image in the archive is one page, in the order a reader expects:
// "page2.jpg" before "page10.jpg", which a plain string sort gets wrong. Pages
// are decoded on demand — a 500 MB comic opens as fast as its first page.
import { readZip, readEntry } from './zip.js';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
};

/** "ch2/page10.jpg" sorts after "ch2/page9.jpg" — digits compare as numbers. */
export function naturalCompare(a, b) {
  const split = (s) => String(s).toLowerCase().match(/(\d+|\D+)/g) || [];
  const left = split(a);
  const right = split(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i];
    const y = right[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const diff = Number(x) - Number(y);
      if (diff) return diff < 0 ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

export function openCbz(data, { name = '' } = {}) {
  const zip = readZip(data);
  const pages = zip.entries
    .filter((entry) => !entry.directory && IMAGE_EXT.test(entry.name) && !/(^|\/)__MACOSX\//i.test(entry.name))
    .sort((a, b) => naturalCompare(a.name, b.name));

  if (!pages.length) throw new Error('This archive contains no images, so there is nothing to show as a comic.');

  const sections = pages.map((entry, index) => ({
    index,
    id: `page-${index}`,
    href: entry.name,
    kind: 'image',
    label: `${index + 1}`,
  }));

  const cache = new Map();

  return {
    format: 'cbz',
    meta: {
      title: String(name || '').replace(/\.[^.]+$/, ''),
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
      const entry = zip.byName.get(path);
      if (!entry) return null;
      const ext = path.split('.').pop().toLowerCase();
      const value = { bytes: readEntry(zip, entry), mime: MIME[ext] || 'image/jpeg' };
      cache.set(path, value);
      return value;
    },
    loadSection(index, { resolveSrc } = {}) {
      const section = sections[index];
      if (!section) throw new Error(`This comic has no page ${index + 1}.`);
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
  };
}

export function looksLikeCbz(data, name = '') {
  return /\.(cbz|cbr)$/i.test(name);
}

/** RAR-based comics need a RAR decoder, which the app does not ship. */
export function isCbr(data, name = '') {
  if (/\.cbr$/i.test(name)) {
    return !(data && data[0] === 0x50 && data[1] === 0x4b);   // a .cbr that is really a zip is fine
  }
  return !!data && data.length > 7 && data[0] === 0x52 && data[1] === 0x61 && data[2] === 0x72 && data[3] === 0x21;
}
