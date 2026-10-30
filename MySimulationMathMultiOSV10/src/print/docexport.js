// 문서로 내보내기: what the print dialog shows, as a document file —
//   HTML      one file, images embedded, page-like margins
//   Markdown  .md + the images as files next to it (name_1.png …)
//   Word      .docx (title, date, images fitted to the page with captions,
//             code with syntax colours, tables), page margins from the setup
// (PDF is the print pipeline: the desktop's PDF writer, or the browser's
// print dialog.) Pure apart from DOMParser for html content (tables).
import { zipWrite } from '../../core/lib/io/archive.js';
import { base64ToBytes } from '../graphics/encode.js';
import { isMFile } from '../../core/lang/mext.js';
import { normalizeSetup, runsToLines, printImages, IMAGE_PADS, esc } from './printdoc.js';

// syntax / command window colours (printdoc.js contentCss)
const RUN_STYLE = {
  'tk-k': ['0033B3', true], 'tk-f': ['00627A'], 'tk-s': ['067D17'], 'tk-c': ['6A737D', false, true], 'tk-n': ['1750EB'], 'tk-o': ['444444'],
  'tk-b': ['555555'], 'tk-m': ['9E880D'], 'tk-a': ['871094'], 'tk-i': ['CC0000'],
  'cw-err': ['C00000'], 'cw-warn': ['A05A00'], 'cw-echo': ['0B4F8A', true], 'cw-info': ['555555', false, true],
};

/** The content of a print spec as document blocks: { title, date, blocks: [image | code | html] }. */
export function documentOf(spec, setup, date = '') {
  const s = normalizeSetup(setup);
  const kind = spec.kind || 'text';
  const blocks = [];
  if (kind === 'image') {
    for (const im of printImages(spec, s)) blocks.push({ type: 'image', dataUrl: im.dataUrl, caption: im.caption || '', width: im.widthPx || 0, height: im.heightPx || 0 });
  } else if (kind === 'html') {
    blocks.push({ type: 'html', html: String(spec.html || '') });
  } else {
    const runs = spec.runs || [{ t: spec.text || '' }];
    const lines = runsToLines(runs);
    if (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();
    blocks.push({ type: 'code', lines, language: kind === 'code' && (spec.language === 'm' || isMFile(spec.title)) ? 'octave' : '' });
  }
  return { title: String(spec.title || ''), date, pad: IMAGE_PADS[s.imagePad], margins: s.margins, blocks };
}

const lineText = (line) => line.map((r) => r.t).join('');

// ── HTML ──
export function toHtml(doc) {
  const body = doc.blocks.map((b) => {
    if (b.type === 'image') return `<figure><img src="${esc(b.dataUrl)}" alt="${esc(b.caption || doc.title)}">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`;
    if (b.type === 'html') return `<div class="content">${bodyOf(b.html)}</div>`;
    return `<pre class="code">${b.lines.map((line) => line.map((r) => (r.c ? `<span class="${esc(r.c)}">${esc(r.t)}</span>` : esc(r.t))).join('')).join('\n')}</pre>`;
  }).join('\n');
  const m = doc.margins || { top: 15, right: 15, bottom: 15, left: 15 };
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>
  body { margin: 0; background: #f3f4f6; color: #1f2933; font-family: "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; line-height: 1.5; }
  main { max-width: 210mm; margin: 24px auto; background: #fff; padding: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; box-sizing: border-box; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
  h1 { font-size: 20pt; margin: 0 0 2mm; } .meta { color: #6b7280; margin: 0 0 8mm; font-size: 10pt; }
  figure { margin: 0 0 8mm; padding: ${doc.pad}mm; text-align: center; break-inside: avoid; }
  figure img { max-width: 100%; height: auto; } figcaption { margin-top: 2mm; color: #374151; font-size: 10pt; }
  pre.code { font-family: "Cascadia Mono", Consolas, "D2Coding", monospace; font-size: 10pt; white-space: pre-wrap; overflow-wrap: anywhere; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4mm; }
  .content table { border-collapse: collapse; } .content th, .content td { border: 1px solid #999; padding: 2px 8px; text-align: right; } .content th { background: #eee; }
  .tk-k { color: #0033b3; font-weight: 600; } .tk-f { color: #00627a; } .tk-s { color: #067d17; } .tk-c { color: #6a737d; font-style: italic; } .tk-n { color: #1750eb; }
  .tk-o { color: #444; } .tk-b { color: #555; } .tk-m { color: #9e880d; } .tk-a { color: #871094; } .tk-i { color: #c00; }
  .cw-err { color: #c00000; } .cw-warn { color: #a05a00; } .cw-echo { color: #0b4f8a; font-weight: 600; } .cw-info { color: #555; font-style: italic; }
  @media print { body { background: #fff; } main { box-shadow: none; margin: 0; max-width: none; } }
</style>
</head>
<body>
<main>
<h1>${esc(doc.title)}</h1>
${doc.date ? `<p class="meta">${esc(doc.date)}</p>` : ''}
${body}
</main>
</body>
</html>
`;
}

function bodyOf(html) {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return (m ? m[1] : html).replace(/<script[\s\S]*?<\/script>/gi, '');
}

/** html → { tables: [[row cells]], text } (DOMParser in the browser; tags stripped elsewhere). */
function readHtml(html) {
  if (typeof DOMParser === 'undefined') return { parts: [{ type: 'text', text: bodyOf(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }] };
  const d = new DOMParser().parseFromString(html, 'text/html');
  const parts = [];
  for (const el of d.body.children) {
    if (el.tagName === 'TABLE') parts.push({ type: 'table', rows: [...el.rows].map((r) => [...r.cells].map((c) => ({ text: c.textContent.trim(), head: c.tagName === 'TH' }))) });
    else if (el.textContent.trim()) parts.push({ type: 'text', text: el.textContent.trim() });
  }
  return { parts };
}

// ── Markdown ──
/** Markdown text; imageName(i) is the file name of image i (written next to the .md). */
export function toMarkdown(doc, imageName = (i) => `image_${i + 1}.png`) {
  const out = [`# ${doc.title}`, ''];
  if (doc.date) out.push(`*${doc.date}*`, '');
  let n = 0;
  for (const b of doc.blocks) {
    if (b.type === 'image') {
      out.push(`![${(b.caption || doc.title).replace(/[[\]]/g, '')}](${encodeURI(imageName(n++))})`, '');
      if (b.caption) out.push(`*${b.caption}*`, '');
    } else if (b.type === 'html') {
      for (const p of readHtml(b.html).parts) {
        if (p.type === 'text') { out.push(p.text, ''); continue; }
        const rows = p.rows.filter((r) => r.length);
        if (!rows.length) continue;
        const width = Math.max(...rows.map((r) => r.length));
        const cell = (c) => (c ? c.text.replace(/\|/g, '\\|') : '');
        out.push(`| ${Array.from({ length: width }, (_, k) => cell(rows[0][k])).join(' | ')} |`, `|${' --- |'.repeat(width)}`);
        for (const r of rows.slice(1)) out.push(`| ${Array.from({ length: width }, (_, k) => cell(r[k])).join(' | ')} |`);
        out.push('');
      }
    } else {
      const fence = b.lines.some((l) => lineText(l).includes('```')) ? '~~~' : '```';
      out.push(`${fence}${b.language}`, ...b.lines.map(lineText), fence, '');
    }
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

// ── Word (.docx) ──
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (text, { color, bold, italic, mono, size } = {}) => {
  const pr = [mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Malgun Gothic" w:cs="Consolas"/>' : '', bold ? '<w:b/>' : '', italic ? '<w:i/>' : '', color ? `<w:color w:val="${color}"/>` : '', size ? `<w:sz w:val="${size}"/>` : ''].join('');
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
};
const para = (runs, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;

/** PNG size from its header: [w, h]. */
function pngSize(bytes) {
  if (bytes.length > 24 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return [dv.getUint32(16), dv.getUint32(20)];
  }
  return [800, 600];
}

function imageXml(rid, k, cx, cy, name) {
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${k}" name="${xml(name)}"/>`
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${k}" name="${xml(name)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
    + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

/** The .docx bytes of a document (A4; the setup's margins; images fitted to the text width and a page). */
export function toDocx(doc) {
  const m = doc.margins || { top: 15, right: 15, bottom: 15, left: 15 };
  const tw = (mm) => Math.round(mm * 56.6929); // twips
  const textW = 210 - m.left - m.right - 2 * (doc.pad || 0), textH = 297 - m.top - m.bottom - 30;
  const media = [];
  const body = [];
  body.push(para(run(doc.title, { bold: true, size: 36 }), '<w:spacing w:after="80"/>'));
  if (doc.date) body.push(para(run(doc.date, { color: '6B7280', size: 20 }), '<w:spacing w:after="240"/>'));
  for (const b of doc.blocks) {
    if (b.type === 'image') {
      const bytes = base64ToBytes(String(b.dataUrl).replace(/^data:[^,]*,/, ''));
      const [pw, ph] = pngSize(bytes);
      const k = media.length + 1;
      media.push({ name: `word/media/image${k}.png`, data: bytes });
      const mmW = Math.min(textW, (textH * pw) / ph), mmH = (mmW * ph) / pw;
      body.push(imageXml(`rIdImg${k}`, k, Math.round(mmW * 36000), Math.round(mmH * 36000), b.caption || doc.title));
      if (b.caption) body.push(para(run(b.caption, { color: '374151', size: 18 }), '<w:jc w:val="center"/><w:spacing w:after="240"/>'));
    } else if (b.type === 'html') {
      for (const p of readHtml(b.html).parts) {
        if (p.type === 'text') { body.push(para(run(p.text))); continue; }
        const rows = p.rows.map((r) => `<w:tr>${r.map((c) => `<w:tc><w:tcPr>${c.head ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : ''}</w:tcPr>${para(run(c.text, { mono: true, bold: c.head, size: 18 }), `<w:jc w:val="${c.head ? 'center' : 'right'}"/>`)}</w:tc>`).join('')}</w:tr>`).join('');
        body.push(`<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:color="999999"/>`).join('')}</w:tblBorders></w:tblPr>${rows}</w:tbl>`, para(''));
      }
    } else {
      for (const line of b.lines) {
        const runs = line.length ? line.map((r) => { const st = RUN_STYLE[r.c] || []; return run(r.t, { mono: true, size: 18, color: st[0], bold: st[1], italic: st[2] }); }).join('') : run('', { mono: true, size: 18 });
        body.push(para(runs, '<w:spacing w:before="0" w:after="0" w:line="252" w:lineRule="auto"/>'));
      }
    }
  }
  const sect = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${tw(m.top)}" w:right="${tw(m.right)}" w:bottom="${tw(m.bottom)}" w:left="${tw(m.left)}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<w:body>${body.join('')}${sect}</w:body></w:document>`;
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + media.map((x, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.png"/>`).join('')
    + '</Relationships>';
  const enc = (s) => new TextEncoder().encode(s);
  const files = [
    { name: '[Content_Types].xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>') },
    { name: '_rels/.rels', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>') },
    { name: 'docProps/core.xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(doc.title)}</dc:title><dc:creator>MySimulationMath</dc:creator></cp:coreProperties>`) },
    { name: 'word/document.xml', data: enc(documentXml) },
    { name: 'word/_rels/document.xml.rels', data: enc(rels) },
    ...media,
  ];
  return zipWrite(files);
}

/** PNG bytes of a document image (Markdown writes them next to the .md). */
export const imageBytes = (b) => base64ToBytes(String(b.dataUrl).replace(/^data:[^,]*,/, ''));
