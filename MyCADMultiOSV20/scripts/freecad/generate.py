# Makes sample files with FreeCAD itself (run by FreeCADCmd), in the formats
# FreeCAD writes, so MyCAD's importers are tested against real FreeCAD output.
#   FreeCADCmd generate.py <job.json>     job.json: { "dir": output folder, "out": result.json }
# Writes: freecad-assembly.FCStd (primitives, booleans, extrusion and
# revolution of sketches, a mesh), freecad-bracket.step/.iges/.brep and the
# bracket as STL/OBJ/PLY/OFF/AMF/3MF/VRML/DAE, and reports the volumes FreeCAD computed.
import json
import math
import os
import sys

import FreeCAD as App
import Part
import Sketcher
import Mesh
import MeshPart

V = App.Vector
App.ParamGet('User parameter:BaseApp/Preferences/Document').SetInt('CountBackupFiles', 0)
App.ParamGet('User parameter:BaseApp/Preferences/Document').SetBool('CreateBackupFiles', False)
job = json.load(open(os.environ['MYCAD_FC_JOB'], encoding='utf-8'))
out = job['dir']
os.makedirs(out, exist_ok=True)
report = {}

doc = App.newDocument('FreeCADAssembly')
# A base plate with a pocket and four holes (booleans of primitives).
plate = doc.addObject('Part::Box', 'Plate'); plate.Length = 80; plate.Width = 50; plate.Height = 8
pocket = doc.addObject('Part::Box', 'Pocket'); pocket.Length = 40; pocket.Width = 20; pocket.Height = 5
pocket.Placement = App.Placement(V(20, 15, 4), App.Rotation())
cut1 = doc.addObject('Part::Cut', 'PlateWithPocket'); cut1.Base = plate; cut1.Tool = pocket
holes = []
for i, (x, y) in enumerate([(8, 8), (72, 8), (72, 42), (8, 42)]):
    h = doc.addObject('Part::Cylinder', 'Hole%d' % (i + 1)); h.Radius = 3; h.Height = 20
    h.Placement = App.Placement(V(x, y, -5), App.Rotation())
    holes.append(h)
fuse_holes = doc.addObject('Part::MultiFuse', 'Holes'); fuse_holes.Shapes = holes
base = doc.addObject('Part::Cut', 'BasePlate'); base.Base = cut1; base.Tool = fuse_holes
# A boss: cylinder fused with a cone, rotated.
boss = doc.addObject('Part::Cylinder', 'Boss'); boss.Radius = 6; boss.Height = 15
boss.Placement = App.Placement(V(110, 25, 0), App.Rotation())
cone = doc.addObject('Part::Cone', 'Tip'); cone.Radius1 = 6; cone.Radius2 = 2; cone.Height = 8
cone.Placement = App.Placement(V(110, 25, 15), App.Rotation())
fuse = doc.addObject('Part::Fuse', 'BossWithTip'); fuse.Base = boss; fuse.Tool = cone
# Other primitives, some rotated.
sphere = doc.addObject('Part::Sphere', 'Ball'); sphere.Radius = 7
sphere.Placement = App.Placement(V(-20, 25, 7), App.Rotation())
torus = doc.addObject('Part::Torus', 'Ring'); torus.Radius1 = 12; torus.Radius2 = 3
torus.Placement = App.Placement(V(40, 90, 3), App.Rotation(V(1, 0, 0), 30))
prism = doc.addObject('Part::Prism', 'HexBar'); prism.Polygon = 6; prism.Circumradius = 6; prism.Height = 25
prism.Placement = App.Placement(V(-20, 70, 0), App.Rotation(V(0, 1, 0), 90))
common = doc.addObject('Part::Common', 'Lens')
s1 = doc.addObject('Part::Sphere', 'LensA'); s1.Radius = 10; s1.Placement = App.Placement(V(100, 80, 0), App.Rotation())
s2 = doc.addObject('Part::Sphere', 'LensB'); s2.Radius = 10; s2.Placement = App.Placement(V(110, 80, 0), App.Rotation())
common.Base = s1; common.Tool = s2
# An extruded sketch (L profile with a hole) and a revolved sketch (pulley).
sk = doc.addObject('Sketcher::SketchObject', 'ProfileL')
pts = [V(0, 0, 0), V(30, 0, 0), V(30, 8, 0), V(8, 8, 0), V(8, 30, 0), V(0, 30, 0)]
for i in range(len(pts)):
    sk.addGeometry(Part.LineSegment(pts[i], pts[(i + 1) % len(pts)]))
sk.addGeometry(Part.Circle(V(4, 20, 0), V(0, 0, 1), 2))
sk.Placement = App.Placement(V(0, -60, 0), App.Rotation())
ext = doc.addObject('Part::Extrusion', 'AngleBracket'); ext.Base = sk; ext.DirMode = 'Normal'; ext.LengthFwd = 40; ext.Solid = True
pr = doc.addObject('Sketcher::SketchObject', 'PulleyProfile')
prof = [V(4, 0, 0), V(20, 0, 0), V(20, 3, 0), V(16, 6, 0), V(20, 9, 0), V(20, 12, 0), V(4, 12, 0)]
for i in range(len(prof)):
    pr.addGeometry(Part.LineSegment(prof[i], prof[(i + 1) % len(prof)]))
pr.Placement = App.Placement(V(60, -60, 0), App.Rotation(V(1, 0, 0), 90))
rev = doc.addObject('Part::Revolution', 'Pulley'); rev.Source = pr; rev.Axis = V(0, 0, 1); rev.Base = V(60, -60, 0); rev.Angle = 360; rev.Solid = True
# A mesh object.
m = Mesh.createBox(10, 10, 10)
m.translate(-40, -40, 5)
mf = doc.addObject('Mesh::Feature', 'MeshCube'); mf.Mesh = m
doc.recompute()
volumes = {}
for o in doc.Objects:
    if o.InList:
        continue
    if o.TypeId == 'Mesh::Feature':
        volumes[o.Name] = o.Mesh.Volume
    elif hasattr(o, 'Shape') and o.Shape.Solids:
        volumes[o.Name] = o.Shape.Volume
fc_path = os.path.join(out, 'freecad-assembly.FCStd')
if os.path.exists(fc_path):
    os.remove(fc_path)
doc.saveAs(fc_path)
report['freecad-assembly.FCStd'] = {'volume': sum(volumes.values()), 'objects': volumes}

# A bracket as B-rep and mesh exchange files.
Part.export([base], os.path.join(out, 'freecad-bracket.step'))
Part.export([base], os.path.join(out, 'freecad-bracket.iges'))
base.Shape.exportBrep(os.path.join(out, 'freecad-bracket.brep'))
report['freecad-bracket.step'] = {'volume': base.Shape.Volume}
mesh = MeshPart.meshFromShape(Shape=base.Shape, LinearDeflection=0.05, AngularDeflection=math.radians(10), Relative=False)
for ext_name in ('stl', 'obj', 'ply', 'off', 'amf', '3mf', 'wrl'):
    path = os.path.join(out, 'freecad-bracket.%s' % ext_name)
    try:
        mesh.write(path)
        if os.path.getsize(path) == 0:
            raise RuntimeError('empty file')
        report['freecad-bracket.%s' % ext_name] = {'volume': mesh.Volume}
    except Exception as error:  # FreeCAD's own writer failed: leave no broken sample behind
        if os.path.exists(path):
            os.remove(path)
        report['freecad-bracket.%s' % ext_name] = {'error': str(error)}
# COLLADA through the BIM workbench exporter (pycollada).
dae_path = os.path.join(out, 'freecad-bracket.dae')
try:
    from importers import importDAE
    feature = doc.addObject('Mesh::Feature', 'BracketMesh')
    feature.Mesh = mesh
    importDAE.export([feature], dae_path)
    report['freecad-bracket.dae'] = {'volume': mesh.Volume}
except Exception as error:
    if os.path.exists(dae_path):
        os.remove(dae_path)
    report['freecad-bracket.dae'] = {'error': str(error)}
# The pulley (curved faces) as STEP too.
Part.export([rev], os.path.join(out, 'freecad-pulley.step'))
report['freecad-pulley.step'] = {'volume': rev.Shape.Volume}
tops = [o for o in doc.Objects if not o.InList and hasattr(o, 'Shape') and o.Shape.Solids and o.TypeId != 'Mesh::Feature']
Part.export(tops, os.path.join(out, 'freecad-assembly.step'))
report['freecad-assembly.step'] = {'volume': sum(o.Shape.Volume for o in tops)}
Part.export([fuse], os.path.join(out, 'freecad-boss.step'))
report['freecad-boss.step'] = {'volume': fuse.Shape.Volume}
json.dump(report, open(job['out'], 'w', encoding='utf-8'), indent=1)
json.dump(report, open(os.path.join(out, 'freecad-volumes.json'), 'w', encoding='utf-8'), indent=1)
