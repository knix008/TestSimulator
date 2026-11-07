// The Python interpreter: the language first, then bpy. Every expected output is what CPython prints for the same code.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { activeObject, createDefaultScene, deserialize } from '../../src/core/doc.js';
import { History } from '../../src/core/history.js';
import { createPythonConsole, loadPythonAddon, runPython } from '../../src/core/python.js';
import { getOp, run, unregister } from '../../src/core/ops.js';

const context = () => {
  const doc = createDefaultScene();
  const history = new History();
  history.reset(doc);
  return { doc, history, undo() { const text = this.history.undo(); if (text) this.doc = deserialize(text); return Boolean(text); } };
};
const py = (code) => {
  const r = runPython(context(), code);
  assert.ok(r.ok, r.error);
  return r.output;
};
const check = (name, code, expected) => test(name, () => assert.deepEqual(py(code), expected));
const fails = (name, code, pattern) => test(name, () => {
  const r = runPython(context(), code);
  assert.equal(r.ok, false);
  assert.match(r.error, pattern);
});

describe('Python: numbers and text', () => {
  check('integer and float arithmetic', 'print(7 // 2, 7 / 2, 7 % 3, -7 // 2, -7 % 3, 2 ** 10, 2 ** -1)', ['3 3.5 1 -4 2 1024 0.5']);
  check('floats stay floats', 'print(1.0, 2.5 + 0.5, 3 * 1.0, 10 / 2, round(2.5), round(3.5), round(2.567, 2))', ['1.0 3.0 3.0 5.0 2 4 2.57']);
  check('int and float conversions', 'print(int("42"), int(3.9), float("2.5"), str(12) + "!", int("ff", 16), bool(0), bool("a"))', ['42 3 2.5 12! 255 False True']);
  check('strings', `s = "Hello, World"
print(s.upper(), s.lower(), s[0], s[-1], s[7:], s[:5], s[::-1], len(s))
print(s.replace("World", "Blender"), s.split(", "), "-".join(["a", "b"]), s.find("W"), "x" * 3)
print("  pad ".strip(), "abc".startswith("a"), "abc".endswith("z"), "a,b".split(","), "Ab".title(), "7".zfill(3))`, [
    'HELLO, WORLD hello, world H d World Hello dlroW ,olleH 12',
    "Hello, Blender ['Hello', 'World'] a-b 7 xxx",
    "pad True False ['a', 'b'] Ab 007",
  ]);
  check('f-strings with format specs', `x = 3.14159
n = 42
name = "cube"
print(f"{x:.2f} {n:5d}|{n:<5}|{n:>5}|{n:^5}|{n:05d} {name!r} {n + 1} {{literal}} {x:8.3f} {n:x} {1234567:,}")`, ["3.14    42|42   |   42| 42  |00042 'cube' 43 {literal}    3.142 2a 1,234,567"]);
  check('.format and % formatting', `print("{} and {}".format(1, 2), "{0}{0}".format("a"), "{x:.1f}".format(x=2.55), "%d items %s %.2f" % (3, "ok", 1.5), "%5s|%-5s|" % ("a", "b"))`, ['1 and 2 aa 2.5 3 items ok 1.50     a|b    |']);
  check('booleans and None', 'print(True and False, True or False, not True, None, None is None, 1 == 1.0, 0 or "x", 1 and "y")', ['False True False None True True x y']);
  check('chained comparison, in, is', 'x = 5\nprint(1 < x < 10, 1 < x < 3, 3 in [1, 2, 3], "a" not in "bcd", x is not None)', ['True False True True True']);
  check('ternary and walrus', 'x = 3\nprint("big" if x > 2 else "small", (y := x + 1), y)', ['big 4 4']);
});

describe('Python: collections', () => {
  check('lists', `a = [3, 1, 2]
a.append(4); a.insert(0, 0); a.remove(1); a.sort()
print(a, a[1:3], a[-1], len(a), sum(a), min(a), max(a))
a.reverse(); print(a, a.pop(), a.index(3), a.count(3))
print([1, 2] + [3], [0] * 3, sorted([3, 1, 2], reverse=True), sorted(["bb", "a"], key=len))`, [
    '[0, 2, 3, 4] [2, 3] 4 4 9 0 4',
    '[4, 3, 2] 0 1 1',
    "[1, 2, 3] [0, 0, 0] [3, 2, 1] ['a', 'bb']",
  ]);
  check('tuples and unpacking', `t = (1, 2, 3)
a, b, c = t
x, *rest = [1, 2, 3, 4]
*init, last = [1, 2, 3]
a, b = b, a
print(t, a, b, c, x, rest, init, last, (5,), t[1:], len(t))`, ['(1, 2, 3) 2 1 3 1 [2, 3, 4] [1, 2] 3 (5,) (2, 3) 3']);
  check('dicts', `d = {"a": 1, "b": 2}
d["c"] = 3
del d["a"]
print(d, d["b"], d.get("x"), d.get("x", 9), list(d.keys()), list(d.values()), "b" in d, len(d))
for k, v in d.items(): print(k, v)
print({k: v * 2 for k, v in d.items()}, dict(x=1), d.pop("b"), d)
d2 = {**d, "z": 0}; print(d2)
print({(1, 2): "pair"}[(1, 2)])`, [
    "{'b': 2, 'c': 3} 2 None 9 ['b', 'c'] [2, 3] True 2",
    'b 2', 'c 3',
    "{'b': 4, 'c': 6} {'x': 1} 2 {'c': 3}",
    "{'c': 3, 'z': 0}",
    'pair',
  ]);
  check('sets', 'a = {1, 2, 3}\nb = {2, 3, 4}\nprint(sorted(a & b), sorted(a | b), sorted(a - b), 2 in a, len(set([1, 1, 2])))', ['[2, 3] [1, 2, 3, 4] [1] True 2']);
  check('comprehensions', 'print([x * x for x in range(5) if x % 2], {x % 2 for x in range(4)}, {x: x * 2 for x in [1, 2]}, [(a, b) for a in [1, 2] for b in "xy"], sum(x for x in range(4)))', ["[1, 9] {0, 1} {1: 2, 2: 4} [(1, 'x'), (1, 'y'), (2, 'x'), (2, 'y')] 6"]);
  check('range, enumerate, zip, map, filter, any, all', 'print(list(range(3)), list(range(1, 7, 2)), list(range(3, 0, -1)), list(enumerate("ab", 1)), list(zip([1, 2], "xy")), list(map(abs, [-1, 2])), list(filter(None, [0, 1])), any([0, 1]), all([0, 1]))', ["[0, 1, 2] [1, 3, 5] [3, 2, 1] [(1, 'a'), (2, 'b')] [(1, 'x'), (2, 'y')] [1, 2] [1] True False"]);
  check('slices', 'a = list(range(6))\nprint(a[1:4], a[::2], a[-2:], a[::-1], a[4:1:-1])\na[1:3] = [9]\nprint(a)\ndel a[0]\nprint(a)', ['[1, 2, 3] [0, 2, 4] [4, 5] [5, 4, 3, 2, 1, 0] [4, 3, 2]', '[0, 9, 3, 4, 5]', '[9, 3, 4, 5]']);
});

describe('Python: control flow and functions', () => {
  check('if, elif, else, while, for-else, break, continue', `for i in range(5):
    if i == 1:
        continue
    elif i == 3:
        break
    else:
        print(i)
else:
    print("never")
n = 0
while n < 2:
    n += 1
else:
    print("done", n)`, ['0', '2', 'done 2']);
  check('default, keyword, *args and **kwargs', `def f(a, b=2, *rest, key=None, **extra):
    return (a, b, rest, key, sorted(extra))
print(f(1), f(1, 3, 4, 5, key="k", z=1, y=2), f(b=9, a=8))
g = lambda x, y=1: x + y
print(g(1), g(1, 2), (lambda: 7)())
print(f(*[1, 2], **{"key": 3}))`, [
    "(1, 2, (), None, []) (1, 3, (4, 5), 'k', ['y', 'z']) (8, 9, (), None, [])",
    '2 3 7',
    '(1, 2, (), 3, [])',
  ]);
  check('closures, global and nonlocal', `count = 0
def bump():
    global count
    count += 1
def counter():
    n = 0
    def up():
        nonlocal n
        n += 1
        return n
    return up
bump(); bump()
c = counter(); c(); print(count, c())`, ['2 2']);
  check('recursion', 'def fact(n):\n    return 1 if n < 2 else n * fact(n - 1)\nprint(fact(10))', ['3628800']);
  check('decorators', `def twice(f):
    def inner(x):
        return f(f(x))
    return inner
@twice
def add1(x):
    return x + 1
print(add1(1))`, ['3']);
  check('classes, inheritance, super, dunders, properties', `class Shape:
    sides = 0
    def __init__(self, name):
        self.name = name
    def describe(self):
        return f"{self.name} has {self.sides}"
    def __str__(self):
        return "Shape:" + self.name
    def __eq__(self, other):
        return self.name == other.name
class Square(Shape):
    sides = 4
    def __init__(self, name, size):
        super().__init__(name)
        self.size = size
    @property
    def area(self):
        return self.size ** 2
    @staticmethod
    def unit():
        return Square("unit", 1)
    def __add__(self, other):
        return Square(self.name, self.size + other.size)
    def __len__(self):
        return self.sides
s = Square("sq", 3)
print(s, s.describe(), s.area, len(s), (s + s).size, Square.unit().area, s == Square("sq", 9), isinstance(s, Shape), isinstance(s, Square), hasattr(s, "x"), getattr(s, "x", 5))
print(type(s).__name__, Square.sides)`, ['Shape:sq sq has 4 9 4 6 1 True True True False 5', 'Square 4']);
  check('exceptions', `try:
    1 / 0
except ZeroDivisionError as e:
    print("caught", e)
try:
    [][1]
except (KeyError, IndexError) as e:
    print(type(e).__name__)
else:
    print("no")
finally:
    print("finally")
class MyError(ValueError):
    pass
try:
    raise MyError("custom")
except ValueError as e:
    print(e, isinstance(e, MyError))
try:
    try:
        raise KeyError("k")
    except KeyError:
        raise
except KeyError as e:
    print("again", e)`, ['caught division by zero', 'IndexError', 'finally', 'custom True', "again k"]);
  check('with', `class Ctx:
    def __enter__(self):
        print("in")
        return 5
    def __exit__(self, a, b, c):
        print("out")
with Ctx() as x:
    print(x)`, ['in', '5', 'out']);
  check('math and random', `import math, random
print(math.pi > 3, math.sqrt(16), math.floor(2.5), math.ceil(2.1), round(math.sin(0)), math.radians(180) == math.pi)
random.seed(1); a = random.random(); random.seed(1); print(a == random.random(), 0 <= a < 1, random.randint(1, 1), random.choice([7]))
from math import cos as c
print(c(0))`, ['True 4.0 2 3 0 True', 'True True 1 7', '1.0']);
  check('comments, blank lines, line continuation, semicolons', `# a comment
x = (1 +
     2)   # continues in brackets

y = 3 + \\
    4; z = 5
print(x, y, z)`, ['3 7 5']);
  check('triple-quoted strings', 'print("""a\nb""", r"\\n", "\\t|")', ['a\nb \\n \t|']);
});

describe('Python: errors say what and where', () => {
  fails('a missing name', 'x = 1\nprint(y)', /line 2: NameError: name 'y' is not defined/);
  fails('wrong types', '1 + "a"', /TypeError: unsupported operand/);
  fails('syntax', 'def f(:\n  pass', /SyntaxError/);
  fails('indentation', 'if True:\n    x = 1\n  y = 2', /SyntaxError.*indentation/);
  fails('a missing module, naming what there is', 'import numpy', /ModuleNotFoundError: No module named 'numpy'.*bpy/);
  fails('recursion is stopped', 'def f():\n    return f()\nf()', /RecursionError/);
  fails('an endless loop is stopped', 'while True:\n    pass', /TimeoutError/);
  fails('files are not available', 'open("x")', /not available/);
  fails('a missing attribute', '(1).nothing', /AttributeError/);
  fails('a wrong operator call says why', 'import bpy\nbpy.ops.object.mode_set(mode="EDIT")\nbpy.ops.object.delete()', /cannot run/);
  fails('generators are said to be missing', 'def g():\n    yield 1', /SyntaxError/);
});

describe('Python: bpy', () => {
  const ctxRun = (code) => {
    const ctx = context();
    const r = runPython(ctx, code);
    assert.ok(r.ok, r.error);
    return { ctx, output: r.output };
  };
  test('keyword arguments reach the operator; tuples become plain arrays', () => {
    const { ctx } = ctxRun('import bpy\nbpy.ops.mesh.primitive_cube_add(size=0.5, location=(1, 2, 3))');
    const o = activeObject(ctx.doc);
    assert.deepEqual(o.location, [1, 2, 3]);
    assert.ok(Array.isArray(o.location) && o.location.constructor === Array, 'not a tuple in the document');
    assert.equal(o.data.verts.length, 8);
  });
  test('operators return their result as a set', () => {
    const { output } = ctxRun("import bpy\nprint(bpy.ops.mesh.primitive_cube_add())\nbpy.ops.object.select_all(action='DESELECT')\nprint('FINISHED' in bpy.ops.object.select_all(action='SELECT'))");
    assert.deepEqual(output, ["{'FINISHED'}", 'True']);
  });
  test('objects by index, by name, by iteration; fields read and write through', () => {
    const { ctx, output } = ctxRun(`import bpy
cube = bpy.data.objects["Cube"]
cube.location[2] = 5
cube.location.x = 1
cube.scale = (2, 2, 2)
cube.name = "Box"
print(bpy.data.objects[0].name, len(bpy.data.objects), [o.type for o in bpy.data.objects], "Light" in bpy.data.objects, bpy.data.objects.get("Nope"))
print(cube.location.z, cube.location[0], cube.scale.y)
print(bpy.context.active_object.name, bpy.context.mode, bpy.context.scene.frame_end)`);
    const o = ctx.doc.objects[0];
    assert.deepEqual(o.location, [1, 0, 5]);
    assert.deepEqual(o.scale, [2, 2, 2]);
    assert.equal(o.name, 'Box');
    assert.deepEqual(output, ["Box 3 ['MESH', 'LIGHT', 'CAMERA'] True None", '5 1 2', 'Box OBJECT 250']);
  });
  test('the scene: frame_set moves animation', () => {
    const { ctx } = ctxRun(`import bpy
o = bpy.context.active_object
bpy.context.scene.frame_set(1)
bpy.ops.anim.keyframe_insert_path(path="location.0")
bpy.context.scene.frame_set(11)
o.location[0] = 10
bpy.ops.anim.keyframe_insert_path(path="location.0")
bpy.context.scene.frame_set(6)
print(o.location[0])`);
    assert.ok(activeObject(ctx.doc).location[0] > 0 && activeObject(ctx.doc).location[0] < 10);
  });
  test('Vector does sums, and goes on an object', () => {
    const { ctx, output } = ctxRun(`import bpy
from mathutils import Vector
a = Vector((1, 0, 0))
b = Vector((0, 2, 0))
c = a + b * 2
print(list(c), a.dot(b), list(a.cross(b)), Vector((3, 4, 0)).length, list(Vector((0, 0, 9)).normalized()))
bpy.context.active_object.location = c`);
    assert.deepEqual(activeObject(ctx.doc).location, [1, 4, 0]);
    assert.deepEqual(output, ['[1, 4, 0] 0 [0, 0, 2] 5.0 [0, 0, 1]']);
  });
  test('one script is one undo step', () => {
    const ctx = context();
    const before = ctx.doc.objects.length;
    assert.ok(runPython(ctx, 'import bpy\nfor i in range(3):\n    bpy.ops.mesh.primitive_cube_add(location=(i, 0, 0))').ok);
    assert.equal(ctx.doc.objects.length, before + 3);
    ctx.undo();
    assert.equal(ctx.doc.objects.length, before + 2);
  });
  test('a console keeps its names, and shows an expression as the prompt does', () => {
    const ctx = context();
    const c = createPythonConsole(ctx);
    assert.deepEqual(c.run('x = 21').output, []);
    assert.deepEqual(c.run('x * 2').output, ['42']);
    assert.deepEqual(c.run('"text"').output, ["'text'"]);
    assert.deepEqual(c.run('None').output, []);
    assert.equal(c.run('nothing').ok, false);
    assert.deepEqual(c.run('len(bpy.data.objects)').output, ['3']);
    c.run('bpy.ops.mesh.primitive_torus_add()');
    assert.equal(ctx.doc.objects.length, 4);
  });
  test('classes become operators, with properties', () => {
    const ctx = context();
    const module = loadPythonAddon(ctx, `bl_info = {"name": "Test", "version": (1, 2), "category": "Object"}
import bpy
class OBJECT_OT_lift(bpy.types.Operator):
    bl_idname = "object.test_lift"
    bl_label = "Lift"
    height: bpy.props.FloatProperty(name="Height", default=2.0, min=0.0)
    def execute(self, context):
        context.active_object.location[2] += self.height
        return {'FINISHED'}
def register():
    bpy.utils.register_class(OBJECT_OT_lift)
def unregister():
    bpy.utils.unregister_class(OBJECT_OT_lift)
`);
    assert.equal(module.info.name, 'Test');
    module.register();
    const op = getOp('object.test_lift');
    assert.equal(op.en, 'Lift');
    assert.equal(op.props[0].name, 'height');
    assert.equal(op.props[0].def, 2);
    assert.equal(op.props[0].type, 'number');
    run(ctx, 'object.test_lift');
    assert.equal(activeObject(ctx.doc).location[2], 2);
    run(ctx, 'object.test_lift', { height: 3 });
    assert.equal(activeObject(ctx.doc).location[2], 5);
    module.unregister();
    assert.equal(getOp('object.test_lift'), undefined);
    unregister('object.test_lift');
  });
});
