// Graphics area: handle graphics, plotting, UI components and renderers'
// scene protocol (PROTOCOL.md). Pure ESM; runs in the engine Web Worker.
import { builtins as manage } from './manage.js';
import { builtins as plots } from './plots.js';
import { builtins as plots3d } from './plots3d.js';
import { builtins as ui, install as installUi } from './uifuncs.js';
import { classes as handleClasses } from './classes.js';
import { help as helpTable } from './help.js';
// Octave-compatibility additions (handles, colormaps, camera, extra plots,
// volume visualisation, extra UI components). Each module exports
// { builtins, help, quiet } (quiet = plot-like names that return handles only on request).
import * as octaveMod from './octave.js';
import * as volumeMod from './volume.js';
import * as uiExtraMod from './uiextra.js';
const EXTRA = [octaveMod, volumeMod, uiExtraMod];

/** Plot functions return their handles only when an output is requested. */
const QUIET = new Set(`plot plot3 loglog semilogx semilogy line scatter scatter3 polarscatter bar barh histogram histogram2 area stairs stem stem3
errorbar fill fill3 patch text rectangle image imagesc imshow pcolor polarplot polar compass feather polarhistogram animatedline fplot fplot3
fimplicit ezplot pie pie3 boxplot heatmap xline yline surf surfc mesh meshc meshz waterfall surface ribbon quiver quiver3 streamline fsurf fmesh
fcontour ezsurf ezmesh bar3 bar3h light camlight lightangle figure axes polaraxes subplot tiledlayout nexttile uifigure uiaxes uicontrol uipanel
uibutton uislider uieditfield uilabel uidropdown uicheckbox waitbar newplot`.split(/\s+/).filter(Boolean));

for (const m of EXTRA) for (const n of m.quiet || []) QUIET.add(n);

const all = { ...manage, ...plots, ...plots3d, ...ui };
for (const m of EXTRA) {
  for (const [name, fn] of Object.entries(m.builtins || {})) {
    if (name in all) throw new Error(`graphics: builtin "${name}" is defined twice`);
    all[name] = fn;
  }
}

export const builtins = {};
for (const [name, fn] of Object.entries(all)) {
  if (typeof fn !== 'function') continue;
  const wrapped = QUIET.has(name)
    ? function graphicsBuiltin(args, nargout, ctx) { const r = fn(args, nargout, ctx); return nargout === 0 ? [] : r; }
    : function graphicsBuiltin(args, nargout, ctx) { return fn(args, nargout, ctx); };
  // Generic names (delete, pause, imshow, colormap functions ...) may also be
  // defined by an earlier area; graphics takes them over.
  wrapped.override = true;
  builtins[name] = wrapped;
}

export const help = { ...helpTable };
for (const m of EXTRA) Object.assign(help, m.help || {});
export const classes = handleClasses;
export function install(ctx) { installUi(ctx); }

export { G } from './model.js';
export { flush } from './scene.js';
export { handleMessage } from './uifuncs.js';
