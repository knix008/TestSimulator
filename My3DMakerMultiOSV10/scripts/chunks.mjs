// The production build's chunks (vite.config.js → manualChunks), in a module of its own so a unit test
// can check them.
//
//   three, kernel, vendor — third-party code (never imports the app); the OpenCASCADE glue (replicad-opencascadejs)
//                           is left to Rollup: it is reached only through the kernel's dynamic import;
//   cad                   — the modelling core (sketch solver, features, assembly, drawings: no DOM);
//   i18n, icons           — the texts and pictures;
//   shared                — the rest of the app's code (view, ui, platform);
//   app, popup, viewer    — each window's own entry module (main.js loads one of them), left to Rollup.
export function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  if (file.includes('/node_modules/replicad-opencascadejs/')) return undefined;
  if (file.includes('/node_modules/replicad/')) return 'kernel';
  if (file.includes('/node_modules/three/examples/')) return 'three-extras';
  if (file.includes('/node_modules/three')) return 'three';
  if (file.includes('/node_modules/')) return 'vendor';
  if (!file.includes('/src/')) return undefined;
  if (/\/src\/(app|popup|viewer|main)\.js$/.test(file)) return undefined;
  if (file.includes('/src/cad/')) return 'cad';
  if (file.includes('/src/i18n')) return 'i18n';
  if (file.includes('/src/icon')) return 'icons';
  return 'shared';
}
