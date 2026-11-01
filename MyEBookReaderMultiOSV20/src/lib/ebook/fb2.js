// FictionBook 2 (.fb2) reader.
//
// FB2 is a single XML file: the description block carries the metadata, one or
// more <body> elements carry the text as nested <section>s, and the pictures
// live at the end as base64 <binary> elements. Each top-level section becomes
// one chapter, and the FB2 tags are mapped onto the HTML the reader renders.
import { parseDocument, sanitizeChapter, escapeHtml, htmlToText } from './html.js';

function textOf(node) {
  return (node?.textContent || '').trim();
}

function firstTag(root, name) {
  return root?.getElementsByTagName(name)?.[0] || null;
}

function personName(node) {
  if (!node) return '';
  const parts = ['first-name', 'middle-name', 'last-name']
    .map((tag) => textOf(firstTag(node, tag)))
    .filter(Boolean);
  return parts.join(' ') || textOf(firstTag(node, 'nickname'));
}

// FB2 → HTML, tag by tag. Anything unknown keeps its children, so a document
// using a tag we do not know about still reads.
function convert(node, images) {
  if (!node) return '';
  if (node.nodeType === 3) return escapeHtml(node.nodeValue);
  if (node.nodeType !== 1) return '';

  const tag = (node.localName || node.tagName || '').toLowerCase();
  const kids = () => [...node.childNodes].map((child) => convert(child, images)).join('');

  switch (tag) {
    case 'p': return `<p>${kids()}</p>`;
    case 'empty-line': return '<p class="fb2-empty">&nbsp;</p>';
    case 'strong': return `<strong>${kids()}</strong>`;
    case 'emphasis': return `<em>${kids()}</em>`;
    case 'strikethrough': return `<del>${kids()}</del>`;
    case 'sub': return `<sub>${kids()}</sub>`;
    case 'sup': return `<sup>${kids()}</sup>`;
    case 'code': return `<code>${kids()}</code>`;
    case 'title': return `<div class="fb2-title">${kids()}</div>`;
    case 'subtitle': return `<h3>${kids()}</h3>`;
    case 'epigraph': return `<blockquote class="fb2-epigraph">${kids()}</blockquote>`;
    case 'cite': return `<blockquote>${kids()}</blockquote>`;
    case 'poem': return `<div class="fb2-poem">${kids()}</div>`;
    case 'stanza': return `<div class="fb2-stanza">${kids()}</div>`;
    case 'v': return `<p class="fb2-verse">${kids()}</p>`;
    case 'text-author': return `<p class="fb2-author">${kids()}</p>`;
    case 'table': return `<table>${kids()}</table>`;
    case 'tr': return `<tr>${kids()}</tr>`;
    case 'th': return `<th>${kids()}</th>`;
    case 'td': return `<td>${kids()}</td>`;
    case 'a': {
      const href = node.getAttribute('l:href') || node.getAttribute('xlink:href') || node.getAttribute('href') || '';
      return `<a href="${escapeHtml(href)}">${kids()}</a>`;
    }
    case 'image': {
      const href = node.getAttribute('l:href') || node.getAttribute('xlink:href') || node.getAttribute('href') || '';
      const id = href.replace(/^#/, '');
      if (!id || !images.has(id)) return '';
      return `<img src="fb2:${escapeHtml(id)}" alt="">`;
    }
    case 'section': return `<section>${kids()}</section>`;
    default: return kids();
  }
}

function base64ToBytes(base64) {
  const clean = String(base64 || '').replace(/\s+/g, '');
  if (!clean) return new Uint8Array(0);
  if (typeof atob === 'function') {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(clean, 'base64'));
}

/** Opens FB2 bytes (or a decoded FB2 string). */
export function openFb2(input) {
  const source = typeof input === 'string' ? input : decodeFb2(input);
  const doc = parseDocument(source, 'application/xml');
  const root = doc.documentElement;
  if (!root || !/fictionbook/i.test(root.tagName)) {
    throw new Error('This file does not look like a FictionBook (FB2) document.');
  }

  const titleInfo = firstTag(root, 'title-info');
  const publishInfo = firstTag(root, 'publish-info');
  const authors = [...(titleInfo?.getElementsByTagName('author') || [])].map(personName).filter(Boolean);

  const images = new Map();
  for (const binary of root.getElementsByTagName('binary')) {
    const id = binary.getAttribute('id');
    if (!id) continue;
    images.set(id, {
      bytes: base64ToBytes(binary.textContent || ''),
      mime: binary.getAttribute('content-type') || 'image/jpeg',
    });
  }

  const bodies = [...root.getElementsByTagName('body')];
  const main = bodies.filter((b) => (b.getAttribute('name') || '') !== 'notes');
  const chapters = [];
  for (const body of (main.length ? main : bodies)) {
    const sections = [...body.children].filter((el) => (el.localName || el.tagName || '').toLowerCase() === 'section');
    if (sections.length) {
      for (const section of sections) {
        chapters.push({
          label: textOf(firstTag(section, 'title')).replace(/\s+/g, ' ').slice(0, 90),
          html: convert(section, images),
        });
      }
    } else {
      chapters.push({ label: textOf(firstTag(body, 'title')) || '', html: convert(body, images) });
    }
  }
  if (!chapters.length) chapters.push({ label: '', html: '' });

  const sections = chapters.map((chapter, index) => ({
    index,
    id: `fb2-${index}`,
    href: `#section-${index}`,
    kind: 'html',
    label: chapter.label || `${index + 1}`,
  }));

  const coverHref = firstTag(titleInfo, 'coverpage')
    ? (firstTag(firstTag(titleInfo, 'coverpage'), 'image')?.getAttribute('l:href')
      || firstTag(firstTag(titleInfo, 'coverpage'), 'image')?.getAttribute('xlink:href') || '')
    : '';

  return {
    format: 'fb2',
    meta: {
      title: textOf(firstTag(titleInfo, 'book-title')),
      author: authors.join(', '),
      language: textOf(firstTag(titleInfo, 'lang')),
      date: textOf(firstTag(titleInfo, 'date')) || textOf(firstTag(publishInfo, 'year')),
      publisher: textOf(firstTag(publishInfo, 'publisher')),
      description: textOf(firstTag(titleInfo, 'annotation')),
      subject: [...(titleInfo?.getElementsByTagName('genre') || [])].map(textOf).filter(Boolean).join(', '),
      identifier: textOf(firstTag(root, 'id')),
    },
    sections,
    toc: chapters.map((chapter, index) => ({
      label: chapter.label || `${index + 1}`,
      section: index,
      anchor: '',
      children: [],
    })),
    coverPath: coverHref ? `fb2:${coverHref.replace(/^#/, '')}` : '',
    resource(path) {
      const id = String(path || '').replace(/^fb2:/, '');
      return images.get(id) || null;
    },
    loadSection(index, { resolveSrc } = {}) {
      const chapter = chapters[index];
      if (!chapter) throw new Error(`This book has no section ${index + 1}.`);
      const cleaned = sanitizeChapter(chapter.html, {
        mime: 'text/html',
        resolveSrc: (href) => (resolveSrc ? resolveSrc(href) : href),
        linkTarget: () => null,
      });
      return { kind: 'html', ...cleaned, index, href: sections[index].href };
    },
    sectionText(index) {
      return chapters[index] ? htmlToText(chapters[index].html) : '';
    },
  };
}

/** FB2 files are often windows-1251 / koi8-r; the XML declaration says which. */
export function decodeFb2(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const declared = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1];
  const candidates = [declared, 'utf-8'].filter(Boolean);
  for (const encoding of candidates) {
    try {
      return new TextDecoder(encoding).decode(bytes);
    } catch { /* try the next one */ }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export function looksLikeFb2(data, name = '') {
  if (/\.fb2$/i.test(name)) return true;
  if (!data || data.length < 40) return false;
  const head = new TextDecoder('latin1').decode(data.subarray(0, 600)).toLowerCase();
  return head.includes('<fictionbook');
}
