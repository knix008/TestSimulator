// Walkthrough and video recording.
//
// Walkthrough: a first-person camera in the model — W/A/S/D or the arrow keys walk, Q/E go down / up (when
// flying), Shift runs, a drag looks round. With gravity on the eye stays at its height above whatever is under
// it (steps up onto what is lower than a knee, falls off edges); with collision on it stops short of what is in
// front. The view is a perspective camera at the eye looking along the heading.
//
// Record video: the graphics area written to a video file (MP4 / H.264 where the browser can, else WebM) — a
// turntable (the camera orbiting the model about Z), the assembly's motion study playing, or the live view
// (orbit, walk …) between Start and Stop. Frames are fed one by one (captureStream(0) + requestFrame) at the
// chosen rate and size, so a slow frame lags but never stretches the video.
import * as THREE from 'three';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The heading's unit vectors: forward (with the pitch), level forward and right. */
export function walkAxes(yaw, pitch) {
  const f = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  const level = [Math.cos(yaw), Math.sin(yaw), 0];
  const right = [Math.sin(yaw), -Math.cos(yaw), 0];
  return { f, level, right };
}

/**
 * One step of the walker: `keys` { forward, back, left, right, up, down, run } (booleans), `dt` seconds, the world
 * asked through `cast(origin, dir, far)` → distance to the first surface or Infinity. Returns the new eye.
 * Walking is level when gravity is on (the eye then rides `eye` above the floor: up steps lower than 40 % of it,
 * falling otherwise), along the full heading when flying. Collision stops the move short of a wall by `radius`
 * (each horizontal axis tried on its own, so the walker slides along a wall instead of sticking to it).
 */
export function walkStep(s, keys, dt, cast) {
  const { level, right, f } = walkAxes(s.yaw, s.pitch);
  const speed = (Number(s.speed) || 1000) * (keys.run ? 3 : 1);
  const fw = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const st = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const along = s.gravity ? level : f;
  let move = add(mul(along, fw), mul(right, st));
  if (!s.gravity) move = add(move, [0, 0, (keys.up ? 1 : 0) - (keys.down ? 1 : 0)]);
  const ml = len(move);
  let eye = [...s.eye];
  if (ml > 1e-9) {
    const step = mul(move, (speed * dt) / ml);
    const radius = Math.max(1e-3, Number(s.radius) || (Number(s.eyeHeight) || 1600) * 0.15);
    // Each axis on its own: blocked ones are dropped (a slide along the wall).
    for (const axis of [[step[0], 0, 0], [0, step[1], 0], [0, 0, step[2]]]) {
      const d = len(axis);
      if (d < 1e-12) continue;
      if (s.collide) {
        const dir = mul(axis, 1 / d);
        // From the eye and from knee height (a low wall the eye looks over still stops the legs).
        const knee = s.gravity ? [eye[0], eye[1], eye[2] - (Number(s.eyeHeight) || 1600) * 0.55] : eye;
        const hit = Math.min(cast(eye, dir, d + radius), cast(knee, dir, d + radius));
        if (hit < d + radius) continue;
      }
      eye = add(eye, axis);
    }
  }
  if (s.gravity) {
    const h = Number(s.eyeHeight) || 1600;
    // The floor: the first surface under a point a step-height above the feet.
    const stepUp = h * 0.4;
    const from = [eye[0], eye[1], eye[2] - h + stepUp];
    const below = cast(from, [0, 0, -1], 1e9);
    let floor = Number.isFinite(below) ? from[2] - below : Number(s.ground ?? -Infinity);
    if (!Number.isFinite(floor)) floor = eye[2] - h;
    const want = floor + h;
    // Up at once (a step), down at a fall's pace (9.81 m/s² from rest, in mm).
    if (want >= eye[2]) { eye[2] = want; s.fall = 0; }
    else { s.fall = (s.fall ?? 0) + 9810 * dt; eye[2] = Math.max(want, eye[2] - s.fall * dt); }
  }
  s.eye = eye;
  return eye;
}

/** The video type the browser records: MP4 (H.264) first, WebM (VP9, VP8) after. */
export function videoMime(prefer = 'mp4') {
  const MR = globalThis.MediaRecorder;
  if (!MR) return null;
  const mp4 = ['video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4'];
  const webm = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of prefer === 'webm' ? [...webm, ...mp4] : [...mp4, ...webm]) if (MR.isTypeSupported(m)) return m;
  return null;
}

export function createWalkTools(ctx) {
  const { state, t } = ctx;
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && (e.mode === 'walk' || e.mode === 'video'));
  const vp = () => ctx.viewport();
  const keys = {};
  let loop = 0;
  let rec = null; // the recording in progress: { stop(), source, started, frames }
  let warmed = null;
  let lookAt = null; // a look-round drag's last pointer

  // ─────────── the world, for the walker's rays

  function meshes() {
    const out = [];
    vp()?.groups?.bodies?.traverse((o) => { if (o.isMesh && !o.isLineSegments2 && !o.isLine && o.visible !== false) out.push(o); });
    return out;
  }
  const ray = new THREE.Raycaster();
  function cast(origin, dir, far) {
    ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...dir));
    ray.near = 0; ray.far = far;
    const hit = ray.intersectObjects(meshes(), false).find((h) => h.object.visible !== false);
    return hit ? hit.distance : Infinity;
  }

  // ─────────── walk mode

  function modelBox() {
    const b = vp()?.contentBox();
    return b ? { min: b.min.toArray(), max: b.max.toArray(), size: len(b.getSize(new THREE.Vector3()).toArray()) || 100 } : { min: [0, 0, 0], max: [100, 100, 100], size: 173 };
  }

  /** Puts the camera at the walker's eye, looking along the heading. */
  function applyCamera(e) {
    const v = vp(); if (!v) return;
    const { f } = walkAxes(e.yaw, e.pitch);
    const d = Math.max(1e-3, e.size * 0.01);
    v.setCameraState({ target: add(e.eye, mul(f, d)), dir: mul(f, -1), up: [0, 0, 1], distance: d, ortho: false });
  }

  function startWalk() {
    const v = vp();
    if (!v) return;
    if (state.editing) ctx.cancelEditing({ quiet: true });
    const cam = v.cameraState();
    const box = modelBox();
    const eyeHeight = Number(state.settings.walkEyeHeight) || Math.max(1, Math.round(Math.min(1600, box.size * 0.12)));
    const speed = Number(state.settings.walkSpeed) || Math.max(1, Math.round(Math.min(1400, box.size * 0.25)));
    // From the current eye, heading where it looks (levelled), outside the model when the eye was far.
    const eye0 = add(cam.target, mul(cam.dir, cam.distance));
    const look = mul(norm(cam.dir), -1);
    const yaw = Math.atan2(look[1], look[0]);
    const e = { mode: 'walk', saved: cam, eye: eye0, yaw, pitch: 0, eyeHeight, speed, gravity: state.settings.walkGravity !== false, collide: state.settings.walkCollide !== false, size: box.size, ground: box.min[2], fall: 0 };
    if (e.gravity) {
      // Stand on the ground in front of the model: back off along the heading to a model-size away from its middle.
      const mid = mul(add(box.min, box.max), 0.5);
      const flat = [eye0[0] - mid[0], eye0[1] - mid[1], 0];
      const r = Math.max(box.size * 0.75, 1);
      const away = len(flat) > 1e-6 ? mul(norm(flat), r) : mul(walkAxes(yaw, 0).level, -r);
      e.eye = [mid[0] + away[0], mid[1] + away[1], box.min[2] + eyeHeight];
      e.yaw = Math.atan2(-away[1], -away[0]);
    }
    state.editing = e;
    state.leftTab = 'pm';
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', clearKeys);
    applyCamera(e);
    ctx.renderAll();
  }

  function stopWalk(e, keep) {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    window.removeEventListener('blur', clearKeys);
    clearKeys();
    const v = vp();
    if (!v) return;
    if (keep) {
      // An orbit view of what the walker was looking at.
      const { f } = walkAxes(e.yaw, e.pitch); const d = e.size * 0.5;
      v.setCameraState({ target: add(e.eye, mul(f, d)), dir: mul(f, -1), up: [0, 0, 1], distance: d, ortho: false });
    } else v.setCameraState(e.saved);
  }

  const KEYMAP = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyE: 'up', PageUp: 'up', KeyQ: 'down', PageDown: 'down' };
  function onKey(ev) {
    const e = editing();
    if (e?.mode !== 'walk') return;
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    keys.run = ev.shiftKey;
    const k = KEYMAP[ev.code];
    if (!k) { if (ev.key === 'Shift') ev.stopPropagation(); return; }
    ev.preventDefault(); ev.stopPropagation();
    keys[k] = ev.type === 'keydown';
    if (ev.type === 'keydown') run();
  }
  function clearKeys() { for (const k of Object.keys(keys)) keys[k] = false; }

  /** Moves the walker by the held keys for `dt` seconds (and draws). Tests call it directly. */
  function advance(held, dt) {
    const e = editing();
    if (e?.mode !== 'walk') return null;
    walkStep(e, held, dt, cast);
    applyCamera(e);
    const out = document.querySelector('[data-walk-eye]');
    if (out) out.textContent = e.eye.map((c) => ctx.fmt(c, 0)).join(', ');
    return e.eye;
  }

  function run() {
    if (loop) return;
    let last = performance.now();
    const step = () => {
      loop = 0;
      const e = editing();
      if (e?.mode !== 'walk') return;
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const moving = ['forward', 'back', 'left', 'right', 'up', 'down'].some((k) => keys[k]);
      // Keep stepping while a key is held, or while falling.
      const before = e.eye[2];
      advance(keys, dt);
      if (moving || Math.abs(e.eye[2] - before) > 1e-6) loop = requestAnimationFrame(step);
    };
    loop = requestAnimationFrame(step);
  }

  /** Look round with a drag (sideways turns, up / down tilts — at most 85°). */
  function dragTool() {
    const e = editing();
    if (e?.mode !== 'walk') return null;
    // The viewport asks for the tool on every event: the drag's start is kept here, not in the object.
    return {
      down(ev) { if (ev.button !== 0) return false; lookAt = { x: ev.clientX, y: ev.clientY }; return true; },
      move(ev) {
        if (!lookAt) return false;
        const dx = ev.clientX - lookAt.x; const dy = ev.clientY - lookAt.y; lookAt = { x: ev.clientX, y: ev.clientY };
        const k = 0.004 * (Number(state.settings.orbitSpeed) || 1);
        e.yaw -= dx * k; e.pitch = clamp(e.pitch - dy * k, (-85 * Math.PI) / 180, (85 * Math.PI) / 180);
        applyCamera(e);
        return true;
      },
      up() { lookAt = null; return true; },
      click() { return true; },
    };
  }

  // ─────────── recording

  /**
   * Starts the first encoder of the process with a throw-away recording (the first H.264 / VP9 encoder takes
   * seconds to start: a short recording before it is ready comes out empty).
   */
  function warmUp(mime) {
    if (warmed?.mime === mime) return warmed.done;
    const done = (async () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      const stream = c.captureStream(0); const track = stream.getVideoTracks()[0];
      const r = new MediaRecorder(stream, { mimeType: mime });
      let size = 0; r.ondataavailable = (ev) => { size += ev.data.size; };
      r.start();
      const t0 = performance.now();
      for (let i = 0; size < 300 && performance.now() - t0 < 8000; i++) {
        g.fillStyle = i % 2 ? '#345' : '#543'; g.fillRect(0, 0, 64, 64); track.requestFrame?.();
        await sleep(100);
        if (i % 3 === 2) r.requestData();
      }
      const stopped = new Promise((res) => { r.onstop = res; }); r.stop(); await stopped;
      track.stop();
    })();
    warmed = { mime, done };
    return done;
  }

  /** The recording size: the window's, or 1280 × 720 / 1920 × 1080. */
  function sizeOf(res) {
    if (res === '720') return [1280, 720];
    if (res === '1080') return [1920, 1080];
    return null;
  }

  /**
   * Records the canvas: `drive(time)` sets the scene before each frame is drawn (`time`: the clock since the start,
   * on whole frames; return false to end). The size is fixed for the recording and restored after.
   * Returns { blob, mime, frames, seconds }.
   */
  async function record({ fps = 30, res = 'window', prefer = 'mp4', drive, manual = false }) {
    const v = vp();
    if (!v) return null;
    const mime = videoMime(prefer);
    if (!mime || !v.canvas.captureStream) { ctx.notify('error', t('video.unsupported')); return null; }
    await warmUp(mime);
    const fixed = sizeOf(res);
    if (fixed) v.fixSize?.(fixed[0], fixed[1]);
    const stream = v.canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const r = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: fixed?.[0] >= 1920 ? 16e6 : 8e6 });
    const chunks = []; let size = 0;
    r.ondataavailable = (ev) => { if (ev.data.size) { chunks.push(ev.data); size += ev.data.size; } };
    let stop = false;
    rec = { stop: () => { stop = true; }, manual, started: performance.now(), frames: 0 };
    ctx.renderLeft();
    r.start();
    const t0 = performance.now();
    let i = 0; let tEnd = t0;
    try {
      let shown = -1;
      for (;;) {
        if (stop) break;
        // The moment of this frame: its slot on the clock since the start. When drawing is slower than the
        // rate, slots are skipped (fewer frames) — the video keeps its real length and speed.
        const slot = Math.floor(((performance.now() - t0) * fps) / 1000 + 1e-6);
        const time = slot / fps;
        if (drive && drive(time, slot) === false) break;
        v.render();
        track.requestFrame?.();
        i += 1; rec.frames = i;
        if (Math.floor(time) !== shown) { shown = Math.floor(time); const out = document.querySelector('[data-video-clock]'); if (out) out.textContent = `${ctx.fmt(time, 1)} s`; }
        await sleep(Math.max(0, t0 + ((slot + 1) * 1000) / fps - performance.now()));
      }
    } finally {
      tEnd = performance.now();
      // WebM: the encoder may still be writing the last frames — ask for data until it stops growing. MP4 is
      // stopped at once (its muxer hands the whole file over at stop; asking for data pads the end with time).
      if (mime.startsWith('video/mp4')) await sleep(200);
      else {
        let lastSize = -1;
        for (let k = 0; k < 40 && (size < 300 || size !== lastSize); k++) { lastSize = size; r.requestData(); await sleep(150); }
      }
      const stopped = new Promise((res2) => { r.onstop = res2; }); r.stop(); await stopped;
      track.stop();
      if (fixed) v.releaseSize?.();
      v.requestRender();
      rec = null;
      ctx.renderLeft();
    }
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    return { blob, mime, frames: i, seconds: (tEnd - t0) / 1000 };
  }

  /** Saves a finished recording as a file. */
  async function save(out, base) {
    if (!out?.blob?.size) { ctx.notify('error', t('video.empty')); return false; }
    const ext = out.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    return ctx.saveExport(`${base}.${ext}`, ext, out.blob, out.mime.split(';')[0]);
  }

  /** A turntable: the camera orbiting the model `turns` times about Z through the current target. */
  function turntableDriver(duration, turns) {
    const v = vp(); const cam = v.cameraState();
    const d0 = cam.dir;
    return (time) => {
      if (time > duration) return false;
      const a = (2 * Math.PI * turns * time) / duration; const c = Math.cos(a); const s = Math.sin(a);
      const rot = (p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
      v.setCameraState({ ...cam, dir: rot(d0), up: rot(cam.up) });
      return true;
    };
  }

  /** The motion study playing from 0 to its end (or `duration`). */
  function motionDriver(duration) {
    return (time) => {
      if (time > duration) return false;
      ctx.motion.show(Math.min(time, duration));
      return true;
    };
  }

  function videoSettings() {
    const s = state.settings;
    return { source: s.videoSource ?? 'turntable', fps: clamp(Number(s.videoFps) || 30, 1, 60), duration: clamp(Number(s.videoDuration) || 6, 0.5, 600), turns: Number(s.videoTurns) || 1, res: s.videoRes ?? 'window', format: s.videoFormat ?? 'mp4' };
  }

  /** Records the chosen source and saves it. Returns the recording (tests). */
  async function recordVideo(over = {}) {
    if (rec) return null;
    const o = { ...videoSettings(), ...over };
    let drive = null; let manual = false;
    if (o.source === 'turntable') drive = turntableDriver(o.duration, o.turns);
    else if (o.source === 'motion') {
      if (!ctx.motion.available()) { ctx.notify('info', t('video.noMotion')); return null; }
      drive = motionDriver(over.duration ?? ctx.motion.duration());
    } else manual = true; // the live view: until Stop (or the longest duration)
    if (manual) { const limit = over.duration ?? 600; drive = (time) => time <= limit; }
    const saved = vp()?.cameraState();
    const out = await record({ fps: o.fps, res: o.res, prefer: o.format, drive, manual });
    if (o.source === 'turntable' && saved) vp()?.setCameraState(saved);
    if (o.source === 'motion') ctx.motion.show(0);
    if (!out) return null;
    if (over.keep) return out;
    await save(out, `${ctx.baseName()}-${o.source === 'turntable' ? 'turntable' : o.source === 'motion' ? 'motion' : 'view'}`);
    return out;
  }

  function startVideo() {
    if (!vp()) return;
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'video' };
    state.leftTab = 'pm';
    ctx.renderAll();
  }

  // ─────────── the PropertyManager pages

  const check = (key, on, label, glyph) => `<label class="pm-check" title="${escapeHtml(label)}"><input type="checkbox" data-pm-toggle="${escapeHtml(key)}" ${on ? 'checked' : ''}/>${icon(glyph, 'icon tiny')}<span>${escapeHtml(label)}</span></label>`;

  function recordButtons(source) {
    const { pmButton } = ctx.pm;
    return rec
      ? `<div class="pm-row-buttons">${pmButton('video.stop', 'stop', t('video.stop'), 'primary')}</div><p class="pm-note">${icon('record', 'icon tiny')} ${escapeHtml(t('video.recording'))} <b data-video-clock>${ctx.fmt((performance.now() - rec.started) / 1000, 1)} s</b></p>`
      : `<div class="pm-row-buttons">${pmButton(`video.record:${source}`, 'record', t('video.start'), 'primary')}</div>`;
  }

  function pm(e) {
    const { pmHead, pmGroup, pmNum, pmSeg } = ctx.pm;
    if (e.mode === 'walk') {
      return [
        pmHead('walkthrough', t('cmd.walkthrough'), t('walk.help')),
        pmGroup('gear', t('walk.settings'), [
          pmNum('walk.speed', e.speed, t('walk.speed'), 'motion', `${ctx.units()}/s`),
          pmNum('walk.eyeHeight', e.eyeHeight, t('walk.eyeHeight'), 'eye', ctx.units()),
          check('walk.gravity', e.gravity, t('walk.gravity'), 'arrowDown'),
          check('walk.collide', e.collide, t('walk.collide'), 'interference'),
        ].join('')),
        pmGroup('position', t('walk.position'), `<p class="pm-note">${escapeHtml(t('walk.eye'))}: <b data-walk-eye>${e.eye.map((c) => ctx.fmt(c, 0)).join(', ')}</b></p><p class="pm-note">${escapeHtml(t('walk.keys'))}</p>`),
        pmGroup('recordVideo', t('cmd.recordVideo'), recordButtons('view')),
      ].join('');
    }
    const o = videoSettings();
    const canMotion = ctx.motion.available();
    const mime = videoMime(o.format);
    return [
      pmHead('recordVideo', t('cmd.recordVideo'), t('video.help')),
      pmGroup('recordVideo', t('video.source'), [
        pmSeg('video.source', [['turntable', t('video.turntable'), 'orbitTool'], ['motion', t('video.motion'), 'motion'], ['view', t('video.view'), 'eye']], o.source),
        o.source === 'motion' && !canMotion ? `<p class="pm-note">${escapeHtml(t('video.noMotion'))}</p>` : '',
        o.source === 'turntable' ? pmNum('video.turns', o.turns, t('video.turns'), 'orbitTool') : '',
        o.source === 'turntable' ? pmNum('video.duration', o.duration, t('video.duration'), 'clock', 's') : '',
        o.source === 'motion' && canMotion ? `<p class="pm-note">${escapeHtml(t('video.motionLength', { seconds: ctx.fmt(ctx.motion.duration(), 2) }))}</p>` : '',
        o.source === 'view' ? `<p class="pm-note">${escapeHtml(t('video.viewHelp'))}</p>` : '',
      ].join('')),
      pmGroup('gear', t('video.output'), [
        pmNum('video.fps', o.fps, t('video.fps'), 'clock', 'fps'),
        pmSeg('video.res', [['window', t('video.resWindow'), 'fullscreen'], ['720', '1280 × 720', 'picture'], ['1080', '1920 × 1080', 'picture']], o.res),
        pmSeg('video.format', [['mp4', 'MP4', 'file'], ['webm', 'WebM', 'file']], o.format),
        `<p class="pm-note">${escapeHtml(mime ? t('video.type', { type: mime }) : t('video.unsupported'))}</p>`,
      ].join('')),
      pmGroup('record', t('video.recordGroup'), recordButtons(o.source)),
    ].join('');
  }

  function field(key, raw, v) {
    const e = editing();
    if (e?.mode === 'walk' && v != null) {
      if (key === 'walk.speed' && v > 0) { e.speed = v; ctx.updateSettings({ walkSpeed: v }); }
      if (key === 'walk.eyeHeight' && v > 0) { const dz = v - e.eyeHeight; e.eyeHeight = v; e.eye[2] += dz; ctx.updateSettings({ walkEyeHeight: v }); advance({}, 0); }
    }
    if (e?.mode === 'video' && v != null) {
      if (key === 'video.fps') ctx.updateSettings({ videoFps: clamp(Math.round(v), 1, 60) });
      if (key === 'video.duration' && v > 0) ctx.updateSettings({ videoDuration: clamp(v, 0.5, 600) });
      if (key === 'video.turns' && v !== 0) ctx.updateSettings({ videoTurns: clamp(v, -20, 20) });
    }
    return ctx.renderLeft();
  }
  function set(key, value) {
    if (key === 'video.source') ctx.updateSettings({ videoSource: value });
    if (key === 'video.res') ctx.updateSettings({ videoRes: value });
    if (key === 'video.format') ctx.updateSettings({ videoFormat: value });
    return ctx.renderLeft();
  }
  function toggle(key, on) {
    const e = editing();
    if (e?.mode === 'walk') {
      if (key === 'walk.gravity') { e.gravity = on; e.fall = 0; ctx.updateSettings({ walkGravity: on }); if (on) advance({}, 0); }
      if (key === 'walk.collide') { e.collide = on; ctx.updateSettings({ walkCollide: on }); }
    }
    return ctx.renderLeft();
  }
  const handles = (name) => name === 'video.stop' || name === 'video.record';
  function command(name, arg) {
    if (name === 'video.stop') { rec?.stop(); return undefined; }
    if (name === 'video.record') {
      if (arg === 'view') { void recordVideo({ source: 'view' }); return undefined; }
      void recordVideo({ source: arg });
    }
    return undefined;
  }
  function accept() {
    const e = editing();
    rec?.stop();
    if (e?.mode === 'walk') stopWalk(e, true);
    state.editing = null;
    return ctx.renderAll();
  }
  /** Leaving walk mode any other way (Cancel, another command): the view from before. */
  function cancel(e) {
    rec?.stop();
    if (e?.mode === 'walk') stopWalk(e, false);
  }
  const subject = (e) => t(e?.mode === 'walk' ? 'cmd.walkthrough' : 'cmd.recordVideo');

  const commands = {
    walkthrough: { icon: 'walkthrough', label: 'cmd.walkthrough', enabled: () => Boolean(vp()) && ctx.hasModel(), checked: () => editing()?.mode === 'walk', run: () => (editing()?.mode === 'walk' ? ctx.cancelEditing({ quiet: true }) : startWalk()) },
    recordVideo: { icon: 'recordVideo', label: 'cmd.recordVideo', enabled: () => Boolean(vp()) && ctx.hasModel(), checked: () => editing()?.mode === 'video', run: () => (editing()?.mode === 'video' ? ctx.cancelEditing({ quiet: true }) : startVideo()) },
  };
  const api = { advance, recordVideo, record, stop: () => rec?.stop(), recording: () => Boolean(rec), cast, videoMime };
  return { owns, pm, pick: () => undefined, dragTool, field, set, toggle, select: () => false, accept, cancel, subject, handles, command, commands, api };
}
