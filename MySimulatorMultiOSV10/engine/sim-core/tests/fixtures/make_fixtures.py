"""Writes the data files the engine's file-format tests read, with the usual
tools (scipy, PIL, numpy, zipfile), so the readers are checked against files
those tools really produce. Run: py -3 make_fixtures.py (in this folder)."""
import os
import struct
import zipfile

import numpy as np
from PIL import Image
from scipy.io import savemat, wavfile

HERE = os.path.dirname(os.path.abspath(__file__))


def path(name):
    return os.path.join(HERE, name)


# A 10 mm cube at (20, 0, 0) as STL, binary and text.
FACES = [
    [(0, 0, 0), (0, 1, 0), (1, 1, 0)], [(0, 0, 0), (1, 1, 0), (1, 0, 0)],
    [(0, 0, 1), (1, 0, 1), (1, 1, 1)], [(0, 0, 1), (1, 1, 1), (0, 1, 1)],
    [(0, 0, 0), (1, 0, 0), (1, 0, 1)], [(0, 0, 0), (1, 0, 1), (0, 0, 1)],
    [(0, 1, 0), (0, 1, 1), (1, 1, 1)], [(0, 1, 0), (1, 1, 1), (1, 1, 0)],
    [(0, 0, 0), (0, 0, 1), (0, 1, 1)], [(0, 0, 0), (0, 1, 1), (0, 1, 0)],
    [(1, 0, 0), (1, 1, 0), (1, 1, 1)], [(1, 0, 0), (1, 1, 1), (1, 0, 1)],
]
tris = np.array(FACES, dtype=float) * 10 + np.array([20, 0, 0])
with open(path('cube.stl'), 'wb') as f:
    f.write(b'binary cube'.ljust(80, b' '))
    f.write(struct.pack('<I', len(tris)))
    for t in tris:
        n = np.cross(t[1] - t[0], t[2] - t[0])
        n = n / np.linalg.norm(n)
        f.write(struct.pack('<12fH', *n, *t[0], *t[1], *t[2], 0))
with open(path('cube_ascii.stl'), 'w') as f:
    f.write('solid cube\n')
    for t in tris:
        n = np.cross(t[1] - t[0], t[2] - t[0])
        n = n / np.linalg.norm(n)
        f.write(f'  facet normal {n[0]:e} {n[1]:e} {n[2]:e}\n    outer loop\n')
        for v in t:
            f.write(f'      vertex {v[0]:e} {v[1]:e} {v[2]:e}\n')
        f.write('    endloop\n  endfacet\n')
    f.write('endsolid cube\n')

# Sound: 0.25 s at 8 kHz, a 440 Hz tone, stereo 16-bit and mono float.
rate = 8000
t = np.arange(int(rate * 0.25)) / rate
left = 0.5 * np.sin(2 * np.pi * 440 * t)
right = 0.25 * np.sin(2 * np.pi * 440 * t)
wavfile.write(path('tone16.wav'), rate, (np.stack([left, right], axis=1) * 32767).astype(np.int16))
wavfile.write(path('tone_float.wav'), rate, left.astype(np.float32))

# MATLAB: a scalar, two vectors, a 3 × 4 matrix, an int16 vector, a cell (skipped).
data = {
    'gain': 3.5,
    't': np.linspace(0, 1, 101).reshape(1, -1),
    'y': np.sin(2 * np.pi * np.linspace(0, 1, 101)).reshape(-1, 1),
    'M': np.arange(12, dtype=float).reshape(3, 4),
    'counts': np.array([1, -2, 3], dtype=np.int16),
    'notes': np.array(['a', 'bc'], dtype=object),
}
savemat(path('vars.mat'), data, do_compression=True)
savemat(path('vars_raw.mat'), data, do_compression=False)

# Images: RGB gradient, a palette image and 16-bit grey.
w, h = 40, 30
rgb = np.zeros((h, w, 3), dtype=np.uint8)
rgb[..., 0] = np.linspace(0, 255, w).astype(np.uint8)[None, :]
rgb[..., 1] = np.linspace(0, 255, h).astype(np.uint8)[:, None]
rgb[..., 2] = 128
Image.fromarray(rgb, 'RGB').save(path('gradient.png'))
Image.fromarray(rgb, 'RGB').quantize(16).save(path('palette.png'))
grey16 = (np.linspace(0, 65535, w)[None, :].repeat(h, 0)).astype(np.uint16)
Image.fromarray(grey16, 'I;16').save(path('grey16.png'))

# An Excel workbook (two sheets, shared strings, inline string, booleans, a formula with its value).
content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>"""
rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"""
workbook = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Measurements" sheetId="1" r:id="rId1"/><sheet name="Parts &amp; prices" sheetId="2" r:id="rId2"/></sheets></workbook>"""
wb_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>"""
shared = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="5" uniqueCount="5"><si><t>time (s)</t></si><si><t>temperature</t></si><si><r><t>pres</t></r><r><rPr><b/></rPr><t>sure</t></r></si><si><t>part</t></si><si><t>bolt, M6</t></si></sst>"""
rows = ''.join(
    f'<row r="{k + 2}"><c r="A{k + 2}"><v>{k * 0.5}</v></c><c r="B{k + 2}"><v>{20 + k * 1.5}</v></c><c r="C{k + 2}"><f>B{k + 2}*2</f><v>{(20 + k * 1.5) * 2}</v></c></row>'
    for k in range(10))
sheet1 = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>{rows}</sheetData></worksheet>"""
sheet2 = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>3</v></c><c r="B1" t="inlineStr"><is><t>price</t></is></c><c r="D1" t="inlineStr"><is><t>stock</t></is></c></row><row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>0.12</v></c><c r="D2" t="b"><v>1</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>nut</t></is></c><c r="B3"><v>0.05</v></c><c r="D3" t="b"><v>0</v></c></row></sheetData></worksheet>"""
with zipfile.ZipFile(path('book.xlsx'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', content_types)
    z.writestr('_rels/.rels', rels)
    z.writestr('xl/workbook.xml', workbook)
    z.writestr('xl/_rels/workbook.xml.rels', wb_rels)
    z.writestr('xl/sharedStrings.xml', shared)
    z.writestr('xl/worksheets/sheet1.xml', sheet1)
    z.writestr('xl/worksheets/sheet2.xml', sheet2)
print('fixtures written')
