// Python for the script console and macros (FreeCAD's macros are Python):
// CPython as WebAssembly (Pyodide), loaded on first use from the app's own
// files. Scripts get `mycad` (the same API as `cad` in JavaScript) and small
// FreeCAD / Part modules so FreeCAD-style macros run: Part.makeBox(…),
// shape.cut(…), Part.show(…), App.ActiveDocument.addObject('Part::Box', …).

let pyodide = null;
let loading = null;

/** The Python modules made for MyCAD (written into Pyodide's file system). */
export const PYTHON_MODULES = {
  'FreeCAD.py': String.raw`"""FreeCAD-style API on MyCAD (a subset): Vector, Rotation, Placement, documents and Part objects."""
import math
import json
import mycad

Version = lambda: ['1', '1', '0', 'MyCAD']


class Vector:
    def __init__(self, x=0.0, y=0.0, z=0.0):
        if hasattr(x, 'x'):
            x, y, z = x.x, x.y, x.z
        elif isinstance(x, (tuple, list)):
            x, y, z = (list(x) + [0, 0, 0])[:3]
        self.x, self.y, self.z = float(x), float(y), float(z)

    def __add__(self, o): return Vector(self.x + o.x, self.y + o.y, self.z + o.z)
    def __sub__(self, o): return Vector(self.x - o.x, self.y - o.y, self.z - o.z)
    def __mul__(self, k):
        if isinstance(k, Vector):
            return self.x * k.x + self.y * k.y + self.z * k.z
        return Vector(self.x * k, self.y * k, self.z * k)
    __rmul__ = __mul__
    def __neg__(self): return Vector(-self.x, -self.y, -self.z)
    def __eq__(self, o): return isinstance(o, Vector) and abs(self.x - o.x) < 1e-9 and abs(self.y - o.y) < 1e-9 and abs(self.z - o.z) < 1e-9
    def __iter__(self): return iter((self.x, self.y, self.z))
    def __repr__(self): return f'Vector ({self.x}, {self.y}, {self.z})'
    def cross(self, o): return Vector(self.y * o.z - self.z * o.y, self.z * o.x - self.x * o.z, self.x * o.y - self.y * o.x)
    def dot(self, o): return self * o
    @property
    def Length(self): return math.sqrt(self * self)
    def normalize(self):
        n = self.Length or 1.0
        self.x, self.y, self.z = self.x / n, self.y / n, self.z / n
        return self


class Rotation:
    """Yaw–pitch–roll (z, y, x) in degrees, or an axis and an angle."""
    def __init__(self, a=None, b=None, c=None):
        self.yaw, self.pitch, self.roll = 0.0, 0.0, 0.0
        if isinstance(a, Vector) and b is not None:
            # Axis + angle: only rotations about the main axes keep exact angles here.
            ax = Vector(a).normalize()
            if abs(abs(ax.z) - 1) < 1e-9: self.yaw = float(b) * ax.z
            elif abs(abs(ax.y) - 1) < 1e-9: self.pitch = float(b) * ax.y
            elif abs(abs(ax.x) - 1) < 1e-9: self.roll = float(b) * ax.x
            else: raise ValueError('Rotation: only about the x, y or z axis')
        elif a is not None:
            self.yaw, self.pitch, self.roll = float(a), float(b or 0), float(c or 0)

    def toEuler(self): return (self.yaw, self.pitch, self.roll)
    def __repr__(self): return f'Rotation (ypr {self.yaw}, {self.pitch}, {self.roll})'


class Placement:
    def __init__(self, base=None, rotation=None, *rest):
        self.Base = Vector(base) if base is not None else Vector()
        self.Rotation = rotation if isinstance(rotation, Rotation) else Rotation()

    def fields(self):
        y, p, r = self.Rotation.toEuler()
        return {'x': self.Base.x, 'y': self.Base.y, 'z': self.Base.z, 'rx': r, 'ry': p, 'rz': y}

    def __repr__(self): return f'Placement [Pos=({self.Base.x}, {self.Base.y}, {self.Base.z}), Ypr={self.Rotation.toEuler()}]'


class Console:
    @staticmethod
    def PrintMessage(text): print(str(text).rstrip('\n'))
    PrintLog = PrintMessage
    @staticmethod
    def PrintWarning(text): print('Warning:', str(text).rstrip('\n'))
    @staticmethod
    def PrintError(text): print('Error:', str(text).rstrip('\n'))


# Part objects as FreeCAD names them → MyCAD solid kinds and their parameters.
_KINDS = {
    'Part::Box': ('box', {'Length': 'length', 'Width': 'width', 'Height': 'height'}, {'Length': 10, 'Width': 10, 'Height': 10}),
    'Part::Cylinder': ('cylinder', {'Radius': 'radius', 'Height': 'height', 'Angle': 'angle'}, {'Radius': 2, 'Height': 10, 'Angle': 360}),
    'Part::Sphere': ('sphere', {'Radius': 'radius'}, {'Radius': 5}),
    'Part::Cone': ('cone', {'Radius1': 'radius1', 'Radius2': 'radius2', 'Height': 'height'}, {'Radius1': 2, 'Radius2': 4, 'Height': 10}),
    'Part::Torus': ('torus', {'Radius1': 'radius1', 'Radius2': 'radius2'}, {'Radius1': 10, 'Radius2': 2}),
    'Part::Prism': ('prism', {'Polygon': 'sides', 'Circumradius': 'radius', 'Height': 'height'}, {'Polygon': 6, 'Circumradius': 2, 'Height': 10}),
    'Part::Ellipsoid': ('ellipsoid', {'Radius1': 'radius1', 'Radius2': 'radius2', 'Radius3': 'radius3'}, {'Radius1': 2, 'Radius2': 4, 'Radius3': 4}),
}


class DocumentObject:
    """A Part object in the drawing: setting a property changes the solid (one undo step)."""
    def __init__(self, doc, type_id, name, entity_id):
        object.__setattr__(self, '_doc', doc)
        object.__setattr__(self, 'TypeId', type_id)
        object.__setattr__(self, 'Name', name)
        object.__setattr__(self, '_id', entity_id)

    def _entity(self): return json.loads(mycad.json(mycad.get(self._id)))

    def __getattr__(self, key):
        e = self._entity()
        if key == 'Label': return e.get('name', self.Name)
        if key == 'Placement':
            return Placement(Vector(e.get('x', 0), e.get('y', 0), e.get('z', 0)), Rotation(e.get('rz', 0), e.get('ry', 0), e.get('rx', 0)))
        if key == 'Shape': return _shape_of(self._id)
        kind = _KINDS.get(self.TypeId)
        if kind and key in kind[1]: return e['params'][kind[1][key]]
        raise AttributeError(key)

    def __setattr__(self, key, value):
        if key == 'Label': mycad.update(self._id, mycad.obj(json.dumps({'name': str(value)}))); return
        if key == 'Placement': mycad.update(self._id, mycad.obj(json.dumps(value.fields()))); return
        kind = _KINDS.get(self.TypeId)
        if kind and key in kind[1]:
            params = self._entity()['params']
            params[kind[1][key]] = float(value)
            mycad.update(self._id, mycad.obj(json.dumps({'params': params})))
            return
        object.__setattr__(self, key, value)


class Document:
    def __init__(self, name='Unnamed'):
        self.Name = name
        self._objects = []

    def addObject(self, type_id, name=None):
        if type_id not in _KINDS and type_id != 'Part::Feature':
            raise ValueError(f'{type_id}: not supported in MyCAD (Part primitives and Part::Feature)')
        name = name or type_id.split('::')[1]
        if type_id == 'Part::Feature':
            obj = _Feature(self, name)
        else:
            kind, keys, defaults = _KINDS[type_id]
            params = {keys[k]: v for k, v in defaults.items()}
            entity_id = mycad.solid(kind, mycad.obj(json.dumps(params)), mycad.obj(json.dumps({'name': name})))
            obj = DocumentObject(self, type_id, name, entity_id)
        self._objects.append(obj)
        return obj

    def getObject(self, name):
        return next((o for o in self._objects if o.Name == name), None)

    @property
    def Objects(self): return list(self._objects)

    def recompute(self): return len(self._objects)


class _Feature:
    """Part::Feature: shows a Part shape (set .Shape)."""
    def __init__(self, doc, name):
        self.Name, self.TypeId, self._id, self.Label = name, 'Part::Feature', None, name

    def __setattr__(self, key, value):
        if key == 'Shape' and value is not None:
            if self.__dict__.get('_id'): mycad.remove(self._id)
            object.__setattr__(self, '_id', value._show(self.__dict__.get('Label', 'Shape')))
            return
        object.__setattr__(self, key, value)


ActiveDocument = Document('Unnamed')


def newDocument(name='Unnamed'):
    global ActiveDocument
    ActiveDocument = Document(name)
    return ActiveDocument


def activeDocument(): return ActiveDocument


def _shape_of(entity_id):
    import Part
    return Part.Shape._of(entity_id)
`,
  'Part.py': String.raw`"""FreeCAD's Part module on MyCAD (a subset): primitives, booleans, placement, volume, show."""
import json
import mycad
from FreeCAD import Vector, Placement


def _place(pnt, dir=None):
    out = {}
    if pnt is not None:
        p = Vector(pnt)
        out.update({'x': p.x, 'y': p.y, 'z': p.z})
    if dir is not None:
        d = Vector(dir).normalize()
        # Point the solid's z axis along dir: turn about y, then about z.
        import math
        out['ry'] = math.degrees(math.acos(max(-1.0, min(1.0, d.z))))
        out['rz'] = math.degrees(math.atan2(d.y, d.x)) if abs(d.x) + abs(d.y) > 1e-12 else 0.0
    return out


class Shape:
    """A solid not yet in the drawing (a MyCAD solid description), or one that is."""
    def __init__(self, spec):
        self._spec = spec

    @classmethod
    def _of(cls, entity_id):
        return cls(json.loads(mycad.json(mycad.get(entity_id))))

    def _bool(self, op, others):
        others = others if isinstance(others, (list, tuple)) else [others]
        return Shape({'type': 'solid', 'kind': 'boolean', 'params': {}, 'shape': {'op': op, 'parts': [self._spec] + [o._spec for o in others]}})

    def cut(self, other): return self._bool('cut', other)
    def fuse(self, other): return self._bool('union', other)
    def common(self, other): return self._bool('common', other)

    def translate(self, v):
        v = Vector(v)
        s = dict(self._spec)
        s['x'], s['y'], s['z'] = s.get('x', 0) + v.x, s.get('y', 0) + v.y, s.get('z', 0) + v.z
        self._spec = s
        return self

    @property
    def Placement(self): return Placement(Vector(self._spec.get('x', 0), self._spec.get('y', 0), self._spec.get('z', 0)))

    @Placement.setter
    def Placement(self, value): self._spec = {**self._spec, **value.fields()}

    def _props(self): return json.loads(mycad.json(mycad.properties(mycad.obj(json.dumps(self._spec)))))

    @property
    def Volume(self): return self._props()['volume']

    @property
    def Area(self): return self._props()['area']

    @property
    def BoundBox(self):
        p = self._props()
        return type('BoundBox', (), {'XLength': p.get('sizeX', 0), 'YLength': p.get('sizeY', 0), 'ZLength': p.get('sizeZ', 0)})()

    def isValid(self): return self.Volume > 0

    def _show(self, name='Shape'):
        spec = {**self._spec, 'name': name}
        return mycad.add('solid', mycad.obj(json.dumps({k: v for k, v in spec.items() if k != 'type'})))

    def __repr__(self): return f'<Solid {self._spec.get("kind")}>'


def _make(kind, params, pnt=None, dir=None):
    return Shape({'type': 'solid', 'kind': kind, 'params': params, **_place(pnt, dir)})


def makeBox(length, width, height, pnt=None, dir=None): return _make('box', {'length': length, 'width': width, 'height': height}, pnt, dir)
def makeCylinder(radius, height, pnt=None, dir=None, angle=360): return _make('cylinder', {'radius': radius, 'height': height, 'angle': angle}, pnt, dir)
def makeSphere(radius, pnt=None, dir=None): return _make('sphere', {'radius': radius}, pnt, dir)
def makeCone(radius1, radius2, height, pnt=None, dir=None): return _make('cone', {'radius1': radius1, 'radius2': radius2, 'height': height}, pnt, dir)
def makeTorus(radius1, radius2, pnt=None, dir=None): return _make('torus', {'radius1': radius1, 'radius2': radius2}, pnt, dir)


def show(shape, name='Shape'):
    """Puts the shape in the drawing (as FreeCAD's Part.show)."""
    return shape._show(name)
`,
};

/** Loads Python (once). indexURL: where pyodide.asm.wasm, python_stdlib.zip … are served. */
export function loadPython(indexURL) {
  loading ??= import('pyodide').then(({ loadPyodide }) => loadPyodide({ indexURL })).then((py) => {
    for (const [file, text] of Object.entries(PYTHON_MODULES)) py.FS.writeFile(`/home/pyodide/${file}`, text);
    py.runPython("import sys\nif '/home/pyodide' not in sys.path: sys.path.insert(0, '/home/pyodide')");
    pyodide = py;
    return py;
  });
  return loading;
}

export const pythonReady = () => Boolean(pyodide);

/** The Python that runs a macro under sys.settrace and keeps every line it executes (Std_MacroStartDebug). */
const TRACER = `
import sys, json
__mycad_trace = []
def __mycad_tracer(frame, event, arg):
    if frame.f_code.co_filename != '<macro>':
        return __mycad_tracer
    if event in ('line', 'return', 'exception') and len(__mycad_trace) < __mycad_limit:
        depth = 0
        f = frame
        while f is not None and f.f_code.co_filename == '<macro>':
            depth += 1
            f = f.f_back
        local = {}
        for k, v in list(frame.f_locals.items()):
            if k.startswith('__') or type(v).__name__ in ('module', 'function', 'type', 'builtin_function_or_method'):
                continue
            try:
                local[k] = repr(v)[:160]
            except Exception:
                local[k] = '?'
        __mycad_trace.append([event, frame.f_lineno, depth, frame.f_code.co_name, local])
    return __mycad_tracer
__mycad_error = None
sys.settrace(__mycad_tracer)
try:
    exec(compile(__mycad_source, '<macro>', 'exec'), {'__name__': '__main__'})
except Exception:
    import traceback
    __mycad_error = traceback.format_exc()
finally:
    sys.settrace(None)
json.dumps({'trace': __mycad_trace, 'error': __mycad_error})
`;

/**
 * Runs a macro and records each line it executes with its local variables:
 * [{ event, line, depth, fn, locals }] plus the error, if any. The debugger
 * steps through this record (breakpoints, step into / over).
 */
export async function tracePython(code, api, out, { limit = 20000 } = {}) {
  const py = pyodide;
  if (!py) throw new Error('Python is not loaded');
  py.registerJsModule('mycad', { ...api, json: (value) => JSON.stringify(value ?? null), obj: (text) => JSON.parse(text), properties: (spec) => api.properties(spec) });
  py.setStdout({ batched: (text) => out('out', text) });
  py.setStderr({ batched: (text) => out('error', text) });
  py.runPython("import sys\nfor m in ('FreeCAD', 'Part', 'mycad'):\n    sys.modules.pop(m, None)");
  py.globals.set('__mycad_source', code);
  py.globals.set('__mycad_limit', limit);
  const result = JSON.parse(py.runPython(TRACER));
  return { error: result.error, steps: result.trace.map(([event, line, depth, fn, locals]) => ({ event, line, depth, fn, locals })) };
}

/** The next step to stop at: into (any), over (no deeper), out of breakpoints (continue). */
export function nextStep(steps, at, how, breakpoints = new Set()) {
  const here = steps[at];
  for (let i = at + 1; i < steps.length; i++) {
    const step = steps[i];
    if (how === 'into') return i;
    if (how === 'over' && step.depth <= (here?.depth ?? 1)) return i;
    if (how === 'continue' && step.event === 'line' && breakpoints.has(step.line)) return i;
  }
  return -1;
}

/**
 * Runs Python with `mycad` (the script API) importable; print goes to `out`.
 * Returns the value of a last expression (as text), like the interactive prompt.
 */
export async function runPython(code, api, out) {
  const py = pyodide;
  if (!py) throw new Error('Python is not loaded');
  // The API as a module; JSON helpers carry Python dicts across.
  py.registerJsModule('mycad', {
    ...api,
    json: (value) => JSON.stringify(value ?? null),
    obj: (text) => JSON.parse(text),
    properties: (spec) => api.properties(spec),
  });
  py.setStdout({ batched: (text) => out('out', text) });
  py.setStderr({ batched: (text) => out('error', text) });
  // Fresh FreeCAD / Part modules each run (a macro starts from a clean document).
  py.runPython("import sys\nfor m in ('FreeCAD', 'Part', 'mycad'):\n    sys.modules.pop(m, None)");
  const value = await py.runPythonAsync(code);
  if (value === undefined || value === null) return undefined;
  const text = typeof value?.toString === 'function' ? value.toString() : String(value);
  value?.destroy?.();
  return text;
}
