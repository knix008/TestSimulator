'use strict';

// PresentationML (.pptx) writer for the export document model, zero
// dependencies. 16:9 slides: a title slide (title, subtitle, meta), then one
// or more slides per section (h1/h2 headings start a section). Paragraphs and
// lists become a text box, tables and key/value blocks become PowerPoint
// tables (long ones continue on the next slide), badges a coloured box and
// pictures are placed at their size or shrunk to the slide.

const { zip } = require('./zip');
const { x, DECL, w3cdtf } = require('./xml');
const M = require('./model');

const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.presentationml';

const EMU = 914400; // per inch
const SLIDE = { w: 12192000, h: 6858000 }; // 13.333 x 7.5 in
const MARGIN = Math.round(0.5 * EMU);
const BODY_TOP = Math.round(1.35 * EMU);
const BODY_BOTTOM = SLIDE.h - Math.round(0.45 * EMU);
const BODY_W = SLIDE.w - MARGIN * 2;
const LINE = Math.round(0.3 * EMU); // a text line / table row
const MAX_COLS = 8;

const FONT_LATIN = 'Segoe UI';
const FONT_EA = '맑은 고딕';
const STR = { ko: { cont: '(계속)', contents: '내용' }, en: { cont: '(continued)', contents: 'Contents' } };

const hex = (c, d) => (M.normColor(c) || d || '#1c2530').slice(1).toUpperCase();
const fonts = () => `<a:latin typeface="${FONT_LATIN}"/><a:ea typeface="${FONT_EA}"/><a:cs typeface="${FONT_LATIN}"/>`;

function run(text, { size = 16, bold = false, color = '1C2530' } = {}) {
  return `<a:r><a:rPr lang="ko-KR" altLang="en-US" sz="${size * 100}"${bold ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${fonts()}</a:rPr><a:t>${x(text)}</a:t></a:r>`;
}

function paras(lines, opts = {}) {
  return lines.map((l) => {
    const bullet = l.bullet ? '<a:pPr marL="285750" indent="-285750"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>' : '<a:pPr><a:buNone/></a:pPr>';
    return `<a:p>${bullet}${run(l.text, { ...opts, ...(l.opts || {}) })}</a:p>`;
  }).join('');
}

class Slide {
  constructor(title) {
    this.title = title;
    this.shapes = [];
    this.images = [];
    this.y = BODY_TOP;
    this.id = 2;
  }

  nextId() { return this.id++; }

  textBox(lines, { x: left = MARGIN, y, w = BODY_W, h, size = 16, fill, color } = {}) {
    const id = this.nextId();
    const sp = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
    this.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${left}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${sp}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras(lines, { size, ...(color ? { color } : {}) })}</p:txBody></p:sp>`);
  }

  table(columns, rows, { y, align = [], header = true } = {}) {
    const n = Math.min(MAX_COLS, Math.max(columns.length, ...rows.map((r) => r.length), 1));
    const weights = Array.from({ length: n }, (_, i) => Math.max(4, Math.min(40, Math.max(M.displayWidth(columns[i] || ''), ...rows.map((r) => M.displayWidth(M.cellText(r[i])))))));
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((v) => Math.round((BODY_W * v) / total));
    widths[n - 1] += BODY_W - widths.reduce((a, b) => a + b, 0);
    const cell = (v, i, head) => {
      const t = M.cellText(v).replace(/\s*\n\s*/g, ' ');
      const short = t.length > 160 ? `${t.slice(0, 157)}…` : t;
      const algn = align[i] === 'right' ? ' algn="r"' : '';
      const fill = head ? '<a:solidFill><a:srgbClr val="EEF1F5"/></a:solidFill>' : '<a:noFill/>';
      const border = (s) => `<a:${s} w="6350"><a:solidFill><a:srgbClr val="B0BAC6"/></a:solidFill></a:${s}>`;
      return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr${algn}/>${run(short, { size: 11, bold: head })}</a:p></a:txBody><a:tcPr marL="45720" marR="45720" marT="22860" marB="22860">${['lnL', 'lnR', 'lnT', 'lnB'].map(border).join('')}${fill}</a:tcPr></a:tc>`;
    };
    const all = header ? [columns, ...rows] : rows;
    const xml = all.map((r, ri) => `<a:tr h="${LINE}">${Array.from({ length: n }, (_, i) => cell(r[i], i, header && ri === 0)).join('')}</a:tr>`).join('');
    const id = this.nextId();
    const h = all.length * LINE;
    this.shapes.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${MARGIN}" y="${y}"/><a:ext cx="${BODY_W}" cy="${h}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="${header ? 1 : 0}" bandRow="0"/><a:tblGrid>${widths.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${xml}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
    return h;
  }

  picture(b, { y, maxH }) {
    const nat = { w: b.width * 9525, h: b.height * 9525 };
    const scale = Math.min(1, BODY_W / nat.w, maxH / nat.h);
    const w = Math.round(nat.w * scale);
    const h = Math.round(nat.h * scale);
    const rid = `rId${this.images.push(b.png) + 1}`;
    const id = this.nextId();
    this.shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}" descr="${x(b.alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${MARGIN + Math.round((BODY_W - w) / 2)}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
    return h;
  }

  xml() {
    const title = this.title == null ? '' : `<p:sp><p:nvSpPr><p:cNvPr id="1000" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${MARGIN}" y="${Math.round(0.35 * EMU)}"/><a:ext cx="${BODY_W}" cy="${Math.round(0.8 * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="b"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras([{ text: this.title }], { size: 26, bold: true })}</p:txBody></p:sp><p:cxnSp><p:nvCxnSpPr><p:cNvPr id="1001" name="Rule"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${MARGIN}" y="${Math.round(1.2 * EMU)}"/><a:ext cx="${BODY_W}" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="3F7FD6"/></a:solidFill></a:ln></p:spPr></p:cxnSp>`;
    return `${DECL}<p:sld xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${title}${this.shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }
}

/** Lay the model out on slides. */
function buildSlides(m, lang) {
  const tr = STR[lang] || STR.en;
  const slides = [];
  // Title slide.
  const first = new Slide(null);
  first.textBox([{ text: m.title || '' }], { y: Math.round(2.2 * EMU), h: Math.round(1.1 * EMU), size: 36, color: '1C2530' });
  const sub = [];
  if (m.subtitle) sub.push({ text: m.subtitle, opts: { size: 20, color: '5B6876' } });
  for (const [k, v] of m.meta) sub.push({ text: k ? `${k}: ${v}` : v, opts: { size: 14, color: '5B6876' } });
  if (sub.length) first.textBox(sub, { y: Math.round(3.4 * EMU), h: Math.round(2.6 * EMU), size: 16 });
  slides.push(first);

  let section = m.title || tr.contents;
  let cur = null;
  const open = (cont) => { cur = new Slide(cont ? `${section} ${tr.cont}` : section); slides.push(cur); return cur; };
  const room = () => BODY_BOTTOM - cur.y;
  const need = (h) => { if (!cur || (room() < h && cur.y > BODY_TOP)) open(cur && cur.title && cur.title.startsWith(section)); };
  let textLines = [];
  const flushText = () => {
    while (textLines.length) {
      need(LINE * Math.min(2, textLines.length));
      const fit = Math.max(1, Math.floor(room() / LINE));
      const part = textLines.splice(0, fit);
      const h = part.length * LINE;
      cur.textBox(part, { y: cur.y, h, size: 15 });
      cur.y += h + Math.round(0.1 * EMU);
      if (textLines.length) open(true);
    }
  };
  const lineCount = (t) => Math.max(1, Math.ceil(M.displayWidth(t) / 110));
  const pushText = (text, opts) => { for (let i = 0; i < lineCount(text); i++) textLines.push(i ? { text: '', opts: { size: 4 } } : { text, ...opts }); };
  const tableBlock = (columns, rows, align, header, caption) => {
    flushText();
    let rest = rows.slice();
    do {
      need(LINE * (header ? 3 : 2) + (caption ? LINE : 0));
      if (caption) { cur.textBox([{ text: caption, opts: { bold: true } }], { y: cur.y, h: LINE, size: 13 }); cur.y += LINE; }
      const fit = Math.max(1, Math.floor(room() / LINE) - (header ? 1 : 0));
      const part = rest.splice(0, fit);
      cur.y += cur.table(columns, part, { y: cur.y, align, header }) + Math.round(0.15 * EMU);
      if (rest.length) open(true);
    } while (rest.length);
  };

  for (const b of m.blocks) {
    switch (b.type) {
      case 'h1': case 'h2':
        flushText();
        section = b.text;
        open(false);
        break;
      case 'h3': pushText(b.text, { opts: { bold: true, size: 16 } }); break;
      case 'p': pushText(b.text, { opts: b.small ? { size: 12, color: '5B6876' } : {} }); break;
      case 'list': for (const it of b.items) pushText(it, { bullet: true }); break;
      case 'badge':
        flushText();
        need(LINE * 2);
        cur.textBox([{ text: b.text, opts: { bold: true, color: 'FFFFFF' } }], { y: cur.y, h: Math.round(LINE * 1.5), w: Math.min(BODY_W, Math.round((M.displayWidth(b.text) * 0.13 + 0.6) * EMU)), size: 16, fill: hex(b.color, '#546e7a') });
        cur.y += Math.round(LINE * 1.5) + Math.round(0.15 * EMU);
        break;
      case 'kv': if (b.rows.length) tableBlock(['', ''], b.rows, [], false); break;
      case 'table': tableBlock(b.columns, b.rows, M.columnAlign(b), true, b.caption); break;
      case 'image': {
        flushText();
        const natH = b.height * 9525 * Math.min(1, BODY_W / (b.width * 9525));
        if (!cur || (room() < Math.min(natH, (BODY_BOTTOM - BODY_TOP) * 0.6) && cur.y > BODY_TOP)) open(!!cur);
        cur.y += cur.picture(b, { y: cur.y, maxH: room() }) + Math.round(0.15 * EMU);
        break;
      }
      case 'pagebreak': flushText(); cur = null; break;
      default: break;
    }
  }
  flushText();
  return slides;
}

function themeXml() {
  const clr = (name, v) => `<a:${name}><a:srgbClr val="${v}"/></a:${name}>`;
  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const ln = (w) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  return `${DECL}<a:theme xmlns:a="${A_NS}" name="MyCodeChecker"><a:themeElements><a:clrScheme name="MyCodeChecker"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>${clr('dk2', '1C2530')}${clr('lt2', 'EEF1F5')}${clr('accent1', '3F7FD6')}${clr('accent2', 'D64545')}${clr('accent3', '2E9D57')}${clr('accent4', 'F08A24')}${clr('accent5', '8E44AD')}${clr('accent6', 'F2C12E')}${clr('hlink', '0563C1')}${clr('folHlink', '954F72')}</a:clrScheme><a:fontScheme name="MyCodeChecker"><a:majorFont><a:latin typeface="${FONT_LATIN}"/><a:ea typeface="${FONT_EA}"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${FONT_LATIN}"/><a:ea typeface="${FONT_EA}"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="MyCodeChecker"><a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst><a:lnStyleLst>${ln(6350)}${ln(12700)}${ln(19050)}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

const EMPTY_TREE = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>`;
const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

function masterXml() {
  const lvl = '<a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>';
  return `${DECL}<p:sldMaster xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${EMPTY_TREE}</p:cSld>${CLR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${lvl}</p:titleStyle><p:bodyStyle>${lvl}</p:bodyStyle><p:otherStyle>${lvl}</p:otherStyle></p:txStyles></p:sldMaster>`;
}

function layoutXml() {
  return `${DECL}<p:sldLayout xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}" type="blank" preserve="1"><p:cSld name="Blank">${EMPTY_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

const rels = (items) => `${DECL}<Relationships xmlns="${PKG_REL}">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;

/**
 * Render a document model to a .pptx Buffer.
 * @param {object} model see model.js
 * @param {{lang?:'en'|'ko', creator?:string, date?:Date}} [opts]
 */
function toPptx(model, opts = {}) {
  const m = M.normalize(model);
  const lang = M.detectLang(m, opts);
  const slides = buildSlides(m, lang);
  const when = w3cdtf(opts.date);
  const creator = opts.creator || 'MyCodeChecker';
  const files = [];
  let media = 0;
  slides.forEach((s, i) => {
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: s.xml() });
    const imgRels = s.images.map((png, k) => {
      media++;
      files.push({ name: `ppt/media/image${media}.png`, data: png });
      return [`rId${k + 2}`, `${R_NS}/image`, `../media/image${media}.png`];
    });
    files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: rels([['rId1', `${R_NS}/slideLayout`, '../slideLayouts/slideLayout1.xml'], ...imgRels]) });
  });
  const n = slides.length;
  const presentation = `${DECL}<p:presentation xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${SLIDE.w}" cy="${SLIDE.h}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>`;
  files.unshift(
    { name: '[Content_Types].xml', data: `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="${CT}.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT}.slideLayout+xml"/>${slides.map((s, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${CT}.slide+xml"/>`).join('')}<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="${CT}.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="${CT}.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="${CT}.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: rels([['rId1', `${R_NS}/officeDocument`, 'ppt/presentation.xml'], ['rId2', `${PKG_REL}/metadata/core-properties`, 'docProps/core.xml'], ['rId3', `${R_NS}/extended-properties`, 'docProps/app.xml']]) },
    { name: 'ppt/presentation.xml', data: presentation },
    { name: 'ppt/_rels/presentation.xml.rels', data: rels([['rId1', `${R_NS}/slideMaster`, 'slideMasters/slideMaster1.xml'], ...slides.map((s, i) => [`rId${i + 2}`, `${R_NS}/slide`, `slides/slide${i + 1}.xml`]), [`rId${n + 2}`, `${R_NS}/presProps`, 'presProps.xml'], [`rId${n + 3}`, `${R_NS}/viewProps`, 'viewProps.xml'], [`rId${n + 4}`, `${R_NS}/theme`, 'theme/theme1.xml'], [`rId${n + 5}`, `${R_NS}/tableStyles`, 'tableStyles.xml']]) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: masterXml() },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', `${R_NS}/slideLayout`, '../slideLayouts/slideLayout1.xml'], ['rId2', `${R_NS}/theme`, '../theme/theme1.xml']]) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: layoutXml() },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', `${R_NS}/slideMaster`, '../slideMasters/slideMaster1.xml']]) },
    { name: 'ppt/theme/theme1.xml', data: themeXml() },
    { name: 'ppt/presProps.xml', data: `${DECL}<p:presentationPr xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"/>` },
    { name: 'ppt/viewProps.xml', data: `${DECL}<p:viewPr xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>` },
    { name: 'ppt/tableStyles.xml', data: `${DECL}<a:tblStyleLst xmlns:a="${A_NS}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>` },
    { name: 'docProps/core.xml', data: `${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(m.title)}</dc:title><dc:creator>${x(creator)}</dc:creator><cp:lastModifiedBy>${x(creator)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `${DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>${x(opts.application || 'MyCodeChecker')}</Application><Slides>${n}</Slides><PresentationFormat>Widescreen</PresentationFormat></Properties>` },
  );
  return zip(files, { date: opts.date });
}

module.exports = { toPptx, MIME: `${CT}.presentation`, SLIDE };
