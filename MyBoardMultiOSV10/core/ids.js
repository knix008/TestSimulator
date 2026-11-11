// Id generation: 20-char lowercase base36 strings, ordered by creation time.
//   9 chars  milliseconds since epoch (base36, zero padded)
//   4 chars  per-process monotonic counter (keeps ids made in the same ms ordered)
//   7 chars  random
import { randomBytes, randomInt } from 'node:crypto';

let lastMs = 0;
let counter = 0;

/** @returns {string} a new 20-character id */
export function newId() {
  let ms = Date.now();
  if (ms <= lastMs) { ms = lastMs; counter++; if (counter >= 36 ** 4) { lastMs = ++ms; counter = 0; } }
  else { lastMs = ms; counter = randomInt(0, 36 ** 3); } // random start keeps processes apart
  return ms.toString(36).padStart(9, '0') + counter.toString(36).padStart(4, '0') + randomPart(7);
}

function randomPart(n) {
  const bytes = randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += (bytes[i] % 36).toString(36);
  return s;
}

/** A random URL-safe token (sessions, desktop shell token). */
export function newToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}
