// The 2D plan workbench: a recognised floor plan (CAD, PDF, picture) or a floor of the project is cleaned up in
// 2D first — over the original drawing — and only then converted to 3D walls, doors, windows and rooms.
//
//   const studio = createPlanStudio(app);
//   const result = await studio.open(draft, { name, background, targets, target, wallHeight, keepLines, redetect });
//   // result: null (cancelled) or { draft, wallHeight, target, keepLines }
//
// The editing itself is pure (io/plan-draft.js); this module draws the draft on a 2D canvas, handles the
// tools (select / move, wall, door, window, passage, label, scale by two points, pan) and keeps its own undo
// steps. It covers the work area of the main window (the menu bar stays, its menus are paused).
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { formatLength, parseLength } from '../engine/document.js';
import { planEntities } from '../io/plan-build.js';
import {
  addOpening, addText, addWall, cleanupAll, cloneDraft, deleteItems, draftBounds, draftProblems, draftStats, joinEnds, mergeCollinear,
  moveVertex, moveWalls, openingAt, openingKind, pointAlong, removeShort, scaleDraft, setThickness, setWallLength, snapPoint, squareUp,
  textAt, toResult, wallAt, wallDir, wallLength, alongOf, endsAt, dominantAngle, rotateDraft, backgroundPoint, backgroundCentre, furnitureAt, furnitureCorners,
} from '../io/plan-draft.js';
import { allItems, catalogItem, itemName } from '../library/catalog.js';
import { getLanguage } from '../i18n.js';
import { openingDefaults } from '../io/plan-recognize.js';

const TOOLS = [
  ['select', 'select', 'V'],
  ['wall', 'wallTool', 'W'],
  ['door', 'doorTool', 'D'],
  ['window', 'windowTool', 'N'],
  ['passage', 'studioPassage', 'P'],
  ['text', 'textTool', 'T'],
  ['scale', 'tapeMeasure', 'M'],
  ['pan', 'hand', 'H'],
];
const CLEANUPS = [
  ['all', 'sparkles'],
  ['straighten', 'studioStraighten'],
  ['square', 'studioSquare'],
  ['join', 'studioJoin'],
  ['merge', 'studioMerge'],
  ['short', 'studioCrumbs'],
];
const OPENING_KINDS = [['door', 'doorTool'], ['double', 'studioDoubleDoor'], ['sliding', 'studioSliding'], ['window', 'windowTool'], ['passage', 'studioPassage']];
const SNAP_PX = 10;
/** Furniture offered for any piece (after the items of its own category). */
const COMMON_FURNITURE = ['bed', 'nightstand', 'wardrobe', 'dresser', 'sofa-modern', 'sofa-loveseat', 'sofa-sectional', 'armchair', 'coffee-table', 'tv-console', 'bookshelf', 'rug', 'dining-table', 'dining-chair', 'desk', 'office-chair', 'kitchen-sink-counter', 'kitchen-base-cabinet', 'refrigerator', 'toilet', 'washbasin-vanity', 'shower-booth', 'bathtub', 'washing-machine', 'fiddle-leaf-fig'];

/** Theme colours the canvas uses (read from the CSS variables when the workbench opens). */
function themeColours(el) {
  const s = getComputedStyle(el);
  const v = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
  return { bg: v('--chart', '#ffffff'), surface: v('--surface', '#ffffff'), text: v('--text', '#222'), muted: v('--muted', '#888'), border: v('--border', '#ccc'), accent: v('--accent', '#2d6cdf'), danger: v('--danger', '#e5484d') };
}

export function createPlanStudio(app) {
  let el = null; // the workbench element while open
  let session = null;

  // ───────────────────────── open / close

  /**
   * Opens the workbench on `draft` (plan-draft.js). options: { name, background: { kind: 'image', image (ImageBitmap |
   * HTMLImageElement | canvas), width, height, k (metres per pixel), offset [x, z] } | { kind: 'lines', lines: [{ a, b }],
   * k, offset }, targets: [[id, label, icon]], target, wallHeight, keepLines, redetect: async (mode) → draft|null,
   * redetectModes: [[id, label]], redetectMode, title }. Resolves to null (cancelled) or { draft, wallHeight, target, keepLines }.
   */
  function open(draft, options = {}) {
    close(null);
    return new Promise((resolve) => {
      session = {
        resolve, options, draft,
        undo: [], redo: [],
        tool: 'select', selection: new Set(), hover: null, snap: null,
        view: { scale: 40, ox: 0, oy: 0 },
        show: { background: true, leftovers: true, rooms: true, lengths: true, problems: true, furniture: true },
        bgOpacity: 0.55,
        background: normaliseBackground(options.background),
        wallThickness: 0.15, openingWidth: { door: 0.9, double: 1.4, sliding: 1.8, window: 1.2, passage: 0.9 }, doorKind: 'door',
        squareTol: 6, joinTol: 0.3,
        wallHeight: options.wallHeight ?? 2.4, target: options.target ?? 'replace', keepLines: options.keepLines !== false,
        redetectMode: options.redetectMode ?? options.redetectModes?.[0]?.[0] ?? null,
        rooms: null, roomsKey: '', problems: [], chain: null, measure: null, drag: null, cursor: null,
      };
      build();
      fit();
      refresh();
      if (options.straighten) autoStraighten();
    });
  }

/** The background with what the workbench needs: offset, k, rotation and the centre it turns about (source units). */
  function normaliseBackground(bg) {
    if (!bg) return null;
    let centre = bg.centre;
    if (!centre && bg.kind === 'image') centre = [bg.width / 2, bg.height / 2];
    if (!centre) {
      const pts = (bg.lines ?? []).flatMap((l) => [l.a, l.b]);
      centre = pts.length ? [(Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2, (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2] : [0, 0];
    }
    return { ...bg, offset: [...(bg.offset ?? [0, 0])], k: bg.k ?? 1, rotation: bg.rotation ?? 0, centre };
  }

  function close(result) {
    if (!el) return;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    el.remove();
    el = null;
    document.body.classList.remove('plan-studio-open');
    const s = session;
    session = null;
    s?.resolve(result);
  }

  // ───────────────────────── markup

  function build() {
    el = document.createElement('div');
    el.className = 'plan-studio';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', t('studio.title'));
    const top = document.querySelector('#menubar')?.getBoundingClientRect().bottom ?? 0;
    el.style.top = `${Math.round(top)}px`;
    el.innerHTML = `
      <div class="ps-toolbar" role="toolbar">
        <div class="ps-title">${icon('planStudio')}<span><b>${escapeHtml(session.options.title ?? t('studio.title'))}</b><small>${escapeHtml(session.options.name ?? '')}</small></span></div>
        <span class="tool-sep"></span>
        <div class="ps-tools">${TOOLS.map(([id, glyph, key]) => `<button class="tool-button labelled" data-ps-tool="${id}" title="${escapeHtml(`${t(`studio.tool.${id}`)} (${key}) — ${t(`studio.tip.${id}`)}`)}">${icon(glyph)}<span>${escapeHtml(t(`studio.tool.${id}`))}</span></button>`).join('')}</div>
        <span class="tool-sep"></span>
        <button class="tool-button labelled" data-ps="undo" title="${escapeHtml(t('studio.undo'))} (Ctrl+Z)">${icon('undo')}<span>${escapeHtml(t('studio.undo'))}</span></button>
        <button class="tool-button labelled" data-ps="redo" title="${escapeHtml(t('studio.redo'))} (Ctrl+Y)">${icon('redo')}<span>${escapeHtml(t('studio.redo'))}</span></button>
        <button class="tool-button labelled" data-ps="delete" title="${escapeHtml(t('studio.delete'))} (Delete)">${icon('trash')}<span>${escapeHtml(t('studio.delete'))}</span></button>
        <button class="tool-button labelled" data-ps="fit" title="${escapeHtml(t('studio.fit'))} (F)">${icon('zoomExtents')}<span>${escapeHtml(t('studio.fit'))}</span></button>
        <span class="grow"></span>
        <div class="ps-shows">${['background', 'leftovers', 'rooms', 'furniture', 'lengths', 'problems'].map((k) => `<button class="tool-button ps-toggle" data-ps-show="${k}" title="${escapeHtml(t(`studio.show.${k}`))}" aria-pressed="false">${icon({ background: 'picture', leftovers: 'guide', rooms: 'roomTool', furniture: 'furniture', lengths: 'dimension', problems: 'warning' }[k])}</button>`).join('')}</div>
      </div>
      <div class="ps-body">
        <div class="ps-canvas-wrap"><canvas class="ps-canvas"></canvas><div class="ps-hint"></div></div>
        <aside class="ps-side"></aside>
      </div>
      <div class="ps-foot">
        <span class="ps-status"></span>
        <span class="grow"></span>
        <span class="ps-foot-group" title="${escapeHtml(t('studio.wallHeight'))}">${icon('wallTool')}<span>${escapeHtml(t('studio.wallHeight'))}</span>${stepper('wallHeight', session.wallHeight, 0.05)}</span>
        ${session.options.targets?.length ? `<span class="ps-foot-group">${icon('level')}<div class="segmented" role="radiogroup">${session.options.targets.map(([id, label, glyph]) => `<button class="segment" data-ps-target="${id}" role="radio">${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`).join('')}</div></span>` : ''}
        <label class="ps-foot-group check" title="${escapeHtml(t('plan.keepLines'))}"><input type="checkbox" data-ps-keep ${session.keepLines ? 'checked' : ''} /><span>${escapeHtml(t('studio.keepLines'))}</span></label>
        <button class="button" data-ps="cancel">${icon('close')}<span>${escapeHtml(t('common.cancel'))}</span></button>
        <button class="button primary" data-ps="convert" title="${escapeHtml(t('studio.convertTip'))}">${icon('cube')}<span>${escapeHtml(t('studio.convert'))}</span></button>
      </div>`;
    document.body.appendChild(el);
    document.body.classList.add('plan-studio-open');
    session.colours = themeColours(el);
    const canvas = el.querySelector('.ps-canvas');
    session.canvas = canvas;
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('dblclick', onDouble);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerleave', () => { if (session) { session.cursor = null; session.snap = null; draw(); } });
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    resize();
  }

  /** A [−] value [+] stepper (data-ps-num = field; lengths in the project's unit, others as they are). */
  function stepper(field, value, step, { unit = 'length', min = null } = {}) {
    const units = app.units();
    const shown = unit === 'length' ? formatLength(value, units, { suffix: false }) : String(Math.round(value * 100) / 100);
    const label = unit === 'length' ? units : unit;
    return `<span class="stepper small ps-stepper" data-ps-stepper="${field}"><button type="button" class="stepper-button" data-ps-step="${field}" data-dir="-1" data-step="${step}" tabindex="-1" aria-label="−">${icon('minus')}</button><input class="stepper-value" type="text" inputmode="decimal" data-ps-num="${field}" data-unit="${unit}" ${min != null ? `data-min="${min}"` : ''} value="${escapeHtml(shown)}" /><em class="stepper-unit">${escapeHtml(label)}</em><button type="button" class="stepper-button" data-ps-step="${field}" data-dir="1" data-step="${step}" tabindex="-1" aria-label="+">${icon('plus')}</button></span>`;
  }

  const lengthOf = (raw) => {
    const v = parseLength(String(raw).replace(/(\d),(?=\d{3}(?!\d))/g, '$1'), app.units());
    const x = Array.isArray(v) ? v[0] : v;
    return Number.isFinite(x) ? x : null;
  };

  // ───────────────────────── side panel

  function sideHtml() {
    const s = session;
    const d = s.draft;
    const sel = [...s.selection];
    const walls = d.walls.filter((w) => s.selection.has(w.id));
    const ops = d.openings.filter((o) => s.selection.has(o.id));
    const texts = d.texts.filter((x) => s.selection.has(x.id));
    const section = (glyph, title, body, extra = '') => `<section class="ps-section">${`<header>${icon(glyph)}<span>${escapeHtml(title)}</span>${extra}</header>`}<div class="ps-section-body">${body}</div></section>`;
    const row = (label, control, title = label) => `<div class="ps-row" title="${escapeHtml(title)}"><span class="ps-label">${escapeHtml(label)}</span><span class="ps-control">${control}</span></div>`;
    let out = '';
    // Tool options.
    if (s.tool === 'wall') out += section('wallTool', t('studio.tool.wall'), row(t('studio.thickness'), stepper('wallThickness', s.wallThickness, 0.01)) + `<p class="ps-note">${escapeHtml(t('studio.tip.wallMore'))}</p>`);
    else if (['door', 'window', 'passage'].includes(s.tool)) {
      const kind = s.tool === 'door' ? s.doorKind : s.tool;
      out += section(s.tool === 'window' ? 'windowTool' : 'doorTool', t(`studio.tool.${s.tool}`), (s.tool === 'door' ? row(t('studio.kind'), `<div class="segmented ps-seg">${OPENING_KINDS.slice(0, 3).map(([id, glyph]) => `<button class="segment ${s.doorKind === id ? 'active' : ''}" data-ps-doorkind="${id}" title="${escapeHtml(t(`studio.kind.${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`studio.kind.${id}`))}</span></button>`).join('')}</div>`) : '') + row(t('studio.width'), stepper(`openingWidth.${kind}`, s.openingWidth[kind], 0.05)));
    } else if (s.tool === 'scale') out += section('tapeMeasure', t('studio.tool.scale'), `<p class="ps-note">${escapeHtml(t('studio.tip.scaleMore'))}</p>`);
    // Selection.
    if (walls.length === 1) {
      const w = walls[0];
      out += section('wallTool', t('studio.wall'), row(t('studio.length'), stepper('sel.length', wallLength(w), 0.05)) + row(t('studio.thickness'), stepper('sel.thickness', w.thickness, 0.01)));
    } else if (walls.length > 1) {
      out += section('wallTool', t('studio.walls', { n: walls.length }), row(t('studio.thickness'), stepper('sel.thickness', walls[0].thickness, 0.01)));
    }
    if (ops.length === 1) {
      const o = ops[0];
      const kind = o.kind && OPENING_KINDS.some(([k]) => k === o.kind) ? o.kind : openingKind(o);
      const isDoor = openingKind(o) === 'door';
      out += section(isDoor ? 'doorTool' : 'windowTool', t('studio.opening'),
        `<div class="segmented ps-seg wrap">${OPENING_KINDS.map(([id, glyph]) => `<button class="segment ${kind === id ? 'active' : ''}" data-ps-opkind="${id}" title="${escapeHtml(t(`studio.kind.${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`studio.kind.${id}`))}</span></button>`).join('')}</div>`
        + row(t('studio.width'), stepper('op.width', o.width, 0.05))
        + row(t('studio.height'), stepper('op.height', o.height, 0.05))
        + row(t('studio.sill'), stepper('op.sill', o.sill ?? 0, 0.05))
        + (isDoor ? `<div class="ps-actions"><button class="button small" data-ps="flipSide" title="${escapeHtml(t('studio.flipSideTip'))}">${icon('studioFlip')}<span>${escapeHtml(t('studio.flipSide'))}</span></button><button class="button small" data-ps="flipHinge" title="${escapeHtml(t('studio.flipHingeTip'))}">${icon('studioHinge')}<span>${escapeHtml(t('studio.flipHinge'))}</span></button></div>` : ''));
    }
    const pieces = (s.draft.furniture ?? []).filter((x) => s.selection.has(x.id));
    if (pieces.length === 1) {
      const p = pieces[0];
      const entry = catalogItem(p.item);
      const keys = new Set((entry?.params ?? []).map((q) => q.key));
      const lang = getLanguage();
      // Same category first, then everything that stands on the floor of that kind of room.
      const same = allItems().filter((i) => i.kind !== 'user' && entry && i.category === entry.category);
      const choices = [...same, ...COMMON_FURNITURE.map((id) => catalogItem(id)).filter((i) => i && !same.includes(i))];
      if (entry && !choices.includes(entry)) choices.unshift(entry);
      out += section('furniture', t('studio.piece'),
        row(t('studio.item'), `<select class="ps-select" data-ps-item="${escapeHtml(p.id)}">${choices.map((i) => `<option value="${escapeHtml(i.id)}" ${i.id === p.item ? 'selected' : ''}>${escapeHtml(itemName(i, lang))}</option>`).join('')}</select>`)
        + (keys.has('width') || keys.has('length') ? row(t('studio.width'), stepper('piece.width', p.size[0], 0.05)) : '')
        + (keys.has('depth') ? row(t('studio.depth'), stepper('piece.depth', p.size[1], 0.05)) : '')
        + `<div class="ps-actions"><button class="button small" data-ps="turnLeft" title="${escapeHtml(t('studio.turnLeft'))} (Shift+R)">${icon('rotateLeft')}<span>${escapeHtml(t('studio.turnLeft'))}</span></button><button class="button small" data-ps="turnRight" title="${escapeHtml(t('studio.turnRight'))} (R)">${icon('rotateRight')}<span>${escapeHtml(t('studio.turnRight'))}</span></button></div>`);
    }
    if (texts.length === 1) out += section('textTool', t('studio.label'), row(t('studio.name'), `<input type="text" class="ps-text" data-ps-text="${escapeHtml(texts[0].id)}" value="${escapeHtml(texts[0].text)}" />`));
    if (!sel.length && !['wall', 'door', 'window', 'passage', 'scale'].includes(s.tool)) out += `<p class="ps-note ps-empty">${icon('info')}<span>${escapeHtml(t('studio.selectHint'))}</span></p>`;
    if (s.draft.furniture?.length && !pieces.length) out += section('furniture', t('studio.furniture'), `<p class="ps-note">${escapeHtml(t('studio.furnitureHint', { n: s.draft.furniture.length }))}</p><div class="ps-actions"><button class="button small" data-ps="clearFurniture" title="${escapeHtml(t('studio.clearFurnitureTip'))}">${icon('trash')}<span>${escapeHtml(t('studio.clearFurniture'))}</span></button></div>`);
    // Cleanup.
    out += section('sparkles', t('studio.cleanup'),
      `<div class="ps-grid">${CLEANUPS.map(([id, glyph]) => `<button class="button small ${id === 'all' ? 'primary' : ''}" data-ps-clean="${id}" title="${escapeHtml(t(`studio.clean.${id}Tip`))}">${icon(glyph)}<span>${escapeHtml(t(`studio.clean.${id}`))}</span></button>`).join('')}</div>`
      + row(t('studio.squareTol'), stepper('squareTol', s.squareTol, 1, { unit: '°', min: 1 }), t('studio.squareTolTip'))
      + row(t('studio.joinTol'), stepper('joinTol', s.joinTol, 0.05), t('studio.joinTolTip'))
      + row(t('studio.allThickness'), `${stepper('allThickness', s.wallThickness, 0.01)}<button class="icon-button" data-ps="allThickness" title="${escapeHtml(t('studio.allThicknessTip'))}">${icon('check')}</button>`, t('studio.allThicknessTip')));
    // Recognise again.
    if (s.options.redetect) {
      const modes = s.options.redetectModes ?? [];
      out += section('sparkles', t('studio.redetect'), `${modes.length > 1 ? `<div class="segmented ps-seg wrap">${modes.map(([id, label]) => `<button class="segment ${s.redetectMode === id ? 'active' : ''}" data-ps-mode="${id}">${escapeHtml(label)}</button>`).join('')}</div>` : ''}<div class="ps-actions"><button class="button small" data-ps="redetect" title="${escapeHtml(t('studio.redetectTip'))}">${icon('refresh')}<span>${escapeHtml(t('studio.redetectGo'))}</span></button></div>`);
    }
    // Background.
    if (s.background) out += section('picture', t('studio.background'), row(t('plan.opacity'), `<input type="range" min="5" max="100" step="5" data-ps-bg value="${Math.round(s.bgOpacity * 100)}" /><output>${Math.round(s.bgOpacity * 100)}%</output>`));
    // Problems.
    const problems = s.problems;
    out += section('warning', t('studio.problems'), problems.length
      ? `<ul class="ps-problems">${problems.slice(0, 200).map((p, i) => `<li><button data-ps-problem="${i}" title="${escapeHtml(t('studio.problemGo'))}">${icon(p.kind === 'open-end' ? 'warning' : 'info')}<span>${escapeHtml(t(`studio.problem.${p.kind}`))}</span></button></li>`).join('')}</ul>`
      : `<p class="ps-note ok">${icon('check')}<span>${escapeHtml(t('studio.noProblems'))}</span></p>`, `<span class="badge ${problems.length ? 'warn' : 'ok'}">${problems.length}</span>`);
    return out;
  }

  function renderSide() {
    if (!el) return;
    const side = el.querySelector('.ps-side');
    const scroll = side.scrollTop;
    side.innerHTML = sideHtml();
    side.scrollTop = scroll;
  }

  function renderBars() {
    const s = session;
    el.querySelectorAll('[data-ps-tool]').forEach((b) => { const on = b.dataset.psTool === s.tool; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    el.querySelectorAll('[data-ps-show]').forEach((b) => { const on = s.show[b.dataset.psShow]; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); b.hidden = b.dataset.psShow === 'background' && !s.background; });
    el.querySelectorAll('[data-ps-target]').forEach((b) => { const on = b.dataset.psTarget === s.target; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); });
    el.querySelector('[data-ps="undo"]').disabled = !s.undo.length;
    el.querySelector('[data-ps="redo"]').disabled = !s.redo.length;
    el.querySelector('[data-ps="delete"]').disabled = !s.selection.size;
    el.querySelector('[data-ps="convert"]').disabled = !s.draft.walls.length;
    const st = draftStats(s.draft);
    el.querySelector('.ps-status').textContent = t('studio.status', { walls: st.walls, doors: st.doors, windows: st.windows, rooms: s.rooms?.length ?? 0, furniture: st.furniture, problems: s.problems.length });
    el.querySelector('.ps-hint').textContent = t(`studio.hint.${s.tool}`);
  }

  /** After every change: rooms preview and problems again, then the panels and the canvas. */
  function refresh({ side = true } = {}) {
    const s = session;
    if (!s) return;
    const key = JSON.stringify([s.draft.walls, s.draft.texts]);
    if (key !== s.roomsKey) {
      s.roomsKey = key;
      try { s.rooms = s.draft.walls.length ? planEntities(toResult(s.draft), { level: 'studio', keepLeftovers: false }).rooms : []; } catch { s.rooms = []; }
    }
    s.problems = draftProblems(s.draft);
    for (const id of [...s.selection]) if (!s.draft.walls.some((w) => w.id === id) && !s.draft.openings.some((o) => o.id === id) && !s.draft.texts.some((x) => x.id === id) && !(s.draft.furniture ?? []).some((x) => x.id === id)) s.selection.delete(id);
    if (side) renderSide();
    renderBars();
    draw();
  }

  // ───────────────────────── undo

  // Undo steps hold the draft and where the background was (a two-point scale or straightening moves it too).
  const bgState = () => (session.background ? { offset: [...session.background.offset], k: session.background.k, rotation: session.background.rotation } : null);
  const setBg = (state) => { if (state && session.background) Object.assign(session.background, { offset: [...state.offset], k: state.k, rotation: state.rotation }); };
  function commit(before, bgBefore = bgState()) {
    session.undo.push({ draft: before, bg: bgBefore });
    if (session.undo.length > 200) session.undo.shift();
    session.redo = [];
    refresh();
  }
  /** Runs an edit as one undo step; `edit(draft)` returns false when nothing changed. */
  function edit(fn) {
    const before = cloneDraft(session.draft);
    const bgBefore = bgState();
    const changed = fn(session.draft);
    if (changed === false || (JSON.stringify(before) === JSON.stringify(session.draft) && JSON.stringify(bgBefore) === JSON.stringify(bgState()))) { refresh(); return false; }
    commit(before, bgBefore);
    return true;
  }
  function undo() {
    const s = session;
    if (!s.undo.length) return;
    const step = s.undo.pop();
    s.redo.push({ draft: cloneDraft(s.draft), bg: bgState() });
    s.draft = step.draft;
    setBg(step.bg);
    refresh();
  }
  function redo() {
    const s = session;
    if (!s.redo.length) return;
    const step = s.redo.pop();
    s.undo.push({ draft: cloneDraft(s.draft), bg: bgState() });
    s.draft = step.draft;
    setBg(step.bg);
    refresh();
  }

  // ───────────────────────── view

  function resize() {
    const s = session;
    const wrap = el.querySelector('.ps-canvas-wrap');
    const r = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    s.canvas.width = Math.max(1, Math.round(r.width * dpr));
    s.canvas.height = Math.max(1, Math.round(r.height * dpr));
    s.canvas.style.width = `${r.width}px`;
    s.canvas.style.height = `${r.height}px`;
    s.dpr = dpr; s.cw = r.width; s.ch = r.height;
  }
  function onResize() { if (!session) return; resize(); draw(); }

  /** Zooms to the plan (and the background picture). */
  function fit() {
    const s = session;
    let b = draftBounds(s.draft, { leftovers: s.show.leftovers });
    const bg = s.background;
    if (bg?.kind === 'image') {
      const pts = [[0, 0], [bg.width, 0], [bg.width, bg.height], [0, bg.height]].map((q) => backgroundPoint(bg, q));
      const p0 = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))]; const p1 = [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
      b = b ? { min: [Math.min(b.min[0], p0[0]), Math.min(b.min[1], p0[1])], max: [Math.max(b.max[0], p1[0]), Math.max(b.max[1], p1[1])] } : { min: p0, max: p1 };
    }
    if (!b) b = { min: [-5, -5], max: [5, 5] };
    const w = Math.max(1, b.max[0] - b.min[0]); const h = Math.max(1, b.max[1] - b.min[1]);
    const scale = Math.max(2, Math.min(2000, Math.min((s.cw - 60) / w, (s.ch - 60) / h)));
    s.view = { scale, ox: s.cw / 2 - ((b.min[0] + b.max[0]) / 2) * scale, oy: s.ch / 2 - ((b.min[1] + b.max[1]) / 2) * scale };
    draw();
  }
  const toScreen = (p) => [p[0] * session.view.scale + session.view.ox, p[1] * session.view.scale + session.view.oy];
  const toPlan = (x, y) => [(x - session.view.ox) / session.view.scale, (y - session.view.oy) / session.view.scale];
  const eventPlan = (e) => { const r = session.canvas.getBoundingClientRect(); return toPlan(e.clientX - r.left, e.clientY - r.top); };
  const pxToM = (px) => px / session.view.scale;

  function zoomAt(x, y, factor) {
    const v = session.view;
    const p = toPlan(x, y);
    v.scale = Math.max(2, Math.min(4000, v.scale * factor));
    v.ox = x - p[0] * v.scale; v.oy = y - p[1] * v.scale;
    draw();
  }

  // ───────────────────────── drawing

  function draw() {
    const s = session;
    if (!s || !el) return;
    const ctx = s.canvas.getContext('2d');
    const c = s.colours;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, s.cw, s.ch);
    drawGrid(ctx);
    drawBackground(ctx);
    if (s.show.leftovers) {
      ctx.strokeStyle = c.muted; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (const l of s.draft.leftovers) { const a = toScreen(l.a); const b = toScreen(l.b); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    if (s.show.rooms) drawRooms(ctx);
    if (s.show.furniture) drawFurniture(ctx);
    drawWalls(ctx);
    drawOpenings(ctx);
    drawTexts(ctx);
    if (s.show.problems) drawProblems(ctx);
    drawTool(ctx);
  }

  function drawGrid(ctx) {
    const s = session;
    const c = s.colours;
    const m = s.view.scale;
    const step = m > 120 ? 0.1 : m > 25 ? 1 : m > 6 ? 5 : 10;
    const [x0, z0] = toPlan(0, 0); const [x1, z1] = toPlan(s.cw, s.ch);
    ctx.lineWidth = 1;
    for (const [k, alpha] of [[step, 0.12], [step * 10, 0.22]]) {
      ctx.strokeStyle = c.text; ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let x = Math.floor(x0 / k) * k; x <= x1; x += k) { const X = Math.round(toScreen([x, 0])[0]) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, s.ch); }
      for (let z = Math.floor(z0 / k) * k; z <= z1; z += k) { const Z = Math.round(toScreen([0, z])[1]) + 0.5; ctx.moveTo(0, Z); ctx.lineTo(s.cw, Z); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Scale bar (bottom left).
    const bar = [0.5, 1, 2, 5, 10, 20, 50].find((v) => v * m >= 70) ?? 50;
    const L = bar * m;
    ctx.fillStyle = c.text; ctx.strokeStyle = c.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, s.ch - 16); ctx.lineTo(14 + L, s.ch - 16); ctx.moveTo(14, s.ch - 21); ctx.lineTo(14, s.ch - 11); ctx.moveTo(14 + L, s.ch - 21); ctx.lineTo(14 + L, s.ch - 11); ctx.stroke();
    ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText(formatLength(bar, app.units()), 18, s.ch - 20);
  }

  function drawBackground(ctx) {
    const s = session;
    const bg = s.background;
    if (!bg || !s.show.background) return;
    ctx.globalAlpha = s.bgOpacity;
    if (bg.kind === 'image' && bg.image) {
      const [x, y] = toScreen(backgroundCentre(bg));
      const m = bg.k * s.view.scale;
      ctx.imageSmoothingEnabled = true;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(bg.rotation ?? 0);
      ctx.drawImage(bg.image, -bg.centre[0] * m, -bg.centre[1] * m, bg.width * m, bg.height * m);
      ctx.restore();
    } else if (bg.kind === 'lines') {
      ctx.strokeStyle = s.colours.accent; ctx.lineWidth = 1;
      ctx.beginPath();
      const T = (p) => toScreen(backgroundPoint(bg, p));
      for (const l of bg.lines) { const a = T(l.a); const b = T(l.b); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawRooms(ctx) {
    const s = session;
    const c = s.colours;
    for (const r of s.rooms ?? []) {
      ctx.beginPath();
      r.points.forEach((p, i) => { const q = toScreen(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.closePath();
      ctx.fillStyle = c.accent; ctx.globalAlpha = 0.08; ctx.fill(); ctx.globalAlpha = 1;
      // Area at the room's middle (the name is the label text, drawn with the texts).
      const xs = r.points.map((p) => p[0]); const zs = r.points.map((p) => p[1]);
      const m = toScreen([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]);
      const area = Math.abs(r.points.reduce((a, p, i) => { const q = r.points[(i + 1) % r.points.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
      ctx.fillStyle = c.muted; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      if (s.view.scale * Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) > 50) ctx.fillText(`${area.toFixed(1)} m²${r.name ? '' : ` · ${t(`plan.roomGuess.${r.guess ?? 'room'}`)}`}`, m[0], m[1] + 10);
    }
  }

  /** The four corners of a wall band (straight piece). */
  function band(w) {
    const u = wallDir(w); const n = [-u[1], u[0]]; const h = w.thickness / 2;
    return [[w.a[0] + n[0] * h, w.a[1] + n[1] * h], [w.b[0] + n[0] * h, w.b[1] + n[1] * h], [w.b[0] - n[0] * h, w.b[1] - n[1] * h], [w.a[0] - n[0] * h, w.a[1] - n[1] * h]];
  }

  function drawWalls(ctx) {
    const s = session;
    const c = s.colours;
    for (const w of s.draft.walls) {
      const selected = s.selection.has(w.id);
      const hover = s.hover?.id === w.id;
      ctx.beginPath();
      band(w).forEach((p, i) => { const q = toScreen(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.closePath();
      ctx.fillStyle = selected ? c.accent : c.text;
      ctx.globalAlpha = selected ? 0.75 : hover ? 0.6 : 0.42;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = selected || hover ? c.accent : c.text; ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
    }
    // Corners: small squares (bigger on the selected walls, where they can be dragged).
    const seen = new Set();
    for (const w of s.draft.walls) {
      for (const end of ['a', 'b']) {
        const key = `${w[end][0].toFixed(3)},${w[end][1].toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const q = toScreen(w[end]);
        const big = s.selection.has(w.id);
        const r = big ? 4 : 2.5;
        ctx.fillStyle = big ? c.surface : c.text; ctx.strokeStyle = big ? c.accent : c.text; ctx.lineWidth = 1.5;
        ctx.fillRect(q[0] - r, q[1] - r, r * 2, r * 2); ctx.strokeRect(q[0] - r, q[1] - r, r * 2, r * 2);
      }
    }
    if (s.show.lengths && s.view.scale > 18) {
      ctx.font = '10.5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const w of s.draft.walls) {
        const L = wallLength(w);
        if (L * s.view.scale < 60) continue;
        const u = wallDir(w); const n = [-u[1], u[0]];
        const m = toScreen([(w.a[0] + w.b[0]) / 2 + n[0] * (w.thickness / 2 + pxToM(9)), (w.a[1] + w.b[1]) / 2 + n[1] * (w.thickness / 2 + pxToM(9))]);
        let angle = Math.atan2(u[1], u[0]);
        if (angle > Math.PI / 2) angle -= Math.PI; if (angle < -Math.PI / 2) angle += Math.PI;
        ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(angle);
        ctx.fillStyle = s.selection.has(w.id) ? c.accent : c.muted;
        ctx.fillText(formatLength(L, app.units()), 0, 0);
        ctx.restore();
      }
    }
  }

  function drawOpenings(ctx) {
    const s = session;
    const c = s.colours;
    const byWall = new Map(s.draft.walls.map((w) => [w.id, w]));
    for (const o of s.draft.openings) {
      const w = byWall.get(o.wall);
      if (!w) continue;
      const u = wallDir(w); const n = [-u[1], u[0]];
      const h = w.thickness / 2;
      const s0 = o.offset - o.width / 2; const s1 = o.offset + o.width / 2;
      const P = (sAlong, off) => toScreen([w.a[0] + u[0] * sAlong + n[0] * off, w.a[1] + u[1] * sAlong + n[1] * off]);
      const selected = s.selection.has(o.id);
      // The gap in the wall.
      ctx.beginPath();
      [P(s0, h), P(s1, h), P(s1, -h), P(s0, -h)].forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.closePath();
      ctx.fillStyle = c.bg; ctx.fill();
      ctx.strokeStyle = selected ? c.accent : c.text; ctx.lineWidth = selected ? 2 : 1.2;
      const kind = openingKind(o);
      const line = (p, q) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
      if (kind === 'window') {
        ctx.stroke();
        line(P(s0, 0), P(s1, 0));
        line(P(s0, h * 0.4), P(s1, h * 0.4));
      } else if (kind === 'passage') {
        ctx.setLineDash([4, 3]); line(P(s0, h), P(s1, h)); line(P(s0, -h), P(s1, -h)); ctx.setLineDash([]);
      } else if (/sliding|bypass|barn|pocket|folding|bifold/.test(o.item)) {
        line(P(s0, h * 0.3), P(o.offset + 0.05, h * 0.3));
        line(P(o.offset - 0.05, -h * 0.3), P(s1, -h * 0.3));
      } else {
        // Swing doors: leaf + quarter arc from the hinge, on the side it opens to (left = +n).
        const side = o.side === 'right' ? -1 : 1;
        const leaves = /double/.test(o.item) ? [[s0, 1, o.width / 2], [s1, -1, o.width / 2]] : [[(o.hinge === 'right') === (side > 0) ? s1 : s0, (o.hinge === 'right') === (side > 0) ? -1 : 1, o.width]];
        for (const [hs, dir, len] of leaves) {
          const hinge = [w.a[0] + u[0] * hs + n[0] * side * h, w.a[1] + u[1] * hs + n[1] * side * h];
          const tip = [hinge[0] + n[0] * side * len, hinge[1] + n[1] * side * len];
          line(toScreen(hinge), toScreen(tip));
          ctx.beginPath();
          for (let i = 0; i <= 16; i++) {
            const a = (i / 16) * (Math.PI / 2);
            const p = [hinge[0] + (u[0] * dir * Math.cos(a) + n[0] * side * Math.sin(a)) * len, hinge[1] + (u[1] * dir * Math.cos(a) + n[1] * side * Math.sin(a)) * len];
            const q = toScreen(p);
            if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
          }
          ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
    }
  }

  /** Furniture: its footprint, a tick at its front and its name (the selected and hovered ones in the accent colour). */
  function drawFurniture(ctx) {
    const s = session;
    const c = s.colours;
    const lang = getLanguage();
    for (const p of s.draft.furniture ?? []) {
      const selected = s.selection.has(p.id); const hover = s.hover?.id === p.id;
      const pts = furnitureCorners(p).map(toScreen);
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
      ctx.fillStyle = c.accent; ctx.globalAlpha = selected ? 0.3 : p.item === 'rug' ? 0.06 : 0.14; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = c.accent; ctx.lineWidth = selected ? 2.5 : hover ? 2 : 1.2;
      if (p.item === 'rug') ctx.setLineDash([5, 3]);
      ctx.stroke(); ctx.setLineDash([]);
      // Front: a short tick from the middle of the front side.
      const fr = [Math.sin(p.rotation ?? 0), Math.cos(p.rotation ?? 0)];
      const a = toScreen([p.position[0] + (fr[0] * p.size[1]) / 2, p.position[1] + (fr[1] * p.size[1]) / 2]);
      const b = toScreen([p.position[0] + (fr[0] * (p.size[1] / 2 + 0.18)), p.position[1] + (fr[1] * (p.size[1] / 2 + 0.18))]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineWidth = 2; ctx.stroke();
      if (s.view.scale * Math.min(...p.size) > 26) {
        const m = toScreen(p.position);
        ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const label = itemName(catalogItem(p.item), lang) || p.item;
        ctx.lineWidth = 3; ctx.strokeStyle = c.bg; ctx.strokeText(label, m[0], m[1]);
        ctx.fillStyle = selected ? c.accent : c.text; ctx.fillText(label, m[0], m[1]);
      }
    }
  }

  function drawTexts(ctx) {
    const s = session;
    const c = s.colours;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const x of s.draft.texts) {
      const q = toScreen(x.p);
      const size = Math.max(11, Math.min(22, (x.height ?? 0.3) * s.view.scale * 0.5));
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      const selected = s.selection.has(x.id);
      if (selected || s.hover?.id === x.id) {
        const w = ctx.measureText(x.text).width + 10;
        ctx.strokeStyle = c.accent; ctx.lineWidth = 1.5; ctx.strokeRect(q[0] - w / 2, q[1] - size / 2 - 4, w, size + 8);
      }
      ctx.fillStyle = selected ? c.accent : c.text;
      ctx.fillText(x.text, q[0], q[1]);
    }
  }

  function drawProblems(ctx) {
    const s = session;
    for (const p of s.problems) {
      const q = toScreen(p.at);
      ctx.strokeStyle = p.kind === 'open-end' ? s.colours.danger : '#e8a33a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q[0], q[1], 8, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawTool(ctx) {
    const s = session;
    const c = s.colours;
    // Snap mark.
    if (s.snap?.kind && s.cursor) {
      const q = toScreen(s.snap.p);
      ctx.strokeStyle = c.accent; ctx.lineWidth = 2;
      ctx.beginPath();
      if (s.snap.kind === 'end') ctx.rect(q[0] - 6, q[1] - 6, 12, 12);
      else if (s.snap.kind === 'mid') { ctx.moveTo(q[0], q[1] - 7); ctx.lineTo(q[0] + 7, q[1] + 6); ctx.lineTo(q[0] - 7, q[1] + 6); ctx.closePath(); } else { ctx.moveTo(q[0] - 6, q[1] - 6); ctx.lineTo(q[0] + 6, q[1] + 6); ctx.moveTo(q[0] + 6, q[1] - 6); ctx.lineTo(q[0] - 6, q[1] + 6); }
      ctx.stroke();
    }
    const label = (p, text) => {
      const q = toScreen(p);
      ctx.font = '600 12px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 12;
      ctx.fillStyle = c.surface; ctx.strokeStyle = c.accent; ctx.lineWidth = 1;
      ctx.fillRect(q[0] + 12, q[1] - 26, w, 20); ctx.strokeRect(q[0] + 12, q[1] - 26, w, 20);
      ctx.fillStyle = c.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, q[0] + 18, q[1] - 16);
    };
    // Wall being drawn.
    if (s.tool === 'wall' && s.chain && s.cursor) {
      const a = s.chain.at(-1); const b = s.snap?.p ?? s.cursor;
      const w = { a, b, thickness: s.wallThickness };
      if (wallLength(w) > 0.01) {
        ctx.beginPath();
        band(w).forEach((p, i) => { const q = toScreen(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
        ctx.closePath();
        ctx.fillStyle = c.accent; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = c.accent; ctx.lineWidth = 1.5; ctx.stroke();
        label(b, formatLength(wallLength(w), app.units()));
      }
    }
    // Opening preview on the wall under the pointer.
    if (['door', 'window', 'passage'].includes(s.tool) && s.preview) {
      const { wall, along, width } = s.preview;
      const u = wallDir(wall); const n = [-u[1], u[0]]; const h = wall.thickness / 2 + pxToM(3);
      const P = (sa, off) => toScreen([wall.a[0] + u[0] * sa + n[0] * off, wall.a[1] + u[1] * sa + n[1] * off]);
      ctx.beginPath();
      [P(along - width / 2, h), P(along + width / 2, h), P(along + width / 2, -h), P(along - width / 2, -h)].forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.closePath();
      ctx.fillStyle = c.accent; ctx.globalAlpha = 0.4; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.stroke();
    }
    // Two-point scale.
    if (s.tool === 'scale' && s.measure?.length) {
      const a = s.measure[0]; const b = s.measure[1] ?? s.snap?.p ?? s.cursor;
      if (b) {
        const qa = toScreen(a); const qb = toScreen(b);
        ctx.strokeStyle = s.colours.danger; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(qa[0], qa[1]); ctx.lineTo(qb[0], qb[1]); ctx.stroke();
        for (const q of [qa, qb]) { ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, Math.PI * 2); ctx.fillStyle = s.colours.danger; ctx.fill(); }
        label(b, formatLength(Math.hypot(b[0] - a[0], b[1] - a[1]), app.units()));
      }
    }
    // Box selection.
    if (s.drag?.kind === 'box') {
      const [x0, y0] = toScreen(s.drag.start); const [x1, y1] = toScreen(s.drag.now);
      ctx.strokeStyle = c.accent; ctx.lineWidth = 1; ctx.setLineDash([5, 3]);
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.setLineDash([]);
      ctx.fillStyle = c.accent; ctx.globalAlpha = 0.07; ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); ctx.globalAlpha = 1;
    }
    // Lengths while dragging walls / corners.
    if (s.drag?.kind === 'vertex' && s.cursor) {
      const ends = endsAt(s.draft, s.drag.to);
      if (ends[0]) label(s.drag.to, ends.map(({ wall }) => formatLength(wallLength(wall), app.units())).join(' · '));
    }
  }

  // ───────────────────────── pointer

  /** Snapped plan point for the pointer (Shift: no snapping). `from`: the previous point (walls run square to it). */
  function snapped(e, { from = null, skipWalls = null } = {}) {
    const s = session;
    const raw = eventPlan(e);
    if (e.shiftKey) return { p: raw, kind: null };
    const hit = snapPoint(s.draft, raw, pxToM(SNAP_PX), { skipWalls });
    if (hit.kind === 'end' || hit.kind === 'mid') return hit;
    let p = hit.kind ? hit.p : raw;
    if (from) {
      // Square to the previous point (within 5°), keeping the length.
      const d = [p[0] - from[0], p[1] - from[1]];
      const ang = Math.atan2(d[1], d[0]);
      const snap90 = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(ang - snap90) < (5 * Math.PI) / 180) {
        const L = Math.hypot(d[0], d[1]);
        p = Math.abs(Math.cos(snap90)) > 0.5 ? [from[0] + Math.sign(Math.cos(snap90)) * L, from[1]] : [from[0], from[1] + Math.sign(Math.sin(snap90)) * L];
        return { p, kind: hit.kind === 'on' ? 'on' : null, wall: hit.wall };
      }
    }
    return { p, kind: hit.kind, wall: hit.wall };
  }

  /** What is under the pointer for the select tool: a corner of a selected wall, an opening, a text or a wall. */
  function pickAt(e) {
    const s = session;
    const p = eventPlan(e);
    const tol = pxToM(7);
    for (const w of s.draft.walls) {
      if (!s.selection.has(w.id)) continue;
      for (const end of ['a', 'b']) if (Math.hypot(w[end][0] - p[0], w[end][1] - p[1]) <= tol + pxToM(2)) return { kind: 'vertex', at: [...w[end]], id: w.id };
    }
    const text = textAt(s.draft, p, tol);
    if (text) return { kind: 'text', id: text.id, item: text };
    const op = openingAt(s.draft, p, tol);
    if (op) return { kind: 'opening', id: op.id, item: op };
    const piece = s.show.furniture ? furnitureAt(s.draft, p) : null;
    if (piece && !wallAt(s.draft, p, 0)) return { kind: 'piece', id: piece.id, item: piece };
    // Any corner (also of unselected walls) when the pointer is right on it.
    for (const w of s.draft.walls) for (const end of ['a', 'b']) if (Math.hypot(w[end][0] - p[0], w[end][1] - p[1]) <= tol) return { kind: 'vertex', at: [...w[end]], id: w.id };
    const wall = wallAt(s.draft, p, tol);
    if (wall) return { kind: 'wall', id: wall.id, item: wall };
    return null;
  }

  function onDown(e) {
    const s = session;
    try { s.canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
    const r = s.canvas.getBoundingClientRect();
    const x = e.clientX - r.left; const y = e.clientY - r.top;
    // Pan: middle or right button, Ctrl/Alt + left, the Hand tool, or Space held.
    if (e.button === 1 || e.button === 2 || s.tool === 'pan' || s.space || (e.button === 0 && (e.ctrlKey || e.altKey) && s.tool !== 'select')) {
      s.drag = { kind: 'pan', x, y, ox: s.view.ox, oy: s.view.oy };
      s.canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    if (s.tool === 'select') {
      const hit = pickAt(e);
      const p = eventPlan(e);
      if (!hit) {
        if (!e.shiftKey && !e.ctrlKey) s.selection.clear();
        s.drag = { kind: 'box', start: p, now: p, add: e.shiftKey || e.ctrlKey };
        refresh();
        return;
      }
      if (e.shiftKey || e.ctrlKey) {
        if (hit.kind !== 'vertex') { if (s.selection.has(hit.id)) s.selection.delete(hit.id); else s.selection.add(hit.id); refresh(); }
        return;
      }
      if (hit.kind !== 'vertex' && !s.selection.has(hit.id)) { s.selection.clear(); s.selection.add(hit.id); refresh(); }
      s.drag = { kind: hit.kind, start: p, base: cloneDraft(s.draft), hit, moved: false, from: hit.at };
      return;
    }
    if (s.tool === 'wall') {
      const prev = s.chain?.at(-1) ?? null;
      const hit = snapped(e, { from: prev });
      if (!s.chain) { s.chain = [hit.p]; draw(); return; }
      const a = s.chain.at(-1);
      if (Math.hypot(hit.p[0] - a[0], hit.p[1] - a[1]) < 0.02) return;
      edit((d) => addWall(d, a, hit.p, s.wallThickness) ? true : false);
      // Ends on an existing corner: the run is closed.
      if (hit.kind === 'end' && s.chain.length > 1 && Math.hypot(hit.p[0] - s.chain[0][0], hit.p[1] - s.chain[0][1]) < 1e-6) s.chain = null;
      else s.chain.push(hit.p);
      draw();
      return;
    }
    if (['door', 'window', 'passage'].includes(s.tool)) {
      const pv = s.preview;
      if (!pv) return;
      const kind = s.tool === 'door' ? s.doorKind : s.tool;
      let made = null;
      edit((d) => { const w = d.walls.find((x) => x.id === pv.wall.id); made = w && addOpening(d, w, pv.along, kind, s.openingWidth[kind]); return Boolean(made); });
      if (made) { s.selection.clear(); s.selection.add(made.id); refresh(); }
      return;
    }
    if (s.tool === 'text') { addLabelAt(snapped(e).p); return; }
    if (s.tool === 'scale') {
      const hit = snapped(e, { from: s.measure?.[0] ?? null });
      s.measure = s.measure?.length === 1 ? [s.measure[0], hit.p] : [hit.p];
      draw();
      if (s.measure.length === 2) calibrate(s.measure[0], s.measure[1]);
    }
  }

  function onMove(e) {
    const s = session;
    if (!s) return;
    const r = s.canvas.getBoundingClientRect();
    const x = e.clientX - r.left; const y = e.clientY - r.top;
    s.cursor = eventPlan(e);
    const drag = s.drag;
    if (drag?.kind === 'pan') { s.view.ox = drag.ox + x - drag.x; s.view.oy = drag.oy + y - drag.y; draw(); return; }
    if (drag?.kind === 'box') { drag.now = s.cursor; draw(); return; }
    if (drag && ['vertex', 'wall', 'opening', 'text', 'piece'].includes(drag.kind)) { dragTo(e); return; }
    // Hover and snapping hints.
    if (s.tool === 'select') {
      const hit = pickAt(e);
      s.hover = hit && hit.kind !== 'vertex' ? { id: hit.id } : null;
      s.canvas.style.cursor = hit?.kind === 'vertex' ? 'move' : hit ? 'pointer' : 'default';
      s.snap = null;
    } else if (s.tool === 'pan') s.canvas.style.cursor = 'grab';
    else s.canvas.style.cursor = 'crosshair';
    if (s.tool === 'wall') s.snap = snapped(e, { from: s.chain?.at(-1) ?? null });
    if (s.tool === 'scale' || s.tool === 'text') s.snap = snapped(e, { from: s.tool === 'scale' ? s.measure?.[0] ?? null : null });
    if (['door', 'window', 'passage'].includes(s.tool)) {
      const p = s.cursor;
      const wall = wallAt(s.draft, p, pxToM(10));
      if (wall) {
        const kind = s.tool === 'door' ? s.doorKind : s.tool;
        const width = Math.min(s.openingWidth[kind], wallLength(wall) - 0.1);
        const along = Math.max(width / 2 + 0.05, Math.min(wallLength(wall) - width / 2 - 0.05, alongOf(wall, p)));
        s.preview = width > 0.2 ? { wall, along, width } : null;
      } else s.preview = null;
    }
    draw();
  }

  /** Live drag of the select tool: from the draft as it was at the press, so every frame is exact. */
  function dragTo(e) {
    const s = session;
    const drag = s.drag;
    const now = eventPlan(e);
    const delta = [now[0] - drag.start[0], now[1] - drag.start[1]];
    if (!drag.moved && Math.hypot(delta[0], delta[1]) * s.view.scale < 3) return;
    drag.moved = true;
    const d = cloneDraft(drag.base);
    if (drag.kind === 'vertex') {
      const joined = endsAt(d, drag.from).map(({ wall }) => wall.id);
      // Square to the far end of a single wall at the corner.
      const only = endsAt(d, drag.from);
      const far = only.length === 1 ? only[0].wall[only[0].end === 'a' ? 'b' : 'a'] : null;
      const hit = snapped(e, { from: far, skipWalls: joined });
      moveVertex(d, drag.from, hit.p);
      drag.to = hit.p;
      s.snap = hit;
    } else if (drag.kind === 'wall') {
      const ids = [...s.selection].filter((id) => d.walls.some((w) => w.id === id));
      // Straight walls move square to themselves unless Shift is held (a wall slides along its own line otherwise).
      let mv = delta;
      if (ids.length === 1 && !e.shiftKey) { const w = d.walls.find((x) => x.id === ids[0]); const u = wallDir(w); const n = [-u[1], u[0]]; const k = delta[0] * n[0] + delta[1] * n[1]; mv = [n[0] * k, n[1] * k]; }
      moveWalls(d, ids, mv);
    } else if (drag.kind === 'opening') {
      const op = d.openings.find((o) => o.id === drag.hit.id);
      const w = d.walls.find((x) => x.id === op.wall);
      const L = wallLength(w);
      op.offset = Math.max(op.width / 2, Math.min(L - op.width / 2, alongOf(w, now)));
    } else if (drag.kind === 'text') {
      const x = d.texts.find((tx) => tx.id === drag.hit.id);
      x.p = [drag.hit.item.p[0] + delta[0], drag.hit.item.p[1] + delta[1]];
    } else if (drag.kind === 'piece') {
      // The selected furniture moves together.
      for (const piece of d.furniture ?? []) if (s.selection.has(piece.id)) { const from = drag.base.furniture.find((x) => x.id === piece.id); piece.position = [from.position[0] + delta[0], from.position[1] + delta[1]]; }
    }
    s.draft = d;
    refresh({ side: false });
  }

  function onUp(e) {
    const s = session;
    if (!s) return;
    try { s.canvas.releasePointerCapture?.(e.pointerId); } catch { /* not captured */ }
    const drag = s.drag;
    s.drag = null;
    s.canvas.style.cursor = '';
    if (!drag) return;
    if (drag.kind === 'box') {
      const x0 = Math.min(drag.start[0], drag.now[0]); const x1 = Math.max(drag.start[0], drag.now[0]);
      const z0 = Math.min(drag.start[1], drag.now[1]); const z1 = Math.max(drag.start[1], drag.now[1]);
      if (Math.abs(x1 - x0) * s.view.scale > 3 || Math.abs(z1 - z0) * s.view.scale > 3) {
        const inside = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= z0 && p[1] <= z1;
        for (const w of s.draft.walls) if (inside(w.a) && inside(w.b)) s.selection.add(w.id);
        const byWall = new Map(s.draft.walls.map((w) => [w.id, w]));
        for (const o of s.draft.openings) { const w = byWall.get(o.wall); if (w && inside(pointAlong(w, o.offset))) s.selection.add(o.id); }
        for (const x of s.draft.texts) if (inside(x.p)) s.selection.add(x.id);
        if (s.show.furniture) for (const x of s.draft.furniture ?? []) if (inside(x.position)) s.selection.add(x.id);
      }
      refresh();
      return;
    }
    if (['vertex', 'wall', 'opening', 'text', 'piece'].includes(drag.kind)) {
      s.snap = null;
      if (drag.moved) commit(drag.base); else refresh();
    }
  }

  function onDouble(e) {
    const s = session;
    if (s.tool === 'wall') { s.chain = null; draw(); return; }
    if (s.tool === 'select') {
      const hit = pickAt(e);
      if (hit?.kind === 'text') renameText(hit.item);
      else if (!hit) fit();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const r = session.canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }

  // ───────────────────────── commands

  function setTool(tool) {
    const s = session;
    s.tool = tool; s.chain = null; s.measure = null; s.preview = null; s.snap = null;
    refresh();
  }

  async function addLabelAt(p) {
    const answer = await app.popups.open('prompt', { title: t('studio.labelTitle'), label: t('studio.labelPrompt'), value: '', icon: 'textTool' });
    const text = String(answer?.value ?? '').trim();
    if (!session || !text) return;
    edit((d) => Boolean(addText(d, p, text, 0.5)));
  }

  async function renameText(item) {
    const answer = await app.popups.open('prompt', { title: t('studio.labelTitle'), label: t('studio.labelPrompt'), value: item.text, icon: 'textTool' });
    if (!session || answer?.value == null) return;
    const text = String(answer.value).trim();
    edit((d) => { const x = d.texts.find((tx) => tx.id === item.id); if (!x) return false; if (!text) return deleteItems(d, [x.id]) > 0; x.text = text; return true; });
  }

  /** Two points picked with the scale tool: the real distance is asked and the plan (and its background) scaled to it. */
  async function calibrate(p1, p2) {
    const s = session;
    const measured = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (measured < 1e-6) { s.measure = null; draw(); return; }
    const units = app.units();
    const answer = await app.popups.open('prompt', { title: t('underlay.distanceTitle'), label: t('underlay.distanceLabel', { units }), value: formatLength(measured, units, { suffix: false }), icon: 'tapeMeasure' });
    if (!session) return;
    session.measure = null;
    const metres = answer?.value != null ? lengthOf(answer.value) : null;
    if (!(metres > 0)) { draw(); return; }
    const k = metres / measured;
    edit((d) => {
      scaleDraft(d, p1, k);
      // The background scales about the same point (its centre in source units stays).
      if (s.background) { s.background.offset = [p1[0] + (s.background.offset[0] - p1[0]) * k, p1[1] + (s.background.offset[1] - p1[1]) * k]; s.background.k *= k; }
      return true;
    });
    // The view keeps the same picture on screen: p1 stays where it is.
    const [sx, sy] = toScreen(p1);
    s.view.scale /= k;
    s.view.ox = sx - p1[0] * k * s.view.scale; s.view.oy = sy - p1[1] * k * s.view.scale;
    app.notify?.('success', t('underlay.calibrated', { length: formatLength(metres, units) }));
    draw();
  }

  /** Straighten: the plan and its background turn together until the walls run square to the axes (° turned). */
  function straightenDraft(d) {
    const s = session;
    const angle = dominantAngle(d);
    if (Math.abs(angle) < 1e-4) return 0;
    const centre = s.background ? backgroundCentre(s.background) : (() => { const b = draftBounds(d, { leftovers: false }); return b ? [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2] : [0, 0]; })();
    rotateDraft(d, centre, -angle);
    if (s.background) s.background.rotation = (s.background.rotation ?? 0) - angle;
    return Math.round((-angle * 180) / Math.PI * 10) / 10;
  }

  /**
   * A plan that came in tilted (a photo or scan held at an angle, a drawing turned on its sheet) is straightened as it
   * opens — one Undo step, so the tilt can be had back. Only small tilts: a plan more than 20° off is taken as meant.
   */
  function autoStraighten() {
    const deg = Math.abs((dominantAngle(session.draft) * 180) / Math.PI);
    if (deg < 0.2 || deg > 20) return;
    let turned = 0;
    if (edit((d) => { turned = straightenDraft(d); return turned !== 0; })) {
      app.notify?.('success', t('studio.autoStraightened', { angle: Math.abs(turned) }));
      fit();
    }
  }

  function cleanup(kind) {
    const s = session;
    let report = null;
    const straighten = straightenDraft;
    const changed = edit((d) => {
      if (kind === 'all') { const turned = straighten(d); report = { ...cleanupAll(d, { squareTolDeg: s.squareTol, joinTol: s.joinTol }), turned }; return true; }
      if (kind === 'straighten') { report = { turned: straighten(d) }; return report.turned !== 0; }
      if (kind === 'square') report = { squared: squareUp(d, { tolDeg: s.squareTol }) };
      else if (kind === 'join') report = { joined: joinEnds(d, { tol: s.joinTol }) };
      else if (kind === 'merge') report = { merged: mergeCollinear(d) };
      else if (kind === 'short') report = { removed: removeShort(d, { min: 0.12 }) };
      return true;
    });
    app.notify?.(changed ? 'success' : 'info', changed ? `${report?.turned ? `${t('studio.straightened', { angle: report.turned })} · ` : ''}${t('studio.cleaned', { squared: report?.squared ?? 0, joined: report?.joined ?? 0, merged: report?.merged ?? 0, removed: report?.removed ?? 0 })}` : t('studio.nothingToClean'));
    if (changed && report?.turned) fit();
  }

  async function redetect() {
    const s = session;
    const next = await s.options.redetect?.(s.redetectMode, s.background);
    if (!session || !next) return;
    const before = cloneDraft(s.draft);
    s.draft = next;
    s.selection.clear();
    commit(before);
  }

  /** Turns the selected furniture by a quarter turn about its centre (+1 clockwise on screen). */
  function turnPieces(dir) {
    const s = session;
    edit((d) => {
      let n = 0;
      for (const p of d.furniture ?? []) if (s.selection.has(p.id)) { p.rotation = (p.rotation ?? 0) - dir * (Math.PI / 2); n++; }
      return n > 0;
    });
  }

  function deleteSelection() {
    const s = session;
    if (!s.selection.size) return;
    edit((d) => deleteItems(d, [...s.selection]) > 0);
    s.selection.clear();
    refresh();
  }

  function convert() {
    const s = session;
    if (!s.draft.walls.length) return;
    close({ draft: s.draft, wallHeight: s.wallHeight, target: s.target, keepLines: s.keepLines, background: s.background });
  }

  async function cancel() {
    const s = session;
    if (s.undo.length) {
      const choice = await app.ask?.({ icon: 'warning', title: t('studio.cancelTitle'), message: t('studio.cancelMessage'), buttons: [{ id: 'stay', label: t('studio.stay'), icon: 'undo' }, { id: 'leave', label: t('studio.leave'), icon: 'close', primary: true }] });
      if (choice !== 'leave') return;
    }
    close(null);
  }

  // ───────────────────────── panel events

  function onClick(e) {
    const s = session;
    if (!s) return;
    const target = e.target.closest('button');
    if (!target || !el.contains(target)) return;
    const d = target.dataset;
    if (d.psTool) return setTool(d.psTool);
    if (d.psShow) { s.show[d.psShow] = !s.show[d.psShow]; return refresh({ side: false }); }
    if (d.psTarget) { s.target = d.psTarget; return renderBars(); }
    if (d.psClean) return cleanup(d.psClean);
    if (d.psDoorkind) { s.doorKind = d.psDoorkind; return refresh(); }
    if (d.psMode) { s.redetectMode = d.psMode; return renderSide(); }
    if (d.psProblem != null) {
      const p = s.problems[Number(d.psProblem)];
      if (!p) return undefined;
      s.selection = new Set(p.ids);
      s.view.ox = s.cw / 2 - p.at[0] * s.view.scale; s.view.oy = s.ch / 2 - p.at[1] * s.view.scale;
      if (s.view.scale < 60) zoomAt(s.cw / 2, s.ch / 2, 60 / s.view.scale);
      return refresh();
    }
    if (d.psOpkind) {
      return edit((dr) => {
        const op = dr.openings.find((o) => s.selection.has(o.id));
        if (!op) return false;
        Object.assign(op, { kind: d.psOpkind, ...openingDefaults(d.psOpkind, op.width) });
        if (d.psOpkind === 'door' || d.psOpkind === 'double') op.hinge ??= 'left';
        return true;
      });
    }
    if (d.psStep) {
      const input = el.querySelector(`[data-ps-num="${d.psStep}"]`);
      const unit = input.dataset.unit;
      const current = unit === 'length' ? lengthOf(input.value) : Number(input.value);
      if (current == null || !Number.isFinite(current)) return undefined;
      const step = Number(d.step) * Number(d.dir);
      const min = input.dataset.min != null ? Number(input.dataset.min) : 0.01;
      const next = Math.max(min, Math.round((current + step) * 1000) / 1000);
      applyNumber(d.psStep, next);
      return undefined;
    }
    switch (d.ps) {
      case 'undo': return undo();
      case 'redo': return redo();
      case 'delete': return deleteSelection();
      case 'fit': return fit();
      case 'cancel': return cancel();
      case 'convert': return convert();
      case 'redetect': return redetect();
      case 'allThickness': return edit((dr) => setThickness(dr, null, s.wallThickness) > 0);
      case 'turnLeft': return turnPieces(-1);
      case 'turnRight': return turnPieces(1);
      case 'clearFurniture': return edit((dr) => { const had = dr.furniture?.length ?? 0; dr.furniture = []; return had > 0; });
      case 'flipSide': return edit((dr) => { const op = dr.openings.find((o) => s.selection.has(o.id)); if (!op) return false; op.side = op.side === 'right' ? 'left' : 'right'; return true; });
      case 'flipHinge': return edit((dr) => { const op = dr.openings.find((o) => s.selection.has(o.id)); if (!op) return false; op.hinge = op.hinge === 'right' ? 'left' : 'right'; return true; });
      default: return undefined;
    }
  }

  /** A number field changed (typed or stepped): settings of the workbench or of the selection. */
  function applyNumber(field, value) {
    const s = session;
    if (!(value > 0) && field !== 'op.sill') { refresh(); return; }
    if (field === 'wallHeight') { s.wallHeight = Math.max(1.5, Math.min(12, value)); el.querySelector('[data-ps-num="wallHeight"]').value = formatLength(s.wallHeight, app.units(), { suffix: false }); return; }
    if (field === 'wallThickness' || field === 'allThickness') { s.wallThickness = Math.max(0.03, Math.min(1, value)); return renderSide(); }
    if (field === 'squareTol') { s.squareTol = Math.max(1, Math.min(30, value)); return renderSide(); }
    if (field === 'joinTol') { s.joinTol = Math.max(0.02, Math.min(2, value)); return renderSide(); }
    if (field.startsWith('openingWidth.')) { s.openingWidth[field.slice(13)] = Math.max(0.3, Math.min(6, value)); return renderSide(); }
    if (field === 'piece.width' || field === 'piece.depth') {
      return edit((d) => {
        const p = (d.furniture ?? []).find((x) => s.selection.has(x.id));
        if (!p) return false;
        const v = Math.max(0.2, Math.min(6, value));
        if (field === 'piece.width') { p.size[0] = v; if ('length' in (p.params ?? {}) && !('width' in p.params)) p.params.length = v; else p.params.width = v; } else { p.size[1] = v; p.params.depth = v; }
        return true;
      });
    }
    if (field === 'sel.thickness') return edit((d) => setThickness(d, [...s.selection], Math.max(0.03, Math.min(1, value))) > 0);
    if (field === 'sel.length') return edit((d) => { const w = d.walls.find((x) => s.selection.has(x.id)); return w ? setWallLength(d, w, value) : false; });
    if (field.startsWith('op.')) {
      const key = field.slice(3);
      return edit((d) => {
        const op = d.openings.find((o) => s.selection.has(o.id));
        if (!op) return false;
        if (key === 'width') { const w = d.walls.find((x) => x.id === op.wall); op.width = Math.max(0.3, Math.min(wallLength(w) - 0.02, value)); op.offset = Math.max(op.width / 2, Math.min(wallLength(w) - op.width / 2, op.offset)); } else op[key] = Math.max(0, Math.min(5, value));
        return true;
      });
    }
    return undefined;
  }

  function onChange(e) {
    const s = session;
    if (!s) return;
    const input = e.target;
    if (input.dataset.psNum) {
      const unit = input.dataset.unit;
      const v = unit === 'length' ? lengthOf(input.value) : Number(input.value);
      if (v != null && Number.isFinite(v)) applyNumber(input.dataset.psNum, v); else renderSide();
      return;
    }
    if (input.dataset.psItem) {
      // Another item in the same place: the size parameters it has follow the footprint.
      const id = input.dataset.psItem; const item = input.value;
      edit((d) => {
        const p = (d.furniture ?? []).find((x) => x.id === id);
        if (!p || p.item === item) return false;
        const keys = new Set((catalogItem(item)?.params ?? []).map((q) => q.key));
        p.item = item;
        p.params = {};
        if (keys.has('width')) p.params.width = p.size[0];
        else if (keys.has('length')) p.params.length = p.size[0];
        if (keys.has('depth')) p.params.depth = p.size[1];
        return true;
      });
      return;
    }
    if (input.dataset.psText) {
      const text = input.value.trim();
      edit((d) => { const x = d.texts.find((tx) => tx.id === input.dataset.psText); if (!x || !text || x.text === text) return false; x.text = text; return true; });
      return;
    }
    if (input.matches('[data-ps-keep]')) s.keepLines = input.checked;
  }

  function onInput(e) {
    const s = session;
    if (!s || !e.target.matches('[data-ps-bg]')) return;
    s.bgOpacity = Number(e.target.value) / 100;
    const out = e.target.parentElement.querySelector('output');
    if (out) out.textContent = `${e.target.value}%`;
    draw();
  }

  function onKey(e) {
    const s = session;
    if (!s) return;
    // The workbench owns the keyboard while it is open (the main window's shortcuts would act on the project).
    const typing = e.target.closest?.('input, textarea, select');
    // Keys of a dialog over the workbench (a prompt in the web build) are its own.
    const ours = el.contains(e.target) || e.target === document.body || e.target === document.documentElement;
    if (!ours) return;
    e.stopPropagation();
    if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (ctrl && key === 'a') { e.preventDefault(); s.selection = new Set(s.draft.walls.map((w) => w.id)); refresh(); return; }
    if (ctrl) return;
    if (e.key === ' ') { s.space = true; e.preventDefault(); window.addEventListener('keyup', function up(ev) { if (ev.key === ' ') { if (session) session.space = false; window.removeEventListener('keyup', up, true); } }, true); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (s.chain || s.measure) { s.chain = null; s.measure = null; draw(); } else if (s.tool !== 'select') setTool('select'); else if (s.selection.size) { s.selection.clear(); refresh(); }
      return;
    }
    if (e.key === 'Enter') { if (s.chain) { s.chain = null; draw(); } return; }
    if (key === 'f') { fit(); return; }
    if (key === 'r' && [...s.selection].some((id) => (s.draft.furniture ?? []).some((x) => x.id === id))) { turnPieces(e.shiftKey ? -1 : 1); return; }
    const tool = TOOLS.find(([, , k]) => k.toLowerCase() === key);
    if (tool) setTool(tool[0]);
  }

  return {
    open, close: () => close(null),
    get isOpen() { return Boolean(el); },
    /** Tests: the session's draft and actions without the pointer. */
    debug: () => session && { draft: session.draft, view: session.view, background: session.background, setTool, cleanup, undo, redo, convert, fit, applyNumber, calibrate, selection: session.selection, problems: session.problems, rooms: session.rooms, toScreen, el },
  };
}
