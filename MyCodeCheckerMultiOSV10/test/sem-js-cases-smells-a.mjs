// sem-js samples: maintainability rules, first half of core/sem-js/rules/smells.js.
// In `bad`, every line ending with a "Noncompliant" comment must be reported.

function lines(n, make) {
  return Array.from({ length: n }, (_, i) => make(i)).join('\n');
}

function longFunction(name, codeLines, commentLines, mark) {
  return [
    `function ${name}(input) {${mark ? ' // Noncompliant' : ''}`,
    '  let total = 0;',
    lines(codeLines, (i) => `  total += input.values[${i}] * ${i + 1};`),
    lines(commentLines, (i) => `  // step ${i}: explain why the weighting is applied here`),
    '  return total;',
    '}',
    `${name}({ values: [] });`,
    '',
  ].join('\n');
}

function bigSwitch(name, cases, mark) {
  return [
    `function ${name}(code) {`,
    `  switch (code) {${mark ? ' // Noncompliant' : ''}`,
    lines(cases, (i) => `    case ${i}:\n      return 'label-${i}';`),
    '    default:',
    "      return 'unknown';",
    '  }',
    '}',
    `${name}(3);`,
    '',
  ].join('\n');
}

export default {
  'cognitive-complexity': [
    {
      bad: `
function summarize(items, opts) { // Noncompliant
  let total = 0;
  for (const item of items) {
    if (item.active) {
      for (const part of item.parts) {
        if (part.weight > 0 && part.visible) {
          total += part.weight;
        } else if (opts.strict) {
          throw new Error('invalid part');
        } else {
          while (part.retry > 0) {
            part.retry--;
          }
        }
      }
    }
  }
  return total;
}

const score = (rows, limit) => { // Noncompliant
  let s = 0;
  rows.forEach((row) => {
    if (row) {
      for (const c of row.cells) {
        if (c.value > limit || c.flag && c.other) {
          s += c.value > 10 ? 2 : 1;
        } else if (c.value < 0) {
          try {
            s -= check(c);
          } catch (err) {
            s = 0;
          }
        }
      }
    }
  });
  return s;
};
summarize([], {});
score([], 1);
`,
      good: `
function partWeight(part, opts) {
  if (part.weight > 0 && part.visible) return part.weight;
  if (opts.strict) throw new Error('invalid part');
  while (part.retry > 0) part.retry--;
  return 0;
}

function summarize(items, opts) {
  let total = 0;
  for (const item of items) {
    if (!item.active) continue;
    for (const part of item.parts) total += partWeight(part, opts);
  }
  return total;
}
summarize([], {});
`,
    },
  ],

  'too-many-params': [
    {
      bad: `
function createUser(id, name, email, phone, street, city, zip, country) { // Noncompliant
  return { id, name, email, phone, street, city, zip, country };
}
const draw = (ctx, x, y, w, h, color, border, shadow) => { // Noncompliant
  ctx.fillRect(x, y, w, h, color, border, shadow);
};
createUser(1);
draw(null);
`,
      good: `
function createUser(id, name, email, phone, street, city, zip) {
  return { id, name, email, phone, street, city, zip };
}
function createAddress({ street, city, zip, country, region, line2, line3, note }) {
  return [street, city, zip, country, region, line2, line3, note].join(', ');
}
createUser(1);
createAddress({});
`,
    },
    {
      lang: 'ts',
      bad: `
export function layout(a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: string): string { // Noncompliant
  return [a, b, c, d, e, f, g].join(h);
}
`,
      good: `
export class Service {
  constructor(private a: string, private b: string, private c: string, private d: string,
    private e: string, private f: string, private g: string, private h: string) {}
  all(): string { return [this.a, this.b, this.c, this.d, this.e, this.f, this.g, this.h].join(); }
}
export function typed(this: Window, a: number, b: number, c: number, d: number, e: number, f: number, g: number): number {
  return a + b + c + d + e + f + g;
}
`,
    },
  ],

  'function-too-long': {
    bad: longFunction('computeReport', 205, 0, true),
    good: longFunction('computeSummary', 150, 80, false),
  },

  'nesting-depth': {
    bad: `
function scan(rows) {
  for (const r of rows) {
    if (r.enabled) {
      while (r.next) {
        switch (r.kind) {
          case 1:
            if (r.ok) { // Noncompliant
              r.next = null;
            }
            break;
          default:
            try { // Noncompliant
              r.next = r.next.next;
            } catch (e) {
              r.next = null;
            }
        }
      }
    }
  }
}
scan([]);
`,
    good: `
function scan(rows) {
  for (const r of rows) {
    if (r.enabled) {
      while (r.next) {
        if (r.kind === 1) {
          r.next = null;
        } else if (r.kind === 2) {
          r.next = r.next.next;
        } else if (r.kind === 3) {
          r.skip = true;
        } else {
          break;
        }
      }
    }
  }
}
scan([]);
`,
  },

  'nested-functions': {
    bad: `
load(function () {
  parse(function () {
    validate(function () {
      save(function () {
        notify(function () { // Noncompliant
          done();
        });
        notify(() => done()); // Noncompliant
      });
    });
  });
});
`,
    good: `
load(function () {
  parse(function () {
    validate(function () {
      save(function () {
        done();
      });
    });
  });
});
async function pipeline() {
  await load();
  await parse();
  await save();
}
pipeline();
`,
  },

  'nested-ternary': {
    bad: `
function label(score, vip) {
  const tier = score > 90 ? 'gold' : score > 50 ? 'silver' : 'bronze'; // Noncompliant
  return vip ? (score > 0 ? 'vip' : 'vip-new') : tier; // Noncompliant
}
label(1, true);
`,
    good: `
function label(score, vip) {
  if (vip) return score > 0 ? 'vip' : 'vip-new';
  const high = score > 90 ? 'gold' : 'silver';
  const pick = vip ? () => (score > 0 ? 1 : 2) : null;
  return score > 50 ? high : String(pick);
}
label(1, true);
`,
  },

  'collapsible-if': {
    bad: `
function check(user, order) {
  if (user) {
    if (user.active) { // Noncompliant
      order.allow();
    }
  }
  if (order.total > 0)
    if (order.paid) order.ship(); // Noncompliant
}
check(null, null);
`,
    good: `
function check(user, order) {
  if (user && user.active) {
    order.allow();
  }
  if (user) {
    if (user.active) order.allow();
    else order.deny();
  }
  if (order.total > 0) {
    if (order.paid) order.ship();
  } else {
    order.cancel();
  }
  if (order.paid) {
    // shipping needs a confirmed address first
    if (order.address) order.ship();
  }
}
check(null, null);
`,
  },

  'duplicate-branch': {
    bad: `
function route(kind, req) {
  if (kind === 'a') {
    req.log('start');
    return req.handleA();
  } else if (kind === 'b') {
    req.log('start');
    req.handleB();
  } else if (kind === 'c') { // Noncompliant
    req.log('start');
    return req.handleA();
  }
  switch (kind) {
    case 'x':
      req.open();
      req.send();
      break;
    case 'y':
      req.close();
      break;
    case 'z': // Noncompliant
      req.open();
      req.send();
      break;
  }
  return null;
}
route('a', {});
`,
    good: `
function route(kind, req) {
  if (kind === 'a' || kind === 'c') {
    req.log('start');
    return req.handleA();
  } else if (kind === 'b') {
    req.log('start');
    req.handleB();
  }
  if (kind === 'd') req.reset();
  else if (kind === 'e') req.reset();
  switch (kind) {
    case 'x':
    case 'z':
      req.open();
      req.send();
      break;
    case 'y':
      req.close();
      break;
    default:
      req.ignore();
  }
  return null;
}
route('a', {});
`,
  },

  'identical-functions': {
    bad: `
function totalPrice(cart) {
  let sum = 0;
  for (const item of cart.items) sum += item.price * item.qty;
  return Math.round(sum * 100) / 100;
}
function totalCost(cart) { // Noncompliant
  let sum = 0;
  for (const item of cart.items) sum += item.price * item.qty;
  return Math.round(sum * 100) / 100;
}
const total = function (cart) { // Noncompliant
  let sum = 0;
  for (const item of cart.items) sum += item.price * item.qty;
  return Math.round(sum * 100) / 100;
};
totalPrice({}); totalCost({}); total({});
`,
    good: `
function totalPrice(cart) {
  let sum = 0;
  for (const item of cart.items) sum += item.price * item.qty;
  return Math.round(sum * 100) / 100;
}
function totalWeight(cart) {
  let sum = 0;
  for (const item of cart.items) sum += item.weight * item.qty;
  return Math.round(sum * 100) / 100;
}
function a() { return 1; }
function b() { return 1; }
totalPrice({}); totalWeight({}); a(); b();
`,
  },

  'unused-variable': {
    bad: `
function render(items) {
  const count = items.length; // Noncompliant
  let label; // Noncompliant
  function helper() { // Noncompliant
    return 1;
  }
  class Local {} // Noncompliant
  return items.map((x) => x * 2);
}
render([]);
`,
    good: `
function render(items, obj) {
  const count = items.length;
  const { hidden, ...visible } = obj;
  for (const key in visible) console.log(key);
  const _ignored = 1;
  function helper() { return count; }
  return helper() + hidden;
}
var globalCounter = 0;
render([], {});
`,
  },

  'unused-import': [
    {
      bad: `
import fs from 'fs'; // Noncompliant
import { join, resolve } from 'path'; // Noncompliant
import * as util from 'util'; // Noncompliant
export const dir = join('a', 'b');
`,
      good: `
import fs from 'fs';
import { join } from 'path';
import { Logger } from './log';
import { helper } from './helper';
export { helper };

/** @param {Logger} log */
export function read(log) {
  log.info(join('a', 'b'));
  return fs.readFileSync('x');
}
`,
    },
    {
      path: 'src/a.jsx',
      bad: `
import React from 'react';
import { useState } from 'react'; // Noncompliant
export function App() {
  return <div>hello</div>;
}
`,
      good: `
import React, { useState } from 'react';
export function App() {
  const [n] = useState(0);
  return <div>{n}</div>;
}
`,
    },
  ],

  'unused-parameter': {
    bad: `
function area(width, height, unit) { // Noncompliant
  return width * height;
}
function format(
  value,
  precision, // Noncompliant
  locale // Noncompliant
) {
  return String(value);
}
area(1, 2, 'cm');
format(1, 2, 'en');
`,
    good: `
function area(width, height, _unit) {
  return width * height;
}
function onEvent(event, target) {
  return event.type;
}
function legacy(a, b) {
  return arguments.length + a;
}
function middle(a, b, c) {
  return a + c;
}
document.addEventListener('click', onEvent);
area(1, 2, 'cm');
legacy(1, 2);
middle(1, 2, 3);
`,
  },

  'unused-private-member': [
    {
      bad: `
export class Cache {
  #store = new Map();
  #hits = 0; // Noncompliant
  #evict() { // Noncompliant
    this.#store.clear();
  }
  get(key) {
    return this.#store.get(key);
  }
}
`,
      good: `
export class Cache {
  #store = new Map();
  #hits = 0;
  #evict() { this.#store.clear(); }
  static isCache(o) { return #store in o; }
  get(key) {
    this.#hits++;
    if (this.#store.size > 100) this.#evict();
    return this.#store.get(key);
  }
}
`,
    },
    {
      lang: 'ts',
      bad: `
export class Repo {
  private cache: string[] = []; // Noncompliant
  private readonly url: string = '/api';
  constructor(private http: { get(u: string): string }, private logger: object) {} // Noncompliant
  load(): string {
    return this.http.get(this.url);
  }
  private unusedHelper(): void { // Noncompliant
    return;
  }
}
`,
      good: `
export class Repo {
  private cache: string[] = [];
  constructor(private http: { get(u: string): string }) {}
  load(): string {
    const { cache } = this;
    return this.http.get(cache.join(','));
  }
  private get size(): number { return 0; }
}
`,
    },
  ],

  'unused-label': {
    bad: `
function find(grid, target) {
  outer: for (const row of grid) { // Noncompliant
    for (const cell of row) {
      if (cell === target) return cell;
    }
  }
  block: { // Noncompliant
    grid.length = 0;
  }
  return null;
}
find([], 1);
`,
    good: `
function find(grid, target) {
  let hit = null;
  outer: for (const row of grid) {
    for (const cell of row) {
      if (cell === target) { hit = cell; break outer; }
      if (cell == null) continue outer;
    }
  }
  return hit;
}
find([], 1);
`,
  },

  'redundant-jump': {
    bad: `
function log(items) {
  for (const item of items) {
    if (!item) console.log('empty');
    continue; // Noncompliant
  }
  console.log('done');
  return; // Noncompliant
}
log([]);
`,
    good: `
function log(items) {
  for (const item of items) {
    if (!item) continue;
    console.log(item);
  }
  if (items.length === 0) return;
  console.log('done');
}
function nothing() {
  return;
}
log([]);
nothing();
`,
  },

  'redundant-boolean': {
    bad: `
function check(flag, ready, other) {
  if (flag == true) return 1; // Noncompliant
  if (ready || false) return 2; // Noncompliant
  const neg = !false; // Noncompliant
  while (other != false) other = null; // Noncompliant
  return neg;
}
check(1, 2, 3);
`,
    good: `
function check(flag, ready, opts) {
  if (flag) return 1;
  if (ready) return 2;
  const enabled = opts.enabled ?? true;
  const value = opts.value || false;
  return enabled && value;
}
check(1, 2, {});
`,
  },

  'unneeded-ternary': {
    bad: `
function describe(age, input) {
  const adult = age >= 18 ? true : false; // Noncompliant
  const minor = age < 18 ? false : true; // Noncompliant
  const name = input ? input : 'guest'; // Noncompliant
  return { adult, minor, name };
}
describe(1, 'a');
`,
    good: `
function describe(age, input) {
  const adult = age >= 18;
  const name = input || 'guest';
  const word = adult ? 'yes' : 'no';
  const flag = adult ? true : true;
  const next = read() ? read() : 'none';
  return { adult, name, word, flag, next, other: input ? age : input };
}
describe(1, 'a');
`,
  },

  'prefer-const': {
    bad: `
function total(items) {
  let tax = 0.1; // Noncompliant
  let sum = 0;
  for (let item of items) { // Noncompliant
    sum += item.price;
  }
  let { a, b } = items; // Noncompliant
  return sum * (1 + tax) + a + b;
}
total([]);
`,
    good: `
function total(items) {
  const tax = 0.1;
  let sum = 0;
  for (let i = 0; i < items.length; i++) sum += items[i].price;
  let last;
  last = items[items.length - 1];
  let { a, b } = items;
  a = a || 0;
  for (let item of items) {
    item = item || {};
    sum += item.extra;
  }
  return sum * (1 + tax) + a + b + last;
}
total([]);
`,
  },

  'object-spread': {
    bad: `
function merge(defaults, options) {
  const config = Object.assign({}, defaults, options); // Noncompliant
  return Object.assign({ debug: false }, config); // Noncompliant
}
merge({}, {});
`,
    good: `
function merge(target, defaults, list) {
  Object.assign(target, defaults);
  const all = Object.assign({}, ...list);
  return { ...defaults, ...all };
}
function local(Object) {
  return Object.assign({}, 1);
}
merge({}, {}, []);
local(null);
`,
  },

  'prefer-optional-chain': {
    bad: `
function city(user, cb) {
  const name = user && user.name; // Noncompliant
  if (user && user.address && user.address.city) { // Noncompliant
    cb && cb(user.address.city); // Noncompliant
  }
  return name;
}
city(null, null);
`,
    good: `
function city(user, other, cb) {
  const name = user?.name;
  const mixed = user && other.name;
  const flag = typeof cb === 'function' && cb();
  const ok = user.items && user.items.length > 0;
  return [name, mixed, flag, ok, user?.address?.city];
}
city(null, null, null);
`,
  },

  'useless-constructor': [
    {
      bad: `
class Base {
  constructor() {} // Noncompliant
}
class Child extends Base {
  constructor(...args) { // Noncompliant
    super(...args);
  }
}
class Other extends Base {
  constructor(a, b) { // Noncompliant
    super(a, b);
  }
}
export { Child, Other };
`,
      good: `
class Base {
  constructor() {
    this.ready = true;
  }
}
class Child extends Base {
  constructor(a) {
    super(a, 1);
  }
}
class Other extends Base {
  constructor(a, b) {
    // keeps the signature documented for subclasses
    super(a, b);
  }
}
export { Child, Other };
`,
    },
    {
      lang: 'ts',
      bad: `
export class Shape {
  constructor() {} // Noncompliant
}
`,
      good: `
export class Point {
  constructor(private x: number, private y: number) {}
  sum(): number { return this.x + this.y; }
}
export class Singleton {
  private constructor() {}
}
`,
    },
  ],

  'useless-catch': {
    bad: `
async function load(url) {
  try {
    return await fetch(url);
  } catch (err) { // Noncompliant
    throw err;
  }
}
function parse(text) {
  try {
    return JSON.parse(text);
  } catch (e) { // Noncompliant
    throw e;
  } finally {
    console.log('parsed');
  }
}
load('x'); parse('{}');
`,
    good: `
async function load(url) {
  try {
    return await fetch(url);
  } catch (err) {
    console.error(err);
    throw err;
  }
}
function parse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('bad json: ' + e.message);
  }
}
load('x'); parse('{}');
`,
  },

  'useless-rename': {
    bad: `
import { readFile as readFile } from 'fs'; // Noncompliant
const { name: name, age: age = 0 } = readFile('p'); // Noncompliant
const value = name + age;
export { value as value }; // Noncompliant
`,
    good: `
import { readFile as read } from 'fs';
const { name: fullName, age = 0 } = read('p');
const value = fullName + age;
export { value as result, value };
`,
  },

  'useless-computed-key': {
    bad: `
const handlers = {
  ['save']: () => 1, // Noncompliant
  [42]: 'answer', // Noncompliant
};
class Api {
  ['fetch']() { // Noncompliant
    return handlers;
  }
}
export { Api };
`,
    good: `
const key = 'save';
const handlers = {
  [key]: () => 1,
  ['__proto__']: null,
  [Symbol.iterator]: null,
  save: () => 2,
};
const { ['save']: s } = handlers;
export { handlers, s };
`,
  },

  'useless-call': {
    bad: `
function run(fn, obj, a) {
  fn.call(undefined, a); // Noncompliant
  obj.method.call(obj, a); // Noncompliant
  fn.apply(null, [a]); // Noncompliant
  const f = function () { return a; }.bind(obj); // Noncompliant
  return f;
}
run();
`,
    good: `
function run(fn, obj, other, args) {
  fn.call(obj, 1);
  obj.method.call(other, 1);
  fn.apply(null, args);
  const g = function () { return this.x; }.bind(obj);
  const h = function (x) { return x; }.bind(null, 1);
  return [g, h];
}
run();
`,
  },

  'lonely-if': {
    bad: `
function grade(score) {
  if (score > 90) {
    return 'A';
  } else {
    if (score > 80) { // Noncompliant
      return 'B';
    }
  }
  return 'C';
}
grade(1);
`,
    good: `
function grade(score) {
  if (score > 90) {
    return 'A';
  } else if (score > 80) {
    return 'B';
  } else {
    console.log(score);
    if (score > 70) return 'C';
  }
  if (score > 60) {
    return 'D';
  } else {
    // keep the lower bands separate on purpose
    if (score > 50) return 'E';
  }
  return 'F';
}
grade(1);
`,
  },

  'return-boolean': {
    bad: `
function isAdult(age) {
  if (age >= 18) { // Noncompliant
    return true;
  } else {
    return false;
  }
}
function isEmpty(list) {
  if (list.length) return false; // Noncompliant
  return true;
}
isAdult(1); isEmpty([]);
`,
    good: `
function isAdult(age) {
  return age >= 18;
}
function check(list) {
  if (list.length) {
    console.log(list);
    return true;
  }
  if (list.ready) return true;
  return true;
}
isAdult(1); check([]);
`,
  },

  'immediately-returned': [
    {
      bad: `
function compute(a, b) {
  const result = a * b + 1; // Noncompliant
  return result;
}
function fail(msg) {
  const err = new Error(msg); // Noncompliant
  throw err;
}
compute(1, 2); fail('x');
`,
      good: `
function compute(a, b) {
  const result = a * b + 1;
  console.log(result);
  return result;
}
function fail(msg) {
  throw new Error(msg);
}
function keep(a) {
  const value = a + 1;
  // value is returned twice in the debug build
  return value;
}
compute(1, 2); fail('x'); keep(1);
`,
    },
    {
      lang: 'ts',
      bad: `
export function parse(text: string): number {
  const n = Number(text) as number; // Noncompliant
  return n;
}
`,
      good: `
export function parse(text: string): number {
  const n: number = Number(text);
  return n;
}
`,
    },
  ],

  'lone-block': {
    bad: `
function setup(app) {
  { // Noncompliant
    app.init();
    app.start();
  }
}
{ // Noncompliant
  setup({});
}
`,
    good: `
function setup(app) {
  {
    const local = app.init();
    local.start();
  }
  if (app.ready) {
    app.start();
  }
}
setup({});
`,
  },

  'empty-statement': {
    bad: `
function step(a) {
  a.run();; // Noncompliant
  ; // Noncompliant
  return a;
}
step({});
`,
    good: `
function step(queue) {
  while (queue.next());
  for (;;) {
    if (queue.done) break;
  }
  return queue;
}
step({});
`,
  },

  'empty-block': {
    bad: `
function poll(job) {
  if (job.done) {} // Noncompliant
  for (const t of job.tasks) {} // Noncompliant
  try {} finally { job.close(); } // Noncompliant
  switch (job.kind) {} // Noncompliant
}
poll({});
`,
    good: `
function poll(job, queue) {
  if (job.done) {
    // nothing to do: the scheduler removes finished jobs
  }
  while (queue.shift()) {}
  try {
    job.run();
  } catch (e) {
    job.fail(e);
  }
  const f = () => {};
  return f;
}
poll({}, []);
`,
  },

  'empty-function': {
    bad: `
function handleClick() {} // Noncompliant
class Widget {
  render() {} // Noncompliant
}
const onSave = function () {}; // Noncompliant
export { handleClick, Widget, onSave };
`,
    good: `
function handleClick() {
  // clicks are handled by the parent form
}
function noop() {}
class Base { render() { return 1; } }
class Widget extends Base {
  render() {}
}
setTimeout(function () {}, 10);
function withDefault(cb = function () {}) { return cb; }
export { handleClick, noop, Widget, withDefault };
`,
  },

  'empty-catch': {
    bad: `
function read(text) {
  try {
    return JSON.parse(text);
  } catch (e) {} // Noncompliant
  try {
    return Number(text);
  } catch {} // Noncompliant
  return null;
}
read('');
`,
    good: `
function read(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // not JSON: fall back to the raw text below
  }
  try {
    return Number(text);
  } catch (e) {
    console.warn(e);
  }
  return null;
}
read('');
`,
  },

  'function-naming': {
    bad: `
function get_user(id) { // Noncompliant
  return id;
}
class Store {
  Load_All() { // Noncompliant
    return get_user(1);
  }
}
export { Store };
`,
    good: `
function getUser(id) {
  return id;
}
function UserCard() {
  return null;
}
class Store {
  loadAll() { return getUser(1); }
  $init() { return UserCard(); }
  UNSAFE_componentWillMount() {}
  MAX_SIZE() { return 10; }
}
export { Store };
`,
  },

  'class-naming': [
    {
      bad: `
class user_service { // Noncompliant
  run() { return 1; }
}
const Helper = class helper_impl {}; // Noncompliant
export { user_service, Helper };
`,
      good: `
class UserService {
  run() { return 1; }
}
const Helper = class {};
export { UserService, Helper };
`,
    },
    {
      lang: 'ts',
      bad: `
export interface props_type { // Noncompliant
  name: string;
}
export enum color { Red, Green } // Noncompliant
`,
      good: `
export interface Props {
  name: string;
}
export enum Color { Red, Green }
export type user_row = { id: number };
`,
    },
  ],

  'variable-naming': {
    bad: `
function save(first_name) { // Noncompliant
  const user_name = first_name.trim(); // Noncompliant
  let Total_Count = 0; // Noncompliant
  Total_Count += user_name.length;
  return Total_Count;
}
save('a');
`,
    good: `
function save(row) {
  const { user_name, last_name = '' } = row;
  const MAX_LENGTH = 40;
  const $el = null;
  const _private = 1;
  return [user_name, last_name, MAX_LENGTH, $el, _private];
}
save({});
`,
  },

  'redeclaration': {
    bad: `
function load(items) {
  var count = items.length;
  var count = 0; // Noncompliant
  function parse(x) { return x; }
  function parse(x) { return x * 2; } // Noncompliant
  return parse(count);
}
load([]);
`,
    good: `
function load(items) {
  var count = items.length;
  count = 0;
  function parse(x) { return x; }
  return parse(count);
}
function other() {
  var count = 1;
  return count;
}
load([]); other();
`,
  },

  'shadowed-variable': {
    bad: `
function outer(items) {
  const count = items.length;
  items.forEach((item) => {
    const count = item.n; // Noncompliant
    console.log(count);
  });
  for (const i of items) {
    function count2() { return i; }
    let items = count2(); // Noncompliant
    console.log(items);
  }
  return count;
}
outer([]);
`,
    good: `
const config = 1;
function outer(items) {
  const config = items.length;
  items.forEach((item) => {
    const size = item.n;
    console.log(size, config);
  });
  return config;
}
outer([]);
`,
  },

  'return-await': {
    bad: `
async function load(url) {
  return await fetch(url); // Noncompliant
}
const get = async (id) => {
  if (!id) return null;
  return await load('/item/' + id); // Noncompliant
};
get(1);
`,
    good: `
async function load(url) {
  try {
    return await fetch(url);
  } catch (e) {
    return null;
  }
}
async function get(id) {
  try {
    console.log(id);
  } catch (e) {
    return await load('/err');
  } finally {
    console.log('done');
  }
  return load('/item/' + id);
}
get(1);
`,
  },

  'await-non-promise': {
    bad: `
async function run(x) {
  const a = await 42; // Noncompliant
  const b = await 'text'; // Noncompliant
  const c = await [load(), load()]; // Noncompliant
  const d = await !x; // Noncompliant
  return [a, b, c, d];
}
run();
`,
    good: `
async function run(x) {
  const a = await load();
  const b = await Promise.all([load(), load()]);
  const c = await x;
  const d = await (x ? load() : null);
  return [a, b, c, d];
}
run();
`,
  },

  'var-scope': {
    bad: `
function first(list) {
  if (list.length) {
    var head = list[0];
  }
  return head; // Noncompliant
}
function last(list) {
  for (var i = 0; i < list.length; i++) {
    list[i] = list[i] * 2;
  }
  return i; // Noncompliant
}
first([]); last([]);
`,
    good: `
function first(list) {
  let head;
  if (list.length) {
    head = list[0];
  }
  return head;
}
function last(list) {
  for (var i = 0; i < list.length; i++) {
    list[i] = list[i] * 2;
  }
  if (list.length) {
    var n = list.length;
    console.log(n);
  }
}
first([]); last([]);
`,
  },

  'commented-code': {
    bad: `
function total(items) {
  // const debug = items.map((x) => x.id); // Noncompliant
  let sum = 0;
  /* if (items.length > 100) { // Noncompliant
    sum = computeFast(items);
  } */
  for (const x of items) sum += x;
  // console.log(sum); // Noncompliant
  return sum;
}
total([]);
`,
    good: `
/**
 * Adds the items.
 * @example total([1, 2]) // 3
 */
function total(items) {
  // Sum the values; the list is small enough for a loop.
  let sum = 0;
  // TODO: call computeFast() for long lists
  for (const x of items) sum += x; // const x is fine here
  // eslint-disable-next-line no-console
  // see https://example.com/docs?a=1&b=2
  return sum;
}
total([]);
`,
  },

  'consistent-return': [
    {
      bad: `
function find(list, id) { // Noncompliant
  for (const x of list) {
    if (x.id === id) return x;
  }
}
const pick = (flag) => { // Noncompliant
  if (flag) return 1;
  return;
};
find([], 1); pick(true);
`,
      good: `
function find(list, id) {
  for (const x of list) {
    if (x.id === id) return x;
  }
  return null;
}
function check(flag) {
  if (!flag) throw new Error('no flag');
  return 1;
}
function log(x) {
  if (!x) return;
  console.log(x);
}
find([], 1); check(true); log(1);
`,
    },
    {
      lang: 'ts',
      bad: `
export function size(s: string): number { // Noncompliant
  if (s) return s.length;
}
`,
      good: `
export function size(s: string): number | undefined {
  if (s) return s.length;
}
export function maybe(s: string): void {
  if (s) return;
  console.log(s);
}
`,
    },
  ],

  'boolean-inversion': {
    bad: `
function test(a, b, n) {
  if (!(a == b)) return 1; // Noncompliant
  const small = !(n < 3); // Noncompliant
  return small;
}
test(1, 2, 3);
`,
    good: `
function test(a, b, n) {
  if (a != b) return 1;
  const both = !(a && b);
  const notIn = !(a in b);
  const neg = !a;
  return [n >= 3, both, notIn, neg];
}
test(1, 2, 3);
`,
  },

  'param-order': {
    bad: `
function divide(dividend, divisor) {
  return dividend / divisor;
}
function run(dividend, divisor, width, height) {
  const q = divide(divisor, dividend); // Noncompliant
  const area = (function (height, width) { return height * width; });
  return [q, area(width, height)]; // Noncompliant
}
const resize = (width, height) => width * height;
function go(width, height) {
  return resize(height, width); // Noncompliant
}
run(1, 2, 3, 4); go(1, 2);
`,
    good: `
function divide(dividend, divisor) {
  return dividend / divisor;
}
function run(dividend, divisor, a, b) {
  const q = divide(dividend, divisor);
  const r = divide(a, b);
  const s = divide(divisor, a);
  return [q, r, s];
}
run(1, 2, 3, 4);
`,
  },

  'too-many-cases': {
    bad: bigSwitch('labelOf', 31, true),
    good: bigSwitch('labelOf', 30, false),
  },

  'switch-few-cases': {
    bad: `
function kind(x) {
  switch (x) { // Noncompliant
    case 1:
      return 'one';
    default:
      return 'other';
  }
}
function only(x) {
  switch (x) { // Noncompliant
    case 'a':
      return 1;
  }
  return 0;
}
kind(1); only('a');
`,
    good: `
function kind(x) {
  if (x === 1) return 'one';
  switch (x) {
    case 2: return 'two';
    case 3: return 'three';
    default: return 'other';
  }
}
kind(1);
`,
  },

  'constructor-name-case': {
    bad: `
function point(x, y) {
  this.x = x;
  this.y = y;
}
const p = new point(1, 2); // Noncompliant
const vehicle = class {};
const v = new vehicle(); // Noncompliant
export { p, v };
`,
    good: `
function Point(x, y) {
  this.x = x;
  this.y = y;
}
const p = new Point(1, 2);
const lib = { thing: class {} };
const t = new lib.thing();
const d = new Date();
export { p, t, d };
`,
  },

  'this-global': {
    bad: `
export const root = this; // Noncompliant
this.version = '1.0'; // Noncompliant
export const getRoot = () => this; // Noncompliant
`,
    good: `
export class Counter {
  count = this.start();
  start() { return 0; }
}
export function bump() {
  return this.count + 1;
}
export const arrow = () => globalThis.count;
export function later() {
  return () => this.count;
}
`,
  },

  'implicit-global': {
    bad: `
function init() {
  counter = 0; // Noncompliant
  for (idx = 0; idx < 3; idx++) { // Noncompliant
    counter += idx;
  }
  return counter;
}
init();
`,
    good: `
var counter;
function init() {
  counter = 0;
  let idx;
  for (idx = 0; idx < 3; idx++) counter += idx;
  module.exports = counter;
  window.appReady = true;
  onload = init;
  return counter;
}
init();
`,
  },
};
