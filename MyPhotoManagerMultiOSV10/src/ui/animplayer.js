// Animated pictures (GIF, APNG, animated WebP / AVIF) played frame by frame into a
// canvas, so the viewer can play, pause, stop and step them like a video.
// The engine's ImageDecoder does the decoding where it exists; without it a GIF is
// decoded here (decodeGif) and other formats stay a plain, uncontrolled <img>.

const MIME = { gif: 'image/gif', png: 'image/png', apng: 'image/png', webp: 'image/webp', avif: 'image/avif' };
export const ANIMATABLE = new Set(Object.keys(MIME));

/** Browsers show a 0 or 10 ms frame time as 100 ms; so do we. */
const frameMs = (ms) => (Number.isFinite(ms) && ms > 10 ? ms : 100);

/**
 * Frames of an animated picture, or null when it has a single frame (or cannot be read here).
 * Returns { width, height, count, draw(i, ctx) → Promise<ms the frame stays>, close() }.
 */
export async function loadAnimation(bytes, ext) {
  const type = MIME[ext];
  if (!type) return null;
  if (typeof ImageDecoder !== 'undefined') {
    try {
      if (!(await ImageDecoder.isTypeSupported(type))) return null;
      const decoder = new ImageDecoder({ data: bytes, type });
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;
      if (!track?.animated) { decoder.close(); return null; }
      await decoder.completed;
      const count = track.frameCount;
      if (count < 2) { decoder.close(); return null; }
      const { image: first } = await decoder.decode({ frameIndex: 0 });
      const width = first.displayWidth;
      const height = first.displayHeight;
      first.close();
      return {
        width, height, count,
        async draw(i, ctx) {
          const { image } = await decoder.decode({ frameIndex: i });
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(image, 0, 0, width, height);
          const ms = frameMs((image.duration ?? 0) / 1000);
          image.close();
          return ms;
        },
        close() { try { decoder.close(); } catch { /* already closed */ } },
      };
    } catch {
      return null;
    }
  }
  if (ext !== 'gif') return null;
  const gif = decodeGif(bytes);
  if (!gif || gif.frames.length < 2) return null;
  return {
    width: gif.width, height: gif.height, count: gif.frames.length,
    async draw(i, ctx) {
      ctx.putImageData(new ImageData(gif.frames[i].pixels, gif.width, gif.height), 0, 0);
      return frameMs(gif.frames[i].delay);
    },
    close() {},
  };
}

/**
 * Plays `source` (from loadAnimation) into `canvas`: play / pause / stop / step.
 * `onChange()` runs whenever the frame or the playing state changes.
 */
export function createAnimPlayer(canvas, source, { onChange } = {}) {
  const ctx = canvas.getContext('2d');
  let frame = 0; // on screen
  let wanted = 0; // asked for (steps add up before the frame is drawn)
  let playing = false;
  let gen = 0;
  let timer = null;
  let wake = null;
  let queue = Promise.resolve(0);

  /** Draws frame i (one draw at a time); resolves with how long it stays. */
  const show = (i) => {
    const n = ((i % source.count) + source.count) % source.count;
    wanted = n;
    queue = queue.catch(() => 0).then(() => source.draw(n, ctx)).then((ms) => { frame = n; onChange?.(); return ms; });
    return queue;
  };
  const wait = (ms) => new Promise((resolve) => { wake = resolve; timer = setTimeout(resolve, ms); });

  function play() {
    if (playing) return;
    playing = true;
    const mine = ++gen;
    onChange?.();
    (async () => {
      let ms = await show(wanted).catch(() => 100);
      while (gen === mine && canvas.isConnected) {
        await wait(ms);
        if (gen !== mine) return;
        ms = await show(wanted + 1).catch(() => 100);
      }
      if (gen === mine) pause();
    })();
  }
  function pause() {
    gen += 1;
    clearTimeout(timer);
    wake?.();
    wake = null;
    if (!playing) return;
    playing = false;
    onChange?.();
  }
  return {
    get frame() { return frame; },
    get count() { return source.count; },
    get playing() { return playing; },
    play,
    pause,
    toggle() { if (playing) pause(); else play(); },
    /** Stop: playback ends and the first frame is shown. */
    stop() { pause(); return show(0); },
    step(direction) { pause(); return show(wanted + direction); },
    show,
    destroy() { pause(); source.close(); },
  };
}

/**
 * GIF89a / GIF87a → whole frames (RGBA, composited with each frame's disposal), for
 * engines without ImageDecoder. { width, height, frames: [{ pixels, delay ms }] } or null.
 */
export function decodeGif(bytes, { maxPixels = 400e6 } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sig = String.fromCharCode(...b.subarray(0, 6));
  if (sig !== 'GIF89a' && sig !== 'GIF87a') return null;
  const width = b[6] | (b[7] << 8);
  const height = b[8] | (b[9] << 8);
  if (!width || !height) return null;
  let p = 13;
  let global = null;
  if (b[10] & 0x80) {
    const size = 3 * (1 << ((b[10] & 7) + 1));
    global = b.subarray(p, p + size);
    p += size;
  }
  const canvas = new Uint8ClampedArray(width * height * 4);
  const frames = [];
  let gce = { disposal: 0, delay: 0, transparent: -1 };
  const subBlocks = () => {
    const parts = [];
    let total = 0;
    while (p < b.length) {
      const len = b[p++];
      if (!len) break;
      parts.push(b.subarray(p, p + len));
      total += len;
      p += len;
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  };
  while (p < b.length) {
    const block = b[p++];
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = b[p++];
      if (label === 0xf9 && b[p] >= 4) {
        const flags = b[p + 1];
        gce = { disposal: (flags >> 2) & 7, delay: (b[p + 2] | (b[p + 3] << 8)) * 10, transparent: flags & 1 ? b[p + 4] : -1 };
      }
      subBlocks();
      continue;
    }
    if (block !== 0x2c) break; // not a GIF block: stop with what we have
    const left = b[p] | (b[p + 1] << 8);
    const top = b[p + 2] | (b[p + 3] << 8);
    const w = b[p + 4] | (b[p + 5] << 8);
    const h = b[p + 6] | (b[p + 7] << 8);
    const flags = b[p + 8];
    p += 9;
    let palette = global;
    if (flags & 0x80) {
      const size = 3 * (1 << ((flags & 7) + 1));
      palette = b.subarray(p, p + size);
      p += size;
    }
    const minCode = b[p++];
    const indices = lzw(subBlocks(), minCode, w * h);
    if (!palette) continue;
    const saved = gce.disposal === 3 ? canvas.slice() : null;
    const interlaced = Boolean(flags & 0x40);
    const rowOf = interlaced ? interlaceRows(h) : null;
    for (let y = 0; y < h; y++) {
      const cy = top + (rowOf ? rowOf[y] : y);
      if (cy >= height) continue;
      for (let x = 0; x < w; x++) {
        const cx = left + x;
        if (cx >= width) continue;
        const index = indices[y * w + x];
        if (index === gce.transparent || index * 3 + 2 >= palette.length) continue;
        const o = (cy * width + cx) * 4;
        canvas[o] = palette[index * 3];
        canvas[o + 1] = palette[index * 3 + 1];
        canvas[o + 2] = palette[index * 3 + 2];
        canvas[o + 3] = 255;
      }
    }
    frames.push({ pixels: canvas.slice(), delay: gce.delay });
    if ((frames.length + 1) * width * height > maxPixels) break;
    if (gce.disposal === 2) {
      for (let y = top; y < Math.min(height, top + h); y++) canvas.fill(0, (y * width + left) * 4, (y * width + Math.min(width, left + w)) * 4);
    } else if (saved) canvas.set(saved);
    gce = { disposal: 0, delay: 0, transparent: -1 };
  }
  return frames.length ? { width, height, frames } : null;
}

/** Interlaced row order: the stored row y is picture row rows[y]. */
function interlaceRows(h) {
  const rows = [];
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < h; y += step) rows.push(y);
  return rows;
}

/** GIF LZW → colour indices (count of them). */
function lzw(data, minCode, count) {
  const out = new Uint8Array(count);
  const clear = 1 << minCode;
  const end = clear + 1;
  const prefix = new Int16Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  let size = minCode + 1;
  let next = end + 1;
  let old = -1;
  let first = 0;
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < data.length && o < count; i++) {
    acc |= data[i] << bits;
    bits += 8;
    while (bits >= size && o < count) {
      let code = acc & ((1 << size) - 1);
      acc >>>= size;
      bits -= size;
      if (code === clear) { size = minCode + 1; next = end + 1; old = -1; continue; }
      if (code === end) return out;
      if (old === -1) { out[o++] = code; old = code; first = code; continue; }
      const incoming = code;
      let top = 0;
      if (code >= next) { stack[top++] = first; code = old; }
      while (code > clear) { stack[top++] = suffix[code]; code = prefix[code]; }
      first = code;
      stack[top++] = code;
      while (top && o < count) out[o++] = stack[--top];
      if (next < 4096) {
        prefix[next] = old;
        suffix[next] = first;
        next += 1;
        if (next === 1 << size && size < 12) size += 1;
      }
      old = incoming;
    }
  }
  return out;
}
