/**
 * Install + run FloorPlanTo3D-API (Mask R-CNN) from GitHub with progress.
 * Used by Electron IPC and the Vite dev middleware.
 *
 * Upstream: https://github.com/fadyazizz/FloorPlanTo3D-API
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '../..');

const ZIP_URL = 'https://github.com/fadyazizz/FloorPlanTo3D-API/archive/refs/heads/master.zip';
const REPO_GIT = 'https://github.com/fadyazizz/FloorPlanTo3D-API.git';
const WEIGHTS_DRIVE_ID = '14fDV0b_sKDg0_DkQBTyO1UaT6mHrW9es';
const WEIGHTS_FILE = 'maskrcnn_15_epochs.h5';
const WEIGHTS_MANUAL_URL = `https://drive.google.com/file/d/${WEIGHTS_DRIVE_ID}/view?usp=sharing`;
const DEFAULT_API_URL = 'http://127.0.0.1:5000/';
/** HDF5 files are huge; reject HTML/virus-scan stubs. */
const MIN_WEIGHTS_BYTES = 50 * 1024 * 1024;
/** Bundled TF2 Mask R-CNN + modern Flask entrypoint (Python 3.10–3.12). */
const TF2_BUNDLE_DIR = path.join(__dirname, 'floorplanApiTf2');
const DEPS_MARKER = '.fp3d-deps-ok';
const DEPS_MARKER_VERSION = 'tf2-2026-07-28';
const MIN_PYTHON = [3, 10];
const MAX_PYTHON = [3, 12];

/** @type {import('node:child_process').ChildProcess | null} */
let apiProcess = null;
/** @type {string} */
let apiLog = '';

/**
 * @param {string} root
 */
export function floorplanApiDir(root = DEFAULT_PROJECT_ROOT) {
  return path.join(root, 'FloorPlanTo3D-API');
}

/**
 * @param {string} root
 */
export function isFloorplanApiInstalled(root = DEFAULT_PROJECT_ROOT) {
  return fs.existsSync(path.join(floorplanApiDir(root), 'application.py'));
}

/**
 * @param {string} root
 */
export function hasFloorplanApiWeights(root = DEFAULT_PROJECT_ROOT) {
  const filePath = path.join(floorplanApiDir(root), 'weights', WEIGHTS_FILE);
  try {
    // Do not delete during status checks — only reject tiny/HTML stubs.
    assertValidWeightsFile(filePath, { deleteInvalid: false });
    return true;
  } catch {
    return false;
  }
}

function writeWeightsReadme(weightsDir) {
  const readmePath = path.join(weightsDir, 'README_WEIGHTS.txt');
  const body = [
    'FloorPlanTo3D-API model weights (manual install)',
    '================================================',
    '',
    `1) Download from Google Drive:`,
    `   ${WEIGHTS_MANUAL_URL}`,
    '',
    `2) Save the file as exactly:`,
    `   ${WEIGHTS_FILE}`,
    '',
    `3) Place it in this folder:`,
    `   ${weightsDir}`,
    '',
    '4) In the app, select mode "FloorPlanTo3D (Unity/API)" again.',
    '',
    'Note: Automatic download often fails when Google Drive returns a quota',
    'or virus-scan HTML page instead of the real .h5 file (~100MB+).',
    '',
  ].join('\n');
  try {
    fs.writeFileSync(readmePath, body, 'utf8');
  } catch { /* ignore */ }
}

/**
 * @param {string} [apiUrl]
 * @returns {Promise<boolean>}
 */
export function isFloorplanApiRunning(apiUrl = DEFAULT_API_URL) {
  return new Promise((resolve) => {
    try {
      const u = new URL(apiUrl);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port || 5000,
          path: '/',
          method: 'GET',
          timeout: 1200,
        },
        (res) => {
          res.resume();
          resolve(true);
        },
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

/**
 * @param {string} root
 */
export async function getFloorplanApiStatus(root = DEFAULT_PROJECT_ROOT) {
  const dir = floorplanApiDir(root);
  const installed = isFloorplanApiInstalled(root);
  const hasWeights = hasFloorplanApiWeights(root);
  const running = await isFloorplanApiRunning(DEFAULT_API_URL);
  const python = findPython();
  return {
    installed,
    hasWeights,
    running,
    path: dir,
    url: DEFAULT_API_URL,
    hasPython: Boolean(python),
    python: python ? `${python.cmd} ${python.args.join(' ')}`.trim() : '',
    processAlive: Boolean(apiProcess && !apiProcess.killed),
  };
}

function report(onProgress, percent, phase, message) {
  onProgress?.({
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    phase,
    message,
  });
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const err = new Error('canceled');
    err.code = 'CANCELED';
    throw err;
  }
}

function findPython() {
  return findCompatiblePython() || findAnyPython();
}

function findAnyPython() {
  const candidates = process.platform === 'win32'
    ? [
      { cmd: 'py', args: ['-3'] },
      { cmd: 'python', args: [] },
      { cmd: 'python3', args: [] },
    ]
    : [
      { cmd: 'python3', args: [] },
      { cmd: 'python', args: [] },
    ];
  for (const c of candidates) {
    const r = spawnSync(c.cmd, [...c.args, '--version'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (r.status === 0) return c;
  }
  return null;
}

/**
 * Prefer Python 3.10–3.12 (TensorFlow 2.16 wheel range used by our modern bundle).
 * @returns {{ cmd: string, args: string[], version?: string } | null}
 */
function findCompatiblePython() {
  const candidates = process.platform === 'win32'
    ? [
      { cmd: 'py', args: ['-3.12'] },
      { cmd: 'py', args: ['-3.11'] },
      { cmd: 'py', args: ['-3.10'] },
      { cmd: 'python3.12', args: [] },
      { cmd: 'python3.11', args: [] },
      { cmd: 'python3.10', args: [] },
      { cmd: 'py', args: ['-3'] },
      { cmd: 'python', args: [] },
      { cmd: 'python3', args: [] },
    ]
    : [
      { cmd: 'python3.12', args: [] },
      { cmd: 'python3.11', args: [] },
      { cmd: 'python3.10', args: [] },
      { cmd: 'python3', args: [] },
      { cmd: 'python', args: [] },
    ];

  for (const c of candidates) {
    const ver = getPythonVersion(c);
    if (!ver) continue;
    if (isCompatiblePythonVersion(ver)) {
      return { ...c, version: ver };
    }
  }
  return null;
}

/**
 * @param {{ cmd: string, args: string[] }} runner
 * @returns {string | null} e.g. "3.12"
 */
function getPythonVersion(runner) {
  const r = spawnSync(
    runner.cmd,
    [...runner.args, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (r.status !== 0) return null;
  const m = String(r.stdout || '').trim().match(/^(\d+\.\d+)/);
  return m ? m[1] : null;
}

/** @param {string} version */
function isCompatiblePythonVersion(version) {
  const [maj, min] = String(version).split('.').map((n) => Number(n));
  if (!Number.isFinite(maj) || !Number.isFinite(min)) return false;
  const lo = MIN_PYTHON[0] * 100 + MIN_PYTHON[1];
  const hi = MAX_PYTHON[0] * 100 + MAX_PYTHON[1];
  const cur = maj * 100 + min;
  return cur >= lo && cur <= hi;
}

/** Copy TF2 mrcnn + modern application.py into the API tree. */
function applyModernRuntimePatches(apiDir) {
  const mrcnnSrc = path.join(TF2_BUNDLE_DIR, 'mrcnn');
  const mrcnnDst = path.join(apiDir, 'mrcnn');
  if (!fs.existsSync(mrcnnSrc)) {
    throw new Error(`Missing TF2 bundle at ${mrcnnSrc}`);
  }
  fs.mkdirSync(mrcnnDst, { recursive: true });
  for (const name of fs.readdirSync(mrcnnSrc)) {
    const src = path.join(mrcnnSrc, name);
    if (!fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, path.join(mrcnnDst, name));
  }
  fs.copyFileSync(
    path.join(TF2_BUNDLE_DIR, 'application.py'),
    path.join(apiDir, 'application.py'),
  );
  fs.copyFileSync(
    path.join(TF2_BUNDLE_DIR, 'requirements-modern.txt'),
    path.join(apiDir, 'requirements-modern.txt'),
  );
}

function venvPython(apiDir) {
  if (process.platform === 'win32') {
    const p = path.join(apiDir, '.venv', 'Scripts', 'python.exe');
    return fs.existsSync(p) ? { cmd: p, args: [] } : null;
  }
  const p = path.join(apiDir, '.venv', 'bin', 'python');
  return fs.existsSync(p) ? { cmd: p, args: [] } : null;
}

function safeRemoveDir(dir) {
  if (!fs.existsSync(dir)) return { removed: true };
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    return { removed: true };
  } catch (err) {
    const trash = `${dir}.old-${Date.now()}`;
    try {
      fs.renameSync(dir, trash);
      try {
        fs.rmSync(trash, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch { /* ok */ }
      return { removed: true, renamedTo: trash };
    } catch (renameErr) {
      return { removed: false, error: renameErr?.message || err?.message || String(err) };
    }
  }
}

/**
 * Download/install sources, weights, deps; start Flask server.
 * @param {string} root
 * @param {{ onProgress?: Function, signal?: AbortSignal, apiUrl?: string }} [options]
 */
export async function ensureFloorplanApiReady(root = DEFAULT_PROJECT_ROOT, options = {}) {
  const { onProgress, signal, apiUrl = DEFAULT_API_URL } = options;
  const apiDir = floorplanApiDir(root);

  report(onProgress, 1, 'check', 'Checking FloorPlanTo3D-API…');
  throwIfAborted(signal);

  if (await isFloorplanApiRunning(apiUrl)) {
    report(onProgress, 100, 'done', 'FloorPlanTo3D-API is already running.');
    return {
      ok: true,
      alreadyRunning: true,
      path: apiDir,
      url: apiUrl,
      hasWeights: hasFloorplanApiWeights(root),
    };
  }

  if (!isFloorplanApiInstalled(root)) {
    await installSources(root, onProgress, signal);
  } else {
    report(onProgress, 35, 'check', 'Sources found.');
  }

  throwIfAborted(signal);
  const hostPython = findCompatiblePython();
  if (!hostPython) {
    const any = findAnyPython();
    const anyVer = any ? getPythonVersion(any) : null;
    throw new Error(
      'Compatible Python not found for FloorPlanTo3D-API.\n'
      + `Need Python ${MIN_PYTHON.join('.')}–${MAX_PYTHON.join('.')} `
      + '(TensorFlow 2.16 / Mask R-CNN TF2).\n'
      + (anyVer ? `Found Python ${anyVer}, which is outside that range.\n` : '')
      + 'Install Python 3.12 from https://www.python.org/downloads/ '
      + 'and ensure "py -3.12" works, then retry.',
    );
  }

  let venvPy = venvPython(apiDir);
  if (venvPy) {
    const venvVer = getPythonVersion(venvPy);
    if (!venvVer || !isCompatiblePythonVersion(venvVer)) {
      report(
        onProgress,
        36,
        'venv',
        `Recreating venv (was Python ${venvVer || '?'}; need ${MIN_PYTHON.join('.')}-${MAX_PYTHON.join('.')})…`,
      );
      const removed = safeRemoveDir(path.join(apiDir, '.venv'));
      if (!removed.removed) {
        throw new Error(`Could not remove incompatible .venv: ${removed.error || 'unknown error'}`);
      }
      try { fs.unlinkSync(path.join(apiDir, DEPS_MARKER)); } catch { /* ignore */ }
      venvPy = null;
    }
  }

  if (!venvPy) {
    report(
      onProgress,
      38,
      'venv',
      `Creating Python ${hostPython.version || ''} virtual environment…`,
    );
    await runProcess(
      hostPython.cmd,
      [...hostPython.args, '-m', 'venv', '.venv'],
      apiDir,
      signal,
    );
  }
  const runner = venvPython(apiDir);
  if (!runner) {
    throw new Error('Failed to create FloorPlanTo3D-API virtual environment.');
  }

  report(onProgress, 40, 'patch', 'Applying TensorFlow 2 / Flask runtime patches…');
  applyModernRuntimePatches(apiDir);

  const marker = path.join(apiDir, DEPS_MARKER);
  const markerOk = fs.existsSync(marker)
    && String(fs.readFileSync(marker, 'utf8')).includes(DEPS_MARKER_VERSION);
  if (!markerOk) {
    throwIfAborted(signal);
    report(onProgress, 42, 'install', 'Installing modern Python dependencies (TensorFlow 2)…');
    await runProcess(
      runner.cmd,
      [...runner.args, '-m', 'pip', 'install', '--upgrade', 'pip'],
      apiDir,
      signal,
    );
    await runPipInstall(runner, apiDir, signal, (p) => {
      report(onProgress, 42 + p * 28, 'install', 'Installing modern Python dependencies…');
    });
    fs.writeFileSync(marker, `${DEPS_MARKER_VERSION}\n${new Date().toISOString()}\n`, 'utf8');
  } else {
    report(onProgress, 70, 'install', 'Dependencies already prepared.');
  }

  throwIfAborted(signal);
  const weightsDir = path.join(apiDir, 'weights');
  fs.mkdirSync(weightsDir, { recursive: true });
  writeWeightsReadme(weightsDir);

  if (!hasFloorplanApiWeights(root)) {
    report(onProgress, 72, 'weights', 'Downloading model weights (Google Drive)…');
    try {
      await downloadWeights(apiDir, runner, signal, (p) => {
        report(onProgress, 72 + p * 18, 'weights', 'Downloading model weights…');
      });
    } catch (wErr) {
      if (wErr?.code === 'CANCELED' || signal?.aborted) throw wErr;
      writeWeightsReadme(weightsDir);
      report(onProgress, 0, 'error', 'Weights must be downloaded manually from Google Drive.');
      return {
        ok: false,
        needsManualWeights: true,
        weightsDir,
        weightsUrl: WEIGHTS_MANUAL_URL,
        path: apiDir,
        error:
          `Google Drive automatic download failed.\n`
          + `(${wErr?.message || wErr})\n\n`
          + `브라우저에서 가중치를 직접 받아 아래 폴더에 넣어 주세요.\n\n`
          + `1) ${WEIGHTS_MANUAL_URL}\n`
          + `2) 파일 이름을 정확히 ${WEIGHTS_FILE} 로 저장\n`
          + `3) 저장 위치:\n   ${weightsDir}\n`
          + '4) 앱에서 FloorPlanTo3D (Unity/API) 모드를 다시 선택',
      };
    }
  } else {
    report(onProgress, 90, 'weights', 'Model weights found.');
  }

  throwIfAborted(signal);
  report(onProgress, 92, 'start', 'Starting FloorPlanTo3D-API server (loading Mask R-CNN)…');
  await startApiServer(apiDir, runner, signal);
  // Model load from ~250MB weights can take several minutes on CPU.
  const ready = await waitForApi(apiUrl, 300000, signal, (p) => {
    report(onProgress, 92 + p * 7, 'start', 'Waiting for API (model load can take a few minutes)…');
  });
  if (!ready) {
    const tail = apiLog.trim().slice(-1600);
    throw new Error(
      'API process started but did not become ready on http://127.0.0.1:5000/.\n'
      + (tail ? `\n--- API log ---\n${tail}\n` : '')
      + '\nTip: FloorPlanTo3D-API needs Python 3.10–3.12 + TensorFlow 2.16.',
    );
  }

  report(onProgress, 100, 'done', 'FloorPlanTo3D-API is running.');
  return {
    ok: true,
    alreadyRunning: false,
    path: apiDir,
    url: apiUrl,
    hasWeights: hasFloorplanApiWeights(root),
  };
}

async function installSources(root, onProgress, signal) {
  const apiDir = floorplanApiDir(root);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fp3d-api-'));
  const zipPath = path.join(tmpRoot, 'FloorPlanTo3D-API-master.zip');

  try {
    report(onProgress, 3, 'download', 'Downloading FloorPlanTo3D-API from GitHub…');
    await downloadFile(ZIP_URL, zipPath, {
      signal,
      onProgress: (ratio) => {
        report(onProgress, 3 + ratio * 22, 'download', 'Downloading FloorPlanTo3D-API from GitHub…');
      },
    });

    throwIfAborted(signal);
    report(onProgress, 26, 'extract', 'Extracting archive…');
    const extractedTop = await extractZip(zipPath, tmpRoot, /FloorPlanTo3D-API/i);

    if (fs.existsSync(apiDir)) {
      safeRemoveDir(apiDir);
    }
    fs.mkdirSync(path.dirname(apiDir), { recursive: true });
    fs.cpSync(extractedTop, apiDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(apiDir, 'weights'), { recursive: true });
    report(onProgress, 34, 'extract', 'Source files ready.');
  } catch (err) {
    if (err?.code === 'CANCELED' || signal?.aborted) throw err;
    report(onProgress, 10, 'clone', 'Trying git clone fallback…');
    const cloneTmp = path.join(tmpRoot, 'clone');
    await gitClone(REPO_GIT, cloneTmp, signal, (p) => {
      report(onProgress, 10 + p * 20, 'clone', 'Cloning FloorPlanTo3D-API…');
    });
    if (fs.existsSync(apiDir)) safeRemoveDir(apiDir);
    fs.cpSync(cloneTmp, apiDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(apiDir, 'weights'), { recursive: true });
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch { /* ignore */ }
  }

  if (!isFloorplanApiInstalled(root)) {
    throw new Error('FloorPlanTo3D-API install finished but application.py was not found.');
  }
}

/**
 * @param {string} apiDir
 * @param {{ cmd: string, args: string[] }} runner
 * @param {AbortSignal} [signal]
 * @param {(ratio: number) => void} [onProgress]
 */
async function downloadWeights(apiDir, runner, signal, onProgress) {
  const destDir = path.join(apiDir, 'weights');
  fs.mkdirSync(destDir, { recursive: true });
  const destFile = path.join(destDir, WEIGHTS_FILE);
  if (fs.existsSync(destFile)) {
    try { fs.unlinkSync(destFile); } catch { /* ignore */ }
  }

  const errors = [];

  // 1) Official usercontent endpoint (works for many large Drive files)
  try {
    onProgress?.(0.05);
    await downloadGoogleDriveFile(WEIGHTS_DRIVE_ID, destFile, { signal, onProgress });
    assertValidWeightsFile(destFile);
    onProgress?.(1);
    return;
  } catch (err) {
    errors.push(`direct: ${err?.message || err}`);
    try { if (fs.existsSync(destFile)) fs.unlinkSync(destFile); } catch { /* ignore */ }
  }

  // 2) gdown (Python) — handles virus-scan / confirm pages
  try {
    onProgress?.(0.15);
    await downloadWeightsViaGdown(runner, destFile, signal, onProgress);
    assertValidWeightsFile(destFile);
    onProgress?.(1);
    return;
  } catch (err) {
    errors.push(`gdown: ${err?.message || err}`);
    try { if (fs.existsSync(destFile)) fs.unlinkSync(destFile); } catch { /* ignore */ }
  }

  throw new Error(errors.join(' | '));
}

/**
 * @param {string} filePath
 * @param {{ deleteInvalid?: boolean }} [opts]
 */
function assertValidWeightsFile(filePath, opts = {}) {
  const deleteInvalid = opts.deleteInvalid !== false;
  if (!fs.existsSync(filePath)) {
    throw new Error('Weights file was not created.');
  }
  const st = fs.statSync(filePath);
  if (st.size < MIN_WEIGHTS_BYTES) {
    // Often an HTML quarantine / login page
    let head = '';
    try {
      head = fs.readFileSync(filePath, { encoding: 'utf8' }).slice(0, 200);
    } catch { /* binary */ }
    if (deleteInvalid) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
    if (/<!DOCTYPE|<html|Google Drive|Quota exceeded|Sign in/i.test(head)) {
      throw new Error('Google Drive returned an HTML page instead of the .h5 weights (quota/virus-scan/login).');
    }
    throw new Error(`Weights file too small (${st.size} bytes); expected > ${MIN_WEIGHTS_BYTES}.`);
  }
  // HDF5 signature: \x89HDF\r\n\x1a\n
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  if (buf.toString('ascii', 1, 4) !== 'HDF') {
    if (deleteInvalid) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
    throw new Error('Downloaded file is not a valid HDF5 (.h5) weights file.');
  }
}

async function downloadWeightsViaGdown(runner, destFile, signal, onProgress) {
  onProgress?.(0.2);
  const apiDir = path.dirname(path.dirname(destFile));
  await runProcess(
    runner.cmd,
    [...runner.args, '-m', 'pip', 'install', '--quiet', 'gdown'],
    apiDir,
    signal,
  );
  onProgress?.(0.35);
  const attempts = [
    ['-m', 'gdown', '--id', WEIGHTS_DRIVE_ID, '-O', destFile],
    ['-m', 'gdown', '--fuzzy', WEIGHTS_MANUAL_URL, '-O', destFile],
  ];
  let lastErr = null;
  for (const args of attempts) {
    try {
      if (fs.existsSync(destFile)) {
        try { fs.unlinkSync(destFile); } catch { /* ignore */ }
      }
      await runProcess(runner.cmd, [...runner.args, ...args], apiDir, signal);
      onProgress?.(0.95);
      return;
    } catch (err) {
      if (err?.code === 'CANCELED' || signal?.aborted) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('gdown failed');
}

/**
 * @param {string} fileId
 * @param {string} destFile
 * @param {{ signal?: AbortSignal, onProgress?: (ratio: number) => void }} opts
 */
async function downloadGoogleDriveFile(fileId, destFile, opts = {}) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FloorPlanTo3D-ApiInstaller';
  const attempts = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
  ];

  let lastErr = null;
  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: opts.signal,
        headers: { 'User-Agent': ua },
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        continue;
      }

      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      if (ctype.includes('text/html')) {
        const html = await res.text();
        const cookies = collectSetCookies(res);
        const confirm = html.match(/confirm=([0-9A-Za-z_-]+)/)?.[1]
          || html.match(/name="confirm"\s+value="([^"]+)"/)?.[1]
          || 't';
        const uuid = html.match(/name="uuid"\s+value="([^"]+)"/)?.[1];
        const params = new URLSearchParams({
          export: 'download',
          id: fileId,
          confirm,
        });
        if (uuid) params.set('uuid', uuid);
        const confirmUrls = [
          `https://drive.usercontent.google.com/download?${params}`,
          `https://drive.google.com/uc?${params}`,
        ];
        let confirmed = false;
        for (const cu of confirmUrls) {
          const res2 = await fetch(cu, {
            redirect: 'follow',
            signal: opts.signal,
            headers: {
              'User-Agent': ua,
              ...(cookies ? { Cookie: cookies } : {}),
            },
          });
          if (!res2.ok) continue;
          const ctype2 = (res2.headers.get('content-type') || '').toLowerCase();
          if (ctype2.includes('text/html')) continue;
          await writeResponseToFile(res2, destFile, opts.onProgress);
          confirmed = true;
          break;
        }
        if (!confirmed) {
          lastErr = new Error('Google Drive virus-scan / confirm page could not be bypassed.');
          continue;
        }
        return;
      }

      await writeResponseToFile(res, destFile, opts.onProgress);
      return;
    } catch (err) {
      if (err?.code === 'CANCELED' || opts.signal?.aborted) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('Google Drive download failed.');
}

function collectSetCookies(res) {
  const raw = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [];
  const list = raw.length
    ? raw
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  if (!list.length) return '';
  return list
    .map((c) => String(c).split(';')[0])
    .filter(Boolean)
    .join('; ');
}

async function writeResponseToFile(res, destFile, onProgress) {
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destFile, buf);
    onProgress?.(1);
    return;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    received += value.byteLength;
    if (total > 0) onProgress?.(Math.min(1, received / total));
    else onProgress?.(Math.min(0.95, received / (80 * 1024 * 1024)));
  }
  fs.writeFileSync(destFile, Buffer.concat(chunks));
  onProgress?.(1);
}

async function downloadFile(url, destFile, opts = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: opts.signal,
    headers: { 'User-Agent': 'FloorPlanTo3D-ApiInstaller' },
  });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
  await writeResponseToFile(res, destFile, opts.onProgress);
}

async function extractZip(zipPath, destDir, nameHint) {
  const extractTo = path.join(destDir, 'extracted');
  fs.mkdirSync(extractTo, { recursive: true });

  const tarResult = spawnSync('tar', ['-xf', zipPath, '-C', extractTo], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (tarResult.status !== 0) {
    if (process.platform === 'win32') {
      const ps = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractTo.replace(/'/g, "''")}' -Force`,
        ],
        { encoding: 'utf8' },
      );
      if (ps.status !== 0) {
        throw new Error(`Failed to extract zip: ${ps.stderr || tarResult.stderr}`);
      }
    } else {
      throw new Error(`Failed to extract zip: ${tarResult.stderr || tarResult.status}`);
    }
  }

  const entries = fs.readdirSync(extractTo);
  const topName = entries.find((name) => {
    const full = path.join(extractTo, name);
    return fs.statSync(full).isDirectory() && nameHint.test(name);
  }) || entries.find((name) => fs.statSync(path.join(extractTo, name)).isDirectory());

  if (!topName) throw new Error('Zip archive did not contain FloorPlanTo3D-API folder.');
  return path.join(extractTo, topName);
}

function gitClone(url, dest, signal, onProgress) {
  if (fs.existsSync(dest)) {
    const cleared = safeRemoveDir(dest);
    if (!cleared.removed) {
      return Promise.reject(new Error(`Cannot clear clone target: ${cleared.error}`));
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      ['clone', '--depth', '1', '--progress', url, dest],
      { shell: process.platform === 'win32' },
    );
    const onAbort = () => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const handleChunk = (buf) => {
      const text = buf.toString();
      const m = text.match(/Receiving objects:\s+(\d+)%/);
      if (m) onProgress?.(Number(m[1]) / 100 * 0.85);
      const m2 = text.match(/Resolving deltas:\s+(\d+)%/);
      if (m2) onProgress?.(0.85 + (Number(m2[1]) / 100) * 0.15);
    };
    child.stderr?.on('data', handleChunk);
    child.stdout?.on('data', handleChunk);
    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        const err = new Error('canceled');
        err.code = 'CANCELED';
        reject(err);
        return;
      }
      if (code !== 0) reject(new Error(`git clone failed (exit ${code})`));
      else {
        onProgress?.(1);
        resolve();
      }
    });
  });
}

function runPipInstall(runner, cwd, signal, onPulse) {
  let pulse = 0;
  const timer = setInterval(() => {
    pulse = Math.min(0.95, pulse + 0.02);
    onPulse?.(pulse);
  }, 1500);
  const reqFile = fs.existsSync(path.join(cwd, 'requirements-modern.txt'))
    ? 'requirements-modern.txt'
    : 'requirements.txt';
  return runProcess(
    runner.cmd,
    [...runner.args, '-m', 'pip', 'install', '-r', reqFile],
    cwd,
    signal,
  ).finally(() => {
    clearInterval(timer);
    onPulse?.(1);
  });
}

function runProcess(command, args, cwd, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const onAbort = () => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    let errText = '';
    child.stderr?.on('data', (d) => { errText += d.toString(); });
    child.stdout?.on('data', (d) => { errText += d.toString(); });
    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        const err = new Error('canceled');
        err.code = 'CANCELED';
        reject(err);
        return;
      }
      if (code !== 0) {
        reject(new Error(`${path.basename(command)} failed (${code}): ${errText.slice(-1000)}`));
        return;
      }
      resolve();
    });
  });
}

async function startApiServer(apiDir, runner, signal) {
  throwIfAborted(signal);
  if (apiProcess && !apiProcess.killed) {
    try { apiProcess.kill('SIGTERM'); } catch { /* ignore */ }
    apiProcess = null;
  }
  apiLog = '';

  apiProcess = spawn(
    runner.cmd,
    [...runner.args, 'application.py'],
    {
      cwd: apiDir,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        TF_USE_LEGACY_KERAS: '1',
        TF_CPP_MIN_LOG_LEVEL: '2',
      },
      detached: false,
    },
  );

  const appendLog = (chunk) => {
    apiLog += chunk.toString();
    if (apiLog.length > 12000) apiLog = apiLog.slice(-10000);
  };
  apiProcess.stdout?.on('data', appendLog);
  apiProcess.stderr?.on('data', appendLog);

  apiProcess.on('exit', () => {
    if (apiProcess?.killed || apiProcess?.exitCode != null) {
      apiProcess = null;
    }
  });

  signal?.addEventListener('abort', () => {
    stopFloorplanApi();
  }, { once: true });
}

export function stopFloorplanApi() {
  if (apiProcess && !apiProcess.killed) {
    try { apiProcess.kill('SIGTERM'); } catch { /* ignore */ }
  }
  apiProcess = null;
}

async function waitForApi(apiUrl, timeoutMs, signal, onPulse) {
  const start = Date.now();
  let pulse = 0;
  while (Date.now() - start < timeoutMs) {
    throwIfAborted(signal);
    if (await isFloorplanApiRunning(apiUrl)) {
      onPulse?.(1);
      return true;
    }
    if (!apiProcess || apiProcess.exitCode != null) {
      return false;
    }
    pulse = Math.min(0.95, (Date.now() - start) / timeoutMs);
    onPulse?.(pulse);
    await sleep(800);
  }
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
