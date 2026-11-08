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
    'usdz': lambda p: bpy.ops.wm.usd_import(filepath=p),
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
    bpy.ops.wm.usd_export(filepath=p('blender.usdc'))
    bpy.ops.wm.usd_export(filepath=p('blender.usdz'))
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
    bpy.ops.wm.usd_export(filepath=p('blender-anim.usdc'), export_animation=True)


def evaluated_extent():
    """The extent in the world of all meshes as they are drawn at this moment, skin and all."""
    low, high = [1e18] * 3, [-1e18] * 3
    depsgraph = bpy.context.evaluated_depsgraph_get()
    # What shows only: the glTF importer also makes a hidden mesh of its own, to draw bones with.
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or not ob.visible_get():
            continue
        evaluated = ob.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        for v in mesh.vertices:
            p = evaluated.matrix_world @ v.co
            for i in range(3):
                low[i], high[i] = min(low[i], p[i]), max(high[i], p[i])
        evaluated.to_mesh_clear()
    return {'low': low, 'high': high}


def action_start():
    frames = []
    for action in bpy.data.actions:
        frames.append(action.frame_range[0])
    return min(frames) if frames else 1


if mode == 'rig-write':
    # A column bent by two bones, the top one keyed, with a texture: written by Blender for our reader.
    clear()
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.2, depth=2, location=(0, 0, 1))
    column = bpy.context.object
    column.name = 'Column'
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.subdivide(number_cuts=7)
    bpy.ops.object.mode_set(mode='OBJECT')
    image = bpy.data.images.new('Checker', 8, 8)
    image.pixels = [0.2, 0.6, 0.9, 1.0] * 64
    image.filepath_raw = os.path.join(folder, 'checker.png')
    image.file_format = 'PNG'
    image.save()
    material = bpy.data.materials.new('Painted')
    material.use_nodes = True
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    material.node_tree.links.new(node.outputs['Color'], material.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    column.data.materials.append(material)
    bpy.ops.object.armature_add(location=(0, 0, 0))
    rig = bpy.context.object
    rig.name = 'Rig'
    bpy.ops.object.mode_set(mode='EDIT')
    root = rig.data.edit_bones[0]
    root.name = 'Lower'
    root.head, root.tail = (0, 0, 0), (0, 0, 1)
    top = rig.data.edit_bones.new('Upper')
    top.head, top.tail = (0, 0, 1), (0, 0, 2)
    top.parent = root
    bpy.ops.object.mode_set(mode='OBJECT')
    lower = column.vertex_groups.new(name='Lower')
    upper = column.vertex_groups.new(name='Upper')
    for v in column.data.vertices:
        z = (column.matrix_world @ v.co)[2]
        (upper if z > 1 else lower).add([v.index], 1.0, 'REPLACE')
    column.modifiers.new('Armature', 'ARMATURE').object = rig
    bone = rig.pose.bones['Upper']
    bone.rotation_mode = 'XYZ'
    bone.rotation_euler = (0, 0, 0)
    bone.keyframe_insert('rotation_euler', frame=1)
    bone.rotation_euler = (1.2, 0, 0)
    bone.keyframe_insert('rotation_euler', frame=11)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 11
    report = {}
    for f in (1, 6, 11):
        bpy.context.scene.frame_set(f)
        report[str(f)] = evaluated_extent()
    bpy.context.scene.frame_set(1)
    with open(os.path.join(folder, 'rig-expected.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f)
    bpy.ops.export_scene.gltf(filepath=os.path.join(folder, 'rig.glb'))
    bpy.ops.export_scene.fbx(filepath=os.path.join(folder, 'rig.fbx'), bake_anim=True, add_leaf_bones=False)
    bpy.ops.export_scene.fbx(filepath=os.path.join(folder, 'rig-leaf.fbx'), bake_anim=True, add_leaf_bones=True, axis_forward='-Z', axis_up='Y')
    bpy.ops.wm.collada_export(filepath=os.path.join(folder, 'rig.dae'))
    bpy.ops.wm.usd_export(filepath=os.path.join(folder, 'rig.usda'), export_animation=True)
    bpy.ops.wm.usd_export(filepath=os.path.join(folder, 'rig.usdc'), export_animation=True)
    image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, 'rig.blend'), compress=False)

if mode == 'bones-write':
    # Bones with rolls and constraints, and the wire shapes Skin and Remesh start from.
    clear()
    bpy.ops.object.empty_add(location=(3, 0, 2))
    driver = bpy.context.object
    driver.name = 'Driver'
    driver.rotation_euler = (0, 0, 0)
    driver.keyframe_insert('rotation_euler', frame=1)
    driver.rotation_euler = (0.9, 0.3, 0)
    driver.keyframe_insert('rotation_euler', frame=11)
    bpy.ops.object.empty_add(location=(-2, 1, 4))
    aim = bpy.context.object
    aim.name = 'Aim'
    bpy.ops.object.armature_add(location=(1, 0, 0))
    rig = bpy.context.object
    rig.name = 'Rig'
    bpy.ops.object.mode_set(mode='EDIT')
    edit = rig.data.edit_bones
    root = edit[0]
    root.name = 'Root'
    root.head, root.tail = (0, 0, 0), (0, 0, 1)
    root.roll = 0.4
    def add(name, head, tail, parent, roll):
        b = edit.new(name)
        b.head, b.tail = head, tail
        b.parent = parent
        b.roll = roll
        return b
    a = add('Copy', (0, 0, 1), (0, 0, 2), root, 0.7)
    b = add('Limited', (0, 0, 2), (0.5, 0, 3), a, -0.5)
    c = add('Tracker', (0, 0, 3), (0, 1, 3), b, 1.1)
    d = add('Stretch', (1, 0, 0), (1, 0, 1), None, 0)
    e = add('Sideways', (2, 0, 0), (3, 0, 0), None, 0.2)
    f = add('Loc', (-1, 0, 0), (-1, 0, 1), None, 0)
    g = add('Mapped', (-3, 0, 0), (-3, 0, 1), None, 0.3)
    h = add('Turned', (-5, 0, 0), (-5, 0, 1), None, 0.6)
    i = add('Follower', (-7, 0, 0), (-7, 0, 1), None, 0.2)
    j = add('Spine1', (0, 5, 0), (0, 5, 1), None, 0)
    k = add('Spine2', (0, 5, 1), (0, 5, 2), j, 0)
    k.use_connect = True
    l = add('Spine3', (0, 5, 2), (0, 5, 3), k, 0)
    l.use_connect = True
    add('Acted', (-9, 0, 0), (-9, 0, 1), None, 0.3)
    add('Acted2', (-11, 0, 0), (-11, 0, 1), None, 0)
    add('Acted3', (-13, 0, 0), (-13, 0, 1), None, 0.5)
    bpy.ops.object.mode_set(mode='POSE')
    bones = rig.pose.bones
    for name in ('Root', 'Copy', 'Limited', 'Tracker', 'Stretch', 'Sideways', 'Loc', 'Mapped', 'Turned', 'Follower', 'Spine1', 'Spine2', 'Spine3', 'Acted', 'Acted2', 'Acted3'):
        bones[name].rotation_mode = 'XYZ'
    bones['Root'].rotation_euler = (0.3, 0.2, 0.1)
    bones['Root'].keyframe_insert('rotation_euler', frame=1)
    bones['Root'].rotation_euler = (0.1, -0.4, 0.5)
    bones['Root'].keyframe_insert('rotation_euler', frame=11)
    con = bones['Copy'].constraints.new('COPY_ROTATION'); con.target = driver
    bones['Limited'].rotation_euler = (1.2, 0.2, -1.0)
    con = bones['Limited'].constraints.new('LIMIT_ROTATION'); con.owner_space = 'LOCAL'; con.use_limit_x = True; con.min_x = -0.3; con.max_x = 0.3; con.use_limit_z = True; con.min_z = -0.2; con.max_z = 0.2
    con = bones['Tracker'].constraints.new('DAMPED_TRACK'); con.target = aim; con.track_axis = 'TRACK_Y'
    con = bones['Stretch'].constraints.new('STRETCH_TO'); con.target = aim
    con = bones['Sideways'].constraints.new('COPY_LOCATION'); con.target = rig; con.subtarget = 'Tracker'; con.influence = 0.5
    bones['Loc'].location = (5, 0, 0)
    con = bones['Loc'].constraints.new('LIMIT_LOCATION'); con.owner_space = 'LOCAL'; con.use_max_x = True; con.max_x = 1
    con = bones['Mapped'].constraints.new('TRANSFORM'); con.target = driver; con.target_space = 'WORLD'; con.owner_space = 'LOCAL'; con.map_from = 'LOCATION'; con.from_min_x = 0; con.from_max_x = 6; con.map_to = 'LOCATION'; con.to_min_x = 0; con.to_max_x = 2; con.map_to_x_from = 'X'; con.mix_mode = 'ADD'
    con = bones['Turned'].constraints.new('TRANSFORM'); con.target = driver; con.target_space = 'WORLD'; con.owner_space = 'LOCAL'; con.map_from = 'ROTATION'; con.from_min_x_rot = 0; con.from_max_x_rot = 1.0; con.map_to = 'ROTATION'; con.to_min_x_rot = 0; con.to_max_x_rot = 0.8; con.map_to_x_from = 'X'; con.mix_mode_rot = 'ADD'
    con = bones['Follower'].constraints.new('ARMATURE'); t = con.targets.new(); t.target = rig; t.subtarget = 'Root'; t.weight = 1
    bpy.ops.object.mode_set(mode='OBJECT')
    # A path for the spine, and a curve drawn with thickness.
    curve = bpy.data.curves.new('Path', 'CURVE')
    curve.dimensions = '3D'
    spline = curve.splines.new('POLY')
    spline.points.add(2)
    for point, co in zip(spline.points, [(0, 5, 0), (0, 7, 2), (3, 7, 3)]):
        point.co = (*co, 1)
    path = bpy.data.objects.new('Path', curve)
    bpy.context.scene.collection.objects.link(path)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    con = rig.pose.bones['Spine3'].constraints.new('SPLINE_IK'); con.target = path; con.chain_count = 3; con.use_curve_radius = False; con.y_scale_mode = 'FIT_CURVE'; con.xz_scale_mode = 'NONE'
    bpy.ops.object.mode_set(mode='OBJECT')
    # An action kept only in the library, keyed on a puppet with the same bone names, read through Action constraints.
    bpy.ops.object.armature_add(location=(0, -30, 0))
    puppet = bpy.context.object
    puppet.name = 'Puppet'
    bpy.ops.object.mode_set(mode='EDIT')
    pe = puppet.data.edit_bones
    pe[0].name = 'Acted'
    for extra in ('Acted2', 'Acted3'):
        pb = pe.new(extra); pb.head, pb.tail = (1, 0, 0), (1, 0, 1)
    bpy.ops.object.mode_set(mode='POSE')
    for name in ('Acted', 'Acted2', 'Acted3'):
        pbone = puppet.pose.bones[name]
        pbone.rotation_mode = 'XYZ'
        pbone.rotation_euler = (0, 0, 0); pbone.location = (0, 0, 0)
        pbone.keyframe_insert('rotation_euler', frame=1); pbone.keyframe_insert('location', frame=1)
        pbone.rotation_euler = (0.8, 0, 0.4); pbone.location = (0, 0.5, 0)
        pbone.keyframe_insert('rotation_euler', frame=10); pbone.keyframe_insert('location', frame=10)
    bpy.ops.object.mode_set(mode='OBJECT')
    swing = puppet.animation_data.action
    swing.name = 'Swing'
    swing.use_fake_user = True
    slot = getattr(puppet.animation_data, 'action_slot', None)
    puppet.animation_data_clear()
    bpy.data.objects.remove(puppet, do_unlink=True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    for name, mix in (('Acted', 'BEFORE_FULL'), ('Acted2', 'AFTER_FULL'), ('Acted3', 'BEFORE_SPLIT')):
        pbone = rig.pose.bones[name]
        pbone.rotation_euler = (0.2, 0.3, 0); pbone.location = (0, 0, 0.3)
        con = pbone.constraints.new('ACTION'); con.target = driver; con.transform_channel = 'ROTATION_X'; con.target_space = 'WORLD'; con.min = 0; con.max = 45; con.frame_start = 1; con.frame_end = 10; con.mix_mode = mix; con.action = swing
        if slot is not None and hasattr(con, 'action_slot'):
            con.action_slot = slot
    bpy.ops.object.mode_set(mode='OBJECT')
    tube_data = bpy.data.curves.new('Tube', 'CURVE')
    tube_data.dimensions = '3D'
    tube_data.bevel_depth = 0.25
    tube_spline = tube_data.splines.new('BEZIER')
    tube_spline.bezier_points.add(1)
    for point, co in zip(tube_spline.bezier_points, [(0, 0, 0), (0, 0, 4)]):
        point.co = co
        point.handle_left = (co[0], co[1], co[2] - 1)
        point.handle_right = (co[0], co[1], co[2] + 1)
    tube = bpy.data.objects.new('Tube', tube_data)
    tube.location = (25, 0, 0)
    bpy.context.scene.collection.objects.link(tube)
    # A dome: open, so that it can be flattened without seams, and Blender's own angle-based result to measure against.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=(0, 20, 0))
    dome = bpy.context.object
    dome.name = 'Dome'
    bm = bmesh.new()
    bm.from_mesh(dome.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context='VERTS')
    bm.to_mesh(dome.data)
    bm.free()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')
    def corner_angle(a, b, c):
        return (a - b).angle(c - b, 0.0)
    uv = dome.data.uv_layers.active.data
    total, count = 0.0, 0
    for poly in dome.data.polygons:
        ids = list(poly.loop_indices)
        n = len(ids)
        for k in range(n):
            p, q, r = ids[k - 1], ids[k], ids[(k + 1) % n]
            co = lambda l: dome.data.vertices[dome.data.loops[l].vertex_index].co
            total += abs(corner_angle(co(p), co(q), co(r)) - corner_angle(uv[p].uv.to_3d(), uv[q].uv.to_3d(), uv[r].uv.to_3d()))
            count += 1
    abf_error = total / count
    bpy.context.view_layer.objects.active = rig
    # Skin: a chain, and a cross with arms to its tips; remesh in three modes.
    def wire(name, verts, edges, location):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, edges, [])
        mesh.update()
        ob = bpy.data.objects.new(name, mesh)
        ob.location = location
        bpy.context.scene.collection.objects.link(ob)
        return ob
    chain = wire('Chain', [(0, 0, 0), (0, 0, 2), (0, 0, 4)], [(0, 1), (1, 2)], (10, 0, 0))
    chain.modifiers.new('m', 'SKIN')
    for v in chain.data.skin_vertices[0].data: v.radius = (0.3, 0.3)
    bent = wire('Bent', [(0, 0, 0), (2, 0, 0), (2, 3, 0)], [(0, 1), (1, 2)], (15, 0, 0))
    bent.modifiers.new('m', 'SKIN')
    cross = wire('Cross', [(0, 0, 0), (2, 0, 0), (-2, 0, 0), (0, 2, 0)], [(0, 1), (0, 2), (0, 3)], (20, 0, 0))
    cross.modifiers.new('m', 'SKIN')
    def blocky(name, kind, location):
        bpy.ops.mesh.primitive_cube_add(size=2, location=location)
        ob = bpy.context.object
        ob.name = name
        m = ob.modifiers.new('m', 'REMESH')
        m.mode = kind
        m.octree_depth = 3
        m.scale = 0.9
        m.use_remove_disconnected = False
        m.use_smooth_shade = False
        return ob
    blocky('Blocks', 'BLOCKS', (0, 10, 0))
    blocky('Smooth', 'SMOOTH', (5, 10, 0))
    blocky('Sharp', 'SHARP', (10, 10, 0))
    def facts(frame):
        bpy.context.scene.frame_set(frame)
        graph = bpy.context.evaluated_depsgraph_get()
        report = {'bones': {}, 'meshes': {}}
        world = rig.matrix_world
        for bone in rig.pose.bones:
            report['bones'][bone.name] = {'head': list(world @ bone.head), 'tail': list(world @ bone.tail)}
        for ob in bpy.data.objects:
            if ob.type not in ('MESH', 'CURVE') or ob.name == 'Path':
                continue
            evaluated = ob.evaluated_get(graph)
            mesh = evaluated.to_mesh()
            points = [ob.matrix_world @ v.co for v in mesh.vertices]
            report['meshes'][ob.name] = {'verts': len(mesh.vertices), 'faces': len(mesh.polygons), 'quads': sum(1 for p in mesh.polygons if p.loop_total == 4), 'low': [min(p[k] for p in points) for k in range(3)], 'high': [max(p[k] for p in points) for k in range(3)]}
            evaluated.to_mesh_clear()
        return report
    out = {str(f): facts(f) for f in (1, 6, 11)}
    out['abf'] = abf_error
    bpy.context.scene.frame_set(1)
    with open(os.path.join(folder, 'bones-expected.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, 'bones.blend'), compress=False)

if mode == 'mods-write':
    # One object per modifier kind, with what Blender's evaluation makes of each, and a light, a camera and a constraint.
    clear()
    report = {}
    def box(name, location):
        bpy.ops.mesh.primitive_cube_add(size=2, location=location)
        ob = bpy.context.object
        ob.name = name
        return ob
    box('Target', (0, 0, -8))
    sub = box('Sub', (0, 0, 0)); sub.modifiers.new('m', 'SUBSURF').levels = 2
    mirror = box('Mirror', (5, 0, 0))
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.transform.translate(value=(2, 0, 0)); bpy.ops.object.mode_set(mode='OBJECT')
    mirror.modifiers.new('m', 'MIRROR').use_axis = (True, False, False)
    arr = box('Arr', (10, 0, 0)); m = arr.modifiers.new('m', 'ARRAY'); m.count = 3; m.relative_offset_displace = (1.5, 0, 0)
    arr2 = box('ArrConst', (10, 6, 0)); m = arr2.modifiers.new('m', 'ARRAY'); m.count = 2; m.use_relative_offset = False; m.use_constant_offset = True; m.constant_offset_displace = (0, 0, 3)
    solid = box('Solid', (20, 0, 0)); m = solid.modifiers.new('m', 'SOLIDIFY'); m.thickness = 0.2
    bevel = box('Bev', (25, 0, 0)); m = bevel.modifiers.new('m', 'BEVEL'); m.width = 0.1; m.segments = 2; m.limit_method = 'NONE'
    tri = box('Tri', (30, 0, 0)); tri.modifiers.new('m', 'TRIANGULATE')
    wire = box('Wire', (35, 0, 0)); m = wire.modifiers.new('m', 'WIREFRAME'); m.thickness = 0.1
    boolean = box('Boo', (40, 0, 0)); cutter = box('Cutter', (41, 0, 0)); m = boolean.modifiers.new('m', 'BOOLEAN'); m.object = cutter; m.operation = 'DIFFERENCE'; cutter.hide_render = True
    bpy.ops.object.light_add(type='SPOT', location=(1, 2, 3)); light = bpy.context.object; light.name = 'Lamp'; light.data.energy = 250; light.data.spot_size = 0.7; light.data.color = (1, 0.5, 0.25)
    bpy.ops.object.camera_add(location=(4, 5, 6), rotation=(1, 0, 0.5)); camera = bpy.context.object; camera.name = 'Cam'; camera.data.lens = 35; camera.data.clip_end = 500
    bpy.ops.object.empty_add(location=(0, 9, 0)); follower = bpy.context.object; follower.name = 'Follower'
    con = follower.constraints.new('COPY_LOCATION'); con.target = sub; con.influence = 0.5
    # A parent with an inverse, and an object keyed with a quaternion.
    bpy.ops.object.empty_add(location=(0, 12, 0)); dad = bpy.context.object; dad.name = 'Dad'; dad.rotation_euler = (0, 0, 1)
    kid = box('Kid', (3, 12, 0)); kid.parent = dad; kid.matrix_parent_inverse = dad.matrix_world.inverted()
    spin = box('Spin', (0, 18, 0)); spin.rotation_mode = 'QUATERNION'; spin.rotation_quaternion = (1, 0, 0, 0); spin.keyframe_insert('rotation_quaternion', frame=1); spin.rotation_quaternion = (0.7071, 0, 0, 0.7071); spin.keyframe_insert('rotation_quaternion', frame=11)
    keyed = box('Keyed', (0, 24, 0)); keyed.keyframe_insert('location', frame=1); keyed.location = (5, 24, 0); keyed.keyframe_insert('location', frame=11)
    shaped = box('Shaped', (0, 30, 0)); shaped.shape_key_add(name='Basis'); wide = shaped.shape_key_add(name='Wide')
    for point in wide.data: point.co.x *= 2
    wide.value = 0.5
    smooth = box('Round', (0, 36, 0)); bpy.ops.object.shade_smooth()
    material = bpy.data.materials.new('Red'); material.use_nodes = True; shader = material.node_tree.nodes['Principled BSDF']; shader.inputs['Base Color'].default_value = (0.8, 0.1, 0.05, 1); shader.inputs['Roughness'].default_value = 0.3; shader.inputs['Metallic'].default_value = 0.6
    smooth.data.materials.append(material)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    def facts(frame):
        bpy.context.scene.frame_set(frame)
        graph = bpy.context.evaluated_depsgraph_get()
        out = {}
        for ob in bpy.data.objects:
            evaluated = ob.evaluated_get(graph)
            world = evaluated.matrix_world
            entry = {'at': list(world.translation)}
            if ob.type == 'MESH':
                mesh = evaluated.to_mesh()
                points = [world @ v.co for v in mesh.vertices]
                entry.update(verts=len(mesh.vertices), faces=len(mesh.polygons), area=sum(p.area for p in mesh.polygons), low=[min(p[k] for p in points) for k in range(3)], high=[max(p[k] for p in points) for k in range(3)])
                evaluated.to_mesh_clear()
            out[ob.name] = entry
        return out
    report = {'1': facts(1), '6': facts(6), '11': facts(11)}
    bpy.context.scene.frame_set(1)
    with open(os.path.join(folder, 'mods-expected.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, 'mods.blend'), compress=True)

if mode == 'rig-read':
    # Our rigged file, read by Blender and asked where it all is, frame by frame.
    clear()
    source = args[2]
    if source.endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=os.path.join(folder, source))
    elif source.endswith('.dae'):
        bpy.ops.wm.collada_import(filepath=os.path.join(folder, source))
    elif '.usd' in source:
        bpy.ops.wm.usd_import(filepath=os.path.join(folder, source))
    else:
        bpy.ops.import_scene.gltf(filepath=os.path.join(folder, source))
    start = action_start()
    report = {
        'bones': sum(len(a.data.bones) for a in bpy.data.objects if a.type == 'ARMATURE'),
        'actions': len(bpy.data.actions),
        'images': len([i for i in bpy.data.images if i.size[0] > 0]),
        'objects': sorted(o.name for o in bpy.data.objects),
        'lights': sum(1 for o in bpy.data.objects if o.type == 'LIGHT'),
        'cameras': sum(1 for o in bpy.data.objects if o.type == 'CAMERA'),
        'extents': {},
    }
    for offset in (0, 5, 10):
        bpy.context.scene.frame_set(int(start + offset))
        report['extents'][str(offset)] = evaluated_extent()
    with open(os.path.join(folder, source + '.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f)

if mode == 'cons-write':
    # Object constraints Blender evaluates frame by frame: shrinkwrap three ways, transformation, an armature, and an animated Alembic for a transform cache.
    clear()
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 11
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=2, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = 'Ground'

    def empty(name, location):
        ob = bpy.data.objects.new(name, None)
        ob.location = location
        scene.collection.objects.link(ob)
        return ob
    drv = empty('Drv', (0, 0, 0))
    drv.keyframe_insert('location', frame=1)
    drv.location = (2, 0, 0)
    drv.keyframe_insert('location', frame=11)
    for kind, name, location, extra in (('NEAREST_SURFACE', 'Wrap', (3, 1, 4), 0.5), ('PROJECT', 'Proj', (0.5, 0.3, 6), 0), ('NEAREST_VERTEX', 'Vert', (1, 2, 3), 0)):
        ob = empty(name, location)
        c = ob.constraints.new('SHRINKWRAP')
        c.target = ground
        c.shrinkwrap_type = kind
        c.distance = extra
        if kind == 'PROJECT':
            c.project_axis = 'NEG_Z'
    mapped = empty('Mapped', (0, 5, 0))
    c = mapped.constraints.new('TRANSFORM')
    c.target = drv
    c.from_max_x = 2
    c.to_max_x = 3
    turned = empty('Turned', (0, 8, 0))
    c = turned.constraints.new('TRANSFORM')
    c.target = drv
    c.from_max_x = 2
    c.map_to = 'ROTATION'
    c.to_max_x_rot = 1.5707963
    bpy.ops.object.armature_add(location=(0, -5, 0))
    rig = bpy.context.object
    rig.name = 'Rig2'
    rig.data.bones[0].name = 'Arm'
    bone = rig.pose.bones['Arm']
    bone.rotation_mode = 'XYZ'
    bone.keyframe_insert('rotation_euler', frame=1)
    bone.rotation_euler = (1.5707963, 0, 0)
    bone.keyframe_insert('rotation_euler', frame=11)
    rider = empty('Rider', (0, -5, 1.5))
    c = rider.constraints.new('ARMATURE')
    t = c.targets.new()
    t.target = rig
    t.subtarget = 'Arm'
    flyer = empty('Flyer', (1, 2, 3))
    flyer.keyframe_insert('location', frame=1)
    flyer.keyframe_insert('rotation_euler', frame=1)
    flyer.location = (4, -1, 5)
    flyer.rotation_euler = (0.4, 0.2, 1.1)
    flyer.keyframe_insert('location', frame=11)
    flyer.keyframe_insert('rotation_euler', frame=11)
    names = ('Wrap', 'Proj', 'Vert', 'Mapped', 'Turned', 'Rider', 'Flyer')
    out = {}
    for frame in (1, 6, 11):
        scene.frame_set(frame)
        out[str(frame)] = {n: [list(row) for row in bpy.data.objects[n].matrix_world] for n in names}
    scene.frame_set(1)
    with open(os.path.join(folder, 'cons-expected.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f)
    bpy.ops.wm.alembic_export(filepath=os.path.join(folder, 'cons.abc'), as_background_job=False, start=1, end=11)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, 'cons.blend'), compress=False)


def scene_facts(frames):
    """Cameras, lights and shape keys, with every object's place, as Blender has them."""
    out = {'objects': {}, 'frames': {}}
    bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    for ob in bpy.data.objects:
        d = ob.data
        fact = {'type': ob.type, 'matrix': [list(row) for row in ob.matrix_world]}
        if ob.type == 'CAMERA':
            fact.update(kind=d.type, lens=d.lens, sensor=d.sensor_width, clipStart=d.clip_start, clipEnd=d.clip_end, orthoScale=d.ortho_scale)
        if ob.type == 'LIGHT':
            fact.update(kind=d.type, energy=d.energy, color=list(d.color), spotSize=getattr(d, 'spot_size', 0), spotBlend=getattr(d, 'spot_blend', 0))
        if ob.type == 'MESH' and d.materials and d.materials[0]:
            m = d.materials[0]
            bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m.use_nodes and m.node_tree else None
            if bsdf:
                base = bsdf.inputs['Base Color']
                fact['material'] = {'name': m.name, 'baseColor': list(base.default_value)[:3], 'metallic': bsdf.inputs['Metallic'].default_value, 'roughness': bsdf.inputs['Roughness'].default_value, 'textured': any(l.from_node.type == 'TEX_IMAGE' for l in base.links)}
        if ob.parent:
            fact['parent'] = ob.parent.name
        if ob.type == 'MESH' and d.shape_keys:
            blocks = d.shape_keys.key_blocks
            fact['keys'] = [{'name': kb.name, 'value': kb.value, 'verts': [list(ob.matrix_world @ p.co) for p in kb.data]} for kb in blocks[1:]]
        out['objects'][ob.name] = fact
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        out['frames'][str(frame)] = {ob.name: [kb.value for kb in ob.data.shape_keys.key_blocks[1:]] for ob in bpy.data.objects if ob.type == 'MESH' and ob.data.shape_keys}
        out.setdefault('at', {})[str(frame)] = {ob.name: [list(row) for row in ob.matrix_world] for ob in bpy.data.objects}
        out.setdefault('extents', {})[str(frame)] = {}
        graph = bpy.context.evaluated_depsgraph_get()
        for ob in bpy.data.objects:
            if ob.type not in ('MESH', 'CURVE', 'CURVES'):
                continue
            ev = ob.evaluated_get(graph)
            if ob.type == 'CURVES':
                from mathutils import Vector
                pts = [ev.matrix_world @ Vector(p.position) for p in ev.data.points]
            else:
                me = ev.to_mesh()
                pts = [ev.matrix_world @ v.co for v in me.vertices] if me else []
                ev.to_mesh_clear()
            if pts:
                out['extents'][str(frame)][ob.name] = {'low': [min(p[k] for p in pts) for k in range(3)], 'high': [max(p[k] for p in pts) for k in range(3)]}
    bpy.context.scene.frame_set(1)
    return out


if mode == 'extras-write':
    # Cameras, lights and a shape key, written as FBX by Blender.
    import math
    clear()
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 11
    cam = bpy.data.cameras.new('CamData')
    cam.lens, cam.sensor_width, cam.clip_start, cam.clip_end = 35, 32, 0.5, 250
    c = bpy.data.objects.new('Cam', cam)
    c.location, c.rotation_euler = (1, 2, 3), (1.0, 0.2, 0.5)
    scene.collection.objects.link(c)
    oc = bpy.data.cameras.new('OrthoData')
    oc.type, oc.ortho_scale = 'ORTHO', 7
    o = bpy.data.objects.new('Ortho', oc)
    o.location, o.rotation_euler = (-2, 0, 1), (0.4, 0, -0.3)
    scene.collection.objects.link(o)
    for kind, name, energy in (('POINT', 'Bulb', 250), ('SUN', 'Sun', 4), ('SPOT', 'Spot', 800)):
        l = bpy.data.lights.new(name + 'Data', kind)
        l.energy, l.color = energy, (1, 0.5, 0.25)
        if kind == 'SPOT':
            l.spot_size, l.spot_blend = math.radians(60), 0.25
        ob = bpy.data.objects.new(name, l)
        ob.location, ob.rotation_euler = (0, -3, 4), (0.3, 0.1, 0.7)
        scene.collection.objects.link(ob)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(4, 0, 0))
    cube = bpy.context.object
    cube.name = 'Morph'
    cube.shape_key_add(name='Basis')
    k = cube.shape_key_add(name='Up')
    for v in k.data:
        if v.co.z > 0:
            v.co.z += 1
    k.value = 0.25
    with open(os.path.join(folder, 'extras-expected.json'), 'w', encoding='utf-8') as f:
        json.dump(scene_facts([]), f)
    bpy.ops.export_scene.fbx(filepath=os.path.join(folder, 'extras.fbx'))
    bpy.ops.wm.collada_export(filepath=os.path.join(folder, 'extras.dae'))

if mode == 'extras-read':
    # Our FBX with cameras, lights and a keyed shape key, read by Blender.
    clear()
    source = args[2]
    if source.endswith('.dae'):
        bpy.ops.wm.collada_import(filepath=os.path.join(folder, source))
    elif '.usd' in source:
        bpy.ops.wm.usd_import(filepath=os.path.join(folder, source))
    elif source.endswith('.abc'):
        bpy.ops.wm.alembic_import(filepath=os.path.join(folder, source), as_background_job=False)
    else:
        bpy.ops.import_scene.fbx(filepath=os.path.join(folder, source))
    with open(os.path.join(folder, source + '.json'), 'w', encoding='utf-8') as f:
        json.dump(scene_facts([1, 6, 11]), f)


if mode == 'usd-write':
    # A keyed, textured box with a child, cameras and lights, written by Blender as USD text, binary and zipped.
    import math
    clear()
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 11
    bpy.ops.mesh.primitive_cube_add(size=2, location=(1, 2, 3))
    box = bpy.context.object
    box.name = 'Box'
    mat = bpy.data.materials.new('Paint')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.8, 0.2, 0.1, 1)
    bsdf.inputs['Metallic'].default_value = 0.3
    bsdf.inputs['Roughness'].default_value = 0.6
    box.data.materials.append(mat)
    image = bpy.data.images.new('Dots', 4, 4)
    image.pixels = [0.2, 0.9, 0.3, 1] * 16
    image.filepath_raw = os.path.join(folder, 'Dots.png')
    image.file_format = 'PNG'
    image.save()
    painted = bpy.data.materials.new('Painted')
    painted.use_nodes = True
    tex = painted.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    painted.node_tree.links.new(tex.outputs['Color'], painted.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    bpy.ops.mesh.primitive_plane_add(size=2, location=(-3, 0, 0))
    floor = bpy.context.object
    floor.name = 'Floor'
    floor.data.materials.append(painted)
    box.keyframe_insert('location', frame=1)
    box.keyframe_insert('rotation_euler', frame=1)
    box.location = (1, 2, 7)
    box.rotation_euler = (0, 0, 1)
    box.keyframe_insert('location', frame=11)
    box.keyframe_insert('rotation_euler', frame=11)
    rider = bpy.data.objects.new('Rider', None)
    rider.parent = box
    rider.location = (0, 0, 2)
    scene.collection.objects.link(rider)
    cam = bpy.data.cameras.new('CamData')
    cam.lens, cam.sensor_width, cam.clip_start, cam.clip_end = 35, 32, 0.5, 250
    c = bpy.data.objects.new('Cam', cam)
    c.location, c.rotation_euler = (1, 2, 3), (1.0, 0.2, 0.5)
    scene.collection.objects.link(c)
    for kind, name, energy in (('POINT', 'Bulb', 250), ('SUN', 'Sun', 4), ('SPOT', 'Spot', 800), ('AREA', 'Panel', 300)):
        l = bpy.data.lights.new(name + 'Data', kind)
        l.energy, l.color = energy, (1, 0.5, 0.25)
        if kind == 'SPOT':
            l.spot_size, l.spot_blend = math.radians(60), 0.25
        if kind == 'AREA':
            l.size = 2
        ob = bpy.data.objects.new(name, l)
        ob.location, ob.rotation_euler = (0, -3, 4), (0.3, 0.1, 0.7)
        scene.collection.objects.link(ob)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(4, 0, 0))
    morph = bpy.context.object
    morph.name = 'Morph'
    morph.shape_key_add(name='Basis')
    up = morph.shape_key_add(name='Up')
    for v in up.data:
        if v.co.z > 0:
            v.co.z += 1
    up.value = 0
    up.keyframe_insert('value', frame=1)
    up.value = 1
    up.keyframe_insert('value', frame=11)
    with open(os.path.join(folder, 'usd-expected.json'), 'w', encoding='utf-8') as f:
        json.dump(scene_facts([1, 6, 11]), f)
    for ext in ('usda', 'usdc', 'usdz'):
        bpy.ops.wm.usd_export(filepath=os.path.join(folder, 'scene.' + ext), export_animation=True)

if mode == 'abc-write':
    # A keyed box with a child, a camera with a child, a mesh whose shape key is keyed, and a Bezier and a NURBS curve: Alembic.
    clear()
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 11
    bpy.ops.mesh.primitive_cube_add(size=2, location=(1, 2, 3))
    box = bpy.context.object
    box.name = 'Box'
    box.keyframe_insert('location', frame=1)
    box.keyframe_insert('rotation_euler', frame=1)
    box.location = (1, 2, 7)
    box.rotation_euler = (0.5, 0, 1)
    box.keyframe_insert('location', frame=11)
    box.keyframe_insert('rotation_euler', frame=11)
    rider = bpy.data.objects.new('Rider', None)
    rider.parent = box
    rider.location = (0, 0, 2)
    scene.collection.objects.link(rider)
    cam = bpy.data.cameras.new('CamData')
    cam.lens, cam.sensor_width, cam.clip_start, cam.clip_end = 35, 32, 0.5, 250
    c = bpy.data.objects.new('Cam', cam)
    c.location, c.rotation_euler = (1, 2, 3), (1.0, 0.2, 0.5)
    scene.collection.objects.link(c)
    on_cam = bpy.data.objects.new('OnCam', None)
    on_cam.parent = c
    on_cam.location = (0, 0, -2)
    scene.collection.objects.link(on_cam)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(4, 0, 0))
    cube = bpy.context.object
    cube.name = 'Morph'
    cube.shape_key_add(name='Basis')
    k = cube.shape_key_add(name='Up')
    for v in k.data:
        if v.co.z > 0:
            v.co.z += 1
    k.value = 0
    k.keyframe_insert('value', frame=1)
    k.value = 1
    k.keyframe_insert('value', frame=11)
    bpy.ops.curve.primitive_bezier_circle_add(radius=1.5, location=(0, 5, 0))
    bpy.context.object.name = 'Ring'
    bpy.ops.curve.primitive_nurbs_path_add(location=(-4, 0, 1))
    bpy.context.object.name = 'Path'
    facts = scene_facts([1, 6, 11])
    with open(os.path.join(folder, 'abc-expected.json'), 'w', encoding='utf-8') as f:
        json.dump(facts, f)
    bpy.ops.wm.alembic_export(filepath=os.path.join(folder, 'scene.abc'), as_background_job=False, start=1, end=11)

if mode == 'svg-read':
    # Blender's own SVG importer on a file: every curve's points, handles, fill and colour, and the area of what it fills.
    clear()
    bpy.ops.import_curve.svg(filepath=os.path.join(folder, args[2]))
    found = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for o in bpy.data.objects:
        cu = o.data
        mat = cu.materials[0] if len(cu.materials) else None
        mesh = o.evaluated_get(depsgraph).to_mesh()
        area = sum(p.area for p in mesh.polygons) if mesh else 0
        o.evaluated_get(depsgraph).to_mesh_clear()
        found.append({
            'name': o.name, 'dimensions': cu.dimensions, 'fill': cu.dimensions == '2D' and cu.fill_mode == 'BOTH',
            'color': list(mat.diffuse_color)[:3] if mat else None, 'area': area,
            'splines': [{'cyclic': s.use_cyclic_u, 'points': [list(p.co) for p in s.bezier_points],
                         'left': [list(p.handle_left) for p in s.bezier_points], 'right': [list(p.handle_right) for p in s.bezier_points]} for s in cu.splines],
        })
    with open(os.path.join(folder, args[2] + '.json'), 'w', encoding='utf-8') as f:
        json.dump(found, f)
