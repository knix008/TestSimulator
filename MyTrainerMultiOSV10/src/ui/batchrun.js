// Running the finished model on data the user picks: picture files, WAV recordings, CSV rows,
// lines of text, sequences. Each file (or row) is turned into a raw input exactly like the training
// data was made (picture size and channels, speech → log-mel spectrogram, CSV columns → the same
// numbers and one-hot columns); the app then applies the same preprocessing and asks the engine.
import { encodeTableRows, parseCsv } from '../domain/datasets.js';
import { encodePrompt, resampleWave, soundFeatures, speechWindow } from '../domain/datasets-media.js';
import { decodePicture, IMAGE_ACCEPT, IMAGE_EXTENSIONS } from './imagedecode.js';
import { clipFrom, pictureFrom, videoFileFrames } from './live.js';

export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'mkv', 'ogv', 'm4v'];

/** What can be picked for a dataset: { kind, extensions, accept (web), folder (pictures / sounds) } or null. */
export function inputKindFor(data) {
  if (!data) return null;
  if (data.kind === 'image') return { kind: 'image', extensions: IMAGE_EXTENSIONS, accept: IMAGE_ACCEPT, folder: true };
  if (data.kind === 'audio') return { kind: 'audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a'], accept: 'audio/*,.wav', folder: true };
  if (data.kind === 'tokens') return { kind: 'text', extensions: ['txt', 'csv'], accept: '.txt,.csv', folder: false };
  if (data.kind === 'video') return data.media ? { kind: 'video', extensions: VIDEO_EXTENSIONS, accept: 'video/*,.mp4,.webm,.mov,.mkv,.ogv,.m4v', folder: true } : null;
  return { kind: 'table', extensions: ['csv', 'tsv', 'txt'], accept: '.csv,.tsv,.txt', folder: false };
}

/** A picture file (any format) → height × width × channels values in 0…1, inverted when its background is the opposite of the training pictures'. */
async function pictureInput(file, data) {
  const bitmap = await decodePicture(file.bytes, file.name);
  return pictureFrom(bitmap, bitmap.width, bitmap.height, data, { fit: 'contain' });
}

/** Any audio file (bytes) → mono wave at `rate` Hz: decoded by the browser at 48 kHz, mixed to mono, then
 * brought down band-limited (resampleWave — the browser's own conversion to 8 kHz would fold the high
 * frequencies into the speech band). */
export async function decodeSound(bytes, rate) {
  const decoded = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes.slice(0));
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
  }
  return resampleWave(mono, decoded.sampleRate, rate);
}

/** The `seconds` around the speech, centred and peak-normalised to 0.9, as the training clips are made. */
export const loudestWindow = (rendered, rate, seconds) => speechWindow(rendered, rate, seconds).wave;

async function soundInput(file, data) {
  const media = data.media;
  const wave = loudestWindow(await decodeSound(file.bytes, media.rate), media.rate, media.seconds ?? 0.6);
  return { raw: soundFeatures(wave, media), wave };
}

/**
 * Turns picked files into inputs: [{ name, raw (Float32Array in the dataset's raw units), wave?, note? }].
 * files = [{ name, bytes (ArrayBuffer) | text }]. Errors per file are kept as { name, error }.
 */
export async function inputsFromFiles(files, data) {
  const kind = inputKindFor(data)?.kind;
  const size = data.inputShape.reduce((a, b) => a * b, 1);
  const out = [];
  for (const file of files) {
    try {
      if (kind === 'image') {
        const { raw, inverted } = await pictureInput(file, data);
        out.push({ name: file.name, raw, note: inverted ? 'inverted' : null });
      } else if (kind === 'video') {
        const frames = await videoFileFrames(file.bytes, data.media.frames);
        const { raw, inverted } = clipFrom(frames, data);
        out.push({ name: file.name, raw, note: inverted ? 'inverted' : null });
      } else if (kind === 'audio') {
        const { raw, wave } = await soundInput(file, data);
        out.push({ name: file.name, raw, wave });
      } else if (kind === 'text' && data.media?.charLevel) {
        // A character language model: every line is a prompt (its last characters are used).
        for (const [i, line] of String(file.text).split(/\r?\n/).filter((l) => l.trim()).entries()) out.push({ name: `${file.name}:${i + 1}`, label: line, raw: encodePrompt(line, data) });
      } else if (kind === 'text') {
        const vocab = data.vocab ?? [];
        for (const [i, line] of String(file.text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).entries()) {
          const ids = line.toLowerCase().split(/[^a-z0-9<>가-힣]+/).filter(Boolean).map((word) => { const id = vocab.indexOf(word); return id >= 0 ? id : 1; });
          out.push({ name: `${file.name}:${i + 1}`, label: line, raw: Float32Array.from({ length: size }, (_, k) => ids[k] ?? 0) });
        }
      } else if (data.columnsSpec) {
        const { values, missing } = encodeTableRows(data.columnsSpec, parseCsv(file.text).rows);
        values.forEach((raw, i) => out.push({ name: `${file.name}:${i + 1}`, raw, note: missing.length ? `missing: ${missing.join(', ')}` : null }));
      } else {
        // Plain numbers: one sample per row (a header row is skipped).
        for (const [i, row] of parseCsv(file.text).rows.entries()) {
          const numbers = row.map(Number);
          if (numbers.some((v) => !Number.isFinite(v))) { if (i === 0) continue; throw new Error(`row ${i + 1}: not numbers`); }
          if (numbers.length !== size) throw new Error(`row ${i + 1}: ${numbers.length} values, the model takes ${size}`);
          out.push({ name: `${file.name}:${i + 1}`, raw: Float32Array.from(numbers) });
        }
      }
    } catch (error) {
      out.push({ name: file.name, error: String(error?.message ?? error) });
    }
  }
  return out;
}

/** The results as CSV text (name, prediction, confidence, every output). */
export function resultsCsv(items, labels, task) {
  const outputs = items.find((item) => item.output)?.output.length ?? 0;
  const head = ['input', 'prediction', 'confidence', ...Array.from({ length: outputs }, (_, k) => (task.kind === 'classification' ? (labels?.[k] ?? `C${k}`) : `y${k}`))];
  const quote = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = items.map((item) => [item.name, item.error ? `error: ${item.error}` : item.prediction ?? '', item.confidence ?? '', ...(item.output ? Array.from(item.output).map((v) => v.toFixed(6)) : [])].map(quote).join(','));
  return `${head.map(quote).join(',')}\n${rows.join('\n')}\n`;
}

/** Prediction label and confidence for one output vector. */
export function describeOutput(output, task, labels) {
  if (task.kind === 'classification') {
    const probs = output.length === 1 ? [1 - output[0], output[0]] : Array.from(output);
    const best = probs.indexOf(Math.max(...probs));
    return { prediction: labels?.[best] ?? `C${best}`, confidence: probs[best], best };
  }
  if (task.kind === 'regression') return { prediction: Number(output[0].toFixed(5)), confidence: null };
  return { prediction: '—', confidence: null };
}
