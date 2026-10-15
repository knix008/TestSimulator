# Makes a FreeCAD document with features MyCAD has no parametric twin for —
# a PartDesign body (Pad, Pocket, Fillet) and a Part::Fillet — saves it and
# reports each top object's volume (run by FreeCADCmd).
#   MYCAD_FC_JOB = job.json: { "out": "doc.FCStd", "report": "volumes.json" }
import json
import os

import FreeCAD as App
import Part
import Sketcher

job = json.load(open(os.environ['MYCAD_FC_JOB'], encoding='utf-8'))
doc = App.newDocument('PartDesignSample')

# PartDesign: a 60 × 40 pad 15 high, a pocket 20 × 10 × 5 in its top, its vertical edges filleted.
body = doc.addObject('PartDesign::Body', 'Body')
sketch = body.newObject('Sketcher::SketchObject', 'BaseSketch')
# (No attachment: the sketch lies on x–y, placed directly.)
pts = [App.Vector(0, 0, 0), App.Vector(60, 0, 0), App.Vector(60, 40, 0), App.Vector(0, 40, 0)]
for i in range(4):
    sketch.addGeometry(Part.LineSegment(pts[i], pts[(i + 1) % 4]), False)
doc.recompute()
pad = body.newObject('PartDesign::Pad', 'Pad')
pad.Profile = sketch
pad.Length = 15
doc.recompute()
pocket_sketch = body.newObject('Sketcher::SketchObject', 'PocketSketch')
pocket_sketch.Placement = App.Placement(App.Vector(0, 0, 15), App.Rotation())
doc.recompute()
q = [App.Vector(20, 15, 0), App.Vector(40, 15, 0), App.Vector(40, 25, 0), App.Vector(20, 25, 0)]
for i in range(4):
    pocket_sketch.addGeometry(Part.LineSegment(q[i], q[(i + 1) % 4]), False)
doc.recompute()
pocket = body.newObject('PartDesign::Pocket', 'Pocket')
pocket.Profile = pocket_sketch
pocket.Length = 5
doc.recompute()
vertical = [f'Edge{i + 1}' for i, e in enumerate(pocket.Shape.Edges) if abs(e.Vertexes[0].Point.z - e.Vertexes[-1].Point.z) > 1 and abs(e.Vertexes[0].Point.x - e.Vertexes[-1].Point.x) < 1e-6 and (e.Vertexes[0].Point.x in (0, 60))]
fillet = body.newObject('PartDesign::Fillet', 'Fillet')
fillet.Base = (pocket, vertical)
fillet.Radius = 4
doc.recompute()

# Part workbench: a cylinder with its top rim filleted (Part::Fillet).
cyl = doc.addObject('Part::Cylinder', 'Cyl')
cyl.Radius = 10
cyl.Height = 25
cyl.Placement.Base = App.Vector(100, 0, 0)
doc.recompute()
rim = doc.addObject('Part::Fillet', 'RoundCyl')
rim.Base = cyl
top = [i + 1 for i, e in enumerate(cyl.Shape.Edges) if hasattr(e.Curve, 'Radius') and abs(e.Vertexes[0].Point.z - 25) < 1e-6]
rim.Edges = [(top[0], 3.0, 3.0)]
doc.recompute()

doc.saveAs(job['out'])
report = {o.Label: o.Shape.Volume for o in (body, rim) if o.isValid()}
json.dump(report, open(job['report'], 'w', encoding='utf-8'))
