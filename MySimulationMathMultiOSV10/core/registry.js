// Collects the builtins, help texts and JS classes of every library area.
// Order matters only for `override: true` entries (later areas win).
import * as base from './lib/base/index.js';
import * as linalg from './lib/linalg/index.js';
import * as numeric from './lib/numeric/index.js';
import * as io from './lib/io/index.js';
import * as graphics from './graphics/index.js';
import * as sim from './sim/index.js';

export const AREAS = [['base', base], ['linalg', linalg], ['numeric', numeric], ['io', io], ['graphics', graphics], ['sim', sim]];

export function buildRegistry() {
  const builtins = Object.create(null);
  const owner = Object.create(null);
  const help = Object.create(null);
  const classes = Object.create(null);
  const installs = [];
  for (const [area, mod] of AREAS) {
    for (const [name, fn] of Object.entries(mod.builtins || {})) {
      if (builtins[name] && !fn.override) throw new Error(`Builtin "${name}" is defined by both ${owner[name]} and ${area}`);
      builtins[name] = fn;
      owner[name] = area;
    }
    Object.assign(help, mod.help || {});
    for (const [name, def] of Object.entries(mod.classes || {})) {
      if (classes[name]) throw new Error(`Class "${name}" is defined twice (${area})`);
      classes[name] = def;
    }
    if (typeof mod.install === 'function') installs.push(mod.install);
  }
  return { builtins, owner, help, classes, installs };
}
