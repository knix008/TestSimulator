// Exchange with other programs:
//   Microsoft Visio (.vsdx)  write: pages, shapes (geometry as relative Bézier rows), text, fills,
//                            lines, rotation, flips, shape data, hyperlinks, layers, pictures,
//                            connectors with their glue; read: the same, with masters, style
//                            sheets, groups and the classic geometry rows (arcs, ellipses …)
//   HTML                     every page as inline SVG in one web page
//   CSV                      shape data out and in (matched by ID, name or text)
//   Org chart from data      rows of name / title / manager → an org chart
// The ZIP reader inflates with DecompressionStream (browsers, WebView, Node 18+).
import { addLayer, addShape, contentBounds, createConnector, createDocument, createPage, createShape, dataKeys, drawingSize, isConnector, isGroup, moveShapes, newId, normalizeData, PX_PER_IN, refreshGroups } from './diagram.js';
import { dashArray, resolveConnectorStyle, resolveShapeStyle } from './designs.js';
import { layoutPage } from './layout.js';
import { parsePath, segmentsToPath } from './path.js';
import { routePage } from './routing.js';
import { masterById, shapeParams, connectionPoints } from './stencils.js';
import { allText, childNamed, childrenNamed, parseXml } from './xml.js';
import { parseCsv, toCsv } from './csv.js';
import { zip } from '../export/report-export.js';
import { renderPageSvg } from '../render/svg.js';

const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const x = (value) => String(value ?? '').replace(XML_INVALID, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const v = (value) => Number(Number(value).toFixed(6));
const IN = PX_PER_IN;

// ───────────────────────── Visio: shared tables

const LINE_PATTERNS = { solid: 1, dash: 2, dot: 3, dashDot: 4, dashDotDot: 5, longDash: 9 };
const LINE_PATTERN_NAMES = Object.fromEntries(Object.entries(LINE_PATTERNS).map(([k, n]) => [n, k]));
const ARROW_CODES = { none: 0, open: 1, arrow: 4, stealth: 13, triangleOpen: 6, diamond: 22, diamondOpen: 23, circle: 20, circleOpen: 21, bar: 3, one: 24, oneOnly: 27, many: 29, oneMany: 30, zeroMany: 31, zeroOne: 26 };
const ARROW_NAMES = Object.fromEntries(Object.entries(ARROW_CODES).map(([k, n]) => [n, k]));
const PALETTE = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#E6E6E6', '#CDCDCD', '#B3B3B3', '#9A9A9A', '#808080', '#666666', '#4D4D4D', '#333333', '#1A1A1A'];
const NS = 'xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve"';
const REL_NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const HEAD = '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n';

const cell = (name, value, extra = '') => (value == null || value === '' ? '' : `<Cell N="${name}" V="${x(value)}"${extra}/>`);
const colorValue = (c) => (c && c !== 'none' && /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : c && /^#[0-9a-f]{3}$/i.test(c) ? `#${c.slice(1).split('').map((ch) => ch + ch).join('')}`.toUpperCase() : null);

// ───────────────────────── Visio: writing

/** A shape's outline parts as Visio geometry sections (relative rows, y up). */
function geometrySections(parts, w, h) {
  return parts.map((part, index) => {
    const segs = parsePath(part.d);
    let rows = '';
    let ix = 1;
    let start = null;
    let current = null;
    const rx = (px) => v(w ? px / w : 0);
    const ry = (py) => v(h ? 1 - py / h : 0);
    for (const s of segs) {
      if (s.c === 'M') { rows += `<Row T="RelMoveTo" IX="${ix++}">${cell('X', rx(s.p[0]))}${cell('Y', ry(s.p[1]))}</Row>`; start = [s.p[0], s.p[1]]; current = start; }
      else if (s.c === 'L') { rows += `<Row T="RelLineTo" IX="${ix++}">${cell('X', rx(s.p[0]))}${cell('Y', ry(s.p[1]))}</Row>`; current = [s.p[0], s.p[1]]; }
      else if (s.c === 'C') { rows += `<Row T="RelCubBezTo" IX="${ix++}">${cell('X', rx(s.p[4]))}${cell('Y', ry(s.p[5]))}${cell('A', rx(s.p[0]))}${cell('B', ry(s.p[1]))}${cell('C', rx(s.p[2]))}${cell('D', ry(s.p[3]))}</Row>`; current = [s.p[4], s.p[5]]; }
      else if (s.c === 'Q') { rows += `<Row T="RelQuadBezTo" IX="${ix++}">${cell('X', rx(s.p[2]))}${cell('Y', ry(s.p[3]))}${cell('A', rx(s.p[0]))}${cell('B', ry(s.p[1]))}</Row>`; current = [s.p[2], s.p[3]]; }
      else if (s.c === 'Z' && start && current && (Math.abs(current[0] - start[0]) > 0.001 || Math.abs(current[1] - start[1]) > 0.001)) {
        rows += `<Row T="RelLineTo" IX="${ix++}">${cell('X', rx(start[0]))}${cell('Y', ry(start[1]))}</Row>`; current = start;
      }
    }
    const noFill = part.fill === 'none' ? 1 : 0;
    return `<Section N="Geometry" IX="${index}">${cell('NoFill', noFill)}${cell('NoLine', 0)}${cell('NoShow', 0)}${cell('NoSnap', 0)}${rows}</Section>`;
  }).join('');
}

function textCells(style) {
  const bits = (style.bold ? 1 : 0) | (style.italic ? 2 : 0) | (style.underline ? 4 : 0);
  return `<Section N="Character"><Row IX="0">${cell('Font', style.font || 'Calibri')}${cell('Color', colorValue(style.textColor) ?? '#000000')}${cell('Size', v((style.fontSize ?? 13) / IN), ' U="PT"')}${cell('Style', bits)}${style.strike ? cell('Strikethru', 1) : ''}</Row></Section>`
    + `<Section N="Paragraph"><Row IX="0">${cell('HorzAlign', { left: 0, center: 1, right: 2 }[style.align] ?? 1)}${cell('SpLine', -(style.lineSpacing ?? 1.2))}</Row></Section>`;
}

function dataSections(item) {
  let out = '';
  if (item.data?.length) out += `<Section N="Property">${item.data.map((f, i) => `<Row N="${x(f.key.replace(/[^\p{L}\p{N}_]/gu, '_') || `Prop${i}`)}">${cell('Label', f.label || f.key)}${cell('Value', f.value, ' U="STR"')}${cell('Type', { number: 2, currency: 7, date: 5, bool: 3, list: 1 }[f.type] ?? 0)}${f.type === 'list' ? cell('Format', f.options.join(';')) : ''}</Row>`).join('')}</Section>`;
  if (item.hyperlink) out += `<Section N="Hyperlink"><Row N="Row_1">${cell(item.hyperlink.startsWith('page:') ? 'SubAddress' : 'Address', item.hyperlink.replace(/^page:/, ''))}${cell('Description', item.hyperlink)}</Row></Section>`;
  return out;
}

function layerCell(page, item, layerIndex) {
  const list = (item.layers ?? []).map((id) => layerIndex.get(id)).filter((n) => n != null);
  return list.length ? cell('LayerMember', list.join(';')) : '';
}

/** A Visio document (.vsdx bytes) of the drawing. `measure` is not needed: Visio lays the text out itself. */
/** A copy of the page moved so nothing lies at negative coordinates (or the page itself when nothing does). */
function shiftedOntoPage(page) {
  const b = contentBounds(page);
  if (!b || (b.x >= 0 && b.y >= 0)) return page;
  const copy = JSON.parse(JSON.stringify(page));
  moveShapes(copy, copy.shapes.filter((shape) => !shape.groupId).map((shape) => shape.id), Math.max(0, -b.x), Math.max(0, -b.y));
  return copy;
}

export function exportVsdx(doc, { now = new Date() } = {}) {
  const files = [];
  const media = [];
  const pageEntries = [];
  doc.pages.forEach((original, pageIndex) => {
    // The canvas is endless: shapes left of / above the page move in with the drawing (Visio pages start at 0, 0).
    const page = shiftedOntoPage(original);
    const routes = routePage(doc, page);
    const size = drawingSize(page, (shape) => routes.get(shape.id) ?? { points: [] });
    const H = size.height;
    const layerIndex = new Map(page.layers.map((layer, i) => [layer.id, i]));
    const idMap = new Map();
    let next = 1;
    for (const shape of page.shapes) if (!isGroup(shape)) idMap.set(shape.id, next++);
    const pageRels = [];
    const shapesXml = [];
    const connects = [];
    for (const shape of page.shapes) {
      if (isGroup(shape)) continue;
      const id = idMap.get(shape.id);
      const layer = layerCell(page, shape, layerIndex);
      if (isConnector(shape)) {
        const route = routes.get(shape.id);
        if (!route || route.points.length < 2) continue;
        const style = resolveConnectorStyle(doc, shape);
        const pts = route.points.map((p) => ({ x: p.x / IN, y: (H - p.y) / IN }));
        const b = pts[0];
        const e = pts[pts.length - 1];
        const len = Math.hypot(e.x - b.x, e.y - b.y);
        const angle = Math.atan2(e.y - b.y, e.x - b.x);
        const cos = Math.cos(-angle); const sin = Math.sin(-angle);
        const local = pts.map((p) => ({ x: (p.x - b.x) * cos - (p.y - b.y) * sin, y: (p.x - b.x) * sin + (p.y - b.y) * cos }));
        const rows = local.map((p, i) => `<Row T="${i ? 'LineTo' : 'MoveTo'}" IX="${i + 1}">${cell('X', v(p.x))}${cell('Y', v(p.y))}</Row>`).join('');
        shapesXml.push(`<Shape ID="${id}" NameU="Dynamic connector.${id}" Name="${x(shape.name || 'Dynamic connector')}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">`
          + `${cell('PinX', v((b.x + e.x) / 2))}${cell('PinY', v((b.y + e.y) / 2))}${cell('Width', v(len))}${cell('Height', 0)}${cell('LocPinX', v(len / 2))}${cell('LocPinY', 0)}${cell('Angle', v(angle))}`
          + `${cell('BeginX', v(b.x))}${cell('BeginY', v(b.y))}${cell('EndX', v(e.x))}${cell('EndY', v(e.y))}${cell('ObjType', 2)}${cell('ShapeRouteStyle', shape.route === 'straight' ? 2 : shape.route === 'curved' ? 1 : 1)}${cell('ConLineRouteExt', shape.route === 'curved' ? 2 : 1)}`
          + `${cell('LineWeight', v((style.lineWidth ?? 1) / IN), ' U="PT"')}${cell('LineColor', colorValue(style.line) ?? '#000000')}${cell('LinePattern', style.line === 'none' ? 0 : LINE_PATTERNS[style.dash] ?? 1)}`
          + `${cell('BeginArrow', ARROW_CODES[style.startArrow] ?? 0)}${cell('EndArrow', ARROW_CODES[style.endArrow] ?? 0)}${cell('BeginArrowSize', 2)}${cell('EndArrowSize', 2)}${layer}`
          + `${textCells(style)}${dataSections(shape)}<Section N="Geometry" IX="0">${cell('NoFill', 1)}${cell('NoLine', 0)}${rows}</Section>${shape.text ? `<Text>${x(shape.text)}</Text>` : ''}</Shape>`);
        for (const [end, cellName] of [[shape.from, 'BeginX'], [shape.to, 'EndX']]) {
          if (!end.id || !idMap.has(end.id)) continue;
          const toCell = typeof end.pt === 'number' ? `Connections.X${end.pt + 1}` : 'PinX';
          connects.push(`<Connect FromSheet="${id}" FromCell="${cellName}" FromPart="${cellName === 'BeginX' ? 9 : 12}" ToSheet="${idMap.get(end.id)}" ToCell="${toCell}" ToPart="${typeof end.pt === 'number' ? 100 + end.pt : 3}"/>`);
        }
        continue;
      }
      const master = masterById(shape.master);
      const style = resolveShapeStyle(doc, shape);
      const cx = (shape.x + shape.w / 2) / IN;
      const cy = (H - (shape.y + shape.h / 2)) / IN;
      const w = shape.w / IN;
      const h = shape.h / IN;
      const common = `${cell('PinX', v(cx))}${cell('PinY', v(cy))}${cell('Width', v(w))}${cell('Height', v(h))}${cell('LocPinX', v(w / 2), ' F="Width*0.5"')}${cell('LocPinY', v(h / 2), ' F="Height*0.5"')}${cell('Angle', v((-(shape.angle ?? 0) * Math.PI) / 180))}${cell('FlipX', shape.flipH ? 1 : 0)}${cell('FlipY', shape.flipV ? 1 : 0)}`;
      const fill = colorValue(style.fill);
      const lineCells = `${cell('LineWeight', v((style.lineWidth ?? 1) / IN), ' U="PT"')}${cell('LineColor', colorValue(style.line) ?? '#000000')}${cell('LinePattern', !style.line || style.line === 'none' ? 0 : LINE_PATTERNS[style.dash] ?? 1)}${cell('Rounding', v((style.rounding ?? 0) / IN))}`;
      const fillCells = `${cell('FillForegnd', fill ?? '#FFFFFF')}${cell('FillBkgnd', colorValue(style.fill2) ?? '#FFFFFF')}${cell('FillPattern', !fill ? 0 : style.fillPattern === 'linear' ? 28 : style.fillPattern === 'radial' ? 40 : 1)}${(style.fillOpacity ?? 100) < 100 ? cell('FillForegndTrans', v(1 - style.fillOpacity / 100)) : ''}${style.shadow ? `${cell('ShdwPattern', 1)}${cell('ShdwForegnd', '#000000')}${cell('ShdwForegndTrans', 0.75)}` : ''}`;
      const textBlock = `${cell('VerticalAlign', { top: 0, middle: 1, bottom: 2 }[style.valign] ?? 1)}${textCells(style)}`;
      const points = connectionPoints(shape, master);
      const connections = points.length ? `<Section N="Connection">${points.map((p, i) => `<Row T="Connection" IX="${i}">${cell('X', v(p.nx * w), ` F="Width*${v(p.nx)}"`)}${cell('Y', v((1 - p.ny) * h), ` F="Height*${v(1 - p.ny)}"`)}</Row>`).join('')}</Section>` : '';
      const name = `${master.name.en}.${id}`;
      if (master.id === 'image' && /^data:image\/(png|jpe?g|gif|bmp);base64,/i.test(shape.src ?? '')) {
        const [, type, data] = /^data:image\/(png|jpe?g|gif|bmp);base64,(.*)$/i.exec(shape.src);
        const ext = type.toLowerCase().replace('jpg', 'jpeg');
        const file = `image${media.length + 1}.${ext}`;
        media.push({ name: `visio/media/${file}`, data: base64ToBytes(data) });
        const rid = `rId${pageRels.length + 1}`;
        pageRels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${file}"/>`);
        shapesXml.push(`<Shape ID="${id}" NameU="${x(name)}" Name="${x(shape.name || master.name.en)}" Type="Foreign" LineStyle="0" FillStyle="0" TextStyle="0">${common}${cell('ImgWidth', v(w))}${cell('ImgHeight', v(h))}${cell('LinePattern', 0)}${layer}${dataSections(shape)}<ForeignData ForeignType="Bitmap" CompressionType="${ext === 'jpeg' ? 'JPEG' : ext.toUpperCase()}"><Rel r:id="${rid}"/></ForeignData>${shape.text ? `<Text>${x(shape.text)}</Text>` : ''}</Shape>`);
        continue;
      }
      const parts = master.id === 'image' ? [{ d: `M0 0H${shape.w}V${shape.h}H0Z`, fill: 'main' }] : master.geometry(shape.w, shape.h, shapeParams(shape, master), 0);
      shapesXml.push(`<Shape ID="${id}" NameU="${x(name)}" Name="${x(shape.name || master.name.en)}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">${common}${lineCells}${fillCells}${textBlock}${layer}${connections}${dataSections(shape)}${geometrySections(parts, shape.w, shape.h)}${shape.text ? `<Text>${x(shape.text)}</Text>` : ''}</Shape>`);
    }
    const layerSection = page.layers.length ? `<Section N="Layer">${page.layers.map((layer, i) => `<Row IX="${i}">${cell('Name', layer.name)}${cell('Visible', layer.visible ? 1 : 0)}${cell('Print', layer.print ? 1 : 0)}${cell('Lock', layer.locked ? 1 : 0)}${cell('Color', layer.color ? colorValue(layer.color) : 255)}</Row>`).join('')}</Section>` : '';
    const file = `page${pageIndex + 1}.xml`;
    files.push({ name: `visio/pages/${file}`, data: `${HEAD}<PageContents ${NS}><Shapes>${shapesXml.join('')}</Shapes>${connects.length ? `<Connects>${connects.join('')}</Connects>` : ''}</PageContents>` });
    if (pageRels.length) files.push({ name: `visio/pages/_rels/${file}.rels`, data: `${HEAD}<Relationships ${REL_NS}>${pageRels.join('')}</Relationships>` });
    const back = page.backgroundId ? doc.pages.findIndex((p) => p.id === page.backgroundId) : -1;
    pageEntries.push({ file, xml: `<Page ID="${pageIndex}" NameU="${x(page.name)}" Name="${x(page.name)}"${page.background ? ' Background="1"' : ''}${back >= 0 ? ` BackPage="${back}"` : ''} ViewScale="-1" ViewCenterX="${v(page.width / IN / 2)}" ViewCenterY="${v(page.height / IN / 2)}"><PageSheet LineStyle="0" FillStyle="0" TextStyle="0">${cell('PageWidth', v(size.width / IN))}${cell('PageHeight', v(size.height / IN))}${cell('ShdwOffsetX', 0.125)}${cell('ShdwOffsetY', -0.125)}${cell('PageScale', 1, ' U="IN"')}${cell('DrawingScale', 1, ' U="IN"')}${cell('DrawingSizeType', page.autoSize ? 1 : 0)}${cell('PrintPageOrientation', page.orientation === 'landscape' ? 2 : 1)}${layerSection}</PageSheet><Rel r:id="rId${pageIndex + 1}"/></Page>` });
  });
  const pageOverrides = pageEntries.map((p) => `<Override PartName="/visio/pages/${p.file}" ContentType="application/vnd.ms-visio.page+xml"/>`).join('');
  const date = now.toISOString().replace(/\.\d+Z$/, 'Z');
  files.unshift(
    { name: '[Content_Types].xml', data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="bmp" ContentType="image/bmp"/><Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/><Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>${pageOverrides}<Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `${HEAD}<Relationships ${REL_NS}><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(doc.title)}</dc:title><dc:subject>${x(doc.subject)}</dc:subject><dc:creator>${x(doc.author)}</dc:creator><cp:keywords>${x(doc.keywords)}</cp:keywords><dc:description>${x(doc.description)}</dc:description><cp:category>${x(doc.category)}</cp:category><dcterms:created xsi:type="dcterms:W3CDTF">${x(doc.created || date)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${date}</dcterms:modified></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>MyDiagram</Application><Company>${x(doc.company)}</Company><Manager>${x(doc.manager)}</Manager><Pages>${doc.pages.length}</Pages></Properties>` },
    { name: 'visio/document.xml', data: `${HEAD}<VisioDocument ${NS}><DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0" DefaultGuideStyle="0">${cell('GlueSettings', 9)}${cell('SnapSettings', 65847)}</DocumentSettings><Colors>${PALETTE.map((c, i) => `<ColorEntry IX="${i}" RGB="${c}"/>`).join('')}</Colors><FaceNames><FaceName NameU="Calibri" Name="Calibri"/><FaceName NameU="Malgun Gothic" Name="Malgun Gothic"/></FaceNames><StyleSheets><StyleSheet ID="0" NameU="No Style" Name="No Style">${cell('EnableLineProps', 1)}${cell('EnableFillProps', 1)}${cell('EnableTextProps', 1)}${cell('LineWeight', 0.01041666666666667)}${cell('LineColor', '#000000')}${cell('LinePattern', 1)}${cell('Rounding', 0)}${cell('LineCap', 0)}${cell('FillForegnd', '#FFFFFF')}${cell('FillBkgnd', '#000000')}${cell('FillPattern', 1)}${cell('ShdwPattern', 0)}${cell('VerticalAlign', 1)}${cell('LeftMargin', 0.05555555555555555)}${cell('RightMargin', 0.05555555555555555)}${cell('TopMargin', 0.05555555555555555)}${cell('BottomMargin', 0.05555555555555555)}<Section N="Character"><Row IX="0">${cell('Font', 'Calibri')}${cell('Color', '#000000')}${cell('Size', 0.1666666666666667)}${cell('Style', 0)}</Row></Section><Section N="Paragraph"><Row IX="0">${cell('HorzAlign', 1)}</Row></Section></StyleSheet></StyleSheets></VisioDocument>` },
    { name: 'visio/_rels/document.xml.rels', data: `${HEAD}<Relationships ${REL_NS}><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/><Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/windows" Target="windows.xml"/></Relationships>` },
    { name: 'visio/windows.xml', data: `${HEAD}<Windows ClientWidth="1280" ClientHeight="800" ${NS}><Window ID="0" WindowType="Drawing" WindowState="1073741824" WindowLeft="-8" WindowTop="-31" WindowWidth="1296" WindowHeight="839" ContainerType="Page" Page="0" ViewScale="-1" ViewCenterX="${v(doc.pages[0].width / IN / 2)}" ViewCenterY="${v(doc.pages[0].height / IN / 2)}"><ShowRulers>1</ShowRulers><ShowGrid>1</ShowGrid><ShowPageBreaks>0</ShowPageBreaks><ShowGuides>1</ShowGuides><ShowConnectionPoints>1</ShowConnectionPoints><GlueSettings>9</GlueSettings><SnapSettings>65847</SnapSettings></Window></Windows>` },
    { name: 'visio/pages/pages.xml', data: `${HEAD}<Pages ${NS}>${pageEntries.map((p) => p.xml).join('')}</Pages>` },
    { name: 'visio/pages/_rels/pages.xml.rels', data: `${HEAD}<Relationships ${REL_NS}>${pageEntries.map((p, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="${p.file}"/>`).join('')}</Relationships>` },
  );
  return zip([...files, ...media], now);
}

// ───────────────────────── ZIP reading

async function inflateRaw(data) {
  if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream is not available');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads a ZIP archive: { names, has(name), read(name) → Promise<Uint8Array> } (names compared case-insensitively). */
export function unzip(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw Object.assign(new Error('format.notZip'), { code: 'format.notZip' });
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries = new Map();
  const decoder = new TextDecoder();
  for (let k = 0; k < count && at + 46 <= data.length; k++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const csize = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(data.subarray(at + 46, at + 46 + nameLen));
    const localName = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localName + localExtra;
    entries.set(name.toLowerCase(), { name, method, data: data.subarray(start, start + csize) });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: [...entries.values()].map((e) => e.name),
    has: (name) => entries.has(String(name).toLowerCase()),
    async read(name) {
      const entry = entries.get(String(name).toLowerCase());
      if (!entry) throw new Error(`missing ${name}`);
      return entry.method === 0 ? entry.data : inflateRaw(entry.data);
    },
  };
}

// ───────────────────────── Visio: reading

const resolvePart = (dir, target) => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dir + target).split('/');
  const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  return out.join('/');
};

/** One Visio shape element as plain data. */
function readVShape(node) {
  const cells = new Map();
  for (const c of childrenNamed(node, 'Cell')) cells.set(c.attrs.N, c.attrs);
  const sections = childrenNamed(node, 'Section').map((s) => ({
    n: s.attrs.N, ix: s.attrs.IX ?? '0', del: s.attrs.Del === '1',
    cells: new Map(childrenNamed(s, 'Cell').map((c) => [c.attrs.N, c.attrs])),
    rows: childrenNamed(s, 'Row').map((r) => ({ t: r.attrs.T, ix: r.attrs.IX, n: r.attrs.N, del: r.attrs.Del === '1', cells: new Map(childrenNamed(r, 'Cell').map((c) => [c.attrs.N, c.attrs])) })),
  }));
  const textNode = childNamed(node, 'Text');
  const foreign = childNamed(node, 'ForeignData');
  return {
    id: node.attrs.ID, type: node.attrs.Type ?? 'Shape', nameU: node.attrs.NameU ?? node.attrs.Name ?? '', name: node.attrs.Name ?? '',
    master: node.attrs.Master ?? null, masterShape: node.attrs.MasterShape ?? null,
    lineStyle: node.attrs.LineStyle ?? null, fillStyle: node.attrs.FillStyle ?? null, textStyle: node.attrs.TextStyle ?? null,
    cells, sections, text: textNode ? allText(textNode).replace(/\r\n?/g, '\n') : null, foreignRel: foreign ? childNamed(foreign, 'Rel')?.attrs.id ?? null : null,
    foreignType: foreign?.attrs.ForeignType ?? null,
    children: (childNamed(node, 'Shapes')?.children ?? []).filter((c) => c.name === 'Shape').map(readVShape),
  };
}

/** Merges master sections under a shape's own (rows by IX, cells by name). */
function mergedSections(own, base, name) {
  const mine = own.filter((s) => s.n === name);
  const theirs = base ? base.filter((s) => s.n === name) : [];
  const out = [];
  for (const b of theirs) {
    const o = mine.find((s) => s.ix === b.ix);
    if (o?.del) continue;
    if (!o) { out.push(b); continue; }
    const rows = b.rows.filter((r) => !o.rows.find((x2) => (x2.ix ?? x2.n) === (r.ix ?? r.n) && x2.del)).map((r) => {
      const local = o.rows.find((x2) => (x2.ix ?? x2.n) === (r.ix ?? r.n));
      return local ? { ...r, t: local.t ?? r.t, cells: new Map([...r.cells, ...local.cells]) } : r;
    });
    for (const r of o.rows) if (!r.del && !b.rows.some((x2) => (x2.ix ?? x2.n) === (r.ix ?? r.n))) rows.push(r);
    out.push({ ...b, cells: new Map([...b.cells, ...o.cells]), rows });
  }
  for (const o of mine) if (!o.del && !theirs.some((b) => b.ix === o.ix)) out.push(o);
  return out;
}

const numberOf = (attrs, fallback = 0) => {
  if (!attrs) return fallback;
  const value = Number(attrs.V);
  return Number.isFinite(value) ? value : fallback;
};

/** A Visio colour cell value (#RRGGBB, palette index, or RGB(…)) as #rrggbb. */
function colorOf(attrs) {
  const value = String(attrs?.V ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const rgb = /RGB\((\d+),\s*(\d+),\s*(\d+)\)/i.exec(value) ?? /RGB\((\d+),\s*(\d+),\s*(\d+)\)/i.exec(String(attrs?.F ?? ''));
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  if (/^\d+$/.test(value) && PALETTE[Number(value)]) return PALETTE[Number(value)].toLowerCase();
  return null;
}

/** Geometry sections → SVG path parts in local px (y down). */
function geometryToParts(sections, w, h) {
  const parts = [];
  for (const section of sections) {
    if (numberOf(section.cells.get('NoShow')) === 1) continue;
    const noFill = numberOf(section.cells.get('NoFill')) === 1;
    const noLine = numberOf(section.cells.get('NoLine')) === 1;
    const rows = [...section.rows].filter((r) => !r.del).sort((a, b) => Number(a.ix) - Number(b.ix));
    let d = '';
    let cx = 0; let cy = 0;
    let started = false;
    const P = (X, Y) => [X * IN, h - Y * IN];
    const R = (X, Y) => [X * w, h - Y * h];
    const num = (r, k) => numberOf(r.cells.get(k));
    for (const r of rows) {
      const t = r.t;
      if (t === 'MoveTo' || t === 'RelMoveTo') { [cx, cy] = t === 'MoveTo' ? P(num(r, 'X'), num(r, 'Y')) : R(num(r, 'X'), num(r, 'Y')); d += `M${cx} ${cy}`; started = true; }
      else if (t === 'LineTo' || t === 'RelLineTo' || t === 'NURBSTo' || t === 'PolylineTo' || t === 'SplineKnot' || t === 'SplineStart') {
        const [nx, ny] = t === 'RelLineTo' ? R(num(r, 'X'), num(r, 'Y')) : P(num(r, 'X'), num(r, 'Y'));
        if (!started) { d += `M${cx} ${cy}`; started = true; }
        d += `L${nx} ${ny}`; cx = nx; cy = ny;
      } else if (t === 'RelCubBezTo') {
        const [nx, ny] = R(num(r, 'X'), num(r, 'Y')); const [ax, ay] = R(num(r, 'A'), num(r, 'B')); const [bx, by] = R(num(r, 'C'), num(r, 'D'));
        d += `C${ax} ${ay} ${bx} ${by} ${nx} ${ny}`; cx = nx; cy = ny;
      } else if (t === 'RelQuadBezTo') {
        const [nx, ny] = R(num(r, 'X'), num(r, 'Y')); const [ax, ay] = R(num(r, 'A'), num(r, 'B'));
        d += `Q${ax} ${ay} ${nx} ${ny}`; cx = nx; cy = ny;
      } else if (t === 'ArcTo') {
        const [nx, ny] = P(num(r, 'X'), num(r, 'Y'));
        const bow = num(r, 'A') * IN;
        const chord = Math.hypot(nx - cx, ny - cy);
        if (Math.abs(bow) < 0.01 || chord < 0.01) d += `L${nx} ${ny}`;
        else {
          const radius = (chord * chord / 4 + bow * bow) / (2 * Math.abs(bow));
          d += `A${radius} ${radius} 0 ${Math.abs(bow) > chord / 2 ? 1 : 0} ${bow > 0 ? 0 : 1} ${nx} ${ny}`;
        }
        cx = nx; cy = ny;
      } else if (t === 'EllipticalArcTo' || t === 'RelEllipticalArcTo') {
        const rel = t === 'RelEllipticalArcTo';
        const [nx, ny] = rel ? R(num(r, 'X'), num(r, 'Y')) : P(num(r, 'X'), num(r, 'Y'));
        const [ax, ay] = rel ? R(num(r, 'A'), num(r, 'B')) : P(num(r, 'A'), num(r, 'B'));
        d += ellipticalArc(cx, cy, ax, ay, nx, ny, -num(r, 'C'), num(r, 'D') || 1);
        cx = nx; cy = ny;
      } else if (t === 'Ellipse') {
        const [ecx, ecy] = P(num(r, 'X'), num(r, 'Y'));
        const [ax, ay] = P(num(r, 'A'), num(r, 'B'));
        const [bx, by] = P(num(r, 'C'), num(r, 'D'));
        const rx = Math.hypot(ax - ecx, ay - ecy); const ry = Math.hypot(bx - ecx, by - ecy);
        const rot = (Math.atan2(ay - ecy, ax - ecx) * 180) / Math.PI;
        const sx = ecx + (ax - ecx); const sy = ecy + (ay - ecy);
        d += `M${sx} ${sy}A${rx} ${ry} ${rot} 1 0 ${2 * ecx - sx} ${2 * ecy - sy}A${rx} ${ry} ${rot} 1 0 ${sx} ${sy}Z`;
      } else if (t === 'InfiniteLine') {
        // Not drawable on a page: skipped.
      }
    }
    if (!d) continue;
    parts.push({ d, fill: noFill ? (noLine ? 'hidden' : 'none') : 'main', noLine });
  }
  return parts.filter((p) => p.fill !== 'hidden');
}

/** An elliptical arc through the current point, control point (ax, ay) and end, as SVG. */
function ellipticalArc(x0, y0, ax, ay, x1, y1, angle, ratio) {
  // Undo the ellipse's rotation and squash: then the three points lie on a circle.
  const cos = Math.cos(-angle); const sin = Math.sin(-angle);
  const tr = (px, py) => ({ x: px * cos - py * sin, y: (px * sin + py * cos) * ratio });
  const p0 = tr(x0, y0); const pa = tr(ax, ay); const p1 = tr(x1, y1);
  const det = 2 * (p0.x * (pa.y - p1.y) + pa.x * (p1.y - p0.y) + p1.x * (p0.y - pa.y));
  if (Math.abs(det) < 1e-9) return `L${x1} ${y1}`;
  const s0 = p0.x ** 2 + p0.y ** 2; const sa = pa.x ** 2 + pa.y ** 2; const s1 = p1.x ** 2 + p1.y ** 2;
  const ux = (s0 * (pa.y - p1.y) + sa * (p1.y - p0.y) + s1 * (p0.y - pa.y)) / det;
  const uy = (s0 * (p1.x - pa.x) + sa * (p0.x - p1.x) + s1 * (pa.x - p0.x)) / det;
  const r = Math.hypot(p0.x - ux, p0.y - uy);
  const cross = (pa.x - p0.x) * (p1.y - p0.y) - (pa.y - p0.y) * (p1.x - p0.x);
  const sweep = cross < 0 ? 1 : 0;
  // Large arc when the control point is on the far side of the chord from the centre.
  const side = (px, py) => (p1.x - p0.x) * (py - p0.y) - (p1.y - p0.y) * (px - p0.x);
  const large = Math.sign(side(pa.x, pa.y)) === Math.sign(side(ux, uy)) ? 1 : 0;
  return `A${r} ${r / ratio} ${(angle * 180) / Math.PI} ${large} ${sweep} ${x1} ${y1}`;
}

const NAME_MAP = {
  rectangle: 'rect', square: 'square', circle: 'circle', ellipse: 'ellipse', process: 'process', decision: 'decision', 'start/end': 'terminator', terminator: 'terminator',
  document: 'document', data: 'data', 'predefined process': 'predefined', 'rounded rectangle': 'roundRect', triangle: 'triangle', diamond: 'diamond', hexagon: 'hexagon',
  pentagon: 'pentagon', octagon: 'octagon', 'on-page reference': 'onPage', 'off-page reference': 'offPage', 'manual input': 'manualInput', 'manual operation': 'manualOperation',
  preparation: 'preparation', database: 'magneticDisk', 'stored data': 'storedData', 'internal storage': 'internalStorage', 'multiple documents': 'multiDocument', delay: 'delay', display: 'display', cloud: 'cloud',
};

/** Reads a Visio file (.vsdx / .vstx bytes) into a drawing. */
export async function importVsdx(bytes, { language = 'ko', title = 'Drawing' } = {}) {
  const pkg = unzip(bytes);
  const decoder = new TextDecoder();
  const readXml = async (path) => parseXml(decoder.decode(await pkg.read(path)));
  const relsOf = async (part) => {
    const dir = part.slice(0, part.lastIndexOf('/') + 1);
    const relPath = `${dir}_rels/${part.slice(dir.length)}.rels`;
    const map = new Map();
    if (!pkg.has(relPath)) return map;
    for (const r of childrenNamed(await readXml(relPath), 'Relationship')) map.set(r.attrs.Id, { type: r.attrs.Type ?? '', target: resolvePart(dir, r.attrs.Target ?? '') });
    return map;
  };
  const rootRels = await relsOf('_rels/x');
  const rootList = pkg.has('_rels/.rels') ? childrenNamed(parseXml(decoder.decode(await pkg.read('_rels/.rels'))), 'Relationship') : [];
  void rootRels;
  const documentPart = rootList.find((r) => /\/document$/.test(r.attrs.Type ?? ''))?.attrs.Target?.replace(/^\//, '') ?? 'visio/document.xml';
  if (!pkg.has(documentPart)) throw Object.assign(new Error('format.notVisio'), { code: 'format.notVisio' });
  const docXml = await readXml(documentPart);
  const docRels = await relsOf(documentPart);
  // Style sheets: id → shape-like data, with the parents they are based on.
  const styles = new Map();
  for (const sheet of childNamed(docXml, 'StyleSheets')?.children ?? []) if (sheet.name === 'StyleSheet') styles.set(sheet.attrs.ID, readVShape(sheet));
  const styleCell = (id, name, seen = new Set()) => {
    if (id == null || seen.has(id)) return undefined;
    seen.add(id);
    const sheet = styles.get(id);
    if (!sheet) return undefined;
    if (sheet.cells.has(name)) return sheet.cells.get(name);
    return styleCell(sheet.lineStyle, name, seen) ?? styleCell(sheet.fillStyle, name, seen) ?? styleCell(sheet.textStyle, name, seen);
  };
  const styleSection = (id, name, seen = new Set()) => {
    if (id == null || seen.has(id)) return [];
    seen.add(id);
    const sheet = styles.get(id);
    if (!sheet) return [];
    const own = sheet.sections.filter((s) => s.n === name);
    return own.length ? own : styleSection(sheet.textStyle, name, seen);
  };
  // Masters: id → Map(shape id → shape), plus the top shape.
  const masters = new Map();
  const mastersRel = [...docRels.values()].find((r) => /\/masters$/.test(r.type));
  if (mastersRel && pkg.has(mastersRel.target)) {
    const list = await readXml(mastersRel.target);
    const rels = await relsOf(mastersRel.target);
    for (const m of childrenNamed(list, 'Master')) {
      const rel = rels.get(childNamed(m, 'Rel')?.attrs.id);
      if (!rel || !pkg.has(rel.target)) continue;
      const contents = await readXml(rel.target);
      const shapes = (childNamed(contents, 'Shapes')?.children ?? []).filter((c) => c.name === 'Shape').map(readVShape);
      const index = new Map();
      const walk = (list2) => { for (const s of list2) { index.set(s.id, s); walk(s.children); } };
      walk(shapes);
      masters.set(m.attrs.ID, { nameU: m.attrs.NameU ?? m.attrs.Name ?? '', top: shapes[0] ?? null, index });
    }
  }
  const pagesRel = [...docRels.values()].find((r) => /\/pages$/.test(r.type));
  const pagesPart = pagesRel?.target ?? 'visio/pages/pages.xml';
  if (!pkg.has(pagesPart)) throw Object.assign(new Error('format.notVisio'), { code: 'format.notVisio' });
  const pagesXml = await readXml(pagesPart);
  const pageRels = await relsOf(pagesPart);
  const doc = createDocument({ title, language });
  doc.pages = [];
  const coreTitle = pkg.has('docProps/core.xml') ? allText(childNamed(await readXml('docProps/core.xml'), 'title') ?? null).trim() : '';
  if (coreTitle) doc.title = coreTitle;
  const pageIdMap = new Map();
  const pending = [];
  for (const pageNode of childrenNamed(pagesXml, 'Page')) {
    const sheet = readVShape(childNamed(pageNode, 'PageSheet') ?? { attrs: {}, children: [] });
    const W = numberOf(sheet.cells.get('PageWidth'), 11) * IN;
    const H = numberOf(sheet.cells.get('PageHeight'), 8.5) * IN;
    const page = createPage({ name: pageNode.attrs.NameU ?? pageNode.attrs.Name ?? `Page-${doc.pages.length + 1}`, width: W, height: H });
    page.name = pageNode.attrs.Name ?? page.name;
    page.orientation = W >= H ? 'landscape' : 'portrait';
    page.background = pageNode.attrs.Background === '1';
    page.autoSize = false;
    const layerSection = sheet.sections.find((s) => s.n === 'Layer');
    const layerIds = [];
    for (const row of layerSection?.rows ?? []) {
      const layer = addLayer(page, String(row.cells.get('Name')?.V ?? `Layer ${layerIds.length + 1}`));
      layer.visible = numberOf(row.cells.get('Visible'), 1) !== 0;
      layer.print = numberOf(row.cells.get('Print'), 1) !== 0;
      layer.locked = numberOf(row.cells.get('Lock'), 0) !== 0;
      const color = colorOf(row.cells.get('Color'));
      if (color && row.cells.get('Color')?.V !== '255') layer.color = color;
      layerIds.push(layer.id);
    }
    pageIdMap.set(pageNode.attrs.ID, page.id);
    doc.pages.push(page);
    const rel = pageRels.get(childNamed(pageNode, 'Rel')?.attrs.id);
    pending.push({ page, part: rel?.target, H, back: pageNode.attrs.BackPage, layerIds });
  }
  for (const { page, part, H, back, layerIds } of pending) {
    if (back && pageIdMap.has(back)) page.backgroundId = pageIdMap.get(back);
    if (!part || !pkg.has(part)) continue;
    const contents = await readXml(part);
    const rels = await relsOf(part);
    const idToShape = new Map();
    const connectors = new Map();
    const read = async (vs, parentMatrix, inheritedMaster) => {
      const masterRef = vs.master ? masters.get(vs.master) : inheritedMaster;
      const masterShape = masterRef ? (vs.masterShape ? masterRef.index.get(vs.masterShape) : vs.master ? masterRef.top : null) : null;
      const get = (name) => vs.cells.get(name) ?? masterShape?.cells.get(name) ?? styleCell(vs.lineStyle ?? masterShape?.lineStyle, name) ?? styleCell(vs.fillStyle ?? masterShape?.fillStyle, name) ?? styleCell(vs.textStyle ?? masterShape?.textStyle, name);
      const n2 = (name, fallback = 0) => numberOf(get(name), fallback);
      const W = n2('Width', 1) * IN;
      const Hs = n2('Height', 1) * IN;
      const pinX = n2('PinX') * IN; const pinY = n2('PinY') * IN;
      const locX = n2('LocPinX', W / IN / 2) * IN; const locY = n2('LocPinY', Hs / IN / 2) * IN;
      const angle = n2('Angle');
      const flipX = n2('FlipX') === 1; const flipY = n2('FlipY') === 1;
      // Local (Visio, y up, inches → px) → page (Visio) through the parents.
      const matrix = (lx, ly) => {
        let dx = lx - locX; let dy = ly - locY;
        if (flipX) dx = -dx;
        if (flipY) dy = -dy;
        const px = pinX + dx * Math.cos(angle) - dy * Math.sin(angle);
        const py = pinY + dx * Math.sin(angle) + dy * Math.cos(angle);
        return parentMatrix(px, py);
      };
      const totalAngle = (parentMatrix.angle ?? 0) + angle * (parentMatrix.flips ? -1 : 1);
      matrix.angle = totalAngle;
      matrix.flips = (parentMatrix.flips ? 1 : 0) ^ (flipX ? 1 : 0) ^ (flipY ? 1 : 0);
      const layerMember = String(get('LayerMember')?.V ?? '').split(';').filter((s) => s !== '').map((s) => layerIds[Number(s)]).filter(Boolean);
      const text = vs.text ?? masterShape?.text ?? '';
      const charRow = mergedSections(vs.sections, masterShape?.sections, 'Character')[0]?.rows[0] ?? styleSection(vs.textStyle ?? masterShape?.textStyle, 'Character')[0]?.rows[0];
      const paraRow = mergedSections(vs.sections, masterShape?.sections, 'Paragraph')[0]?.rows[0] ?? styleSection(vs.textStyle ?? masterShape?.textStyle, 'Paragraph')[0]?.rows[0];
      const style = {};
      if (charRow) {
        const size = numberOf(charRow.cells.get('Size'), 0);
        if (size > 0) style.fontSize = Math.round(size * IN * 10) / 10;
        const color = colorOf(charRow.cells.get('Color'));
        if (color) style.textColor = color;
        const bits = numberOf(charRow.cells.get('Style'), 0);
        if (bits & 1) style.bold = true;
        if (bits & 2) style.italic = true;
        if (bits & 4) style.underline = true;
        const font = String(charRow.cells.get('Font')?.V ?? '');
        if (font && !/^\d+$/.test(font) && font !== 'Themed') style.font = font;
      }
      if (paraRow) style.align = ['left', 'center', 'right'][numberOf(paraRow.cells.get('HorzAlign'), 1)] ?? 'center';
      style.valign = ['top', 'middle', 'bottom'][n2('VerticalAlign', 1)] ?? 'middle';
      const lineColor = colorOf(get('LineColor'));
      const linePattern = n2('LinePattern', 1);
      style.line = linePattern === 0 ? 'none' : lineColor ?? '#000000';
      if (LINE_PATTERN_NAMES[linePattern] && linePattern > 1) style.dash = LINE_PATTERN_NAMES[linePattern];
      style.lineWidth = Math.round(n2('LineWeight', 0.01) * IN * 100) / 100 || 1;
      const data = (mergedSections(vs.sections, masterShape?.sections, 'Property')[0]?.rows ?? []).map((row) => ({
        key: row.n ?? `Prop${row.ix}`, label: String(row.cells.get('Label')?.V ?? row.n ?? ''), value: String(row.cells.get('Value')?.V ?? ''),
        type: { 2: 'number', 7: 'currency', 5: 'date', 3: 'bool', 1: 'list' }[numberOf(row.cells.get('Type'), 0)] ?? 'text', options: String(row.cells.get('Format')?.V ?? '').split(';').filter(Boolean),
      }));
      const linkRow = mergedSections(vs.sections, masterShape?.sections, 'Hyperlink')[0]?.rows[0];
      const hyperlink = linkRow ? String(linkRow.cells.get('Address')?.V ?? '') || (linkRow.cells.get('SubAddress')?.V ? `page:${linkRow.cells.get('SubAddress').V}` : '') : '';
      // 1-D shapes become connectors.
      if (get('BeginX') && get('EndX') && (n2('ObjType', 2) === 2 || Hs < 1)) {
        const b = parentMatrix(n2('BeginX') * IN, n2('BeginY') * IN);
        const e = parentMatrix(n2('EndX') * IN, n2('EndY') * IN);
        const sections = mergedSections(vs.sections, masterShape?.sections, 'Geometry');
        const pts = [];
        for (const section of sections) for (const row of section.rows) {
          if (!['MoveTo', 'LineTo', 'RelMoveTo', 'RelLineTo'].includes(row.t)) continue;
          const rel = row.t.startsWith('Rel');
          const lx = rel ? numberOf(row.cells.get('X')) * W : numberOf(row.cells.get('X')) * IN;
          const ly = rel ? numberOf(row.cells.get('Y')) * Hs : numberOf(row.cells.get('Y')) * IN;
          pts.push(matrix(lx, ly));
        }
        const toPage = (p) => ({ x: p.x, y: H - p.y });
        const connector = createConnector(toPage(b), toPage(e), { text, route: 'straight' });
        const inner = pts.slice(1, -1).map(toPage);
        const orthogonal = pts.length > 2 && pts.every((p, i) => !i || Math.abs(p.x - pts[i - 1].x) < 0.5 || Math.abs(p.y - pts[i - 1].y) < 0.5);
        connector.route = orthogonal ? 'orthogonal' : pts.length > 2 ? 'straight' : n2('ShapeRouteStyle', 0) === 2 ? 'straight' : 'orthogonal';
        connector.waypoints = orthogonal ? [] : inner;
        connector.style = { line: style.line, lineWidth: style.lineWidth, ...(style.dash ? { dash: style.dash } : {}), startArrow: ARROW_NAMES[n2('BeginArrow')] ?? (n2('BeginArrow') ? 'arrow' : 'none'), endArrow: ARROW_NAMES[n2('EndArrow')] ?? (n2('EndArrow') ? 'arrow' : 'none'), ...(style.fontSize ? { fontSize: style.fontSize } : {}), ...(style.textColor ? { textColor: style.textColor } : {}) };
        connector.layers = layerMember;
        connector.data = normalizeData(data);
        connector.name = vs.name;
        addShape(page, connector);
        idToShape.set(vs.id, connector);
        connectors.set(vs.id, connector);
        return connector;
      }
      const c = matrix(W / 2, Hs / 2);
      const cx = c.x; const cy = H - c.y;
      const isGroupShape = vs.type === 'Group' && vs.children.length;
      let shape;
      if (isGroupShape) {
        const members = [];
        for (const child of vs.children) members.push(await read(child, matrix, masterRef));
        shape = { id: newId('grp'), type: 'group', master: 'group', name: vs.name, x: cx - W / 2, y: cy - Hs / 2, w: W, h: Hs, angle: 0, flipH: false, flipV: false, showData: false, text: '', style: {}, qs: {}, params: {}, layers: layerMember, locked: {}, data: normalizeData(data), hyperlink, comments: [], groupId: null };
        for (const member of members) if (member && !member.groupId) member.groupId = shape.id;
        addShape(page, shape);
        idToShape.set(vs.id, shape);
        return shape;
      }
      const fillColor = colorOf(get('FillForegnd'));
      const fillPattern = n2('FillPattern', 1);
      style.fill = fillPattern === 0 ? 'none' : fillColor ?? '#ffffff';
      if (fillPattern >= 25 && fillPattern <= 40) { style.fillPattern = fillPattern >= 35 ? 'radial' : 'linear'; style.fill2 = colorOf(get('FillBkgnd')) ?? '#ffffff'; }
      const trans = n2('FillForegndTrans', 0);
      if (trans > 0) style.fillOpacity = Math.round((1 - trans) * 100);
      if (n2('ShdwPattern', 0) > 0) style.shadow = true;
      const rounding = n2('Rounding', 0) * IN;
      if (rounding > 0) style.rounding = rounding;
      let masterId = NAME_MAP[String(masterRef?.nameU ?? vs.nameU).replace(/\.\d+$/, '').toLowerCase()] ?? null;
      const geometry = geometryToParts(mergedSections(vs.sections, masterShape?.sections, 'Geometry'), W, Hs);
      let params = {};
      if (vs.foreignRel && rels.get(vs.foreignRel)) {
        const target = rels.get(vs.foreignRel).target;
        if (pkg.has(target)) {
          const ext = target.split('.').pop().toLowerCase();
          const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', emf: 'image/emf', wmf: 'image/wmf' }[ext] ?? 'image/png';
          masterId = 'image';
          params = { src: `data:${mime};base64,${bytesToBase64(await pkg.read(target))}` };
        }
      }
      if (!masterId) {
        masterId = 'svgpath';
        params = { parts: geometry.map((part) => ({ d: segmentsToPath(parsePath(part.d).map((s) => ({ c: s.c, p: s.p.map((val, i) => (i % 2 ? (Hs ? val / Hs : 0) : (W ? val / W : 0))) }))), fill: part.fill })) };
        if (!geometry.length) style.line = style.line ?? 'none';
      }
      shape = createShape(masterId, { x: cx - W / 2, y: cy - Hs / 2, w: Math.max(1, W), h: Math.max(1, Hs), text, name: vs.name, layers: layerMember, data: normalizeData(data), hyperlink });
      if (masterId === 'svgpath') shape.params = params;
      if (masterId === 'image') shape.src = params.src;
      shape.angle = Math.round((((-(totalAngle * 180) / Math.PI) % 360 + 360) % 360) * 100) / 100 % 360;
      shape.flipH = flipX; shape.flipV = flipY;
      shape.style = style;
      // Connection points of its own (Visio rows) for gluing.
      const connRows = mergedSections(vs.sections, masterShape?.sections, 'Connection')[0]?.rows ?? [];
      if (connRows.length && masterId === 'svgpath') shape.points = connRows.map((row) => [W ? (numberOf(row.cells.get('X')) * IN) / W : 0.5, Hs ? 1 - (numberOf(row.cells.get('Y')) * IN) / Hs : 0.5]);
      addShape(page, shape);
      idToShape.set(vs.id, shape);
      return shape;
    };
    const top = (x2, y2) => ({ x: x2, y: y2 });
    top.angle = 0; top.flips = 0;
    for (const node of (childNamed(contents, 'Shapes')?.children ?? []).filter((c) => c.name === 'Shape')) await read(readVShape(node), top, null);
    for (const connect of childrenNamed(childNamed(contents, 'Connects'), 'Connect')) {
      const connector = connectors.get(connect.attrs.FromSheet);
      const target = idToShape.get(connect.attrs.ToSheet);
      if (!connector || !target || isConnector(target)) continue;
      const key = /^Begin/i.test(connect.attrs.FromCell ?? '') ? 'from' : /^End/i.test(connect.attrs.FromCell ?? '') ? 'to' : null;
      if (!key) continue;
      const m = /Connections\.X(\d+)/i.exec(connect.attrs.ToCell ?? '');
      connector[key] = { id: target.id, pt: m && target.points?.[Number(m[1]) - 1] ? Number(m[1]) - 1 : 'auto' };
    }
    refreshGroups(page);
  }
  if (!doc.pages.length) doc.pages.push(createPage({ name: language === 'en' ? 'Page-1' : '페이지-1' }));
  return doc;
}

// ───────────────────────── bytes

export function base64ToBytes(base64) {
  const binary = atob(String(base64).replace(/\s+/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ───────────────────────── HTML

/** A web page with every page of the drawing as SVG, a page list and the shape data. */
export function exportHtml(doc, { measure, language = 'ko' } = {}) {
  const pages = doc.pages.filter((page) => !page.background);
  const sections = pages.map((page, i) => {
    const { svg } = renderPageSvg(doc, page, { area: 'content', measure, language });
    return `<section id="page-${i + 1}"><h2>${x(page.name)}</h2><figure>${svg}</figure></section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${x(doc.title)}</title>
<style>:root{color-scheme:light}body{margin:0;background:#eef1f5;font:14px/1.5 "Segoe UI","Malgun Gothic",sans-serif;color:#111827}header{padding:20px 28px;background:#fff;border-bottom:1px solid #e5e7eb}h1{margin:0;font-size:24px}nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}nav a{padding:4px 10px;border:1px solid #d1d5db;border-radius:999px;color:#2f6fde;text-decoration:none}main{padding:20px 28px}section{margin:0 0 28px}h2{font-size:17px;margin:0 0 8px}figure{margin:0;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:12px;overflow:auto}figure svg{max-width:100%;height:auto;display:block}footer{padding:12px 28px;color:#9ca3af;font-size:12px}</style></head>
<body><header><h1>${x(doc.title)}</h1>${doc.subject ? `<p>${x(doc.subject)}</p>` : ''}<nav>${pages.map((page, i) => `<a href="#page-${i + 1}">${x(page.name)}</a>`).join('')}</nav></header>
<main>${sections}</main><footer>MyDiagram · ${x(new Date().toLocaleString(language === 'en' ? 'en-US' : 'ko-KR'))}</footer></body></html>
`;
}

// ───────────────────────── CSV: shape data

/** All shapes with their data (every page) as CSV: Page, ID, Name, Master, Text, then one column per data key. */
export function exportShapeDataCsv(doc, { language = 'ko' } = {}) {
  const keys = dataKeys(doc.pages);
  const head = language === 'en' ? ['Page', 'ID', 'Name', 'Master', 'Text'] : ['페이지', 'ID', '이름', '마스터', '텍스트'];
  const rows = [[...head, ...keys]];
  for (const page of doc.pages) {
    for (const shape of page.shapes) {
      if (isGroup(shape)) continue;
      const master = isConnector(shape) ? (language === 'en' ? 'Connector' : '연결선') : masterById(shape.master).name[language === 'en' ? 'en' : 'ko'];
      rows.push([page.name, shape.id, shape.name ?? '', master, shape.text ?? '', ...keys.map((key) => shape.data?.find((f) => f.key === key)?.value ?? '')]);
    }
  }
  return toCsv(rows);
}

const HEAD_ALIASES = { id: ['id', '도형 id', 'shape id'], name: ['name', '이름', 'shape name'], text: ['text', '텍스트', '내용'], page: ['page', '페이지'], master: ['master', '마스터'] };
const headerIs = (cellText, key) => HEAD_ALIASES[key].includes(String(cellText ?? '').trim().toLowerCase());

/**
 * Links CSV rows to shapes (Visio "Link Data to Shapes"): a row goes to the shape with the same
 * ID, else the same name, else the same text; every other column becomes a data field.
 * Returns { matched, rows, created } and changes the document.
 */
export function linkDataCsv(doc, page, text, { createMissing = false, master = 'process' } = {}) {
  const rows = parseCsv(text).filter((row) => row.some((c) => String(c).trim()));
  if (rows.length < 2) return { matched: 0, rows: 0, created: 0 };
  const head = rows[0].map((h) => String(h).replace(/^﻿/, '').trim());
  const col = (key) => head.findIndex((h) => headerIs(h, key));
  const idCol = col('id'); const nameCol = col('name'); const textCol = col('text');
  const skip = new Set([idCol, col('page'), col('master')].filter((i) => i >= 0));
  let matched = 0; let created = 0;
  let y = 40;
  for (const row of rows.slice(1)) {
    const find = (index, prop) => (index >= 0 && String(row[index]).trim() ? page.shapes.find((s) => !isConnector(s) && String(s[prop] ?? '').trim() === String(row[index]).trim()) : null);
    let shape = find(idCol, 'id') ?? find(nameCol, 'name') ?? find(textCol, 'text');
    if (!shape && createMissing) {
      shape = addShape(page, createShape(master, { x: 40, y, text: textCol >= 0 ? row[textCol] : nameCol >= 0 ? row[nameCol] : '' }));
      if (nameCol >= 0) shape.name = String(row[nameCol]);
      y += shape.h + 20;
      created += 1;
    }
    if (!shape) continue;
    matched += 1;
    const fields = [...(shape.data ?? [])];
    head.forEach((h, i) => {
      if (skip.has(i) || !h) return;
      const value = String(row[i] ?? '');
      const type = value !== '' && Number.isFinite(Number(value)) ? 'number' : 'text';
      const existing = fields.find((f) => f.key === h);
      if (existing) existing.value = value; else fields.push({ key: h, label: h, type, value, options: [] });
    });
    shape.data = normalizeData(fields);
  }
  return { matched, rows: rows.length - 1, created };
}

// ───────────────────────── org chart from data

const ORG_COLUMNS = { name: ['name', '이름', '성명', 'employee'], title: ['title', '직함', '직위', '직책', 'position', 'role'], manager: ['manager', 'reports to', '상사', '관리자', '보고 대상', 'reportsto', 'parent'], department: ['department', '부서', 'dept', 'team', '팀'] };

/**
 * An org chart on `page` from CSV / TSV text with name, title and manager columns
 * (other columns become shape data). Returns { count, roots }.
 */
export function orgChartFromData(page, text, { spacing = 40 } = {}) {
  const rows = parseCsv(text).filter((row) => row.some((c) => String(c).trim()));
  if (rows.length < 2) return { count: 0, roots: 0 };
  const head = rows[0].map((h) => String(h).replace(/^﻿/, '').trim());
  const find = (key) => head.findIndex((h) => ORG_COLUMNS[key].includes(h.toLowerCase()));
  const nameCol = find('name') >= 0 ? find('name') : 0;
  const titleCol = find('title');
  const managerCol = find('manager');
  const people = rows.slice(1).map((row) => ({ row, name: String(row[nameCol] ?? '').trim(), title: titleCol >= 0 ? String(row[titleCol] ?? '').trim() : '', manager: managerCol >= 0 ? String(row[managerCol] ?? '').trim() : '' })).filter((p) => p.name);
  const byName = new Map(people.map((p) => [p.name, p]));
  const reports = new Map();
  for (const p of people) if (p.manager && byName.has(p.manager) && p.manager !== p.name) reports.set(p.manager, (reports.get(p.manager) ?? 0) + 1);
  const depth = (p, seen = new Set()) => (!p.manager || !byName.has(p.manager) || seen.has(p.name) ? 0 : (seen.add(p.name), 1 + depth(byName.get(p.manager), seen)));
  const shapes = new Map();
  for (const p of people) {
    const d = depth(p);
    const master = d === 0 ? 'orgExecutive' : reports.get(p.name) ? 'orgManager' : 'orgPosition';
    const shape = addShape(page, createShape(master, { x: 40, y: 40, text: p.title ? `${p.name}\n${p.title}` : p.name, name: p.name }));
    shape.data = normalizeData(head.map((h, i) => (i === nameCol || i === titleCol || i === managerCol || !h ? null : { key: h, label: h, value: String(p.row[i] ?? '') })).filter(Boolean));
    shapes.set(p.name, shape);
  }
  for (const p of people) {
    if (!p.manager || !shapes.has(p.manager) || p.manager === p.name) continue;
    addShape(page, createConnector({ id: shapes.get(p.manager).id, pt: 'auto' }, { id: shapes.get(p.name).id, pt: 'auto' }, { route: 'orthogonal', style: { endArrow: 'none' } }));
  }
  layoutPage(page, { kind: 'treeTB', spacing, ids: [...shapes.values()].map((s) => s.id), origin: { x: 40, y: 40 } });
  return { count: people.length, roots: people.filter((p) => !p.manager || !byName.has(p.manager)).length };
}

/** Plain text pasted from elsewhere: one shape per line (a list), or one text box. */
export function shapesFromText(page, text, { at = { x: 60, y: 60 }, list = true, master = 'process' } = {}) {
  const lines = String(text ?? '').split(/\r?\n/).map((line) => line.replace(/\t/g, ' ').trim()).filter(Boolean);
  if (!lines.length) return [];
  if (!list || lines.length === 1) {
    const box = addShape(page, createShape('textBox', { x: at.x, y: at.y, w: Math.min(480, Math.max(120, Math.max(...lines.map((l) => l.length)) * 8)), h: Math.max(40, lines.length * 18 + 10), text: lines.join('\n') }));
    return [box.id];
  }
  const ids = [];
  let y = at.y;
  let previous = null;
  for (const line of lines) {
    const shape = addShape(page, createShape(master, { x: at.x, y, text: line }));
    if (previous) addShape(page, createConnector({ id: previous.id, pt: 'auto' }, { id: shape.id, pt: 'auto' }));
    previous = shape;
    ids.push(shape.id);
    y += shape.h + 40;
  }
  return ids;
}

export { dashArray };
