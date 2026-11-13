// The production build's chunks (vite.config.js → manualChunks), in a module of its own so a unit test
// (test/unit/chunks.test.js) can check that the library chunks only import downwards.

/**
 * The chunk a module goes into (undefined: Rollup's choice). The chunks follow the code's layers, so that imports only
 * run downwards and no two chunks import each other:
 *   three, loaders, vendor, pathtracer, manifold, avif — third-party code (never imports the app);
 *   core            — what the furniture models use from the engine (stairs and the document helpers they import);
 *   library-*       — the furniture models (~2.6 MB of source): the base modules with the three shared ones the rest
 *                     build on, then the -more, -plus and -extra modules (each importing only the base and core);
 *   i18n, icons     — the texts and pictures (data the app reads);
 *   shared          — the rest of the app's code (engine, io, modeling, tools, ui, the library index and catalog),
 *                     one chunk because those parts use each other;
 *   app, popup, viewer — each window's own entry module (main.js loads one of them), left to Rollup.
 */
export function chunkOf(id) {
  const file = id.replace(/\\/g, '/');
  if (file.includes('/node_modules/three-gpu-pathtracer/')) return 'pathtracer';
  if (file.includes('/node_modules/manifold-3d/')) return 'manifold';
  // The AVIF encoder (loaded only when a picture is saved as AVIF and the canvas cannot write it).
  if (file.includes('/node_modules/@jsquash/')) return 'avif';
  // The plan import's readers (pdf.js, UTIF): reached only through dynamic imports, so Rollup gives them chunks of their
  // own that load when a PDF or a TIFF file is imported. Naming them here (or leaving them to 'vendor') would make the
  // app shell preload them.
  if (['/node_modules/pdfjs-dist/', '/node_modules/utif/', '/node_modules/pako/'].some((dir) => file.includes(dir))) return undefined;
  if (file.includes('/node_modules/three/examples/jsm/loaders/') || file.includes('/node_modules/three/examples/jsm/exporters/')) return 'loaders';
  if (file.includes('/node_modules/three')) return 'three';
  if (file.includes('/node_modules/')) return 'vendor';
  if (!file.includes('/src/')) return undefined;
  // The three windows' own code (main.js loads one of them): chunks of their own, or opening a popup window would run
  // the main window's start-up too.
  if (/\/src\/(app|popup|viewer|main)\.js$/.test(file)) return undefined;
  if (file.endsWith('/src/engine/stairs.js') || file.endsWith('/src/engine/document.js')) return 'core';
  if (file.includes('/src/library/parametric/') && !file.endsWith('/index.js')) {
    const name = file.split('/').pop();
    // The office / server room / computer / security / landscaping categories and the extra air conditioners and light
    // fixtures build on the base and on accessories-plus.js: a layer of their own above library-plus (in library-base
    // they made a base ↔ plus cycle — "Cannot access before initialization" when the built app started).
    if (/^(office-props\d*|server-room\d*|computers\d*|landscape\d*|security(-moved|\d*)|appliances-air|lighting-fixtures)\.js$/.test(name)) return 'library-rooms';
    if (/-extra\.js$/.test(name)) return 'library-extra';
    if (/-plus\d*\.js$/.test(name)) return 'library-plus';
    if (/-more\.js$/.test(name) && !['appliances-more.js', 'doors-more.js', 'structure-more.js'].includes(name)) return 'library-more';
    return 'library-base';
  }
  if (file.includes('/src/i18n')) return 'i18n';
  if (file.includes('/src/icon')) return 'icons';
  return 'shared';
}
