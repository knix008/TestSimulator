/**
 * Minimal IFC STEP format parser (IFC2X3 / IFC4)
 * Extracts wall geometry: IfcWall, IfcWallStandardCase
 */

function buildEntityMap(text) {
  const map = new Map();
  const len = text.length;
  let i = 0;

  while (i < len) {
    while (i < len && text[i] !== '#') i++;
    if (i >= len) break;

    let j = i + 1;
    while (j < len && text[j] >= '0' && text[j] <= '9') j++;
    if (j === i + 1) { i++; continue; }
    const id = text.slice(i + 1, j);

    while (j < len && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r' || text[j] === '\n' || text[j] === '=')) j++;

    let k = j;
    while (k < len && ((text[k] >= 'A' && text[k] <= 'Z') || (text[k] >= '0' && text[k] <= '9'))) k++;
    if (k === j) { i = j; continue; }
    const type = text.slice(j, k);

    while (k < len && text[k] !== '(' && text[k] !== ';' && text[k] !== '\n') k++;
    if (k >= len || text[k] !== '(') { i = k; continue; }

    let depth = 0, inStr = false, m = k;
    while (m < len) {
      const c = text[m];
      if (c === "'" && !inStr) { inStr = true; m++; continue; }
      if (c === "'" && inStr) { inStr = false; m++; continue; }
      if (!inStr) {
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) break; }
      }
      m++;
    }

    if (m < len) map.set(id, { type, raw: text.slice(k + 1, m) });
    i = m + 1;
  }

  return map;
}

function splitParams(raw) {
  const params = [];
  let depth = 0, inStr = false, start = 0;

  for (let i = 0; i <= raw.length; i++) {
    const c = i < raw.length ? raw[i] : ',';
    if (c === "'" && !inStr) { inStr = true; continue; }
    if (c === "'" && inStr) { inStr = false; continue; }
    if (!inStr) {
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === ',' && depth === 0) {
        params.push(raw.slice(start, i).trim());
        start = i + 1;
      }
    }
  }
  return params;
}

function parseVal(s) {
  s = s.trim();
  if (!s || s === '$' || s === '*') return null;
  if (s.startsWith('#')) return { $ref: s.slice(1) };
  if (s.startsWith("'")) return s.slice(1, s.length - 1);
  if (s.startsWith('.')) return s.slice(1, s.length - 1);
  if (s.startsWith('(')) return splitParams(s.slice(1, s.length - 1)).map(parseVal);
  const n = Number(s);
  return isNaN(n) ? s : n;
}

function getParams(entity) {
  if (!entity) return [];
  return splitParams(entity.raw).map(parseVal);
}

function deref(entities, r) {
  return r?.$ref ? entities.get(r.$ref) : null;
}

function getPoint(entities, r) {
  const e = deref(entities, r);
  if (!e || e.type !== 'IFCCARTESIANPOINT') return [0, 0, 0];
  const p = getParams(e);
  const c = Array.isArray(p[0]) ? p[0] : [];
  return [+c[0] || 0, +c[1] || 0, +c[2] || 0];
}

function getDir(entities, r) {
  const e = deref(entities, r);
  if (!e || e.type !== 'IFCDIRECTION') return [1, 0, 0];
  const p = getParams(e);
  const d = Array.isArray(p[0]) ? p[0] : [];
  return [+d[0] || 1, +d[1] || 0, +d[2] || 0];
}

function resolveAxis2P3D(entities, r) {
  const e = deref(entities, r);
  if (!e || e.type !== 'IFCAXIS2PLACEMENT3D') return { origin: [0,0,0], xDir: [1,0,0] };
  const p = getParams(e);
  return {
    origin: getPoint(entities, p[0]),
    xDir:   p[2] ? getDir(entities, p[2]) : [1,0,0],
  };
}

function resolveLocalPlacement(entities, r, depth = 0) {
  if (depth > 8) return { origin: [0,0,0], xDir: [1,0,0] };
  const e = deref(entities, r);
  if (!e) return { origin: [0,0,0], xDir: [1,0,0] };

  if (e.type === 'IFCLOCALPLACEMENT') {
    const p = getParams(e);
    const local = resolveAxis2P3D(entities, p[1]);

    if (p[0]?.$ref) {
      const parent = resolveLocalPlacement(entities, p[0], depth + 1);
      const [px, py] = parent.xDir;
      const [lx, ly] = local.xDir;
      const worldX = lx * px - ly * py;
      const worldY = lx * py + ly * px;
      const [lox, loy] = local.origin;
      return {
        origin: [parent.origin[0] + lox * px - loy * py, parent.origin[1] + lox * py + loy * px, 0],
        xDir: [worldX, worldY, 0],
      };
    }
    return { origin: local.origin, xDir: local.xDir };
  }
  return { origin: [0,0,0], xDir: [1,0,0] };
}

function extractWallDims(entities, shapeRef) {
  const shape = deref(entities, shapeRef);
  if (!shape || shape.type !== 'IFCPRODUCTDEFINITIONSHAPE') return null;

  const sp = getParams(shape);
  const reps = Array.isArray(sp[2]) ? sp[2] : [];

  for (const repRef of reps) {
    const rep = deref(entities, repRef);
    if (!rep || rep.type !== 'IFCSHAPEREPRESENTATION') continue;

    const rp = getParams(rep);
    const items = Array.isArray(rp[3]) ? rp[3] : [];

    for (const itemRef of items) {
      const item = deref(entities, itemRef);
      if (!item) continue;

      if (item.type === 'IFCEXTRUDEDAREASOLID') {
        const ep = getParams(item);
        const profile = deref(entities, ep[0]);
        const depth = typeof ep[3] === 'number' ? ep[3] : 0;

        if (profile?.type === 'IFCRECTANGLEPROFILEDEF') {
          const pp = getParams(profile);
          return {
            length:    typeof pp[3] === 'number' ? pp[3] : 0,
            thickness: typeof pp[4] === 'number' ? pp[4] : 0,
            height:    depth,
          };
        }
      }

      // IfcBooleanClippingResult wrapping ExtrudedAreaSolid
      if (item.type === 'IFCBOOLEANCLIPPINGRESULT') {
        const bp = getParams(item);
        const inner = deref(entities, bp[1]);
        if (inner?.type === 'IFCEXTRUDEDAREASOLID') {
          const ep = getParams(inner);
          const profile = deref(entities, ep[0]);
          const depth = typeof ep[3] === 'number' ? ep[3] : 0;
          if (profile?.type === 'IFCRECTANGLEPROFILEDEF') {
            const pp = getParams(profile);
            return {
              length:    typeof pp[3] === 'number' ? pp[3] : 0,
              thickness: typeof pp[4] === 'number' ? pp[4] : 0,
              height:    depth,
            };
          }
        }
      }
    }
  }
  return null;
}

function detectUnitScale(entities) {
  for (const [, ent] of entities) {
    if (ent.type !== 'IFCUNITASSIGNMENT') continue;
    const p = getParams(ent);
    const units = Array.isArray(p[0]) ? p[0] : [];
    for (const uRef of units) {
      const u = deref(entities, uRef);
      if (!u || u.type !== 'IFCSIUNIT') continue;
      const up = getParams(u);
      if (up[1] !== 'LENGTHUNIT') continue;
      const prefix = up[2]; // 'MILLI', 'CENTI', null, etc.
      const name   = up[3]; // 'METRE', 'FOOT', 'INCH'
      if (name === 'METRE') {
        if (prefix === 'MILLI') return 0.001;
        if (prefix === 'CENTI') return 0.01;
        return 1.0;
      }
      if (name === 'FOOT')  return 0.3048;
      if (name === 'INCH')  return 0.0254;
    }
  }
  return 0.001; // default: millimeters
}

export function parseIfc(content) {
  const entities  = buildEntityMap(content);
  const unitScale = detectUnitScale(entities);

  const walls = [];
  const WALL_TYPES = new Set(['IFCWALL', 'IFCWALLSTANDARDCASE']);

  for (const [, ent] of entities) {
    if (!WALL_TYPES.has(ent.type)) continue;

    const p    = getParams(ent);
    const name = (typeof p[2] === 'string' && p[2]) || 'Wall';

    const placementRef = p[5];
    const shapeRef     = p[6];
    if (!placementRef?.$ref || !shapeRef?.$ref) continue;

    const placement = resolveLocalPlacement(entities, placementRef, 0);
    const dims      = extractWallDims(entities, shapeRef);
    if (!dims || dims.length < 1) continue;

    const len = dims.length * unitScale;
    const sx  = placement.origin[0] * unitScale;
    const sy  = placement.origin[1] * unitScale;

    walls.push({
      start: { x: sx, y: sy },
      end:   { x: sx + placement.xDir[0] * len, y: sy + placement.xDir[1] * len },
      layer: 'IFC_WALLS',
      name,
    });
  }

  const layers = walls.length > 0 ? ['IFC_WALLS'] : [];
  return { walls, layers, unitScale };
}
