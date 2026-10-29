// The built-in sound banks for tests (the app fetches public/datasets/<bank>.bin; tests read the file).
import fs from 'node:fs';
import { parseSoundBank, SOUND_BANKS } from '../../src/domain/datasets-media.js';

const cache = new Map();

/** The clips of a sounds source with a bank, or null (other sources). */
export function soundsFor(source) {
  if (source?.kind !== 'sounds' || !source.bank) return null;
  if (!cache.has(source.bank)) {
    const bytes = fs.readFileSync(`public/${SOUND_BANKS[source.bank].file}`);
    cache.set(source.bank, parseSoundBank(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).clips);
  }
  return cache.get(source.bank);
}

/** At most about `n` clips of a sound bank, spread evenly over every label (null stays null). */
export function fewClips(clips, n = 160) {
  if (!clips) return clips;
  const byLabel = Map.groupBy(clips, (clip) => clip.label);
  const each = Math.max(1, Math.ceil(n / byLabel.size));
  return [...byLabel.values()].flatMap((list) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / each)) === 0).slice(0, each));
}
