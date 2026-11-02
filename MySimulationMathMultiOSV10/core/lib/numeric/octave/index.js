// octave submodule of the numerics area: the GNU Octave core functions of the
// numerics area that have no counterpart elsewhere — special functions,
// polynomial and piecewise-polynomial helpers, Octave's optimization and
// quadrature interfaces (glpk, qp, sqp, quadcc …), the lsode/daspk/dassl/dasrt
// solvers with their *_options sets, statistics and time-series functions.
import * as math from './math.js';
import * as poly from './poly.js';
import * as options from './options.js';
import * as optim from './optim.js';
import * as ode from './ode.js';
import * as stats from './stats.js';
import * as signal from './signal.js';

const PARTS = [math, poly, options, optim, ode, stats, signal];
export const builtins = {};
export const help = {};
export const classes = {};
for (const p of PARTS) {
  for (const [k, fn] of Object.entries(p.builtins)) {
    if (builtins[k]) throw new Error(`numeric/octave: builtin "${k}" defined twice`);
    builtins[k] = fn;
  }
  Object.assign(help, p.help);
}
