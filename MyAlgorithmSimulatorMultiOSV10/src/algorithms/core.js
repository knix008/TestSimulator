// Shared pieces of the algorithm modules. An algorithm turns its input into a list of
// frames; a frame is one step the player shows:
//   { line, msg: { ko, en }, vars: { name: value }, view: <snapshot for the view kind> }
// Views are plain data (no references back into the running algorithm), so the
// player can jump to any frame and draw it.

/** Bilingual text. */
export const L = (ko, en = ko) => ({ ko, en });

/** Frames stop here: a runaway input must not freeze the window. */
export const MAX_FRAMES = 6000;

export class Recorder {
  constructor() { this.frames = []; this.truncated = false; }
  /** Records a step; `view` must already be a copy. */
  step(line, msg, view, vars = {}) {
    if (this.frames.length >= MAX_FRAMES) { this.truncated = true; throw new StopRecording(); }
    this.frames.push({ line, msg, view, vars: { ...vars } });
  }
}

export class StopRecording extends Error {}

/** Runs `body(recorder)` and returns its frames, ending cleanly when the frame limit is hit. */
export function record(body) {
  const rec = new Recorder();
  try { body(rec); } catch (error) { if (!(error instanceof StopRecording)) throw error; }
  return rec.frames;
}

export class InputError extends Error {
  constructor(ko, en) { super(en ?? ko); this.text = L(ko, en); }
}

// ───────────────────────── input parsing

export function parseNumbers(text, { min = 1, max = 64, lo = -999, hi = 999 } = {}) {
  const items = String(text).split(/[\s,;]+/).filter(Boolean);
  const values = items.map(Number);
  if (values.some((v) => !Number.isInteger(v))) throw new InputError('정수만 쉼표나 공백으로 구분해 입력하세요.', 'Enter integers separated by commas or spaces.');
  if (values.length < min || values.length > max) throw new InputError(`값을 ${min}~${max}개 입력하세요.`, `Enter ${min}–${max} values.`);
  if (values.some((v) => v < lo || v > hi)) throw new InputError(`값은 ${lo}~${hi} 사이여야 합니다.`, `Values must be between ${lo} and ${hi}.`);
  return values;
}

/** "key: value" lines → { key: value } (keys lower-case); other lines go to `rest`. */
export function parseKeyed(text) {
  const keys = {};
  const rest = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([a-zA-Z_]+)\s*[:=]\s*(.*)$/.exec(line);
    if (m) keys[m[1].toLowerCase()] = m[2].trim();
    else rest.push(line);
  }
  return { keys, rest };
}

export function parseInteger(text, name, lo, hi) {
  const v = Number(String(text ?? '').trim());
  if (!Number.isInteger(v) || v < lo || v > hi) throw new InputError(`${name}은(는) ${lo}~${hi} 사이의 정수여야 합니다.`, `${name} must be an integer between ${lo} and ${hi}.`);
  return v;
}

// ───────────────────────── random inputs

export const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
export const randomArray = (n, lo = 1, hi = 99) => Array.from({ length: n }, () => randInt(lo, hi));
export const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** A copy of a plain-data value (views are snapshots). */
export const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
