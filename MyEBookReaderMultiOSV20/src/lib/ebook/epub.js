// EPUB 2 / EPUB 3 reader.
//
// The shape of the file is: META-INF/container.xml points at a package
// document (.opf); the package lists every resource (manifest), the reading
// order (spine) and the metadata; the table of contents is either an EPUB 2
// NCX or an EPUB 3 navigation document. All of that is read here, and chapters
// are pulled out of the archive one at a time as the reader asks for them.
import { readZip, readEntry, readEntryText, findEntry, resolveZipPath } from './zip.js';
import { parseDocument, sanitizeChapter, htmlToText } from './html.js';

const MIME_BY_EXT = {
  html: 'text/html', xhtml: 'application/xhtml+xml', htm: 'text/html',
  css: 'text/css', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  mp3: 'audio/mpeg', mp4: 'video/mp4', ncx: 'application/x-dtbncx+xml',
};

export function mimeForPath(path) {
  const ext = String(path || '').split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function textOf(node) {
  return (node?.textContent || '').trim();
}

// EPUB packages are XML with namespaces; `getElementsByTagName` with a plain
// name misses `dc:title` on some parsers and `opf:` prefixes on others, so
// every lookup is by local name.
function byLocalName(root, name) {
  const out = [];
  const walk = (node) => {
    for (const child of node.children || []) {
      const local = (child.localName || child.tagName || '').toLowerCase();
      if (local === name) out.push(child);
      walk(child);
    }
  };
  if (root) walk(root);
  return out;
}

function firstByLocalName(root, name) {
  return byLocalName(root, name)[0] || null;
}

function parseContainer(zip) {
  const entry = findEntry(zip, 'META-INF/container.xml');
  if (!entry) {
    // Some shops ship an EPUB without the container; fall back to any .opf.
    const opf = zip.entries.find((e) => /\.opf$/i.test(e.name));
    if (opf) return opf.name;
    throw new Error('This EPUB has no META-INF/container.xml and no package (.opf) file.');
  }
  const doc = parseDocument(readEntryText(zip, entry), 'application/xml');
  const rootfile = firstByLocalName(doc.documentElement, 'rootfile');
  const path = rootfile?.getAttribute('full-path');
  if (!path) throw new Error('The EPUB container does not name a package document.');
  return path;
}

function parseMetadata(packageEl) {
  const metaEl = firstByLocalName(packageEl, 'metadata');
  const pick = (name) => textOf(byLocalName(metaEl, name)[0]);
  const authors = byLocalName(metaEl, 'creator').map(textOf).filter(Boolean);
  const metaTags = byLocalName(metaEl, 'meta');
  const coverId = metaTags.find((m) => (m.getAttribute('name') || '').toLowerCase() === 'cover')?.getAttribute('content') || '';

  return {
    title: pick('title'),
    author: authors.join(', '),
    publisher: pick('publisher'),
    language: pick('language'),
    identifier: pick('identifier'),
    date: pick('date'),
    description: pick('description'),
    rights: pick('rights'),
    subject: byLocalName(metaEl, 'subject').map(textOf).filter(Boolean).join(', '),
    coverId,
  };
}

function parseManifest(packageEl, opfPath) {
  const manifestEl = firstByLocalName(packageEl, 'manifest');
  const items = new Map();
  for (const item of byLocalName(manifestEl, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (!id || !href) continue;
    items.set(id, {
      id,
      href,
      path: resolveZipPath(opfPath, href),
      mime: item.getAttribute('media-type') || mimeForPath(href),
      properties: (item.getAttribute('properties') || '').split(/\s+/).filter(Boolean),
    });
  }
  return items;
}

function parseSpine(packageEl, manifest) {
  const spineEl = firstByLocalName(packageEl, 'spine');
  const out = [];
  for (const ref of byLocalName(spineEl, 'itemref')) {
    const idref = ref.getAttribute('idref');
    const item = idref ? manifest.get(idref) : null;
    if (!item) continue;
    if (ref.getAttribute('linear') === 'no' && out.length > 40) continue;
    out.push(item);
  }
  // A spine-less (or unreadable) package still opens: show every document.
  if (!out.length) {
    for (const item of manifest.values()) {
      if (/x?html/.test(item.mime)) out.push(item);
    }
  }
  return { items: out, tocId: spineEl?.getAttribute('toc') || '' };
}

function parseNcx(zip, ncxItem, indexByPath) {
  const doc = parseDocument(readEntryText(zip, findEntry(zip, ncxItem.path)), 'application/xml');
  const build = (parent) => byLocalName(parent, 'navPoint')
    .filter((np) => np.parentElement === parent)
    .map((np) => {
      const label = textOf(firstByLocalName(np, 'navLabel'));
      const src = firstByLocalName(np, 'content')?.getAttribute('src') || '';
      const [file, anchor = ''] = src.split('#');
      const path = resolveZipPath(ncxItem.path, file);
      return {
        label: label || '—',
        section: indexByPath.get(path) ?? null,
        anchor,
        children: build(np),
      };
    });
  const navMap = firstByLocalName(doc.documentElement, 'navMap');
  return navMap ? build(navMap) : [];
}

function parseNavDoc(zip, navItem, indexByPath) {
  const doc = parseDocument(readEntryText(zip, findEntry(zip, navItem.path)), 'application/xhtml+xml');
  const navs = [...doc.querySelectorAll('nav')];
  const toc = navs.find((n) => (n.getAttribute('epub:type') || n.getAttribute('type') || '').includes('toc')) || navs[0];
  if (!toc) return [];

  const listToEntries = (list) => [...list.children]
    .filter((li) => li.tagName.toLowerCase() === 'li')
    .map((li) => {
      const anchorEl = li.querySelector(':scope > a, :scope > span');
      const href = anchorEl?.getAttribute('href') || '';
      const [file, anchor = ''] = href.split('#');
      const nested = li.querySelector(':scope > ol, :scope > ul');
      return {
        label: (anchorEl?.textContent || '').trim() || '—',
        section: file ? (indexByPath.get(resolveZipPath(navItem.path, file)) ?? null) : null,
        anchor,
        children: nested ? listToEntries(nested) : [],
      };
    });

  const list = toc.querySelector('ol, ul');
  return list ? listToEntries(list) : [];
}

/**
 * Opens EPUB bytes.
 * @param {Uint8Array} data
 * @returns {object} a book: metadata, spine sections, table of contents and a
 *   `loadSection(index)` that returns sanitized HTML for one chapter.
 */
export function openEpub(data) {
  const zip = readZip(data);
  const opfPath = parseContainer(zip);
  const opfEntry = findEntry(zip, opfPath);
  if (!opfEntry) throw new Error(`The EPUB names "${opfPath}" as its package document, but the archive has no such entry.`);

  const packageDoc = parseDocument(readEntryText(zip, opfEntry), 'application/xml');
  const packageEl = packageDoc.documentElement;

  const meta = parseMetadata(packageEl);
  const manifest = parseManifest(packageEl, opfPath);
  const { items: spine, tocId } = parseSpine(packageEl, manifest);

  const indexByPath = new Map();
  spine.forEach((item, index) => indexByPath.set(item.path, index));

  const sections = spine.map((item, index) => ({
    index,
    id: item.id,
    href: item.path,
    kind: 'html',
    label: `${index + 1}`,
  }));

  // Table of contents: EPUB 3 navigation document first, EPUB 2 NCX second.
  let toc = [];
  try {
    const navItem = [...manifest.values()].find((i) => i.properties.includes('nav'));
    if (navItem) toc = parseNavDoc(zip, navItem, indexByPath);
  } catch { /* fall through to the NCX */ }
  if (!toc.length) {
    try {
      const ncxItem = (tocId && manifest.get(tocId))
        || [...manifest.values()].find((i) => i.mime === 'application/x-dtbncx+xml' || /\.ncx$/i.test(i.href));
      if (ncxItem) toc = parseNcx(zip, ncxItem, indexByPath);
    } catch { /* the book simply has no usable contents list */ }
  }

  // Cover image: the EPUB 3 property, then the EPUB 2 <meta name="cover">.
  const coverItem = [...manifest.values()].find((i) => i.properties.includes('cover-image'))
    || (meta.coverId ? manifest.get(meta.coverId) : null)
    || [...manifest.values()].find((i) => /^image\//.test(i.mime) && /cover/i.test(i.href));

  const resourceCache = new Map();

  const book = {
    format: 'epub',
    meta: {
      title: meta.title,
      author: meta.author,
      publisher: meta.publisher,
      language: meta.language,
      identifier: meta.identifier,
      date: meta.date,
      description: meta.description,
      subject: meta.subject,
      rights: meta.rights,
    },
    sections,
    toc,
    coverPath: coverItem?.path || '',
    /** Raw bytes + mime of any resource in the archive, by archive path. */
    resource(path) {
      if (resourceCache.has(path)) return resourceCache.get(path);
      const entry = findEntry(zip, path);
      if (!entry) return null;
      const value = { bytes: readEntry(zip, entry), mime: mimeForPath(path) };
      resourceCache.set(path, value);
      return value;
    },
    /** Reads one spine document and returns sanitized, ready-to-show HTML. */
    loadSection(index, { resolveSrc } = {}) {
      const section = sections[index];
      if (!section) throw new Error(`This book has no section ${index + 1}.`);
      const entry = findEntry(zip, section.href);
      if (!entry) throw new Error(`The chapter file "${section.href}" is missing from the archive.`);
      const markup = readEntryText(zip, entry);
      const cleaned = sanitizeChapter(markup, {
        mime: /\.x?html?$/i.test(section.href) ? 'application/xhtml+xml' : 'text/html',
        resolveSrc: (href) => {
          const path = resolveZipPath(section.href, href);
          return resolveSrc ? resolveSrc(path) : path;
        },
        linkTarget: (href) => {
          const [file, anchor = ''] = String(href).split('#');
          const path = file ? resolveZipPath(section.href, file) : section.href;
          const target = indexByPath.get(path);
          if (target == null) return null;
          return { section: target, anchor };
        },
      });
      return { kind: 'html', ...cleaned, index, href: section.href };
    },
    /** Plain text of one section, for search and export. */
    sectionText(index) {
      const section = sections[index];
      const entry = section ? findEntry(zip, section.href) : null;
      if (!entry) return '';
      return htmlToText(readEntryText(zip, entry));
    },
  };

  if (!book.meta.title) book.meta.title = '';
  return book;
}

/** EPUBs declare themselves with a `mimetype` entry; the ZIP magic is enough. */
export function looksLikeEpub(data, name = '') {
  if (/\.epub$/i.test(name)) return true;
  if (!data || data.length < 60) return false;
  const head = new TextDecoder('latin1').decode(data.subarray(0, 60));
  return head.includes('mimetype') && head.includes('application/epub+zip');
}
