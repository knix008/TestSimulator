// The catalogue of everything a scene collection can hold: input (source) types, filters and
// transitions. Ids follow the common scene-file layout (image_source, chroma_key_filter_v2, fade_transition …) so
// those files import one to one (bc/compat/scenejson.js). Each type lists its properties as fields:
// the right panel draws its form from them (ui/propform.js), defaults come from them, and the tests walk
// them (every field has a label in both languages, every type has a runtime and an icon).
//
// field = { key, type, default, min, max, step, unit, options, when(settings), accept, label }
//   type: number | slider | bool | text | textarea | color | select | file | files | font | device | path | button | info
//   label: an i18n key (default `prop.<key>`); options: values with labels `opt.<key>.<value>` unless given as [value, labelKey].
// Pure data: no DOM, runs in node (tests).

const num = (key, def, min, max, step = 1, unit = '', extra = {}) => ({ key, type: 'number', default: def, min, max, step, unit, ...extra });
const slider = (key, def, min, max, step = 1, unit = '', extra = {}) => ({ key, type: 'slider', default: def, min, max, step, unit, ...extra });
const bool = (key, def, extra = {}) => ({ key, type: 'bool', default: def, ...extra });
const text = (key, def = '', extra = {}) => ({ key, type: 'text', default: def, ...extra });
const select = (key, def, options, extra = {}) => ({ key, type: 'select', default: def, options, ...extra });
const color = (key, def, extra = {}) => ({ key, type: 'color', default: def, ...extra });
const file = (key, accept, extra = {}) => ({ key, type: 'file', default: '', accept, ...extra });

export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.gif,.bmp,.webp,.avif,.svg,.ico,.tga';
export const MEDIA_ACCEPT = '.mp4,.m4v,.mkv,.webm,.mov,.avi,.flv,.ts,.mts,.m2ts,.mpg,.mpeg,.ogv,.mp3,.aac,.m4a,.wav,.ogg,.oga,.opus,.flac,.wma,.wmv,.gif';
export const LUT_ACCEPT = '.cube,.png';

/** Where a type's frames come from at run time (engine/runtime.js maps each to a class). */
export const SOURCE_TYPES = {
  // ── capture
  monitor_capture: {
    icon: 'srcDisplay', group: 'capture', video: true, audio: true, live: true,
    props: [
      select('method', 'browser', ['browser']),
      bool('capture_cursor', true),
      bool('capture_audio', false),
      { key: 'pick', type: 'button', action: 'pick-capture' },
    ],
  },
  window_capture: {
    icon: 'srcWindow', group: 'capture', video: true, audio: true, live: true,
    props: [
      text('window', ''),
      bool('capture_cursor', true),
      bool('client_area', true),
      bool('capture_audio', false),
      { key: 'pick', type: 'button', action: 'pick-capture' },
    ],
  },
  game_capture: {
    icon: 'srcGame', group: 'capture', video: true, audio: true, live: true,
    props: [
      select('capture_mode', 'any_fullscreen', ['any_fullscreen', 'window', 'hotkey']),
      text('window', '', { when: (s) => s.capture_mode === 'window' }),
      bool('capture_cursor', true),
      bool('allow_transparency', false),
      bool('capture_audio', false),
      { key: 'pick', type: 'button', action: 'pick-capture' },
    ],
  },
  dshow_input: {
    icon: 'srcCamera', group: 'capture', video: true, audio: true, live: true,
    props: [
      { key: 'video_device_id', type: 'device', kind: 'videoinput', default: '' },
      select('res_type', 'device', ['device', 'custom']),
      select('resolution', '1280x720', ['640x360', '640x480', '1280x720', '1920x1080', '2560x1440', '3840x2160'], { when: (s) => s.res_type === 'custom' }),
      select('frame_interval', 'match', ['match', '15', '24', '25', '30', '50', '60'], { when: (s) => s.res_type === 'custom' }),
      select('facing', 'any', ['any', 'user', 'environment']),
      bool('deactivate_when_not_showing', false),
      select('audio_output_mode', 'capture', ['capture', 'none']),
      { key: 'audio_device_id', type: 'device', kind: 'audioinput', default: '', when: (s) => s.audio_output_mode === 'capture' },
      bool('flip_vertically', false),
    ],
  },
  wasapi_input_capture: {
    icon: 'srcMic', group: 'audio', video: false, audio: true, live: true,
    props: [
      { key: 'device_id', type: 'device', kind: 'audioinput', default: 'default' },
      bool('echo_cancellation', false),
      bool('noise_suppression', false),
      bool('auto_gain', false),
    ],
  },
  wasapi_output_capture: {
    icon: 'srcSpeaker', group: 'audio', video: false, audio: true, live: true,
    props: [
      { key: 'device_id', type: 'device', kind: 'audiooutput', default: 'default' },
      { key: 'pick', type: 'button', action: 'pick-capture' },
    ],
  },
  wasapi_process_output_capture: {
    icon: 'srcAppAudio', group: 'audio', video: false, audio: true, live: true,
    props: [
      text('window', ''),
      { key: 'pick', type: 'button', action: 'pick-capture' },
    ],
  },
  // ── media
  image_source: {
    icon: 'srcImage', group: 'media', video: true, audio: false,
    props: [file('file', IMAGE_ACCEPT), bool('unload', false), bool('linear_alpha', false)],
  },
  slideshow: {
    icon: 'srcSlides', group: 'media', video: true, audio: false,
    props: [
      select('playback_behavior', 'always_play', ['always_play', 'stop_restart', 'pause_unpause']),
      select('slide_mode', 'mode_auto', ['mode_auto', 'mode_manual']),
      select('transition', 'fade', ['cut', 'fade', 'swipe', 'slide']),
      num('slide_time', 8000, 50, 3600000, 50, 'ms'),
      num('transition_speed', 700, 0, 3600000, 50, 'ms'),
      bool('loop', true),
      bool('hide', false),
      bool('randomize', false),
      select('use_custom_size', 'auto', ['auto', '1920x1080', '1280x720', '1080x1080', '1080x1920']),
      { key: 'files', type: 'files', accept: IMAGE_ACCEPT, default: [] },
    ],
  },
  ffmpeg_source: {
    icon: 'srcMedia', group: 'media', video: true, audio: true, media: true,
    props: [
      bool('is_local_file', true),
      file('local_file', MEDIA_ACCEPT, { when: (s) => s.is_local_file !== false }),
      text('input', '', { when: (s) => s.is_local_file === false }),
      bool('looping', false),
      bool('restart_on_activate', true),
      bool('clear_on_media_end', true),
      bool('close_when_inactive', false),
      slider('speed_percent', 100, 1, 200, 1, '%'),
      bool('hw_decode', true),
      num('reconnect_delay_sec', 10, 1, 60, 1, 's', { when: (s) => s.is_local_file === false }),
    ],
  },
  vlc_source: {
    icon: 'srcPlaylist', group: 'media', video: true, audio: true, media: true,
    props: [
      bool('loop', true),
      bool('shuffle', false),
      select('playback_behavior', 'stop_restart', ['always_play', 'stop_restart', 'pause_unpause']),
      { key: 'playlist', type: 'files', accept: MEDIA_ACCEPT, default: [] },
    ],
  },
  browser_source: {
    icon: 'srcBrowser', group: 'media', video: true, audio: true,
    props: [
      select('mode', 'html', ['html', 'local', 'url']),
      text('url', 'https://', { when: (s) => s.mode === 'url' }),
      file('local_file', '.html,.htm,.svg', { when: (s) => s.mode === 'local' }),
      { key: 'html', type: 'textarea', default: '<div class="box">MyBroadcasting</div>', when: (s) => s.mode === 'html' },
      num('width', 800, 1, 8192, 1, 'px'),
      num('height', 600, 1, 8192, 1, 'px'),
      bool('fps_custom', false),
      num('fps', 30, 1, 60, 1, 'fps', { when: (s) => s.fps_custom }),
      { key: 'css', type: 'textarea', default: 'body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }\n.box { font: 700 64px sans-serif; color: #fff; padding: 24px; }' },
      bool('shutdown', false),
      bool('restart_when_active', false),
      { key: 'refresh', type: 'button', action: 'refresh-browser' },
    ],
  },
  // ── text, colour
  text_gdiplus: {
    icon: 'srcText', group: 'basic', video: true, audio: false,
    props: [
      select('text_mode', 'static', ['static', 'clock', 'date', 'countdown', 'stopwatch']),
      { key: 'text', type: 'textarea', default: 'MyBroadcasting', when: (s) => s.text_mode === 'static' && !s.read_from_file },
      text('clock_format', 'HH:mm:ss', { when: (s) => s.text_mode === 'clock' || s.text_mode === 'date' }),
      num('countdown_seconds', 300, 1, 86400, 1, 's', { when: (s) => s.text_mode === 'countdown' }),
      text('countdown_end_text', '', { when: (s) => s.text_mode === 'countdown' }),
      bool('read_from_file', false, { when: (s) => s.text_mode === 'static' }),
      file('file', '.txt,.log,.md,.csv', { when: (s) => s.read_from_file && s.text_mode === 'static' }),
      { key: 'font', type: 'font', default: { face: 'Arial', size: 72, bold: false, italic: false, underline: false, strikeout: false } },
      color('color', '#ffffff'),
      slider('opacity', 100, 0, 100, 1, '%'),
      bool('gradient', false),
      color('gradient_color', '#5aa9ff', { when: (s) => s.gradient }),
      slider('gradient_opacity', 100, 0, 100, 1, '%', { when: (s) => s.gradient }),
      slider('gradient_dir', 90, 0, 360, 1, '°', { when: (s) => s.gradient }),
      color('bk_color', '#000000'),
      slider('bk_opacity', 0, 0, 100, 1, '%'),
      select('align', 'left', ['left', 'center', 'right']),
      select('valign', 'top', ['top', 'center', 'bottom']),
      bool('vertical', false),
      bool('outline', false),
      num('outline_size', 2, 1, 20, 1, 'px', { when: (s) => s.outline }),
      color('outline_color', '#000000', { when: (s) => s.outline }),
      slider('outline_opacity', 100, 0, 100, 1, '%', { when: (s) => s.outline }),
      bool('drop_shadow', false),
      num('shadow_offset', 4, 1, 40, 1, 'px', { when: (s) => s.drop_shadow }),
      color('shadow_color', '#000000', { when: (s) => s.drop_shadow }),
      bool('chatlog', false),
      num('chatlog_lines', 6, 1, 1000, 1, '', { when: (s) => s.chatlog }),
      bool('extents', false),
      num('extents_cx', 600, 1, 8192, 1, 'px', { when: (s) => s.extents }),
      num('extents_cy', 200, 1, 8192, 1, 'px', { when: (s) => s.extents }),
      bool('extents_wrap', true, { when: (s) => s.extents }),
      bool('antialiasing', true),
    ],
  },
  color_source_v3: {
    icon: 'srcColor', group: 'basic', video: true, audio: false,
    props: [color('color', '#3b6ff5'), num('width', 1920, 1, 16384, 1, 'px'), num('height', 1080, 1, 16384, 1, 'px')],
  },
  scene: { icon: 'srcScene', group: 'basic', video: true, audio: true, props: [] },
  group: { icon: 'srcGroup', group: 'basic', video: true, audio: true, props: [] },
};

/** The order of the "Add source" menu (grouped by kind). */
export const SOURCE_MENU = [
  'monitor_capture', 'window_capture', 'game_capture', 'dshow_input', '-',
  'wasapi_input_capture', 'wasapi_output_capture', 'wasapi_process_output_capture', '-',
  'image_source', 'slideshow', 'ffmpeg_source', 'vlc_source', 'browser_source', '-',
  'text_gdiplus', 'color_source_v3', 'scene', 'group',
];

// ───────────────────────── filters

const KEY_COLORS = ['green', 'blue', 'magenta', 'custom'];
export const FILTER_TYPES = {
  // video / effect filters (shader passes: engine/shaders.js)
  clut_filter: { kind: 'video', icon: 'fltLut', props: [file('image_path', LUT_ACCEPT), slider('clut_amount', 1, 0, 1, 0.01), bool('passthrough_alpha', true)] },
  chroma_key_filter_v2: {
    kind: 'video', icon: 'fltChroma',
    props: [select('key_color_type', 'green', KEY_COLORS), color('key_color', '#00ff00', { when: (s) => s.key_color_type === 'custom' }),
      slider('similarity', 400, 1, 1000), slider('smoothness', 80, 1, 1000), slider('spill', 100, 1, 1000),
      slider('opacity', 1, 0, 1, 0.01), slider('contrast', 0, -4, 4, 0.01), slider('brightness', 0, -1, 1, 0.01), slider('gamma', 0, -1, 1, 0.01)],
  },
  color_filter_v2: {
    kind: 'video', icon: 'fltColor',
    props: [slider('gamma', 0, -3, 3, 0.01), slider('contrast', 0, -4, 4, 0.01), slider('brightness', 0, -1, 1, 0.01), slider('saturation', 0, -1, 5, 0.01),
      slider('hue_shift', 0, -180, 180, 0.1, '°'), slider('opacity', 1, 0, 1, 0.01), color('color_multiply', '#ffffff'), color('color_add', '#000000')],
  },
  color_key_filter_v2: {
    kind: 'video', icon: 'fltColorKey',
    props: [select('key_color_type', 'green', ['green', 'blue', 'red', 'magenta', 'custom']), color('key_color', '#00ff00', { when: (s) => s.key_color_type === 'custom' }),
      slider('similarity', 80, 1, 1000), slider('smoothness', 50, 1, 1000), slider('opacity', 1, 0, 1, 0.01), slider('contrast', 0, -4, 4, 0.01), slider('brightness', 0, -1, 1, 0.01), slider('gamma', 0, -1, 1, 0.01)],
  },
  crop_filter: {
    kind: 'video', icon: 'fltCrop',
    props: [bool('relative', true), num('left', 0, -8192, 8192, 1, 'px'), num('top', 0, -8192, 8192, 1, 'px'), num('right', 0, -8192, 8192, 1, 'px', { when: (s) => s.relative }), num('bottom', 0, -8192, 8192, 1, 'px', { when: (s) => s.relative }),
      num('cx', 0, 0, 16384, 1, 'px', { when: (s) => !s.relative }), num('cy', 0, 0, 16384, 1, 'px', { when: (s) => !s.relative })],
  },
  mask_filter_v2: {
    kind: 'video', icon: 'fltMask',
    props: [select('type', 'mask_alpha', ['mask_alpha', 'mask_color', 'blend_mul', 'blend_add', 'blend_sub']), file('image_path', IMAGE_ACCEPT), color('color', '#ffffff'), slider('opacity', 1, 0, 1, 0.01), bool('stretch', false)],
  },
  luma_key_filter_v2: {
    kind: 'video', icon: 'fltLuma',
    props: [slider('luma_max', 1, 0, 1, 0.001), slider('luma_max_smooth', 0, 0, 1, 0.001), slider('luma_min', 0, 0, 1, 0.001), slider('luma_min_smooth', 0, 0, 1, 0.001)],
  },
  gpu_delay: { kind: 'video', icon: 'fltDelay', props: [num('delay_ms', 0, 0, 500, 1, 'ms')] },
  async_delay_filter: { kind: 'video', icon: 'fltDelay', props: [num('delay_ms', 0, 0, 20000, 1, 'ms')] },
  scale_filter: {
    kind: 'video', icon: 'fltScale',
    props: [select('sampling', 'bicubic', ['disable', 'point', 'bilinear', 'bicubic', 'lanczos', 'area']), select('resolution', 'none', ['none', 'base', '1920x1080', '1280x720', '854x480', '640x360', '16:9', '4:3', '1:1']), bool('undistort', false)],
  },
  scroll_filter: {
    kind: 'video', icon: 'fltScroll',
    props: [slider('speed_x', 0, -500, 500, 1, 'px/s'), slider('speed_y', 0, -500, 500, 1, 'px/s'), bool('limit_cx', false), num('cx', 100, 1, 8192, 1, 'px', { when: (s) => s.limit_cx }), bool('limit_cy', false), num('cy', 100, 1, 8192, 1, 'px', { when: (s) => s.limit_cy }), bool('loop', true)],
  },
  sharpness_filter_v2: { kind: 'video', icon: 'fltSharpen', props: [slider('sharpness', 0.08, 0, 1, 0.01)] },
  hdr_tonemap_filter: { kind: 'video', icon: 'fltTonemap', props: [select('transform', 'reinhard', ['reinhard', 'maxrgb']), slider('exposure', 1, 0.1, 4, 0.05)] },
  blur_filter: { kind: 'video', icon: 'fltBlur', props: [select('blur_type', 'gaussian', ['gaussian', 'box', 'pixelate']), slider('size', 8, 1, 64, 1, 'px')] },
  // audio filters (Web Audio nodes: engine/audiofilters.js)
  gain_filter: { kind: 'audio', icon: 'fltGain', props: [slider('db', 0, -30, 30, 0.1, 'dB')] },
  noise_gate_filter: { kind: 'audio', icon: 'fltGate', props: [slider('close_threshold', -32, -96, 0, 1, 'dB'), slider('open_threshold', -26, -96, 0, 1, 'dB'), num('attack_time', 25, 0, 10000, 1, 'ms'), num('hold_time', 200, 0, 10000, 1, 'ms'), num('release_time', 150, 0, 10000, 1, 'ms')] },
  noise_suppress_filter_v2: { kind: 'audio', icon: 'fltNoise', props: [select('method', 'spectral', ['spectral', 'speex']), slider('suppress_level', -30, -60, 0, 1, 'dB')] },
  compressor_filter: { kind: 'audio', icon: 'fltCompressor', props: [slider('ratio', 10, 1, 32, 0.5, ':1'), slider('threshold', -18, -60, 0, 1, 'dB'), num('attack_time', 6, 1, 500, 1, 'ms'), num('release_time', 60, 1, 1000, 1, 'ms'), slider('output_gain', 0, -32, 32, 0.1, 'dB'), { key: 'sidechain_source', type: 'source', audio: true, default: '' }] },
  limiter_filter: { kind: 'audio', icon: 'fltLimiter', props: [slider('threshold', -6, -60, 0, 0.1, 'dB'), num('release_time', 60, 1, 1000, 1, 'ms')] },
  expander_filter: { kind: 'audio', icon: 'fltExpander', props: [select('presets', 'expander', ['expander', 'gate']), slider('ratio', 2, 1, 20, 0.1, ':1'), slider('threshold', -40, -60, 0, 1, 'dB'), num('attack_time', 10, 1, 100, 1, 'ms'), num('release_time', 50, 1, 1000, 1, 'ms'), slider('output_gain', 0, -32, 32, 0.1, 'dB'), select('detector', 'RMS', ['RMS', 'peak'])] },
  upward_compressor_filter: { kind: 'audio', icon: 'fltUpward', props: [slider('ratio', 0.5, 0, 1, 0.01, ':1'), slider('threshold', -20, -60, 0, 1, 'dB'), num('attack_time', 10, 1, 100, 1, 'ms'), num('release_time', 50, 1, 1000, 1, 'ms'), slider('output_gain', 0, -32, 32, 0.1, 'dB'), num('knee_width', 10, 0, 20, 1, 'dB')] },
  basic_eq_filter: { kind: 'audio', icon: 'fltEq', props: [slider('low', 0, -20, 20, 0.1, 'dB'), slider('mid', 0, -20, 20, 0.1, 'dB'), slider('high', 0, -20, 20, 0.1, 'dB')] },
  invert_polarity_filter: { kind: 'audio', icon: 'fltInvert', props: [] },
  vst_filter: { kind: 'audio', icon: 'fltVst', unsupported: 'vst', props: [text('plugin_path', '')] },
};

/** Filters a source can take: video ones need a picture, audio ones sound. */
export function filtersFor(sourceType) {
  const t = SOURCE_TYPES[sourceType];
  return Object.keys(FILTER_TYPES).filter((id) => {
    const kind = FILTER_TYPES[id].kind;
    return kind === 'audio' ? Boolean(t?.audio) : Boolean(t?.video);
  });
}

// ───────────────────────── transitions

const DIRS = ['left', 'right', 'up', 'down'];
export const LUMA_IMAGES = ['linear-h', 'linear-v', 'linear-tl', 'linear-tr', 'radial', 'clock', 'diamond', 'box', 'barndoor-h', 'barndoor-v', 'blinds-h', 'blinds-v', 'checker', 'spiral', 'circles', 'noise'];
export const TRANSITION_TYPES = {
  cut_transition: { icon: 'trCut', fixed: true, props: [] },
  fade_transition: { icon: 'trFade', props: [] },
  swipe_transition: { icon: 'trSwipe', props: [select('direction', 'left', DIRS), bool('swipe_in', false)] },
  slide_transition: { icon: 'trSlide', props: [select('direction', 'left', DIRS)] },
  stinger_transition: {
    icon: 'trStinger',
    props: [file('path', MEDIA_ACCEPT), select('tp_type', 'time', ['time', 'frame']), num('transition_point', 500, 0, 600000, 1, 'ms'),
      select('audio_fade_style', 'fade_out_fade_in', ['fade_out_fade_in', 'crossfade']), bool('track_matte_enabled', false),
      select('track_matte_layout', 'horizontal', ['horizontal', 'vertical'], { when: (s) => s.track_matte_enabled })],
  },
  fade_to_color_transition: { icon: 'trFadeColor', props: [color('color', '#000000'), slider('switch_point', 50, 0, 100, 1, '%')] },
  wipe_transition: { icon: 'trWipe', props: [select('luma_image', 'linear-h', LUMA_IMAGES), slider('luma_softness', 0.03, 0, 1, 0.01), bool('luma_invert', false)] },
};

// ───────────────────────── scene items

export const BLEND_MODES = ['normal', 'additive', 'subtract', 'screen', 'multiply', 'lighten', 'darken'];
export const SCALE_FILTERS = ['disable', 'point', 'bilinear', 'bicubic', 'lanczos', 'area'];
export const BOUNDS_TYPES = ['none', 'stretch', 'scale_inner', 'scale_outer', 'scale_to_width', 'scale_to_height', 'max_only'];
export const ALIGNMENTS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];

/** A field's default (deep copy for objects and lists). */
const copy = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

/** Settings of a new source / filter / transition: every field's default, then `given`. */
export function defaultsOf(fields, given = {}) {
  const out = {};
  for (const f of fields ?? []) if (f.type !== 'button' && f.type !== 'info') out[f.key] = copy(f.default);
  return { ...out, ...copy(given) };
}

export const sourceDefaults = (type, given) => defaultsOf(SOURCE_TYPES[type]?.props, given);
export const filterDefaults = (type, given) => defaultsOf(FILTER_TYPES[type]?.props, given);
export const transitionDefaults = (type, given) => defaultsOf(TRANSITION_TYPES[type]?.props, given);

/** Fields shown for these settings (a field's `when` hides it when it does not apply). */
export const visibleFields = (fields, settings) => (fields ?? []).filter((f) => !f.when || f.when(settings ?? {}));

/** A value brought inside its field's limits (numbers clamped and snapped, unknown options → default). */
export function clampField(field, value) {
  if (field.type === 'number' || field.type === 'slider') {
    let n = Number(value);
    if (!Number.isFinite(n)) n = field.default;
    n = Math.min(field.max, Math.max(field.min, n));
    if (field.step) { const k = Math.round((n - field.min) / field.step); n = Number((field.min + k * field.step).toFixed(6)); }
    return Math.min(field.max, n);
  }
  if (field.type === 'bool') return Boolean(value);
  if (field.type === 'select') return field.options.map((o) => (Array.isArray(o) ? o[0] : o)).includes(value) ? value : field.default;
  if (field.type === 'color') return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(String(value)) ? String(value).toLowerCase() : field.default;
  if (field.type === 'files') return Array.isArray(value) ? value.filter((x) => typeof x === 'string' || (x && typeof x === 'object')) : [];
  return value ?? field.default;
}

/** Settings brought inside every field's limits (unknown keys kept: imported files carry extras). */
export function normalizeSettings(fields, settings) {
  const out = { ...settings };
  for (const f of fields ?? []) if (f.key in out && f.type !== 'button') out[f.key] = clampField(f, out[f.key]);
  return out;
}
