// signal submodule of the numerics area: windows, filter design, frequency
// responses, spectral estimation, correlation, multirate and waveform
// functions, digitalFilter/designfilt. Exports builtins, help, classes.
//
// filter, filter2, conv2, convn, sinc and unwrap are general-purpose names
// that the base or linear-algebra areas may also define. They live in
// proc.shared; list a name in DEFER when another area owns it.
import * as windows from './windows.js';
import * as design from './design.js';
import * as spectral from './spectral.js';
import * as proc from './proc.js';
import * as dfilt from './dfilt.js';
import * as extra from './extra.js';

const PARTS = [['windows', windows], ['design', design], ['spectral', spectral], ['proc', proc], ['dfilt', dfilt], ['extra', extra]];

export const builtins = Object.create(null);
export const help = Object.create(null);
export const classes = Object.create(null);
const owner = Object.create(null);
for (const [name, mod] of PARTS) {
  for (const [k, fn] of Object.entries(mod.builtins || {})) {
    if (builtins[k]) throw new Error(`signal: builtin "${k}" defined by both ${owner[k]} and ${name}`);
    builtins[k] = fn; owner[k] = name;
  }
  for (const [k, h] of Object.entries(mod.help || {})) help[k] = h;
  for (const [k, c] of Object.entries(mod.classes || {})) classes[k] = c;
}

/** Shared names owned by another area (base/linalg): not registered here. */
export const DEFER = [];
/** Names offered to the registry only when no other area defines them. */
export const SHARED_NAMES = Object.keys(proc.shared);
export const skipped = [];
for (const [k, fn] of Object.entries(proc.shared)) {
  if (DEFER.includes(k)) { skipped.push(k); delete help[k]; continue; }
  if (builtins[k]) throw new Error(`signal: builtin "${k}" defined twice`);
  builtins[k] = fn;
}
/** The shared implementations, for tests (always available). */
export const sharedImpl = proc.shared;
