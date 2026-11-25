// What an OpenSCAD program made, written as OpenSCAD's own exports write it: a 2D result (outlines in mm) as SVG,
// DXF or PDF; a 3D result (verts, tris) as STL, OFF, AMF or 3MF (mesh-formats.js); and the CSG tree (csg-tree.js).
import { stlBinary, writeOff, writeAmf, write3mf } from '../mesh-formats.js';

const num = (v) => String(Math.round(v * 1e6) / 1e6);

/** The box of outlines: [minX, minY, maxX, maxY]. */
export function outlineBounds(outlines) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of outlines) for (const [x, y] of o) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 0, 0];
}

/** SVG in millimetres (y up turned into SVG's y down), one path filled even-odd, as OpenSCAD writes it. */
export function svgOf(outlines, { fill = 'lightgray', stroke = 'black' } = {}) {
  const [x0, y0, x1, y1] = outlineBounds(outlines);
  const w = Math.max(x1 - x0, 1e-6); const h = Math.max(y1 - y0, 1e-6);
  const d = outlines.map((o) => `M${o.map(([x, y]) => `${num(x)},${num(-y)}`).join(' L')} z`).join(' ');
  return `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width="${num(w)}mm" height="${num(h)}mm" viewBox="${num(x0)} ${num(-y1)} ${num(w)} ${num(h)}" xmlns="http://www.w3.org/2000/svg" version="1.1">
<title>OpenSCAD Model</title>
<path d="${d}" stroke="${stroke}" fill="${fill}" stroke-width="0.5" fill-rule="evenodd"/>
</svg>
`;
}

/** DXF (R12, millimetres): every outline a closed LWPOLYLINE on layer 0, as OpenSCAD writes it. */
export function dxfOf(outlines) {
  const out = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '1', '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS', '0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  for (const o of outlines) {
    out.push('0', 'POLYLINE', '8', '0', '66', '1', '70', '1');
    for (const [x, y] of o) out.push('0', 'VERTEX', '8', '0', '10', num(x), '20', num(y), '30', '0');
    out.push('0', 'SEQEND', '8', '0');
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return `${out.join('\n')}\n`;
}

/**
 * PDF: the outlines at 1:1 on an A4 page (portrait, or landscape when the shape is wider), centred, filled
 * even-odd with a black outline; a 10 mm grid behind it as OpenSCAD's PDF export draws (and a scale note).
 */
export function pdfOf(outlines, { title = 'OpenSCAD Model' } = {}) {
  const PT = 72 / 25.4;
  const [x0, y0, x1, y1] = outlineBounds(outlines);
  const landscape = x1 - x0 > y1 - y0;
  const pw = landscape ? 842 : 595; const ph = landscape ? 595 : 842;
  const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
  const X = (x) => num(pw / 2 + (x - cx) * PT); const Y = (y) => num(ph / 2 + (y - cy) * PT);
  const ops = [];
  // Grid every 10 mm (light), through the shape's centre.
  ops.push('0.85 0.85 0.85 RG 0.3 w');
  for (let gx = cx - Math.floor((pw / PT / 2) / 10) * 10; (gx - cx) * PT < pw / 2; gx += 10) ops.push(`${X(gx)} 0 m ${X(gx)} ${ph} l S`);
  for (let gy = cy - Math.floor((ph / PT / 2) / 10) * 10; (gy - cy) * PT < ph / 2; gy += 10) ops.push(`0 ${Y(gy)} m ${pw} ${Y(gy)} l S`);
  ops.push('0.83 0.83 0.83 rg 0 0 0 RG 0.5 w');
  const path = outlines.map((o) => `${o.map(([x, y], i) => `${X(x)} ${Y(y)} ${i ? 'l' : 'm'}`).join(' ')} h`).join(' ');
  if (path) ops.push(`${path} B*`);
  ops.push(`BT /F1 9 Tf 0 0 0 rg 36 24 Td (${title.replace(/[()\\]/g, '\\$&')}  -  scale 1:1, mm, grid 10 mm) Tj ET`);
  const stream = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Title (${title.replace(/[()\\]/g, '\\$&')}) /Producer (MyMechanics) >>`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}

/** The export formats of a result by its dimension. */
export const SCAD_EXPORTS = { 2: ['svg', 'dxf', 'pdf', 'csg'], 3: ['stl', 'off', 'amf', '3mf', 'csg'] };

/**
 * A run result as a file: { data (string | Uint8Array), ext, mime }. `format` one of SCAD_EXPORTS (csg is
 * written by the caller from csgTree()).
 */
export function exportScadResult(r, format, { name = 'model', color = [0.98, 0.84, 0.17] } = {}) {
  if (r.dim === 2) {
    if (format === 'svg') return { data: svgOf(r.outlines), ext: 'svg', mime: 'image/svg+xml' };
    if (format === 'dxf') return { data: dxfOf(r.outlines), ext: 'dxf', mime: 'image/vnd.dxf' };
    if (format === 'pdf') return { data: pdfOf(r.outlines, { title: name }), ext: 'pdf', mime: 'application/pdf' };
  }
  if (r.dim === 3) {
    const c = r.color ? r.color.slice(0, 3) : color;
    const items = [{ name, color: c, vertices: Float32Array.from(r.verts.flat()), triangles: Uint32Array.from(r.tris.flat()) }];
    if (format === 'stl') return { data: stlBinary(items), ext: 'stl', mime: 'model/stl' };
    if (format === 'off') return { data: writeOff(items), ext: 'off', mime: 'model/off' };
    if (format === 'amf') return { data: writeAmf(items), ext: 'amf', mime: 'application/x-amf' };
    if (format === '3mf') return { data: write3mf(items), ext: '3mf', mime: 'model/3mf' };
  }
  return null;
}
