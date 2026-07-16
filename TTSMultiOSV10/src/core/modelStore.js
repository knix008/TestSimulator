import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { getModelCatalog } from './modelCatalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HF_API_BASE = 'https://huggingface.co/api/models';
const HF_CDN_BASE = 'https://huggingface.co';
const DOWNLOAD_MAX_ATTEMPTS = 6;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCauseChain(error) {
  const parts = [];
  let cur = error;
  for (let i = 0; i < 5 && cur; i += 1) {
    parts.push(cur.code || cur.message || String(cur));
    cur = cur.cause;
  }
  return parts.join(' | ');
}

function isRetryableNetworkError(error) {
  const text = errorCauseChain(error).toLowerCase();
  return (
    text.includes('fetch failed')
    || text.includes('econnreset')
    || text.includes('econnrefused')
    || text.includes('etimedout')
    || text.includes('enotfound')
    || text.includes('socket')
    || text.includes('network')
    || text.includes('aborted')
    || text.includes('und_err')
    || text.includes('other side closed')
  );
}

function formatDownloadError(error, fileUrl = '') {
  const detail = errorCauseChain(error);
  return new Error(
    `HuggingFace 다운로드 중 네트워크 오류가 발생했습니다.\n`
    + `잠시 후 다시 시도하세요. (이미 받은 파일은 유지됩니다)\n\n`
    + (fileUrl ? `파일: ${fileUrl}\n` : '')
    + `상세: ${detail}`,
  );
}

async function fetchWithRetry(url, options = {}, { attempts = DOWNLOAD_MAX_ATTEMPTS, label = url } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DOWNLOAD_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          redirect: 'follow',
          headers: {
            'User-Agent': 'TTSMultiOSV10/0.1 (Electron)',
            ...(options.headers || {}),
          },
        });
        return response;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt >= attempts) break;
      const delay = Math.min(10000, 600 * (2 ** (attempt - 1)));
      console.warn(`[Download] 네트워크 재시도 ${attempt}/${attempts}: ${label} (${errorCauseChain(error)})`);
      await sleep(delay);
    }
  }
  throw formatDownloadError(lastError, label);
}

function resolveCacheRoot() {
  if (typeof process !== 'undefined' && process.env && (process.env.APPDATA || process.env.HOME || process.env.USERPROFILE)) {
    const base = process.env.APPDATA || process.env.HOME || process.env.USERPROFILE;
    return path.join(base, 'TTSMultiOSV10', 'models');
  }
  return path.join(__dirname, '..', '..', 'models');
}

function getModelRoot(cacheRoot, model) {
  return path.join(cacheRoot, model.id);
}

function getManifestPath(cacheRoot, model) {
  return path.join(cacheRoot, model.id, '.download-manifest.json');
}

function shouldSkipFile(filePath) {
  const base = filePath.split('/').pop();
  // 메타데이터 / 이미지 / 오디오 샘플 스킵
  if (
    base === '.gitattributes'
    || base === 'README.md'
    || base === 'LICENSE'
    || base === 'NOTICE'
    || base === 'CHANGELOG.md'
  ) return true;

  const lower = filePath.toLowerCase();
  const skipExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
    '.md', '.txt.bz2', '.flac', '.mp3', '.wav', '.ogg',
    '.safetensors', '.msgpack'];
  return skipExts.some((ext) => lower.endsWith(ext));
}

/** Keep tokenizer/config; optionally trim ONNX variants and voice packs. */
function selectDownloadFiles(model, files) {
  let selected = files.slice();

  const preferred = model.source?.preferOnnx;
  if (Array.isArray(preferred) && preferred.length) {
    const nonOnnx = selected.filter((f) => !f.toLowerCase().endsWith('.onnx'));
    const selectedOnnx = preferred.filter((p) => selected.includes(p));
    if (selectedOnnx.length) {
      selected = [...nonOnnx, ...selectedOnnx];
    } else {
      const anyOnnx = selected.find((f) => f.toLowerCase().endsWith('.onnx'));
      selected = anyOnnx ? [...nonOnnx, anyOnnx] : nonOnnx;
    }
  }

  const voiceNames = model.source?.preferVoices;
  const voicePrefixes = model.source?.voicePrefixes;
  if (
    (Array.isArray(voiceNames) && voiceNames.length)
    || (Array.isArray(voicePrefixes) && voicePrefixes.length)
  ) {
    selected = selected.filter((f) => {
      if (!f.startsWith('voices/')) return true;
      const base = f.slice('voices/'.length).replace(/\.bin$/i, '');
      if (voiceNames?.some((n) => n.replace(/\.bin$/i, '') === base)) return true;
      if (voicePrefixes?.some((p) => base.startsWith(p))) return true;
      return false;
    });
  }

  return selected;
}

function hfResolveUrl(repoId, filePath) {
  const encoded = String(filePath)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${HF_CDN_BASE}/${repoId}/resolve/main/${encoded}?download=true`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(manifestPath) {
  try {
    return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

/** True when cache manifest matches the catalog source repo / package variant. */
async function isCachedModelCurrent(model, cacheRoot) {
  const manifest = await readManifest(getManifestPath(cacheRoot, model));
  if (!manifest) return false;
  const expectedRepo = model.source?.repoId;
  if (expectedRepo && manifest.repoId && manifest.repoId !== expectedRepo) {
    return false;
  }
  const expectedPkg = model.source?.packageId;
  if (expectedPkg && manifest.packageId !== expectedPkg) {
    return false;
  }
  return true;
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url, {}, { label: url });
  if (!response.ok) {
    throw new Error(
      `HuggingFace API 오류 (${response.status} ${response.statusText})\n`
      + `URL: ${url}\n`
      + `레포지터리가 존재하지 않거나 비공개일 수 있습니다.`,
    );
  }
  return response.json();
}

/** Recursive tree listing with file sizes (LFS-aware). */
async function listRepoTree(repoId) {
  const files = [];
  let cursor = null;
  for (let page = 0; page < 50; page += 1) {
    const url = new URL(`${HF_API_BASE}/${repoId}/tree/main`);
    url.searchParams.set('recursive', 'true');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetchWithRetry(url.href, {}, { label: `tree:${repoId}` });
    if (!response.ok) {
      throw new Error(
        `HuggingFace tree API 오류 (${response.status} ${response.statusText})\n`
        + `레포: ${repoId}`,
      );
    }

    const entries = await response.json();
    if (!Array.isArray(entries)) break;

    for (const entry of entries) {
      if (entry?.type === 'file' && entry.path) {
        files.push({
          path: entry.path,
          size: Number(entry.size || entry.lfs?.size || 0) || 0,
        });
      }
    }

    const link = response.headers.get('link') || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/i);
    if (!next) break;
    try {
      cursor = new URL(next[1]).searchParams.get('cursor');
    } catch {
      break;
    }
    if (!cursor) break;
  }
  return files;
}

function emitProgress(onProgress, progressState, extra = {}) {
  const total = progressState.totalBytes;
  const current = progressState.completedBytes + (progressState.fileReceived || 0);
  let percent = 0;
  if (total > 0) {
    percent = Math.min(99, Math.round((current / total) * 100));
  } else if (progressState.totalFiles > 0) {
    percent = Math.min(
      99,
      Math.round(((progressState.completedFiles + 0.5) / progressState.totalFiles) * 100),
    );
  }
  onProgress?.({
    phase: 'download',
    percent,
    receivedBytes: current,
    totalBytes: total,
    modelId: progressState.modelId,
    model: progressState.model,
    downloaded: true,
    fileName: progressState.fileName,
    ...extra,
  });
}

async function fileSizeOrZero(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.size;
  } catch {
    return 0;
  }
}

async function downloadFileOnce(fileUrl, targetPath, onProgress, progressState, knownSize = 0) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const partPath = `${targetPath}.part`;
  let startAt = await fileSizeOrZero(partPath);
  // If a finished file already has the expected size, treat as done.
  const existing = await fileSizeOrZero(targetPath);
  if (existing > 0 && (knownSize <= 0 || existing === knownSize)) {
    progressState.completedBytes += existing;
    progressState.completedFiles += 1;
    progressState.fileReceived = 0;
    emitProgress(onProgress, progressState);
    return existing;
  }

  const headers = {};
  if (startAt > 0) headers.Range = `bytes=${startAt}-`;

  const response = await fetchWithRetry(fileUrl, { headers }, { label: fileUrl });

  // Server ignored Range and sent full body — restart part file.
  if (startAt > 0 && response.status === 200) {
    startAt = 0;
    await fs.rm(partPath, { force: true }).catch(() => {});
  }

  if (!(response.ok || response.status === 206)) {
    throw new Error(
      `파일 다운로드 실패: ${response.status} ${response.statusText}\n`
      + `URL: ${fileUrl}`,
    );
  }

  const headerSize = Number(response.headers.get('content-length') || 0);
  const totalFromRange = (() => {
    const cr = response.headers.get('content-range');
    const m = cr && /\/(\d+)\s*$/.exec(cr);
    return m ? Number(m[1]) : 0;
  })();
  const expectedTotal = knownSize > 0
    ? knownSize
    : (totalFromRange || (headerSize > 0 ? startAt + headerSize : 0));

  if (knownSize <= 0 && expectedTotal > 0) {
    // Avoid double-counting if we already added this file size earlier.
    const already = progressState._sizedFiles?.has(targetPath);
    if (!already) {
      progressState.totalBytes += expectedTotal;
      progressState._sizedFiles?.add(targetPath);
    }
  }

  progressState.fileReceived = startAt;
  let lastEmitAt = 0;
  let lastEmitPercent = -1;

  const maybeEmit = () => {
    const now = Date.now();
    const total = progressState.totalBytes;
    const current = progressState.completedBytes + progressState.fileReceived;
    const percent = total > 0 ? Math.min(99, Math.round((current / total) * 100)) : 0;
    if (now - lastEmitAt < 250 && percent === lastEmitPercent) return;
    lastEmitAt = now;
    lastEmitPercent = percent;
    emitProgress(onProgress, progressState);
  };

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (startAt > 0) {
      const fh = await fs.open(partPath, 'a');
      try { await fh.write(buffer); } finally { await fh.close(); }
      progressState.fileReceived = startAt + buffer.length;
    } else {
      await fs.writeFile(partPath, buffer);
      progressState.fileReceived = buffer.length;
    }
  } else {
    const nodeStream = Readable.fromWeb(response.body);
    const writeStream = createWriteStream(partPath, { flags: startAt > 0 ? 'a' : 'w' });

    nodeStream.on('data', (chunk) => {
      const n = chunk?.length || 0;
      if (n) {
        progressState.fileReceived += n;
        maybeEmit();
      }
    });

    try {
      await pipeline(nodeStream, writeStream);
    } catch (error) {
      // Keep .part for resume on retry.
      throw error;
    }
  }

  const written = progressState.fileReceived;
  if (expectedTotal > 0 && written < expectedTotal) {
    throw new Error(
      `다운로드가 중간에 끊겼습니다 (${written}/${expectedTotal} bytes)\nURL: ${fileUrl}`,
    );
  }

  await fs.rm(targetPath, { force: true }).catch(() => {});
  await fs.rename(partPath, targetPath);
  progressState.completedBytes += written;
  progressState.completedFiles += 1;
  progressState.fileReceived = 0;
  emitProgress(onProgress, progressState);
  return written;
}

async function downloadFile(fileUrl, targetPath, onProgress, progressState, knownSize = 0) {
  let lastError = null;
  for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await downloadFileOnce(fileUrl, targetPath, onProgress, progressState, knownSize);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableNetworkError(error)
        || /끊겼|ECONNRESET|fetch failed|aborted/i.test(String(error?.message || error));
      if (!retryable || attempt >= DOWNLOAD_MAX_ATTEMPTS) break;
      const delay = Math.min(12000, 800 * (2 ** (attempt - 1)));
      console.warn(
        `[Download] 파일 재시도 ${attempt}/${DOWNLOAD_MAX_ATTEMPTS}: `
        + `${progressState.fileName || targetPath} (${errorCauseChain(error)})`,
      );
      onProgress?.({
        phase: 'download',
        percent: Math.min(
          99,
          progressState.totalBytes > 0
            ? Math.round(((progressState.completedBytes + (progressState.fileReceived || 0))
              / progressState.totalBytes) * 100)
            : 0,
        ),
        receivedBytes: progressState.completedBytes + (progressState.fileReceived || 0),
        totalBytes: progressState.totalBytes,
        modelId: progressState.modelId,
        model: progressState.model,
        downloaded: true,
        fileName: `${progressState.fileName || ''} (재시도 ${attempt}/${DOWNLOAD_MAX_ATTEMPTS})`,
      });
      await sleep(delay);
    }
  }
  throw formatDownloadError(lastError, fileUrl);
}

async function downloadRepoModel(model, cacheRoot, onProgress) {
  const modelRoot = getModelRoot(cacheRoot, model);
  const manifestPath = getManifestPath(cacheRoot, model);

  if (await isCachedModelCurrent(model, cacheRoot)) {
    onProgress?.({ phase: 'done', percent: 100, modelId: model.id, model, downloaded: false });
    return { model, modelPath: modelRoot, downloaded: false };
  }

  // Wrong package/repo only: wipe. Otherwise resume partial downloads.
  const existingManifest = await readManifest(manifestPath);
  if (existingManifest) {
    const wrongRepo = model.source?.repoId && existingManifest.repoId !== model.source.repoId;
    const wrongPkg = model.source?.packageId
      && existingManifest.packageId !== model.source.packageId;
    if (wrongRepo || wrongPkg) {
      console.log(`[Download] 캐시 갱신: ${model.id} → ${model.source.repoId}`);
      await fs.rm(modelRoot, { recursive: true, force: true }).catch(() => {});
    } else {
      // Incomplete previous run left a stale manifest — remove marker and resume files.
      await fs.rm(manifestPath, { force: true }).catch(() => {});
    }
  }

  onProgress?.({ phase: 'start', percent: 0, modelId: model.id, model, downloaded: true });

  let tree = [];
  try {
    tree = await listRepoTree(model.source.repoId);
  } catch (error) {
    console.warn(`[Download] tree API 실패, siblings로 대체: ${error?.message || error}`);
    const metadata = await fetchJson(`${HF_API_BASE}/${model.source.repoId}`);
    tree = (metadata.siblings || []).map((entry) => ({
      path: entry.rfilename,
      size: 0,
    }));
  }

  const selectedPaths = selectDownloadFiles(
    model,
    tree.map((e) => e.path).filter((f) => f && !shouldSkipFile(f)),
  );
  const sizeByPath = new Map(tree.map((e) => [e.path, e.size || 0]));
  const files = selectedPaths.map((filePath) => ({
    filePath,
    fileUrl: hfResolveUrl(model.source.repoId, filePath),
    size: sizeByPath.get(filePath) || 0,
  }));

  if (!files.length) {
    throw new Error(
      `다운로드 가능한 파일을 찾지 못했습니다: ${model.label}\n`
      + `레포: ${model.source.repoId}`,
    );
  }

  const totalBytes = files.reduce((sum, e) => sum + (e.size || 0), 0);
  console.log(
    `[Download] ${model.id}: ${files.length} files, ~${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
  );
  for (const f of files) {
    if (f.filePath.toLowerCase().endsWith('.onnx')) {
      console.log(`[Download] ONNX: ${f.filePath} (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
    }
  }

  const progressState = {
    completedBytes: 0,
    completedFiles: 0,
    fileReceived: 0,
    totalBytes,
    totalFiles: files.length,
    modelId: model.id,
    model,
    fileName: '',
    _sizedFiles: new Set(),
  };

  await fs.mkdir(modelRoot, { recursive: true });

  for (const entry of files) {
    const targetPath = path.join(modelRoot, entry.filePath);
    progressState.fileName = entry.filePath;
    const existing = await fileSizeOrZero(targetPath);
    if (existing > 0 && (entry.size <= 0 || existing === entry.size)) {
      console.log(`[Download] 스킵(완료): ${entry.filePath}`);
      progressState.completedBytes += existing;
      progressState.completedFiles += 1;
      progressState.fileReceived = 0;
      emitProgress(onProgress, progressState);
      continue;
    }
    console.log(`[Download] 받는 중: ${entry.filePath}`);
    await downloadFile(entry.fileUrl, targetPath, onProgress, progressState, entry.size);
  }

  await fs.writeFile(manifestPath, JSON.stringify({
    modelId: model.id,
    repoId: model.source.repoId,
    packageId: model.source.packageId || null,
    downloadedAt: new Date().toISOString(),
    files: files.map((f) => f.filePath),
    totalBytes: progressState.completedBytes || totalBytes,
  }, null, 2));

  onProgress?.({ phase: 'done', percent: 100, modelId: model.id, model, downloaded: true });
  return { model, modelPath: modelRoot, downloaded: true };
}

export function createModelStore() {
  const cacheRoot = resolveCacheRoot();

  return {
    cacheRoot,

    async listCachedModels() {
      const catalog = getModelCatalog();
      return Promise.all(
        catalog.map(async (model) => {
          const downloaded = await isCachedModelCurrent(model, cacheRoot);
          return { ...model, modelPath: getModelRoot(cacheRoot, model), downloaded };
        }),
      );
    },

    async ensureModelAvailable(modelId, onProgress = null) {
      const model = getModelCatalog().find((m) => m.id === modelId);
      if (!model) throw new Error(`알 수 없는 모델: ${modelId}`);

      await fs.mkdir(cacheRoot, { recursive: true });

      if (model.source?.type === 'repo') {
        return downloadRepoModel(model, cacheRoot, onProgress);
      }

      throw new Error(`지원하지 않는 소스 타입: ${model.source?.type}`);
    },

    async listModels() {
      return getModelCatalog();
    },
  };
}
