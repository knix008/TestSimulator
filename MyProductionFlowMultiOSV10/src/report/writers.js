// The report model (content.js) written as Markdown, HTML, Word (.docx) and PDF — every one with the pictures.
//   Markdown: one .md file, pictures inline as data: URLs (shown by VS Code, Typora, GitHub-style viewers …).
//   HTML: one self-contained page, pictures inline.
//   Word: a .docx package (store-only ZIP) with the pictures in word/media, headings, tables and bullets.
//   PDF: the printed pages (paginate.js) as JPEG pictures, so it looks exactly like the print preview.
import { paginate } from './paginate.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const xml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

// ───────────────────────── Markdown

export function toMarkdown(doc) {
  const out = [`# ${doc.title}`, '', `_${doc.subtitle ?? ''}_`, ''];
  for (const b of doc.blocks) {
    switch (b.t) {
      case 'h1': out.push(`# ${b.text}`, ''); break;
      case 'h2': out.push(`## ${b.text}`, ''); break;
      case 'h3': out.push(`### ${b.text}`, ''); break;
      case 'p': out.push(b.text, ''); break;
      case 'note': out.push(`> ${b.text}`, ''); break;
      case 'bullets': out.push(...b.items.map((x) => `- ${x}`), ''); break;
      case 'kpis': out.push('| | |', '|---|---:|', ...b.items.map(([k, v]) => `| ${mdCell(k)} | **${mdCell(v)}** |`), ''); break;
      case 'table': out.push(`| ${b.head.map(mdCell).join(' | ')} |`, `|${b.head.map((_, i) => ((b.align?.[i] ?? 'l') === 'r' ? '---:' : '---')).join('|')}|`, ...b.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`), ''); break;
      case 'image': out.push(`![${b.caption ?? ''}](${b.src})`, '', b.caption ? `*${b.caption}*` : '', ''); break;
      default: break;
    }
  }
  return out.join('\n');
}

// ───────────────────────── HTML

const HTML_CSS = `body{font-family:system-ui,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#1f2937;max-width:960px;margin:32px auto;padding:0 20px;line-height:1.55}
h1{font-size:28px;margin:0 0 4px}h2{color:#1e3a8a;border-bottom:1px solid #dbe3f4;padding-bottom:4px;margin-top:32px}h3{margin:18px 0 6px}
.sub{color:#6b7280;margin:0 0 18px}.note{color:#6b7280}
table{border-collapse:collapse;width:100%;margin:8px 0 16px;font-size:14px;font-variant-numeric:tabular-nums}th,td{border-bottom:1px solid #d1d9e6;padding:5px 8px;text-align:left}th{background:#e8eefb}td.r,th.r{text-align:right}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin:8px 0 16px}.kpi{background:#f1f5fb;border:1px solid #d6def0;border-radius:8px;padding:8px 10px}.kpi small{display:block;color:#6b7280}.kpi b{font-size:18px}
figure{margin:12px 0 20px;text-align:center}figure img{max-width:100%;border:1px solid #d1d9e6;border-radius:4px}figcaption{color:#6b7280;font-size:13px;margin-top:4px}
@media print{body{margin:0;max-width:none}h2{break-after:avoid}figure,table{break-inside:avoid}}`;

export function toHtml(doc, lang = 'ko') {
  const parts = [];
  for (const b of doc.blocks) {
    switch (b.t) {
      case 'h1': parts.push(`<h1>${esc(b.text)}</h1>`); break;
      case 'h2': parts.push(`<h2>${esc(b.text)}</h2>`); break;
      case 'h3': parts.push(`<h3>${esc(b.text)}</h3>`); break;
      case 'p': parts.push(`<p>${esc(b.text)}</p>`); break;
      case 'note': parts.push(`<p class="note">${esc(b.text)}</p>`); break;
      case 'bullets': parts.push(`<ul>${b.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`); break;
      case 'kpis': parts.push(`<div class="kpis">${b.items.map(([k, v]) => `<div class="kpi"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>`); break;
      case 'table': { const cls = (i) => ((b.align?.[i] ?? 'l') === 'r' ? ' class="r"' : ''); parts.push(`<table><thead><tr>${b.head.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td${cls(i)}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`); break; }
      case 'image': parts.push(`<figure><img src="${b.src}" alt="${esc(b.caption ?? '')}"/>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`); break;
      default: break;
    }
  }
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.title)}</title><style>${HTML_CSS}</style></head><body><h1>${esc(doc.title)}</h1><p class="sub">${esc(doc.subtitle ?? '')}</p>${parts.join('\n')}</body></html>`;
}

// ───────────────────────── ZIP (store only) for the .docx package

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** entries: [{ name, data: Uint8Array | string }] → the ZIP's bytes (no compression). */
export function zipStore(entries, date = new Date()) {
  const enc = new TextEncoder();
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() >> 1) & 31);
  const day = (((Math.max(1980, date.getFullYear()) - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  const chunks = []; const central = []; let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name); const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data; const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, time, true); local.setUint16(12, day, true); local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, time, true); c.setUint16(14, day, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let o = 0; for (const b of all) { out.set(b, o); o += b.length; }
  return out;
}

// ───────────────────────── Word (.docx)

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const CONTENT_TWIPS = 11906 - 2 * 1134; // A4 width minus 2 cm margins
const EMU_PER_TWIP = 635;

/** data: URL → { bytes, ext } */
export function dataUrlBytes(url) {
  const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(String(url));
  if (!m) return null;
  const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, ext: m[1].toLowerCase() === 'png' ? 'png' : 'jpeg' };
}

const run = (text, bold = false, size = 0, color = '') => `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const para = (inner, style = '', extra = '') => `<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>` : ''}${inner}</w:p>`;

export function toDocx(doc) {
  const media = [];
  const body = [para(run(doc.title), 'Title'), para(run(doc.subtitle ?? '', false, 18, '6B7280'))];
  const table = (head, rows, align) => {
    const n = head.length; const w = Math.floor(CONTENT_TWIPS / n);
    const cell = (text, i, isHead) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${isHead ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EEFB"/>' : ''}</w:tcPr>${para(run(text, isHead, 18), '', (align?.[i] ?? 'l') === 'r' ? '<w:jc w:val="right"/>' : '')}</w:tc>`;
    const border = '<w:top w:val="single" w:sz="4" w:color="D1D9E6"/><w:bottom w:val="single" w:sz="4" w:color="D1D9E6"/><w:insideH w:val="single" w:sz="4" w:color="D1D9E6"/>';
    return `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_TWIPS}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${head.map(() => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((h, i) => cell(h, i, true)).join('')}</w:tr>${rows.map((r) => `<w:tr>${r.map((c, i) => cell(c, i, false)).join('')}</w:tr>`).join('')}</w:tbl>${para('')}`;
  };
  for (const b of doc.blocks) {
    switch (b.t) {
      case 'h1': body.push(para(run(b.text), 'Heading1')); break;
      case 'h2': body.push(para(run(b.text), 'Heading2')); break;
      case 'h3': body.push(para(run(b.text), 'Heading3')); break;
      case 'p': body.push(para(run(b.text))); break;
      case 'note': body.push(para(run(b.text, false, 0, '6B7280'))); break;
      case 'bullets': for (const it of b.items) body.push(para(run(`• ${it}`), '', '<w:ind w:left="360"/>')); break;
      case 'kpis': body.push(table(b.items.map(([k]) => k), [b.items.map(([, v]) => v)], b.items.map(() => 'l'))); break;
      case 'table': body.push(table(b.head, b.rows, b.align)); break;
      case 'image': {
        const img = dataUrlBytes(b.src);
        if (!img) break;
        media.push(img);
        const n = media.length; const rid = `rIdImg${n}`;
        const cxMax = CONTENT_TWIPS * EMU_PER_TWIP;
        const cx = cxMax; const cy = Math.round(cx * ((b.h || 1) / (b.w || 1)));
        const maxCy = Math.round(cxMax * 1.2); const k = cy > maxCy ? maxCy / cy : 1;
        const [w, h] = [Math.round(cx * k), Math.round(cy * k)];
        body.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/><wp:docPr id="${n}" name="Picture ${n}" descr="${xml(b.caption ?? '')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${A}"><a:graphicData uri="${PIC}"><pic:pic xmlns:pic="${PIC}"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.${img.ext === 'png' ? 'png' : 'jpeg'}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
        if (b.caption) body.push(para(run(b.caption, false, 18, '6B7280'), '', '<w:jc w:val="center"/>'));
        break;
      }
      default: break;
    }
  }
  const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const document = `${DECL}<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP}"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const font = '<w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="맑은 고딕" w:cs="Segoe UI"/>';
  const heading = (id, name, size, color) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${id === 'Title' ? 0 : Number(id.slice(-1)) - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  const styles = `${DECL}<w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${heading('Title', 'Title', 40, '111827')}${heading('Heading1', 'heading 1', 32, '111827')}${heading('Heading2', 'heading 2', 28, '1E3A8A')}${heading('Heading3', 'heading 3', 23, '111827')}</w:styles>`;
  const rels = `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${R_NS}/styles" Target="styles.xml"/>${media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="${R_NS}/image" Target="media/image${i + 1}.${m.ext === 'png' ? 'png' : 'jpeg'}"/>`).join('')}</Relationships>`;
  const types = `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const core = `${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(doc.title)}</dc:title><dc:creator>MyProductionFlow</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`;
  const rootRels = `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/_rels/document.xml.rels', data: rels },
    ...media.map((m, i) => ({ name: `word/media/image${i + 1}.${m.ext === 'png' ? 'png' : 'jpeg'}`, data: m.bytes })),
  ]);
}

// ───────────────────────── PDF (the printed pages as pictures)

const MM_PT = 72 / 25.4;
/** pages: [{ jpeg: Uint8Array, width, height (px), widthMm, heightMm }] → PDF bytes. */
export function pdfFromJpegPages(pages, { title = '' } = {}) {
  const enc = new TextEncoder(); const parts = []; const offsets = []; let length = 0;
  const push = (chunk) => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
  const obj = (num, body) => { offsets[num] = length; push(`${num} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  const pageObj = (i) => 4 + i * 3;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  obj(3, `<< /Title (${String(title).replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '')}) /Producer (MyProductionFlow) >>`);
  pages.forEach((page, i) => {
    const w = +(page.widthMm * MM_PT).toFixed(2); const h = +(page.heightMm * MM_PT).toFixed(2); const p = pageObj(i);
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`);
    obj(p + 1, [`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`, page.jpeg, '\nendstream']);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`;
    obj(p + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const size = 4 + pages.length * 3; const xref = length;
  let tbl = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let k = 1; k < size; k++) tbl += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
  push(tbl); push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length); let o = 0; for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}

const canvasJpeg = (c, q = 0.9) => dataUrlBytes(c.toDataURL('image/jpeg', q)).bytes;

/** The report as a PDF: the same pages as printing. */
export async function toPdf(doc, setup = {}) {
  const { pages, widthMm, heightMm } = await paginate(doc, setup);
  return pdfFromJpegPages(pages.map((c) => ({ jpeg: canvasJpeg(c), width: c.width, height: c.height, widthMm, heightMm })), { title: doc.title });
}
