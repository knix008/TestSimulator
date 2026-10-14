// Duplicate finder.
//  - exact: same size and same SHA-256 of the bytes
//  - similar: difference hash (dHash) of a 9×8 grayscale thumbnail; pictures
//    within a few bits of each other look alike (resized, re-saved, slightly edited)

/** 64-bit dHash as 16 hex characters from 72 gray values (9 wide × 8 high). */
export function dHash(gray) {
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] < gray[y * 9 + x + 1] ? '1' : '0';
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** 9×8 gray values (box-averaged) from RGBA pixels. */
export function grayGrid(data, width, height) {
  const out = new Float64Array(72);
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 9; gx++) {
      const x0 = Math.floor((gx * width) / 9);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / 9));
      const y0 = Math.floor((gy * height) / 8);
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / 8));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          n += 1;
        }
      }
      out[gy * 9 + gx] = sum / n;
    }
  }
  return out;
}

const POP = Array.from({ length: 16 }, (_, i) => (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1));

export function hamming(a, b) {
  let distance = 0;
  for (let i = 0; i < 16; i++) distance += POP[Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16)];
  return distance;
}

/** Groups (2+ members) of items with the same `key(item)`. */
export function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = key(item);
    if (k == null) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map.values()].filter((group) => group.length > 1);
}

/** Clusters of items whose `hash` differ by at most `threshold` bits (single linkage). */
export function groupSimilar(items, threshold = 6) {
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].hash && items[j].hash && hamming(items[i].hash, items[j].hash) <= threshold) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  items.forEach((item, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

/** Which member of a group to keep by default: largest pixel count, then largest file, then oldest. */
export function bestOf(group) {
  return [...group].sort((a, b) => (b.pixels ?? 0) - (a.pixels ?? 0) || (b.size ?? 0) - (a.size ?? 0) || (a.modified ?? 0) - (b.modified ?? 0))[0];
}
