// Diagram export: any on-screen SVG diagram to SVG, PNG or a printable PDF.
//
// The live SVG uses CSS custom properties for its colors, which do not survive
// being pulled out of the document — so the export resolves every var() to a
// literal value first. Without that step the exported file is a black-on-black
// rectangle, which is exactly the bug this function exists to prevent.

import { themeTokens } from '../themes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Clones an SVG element and bakes in the current theme's colors.
 * @param {SVGSVGElement} svg
 * @param {string} themeId
 * @returns {{markup:string, width:number, height:number}}
 */
export function serializeSvg(svg, themeId) {
  const tokens = themeTokens(themeId);
  const clone = svg.cloneNode(true);

  const box = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width
    ? { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height }
    : { width: svg.clientWidth || 1200, height: svg.clientHeight || 800 };

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
  clone.setAttribute('width', String(box.width));
  clone.setAttribute('height', String(box.height));

  // A painted background: an SVG with a transparent ground turns unreadable
  // when the viewer's own page is a different brightness.
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', tokens['--diagram-bg']);
  clone.insertBefore(bg, clone.firstChild);

  // The diagram's own font stack must travel with it.
  const styleEl = document.createElementNS(SVG_NS, 'style');
  styleEl.textContent =
    'text{font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",-apple-system,"Segoe UI",sans-serif}';
  clone.insertBefore(styleEl, clone.firstChild);

  return {
    markup: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone),
    width: box.width,
    height: box.height,
  };
}

/**
 * Rasterizes a serialized SVG to PNG bytes.
 * @returns {Promise<ArrayBuffer>}
 */
export function svgToPng({ markup, width, height }, scale = 2) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(image, 0, 0, width, height);
      canvas.toBlob((out) => {
        if (!out) {
          reject(new Error('canvas.toBlob returned null'));
          return;
        }
        out.arrayBuffer().then(resolve, reject);
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG could not be rasterized'));
    };
    image.src = url;
  });
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
 * @param {'svg'|'png'|'pdf'} format
 * @param {{platform:object, themeId:string, fileName:string, title:string}} options
 */
export async function exportDiagram(container, format, options) {
  const svg = container ? container.querySelector('svg') : null;
  if (!svg) throw new Error('No diagram is currently rendered.');

  const serialized = serializeSvg(svg, options.themeId);
  const base = (options.fileName || 'diagram').replace(/[\\/:*?"<>|]/g, '_');

  if (format === 'svg') {
    return options.platform.saveTextFile({
      defaultName: base + '.svg',
      filters: [{ name: 'SVG', extensions: ['svg'] }],
      text: serialized.markup,
      mime: 'image/svg+xml;charset=utf-8',
    });
  }

  if (format === 'png') {
    const png = await svgToPng(serialized, 2);
    return options.platform.saveBinaryFile({
      defaultName: base + '.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
      data: png,
      mime: 'image/png',
    });
  }

  return options.platform.exportPdf({
    html: svgToPrintableHtml(serialized, options.title || base, options.themeId),
    defaultName: base + '.pdf',
    landscape: serialized.width > serialized.height,
  });
}
