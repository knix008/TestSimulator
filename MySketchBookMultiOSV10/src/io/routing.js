// File › Import… and drag & drop: which importer a file goes to. Pure (no DOM,
// no three.js): the app hands in the name tests of each importer, so formats
// added to io/formats.js (3D models), ui/plan-import.js (plans, buildings) or
// io/texformats.js (textures, environments) are routed without changes here.
//
//   const router = createImportRouter({ isProject, isModel, isPlan, isPlanImage, isBuilding, … });
//   router.classify('chair.fbx')      → 'model'
//   router.route(['chair.obj', 'chair.mtl', 'wood.png'])   → { model: [all three], … }

/** Importers, in the order the unified dialog lists them. */
export const IMPORT_KINDS = ['project', 'model', 'plan', 'building', 'texture', 'environment'];

const never = () => false;
const extOf = (name) => { const m = /\.([^./\\]+)$/.exec(String(name ?? '')); return m ? m[1].toLowerCase() : ''; };
const unique = (list) => [...new Set(list.map((e) => String(e).trim().replace(/^\./, '').toLowerCase()).filter(Boolean))];

/**
 * sources: name tests — isProject, isModel, isPlan (CAD drawings, PDF …), isPlanImage (pictures traced over),
 * isBuilding (IFC, Sweet Home 3D …), isTexture, isEnvironment, isHdr (.hdr/.exr: environment first) and
 * isCompanion (side files of a model: .mtl, .bin …; textures are companions too when a model comes along);
 * extensions: { project, model, plan, building, texture, environment } for the dialog filters.
 */
export function createImportRouter(sources = {}) {
  const is = {
    project: sources.isProject ?? never,
    model: sources.isModel ?? never,
    plan: sources.isPlan ?? never,
    planImage: sources.isPlanImage ?? never,
    building: sources.isBuilding ?? never,
    texture: sources.isTexture ?? never,
    environment: sources.isEnvironment ?? never,
    hdr: sources.isHdr ?? never,
    companion: sources.isCompanion ?? ((name) => /\.(mtl|bin)$/i.test(String(name ?? ''))),
  };
  const ext = sources.extensions ?? {};

  /** What a picture can be used as: a subset of 'plan' (underlay), 'texture', 'environment'. */
  function usesOf(name) {
    const uses = [];
    if (is.planImage(name)) uses.push('plan');
    if (is.texture(name)) uses.push('texture');
    if (is.environment(name)) uses.push('environment');
    return uses;
  }

  /**
   * One file on its own → 'project' | 'model' | 'building' | 'plan' | 'texture' | 'environment',
   * 'image' (a picture that can be a plan underlay, a texture or a sky: the app asks), 'companion'
   * (.mtl / .bin: only with a model) or null (not importable).
   */
  function classify(name) {
    if (is.project(name)) return 'project';
    if (is.model(name)) return 'model';
    if (is.building(name)) return 'building';
    if (is.plan(name)) return 'plan';
    const uses = usesOf(name);
    if (is.hdr(name) && uses.includes('environment')) return 'environment';
    if (uses.length === 1) return uses[0];
    if (uses.length > 1) return 'image';
    if (is.companion(name)) return 'companion';
    return null;
  }

  /**
   * Several files (a drop, a multiple choice in the dialog) → groups by importer. When a 3D model is among
   * them, its side files (.mtl, .bin, texture pictures) go with it, so a model and its textures import as one.
   * HDR panoramas stay environments. Files nothing can read are in `unknown`.
   */
  function route(files, nameOf = (f) => (typeof f === 'string' ? f : f?.name)) {
    const groups = { project: [], model: [], building: [], plan: [], texture: [], environment: [], image: [], unknown: [] };
    const kinds = files.map((f) => classify(nameOf(f)));
    const withModel = kinds.includes('model');
    files.forEach((file, i) => {
      let kind = kinds[i];
      if (withModel && (kind === 'companion' || kind === 'texture' || kind === 'image')) kind = 'model';
      if (kind === 'companion' || kind == null) kind = 'unknown';
      groups[kind].push(file);
    });
    return groups;
  }

  /** Extensions of one importer (plan includes the plan pictures). */
  function extensionsOf(kind) {
    return unique(ext[kind] ?? []);
  }

  /**
   * File dialog filters, grouped: [{ id, name, extensions }] — "All supported" first, then one per importer
   * that has extensions. `label(id)` gives the name ('all', 'project', 'model', 'plan', 'texture', 'environment').
   * Plans and buildings share one filter ("Floor plans & buildings").
   */
  function filters(label = (id) => id) {
    const groups = [
      ['project', extensionsOf('project')],
      ['model', unique([...extensionsOf('model'), ...(ext.companion ?? [])])],
      ['plan', unique([...extensionsOf('plan'), ...extensionsOf('building')])],
      ['texture', extensionsOf('texture')],
      ['environment', extensionsOf('environment')],
    ].filter(([, list]) => list.length);
    const all = unique(groups.flatMap(([, list]) => list));
    return [{ id: 'all', name: label('all'), extensions: all }, ...groups.map(([id, list]) => ({ id, name: label(id), extensions: list }))];
  }

  /** `accept` attribute of an <input type="file"> for everything importable. */
  const accept = () => filters()[0].extensions.map((e) => `.${e}`).join(',');

  /** Short list of the supported extensions per importer (the "cannot open" notice). */
  const summary = (label = (id) => id) => filters(label).slice(1).map((f) => `${f.name}: ${f.extensions.map((e) => `.${e}`).join(' ')}`).join('\n');

  return { classify, usesOf, route, filters, accept, summary, extensionsOf, extOf };
}

/** Accept-string ('.dxf,.svg,…') or list → extensions without dots. */
export const extensionsFromAccept = (accept) => unique(Array.isArray(accept) ? accept : String(accept ?? '').split(','));
