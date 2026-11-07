// Add-ons: scripts that add operators, in Python or JavaScript. They run with the same rights as any script in this program, so
// an add-on is installed only by the user's own choice. A record: { id, name, language, source, enabled, builtin, info }.
import { getOp, register, unregister } from './ops.js';
import { loadPythonAddon } from './python.js';
import { createApi } from './script.js';

export const BUILTIN_ADDONS = [
  {
    id: 'add_mesh_gear', name: 'Add Gear', builtin: true, language: 'python',
    source: `bl_info = {
    "name": "Add Gear",
    "author": "SHKWON",
    "version": (1, 0),
    "category": "Add Mesh",
    "description": "Adds a gear with teeth you can set",
}

import bpy
import math


class ADD_OT_gear(bpy.types.Operator):
    bl_idname = "mesh.gear_add"
    bl_label = "Gear"

    teeth: bpy.props.IntProperty(name="Teeth", default=12, min=3, max=128)
    radius: bpy.props.FloatProperty(name="Radius", default=1.0, min=0.01)
    depth: bpy.props.FloatProperty(name="Tooth Depth", default=0.2, min=0.0)
    width: bpy.props.FloatProperty(name="Width", default=0.4, min=0.0)

    def execute(self, context):
        verts = []
        faces = []
        count = self.teeth * 4
        for side in (0, 1):
            z = (side - 0.5) * self.width
            for i in range(count):
                a = 2 * math.pi * i / count
                r = self.radius + (self.depth if i % 4 in (1, 2) else 0)
                verts.append((r * math.cos(a), r * math.sin(a), z))
        for i in range(count):
            j = (i + 1) % count
            faces.append((i, j, j + count, i + count))
        faces.append(tuple(range(count - 1, -1, -1)))
        faces.append(tuple(range(count, count * 2)))
        bpy.ops.object.mesh_from_data(name="Gear", verts=verts, faces=faces)
        return {'FINISHED'}


def register():
    bpy.utils.register_class(ADD_OT_gear)


def unregister():
    bpy.utils.unregister_class(ADD_OT_gear)
`,
  },
  {
    id: 'object_scatter', name: 'Scatter Copies', builtin: true, language: 'python',
    source: `bl_info = {
    "name": "Scatter Copies",
    "author": "SHKWON",
    "version": (1, 0),
    "category": "Object",
    "description": "Copies the active object to random places on the ground",
}

import bpy
import random


class OBJECT_OT_scatter(bpy.types.Operator):
    bl_idname = "object.scatter_copies"
    bl_label = "Scatter Copies"

    count: bpy.props.IntProperty(name="Count", default=10, min=1, max=1000)
    area: bpy.props.FloatProperty(name="Area", default=10.0, min=0.0)
    seed: bpy.props.IntProperty(name="Seed", default=1)

    def execute(self, context):
        source = context.active_object
        if source is None:
            return {'CANCELLED'}
        random.seed(self.seed)
        home = list(source.location)
        for i in range(self.count):
            bpy.ops.object.duplicate(linked=True)
            copy = context.active_object
            copy.location = (random.uniform(-self.area, self.area), random.uniform(-self.area, self.area), home[2])
            copy.rotation = (0, 0, random.uniform(0, 360))
        return {'FINISHED'}


def register():
    bpy.utils.register_class(OBJECT_OT_scatter)


def unregister():
    bpy.utils.unregister_class(OBJECT_OT_scatter)
`,
  },
  {
    id: 'mesh_stats', name: 'Mesh Statistics', builtin: true, language: 'javascript',
    source: `const bl_info = { name: 'Mesh Statistics', author: 'SHKWON', version: [1, 0], category: 'Mesh', description: 'Prints the size of each selected mesh to the Info log' };
function register(bpy, addOperator) {
  addOperator({
    id: 'mesh.statistics_print', en: 'Print Mesh Statistics', ko: '메시 통계 출력',
    exec: () => {
      for (const o of bpy.context.selected_objects) {
        if (o.type === 'MESH') bpy.print(o.name + ': ' + o.data.verts.length + ' vertices, ' + o.data.faces.length + ' faces');
      }
    },
  });
}
return { bl_info, register };
`,
  },
];

const loaded = new Map();

/** Reads an add-on's description without keeping it. */
export function addonInfo(ctx, addon) {
  try {
    if (addon.language === 'python') return loadPythonAddon(ctx, addon.source).info ?? {};
    return new Function(addon.source)()?.bl_info ?? {}; // eslint-disable-line no-new-func
  } catch (error) {
    return { error: error.message };
  }
}

/** Turns an add-on on. Returns the operators it added. Throws with a readable message when its code fails. */
export function enableAddon(ctx, addon, print = () => {}) {
  if (loaded.has(addon.id)) disableAddon(addon.id);
  if (addon.language === 'python') {
    const module = loadPythonAddon(ctx, addon.source, print);
    module.register();
    const ops = [...module.registered()];
    loaded.set(addon.id, { unregister: module.unregister, ops });
    return ops;
  }
  const module = new Function(addon.source)(); // eslint-disable-line no-new-func
  const ops = [];
  const add = (op) => { if (getOp(op.id)) unregister(op.id); register({ addon: true, ...op }); ops.push(op.id); };
  module.register?.(createApi(ctx, print), add);
  loaded.set(addon.id, { unregister: () => module.unregister?.(), ops });
  return ops;
}

export function disableAddon(id) {
  const entry = loaded.get(id);
  if (!entry) return;
  loaded.delete(id);
  try { entry.unregister(); } finally { for (const op of entry.ops) if (getOp(op)) unregister(op); }
}

export const isEnabled = (id) => loaded.has(id);
export const addonOperators = () => [...loaded.values()].flatMap((e) => e.ops).filter(getOp);

/** A file's text as an add-on record. */
export function addonFromFile(name, text) {
  const language = /\.py$/i.test(name) ? 'python' : /\.m?js$/i.test(name) ? 'javascript' : null;
  if (!language) throw new Error('An add-on is a .py or .js file');
  return { id: `user_${name.replace(/\W+/g, '_').toLowerCase()}`, name: name.replace(/\.[^.]+$/, ''), language, source: text, builtin: false };
}
