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

export function sampleLabel(entry, lang) {
  return (lang === 'en' ? entry.en : entry.ko) || entry.file.split('/').pop();
}
