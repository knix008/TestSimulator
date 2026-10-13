# Opens files with FreeCAD and reports what FreeCAD sees (run by FreeCADCmd).
#   FreeCADCmd check.py <job.json>
# job.json: { "files": [path, ...], "out": result.json }
# For each file: object count, total volume, bounding box, validity, errors.
import json
import os
import sys
import traceback

import FreeCAD as App
import Part
import Mesh

job_path = os.environ['MYCAD_FC_JOB']
job = json.load(open(job_path, encoding='utf-8'))
results = []


def bbox_of(boxes):
    if not boxes:
        return None
    return [min(b.XMin for b in boxes), min(b.YMin for b in boxes), min(b.ZMin for b in boxes),
            max(b.XMax for b in boxes), max(b.YMax for b in boxes), max(b.ZMax for b in boxes)]


for path in job['files']:
    ext = os.path.splitext(path)[1].lower()
    entry = {'file': os.path.basename(path), 'ok': False}
    try:
        if ext == '.fcstd':
            doc = App.openDocument(path)
            doc.recompute()
            consumed = set()
            for o in doc.Objects:
                for dep in o.OutList:
                    consumed.add(dep.Name)
            objects = []
            volume = 0.0
            boxes = []
            for o in doc.Objects:
                if o.Name in consumed:
                    continue
                info = {'name': o.Name, 'label': o.Label, 'type': o.TypeId, 'valid': o.isValid()}
                if not o.isValid():
                    info['status'] = o.getStatusString()
                if hasattr(o, 'Shape') and not o.Shape.isNull() and o.Shape.Solids:
                    info['volume'] = o.Shape.Volume
                    b = o.Shape.optimalBoundingBox()
                    info['bbox'] = [b.XMin, b.YMin, b.ZMin, b.XMax, b.YMax, b.ZMax]
                    volume += o.Shape.Volume
                    boxes.append(o.Shape.BoundBox)
                elif o.TypeId == 'Mesh::Feature':
                    info['volume'] = o.Mesh.Volume
                    b = o.Mesh.BoundBox
                    info['bbox'] = [b.XMin, b.YMin, b.ZMin, b.XMax, b.YMax, b.ZMax]
                    volume += o.Mesh.Volume
                    boxes.append(o.Mesh.BoundBox)
                elif o.TypeId.startswith('Sketcher'):
                    info['edges'] = len(o.Shape.Edges)
                objects.append(info)
            entry.update(objects=objects, volume=volume, bbox=bbox_of(boxes), invalid=[o['name'] for o in objects if not o['valid']])
            App.closeDocument(doc.Name)
        elif ext in ('.step', '.stp', '.iges', '.igs', '.brep', '.brp'):
            shape = Part.read(path)
            entry.update(volume=shape.Volume, solids=len(shape.Solids), shells=len(shape.Shells), faces=len(shape.Faces), bbox=bbox_of([shape.BoundBox]), valid=shape.isValid(), shapeType=shape.ShapeType)
        else:
            mesh = Mesh.Mesh(path)
            entry.update(volume=mesh.Volume, facets=mesh.CountFacets, points=mesh.CountPoints, bbox=bbox_of([mesh.BoundBox]), solid=mesh.isSolid())
        entry['ok'] = True
    except Exception as error:  # noqa: BLE001 - report everything
        entry['error'] = '%s: %s' % (type(error).__name__, error)
        entry['trace'] = traceback.format_exc()[-800:]
    results.append(entry)

json.dump(results, open(job['out'], 'w', encoding='utf-8'), indent=1)
