// Samples for the reliability rules of core/sem-js/rules/bugs.js.
// Each "bad" sample marks every line the rule must report with "Noncompliant";
// each "good" sample is the fixed version or a near miss that must stay quiet.
export default {
  'identical-operands': {
    bad: `function check(a, b) {
  if (a.x == a.x) return 1; // Noncompliant
  if (a.ready && a.ready) return 2; // Noncompliant
  return b.total - b.total; // Noncompliant
}
check({}, {});
`,
    good: `function check(a, b, rnd) {
  if (a.x == b.x) return 1;
  if (a.v !== a.v) return 2; // NaN test
  if (rnd() === rnd()) return 3;
  return 1 << 1;
}
check({}, {}, Math.random);
`,
  },

  'self-assignment': {
    bad: `function update(obj, y) {
  let x = y;
  x = x; // Noncompliant
  obj.name = obj.name; // Noncompliant
  return x;
}
update({}, 1);
`,
    good: `function update(obj, img, y) {
  let x = 1;
  x = y;
  img.src = img.src; // reloads the image
  obj.name = obj.title;
  return x;
}
update({}, {}, 1);
`,
  },

  'all-branches-identical': {
    bad: `function step(a, b) {
  if (a > 2) { // Noncompliant
    b.run();
  } else if (a > 1) {
    b.run();
  } else {
    b.run();
  }
  const label = a ? 'on' : 'on'; // Noncompliant
  switch (b.kind) { // Noncompliant
    case 1:
      b.stop();
      break;
    default:
      b.stop();
  }
  return label;
}
step(1, {});
`,
    good: `function step(a, b) {
  if (a > 2) {
    b.run();
  } else if (a > 1) {
    b.run();
  }
  if (a) {
    b.run();
  } else {
    b.walk();
  }
  const label = a ? 'on' : 'off';
  switch (b.kind) {
    case 1:
      b.stop();
      break;
    case 2:
      b.stop();
  }
  return label;
}
step(1, {});
`,
  },

  'duplicate-condition': {
    bad: `function name(a) {
  if (a === 1) return 'one';
  else if (a === 2) return 'two';
  else if (a === 1) return 'uno'; // Noncompliant
  if (a.ok) {
    return 'ok';
  } else if (a.ok) { // Noncompliant
    return 'still ok';
  }
  return 'many';
}
name(1);
`,
    good: `function name(a, it) {
  if (a === 1) return 'one';
  else if (a === 2) return 'two';
  else if (a === 3) return 'three';
  if (it.next()) return 'first';
  else if (it.next()) return 'second';
  return 'many';
}
name(1, {});
`,
  },

  'duplicate-case': {
    bad: `function dispatch(cmd, h) {
  switch (cmd) {
    case 'start': h.run(); break;
    case 'stop': h.halt(); break;
    case 'start': h.again(); break; // Noncompliant
    case 'stop': h.never(); break; // Noncompliant
    default: break;
  }
}
dispatch('start', {});
`,
    good: `function dispatch(cmd, h, next) {
  switch (cmd) {
    case 'start': h.run(); break;
    case 'stop': h.halt(); break;
    case 'pause': h.wait(); break;
    default: break;
  }
  switch (cmd) {
    case next(): h.a(); break;
    case next(): h.b(); break;
  }
}
dispatch('start', {}, () => 1);
`,
  },

  'nan-comparison': {
    bad: `function check(x) {
  if (x === NaN) return 'nan'; // Noncompliant
  if (x != Number.NaN) return 'number'; // Noncompliant
  switch (x) {
    case NaN: // Noncompliant
      return 'never';
    default:
      return 'other';
  }
}
check(1);
`,
    good: `function check(x) {
  if (Number.isNaN(x)) return 'nan';
  if (x === 0) return 'zero';
  return 'other';
}
check(1);
`,
  },

  'typeof-invalid': {
    bad: `function kind(x, y) {
  if (typeof x === 'strnig') return 1; // Noncompliant
  if ('undefned' !== typeof y) return 2; // Noncompliant
  return 0;
}
kind(1, 2);
`,
    good: `function kind(x, y, expected) {
  if (typeof x === 'string') return 1;
  if ('undefined' !== typeof y) return 2;
  if (typeof x === expected) return 3;
  return typeof x === 'bigint' ? 4 : 0;
}
kind(1, 2, 'number');
`,
  },

  'unsafe-finally': {
    bad: `function load(work) {
  try {
    return work();
  } finally {
    return 0; // Noncompliant
  }
}
function each(items, use) {
  for (const it of items) {
    try {
      use(it);
    } finally {
      continue; // Noncompliant
    }
  }
}
function boom(f) {
  try { f(); } finally {
    throw new Error('lost'); // Noncompliant
  }
}
load(() => 1); each([], () => 1); boom(() => 1);
`,
    good: `function load(work, items, log) {
  try {
    return work();
  } finally {
    for (const it of items) {
      if (it.done) break;
      if (it.skip) continue;
      log(it);
    }
    items.forEach((it) => { if (!it) return; log(it); });
    log('done');
  }
}
load(() => 1, [], () => 1);
`,
  },

  'duplicate-key': {
    bad: `const config = {
  host: 'localhost',
  port: 80,
  host: '127.0.0.1', // Noncompliant
  'port': 8080, // Noncompliant
};
export default config;
`,
    good: `const defaults = { host: 'localhost' };
let stored = 0;
const config = {
  ...defaults,
  host: '127.0.0.1',
  get port() { return stored; },
  set port(v) { stored = v; },
};
export default config;
`,
  },

  'duplicate-class-member': [
    {
      bad: `class Account {
  run() { return 1; }
  static run() { return 3; }
  run() { return 2; } // Noncompliant
  balance = 0;
  balance = 1; // Noncompliant
}
export default Account;
`,
      good: `class Account {
  run() { return 1; }
  static run() { return 3; }
  get balance() { return this.b; }
  set balance(v) { this.b = v; }
}
export default Account;
`,
    },
    {
      lang: 'ts',
      bad: `export class Parser {
  parse(input: string): number { return input.length; }
  parse(input: string): number { return input.length * 2; } // Noncompliant
}
`,
      good: `export class Parser {
  parse(input: string): number;
  parse(input: number): number;
  parse(input: string | number): number {
    return typeof input === 'string' ? input.length : input;
  }
}
`,
    },
  ],

  'duplicate-parameter': {
    bad: `function sum(a, b, a) { // Noncompliant
  return a + b;
}
const pick = function (key, value, key) { // Noncompliant
  return [key, value];
};
sum(1, 2, 3); pick(1, 2, 3);
`,
    good: `function sum(a, b, c) {
  return a + b + c;
}
function ignore(_, _) {
  return 0;
}
sum(1, 2, 3); ignore(1, 2);
`,
  },

  'unsafe-negation': {
    bad: `function check(key, obj, value) {
  if (!key in obj) return 1; // Noncompliant
  if (!value instanceof Date) return 2; // Noncompliant
  return 0;
}
check('a', {}, 1);
`,
    good: `function check(key, obj, value) {
  if (!(key in obj)) return 1;
  if (!(value instanceof Date)) return 2;
  return (!key) in obj ? 3 : 0;
}
check('a', {}, 1);
`,
  },

  'array-callback-return': {
    bad: `function process(items) {
  const doubled = items.map((x) => { // Noncompliant
    console.log(x * 2);
  });
  const kept = items.filter(function (x) { // Noncompliant
    if (x) { console.log(x); }
  });
  return [doubled, kept];
}
process([1]);
`,
    good: `function process(items) {
  const doubled = items.map((x) => {
    return x * 2;
  });
  const kept = items.filter((x) => x > 0);
  items.forEach((x) => { console.log(x); });
  const found = items.find(() => { throw new Error('unsupported'); });
  return [doubled, kept, found];
}
process([1]);
`,
  },

  'getter-return': {
    bad: `class Product {
  constructor(items) { this.items = items; this._name = 'p'; }
  get name() { // Noncompliant
    this._name.trim();
  }
  get size() { // Noncompliant
    if (this.items) return this.items.length;
  }
}
const proto = {
  get id() {} // Noncompliant
};
export { Product, proto };
`,
    good: `class Product {
  constructor(items) { this.items = items; this._name = 'p'; }
  get name() {
    return this._name.trim();
  }
  get size() {
    if (this.items) return this.items.length;
    return 0;
  }
  get broken() {
    throw new Error('not supported');
  }
}
export { Product };
`,
  },

  'setter-return': {
    bad: `class Box {
  set value(v) {
    this._v = v;
    return v; // Noncompliant
  }
}
const o = {
  set name(n) {
    if (!n) return false; // Noncompliant
    this._n = n;
  },
};
export { Box, o };
`,
    good: `class Box {
  set value(v) {
    if (v == null) return;
    this._v = v;
    this.listeners = [v].map((x) => { return x; });
  }
}
export { Box };
`,
  },

  'constructor-return': {
    bad: `class Conn {
  constructor(url) {
    if (!url) return {}; // Noncompliant
    this.url = url;
    return this; // Noncompliant
  }
}
export { Conn };
`,
    good: `class Conn {
  constructor(url) {
    if (!url) return;
    this.url = url;
    this.parse = () => { return url.split(':'); };
  }
}
export { Conn };
`,
  },

  'promise-executor-return': {
    bad: `function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
    return ms; // Noncompliant
  });
}
function read(ok) {
  return new Promise(function (resolve, reject) {
    if (ok) return 'value'; // Noncompliant
    reject(new Error('no'));
  });
}
delay(1); read(true);
`,
    good: `function delay(ms) {
  return new Promise((resolve, reject) => {
    if (ms < 0) return reject(new Error('negative'));
    setTimeout(() => { return resolve(ms); }, ms);
    return undefined;
  });
}
delay(1);
`,
  },

  'async-promise-executor': {
    bad: `function load(db, id) {
  return new Promise(async (resolve) => { // Noncompliant
    resolve(await db.get(id));
  });
}
const p = new Promise(async function (resolve, reject) { // Noncompliant
  reject(await Promise.resolve(1));
});
load({}, 1); export { p };
`,
    good: `async function load(db, id) {
  return db.get(id);
}
const p = new Promise((resolve) => {
  setTimeout(async () => { resolve(await load({}, 1)); }, 1);
});
export { p };
`,
  },

  'loss-of-precision': {
    bad: `const big = 9007199254740993; // Noncompliant
const ratio = 0.12345678901234567890; // Noncompliant
const huge = 5123000000000000000000000000001; // Noncompliant
export { big, ratio, huge };
`,
    good: `const big = 9007199254740991;
const small = 1e300;
const tenth = 0.1;
const exact = 12345678901234567890n;
const million = 1_000_000;
const hex = 0xFF;
const trailing = 100000000000000000000000000000;
export { big, small, tenth, exact, million, hex, trailing };
`,
  },

  'negative-zero-compare': {
    bad: `function sign(x) {
  if (x === -0) return 'negative zero'; // Noncompliant
  return -0 == x ? 'zero' : 'other'; // Noncompliant
}
sign(0);
`,
    good: `function sign(x) {
  if (Object.is(x, -0)) return 'negative zero';
  return x === 0 ? 'zero' : x < -1 ? 'small' : 'other';
}
sign(0);
`,
  },

  'assignment-in-condition': {
    bad: `function find(list, next) {
  let item;
  if (item = next()) return item; // Noncompliant
  while (item = list.pop()) { // Noncompliant
    console.log(item);
  }
  return item;
}
find([], () => 0);
`,
    good: `function find(list, re, s) {
  let m;
  const out = [];
  while ((m = re.exec(s))) out.push(m[0]);
  if (list.length === 0) return out;
  const x = m = 1;
  return [out, x];
}
find([], /a/g, 'a');
`,
  },

  'sparse-array': {
    bad: `const a = [1, , 3]; // Noncompliant
const b = [, 'x']; // Noncompliant
export { a, b };
`,
    good: `const a = [1, undefined, 3];
const b = [1, 2,];
const [, second] = a;
export { a, b, second };
`,
  },

  'unsafe-optional-chaining': [
    {
      bad: `function read(a) {
  const n = (a?.b).c; // Noncompliant
  const { x } = a?.pos; // Noncompliant
  const all = [...a?.list]; // Noncompliant
  for (const v of a?.items) console.log(v); // Noncompliant
  (a?.run)(); // Noncompliant
  return [n, x, all];
}
read({});
`,
      good: `function read(a) {
  const n = a?.b.c;
  const { x } = a?.pos ?? {};
  const all = [...(a?.list || [])];
  a?.run?.();
  const y = a?.b?.c;
  return [n, x, all, y];
}
read({});
`,
    },
    {
      lang: 'ts',
      bad: `interface Node { child?: { name: string } }
export function nameOf(n?: Node): string {
  return (n?.child as { name: string }).name; // Noncompliant
}
`,
      good: `interface Node { child?: { name: string } }
export function nameOf(n?: Node): string {
  return (n?.child)!.name + (n?.child?.name ?? '');
}
`,
    },
  ],

  'new-native-nonconstructor': {
    bad: `const id = new Symbol('id'); // Noncompliant
const n = new BigInt(5); // Noncompliant
export { id, n };
`,
    good: `const id = Symbol('id');
const n = BigInt(5);
export { id, n };
`,
  },

  'non-callable-global': {
    bad: `const m = Math(); // Noncompliant
const j = new JSON(); // Noncompliant
const r = Reflect(1); // Noncompliant
export { m, j, r };
`,
    good: `const m = Math.max(1, 2);
const j = JSON.parse('{}');
const fmt = new Intl.NumberFormat('en');
export { m, j, fmt };
`,
  },

  'const-reassign': {
    bad: `function count(items) {
  const total = 0;
  total = items.length; // Noncompliant
  const step = 1;
  step += 1; // Noncompliant
  return total + step;
}
count([]);
`,
    good: `function count(items) {
  let total = 0;
  total = items.length;
  const box = { n: 0 };
  box.n = 2;
  {
    let step = 1;
    step += 1;
    total += step;
  }
  return total + box.n;
}
count([]);
`,
  },

  'function-reassign': {
    bad: `function handler() { return 1; }
handler = null; // Noncompliant
function render() { return 2; }
function setup() {
  render = () => 3; // Noncompliant
}
setup();
`,
    good: `let handler = function () { return 1; };
handler = null;
function render() { return 2; }
function setup(render) {
  render = () => 3;
  return render;
}
setup(render);
`,
  },

  'class-reassign': {
    bad: `class Shape {}
Shape = null; // Noncompliant
class Circle {
  reset() {
    Circle = undefined; // Noncompliant
  }
}
new Circle().reset();
`,
    good: `let Shape = class {};
Shape = null;
class Circle {
  reset(Circle) {
    Circle = undefined;
    return Circle;
  }
}
new Circle().reset();
`,
  },

  'import-reassign': {
    bad: `import fs from 'fs';
import { join } from 'path';
import * as util from 'util';
fs = null; // Noncompliant
join = (a, b) => a + b; // Noncompliant
util = {}; // Noncompliant
`,
    good: `import fs from 'fs';
import { join } from 'path';
let reader = fs;
reader = null;
const local = { join };
local.join = (a, b) => a + b;
export { reader, local };
`,
  },

  'global-reassign': {
    bad: `undefined = 1; // Noncompliant
NaN = 0; // Noncompliant
function patch() {
  Object = null; // Noncompliant
}
patch();
`,
    good: `function patch() {
  let Map = 1;
  Map = 2;
  window.myConfig = {};
  return Map;
}
patch();
`,
  },

  'restricted-name-shadow': {
    bad: `function f(eval) { // Noncompliant
  var undefined = 1; // Noncompliant
  return eval + undefined;
}
function g() {
  let NaN = 2; // Noncompliant
  return NaN;
}
f(1); g();
`,
    good: `function f(evaluate) {
  return evaluate + arguments.length;
}
function g(value) {
  return value === undefined || Number.isNaN(value);
}
f(1); g();
`,
  },

  'delete-variable': {
    bad: `var cache = {};
var count = 1;
delete cache; // Noncompliant
function f(x) {
  delete x; // Noncompliant
}
f(count);
`,
    good: `var cache = { a: 1 };
delete cache.a;
delete cache['b'];
cache = null;
`,
  },

  'array-delete': {
    bad: `function remove(s, i) {
  const arr = [1, 2, 3];
  delete arr[1]; // Noncompliant
  const parts = s.split(',');
  delete parts[i]; // Noncompliant
  return [arr, parts];
}
remove('a,b', 0);
`,
    good: `function remove(obj, key) {
  const arr = [1, 2, 3];
  arr.splice(1, 1);
  delete obj[key];
  delete arr['extra'];
  return arr;
}
remove({}, 'a');
`,
  },

  'in-on-primitive': {
    bad: `function has(key) {
  if ('a' in 'abc') return 1; // Noncompliant
  return key in 42; // Noncompliant
}
has('a');
`,
    good: `function has(key, obj) {
  if ('abc'.includes('a')) return 1;
  return key in obj;
}
has('a', {});
`,
  },

  'useless-increment': {
    bad: `function count(i, j) {
  i = i++; // Noncompliant
  j = j--; // Noncompliant
  return i + j;
}
count(1, 2);
`,
    good: `function count(i, j) {
  i++;
  j = i++;
  i = i + 1;
  return i + j;
}
count(1, 2);
`,
  },

  'inverted-assignment': {
    bad: `function add(x, y, ok) {
  x =+ y; // Noncompliant
  y =- 1; // Noncompliant
  ok =! ok; // Noncompliant
  return [x, y, ok];
}
add(1, 2, true);
`,
    good: `function add(x, y, ok) {
  x += y;
  y = -1;
  ok = !ok;
  x = +y;
  return [x, y, ok];
}
add(1, 2, true);
`,
  },

  'new-non-constructor': {
    bad: `const make = () => ({});
async function load() { return 1; }
function* gen() { yield 1; }
const a = new make(); // Noncompliant
const b = new load(); // Noncompliant
const c = new gen(); // Noncompliant
export { a, b, c };
`,
    good: `function Point(x) { this.x = x; }
class Vec {}
const make = () => ({});
const a = new Point(1);
const b = new Vec();
const c = make();
export { a, b, c };
`,
  },

  'void-result-used': {
    bad: `function log(msg) {
  console.log(msg);
}
const r = log('x'); // Noncompliant
if (log('y')) console.log('never'); // Noncompliant
export { r };
`,
    good: `function log(msg) {
  console.log(msg);
}
function get() {
  return 1;
}
log('x');
void log('y');
const v = get();
function wrap() { return log('z'); }
export { v, wrap };
`,
  },

  'too-many-arguments': [
    {
      bad: `function add(a, b) {
  return a + b;
}
const twice = (x) => x * 2;
add(1, 2, 3); // Noncompliant
twice(1, 2); // Noncompliant
`,
      good: `function add(a, b) {
  return a + b;
}
function sum() {
  return [...arguments].reduce((s, x) => s + x, 0);
}
function all(...xs) { return xs; }
add(1, 2);
sum(1, 2, 3);
all(1, 2, 3);
`,
    },
    {
      lang: 'ts',
      bad: `function scale(this: Window, factor: number): number {
  return factor * 2;
}
export const v = scale.call(window, 2) + scale(2, 3); // Noncompliant
`,
      good: `function pad(s: string): string;
function pad(s: string, n: number): string;
function pad(s: string, n?: number): string {
  return s.padStart(n ?? 2);
}
export const v: string = pad('a', 3);
`,
    },
  ],

  'for-direction': {
    bad: `function loops(n) {
  for (let i = 0; i < n; i--) console.log(i); // Noncompliant
  for (let j = 10; j >= 0; j += 1) console.log(j); // Noncompliant
  for (let k = 0; n > k; k--) console.log(k); // Noncompliant
}
loops(3);
`,
    good: `function loops(n) {
  for (let i = 0; i < n; i++) console.log(i);
  for (let j = 10; j >= 0; j -= 1) console.log(j);
  for (let k = 0; k < n; k -= -1) console.log(k);
  for (let m = n; 0 < m; m--) console.log(m);
}
loops(3);
`,
  },

  'infinite-loop': {
    bad: `function spin(tick) {
  let i = 0;
  const n = 10;
  while (i < n) { // Noncompliant
    tick(i);
  }
  for (;;) { // Noncompliant
    tick(0);
  }
}
function forever(tick) {
  while (true) { // Noncompliant
    tick();
  }
}
spin(() => 1); forever(() => 1);
`,
    good: `function spin(tick, done) {
  let i = 0;
  const n = 10;
  while (i < n) {
    tick(i);
    i++;
  }
  while (true) {
    if (done()) break;
  }
  for (;;) {
    if (tick()) return;
  }
}
function* ids() {
  let id = 0;
  while (true) yield id++;
}
spin(() => 1, () => true); ids();
`,
  },

  'reduce-initial-value': {
    bad: `function total(items) {
  const sum = items.reduce((a, b) => a + b); // Noncompliant
  const last = items.reduceRight(function (a, b) { return b; }); // Noncompliant
  return sum + last;
}
total([1]);
`,
    good: `function total(items) {
  const sum = items.reduce((a, b) => a + b, 0);
  const fixed = [1, 2, 3].reduce((a, b) => a + b);
  return sum + fixed;
}
total([1]);
`,
  },

  'sort-without-compare': [
    {
      bad: `const nums = [10, 9, 1];
nums.sort(); // Noncompliant
const ordered = [3, 1, 2].toSorted(); // Noncompliant
export { nums, ordered };
`,
      good: `const nums = [10, 9, 1];
nums.sort((a, b) => a - b);
const names = ['b', 'a'];
names.sort();
export { nums, names };
`,
    },
    {
      lang: 'ts',
      bad: `export function order(load: () => number[]): number[] {
  const xs: number[] = load();
  return xs.sort(); // Noncompliant
}
`,
      good: `export function order(load: () => string[]): string[] {
  const xs: string[] = load();
  return xs.sort();
}
`,
    },
  ],

  'ignored-return': {
    bad: `function clean(a, b, s) {
  const name = ' bob ';
  name.trim(); // Noncompliant
  Math.max(a, b); // Noncompliant
  parseInt(s); // Noncompliant
  s.toUpperCase(); // Noncompliant
  return name;
}
clean(1, 2, '3');
`,
    good: `function clean(a, b, s, arr) {
  let name = ' bob ';
  name = name.trim();
  const big = Math.max(a, b);
  arr.sort();
  arr.push(1);
  this.trim();
  return [name, big, parseInt(s, 10)];
}
clean(1, 2, '3', []);
`,
  },

  'error-not-thrown': {
    bad: `function check(x) {
  if (!x) new Error('missing x'); // Noncompliant
  if (x < 0) {
    new TypeError('negative'); // Noncompliant
  }
  return x;
}
check(1);
`,
    good: `function check(x) {
  if (!x) throw new Error('missing x');
  const e = new TypeError('negative');
  if (x < 0) return Promise.reject(e);
  return x;
}
check(1);
`,
  },

  'discarded-new': {
    bad: `class Point {
  constructor(x) { this.x = x; }
}
function f() {
  new Map(); // Noncompliant
  new Point(1); // Noncompliant
}
f();
`,
    good: `class Widget {
  constructor(el) { register(this, el); }
}
function register() {}
function f(el) {
  new Widget(el);
  new Worker('w.js');
  const m = new Map();
  return m;
}
f({});
`,
  },

  'template-placeholder-in-string': {
    bad: `function greet(name, user) {
  const msg = 'Hello \${name}!'; // Noncompliant
  console.log("Id: \${user.id}"); // Noncompliant
  return msg;
}
greet('a', {});
`,
    good: `function greet(name) {
  const msg = \`Hello \${name}!\`;
  const tpl = 'Hello \${missing}';
  const env = 'Path \${HOME}';
  return msg.replace('\${name}', name) + tpl + env;
}
greet('a');
`,
  },

  'empty-destructuring': {
    bad: `function f(obj, list) {
  const {} = obj; // Noncompliant
  const [] = list; // Noncompliant
  return obj;
}
function g({ opts: {} }) { // Noncompliant
  return 1;
}
f({}, []); g({});
`,
    good: `function f(obj, list) {
  const { a = {} } = obj;
  const [first] = list;
  return [a, first];
}
function g({ opts = {} }) {
  return opts;
}
f({}, []); g({});
`,
  },

  'case-declaration': {
    bad: `function run(k, use) {
  switch (k) {
    case 1:
      let x = 1; // Noncompliant
      use(x);
      break;
    case 2:
      const y = 2; // Noncompliant
      use(y);
      break;
    default:
      class Local {} // Noncompliant
      use(Local);
  }
}
run(1, () => 1);
`,
    good: `function run(k, use) {
  switch (k) {
    case 1: {
      let x = 1;
      use(x);
      break;
    }
    case 2:
      var y = 2;
      use(y);
      break;
    default:
      use(0);
  }
}
run(1, () => 1);
`,
  },

  'case-logical-or': {
    bad: `function kind(c) {
  switch (c) {
    case 'a' || 'b': // Noncompliant
      return 1;
    case 'x' && 'y': // Noncompliant
      return 2;
    default:
      return 0;
  }
}
kind('a');
`,
    good: `function kind(c, a, b) {
  switch (c) {
    case 'a':
    case 'b':
      return 1;
    case a ?? b:
      return 2;
    default:
      break;
  }
  switch (true) {
    case a || b:
      return 3;
    default:
      return 0;
  }
}
kind('a');
`,
  },

  'switch-label': {
    bad: `function plan(day, h) {
  switch (day) {
    case 1:
      h.work();
      break;
    sunday: // Noncompliant
      h.rest();
      break;
    default:
      saturday: h.play(); // Noncompliant
  }
}
plan(1, {});
`,
    good: `function plan(day, h, rows) {
  switch (day) {
    case 1:
      h.work();
      break;
    case 0:
      h.rest();
      break;
    default:
      h.play();
  }
  outer: for (const r of rows) {
    for (const c of r) if (c) break outer;
  }
}
plan(1, {}, []);
`,
  },

  'collection-overwrite': {
    bad: `function fill(m, arr) {
  arr[0] = 1;
  arr[0] = 2; // Noncompliant
  m.set('k', 1);
  m.set('k', 2); // Noncompliant
  arr.total = 3;
  arr.total = 4; // Noncompliant
}
fill(new Map(), []);
`,
    good: `function fill(m, arr, i) {
  arr[0] = 1;
  arr[1] = 2;
  m.set('k', 1);
  m.set('j', 2);
  arr[i] = 1;
  arr[i] = arr[i] + 1;
  m.set('n', 1);
  m.set('n', m.get('n') + 1);
}
fill(new Map(), [], 0);
`,
  },

  'collection-size-compare': {
    bad: `function check(list, map) {
  if (list.length >= 0) return 1; // Noncompliant
  if (0 > map.size) return 2; // Noncompliant
  return list.length < 0 ? 3 : 0; // Noncompliant
}
check([], new Map());
`,
    good: `function check(list, map) {
  if (list.length > 0) return 1;
  if (map.size === 0) return 2;
  return list.length >= 1 ? 3 : 0;
}
check([], new Map());
`,
  },

  'index-of-positive': {
    bad: `function has(s, a, v) {
  if (s.indexOf('x') > 0) return 1; // Noncompliant
  return 0 < a.lastIndexOf(v); // Noncompliant
}
has('x', [], 1);
`,
    good: `function has(s, a, v) {
  if (s.indexOf('x') >= 0) return 1;
  if (s.indexOf('x', 1) > 0) return 2;
  return a.lastIndexOf(v) !== -1 || a.includes(v);
}
has('x', [], 1);
`,
  },

  'misleading-array-mutation': {
    bad: `function order(cfg) {
  const arr = [3, 1, 2];
  const sorted = arr.sort(); // Noncompliant
  let rev;
  rev = arr.reverse(); // Noncompliant
  const items = cfg.items.sort((a, b) => a - b); // Noncompliant
  return [sorted, rev, items];
}
order({ items: [] });
`,
    good: `function order(cfg) {
  let arr = [3, 1, 2];
  arr.sort();
  const sorted = [...arr].sort();
  const copy = arr.slice().reverse();
  arr = arr.reverse();
  cfg.items.sort();
  return [sorted, copy, arr];
}
order({ items: [] });
`,
  },

  'empty-collection-read': {
    bad: `function seenBefore(id) {
  const seen = new Set();
  if (seen.has(id)) return true; // Noncompliant
  return false;
}
function names() {
  const list = [];
  for (const n of list) console.log(n); // Noncompliant
}
seenBefore(1); names();
`,
    good: `function seenBefore(id) {
  const seen = new Set();
  seen.add(1);
  return seen.has(id);
}
function names(sink) {
  const list = [];
  sink(list);
  for (const n of list) console.log(n);
}
seenBefore(1); names(() => 1);
`,
  },

  'collection-never-read': {
    bad: `function collect(items) {
  const log = []; // Noncompliant
  for (const it of items) log.push(it);
  const index = new Map(); // Noncompliant
  index.set('a', 1);
  return items.length;
}
collect([]);
`,
    good: `function collect(items) {
  const log = [];
  for (const it of items) log.push(it);
  const index = new Map();
  index.set('a', 1);
  return [log.length, index.get('a')];
}
collect([]);
// sort() returns the array and pop() an element: both read it
function sortedNames(list) {
  const names = [];
  for (const it of list) names.push(it.name);
  return names.sort().join(',');
}
function drain(list) {
  const stack = [];
  for (const it of list) stack.push(it);
  const out = [];
  while (stack.length) out.push(stack.pop());
  return out;
}
sortedNames([]);
drain([]);
`,
  },

  'constructor-super': {
    bad: `class Base {
  constructor() {
    super(); // Noncompliant
  }
}
class Child extends Base {
  constructor(x) {
    this.x = x; // Noncompliant
    super();
  }
}
class Other extends Base {
  constructor() { // Noncompliant
    this.init = true;
  }
}
export { Child, Other };
`,
    good: `class Base {
  constructor() {
    this.ready = true;
  }
}
class Child extends Base {
  constructor(x) {
    super();
    this.x = x;
  }
}
class Plain extends Base {}
class Factory extends Base {
  constructor() {
    return Object.create(Factory.prototype);
  }
}
export { Child, Plain, Factory };
`,
  },

  'getter-setter-field': {
    bad: `class Person {
  constructor() { this._name = ''; this._age = 0; }
  get name() { return this._age; } // Noncompliant
  set name(v) { this._name = v; }
  get age() { return this._age; }
  set age(v) { this._name = v; } // Noncompliant
}
export { Person };
`,
    good: `class Person {
  constructor() { this._name = ''; this._age = 0; }
  get name() { return this._name; }
  set name(v) { this._name = v; }
  get age() { return this._age; }
  set age(v) { this._age = v; }
  get label() { return this._name; }
}
export { Person };
`,
  },

  'multiline-block-without-braces': {
    bad: `function f(a, first, second) {
  if (a)
    first();
    second(); // Noncompliant
  for (const x of a)
    first(x);
    second(x); // Noncompliant
  if (!a) first();
  else if (a.length) second();
  else
    first(0);
    second(0); // Noncompliant
}
f([], () => 1, () => 2);
`,
    good: `function f(a, first, second) {
  if (a) {
    first();
    second();
  }
  for (const x of a)
    first(x);
  second();
  if (a) first();
  second();
  if (a)
    first();
  else
    second();
  first();
}
f([], () => 1, () => 2);
`,
  },

  'unexpected-multiline': {
    bad: `const run = (x) => x;
const a = run
(1 || 2).toString(); // Noncompliant
const tag = (s) => s;
const b = tag
\`hello\`; // Noncompliant
const c = run
[1, 2].forEach(run); // Noncompliant
export { a, b, c };
`,
    good: `const run = (x) => x;
const a = run;
(1 || 2).toString();
const tag = (s) => s;
const b = tag\`hello\`;
const c = run(
  1,
);
export { a, b, c };
`,
  },

  'loop-single-iteration': {
    bad: `function first(a, n, queue) {
  let found = null;
  for (let i = 0; i < n; i++) { // Noncompliant
    if (a[i]) found = a[i];
    break;
  }
  while (queue.length) { // Noncompliant
    return queue.pop();
  }
  for (const item of a) { // Noncompliant
    found = item;
    break;
  }
  return found;
}
first([], 0, []);
`,
    good: `function first(a, n, queue) {
  for (let i = 0; i < n; i++) {
    if (a[i]) return a[i];
  }
  while (queue.length) {
    const x = queue.pop();
    if (!x) continue;
    return x;
  }
  for (const key in queue) {
    if (key) return key;
  }
  return null;
}
first([], 0, []);
`,
  },

  'strict-equality-mismatch': {
    bad: `function check(input, flag) {
  if (typeof input === undefined) return 1; // Noncompliant
  if (!flag === 'false') return 2; // Noncompliant
  return 1 !== '1' ? 3 : 0; // Noncompliant
}
check(1, true);
`,
    good: `function check(input, flag) {
  if (typeof input === 'undefined') return 1;
  if (flag === 'false') return 2;
  return input === 1 || [] === {} ? 3 : 0;
}
check(1, true);
`,
  },

  'arithmetic-on-string': {
    bad: `function calc(price) {
  const r = 'abc' - 1; // Noncompliant
  const t = price * 'ten'; // Noncompliant
  const o = {} / 2; // Noncompliant
  return r + t + o;
}
calc(1);
`,
    good: `function calc(price) {
  const r = '5' * 2;
  const s = 'a' + price;
  const t = price * 10;
  return r + s + t;
}
calc(1);
`,
  },

  'in-array-value': {
    bad: `function pick(c) {
  const colors = ['red', 'green'];
  if ('red' in colors) return 1; // Noncompliant
  return c in ['a', 'b'] ? 2 : 0; // Noncompliant
}
pick('a');
`,
    good: `function pick(c, obj) {
  const colors = ['red', 'green'];
  if (0 in colors) return 1;
  if (colors.includes(c)) return 2;
  return c in obj ? 3 : 0;
}
pick('a', {});
`,
  },

  'promise-in-condition': {
    bad: `async function isReady() { return true; }
function start(go) {
  if (isReady()) go(); // Noncompliant
  const ok = fetch('/health') ? 1 : 0; // Noncompliant
  if (!Promise.resolve(1)) go(); // Noncompliant
  return ok;
}
start(() => 1);
`,
    good: `async function isReady() { return true; }
function ready() { return true; }
async function start(go) {
  if (await isReady()) go();
  if (ready()) go();
  const p = isReady();
  return p && go;
}
start(() => 1);
`,
  },

  'async-callback-misuse': {
    bad: `async function save(items, db) {
  items.forEach(async (it) => { // Noncompliant
    await db.save(it);
  });
  return items.filter(async (x) => db.has(x)); // Noncompliant
}
save([], {});
`,
    good: `async function save(items, db) {
  await Promise.all(items.map(async (it) => db.save(it)));
  for (const it of items) await db.save(it);
  return items.filter((x) => x.ok);
}
save([], {});
`,
  },

  'floating-promise': [
    {
      bad: `async function save() { return 1; }
async function run() {
  save(); // Noncompliant
  await save();
}
class Store {
  async load() { return 1; }
  async init() {
    this.load(); // Noncompliant
  }
}
run(); new Store().init();
`,
      good: `async function save() { return 1; }
function sync() { return 1; }
async function run() {
  await save();
  void save();
  save().catch(() => 0);
  sync();
  return save();
}
run();
`,
    },
    {
      lang: 'ts',
      bad: `const fetchUser = async (id: number): Promise<string> => String(id);
export async function main(): Promise<void> {
  fetchUser(1); // Noncompliant
  await fetchUser(2);
}
`,
      good: `const fetchUser = async (id: number): Promise<string> => String(id);
export async function main(): Promise<void> {
  const name: string = await fetchUser(1);
  void fetchUser(2);
  console.log(name);
}
`,
    },
  ],

  'empty-body-after-control': {
    bad: `function f(x, n, go) {
  if (x); // Noncompliant
  {
    go();
  }
  for (let i = 0; i < n; i++); // Noncompliant
  while (go()); // Noncompliant
}
f(1, 2, () => false);
`,
    good: `function f(x, n, go) {
  if (x) {
    go();
  }
  for (let i = 0; i < n; i++) {
    go(i);
  }
  while (go()) {
    // poll
  }
}
f(1, 2, () => false);
`,
  },

  'unused-expression': {
    bad: `function f(a, b, x) {
  a + b; // Noncompliant
  x == 1; // Noncompliant
  a ? b : x; // Noncompliant
  return a;
}
f(1, 2, 3);
`,
    good: `'use strict';
function f(a, b, x) {
  'use strict';
  const s = a + b;
  a && a.run();
  void x;
  x = 1;
  return s + x;
}
f(1, 2, 3);
`,
  },

  'constant-condition': {
    bad: `function f(a, go) {
  if (true) go(); // Noncompliant
  if ([]) go(); // Noncompliant
  const v = {} ? 1 : 2; // Noncompliant
  if ({} || a) go(); // Noncompliant
  return v;
}
f(1, () => 1);
`,
    good: `function f(a, go) {
  if (a) go();
  while (true) {
    if (go()) break;
  }
  do {
    go();
  } while (false);
  return a ? 1 : 2;
}
f(1, () => 1);
`,
  },

  'constant-binary-expression': {
    bad: `function f(a, b, x) {
  const v = a + b ?? 0; // Noncompliant
  if (x === []) return 1; // Noncompliant
  if (x != {}) return 2; // Noncompliant
  return v;
}
f(1, 2, 3);
`,
    good: `function f(a, b, x) {
  const v = (a ?? 0) + b;
  if (x === null) return 1;
  if (Array.isArray(x) && x.length === 0) return 2;
  return v ?? x;
}
f(1, 2, 3);
`,
  },
};
