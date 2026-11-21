// Type names, defaults, base names and icons of the added mold tools (no imports: features.js, the tree and the
// commands read them while the modules load). Built in mold-more.js.
export const MOLD_MORE_TYPES = ['shutOff', 'partingSurface'];

export const MOLD_MORE_ICONS = { shutOff: 'shutOff', partingSurface: 'partingSurface' };

export const MOLD_MORE_DEFAULTS = {
  // dir: the pull direction ('' = the parting line's); keep: which side's openings get the patch.
  shutOff: () => ({ dir: '', at: 'parting' }),
  // distance: how far the surface runs out from the parting line.
  // mode: how the surface runs out from a parting line that is not level ('normal' | 'tangent' | 'ruled').
  partingSurface: () => ({ dir: '', distance: 30, mode: 'normal' }),
};

export const MOLD_MORE_NAMES = { shutOff: 'Shut-off Surface', partingSurface: 'Parting Surface' };
