// Test media for the E2E suites (test/fixtures), made with FFmpeg once and kept in the repository:
//   clip.webm  2 s 320×180 test pattern + 440 Hz tone (VP8 / Opus)
//   clip.mp4   the same as H.264 / AAC
//   tone.wav   1 s 1 kHz tone
//   stinger.webm 1 s, 640×180: the stinger on the left, its track matte (black → white) on the right
//   playlist-a.webm / playlist-b.webm  short red / blue clips (playlist order)
//   red.png 64×64, mask.png 64×64 (white left half, transparent right half), lut-red.cube (everything red)
//   page.html  a local page for the browser source
//   node scripts/make-fixtures.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test', 'fixtures');
fs.mkdirSync(out, { recursive: true });
const ff = (...args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: out, encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); };

ff('-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libvpx', '-b:v', '300k', '-c:a', 'libopus', '-shortest', 'clip.webm');
ff('-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', 'clip.mp4');
ff('-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1', 'tone.wav');
ff('-f', 'lavfi', '-i', 'color=c=0xff00ff:size=320x180:rate=30:duration=1', '-f', 'lavfi', '-i', 'color=c=black:size=320x180:rate=30:duration=1', '-filter_complex', '[1]geq=lum=\'255*T\':cb=128:cr=128[m];[0][m]hstack', '-c:v', 'libvpx', '-b:v', '200k', 'stinger.webm');
ff('-f', 'lavfi', '-i', 'color=c=red:size=160x90:rate=30:duration=1', '-c:v', 'libvpx', 'playlist-a.webm');
ff('-f', 'lavfi', '-i', 'color=c=blue:size=160x90:rate=30:duration=1', '-c:v', 'libvpx', 'playlist-b.webm');
ff('-f', 'lavfi', '-i', 'color=c=red:size=64x64', '-frames:v', '1', 'red.png');
ff('-f', 'lavfi', '-i', 'color=c=white@1:size=32x64,format=rgba', '-f', 'lavfi', '-i', 'color=c=black@0:size=32x64,format=rgba', '-filter_complex', 'hstack', '-frames:v', '1', 'mask.png');
let cube = 'LUT_3D_SIZE 2\n';
for (let i = 0; i < 8; i++) cube += '1 0 0\n';
fs.writeFileSync(path.join(out, 'lut-red.cube'), cube);
fs.writeFileSync(path.join(out, 'page.html'), '<div style="width:200px;height:100px;background:#00ff00"></div>\n');
console.log('fixtures written to', out);
