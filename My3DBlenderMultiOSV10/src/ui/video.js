// Turns rendered frames into a video file. WebCodecs does the encoding where it is available; AVI with JPEG pictures needs nothing but a canvas.
//
// Frames are kept as PNG files until the end and encoded then. A render can take hours, and a hardware encoder can fail at the very end ("Flushing error"
// happens when the machine is busy), so what was rendered must not depend on the encoder: one that fails is replaced by the next, and the last resort is AVI.
import { muxAVI, muxMP4 } from '../core/videofile.js';

const CANDIDATES = [
  { codec: 'avc1', string: 'avc1.640028' },
  { codec: 'avc1', string: 'avc1.4d0028' },
  { codec: 'avc1', string: 'avc1.42001f' },
  { codec: 'vp09', string: 'vp09.00.40.08' },
];

/** How long a stuck encoder is given, once it has all the frames. */
const FLUSH_LIMIT_MS = 60000;

/** The encoders that say they work for this size, hardware first and then the same one in software. */
export async function chooseEncoders(width, height, fps) {
  if (typeof VideoEncoder === 'undefined') return [];
  const found = [];
  for (const hardwareAcceleration of ['no-preference', 'prefer-software']) {
    for (const c of CANDIDATES) {
      const config = { codec: c.string, width, height, framerate: fps, bitrate: Math.max(1e6, width * height * fps * 0.15), hardwareAcceleration, ...(c.codec === 'avc1' ? { avc: { format: 'avc' } } : {}) };
      try {
        const { supported } = await VideoEncoder.isConfigSupported(config);
        if (supported) found.push({ ...c, config });
      } catch { /* not this one */ }
    }
  }
  return found;
}

/** The record VP9 in MP4 wants, when the encoder gives none: profile, level, bit depth and colour as the codec string has them. */
const vpcc = () => Uint8Array.from([0, 40, 0x82, 1, 1, 1, 0, 0]);

/** One attempt with one encoder, over all the frames. Throws when the encoder fails. */
async function encodeWith(chosen, pictures, { w, h, fps, paint, scratch }) {
  const samples = [];
  let description = null;
  let failure = null;
  const encoder = new VideoEncoder({
    output: (piece, meta) => {
      const data = new Uint8Array(piece.byteLength);
      piece.copyTo(data);
      samples.push({ data, key: piece.type === 'key' });
      const d = meta?.decoderConfig?.description;
      if (d) description = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer);
    },
    error: (error) => { failure = error; },
  });
  try {
    encoder.configure(chosen.config);
    let index = 0;
    for (const png of pictures) {
      if (failure) throw failure;
      const bitmap = await createImageBitmap(png);
      paint.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const frame = new VideoFrame(scratch, { timestamp: Math.round((index / fps) * 1e6), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: index % Math.max(1, Math.round(fps * 2)) === 0 });
      frame.close();
      index++;
      // The encoder's queue is not allowed to grow without end.
      while (encoder.encodeQueueSize > 4 && !failure) await new Promise((resolve) => { setTimeout(resolve, 5); });
    }
    let timer;
    await Promise.race([encoder.flush(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The encoder stopped responding')), FLUSH_LIMIT_MS); })]).finally(() => clearTimeout(timer));
    if (failure) throw failure;
    if (samples.length !== pictures.length) throw new Error(`The encoder gave ${samples.length} of ${pictures.length} frames`);
  } finally {
    try { if (encoder.state !== 'closed') encoder.close(); } catch { /* already gone */ }
  }
  return muxMP4({ samples, width: w, height: h, fps, codec: chosen.codec, description: description ?? (chosen.codec === 'vp09' ? vpcc() : new Uint8Array()) });
}

/**
 * Collects frames. `add(canvas)` for each frame in order, then `finish()` gives { blob, extension, codec, frames, fellBack }.
 * `format` is 'MP4' or 'AVI'. `fellBack` says that MP4 was asked for and AVI is what could be made, and `problems` says why.
 */
export async function createVideoWriter({ width, height, fps, format = 'MP4' }) {
  // Encoders refuse odd sizes.
  const [w, h] = [width - (width % 2), height - (height % 2)];
  const scratch = document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  const paint = scratch.getContext('2d');
  const pictures = [];
  const toBlob = (type, quality) => new Promise((resolve) => { scratch.toBlob(resolve, type, quality); });
  return {
    async add(canvas) {
      paint.drawImage(canvas, 0, 0, w, h);
      pictures.push(await toBlob('image/png'));
    },
    async finish() {
      const problems = [];
      if (format === 'MP4') {
        for (const chosen of await chooseEncoders(w, h, fps)) {
          try {
            const bytes = await encodeWith(chosen, pictures, { w, h, fps, paint, scratch });
            return { blob: new Blob([bytes], { type: 'video/mp4' }), extension: 'mp4', codec: chosen.string, frames: pictures.length, fellBack: false, problems };
          } catch (error) {
            problems.push(`${chosen.string} (${chosen.config.hardwareAcceleration}): ${error?.message ?? error}`);
          }
        }
      }
      const jpegs = [];
      for (const png of pictures) {
        const bitmap = await createImageBitmap(png);
        paint.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();
        jpegs.push(new Uint8Array(await (await toBlob('image/jpeg', 0.92)).arrayBuffer()));
      }
      return { blob: new Blob([muxAVI({ pictures: jpegs, width: w, height: h, fps })], { type: 'video/x-msvideo' }), extension: 'avi', codec: 'mjpeg', frames: jpegs.length, fellBack: format === 'MP4', problems };
    },
  };
}
