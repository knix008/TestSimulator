// Text objects: outlines from the chosen font (src/core/ttf.js), or the bundled Latin typeface when none is loaded, filled and
// optionally extruded. Data: { body, size, extrude, align, font, spacing, lineHeight }.
import { ExtrudeGeometry, ShapeGeometry, ShapePath } from 'three';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import typeface from 'three/examples/fonts/helvetiker_regular.typeface.json' with { type: 'json' };
import { createMesh } from './mesh.js';
import { mergeByDistance } from './meshops.js';
import { getFont } from './ttf.js';

const bundled = new Font(typeface);

// Characters the bundled typeface does not have, in a text with no font chosen, go to a fallback; the program is told when there is none yet.
let fallbackFont = null;
let missingFontHook = null;
export const setFallbackFont = (family) => { fallbackFont = family; };
export const setMissingFontHook = (hook) => { missingFontHook = hook; };
// eslint-disable-next-line no-control-regex
const outsideBundled = (text) => /[^\x00-\xff]/.test(text);

function shapesFrom(font, data) {
  const size = data.size ?? 1;
  const scale = size / font.unitsPerEm;
  const lineStep = size * (data.lineHeight ?? 1.2);
  const spacing = (data.spacing ?? 0) * size;
  const lines = String(data.body || ' ').replaceAll('\\n', '\n').split('\n');
  const shapes = [];
  const widths = lines.map((line) => { let w = 0; for (const ch of line) w += font.advance(font.glyphIndex(ch.codePointAt(0))) * scale + spacing; return w; });
  lines.forEach((line, row) => {
    let x = data.align === 'CENTER' ? -widths[row] / 2 : data.align === 'RIGHT' ? -widths[row] : 0;
    const y = -row * lineStep;
    for (const ch of line) {
      const glyph = font.glyphIndex(ch.codePointAt(0));
      const path = new ShapePath();
      for (const c of font.outline(glyph)) {
        if (c.t === 'M') path.moveTo(x + c.x * scale, y + c.y * scale);
        else if (c.t === 'L') path.lineTo(x + c.x * scale, y + c.y * scale);
        else if (c.t === 'Q') path.quadraticCurveTo(x + c.cx * scale, y + c.cy * scale, x + c.x * scale, y + c.y * scale);
        else if (c.t === 'C') path.bezierCurveTo(x + c.c1x * scale, y + c.c1y * scale, x + c.c2x * scale, y + c.c2y * scale, x + c.x * scale, y + c.y * scale);
      }
      if (path.subPaths.length) shapes.push(...path.toShapes(font.postScript));
      x += font.advance(glyph) * scale + spacing;
    }
  });
  return shapes;
}

export function textToMesh(data) {
  let font = data.font ? getFont(data.font) : null;
  if (!font && outsideBundled(data.body ?? '')) {
    font = fallbackFont ? getFont(fallbackFont) : null;
    if (!font) missingFontHook?.();
  }
  const shapes = font ? shapesFrom(font, data) : bundled.generateShapes(data.body || ' ', data.size ?? 1);
  if (!shapes.length) return createMesh();
  const geometry = data.extrude > 0
    ? new ExtrudeGeometry(shapes, { depth: data.extrude, bevelEnabled: false, curveSegments: 8 })
    : new ShapeGeometry(shapes, 8);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  // The chosen font lays out each line itself; the bundled one is shifted as a whole.
  const shift = font ? 0 : data.align === 'CENTER' ? -(box.min.x + box.max.x) / 2 : data.align === 'RIGHT' ? -box.max.x : 0;
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const mesh = createMesh();
  for (let i = 0; i < pos.count; i++) mesh.verts.push([pos.getX(i) + shift, pos.getY(i), pos.getZ(i)]);
  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const at = (k) => (index ? index.getX(k) : k);
    mesh.faces.push([at(i), at(i + 1), at(i + 2)]);
  }
  geometry.dispose();
  mergeByDistance(mesh, 1e-5, true);
  return mesh;
}
