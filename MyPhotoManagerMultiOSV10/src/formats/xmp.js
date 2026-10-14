// XMP sidecar files ("photo.xmp" next to "photo.nef"): rating, color label,
// keywords, categories, title and caption — in the properties Lightroom,
// Bridge, darktable and digiKam read too. Hierarchical keywords ("Places|Korea")
// are written the Lightroom way: the full path in lr:hierarchicalSubject and
// every level in dc:subject. Categories also go to lr:hierarchicalSubject (so
// other programs see them) and to mpm:categories, which tells them apart again.
//
// An existing sidecar keeps everything else it holds (develop settings, …):
// only the properties above are replaced.

const NS = {
  x: 'adobe:ns:meta/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  dc: 'http://purl.org/dc/elements/1.1/',
  lr: 'http://ns.adobe.com/lightroom/1.0/',
  photoshop: 'http://ns.adobe.com/photoshop/1.0/',
  Iptc4xmpCore: 'http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/',
  xmpRights: 'http://ns.adobe.com/xap/1.0/rights/',
  mpm: 'http://ns.myphotomanager.app/1.0/',
};

/**
 * IPTC Core fields: catalog key → [XMP property, kind]. kind: 'text' (simple
 * element), 'alt' (language alternative), 'seq' (ordered list, first item used).
 */
export const IPTC_FIELDS = {
  author: ['dc:creator', 'seq'],
  copyright: ['dc:rights', 'alt'],
  headline: ['photoshop:Headline', 'text'],
  credit: ['photoshop:Credit', 'text'],
  source: ['photoshop:Source', 'text'],
  instructions: ['photoshop:Instructions', 'text'],
  city: ['photoshop:City', 'text'],
  state: ['photoshop:State', 'text'],
  country: ['photoshop:Country', 'text'],
  sublocation: ['Iptc4xmpCore:Location', 'text'],
  countryCode: ['Iptc4xmpCore:CountryCode', 'text'],
  usageTerms: ['xmpRights:UsageTerms', 'alt'],
  event: ['Iptc4xmpCore:Event', 'text'],
};

export const LABEL_NAMES = { red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple' };

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescape = (value) => String(value).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

/** Sidecar name: "IMG_1.CR2" → "IMG_1.xmp". */
export function sidecarName(fileName) {
  const dot = fileName.lastIndexOf('.');
  return `${dot > 0 ? fileName.slice(0, dot) : fileName}.xmp`;
}

function managedXml(fields) {
  const { keywords = [], categories = [], caption = '', title = '' } = fields;
  const lines = [];
  const bag = (items) => `<rdf:Bag>${items.map((item) => `<rdf:li>${escape(item)}</rdf:li>`).join('')}</rdf:Bag>`;
  const alt = (value) => `<rdf:Alt><rdf:li xml:lang="x-default">${escape(value)}</rdf:li></rdf:Alt>`;
  const levels = (keyword) => keyword.split('|').map((part) => part.trim()).filter(Boolean);
  const subjects = [...new Set([...keywords.flatMap(levels), ...categories.map((path) => path.split('/').pop())])].filter(Boolean);
  if (subjects.length) lines.push(`   <dc:subject>${bag(subjects)}</dc:subject>`);
  const categoryPaths = categories.map((path) => path.split('/').filter(Boolean).join('|')).filter(Boolean);
  const hierarchy = [...new Set([...keywords.filter((k) => k.includes('|')).map((k) => levels(k).join('|')), ...categoryPaths])];
  if (hierarchy.length) lines.push(`   <lr:hierarchicalSubject>${bag(hierarchy)}</lr:hierarchicalSubject>`);
  if (categoryPaths.length) lines.push(`   <mpm:categories>${bag(categoryPaths)}</mpm:categories>`);
  if (title) lines.push(`   <dc:title>${alt(title)}</dc:title>`);
  if (caption) lines.push(`   <dc:description>${alt(caption)}</dc:description>`);
  for (const [key, [name, kind]] of Object.entries(IPTC_FIELDS)) {
    const value = fields[key];
    if (!value) continue;
    const inner = kind === 'alt' ? alt(value) : kind === 'seq' ? `<rdf:Seq><rdf:li>${escape(value)}</rdf:li></rdf:Seq>` : escape(value);
    lines.push(`   <${name}>${inner}</${name}>`);
  }
  return lines.join('\n');
}

function attributes({ rating = 0, label = null }) {
  const out = [];
  if (rating) out.push(`xmp:Rating="${rating}"`);
  if (label && LABEL_NAMES[label]) out.push(`xmp:Label="${LABEL_NAMES[label]}"`);
  return out;
}

/** New XMP packet for `fields`: { rating, label, keywords, categories, caption, title }. */
export function buildXmp(fields) {
  const attrs = attributes(fields).map((attr) => `\n    ${attr}`).join('');
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="${NS.x}" x:xmptk="MyPhotoManager">
 <rdf:RDF xmlns:rdf="${NS.rdf}">
  <rdf:Description rdf:about=""
    xmlns:xmp="${NS.xmp}"
    xmlns:dc="${NS.dc}"
    xmlns:lr="${NS.lr}"
    xmlns:photoshop="${NS.photoshop}"
    xmlns:Iptc4xmpCore="${NS.Iptc4xmpCore}"
    xmlns:xmpRights="${NS.xmpRights}"
    xmlns:mpm="${NS.mpm}"${attrs}>
${managedXml(fields)}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
`;
}

const MANAGED_ELEMENTS = ['xmp:Rating', 'xmp:Label', 'dc:subject', 'lr:hierarchicalSubject', 'mpm:categories', 'dc:title', 'dc:description', ...Object.values(IPTC_FIELDS).map(([name]) => name)];

/** `existing` sidecar text with our properties replaced by `fields` (or a new packet). */
export function updateXmp(existing, fields) {
  if (!existing || !/<rdf:Description\b/.test(existing)) return buildXmp(fields);
  let text = existing;
  for (const name of MANAGED_ELEMENTS) {
    const tag = name.replace(':', '\\:');
    text = text.replace(new RegExp(`\\s*<${tag}\\b[^>]*/>`, 'g'), '');
    text = text.replace(new RegExp(`\\s*<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'g'), '');
  }
  // Attributes on the first rdf:Description.
  const open = /<rdf:Description\b([^>]*?)(\/?)>/.exec(text);
  let attrs = open[1].replace(/\s+xmp:(Rating|Label)="[^"]*"/g, '');
  // Simple-text IPTC fields may also be attributes of rdf:Description.
  for (const [name] of Object.values(IPTC_FIELDS)) attrs = attrs.split(new RegExp(`\\s+${name}="[^"]*"`)).join('');
  for (const [prefix, uri] of [['xmp', NS.xmp], ['dc', NS.dc], ['lr', NS.lr], ['photoshop', NS.photoshop], ['Iptc4xmpCore', NS.Iptc4xmpCore], ['xmpRights', NS.xmpRights], ['mpm', NS.mpm]]) {
    if (!new RegExp(`xmlns:${prefix}=`).test(attrs)) attrs += `\n    xmlns:${prefix}="${uri}"`;
  }
  attrs += attributes(fields).map((attr) => `\n    ${attr}`).join('');
  const body = managedXml(fields);
  const selfClosing = open[2] === '/';
  const replacement = selfClosing ? `<rdf:Description${attrs}>\n${body}\n  </rdf:Description>` : `<rdf:Description${attrs}>${body ? `\n${body}` : ''}`;
  return text.slice(0, open.index) + replacement + text.slice(open.index + open[0].length);
}

function items(text, tag) {
  const block = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(text);
  if (!block) return [];
  return [...block[1].matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((m) => unescape(m[1].trim())).filter(Boolean);
}

function property(text, name) {
  const attr = new RegExp(`\\s${name}="([^"]*)"`).exec(text);
  if (attr) return unescape(attr[1]);
  const element = new RegExp(`<${name}>([^<]*)</${name}>`).exec(text);
  return element ? unescape(element[1].trim()) : null;
}

/** Fields of a sidecar (or embedded XMP packet): { rating, label, keywords, categories, caption, title }. */
export function parseXmp(text) {
  const out = { rating: 0, label: null, keywords: [], categories: [], caption: '', title: '' };
  if (!text) return out;
  const rating = Number.parseInt(property(text, 'xmp:Rating') ?? '', 10);
  if (rating >= 1 && rating <= 5) out.rating = rating;
  const label = (property(text, 'xmp:Label') ?? '').toLowerCase();
  if (LABEL_NAMES[label]) out.label = label;
  const hierarchy = items(text, 'lr:hierarchicalSubject');
  // Our own files say which paths are categories; older ones (and other
  // programs' files) are read as before: every hierarchical path a category.
  const ours = /<mpm:categories\b/.test(text);
  const categoryPaths = ours ? items(text, 'mpm:categories') : hierarchy;
  out.categories = categoryPaths.map((path) => path.split('|').join('/'));
  const hierarchicalKeywords = ours ? hierarchy.filter((path) => !categoryPaths.includes(path)) : [];
  // Plain keywords: subjects that are not just a level of a hierarchical keyword or a category name.
  const covered = new Set([...out.categories.map((path) => path.split('/').pop()), ...hierarchicalKeywords.flatMap((path) => path.split('|'))]);
  out.keywords = [...hierarchicalKeywords, ...items(text, 'dc:subject').filter((keyword) => !covered.has(keyword))];
  out.title = items(text, 'dc:title')[0] ?? '';
  out.caption = items(text, 'dc:description')[0] ?? '';
  for (const [key, [name, kind]] of Object.entries(IPTC_FIELDS)) {
    const value = kind === 'text' ? property(text, name) : items(text, name)[0];
    if (value) out[key] = value;
  }
  return out;
}
