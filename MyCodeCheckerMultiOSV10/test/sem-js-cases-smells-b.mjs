// sem-js samples: second half of core/sem-js/rules/smells.js (use-before-declare .. nested-assignment).
export default {
  'use-before-declare': {
    bad: `function total(items) {
  sum = 0; // Noncompliant
  for (const it of items) sum += it.price;
  var sum;
  return sum;
}

function label(user) {
  if (user.admin) console.log(prefix + user.name); // Noncompliant
  var prefix = 'admin: ';
  return prefix + user.name;
}
`,
    good: `function total(items) {
  var sum = 0;
  for (const it of items) sum += it.price;
  return sum;
}

function init() {
  const get = () => cache;
  var cache = {};
  return get;
}
`,
  },

  'nested-template': {
    bad: `function greet(user, count) {
  const title = \`Hello \${user ? \`\${user.first} \${user.last}\` : 'guest'}!\`; // Noncompliant
  const note = \`You have \${count > 1 ? \`\${count} messages\` : 'one message'}\`; // Noncompliant
  return title + note;
}
`,
    good: `function greet(user, count) {
  const name = user ? \`\${user.first} \${user.last}\` : 'guest';
  const title = \`Hello \${name}!\`;
  const note = count > 1 ? \`\${count} messages\` : 'one message';
  return \`\${title} \${note}\`;
}
`,
  },

  'promise-resolve-shorthand': {
    bad: `function cached(value) {
  return new Promise((resolve) => resolve(value)); // Noncompliant
}

function failed(err) {
  return new Promise(function (resolve, reject) { reject(err); }); // Noncompliant
}
`,
    good: `function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cached(value) {
  return Promise.resolve(value);
}

function lazy(compute) {
  return new Promise((resolve) => resolve(compute()));
}
`,
  },

  'prefer-for-of': {
    bad: `function print(items) {
  for (let i = 0; i < items.length; i++) { // Noncompliant
    console.log(items[i].name);
  }
}

function sum(order) {
  let total = 0;
  for (let k = 0; k < order.lines.length; k++) total += order.lines[k].price; // Noncompliant
  return total;
}
`,
    good: `function print(items) {
  for (const item of items) console.log(item.name);
  for (let i = 0; i < items.length; i++) console.log(i, items[i]);
}

function double(values) {
  for (let i = 0; i < values.length; i++) values[i] = values[i] * 2;
  return values;
}
`,
  },

  'this-alias': {
    bad: `class Poller {
  start() {
    const self = this; // Noncompliant
    setInterval(function () { self.tick(); }, 1000);
  }
  stop() {
    var that = this; // Noncompliant
    setTimeout(function () { that.clear(); }, 0);
  }
}
`,
    good: `class Poller {
  start() {
    setInterval(() => this.tick(), 1000);
    const { interval } = this;
    return interval;
  }
}
// a cursor walking from this is not an alias
class Scope {
  lookup(name) {
    for (let s = this; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name);
    return null;
  }
}
`,
  },

  'builtin-shadow': [
    {
      bad: `function index(rows) {
  const Map = {}; // Noncompliant
  for (const r of rows) Map[r.id] = r;
  return Map;
}

function parse(text, JSON) { // Noncompliant
  return JSON.parse(text);
}
`,
      good: `import { Map as ImmutableMap } from 'immutable';

export function index(rows) {
  const byId = new Map();
  for (const r of rows) byId.set(r.id, r);
  return ImmutableMap(byId);
}
`,
    },
    {
      lang: 'ts',
      bad: `export function wrap<T>(value: T): T[] {
  let Array: T[] = [value]; // Noncompliant
  return Array;
}
`,
      good: `declare global {
  interface Promise<T> {
    tap(fn: (v: T) => void): Promise<T>;
  }
}
type Set = { id: number };
export function wrap<T>(value: T): T[] {
  const list: T[] = [value];
  return list;
}
`,
    },
  ],

  'arguments-usage': {
    bad: `function sum() {
  let total = 0;
  for (const n of arguments) total += n; // Noncompliant
  return total;
}

function log() {
  console.log.apply(console, arguments); // Noncompliant
}
`,
    good: `function sum(...nums) {
  return nums.reduce((a, b) => a + b, 0);
}

function log(...args) {
  console.log(...args);
}
`,
  },

  'generator-without-yield': {
    bad: `function* ids() { // Noncompliant
  return [1, 2, 3];
}

const pages = {
  *list() { // Noncompliant
    const all = [];
    all.push(1);
    return all;
  },
};
`,
    good: `function* ids() {
  yield 1;
  yield* [2, 3];
}

function* none() {}

const pages = {
  *list() {
    for (const p of [1, 2]) yield p;
  },
};
`,
  },

  'array-named-props': {
    bad: `function build() {
  const row = [];
  row.push(1);
  row.name = 'first'; // Noncompliant
  row['id'] = 42; // Noncompliant
  return row;
}
`,
    good: `function build(source) {
  const row = [];
  row[0] = 1;
  row.length = 0;
  const meta = {};
  meta.name = 'first';
  let data = [];
  data = source.load();
  data.name = 'loaded';
  return [row, meta, data];
}
`,
  },

  'arguments-callee': {
    bad: `function fact(n) {
  return n <= 1 ? 1 : n * arguments.callee(n - 1); // Noncompliant
}

function who() {
  return arguments.caller; // Noncompliant
}
`,
    good: `function fact(n) {
  return n <= 1 ? 1 : n * fact(n - 1);
}

function who(info) {
  return info.arguments.callee;
}
`,
  },

  'octal-literal': {
    bad: `var mode = 0755; // Noncompliant
var mask = 022; // Noncompliant
`,
    good: `var mode = 0o755;
var mask = 18;
var zero = 0;
var half = 0.5;
`,
  },

  'octal-escape': {
    bad: `var copy = 'Copyright \\251 2024'; // Noncompliant
var bell = "ring \\7"; // Noncompliant
`,
    good: `var copy = 'Copyright \\xA9 2024';
var nul = 'end\\0';
var uni = 'bell \\u0007';
`,
  },

  'primitive-wrapper': {
    bad: `function flags(input) {
  const off = new Boolean(false); // Noncompliant
  const name = new String(input); // Noncompliant
  return [off, name];
}
`,
    good: `function flags(input) {
  const off = Boolean(input);
  const name = String(input);
  const n = Number(input);
  const d = new Date(n);
  return [off, name, d];
}
`,
  },

  'array-constructor': [
    {
      bad: `const primes = new Array(2, 3, 5); // Noncompliant
const names = Array('a', 'b'); // Noncompliant
const empty = new Array(); // Noncompliant
const bag = new Object(); // Noncompliant
`,
      good: `const primes = [2, 3, 5];
const slots = new Array(16);
const copy = Array.from(primes);
const bag = {};
const wrapped = new Object(primes);
`,
    },
    {
      lang: 'ts',
      bad: `const ids: number[] = new Array(1, 2); // Noncompliant
`,
      good: `const ids = new Array<number>();
const grid: string[] = new Array(9).fill('');
`,
    },
  ],

  'default-param-last': [
    {
      bad: `function connect(host = 'localhost', port) { // Noncompliant
  return host + ':' + port;
}
const fmt = (sep = ',', ...parts) => parts.join(sep);
const pad = (width = 2, text) => text.padStart(width); // Noncompliant
`,
      good: `function connect(port, host = 'localhost') {
  return host + ':' + port;
}
const fmt = (sep = ',', ...parts) => parts.join(sep);
`,
    },
    {
      lang: 'ts',
      bad: `export function page(size: number = 20, index: number): number { // Noncompliant
  return size * index;
}
`,
      good: `export function page(size: number = 20, index?: number): number {
  return size * (index ?? 0);
}
`,
    },
  ],

  'nested-switch': {
    bad: `function describe(kind, sub) {
  switch (kind) {
    case 'animal':
      switch (sub) { // Noncompliant
        case 'cat': return 'meow';
        default: return '?';
      }
    default:
      return 'unknown';
  }
}
`,
    good: `function sound(sub) {
  switch (sub) {
    case 'cat': return 'meow';
    default: return '?';
  }
}

function describe(kind, sub) {
  switch (kind) {
    case 'animal': {
      const f = () => { switch (sub) { case 'x': return 1; default: return 2; } };
      return sound(sub) + f();
    }
    default:
      return 'unknown';
  }
}
`,
  },

  'label-non-loop': {
    bad: `function check(a) {
  guard: { // Noncompliant
    if (!a) break guard;
    console.log(a);
  }
  done: if (a > 1) { // Noncompliant
    break done;
  }
}
`,
    good: `function find(grid, v) {
  outer: for (const row of grid) {
    for (const c of row) {
      if (c === v) break outer;
    }
  }
  sw: switch (v) {
    case 1: break sw;
    default: break;
  }
}
`,
  },

  'void-use': {
    bad: `function run(value, a) {
  const x = void value; // Noncompliant
  void (a + 1); // Noncompliant
  return x;
}
`,
    good: `async function run(fetchData) {
  const u = void 0;
  void fetchData();
  void new Promise((r) => r());
  return u;
}
`,
  },

  'object-shorthand': {
    bad: `function make(name, age) {
  return {
    name: name, // Noncompliant
    age,
    greet: function () { return 'hi ' + this.name; }, // Noncompliant
  };
}
`,
    good: `function make(name, age) {
  return {
    name,
    years: age,
    greet() { return 'hi ' + this.name; },
    named: function namedForStack() { return 1; },
    *items() { yield 1; },
    arrow: () => age,
  };
}
`,
  },

  'prefer-spread': {
    bad: `function top(values, fn) {
  const m = Math.max.apply(Math, values); // Noncompliant
  return fn.apply(null, [m].concat(values)) + fn.apply(undefined, values); // Noncompliant
}
`,
    good: `function top(values, fn, ctx, other) {
  const m = Math.max(...values);
  fn.apply(ctx, values);
  other.method.apply(ctx, values);
  fn.apply(null, [1, 2]);
  return m;
}
`,
  },

  'starts-with': {
    bad: `function check(name, url) {
  if (name.indexOf('Mr') === 0) return 'title'; // Noncompliant
  if (url.slice(0, 5) === 'https') return 'secure'; // Noncompliant
  return '';
}
`,
    good: `function check(name, url) {
  const list = [1, 2, 3];
  if (name.startsWith('Mr')) return 'title';
  if (url.indexOf('?') > 0) return 'query';
  if (list.indexOf(1) === 0) return 'first';
  if (url.slice(0, 4) === 'https') return 'odd';
  return '';
}
`,
  },

  'string-literal-duplicate': {
    bad: `function validate(user) {
  if (!user.name) throw new Error('Invalid user name'); // Noncompliant
  if (user.name.length > 20) throw new Error('Invalid user name');
  if (/\\d/.test(user.name)) throw new Error('Invalid user name');
}
`,
    good: `const INVALID_NAME = 'Invalid user name';
function validate(user) {
  if (!user.name) throw new Error(INVALID_NAME);
  if (user.name.length > 20) throw new Error(INVALID_NAME);
  const a = { 'content-type': 1 }, b = { 'content-type': 2 }, c = { 'content-type': 3 };
  return [a, b, c, 'short', 'short', 'short'];
}
`,
  },

  'for-to-while': {
    bad: `function drain(queue) {
  for (; queue.length > 0;) { // Noncompliant
    queue.shift();
  }
}
`,
    good: `function drain(queue) {
  while (queue.length > 0) queue.shift();
  for (let i = 0; i < 3; i++) queue.push(i);
  for (;;) { break; }
}
`,
  },

  'loop-counter-assign': {
    bad: `function skip(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') i++; // Noncompliant
    if (lines[i] === '#') i = lines.length; // Noncompliant
  }
}
`,
    good: `function skip(lines) {
  let blank = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') blank++;
  }
  return blank;
}
`,
  },

  'conditional-same-line': {
    bad: `function step(a, b) {
  if (a) {
    run(1);
  } if (b) { // Noncompliant
    run(2);
  }
}
`,
    good: `function step(a, b) {
  if (a) {
    run(1);
  } else if (b) {
    run(2);
  }
  if (b) {
    run(3);
  }
  if (a) run(4); if (b) run(5);
}
`,
  },

  'multiline-string': {
    bad: `var text = /* Noncompliant */ 'first line \\
second line';
var other = 'ok';
var help = /* Noncompliant */ "usage: \\
  run [options]";
`,
    good: `var text = 'first line ' +
  'second line';
var t2 = \`first line
second line\`;
var path = 'C:\\\\temp';
`,
  },

  'future-reserved-word': {
    bad: `var package = 'core'; // Noncompliant
function load(implements) { // Noncompliant
  return implements + package;
}
`,
    good: `var opts = { package: 'core', private: true };
console.log(opts.package, opts.private);
`,
  },

  'extra-boolean-cast': {
    bad: `function show(user, items) {
  if (!!user) console.log(user); // Noncompliant
  while (Boolean(items.length)) items.pop(); // Noncompliant
  return !Boolean(user); // Noncompliant
}
`,
    good: `function show(user) {
  const flag = !!user;
  if (user) console.log(user);
  return Boolean(flag);
}
`,
  },

  'undefined-assignment': {
    bad: `let current = undefined; // Noncompliant
function reset() {
  current = undefined; // Noncompliant
}
`,
    good: `let current;
const obj = {};
function reset() {
  current = null;
  obj.cache = undefined;
}
`,
  },

  'invariant-return': {
    bad: `function isValid(x) { // Noncompliant
  if (x > 0) return true;
  if (x < -10) return true;
  return true;
}
`,
    good: `function isValid(x) {
  if (x > 0) return true;
  return false;
}

function pick(a, b) {
  if (a) return a;
  return b;
}

function once(x) {
  if (x) return 1;
}
`,
  },

  'setter-without-getter': {
    bad: `class User {
  set name(v) { this._name = v; } // Noncompliant
  get age() { return this._age; }
  set age(v) { this._age = v; }
}

const config = {
  set level(v) { this._level = v; }, // Noncompliant
};
`,
    good: `class User {
  get name() { return this._name; }
  set name(v) { this._name = v; }
}

const config = {
  set level(v) { this._level = v; },
  get level() { return this._level; },
};
`,
  },

  'exception-reassign': {
    bad: `function load(read) {
  try {
    return read();
  } catch (e) {
    e = new Error('load failed'); // Noncompliant
    throw e;
  }
}
`,
    good: `function load(read) {
  try {
    return read();
  } catch (e) {
    const wrapped = new Error('load failed', { cause: e });
    throw wrapped;
  }
}
`,
  },

  'param-reassign': {
    bad: `function greet(name) {
  name = 'World'; // Noncompliant
  return 'Hello ' + name;
}

function limit(n, max) {
  max = 10; // Noncompliant
  return Math.min(n, max);
}
`,
    good: `function greet(name) {
  if (!name) name = 'World';
  return 'Hello ' + name;
}

function scale(factor) {
  [factor] = [factor * 2];
  return factor;
}

function limit(n, max) {
  max = max || 10;
  n = Math.min(n, max);
  return n;
}
`,
  },

  'useless-concat': {
    bad: `const greeting = 'Hello, ' + 'world'; // Noncompliant
const path = base + '/api/' + 'v1'; // Noncompliant
`,
    good: `const greeting = 'Hello, world';
const path = base + '/api/v1';
const long = 'a long line that wraps ' +
  'onto the next line';
`,
  },

  'parseint-radix': {
    bad: `const a = parseInt(input); // Noncompliant
const b = Number.parseInt(other); // Noncompliant
`,
    good: `const a = parseInt(input, 10);
const b = Number.parseInt(other, 16);
const c = parseInt(...args);
`,
  },

  'global-isnan': {
    bad: `function check(x, y) {
  if (isNaN(x)) return 'nan'; // Noncompliant
  return isFinite(y); // Noncompliant
}
`,
    good: `function check(x, y) {
  if (Number.isNaN(x)) return 'nan';
  return Number.isFinite(y);
}
`,
  },

  'deprecated-api': [{
    bad: `const { parse } = require('url');
import { exists } from 'fs';
export function check(u, p) {
  exists(p, () => {}); // Noncompliant
  return parse(u); // Noncompliant
}
`,
    good: `import { access } from 'fs';
export function check(u, p, parse) {
  access(p, () => {});
  return parse(u) || new URL(u);
}
`,
  }, {
    bad: `const fs = require('fs');
const domain = require('domain'); // Noncompliant
function run(p, s, e) {
  fs.exists(p, () => {}); // Noncompliant
  const buf = new Buffer(10); // Noncompliant
  const part = s.substr(1, 2); // Noncompliant
  return [buf, part, escape(s), e.keyCode, domain]; // Noncompliant
}
`,
    good: `const fs = require('fs');
function run(p, s, e) {
  fs.access(p, () => {});
  const buf = Buffer.alloc(10);
  const part = s.slice(1, 3);
  return [buf, part, encodeURIComponent(s), e.key];
}
`,
  }],

  'has-own-property': {
    bad: `function has(obj, key) {
  if (obj.hasOwnProperty(key)) return true; // Noncompliant
  if (({}).hasOwnProperty.call(obj, 'id')) return true; // Noncompliant
  return Object.prototype.hasOwnProperty.call(obj, key); // Noncompliant
}
`,
    good: `function has(obj, key) {
  return Object.hasOwn(obj, key);
}
class Bag {
  own(k) { return this.hasOwnProperty(k); }
}
`,
  },

  'async-without-await': [
    {
      bad: `async function load(cache, key) { // Noncompliant
  return cache.get(key);
}

const save = async (store, v) => { // Noncompliant
  store.put(v);
};
`,
      good: `async function load(cache, key) {
  return await cache.fetch(key);
}

async function fail(msg) {
  throw new Error(msg);
}

class Repo {
  async get() { return 1; }
}

setTimeout(async () => { console.log('tick'); }, 0);
`,
    },
    {
      lang: 'ts',
      bad: `export async function count(items: string[]): Promise<number> { // Noncompliant
  return items.length;
}
`,
      good: `export async function count(load: () => Promise<string[]>): Promise<number> {
  const items = await load();
  return items!.length;
}
`,
    },
  ],

  'extend-native': {
    bad: `Array.prototype.last = function () { // Noncompliant
  return this[this.length - 1];
};
Object.defineProperty(String.prototype, 'shout', { value() { return this.toUpperCase(); } }); // Noncompliant
`,
    good: `function Widget() {}
Widget.prototype.render = function () { return 'w'; };
function last(arr) { return arr[arr.length - 1]; }
class MyList extends Array {}
`,
  },

  'function-in-block': {
    bad: `function setup(debug) {
  if (debug) {
    function log(m) { console.log(m); } // Noncompliant
    log('debug on');
  }
  for (const x of [1]) {
    function each() { return x; } // Noncompliant
    each();
  }
}
`,
    good: `function setup(debug) {
  function log(m) { console.log(m); }
  if (debug) {
    const trace = (m) => console.log(m);
    trace('debug on');
    log('x');
  }
}
`,
  },

  'comma-operator': {
    bad: `function next(a, b) {
  const x = (a++, b); // Noncompliant
  return a > 0 ? (b--, x) : x; // Noncompliant
}
`,
    good: `function next(a, b) {
  for (let i = 0, j = 10; i < j; i++, j--) a += i;
  a++;
  return [a, b];
}
`,
  },

  'default-case-last': {
    bad: `function kind(x) {
  switch (x) {
    default: // Noncompliant
      return 'other';
    case 1:
      return 'one';
  }
}
`,
    good: `function kind(x) {
  switch (x) {
    case 1:
      return 'one';
    default:
      return 'other';
  }
}
`,
  },

  'bitwise-in-boolean': {
    bad: `function both(a, b, ok) {
  if (a > 0 & b > 0) return 1; // Noncompliant
  return ok | !a; // Noncompliant
}
`,
    good: `const READ = 1;
function both(flags, a, b) {
  if ((flags & READ) === 0) return 0;
  if (a > 0 && b > 0) return 1;
  return flags | 4;
}
`,
  },

  'loop-func': {
    bad: `function bind(buttons) {
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].onclick = function () { show(i); }; // Noncompliant
  }
}
`,
    good: `function bind(buttons) {
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].onclick = function () { show(i); };
  }
  for (var j = 0; j < 3; j++) {
    [1, 2].forEach((x) => show(x + j));
  }
}
`,
  },

  'misleading-indentation': {
    bad: `function boot(ready, items) {
  if (ready)
  start(); // Noncompliant
  for (const it of items)
  use(it); // Noncompliant
}
`,
    good: `function boot(ready, items) {
  if (ready)
    start();
  else
    stop();
  for (const it of items) use(it);
}
`,
  },

  'throw-literal': {
    bad: `function check(x) {
  if (!x) throw 'missing value'; // Noncompliant
  if (x < 0) throw \`negative: \${x}\`; // Noncompliant
  if (x > 9) throw 'too big: ' + x; // Noncompliant
}
`,
    good: `function check(x, err) {
  if (!x) throw new Error('missing value');
  if (x < 0) throw err;
  throw new RangeError(\`bad: \${x}\`);
}
`,
  },

  'promise-reject-non-error': {
    bad: `function fail() {
  return Promise.reject('not found'); // Noncompliant
}
function later() {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject({ code: 1 }), 10); // Noncompliant
  });
}
`,
    good: `function fail(e) {
  return Promise.reject(new Error('not found')).catch(() => e);
}
function later(cb) {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('timeout')), 10);
    cb('fine');
  });
}
`,
  },

  'nested-assignment': [
    {
      bad: `function scan(re, s, log) {
  let m, total;
  log(total = 5); // Noncompliant
  const n = (m = re.exec(s)); // Noncompliant
  return [m, n, total];
}
`,
      good: `function scan(re, s) {
  let m, a, b;
  while ((m = re.exec(s)) !== null) console.log(m);
  a = b = 0;
  const f = () => (a = 1);
  return [a, b, f];
}
`,
    },
    {
      lang: 'ts',
      bad: `export function pick(el: unknown, log: (n: number) => void): number {
  let w = 0;
  log((w = (el as HTMLElement).offsetWidth) + 1); // Noncompliant
  return w;
}
`,
      good: `export function pick(el: unknown): number {
  let w = 0;
  w = (el as HTMLElement).offsetWidth!;
  return w;
}
`,
    },
  ],
};
