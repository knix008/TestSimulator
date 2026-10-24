// Renaming a model's labels when the UI language changes: names that came from
// a sample, from the material library or from the app's automatic naming
// ("Body 3", "Probe 1", "New material 2", "Untitled") follow the language;
// names the user typed are left alone. Pure, unit-tested in Node.
import { MATERIAL_LIBRARY } from './materials.js';
import { sampleModel, SAMPLE_IDS } from './samples.js';

const AUTO = [
  ['물체', 'Body'], ['탐침', 'Probe'], ['경계', 'Boundary'], ['새 재료', 'New material'],
];
const UNTITLED = ['제목 없음', 'Untitled'];

function translateAuto(name, from, to) {
  if (typeof name !== 'string') return name;
  const fi = from === 'en' ? 1 : 0;
  const ti = to === 'en' ? 1 : 0;
  if (name === UNTITLED[fi]) return UNTITLED[ti];
  for (const pair of AUTO) {
    const m = name.match(new RegExp(`^${pair[fi]} (\\d+)$`));
    if (m) return `${pair[ti]} ${m[1]}`;
  }
  return name;
}

/** The model with its labels in `to` (from `from`); the same object when nothing changes. */
export function relabelModel(model, from, to) {
  if (!model || from === to) return model;
  const sampleId = model.view?.sample;
  const src = sampleId && SAMPLE_IDS.includes(sampleId) ? sampleModel(sampleId, from) : null;
  const dst = sampleId && SAMPLE_IDS.includes(sampleId) ? sampleModel(sampleId, to) : null;
  const byId = (list, id) => list?.find((x) => x.id === id);
  let changed = false;
  const rename = (item, oldList, newList) => {
    const was = byId(oldList, item.id);
    const now = byId(newList, item.id);
    let name = item.name;
    if (was && now && item.name === was.name) name = now.name;
    else name = translateAuto(item.name, from, to);
    if (name === item.name) return item;
    changed = true;
    return { ...item, name };
  };
  const library = (m) => {
    const lib = MATERIAL_LIBRARY.find((x) => x.id === m.id || (m.id.startsWith(x.id) && /^\d+$/.test(m.id.slice(x.id.length))));
    if (lib && m.name === (from === 'en' ? lib.name.en : lib.name.ko)) {
      changed = true;
      return { ...m, name: to === 'en' ? lib.name.en : lib.name.ko };
    }
    return null;
  };
  const out = {
    ...model,
    bodies: model.bodies.map((b) => rename(b, src?.bodies, dst?.bodies)),
    boundaries: model.boundaries.map((b) => rename(b, src?.boundaries, dst?.boundaries)),
    probes: model.probes.map((p) => rename(p, src?.probes, dst?.probes)),
    materials: model.materials.map((m) => rename(m, src?.materials, dst?.materials) !== m ? rename(m, src?.materials, dst?.materials) : (library(m) ?? m)),
  };
  if (src && model.name === src.name) { out.name = dst.name; changed = true; } else {
    const name = translateAuto(model.name, from, to);
    if (name !== model.name) { out.name = name; changed = true; }
  }
  if (src && model.description === src.description) { out.description = dst.description; changed = true; }
  return changed ? out : model;
}
