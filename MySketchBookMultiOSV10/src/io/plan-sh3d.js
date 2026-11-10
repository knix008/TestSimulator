// Sweet Home 3D homes (.sh3d) → a building (plan-building.js). A .sh3d file is a ZIP: "Home.xml"
// (written by Sweet Home 3D 5.3 and later) describes the home; the furniture models are entries
// beside it ("0/model.obj" with its .mtl and textures, or one entry per model). Older files hold
// only "Home", a serialized Java object no other program can read: they are refused with a code
// (re-saving them in a current Sweet Home 3D adds Home.xml).
//
// Units: centimetres, plan y down (the same way round as the app's plan z). Angles are radians,
// clockwise on the plan; a piece's front faces +y at angle 0 (the app: +z), so rotation = −angle.
// Pure (fflate + a small XML reader), works in Node.
import { unzipSync, strFromU8 } from 'fflate';
import { stairsItem } from './plan-building.js';

export const isSh3dName = (name) => /\.sh3d$/i.test(name ?? '');

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m));

/** A small XML reader (elements and attributes; text, comments, DOCTYPE and processing instructions skipped). */
export function parseXml(text) {
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;
    if (text.startsWith('<!--', lt)) { const e = text.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (text.startsWith('<![CDATA[', lt)) { const e = text.indexOf(']]>', lt); i = e < 0 ? n : e + 3; continue; }
    if (text.startsWith('<?', lt)) { const e = text.indexOf('?>', lt); i = e < 0 ? n : e + 2; continue; }
    if (text.startsWith('<!', lt)) {
      // DOCTYPE, possibly with an internal subset [ … ].
      let j = lt + 2; let depth = 0;
      for (; j < n; j++) { const c = text[j]; if (c === '[') depth++; else if (c === ']') depth--; else if (c === '>' && depth <= 0) break; }
      i = j + 1; continue;
    }
    if (text[lt + 1] === '/') {
      const e = text.indexOf('>', lt);
      const name = text.slice(lt + 2, e).trim();
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      i = e + 1; continue;
    }
    // Start tag: the name, then attributes until > or />, quotes respected.
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(text[j])) j++;
    const el = { name: text.slice(lt + 1, j), attrs: {}, children: [] };
    let selfClose = false;
    while (j < n) {
      while (j < n && /\s/.test(text[j])) j++;
      if (text[j] === '/') { selfClose = true; j++; continue; }
      if (text[j] === '>') { j++; break; }
      let k = j;
      while (k < n && !/[\s=/>]/.test(text[k])) k++;
      const key = text.slice(j, k);
      while (k < n && /\s/.test(text[k])) k++;
      if (text[k] !== '=') { el.attrs[key] = ''; j = k; continue; }
      k++;
      while (k < n && /\s/.test(text[k])) k++;
      const q = text[k];
      if (q === '"' || q === "'") { const e = text.indexOf(q, k + 1); el.attrs[key] = decode(text.slice(k + 1, e)); j = e + 1; }
      else { let e = k; while (e < n && !/[\s>]/.test(text[e])) e++; el.attrs[key] = decode(text.slice(k, e)); j = e; }
    }
    stack.at(-1).children.push(el);
    if (!selfClose) stack.push(el);
    i = j;
  }
  return root.children.find((c) => c.name && !c.name.startsWith('#')) ?? root;
}

const num = (v, fallback = 0) => { const x = Number(v); return Number.isFinite(x) ? x : fallback; };
const cm = (v, fallback = 0) => num(v, fallback) / 100;

/** "FF8090A0" / "#8090A0" / a signed ARGB integer → "#8090a0" (null when missing). */
export function sh3dColor(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^#?[0-9a-f]{8}$/i.test(s)) return `#${s.replace('#', '').slice(2).toLowerCase()}`;
  if (/^#?[0-9a-f]{6}$/i.test(s)) return `#${s.replace('#', '').toLowerCase()}`;
  if (/^-?\d+$/.test(s)) return `#${((Number(s) >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
  return null;
}

/** A wall's arc: centre and angles (plan axes) of the arc from start to end turning `extent` radians. */
export function sh3dWallArc(a, b, extent) {
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(Math.abs(extent) > 1e-4) || chord < 1e-6) return null;
  const r = chord / (2 * Math.sin(Math.min(Math.PI - 1e-9, Math.abs(extent) / 2)));
  const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = [-(b[1] - a[1]) / chord, (b[0] - a[0]) / chord];
  // Of the two centres, the one where turning `a` by the extent ends at `b`.
  for (const s of [1, -1]) {
    // A sweep over half a turn puts the centre on the other side of the chord.
    const k = Math.abs(extent) > Math.PI ? -h : h;
    const c = [mid[0] + n[0] * k * s, mid[1] + n[1] * k * s];
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
    const a1 = a0 + extent;
    if (Math.hypot(c[0] + r * Math.cos(a1) - b[0], c[1] + r * Math.sin(a1) - b[1]) < Math.max(1e-6, r * 1e-4)) return { c, r, a0, a1 };
  }
  return null;
}

/**
 * Reads a .sh3d → { building, home (attributes), models: Map(model reference → { name, bytes, related }) }.
 * Errors carry `code`: 'sh3d-old' (only the serialized "Home" entry) or 'sh3d-invalid'.
 */
export function readSh3d(bytes) {
  let entries;
  try { entries = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); } catch (error) { throw Object.assign(new Error(`Not a Sweet Home 3D file (${error.message})`), { code: 'sh3d-invalid' }); }
  const xmlName = Object.keys(entries).find((k) => /(^|\/)Home\.xml$/i.test(k));
  if (!xmlName) {
    if (entries.Home) throw Object.assign(new Error('This Sweet Home 3D file was saved by a version older than 5.3 (no Home.xml)'), { code: 'sh3d-old' });
    throw Object.assign(new Error('Not a Sweet Home 3D file (no Home.xml)'), { code: 'sh3d-invalid' });
  }
  const home = parseXml(strFromU8(entries[xmlName]));
  if (home.name !== 'home') throw Object.assign(new Error('Not a Sweet Home 3D file (Home.xml without <home>)'), { code: 'sh3d-invalid' });
  const wallHeight = cm(home.attrs.wallHeight, 250);
  const building = { format: 'sh3d', name: home.attrs.name ?? '', levels: [], walls: [], openings: [], rooms: [], objects: [], warnings: [] };

  // Levels (none: everything on one level).
  for (const el of home.children.filter((c) => c.name === 'level')) {
    if (el.attrs.viewable === 'false') continue;
    building.levels.push({ key: el.attrs.id, name: el.attrs.name ?? '', elevation: cm(el.attrs.elevation), height: cm(el.attrs.height, wallHeight * 100), index: num(el.attrs.elevationIndex) });
  }
  building.levels.sort((a, b) => a.elevation - b.elevation || a.index - b.index);
  const levelKey = (el, inherited = null) => el.attrs.level ?? inherited ?? building.levels[0]?.key ?? '_';
  if (!building.levels.length) building.levels.push({ key: '_', name: '1F', elevation: 0, height: wallHeight });
  const levelHeight = (key) => building.levels.find((l) => l.key === key)?.height ?? wallHeight;

  for (const el of home.children) {
    if (el.name === 'wall') {
      const a = [cm(el.attrs.xStart), cm(el.attrs.yStart)]; const b = [cm(el.attrs.xEnd), cm(el.attrs.yEnd)];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01) continue;
      const level = levelKey(el);
      const arc = el.attrs.arcExtent ? sh3dWallArc(a, b, num(el.attrs.arcExtent)) : null;
      const h = el.attrs.height != null ? cm(el.attrs.height) : levelHeight(level);
      building.walls.push({ key: el.attrs.id ?? `wall${building.walls.length}`, level, a, b, thickness: Math.max(0.02, cm(el.attrs.thickness, 10)), height: h, ...(arc ? { arc } : {}) });
    } else if (el.name === 'room') {
      const points = el.children.filter((c) => c.name === 'point').map((p) => [cm(p.attrs.x), cm(p.attrs.y)]);
      if (points.length < 3) continue;
      building.rooms.push({
        level: levelKey(el), name: el.attrs.name ?? '', points,
        floorColor: el.attrs.floorVisible === 'false' ? null : sh3dColor(el.attrs.floorColor),
        ceilingColor: el.attrs.ceilingVisible === 'false' ? null : sh3dColor(el.attrs.ceilingColor),
      });
    }
  }

  // Furniture, doors and windows (groups hold pieces of their own).
  const pieces = (list, inheritedLevel = null) => {
    for (const el of list) {
      if (el.name === 'furnitureGroup') { pieces(el.children, el.attrs.level ?? inheritedLevel); continue; }
      if (!['pieceOfFurniture', 'doorOrWindow', 'light'].includes(el.name) || el.attrs.visible === 'false') continue;
      const A = el.attrs;
      const angle = num(A.angle);
      const center = [cm(A.x), cm(A.y)];
      const size = [cm(A.width, 50), cm(A.height, 50), cm(A.depth, 50)];
      const level = levelKey(el, inheritedLevel);
      const name = A.name ?? '';
      const hints = [A.catalogId, A.description, A.information, A.creator].filter(Boolean).join(' ');
      if (el.name === 'doorOrWindow' || A.doorOrWindow === 'true') {
        const sill = cm(A.elevation);
        building.openings.push({
          level, kind: openingKind(`${name} ${A.catalogId ?? ''}`, sill, size[1]), name: `${name} ${A.catalogId ?? ''}`.trim(), center, width: size[0], height: size[1], sill,
          // The side the door opens to: the piece's front (+y turned by the angle, clockwise on the plan).
          facing: [-Math.sin(angle), Math.cos(angle)], hinge: A.modelMirrored === 'true' ? 'right' : 'left',
        });
        continue;
      }
      const stairs = /stair|escalier|treppe|계단|staircase/i.test(`${name} ${A.catalogId ?? ''}`);
      building.objects.push({
        level, name, hints, center, elevation: cm(A.elevation), rotation: -angle, size,
        // A staircase climbs away from its front (towards −y), like the library stairs (towards −z).
        ...(stairs ? stairsItem(size) : {}),
        model: A.model ?? null, modelRotation: A.modelRotation ? A.modelRotation.split(/\s+/).map(Number) : null, mirrored: A.modelMirrored === 'true',
      });
    }
  };
  pieces(home.children);

  // Embedded models: the entries the pieces point at, with the files beside them.
  const models = new Map();
  for (const o of building.objects) {
    if (!o.model || models.has(o.model)) continue;
    const model = embeddedModel(entries, o.model);
    if (model) models.set(o.model, model);
  }
  return { building, home: home.attrs, models };
}

function openingKind(text, sill, height) {
  if (/window|fen[eê]tre|fenster|ventana|창(?!고)|skylight|velux|hatch/i.test(text)) return 'window';
  if (/door|porte|t[üu]r|puerta|문|garage/i.test(text)) return 'door';
  return sill > 0.3 || height < 1.6 ? 'window' : 'door';
}

const MODEL_EXT = /\.(obj|dae|3ds|glb|gltf|fbx|stl|ply)$/i;
/** The model file of a content reference: { name (with a model extension), bytes, related: Map } or null. */
export function embeddedModel(entries, ref) {
  const sniff = (b) => {
    const head = strFromU8(b.subarray(0, Math.min(b.length, 2048)), true);
    if (b[0] === 0x4d && b[1] === 0x4d) return '3ds';
    if (b[0] === 0x67 && b[1] === 0x6c && b[2] === 0x54 && b[3] === 0x46) return 'glb';
    if (/<COLLADA/i.test(head)) return 'dae';
    if (/^\s*(#|v |vn |vt |o |g |mtllib |usemtl |f )/m.test(head)) return 'obj';
    return null;
  };
  let files = entries;
  let name = ref;
  let bytes = entries[ref];
  // A model saved as a ZIP of its own (Sweet Home 3D catalogue models).
  if (bytes && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try { files = unzipSync(bytes); } catch { return null; }
    name = Object.keys(files).find((k) => MODEL_EXT.test(k) && !/\.mtl$/i.test(k)) ?? null;
    if (!name) return null;
    bytes = files[name];
  } else if (!bytes) {
    // A folder: "12" → "12/model.obj".
    name = Object.keys(entries).find((k) => k.startsWith(`${ref}/`) && MODEL_EXT.test(k)) ?? null;
    if (!name) return null;
    bytes = entries[name];
  }
  if (!MODEL_EXT.test(name)) { const ext = sniff(bytes); if (!ext) return null; name = `${name.replace(/^.*\//, '')}.${ext}`; }
  const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
  const related = new Map();
  // Its folder (or the model's own ZIP); a model alone at the top level has no companions.
  if (dir || files !== entries) for (const [k, v] of Object.entries(files)) if (k !== name && k.startsWith(dir) && !k.endsWith('/') && !/(^|\/)Home(\.xml)?$/.test(k)) related.set(k.slice(dir.length), v);
  return { name: name.slice(dir.length), bytes, related };
}
