// The bundled examples (samples/ → public/samples, listed in index.json):
// pictures to convert, one 3D file per format, and two conversion results.
// The start screen, the File menu and the tutorial open them.
export const SAMPLE_GROUPS = ['images', 'models', 'results'];

export async function loadSampleIndex(base = './samples/') {
  try {
    const res = await fetch(`${base}index.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    const index = await res.json();
    return SAMPLE_GROUPS.every((g) => Array.isArray(index[g])) ? index : null;
  } catch {
    return null;
  }
}

// The files of one example (with an OBJ's MTL) as { name, data } payloads.
export async function fetchSample(entry, base = './samples/') {
  const out = [];
  for (const rel of [entry.file, ...(entry.files || [])]) {
    const res = await fetch(`${base}${rel}`);
    if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
    const data = new Uint8Array(await res.arrayBuffer());
    out.push({ name: rel.split('/').pop(), data, path: null, dir: null, size: data.length });
  }
  return out;
}

const baseOf = (file) => file.split('/').pop().replace(/\.[^.]+$/, '');

// The picture a 3D example was made from (models/robot.glb and
// results/robot-triposr.glb ← images/robot.png), so opening the example puts
// its picture in the input panel too; null for a 3D file without one
// (shapes.gltf) and for a picture itself. `entry.image` names it outright.
export function sampleImageFor(entry, index) {
  const images = index?.images || [];
  if (!entry || images.includes(entry)) return null;
  if (entry.image) return images.find((i) => i.file === entry.image) || null;
  const base = baseOf(entry.file);
  let best = null;
  for (const img of images) {
    const b = baseOf(img.file);
    if ((base === b || base.startsWith(`${b}-`)) && (!best || b.length > baseOf(best.file).length)) best = img;
  }
  return best;
}

export function sampleLabel(entry, lang) {
  return (lang === 'en' ? entry.en : entry.ko) || entry.file.split('/').pop();
}
