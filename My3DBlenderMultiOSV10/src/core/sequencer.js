// The Video Sequence Editor's model: strips on channels along the timeline, and how they combine into one picture. The pixels of
// images, text and scenes come from a `provider`, because making them needs the screen; everything else is plain data here.
//
// strip = { id, name, type: 'COLOR'|'IMAGE'|'TEXT'|'SCENE'|'MOVIE'|'SOUND'|'CROSS'|'WIPE', channel, start, length, offset,
//           opacity, blend: 'ALPHA'|'ADD'|'MULTIPLY', x, y, scale, color, image, text, size, scene, clip, a, b, mute }
import { newId } from './doc.js';

export const STRIP_TYPES = ['COLOR', 'IMAGE', 'TEXT', 'SCENE', 'MOVIE', 'SOUND', 'CROSS', 'WIPE'];
export const STRIP_BLENDS = ['ALPHA', 'ADD', 'MULTIPLY'];

export function createStrip(type, init = {}) {
  if (!STRIP_TYPES.includes(type)) throw new Error(`Unknown strip: ${type}`);
  return { id: newId('st'), name: init.name ?? type[0] + type.slice(1).toLowerCase(), type, channel: 1, start: 1, length: 25, offset: 0, opacity: 1, blend: 'ALPHA', x: 0, y: 0, scale: 1, color: [0.2, 0.3, 0.6], text: 'Text', size: 0.1, mute: false, ...init };
}

export const stripEnd = (s) => s.start + s.length;
const overlaps = (a, b) => a.channel === b.channel && a.start < stripEnd(b) && b.start < stripEnd(a);

/** A strip's own frame at a timeline frame: for movies and scenes, the frame to show. */
export const stripFrame = (s, frame) => frame - s.start + (s.offset ?? 0);

/** The strips showing at a frame, bottom channel first. */
export function stripsAt(seq, frame) {
  return seq.strips.filter((s) => !s.mute && frame >= s.start && frame < stripEnd(s)).sort((a, b) => a.channel - b.channel);
}

/** A free channel at or above `channel` for this span. */
function freeChannel(seq, strip, channel) {
  const limit = seq.channels ?? 8;
  for (let c = channel; c <= limit; c++) {
    if (!seq.strips.some((o) => o !== strip && overlaps({ ...strip, channel: c }, o))) return c;
  }
  return null;
}

export function addStrip(seq, strip) {
  const channel = freeChannel(seq, strip, strip.channel);
  if (channel == null) throw new Error('No free channel at this time');
  strip.channel = channel;
  seq.strips.push(strip);
  return strip;
}

/** Moves a strip. Two strips never overlap on a channel: it goes up to the next free one. Returns false when none is free. */
export function moveStrip(seq, strip, start, channel = strip.channel) {
  const next = { ...strip, start: Math.round(start), channel: Math.max(1, Math.round(channel)) };
  const free = freeChannel(seq, next, next.channel);
  if (free == null) return false;
  strip.start = next.start;
  strip.channel = free;
  return true;
}

/** Cuts in two at a frame. The right half continues where the left stops, so the picture does not change. Returns it. */
export function cutStrip(seq, strip, frame) {
  if (frame <= strip.start || frame >= stripEnd(strip)) return null;
  const right = { ...structuredClone(strip), id: newId('st'), start: frame, length: stripEnd(strip) - frame, offset: (strip.offset ?? 0) + (frame - strip.start) };
  strip.length = frame - strip.start;
  seq.strips.push(right);
  return right;
}

/** The last frame anything is on. */
export const sequenceEnd = (seq) => seq.strips.reduce((m, s) => Math.max(m, stripEnd(s)), 1) - 1;

/** A transition between two strips: it covers the time they share and sits above both. Returns the strip, or null if they do not overlap in time. */
export function addTransition(seq, a, b, type = 'CROSS') {
  const start = Math.max(a.start, b.start);
  const end = Math.min(stripEnd(a), stripEnd(b));
  if (end <= start) return null;
  const strip = createStrip(type, { name: type === 'CROSS' ? 'Cross' : 'Wipe', start, length: end - start, channel: Math.max(a.channel, b.channel) + 1, a: a.id, b: b.id });
  return addStrip(seq, strip);
}

/** How far along a transition is, 0…1 across its length. */
export const transitionFactor = (s, frame) => (s.length <= 1 ? 1 : Math.max(0, Math.min(1, (frame - s.start) / (s.length - 1))));

const clamp255 = (x) => (x < 0 ? 0 : x > 255 ? 255 : x);

/** Puts a source picture on the canvas with its place, size, opacity and blending. */
function overlay(out, width, height, source, strip, opacityScale = 1) {
  const { rgba, width: sw, height: sh } = source;
  const scale = strip.scale ?? 1;
  const opacity = (strip.opacity ?? 1) * opacityScale;
  const blend = strip.blend ?? 'ALPHA';
  // Centred, fitted to the height of the canvas unless it is the same size; x and y are fractions of the canvas.
  const fit = Math.min(width / sw, height / sh) * scale;
  const [dw, dh] = [sw * fit, sh * fit];
  const ox = (width - dw) / 2 + (strip.x ?? 0) * width;
  const oy = (height - dh) / 2 - (strip.y ?? 0) * height;
  const [x0, x1] = [Math.max(0, Math.floor(ox)), Math.min(width, Math.ceil(ox + dw))];
  const [y0, y1] = [Math.max(0, Math.floor(oy)), Math.min(height, Math.ceil(oy + dh))];
  for (let y = y0; y < y1; y++) {
    const sy = Math.max(0, Math.min(sh - 1, Math.floor((y + 0.5 - oy) / fit)));
    for (let x = x0; x < x1; x++) {
      const sx = Math.max(0, Math.min(sw - 1, Math.floor((x + 0.5 - ox) / fit)));
      const si = (sy * sw + sx) * 4;
      const a = (rgba[si + 3] / 255) * opacity;
      if (a <= 0) continue;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const [d, s] = [out[i + c], rgba[si + c]];
        out[i + c] = blend === 'ADD' ? clamp255(d + s * a) : blend === 'MULTIPLY' ? d * (1 - a) + (d * s * a) / 255 : d * (1 - a) + s * a;
      }
      out[i + 3] = clamp255(out[i + 3] + rgba[si + 3] * opacity);
    }
  }
}

function solid(width, height, color) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = color.map((c) => Math.round(c * 255));
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255; }
  return { width, height, rgba };
}

/**
 * One finished frame: Uint8ClampedArray RGBA of width × height, black where nothing is. `provider(strip, ownFrame, width, height)`
 * returns a picture { width, height, rgba } for IMAGE, TEXT, SCENE and MOVIE strips, or null while it has none yet.
 */
export function compositeFrame(seq, frame, width, height, provider = () => null) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  const showing = stripsAt(seq, frame);
  const inTransition = new Set();
  for (const s of showing) if (s.type === 'CROSS' || s.type === 'WIPE') { inTransition.add(s.a); inTransition.add(s.b); }
  const pictureOf = (s) => (s.type === 'COLOR' ? solid(width, height, s.color) : provider(s, stripFrame(s, frame), width, height));
  for (const s of showing) {
    if (s.type === 'SOUND' || inTransition.has(s.id)) continue;
    if (s.type === 'CROSS' || s.type === 'WIPE') {
      const [a, b] = [seq.strips.find((x) => x.id === s.a), seq.strips.find((x) => x.id === s.b)];
      if (!a || !b) continue;
      const f = transitionFactor(s, frame);
      const [pa, pb] = [pictureOf(a), pictureOf(b)];
      if (pa) overlay(out, width, height, pa, a);
      if (!pb) continue;
      if (s.type === 'CROSS') overlay(out, width, height, pb, b, f);
      else {
        // A wipe: a hard edge moving left to right.
        const layer = new Uint8ClampedArray(width * height * 4);
        overlay(layer, width, height, pb, { ...b, blend: 'ALPHA' });
        const edge = Math.round(f * width);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < edge; x++) {
            const i = (y * width + x) * 4;
            if (layer[i + 3]) { out[i] = layer[i]; out[i + 1] = layer[i + 1]; out[i + 2] = layer[i + 2]; }
          }
        }
      }
      continue;
    }
    const picture = pictureOf(s);
    if (picture) overlay(out, width, height, picture, s);
  }
  return out;
}
