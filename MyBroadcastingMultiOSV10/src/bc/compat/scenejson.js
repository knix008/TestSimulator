// Scene collection JSON files of other broadcasting programs (the common scene-file layout) → our collection, and back.
// Sources, scenes, groups, items (position, rotation, scale, alignment, bounds, crop, blend, scale filter,
// visibility, lock), filters, audio (volume, mute, balance, sync, monitoring, tracks), transitions and the
// current scene carry over; settings keys are kept, colours are converted (those files keep 0xAABBGGRR).
import { FILTER_TYPES, SOURCE_TYPES, TRANSITION_TYPES } from '../catalog.js';
import { TRANSITION_IN, TRANSITION_OUT } from './wire.js';
import { createCollection, defaultAudio, defaultTransform, newId, normalizeCollection, TRACKS } from '../model.js';

const ALIGN_TO = { 0: 'center', 1: 'left', 2: 'right', 4: 'top', 5: 'top-left', 6: 'top-right', 8: 'bottom', 9: 'bottom-left', 10: 'bottom-right' };
const ALIGN_FROM = Object.fromEntries(Object.entries(ALIGN_TO).map(([k, v]) => [v, Number(k)]));
const BOUNDS = ['none', 'stretch', 'scale_inner', 'scale_outer', 'scale_to_width', 'scale_to_height', 'max_only'];
const MONITOR = ['off', 'monitorOnly', 'both'];

/** 0xAABBGGRR → '#rrggbb' (and the alpha 0…100). */
export function abgrColor(n, fallback = '#ffffff') {
  if (typeof n !== 'number') return { hex: fallback, alpha: 100 };
  const v = n >>> 0;
  const r = v & 255; const g = (v >> 8) & 255; const b = (v >> 16) & 255; const a = (v >>> 24) & 255;
  return { hex: `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`, alpha: Math.round((a / 255) * 100) };
}
export function toAbgrColor(hex, alpha = 100) {
  const n = parseInt(String(hex || '#000000').replace('#', '').slice(0, 6), 16) || 0;
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  return ((Math.round((alpha / 100) * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Source / filter kinds of those files that have another name here. */
const SOURCE_ALIASES = { text_ft2_source: 'text_gdiplus', text_ft2_source_v2: 'text_gdiplus', color_source: 'color_source_v3', color_source_v2: 'color_source_v3', xshm_input: 'monitor_capture', screen_capture: 'monitor_capture', display_capture: 'monitor_capture', pipewire_desktop_capture_source: 'monitor_capture', pipewire_window_capture_source: 'window_capture', xcomposite_input: 'window_capture', av_capture_input: 'dshow_input', av_capture_input_v2: 'dshow_input', v4l2_input: 'dshow_input', coreaudio_input_capture: 'wasapi_input_capture', pulse_input_capture: 'wasapi_input_capture', coreaudio_output_capture: 'wasapi_output_capture', pulse_output_capture: 'wasapi_output_capture', sck_audio_capture: 'wasapi_output_capture', macos_screen_capture: 'monitor_capture' };
const FILTER_ALIASES = { chroma_key_filter: 'chroma_key_filter_v2', color_filter: 'color_filter_v2', color_key_filter: 'color_key_filter_v2', mask_filter: 'mask_filter_v2', luma_key_filter: 'luma_key_filter_v2', sharpness_filter: 'sharpness_filter_v2', noise_suppress_filter: 'noise_suppress_filter_v2' };

function convertSettings(type, s = {}) {
  const out = { ...s };
  if (type === 'text_gdiplus') {
    if (typeof s.color === 'number') { const c = abgrColor(s.color); out.color = c.hex; }
    if (typeof s.color1 === 'number') { const c = abgrColor(s.color1); out.color = c.hex; } // FreeType
    if (typeof s.color2 === 'number' && s.color2 !== s.color1) { out.gradient = true; out.gradient_color = abgrColor(s.color2).hex; }
    if (typeof s.gradient_color === 'number') out.gradient_color = abgrColor(s.gradient_color).hex;
    if (typeof s.bk_color === 'number') out.bk_color = abgrColor(s.bk_color).hex;
    if (typeof s.outline_color === 'number') out.outline_color = abgrColor(s.outline_color).hex;
    if (s.font) { const f = s.font; const flags = f.flags ?? 0; out.font = { face: f.face ?? 'Arial', size: f.size ?? 72, bold: Boolean(flags & 1), italic: Boolean(flags & 2), underline: Boolean(flags & 4), strikeout: Boolean(flags & 8) }; }
    if (s.from_file) out.read_from_file = true;
    if (s.text_file) out.file = s.text_file;
    if (s.drop_shadow != null) out.drop_shadow = Boolean(s.drop_shadow);
  }
  if (type === 'color_source_v3' && typeof s.color === 'number') out.color = abgrColor(s.color).hex;
  if (type === 'slideshow' && Array.isArray(s.files)) out.files = s.files.map((f) => f.value ?? f);
  if (type === 'vlc_source' && Array.isArray(s.playlist)) out.playlist = s.playlist.map((f) => f.value ?? f);
  if (type === 'browser_source') { out.mode = s.is_local_file ? 'local' : 'url'; if (s.is_local_file && s.local_file) out.local_file = s.local_file; }
  for (const k of ['color_multiply', 'color_add', 'key_color', 'color']) if (typeof out[k] === 'number' && type !== 'text_gdiplus') out[k] = abgrColor(out[k]).hex;
  return out;
}

function convertFilter(f) {
  const type = FILTER_TYPES[f.versioned_id] ? f.versioned_id : FILTER_ALIASES[f.id] ?? f.id;
  if (!FILTER_TYPES[type]) return null;
  const settings = convertSettings(type, f.settings ?? {});
  if (type === 'compressor_filter' && f.settings?.sidechain_source) settings.sidechain_name = f.settings.sidechain_source;
  return { id: newId('f'), type, name: f.name ?? type, enabled: f.enabled !== false, settings };
}

/** A scene file (parsed JSON) → our collection (normalised). Unknown kinds are listed in `skipped`. */
const kindIn = (id) => TRANSITION_IN[id] ?? id;
const kindOut = (type) => TRANSITION_OUT[type] ?? type;

export function importSceneJson(json) {
  const c = createCollection(json.name ?? 'Imported');
  c.sources = {}; c.scenes = []; c.transitions = [];
  const byUuid = new Map();
  const byName = new Map();
  const skipped = [];
  const all = [...(json.sources ?? []), ...(json.groups ?? [])];
  for (const src of all) {
    const kind = src.versioned_id ?? src.id;
    if (kind === 'scene' || src.id === 'scene') {
      const scene = { id: newId('sc'), name: src.name, items: [], override: null, filters: (src.filters ?? []).map(convertFilter).filter(Boolean), raw: src };
      c.scenes.push(scene);
      byUuid.set(src.uuid ?? src.name, scene.id); byName.set(src.name, scene.id);
      continue;
    }
    if (kind === 'group' || src.id === 'group') {
      const id = newId('src');
      c.sources[id] = { id, type: 'group', name: src.name, settings: {}, filters: [], audio: defaultAudio(), hotkeys: {}, raw: src };
      byUuid.set(src.uuid ?? src.name, id); byName.set(src.name, id);
      continue;
    }
    const type = SOURCE_TYPES[kind] ? kind : SOURCE_ALIASES[kind] ?? SOURCE_ALIASES[src.id] ?? (SOURCE_TYPES[src.id] ? src.id : null);
    if (!type) { skipped.push(`${src.name} (${kind})`); continue; }
    const id = newId('src');
    const audio = SOURCE_TYPES[type].audio ? {
      ...defaultAudio(), volume: src.volume ?? 1, muted: Boolean(src.muted), balance: src.balance ?? 0.5, sync: Math.round((src.sync ?? 0) / 1e6),
      monitor: MONITOR[src.monitoring_type ?? 0] ?? 'off', tracks: Array.from({ length: TRACKS }, (_, i) => Boolean(((src.mixers ?? 0xff) >> i) & 1)),
      mono: Boolean((src.flags ?? 0) & 2),
    } : null;
    c.sources[id] = { id, type, name: src.name, settings: convertSettings(type, src.settings), filters: (src.filters ?? []).map(convertFilter).filter(Boolean), audio, hotkeys: {} };
    byUuid.set(src.uuid ?? src.name, id); byName.set(src.name, id);
  }
  const item = (it) => {
    const source = byUuid.get(it.source_uuid) ?? byName.get(it.name);
    if (!source) return null;
    const tr = defaultTransform();
    Object.assign(tr, {
      x: it.pos?.x ?? 0, y: it.pos?.y ?? 0, rot: it.rot ?? 0, sx: it.scale?.x ?? 1, sy: it.scale?.y ?? 1, align: ALIGN_TO[it.align ?? 5] ?? 'top-left',
      crop: { l: it.crop_left ?? 0, t: it.crop_top ?? 0, r: it.crop_right ?? 0, b: it.crop_bottom ?? 0 },
      bounds: { type: BOUNDS[it.bounds_type ?? 0] ?? 'none', w: it.bounds?.x ?? 0, h: it.bounds?.y ?? 0, align: ALIGN_TO[it.bounds_align ?? 0] ?? 'center', crop: Boolean(it.bounds_crop) },
    });
    const out = { id: newId('it'), source, visible: it.visible !== false, locked: Boolean(it.locked), transform: tr, blend: it.blend_type ?? 'normal', scaleFilter: it.scale_filter ?? 'disable', show: null, hide: null };
    if (it.show_transition?.id && TRANSITION_TYPES[kindIn(it.show_transition.id)]) out.show = { type: kindIn(it.show_transition.id), duration: it.show_transition.duration ?? 300, settings: it.show_transition.settings ?? {} };
    if (it.hide_transition?.id && TRANSITION_TYPES[kindIn(it.hide_transition.id)]) out.hide = { type: kindIn(it.hide_transition.id), duration: it.hide_transition.duration ?? 300, settings: it.hide_transition.settings ?? {} };
    return out;
  };
  for (const scene of c.scenes) {
    scene.items = (scene.raw.settings?.items ?? []).map((it) => {
      const made = item(it);
      if (made && c.sources[made.source]?.type === 'group') {
        const group = all.find((g) => (g.uuid ?? g.name) === it.source_uuid || g.name === it.name);
        made.children = (group?.settings?.items ?? []).map(item).filter(Boolean);
        made.collapsed = false;
      }
      return made;
    }).filter(Boolean);
    delete scene.raw;
  }
  for (const src of Object.values(c.sources)) {
    delete src.raw;
    for (const f of src.filters) if (f.settings.sidechain_name) { f.settings.sidechain_source = byName.get(f.settings.sidechain_name) ?? ''; delete f.settings.sidechain_name; }
  }
  for (const tr of json.transitions ?? []) if (TRANSITION_TYPES[kindIn(tr.id)]) c.transitions.push({ id: newId('tr'), type: kindIn(tr.id), name: tr.name, settings: tr.settings ?? {} });
  const order = (json.scene_order ?? []).map((s) => s.name);
  if (order.length) c.scenes.sort((a, b) => (order.indexOf(a.name) + 1 || 999) - (order.indexOf(b.name) + 1 || 999));
  c.current = byName.get(json.current_program_scene ?? json.current_scene) ?? c.scenes[0]?.id;
  c.preview = byName.get(json.current_scene) ?? c.current;
  c.duration = json.transition_duration ?? 300;
  const fixed = normalizeCollection(c);
  const current = fixed.transitions.find((x) => x.name === json.current_transition);
  if (current) fixed.transition = current.id;
  return { collection: fixed, skipped };
}

/** Our collection → the common scene-file layout (JSON object). */
export function exportSceneJson(c) {
  const uuid = new Map();
  const id = (x) => { if (!uuid.has(x)) uuid.set(x, `${newId('').padEnd(8, '0').slice(0, 8)}-0000-4000-8000-${String(uuid.size).padStart(12, '0')}`); return uuid.get(x); };
  const filters = (list) => (list ?? []).map((f) => ({ id: f.type.replace(/_v\d$/, ''), versioned_id: f.type, name: f.name, enabled: f.enabled, settings: f.settings }));
  const item = (it, index) => {
    const tr = it.transform;
    return {
      name: (c.sources[it.source] ?? c.scenes.find((s) => s.id === it.source))?.name, source_uuid: id(it.source), visible: it.visible, locked: it.locked, id: index + 1,
      rot: tr.rot, pos: { x: tr.x, y: tr.y }, scale: { x: tr.sx, y: tr.sy }, align: ALIGN_FROM[tr.align] ?? 5,
      bounds_type: Math.max(0, BOUNDS.indexOf(tr.bounds?.type)), bounds_align: ALIGN_FROM[tr.bounds?.align] ?? 0, bounds_crop: Boolean(tr.bounds?.crop), bounds: { x: tr.bounds?.w ?? 0, y: tr.bounds?.h ?? 0 },
      crop_left: tr.crop.l, crop_top: tr.crop.t, crop_right: tr.crop.r, crop_bottom: tr.crop.b,
      scale_filter: it.scaleFilter, blend_type: it.blend, blend_method: 'default',
      show_transition: it.show ? { id: it.show.type, duration: it.show.duration } : { duration: 0 }, hide_transition: it.hide ? { id: it.hide.type, duration: it.hide.duration } : { duration: 0 },
    };
  };
  const sources = [];
  const groups = [];
  for (const s of Object.values(c.sources)) {
    const settings = { ...s.settings };
    if (s.type === 'color_source_v3') settings.color = toAbgrColor(settings.color);
    if (s.type === 'text_gdiplus') {
      const f = settings.font ?? {};
      settings.font = { face: f.face, size: f.size, flags: (f.bold ? 1 : 0) | (f.italic ? 2 : 0) | (f.underline ? 4 : 0) | (f.strikeout ? 8 : 0), style: '' };
      for (const k of ['color', 'gradient_color', 'bk_color', 'outline_color']) if (typeof settings[k] === 'string') settings[k] = toAbgrColor(settings[k]);
    }
    if (s.type === 'group') {
      const owner = c.scenes.flatMap((sc) => sc.items).find((it) => it.source === s.id);
      groups.push({ id: 'group', versioned_id: 'group', name: s.name, uuid: id(s.id), settings: { items: (owner?.children ?? []).map(item), custom_size: false }, filters: [] });
      continue;
    }
    const a = s.audio;
    sources.push({
      id: s.type.replace(/_v\d$/, ''), versioned_id: s.type, name: s.name, uuid: id(s.id), settings, filters: filters(s.filters),
      enabled: true, flags: a?.mono ? 2 : 0, hotkeys: {}, mixers: a ? a.tracks.reduce((m, on, i) => m | (on ? 1 << i : 0), 0) : 0,
      monitoring_type: a ? Math.max(0, MONITOR.indexOf(a.monitor)) : 0, muted: Boolean(a?.muted), volume: a?.volume ?? 1, balance: a?.balance ?? 0.5, sync: (a?.sync ?? 0) * 1e6,
    });
  }
  for (const sc of c.scenes) sources.push({ id: 'scene', versioned_id: 'scene', name: sc.name, uuid: id(sc.id), settings: { items: sc.items.map(item), id_counter: sc.items.length, custom_size: false }, filters: filters(sc.filters), mixers: 0, hotkeys: {} });
  const name = (sceneId) => c.scenes.find((s) => s.id === sceneId)?.name;
  return {
    name: c.name, current_scene: name(c.preview), current_program_scene: name(c.current), scene_order: c.scenes.map((s) => ({ name: s.name })),
    sources, groups, transitions: c.transitions.map((x) => ({ name: x.name, id: kindOut(x.type), settings: x.settings })),
    current_transition: c.transitions.find((x) => x.id === c.transition)?.name, transition_duration: c.duration,
    quick_transitions: c.quick.map((q, i) => ({ name: c.transitions.find((x) => x.id === q.transition)?.name, duration: q.duration, id: i + 1, fade_to_black: false, hotkeys: [] })),
    modules: {}, preview_locked: false, scaling_enabled: false,
  };
}

/** Is this parsed JSON a scene file in the common layout (rather than one of ours)? */
export const isSceneJson = (json) => Array.isArray(json?.sources) && Array.isArray(json?.scene_order ?? json?.sources) && !json?.version;
