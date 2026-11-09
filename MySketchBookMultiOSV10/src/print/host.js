// The main window's side of printing. The print window (a popup: its own OS
// window on the desktop, a frame on the web) has no 3D scene, so it asks the main
// window for pictures — the current 3D view, a level's floor plan at a scale, a
// saved scene — and lays them out on sheets itself (print/popup.js).
//
// Each picture is rendered off screen with viewport.capture() after setting the
// view up (plan mode on a level, a top camera centred on the tile at 1:N, white
// paper), then the user's view is put back exactly as it was.
import { formatArea, levelOf, polygonArea, polygonCentroid } from '../engine/document.js';
import { catalogItem, itemName } from '../library/catalog.js';
import { frameForSheet, planBounds } from './layout.js';
import { planData } from './dimensions.js';
import { planLeaves, swingMeta } from '../engine/doorswing.js';
import { wallNormal } from '../engine/walls.js';

/**
 * deps: { project, viewport(), builder(), state, syncScene, applyProjectView, popups, t, language(), notify,
 *         showError, saveExport, safeName, units() }
 */
export function createPrintHost(deps) {
  let latest = 0;
  let running = false;
  let queue = [];

  const p = () => deps.project();

  /** What the print window needs to know about the project (small: no pictures). */
  function printInfo() {
    const pr = p();
    const t = deps.t;
    const levels = [...pr.levels].sort((a, b) => a.elevation - b.elevation);
    const levelName = (id) => levelOf(pr, id)?.name ?? '';
    const area = pr.rooms.reduce((sum, r) => sum + polygonArea(r.points), 0);
    const units = deps.units();
    const furniture = new Map();
    for (const o of pr.objects) {
      const name = itemName(catalogItem(o.item), deps.language()) || o.name || o.item;
      furniture.set(name, (furniture.get(name) ?? 0) + 1);
    }
    const rooms = [...pr.rooms]
      .sort((a, b) => (levelOf(pr, a.level)?.elevation ?? 0) - (levelOf(pr, b.level)?.elevation ?? 0))
      .map((r) => ({ name: r.name || t('kind.room'), level: levelName(r.level), area: formatArea(polygonArea(r.points), units) }));
    return {
      name: pr.name || deps.safeName(),
      author: pr.author ?? '',
      levels: levels.map((l) => ({ id: l.id, name: l.name, bounds: planBounds(pr, l.id), plan: levelPlan(pr, l.id, units) })),
      scenes: pr.scenes.map((s) => ({ id: s.id, name: s.name })),
      summary: {
        name: pr.name || deps.safeName(),
        facts: [
          [t('print3d.fact.area'), `${formatArea(area, units)} (${(area / 3.3058).toFixed(1)} ${t('unit.pyeong')})`],
          [t('print3d.fact.levels'), String(pr.levels.length)],
          [t('print3d.fact.rooms'), String(pr.rooms.length)],
          [t('print3d.fact.walls'), String(pr.walls.length)],
          [t('print3d.fact.openings'), String(pr.openings.length)],
          [t('print3d.fact.furniture'), String(pr.objects.length)],
        ],
        rooms,
        furniture: [...furniture].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      },
    };
  }

  /** A level's walls, openings and rooms for the dimensions and labels the print window draws (print/dimensions.js). */
  function levelPlan(pr, levelId, units) {
    return planData(pr, {
      levelId, units,
      isDoor: (o) => catalogItem(o.item)?.category === 'doors',
      openSide: (o) => {
        const wall = pr.walls.find((w) => w.id === o.wall);
        const item = catalogItem(o.item);
        if (!wall || item?.category !== 'doors') return 0;
        const [leaf] = planLeaves(o, wall, swingMeta(item, { ...(o.params ?? {}), width: o.width, height: o.height }, wall.thickness ?? 0.15));
        if (!leaf) return 0;
        const nrm = wallNormal(wall);
        return Math.sign(leaf.v[0] * nrm[0] + leaf.v[1] * nrm[1]);
      },
      roomName: (room) => room.name || '',
      areaText: (room) => formatArea(polygonArea(room.points), units),
      centre: (room) => polygonCentroid(room.points),
    });
  }

  function open() {
    if (!p()) return undefined;
    return deps.popups.open('print', { info: printInfo(), language: deps.language() });
  }

  // ───────────────────────── the view, saved and put back

  function snapshot() {
    const vp = deps.viewport();
    const pr = p();
    return {
      camera: vp.cameraState(), saved: vp.savedCamera, orthoHalfHeight: vp.orthoHalfHeight, plan: deps.state.planView, level: pr.activeLevel,
      style: { ...pr.style }, tags: pr.tags.map((tag) => [tag, tag.visible]), swings: doorSwingLines().map((c) => [c, c.visible]),
    };
  }

  /** The door swing arcs (builder.js): the app shows them in the plan view and for selected doors. */
  function doorSwingLines() {
    const out = [];
    for (const g of deps.builder()?.groups.openings.children ?? []) for (const c of g.children) if (c.userData.doorSwing) out.push(c);
    return out;
  }

  function setPlan(on, levelId) {
    const vp = deps.viewport();
    const builder = deps.builder();
    const pr = p();
    pr.activeLevel = levelId;
    deps.state.planView = on;
    deps.syncScene();
    const level = levelOf(pr, levelId);
    vp.setPlanMode(on, { elevation: level.elevation, cutHeight: Math.min(1.2, level.height - 0.05) });
    builder.groups.cuts.visible = on;
    for (const c of builder.groups.cuts.children) c.visible = c.userData.level === level.id;
    // Printed plans show how every door opens, like the plan view.
    for (const c of doorSwingLines()) c.visible = on;
  }

  function restore(snap) {
    const vp = deps.viewport();
    const pr = p();
    Object.assign(pr.style, snap.style);
    for (const [tag, visible] of snap.tags) tag.visible = visible;
    setPlan(snap.plan, snap.level);
    for (const [c, visible] of snap.swings) c.visible = visible;
    vp.savedCamera = snap.saved;
    vp.setCameraState(snap.camera);
    vp.orthoHalfHeight = snap.orthoHalfHeight;
    vp.updateProjection();
    deps.applyProjectView();
    deps.syncScene();
    vp.requestRender();
  }

  // Paper white: the sky behind the plan, bright enough that tone mapping still gives white (#ffffff would print grey).
  const whitePaper = () => { const u = deps.viewport().sky.material.uniforms; for (const k of ['top', 'horizon', 'ground']) u[k].value.setRGB(24, 24, 24); deps.viewport().requestRender(); };

  // ───────────────────────── pictures

  function toGrey(canvas) {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const y = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114); d[i] = y; d[i + 1] = y; d[i + 2] = y; }
    ctx.putImageData(img, 0, 0);
  }

  /**
   * The current camera rendered at the sheet's proportions: 'fit' keeps everything the screen shows
   * (a portrait sheet widens the view, or steps back), 'fill' crops the screen's picture to the sheet.
   */
  function framedCapture(req) {
    const vp = deps.viewport();
    const fov = vp.perspective.fov;
    const half = vp.orthoHalfHeight;
    const pos = vp.camera.position.clone();
    const f = frameForSheet({ fov, ortho: vp.isOrtho, orthoHalfHeight: half, screenAspect: vp.width / vp.height, sheetAspect: req.w / req.h, mode: req.fit });
    try {
      vp.perspective.fov = f.fov;
      if (vp.isOrtho) vp.orthoHalfHeight = f.orthoHalfHeight;
      if (f.dolly !== 1) vp.camera.position.sub(vp.target).multiplyScalar(f.dolly).add(vp.target);
      vp.camera.updateMatrixWorld();
      return vp.capture(req.w, req.h);
    } finally {
      vp.perspective.fov = fov;
      vp.orthoHalfHeight = half;
      vp.camera.position.copy(pos);
      vp.updateProjection();
    }
  }

  function renderOne(req) {
    const vp = deps.viewport();
    const pr = p();
    if (!vp || !pr) throw new Error('no project');
    const snap = snapshot();
    // Paper shows the model only: no sun or lamp markers, and on plans no ground shadow plane.
    const hidden = [vp.overlay, req.type === 'plan' ? vp.ground : null].filter(Boolean).map((o) => [o, o.visible]);
    for (const [o] of hidden) o.visible = false;
    let canvas;
    try {
      if (req.type === 'plan') {
        const level = levelOf(pr, req.id);
        setPlan(true, level.id);
        deps.applyProjectView();
        if (req.style !== 'colour') vp.setStyle('hiddenline', { edges: true });
        whitePaper();
        const { cx, cz, halfH } = req.camera;
        vp.setCameraState({ position: [cx, level.elevation + 50, cz], target: [cx, level.elevation, cz], up: [0, 0, -1], ortho: true, orthoHalfHeight: halfH });
        canvas = vp.capture(req.w, req.h);
      } else if (req.type === 'scene') {
        const sc = pr.scenes.find((s) => s.id === req.id);
        if (!sc) throw new Error('scene not found');
        if (Boolean(sc.plan) !== deps.state.planView) setPlan(Boolean(sc.plan), pr.activeLevel);
        if (sc.style) Object.assign(pr.style, sc.style);
        if (sc.tags) for (const tag of pr.tags) if (tag.id in sc.tags) tag.visible = sc.tags[tag.id];
        deps.syncScene();
        deps.applyProjectView();
        if (sc.plan) whitePaper();
        vp.setCameraState(sc.camera);
        canvas = framedCapture(req);
      } else {
        if (deps.state.planView) whitePaper();
        canvas = framedCapture(req);
      }
    } finally {
      for (const [o, visible] of hidden) o.visible = visible;
      restore(snap);
    }
    if (req.grey) toGrey(canvas);
    return req.type === 'plan' && req.style !== 'colour' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
  }

  /** The print window asks for pictures: { gen, requests }. A newer request list replaces the waiting one. */
  async function render(data) {
    latest = Math.max(latest, Number(data?.gen) || 0);
    queue = [...(data?.requests ?? [])];
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const req = queue.shift();
        await new Promise((resolve) => setTimeout(resolve, 0));
        let url = null;
        let error = null;
        try { url = renderOne(req); } catch (e) { error = String(e?.message ?? e); }
        await deps.popups.post('print', { type: 'print-image', key: req.key, url, error });
      }
    } finally {
      running = false;
    }
  }

  async function savePdf(data) {
    try {
      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      await deps.saveExport(data.name || `${deps.safeName()}.pdf`, 'pdf', bytes, 'application/pdf');
    } catch (error) {
      deps.showError('error.print', error, 'print');
    }
  }

  return { open, render, savePdf, printInfo, renderOne };
}
