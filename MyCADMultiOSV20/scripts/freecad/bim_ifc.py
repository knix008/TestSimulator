# FreeCAD's BIM objects written to IFC by FreeCAD itself (run by FreeCADCmd):
# a wall with a window, a column, a beam and a slab; their volumes reported.
#   MYCAD_FC_JOB = job.json: { "out": "bim.ifc", "report": "bim.json" }
import json
import os

import FreeCAD as App
import Arch
import Draft
import Part

job = json.load(open(os.environ['MYCAD_FC_JOB'], encoding='utf-8'))
doc = App.newDocument('BimSample')

line = Draft.makeWire([App.Vector(0, 0, 0), App.Vector(5000, 0, 0)])
wall = Arch.makeWall(line, width=200, height=3000, align='Center')
wall.Label = 'WallA'
doc.recompute()
window = Arch.makeWindowPreset('Fixed', width=1200, height=1000, h1=50, h2=50, h3=50, w1=60, w2=30, o1=0, o2=30,
                               placement=App.Placement(App.Vector(2000, 0, 900), App.Rotation(App.Vector(1, 0, 0), 90)))
window.Hosts = [wall]
window.Label = 'WindowA'
doc.recompute()

column = Arch.makeStructure(None, length=300, width=400, height=3000)
column.Placement.Base = App.Vector(6000, 2000, 0)
column.Label = 'ColumnA'
# A beam as FreeCAD users make one without a base line: a box marked Beam (extruded up by its height).
beam = Arch.makeStructure(None, length=5000, width=250, height=500)
beam.Placement.Base = App.Vector(0, 4000 - 125, 2500)
beam.IfcType = 'Beam'
beam.Label = 'BeamA'
rect = Draft.makeRectangle(6000, 4000, placement=App.Placement(App.Vector(0, 0, 3000), App.Rotation()))
slab = Arch.makeStructure(rect, height=200)
slab.IfcType = 'Slab'
slab.Label = 'SlabA'
doc.recompute()

objects = [wall, window, column, beam, slab]
try:
    from importers import exportIFC
except ImportError:
    import exportIFC
exportIFC.export(objects, job['out'])
json.dump({o.Label: o.Shape.Volume for o in objects}, open(job['report'], 'w', encoding='utf-8'))
