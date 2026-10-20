// Every file the app reads and writes, by extension: opening a map (.tmap or
// an imported format), saving it, and the exports of File › Export.
import { normalizeMap, mapTitle } from '../model.js';
import { importOpml, exportOpml, importMarkdown, exportMarkdown, importTextOutline, exportTextOutline, exportHtml, exportCsv } from './outline.js';
import { importFreeMind, exportFreeMind } from './freemind.js';
import { importXmind, exportXmind } from './xmind.js';
import { importMmap } from './mmap.js';
import { exportDocx } from './docx.js';
import { buildPdf, paperPoints, mmToPt, bytesToBase64 } from './pdf.js';
import { mapPicture, svgToCanvas, canvasBytes } from '../exportimg.js';
import { renderMarkdown } from '../markdown.js';

export const MAP_EXT = 'tmap';
export const IMPORT_EXT = ['mm', 'opml', 'xmind', 'mmap', 'md', 'markdown', 'txt'];
export const OPEN_EXT = [MAP_EXT, 'json', ...IMPORT_EXT];

export const extOf = (p) => { const m = /\.([^.\\/]+)$/.exec(String(p || '')); return m ? m[1].toLowerCase() : ''; };
export const baseName = (p) => String(p || '').split(/[\\/]/).pop();

const L = (lang, ko, en) => (lang === 'ko' ? ko : en);

export function openFilters(lang = 'ko') {
  return [
    { name: L(lang, '모든 마인드맵', 'All mind maps'), extensions: OPEN_EXT },
    { name: 'MyBrainMap (*.tmap)', extensions: [MAP_EXT] },
    { name: 'FreeMind / Freeplane (*.mm)', extensions: ['mm'] },
    { name: 'XMind (*.xmind)', extensions: ['xmind'] },
    { name: 'MindManager (*.mmap)', extensions: ['mmap'] },
    { name: 'OPML (*.opml)', extensions: ['opml'] },
    { name: 'Markdown (*.md)', extensions: ['md', 'markdown'] },
    { name: L(lang, '텍스트 개요 (*.txt)', 'Text outline (*.txt)'), extensions: ['txt'] },
    { name: L(lang, '모든 파일', 'All files'), extensions: ['*'] },
  ];
}

// File › Import: the other programs' formats only.
export function importFilters(lang = 'ko') {
  const [, , ...rest] = openFilters(lang);
  return [{ name: L(lang, '가져올 수 있는 모든 형식', 'All importable formats'), extensions: IMPORT_EXT }, ...rest];
}

export const saveFilters = () => [{ name: 'MyBrainMap (*.tmap)', extensions: [MAP_EXT] }];

// Reads a map file of any supported format. → { map, kind: 'tmap' | 'import', mtime, readonly }
export async function readMapFile(path, call) {
  const ext = extOf(path);
  const name = baseName(path);
  if (ext === 'xmind' || ext === 'mmap') {
    const z = await call('zip.read', { path });
    const map = ext === 'xmind' ? importXmind(z.entries, name) : importMmap(z.entries, name);
    const st = await call('file.stat', { path }).catch(() => ({}));
    return { map, kind: 'import', mtime: st.mtime || 0, readonly: false, path: z.path };
  }
  const r = await call('file.readText', { path });
  let map;
  let kind = 'import';
  if (ext === MAP_EXT || ext === 'json') {
    let obj;
    try { obj = JSON.parse(r.text); } catch (e) { const err = new Error(`Not a MyBrainMap file: ${e.message}`); err.code = 'EFORMAT'; throw err; }
    if (!obj || typeof obj !== 'object' || !obj.root) { const err = new Error('Not a MyBrainMap file'); err.code = 'EFORMAT'; throw err; }
    map = normalizeMap(obj);
    kind = ext === MAP_EXT ? 'tmap' : 'import';
  } else if (ext === 'mm') map = importFreeMind(r.text, name);
  else if (ext === 'opml') map = importOpml(r.text, name);
  else if (ext === 'md' || ext === 'markdown') map = importMarkdown(r.text, name);
  else if (ext === 'txt') map = importTextOutline(r.text, name);
  else { const err = new Error(`Unsupported file type: .${ext}`); err.code = 'EFORMAT'; throw err; }
  return { map, kind, mtime: r.mtime, readonly: !!r.readonly, path: r.path };
}

export const serializeMap = (map) => JSON.stringify(map, null, 1);

export async function writeMapFile(path, map, call) {
  return call('file.writeText', { path, text: serializeMap(map) });
}

// ── exports ──

export const EXPORTS = [
  { id: 'png', ext: 'png', icon: 'image', label: ['PNG 그림', 'PNG picture'], desc: ['투명 배경 가능, 배율 선택', 'Transparent background, any scale'], picture: true },
  { id: 'jpeg', ext: 'jpg', icon: 'image', label: ['JPEG 그림', 'JPEG picture'], desc: ['작은 파일', 'Smaller files'], picture: true },
  { id: 'svg', ext: 'svg', icon: 'image', label: ['SVG 벡터 그림', 'SVG vector picture'], desc: ['확대해도 선명', 'Sharp at any size'], picture: true },
  { id: 'pdf', ext: 'pdf', icon: 'filePdf', label: ['PDF 문서', 'PDF document'], desc: ['맵 한 장 (용지 크기 선택)', 'The map on a page (paper size)'], picture: true },
  { id: 'docx', ext: 'docx', icon: 'fileText', label: ['Word 문서', 'Word document'], desc: ['맵 그림 + 제목 개요 + 메모', 'Map picture, heading outline, notes'] },
  { id: 'html', ext: 'html', icon: 'fileMarkup', label: ['웹 페이지 (HTML)', 'Web page (HTML)'], desc: ['맵 그림과 접히는 개요', 'Map picture and a foldable outline'] },
  { id: 'md', ext: 'md', icon: 'fileText', label: ['Markdown', 'Markdown'], desc: ['제목·목록·메모', 'Headings, lists, notes'] },
  { id: 'opml', ext: 'opml', icon: 'outlineView', label: ['OPML 개요', 'OPML outline'], desc: ['개요 프로그램과 주고받기', 'For outliners'] },
  { id: 'txt', ext: 'txt', icon: 'fileText', label: ['텍스트 개요', 'Text outline'], desc: ['탭으로 들여쓴 줄', 'Tab-indented lines'] },
  { id: 'mm', ext: 'mm', icon: 'mapView', label: ['FreeMind (.mm)', 'FreeMind (.mm)'], desc: ['FreeMind · Freeplane', 'FreeMind, Freeplane'] },
  { id: 'xmind', ext: 'xmind', icon: 'mapView', label: ['XMind (.xmind)', 'XMind (.xmind)'], desc: ['XMind 2020 이상', 'XMind 2020 and later'] },
  { id: 'csv', ext: 'csv', icon: 'table', label: ['CSV 작업 목록', 'CSV task list'], desc: ['Excel 에서 열기', 'Opens in Excel'] },
];

export const exportById = (id) => EXPORTS.find((e) => e.id === id);

// Writes the export `id` of the map to `path`.
// opts: { lang, settings, scale, transparent, padding, paper, landscape, margin }
export async function exportMap(id, map, path, call, opts = {}) {
  const lang = opts.lang || 'ko';
  const pictureOpts = { lang, settings: opts.settings || {}, padding: opts.padding ?? 40 };
  switch (id) {
    case 'png': {
      const pic = mapPicture(map, { ...pictureOpts, transparent: !!opts.transparent });
      const canvas = await svgToCanvas(pic.svg, pic.width, pic.height, opts.scale || 2, opts.transparent ? null : pic.ms.bg);
      return call('file.writeBase64', { path, base64: bytesToBase64(await canvasBytes(canvas, 'image/png')) });
    }
    case 'jpeg': {
      const pic = mapPicture(map, pictureOpts);
      const canvas = await svgToCanvas(pic.svg, pic.width, pic.height, opts.scale || 2, pic.ms.bg);
      return call('file.writeBase64', { path, base64: bytesToBase64(await canvasBytes(canvas, 'image/jpeg', 0.92)) });
    }
    case 'svg': {
      const pic = mapPicture(map, { ...pictureOpts, transparent: !!opts.transparent });
      return call('file.writeText', { path, text: `<?xml version="1.0" encoding="UTF-8"?>\n${pic.svg}\n` });
    }
    case 'pdf': {
      const pic = mapPicture(map, pictureOpts);
      const canvas = await svgToCanvas(pic.svg, pic.width, pic.height, Math.max(2, opts.scale || 2), pic.ms.bg);
      const jpeg = await canvasBytes(canvas, 'image/jpeg', 0.93);
      const landscape = opts.landscape ?? pic.width >= pic.height;
      const paper = opts.paper === 'fit' ? null : paperPoints(opts.paper || 'a4', landscape);
      const bytes = buildPdf([{ jpeg, width: canvas.width, height: canvas.height }], { paper, margin: mmToPt(opts.margin ?? 10), title: mapTitle(map) });
      return call('file.writeBase64', { path, base64: bytesToBase64(bytes) });
    }
    case 'docx': {
      const pic = mapPicture(map, pictureOpts);
      const canvas = await svgToCanvas(pic.svg, pic.width, pic.height, 2, pic.ms.bg);
      const png = bytesToBase64(await canvasBytes(canvas, 'image/png'));
      const files = exportDocx(map, { image: { base64: png, width: pic.width, height: pic.height }, lang });
      return call('zip.write', { path, files });
    }
    case 'html': {
      const pic = mapPicture(map, pictureOpts);
      return call('file.writeText', { path, text: exportHtml(map, { svg: pic.svg, lang, renderNotes: renderMarkdown }) });
    }
    case 'md': return call('file.writeText', { path, text: exportMarkdown(map, { lang }) });
    case 'opml': return call('file.writeText', { path, text: exportOpml(map) });
    case 'txt': return call('file.writeText', { path, text: exportTextOutline(map) });
    case 'mm': return call('file.writeText', { path, text: exportFreeMind(map) });
    case 'xmind': return call('zip.write', { path, files: exportXmind(map) });
    case 'csv': return call('file.writeText', { path, text: exportCsv(map, { lang }), bom: true });
    default: throw new Error(`Unknown export: ${id}`);
  }
}
