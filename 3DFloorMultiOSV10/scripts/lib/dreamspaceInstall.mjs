/**
 * Download + scaffold DreamSpaceAI from GitHub with progress callbacks.
 * Used by Electron IPC and the Vite dev middleware.
 *
 * Robust on Windows: overlays sources without requiring a full delete of a
 * locked node_modules / .next tree.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** FloorPlanTo3D project root (always — not the install destination). */
export const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '../..');

const ZIP_URL = 'https://github.com/jevintanjh/DreamSpaceAI/archive/refs/heads/main.zip';
const REPO_GIT = 'https://github.com/jevintanjh/DreamSpaceAI.git';

const UPSTREAM_FILES = [
  'floorPlanProcessor.ts',
  '3dConversionEngine.ts',
  'testData.ts',
  'textureLibrary.ts',
  'Scene.tsx',
  'FloorPlan3D.tsx',
  'CustomizationPanel.tsx',
  'UploadFloorPlan.tsx',
  'page.tsx',
  'README.md',
];

/**
 * @param {string} root
 */
export function dreamspaceDir(root = DEFAULT_PROJECT_ROOT) {
  return path.join(root, 'DreamSpaceAI');
}

/**
 * @param {string} root
 */
export function isDreamspaceInstalled(root = DEFAULT_PROJECT_ROOT) {
  const ds = dreamspaceDir(root);
  return (
    fs.existsSync(path.join(ds, 'floorPlanProcessor.ts'))
    || fs.existsSync(path.join(ds, 'lib', 'floorPlanProcessor.ts'))
  );
}

/**
 * @param {string} root
 */
export function getDreamspaceStatus(root = DEFAULT_PROJECT_ROOT) {
  const dir = dreamspaceDir(root);
  const installed = isDreamspaceInstalled(root);
  return {
    installed,
    path: dir,
    hasNodeModules: fs.existsSync(path.join(dir, 'node_modules')),
    broken: fs.existsSync(dir) && !installed,
  };
}

/**
 * @param {(info: { percent: number, phase: string, message: string }) => void} onProgress
 * @param {number} percent
 * @param {string} phase
 * @param {string} message
 */
function report(onProgress, percent, phase, message) {
  onProgress?.({
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    phase,
    message,
  });
}

function setupScriptPath(projectRoot) {
  return path.join(projectRoot, 'scripts', 'setup-dreamspace.mjs');
}

/**
 * Best-effort remove. On Windows file locks, rename the folder aside.
 * @param {string} dir
 */
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
      } catch {
        /* leftover trash is OK */
      }
      return { removed: true, renamedTo: trash };
    } catch (renameErr) {
      return {
        removed: false,
        error: renameErr?.message || err?.message || String(err),
      };
    }
  }
}

/**
 * Overlay upstream extract into DreamSpaceAI without deleting locked deps.
 * @param {string} extractedTop
 * @param {string} dest
 */
function overlaySources(extractedTop, dest) {
  fs.mkdirSync(dest, { recursive: true });
  // Full tree copy (force overwrite). Locked files that can't be replaced are skipped.
  copyDirBestEffort(extractedTop, dest);

  // Ensure critical sources landed (root or already under lib/)
  for (const name of UPSTREAM_FILES) {
    const from = path.join(extractedTop, name);
    if (!fs.existsSync(from)) continue;
    const toRoot = path.join(dest, name);
    try {
      fs.copyFileSync(from, toRoot);
    } catch {
      /* ignore individual lock */
    }
  }

  if (
    !fs.existsSync(path.join(dest, 'floorPlanProcessor.ts'))
    && !fs.existsSync(path.join(dest, 'lib', 'floorPlanProcessor.ts'))
  ) {
    // Last resort: write processor from extract read
    const from = path.join(extractedTop, 'floorPlanProcessor.ts');
    if (!fs.existsSync(from)) {
      throw new Error('Downloaded archive is missing floorPlanProcessor.ts');
    }
    fs.mkdirSync(path.join(dest, 'lib'), { recursive: true });
    fs.copyFileSync(from, path.join(dest, 'lib', 'floorPlanProcessor.ts'));
  }
}

function copyDirBestEffort(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    // Never wipe user's existing heavy trees mid-copy via delete; just overlay
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    try {
      if (entry.isDirectory()) {
        copyDirBestEffort(from, to);
      } else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
    } catch {
      /* locked file — skip */
    }
  }
}

/**
 * @param {string} root FloorPlanTo3D project root
 * @param {{ onProgress?: Function, signal?: AbortSignal, skipNpmInstall?: boolean }} [options]
 */
export async function ensureDreamspaceInstalled(root = DEFAULT_PROJECT_ROOT, options = {}) {
  const { onProgress, signal, skipNpmInstall = false } = options;
  const projectRoot = root;
  const dest = dreamspaceDir(projectRoot);
  const setupJs = setupScriptPath(projectRoot);

  const throwIfAborted = () => {
    if (signal?.aborted) {
      const err = new Error('canceled');
      err.code = 'CANCELED';
      throw err;
    }
  };

  report(onProgress, 1, 'check', 'Checking DreamSpaceAI…');
  if (isDreamspaceInstalled(projectRoot)) {
    report(onProgress, 100, 'done', 'DreamSpaceAI is already installed.');
    return { ok: true, alreadyInstalled: true, path: dest };
  }

  if (!fs.existsSync(setupJs)) {
    throw new Error(`Setup script missing: ${setupJs}`);
  }

  throwIfAborted();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fp3d-dreamspace-'));
  const zipPath = path.join(tmpRoot, 'DreamSpaceAI-main.zip');

  try {
    report(onProgress, 3, 'download', 'Downloading from GitHub…');
    await downloadFile(ZIP_URL, zipPath, {
      signal,
      onProgress: (ratio) => {
        report(onProgress, 3 + ratio * 62, 'download', 'Downloading from GitHub…');
      },
    });

    throwIfAborted();
    report(onProgress, 68, 'extract', 'Extracting archive…');
    const extractedTop = await extractZip(zipPath, tmpRoot);
    throwIfAborted();

    report(onProgress, 72, 'extract', 'Installing source files…');
    // Prefer overlay (works with locked node_modules). If dest is absent, copy fresh.
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(extractedTop, dest, { recursive: true, force: true });
    } else {
      // Broken partial install — try soft clear of non-locked junk, then overlay
      for (const name of ['lib', 'app', 'components', 'public', 'samples']) {
        const p = path.join(dest, name);
        if (fs.existsSync(p) && !isDreamspaceInstalled(projectRoot)) {
          safeRemoveDir(p);
        }
      }
      overlaySources(extractedTop, dest);
    }
    report(onProgress, 82, 'extract', 'Source files ready.');

    throwIfAborted();
    report(onProgress, 86, 'setup', 'Scaffolding local Next.js app…');
    await runNodeScript(setupJs, projectRoot, signal);
    report(onProgress, 92, 'setup', 'Scaffold complete.');

    const needNpm = !skipNpmInstall && !fs.existsSync(path.join(dest, 'node_modules'));
    if (!skipNpmInstall && (needNpm || !fs.existsSync(path.join(dest, 'package-lock.json')))) {
      throwIfAborted();
      report(onProgress, 93, 'install', 'Installing npm dependencies…');
      try {
        await runNpmInstall(dest, signal, (p) => {
          report(onProgress, 93 + p * 6, 'install', 'Installing npm dependencies…');
        });
      } catch (npmErr) {
        // Sources are enough for in-app DreamSpace mode; deps are for the separate UI
        report(
          onProgress,
          98,
          'install',
          `npm install warning: ${npmErr?.message || npmErr}`,
        );
      }
    }

    if (!isDreamspaceInstalled(projectRoot)) {
      throw new Error('DreamSpaceAI install finished but sources were not found.');
    }

    report(onProgress, 100, 'done', 'DreamSpaceAI install complete.');
    return { ok: true, alreadyInstalled: false, path: dest };
  } catch (err) {
    if (err?.code === 'CANCELED' || signal?.aborted) {
      report(onProgress, 0, 'canceled', 'Canceled.');
      return { ok: false, canceled: true };
    }

    // Fallback: git clone into a fresh side folder, then overlay
    if (!isDreamspaceInstalled(projectRoot)) {
      try {
        report(onProgress, 25, 'clone', 'Trying git clone fallback…');
        const cloneTmp = path.join(tmpRoot, 'clone');
        await gitClone(REPO_GIT, cloneTmp, signal, (p) => {
          report(onProgress, 25 + p * 45, 'clone', 'Cloning from GitHub…');
        });
        overlaySources(cloneTmp, dest);
        report(onProgress, 80, 'setup', 'Scaffolding local Next.js app…');
        await runNodeScript(setupJs, projectRoot, signal);
        if (!skipNpmInstall && !fs.existsSync(path.join(dest, 'node_modules'))) {
          report(onProgress, 90, 'install', 'Installing npm dependencies…');
          try {
            await runNpmInstall(dest, signal, (p) => {
              report(onProgress, 90 + p * 9, 'install', 'Installing npm dependencies…');
            });
          } catch {
            /* optional */
          }
        }
        if (!isDreamspaceInstalled(projectRoot)) {
          throw new Error('git clone fallback did not produce sources');
        }
        report(onProgress, 100, 'done', 'DreamSpaceAI install complete.');
        return { ok: true, alreadyInstalled: false, path: dest, via: 'git' };
      } catch (cloneErr) {
        const message = err?.message || String(err);
        const detail = cloneErr?.message || String(cloneErr);
        throw new Error(`${message}\nFallback: ${detail}`);
      }
    }
    throw err;
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {string} url
 * @param {string} destFile
 * @param {{ signal?: AbortSignal, onProgress?: (ratio: number) => void }} opts
 */
async function downloadFile(url, destFile, opts = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: opts.signal,
    headers: { 'User-Agent': 'FloorPlanTo3D-DreamSpaceInstaller' },
  });
  if (!res.ok) {
    throw new Error(`GitHub download failed (HTTP ${res.status})`);
  }
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destFile, buf);
    opts.onProgress?.(1);
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
    if (total > 0) opts.onProgress?.(Math.min(1, received / total));
    else opts.onProgress?.(Math.min(0.95, received / (5 * 1024 * 1024)));
  }
  fs.writeFileSync(destFile, Buffer.concat(chunks));
  opts.onProgress?.(1);
}

/**
 * @param {string} zipPath
 * @param {string} destDir
 * @returns {Promise<string>} path to extracted top-level folder
 */
async function extractZip(zipPath, destDir) {
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
        throw new Error(
          `Failed to extract zip.\ntar: ${tarResult.stderr || tarResult.stdout}\npowershell: ${ps.stderr || ps.stdout}`,
        );
      }
    } else {
      throw new Error(`Failed to extract zip: ${tarResult.stderr || tarResult.stdout || tarResult.status}`);
    }
  }

  const entries = fs.readdirSync(extractTo);
  const topName = entries.find((name) => {
    const full = path.join(extractTo, name);
    return fs.statSync(full).isDirectory() && /DreamSpaceAI/i.test(name);
  }) || entries.find((name) => fs.statSync(path.join(extractTo, name)).isDirectory());

  if (!topName) {
    throw new Error('Zip archive did not contain DreamSpaceAI folder.');
  }
  return path.join(extractTo, topName);
}

function runNodeScript(scriptPath, cwd, signal) {
  return runProcess(process.execPath, [scriptPath], cwd, signal);
}

function runNpmInstall(cwd, signal, onPulse) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let pulse = 0;
  const timer = setInterval(() => {
    pulse = Math.min(0.95, pulse + 0.04);
    onPulse?.(pulse);
  }, 800);
  return runProcess(npmCmd, ['install'], cwd, signal, { shell: true }).finally(() => {
    clearInterval(timer);
    onPulse?.(1);
  });
}

/**
 * @param {string} url
 * @param {string} dest
 * @param {AbortSignal} [signal]
 * @param {(ratio: number) => void} [onProgress]
 */
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

function runProcess(command, args, cwd, signal, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: Boolean(opts.shell),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const onAbort = () => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    let errText = '';
    child.stderr?.on('data', (d) => { errText += d.toString(); });
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
        reject(new Error(`${path.basename(command)} ${args.join(' ')} failed (${code}): ${errText.slice(-800)}`));
        return;
      }
      resolve();
    });
  });
}
