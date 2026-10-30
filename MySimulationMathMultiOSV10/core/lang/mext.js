// The file extension of M code. The app's own extension is .mym (new and saved
// scripts, functions and classes); .m files are still read, run and found on
// the path. When both exist for a name, .mym wins.

export const M_EXT = '.mym';
/** Extensions of M files in lookup order. */
export const M_EXTS = ['.mym', '.m'];

const RE = /\.(mym|m)$/i;
/** Whether a file name is an M file (.mym or .m). */
export const isMFile = (name) => RE.test(String(name || ''));
/** The name without its M extension ("f.mym" → "f"). */
export const stripMExt = (name) => String(name || '').replace(RE, '');
