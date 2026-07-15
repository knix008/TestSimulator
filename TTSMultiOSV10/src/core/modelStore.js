import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getModelCatalog } from './modelCatalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HF_API_BASE = 'https://huggingface.co/api/models';
const HF_CDN_BASE = 'https://huggingface.co';

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

/** True when cache manifest matches the catalog source repo. */
async function isCachedModelCurrent(model, cacheRoot) {
  const manifest = await readManifest(getManifestPath(cacheRoot, model));
  if (!manifest) return false;
  const expectedRepo = model.source?.repoId;
  if (expectedRepo && manifest.repoId && manifest.repoId !== expectedRepo) {
    return false;
  }
  return true;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'TTSMultiOSV10/0.1 (Electron)' }
  });
  if (!response.ok) {
    throw new Error(
      `HuggingFace API 오류 (${response.status} ${response.statusText})\n`
      + `URL: ${url}\n`
      + `레포지터리가 존재하지 않거나 비공개일 수 있습니다.`
    );
  }
  return response.json();
}

async function fetchFileSize(fileUrl) {
  try {
    const res = await fetch(fileUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': 'TTSMultiOSV10/0.1 (Electron)' }
    });
    const len = Number(res.headers.get('content-length') || 0);
    return Number.isFinite(len) && len > 0 ? len : 0;
  } catch {
    return 0;
  }
}

async function downloadFile(fileUrl, targetPath, onProgress, progressState) {
  const response = await fetch(fileUrl, {
    headers: { 'User-Agent': 'TTSMultiOSV10/0.1 (Electron)' }
  });
  if (!response.ok) {
    throw new Error(
      `파일 다운로드 실패: ${response.status} ${response.statusText}\n`
      + `URL: ${fileUrl}`
    );
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(targetPath, buffer);
    progressState.completedBytes += buffer.length;
    progressState.completedFiles += 1;
    return buffer.length;
  }

  const chunks = [];
  const reader = response.body.getReader();
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) {
      chunks.push(Buffer.from(value));
      receivedBytes += value.length;
      const currentBytes = progressState.completedBytes + receivedBytes;
      const percent = progressState.totalBytes > 0
        ? Math.min(99, Math.round((currentBytes / progressState.totalBytes) * 100))
        : Math.min(99, Math.round(((progressState.completedFiles + 0.5) / progressState.totalFiles) * 100));
      onProgress?.({
        phase: 'download',
        percent,
        receivedBytes: currentBytes,
        totalBytes: progressState.totalBytes,
        modelId: progressState.modelId,
        model: progressState.model,
        downloaded: true,
        fileName: progressState.fileName
      });
    }
  }

  const buffer = Buffer.concat(chunks);
  await fs.writeFile(targetPath, buffer);
  progressState.completedBytes += buffer.length;
  progressState.completedFiles += 1;
  return buffer.length;
}

async function downloadRepoModel(model, cacheRoot, onProgress) {
  const modelRoot = getModelRoot(cacheRoot, model);
  const manifestPath = getManifestPath(cacheRoot, model);

  if (await isCachedModelCurrent(model, cacheRoot)) {
    onProgress?.({ phase: 'done', percent: 100, modelId: model.id, model, downloaded: false });
    return { model, modelPath: modelRoot, downloaded: false };
  }

  // Stale cache (e.g. Supertonic 2 → 3): wipe so files cannot mix.
  if (await fileExists(manifestPath) || await fileExists(modelRoot)) {
    console.log(`[Download] 캐시 갱신: ${model.id} → ${model.source.repoId}`);
    await fs.rm(modelRoot, { recursive: true, force: true }).catch(() => {});
  }

  onProgress?.({ phase: 'start', percent: 0, modelId: model.id, model, downloaded: true });

  // 레포 메타데이터로 파일 목록 조회
  const metadata = await fetchJson(`${HF_API_BASE}/${model.source.repoId}`);
  const files = (metadata.siblings || [])
    .map((entry) => entry.rfilename)
    .filter((f) => !shouldSkipFile(f));

  if (!files.length) {
    throw new Error(
      `다운로드 가능한 파일을 찾지 못했습니다: ${model.label}\n`
      + `레포: ${model.source.repoId}`
    );
  }

  // 파일 크기를 HEAD 요청으로 사전 조회 (진행률 계산용)
  const fileSizes = await Promise.all(
    files.map(async (filePath) => {
      const fileUrl = `${HF_CDN_BASE}/${model.source.repoId}/resolve/main/${encodeURI(filePath)}`;
      const size = await fetchFileSize(fileUrl);
      return { filePath, fileUrl, size };
    })
  );

  const totalBytes = fileSizes.reduce((sum, e) => sum + e.size, 0);
  const progressState = {
    completedBytes: 0,
    completedFiles: 0,
    totalBytes,
    totalFiles: fileSizes.length,
    modelId: model.id,
    model
  };

  await fs.mkdir(modelRoot, { recursive: true });

  for (const entry of fileSizes) {
    const targetPath = path.join(modelRoot, entry.filePath);
    progressState.fileName = entry.filePath;
    await downloadFile(entry.fileUrl, targetPath, onProgress, progressState);
  }

  await fs.writeFile(manifestPath, JSON.stringify({
    modelId: model.id,
    repoId: model.source.repoId,
    downloadedAt: new Date().toISOString(),
    files,
    totalBytes
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
        })
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
    }
  };
}
