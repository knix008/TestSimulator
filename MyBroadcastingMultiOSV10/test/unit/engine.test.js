// The broadcasting engine's pure parts: the catalogue, the scene collection model, item geometry, text
// sources, wipe patterns and LUTs, audio dynamics, file names, the recording / replay buffer / stream
// outputs (fed with fake packets and muxed for real) and scene-file import / export.
// [F:<id>] in a name marks the feature (src/bc/features.js) the test proves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EncodedPacket } from 'mediabunny';
import { FILTER_TYPES, SOURCE_MENU, SOURCE_TYPES, TRANSITION_TYPES, LUMA_IMAGES, clampField, filtersFor, sourceDefaults, visibleFields } from '../../src/bc/catalog.js';
import * as M from '../../src/bc/model.js';
import * as T from '../../src/bc/transform.js';
import { formatClock, formatDuration, textOf } from '../../src/bc/engine/textfmt.js';
import { identityCube, lumaAt, lumaPixels, lutAtlas, parseCube, pngLutToCube, keyColor } from '../../src/bc/engine/patterns.js';
import { dynamicsGain, coef } from '../../src/bc/engine/worklets.js';
import { dynamicsParams, faderToMul, mulToFader, levels, mulToDb } from '../../src/bc/engine/audio.js';
import { CONTAINER_CODECS, Muxer, Recording, ReplayBuffer, StreamOutput, chapterText, codecString, ffmetadata, formatFileName, ingestUrl, uniqueFile } from '../../src/bc/engine/outputs.js';
import { SERVICES, checkStream, protocolOf, recommendedBitrate, serviceById } from '../../src/bc/services.js';
import { exportSceneJson, importSceneJson, abgrColor, toAbgrColor } from '../../src/bc/compat/scenejson.js';
import { WIRE } from '../../src/bc/compat/wire.js';
import { FEATURES, coverage, featuresIn } from '../../src/bc/features.js';
import { BufferTarget } from 'mediabunny';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

// ───────────────────────── catalogue

test('[F:src.properties] every source type has an icon, a group and fields with defaults that survive clamping', () => {
  for (const [id, type] of Object.entries(SOURCE_TYPES)) {
    assert.ok(type.icon, id);
    const defaults = sourceDefaults(id);
    for (const f of type.props) {
      if (f.type === 'button') continue;
      assert.ok(f.key in defaults, `${id}.${f.key}`);
      if (f.type === 'number' || f.type === 'slider') { assert.equal(clampField(f, defaults[f.key]), defaults[f.key], `${id}.${f.key} default inside limits`); assert.equal(clampField(f, f.max + 1000), f.max); }
      if (f.type === 'select') assert.ok(f.options.includes(f.default), `${id}.${f.key} default is an option`);
    }
  }
  assert.ok(SOURCE_MENU.filter((x) => x !== '-').every((id) => SOURCE_TYPES[id]));
  const text = SOURCE_TYPES.text_gdiplus.props;
  assert.ok(!visibleFields(text, { text_mode: 'static' }).some((f) => f.key === 'countdown_seconds'));
  assert.ok(visibleFields(text, { text_mode: 'countdown' }).some((f) => f.key === 'countdown_seconds'));
});

test('[F:flt.manage] video filters for pictures, audio filters for sound', () => {
  assert.ok(filtersFor('image_source').includes('chroma_key_filter_v2'));
  assert.ok(!filtersFor('image_source').includes('gain_filter'));
  assert.ok(filtersFor('wasapi_input_capture').includes('compressor_filter'));
  assert.ok(!filtersFor('wasapi_input_capture').includes('crop_filter'));
  assert.ok(filtersFor('ffmpeg_source').includes('gain_filter') && filtersFor('ffmpeg_source').includes('crop_filter'));
  assert.equal(Object.keys(FILTER_TYPES).length, 24);
});

test('[F:flt.vst] the VST filter is marked unsupported and shows up as a problem, never silently', () => {
  assert.equal(FILTER_TYPES.vst_filter.unsupported, 'vst');
  const c = M.createCollection();
  const mic = M.createSource(c, 'wasapi_input_capture', 'Mic');
  M.addItem(c, c.current, mic.id);
  M.addFilter(c, mic.id, 'vst_filter', 'VST');
  assert.ok(M.findProblems(c).some((p) => p.kind === 'unsupportedFilter'));
});

// ───────────────────────── scenes

test('[F:scene.add] [F:scene.rename] [F:scene.remove] scenes get unique names; the last scene cannot go', () => {
  const c = M.createCollection('Test');
  assert.equal(c.scenes.length, 1);
  const b = M.addScene(c, 'Scene');
  assert.equal(b.name, 'Scene 2');
  assert.equal(M.renameScene(c, b.id, 'Scene'), false, 'taken name refused');
  assert.equal(M.renameScene(c, b.id, 'Live'), true);
  assert.equal(b.name, 'Live');
  assert.equal(M.removeScene(c, b.id), true);
  assert.equal(M.removeScene(c, c.scenes[0].id), false);
});

test('[F:scene.duplicate] [F:scene.order] [F:scene.switch] duplicate copies the items with new ids; scenes reorder', () => {
  const c = M.createCollection();
  const a = c.scenes[0];
  const img = M.createSource(c, 'image_source', 'Img');
  const it = M.addItem(c, a.id, img.id, { x: 10 });
  const d = M.duplicateScene(c, a.id);
  assert.equal(d.items.length, 1);
  assert.notEqual(d.items[0].id, it.id);
  assert.equal(d.items[0].source, img.id, 'same source (reference)');
  assert.equal(c.scenes.indexOf(d), 1);
  M.moveScene(c, d.id, 0);
  assert.equal(c.scenes[0], d);
  c.current = d.id;
  assert.equal(M.currentScene(c), d);
});

test('[F:scene.nested] a scene shown inside another; loops are refused', () => {
  const c = M.createCollection();
  const a = c.scenes[0];
  const b = M.addScene(c, 'B');
  assert.ok(M.addItem(c, a.id, b.id), 'B inside A');
  assert.equal(M.addItem(c, b.id, a.id), null, 'A inside B would loop');
  assert.equal(M.addItem(c, a.id, a.id), null, 'not inside itself');
  const img = M.createSource(c, 'image_source', 'Img');
  M.addItem(c, b.id, img.id);
  assert.ok(M.activeSources(c, a.id).has(img.id), 'nested sources are active');
  M.removeScene(c, b.id);
  assert.equal(a.items.length, 0, 'removing a scene removes its nested items');
});

test('[F:scene.override] [F:trn.manage] a scene can use its own transition; transitions add and remove', () => {
  const c = M.createCollection();
  const wipe = M.addTransition(c, 'wipe_transition', 'Wipe');
  const b = M.addScene(c, 'B');
  assert.equal(M.transitionFor(c, b.id).transition.type, 'fade_transition');
  b.override = { transition: wipe.id, duration: 900 };
  assert.deepEqual([M.transitionFor(c, b.id).transition.id, M.transitionFor(c, b.id).duration], [wipe.id, 900]);
  assert.equal(M.removeTransition(c, wipe.id), true);
  assert.equal(b.override, null, 'override dropped with its transition');
  const cut = c.transitions.find((x) => x.type === 'cut_transition');
  assert.equal(M.removeTransition(c, cut.id), false, 'the only cut stays');
});

test('[F:scene.filters] scenes carry filters too', () => {
  const c = M.createCollection();
  const f = M.addFilter(c, c.scenes[0].id, 'color_filter_v2', 'Grade');
  assert.ok(f);
  assert.equal(c.scenes[0].filters.length, 1);
});

// ───────────────────────── sources and items

test('[F:src.existing] [F:src.copyPaste] [F:src.rename] the same source in two scenes; duplicate an item; rename', () => {
  const c = M.createCollection();
  const a = c.scenes[0];
  const b = M.addScene(c, 'B');
  const txt = M.createSource(c, 'text_gdiplus', 'Title');
  M.addItem(c, a.id, txt.id);
  M.addItem(c, b.id, txt.id);
  assert.equal(Object.values(c.sources).length, 1);
  const copy = M.duplicateItem(c, a.id, a.items[0].id);
  assert.equal(copy.transform.x, 20);
  assert.equal(M.renameSource(c, txt.id, 'B'), false, 'a scene has that name');
  assert.equal(M.renameSource(c, txt.id, 'Headline'), true);
  M.removeItems(c, a.id, a.items.map((x) => x.id));
  assert.ok(c.sources[txt.id], 'still used in B');
  M.removeItems(c, b.id, b.items.map((x) => x.id));
  assert.equal(c.sources[txt.id], undefined, 'unused sources are dropped');
});

test('[F:src.order] up, down, top, bottom', () => {
  const c = M.createCollection();
  const s = c.scenes[0];
  const ids = ['A', 'B', 'C'].map((n) => M.addItem(c, s.id, M.createSource(c, 'color_source_v3', n).id).id);
  M.orderItem(c, s.id, ids[0], 'top');
  assert.deepEqual(s.items.map((x) => x.id), [ids[1], ids[2], ids[0]]);
  M.orderItem(c, s.id, ids[0], 'down');
  assert.deepEqual(s.items.map((x) => x.id), [ids[1], ids[0], ids[2]]);
  M.orderItem(c, s.id, ids[2], 'bottom');
  assert.equal(s.items[0].id, ids[2]);
  assert.equal(M.orderItem(c, s.id, ids[2], 'down'), false);
});

test('[F:src.group] grouping keeps children in place; ungroup moves the group transform into them', () => {
  const c = M.createCollection();
  const s = c.scenes[0];
  const a = M.addItem(c, s.id, M.createSource(c, 'color_source_v3', 'A').id, { x: 100, y: 50 });
  const b = M.addItem(c, s.id, M.createSource(c, 'color_source_v3', 'B').id, { x: 300, y: 80 });
  const g = M.groupItems(c, s.id, [a.id, b.id], 'G');
  assert.equal(s.items.length, 1);
  assert.equal(g.children.length, 2);
  assert.equal(c.sources[g.source].type, 'group');
  g.transform.x = 10; g.transform.sx = 2; g.transform.sy = 2;
  M.ungroup(c, s.id, g.id);
  assert.equal(s.items.length, 2);
  assert.equal(s.items[0].transform.x, 210);
  assert.equal(s.items[0].transform.sx, 2);
  assert.equal(c.sources[g.source], undefined, 'group source dropped');
  assert.equal(M.moveItemTo(c, s.id, s.items[1].id, null, 0), true);
});

test('[F:src.missingFiles] problems: missing files, empty scenes, sources without a file', () => {
  const c = M.createCollection();
  const img = M.createSource(c, 'image_source', 'Logo', { file: 'C:/gone/logo.png' });
  M.addItem(c, c.current, img.id);
  M.createSource(c, 'image_source', 'Empty');
  M.addScene(c, 'Empty scene');
  const problems = M.findProblems(c, { exists: (f) => !f.includes('gone') });
  assert.ok(problems.some((p) => p.kind === 'missingFile' && p.params.file === 'C:/gone/logo.png'));
  assert.ok(problems.some((p) => p.kind === 'emptyScene'));
  assert.ok(problems.some((p) => p.kind === 'noFile'));
});

test('normalising a damaged collection keeps what it can', () => {
  const c = M.createCollection();
  const raw = JSON.parse(JSON.stringify(c));
  raw.sources.bad = { type: 'nope' };
  raw.scenes[0].items.push({ source: 'missing' });
  raw.duration = 'x';
  const n = M.normalizeCollection(raw);
  assert.equal(n.sources.bad, undefined);
  assert.equal(n.scenes[0].items.length, 0);
  assert.equal(n.duration, 300);
  assert.ok(n.transitions.some((x) => x.type === 'cut_transition'));
});

// ───────────────────────── geometry

test('[F:tr.edit] position is the alignment point; bounds fit the source; crop shrinks it', () => {
  const tr = { ...M.defaultTransform(), x: 100, y: 100, align: 'center' };
  const box = T.itemBox(tr, 200, 100);
  assert.deepEqual([box.w, box.h], [200, 100]);
  const c = T.corners(tr, 200, 100);
  assert.deepEqual([c[0].x, c[0].y, c[2].x, c[2].y], [0, 50, 200, 150]);
  const inner = T.itemBox({ ...tr, bounds: { type: 'scale_inner', w: 400, h: 400, align: 'center' } }, 200, 100);
  assert.deepEqual([inner.content.w, inner.content.h, inner.content.y], [400, 200, 100]);
  const stretch = T.itemBox({ ...tr, bounds: { type: 'stretch', w: 400, h: 400, align: 'center' } }, 200, 100);
  assert.deepEqual([stretch.content.w, stretch.content.h], [400, 400]);
  const cropped = T.itemBox({ ...tr, crop: { l: 50, t: 0, r: 50, b: 0 } }, 200, 100);
  assert.equal(cropped.w, 100);
});

test('[F:tr.fit] fit, stretch and centre to the screen', () => {
  const tr = M.defaultTransform();
  const fit = T.fitToScreen(tr, 1000, 1000, 1920, 1080);
  near(fit.sx, 1.08); near(fit.x, 420);
  const st = T.stretchToScreen(tr, 1000, 500, 1920, 1080);
  near(st.sx, 1.92); near(st.sy, 2.16);
  const ce = T.centerOnScreen({ ...tr, x: 0, y: 0 }, 200, 100, 1920, 1080);
  assert.deepEqual([ce.x, ce.y], [860, 490]);
  const left = T.alignTo({ ...tr, x: 500, y: 5 }, 200, 100, 1920, 1080, 'right');
  assert.equal(left.x, 1720);
});

test('[F:tr.flipRotate] flips are negative scales, rotation wraps at 360°, hit tests follow rotation', () => {
  const tr = { ...M.defaultTransform(), x: 0, y: 0 };
  assert.equal(T.flipH(tr).sx, -1);
  assert.equal(T.flipV(T.flipV(tr)).sy, 1);
  assert.equal(T.rotateBy({ ...tr, rot: 270 }, 90).rot, 0);
  assert.equal(T.rotateBy(tr, -90).rot, 270);
  const r = { ...tr, x: 100, y: 100, rot: 90 };
  assert.ok(T.hitTest(r, 200, 50, 80, 150));
  assert.ok(!T.hitTest(r, 200, 50, 150, 80));
  const box = T.itemBox(T.flipH(tr), 100, 50);
  assert.equal(box.flipX, true);
});

test('[F:tr.move] [F:tr.crop] resizing by a corner keeps the opposite corner; Alt-drag crops', () => {
  const tr = { ...M.defaultTransform(), x: 100, y: 100 };
  const bigger = T.resizeByHandle(tr, 200, 100, 'bottom-right', { x: 400, y: 200 });
  near(bigger.sx, 2); near(bigger.x, 100);
  const fromLeft = T.resizeByHandle(tr, 200, 100, 'left', { x: -100, y: 50 });
  near(fromLeft.sx, 1.5); near(fromLeft.x, 0);
  const free = T.resizeByHandle(tr, 200, 100, 'bottom-right', { x: 400, y: 100 }, { keepAspect: false });
  near(free.sx, 2); near(free.sy, 1);
  const crop = T.cropByHandle(tr, 200, 100, 'left', { x: 30, y: 0 });
  assert.equal(crop.crop.l, 30);
  const keep = T.setAlignKeepPlace(tr, 200, 100, 'center');
  assert.deepEqual([keep.x, keep.y], [200, 150]);
});

test('[F:tr.snap] snapping catches the canvas edges, the centre and other items', () => {
  const s = T.snap({ x: 6, y: 300, w: 100, h: 100 }, 1920, 1080, []);
  assert.equal(s.dx, -6);
  const centre = T.snap({ x: 905, y: 487, w: 100, h: 100 }, 1920, 1080, []);
  assert.deepEqual([centre.dx, centre.dy], [5, 3]);
  const other = T.snap({ x: 500, y: 500, w: 50, h: 50 }, 1920, 1080, [{ x: 556, y: 900, w: 10, h: 10 }]);
  assert.equal(other.dx, 6);
  assert.equal(T.snap({ x: 500, y: 500, w: 50, h: 50 }, 1920, 1080, [], { edges: false, center: false }).dx, 0);
});

// ───────────────────────── text, patterns, LUTs

test('[F:src.text] clock, date, countdown with an end text, stopwatch, file text', () => {
  const at = new Date(2026, 10, 20, 9, 5, 7);
  assert.equal(formatClock(at, 'HH:mm:ss'), '09:05:07');
  assert.equal(formatClock(at, 'YYYY-MM-DD ddd'), '2026-11-20 금');
  assert.equal(formatClock(at, 'hh:mm A'), '09:05 AM');
  assert.equal(textOf({ text_mode: 'countdown', countdown_seconds: 90 }, { elapsed: 500 }), '01:30');
  assert.equal(textOf({ text_mode: 'countdown', countdown_seconds: 90, countdown_end_text: 'LIVE' }, { elapsed: 91000 }), 'LIVE');
  assert.equal(textOf({ text_mode: 'stopwatch' }, { elapsed: 3723400 }), '01:02:03.4');
  assert.equal(textOf({ text_mode: 'static', read_from_file: true }, { fileText: 'from file' }), 'from file');
  assert.equal(formatDuration(59000), '00:59');
});

test('[F:trn.luma] 16 luma wipe patterns, each a full 0…1 range', () => {
  assert.equal(LUMA_IMAGES.length, 16);
  for (const kind of LUMA_IMAGES) {
    const px = lumaPixels(kind, 64, 36);
    let lo = 255; let hi = 0;
    for (let i = 0; i < px.length; i += 4) { lo = Math.min(lo, px[i]); hi = Math.max(hi, px[i]); }
    assert.ok(hi - lo > 100, `${kind} spans the range (${lo}…${hi})`);
  }
  assert.equal(lumaAt('linear-h', 0.25, 0.9), 0.25);
});

test('[F:flt.lut] .cube files parse; the atlas and PNG LUT layouts round-trip', () => {
  const cube = parseCube(`TITLE "x"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`);
  assert.equal(cube.size, 2);
  assert.deepEqual([...cube.data.slice(3, 6)], [1, 0, 0]);
  assert.throws(() => parseCube('LUT_3D_SIZE 4\n0 0 0'));
  const id = identityCube(4);
  const atlas = lutAtlas(id);
  const back = pngLutToCube(atlas.pixels, atlas.width, atlas.height);
  assert.equal(back.size, 4);
  for (let i = 0; i < id.data.length; i++) near(back.data[i], id.data[i], 1 / 255);
  assert.deepEqual(keyColor({ key_color_type: 'green' }), [0, 1, 0]);
  assert.deepEqual(keyColor({ key_color_type: 'custom', key_color: '#ff0000' }), [1, 0, 0]);
});

// ───────────────────────── audio

test('[F:aud.mixer] the fader is cubic: 0 dB at the top, −∞ at the bottom; meters read peak and RMS', () => {
  assert.equal(faderToMul(1), 1);
  assert.equal(faderToMul(0), 0);
  near(mulToFader(faderToMul(0.37)), 0.37);
  near(mulToDb(faderToMul(0.5)), -18.0618, 1e-3);
  const sine = Float32Array.from({ length: 480 }, (_, i) => 0.5 * Math.sin((i / 48) * Math.PI * 2));
  const l = levels(sine);
  near(l.peak, -6.0206, 0.01);
  near(l.rms, -9.03, 0.05);
});

test('[F:flt.compressor] [F:flt.limiter] [F:flt.expander] [F:flt.upward] dynamics curves', () => {
  const p = { threshold: -20, ratio: 4 };
  assert.equal(dynamicsGain('compressor', -10, p), -7.5);
  assert.equal(dynamicsGain('compressor', -30, p), 0);
  assert.equal(dynamicsGain('limiter', -2, { threshold: -6 }), -4);
  assert.equal(dynamicsGain('expander', -50, { threshold: -40, ratio: 2 }), -10);
  assert.ok(dynamicsGain('upward', -40, { threshold: -20, ratio: 0.5, knee: 0 }) > 0);
  assert.equal(dynamicsParams('expander_filter', { presets: 'gate', ratio: 2, threshold: -40, attack_time: 1, release_time: 1, output_gain: 0, detector: 'RMS' }).ratio, 10);
  assert.ok(coef(10, 48000) > 0.99 && coef(0, 48000) === 0);
});

test('[F:flt.gate] [F:flt.noise] [F:flt.gain] [F:flt.eq] [F:flt.invert] the other audio filters have their parameters', () => {
  assert.deepEqual(Object.keys(dynamicsParams('noise_gate_filter', { open_threshold: -26, close_threshold: -32, attack_time: 25, hold_time: 200, release_time: 150 })), ['mode', 'open', 'close', 'attack', 'hold', 'release']);
  for (const id of ['noise_suppress_filter_v2', 'gain_filter', 'basic_eq_filter', 'invert_polarity_filter']) assert.equal(FILTER_TYPES[id].kind, 'audio');
  assert.deepEqual(FILTER_TYPES.basic_eq_filter.props.map((f) => f.key), ['low', 'mid', 'high']);
});

// ───────────────────────── outputs

test('[F:rec.filename] file name format, illegal characters replaced, no overwrite', () => {
  const d = new Date(2026, 10, 20, 21, 3, 9);
  assert.equal(formatFileName('%CCYY-%MM-%DD %hh-%mm-%ss', d), '2026-11-20 21-03-09');
  assert.equal(formatFileName('Show %FPS fps %CRES', d, { fps: 60, cres: '1920x1080' }), 'Show 60 fps 1920x1080');
  assert.equal(formatFileName('a/b:c', d), 'a_b_c');
  assert.equal(uniqueFile('rec', 'mp4', new Set(['rec.mp4', 'rec (2).mp4'])), 'rec (3).mp4');
});

test('[F:out.encoders] codec strings per size and rate; containers accept their codecs', () => {
  assert.equal(codecString('avc', 1920, 1080, 30), 'avc1.640028');
  assert.equal(codecString('avc', 1920, 1080, 60), 'avc1.64002A');
  assert.equal(codecString('avc', 3840, 2160, 60), 'avc1.640033');
  assert.match(codecString('hevc', 1920, 1080, 30), /^hvc1/);
  assert.match(codecString('av1', 1920, 1080, 30), /^av01/);
  assert.equal(codecString('aac'), 'mp4a.40.2');
  assert.deepEqual(CONTAINER_CODECS.webm.audio, ['opus']);
});

/** Fake encoders: the outputs only need add / remove / requestKeyframe. */
const hub = () => ({ sinks: new Set(), keys: 0, add(s) { this.sinks.add(s); }, remove(s) { this.sinks.delete(s); }, requestKeyframe() { this.keys++; } });
const vMeta = { decoderConfig: { codec: 'vp09.00.41.08', codedWidth: 64, codedHeight: 36 } };
const aMeta = { decoderConfig: { codec: 'opus', sampleRate: 48000, numberOfChannels: 2 } };
const vp = (i, fps = 30, key = i % 30 === 0) => new EncodedPacket(new Uint8Array(2000).fill(i & 255), key ? 'key' : 'delta', i / fps, 1 / fps);
const ap = (i) => new EncodedPacket(new Uint8Array(60).fill(i & 255), 'key', i * 0.02, 0.02);
function memoryFiles() {
  const files = new Map();
  return {
    files,
    async open(name) { const parts = []; files.set(name, parts); return { path: name, write: (data, position) => { parts.push({ position, size: data.byteLength }); }, close: () => {} }; },
    writeText: async (name, text) => files.set(name, text),
  };
}

test('[F:rec.start] [F:rec.formats] [F:rec.multitrack] a recording muxes MP4, fragmented MP4, MKV, WebM with several audio tracks', async () => {
  for (const container of ['mp4', 'fmp4', 'mkv', 'webm']) {
    const v = hub(); const a1 = hub(); const a2 = hub();
    const files = memoryFiles();
    const rec = new Recording({ video: v, audios: new Map([[0, a1], [1, a2]]), cfg: { container, videoCodec: 'vp9', audioCodec: 'opus', tracks: [0, 1], fps: 30, name: (i) => `show${i ? `_${i}` : ''}.${container}` }, files });
    await rec.start();
    assert.ok(v.sinks.has(rec) && a1.sinks.has(rec) && a2.sinks.has(rec));
    rec.video(vp(1, 30, false), undefined, false); // before the first keyframe: dropped
    for (let i = 0; i < 60; i++) { rec.video(vp(i), i === 0 ? vMeta : undefined, i % 30 === 0); rec.audio(0, ap(i), i === 0 ? aMeta : undefined); rec.audio(1, ap(i), i === 0 ? aMeta : undefined); }
    const paths = await rec.stop();
    assert.deepEqual(paths, [`show.${container}`]);
    const written = files.files.get(`show.${container}`).reduce((n, p) => Math.max(n, p.position + p.size), 0);
    assert.ok(written > 60 * 2000, `${container}: ${written} bytes`);
    assert.equal(v.sinks.size, 0);
  }
});

test('[F:out.encoders] a recording that joins running encoders takes their decoder config (packets carry none)', async () => {
  for (const container of ['mkv', 'mp4']) {
    const v = { ...hub(), decoderConfig: vMeta.decoderConfig }; const a = { ...hub(), decoderConfig: aMeta.decoderConfig };
    v.sinks = new Set(); a.sinks = new Set();
    const files = memoryFiles();
    const rec = new Recording({ video: v, audios: new Map([[0, a]]), cfg: { container, videoCodec: 'vp9', audioCodec: 'opus', tracks: [0], fps: 30, name: () => `late.${container}` }, files });
    await rec.start();
    for (let i = 30; i < 90; i++) { rec.video(vp(i), undefined, i % 30 === 0); rec.audio(0, ap(i), undefined); }
    await rec.stop();
    assert.equal(rec.part.muxer.error, undefined, `${container}: ${rec.part.muxer.error}`);
    const written = files.files.get(`late.${container}`).reduce((n, p) => Math.max(n, p.position + p.size), 0);
    assert.ok(written > 60 * 2000, `${container}: ${written} bytes`);
  }
});

test('[F:rec.pause] paused time is cut out of the file', async () => {
  const v = hub();
  const rec = new Recording({ video: v, audios: new Map(), cfg: { container: 'mkv', videoCodec: 'vp9', audioCodec: 'opus', tracks: [], fps: 30, name: () => 'p.mkv' }, files: memoryFiles() });
  await rec.start();
  for (let i = 0; i < 30; i++) rec.video(vp(i), i === 0 ? vMeta : undefined, i === 0);
  assert.equal(rec.pause(), true);
  assert.equal(rec.state, 'paused');
  rec.video(vp(30), undefined, true); // ignored while paused
  rec.pausedAt -= 2000; // two seconds of pause
  assert.equal(rec.resume(), true);
  assert.ok(v.keys >= 2, 'a keyframe is asked for after resuming');
  rec.video(vp(90), undefined, true); // 3.0 s on the clock − 2 s paused
  near(rec.duration, 1, 0.01);
  await rec.stop();
});

test('[F:rec.split] [F:rec.chapter] automatic split by time at a keyframe, manual split, chapters as a side file', async () => {
  const v = hub();
  const files = memoryFiles();
  const rec = new Recording({ video: v, audios: new Map(), cfg: { container: 'mkv', videoCodec: 'vp9', audioCodec: 'opus', tracks: [], fps: 30, split: { mode: 'time', minutes: 1 / 60 }, name: (i) => `part${i}.mkv` }, files });
  await rec.start();
  for (let i = 0; i < 100; i++) { rec.video(vp(i), i === 0 ? vMeta : undefined, i % 30 === 0); if (i === 10) rec.addChapter('Intro'); await null; }
  await new Promise((r) => setTimeout(r, 30));
  rec.split();
  for (let i = 100; i < 125; i++) { rec.video(vp(i), undefined, i === 120); await null; }
  await new Promise((r) => setTimeout(r, 30));
  await rec.stop();
  assert.ok(rec.parts.length >= 3, `split into ${rec.parts.length} files`);
  assert.equal(rec.chapters[0].name, 'Intro');
  assert.match(files.files.get('part0.chapters.txt'), /CHAPTER01NAME=Intro/);
  assert.match(chapterText([{ time: 61500, name: 'B' }]), /CHAPTER01=00:01:01\.500/);
  assert.match(ffmetadata([{ time: 0, name: 'A' }, { time: 5000, name: 'B' }], 9000), /START=5000\nEND=9000/);
});

test('[F:rpl.buffer] [F:rpl.save] the replay buffer keeps the last seconds from a keyframe and saves a file', async () => {
  const v = hub(); const a = hub();
  const rb = new ReplayBuffer({ video: v, audios: new Map([[0, a]]), cfg: { seconds: 2, maxMB: 512, container: 'mp4', videoCodec: 'vp9', audioCodec: 'opus', fps: 30 } });
  rb.start();
  rb.video(vp(1, 30, false), undefined, false);
  assert.equal(rb.videoPackets.length, 0, 'starts at a keyframe');
  for (let i = 0; i < 300; i++) { rb.video(vp(i), i === 0 ? vMeta : undefined, i % 30 === 0); rb.audio(0, ap(i * 1.5), i === 0 ? aMeta : undefined); }
  assert.ok(rb.videoPackets[0].key);
  assert.ok(rb.seconds >= 1.9 && rb.seconds <= 3.3, `kept ${rb.seconds} s`);
  const file = await rb.save();
  assert.ok(file.bytes.byteLength > 50 * 2000);
  const small = new ReplayBuffer({ video: hub(), audios: new Map(), cfg: { seconds: 600, maxMB: 0.1, container: 'mp4', videoCodec: 'vp9', audioCodec: 'opus', fps: 30 } });
  small.start();
  for (let i = 0; i < 300; i++) small.video(vp(i), i === 0 ? vMeta : undefined, i % 30 === 0);
  assert.ok(small.bytes <= 0.1 * 1024 * 1024 + 30 * 2000, 'size limit holds');
  rb.stop();
  assert.equal(v.sinks.size, 0);
});

function fakeTransport({ failAfter = Infinity } = {}) {
  const t = { opened: 0, bytes: 0, conns: [] };
  t.open = async () => {
    t.opened++;
    const first = t.opened === 1;
    const conn = { writes: 0, write(data) { conn.writes++; t.bytes += data.byteLength; if (first && t.bytes > failAfter && !conn.failed) { conn.failed = true; setTimeout(() => conn.onClose?.(new Error('network')), 0); } }, close() { conn.closed = true; } };
    t.conns.push(conn);
    return conn;
  };
  return t;
}

test('[F:str.delay] the stream delay holds packets back', async () => {
  const v = hub();
  const t = fakeTransport();
  const s = new StreamOutput({ video: v, audios: new Map(), cfg: { videoCodec: 'vp9', audioCodec: 'opus', tracks: [], fps: 30, delay: 0.3 }, transport: t });
  await s.start();
  for (let i = 0; i < 30; i++) s.video(vp(i), i === 0 ? vMeta : undefined, i === 0);
  s.flush();
  assert.equal(s.queue.length, 30, 'nothing sent yet');
  await new Promise((r) => setTimeout(r, 350));
  s.flush();
  assert.equal(s.queue.length, 0);
  await s.stop();
  assert.ok(t.bytes > 30 * 2000);
});

test('[F:str.reconnect] a dropped connection reconnects and starts again at a keyframe', async () => {
  const v = hub();
  const t = fakeTransport({ failAfter: 20000 });
  const events = [];
  const s = new StreamOutput({ video: v, audios: new Map(), cfg: { videoCodec: 'vp9', audioCodec: 'opus', tracks: [], fps: 30, reconnect: { enabled: true, delay: 0.05, retries: 3 } }, transport: t, emit: (e) => events.push(e) });
  await s.start();
  for (let i = 0; i < 40; i++) { s.video(vp(i), i === 0 ? vMeta : undefined, i % 10 === 0); await new Promise((r) => setTimeout(r, 1)); }
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(events.includes('reconnecting'), events.join(','));
  assert.ok(events.includes('reconnected'), events.join(','));
  assert.equal(t.opened, 2);
  await s.stop();
  assert.ok(events.includes('stopped'));
});

test('[F:str.services] [F:str.protocols] [F:str.bandwidth] services, protocols, ingest URLs', () => {
  for (const id of ['twitch', 'youtube', 'chzzk', 'soop', 'kick', 'facebook', 'custom', 'whip']) assert.ok(SERVICES.some((s) => s.id === id), id);
  assert.equal(serviceById('nope').id, 'custom');
  assert.equal(protocolOf('rtmps://a.rtmps.youtube.com:443/live2'), 'rtmps');
  assert.equal(protocolOf('srt://host:9000'), 'srt');
  assert.equal(protocolOf('rist://host:1968'), 'rist');
  assert.equal(protocolOf('https://whip.example.com/whip/endpoint'), 'whip');
  assert.equal(ingestUrl('rtmp://live.twitch.tv/app/', 'live_123'), 'rtmp://live.twitch.tv/app/live_123');
  assert.equal(ingestUrl('rtmp://live.twitch.tv/app', 'k', { bandwidthTest: true, service: 'twitch' }), 'rtmp://live.twitch.tv/app/k?bandwidthtest=true');
  assert.equal(ingestUrl('srt://host:9000', 'abc'), 'srt://host:9000?streamid=abc');
  assert.deepEqual(checkStream({ service: 'twitch', key: '', videoBitrate: 9000, audioBitrate: 160 }).problems, ['noKey', 'bitrateHigh']);
  assert.deepEqual(checkStream({ service: 'custom', server: 'srt://h:1', key: '' }).problems, []);
  assert.ok(recommendedBitrate(1920, 1080, 60) > recommendedBitrate(1280, 720, 30));
});

test('Muxer refuses packets before its first keyframe', async () => {
  const m = new Muxer({ container: 'webm', videoCodec: 'vp9', audioCodec: 'opus', tracks: [0], target: new BufferTarget(), frameRate: 30 });
  await m.start();
  assert.equal(m.addVideo(vp(1), undefined, false), false);
  assert.equal(m.addAudio(0, ap(0), aMeta), false);
  assert.equal(m.addVideo(vp(2, 30, true), vMeta, true), true);
  assert.equal(await m.finish(), true);
});

// ───────────────────────── scene files

test('[F:col.importExport] a scene file imports (sources, items, groups, filters, audio, transitions) and exports back', () => {
  const file = {
    name: 'From a file', current_scene: 'Game', current_program_scene: 'Game', scene_order: [{ name: 'Game' }, { name: 'BRB' }],
    transitions: [{ name: 'Wipe', id: 'wipe_transition', settings: { luma_image: 'clock' } }], current_transition: 'Wipe', transition_duration: 450,
    groups: [{ id: 'group', name: 'Overlay', uuid: 'g1', settings: { items: [{ name: 'Logo', source_uuid: 'u2', pos: { x: 5, y: 6 }, scale: { x: 1, y: 1 }, align: 5 }] } }],
    sources: [
      { id: 'scene', name: 'Game', uuid: 's1', settings: { items: [
        { name: 'Cam', source_uuid: 'u1', visible: true, locked: true, pos: { x: 100, y: 200 }, rot: 15, scale: { x: 0.5, y: 0.5 }, align: 0, bounds_type: 2, bounds: { x: 640, y: 360 }, crop_left: 10, blend_type: 'screen', scale_filter: 'lanczos' },
        { name: 'Overlay', source_uuid: 'g1', visible: true, pos: { x: 0, y: 0 }, scale: { x: 1, y: 1 } },
      ] } },
      { id: 'scene', name: 'BRB', uuid: 's2', settings: { items: [] } },
      { id: 'dshow_input', versioned_id: 'dshow_input', name: 'Cam', uuid: 'u1', settings: {}, volume: 0.5, muted: true, balance: 0.25, sync: 120000000, monitoring_type: 2, mixers: 5, filters: [{ id: 'chroma_key_filter', versioned_id: 'chroma_key_filter_v2', name: 'Key', enabled: true, settings: { similarity: 420 } }] },
      { id: 'image_source', versioned_id: 'image_source', name: 'Logo', uuid: 'u2', settings: { file: 'C:/logo.png' } },
      { id: 'text_gdiplus', versioned_id: 'text_gdiplus_v3', name: 'Title', uuid: 'u3', settings: { text: 'Hi', color: 0xff0000ff, font: { face: 'Arial', size: 40, flags: 3 } } },
      { id: 'some_plugin_source', name: 'Plugin thing', uuid: 'u4', settings: {} },
    ],
  };
  const { collection: c, skipped } = importSceneJson(file);
  assert.deepEqual(skipped, ['Plugin thing (some_plugin_source)']);
  assert.deepEqual(c.scenes.map((s) => s.name), ['Game', 'BRB']);
  const game = c.scenes[0];
  const cam = game.items[0];
  assert.equal(c.sources[cam.source].name, 'Cam');
  assert.deepEqual([cam.transform.x, cam.transform.rot, cam.transform.sx, cam.transform.align, cam.transform.bounds.type, cam.transform.crop.l, cam.blend, cam.scaleFilter, cam.locked], [100, 15, 0.5, 'center', 'scale_inner', 10, 'screen', 'lanczos', true]);
  const audio = c.sources[cam.source].audio;
  assert.deepEqual([audio.volume, audio.muted, audio.balance, audio.sync, audio.monitor, audio.tracks.slice(0, 3)], [0.5, true, 0.25, 120, 'both', [true, false, true]]);
  assert.equal(c.sources[cam.source].filters[0].type, 'chroma_key_filter_v2');
  assert.equal(game.items[1].children.length, 1, 'group children');
  assert.equal(c.transitions.find((x) => x.id === c.transition).type, 'wipe_transition');
  assert.equal(c.duration, 450);
  assert.ok(Object.values(c.sources).some((s) => s.type === 'text_gdiplus' && s.settings.color === '#ff0000' && s.settings.font.bold && s.settings.font.italic));
  const back = exportSceneJson(c);
  assert.equal(back.current_program_scene, 'Game');
  assert.equal(back.sources.filter((s) => s.id === 'scene').length, 2);
  assert.equal(back.groups.length, 1);
  const again = importSceneJson(JSON.parse(JSON.stringify(back))).collection;
  assert.equal(again.scenes[0].items[0].transform.rot, 15);
  assert.equal(abgrColor(toAbgrColor('#12abef', 50)).hex, '#12abef');
});

// ───────────────────────── the feature list itself

test('every feature has an id, both names and a known status; tags are read from test names', () => {
  const ids = new Set();
  for (const f of FEATURES) {
    assert.ok(!ids.has(f.id), `duplicate ${f.id}`);
    ids.add(f.id);
    assert.ok(f.ko && f.en && ['full', 'adapted', 'external', 'unsupported'].includes(f.status), f.id);
  }
  assert.deepEqual(featuresIn('[F:a.b] x [F:c.d]'), ['a.b', 'c.d']);
  const cov = coverage(['[F:scene.add] ok'], ['[F:scene.remove] bad']);
  assert.ok(cov.covered.some((f) => f.id === 'scene.add'));
  assert.ok(cov.failing.some((f) => f.id === 'scene.remove'));
  assert.ok(cov.missing.length >= FEATURES.length - 1);
});

test('transition types: ids, icons, fields', () => {
  for (const [id, tr] of Object.entries(TRANSITION_TYPES)) { assert.match(id, /_transition$/); assert.ok(tr.icon); }
});

test('[F:col.importExport] the stinger kind of scene files maps to ours and back', () => {
  const file = { name: 'S', current_scene: 'A', scene_order: [{ name: 'A' }], sources: [{ id: 'scene', versioned_id: 'scene', name: 'A', settings: { items: [] } }], transitions: [{ id: WIRE.stingerKind, name: 'Sting', settings: { path: 'x.webm' } }], current_transition: 'Sting' };
  const c = importSceneJson(file).collection;
  assert.ok(c.transitions.some((x) => x.type === 'stinger_transition' && x.name === 'Sting'));
  assert.ok(exportSceneJson(c).transitions.some((x) => x.id === WIRE.stingerKind));
});

test('[F:str.start] a stream that joins running encoders takes their decoder config (packets carry none)', async () => {
  const v = { ...hub(), decoderConfig: vMeta.decoderConfig }; v.sinks = new Set();
  const a = { ...hub(), decoderConfig: aMeta.decoderConfig }; a.sinks = new Set();
  const t = fakeTransport();
  const s = new StreamOutput({ video: v, audios: new Map([[0, a]]), cfg: { videoCodec: 'vp9', audioCodec: 'opus', tracks: [0], fps: 30 }, transport: t });
  await s.start();
  try {
    for (let i = 30; i < 90; i++) { s.video(vp(i), undefined, i % 30 === 0); s.audio(0, ap(i), undefined); s.flush(); await null; }
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(s.muxer.error, undefined, String(s.muxer.error));
  } finally { await s.stop(); }
  assert.ok(t.bytes > 60 * 2000, `${t.bytes} bytes`);
});

test('[F:scene.add] a scene of sound only shows no picture; old collections keep their stinger', () => {
  let c = M.createCollection('S');
  const scene = c.scenes[0].id;
  assert.equal(M.showsPicture(c, scene), false);
  c.sources.mic = { id: 'mic', type: 'wasapi_input_capture', name: 'Mic', settings: {}, filters: [], audio: M.defaultAudio(), hotkeys: {} };
  c.scenes[0].items.push({ id: 'i1', source: 'mic', visible: true, transform: M.defaultTransform() });
  assert.equal(M.showsPicture(c, scene), false, 'sound only');
  const color = { id: 'col', type: 'color_source_v3', name: 'C', settings: {}, filters: [], audio: null, hotkeys: {} };
  c.sources.col = color;
  c.scenes[0].items.push({ id: 'i2', source: 'col', visible: false, transform: M.defaultTransform() });
  assert.equal(M.showsPicture(c, scene), false, 'hidden picture');
  c.scenes[0].items.at(-1).visible = true;
  assert.equal(M.showsPicture(c, scene), true);
  const old = M.normalizeCollection({ ...M.createCollection('O'), transitions: [{ id: 'tr1', type: WIRE.stingerKind, name: 'Sting', settings: {} }] });
  assert.ok(old.transitions.some((x) => x.type === 'stinger_transition' && x.name === 'Sting'));
});
