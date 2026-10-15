// Video trimming: choose a start and an end on a
// preview, then the part in between is re-recorded (picture and sound) into a
// new WebM next to the original. The original is never changed.
import { joinPath, parentOf } from '../catalog/catalog.js';
import { stemOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { errorText } from '../platform/native.js';
import { reload } from '../store.js';
import { warmVideoEncoder } from './create.js';
import { field, openDialog, progressDialog, toast } from './dialog.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const clock = (s) => {
  if (!Number.isFinite(s)) return '–';
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};

/** Opens the trim dialog for a video item ({ path, name }). `at` = current playback time. */
export async function trimVideoDialog(item, at = 0) {
  const url = await fs.url(item.path);
  const preview = h('video.trim-preview', { src: url, controls: true, crossOrigin: 'anonymous', preload: 'auto' });
  await new Promise((resolve) => { preview.onloadedmetadata = resolve; preview.onerror = resolve; setTimeout(resolve, 5000); });
  const duration = Number.isFinite(preview.duration) ? preview.duration : 0;
  if (!duration) { toast(t('trim.noDuration'), 'error'); return null; }
  preview.currentTime = Math.min(at, duration);
  const start = h('input.input', { type: 'number', min: 0, max: duration, step: 0.1, value: 0, dataset: { key: 'trim-start' } });
  const end = h('input.input', { type: 'number', min: 0, max: duration, step: 0.1, value: Number(duration.toFixed(1)), dataset: { key: 'trim-end' } });
  const length = h('span.trim-length');
  const name = h('input.input', { type: 'text', value: `${stemOf(item.name)}_trim.webm`, dataset: { key: 'trim-name' } });
  const update = () => {
    const a = Math.max(0, Math.min(duration, Number(start.value) || 0));
    const b = Math.max(0, Math.min(duration, Number(end.value) || 0));
    length.textContent = b > a ? t('trim.length', { from: clock(a), to: clock(b), n: (b - a).toFixed(1) }) : t('trim.bad');
    length.classList.toggle('error', !(b > a));
  };
  for (const input of [start, end]) input.addEventListener('input', update);
  const here = (input) => () => { input.value = preview.currentTime.toFixed(1); update(); };
  update();
  const ok = await openDialog({
    title: t('trim.title', { name: item.name }), width: 640, id: 'trim-dialog',
    body: h('div.trim', preview,
      h('div.field-row',
        field(t('trim.start'), h('div.trim-point', start, h('button.btn.small', { type: 'button', dataset: { key: 'trim-set-start' }, title: t('trim.setHere'), onclick: here(start) }, h('span', { html: icon('flag') })))),
        field(t('trim.end'), h('div.trim-point', end, h('button.btn.small', { type: 'button', dataset: { key: 'trim-set-end' }, title: t('trim.setHere'), onclick: here(end) }, h('span', { html: icon('flag') }))))),
      length, field(t('edit.fileName'), name)),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('trim.run'), value: true, primary: true }],
    onSubmit: (value) => !value || Number(end.value) > Number(start.value),
  });
  preview.pause();
  preview.removeAttribute('src');
  if (!ok) return null;
  const from = Math.max(0, Number(start.value) || 0);
  const to = Math.min(duration, Number(end.value) || duration);
  const fileName = /\.webm$/i.test(name.value.trim()) ? name.value.trim() : `${name.value.trim() || `${stemOf(item.name)}_trim`}.webm`;
  try {
    const bytes = await recordPart(url, from, to);
    if (!bytes) return null;
    const target = joinPath(parentOf(item.path), fileName);
    const how = await fs.write(target, bytes);
    toast(how === 'downloaded' ? t('edit.downloaded') : t('trim.saved', { name: fileName }), 'success');
    await reload();
    return target;
  } catch (error) {
    toast(`${t('trim.failed')}: ${errorText(error)}`, 'error', 8000);
    return null;
  }
}

/** Plays from..to into a MediaRecorder (picture + sound) and returns the WebM bytes (null if cancelled). */
async function recordPart(url, from, to) {
  const progress = progressDialog(t('trim.recording'));
  const video = h('video', { src: url, crossOrigin: 'anonymous', preload: 'auto', playsInline: true });
  video.style.cssText = 'position:fixed;left:-10000px;top:0;width:4px;height:4px';
  document.body.append(video);
  let context = null;
  try {
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error(t('view.cannotOpen'))); });
    const stream = new MediaStream(video.captureStream().getVideoTracks());
    // Sound through Web Audio: recorded, not played aloud.
    try {
      context = new AudioContext();
      await context.resume().catch(() => {});
      const source = context.createMediaElementSource(video);
      const destination = context.createMediaStreamDestination();
      source.connect(destination);
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
    } catch { /* no sound track */ }
    const withAudio = stream.getAudioTracks().length > 0;
    const type = (withAudio ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'] : []).concat(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']).find((m) => MediaRecorder.isTypeSupported(m));
    progress.update(0, 1, t('create.preparingEncoder'));
    await warmVideoEncoder(type, video.videoWidth || 1280, video.videoHeight || 720);
    video.currentTime = from;
    await new Promise((resolve) => { video.onseeked = resolve; setTimeout(resolve, 3000); });
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    await video.play();
    await new Promise((resolve) => {
      const tick = () => {
        progress.update(Math.round((Math.max(0, video.currentTime - from) / (to - from)) * 100), 100, `${clock(video.currentTime)} / ${clock(to)}`);
        if (progress.cancelled || video.ended || video.currentTime >= to) { resolve(); return; }
        setTimeout(tick, 40);
      };
      tick();
    });
    video.pause();
    recorder.stop();
    await stopped;
    if (progress.cancelled) return null;
    return new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
  } finally {
    progress.close();
    video.remove();
    context?.close().catch(() => {});
  }
}
