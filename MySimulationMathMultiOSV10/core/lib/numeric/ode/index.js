// ode submodule of the numerics area: initial value problems (ode45 ...
// ode15i), boundary value problems (bvp4c/bvp5c), parabolic PDEs (pdepe) and
// delay differential equations (dde23/ddesd).
import * as solvers from './solvers.js';
import * as bvp from './bvp.js';
import * as pde from './pdepe.js';
import * as dde from './dde.js';

const PARTS = [solvers, bvp, pde, dde];
export const builtins = {};
export const help = {};
export const classes = {};
for (const p of PARTS) {
  for (const [k, f] of Object.entries(p.builtins)) {
    if (builtins[k]) throw new Error(`numeric/ode: builtin "${k}" defined twice`);
    builtins[k] = f;
  }
  Object.assign(help, p.help);
}
