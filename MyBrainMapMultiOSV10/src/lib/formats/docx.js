// Word (.docx): the map picture on the first page, then the topics as an
// outline — the central topic as the title, levels 1‥6 as Heading 1‥6, deeper
// ones as indented bullets — with task lines and notes under each topic.
// The package parts are returned for zip.write.
import { mapTitle } from '../model.js';
import { escapeXml } from './xml.js';
import { markerLabel } from '../markers.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

const run = (text, props = '') => {
  const lines = String(text).split('\n');
  return lines.map((l, i) => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(l)}</w:t></w:r>`).join('');
};
const para = (content, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`;

function taskText(task, lang) {
  if (!task) return '';
  const p = [];
  if (task.priority) p.push(markerLabel(`priority-${task.priority}`, lang));
  if (task.progress != null) p.push(`${task.progress}%`);
  if (task.start) p.push(`${lang === 'ko' ? '시작' : 'Start'} ${task.start}`);
  if (task.due) p.push(`${lang === 'ko' ? '마감' : 'Due'} ${task.due}`);
  if (task.effort) p.push(`${task.effort}${lang === 'ko' ? '시간' : 'h'}`);
  if (task.resources) p.push(task.resources);
  return p.join(' · ');
}

/** image: { base64 (PNG), width, height } in pixels, or null */
export function exportDocx(map, { image = null, lang = 'ko' } = {}) {
  const body = [];
  body.push(para(run(mapTitle(map) || 'Map'), '<w:pStyle w:val="Title"/>'));
  if (image) {
    const maxW = 5733288, maxH = 7315200;   // 6.27 in × 8 in, in EMU
    let cx = image.width * 9525, cy = image.height * 9525;
    const k = Math.min(1, maxW / cx, maxH / cy);
    cx = Math.round(cx * k); cy = Math.round(cy * k);
    body.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Map"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${A}"><a:graphicData uri="${PIC}"><pic:pic xmlns:pic="${PIC}"><pic:nvPicPr><pic:cNvPr id="0" name="map.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdMap"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
    body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  }
  const extras = (t, indent) => {
    const ind = indent ? `<w:ind w:left="${indent}"/>` : '';
    const tt = taskText(t.task, lang);
    if (tt) body.push(para(run(tt, '<w:i/><w:color w:val="6B7785"/><w:sz w:val="18"/>'), ind));
    const marks = [...(t.icons || []).map((i) => `[${markerLabel(i, lang)}]`), ...(t.tags || []).map((g) => `#${g}`)];
    if (marks.length) body.push(para(run(marks.join(' '), '<w:color w:val="2C4A6E"/><w:sz w:val="18"/>'), ind));
    if (t.link && t.link.url) body.push(para(run(t.link.url, '<w:color w:val="1565C0"/><w:u w:val="single"/><w:sz w:val="18"/>'), ind));
    if (t.notes) for (const block of String(t.notes).split(/\n{2,}/)) body.push(para(run(block), ind));
  };
  const walk = (t, d) => {
    if (d === 0) extras(t, 0);
    else if (d <= 6) { body.push(para(run(t.text || ''), `<w:pStyle w:val="Heading${d}"/>`)); extras(t, 0); }
    else { const indent = 360 * (d - 6); body.push(para(run(`• ${t.text || ''}`), `<w:ind w:left="${indent}"/>`)); extras(t, indent + 240); }
    (t.children || []).forEach((c) => walk(c, d + 1));
  };
  walk(map.root, 0);
  for (const f of map.floating || []) walk(f, 1);

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1134" w:bottom="1440" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const heading = (n, size, color) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${n <= 2 ? 300 : 200}" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Malgun Gothic" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="${lang === 'ko' ? 'ko-KR' : 'en-US'}" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3B5C"/><w:sz w:val="48"/></w:rPr></w:style>
${heading(1, 36, '1F3B5C')}${heading(2, 30, '2C5AA0')}${heading(3, 26, '2C5AA0')}${heading(4, 24, '3B6EA5')}${heading(5, 22, '3B6EA5')}${heading(6, 22, '4A5A6E')}
</w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${image ? '<Relationship Id="rIdMap" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/map.png"/>' : ''}</Relationships>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(mapTitle(map))}</dc:title><dc:creator>My BrainMap</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

  const files = [
    { name: '[Content_Types].xml', text: contentTypes },
    { name: '_rels/.rels', text: rels },
    { name: 'docProps/core.xml', text: core },
    { name: 'word/document.xml', text: document },
    { name: 'word/styles.xml', text: styles },
    { name: 'word/_rels/document.xml.rels', text: docRels },
  ];
  if (image) files.push({ name: 'word/media/map.png', base64: image.base64 });
  return files;
}
