// Models come from the engine one per version. Versions of one model share a
// family (Hunyuan3D 2.1 · 2.0 · 2.0 Turbo …): the app lists families and
// offers a version picker where a family has more than one. Each version keeps
// its own options (settings.convertOptions is keyed by the model id).

// [{ family, name, versions: [model, …] }] in the engine's order.
export function groupFamilies(models) {
  const out = [];
  const byId = new Map();
  for (const m of models || []) {
    const id = m.family || m.id;
    let fam = byId.get(id);
    if (!fam) {
      fam = { family: id, name: m.familyName || m.name, versions: [] };
      byId.set(id, fam);
      out.push(fam);
    }
    fam.versions.push(m);
  }
  return out;
}

// The version of `family` to show: the model in use when it belongs to the
// family, else the one last picked there, else the first (the newest).
export function shownVersion(fam, current, remembered = {}) {
  return fam.versions.find((m) => m.id === current)
    || fam.versions.find((m) => m.id === remembered[fam.family])
    || fam.versions[0];
}

// Settings after picking model `id`: it becomes the model in use and the
// remembered version of its family.
export function pickVersion(settings, models, id) {
  const m = (models || []).find((x) => x.id === id);
  const family = m?.family || id;
  return {
    ...settings,
    model: id,
    modelVersions: { ...(settings.modelVersions || {}), [family]: id },
  };
}

// True when the model may only be installed after its license was accepted.
export const needsLicense = (m) => !!m && (m.status === 'needs-license' || (m.regionRestricted && m.status === 'unknown'));
