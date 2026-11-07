# Runs inside Blender (background mode), driven by scripts/verify-blender.mjs.
#   blender -b --factory-startup --python verify-blender.py -- read  <folder>   reads our exports and reports what it finds
#   blender -b --factory-startup --python verify-blender.py -- write <folder>   writes a known scene in Blender's own formats
import json
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

args = sys.argv[sys.argv.index('--') + 1:]
mode, folder = args[0], args[1]


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def describe():
    out = []
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        world = [ob.matrix_world @ v.co for v in ob.data.vertices]
        low = [min(p[i] for p in world) for i in range(3)]
        high = [max(p[i] for p in world) for i in range(3)]
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.transform(ob.matrix_world)
        bm.verts.ensure_lookup_table()
        volume = bm.calc_volume(signed=True)
        bm.free()
        out.append({
            'name': ob.name, 'verts': len(ob.data.vertices), 'faces': len(ob.data.polygons),
            'tris': sum(len(p.vertices) - 2 for p in ob.data.polygons),
            'uvs': len(ob.data.uv_layers) > 0, 'low': low, 'high': high, 'volume': volume,
        })
    return sorted(out, key=lambda o: o['name'])


READERS = {
    'obj': lambda p: bpy.ops.wm.obj_import(filepath=p, forward_axis='Y', up_axis='Z'),
    'stl': lambda p: bpy.ops.wm.stl_import(filepath=p, forward_axis='Y', up_axis='Z'),
    'ply': lambda p: bpy.ops.wm.ply_import(filepath=p, forward_axis='Y', up_axis='Z'),
    'glb': lambda p: bpy.ops.import_scene.gltf(filepath=p),
    'fbx': lambda p: bpy.ops.import_scene.fbx(filepath=p),
    'dae': lambda p: bpy.ops.wm.collada_import(filepath=p),
    'usda': lambda p: bpy.ops.wm.usd_import(filepath=p),
    'abc': lambda p: bpy.ops.wm.alembic_import(filepath=p, as_background_job=False),
}

if mode == 'read':
    report = {}
    for name in sorted(os.listdir(folder)):
        ext = name.rsplit('.', 1)[-1].lower()
        if ext not in READERS:
            continue
        clear()
        try:
            READERS[ext](os.path.join(folder, name))
            report[name] = {'objects': describe()}
        except Exception as error:
            report[name] = {'error': str(error)}
    with open(os.path.join(folder, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1)

if mode == 'write':
    clear()
    bpy.ops.mesh.primitive_cube_add(size=2, location=(1, 2, 3))
    bpy.context.object.name = 'BoxA'
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=8, major_radius=2, minor_radius=0.5, location=(-4, 0, 1), rotation=(0.5, 0, 0))
    bpy.context.object.name = 'RingB'
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1.5, location=(0, -5, 0))
    bpy.context.object.name = 'BallC'
    bpy.context.object.scale = (1, 2, 1)
    bpy.ops.object.select_all(action='SELECT')
    with open(os.path.join(folder, 'expected.json'), 'w', encoding='utf-8') as f:
        json.dump(describe(), f, indent=1)
    p = lambda n: os.path.join(folder, n)
    bpy.ops.wm.alembic_export(filepath=p('blender.abc'), as_background_job=False, start=1, end=1)
    bpy.ops.export_scene.fbx(filepath=p('blender.fbx'))
    bpy.ops.export_scene.gltf(filepath=p('blender.glb'))
    bpy.ops.wm.collada_export(filepath=p('blender.dae'))
    bpy.ops.wm.usd_export(filepath=p('blender.usda'))
    bpy.ops.wm.obj_export(filepath=p('blender.obj'), forward_axis='Y', up_axis='Z')
    bpy.ops.wm.save_as_mainfile(filepath=p('blender.blend'), compress=False)
    bpy.ops.wm.save_as_mainfile(filepath=p('blender-zstd.blend'), compress=True)

    # Animated: a transform and a deforming mesh, for the reader's sample handling.
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 5
    box = bpy.data.objects['BoxA']
    box.keyframe_insert('location', frame=1)
    box.location = (1, 2, 7)
    box.keyframe_insert('location', frame=5)
    bpy.ops.wm.alembic_export(filepath=p('blender-anim.abc'), as_background_job=False, start=1, end=5)
