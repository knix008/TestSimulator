"""Checks exported files with programs other than MyDCMViewer itself.

    python -E -P scripts/validate-exports.py <file> [<file> ...]   ->  one JSON line per file:
    {"file", "ok", "tool", "detail"}

Raster pictures open in Pillow, DICOM / DICOMDIR in pydicom, video in ffprobe, PDF in pdfinfo
(or a structure check), archives entry by entry; formats Pillow does not know fall back to ffprobe,
and NIfTI / NRRD / MetaImage / Analyze headers are read by the official field layouts.
Missing tools are reported as ok=None (skipped), never as a pass.
"""
import csv
import gzip
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import zipfile

try:
    from PIL import Image
except Exception:  # pragma: no cover
    Image = None
try:
    import pydicom
except Exception:  # pragma: no cover
    pydicom = None

FFPROBE = shutil.which('ffprobe')
PDFINFO = shutil.which('pdfinfo')
PIL_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.ico', '.icns', '.cur', '.tga', '.pcx', '.pbm',
           '.pgm', '.ppm', '.pnm', '.pam', '.qoi', '.sgi', '.rgb', '.bw', '.ras', '.xbm', '.xpm', '.dds', '.psd', '.fits', '.fit',
           '.avif', '.heic', '.heif', '.jp2', '.j2k', '.apng', '.pfm', '.wbmp', '.eps', '.ff', '.im'}


def picture(data, name):
    if Image is None:
        return None, 'pillow', 'Pillow is not installed'
    im = Image.open(io.BytesIO(data))
    im.load()
    frames = getattr(im, 'n_frames', 1)
    lo, hi = None, None
    try:
        ex = im.convert('L' if im.mode not in ('I', 'I;16', 'I;16B', 'F') else im.mode).getextrema()
        lo, hi = (ex if isinstance(ex[0], (int, float)) else ex[0])
    except Exception:
        pass
    if im.width <= 0 or im.height <= 0:
        return False, 'pillow', 'empty picture'
    flat = lo is not None and lo == hi
    return (not flat), 'pillow', f'{im.format} {im.width}x{im.height} {im.mode} frames={frames}' + (' (uniform!)' if flat else '')


def ffprobe(path):
    if not FFPROBE:
        return None, 'ffprobe', 'ffprobe is not installed'
    r = subprocess.run([FFPROBE, '-v', 'error', '-count_frames', '-show_entries',
                        'stream=codec_name,width,height,nb_read_frames:format=format_name,duration', '-of', 'json', path],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        return False, 'ffprobe', (r.stderr or 'failed').strip()[:300]
    info = json.loads(r.stdout or '{}')
    st = [s for s in info.get('streams', []) if s.get('width')]
    if not st:
        return False, 'ffprobe', 'no picture stream'
    s = st[0]
    return True, 'ffprobe', f"{info.get('format', {}).get('format_name')} {s.get('codec_name')} {s.get('width')}x{s.get('height')} frames={s.get('nb_read_frames')}"


def dicom(path):
    if pydicom is None:
        return None, 'pydicom', 'pydicom is not installed'
    ds = pydicom.dcmread(path)
    if os.path.basename(path).upper() == 'DICOMDIR' or 'DirectoryRecordSequence' in ds:
        from pydicom.fileset import FileSet
        fs = FileSet(ds)
        missing = [i for i in fs if not os.path.exists(i.path)]
        if missing:
            return False, 'pydicom', f'{len(missing)} referenced files missing'
        return len(fs) > 0, 'pydicom', f'DICOMDIR with {len(fs)} instances'
    pydicom.dataset.validate_file_meta(ds.file_meta, enforce_standard=True)
    ts = str(ds.file_meta.TransferSyntaxUID)
    if 'PixelData' in ds:
        arr = ds.pixel_array
        return True, 'pydicom', f'{ds.get("SOPClassUID", "").name if hasattr(ds.get("SOPClassUID", ""), "name") else ""} TS={ts} pixels={arr.shape} {arr.dtype}'
    return True, 'pydicom', f'TS={ts} (no pixel data)'


def pdf(path, data):
    if not data.startswith(b'%PDF-') or b'%%EOF' not in data[-1024:]:
        return False, 'structure', 'not a PDF (header / %%EOF)'
    if PDFINFO:
        r = subprocess.run([PDFINFO, path], capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            return False, 'pdfinfo', (r.stderr or 'failed').strip()[:300]
        pages = [l for l in r.stdout.splitlines() if l.startswith('Pages:')]
        return True, 'pdfinfo', (pages[0] if pages else 'ok')
    return True, 'structure', 'PDF header and trailer'


def volume(path, data, ext):
    name = path.lower()
    if name.endswith('.nii.gz'):
        data, ext = gzip.decompress(data), '.nii'
    if ext == '.nii':
        if struct.unpack('<i', data[:4])[0] != 348 or data[344:348] not in (b'n+1\0', b'ni1\0'):
            return False, 'nifti header', 'sizeof_hdr / magic wrong'
        dim = struct.unpack('<8h', data[40:56])
        vox = int(struct.unpack('<f', data[108:112])[0])
        bpp = struct.unpack('<h', data[72:74])[0] // 8
        n = 1
        for d in dim[1:1 + dim[0]]:
            n *= d
        if len(data) < vox + n * bpp:
            return False, 'nifti header', 'data shorter than the header says'
        return True, 'nifti header', f'dims={dim[1:1 + dim[0]]} bytes/voxel={bpp}'
    if ext == '.nrrd':
        head = data[:4096].split(b'\n\n')[0].decode('latin1')
        if not head.startswith('NRRD000'):
            return False, 'nrrd header', 'no NRRD magic'
        return True, 'nrrd header', ' '.join(l for l in head.splitlines() if l.startswith(('sizes', 'type', 'encoding')))
    if ext in ('.mha', '.mhd'):
        head = data[:4096].decode('latin1', 'replace')
        if 'ObjectType = Image' not in head or 'DimSize' not in head:
            return False, 'metaimage header', 'ObjectType / DimSize missing'
        return True, 'metaimage header', ' '.join(l for l in head.splitlines() if l.startswith(('NDims', 'DimSize', 'ElementType')))
    return None, 'header', 'unknown volume format'


def table(path, data, ext):
    text = data.decode('utf-8-sig')
    if ext == '.json':
        obj = json.loads(text)
        return bool(obj), 'json', f'{type(obj).__name__} with {len(obj)} entries'
    if ext == '.csv':
        rows = list(csv.reader(io.StringIO(text)))
        return len(rows) >= 2, 'csv', f'{len(rows)} rows x {len(rows[0]) if rows else 0} columns'
    if ext in ('.html', '.htm'):
        return '<' in text and '</' in text, 'html', f'{len(text)} characters'
    return len(text.strip()) > 0, 'text', f'{len(text.splitlines())} lines'


def farbfeld(data):
    if data[:8] != b'farbfeld':
        return False, 'farbfeld spec', 'no farbfeld magic'
    w, h = struct.unpack('>II', data[8:16])
    if len(data) != 16 + w * h * 8:
        return False, 'farbfeld spec', f'{len(data)} bytes for {w}x{h}'
    px = struct.unpack(f'>{min(w * h * 4, 40000)}H', data[16:16 + min(w * h * 8, 80000)])
    return max(px) != min(px), 'farbfeld spec', f'{w}x{h} 16-bit RGBA'


def svg(data):
    import base64
    import re
    import xml.etree.ElementTree as ET
    root = ET.fromstring(data)
    if not root.tag.endswith('svg'):
        return False, 'xml', 'root is not <svg>'
    m = re.search(rb'data:image/(png|jpeg);base64,([A-Za-z0-9+/=\s]+)', data)
    if not m:
        return True, 'xml', f"SVG {root.get('width')}x{root.get('height')} (vector only)"
    ok, _, det = picture(base64.b64decode(m.group(2)), 'embedded')
    return ok, 'xml+pillow', f"SVG {root.get('width')}x{root.get('height')}, embedded {det}"


def eps(data):
    """Without Ghostscript nothing can render PostScript here: check the DSC header and decode the image data."""
    import base64
    import re
    text = data.decode('latin1')
    if not text.startswith('%!PS-Adobe-') or 'EPSF' not in text.splitlines()[0]:
        return False, 'eps structure', 'no EPSF header'
    bb = re.search(r'%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)', text)
    w = re.search(r'/Width\s+(\d+)', text)
    h = re.search(r'/Height\s+(\d+)', text)
    if not (bb and w and h):
        return False, 'eps structure', 'BoundingBox / image size missing'
    comps = 3 if '/DeviceRGB' in text else 1
    start = text.index('image', text.index('>>')) + len('image')
    body = text[start:]
    if 'ASCII85Decode' in text:
        raw = base64.a85decode(re.sub(r'\s', '', body[:body.index('~>')]), adobe=False)
    else:
        raw = bytes.fromhex(re.sub(r'\s', '', body[:body.index('>')]))
    need = int(w.group(1)) * int(h.group(1)) * comps
    if len(raw) < need:
        return False, 'eps structure', f'{len(raw)} image bytes, {need} needed'
    return True, 'eps structure (no Ghostscript to render)', f'{w.group(1)}x{h.group(1)}, {comps} channel(s), image data decodes'


def check(path):
    data = open(path, 'rb').read()
    low0 = path.lower()
    if low0.endswith('.ff'):
        return farbfeld(data)
    if low0.endswith('.svg'):
        return svg(data)
    if low0.endswith('.eps'):
        return eps(data)
    low = path.lower()
    ext = '.nii.gz' if low.endswith('.nii.gz') else os.path.splitext(low)[1]
    if os.path.basename(low) == 'dicomdir' or ext in ('.dcm', '.dicom') or data[128:132] == b'DICM':
        return dicom(path)
    if ext == '.pdf':
        return pdf(path, data)
    if ext in ('.mp4', '.webm', '.mkv', '.avi', '.mov'):
        return ffprobe(path)
    if ext in ('.nii', '.nii.gz', '.nrrd', '.mha', '.mhd'):
        return volume(path, data, ext)
    if ext in ('.csv', '.json', '.txt', '.html', '.htm'):
        return table(path, data, ext)
    if ext == '.zip':
        z = zipfile.ZipFile(io.BytesIO(data))
        bad = z.testzip()
        if bad:
            return False, 'zipfile', f'CRC error in {bad}'
        names = z.namelist()
        if 'DICOMDIR' in names:   # a CD / USB file set packed for download: unpack and read it like a disc
            import tempfile
            with tempfile.TemporaryDirectory() as tmp:
                z.extractall(tmp)
                ok, tool, det = dicom(os.path.join(tmp, 'DICOMDIR'))
                return ok, 'zipfile+' + tool, det
        hdr = [n for n in names if n.lower().endswith('.hdr')]
        mhd = [n for n in names if n.lower().endswith('.mhd')]
        if hdr:   # Analyze 7.5 pair: 348-byte header + .img of dims × bytes per voxel
            h = z.read(hdr[0])
            img = z.read(hdr[0][:-4] + '.img')
            if struct.unpack('<i', h[:4])[0] != 348:
                return False, 'analyze header', 'sizeof_hdr is not 348'
            dim = struct.unpack('<8h', h[40:56])
            n = 1
            for d in dim[1:1 + dim[0]]:
                n *= d
            bpp = struct.unpack('<h', h[72:74])[0] // 8
            return len(img) == n * bpp, 'analyze header', f'dims={dim[1:1 + dim[0]]} bytes/voxel={bpp}, .img {len(img)} bytes'
        if mhd:   # MetaImage pair: header naming its raw file
            head = z.read(mhd[0]).decode('latin1')
            raw = [l.split('=', 1)[1].strip() for l in head.splitlines() if l.startswith('ElementDataFile')]
            if 'ObjectType = Image' not in head or not raw or raw[0] not in names:
                return False, 'metaimage header', 'header or data file missing'
            return True, 'metaimage header', ' '.join(l for l in head.splitlines() if l.startswith(('DimSize', 'ElementType'))) + f', {raw[0]} present'
        seen = 0
        for n in names:
            e = os.path.splitext(n.lower())[1]
            if e in PIL_EXT:
                ok, _, det = picture(z.read(n), n)
                if not ok:
                    return False, 'zipfile+pillow', f'{n}: {det}'
                seen += 1
        return len(names) > 0, 'zipfile+pillow', f'{len(names)} entries, {seen} pictures opened'
    if ext in PIL_EXT:
        try:
            ok, tool, det = picture(data, path)
            if ok is not None:
                return ok, tool, det
        except Exception as e:  # Pillow cannot read it: ask ffprobe
            if not FFPROBE:
                return False, 'pillow', str(e)[:300]
    return ffprobe(path)


def main():
    for p in sys.argv[1:]:
        try:
            ok, tool, detail = check(p)
        except Exception as e:
            ok, tool, detail = False, 'exception', f'{type(e).__name__}: {e}'[:400]
        print(json.dumps({'file': p, 'ok': ok, 'tool': tool, 'detail': detail}), flush=True)


if __name__ == '__main__':
    main()
