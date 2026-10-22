// Makes the DICOM video samples in samples/video/ from the colour Doppler echo (60 frames):
// MPEG-4 AVC / H.264 (High profile, B-frames), HEVC Main and MPEG-2 Main profile, each encapsulated in
// fragments the way modalities write them. Needs ffmpeg (libx264, libx265, mpeg2video) and Python
// with pydicom.        node scripts/make-video-samples.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { root } from './cdp.mjs';

const require = createRequire(import.meta.url);
const D = require('../src/js/dicomDecoder.js');
const SRC = path.join(root, 'samples', 'pydicom-data', 'color3d_jpeg_baseline.dcm');
const OUT = path.join(root, 'samples', 'video');
const FRAMES = 60, FPS = 25;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dcmv-video-'));
fs.mkdirSync(OUT, { recursive: true });

const img = await D.load(new Uint8Array(fs.readFileSync(SRC)));
const { width: W, height: H } = img;
const raw = Buffer.alloc(W * H * 3 * FRAMES);
for (let f = 0; f < FRAMES; f++) {
  const r = await img.render({ frame: f });
  for (let i = 0, j = f * W * H * 3; i < r.rgba.length; i += 4, j += 3) { raw[j] = r.rgba[i]; raw[j + 1] = r.rgba[i + 1]; raw[j + 2] = r.rgba[i + 2]; }
}
const rawFile = path.join(work, 'frames.rgb');
fs.writeFileSync(rawFile, raw);
console.log(`${FRAMES} frames ${W}×${H} from ${path.basename(SRC)}`);

const encode = (name, args) => {
  const out = path.join(work, name);
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', rawFile, ...args, out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${name}: ${r.stderr}`);
  return out;
};
const streams = [
  { name: 'us_h264.dcm', ts: '1.2.840.10008.1.2.4.102', es: encode('v.h264', ['-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-bf', '2', '-g', '30', '-crf', '20', '-x264-params', 'aud=1', '-f', 'h264']) },
  { name: 'us_hevc.dcm', ts: '1.2.840.10008.1.2.4.107', es: encode('v.hevc', ['-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-x265-params', 'log-level=error:bframes=2:keyint=30', '-crf', '24', '-tag:v', 'hvc1', '-f', 'hevc']) },
  { name: 'us_mpeg2.dcm', ts: '1.2.840.10008.1.2.4.100', es: encode('v.m2v', ['-c:v', 'mpeg2video', '-pix_fmt', 'yuv420p', '-b:v', '4M', '-g', '15', '-bf', '2', '-f', 'mpeg2video']) },
];

const py = String.raw`
import sys, json, math, pydicom
from pydicom.encaps import encapsulate
from pydicom.uid import generate_uid
src, jobs = sys.argv[1], json.loads(sys.argv[2])
for j in jobs:
    ds = pydicom.dcmread(src)
    es = open(j['es'], 'rb').read()
    ds.file_meta.TransferSyntaxUID = j['ts']
    ds.SOPInstanceUID = generate_uid(); ds.file_meta.MediaStorageSOPInstanceUID = ds.SOPInstanceUID
    ds.SeriesInstanceUID = generate_uid()
    ds.SeriesDescription = 'Video ' + j['label']
    ds.SamplesPerPixel = 3; ds.PhotometricInterpretation = 'YBR_PARTIAL_420'; ds.PlanarConfiguration = 0
    ds.BitsAllocated = 8; ds.BitsStored = 8; ds.HighBit = 7; ds.PixelRepresentation = 0
    ds.NumberOfFrames = j['frames']; ds.FrameTime = round(1000 / j['fps'], 3); ds.CineRate = j['fps']
    ds.LossyImageCompression = '01'
    # the stream cut into 64 KB fragments, as one "frame" (video: the offset table stays empty)
    per = max(1, math.ceil(len(es) / 65536))
    ds.PixelData = encapsulate([es], fragments_per_frame=per, has_bot=False)
    ds['PixelData'].VR = 'OB'; ds['PixelData'].is_undefined_length = True
    for k in ('StartTrim', 'StopTrim', 'RecommendedDisplayFrameRate'):
        if k in ds: delattr(ds, k)
    ds.save_as(j['out'], enforce_file_format=True)
    back = pydicom.dcmread(j['out'])
    print(j['out'], back.file_meta.TransferSyntaxUID, back.NumberOfFrames, len(es), 'bytes of', j['label'], per, 'fragments')
`;
const jobs = streams.map((s) => ({ es: s.es, ts: s.ts, out: path.join(OUT, s.name), frames: FRAMES, fps: FPS, label: s.name.replace(/^us_|\.dcm$/g, '').toUpperCase() }));
const r = spawnSync('python', ['-E', '-P', '-c', py, SRC, JSON.stringify(jobs)], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
fs.rmSync(work, { recursive: true, force: true });
