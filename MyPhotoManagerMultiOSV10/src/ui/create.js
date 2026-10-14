// Create menu: PDF, animated GIF, panorama, HDR, focus stack, slideshow
// (WebM video or a standalone HTML page), ZIP archive — and opening ZIP
// archives as read-only folders.
import { baseName, joinPath, parentOf } from '../catalog/catalog.js';
import { encodeGif } from '../create/gif.js';
import { buildPdf } from '../create/pdf.js';
import { stitch } from '../create/panorama.js';
import { stitchPerspective } from '../create/homography.js';
import { alignExposures, fuseExposures } from '../create/hdr.js';
import { focusStack } from '../create/focus.js';
import { canvasToBlob, context2d, makeCanvas, scaledCanvas } from '../formats/canvas.js';
import { decodeImage } from '../formats/decode.js';
import { encodeCanvas } from '../formats/encode.js';
import { extensionOf, isMedia, kindOf, mimeOf, stemOf } from '../formats/types.js';
import { readZip, extractZip, writeZip } from '../formats/zip.js';
import { plural, t } from '../i18n.js';
import { fs, webFs } from '../platform/fs.js';
import { chooseSavePath, errorText, isDesktop } from '../platform/native.js';
import { app, openFolder, reload } from '../store.js';
import { field, openDialog, progressDialog, selectEl, toast } from './dialog.js';
import { h } from './dom.js';
import { musicBytes, musicField } from './slideshow.js';

const images = (items) => items.filter((item) => !item.isDir && kindOf(item.name) && kindOf(item.name) !== 'video');

async function pixels(item, maxSize) {
  const decoded = await decodeImage(await fs.read(item.path), item.name, { maxSize });
  const canvas = makeCanvas(decoded.source.width, decoded.source.height);
  context2d(canvas).drawImage(decoded.source, 0, 0);
  return context2d(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
}

const toCanvas = (image) => {
  const canvas = makeCanvas(image.width, image.height);
  context2d(canvas).putImageData(new ImageData(image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas;
};

/** Saves `bytes` next to the photos (desktop: a save dialog; read-only web folder: download). */
async function saveOutput(bytes, suggested, { filters } = {}) {
  const folder = app.state.source.type === 'folder' ? app.state.source.path : null;
  let target;
  if (isDesktop()) {
    target = await chooseSavePath(folder ? joinPath(folder, suggested) : suggested, filters);
    if (!target) return null;
  } else {
    target = folder && !fs.isReadOnly?.(folder) ? joinPath(folder, suggested) : `@0:download/${suggested}`;
  }
  if (target.startsWith('@0:')) {
    const url = URL.createObjectURL(new Blob([bytes]));
    const link = h('a', { href: url, download: suggested });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast(t('create.downloaded', { name: suggested }), 'success');
    return null;
  }
  await fs.write(target, bytes);
  toast(t('create.saved', { name: baseName(target) }), 'success');
  if (folder && parentOf(target) === folder) await reload();
  return target;
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');

async function withProgress(title, work) {
  const progress = progressDialog(title, { cancellable: true });
  try {
    return await work(progress);
  } catch (error) {
    toast(errorText(error), 'error', 8000);
    return null;
  } finally {
    progress.close();
  }
}

// ───────────────────────── PDF

export async function createPdf(items) {
  const list = images(items);
  if (!list.length) return;
  const page = selectEl([['image', t('create.pageImage')], ['a4', 'A4'], ['letter', 'Letter']], 'a4');
  const orientation = selectEl([['auto', t('create.auto')], ['portrait', t('print.portrait')], ['landscape', t('print.landscape')]], 'auto');
  const margin = h('input.input', { type: 'number', min: 0, max: 100, value: 10 });
  const maxSide = h('input.input', { type: 'number', min: 400, max: 8000, value: 2400 });
  const quality = h('input.input', { type: 'number', min: 30, max: 100, value: 85 });
  const title = h('input.input', { type: 'text', value: app.state.source.title ?? baseName(app.state.source.path ?? '') ?? 'Photos' });
  const ok = await openDialog({
    title: plural('create.pdfTitle', list.length), width: 520,
    body: h('div', h('div.field-row', field(t('print.page'), page), field(t('print.orientation'), orientation)), h('div.field-row', field(t('print.margin'), margin), field(t('create.maxSide'), maxSide), field(t('edit.quality'), quality)), field(t('create.docTitle'), title)),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('create.make'), value: true, primary: true }],
  });
  if (!ok) return;
  const sizes = { a4: [595.28, 841.89], letter: [612, 792] };
  const bytes = await withProgress(t('create.making'), async (progress) => {
    const pages = [];
    for (const [i, item] of list.entries()) {
      if (progress.cancelled) return null;
      progress.update(i, list.length, item.name);
      const decoded = await decodeImage(await fs.read(item.path), item.name, { maxSize: Number(maxSide.value) || 2400 });
      const jpeg = await encodeCanvas(decoded.source.getContext ? decoded.source : toCanvas(await pixels(item, Number(maxSide.value))), 'jpeg', { quality: (Number(quality.value) || 85) / 100 });
      const { width, height } = decoded.source;
      const m = (Number(margin.value) || 0) * 2.8346;
      let pageWidth = width * 0.75 + m * 2;
      let pageHeight = height * 0.75 + m * 2;
      if (page.value !== 'image') {
        [pageWidth, pageHeight] = sizes[page.value];
        const landscape = orientation.value === 'landscape' || (orientation.value === 'auto' && width > height);
        if (landscape) [pageWidth, pageHeight] = [pageHeight, pageWidth];
      }
      pages.push({ jpeg, width, height, pageWidth, pageHeight, fit: 'contain', margin: m });
    }
    return buildPdf(pages, { title: title.value, creator: 'MyPhotoManager' });
  });
  if (bytes) await saveOutput(bytes, `${title.value || 'photos'}.pdf`, { filters: [{ name: 'PDF', extensions: ['pdf'] }] });
}

// ───────────────────────── animated GIF

export async function createGif(items) {
  const list = images(items);
  if (list.length < 1) return;
  const size = h('input.input', { type: 'number', min: 32, max: 2000, value: 640 });
  const delay = h('input.input', { type: 'number', min: 20, max: 10000, value: 500 });
  const loop = h('input', { type: 'checkbox', checked: true });
  const dither = h('input', { type: 'checkbox', checked: false });
  const ok = await openDialog({
    title: plural('create.gifTitle', list.length), width: 460,
    body: h('div', h('div.field-row', field(t('create.longSide'), size), field(t('create.delay'), delay)), h('label.check', loop, t('slideshow.loop')), h('label.check', dither, t('create.dither'))),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('create.make'), value: true, primary: true }],
  });
  if (!ok) return;
  const bytes = await withProgress(t('create.making'), async (progress) => {
    const frames = [];
    const max = Number(size.value) || 640;
    let w = 0;
    let hgt = 0;
    for (const [i, item] of list.entries()) {
      if (progress.cancelled) return null;
      progress.update(i, list.length, item.name);
      frames.push({ image: await pixels(item, max), delay: Number(delay.value) || 500 });
      w = Math.max(w, frames[frames.length - 1].image.width);
      hgt = Math.max(hgt, frames[frames.length - 1].image.height);
    }
    // Same canvas for every frame: centre smaller frames on black.
    const fitted = frames.map(({ image, delay: d }) => {
      if (image.width === w && image.height === hgt) return { image, delay: d };
      const canvas = makeCanvas(w, hgt);
      const c = context2d(canvas, { willReadFrequently: true });
      c.fillStyle = '#000'; c.fillRect(0, 0, w, hgt);
      c.drawImage(toCanvas(image), (w - image.width) / 2, (hgt - image.height) / 2);
      return { image: c.getImageData(0, 0, w, hgt), delay: d };
    });
    progress.update(list.length, list.length, t('create.encoding'));
    await new Promise((r) => setTimeout(r, 20));
    return encodeGif(fitted, { loop: loop.checked ? 0 : null, dither: dither.checked });
  });
  if (bytes) await saveOutput(bytes, `animation-${stamp()}.gif`, { filters: [{ name: 'GIF', extensions: ['gif'] }] });
}

// ───────────────────────── panorama / HDR / focus stack

async function mergeDialog(title, list, extra = []) {
  const max = h('input.input', { type: 'number', min: 500, max: 12000, value: 4000 });
  const format = selectEl([['jpeg', 'JPEG'], ['png', 'PNG'], ['tiff', 'TIFF']], 'jpeg');
  const ok = await openDialog({
    title, width: 460,
    body: h('div', h('p.hint', list.map((i) => i.name).join(', ')), h('div.field-row', field(t('create.maxSide'), max), field(t('edit.format'), format)), ...extra),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('create.make'), value: true, primary: true }],
  });
  return ok ? { max: Number(max.value) || 4000, format: format.value } : null;
}

async function saveImage(image, base, format) {
  const ext = format === 'jpeg' ? 'jpg' : format === 'tiff' ? 'tif' : 'png';
  const bytes = await encodeCanvas(toCanvas(image), format, { quality: app.settings.jpegQuality / 100 });
  await saveOutput(bytes, `${base}-${stamp()}.${ext}`, { filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
}

export async function createPanorama(items) {
  const list = images(items);
  if (list.length < 2) { toast(t('create.needTwo'), 'info'); return; }
  const direction = selectEl([['auto', t('create.auto')], ['horizontal', t('create.horizontal')], ['vertical', t('create.vertical')]], 'auto');
  const projection = selectEl([['auto', t('create.projectionAuto')], ['perspective', t('create.projectionPerspective')], ['shift', t('create.projectionShift')]], 'auto');
  projection.dataset.key = 'panorama-projection';
  const options = await mergeDialog(plural('create.panoramaTitle', list.length), list, [field(t('create.projection'), projection), field(t('create.direction'), direction), h('p.hint', t('create.panoramaHint'))]);
  if (!options) return;
  const result = await withProgress(t('create.stitching'), async (progress) => {
    const loaded = [];
    for (const [i, item] of list.entries()) { progress.update(i, list.length + 1, item.name); loaded.push(await pixels(item, options.max)); }
    progress.update(list.length, list.length + 1, t('create.stitching'));
    await new Promise((r) => setTimeout(r, 20));
    // Perspective first (photos taken by turning the camera); shifting only when that does not match.
    if (projection.value !== 'shift') {
      const warped = stitchPerspective(loaded);
      if (warped) return { ...warped, projection: 'perspective' };
      if (projection.value === 'perspective') toast(t('create.perspectiveFailed'), 'info', 6000);
    }
    return { ...stitch(loaded, { direction: direction.value }), projection: 'shift' };
  });
  if (result) await saveImage(result.image, 'panorama', options.format === 'jpeg' ? 'png' : options.format);
}

export async function createHdr(items) {
  const list = images(items);
  if (list.length < 2) { toast(t('create.needTwo'), 'info'); return; }
  const align = h('input', { type: 'checkbox', checked: true });
  const options = await mergeDialog(plural('create.hdrTitle', list.length), list, [h('label.check', align, t('create.align'))]);
  if (!options) return;
  const result = await withProgress(t('create.merging'), async (progress) => {
    let loaded = [];
    for (const [i, item] of list.entries()) { progress.update(i, list.length + 1, item.name); loaded.push(await pixels(item, options.max)); }
    const w = Math.min(...loaded.map((i) => i.width));
    const hh = Math.min(...loaded.map((i) => i.height));
    loaded = loaded.map((image) => (image.width === w && image.height === hh ? image : context2d(scaledTo(image, w, hh), { willReadFrequently: true }).getImageData(0, 0, w, hh)));
    progress.update(list.length, list.length + 1, t('create.merging'));
    await new Promise((r) => setTimeout(r, 20));
    if (align.checked) loaded = alignExposures(loaded).images;
    return fuseExposures(loaded);
  });
  if (result) await saveImage(result, 'hdr', options.format);
}

export async function createFocusStack(items) {
  const list = images(items);
  if (list.length < 2) { toast(t('create.needTwo'), 'info'); return; }
  const align = h('input', { type: 'checkbox', checked: true });
  const options = await mergeDialog(plural('create.focusTitle', list.length), list, [h('label.check', align, t('create.align'))]);
  if (!options) return;
  const result = await withProgress(t('create.merging'), async (progress) => {
    const loaded = [];
    for (const [i, item] of list.entries()) { progress.update(i, list.length + 1, item.name); loaded.push(await pixels(item, options.max)); }
    const w = Math.min(...loaded.map((i) => i.width));
    const hh = Math.min(...loaded.map((i) => i.height));
    const same = loaded.map((image) => (image.width === w && image.height === hh ? image : context2d(scaledTo(image, w, hh), { willReadFrequently: true }).getImageData(0, 0, w, hh)));
    await new Promise((r) => setTimeout(r, 20));
    return focusStack(same, { align: align.checked });
  });
  if (result) await saveImage(result, 'focus-stack', options.format);
}

function scaledTo(image, w, hh) {
  const canvas = makeCanvas(w, hh);
  context2d(canvas).drawImage(toCanvas(image), 0, 0, w, hh);
  return canvas;
}

// ───────────────────────── slideshow export

/**
 * Chromium's first video encoder of a session takes seconds to start; a short
 * recording made before then holds no frames. A throwaway recording runs until
 * the encoder delivers data (at most 8 s), once per session.
 */
let encoderWarm = null;
export function warmVideoEncoder(type, width, height) {
  encoderWarm ??= (async () => {
    const canvas = h('canvas', { width: Math.min(width, 640), height: Math.min(height, 360) });
    const c = canvas.getContext('2d');
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const recorder = new MediaRecorder(stream, { mimeType: type });
    let encoded = 0;
    recorder.ondataavailable = (e) => { encoded += e.data.size; };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    const started = performance.now();
    for (let i = 0; performance.now() - started < 8000 && encoded < 1000; i++) {
      c.fillStyle = `hsl(${(i * 7) % 360}, 60%, 50%)`;
      c.fillRect(0, 0, canvas.width, canvas.height);
      track.requestFrame?.();
      await new Promise((resolve) => setTimeout(resolve, 33));
      if (i % 15 === 14) recorder.requestData();
    }
    recorder.stop();
    await stopped;
  })();
  encoderWarm.catch(() => { encoderWarm = null; });
  return encoderWarm;
}

export async function exportSlideshow(items) {
  const list = images(items);
  if (!list.length) return;
  const kind = selectEl([['video', t('create.video')], ['html', t('create.htmlPage')]], 'video');
  const size = selectEl([['1280x720', '1280×720'], ['1920x1080', '1920×1080'], ['3840x2160', '3840×2160']], '1920x1080');
  const seconds = h('input.input', { type: 'number', min: 1, max: 60, value: app.settings.slideshow.interval });
  const fade = h('input', { type: 'checkbox', checked: true });
  const music = musicField(app.settings.slideshow.music ?? '');
  const ok = await openDialog({
    title: plural('create.slideshowTitle', list.length), width: 520, id: 'export-slideshow-dialog',
    body: h('div', field(t('create.slideshowKind'), kind), h('div.field-row', field(t('create.size'), size), field(t('slideshow.interval'), seconds)), h('label.check', fade, t('slideshow.fade')), field(t('slideshow.music'), music.el)),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('create.make'), value: true, primary: true }],
  });
  if (!ok) return;
  const [W, H] = size.value.split('x').map(Number);
  const per = Math.max(1, Number(seconds.value) || 4);
  let song = null;
  try { song = await musicBytes(music.value()); } catch (error) { toast(`${t('slideshow.music')}: ${errorText(error)}`, 'error'); }
  if (kind.value === 'html') {
    const bytes = await withProgress(t('create.making'), async (progress) => {
      const slides = [];
      for (const [i, item] of list.entries()) {
        progress.update(i, list.length, item.name);
        const decoded = await decodeImage(await fs.read(item.path), item.name, { maxSize: Math.max(W, H) });
        const canvas = decoded.source.getContext ? decoded.source : scaledCanvas(decoded.source, decoded.source.width, decoded.source.height, Math.max(W, H));
        const blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
        const b64 = btoa(Array.from(new Uint8Array(await blob.arrayBuffer()), (c) => String.fromCharCode(c)).join(''));
        slides.push({ src: `data:image/jpeg;base64,${b64}`, caption: item.name });
      }
      const audio = song ? `data:${audioType(song.name)};base64,${btoa(Array.from(song.bytes, (c) => String.fromCharCode(c)).join(''))}` : null;
      return new TextEncoder().encode(slideshowHtml(slides, per, fade.checked, audio));
    });
    if (bytes) await saveOutput(bytes, `slideshow-${stamp()}.html`, { filters: [{ name: 'HTML', extensions: ['html'] }] });
    return;
  }
  if (typeof MediaRecorder === 'undefined') { toast(t('create.noRecorder'), 'error'); return; }
  const bytes = await withProgress(t('create.recording'), async (progress) => {
    const canvas = h('canvas', { width: W, height: H });
    const c = canvas.getContext('2d');
    const frames = [];
    for (const [i, item] of list.entries()) {
      progress.update(i, list.length * 2, item.name);
      const decoded = await decodeImage(await fs.read(item.path), item.name, { maxSize: Math.max(W, H) });
      frames.push(decoded.source);
    }
    // Frames are pushed explicitly: an automatic capture may record nothing while
    // another window (the progress dialog) has the focus.
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    // Music: decoded, looped for the whole video and faded out at the end, as an Opus track.
    let audio = null;
    if (song) {
      try {
        const context = new AudioContext();
        await context.resume().catch(() => {});
        const buffer = await context.decodeAudioData(song.bytes.slice().buffer);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = context.createGain();
        gain.gain.value = Math.max(0, Math.min(1, (app.settings.slideshow.musicVolume ?? 80) / 100));
        const destination = context.createMediaStreamDestination();
        source.connect(gain).connect(destination);
        audio = { context, source, gain, track: destination.stream.getAudioTracks()[0] };
        stream.addTrack(audio.track);
      } catch (error) {
        toast(`${t('slideshow.music')}: ${errorText(error)}`, 'error');
      }
    }
    const type = (audio ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']).find((m) => MediaRecorder.isTypeSupported(m));
    progress.update(list.length, list.length * 2, t('create.preparingEncoder'));
    await warmVideoEncoder(type, W, H);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { recorder.onstop = resolve; });
    const draw = (source, alpha = 1) => {
      const k = Math.min(W / source.width, H / source.height);
      c.globalAlpha = alpha;
      c.drawImage(source, (W - source.width * k) / 2, (H - source.height * k) / 2, source.width * k, source.height * k);
      c.globalAlpha = 1;
    };
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    recorder.start();
    if (audio) {
      const total = frames.length * per;
      const now = audio.context.currentTime;
      audio.source.start();
      audio.gain.gain.setValueAtTime(audio.gain.gain.value, now + Math.max(0, total - 1.5));
      audio.gain.gain.linearRampToValueAtTime(0, now + total);
    }
    const fadeMs = fade.checked ? 700 : 0;
    for (const [i, frame] of frames.entries()) {
      if (progress.cancelled) break;
      progress.update(list.length + i, list.length * 2, list[i].name);
      const start = performance.now();
      while (performance.now() - start < per * 1000) {
        const elapsed = performance.now() - start;
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        if (i > 0 && elapsed < fadeMs) { draw(frames[i - 1], 1 - elapsed / fadeMs); draw(frame, elapsed / fadeMs); } else draw(frame);
        track.requestFrame?.();
        await new Promise((r) => setTimeout(r, 33)); // ~30 fps, also when the window is in the background
      }
    }
    recorder.stop();
    await done;
    if (audio) { audio.source.stop(); audio.context.close().catch(() => {}); }
    return new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
  });
  if (bytes) await saveOutput(bytes, `slideshow-${stamp()}.webm`, { filters: [{ name: 'WebM', extensions: ['webm'] }] });
}

const audioType = (name) => ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', webm: 'audio/webm' })[extensionOf(name)] ?? 'audio/mpeg';

function slideshowHtml(slides, seconds, fade, audio = null) {
  const data = JSON.stringify(slides);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slideshow</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity ${fade ? '0.8s' : '0s'}}img.on{opacity:1}
#c{position:absolute;bottom:18px;width:100%;text-align:center;color:#fff;font:15px system-ui;text-shadow:0 1px 3px #000}</style></head>
<body><div id="c"></div>${audio ? `<audio id="m" src="${audio}" loop autoplay></audio>` : ''}<script>const s=${data};let i=0;const imgs=s.map(x=>{const m=new Image();m.src=x.src;document.body.appendChild(m);return m});
function show(n){imgs.forEach((m,k)=>m.classList.toggle('on',k===n));document.getElementById('c').textContent=s[n].caption}
show(0);let t=setInterval(()=>{i=(i+1)%s.length;show(i)},${seconds * 1000});
${audio ? "addEventListener('click',()=>document.getElementById('m').play());" : ''}addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' '){i=(i+1)%s.length;show(i)}if(e.key==='ArrowLeft'){i=(i-1+s.length)%s.length;show(i)}});</script></body></html>`;
}

// ───────────────────────── ZIP

export async function createZip(items) {
  const list = items.filter((item) => !item.isDir);
  if (!list.length) return;
  const name = h('input.input', { type: 'text', value: `${baseName(app.state.source.path ?? 'photos') || 'photos'}.zip` });
  const ok = await openDialog({ title: plural('create.zipTitle', list.length), body: field(t('edit.fileName'), name), buttons: [{ label: t('common.cancel'), value: false }, { label: t('create.make'), value: true, primary: true }] });
  if (!ok) return;
  const bytes = await withProgress(t('create.making'), async (progress) => {
    const entries = [];
    for (const [i, item] of list.entries()) {
      progress.update(i, list.length, item.name);
      entries.push({ name: item.name, data: await fs.read(item.path), modified: item.modified });
    }
    return writeZip(entries);
  });
  if (bytes) await saveOutput(bytes, name.value.endsWith('.zip') ? name.value : `${name.value}.zip`, { filters: [{ name: 'ZIP', extensions: ['zip'] }] });
}

/** Opens a ZIP archive as a read-only folder (its photos and videos). */
export async function openArchive(path) {
  try {
    const bytes = await fs.read(path);
    const entries = readZip(bytes).filter((entry) => !entry.isDir && !entry.encrypted && isMedia(entry.name));
    const files = entries.map((entry) => {
      const data = extractZip(bytes, entry);
      const name = entry.name.split('/').pop();
      return { file: new File([data], name, { lastModified: entry.modified, type: mimeOf(name) }), relativePath: entry.name };
    });
    const root = webFs.addMemoryFolder(stemOf(baseName(path)), files);
    app.emit('folders-changed', null);
    await openFolder(root);
    return root;
  } catch (error) {
    toast(t('create.zipFailed', { error: errorText(error) }), 'error', 7000);
    return null;
  }
}
