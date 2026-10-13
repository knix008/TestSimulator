# Run by scripts/freecad-samples.mjs inside FreeCADCmd: FreeCAD draws a 2D
# plate (rounded outline, holes, a slot, an ellipse, a B-spline, a polyline)
# and writes it as IGES, SVG and DXF with its own exporters, so MyCAD's 2D
# readers are tested against files it did not write. The report records what
# FreeCAD drew: edge count, total length and bounding box per file.
#   MYCAD_FC_JOB = job.json: { "dir": output folder, "out": report path }
import json
import math
import os

import FreeCAD as App
import Part

job = json.load(open(os.environ['MYCAD_FC_JOB'], encoding='utf-8'))
out_dir = job['dir']
os.makedirs(out_dir, exist_ok=True)
V = App.Vector


def rounded_rect(x0, y0, w, h, r):
    e = []
    e.append(Part.LineSegment(V(x0 + r, y0, 0), V(x0 + w - r, y0, 0)).toShape())
    e.append(Part.ArcOfCircle(Part.Circle(V(x0 + w - r, y0 + r, 0), V(0, 0, 1), r), math.radians(270), math.radians(360)).toShape())
    e.append(Part.LineSegment(V(x0 + w, y0 + r, 0), V(x0 + w, y0 + h - r, 0)).toShape())
    e.append(Part.ArcOfCircle(Part.Circle(V(x0 + w - r, y0 + h - r, 0), V(0, 0, 1), r), 0, math.radians(90)).toShape())
    e.append(Part.LineSegment(V(x0 + w - r, y0 + h, 0), V(x0 + r, y0 + h, 0)).toShape())
    e.append(Part.ArcOfCircle(Part.Circle(V(x0 + r, y0 + h - r, 0), V(0, 0, 1), r), math.radians(90), math.radians(180)).toShape())
    e.append(Part.LineSegment(V(x0, y0 + h - r, 0), V(x0, y0 + r, 0)).toShape())
    e.append(Part.ArcOfCircle(Part.Circle(V(x0 + r, y0 + r, 0), V(0, 0, 1), r), math.radians(180), math.radians(270)).toShape())
    return e


edges = rounded_rect(0, 0, 160, 100, 12)
for cx, cy in [(15, 15), (145, 15), (145, 85), (15, 85)]:
    edges.append(Part.Circle(V(cx, cy, 0), V(0, 0, 1), 5).toShape())
# A slot: two lines and two half circles.
edges.append(Part.LineSegment(V(60, 40, 0), V(100, 40, 0)).toShape())
edges.append(Part.LineSegment(V(100, 60, 0), V(60, 60, 0)).toShape())
edges.append(Part.ArcOfCircle(Part.Circle(V(100, 50, 0), V(0, 0, 1), 10), math.radians(-90), math.radians(90)).toShape())
edges.append(Part.ArcOfCircle(Part.Circle(V(60, 50, 0), V(0, 0, 1), 10), math.radians(90), math.radians(270)).toShape())
ellipse = Part.Ellipse(V(130, 50, 0), 14, 7)
edges.append(ellipse.toShape())
spline = Part.BSplineCurve()
spline.interpolate([V(20, 30, 0), V(30, 45, 0), V(40, 30, 0), V(50, 55, 0)])
edges.append(spline.toShape())
edges.append(Part.makePolygon([V(20, 70, 0), V(40, 75, 0), V(50, 65, 0), V(35, 60, 0)]))

compound = Part.Compound(edges)
report = {}


def describe(shape):
    box = shape.BoundBox
    return {'edges': len(shape.Edges), 'length': sum(e.Length for e in shape.Edges), 'bbox': [box.XMin, box.YMin, box.XMax, box.YMax]}


try:
    path = os.path.join(out_dir, 'freecad-plate.igs')
    compound.exportIges(path)
    report['freecad-plate.igs'] = describe(compound)
except Exception as error:  # noqa: BLE001
    report['freecad-plate.igs'] = {'error': repr(error)}

doc = App.newDocument('plate')
feature = doc.addObject('Part::Feature', 'Plate')
feature.Shape = compound
doc.recompute()
try:
    import importSVG
    importSVG.export([feature], os.path.join(out_dir, 'freecad-plate.svg'))
    report['freecad-plate.svg'] = describe(compound)
except Exception as error:  # noqa: BLE001
    report['freecad-plate.svg'] = {'error': repr(error)}
try:
    import importDXF
    importDXF.export([feature], os.path.join(out_dir, 'freecad-plate.dxf'))
    report['freecad-plate.dxf'] = describe(compound)
except Exception as error:  # noqa: BLE001
    report['freecad-plate.dxf'] = {'error': repr(error)}

with open(job['out'], 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=1)
