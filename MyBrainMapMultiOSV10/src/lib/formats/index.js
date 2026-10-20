// Every file the app reads and writes, by extension: opening a map (.tmap or
// an imported format), saving it, and the exports of File › Export.
import { normalizeMap, mapTitle } from '../model.js';
import { importOpml, exportOpml, importMarkdown, exportMarkdown, importTextOutline, exportTextOutline, exportHtml, exportCsv } from './outline.js';
import { importFreeMind, exportFreeMind } from './freemind.js';
import { importXmind, exportXmind } from './xmind.js';
import { importMmap } from './mmap.js';
import { exportDocx } from './docx.js';
import { buildPdf, paperPoints, mmToPt, bytesToBase64 } from './pdf.js';
import { tightPicture, svgToCanvas, canvasBytes, canWriteWebp } from '../exportimg.js';
import { encodeBmp, encodeTiff } from './image.js';
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
  const map = parseMapText(ext, r.text, name);
  return { map, kind: ext === MAP_EXT ? 'tmap' : 'import', mtime: r.mtime, readonly: !!r.readonly, path: r.path };
}

// A text format's map: .tmap / .json, FreeMind, OPML, Markdown, a text outline.
export function parseMapText(ext, text, name = '') {
  if (ext === MAP_EXT || ext === 'json') {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { const err = new Error(`Not a MyBrainMap file: ${e.message}`); err.code = 'EFORMAT'; throw err; }
    if (!obj || typeof obj !== 'object' || !obj.root) { const err = new Error('Not a MyBrainMap file'); err.code = 'EFORMAT'; throw err; }
    return normalizeMap(obj);
  }
  if (ext === 'mm') return importFreeMind(text, name);
  if (ext === 'opml') return importOpml(text, name);
  if (ext === 'md' || ext === 'markdown') return importMarkdown(text, name);
  if (ext === 'txt') return importTextOutline(text, name);
  const err = new Error(`Unsupported file type: .${ext}`); err.code = 'EFORMAT'; throw err;
}

// A map file dropped on the browser page (a File, not a path): every format the app opens,
// the ZIP ones (XMind, MindManager) unpacked by the host. → the map
export async function readDroppedMap(file, call) {
  const name = file.name || '';
  const ext = extOf(name);
  if (ext === 'xmind' || ext === 'mmap') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const z = await call('zip.readData', { base64: bytesToBase64(bytes), name });
    return ext === 'xmind' ? importXmind(z.entries, name) : importMmap(z.entries, name);
  }
  return parseMapText(ext, await file.text(), name);
}

export const serializeMap = (map) => JSON.stringify(map, null, 1);

export async function writeMapFile(path, map, call) {
  return call('file.writeText', { path, text: serializeMap(map) });
}

// ── exports ──

// picture: the map drawn as a picture; raster: pixels (a scale applies); alpha: the format can keep
// a transparent background, so the export asks whether to
export const EXPORTS = [
  { id: 'png', ext: 'png', icon: 'image', label: ['PNG 그림', 'PNG picture'], desc: ['투명 배경 가능, 배율 선택', 'Transparent background, any scale'], picture: true, raster: true, alpha: true, mime: 'image/png' },
  { id: 'jpeg', ext: 'jpg', icon: 'image', label: ['JPEG 그림', 'JPEG picture'], desc: ['작은 파일', 'Smaller files'], picture: true, raster: true, mime: 'image/jpeg' },
  { id: 'webp', ext: 'webp', icon: 'image', label: ['WebP 그림', 'WebP picture'], desc: ['작은 파일, 투명 배경 가능', 'Small files, transparent background'], picture: true, raster: true, alpha: true, mime: 'image/webp', needs: 'webp' },
  { id: 'bmp', ext: 'bmp', icon: 'image', label: ['BMP 그림', 'BMP picture'], desc: ['압축하지 않은 비트맵', 'Uncompressed bitmap'], picture: true, raster: true },
  { id: 'tiff', ext: 'tif', icon: 'image', label: ['TIFF 그림', 'TIFF picture'], desc: ['인쇄 · 편집용, 투명 배경 가능', 'For print and editing, transparent background'], picture: true, raster: true, alpha: true },
  { id: 'svg', ext: 'svg', icon: 'image', label: ['SVG 벡터 그림', 'SVG vector picture'], desc: ['확대해도 선명, 투명 배경 가능', 'Sharp at any size, transparent background'], picture: true, alpha: true },
  { id: 'pdf', ext: 'pdf', icon: 'filePdf', label: ['PDF 문서', 'PDF document'], desc: ['맵 한 장 (용지 크기 선택)', 'The map on a page (paper size)'], picture: true, raster: true },
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

// The exports this engine can write (WebP only where the canvas encodes it).
export const availableExports = (can = { webp: canWriteWebp() }) => EXPORTS.filter((e) => !e.needs || can[e.needs]);

// Writes the export `id` of the map to `path`.
// opts: { lang, settings, scale, transparent, padding (px of room around every shape — the picture
//         is the area the shapes cover plus that, 0 = flush; settings.exportMargin when not given),
//         paper, landscape, margin (mm, PDF) }
export async function exportMap(id, map, path, call, opts = {}) {
  const lang = opts.lang || 'ko';
  const fmt = exportById(id);
  const picture = (transparent = false) => tightPicture(map, { lang, settings: opts.settings || {}, margin: opts.padding ?? (opts.settings && opts.settings.exportMargin) ?? 20, transparent });
  // a raster format: the picture on a canvas, on the map's background unless it is kept transparent
  const raster = async (scale = opts.scale || 2) => {
    const clear = !!(fmt && fmt.alpha && opts.transparent);
    const pic = await picture(clear);
    return { pic, canvas: await svgToCanvas(pic.svg, pic.width, pic.height, scale, clear ? null : pic.ms.bg), clear };
  };
  const pixels = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  switch (id) {
    case 'png': case 'jpeg': case 'webp': {
      const { canvas } = await raster();
      const bytes = await canvasBytes(canvas, fmt.mime, 0.92);
      return call('file.writeBase64', { path, base64: bytesToBase64(bytes) });
    }
    case 'bmp': {
      const { canvas } = await raster();
      return call('file.writeBase64', { path, base64: bytesToBase64(encodeBmp(pixels(canvas), canvas.width, canvas.height)) });
    }
    case 'tiff': {
      const { canvas, clear } = await raster();
      return call('file.writeBase64', { path, base64: bytesToBase64(encodeTiff(pixels(canvas), canvas.width, canvas.height, { alpha: clear })) });
    }
    case 'svg': {
      const pic = await picture(!!opts.transparent);
      return call('file.writeText', { path, text: `<?xml version="1.0" encoding="UTF-8"?>\n${pic.svg}\n` });
    }
    case 'pdf': {
      const { pic, canvas } = await raster(Math.max(2, opts.scale || 2));
      const jpeg = await canvasBytes(canvas, 'image/jpeg', 0.93);
      const landscape = opts.landscape ?? pic.width >= pic.height;
      const paper = opts.paper === 'fit' ? null : paperPoints(opts.paper || 'a4', landscape);
      const bytes = buildPdf([{ jpeg, width: canvas.width, height: canvas.height }], { paper, margin: mmToPt(opts.margin ?? 10), title: mapTitle(map) });
      return call('file.writeBase64', { path, base64: bytesToBase64(bytes) });
    }
    case 'docx': {
      const pic = await picture();
      const canvas = await svgToCanvas(pic.svg, pic.width, pic.height, 2, pic.ms.bg);
      const png = bytesToBase64(await canvasBytes(canvas, 'image/png'));
      const files = exportDocx(map, { image: { base64: png, width: pic.width, height: pic.height }, lang });
      return call('zip.write', { path, files });
    }
    case 'html': {
      const pic = await picture();
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
