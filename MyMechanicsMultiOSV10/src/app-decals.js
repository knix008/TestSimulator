// Decals (Appearance): images put on faces of the part — a label, a logo. Each decal sits on one face, centred at
// an offset from the face's centre (along the face's own axes), with a width (the height from the image's shape),
// a turn and an opacity; mapped by projection along the face's normal, or wrapped round a cylinder or cone by arc
// length. Drawn as the face's own triangles with the image on them (only where the image is), slightly in front.
//   part.decals = [{ id, name, src, face (signature), cx, cy, width, aspect, angle (degrees), opacity, mapping }]
import * as THREE from 'three';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { pickWithInput } from './platform/native.js';
import { findFace, faceSignature, planeOfFace, normalize, crossV } from './cad/refs.js';

const MODES = new Set(['decals']);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

/** The decal's frame on its face: { o (centre), x, y (the image's right and up), n } — the turn applied. */
export function decalFrame(face, d) {
  let o; let x; let y; let n;
  if (face.geomType === 'PLANE') { const p = planeOfFace(face); o = vec(face.center); x = p.xDir; n = p.normal; y = crossV(n, x); }
  else {
    // The middle of the face's own parameters (a curved face's centroid is not on it).
    o = vec(face.pointOnSurface(0.5, 0.5)); n = normalize(vec(face.normalAt(o)));
    const up = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    x = normalize(crossV(up, n)); y = crossV(n, x);
  }
  const a = ((Number(d.angle) || 0) * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
  const xr = add(mul(x, c), mul(y, s)); const yr = add(mul(x, -s), mul(y, c));
  return { o: add(o, add(mul(x, Number(d.cx) || 0), mul(y, Number(d.cy) || 0))), x: xr, y: yr, n };
}

/**
 * UV of world points on the decal (0 … 1 over the image): projection along the face's normal, or for a cylinder or
 * cone wrapped by arc length round its axis.
 */
export function decalUV(face, d, points, cyl = null) {
  const fr = decalFrame(face, d);
  const w = Math.max(1e-6, Number(d.width) || 20); const h = w * (Number(d.aspect) || 1);
  if (d.mapping === 'wrap' && cyl) {
    // Arc length from the decal's centre round the axis (u), height along the axis (v).
    const { at, dir } = cyl;
    const rel = (p) => sub(p, at); const along = (p) => dot(rel(p), dir);
    const radial = (p) => { const r = rel(p); return sub(r, mul(dir, dot(r, dir))); };
    const r0 = radial(fr.o); const R = Math.hypot(...r0) || 1; const e1 = mul(r0, 1 / R); const e2 = crossV(dir, e1);
    const a = ((Number(d.angle) || 0) * Math.PI) / 180;
    return points.map((p) => {
      const rp = radial(p); const ang = Math.atan2(dot(rp, e2), dot(rp, e1));
      const s = ang * R; const t = along(p) - along(fr.o);
      const u = s * Math.cos(a) + t * Math.sin(a); const v = -s * Math.sin(a) + t * Math.cos(a);
      return [u / w + 0.5, v / h + 0.5];
    });
  }
  return points.map((p) => { const q = sub(p, fr.o); return [dot(q, fr.x) / w + 0.5, dot(q, fr.y) / h + 0.5]; });
}

export function createDecalTools(ctx) {
  const { state, t } = ctx;
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && MODES.has(e.mode));
  const textures = new Map();
  let group = null;

  /**
   * The image as a texture (with a clear 2-pixel border, so the decal stays clear outside it), or null while it
   * loads — the decals are drawn again when it has.
   */
  function textureOf(src) {
    const got = textures.get(src);
    if (got) return got === 'loading' ? null : got;
    textures.set(src, 'loading');
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth + 4; canvas.height = img.naturalHeight + 4;
      canvas.getContext('2d').drawImage(img, 2, 2);
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 4;
      textures.set(src, tex);
      show();
    };
    img.onerror = () => textures.delete(src);
    img.src = src;
    return null;
  }

  function cylinderOf(face) {
    if (!/CYL|CONE/.test(face.geomType)) return null;
    try {
      const oc = ctx.rep().getOC();
      const ad = new oc.BRepAdaptor_Surface(face.wrapped, true);
      try { const ax = /CYL/.test(face.geomType) ? ad.Cylinder().Axis() : ad.Cone().Axis(); const l = ax.Location(); const d = ax.Direction(); return { at: [l.X(), l.Y(), l.Z()], dir: [d.X(), d.Y(), d.Z()] }; } finally { ad.delete?.(); }
    } catch { return null; }
  }

  /** The decals of the active part drawn on the model. */
  function show() {
    const vp = ctx.viewport();
    if (!vp) return;
    if (!group) { group = new THREE.Group(); group.name = 'decals'; vp.scene.add(group); }
    for (const o of [...group.children]) { o.removeFromParent(); o.geometry?.dispose(); o.material?.dispose(); }
    const part = ctx.activePart();
    const entry = part ? ctx.partEntry() : null;
    if (!part?.decals?.length || !entry?.mesh || !entry.body) { vp.requestRender?.(); return; }
    const mesh = entry.mesh;
    for (const d of part.decals) {
      if (d.hidden || !d.src) continue;
      const face = findFace(entry.body, d.face);
      if (!face) continue;
      const fg = mesh.faceGroups?.find((g) => g.faceId === face.hashCode);
      if (!fg) continue;
      const tris = Array.from(mesh.triangles.slice(fg.start, fg.start + fg.count));
      const used = [...new Set(tris)];
      const local = new Map(used.map((v, i) => [v, i]));
      const pts = used.map((v) => [mesh.vertices[3 * v], mesh.vertices[3 * v + 1], mesh.vertices[3 * v + 2]]);
      const uv = decalUV(face, d, pts, cylinderOf(face));
      const map = textureOf(d.src);
      if (!map) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(used.flatMap((v) => [mesh.normals[3 * v], mesh.normals[3 * v + 1], mesh.normals[3 * v + 2]]), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2));
      g.setIndex(tris.map((v) => local.get(v)));
      const m = new THREE.MeshStandardMaterial({ map, transparent: true, opacity: Math.max(0.05, Math.min(1, Number(d.opacity ?? 1))), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.6, metalness: 0 });
      const o = new THREE.Mesh(g, m); o.renderOrder = 3; o.name = `decal:${d.id}`;
      group.add(o);
    }
    vp.requestRender?.();
  }

  async function chooseImage() {
    const [file] = await pickWithInput('image/png,image/jpeg,image/webp,image/gif,image/bmp');
    if (!file) return null;
    return new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve({ src: String(fr.result), name: file.name }); fr.onerror = () => resolve(null); fr.readAsDataURL(file); });
  }
  const aspectOf = (src) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i.naturalHeight / Math.max(1, i.naturalWidth)); i.onerror = () => resolve(1); i.src = src; });

  function start() {
    if (!ctx.activePart()) { ctx.notify('info', t('notice.partOnly')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'decals', current: ctx.activePart().decals?.at(-1)?.id ?? null };
    state.leftTab = 'pm';
    ctx.renderAll();
  }

  /** Adds a decal on a face: the image given (tests), or chosen in the file dialog. */
  async function addDecal(faceSig, img = null) {
    const part = ctx.activePart();
    if (!part) return null;
    const pickedImg = img ?? await chooseImage();
    if (!pickedImg) return null;
    const aspect = pickedImg.aspect ?? await aspectOf(pickedImg.src);
    const d = { id: ctx.newId('decal'), name: pickedImg.name ?? 'decal', src: pickedImg.src, face: faceSig, cx: 0, cy: 0, width: Number(pickedImg.width) || Math.max(10, Math.round((ctx.partEntry()?.size ?? 100) * 0.3)), aspect, angle: 0, opacity: 1, mapping: 'projection' };
    ctx.change('op.decal', () => { part.decals = [...(part.decals ?? []), d]; });
    if (editing()?.mode === 'decals') editing().current = d.id;
    show(); ctx.renderLeft();
    return d;
  }

  function pm() {
    const { pmHead, pmGroup, pmNum, pmSeg } = ctx.pm;
    const part = ctx.activePart();
    const e = editing();
    const list = part?.decals ?? [];
    const cur = list.find((d) => d.id === e.current) ?? null;
    const rows = list.map((d) => `<div class="cfg-row ${d.id === e.current ? 'selected' : ''}"><button class="icon-button" data-pm="decalPick:${escapeHtml(d.id)}" title="${escapeHtml(d.name)}">${icon('decal')}</button><span>${escapeHtml(d.name)}</span><span class="grow"></span><button class="icon-button" data-pm="decalDel:${escapeHtml(d.id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
    const props = cur ? [
      pmSeg('decalMap', [['projection', t('decal.projection'), 'decal'], ['wrap', t('decal.wrap'), 'featWrap']], cur.mapping ?? 'projection'),
      pmNum('decal.width', cur.width, t('decal.width'), 'dimDistance', ctx.units()),
      pmNum('decal.cx', cur.cx ?? 0, t('decal.cx'), 'position', ctx.units()), pmNum('decal.cy', cur.cy ?? 0, t('decal.cy'), 'position', ctx.units()),
      pmNum('decal.angle', cur.angle ?? 0, t('pm.angle'), 'dimAngle', '°'), pmNum('decal.opacity', cur.opacity ?? 1, t('decal.opacity'), 'appearance', '', '0.05'),
    ].join('') : `<p class="pm-note">${escapeHtml(t('decal.none'))}</p>`;
    return [
      pmHead('decal', t('cmd.decals'), t('decal.help')),
      pmGroup('decal', t('decal.list', { count: list.length }), `${rows}<p class="pm-note">${escapeHtml(t('decal.pickFace'))}</p>`),
      pmGroup('settings', cur ? cur.name : t('decal.props'), props),
    ].join('');
  }

  function current() { const e = editing(); return ctx.activePart()?.decals?.find((d) => d.id === e?.current) ?? null; }
  function pick(hit) {
    const topo = ctx.topoOf(hit);
    if (hit?.kind !== 'face' || !topo?.shape) { ctx.notify('info', t('decal.pickFace')); return; }
    void addDecal(faceSignature(topo.shape));
  }
  function field(key, raw, v) {
    const d = current();
    if (d && v != null && key.startsWith('decal.')) {
      const k = key.slice(6);
      if (k === 'width' && !(v > 0)) return ctx.renderLeft();
      ctx.change('op.decal', () => { d[k] = k === 'opacity' ? Math.max(0.05, Math.min(1, v)) : v; });
      show();
    }
    return ctx.renderLeft();
  }
  function set(key, value) {
    const d = current();
    if (d && key === 'decalMap') { ctx.change('op.decal', () => { d.mapping = value; }); show(); }
    return ctx.renderLeft();
  }
  const handles = (name) => name === 'decalPick' || name === 'decalDel';
  function command(name, arg) {
    const part = ctx.activePart();
    if (name === 'decalPick') editing().current = arg;
    if (name === 'decalDel') { ctx.change('op.decal', () => { part.decals = part.decals.filter((d) => d.id !== arg); if (!part.decals.length) delete part.decals; }); show(); }
    return ctx.renderLeft();
  }
  const accept = () => { state.editing = null; return ctx.renderAll(); };
  const commands = {
    decals: { icon: 'decal', label: 'cmd.decals', enabled: () => Boolean(ctx.activePart()), checked: () => editing()?.mode === 'decals', run: () => (editing()?.mode === 'decals' ? ctx.cancelEditing({ quiet: true }) : start()) },
  };
  return { owns, pm, pick, field, set, toggle: () => ctx.renderLeft(), select: () => false, accept, subject: () => t('cmd.decals'), handles, command, commands, show, addDecal };
}
