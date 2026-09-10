// Diagram export: any on-screen SVG diagram to SVG, PNG, WebP, JPEG, GIF or a
// printable PDF.
//
// Three things this has to get right:
//
//  1. **Colours.** The live SVG paints with CSS custom properties, which mean
//     nothing once the markup leaves the document. Every `var()` is resolved to
//     a literal before serializing — without that step the exported file is a
//     black-on-black rectangle.
//  2. **Size.** The export is cropped to the drawing's own bounding box, not to
//     the canvas the diagram happens to be laid out on, so there is no band of
//     empty background around the shapes.
//  3. **Transparency.** Formats that support alpha can be exported without any
//     background at all, for dropping into a document that has its own.

import { encodeGif } from '../lib/gif.js';
import { themeTokens } from '../themes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Padding kept around the drawing so strokes are not clipped at the edge. */
const CROP_PADDING = 8;

/** What each format can do, and how it is produced. */
export const IMAGE_FORMATS = [
  { id: 'png', label: 'PNG', extension: 'png', mime: 'image/png', transparency: true, kind: 'canvas' },
  { id: 'webp', label: 'WebP', extension: 'webp', mime: 'image/webp', transparency: true, kind: 'canvas' },
  { id: 'jpg', label: 'JPEG', extension: 'jpg', mime: 'image/jpeg', transparency: false, kind: 'canvas' },
  { id: 'gif', label: 'GIF', extension: 'gif', mime: 'image/gif', transparency: true, kind: 'gif' },
  { id: 'svg', label: 'SVG', extension: 'svg', mime: 'image/svg+xml', transparency: true, kind: 'vector' },
  { id: 'pdf', label: 'PDF', extension: 'pdf', mime: 'application/pdf', transparency: false, kind: 'print' },
];

export function getFormat(id) {
  return IMAGE_FORMATS.find((format) => format.id === id) || IMAGE_FORMATS[0];
}

/**
 * The drawing's own bounds in user units, or null when it cannot be measured.
 * `getBBox` ignores the viewBox and reports where the content actually is.
 */
function contentBounds(svg) {
  try {
    const box = svg.getBBox();
    if (!Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width <= 0 || box.height <= 0) return null;
    return box;
  } catch {
    return null;
  }
}

/**
 * Clones an SVG, bakes in the current theme's colours, and crops it to its
 * content.
 *
 * @param {SVGSVGElement} svg
 * @param {string} themeId
 * @param {{transparent?: boolean, crop?: boolean}} [options]
 * @returns {{markup:string, width:number, height:number}}
 */
export function serializeSvg(svg, themeId, options = {}) {
  const tokens = themeTokens(themeId);
  const clone = svg.cloneNode(true);

  const viewBox = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
  const full = {
    x: 0,
    y: 0,
    width: viewBox && viewBox.width ? viewBox.width : svg.clientWidth || 1200,
    height: viewBox && viewBox.height ? viewBox.height : svg.clientHeight || 800,
  };

  const bounds = options.crop === false ? null : contentBounds(svg);
  const box = bounds
    ? {
        x: bounds.x - CROP_PADDING,
        y: bounds.y - CROP_PADDING,
        width: bounds.width + CROP_PADDING * 2,
        height: bounds.height + CROP_PADDING * 2,
      }
    : full;

  const resolve = (value) => {
    if (!value || value.indexOf('var(') === -1) return value;
    return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fallback) => tokens[name] || fallback || 'currentColor');
  };

  const walk = (node) => {
    if (node.nodeType !== 1) return;
    for (const attr of ['fill', 'stroke', 'stop-color', 'color']) {
      const value = node.getAttribute(attr);
      if (value) node.setAttribute(attr, resolve(value));
    }
    const style = node.getAttribute('style');
    if (style) node.setAttribute('style', resolve(style));
    for (const child of node.childNodes) walk(child);
  };
  walk(clone);

  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('viewBox', box.x + ' ' + box.y + ' ' + box.width + ' ' + box.height);
  clone.setAttribute('width', String(box.width));
  clone.setAttribute('height', String(box.height));
  // The live element carries a pan/zoom transform; the export must not.
  clone.removeAttribute('style');

  if (!options.transparent) {
    // A painted ground: an SVG with a transparent background turns unreadable
    // when the viewer's own page is a different brightness.
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', String(box.x));
    bg.setAttribute('y', String(box.y));
    bg.setAttribute('width', String(box.width));
    bg.setAttribute('height', String(box.height));
    bg.setAttribute('fill', tokens['--diagram-bg']);
    clone.insertBefore(bg, clone.firstChild);
  }

  // The diagram's own font stack must travel with it.
  const styleEl = document.createElementNS(SVG_NS, 'style');
  styleEl.textContent =
    'text{font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",-apple-system,"Segoe UI",sans-serif}';
  clone.insertBefore(styleEl, clone.firstChild);

  return {
    markup: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone),
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  };
}

/** Loads serialized SVG markup into an <img> and draws it onto a canvas. */
function rasterize({ markup, width, height }, scale, background) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // A data: URL rather than a blob: URL — in a file:// renderer a blob can be
    // treated as an opaque origin, which taints the canvas and makes every
    // subsequent toBlob/getImageData throw a SecurityError.
    const encoded = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');

      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error('The diagram could not be rasterized.'));
    image.src = encoded;
  });
}

function canvasToBytes(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('The image could not be encoded as ' + mime + '.'));
          return;
        }
        blob.arrayBuffer().then(resolve, reject);
      },
      mime,
      quality,
    );
  });
}

/**
 * Renders a serialized diagram to image bytes.
 * @returns {Promise<{data: ArrayBuffer|Uint8Array, extension: string, mime: string}>}
 */
export async function renderImage(serialized, formatId, { scale = 2, transparent = false, themeId, quality = 0.92 } = {}) {
  const format = getFormat(formatId);
  const tokens = themeTokens(themeId);
  // JPEG has no alpha: without a painted ground it comes out black.
  const wantsTransparent = transparent && format.transparency;
  const background = wantsTransparent ? null : tokens['--diagram-bg'];

  const canvas = await rasterize(serialized, scale, background);

  if (format.kind === 'gif') {
    const ctx = canvas.getContext('2d');
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      data: encodeGif(image.data, canvas.width, canvas.height, { transparent: wantsTransparent }),
      extension: format.extension,
      mime: format.mime,
    };
  }

  return {
    data: await canvasToBytes(canvas, format.mime, quality),
    extension: format.extension,
    mime: format.mime,
  };
}

/** Wraps a serialized diagram in a printable HTML page (for PDF export). */
export function svgToPrintableHtml({ markup, width, height }, title, themeId) {
  const tokens = themeTokens(themeId);
  const landscape = width > height;
  const body = markup.replace(/^<\?xml[^?]*\?>\s*/, '');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:12mm}
  body{margin:0;background:${tokens['--diagram-bg']};color:${tokens['--text']};
    font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif}
  h1{font-size:15px;margin:0 0 10px;font-weight:600}
  .wrap{padding:16px}
  svg{max-width:100%;height:auto}
</style></head>
<body><div class="wrap"><h1>${escapeHtml(title)}</h1>${body}</div></body></html>`;
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Exports the diagram currently rendered inside `container`.
 *
 * @param {HTMLElement} container element holding exactly one <svg>
 * @param {object} options `{platform, themeId, fileName, title, format, transparent, scale}`
 */
export async function exportDiagram(container, options) {
  const svg = container ? container.querySelector('svg') : null;
  if (!svg) throw new Error('No diagram is currently rendered.');

  const format = getFormat(options.format);
  const transparent = !!options.transparent && format.transparency;
  const serialized = serializeSvg(svg, options.themeId, { transparent });
  const base = (options.fileName || 'diagram').replace(/[\\/:*?"<>|]/g, '_');

  if (format.kind === 'vector') {
    return options.platform.saveTextFile({
      defaultName: base + '.svg',
      filters: [{ name: 'SVG', extensions: ['svg'] }],
      text: serialized.markup,
      mime: 'image/svg+xml;charset=utf-8',
    });
  }

  if (format.kind === 'print') {
    return options.platform.exportPdf({
      html: svgToPrintableHtml(serialized, options.title || base, options.themeId),
      defaultName: base + '.pdf',
      landscape: serialized.width > serialized.height,
    });
  }

  const image = await renderImage(serialized, format.id, {
    scale: options.scale || 2,
    transparent,
    themeId: options.themeId,
  });

  return options.platform.saveBinaryFile({
    defaultName: base + '.' + image.extension,
    filters: [{ name: format.label, extensions: [image.extension] }],
    data: image.data,
    mime: image.mime,
  });
}
