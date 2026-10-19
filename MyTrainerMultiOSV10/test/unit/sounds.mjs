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
