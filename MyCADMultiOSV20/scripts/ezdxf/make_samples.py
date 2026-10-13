"""DXF samples written by ezdxf (an independent open-source DXF library), so
MyCAD's DXF reader is tested against files it did not write itself.

    python -m pip install ezdxf
    python scripts/ezdxf/make_samples.py samples/dxf

Writes ezdxf-entities-r12.dxf, ezdxf-entities-r2000.dxf, ezdxf-entities-r2018.dxf,
the binary DXF ezdxf-entities-r12-binary.dxf / -r2000-binary.dxf, the Korean
code-page file ezdxf-entities-r12-cp949.dxf
(every common 2D entity, blocks with attributes, dimensions, hatches, splines,
leaders, 3D faces and a polyface mesh) and ezdxf-expected.json with what each
file contains.
"""
import json
import math
import os
import sys

import ezdxf
from ezdxf.math import Vec2

out = sys.argv[1] if len(sys.argv) > 1 else 'samples/dxf'
os.makedirs(out, exist_ok=True)
expected = {}


def build(version):
    doc = ezdxf.new(version, setup=True)
    doc.units = ezdxf.units.MM
    msp = doc.modelspace()
    doc.layers.add('외형선', color=7)
    doc.layers.add('CENTER', color=1, linetype='CENTER')
    doc.layers.add('HATCH', color=3)
    msp.add_line((0, 0), (100, 0), dxfattribs={'layer': '외형선'})
    msp.add_circle((20, 20), 10)
    msp.add_arc((50, 20), 10, 0, 135)
    msp.add_line((-10, 20), (110, 20), dxfattribs={'layer': 'CENTER'})
    msp.add_point((120, 0))
    msp.add_text('ezdxf TEXT 한글', dxfattribs={'height': 3.5}).set_placement((0, -10))
    if version != 'R12':
        msp.add_lwpolyline([(0, 40, 0, 0, 0.5), (30, 40, 0, 0, 0), (30, 60), (0, 60)], format='xyseb', close=True)
        msp.add_ellipse((70, 50), major_axis=(15, 5), ratio=0.4)
        msp.add_ellipse((100, 50), major_axis=(0, 10), ratio=0.5, start_param=0, end_param=math.pi)
        msp.add_spline([(0, 80), (10, 95), (25, 80), (40, 95), (55, 80)])
        msp.add_spline_control_frame([(60, 80), (70, 95), (85, 80), (100, 95)], degree=3)
        hatch = msp.add_hatch(color=3, dxfattribs={'layer': 'HATCH'})
        hatch.set_pattern_fill('ANSI31', scale=0.5)
        hatch.paths.add_polyline_path([(0, 110), (40, 110), (40, 130), (0, 130)], is_closed=True, flags=1)
        hatch.paths.add_polyline_path([(10, 115), (20, 115), (20, 125), (10, 125)], is_closed=True, flags=16)
        solid = msp.add_hatch(color=5)
        edge = solid.paths.add_edge_path()
        edge.add_line((50, 110), (80, 110))
        edge.add_arc((80, 120), 10, -90, 90)
        edge.add_line((80, 130), (50, 130))
        edge.add_line((50, 130), (50, 110))
        msp.add_leader([(100, 110), (110, 125), (125, 125)])
        msp.add_mtext('MTEXT line 1\\Pline 2', dxfattribs={'char_height': 3}).set_location((90, 140))
        msp.add_linear_dim(base=(0, -25), p1=(0, 0), p2=(100, 0)).render()
    else:
        msp.add_polyline2d([(0, 40), (30, 40), (30, 60), (0, 60)], close=True)
    block = doc.blocks.new('BOLT_HEAD')
    block.add_circle((0, 0), 5)
    block.add_line((-5, 0), (5, 0))
    block.add_attdef('TAG', (0, -8), dxfattribs={'height': 2})
    ref = msp.add_blockref('BOLT_HEAD', (140, 20), dxfattribs={'xscale': 2, 'yscale': 2, 'rotation': 30})
    ref.add_auto_attribs({'TAG': 'M10'})
    msp.add_3dface([(150, 60, 0), (170, 60, 0), (170, 80, 0), (150, 80, 0)])
    mesh = msp.add_polyface()
    cube = [(0, 0, 0), (10, 0, 0), (10, 10, 0), (0, 10, 0), (0, 0, 10), (10, 0, 10), (10, 10, 10), (0, 10, 10)]
    shift = lambda p: (p[0] + 180, p[1] + 60, p[2])
    for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
        mesh.append_face([shift(cube[i]) for i in f])
    mesh.optimize()
    return doc


for version, name in [('R12', 'r12'), ('R2000', 'r2000'), ('R2018', 'r2018')]:
    doc = build(version)
    path = os.path.join(out, f'ezdxf-entities-{name}.dxf')
    doc.saveas(path)
    counts = {}
    for e in doc.modelspace():
        counts[e.dxftype()] = counts.get(e.dxftype(), 0) + 1
    expected[os.path.basename(path)] = {'version': doc.dxfversion, 'entities': counts}
    print(path, doc.dxfversion, counts)

# Binary DXF (R12: one-byte group codes; R2000: two-byte codes) and an ANSI file
# in the Korean code page (cp949, $DWGCODEPAGE = ANSI_949) like older AutoCAD saves.
for version, name, fmt, encoding in [('R12', 'r12-binary', 'bin', None), ('R2000', 'r2000-binary', 'bin', None), ('R12', 'r12-cp949', 'asc', 'cp949')]:
    doc = build(version)
    if encoding:
        doc.encoding = encoding  # also writes $DWGCODEPAGE = ANSI_949
    path = os.path.join(out, f'ezdxf-entities-{name}.dxf')
    doc.saveas(path, encoding=encoding, fmt=fmt)
    counts = {}
    for e in doc.modelspace():
        counts[e.dxftype()] = counts.get(e.dxftype(), 0) + 1
    expected[os.path.basename(path)] = {'version': doc.dxfversion, 'entities': counts, 'format': fmt, 'encoding': encoding or 'utf-8'}
    print(path, doc.dxfversion, fmt, encoding, counts)

with open(os.path.join(out, 'ezdxf-expected.json'), 'w', encoding='utf-8') as f:
    json.dump(expected, f, indent=1, ensure_ascii=False)
