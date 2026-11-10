// The app's import router (io/routing.js) wired to every importer's own list of formats, so a format added to
// io/formats.js (3D models), ui/plan-import.js (plans, buildings) or io/texformats.js (textures, environments)
// is offered by File › Import… and routed by drag & drop without changes here.
//
// `plan` is the plan importer's module (ui/plan-import.js: isPlanName, isPlanImageName, isBuildingName,
// PLAN_ACCEPT, BUILDING_ACCEPT). app.js passes the real one; it is a parameter because that module needs Vite
// (the library catalog), so the Node unit tests hand in its name rules instead.
import { isModelName, isProjectName } from '../engine/fileformat.js';
import * as ModelFormats from './formats.js';
import { createImportRouter, extensionsFromAccept } from './routing.js';
import { ENVIRONMENT_EXTENSIONS, TEXTURE_EXTENSIONS, isEnvironmentName, isHdrName, isTextureName } from './texformats.js';

export function appImportRouter(plan = {}) {
  return createImportRouter({
    isProject: isProjectName,
    isModel: isModelName,
    isPlan: (name) => Boolean(plan.isPlanName?.(name)),
    isPlanImage: (name) => Boolean(plan.isPlanImageName?.(name)),
    // Buildings (IFC, Sweet Home 3D …) — plan-import.js counts them as plans too; both go to planImport.importFiles.
    isBuilding: (name) => Boolean(plan.isBuildingName?.(name)),
    isTexture: isTextureName,
    isEnvironment: isEnvironmentName,
    isHdr: isHdrName,
    isCompanion: (name) => /\.(mtl|bin)$/i.test(String(name ?? '')),
    extensions: {
      project: ['msk'],
      model: ModelFormats.MODEL_EXTENSIONS ?? [...ModelFormats.IMPORT_FORMATS, ...ModelFormats.UNSUPPORTED_FORMATS].flatMap((f) => f.ext),
      companion: ['mtl', 'bin'],
      plan: extensionsFromAccept(plan.PLAN_ACCEPT ?? ''),
      building: extensionsFromAccept(plan.BUILDING_ACCEPT ?? ''),
      texture: TEXTURE_EXTENSIONS,
      environment: ENVIRONMENT_EXTENSIONS,
    },
  });
}
