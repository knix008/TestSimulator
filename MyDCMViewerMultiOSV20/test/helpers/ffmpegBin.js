'use strict';
/* ffmpeg is optional. A shell started before `winget install` still has the old PATH, so also look
 * next to the WinGet package and the Chocolatey shim. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function ffmpegCandidates() {
  const list = [];
  if (process.env.FFMPEG) list.push(process.env.FFMPEG);
  list.push('ffmpeg', 'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe');
  const local = process.env.LOCALAPPDATA;
  if (!local) return list;
  const root = path.join(local, 'Microsoft', 'WinGet', 'Packages');
  try {
    for (const name of fs.readdirSync(root)) {
      if (!name.startsWith('Gyan.FFmpeg')) continue;
      for (const sub of fs.readdirSync(path.join(root, name))) {
        const exe = path.join(root, name, sub, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
        if (fs.existsSync(exe)) list.push(exe);
      }
    }
  } catch { /* no WinGet packages directory */ }
  return list;
}

function ffmpegBin() {
  for (const bin of ffmpegCandidates()) {
    if (bin !== 'ffmpeg' && !fs.existsSync(bin)) continue;
    if (spawnSync(bin, ['-hide_banner', '-version'], { windowsHide: true }).status === 0) return bin;
  }
  return null;
}

function ffprobeBin(ffmpeg) {
  if (!ffmpeg || ffmpeg === 'ffmpeg') return 'ffprobe';
  const exe = path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  return fs.existsSync(exe) ? exe : 'ffprobe';
}

module.exports = { ffmpegBin, ffprobeBin };
