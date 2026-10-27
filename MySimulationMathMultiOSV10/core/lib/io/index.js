// I/O area: files, data formats (MAT, CSV, XLSX, JSON, XML), archives, audio,
// web access, file-system builtins, and the image library (core/lib/image).
//
// Every module exports `builtins` and `help`; this file merges them. Names
// already defined by an earlier area (base, linalg, numeric) are skipped so
// the registry never sees a duplicate from us.
import * as base from '../base/index.js';
import * as linalg from '../linalg/index.js';
import * as numeric from '../numeric/index.js';

import * as files from './files.js';
import * as textio from './textio.js';
import * as delimited from './delimited.js';
import * as fsys from './fsys.js';
import * as web from './web.js';
import * as audio from './audio.js';
import * as matio from './matio.js';
import * as json from './json.js';
import * as xml from './xml.js';
import * as xlsx from './xlsx.js';
import * as archive from './archive.js';
import * as image from '../image/index.js';

const MODULES = [files, textio, delimited, fsys, web, audio, matio, json, xml, xlsx, archive, image];
const EARLIER = [base, linalg, numeric];

export const builtins = Object.create(null);
export const help = Object.create(null);
export const classes = Object.create(null);
const installs = [];

const taken = new Set();
for (const a of EARLIER) for (const k of Object.keys(a.builtins || {})) taken.add(k);

for (const m of MODULES) {
  for (const [name, fn] of Object.entries(m.builtins || {})) {
    if (name in builtins) throw new Error(`io: builtin "${name}" is defined twice inside the I/O area`);
    if (taken.has(name) && !fn.override) continue;
    builtins[name] = fn;
  }
  for (const [name, h] of Object.entries(m.help || {})) if (name in builtins) help[name] = h;
  Object.assign(classes, m.classes || {});
  if (typeof m.install === 'function') installs.push(m.install);
}

export function install(ctx) {
  for (const f of installs) f(ctx);
}
