// Language: classdef classes (value and handle), inheritance, static methods,
// constants, accessors, operator overloading, events, enumerations, @folders
// and classes written in JS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionWith } from '../core/lang/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import { num, str, toStr, MError } from '../core/value.js';

function session(files = {}, registry = null) {
  const out = [];
  const fs = createMemoryFs(files);
  const s = createSessionWith(registry, { fs, print: (t, st) => out.push([st, t]) });
  return {
    s, out, fs,
    run(code) { const r = s.evaluate(code); if (!r.ok) throw Object.assign(new Error(r.error.message), { id: r.error.identifier }); return r; },
    fail(code) { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; },
    v(name) { return js(s.getVariable(name)); },
    raw(name) { return s.getVariable(name); },
    text(stream = 'out') { return out.filter((o) => o[0] === stream).map((o) => o[1]).join(''); },
  };
}
function js(v) {
  if (v == null) return v;
  if (v.cls === 'char') return String.fromCharCode(...v.re);
  if (v.re) { const a = Array.from(v.re); return a.length === 1 ? a[0] : a; }
  if (v.cls === 'cell') return v.data.map(js);
  return v;
}

const POINT = `classdef Point
  % POINT a 2-D point (value class)
  properties
    X = 0
    Y (1,1) double = 0
  end
  properties (Constant)
    Dim = 2
  end
  properties (Dependent)
    R
  end
  methods
    function obj = Point(x, y)
      if nargin > 0
        obj.X = x;
        obj.Y = y;
      end
    end
    function r = get.R(obj)
      r = sqrt_(obj.X^2 + obj.Y^2);
    end
    function obj = moved(obj, dx)
      obj.X = obj.X + dx;
    end
    function p = plus(a, b)
      p = Point(a.X + b.X, a.Y + b.Y);
    end
    function t = eq(a, b)
      t = a.X == b.X && a.Y == b.Y;
    end
    function d = disp(obj)
      fprintf_(obj);
    end
  end
  methods (Static)
    function p = origin()
      p = Point(0, 0);
    end
  end
end
function r = sqrt_(x)
r = x ^ 0.5;
end
function fprintf_(obj)
assignin('base', 'dispCalled', obj.X);
end
`;

const ACCOUNT = `classdef Account < handle
  properties
    Balance = 0
  end
  properties (SetAccess = private)
    Log = {}
  end
  events
    Overdrawn
  end
  methods
    function obj = Account(b)
      if nargin, obj.Balance = b; end
    end
    function deposit(obj, x)
      obj.Balance = obj.Balance + x;
      obj.Log{end+1} = x;
    end
    function withdraw(obj, x)
      obj.Balance = obj.Balance - x;
      if obj.Balance < 0, notify(obj, 'Overdrawn'); end
    end
    function set.Balance(obj, v)
      if v < -100, error('Account:limit', 'Limit exceeded.'); end
      obj.Balance = v;
    end
  end
end
`;

const SAVINGS = `classdef Savings < Account
  properties
    Rate = 0.1
  end
  methods
    function obj = Savings(b, r)
      obj@Account(b);
      if nargin > 1, obj.Rate = r; end
    end
    function addInterest(obj)
      obj.deposit(obj.Balance * obj.Rate);
    end
    function withdraw(obj, x)
      withdraw@Account(obj, x + 1);
    end
  end
end
`;

const COLOR = `classdef Color
  properties
    R
  end
  methods
    function c = Color(r)
      c.R = r;
    end
  end
  enumeration
    Red (1), Green (0)
    Blue (0)
  end
end
`;

test('value class: construction, properties, methods, dependent and constant', () => {
  const h = session({ '/home/Point.m': POINT });
  h.run('p = Point(3, 4); x = p.X; r = p.R; q = p.moved(1); px = p.X; qx = q.X; d = Point.Dim; e = p.Dim; o = Point.origin(); ox = o.X; c = class(p);');
  assert.equal(h.v('x'), 3);
  assert.equal(h.v('r'), 5);
  assert.equal(h.v('px'), 3);
  assert.equal(h.v('qx'), 4);
  assert.equal(h.v('d'), 2);
  assert.equal(h.v('e'), 2);
  assert.equal(h.v('ox'), 0);
  assert.equal(h.v('c'), 'Point');
  h.run('p2 = p; p2.X = 100; still = p.X; z = Point(); zx = z.X;');
  assert.equal(h.v('still'), 3);
  assert.equal(h.v('zx'), 0);
  h.run("p.Y = '7'; y = p.Y;");
  assert.equal(h.v('y'), 55); // char '7' converted to double
});

test('value class: operator overloading and method dispatch', () => {
  const h = session({ '/home/Point.m': POINT });
  h.run('a = Point(1, 2); b = Point(10, 20); c = a + b; cx = c.X; same = a == Point(1, 2); diff = a == b; m = moved(a, 5); mx = m.X;');
  assert.equal(h.v('cx'), 11);
  assert.equal(h.v('same'), 1);
  assert.equal(h.v('diff'), 0);
  assert.equal(h.v('mx'), 6);
  h.run('a');
  assert.equal(h.v('dispCalled'), 1);
  assert.match(h.fail('a - b').message, /Operator '-' is not supported/);
  assert.match(h.fail('a.nothing').message, /Unrecognized method, property, or field 'nothing'/);
  assert.match(h.fail('a.R = 1;').message, /R/);
});

test('handle class: reference semantics, set methods, private set access and events', () => {
  const h = session({ '/home/Account.m': ACCOUNT });
  h.run('a = Account(10); b = a; b.deposit(5); bal = a.Balance; same = a == b; other = a == Account(15); n = numelLog(a);'.replace(' n = numelLog(a);', ''));
  assert.equal(h.v('bal'), 15);
  assert.equal(h.v('same'), 1);
  assert.equal(h.v('other'), 0);
  h.run('l = a.Log;');
  assert.deepEqual(h.v('l'), [5]);
  assert.match(h.fail('a.Log = {};').message, /SetAccess|private/);
  assert.match(h.fail('a.Balance = -500;').message, /Limit exceeded/);
  h.run("hits = 0; lis = addlistener(a, 'Overdrawn', @(src, ev) assignin('base', 'hits', hits + 1)); a.withdraw(100); a.withdraw(1);");
  assert.equal(h.v('hits'), 1);
  assert.match(h.fail("addlistener(a, 'NoSuchEvent', @(s, e) 1)").message, /not defined/);
  h.run('v1 = isvalid(a); delete(a); v2 = isvalid(b);');
  assert.equal(h.v('v1'), 1);
  assert.equal(h.v('v2'), 0);
});

test('inheritance: superclass constructor, inherited methods, super method calls, isa', () => {
  const h = session({ '/home/Account.m': ACCOUNT, '/home/Savings.m': SAVINGS });
  h.run("s = Savings(100, 0.5); s.addInterest(); b1 = s.Balance; s.withdraw(9); b2 = s.Balance; t1 = isa(s, 'Account'); t2 = isa(s, 'handle'); t3 = isa(s, 'Point'); t4 = isa(1, 'numeric'); t5 = isa(int_, 'float');".replace(' t5 = isa(int_, \'float\');', ''));
  assert.equal(h.v('b1'), 150);
  assert.equal(h.v('b2'), 140);
  assert.deepEqual([h.v('t1'), h.v('t2'), h.v('t3'), h.v('t4')], [1, 1, 0, 1]);
  h.run("m = methods('Savings'); p = properties(s); im = ismethod(s, 'deposit'); ip = isprop(s, 'Rate');");
  assert.ok(h.v('m').includes('addInterest') && h.v('m').includes('deposit'));
  assert.deepEqual(h.v('p'), ['Balance', 'Log', 'Rate']);
  assert.equal(h.v('im'), 1);
  assert.equal(h.v('ip'), 1);
});

test('enumerations', () => {
  const h = session({ '/home/Color.m': COLOR });
  h.run("c = Color.Red; r = c.R; same = c == Color.Red; diff = c == Color.Blue; n = char(c); switch c, case Color.Red, w = 1; otherwise, w = 2; end");
  assert.equal(h.v('r'), 1);
  assert.equal(h.v('same'), 1);
  assert.equal(h.v('diff'), 0);
  assert.equal(h.v('n'), 'Red');
  assert.equal(h.v('w'), 1);
  assert.match(h.fail('Color(1)').message, /enumeration/);
});

test('static methods, constants and packages of classes', () => {
  const h = session({
    '/home/+shapes/Circle.m': 'classdef Circle\n  properties\n    R = 1\n  end\n  properties (Constant)\n    K = 3\n  end\n  methods\n    function c = Circle(r)\n      if nargin, c.R = r; end\n    end\n    function a = area(c)\n      a = shapes.Circle.K * c.R^2;\n    end\n  end\n  methods (Static)\n    function c = unit()\n      c = shapes.Circle(1);\n    end\n  end\nend\n',
  });
  h.run('c = shapes.Circle(2); a = c.area(); u = shapes.Circle.unit(); ua = area(u); k = shapes.Circle.K;');
  assert.equal(h.v('a'), 12);
  assert.equal(h.v('ua'), 3);
  assert.equal(h.v('k'), 3);
});

test('private methods and properties are protected from outside access', () => {
  const h = session({
    '/home/Secret.m': 'classdef Secret\n  properties (Access = private)\n    Code = 42\n  end\n  methods\n    function v = reveal(obj)\n      v = obj.hidden() + obj.Code;\n    end\n  end\n  methods (Access = private)\n    function v = hidden(obj)\n      v = 1;\n    end\n  end\nend\n',
  });
  h.run('s = Secret(); v = s.reveal();');
  assert.equal(h.v('v'), 43);
  assert.match(h.fail('s.Code').message, /private/);
  assert.match(h.fail('s.hidden()').message, /Cannot access method/);
});

test('subsref / subsasgn overloads and builtin fallbacks', () => {
  const h = session({
    '/home/Box.m': "classdef Box\n  properties\n    Data = [10 20 30]\n  end\n  methods\n    function varargout = subsref(obj, S)\n      if strcmp_(S(1).type, '()')\n        varargout{1} = obj.Data(S(1).subs{:}) * 2;\n      else\n        [varargout{1:nargout}] = builtin('subsref', obj, S);\n      end\n    end\n    function obj = subsasgn(obj, S, v)\n      if S(1).type == '()'\n        obj.Data(S(1).subs{:}) = -v;\n      else\n        obj = builtin('subsasgn', obj, S, v);\n      end\n    end\n  end\nend\nfunction t = strcmp_(a, b)\nt = numel_(a) == numel_(b) && all_(a == b);\nend\nfunction n = numel_(x)\nn = 0; for k = x, n = n + 1; end\nend\nfunction t = all_(x)\nt = 1; for k = x, if ~k, t = 0; end, end\nend\n",
  });
  h.run('b = Box(); a = b(2); d = b.Data; b(1) = 5; e = b.Data;');
  assert.equal(h.v('a'), 40);
  assert.deepEqual(h.v('d'), [10, 20, 30]);
  assert.deepEqual(h.v('e'), [-5, 20, 30]);
});

test('old-style @folder class methods', () => {
  const h = session({
    '/home/@Tally/Tally.m': 'classdef Tally\n  properties\n    N = 0\n  end\nend\n',
    '/home/@Tally/bump.m': 'function t = bump(t)\nt.N = t.N + 1;\nend\n',
  });
  h.run('t = Tally(); t = bump(t); t = t.bump(); n = t.N;');
  assert.equal(h.v('n'), 2);
});

test('display of objects without a disp method lists properties', () => {
  const h = session({ '/home/Account.m': ACCOUNT });
  h.run('a = Account(3)');
  const t = h.text();
  assert.match(t, /Account with properties:/);
  assert.match(t, /Balance: 3/);
});

test('metaclass and ?Class', () => {
  const h = session({ '/home/Account.m': ACCOUNT, '/home/Savings.m': SAVINGS });
  h.run("mc = ?Savings; n = mc.Name; m2 = metaclass(Savings(1)); n2 = m2.Name; sup = mc.SuperclassList;");
  assert.equal(h.v('n'), 'Savings');
  assert.equal(h.v('n2'), 'Savings');
  assert.deepEqual(h.v('sup'), ['Account']);
});

test('PostSet property listeners and dynamic properties', () => {
  const h = session({
    '/home/Dyn.m': 'classdef Dyn < dynamicprops\n  properties\n    A = 1\n  end\nend\n',
  });
  h.run("d = Dyn(); addprop(d, 'Extra'); d.Extra = 5; x = d.Extra; seen = 0; l = addlistener(d, 'A', 'PostSet', @(s, e) assignin('base', 'seen', 1)); d.A = 2;");
  assert.equal(h.v('x'), 5);
  assert.equal(h.v('seen'), 1);
});

test('classes written in JS: construct, methods, subsref, subsasgn and operators', () => {
  const registry = {
    builtins: {}, help: {}, installs: [], owner: {},
    classes: {
      'demo.Bag': {
        handle: true,
        props: ['Count'],
        construct(args) { return { cls: 'demo.Bag', isObject: true, dims: [1, 1], handle: true, props: { items: new Map(), Count: num(0) } }; },
        methods: {
          keys(args) { const b = args[0]; return { cls: 'cell', dims: [1, b.props.items.size], data: [...b.props.items.keys()].map((k) => str(k)) }; },
          plus(args) { return num(args[0].props.items.size + (args[1].re ? args[1].re[0] : 0)); },
        },
        subsref(obj, subs) {
          if (subs[0].type === '()') { const k = toStr(subs[0].subs[0]); if (!obj.props.items.has(k)) throw new MError('demo:noKey', `No key ${k}.`); return [obj.props.items.get(k)]; }
          if (subs[0].type === '.' && subs[0].subs === 'Count') return [num(obj.props.items.size)];
          if (subs[0].type === '.' && subs[0].subs === 'keys') return [this.methods.keys([obj])];
          throw new MError('demo:bad', 'Unsupported.');
        },
        subsasgn(obj, subs, rhs) { obj.props.items.set(toStr(subs[0].subs[0]), rhs); return obj; },
      },
    },
  };
  const h = session({}, registry);
  h.run("b = demo.Bag(); b('x') = 1; b('y') = 22; v = b('y'); n = b.Count; k = keys(b); s = b + 5;");
  assert.equal(h.v('v'), 22);
  assert.equal(h.v('n'), 2);
  assert.deepEqual(h.v('k'), ['x', 'y']);
  assert.equal(h.v('s'), 7);
  assert.match(h.fail("b('zz')").message, /No key zz/);
});
