// Type names, defaults, base names and icons of the added mold tools (no imports: features.js, the tree and the
// commands read them while the modules load). Built in mold-more.js.
export const MOLD_MORE_TYPES = ['shutOff', 'partingSurface'];

export const MOLD_MORE_ICONS = { shutOff: 'shutOff', partingSurface: 'partingSurface' };

export const MOLD_MORE_DEFAULTS = {
  // dir: the pull direction ('' = the parting line's); keep: which side's openings get the patch.
  shutOff: () => ({ dir: '', at: 'parting' }),
  // distance: how far the surface runs out from the parting line.
  partingSurface: () => ({ dir: '', distance: 30 }),
};

export const MOLD_MORE_NAMES = { shutOff: 'Shut-off Surface', partingSurface: 'Parting Surface' };
