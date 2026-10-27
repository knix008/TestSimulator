// Image library: file codecs (imread/imwrite/imfinfo) and image processing.
// Merged into the I/O area by core/lib/io/index.js.
import * as imio from './imio.js';
import * as proc from './proc.js';
import * as filt from './filt.js';
import * as morph from './morph.js';

const MODULES = [imio, proc, filt, morph];

export const builtins = {};
export const help = {};
for (const m of MODULES) {
  for (const [k, v] of Object.entries(m.builtins)) {
    if (k in builtins) throw new Error(`image: builtin "${k}" is defined twice`);
    builtins[k] = v;
  }
  Object.assign(help, m.help);
}
