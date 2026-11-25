// Customize: the user's own keyboard shortcuts, toolbar (a "My tools" CommandManager tab, a toolbar group and
// which tabs show), mouse gestures (a right-drag in one of eight directions runs that direction's command) and
// document templates (a part / assembly / drawing kept as a starting point: New from template, or the default
// for File › New).
//
//   settings.keyBindings  = { 'Ctrl+Shift+K': 'commandId' | null (a default shortcut turned off) }
//   settings.userTab      = [commandId …]          the My tools tab
//   settings.toolbarExtra = [commandId …]          a group added to the toolbar
//   settings.hiddenTabs   = [tabId …]
//   settings.gestures     = { enabled, map: [8 command ids: E, NE, N, NW, W, SW, S, SE] }
//   settings.defaultTemplates = { part, assembly, drawing } (template ids)
//   templates (browser storage 'mymechanics.templates') = [{ id, name, kind, created, text | drawing }]
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

export const GESTURE_DIRS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
export const DEFAULT_GESTURES = ['view:right', 'view:iso', 'view:top', 'normalTo', 'view:left', 'undo', 'view:front', 'zoomFit'];
const STORE = 'mymechanics.templates';
const MAX_TEMPLATE = 4 * 1024 * 1024;

/** The sector of a drag (screen pixels, y down): 0 = right (E), counter-clockwise in 45° steps. */
export function gestureSector(dx, dy) {
  const a = Math.atan2(-dy, dx);
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}

const KEY_NAMES = { ' ': 'Space', arrowleft: 'Left', arrowright: 'Right', arrowup: 'Up', arrowdown: 'Down', escape: 'Esc', delete: 'Delete', backspace: 'Backspace', enter: 'Enter', tab: 'Tab', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', insert: 'Insert' };

/** The shortcut a key press makes ('Ctrl+Shift+K', 'Alt+F5', 'F' …), or null for a lone modifier. */
export function comboOf(ev) {
  const raw = String(ev.key ?? '');
  const low = raw.toLowerCase();
  if (['control', 'shift', 'alt', 'meta', 'os', 'dead', 'process', 'unidentified', ''].includes(low)) return null;
  let name = KEY_NAMES[low] ?? (/^f\d{1,2}$/.test(low) ? low.toUpperCase() : null);
  if (!name) {
    // Letters and digits by their key (Shift+1 is '1', not '!'), other keys by the character.
    const code = String(ev.code ?? '');
    if (/^Key[A-Z]$/.test(code)) name = code.slice(3);
    else if (/^Digit\d$/.test(code)) name = code.slice(5);
    else name = raw.length === 1 ? raw.toUpperCase() : raw;
  }
  return [ev.ctrlKey || ev.metaKey ? 'Ctrl' : '', ev.altKey ? 'Alt' : '', ev.shiftKey ? 'Shift' : '', name].filter(Boolean).join('+');
}

/**
 * Every command's shortcuts: the defaults ([combo, command]) with the user's changes over them. Returns
 * Map(command → [combo …]) and Map(combo → command).
 */
export function effectiveBindings(defaults, overrides = {}) {
  const byCombo = new Map();
  for (const [combo, cmd] of defaults) if (!byCombo.has(combo)) byCombo.set(combo, cmd);
  for (const [combo, cmd] of Object.entries(overrides ?? {})) { if (cmd) byCombo.set(combo, cmd); else byCombo.delete(combo); }
  const byCommand = new Map();
  for (const [combo, cmd] of byCombo) byCommand.set(cmd, [...(byCommand.get(cmd) ?? []), combo]);
  return { byCommand, byCombo };
}

/** Templates kept in the browser's storage. */
export function loadTemplates(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage?.getItem(STORE) ?? '[]'); return Array.isArray(v) ? v.filter((x) => x && x.id && x.kind) : []; } catch { return []; }
}
export function storeTemplates(list, storage = globalThis.localStorage) {
  storage?.setItem(STORE, JSON.stringify(list));
}

/** The parts of a drawing a template keeps: the sheet, its settings and standard views — nothing of the model. */
export const DRAWING_TEMPLATE_KEYS = ['sheet', 'projection', 'scale', 'autoScale', 'showHidden', 'showDims', 'dimCoords', 'notes', 'bom', 'customProperties', 'layers', 'activeLayer', 'snap', 'revisionTable'];
const STANDARD_VIEWS = new Set(['front', 'back', 'top', 'bottom', 'left', 'right', 'iso']);
export function drawingTemplateOf(d) {
  const out = {};
  for (const k of DRAWING_TEMPLATE_KEYS) if (d[k] !== undefined) out[k] = structuredClone(d[k]);
  const { partNo, date, ...title } = d.title ?? {};
  out.title = structuredClone(title);
  out.views = (d.views ?? []).filter((v) => STANDARD_VIEWS.has(v.type)).map((v) => { const { id, type, x, y, hidden, scale, style, label } = v; return Object.fromEntries(Object.entries({ id, type, x, y, hidden, scale, style, label }).filter(([, val]) => val !== undefined)); });
  return out;
}
export function applyDrawingTemplate(d, tpl) {
  for (const k of DRAWING_TEMPLATE_KEYS) if (tpl[k] !== undefined) d[k] = structuredClone(tpl[k]);
  d.title = { ...d.title, ...structuredClone(tpl.title ?? {}) };
  if (Array.isArray(tpl.views) && tpl.views.length) d.views = structuredClone(tpl.views);
  return d;
}

export function createCustomTools(ctx) {
  const { state, t } = ctx;
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && e.mode === 'customize');
  const settings = () => state.settings;
  const save = (patch) => { ctx.updateSettings(patch); ctx.renderChrome(); };

  // ─────────── shortcuts

  const bindings = () => effectiveBindings(ctx.defaultShortcuts(), settings().keyBindings);

  /**
   * A key press the user has customised: { cmd } to run, { blocked } for a default turned off, or null (the
   * built-in handling goes on). In a text field only combinations with Ctrl / Alt count (not the clipboard's).
   */
  function keyCommand(ev, inField) {
    const over = settings().keyBindings;
    if (!over || !Object.keys(over).length) return null;
    const combo = comboOf(ev);
    if (!combo || !Object.hasOwn(over, combo)) return null;
    if (inField && (!/^(Ctrl|Alt)\+/.test(combo) || /^Ctrl\+[XCVZYA]$/.test(combo))) return null;
    const cmd = over[combo];
    if (!cmd) return { blocked: true };
    return ctx.commands[cmd] || /^view:/.test(cmd) ? { cmd } : null;
  }

  function assign(combo, cmd) {
    const { byCombo } = bindings();
    const before = byCombo.get(combo);
    const over = { ...(settings().keyBindings ?? {}) };
    over[combo] = cmd;
    // A default the same as what is set now needs no entry.
    const def = ctx.defaultShortcuts().find(([c]) => c === combo)?.[1];
    if (def === cmd) delete over[combo];
    save({ keyBindings: over });
    if (before && before !== cmd) ctx.notify('info', t('custom.keyMoved', { key: combo, from: labelOf(before), to: labelOf(cmd) }));
    else ctx.notify('success', t('custom.keySet', { key: combo, command: labelOf(cmd) }));
  }
  function unbind(combo) {
    const over = { ...(settings().keyBindings ?? {}) };
    const def = ctx.defaultShortcuts().some(([c]) => c === combo);
    if (def) over[combo] = null; else delete over[combo];
    save({ keyBindings: over });
  }

  /** While a shortcut is being recorded: the next key press is it (Esc gives up). */
  function onCaptureKey(ev) {
    const e = editing();
    if (!owns(e) || !e.capture) return;
    const combo = comboOf(ev);
    if (!combo) return;
    ev.preventDefault(); ev.stopPropagation();
    const cmd = e.capture; e.capture = null;
    window.removeEventListener('keydown', onCaptureKey, true);
    if (combo !== 'Esc') assign(combo, cmd);
    ctx.renderLeft();
  }
  /** Records the next key press as a shortcut of `cmd` (tests pass the combination). */
  function recordKey(cmd, combo = null) {
    const e = editing();
    if (combo) { assign(combo, cmd); ctx.renderLeft(); return; }
    e.capture = cmd;
    window.addEventListener('keydown', onCaptureKey, true);
    ctx.renderLeft();
  }

  // ─────────── commands to choose from

  const labelOf = (id) => { const c = ctx.commands[id]; return c ? t(c.label) : id; };
  function commandList() {
    const seen = new Set();
    const out = [];
    for (const [id, c] of Object.entries(ctx.commands)) {
      if (!c?.label || !c.run || seen.has(id) || /Menu$|Split$/.test(id)) continue;
      const label = t(c.label);
      if (!label || label === c.label) continue;
      seen.add(id); out.push({ id, label, icon: c.icon });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }
  function matches(e) {
    const q = String(e.query ?? '').trim().toLowerCase();
    const all = commandList();
    const hit = q ? all.filter((c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) : all;
    return { total: hit.length, list: hit.slice(0, e.limit ?? 40) };
  }

  // ─────────── toolbar

  const userTab = () => (settings().userTab ?? []).filter((id) => ctx.commands[id]);
  const toolbarExtra = () => (settings().toolbarExtra ?? []).filter((id) => ctx.commands[id]);
  function listEdit(key, op, id) {
    const list = [...(settings()[key] ?? [])];
    const i = list.indexOf(id);
    if (op === 'add' && i < 0) list.push(id);
    if (op === 'del' && i >= 0) list.splice(i, 1);
    if ((op === 'up' || op === 'down') && i >= 0) { const j = op === 'up' ? i - 1 : i + 1; if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]]; }
    save({ [key]: list });
  }

  // ─────────── gestures

  const gestureMap = () => { const m = settings().gestures?.map; return GESTURE_DIRS.map((_, i) => (Array.isArray(m) && m[i] !== undefined ? m[i] : DEFAULT_GESTURES[i])); };
  const gesturesOn = () => Boolean(settings().gestures?.enabled);
  const gestureLabels = () => gestureMap().map((id) => (id ? labelOf(id) : ''));
  /** A finished right-drag: the command of its direction. */
  function onGesture(dx, dy) {
    const id = gestureMap()[gestureSector(dx, dy)];
    if (id) ctx.run(id);
    return id;
  }

  // ─────────── templates

  function addTemplate(name, kind) {
    const body = ctx.templateOfCurrent(kind);
    if (!body) { ctx.notify('info', t(kind === 'drawing' ? 'custom.tplNeedDrawing' : 'custom.tplNeedModel')); return null; }
    const tpl = { id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: name || t(`custom.kind.${kind}`), kind, created: new Date().toISOString(), ...body };
    if (JSON.stringify(tpl).length > MAX_TEMPLATE) { ctx.notify('error', t('custom.tplTooBig')); return null; }
    try { storeTemplates([...loadTemplates(), tpl]); } catch (error) { ctx.notify('error', t('custom.tplStoreFailed', { error: error.message })); return null; }
    ctx.notify('success', t('custom.tplSaved', { name: tpl.name }));
    ctx.renderLeft();
    return tpl;
  }
  function deleteTemplate(id) {
    storeTemplates(loadTemplates().filter((x) => x.id !== id));
    const def = { ...(settings().defaultTemplates ?? {}) };
    for (const k of Object.keys(def)) if (def[k] === id) delete def[k];
    ctx.updateSettings({ defaultTemplates: def });
    ctx.renderLeft();
  }
  function setDefault(id) {
    const tpl = loadTemplates().find((x) => x.id === id);
    if (!tpl) return;
    const def = { ...(settings().defaultTemplates ?? {}) };
    def[tpl.kind] = def[tpl.kind] === id ? undefined : id;
    if (!def[tpl.kind]) delete def[tpl.kind];
    ctx.updateSettings({ defaultTemplates: def });
    ctx.renderLeft();
  }
  const defaultTemplate = (kind) => { const id = settings().defaultTemplates?.[kind]; return id ? loadTemplates().find((x) => x.id === id && x.kind === kind) ?? null : null; };
  async function exportTemplate(id) {
    const tpl = loadTemplates().find((x) => x.id === id);
    if (!tpl) return false;
    return ctx.saveExport(`${String(tpl.name).replace(/[\\/:*?"<>|]+/g, '_')}.mymechtpl`, 'mymechtpl', JSON.stringify({ format: 'mymechanics-template', ...tpl }, null, 1), 'application/json');
  }
  /** Adds a template from a .mymechtpl file (or its text, in tests). */
  async function importTemplate(text = null) {
    let src = text;
    if (src == null) {
      const [file] = await ctx.pickFile('.mymechtpl,application/json');
      if (!file) return null;
      src = await file.text();
    }
    try {
      const raw = JSON.parse(src);
      if (raw.format !== 'mymechanics-template' || !['part', 'assembly', 'drawing'].includes(raw.kind) || !(raw.text || raw.drawing)) throw new Error('not a template');
      const { format, ...tpl } = raw;
      tpl.id = `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      storeTemplates([...loadTemplates(), tpl]);
      ctx.notify('success', t('custom.tplSaved', { name: tpl.name }));
      ctx.renderLeft();
      return tpl;
    } catch (error) { ctx.notify('error', t('custom.tplBadFile', { error: error.message })); return null; }
  }

  // ─────────── the page

  function start(section = 'keys') {
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'customize', section, query: '', capture: null, limit: 40 };
    state.leftTab = 'pm';
    ctx.renderAll();
  }

  const row = (inner, cls = '') => `<div class="cfg-row ${cls}">${inner}</div>`;
  const kbd = (combo, del = true) => `<span class="custom-key"><kbd>${escapeHtml(combo)}</kbd>${del ? `<button type="button" class="icon-button" data-pm="ck.unbind:${escapeHtml(combo)}" title="${escapeHtml(t('custom.keyRemove'))}">${icon('close', 'icon tiny')}</button>` : ''}</span>`;
  const search = (e) => `<label class="pm-field" title="${escapeHtml(t('custom.search'))}">${icon('search')}<span class="pm-label">${escapeHtml(t('custom.search'))}</span><input type="text" class="pm-text" data-pm-field="ck.query" value="${escapeHtml(e.query ?? '')}" spellcheck="false"/></label>`;
  const more = (shown, total) => (total > shown ? `<p class="pm-note">${escapeHtml(t('custom.more', { shown, total }))}</p><div class="pm-row-buttons">${ctx.pm.pmButton('ck.more', 'chevronDown', t('custom.showMore'))}</div>` : '');

  function keysPage(e) {
    const { byCommand } = bindings();
    const { list, total } = matches(e);
    const rows = list.map((c) => row(`${icon(c.icon, 'icon tiny')}<span class="grow">${escapeHtml(c.label)}</span>${(byCommand.get(c.id) ?? []).map((k) => kbd(k)).join('')}${e.capture === c.id ? `<span class="custom-capture">${escapeHtml(t('custom.pressKey'))}</span>` : `<button type="button" class="icon-button" data-pm="ck.record:${escapeHtml(c.id)}" title="${escapeHtml(t('custom.keyAdd'))}">${icon('keyboard', 'icon tiny')}</button>`}`, e.capture === c.id ? 'selected' : '')).join('');
    const changed = Object.keys(settings().keyBindings ?? {}).length;
    return [
      ctx.pm.pmGroup('keyboard', t('custom.keys'), `${search(e)}<div class="custom-list">${rows}</div>${more(list.length, total)}<p class="pm-note">${escapeHtml(t('custom.keysHelp'))}</p>`),
      ctx.pm.pmGroup('undo', t('custom.reset'), `<p class="pm-note">${escapeHtml(t('custom.keysChanged', { count: changed }))}</p><div class="pm-row-buttons">${ctx.pm.pmButton('ck.resetKeys', 'undo', t('custom.resetKeys'))}</div>`),
    ].join('');
  }

  function toolbarPage(e) {
    const { list, total } = matches(e);
    const tab = userTab(); const extra = toolbarExtra();
    const listRows = (key, ids) => (ids.length ? ids.map((id, i) => row(`${icon(ctx.commands[id].icon, 'icon tiny')}<span class="grow">${escapeHtml(labelOf(id))}</span><button type="button" class="icon-button" data-pm="ct.up:${key}:${escapeHtml(id)}" title="${escapeHtml(t('custom.up'))}" ${i ? '' : 'disabled'}>${icon('chevronUp', 'icon tiny')}</button><button type="button" class="icon-button" data-pm="ct.down:${key}:${escapeHtml(id)}" title="${escapeHtml(t('custom.down'))}" ${i < ids.length - 1 ? '' : 'disabled'}>${icon('chevronDown', 'icon tiny')}</button><button type="button" class="icon-button" data-pm="ct.del:${key}:${escapeHtml(id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button>`)).join('') : `<p class="pm-note">${escapeHtml(t('custom.empty'))}</p>`);
    const rows = list.map((c) => row(`${icon(c.icon, 'icon tiny')}<span class="grow">${escapeHtml(c.label)}</span><button type="button" class="icon-button" data-pm="ct.add:userTab:${escapeHtml(c.id)}" title="${escapeHtml(t('custom.addTab'))}" ${tab.includes(c.id) ? 'disabled' : ''}>${icon('tabAdd', 'icon tiny')}</button><button type="button" class="icon-button" data-pm="ct.add:toolbarExtra:${escapeHtml(c.id)}" title="${escapeHtml(t('custom.addToolbar'))}" ${extra.includes(c.id) ? 'disabled' : ''}>${icon('plus', 'icon tiny')}</button>`)).join('');
    const hidden = settings().hiddenTabs ?? [];
    const tabs = ctx.allTabs().map((id) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="ct.tab:${escapeHtml(id)}" ${hidden.includes(id) ? '' : 'checked'}/><span>${escapeHtml(t(`cm.${id}`))}</span></label>`).join('');
    return [
      ctx.pm.pmGroup('tabAdd', t('custom.userTab'), listRows('userTab', tab)),
      ctx.pm.pmGroup('plus', t('custom.toolbarExtra'), listRows('toolbarExtra', extra)),
      ctx.pm.pmGroup('search', t('custom.addCommands'), `${search(e)}<div class="custom-list">${rows}</div>${more(list.length, total)}`),
      ctx.pm.pmGroup('eye', t('custom.tabsShown'), `<div class="custom-tabs">${tabs}</div>`),
    ].join('');
  }

  function gesturesPage() {
    const map = gestureMap();
    const opts = [['', `— ${t('custom.none')} —`], ...commandList().map((c) => [c.id, c.label])];
    const sel = (i) => `<select class="pm-select" data-pm-select="cg.dir:${i}" aria-label="${escapeHtml(t(`custom.dir.${GESTURE_DIRS[i]}`))}">${opts.map(([v, l]) => `<option value="${escapeHtml(v)}" ${v === (map[i] ?? '') ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>`;
    const rows = GESTURE_DIRS.map((d, i) => `<label class="pm-field" title="${escapeHtml(t(`custom.dir.${d}`))}">${icon(`gesture${d}`)}<span class="pm-label">${escapeHtml(t(`custom.dir.${d}`))}</span>${sel(i)}</label>`).join('');
    return [
      ctx.pm.pmGroup('gesture', t('custom.gestures'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="cg.on" ${gesturesOn() ? 'checked' : ''}/>${icon('gesture', 'icon tiny')}<span>${escapeHtml(t('custom.gesturesOn'))}</span></label><p class="pm-note">${escapeHtml(t('custom.gesturesHelp'))}</p>`),
      ctx.pm.pmGroup('gestureN', t('custom.gestureMap'), `${rows}<div class="pm-row-buttons">${ctx.pm.pmButton('cg.reset', 'undo', t('custom.resetGestures'))}</div>`),
    ].join('');
  }

  function templatesPage(e) {
    const list = loadTemplates();
    const def = settings().defaultTemplates ?? {};
    const kindOf = ctx.currentKind();
    const rows = list.length ? list.map((x) => row(`${icon(x.kind === 'drawing' ? 'drawing' : x.kind === 'assembly' ? 'assembly' : 'part', 'icon tiny')}<span class="grow" title="${escapeHtml(`${t(`custom.kind.${x.kind}`)} · ${String(x.created ?? '').slice(0, 10)}`)}">${escapeHtml(x.name)}${def[x.kind] === x.id ? ` <b>(${escapeHtml(t('custom.default'))})</b>` : ''}</span><button type="button" class="icon-button" data-pm="tp.new:${escapeHtml(x.id)}" title="${escapeHtml(t('custom.tplNew'))}">${icon('fileNew', 'icon tiny')}</button><button type="button" class="icon-button ${def[x.kind] === x.id ? 'active' : ''}" data-pm="tp.default:${escapeHtml(x.id)}" title="${escapeHtml(t('custom.tplDefault'))}">${icon('star', 'icon tiny')}</button><button type="button" class="icon-button" data-pm="tp.export:${escapeHtml(x.id)}" title="${escapeHtml(t('custom.tplExport'))}">${icon('export', 'icon tiny')}</button><button type="button" class="icon-button" data-pm="tp.del:${escapeHtml(x.id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button>`)).join('') : `<p class="pm-note">${escapeHtml(t('custom.tplNone'))}</p>`;
    const name = `<label class="pm-field" title="${escapeHtml(t('custom.tplName'))}">${icon('edit')}<span class="pm-label">${escapeHtml(t('custom.tplName'))}</span><input type="text" class="pm-text" data-pm-field="tp.name" value="${escapeHtml(e.tplName ?? '')}" spellcheck="false"/></label>`;
    return [
      ctx.pm.pmGroup('template', t('custom.templates'), `<div class="custom-list">${rows}</div><div class="pm-row-buttons">${ctx.pm.pmButton('tp.import', 'folderOpen', t('custom.tplImport'))}</div>`),
      ctx.pm.pmGroup('save', t('custom.tplSaveGroup'), `${name}<div class="pm-row-buttons">${ctx.pm.pmButton('tp.save:model', 'part', t('custom.tplSaveModel'), kindOf === 'part' || kindOf === 'assembly' ? '' : 'disabled')}${ctx.pm.pmButton('tp.save:drawing', 'drawing', t('custom.tplSaveDrawing'), kindOf === 'drawing' ? '' : 'disabled')}</div><p class="pm-note">${escapeHtml(t('custom.tplHelp'))}</p>`),
    ].join('');
  }

  function pm(e) {
    const { pmHead, pmSeg } = ctx.pm;
    const body = e.section === 'toolbar' ? toolbarPage(e) : e.section === 'gestures' ? gesturesPage(e) : e.section === 'templates' ? templatesPage(e) : keysPage(e);
    return [
      pmHead('customize', t('cmd.customize'), t('custom.help')),
      `<div class="custom-sections">${pmSeg('ck.section', [['keys', t('custom.keys'), 'keyboard'], ['toolbar', t('custom.toolbar'), 'tabAdd'], ['gestures', t('custom.gestures'), 'gesture'], ['templates', t('custom.templates'), 'template']], e.section)}</div>`,
      body,
    ].join('');
  }

  function field(key, raw) {
    const e = editing();
    if (key === 'ck.query') { e.query = String(raw ?? ''); e.limit = 40; }
    if (key === 'tp.name') e.tplName = String(raw ?? '').trim();
    return ctx.renderLeft();
  }
  function set(key, value) {
    if (key === 'ck.section') { editing().section = value; editing().limit = 40; }
    return ctx.renderLeft();
  }
  function select(key, value) {
    if (!key.startsWith('cg.dir:')) return false;
    const i = Number(key.slice(7));
    const map = gestureMap(); map[i] = value || null;
    ctx.updateSettings({ gestures: { ...(settings().gestures ?? {}), map } });
    ctx.renderLeft();
    return true;
  }
  function toggle(key, on) {
    if (key === 'cg.on') ctx.updateSettings({ gestures: { ...(settings().gestures ?? {}), enabled: on, map: gestureMap() } });
    if (key.startsWith('ct.tab:')) {
      const id = key.slice(7);
      const hidden = new Set(settings().hiddenTabs ?? []);
      if (on) hidden.delete(id); else hidden.add(id);
      save({ hiddenTabs: [...hidden] });
    }
    return ctx.renderLeft();
  }
  const handles = (name) => /^(ck|ct|cg|tp)\./.test(name);
  function command(name, arg) {
    const e = editing();
    switch (name) {
      case 'ck.record': recordKey(arg); return undefined;
      case 'ck.unbind': unbind(arg); break;
      case 'ck.resetKeys': save({ keyBindings: {} }); break;
      case 'ck.more': e.limit = (e.limit ?? 40) + 80; break;
      case 'cg.reset': ctx.updateSettings({ gestures: { ...(settings().gestures ?? {}), map: [...DEFAULT_GESTURES] } }); break;
      case 'tp.save': return void addTemplate(e.tplName, arg === 'drawing' ? 'drawing' : ctx.currentKind());
      case 'tp.new': void newFrom(arg); return undefined;
      case 'tp.default': setDefault(arg); return undefined;
      case 'tp.export': void exportTemplate(arg); return undefined;
      case 'tp.del': deleteTemplate(arg); return undefined;
      case 'tp.import': void importTemplate(); return undefined;
      default: {
        // ct.add / ct.del / ct.up / ct.down : <list key> : <command>
        const m = /^ct\.(add|del|up|down)$/.exec(name);
        if (m) { const [key, ...rest] = String(arg).split(':'); listEdit(key, m[1], rest.join(':')); }
      }
    }
    return ctx.renderLeft();
  }
  function cancel(e) { if (e?.capture) window.removeEventListener('keydown', onCaptureKey, true); }
  const accept = () => { cancel(editing()); state.editing = null; state.leftTab = 'tree'; return ctx.renderAll(); };

  const commands = {
    customize: { icon: 'customize', label: 'cmd.customize', run: () => (owns(editing()) ? ctx.cancelEditing({ quiet: true }) : start('keys')), checked: () => owns(editing()), enabled: () => ctx.hasDoc() },
    templates: { icon: 'template', label: 'cmd.templates', run: () => start('templates'), enabled: () => ctx.hasDoc() },
  };
  const newFrom = (id) => { const tpl = loadTemplates().find((x) => x.id === id); return tpl ? ctx.newFromTemplate(tpl) : null; };
  const api = { newFrom, keyCommand, comboOf, assign, unbind, recordKey, onGesture, gestureLabels, gesturesOn, gestureMap, userTab, toolbarExtra, addTemplate, deleteTemplate, setDefault, defaultTemplate, exportTemplate, importTemplate, loadTemplates, start, bindings };
  return { owns, pm, pick: () => undefined, field, set, toggle, select, accept, cancel, subject: () => t('cmd.customize'), handles, command, commands, api };
}
