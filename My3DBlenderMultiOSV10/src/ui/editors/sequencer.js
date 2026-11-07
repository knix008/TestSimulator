// The Video Sequence Editor: a preview above, strips on channels below. Images, text, scenes and movies become pictures here,
// where the screen is; how they combine is core/sequencer.js.
import { createStrip, addStrip, addTransition, compositeFrame, cutStrip, moveStrip, sequenceEnd, stripEnd, STRIP_BLENDS } from '../../core/sequencer.js';
import { getObject, newId, serialize, deserialize } from '../../core/doc.js';
import { SCENE_FIELDS, ensureScenes } from '../../core/scenes.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { menuTitle, openMenu } from '../menus.js';
import { button, colorField, numField, select, textField, sidePanel } from '../widgets.js';
import { renderRealtime } from '../render.js';

const COLORS = { COLOR: '#8a8f3c', IMAGE: '#8c5aa8', TEXT: '#5a8fa8', SCENE: '#4f8a55', MOVIE: '#4f6aa8', SOUND: '#3f9e93', CROSS: '#a86a4f', WIPE: '#a84f6a' };
const ROW = 24;
const RULER = 20;

/** A separate document holding just one scene, so it can be rendered without touching the current one. */
export function sceneDocument(doc, sceneId) {
  ensureScenes(doc);
  const copy = deserialize(serialize(doc));
  const target = copy.scenes.find((s) => s.id === sceneId);
  if (target?.state) Object.assign(copy, target.state);
  for (const key of SCENE_FIELDS) if (copy[key] === undefined) copy[key] = doc[key];
  return copy;
}

const pictureCache = new Map();
const cached = (key, make) => {
  if (!pictureCache.has(key)) {
    if (pictureCache.size > 48) pictureCache.delete(pictureCache.keys().next().value);
    pictureCache.set(key, make());
  }
  return pictureCache.get(key);
};

function textPicture(strip, width, height) {
  return cached(`text|${strip.text}|${strip.size}|${strip.color}|${width}|${height}`, () => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d');
    g.font = `600 ${Math.max(6, Math.round(height * (strip.size ?? 0.1)))}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = `rgb(${strip.color.map((x) => Math.round(x * 255)).join(',')})`;
    g.fillText(strip.text ?? '', width / 2, height / 2);
    return { width, height, rgba: g.getImageData(0, 0, width, height).data };
  });
}

const videoElements = new Map();
function moviePicture(app, strip, frame, width, height) {
  const clip = app.doc.clips?.find((c) => c.id === strip.clip);
  if (!clip) return null;
  const canvasKey = `movie|${clip.id}|${frame}|${width}`;
  if (pictureCache.has(canvasKey)) return pictureCache.get(canvasKey);
  if (clip.kind === 'IMAGES') {
    const entry = clip.frames[Math.max(0, Math.min(clip.frames.length - 1, frame))];
    return cached(`image|${clip.id}|${frame}`, () => {
      const picture = { width: clip.width, height: clip.height, rgba: new Uint8ClampedArray(clip.width * clip.height * 4) };
      const image = new Image();
      image.onload = () => { const c = document.createElement('canvas'); c.width = clip.width; c.height = clip.height; const g = c.getContext('2d'); g.drawImage(image, 0, 0); picture.rgba = g.getImageData(0, 0, clip.width, clip.height).data; app.invalidate(); };
      image.src = entry.dataUrl;
      return picture;
    });
  }
  let video = videoElements.get(clip.id);
  if (!video) {
    video = document.createElement('video');
    video.src = clip.dataUrl;
    video.muted = true;
    videoElements.set(clip.id, video);
  }
  const time = frame / (clip.fps || 24);
  const hold = cached(`moviehold|${clip.id}`, () => ({ width: 2, height: 2, rgba: new Uint8ClampedArray(16) }));
  if (Math.abs(video.currentTime - time) > 0.02 && video.readyState >= 1) {
    video.currentTime = Math.min(time, video.duration || time);
    video.onseeked = () => {
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const g = c.getContext('2d');
      g.drawImage(video, 0, 0);
      hold.width = c.width;
      hold.height = c.height;
      hold.rgba = g.getImageData(0, 0, c.width, c.height).data;
      app.invalidate();
    };
  }
  return hold;
}

export function createSequencer(app, el, area) {
  const state = area.state ??= { offset: 0, zoom: 8, scroll: 0, selected: null, split: 0.55 };
  const preview = h('canvas', { className: 'seq-preview', dataset: { testid: 'seq-preview' } });
  const timeline = h('canvas', { className: 'seq-timeline', tabIndex: 0, dataset: { testid: 'seq-timeline' } });
  const props = h('div', { className: 'seq-props', dataset: { testid: 'seq-props' } });
  const root = h('div', { className: 'sequencer', dataset: { testid: 'sequencer' } }, h('div', { className: 'seq-top' }, h('div', { className: 'seq-view' }, preview), sidePanel({ id: 'seq-props', side: 'right', icon: 'ed-properties', title: () => t('Strip', '스트립'), body: props, store: state, onChange: () => app.invalidate() })), timeline);
  el.append(root);
  const seq = () => { const d = app.doc; d.sequence ??= { strips: [], channels: 8 }; return d.sequence; };
  const selected = () => seq().strips.find((s) => s.id === state.selected) ?? null;
  let dirty = true;
  const redraw = () => { dirty = true; app.requestFrame(); };

  const provider = (strip, frame, width, height) => {
    if (strip.type === 'IMAGE') { const e = app.imageCache?.()[strip.image]; return e ? { width: e.width, height: e.height, rgba: e.rgba } : null; }
    if (strip.type === 'TEXT') return textPicture(strip, width, height);
    if (strip.type === 'MOVIE') return moviePicture(app, strip, frame, width, height);
    if (strip.type === 'SCENE') {
      return cached(`scene|${strip.scene}|${strip.start + frame}|${app.doc._rev}|${width}`, () => {
        const other = strip.scene ? sceneDocument(app.doc, strip.scene) : deserialize(serialize(app.doc));
        other.frame = strip.start + frame;
        other.render = { ...other.render, width, height, percent: 100, engine: 'REALTIME', freestyle: { enabled: false } };
        other.compositorEnabled = false;
        if (!getObject(other, other.activeCamera)) return null;
        const r = renderRealtime(other, app.imageCache?.() ?? {});
        return { width: r.width, height: r.height, rgba: r.display };
      });
    }
    return null;
  };

  const previewSize = () => {
    const r = app.doc.render;
    const w = Math.max(16, Math.round((r.width * r.percent) / 100));
    const hh = Math.max(16, Math.round((r.height * r.percent) / 100));
    const cap = Math.min(1, 640 / w);
    return [Math.round(w * cap), Math.round(hh * cap)];
  };
  const drawPreview = () => {
    const [w, hh] = previewSize();
    if (preview.width !== w || preview.height !== hh) { preview.width = w; preview.height = hh; }
    const data = compositeFrame(seq(), app.doc.frame, w, hh, provider);
    preview.getContext('2d').putImageData(new ImageData(data, w, hh), 0, 0);
  };

  const toX = (frame) => (frame - state.scroll) * state.zoom;
  const toFrame = (x) => Math.round(x / state.zoom + state.scroll);
  const toChannel = (y, H) => Math.max(1, Math.floor((H - y) / ROW) + 1);
  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const drawTimeline = () => {
    const r = timeline.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (timeline.width !== Math.round(r.width * dpr) || timeline.height !== Math.round(r.height * dpr)) { timeline.width = Math.round(r.width * dpr); timeline.height = Math.round(r.height * dpr); }
    const g = timeline.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [W, H] = [r.width, r.height];
    g.fillStyle = css('--panel') || '#2b2b2b';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = css('--line') || '#444';
    g.lineWidth = 1;
    g.font = '11px sans-serif';
    for (let c = 0; c * ROW < H - RULER; c++) { const y = H - c * ROW + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const stepFrames = Math.max(1, [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].find((s) => s * state.zoom > 56) ?? 1000);
    g.fillStyle = css('--muted') || '#999';
    for (let f = Math.ceil(state.scroll / stepFrames) * stepFrames; toX(f) < W; f += stepFrames) { g.fillRect(toX(f), 0, 1, RULER); g.fillText(String(f), toX(f) + 3, 13); }
    for (const s of seq().strips) {
      const [x, y, w] = [toX(s.start), H - s.channel * ROW + 1, s.length * state.zoom];
      if (x + w < 0 || x > W || y < RULER - ROW) continue;
      g.globalAlpha = s.mute ? 0.4 : 1;
      g.fillStyle = COLORS[s.type];
      g.fillRect(x, y, w, ROW - 2);
      g.globalAlpha = 1;
      if (s.id === state.selected) { g.strokeStyle = css('--accent') || '#ef8b3c'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, ROW - 4); g.lineWidth = 1; g.strokeStyle = css('--line') || '#444'; }
      g.fillStyle = '#fff';
      g.save();
      g.beginPath();
      g.rect(x, y, w, ROW - 2);
      g.clip();
      g.fillText(`${s.name} | ${s.length}`, x + 5, y + 15);
      g.restore();
    }
    const px = toX(app.doc.frame);
    g.fillStyle = css('--accent') || '#ef8b3c';
    g.fillRect(px, 0, 1.5, H);
    g.fillRect(px - 12, 2, 26, 15);
    g.fillStyle = '#fff';
    g.fillText(String(app.doc.frame), px - 9, 13);
  };

  const hit = (e) => {
    const r = timeline.getBoundingClientRect();
    const [x, y] = [e.clientX - r.left, e.clientY - r.top];
    const strip = seq().strips.find((s) => { const [sx, sy, w] = [toX(s.start), r.height - s.channel * ROW + 1, s.length * state.zoom]; return x >= sx && x <= sx + w && y >= sy && y <= sy + ROW - 2; });
    return { strip, x, y, H: r.height };
  };
  timeline.addEventListener('pointerdown', (e) => {
    app.setActiveArea(area);
    timeline.focus({ preventScroll: true });
    if (e.button === 2) return;
    const win = timeline.ownerDocument.defaultView;
    const at = hit(e);
    if (e.button === 1 || e.altKey) {
      const start = state.scroll;
      const move = (m) => { state.scroll = start - (m.clientX - e.clientX) / state.zoom; redraw(); };
      const up = () => { win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up); };
      win.addEventListener('pointermove', move);
      win.addEventListener('pointerup', up);
      return;
    }
    if (at.y < RULER || !at.strip) {
      state.selected = at.y < RULER ? state.selected : null;
      const scrub = (m) => { const r = timeline.getBoundingClientRect(); app.setFrame(toFrame(m.clientX - r.left)); };
      scrub(e);
      const up = () => { win.removeEventListener('pointermove', scrub); win.removeEventListener('pointerup', up); };
      win.addEventListener('pointermove', scrub);
      win.addEventListener('pointerup', up);
      syncProps();
      return;
    }
    state.selected = at.strip.id;
    syncProps();
    redraw();
    const strip = at.strip;
    const [start, channel] = [strip.start, strip.channel];
    let moved = false;
    const move = (m) => {
      const df = Math.round((m.clientX - e.clientX) / state.zoom);
      const dc = -Math.round((m.clientY - e.clientY) / ROW);
      if (!df && !dc && !moved) return;
      moved = true;
      moveStrip(seq(), strip, start + df, channel + dc);
      app.touch();
      redraw();
    };
    const up = () => {
      win.removeEventListener('pointermove', move);
      win.removeEventListener('pointerup', up);
      if (moved) app.commit(t('Move Strip', '스트립 이동'));
    };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
  });
  timeline.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = timeline.getBoundingClientRect();
    const before = (e.clientX - r.left) / state.zoom + state.scroll;
    state.zoom = Math.max(0.5, Math.min(60, state.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
    state.scroll = before - (e.clientX - r.left) / state.zoom;
    redraw();
  }, { passive: false });
  const add = (type, init = {}) => {
    const strip = createStrip(type, { start: app.doc.frame, channel: 1, ...init });
    try { addStrip(seq(), strip); } catch (error) { app.status(error.message, true); return null; }
    state.selected = strip.id;
    app.commit(t('Add Strip', '스트립 추가'));
    syncProps();
    redraw();
    return strip;
  };
  const addMenu = () => [
    { label: t('Color', '색'), testid: 'seq-add-COLOR', onClick: () => add('COLOR') },
    { label: t('Text', '텍스트'), testid: 'seq-add-TEXT', onClick: () => add('TEXT', { color: [1, 1, 1], channel: 2 }) },
    { label: t('Image', '이미지'), disabled: !app.doc.images.length, items: app.doc.images.map((i) => ({ label: i.name, testid: `seq-add-image-${i.name}`, onClick: () => add('IMAGE', { name: i.name, image: i.id }) })) },
    { label: t('Scene', '장면'), testid: 'seq-add-scene', items: (app.doc.scenes ?? []).map((s) => ({ label: s.name, testid: `seq-add-scene-${s.name}`, onClick: () => add('SCENE', { name: s.name, scene: s.id }) })) },
    { label: t('Movie Clip', '동영상 클립'), disabled: !app.doc.clips?.length, items: (app.doc.clips ?? []).map((c) => ({ label: c.name, onClick: () => add('MOVIE', { name: c.name, clip: c.id, length: c.kind === 'IMAGES' ? c.frames.length : c.length ?? 100 }) })) },
    { label: t('Sound...', '소리...'), testid: 'seq-add-sound', onClick: () => app.op('sequencer.sound_add') },
  ];
  const removeSelected = () => {
    const s = selected();
    if (!s) return;
    seq().strips = seq().strips.filter((x) => x !== s && x.a !== s.id && x.b !== s.id);
    state.selected = null;
    app.commit(t('Delete Strip', '스트립 삭제'));
    syncProps();
    redraw();
  };
  const cut = () => {
    const s = selected() ?? seq().strips.find((x) => app.doc.frame > x.start && app.doc.frame < stripEnd(x));
    if (!s) return;
    const right = cutStrip(seq(), s, app.doc.frame);
    if (!right) { app.status(t('The playhead is not inside the strip', '재생 헤드가 스트립 안에 없습니다')); return; }
    state.selected = right.id;
    app.commit(t('Cut Strip', '스트립 자르기'));
    syncProps();
    redraw();
  };
  const transition = (type) => {
    const s = selected();
    const other = s && seq().strips.find((x) => x !== s && x.type !== 'CROSS' && x.type !== 'WIPE' && x.start < stripEnd(s) && s.start < stripEnd(x));
    if (!s || !other) { app.status(t('Select a strip that overlaps another in time', '다른 스트립과 시간이 겹치는 스트립을 선택하세요'), true); return; }
    const made = addTransition(seq(), other.start <= s.start ? other : s, other.start <= s.start ? s : other, type);
    if (made) { state.selected = made.id; app.commit(t('Add Transition', '전환 추가')); syncProps(); redraw(); }
  };
  timeline.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(addMenu(), e.clientX, e.clientY); });

  const syncProps = () => {
    const s = selected();
    if (!s) { props.replaceChildren(h('div', { className: 'note-line' }, t('Select a strip', '스트립을 선택하세요'))); return; }
    const change = (key, label) => (v, final = true) => { s[key] = v; app.changed(label, final); redraw(); };
    const row = (label, control) => h('div', { className: 'prop-row' }, h('span', { className: 'prop-label' }, label), control);
    const fields = [
      row(t('Name', '이름'), textField({ value: s.name, onChange: change('name', 'Name') })),
      row(t('Start', '시작'), numField({ value: s.start, int: true, step: 1, testid: 'seq-start', onChange: (v, f) => { moveStrip(seq(), s, v); app.changed('Move Strip', f); redraw(); } })),
      row(t('Length', '길이'), numField({ value: s.length, int: true, step: 1, min: 1, testid: 'seq-length', onChange: change('length', 'Length') })),
      row(t('Channel', '채널'), numField({ value: s.channel, int: true, step: 1, min: 1, max: 8, onChange: (v, f) => { moveStrip(seq(), s, s.start, v); app.changed('Move Strip', f); redraw(); } })),
    ];
    if (s.type !== 'SOUND' && s.type !== 'CROSS' && s.type !== 'WIPE') {
      fields.push(row(t('Opacity', '불투명도'), numField({ value: s.opacity, step: 0.05, min: 0, max: 1, testid: 'seq-opacity', onChange: change('opacity', 'Opacity') })));
      fields.push(row(t('Blend', '혼합'), select({ value: s.blend, options: STRIP_BLENDS, testid: 'seq-blend', onChange: change('blend', 'Blend') })));
      fields.push(row('X', numField({ value: s.x, step: 0.01, onChange: change('x', 'Position') })));
      fields.push(row('Y', numField({ value: s.y, step: 0.01, onChange: change('y', 'Position') })));
      fields.push(row(t('Scale', '크기'), numField({ value: s.scale, step: 0.05, min: 0.01, onChange: change('scale', 'Scale') })));
    }
    if (s.type === 'COLOR' || s.type === 'TEXT') fields.push(row(t('Color', '색'), colorField({ value: s.color, onChange: change('color', 'Color') })));
    if (s.type === 'TEXT') {
      fields.push(row(t('Text', '내용'), textField({ value: s.text, testid: 'seq-text', onChange: change('text', 'Text') })));
      fields.push(row(t('Size', '크기'), numField({ value: s.size, step: 0.01, min: 0.01, onChange: change('size', 'Size') })));
    }
    fields.push(button(t('Mute', '음소거·숨김'), () => { s.mute = !s.mute; app.changed('Mute', true); redraw(); }, { className: s.mute ? 'primary' : '', testid: 'seq-mute' }));
    props.replaceChildren(...fields);
  };
  syncProps();

  const exportVideo = async () => {
    const [w, hh] = previewSize();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hh;
    const g = c.getContext('2d');
    const type = ['video/webm;codecs=vp9', 'video/webm'].find((m) => window.MediaRecorder?.isTypeSupported(m));
    if (!type) throw new Error('This browser cannot record video');
    const stream = c.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    const end = sequenceEnd(seq());
    const start = seq().strips.reduce((m, s) => Math.min(m, s.start), end);
    const frameMs = 1000 / (app.doc.fps || 24);
    for (let f = start; f <= end; f++) {
      const data = compositeFrame(seq(), f, w, hh, provider);
      g.putImageData(new ImageData(data, w, hh), 0, 0);
      track.requestFrame();
      // The recorder keeps time by the clock: a frame must really last its frame.
      await new Promise((r) => setTimeout(r, frameMs));
    }
    recorder.stop();
    await finished;
    return new Blob(chunks, { type: 'video/webm' });
  };
  app.exportSequenceVideo = exportVideo;

  const ro = new ResizeObserver(redraw);
  ro.observe(timeline);
  return {
    update() { syncProps(); redraw(); },
    frame() { if (dirty || app.playing) { dirty = false; drawTimeline(); drawPreview(); } },
    header(hdr) {
      hdr.append(
        menuTitle(t('Add', '추가'), addMenu, 'menu-seq-add'),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Cut at the playhead (K)', '재생 헤드에서 자르기 (K)'), dataset: { testid: 'seq-cut' }, onClick: cut }, icon('tool-knife', 13)),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Delete the strip (X)', '스트립 삭제 (X)'), dataset: { testid: 'seq-delete' }, onClick: removeSelected }, icon('delete', 13)),
        button(t('Cross', '크로스'), () => transition('CROSS'), { testid: 'seq-cross' }),
        button(t('Wipe', '와이프'), () => transition('WIPE'), { testid: 'seq-wipe' }),
        h('span', { className: 'hdr-fill' }),
        button(t('Export Video', '동영상 내보내기'), () => app.op('sequencer.export_video'), { testid: 'seq-export', icon: 'export' }),
      );
    },
    onKey(e) {
      const key = e.key.toLowerCase();
      if (key === 'k') { cut(); return true; }
      if (key === 'x' || e.key === 'Delete') { removeSelected(); return true; }
      if (key === 'a' && e.shiftKey) { const r = timeline.getBoundingClientRect(); openMenu(addMenu(), r.left + 20, r.top + 20); return true; }
      return false;
    },
    dispose() { ro.disconnect(); root.remove(); },
    api: { state, add, cut, selected, seq, drawPreview, exportVideo, preview, transition, toX },
  };
}

void newId;
