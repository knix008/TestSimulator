// Scripting: a `bpy`-shaped API for JavaScript. Scripts call the same operators as the menus:
//
//   bpy.ops.mesh.primitive_cube_add({ size: 2 })
//   bpy.context.active_object.location[2] = 3
//   bpy.data.objects.forEach((o) => print(o.name))
//
// There is no Python interpreter: the language is JavaScript, the names follow the conventions a Blender scripter knows.
import { activeObject, selectedObjects, setFrame } from './doc.js';
import { allOps, run, touch } from './ops.js';

export function createApi(ctx, print = () => {}) {
  const ops = {};
  for (const op of allOps()) {
    const [group, name] = op.id.split('.');
    (ops[group] ??= {})[name] = (props = {}) => run(ctx, op.id, props);
  }
  const data = {
    get objects() { return ctx.doc.objects; },
    get materials() { return ctx.doc.materials; },
    get collections() { return ctx.doc.collections; },
    get images() { return ctx.doc.images; },
    get texts() { return ctx.doc.texts; },
  };
  const scene = {
    get frame_current() { return ctx.doc.frame; },
    set frame_current(value) { setFrame(ctx.doc, value); },
    get frame_start() { return ctx.doc.frameStart; },
    set frame_start(value) { ctx.doc.frameStart = value; },
    get frame_end() { return ctx.doc.frameEnd; },
    set frame_end(value) { ctx.doc.frameEnd = value; },
    get render() { return ctx.doc.render; },
    get world() { return ctx.doc.world; },
    get cursor() { return ctx.doc.cursor; },
  };
  const context = {
    get active_object() { return activeObject(ctx.doc); },
    get selected_objects() { return selectedObjects(ctx.doc); },
    get mode() { return ctx.doc.mode; },
    scene,
  };
  return { ops, data, context, print };
}

/** Runs a script. Returns { ok, value, output, error }; a failing script leaves an error, not a crash. */
export function runScript(ctx, code) {
  const output = [];
  const print = (...values) => output.push(values.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' '));
  const bpy = createApi(ctx, print);
  try {
    // eslint-disable-next-line no-new-func
    const value = new Function('bpy', 'print', 'console', code)(bpy, print, { log: print, error: print, warn: print });
    touch(ctx);
    ctx.history?.push(ctx.doc, 'Run Script');
    return { ok: true, value, output };
  } catch (error) {
    return { ok: false, error: `${error.name}: ${error.message}`, output };
  }
}

/** One console line: shows the value of an expression, or runs a statement. */
export function runConsoleLine(ctx, line, scope = {}) {
  const output = [];
  const print = (...values) => output.push(values.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' '));
  const bpy = createApi(ctx, print);
  const keys = Object.keys(scope);
  const call = (body) => new Function('bpy', 'print', 'scope', ...keys, body)(bpy, print, scope, ...keys.map((k) => scope[k])); // eslint-disable-line no-new-func
  try {
    let value;
    try {
      value = call(`return (${line});`);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      value = call(line);
    }
    touch(ctx);
    if (value !== undefined) {
      let shown;
      try { shown = typeof value === 'object' ? JSON.stringify(value, (k, v) => (k === 'data' ? '[data]' : v)) : String(value); } catch { shown = String(value); }
      output.push(shown);
    }
    return { ok: true, output };
  } catch (error) {
    return { ok: false, error: `${error.name}: ${error.message}`, output };
  }
}
