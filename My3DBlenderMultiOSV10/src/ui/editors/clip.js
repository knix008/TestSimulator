// The Movie Clip Editor: open a video or a run of pictures, place markers on features, follow them through the clip, stabilize,
// and solve the camera into the scene.
import { rgbaToLuma, createTrack, stabilizationOffsets, trackForward } from '../../core/tracking.js';
import { newId } from '../../core/doc.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { button, select, toggle, sidePanel } from '../widgets.js';

const frames = new Map();
const frameKey = (clip, n) => `${clip.id}|${n}`;

/** A clip's frame as { width, height, rgba, luma }; decoded once. */
export async function clipFrame(clip, n) {
  const key = frameKey(clip, n);
  if (frames.has(key)) return frames.get(key);
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (clip.kind === 'IMAGES') {
    const entry = clip.frames[n];
    if (!entry) return null;
    const image = new Image();
    image.src = entry.dataUrl;
    await image.decode();
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    g.drawImage(image, 0, 0);
  } else {
    if (n < 0 || n >= (clip.length ?? 0)) return null;
    const video = clip._video ??= Object.assign(document.createElement('video'), { src: clip.dataUrl, muted: true, preload: 'auto' });
    if (video.readyState < 1) await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('This video cannot be read')); });
    await new Promise((resolve) => { video.onseeked = resolve; video.currentTime = n / (clip.fps || 24); });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    g.drawImage(video, 0, 0);
  }
  const data = g.getImageData(0, 0, canvas.width, canvas.height);
  const frame = { width: canvas.width, height: canvas.height, rgba: data.data, ...rgbaToLuma({ width: canvas.width, height: canvas.height, rgba: data.data }) };
  if (frames.size > 400) frames.delete(frames.keys().next().value);
  frames.set(key, frame);
  return frame;
}

const clipLength = (clip) => (clip.kind === 'IMAGES' ? clip.frames.length : clip.length ?? 0);

export function createClipEditor(app, el, area) {
  const state = area.state ??= { clipId: null, trackId: null, stabilize: false, patch: 15, search: 12 };
  const canvas = h('canvas', { className: 'clip-canvas', dataset: { testid: 'clip-canvas' } });
  const note = h('div', { className: 'empty-note', style: { position: 'absolute' } });
  const list = h('div', { className: 'clip-tracks', dataset: { testid: 'clip-tracks' } });
  const root = h('div', { className: 'clip-editor', dataset: { testid: 'clip-editor' } }, h('div', { className: 'clip-view' }, canvas, note), sidePanel({ id: 'clip-tracks', side: 'right', icon: 'ed-clip', title: () => t('Tracks', '트랙'), body: list, store: state, onChange: () => app.invalidate() }));
  el.append(root);
  const clip = () => app.doc.clips?.find((c) => c.id === state.clipId) ?? app.doc.clips?.[0] ?? null;
  const frameIndex = (c) => Math.max(0, Math.min(clipLength(c) - 1, app.doc.frame - (c.start ?? 1)));
  let shownKey = '';
  const draw = async () => {
    const c = clip();
    note.style.display = c ? 'none' : '';
    note.textContent = t('Open a video or a run of pictures', '동영상이나 연속 이미지를 여세요');
    canvas.style.display = c ? '' : 'none';
    if (!c) return;
    const n = frameIndex(c);
    const key = JSON.stringify([c.id, n, c.tracks, state.trackId, state.stabilize]);
    if (key === shownKey) return;
    shownKey = key;
    const frame = await clipFrame(c, n);
    if (!frame) return;
    if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
    const g = canvas.getContext('2d');
    let shift = [0, 0];
    if (state.stabilize && c.tracks.length) shift = stabilizationOffsets(c.tracks, 0)[n] ?? [0, 0];
    g.fillStyle = '#111';
    g.fillRect(0, 0, canvas.width, canvas.height);
    const bitmap = new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height);
    g.putImageData(bitmap, Math.round(shift[0]), Math.round(shift[1]));
    const scale = Math.max(1, canvas.width / 640);
    g.lineWidth = scale;
    for (const track of c.tracks) {
      const active = track.id === state.trackId;
      g.strokeStyle = active ? '#ffd24d' : '#6fe36f';
      // The path so far.
      g.beginPath();
      let drawn = 0;
      for (const f of Object.keys(track.points).map(Number).sort((a, b) => a - b)) {
        const [x, y] = track.points[f];
        if (drawn++) g.lineTo(x + shift[0], y + shift[1]); else g.moveTo(x + shift[0], y + shift[1]);
      }
      g.stroke();
      const p = track.points[n];
      if (!p) continue;
      const half = (state.patch / 2) * 1;
      g.strokeRect(p[0] + shift[0] - half, p[1] + shift[1] - half, half * 2, half * 2);
    }
  };
  const syncList = () => {
    const c = clip();
    if (!c) { list.replaceChildren(); return; }
    list.replaceChildren(
      h('div', { className: 'note-line' }, `${c.name}: ${clipLength(c)} ${t('frames', '프레임')}`),
      ...c.tracks.map((track) => h('button', { type: 'button', className: `asset-cat${track.id === state.trackId ? ' on' : ''}`, dataset: { testid: `clip-track-${track.name}` }, onClick: () => { state.trackId = track.id; shownKey = ''; syncList(); draw(); } }, `${track.name} (${Object.keys(track.points).length})`)),
      c.solve ? h('div', { className: 'note-line', dataset: { testid: 'clip-solve-error' } }, `${t('Solve error', '풀이 오차')}: ${c.solve.error.toFixed(3)} px`) : '',
    );
  };
  // Adds a marker where the picture is clicked.
  canvas.addEventListener('pointerdown', (e) => {
    app.setActiveArea(area);
    const c = clip();
    if (!c || e.button !== 0) return;
    const r = canvas.getBoundingClientRect();
    const scale = Math.min(r.width / canvas.width, r.height / canvas.height);
    const [w, hh] = [canvas.width * scale, canvas.height * scale];
    const x = (e.clientX - r.left - (r.width - w) / 2) / scale;
    const y = (e.clientY - r.top - (r.height - hh) / 2) / scale;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const n = frameIndex(c);
    const hit = c.tracks.find((tr) => tr.points[n] && Math.hypot(tr.points[n][0] - x, tr.points[n][1] - y) < state.patch);
    if (hit) { state.trackId = hit.id; syncList(); shownKey = ''; draw(); return; }
    const track = createTrack(`Track.${String(c.tracks.length + 1).padStart(3, '0')}`, n, x, y);
    c.tracks.push(track);
    state.trackId = track.id;
    app.commit(t('Add Marker', '마커 추가'));
    syncList();
    shownKey = '';
    draw();
  });
  const track = async (direction, all = false) => {
    const c = clip();
    if (!c) return 0;
    const chosen = all ? c.tracks : c.tracks.filter((x) => x.id === state.trackId);
    if (!chosen.length) { app.status(t('Add a marker first: click on a feature', '먼저 특징점을 클릭해 마커를 추가하세요'), true); return 0; }
    const from = frameIndex(c);
    const to = direction > 0 ? clipLength(c) - 1 : 0;
    const order = [];
    for (let f = from; direction > 0 ? f <= to : f >= to; f += direction) order.push(f);
    const pictures = new Map();
    for (const f of order) pictures.set(f, await clipFrame(c, f));
    let added = 0;
    for (const tr of chosen) {
      if (!tr.points[from]) continue;
      added += trackForward(tr, (f) => pictures.get(f), from, to, { patch: state.patch, search: state.search });
    }
    app.commit(t('Track', '트래킹'));
    app.status(t(`${added} points tracked`, `${added}개 지점을 추적했습니다`));
    syncList();
    shownKey = '';
    draw();
    return added;
  };
  const ro = new ResizeObserver(() => { shownKey = ''; draw(); });
  ro.observe(root);
  syncList();
  draw();
  return {
    update() { syncList(); draw(); },
    frame() { draw(); },
    header(hdr) {
      const holder = h('span', {});
      const sync = () => holder.replaceChildren(select({ value: clip()?.id ?? '', options: (app.doc.clips ?? []).map((c) => [c.id, c.name]), testid: 'clip-pick', onChange: (v) => { state.clipId = v; shownKey = ''; syncList(); draw(); } }));
      sync();
      this.syncHeader = sync;
      hdr.append(holder,
        button(t('Open...', '열기...'), () => app.op('clip.open'), { icon: 'open', testid: 'clip-open' }),
        button(t('◀ Track', '◀ 추적'), () => track(-1), { testid: 'clip-track-back' }),
        button(t('Track ▶', '추적 ▶'), () => track(1), { testid: 'clip-track-forward' }),
        button(t('Track All ▶', '모두 추적 ▶'), () => track(1, true), { testid: 'clip-track-all' }),
        toggle({ value: state.stabilize, label: t('Stabilize', '안정화'), testid: 'clip-stabilize', onChange: (v) => { state.stabilize = v; shownKey = ''; draw(); } }),
        h('span', { className: 'hdr-fill' }),
        button(t('Solve Camera', '카메라 풀기'), () => app.op('clip.solve'), { testid: 'clip-solve', icon: 'camera' }),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Delete the active track', '활성 트랙 삭제'), dataset: { testid: 'clip-track-delete' }, onClick: () => { const c = clip(); if (!c) return; c.tracks = c.tracks.filter((x) => x.id !== state.trackId); state.trackId = null; app.commit(t('Delete Track', '트랙 삭제')); syncList(); shownKey = ''; draw(); } }, icon('delete', 13)),
      );
    },
    syncHeader() {},
    dispose() { ro.disconnect(); root.remove(); },
    api: { state, track, clip, canvas },
  };
}

void newId;
