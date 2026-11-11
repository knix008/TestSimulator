// File › Import floor plan…: CAD drawings (DXF, DWG, SVG) and PDF drawings become walls, doors,
// windows and rooms; whole buildings from BIM and home-design programs (IFC, Sweet Home 3D) come
// in with their levels, rooms and furniture; pictures (PNG, JPG, WebP, BMP, GIF, TIFF, TGA, AVIF,
// HEIC where the system reads it, scanned PDF pages) become an underlay on the floor to trace over,
// scaled with a two-point calibration and optionally read by the automatic wall detection.
//
// app.js hands over the few things this needs (createPlanImport(app)); the parsing and recognition
// are pure modules in src/io (plan-dxf, plan-svg, plan-pdf, plan-recognize, plan-build, plan-image,
// plan-ifc, plan-sh3d, plan-building, plan-match, plan-raster), the underlay drawing is
// src/engine/underlay.js. pdf.js and web-ifc load only when a PDF / IFC file comes (io/plan-libs.js).
import * as THREE from 'three';
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { formatLength, newId, parseLength, toUnits } from '../engine/document.js';
import { defineCustomMaterial } from '../engine/materials.js';
import { readDxf, flattenDxf, dxfUnits, extentOf, dxfToPlan, layerStats, SKIP_LAYER } from '../io/plan-dxf.js';
import { readSvgPlan, svgUnits, svgToPlan } from '../io/plan-svg.js';
import { recognizePlan } from '../io/plan-recognize.js';
import { applyPlan, floorForName, scalePlanLevel } from '../io/plan-build.js';
import { detectImageWalls, MAX_DETECT_SIZE, wallsOnly } from '../io/plan-image.js';
import { dwgToDxf, dwgVersion, isDwgName, desktopDwgConverter, wasmDwgConverter } from '../io/plan-dwg.js';
import { isPdfName, openPdf, pdfPages, readPdfPage, pdfScale, pdfToPlan, POINT_METRES } from '../io/plan-pdf.js';
import { isIfcName, readIfc } from '../io/plan-ifc.js';
import { isSh3dName, readSh3d } from '../io/plan-sh3d.js';
import { applyBuilding, fitItem } from '../io/plan-building.js';
import { matchLibraryItem } from '../io/plan-match.js';
import { allItems } from '../library/catalog.js';
import { libraryUrl } from '../library/environments.js';
import { UnderlayLayer, underlayToPlan, planToUnderlay } from '../engine/underlay.js';
import { arcLines } from '../io/plan-recognize.js';
import { backgroundCentre, backgroundPoint, fromProject, fromResult, pickDetection, toResult } from '../io/plan-draft.js';
import { createPlanStudio } from './plan-studio.js';
import { detectFurniture, MATCH_ITEMS } from '../io/plan-furniture.js';
import { templateSource } from '../io/plan-templates.js';
import { getMaterial } from '../engine/materials.js';
import { catalogItem } from '../library/catalog.js';

/** Buildings: BIM models (IFC) and Sweet Home 3D homes — levels, walls, openings, rooms, furniture. */
export const BUILDING_ACCEPT = '.ifc,.sh3d';
/** Everything File › Import floor plan… reads: drawings, buildings and pictures. */
export const PLAN_ACCEPT = `.dxf,.dwg,.svg,.pdf,${BUILDING_ACCEPT},.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff,.tga,.avif,.heic,.heif`;
/** Buildings (IFC, Sweet Home 3D). */
export const isBuildingName = (name) => isIfcName(name) || isSh3dName(name);
/** Drawings and buildings (everything importFiles reads except pictures). */
export const isPlanName = (name) => /\.(dxf|dwg|svg|pdf)$/i.test(name ?? '') || isBuildingName(name);
/** Pictures to trace over (underlays). */
export const isPlanImageName = (name) => /\.(png|jpe?g|webp|bmp|gif|tiff?|tga|avif|heic|heif)$/i.test(name ?? '');
/** Anything the plan import reads. */
export const isPlanImportName = (name) => isPlanName(name) || isPlanImageName(name);

/**
 * DWG → DXF bytes: the converter installed on the computer (desktop), else LibreDWG WebAssembly when it was put
 * into library/dwg (optional, GPL — see io/plan-dwg.js). Neither → an error that says what to install.
 */
export async function convertDwg(app, name, bytes) {
  const converters = [];
  if (app.desktop && app.native?.invoke) converters.push(desktopDwgConverter(app.native.invoke));
  converters.push(wasmDwgConverter({
    load: async () => { const m = await import(/* @vite-ignore */ libraryUrl('dwg/libredwg-web.js')); return m.default ?? m.createModule; },
    locate: (file) => libraryUrl(`dwg/${file}`),
  }));
  try {
    return (await dwgToDxf(bytes, { converters })).dxf;
  } catch (error) {
    if (error.code !== 'dwg-unavailable') throw error;
    const release = error.version?.release ?? dwgVersion(bytes)?.release ?? 'DWG';
    const detail = (error.tried ?? []).filter((x) => x.error !== 'not available').map((x) => `${x.name}: ${x.error}`).join('\n');
    throw Object.assign(new Error(t(app.desktop ? 'plan.dwgHelpDesktop' : 'plan.dwgHelpWeb', { name, release }) + (detail ? `\n\n${detail}` : '')), { code: 'dwg-unavailable' });
  }
}
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif' };
const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(name ?? '')?.[1] ?? '').toLowerCase();
const stem = (name) => String(name ?? '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const libs = () => import('../io/plan-libs.js');
// TIFF / TGA decoders (UTIF.js) load only when such a picture comes.
const raster = () => import('../io/plan-raster.js');
const isTiffName = (name) => /\.tiff?$/i.test(name ?? '');
const needsRasterDecode = (name) => /\.(tiff?|tga)$/i.test(name ?? '');
const isHeicName = (name) => /\.(heic|heif)$/i.test(name ?? '');
const isAvifName = (name) => /\.avif$/i.test(name ?? '');

/** Reads a CAD plan (DXF or SVG bytes) → { kind, plan (metres, plan axes), units, layers, doc }. */
export function readPlanFile(name, bytes, { units = 'auto', layers = null } = {}) {
  if (/\.svg$/i.test(name)) {
    const svg = readSvgPlan(new TextDecoder('utf-8').decode(bytes));
    const u = svgUnits(svg, units);
    const keep = (x) => !layers || layers.includes(x.layer || '0');
    const filtered = { lines: svg.lines.filter(keep), arcs: svg.arcs.filter(keep), texts: svg.texts };
    const names = [...new Set([...svg.lines, ...svg.arcs].map((x) => x.layer || '0'))];
    return { kind: 'svg', plan: svgToPlan(filtered, u.metres), units: u, layers: names.map((n) => ({ name: n, lines: svg.lines.filter((l) => (l.layer || '0') === n).length, arcs: svg.arcs.filter((a) => (a.layer || '0') === n).length, texts: 0, off: false })) };
  }
  const doc = readDxf(bytes);
  const stats = layerStats(doc);
  const chosen = layers ? new Set(layers) : new Set(stats.filter((l) => !l.off && !SKIP_LAYER.test(l.name)).map((l) => l.name));
  const flat = flattenDxf(doc, { layers: chosen });
  const u = dxfUnits(doc, extentOf(flattenDxf(doc)).size, units);
  return { kind: 'dxf', plan: dxfToPlan(flat, u.metres), units: u, layers: stats, doc };
}

/** Decodes picture bytes (browser): { width, height, bitmap }. */
async function decodeImage(bytes, mime) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  return { width: bitmap.width, height: bitmap.height, bitmap };
}

/** A canvas → PNG bytes. */
async function canvasPng(canvas) {
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** RGBA pixels → PNG bytes (through a canvas). */
async function pixelsPng({ width, height, data }) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  return canvasPng(canvas);
}

/**
 * Any plan picture → { bytes, mime, ext, width, height } the underlay can show: the browser's own formats as they are,
 * TIFF / TGA decoded here (→ PNG), AVIF through the bundled decoder where the WebView has none, HEIC only where the
 * system decodes it (else an error with code 'heic-unsupported').
 */
export async function planPicture(name, bytes, { page = 0 } = {}) {
  if (needsRasterDecode(name)) {
    const pixels = (await raster()).decodeRaster(name, bytes, { page });
    return { bytes: await pixelsPng(pixels), mime: 'image/png', ext: 'png', width: pixels.width, height: pixels.height };
  }
  const ext = extOf(name) === 'jpeg' ? 'jpg' : extOf(name) || 'png';
  const mime = MIME[extOf(name)] ?? 'image/png';
  try {
    const { width, height, bitmap } = await decodeImage(bytes, mime);
    if (isHeicName(name) || isAvifName(name)) {
      // Kept as PNG: the underlay and the saved project must not depend on the codec of this computer.
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close?.();
      return { bytes: await canvasPng(canvas), mime: 'image/png', ext: 'png', width, height };
    }
    bitmap.close?.();
    return { bytes, mime, ext, width, height };
  } catch (error) {
    if (isAvifName(name)) {
      const [{ default: decode, init }, { default: wasmUrl }] = await Promise.all([import('@jsquash/avif/decode.js'), import('@jsquash/avif/codec/dec/avif_dec.wasm?url')]);
      await init({ locateFile: (file) => (file.endsWith('.wasm') ? wasmUrl : file) });
      const image = await decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      return { bytes: await pixelsPng(image), mime: 'image/png', ext: 'png', width: image.width, height: image.height };
    }
    if (isHeicName(name)) throw Object.assign(new Error(t('plan.heicUnsupported', { name })), { code: 'heic-unsupported' });
    throw error;
  }
}

/** A PDF page drawn as a picture (scanned drawings): ~200 dpi, at most 4000 pixels a side → { bytes (PNG), width, height }. */
async function renderPdfPage(doc, number) {
  const page = await doc.getPage(number);
  const base = page.getViewport({ scale: 1 });
  const k = Math.min(200 / 72, 4000 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale: k });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return { bytes: await canvasPng(canvas), width: canvas.width, height: canvas.height };
}

export function createPlanImport(app) {
  let layer = null; // UnderlayLayer (made with the viewport)
  let calib = null; // the two-point pick in progress
  // The 2D workbench: recognised plans are cleaned up there before they become 3D.
  const studio = createPlanStudio(app);
  // What library furniture looks like from above (built once per item, the first time a picture is read).
  const furnitureTemplates = templateSource((id) => catalogItem(id)?.build?.({}, { quality: 'low', wallThickness: 0.2, material: (m, o) => getMaterial(m, o) }) ?? null);
  let templatesReady = false;

  /** A moment for the screen: the progress window opens and redraws between the steps of a long job. */
  const breathe = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * A long job in steps, with the progress window open from the start: `body(step)` calls `await step(text)` before
   * each step (about `total` of them) — the window shows the text and how far the job is, and the screen gets a frame
   * to draw it (the steps themselves are computations that hold the page while they run).
   */
  function inSteps(titleKey, name, total, body) {
    return app.withProgress(titleKey, name, async (op, report) => {
      let done = 0;
      const step = async (text) => {
        report({ fraction: Math.min(0.98, done / Math.max(1, total)), text });
        done++;
        // A frame for the window to show the new text (it is up already: withProgress waits until it is drawn).
        await breathe(40);
      };
      const out = await body(step);
      report({ fraction: 1, text: t('progress.step.done') });
      await breathe(60);
      return out;
    }, { delay: 0 });
  }

  /**
   * The cleaned-up plan into the project and the 3D scene built from it, with progress: `apply()` makes the one
   * change (one Undo step); then the scene (walls, rooms, furniture) is built.
   */
  async function convertTo3d(name, apply, furniture = 0) {
    return inSteps('progress.convert3d', name, 2, async (step) => {
      await step(t('progress.step.buildPlan'));
      const applied = apply();
      await step(furniture ? t('progress.step.buildSceneFurniture', { n: furniture }) : t('progress.step.buildScene'));
      app.afterImport?.(applied);
      return applied;
    });
  }

  const layerOf = () => {
    const vp = app.viewport();
    if (!vp) return null;
    if (!layer || layer.viewport !== vp) layer = new UnderlayLayer(vp);
    return layer;
  };

  /** Keeps the underlays in line with the project (app.js calls it from syncScene). */
  function sync() {
    const d = app.doc();
    const l = layerOf();
    if (!d || !l) return;
    d.project.underlays ??= [];
    l.sync(d.project, { assets: d.assets, levelMode: app.levelMode(d.project) });
  }

  // ───────────────────────── dialog

  async function dialog() {
    try {
      if (app.desktop) {
        const paths = await app.native.chooseFiles(app.settings().lastDirectory, [{ name: t('plan.filter'), extensions: PLAN_ACCEPT.replace(/\./g, '').split(',') }], false);
        if (paths.length) await importFiles([{ name: paths[0].replace(/^.*[\\/]/, ''), path: paths[0] }]);
      } else {
        const files = await app.native.pickWithInput(PLAN_ACCEPT, false);
        if (files.length) await importFiles([{ name: files[0].name, bytes: new Uint8Array(await files[0].arrayBuffer()) }]);
      }
    } catch (error) { app.showError('error.importPlan', error); }
  }

  /**
   * Files dropped, opened or chosen: the first drawing, building or picture is imported (with its options asked).
   * `hints` for a picture: { imageWidth (m) } — the start page's samples know their real width.
   */
  async function importFiles(files, hints = {}) {
    const file = files.find((f) => isPlanImportName(f.name));
    if (!file) return null;
    try {
      const bytes = file.bytes ?? await app.readBytes(file.path);
      if (isPdfName(file.name)) return await importPdf(file.name, bytes);
      if (isBuildingName(file.name)) return await importBuilding(file.name, bytes);
      return isPlanName(file.name) ? await importPlan(file.name, bytes) : await importImage(file.name, bytes, null, hints);
    } catch (error) {
      if (error?.code === 'sh3d-old') app.showError('error.importPlan', new Error(t('plan.sh3dOld', { name: file.name })), file.name);
      else app.showError('error.importPlan', error, file.name);
      return null;
    }
  }

  // ───────────────────────── CAD plans

  /** Where an imported drawing can go (the workbench's foot and the import dialog). */
  const planTargets = () => [['replace', t('plan.targetReplace'), 'level'], ['level', t('plan.targetLevel'), 'levelAdd'], ['new', t('plan.targetNew'), 'fileNew']].filter(([id]) => app.project() || id === 'new');

  /**
   * A recognised plan into the project (walls, openings, rooms, guides) with the import options `o`. With `o.refine`
   * the plan is cleaned up in the 2D workbench first (over the drawing's own lines) and converted to 3D from there.
   */
  async function applyRecognized(name, plan, o) {
    const recognise = (mode) => {
      const r = recognizePlan(plan, { mode: mode ?? 'auto', defaultThickness: Number(o.thickness) || 0.15 });
      r.texts = plan.texts;
      return r;
    };
    const result = await inSteps('progress.readPlan', name, 1, async (step) => { await step(t('progress.step.recognise')); return recognise(o.walls); });
    if (!result.walls.length && !o.refine) { app.notify('error', t('notice.planEmpty', { name })); return { result, applied: null }; }
    let final = result;
    let chosen = { target: o.target ?? 'replace', wallHeight: Number(o.wallHeight) || null, keepLines: o.keepLines !== false };
    if (o.refine) {
      // The drawing itself under the recognised walls: its lines and arcs (in the drawing's coordinates, as the plan).
      const lines = [...(plan.lines ?? []).map((l) => ({ a: l.a, b: l.b })), ...(plan.arcs ?? []).flatMap((arc) => arcLines(arc).map(([a, b]) => ({ a, b })))];
      const out = await studio.open(fromResult(result), {
        name, background: { kind: 'lines', lines, k: 1, offset: [0, 0] }, straighten: true,
        targets: planTargets(), target: app.project() ? chosen.target : 'new', wallHeight: chosen.wallHeight || app.settings().defaultWallHeight || 2.4, keepLines: chosen.keepLines,
        redetect: async (mode) => { const r = recognise(mode); if (!r.walls.length) { app.notify('error', t('notice.planEmpty', { name })); return null; } return fromResult(r); },
        redetectModes: [['auto', t('import.auto')], ['pairs', t('plan.wallsPairs')], ['single', t('plan.wallsSingle')]], redetectMode: o.walls ?? 'auto',
      });
      if (!out) return { result, applied: null, cancelled: true };
      final = toResult(out.draft);
      chosen = { target: out.target, wallHeight: out.wallHeight, keepLines: out.keepLines };
    }
    if (chosen.target === 'new' || !app.project()) app.newProject('empty');
    const target = chosen.target === 'level' ? 'level' : 'replace';
    const applied = await convertTo3d(name, () => app.change('op.importPlan', (p) => applyPlan(p, final, { target, wallHeight: chosen.wallHeight, keepLeftovers: chosen.keepLines, levelName: stem(name) }), null), final.furniture?.length ?? 0);
    app.notify('success', t(o.refine ? 'studio.converted' : 'notice.planImported', { name, walls: applied.walls, doors: applied.doors, windows: applied.windows, rooms: applied.rooms, objects: applied.objects ?? 0 }));
    return { result: final, applied, refined: Boolean(o.refine) };
  }

  /**
   * DXF / SVG → walls, doors, windows, rooms. `options` skips the popup (tests): { units, layers, wallHeight,
   * thickness, walls: 'auto' | 'pairs' | 'single', target: 'replace' | 'level' | 'new', keepLines }.
   */
  async function importPlan(name, source, options = null) {
    // DWG: converted to DXF first (read as DXF from here on).
    const bytes = isDwgName(name) ? await app.withProgress('progress.convertDwg', name, () => convertDwg(app, name, source), { delay: 150 }) : source;
    const first = await inSteps('progress.readPlan', name, 1, async (step) => { await step(t('progress.step.readDrawing')); return readPlanFile(name, bytes); });
    const settings = app.settings();
    const hasWalls = Boolean(app.project()?.walls.length);
    let o = options;
    if (!o) {
      o = await app.popups.open('importplan', {
        mode: 'cad', name, units: 'auto', detected: first.units.units, guessed: first.units.guessed,
        layers: first.layers.map((l) => ({ name: l.name, lines: l.lines, arcs: l.arcs, texts: l.texts, on: !l.off && !SKIP_LAYER.test(l.name) })),
        wallHeight: settings.defaultWallHeight || 2.4, thickness: settings.defaultWallThickness || 0.15, walls: 'auto',
        target: !app.project() ? 'new' : hasWalls ? 'level' : 'replace', keepLines: true, hasProject: Boolean(app.project()),
      });
      if (!o?.ok) return null;
    }
    const read = await inSteps('progress.readPlan', name, 1, async (step) => { await step(t('progress.step.readDrawing')); return readPlanFile(name, bytes, { units: o.units ?? 'auto', layers: o.layers ?? null }); });
    const { result, applied } = await applyRecognized(name, read.plan, o);
    return { result, applied, units: read.units };
  }

  // ───────────────────────── PDF drawings

  /** Pages to choose from: [{ number, label, raster }] (the first 20 read for their content). */
  async function pdfPageList(pdfjs, doc) {
    const pages = await pdfPages(doc);
    const out = [];
    for (const p of pages) {
      const paper = p.paper ?? `${Math.round((p.width * 25.4) / 72)} × ${Math.round((p.height * 25.4) / 72)} mm`;
      if (p.number <= 20) {
        const read = await readPdfPage(pdfjs, doc, p.number);
        out.push({ number: p.number, raster: read.raster, label: `${t('plan.page', { n: p.number })} · ${paper} · ${read.raster || read.segments < 4 ? t('plan.pageScan') : t('plan.pageLines', { lines: read.segments })}`, segments: read.segments });
      } else out.push({ number: p.number, raster: false, label: `${t('plan.page', { n: p.number })} · ${paper}`, segments: 0 });
    }
    return out;
  }

  /**
   * PDF → like a CAD drawing (vector pages) or a picture (scanned pages). `options` skips the popups (tests):
   * { page, scale (1:n), layers, walls, wallHeight, thickness, target, keepLines, calibrate }.
   */
  async function importPdf(name, bytes, options = null) {
    const { pdfjs, options: pdfOptions } = await (await libs()).loadPdfjs();
    const doc = await app.withProgress('progress.readPdf', name, () => openPdf(pdfjs, bytes, pdfOptions), { delay: 150 });
    try {
      let number = options?.page ?? 1;
      if (!options && doc.numPages > 1) {
        const pages = await app.withProgress('progress.readPdf', name, () => pdfPageList(pdfjs, doc), { delay: 150 });
        const best = [...pages].sort((a, b) => b.segments - a.segments)[0];
        const choice = await app.popups.open('importplan', { mode: 'pages', name, pages: pages.map(({ number: n, label, raster }) => ({ number: n, label, raster })), page: best?.number ?? 1 });
        if (!choice?.ok) return null;
        number = Number(choice.page) || 1;
      }
      const page = await app.withProgress('progress.readPdf', name, () => readPdfPage(pdfjs, doc, number), { delay: 150 });
      const scale = pdfScale(page);
      // A scanned page: drawn as a picture and imported like one (width from the scale, if the page says it).
      if (page.raster || page.segments < 4) {
        const picture = await app.withProgress('progress.readPdf', name, () => renderPdfPage(doc, number), { delay: 150 });
        const label = doc.numPages > 1 ? `${stem(name)}-p${number}.png` : `${stem(name)}.png`;
        return await importImage(label, picture.bytes, options?.image ?? null, { imageWidth: Math.round(page.size[0] * scale.metres * 10) / 10, source: name });
      }
      const settings = app.settings();
      const effective = Math.round(scale.denominator * scale.factor * 10) / 10;
      let o = options;
      if (!o) {
        const hasWalls = Boolean(app.project()?.walls.length);
        o = await app.popups.open('importplan', {
          mode: 'pdf', name, page: number, paper: page.paper ?? '', scale: effective,
          scaleNote: scale.source === 'text' ? t(scale.factor !== 1 ? 'plan.scaleFromTextPaper' : 'plan.scaleFromText', { text: scale.text, paper: scale.paper ?? '', page: page.paper ?? '' }) : t(scale.source === 'doors' ? 'plan.scaleFromDoors' : 'plan.scaleDefault', { scale: effective }),
          layers: page.layers.filter((l) => l.lines + l.arcs > 0).map((l) => ({ name: l.name, lines: l.lines, arcs: l.arcs, texts: l.texts, on: !SKIP_LAYER.test(l.name) })),
          wallHeight: settings.defaultWallHeight || 2.4, thickness: settings.defaultWallThickness || 0.15, walls: 'auto',
          target: !app.project() ? 'new' : hasWalls ? 'level' : 'replace', keepLines: true, hasProject: Boolean(app.project()), calibrate: scale.source !== 'text',
        });
        if (!o?.ok) return null;
      }
      const denominator = Number(o.scale) > 0 ? Number(o.scale) : effective;
      const layerNames = page.layers.length > 1 && o.layers ? [...o.layers, ...page.layers.filter((l) => l.lines + l.arcs === 0).map((l) => l.name)] : null;
      const plan = pdfToPlan(page, POINT_METRES * denominator, { layers: layerNames });
      const { result, applied } = await applyRecognized(name, plan, o);
      // The workbench has its own two-point scale; without it the scale is set on the 3D floor afterwards.
      if (applied && o.calibrate && !o.refine) calibratePlan(applied.level);
      return { result, applied, scale: denominator, page: number, source: scale.source };
    } finally {
      doc.destroy?.();
    }
  }

  // ───────────────────────── buildings (IFC, Sweet Home 3D)

  /** Furniture of a building → a library item (by name and size) fitted to its size, or null. */
  function libraryMatch(object) {
    const found = matchLibraryItem(object, allItems().filter((i) => i.kind !== 'user'));
    if (!found) return null;
    return { item: found.item.id, ...fitItem(found.item, object.size) };
  }

  /** A model of the file (Sweet Home 3D: an embedded OBJ / DAE / 3DS …; IFC: the shape) → a three.js object, bottom centre at the origin. */
  async function buildingModel(read, object) {
    if (read.models) {
      const model = read.models.get(object.model);
      const io = await app.modelIo?.();
      if (!model || !io?.importModel) return null;
      const imported = await io.importModel({ name: model.name, bytes: model.bytes, related: model.related }, { units: 'auto', upAxis: 'y', center: true, optimize: true });
      const root = new THREE.Group();
      const inner = imported.object;
      // Sweet Home 3D's model rotation (row-major 3 × 3) turns the model upright.
      if (object.modelRotation?.length === 9) {
        const r = object.modelRotation;
        inner.applyMatrix4(new THREE.Matrix4().set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1));
      }
      root.add(inner);
      const box = new THREE.Box3().setFromObject(root);
      inner.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
      return root;
    }
    const parts = read.meshes?.get(object.model);
    if (!parts?.length) return null;
    const root = new THREE.Group();
    for (const p of parts) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(p.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(p.indices, 1));
      const [r, g, b, a] = p.color ?? [0.8, 0.8, 0.8, 1];
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), roughness: 0.7, transparent: a < 1, opacity: a }));
      mesh.castShadow = true; mesh.receiveShadow = true;
      root.add(mesh);
    }
    return root;
  }

  /**
   * IFC / Sweet Home 3D → levels, walls, doors, windows, rooms, stairs and furniture. `options` skips the popup (tests):
   * { target: 'new' | 'add', furniture: 'library' | 'models' | 'none', rooms }.
   */
  async function importBuilding(name, bytes, options = null) {
    const read = await app.withProgress('progress.readBuilding', name, async (op, report) => {
      if (isSh3dName(name)) return readSh3d(bytes);
      const { WebIFC, api } = await (await libs()).loadWebIfc();
      return readIfc(WebIFC, api, bytes, { onProgress: (fraction) => report?.({ fraction }) });
    }, { delay: 150 });
    const b = read.building;
    const furniture = b.objects.filter((o) => o.item !== 'stairs');
    const matched = furniture.filter((o) => libraryMatch(o));
    const ownModels = furniture.filter((o) => !matched.includes(o) && o.model && (read.models?.has(o.model) || read.meshes?.has(o.model)));
    let o = options;
    if (!o) {
      o = await app.popups.open('importplan', {
        mode: 'building', name, format: isIfcName(name) ? 'IFC' : 'Sweet Home 3D',
        summary: t('plan.buildingSummary', { levels: b.levels.length, walls: b.walls.length, doors: b.openings.filter((x) => x.kind === 'door').length, windows: b.openings.filter((x) => x.kind === 'window').length, rooms: b.rooms.length }),
        furnitureNote: t('plan.buildingFurniture', { total: furniture.length, matched: matched.length, models: ownModels.length }),
        warning: [read.counts?.complexWalls ? t('plan.ifcComplexWalls', { count: read.counts.complexWalls }) : '', read.counts?.slabs ? t('plan.ifcSlabs', { count: read.counts.slabs }) : ''].filter(Boolean).join(' '),
        target: 'new', hasProject: Boolean(app.project()), furniture: ownModels.length ? 'models' : 'library', rooms: true,
      });
      if (!o?.ok) return null;
    }
    if (!b.walls.length && !b.rooms.length) { app.notify('error', t('notice.planEmpty', { name })); return null; }
    if (o.target !== 'add' || !app.project()) app.newProject('empty');
    // Own models first (My objects), so the whole building goes in as one undo step.
    const own = new Map();
    if (o.furniture === 'models' && ownModels.length) {
      await app.withProgress('progress.readBuilding', name, async (op, report) => {
        const keys = [...new Set(ownModels.map((x) => x.model))].slice(0, 60);
        for (let i = 0; i < keys.length; i++) {
          report?.({ fraction: i / keys.length });
          const object = ownModels.find((x) => x.model === keys[i]);
          try {
            const model = await buildingModel(read, object);
            if (model) own.set(keys[i], await app.addUserObject(model, { name: object.name || stem(name), source: name }));
          } catch (error) { console.warn('plan import: model of', object.name, error); }
        }
      }, { delay: 150 });
    }
    const materials = [];
    const colorMaterial = (hex, use) => {
      let m = materials.find((x) => x.color === hex);
      if (!m) {
        m = { id: newId('mat'), ko: `${stem(name)} ${hex}`, en: `${stem(name)} ${hex}`, color: hex, roughness: use === 'floor' ? 0.6 : 0.9, metalness: 0, category: use === 'floor' ? 'floor' : 'wall' };
        materials.push(m);
      }
      return m.id;
    };
    const matchItem = (x) => {
      const lib = libraryMatch(x);
      if (lib) return lib;
      const mine = own.get(x.model);
      if (!mine) return null;
      return { item: mine.item, params: {}, scale: [0, 1, 2].map((i) => (mine.size[i] > 0 && x.size[i] > 0 ? Math.round((x.size[i] / mine.size[i]) * 1000) / 1000 : 1)) };
    };
    const applied = app.change('op.importPlan', (p) => {
      const counts = applyBuilding(p, b, { target: o.target === 'add' ? 'add' : 'new', matchItem, colorMaterial, furniture: o.furniture !== 'none', rooms: o.rooms !== false });
      if (materials.length) p.materials.push(...materials);
      return counts;
    }, null);
    for (const m of materials) defineCustomMaterial(m);
    app.afterImport?.(applied);
    app.notify('success', t('notice.buildingImported', { name, levels: applied.levels, walls: applied.walls, doors: applied.doors, windows: applied.windows, rooms: applied.rooms, objects: applied.objects }));
    return { applied, read };
  }

  // ───────────────────────── pictures

  /**
   * A picture → an underlay on the active level (options skip the popup: { width (m), opacity, target, calibrate, detect,
   * page }). `hints`: { imageWidth (m, suggested), source (the file it came from) }.
   */
  async function importImage(name, bytes, options = null, hints = {}) {
    let page = options?.page ?? 0;
    if (!options && isTiffName(name)) {
      const pages = (await raster()).tiffPages(bytes);
      if (pages.length > 1) {
        const choice = await app.popups.open('importplan', { mode: 'pages', name, pages: pages.map((p, i) => ({ number: i + 1, label: `${t('plan.page', { n: i + 1 })} · ${p.width} × ${p.height} px` })), page: pages.reduce((best, p, i) => (p.width * p.height > pages[best].width * pages[best].height ? i : best), 0) + 1 });
        if (!choice?.ok) return null;
        page = (Number(choice.page) || 1) - 1;
      }
    }
    const picture = await app.withProgress('progress.readPlan', name, async (op, report) => { report({ fraction: 0.1, text: t('progress.step.readPicture') }); return planPicture(name, bytes, { page }); }, { delay: 150 });
    const { width, height } = picture;
    let o = options;
    if (!o) {
      o = await app.popups.open('importplan', { mode: 'image', name: hints.source ?? name, pixels: `${width} × ${height}`, imageWidth: hints.imageWidth || 12, opacity: 0.6, target: app.project() ? 'level' : 'new', calibrate: true, detect: false, hasProject: Boolean(app.project()) });
      if (!o?.ok) return null;
    }
    if (o.target === 'new' || !app.project()) app.newProject('empty');
    const d = app.doc();
    const id = newId('ul');
    const asset = newId('as');
    const scale = (Number(o.imageWidth) || hints.imageWidth || 12) / width;
    const level = d.project.activeLevel;
    // Centred on what is drawn on the level already, else on the origin.
    const walls = d.project.walls.filter((w) => w.level === level);
    const xs = walls.flatMap((w) => [w.a[0], w.b[0]]); const zs = walls.flatMap((w) => [w.a[1], w.b[1]]);
    const position = xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2] : [0, 0];
    d.assets.set(asset, picture.bytes);
    app.change('op.importPlan', (p) => {
      p.assets[asset] = { name: stem(name), ext: picture.ext, mime: picture.mime, kind: 'underlay', pixels: [width, height] };
      p.underlays ??= [];
      p.underlays.push({ id, level, asset, name: stem(name), width, height, position, rotation: 0, scale, opacity: Number(o.opacity ?? 0.6), hidden: false });
    }, null);
    app.notify('success', t('notice.underlayAdded', { name }));
    app.focusUnderlay?.(id);
    frame(id);
    if (o.refine) await refineUnderlay(id);
    else if (o.calibrate) startCalibration(id, { detectAfter: Boolean(o.detect) });
    else if (o.detect) await detectWalls(id);
    return { id, asset, width, height };
  }

  /**
   * Walls, doors and windows found in a picture: `k` metres per pixel of the original picture; points in metres from
   * its top-left corner (x right, z down). method: 'outline' (clean drawings) | 'edges' (scans, photos).
   */
  /** The picture at the size it is read at (≤ MAX_DETECT_SIZE): { original (RGBA pixels), metresPerPixel }. */
  function picturePixels(bitmap, k) {
    const s = Math.min(1, MAX_DETECT_SIZE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * s)); const h = Math.max(1, Math.round(bitmap.height * s));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h);
    return { original: { data: pixels.data, width: w, height: h }, metresPerPixel: (k * bitmap.width) / w };
  }

  /**
   * Walls, doors and windows of a picture read once (picturePixels): `walls` — its walls alone (plan-image.js wallsOnly:
   * furniture, coloured floors, hatching and text left out; the door swings still read from the original).
   */
  function detectOn(original, wallsPicture, { metresPerPixel, method = 'outline', walls = false }) {
    const picture = walls ? wallsPicture : original;
    if (!picture) return { walls: [], openings: [], leftovers: [], texts: [], stats: { doors: 0, windows: 0 } };
    const found = detectImageWalls(picture, { metresPerPixel, method, evidence: walls ? original : null });
    return { ...found, leftovers: [], texts: [] };
  }

  /** A plan found in the picture (metres from its top-left corner) placed where the picture is (turned with it). */
  const placeResult = (r, bg) => {
    const at = (p) => backgroundPoint(bg, [p[0] / bg.k, p[1] / bg.k]);
    // Furniture turns with the picture: a plan turned by a turns a front (sin θ, cos θ) to θ − a.
    return { ...r, walls: r.walls.map((x) => ({ ...x, a: at(x.a), b: at(x.b) })), furniture: (r.furniture ?? []).map((f) => ({ ...f, position: at(f.position), rotation: f.rotation - (bg.rotation ?? 0) })) };
  };

  /**
   * The picture of an underlay as the workbench's background: its top-left corner unturned in plan metres, metres per
   * pixel, and its turn (the workbench turns the other way round: rotation = −underlay rotation).
   */
  function underlayBackground(u, bitmap) {
    return { kind: 'image', image: bitmap, width: bitmap.width, height: bitmap.height, k: u.scale, offset: underlayToPlan({ ...u, rotation: 0 }, [0, 0]), rotation: -(u.rotation ?? 0), centre: [bitmap.width / 2, bitmap.height / 2] };
  }

  /** The underlay follows what the workbench did to its picture: a two-point scale (size, place) and straightening (turn). */
  function followBackground(u, out) {
    const bg = out.background;
    if (!u || bg?.kind !== 'image') return;
    const position = backgroundCentre(bg);
    const rotation = -(bg.rotation ?? 0);
    if (Math.abs(bg.k - u.scale) > 1e-12 || Math.hypot(position[0] - u.position[0], position[1] - u.position[1]) > 1e-9 || Math.abs(rotation - (u.rotation ?? 0)) > 1e-12) {
      app.change('op.underlay', () => { u.scale = bg.k; u.position = position; u.rotation = rotation; }, ['underlays']);
    }
  }

  /**
   * A plan picture (underlay) → walls found automatically → cleaned up in the 2D workbench over the picture (scale,
   * missing walls, doors and windows) → 3D walls, doors, windows and rooms on the underlay's level.
   */
  async function refineUnderlay(id) {
    const u = underlay(id);
    const d = app.doc();
    const bytes = u && d?.assets.get(u.asset);
    if (!bytes) return null;
    const { bitmap } = await decodeImage(bytes, d.project.assets[u.asset]?.mime ?? 'image/png');
    try {
      const background = underlayBackground(u, bitmap);
      // 'auto': both methods, the one that leaves the least to clean up (clean drawings read best as outlines, scans,
      // faxes and sketches as edges).
      // 'auto': the walls-only picture first (plans with furniture and coloured floors), then the picture as it is;
      // the best of the four is kept.
      const VARIANTS = { auto: [['outline', true], ['edges', true], ['outline', false], ['edges', false]], walls: [['outline', true]], outline: [['outline', false]], edges: [['edges', false]] };
      const detect = (method, bg) => {
        const variants = VARIANTS[method] ?? VARIANTS.auto;
        const total = 1 + variants.length + (variants.length > 1 ? 1 : 0) + (templatesReady ? 0 : 1) + 1;
        return inSteps('progress.detectWalls', u.name, total, async (step) => {
          await step(t('progress.step.readPicture'));
          const { original, metresPerPixel } = picturePixels(bitmap, bg.k);
          let wallsPicture = null;
          const found = [];
          for (const [i, [m, walls]] of variants.entries()) {
            await step(t(walls ? 'progress.step.findWallsOnly' : 'progress.step.findWalls', { n: i + 1, total: variants.length }));
            if (walls) wallsPicture ??= wallsOnly(original, { metresPerPixel });
            found.push(detectOn(original, wallsPicture, { metresPerPixel, method: m, walls }));
          }
          let raw = found[0];
          if (found.length > 1) {
            await step(t('progress.step.chooseWalls'));
            raw = found[pickDetection(found.map((r) => placeResult(r, bg)))];
          }
          // Furniture in the rooms of the chosen walls (io/plan-furniture.js), on the picture as it is.
          if (raw.walls.length) {
            if (!templatesReady) {
              // What the library's furniture looks like from above: built once, the first time a picture is read.
              await step(t('progress.step.furnitureShapes'));
              for (const [i, spec] of MATCH_ITEMS.entries()) { furnitureTemplates(spec.item); if (i % 4 === 3) await breathe(0); }
              templatesReady = true;
            }
            await step(t('progress.step.findFurniture'));
            try { raw = { ...raw, furniture: detectFurniture(original, { metresPerPixel, result: raw, angle: raw.angle ?? 0, templates: furnitureTemplates }) }; } catch (error) { console.warn('furniture', error); }
          }
          return placeResult(raw, bg);
        });
      };
      const first = await detect('auto', background);
      if (!first.walls.length) app.notify('info', t('underlay.detectNone'));
      const hasWalls = app.project().walls.some((w) => w.level === u.level);
      const out = await studio.open(fromResult(first), {
        name: u.name, background, straighten: true,
        targets: [['add', t('studio.targetAdd'), 'plus'], ['replace', t('plan.targetReplace'), 'level']], target: hasWalls ? 'add' : 'replace',
        wallHeight: app.project().levels.find((l) => l.id === u.level)?.height ?? (app.settings().defaultWallHeight || 2.4), keepLines: false,
        redetect: async (method, bg) => { const r = await detect(method, bg); if (!r.walls.length) { app.notify('error', t('underlay.detectNone')); return null; } return fromResult(r); },
        redetectModes: [['auto', t('import.auto')], ['walls', t('plan.modeWalls')], ['outline', t('plan.modeOutline')], ['edges', t('plan.modeEdges')]], redetectMode: 'auto',
      });
      if (!out) return null;
      followBackground(u, out);
      const result = toResult(out.draft);
      // Pictures carry no room labels the app can read (no OCR): unnamed rooms get a name from size and shape.
      const roomNames = (key, n) => { const base = t(`plan.roomGuess.${key}`); return n > 1 && key !== 'living' ? `${base} ${n}` : base; };
      const applied = await convertTo3d(u.name, () => app.change('op.detectWalls', (p) => { p.activeLevel = u.level; return applyPlan(p, result, { target: out.target === 'replace' ? 'replace' : 'add', shift: [0, 0], wallHeight: out.wallHeight, keepLeftovers: out.keepLines, roomNames, source: u.id }); }, null), result.furniture?.length ?? 0);
      app.notify('success', t('studio.converted', { walls: applied.walls, doors: applied.doors, windows: applied.windows, rooms: applied.rooms, objects: applied.objects ?? 0 }));
      return applied;
    } finally {
      bitmap.close?.();
    }
  }

  /**
   * The active level's walls, doors, windows and rooms cleaned up again in the 2D workbench (over its plan picture,
   * if it has one) and built again in 3D. Walls keep their heights and materials, rooms their finishes.
   */
  async function refineLevel() {
    const p = app.project();
    if (!p) return null;
    const level = p.levels.find((l) => l.id === p.activeLevel) ?? p.levels[0];
    const draft = fromProject(p, level.id);
    if (!draft.walls.length) { app.notify('info', t('studio.noWalls')); return null; }
    const u = (p.underlays ?? []).find((x) => x.level === level.id && !x.hidden);
    const bytes = u && app.doc()?.assets.get(u.asset);
    let bitmap = null;
    if (bytes) { try { ({ bitmap } = await decodeImage(bytes, p.assets[u.asset]?.mime ?? 'image/png')); } catch { bitmap = null; } }
    try {
      const background = bitmap ? underlayBackground(u, bitmap) : null;
      const out = await studio.open(draft, { name: level.name, title: t('studio.titleLevel', { level: level.name }), background, wallHeight: level.height, keepLines: true });
      if (!out) return null;
      if (background) followBackground(u, out);
      const result = toResult(out.draft);
      const applied = await convertTo3d(level.name, () => app.change('op.importPlan', (pp) => applyPlan(pp, result, { target: 'replace', shift: [0, 0], wallHeight: out.wallHeight, keepLeftovers: out.keepLines }), null), result.furniture?.length ?? 0);
      app.notify('success', t('studio.converted', { walls: applied.walls, doors: applied.doors, windows: applied.windows, rooms: applied.rooms, objects: applied.objects ?? 0 }));
      return applied;
    } finally {
      bitmap?.close?.();
    }
  }

  const underlay = (id) => app.project()?.underlays?.find((u) => u.id === id) ?? null;

  /** Zooms the view to an underlay (the content box leaves helpers out, so Zoom extents alone would miss it). */
  function frame(id) {
    const vp = app.viewport();
    const root = layerOf()?.items.get(id)?.root;
    if (!vp || !root) return;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const walls = vp.contentBox();
    if (!walls.isEmpty()) box.union(walls);
    vp.zoomExtents(box);
  }

  /** Rescales an underlay so that plan points p1 and p2 are `metres` apart; p1 stays where it is. */
  function calibrateWith(id, p1, p2, metres) {
    const u = underlay(id);
    const measured = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (!u || !(measured > 1e-6) || !(metres > 0)) return false;
    app.change('op.underlay', () => {
      const pixel = planToUnderlay(u, p1);
      u.scale *= metres / measured;
      const now = underlayToPlan(u, pixel);
      u.position = [u.position[0] + p1[0] - now[0], u.position[1] + p1[1] - now[1]];
    }, ['underlays']);
    app.notify('success', t('underlay.calibrated', { length: formatLength(metres, app.units()) }));
    return true;
  }

  /** Rescales the imported plan of a level (walls, openings, rooms, plan guides) so that p1 and p2 are `metres` apart. */
  function calibratePlanWith(levelId, p1, p2, metres) {
    const measured = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (!(measured > 1e-6) || !(metres > 0)) return false;
    app.change('op.importPlan', (p) => scalePlanLevel(p, levelId, p1, metres / measured), null);
    app.afterImport?.();
    app.notify('success', t('underlay.calibrated', { length: formatLength(metres, app.units()) }));
    return true;
  }

  // Two clicks on the floor (any tool is paused), then the real distance is asked.
  function startPick({ level: levelId, onDistance }) {
    stopCalibration();
    const vp = app.viewport();
    if (!vp) return;
    if (!app.planView()) app.setPlanView(true);
    const level = app.project().levels.find((l) => l.id === levelId);
    calib = { points: [], elevation: level?.elevation ?? 0 };
    const ground = (e) => vp.screenToWorldOnPlane(e.clientX, e.clientY, new THREE.Vector3(0, calib.elevation, 0), new THREE.Vector3(0, 1, 0));
    const draw = (cursor = null) => {
      const pts = calib.points.map((p) => new THREE.Vector3(p[0], calib.elevation + 0.01, p[1]));
      if (cursor && pts.length === 1) pts.push(cursor);
      app.overlay()?.points('plan-calib-pts', pts, { color: '#e0352b', size: 11 });
      app.overlay()?.lines('plan-calib', pts.length === 2 ? pts : [], { color: '#e0352b' });
      vp.requestRender();
    };
    calib.down = async (e) => {
      if (e.button !== 0 || e.target !== vp.canvas) return;
      e.stopPropagation(); e.preventDefault();
      const p = ground(e);
      if (!p) return;
      calib.points.push([p.x, p.z]);
      draw();
      if (calib.points.length < 2) { app.notify('info', t('underlay.calibrateSecond')); return; }
      const [p1, p2] = calib.points;
      const measured = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      stopCalibration({ keepMarks: true });
      const answer = await app.popups.open('prompt', { title: t('underlay.distanceTitle'), label: t('underlay.distanceLabel', { units: app.units() }), value: String(Number(toUnits(measured, app.units()).toFixed(app.units() === 'mm' ? 0 : 3))), icon: 'tapeMeasure' });
      app.overlay()?.clear('plan-calib'); app.overlay()?.clear('plan-calib-pts');
      const v = answer?.value != null ? parseLength(String(answer.value).replace(/(\d),(?=\d{3}(?!\d))/g, '$1'), app.units()) : null;
      const metres = Array.isArray(v) ? v[0] : v;
      await onDistance(p1, p2, metres > 0 ? metres : null);
    };
    calib.move = (e) => { if (e.target !== vp.canvas || !calib.points.length) return; const p = ground(e); if (p) draw(new THREE.Vector3(p.x, calib.elevation + 0.01, p.z)); };
    calib.key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); stopCalibration(); app.notify('info', t('underlay.calibrateCancelled')); } };
    window.addEventListener('pointerdown', calib.down, true);
    window.addEventListener('pointermove', calib.move, true);
    window.addEventListener('keydown', calib.key, true);
    app.notify('info', t('underlay.calibrateHint'));
  }

  /** The scale of an underlay picture from two points (then the wall detection when asked). */
  function startCalibration(id, { detectAfter = false } = {}) {
    const u = underlay(id);
    if (!u) return;
    startPick({ level: u.level, onDistance: async (p1, p2, metres) => { if (metres) calibrateWith(id, p1, p2, metres); if (detectAfter) await detectWalls(id); } });
  }

  /** The scale of an imported drawing (PDF without a scale) from two points: the level's plan is scaled to fit. */
  function calibratePlan(levelId) {
    startPick({ level: levelId, onDistance: async (p1, p2, metres) => { if (metres) calibratePlanWith(levelId, p1, p2, metres); } });
  }

  function stopCalibration({ keepMarks = false } = {}) {
    if (!calib) return;
    window.removeEventListener('pointerdown', calib.down, true);
    window.removeEventListener('pointermove', calib.move, true);
    window.removeEventListener('keydown', calib.key, true);
    if (!keepMarks) { app.overlay()?.clear('plan-calib'); app.overlay()?.clear('plan-calib-pts'); }
    calib = null;
  }

  /**
   * Automatic wall detection on an underlay picture: walls, doors and windows on its level (one undo step),
   * then asks to keep them. `ask: false` keeps them without asking (tests). Returns the counts.
   */
  async function detectWalls(id, { ask = true } = {}) {
    const u = underlay(id);
    const d = app.doc();
    const bytes = u && d?.assets.get(u.asset);
    if (!bytes) return null;
    const result = await app.withProgress('progress.detectWalls', u.name, async () => {
      const { bitmap } = await decodeImage(bytes, d.project.assets[u.asset]?.mime ?? 'image/png');
      const k = Math.min(1, MAX_DETECT_SIZE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * k)); const h = Math.max(1, Math.round(bitmap.height * k));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      // Picture metres of the shrunk picture → original pixels → plan.
      const mpp = (u.scale * bitmap.width) / w;
      bitmap.close?.();
      const pixels = ctx.getImageData(0, 0, w, h);
      const found = detectImageWalls({ data: pixels.data, width: w, height: h }, { metresPerPixel: mpp });
      const toPlan = (p) => underlayToPlan(u, [p[0] / u.scale, p[1] / u.scale]);
      return { ...found, walls: found.walls.map((x) => ({ ...x, a: toPlan(x.a), b: toPlan(x.b) })), leftovers: [], texts: [] };
    }, { delay: 150 });
    if (!result.walls.length) { app.notify('error', t('underlay.detectNone')); return { walls: 0 }; }
    const level = app.project().activeLevel;
    // Pictures carry no room labels the app can read (no OCR): rooms get a name from size and shape, listed in the
    // underlay's panel to be renamed.
    const roomNames = (key, n) => { const base = t(`plan.roomGuess.${key}`); return n > 1 && key !== 'living' ? `${base} ${n}` : base; };
    const applied = app.change('op.detectWalls', (p) => { p.activeLevel = u.level; return applyPlan(p, result, { target: 'add', shift: [0, 0], keepLeftovers: false, roomNames, source: u.id }); }, null);
    const counts = { walls: result.walls.length, doors: result.stats.doors, windows: result.stats.windows, rooms: applied?.rooms ?? 0, angle: Math.round(((result.angle ?? 0) * 180) / Math.PI * 10) / 10 };
    if (level !== u.level) app.project().activeLevel = level;
    if (ask) {
      const choice = await app.ask({ icon: 'wallTool', title: t('underlay.keepTitle'), message: t('underlay.keepMessage', counts), buttons: [{ id: 'discard', label: t('underlay.discard'), icon: 'undo' }, { id: 'keep', label: t('underlay.keep'), icon: 'check', primary: true }] });
      if (choice !== 'keep') { app.undo(); return { ...counts, kept: false }; }
    }
    app.notify('success', t('underlay.detected', counts));
    return { ...counts, kept: true };
  }

  function remove(id) {
    app.change('op.delete', (p) => {
      const u = p.underlays.find((x) => x.id === id);
      p.underlays = p.underlays.filter((x) => x.id !== id);
      if (u && !p.underlays.some((x) => x.asset === u.asset)) delete p.assets[u.asset];
    }, ['underlays']);
  }

  // ───────────────────────── Entity Info: the underlays of the active level

  function panelHtml() {
    const p = app.project();
    const list = (p?.underlays ?? []).filter((u) => u.level === p.activeLevel);
    if (!list.length) return '';
    const units = app.units();
    const len = (v) => formatLength(v, units, { suffix: false });
    const row = (label, control, title = label) => `<div class="prop-row" title="${escapeHtml(title)}"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control">${control}</span></div>`;
    const num = (u, key, value, unit) => `<span class="unit-input"><input type="text" inputmode="decimal" data-prop="underlay.${escapeHtml(u.id)}.${key}" value="${escapeHtml(value)}" /><em>${escapeHtml(unit)}</em></span>`;
    const btn = (action, u, glyph, label) => `<button class="button small" data-underlay-action="${action}:${escapeHtml(u.id)}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;
    return list.map((u) => `<section class="prop-section underlay-section" data-underlay="${escapeHtml(u.id)}"><header><span class="section-toggle">${icon('underlay')}<span>${escapeHtml(t('underlay.section'))} · ${escapeHtml(u.name)}</span></span></header><div class="props">
      <label class="prop-row check"><span class="prop-label"><span>${escapeHtml(t('underlay.visible'))}</span></span><span class="prop-control"><input type="checkbox" data-prop="underlay.${escapeHtml(u.id)}.visible" ${u.hidden ? '' : 'checked'} /></span></label>
      ${row(t('underlay.opacity'), `<input type="range" min="5" max="100" step="1" data-prop="underlay.${escapeHtml(u.id)}.opacity" value="${Math.round((u.opacity ?? 0.6) * 100)}" /><output>${Math.round((u.opacity ?? 0.6) * 100)}%</output>`)}
      ${row(t('underlay.x'), num(u, 'x', len(u.position[0]), units))}
      ${row(t('underlay.z'), num(u, 'z', len(u.position[1]), units))}
      ${row(t('underlay.rotation'), num(u, 'rotation', String(Math.round(((u.rotation ?? 0) * 180) / Math.PI * 100) / 100), '°'))}
      ${row(t('underlay.width'), num(u, 'width', len(u.width * u.scale), units), t('underlay.widthTip'))}
      <div class="prop-actions">${btn('calibrate', u, 'tapeMeasure', t('underlay.calibrate'))}${btn('detect', u, 'wallTool', t('underlay.detect'))}${btn('remove', u, 'trash', t('underlay.remove'))}</div>
      ${roomsHtml(u)}
    </div></section>`).join('');
  }

  /** The rooms found in an underlay picture, each with its name to edit (they were named from size and shape). */
  function roomsHtml(u) {
    const rooms = (app.project()?.rooms ?? []).filter((r) => r.planSource === u.id);
    if (!rooms.length) return '';
    const area = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
    return `<div class="prop-subhead" title="${escapeHtml(t('underlay.roomsHint'))}">${escapeHtml(t('underlay.rooms'))}</div>${rooms.map((r) => `<div class="prop-row" title="${escapeHtml(t('underlay.roomsHint'))}"><span class="prop-label"><span>${escapeHtml(`${area(r.points).toFixed(1)} m²`)}</span></span><span class="prop-control"><input type="text" data-prop="underlay.${escapeHtml(u.id)}.room.${escapeHtml(r.id)}" value="${escapeHtml(r.name ?? '')}" /></span></div>`).join('')}`;
  }

  /** data-prop="underlay.<id>.<field>" edits (app.js setProp passes them here). */
  function setProp(field, raw, input) {
    const [, id, key, roomId] = field.split('.');
    const u = underlay(id);
    if (!u) return;
    if (key === 'room') {
      // A room found in the picture renamed: its floor follows the new name while it was the guessed one.
      const room = app.project().rooms.find((r) => r.id === roomId);
      const name = String(raw ?? '').trim();
      if (room && name !== room.name) app.change('op.underlay', () => { if (room.nameGuessed) room.floor = floorForName(name); room.name = name; delete room.nameGuessed; }, null);
      return;
    }
    const units = app.units();
    // "1,200" as shown (thousands separators) is one number, not a list.
    const len = () => { const v = parseLength(String(raw).replace(/(\d),(?=\d{3}(?!\d))/g, '$1'), units); return Array.isArray(v) ? v[0] : v; };
    let edit = null;
    if (key === 'visible') edit = () => { u.hidden = !input.checked; };
    else if (key === 'opacity') { const v = Number(raw); if (Number.isFinite(v)) edit = () => { u.opacity = Math.max(0.05, Math.min(1, v / 100)); }; }
    else if (key === 'x' || key === 'z') { const v = len(); if (v != null) edit = () => { u.position = key === 'x' ? [v, u.position[1]] : [u.position[0], v]; }; }
    else if (key === 'rotation') { const v = Number(raw); if (Number.isFinite(v)) edit = () => { u.rotation = (v * Math.PI) / 180; }; }
    else if (key === 'width') { const v = len(); if (v > 0.01) edit = () => { u.scale = v / u.width; }; }
    if (edit) app.change('op.underlay', edit, ['underlays']);
  }

  /** Live opacity while the slider moves (no undo step). */
  function previewOpacity(field, raw, input) {
    const [, id] = field.split('.');
    const u = underlay(id);
    if (!u) return;
    u.opacity = Math.max(0.05, Math.min(1, Number(raw) / 100));
    const out = input.parentElement?.querySelector('output');
    if (out) out.textContent = `${Math.round(u.opacity * 100)}%`;
    sync();
  }

  function action(spec) {
    const [name, id] = String(spec).split(':');
    if (name === 'calibrate') return startCalibration(id);
    if (name === 'detect') return refineUnderlay(id);
    if (name === 'remove') return remove(id);
    return undefined;
  }

  return { dialog, importFiles, importPlan, refineUnderlay, refineLevel, studio, importPdf, importBuilding, importImage, frame, calibrateWith, calibratePlanWith, startCalibration, calibratePlan, stopCalibration, detectWalls, remove, sync, panelHtml, setProp, previewOpacity, action, get calibrating() { return Boolean(calib); }, get layer() { return layer; } };
}
