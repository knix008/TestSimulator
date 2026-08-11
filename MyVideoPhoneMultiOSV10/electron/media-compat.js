const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function resolveFfmpegPath() {
  try {
    let fromPkg = require('ffmpeg-static');
    if (typeof fromPkg === 'string' && fromPkg.includes('app.asar')) {
      fromPkg = fromPkg.replace('app.asar', 'app.asar.unpacked');
    }
    if (fromPkg && fs.existsSync(fromPkg)) return fromPkg;
  } catch {
    /* optional */
  }
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function cacheDir() {
  const dir = path.join(app.getPath('userData'), 'compat-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheKeyFor(filePath) {
  const stat = fs.statSync(filePath);
  const raw = `${path.resolve(filePath)}|${stat.size}|${stat.mtimeMs}`;
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function runFfmpeg(args) {
  const ffmpeg = resolveFfmpegPath();
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', (err) => {
      reject(new Error(`ffmpeg 실행 실패: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true });
      else reject(new Error(`ffmpeg exit ${code}\n${stderr.trim()}`));
    });
  });
}

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

/**
 * Rebuild a Chromium-friendly MP4.
 * @param {string} sourcePath
 * @param {(progress: { phase: string, message?: string }) => void} [onProgress]
 * @param {{ mode?: 'auto' | 'soft' | 'full', force?: boolean }} [options]
 */
async function makeChromiumCompatible(sourcePath, onProgress, options = {}) {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, error: '원본 파일을 찾을 수 없습니다.' };
  }

  const mode = options.mode === 'full' || options.force ? 'full' : 'soft';
  const key = cacheKeyFor(resolved);
  const outPath = path.join(cacheDir(), mode === 'full' ? `${key}.h264.mp4` : `${key}.mp4`);

  if (!options.force && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    onProgress?.({ phase: 'cached', message: '변환 캐시 사용' });
    return { ok: true, path: outPath, cached: true, mode };
  }

  if (options.force) safeUnlink(outPath);

  const tmpPath = `${outPath}.partial.mp4`;
  safeUnlink(tmpPath);

  const finish = () => {
    try {
      fs.renameSync(tmpPath, outPath);
    } catch (err) {
      safeUnlink(tmpPath);
      return { ok: false, error: `변환 결과 저장 실패: ${err.message}` };
    }
    return { ok: true, path: outPath, cached: false, mode };
  };

  if (mode === 'full') {
    onProgress?.({ phase: 'reencode', message: '전체 재인코딩 중… (시간이 걸릴 수 있습니다)' });
    const fullArgs = [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', resolved,
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-sn',
      tmpPath
    ];
    try {
      await runFfmpeg(fullArgs);
    } catch (err) {
      safeUnlink(tmpPath);
      return { ok: false, error: `호환 변환 실패\n${err.message}` };
    }
    return finish();
  }

  onProgress?.({ phase: 'transcode', message: '브라우저 호환 형식으로 변환 중…' });

  // Prefer keeping video bitstream; re-encode audio to stereo AAC Chromium accepts.
  const copyVideoArgs = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', resolved,
    '-map', '0:v:0?',
    '-map', '0:a:0?',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-ar', '44100',
    '-movflags', '+faststart',
    '-sn',
    tmpPath
  ];

  try {
    await runFfmpeg(copyVideoArgs);
  } catch (firstErr) {
    onProgress?.({ phase: 'reencode', message: '전체 재인코딩 중… (시간이 걸릴 수 있습니다)' });
    const fullArgs = [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', resolved,
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-sn',
      tmpPath
    ];
    try {
      await runFfmpeg(fullArgs);
    } catch (secondErr) {
      safeUnlink(tmpPath);
      return {
        ok: false,
        error: `호환 변환 실패\n${secondErr.message || firstErr.message}`
      };
    }
    const done = finish();
    if (done.ok) done.mode = 'full';
    return done;
  }

  return finish();
}

module.exports = {
  makeChromiumCompatible,
  resolveFfmpegPath
};
