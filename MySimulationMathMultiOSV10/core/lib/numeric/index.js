// Numerics area: random numbers, ODE/DAE/BVP/PDE solvers, integration,
// optimization, statistics, signal processing and control systems.
// Each submodule exports { builtins, help, classes, install? }; this file
// merges them and rejects duplicate names.
import * as random from './random.js';
import * as integral from './integral/index.js';
import * as ode from './ode/index.js';
import * as optim from './optim/index.js';
import * as stats from './stats/index.js';
import * as signal from './signal/index.js';
import * as control from './control/index.js';

export const SUBMODULES = [['random', random], ['integral', integral], ['ode', ode], ['optim', optim], ['stats', stats], ['signal', signal], ['control', control]];

export const builtins = Object.create(null);
export const help = Object.create(null);
export const classes = Object.create(null);
const owner = Object.create(null);
const installs = [];
for (const [name, mod] of SUBMODULES) {
  for (const [k, fn] of Object.entries(mod.builtins || {})) {
    if (builtins[k]) throw new Error(`numeric: builtin "${k}" defined by both ${owner[k]} and ${name}`);
    builtins[k] = fn; owner[k] = name;
  }
  for (const [k, h] of Object.entries(mod.help || {})) help[k] = h;
  for (const [k, c] of Object.entries(mod.classes || {})) {
    if (classes[k]) throw new Error(`numeric: class "${k}" defined twice (${name})`);
    classes[k] = c;
  }
  if (typeof mod.install === 'function') installs.push(mod.install);
}
export function install(ctx) { for (const f of installs) f(ctx); }
