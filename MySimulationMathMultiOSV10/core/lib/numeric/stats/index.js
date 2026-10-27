// stats submodule of the numerics area: probability distributions, descriptive
// statistics, hypothesis tests, regression, clustering and PCA.
// Exports builtins, help and classes; duplicate names inside the submodule throw.
import * as dist from './dist.js';
import * as distobj from './distobj.js';
import * as descriptive from './descriptive.js';
import * as htest from './htest.js';
import * as regress from './regress.js';
import * as cluster from './cluster.js';

const PARTS = [['dist', dist], ['distobj', distobj], ['descriptive', descriptive], ['htest', htest], ['regress', regress], ['cluster', cluster]];
export const builtins = {};
export const help = {};
export const classes = {};
for (const [name, mod] of PARTS) {
  for (const [k, fn] of Object.entries(mod.builtins || {})) {
    if (builtins[k]) throw new Error(`numeric/stats: builtin "${k}" defined twice (${name})`);
    builtins[k] = fn;
  }
  Object.assign(help, mod.help || {});
  for (const [k, c] of Object.entries(mod.classes || {})) {
    if (classes[k]) throw new Error(`numeric/stats: class "${k}" defined twice (${name})`);
    classes[k] = c;
  }
}
