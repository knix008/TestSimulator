// A small seeded random generator (mulberry32) so a song made from the same seed is the same song:
// samples, tests and "regenerate with this seed" depend on it.

export function rng(seed = 1) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (list) => list[Math.floor(next() * list.length) % Math.max(1, list.length)];
  next.chance = (p) => next() < p;
  next.shuffle = (list) => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
  /** Picks by weight: [[value, weight] …]. */
  next.weighted = (pairs) => {
    const total = pairs.reduce((s, [, w]) => s + Math.max(0, w), 0);
    let r = next() * total;
    for (const [value, w] of pairs) { r -= Math.max(0, w); if (r <= 0) return value; }
    return pairs[pairs.length - 1]?.[0];
  };
  return next;
}

/** A seed from text (the same words give the same seed). */
export function seedOf(text) {
  let h = 2166136261;
  for (const ch of String(text ?? '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** A fresh seed (1 … 999 999). */
export const newSeed = () => 1 + Math.floor(Math.random() * 999999);
