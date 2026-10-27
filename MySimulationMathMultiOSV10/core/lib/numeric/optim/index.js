// optim submodule of the numerics area: root finding, local and global
// optimization, linear/quadratic/integer programming, least squares and the
// option structures. Exports builtins, help, classes.
import * as scalar from './scalar.js';
import * as unconstrained from './unconstrained.js';
import * as nlcon from './nlcon.js';
import * as lsq from './lsq.js';
import * as lp from './lp.js';
import * as global from './global.js';
import * as options from './options.js';

const PARTS = [scalar, unconstrained, nlcon, lsq, lp, global, options];

export const builtins = {};
export const help = {};
export const classes = {};
for (const p of PARTS) {
  for (const [k, fn] of Object.entries(p.builtins)) {
    if (builtins[k]) throw new Error(`numeric/optim: builtin "${k}" defined twice`);
    builtins[k] = fn;
  }
  Object.assign(help, p.help);
}
