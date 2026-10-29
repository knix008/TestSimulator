// Linear algebra area: matrix functions and factorizations (dense.js), sparse
// matrices and iterative solvers (sparse.js), FFT / convolution / filtering /
// polynomials (fft.js), interpolation and computational geometry (interp.js),
// special functions (special.js) and special matrices (matrices.js).
import * as dense from './dense.js';
import * as sparse from './sparse.js';
import * as fft from './fft.js';
import * as interp from './interp.js';
import * as special from './special.js';
import * as matrices from './matrices.js';
import * as qz from './qz.js';
import * as extra from './extra.js';

const MODULES = [['dense', dense], ['sparse', sparse], ['fft', fft], ['interp', interp], ['special', special], ['matrices', matrices], ['qz', qz], ['extra', extra]];

export const builtins = Object.create(null);
export const help = Object.create(null);
export const classes = Object.create(null);
for (const [name, mod] of MODULES) {
  for (const [k, fn] of Object.entries(mod.builtins || {})) {
    if (builtins[k]) throw new Error(`linalg: builtin "${k}" defined twice (${name})`);
    builtins[k] = fn;
  }
  Object.assign(help, mod.help || {});
  for (const [k, def] of Object.entries(mod.classes || {})) {
    if (classes[k]) throw new Error(`linalg: class "${k}" defined twice (${name})`);
    classes[k] = def;
  }
}

// Helpers for base operators on sparse operands (see sparse.js).
export * as sparseOps from './sparse.js';
