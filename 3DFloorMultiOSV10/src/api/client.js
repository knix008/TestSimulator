import { i18nError } from '../i18n/index.js';
import {
  normalizeUnityParams,
  unityParamsForApi,
} from '../unityApi/params.js';

/**
 * Client for FloorPlanTo3D-API (Mask R-CNN), the same backend used by
 * https://github.com/fadyazizz/FloorPlanTo3D-unityClient
 *
 * @see https://github.com/fadyazizz/FloorPlanTo3D-API
 */

/**
 * @typedef {{
 *   stage: 'upload' | 'analyze' | 'download' | 'done',
 *   ratio?: number | null,
 *   loaded?: number,
 *   total?: number,
 * }} AnalyzeProgress
 */

/**
 * @param {string} apiUrl
 * @param {File|Blob} file
 * @param {{
 *   signal?: AbortSignal,
 *   onProgress?: (info: AnalyzeProgress) => void,
 *   params?: Partial<import('../unityApi/params.js').UnityParams>,
 * }} [options]
 */
export async function analyzeFloorPlan(apiUrl, file, options = {}) {
  const endpoint = normalizeApiUrl(apiUrl);
  const params = normalizeUnityParams(options.params || {});
  const form = new FormData();
  form.append('image', file, file.name || 'floorplan.png');
  form.append('params', JSON.stringify(unityParamsForApi(params)));

  let data;
  try {
    data = await postFormData(endpoint, form, {
      signal: options.signal,
      onProgress: options.onProgress,
    });
  } catch (err) {
    if (err?.code === 'CANCELED' || err?.name === 'AbortError' || options.signal?.aborted) {
      const canceled = new Error('canceled');
      canceled.code = 'CANCELED';
      throw canceled;
    }
    if (typeof err?.message === 'string' && err.message.startsWith('i18n:')) throw err;
    throw i18nError('error.apiUnreachable', {
      url: endpoint,
    });
  }

  if (!data?.points || !data?.classes) {
    throw i18nError('error.invalidDetection');
  }
  if (data.points.length !== data.classes.length) {
    throw i18nError('error.lengthMismatch');
  }

  options.onProgress?.({ stage: 'done', ratio: 1 });
  return normalizeUnityDetection(data, params);
}

/**
 * Sanitize API payload: numeric fields, class names, scale fallback, client filters.
 * @param {object} data
 * @param {import('../unityApi/params.js').UnityParams} params
 */
function normalizeUnityDetection(data, params) {
  const width = Number(data.Width) || 0;
  const height = Number(data.Height) || 0;
  const span = Math.max(1, Math.min(width || 1, height || 1));
  let averageDoor = Number(data.averageDoor) || 0;
  if (!(averageDoor > 0)) {
    averageDoor = Math.max(24, span * params.doorFallbackRatio);
  }

  const scores = Array.isArray(data.scores) ? data.scores.map((s) => Number(s) || 0) : [];
  const points = [];
  const classes = [];
  const keptScores = [];

  for (let i = 0; i < (data.points || []).length; i += 1) {
    const p = data.points[i];
    const name = String(data.classes[i]?.name || 'wall').toLowerCase();
    const className = (name === 'door' || name === 'window' || name === 'wall') ? name : 'wall';
    if (className === 'wall' && !params.includeWalls) continue;
    if (className === 'window' && !params.includeWindows) continue;
    if (className === 'door' && !params.includeDoors) continue;

    const box = {
      x1: Number(p.x1) || 0,
      y1: Number(p.y1) || 0,
      x2: Number(p.x2) || 0,
      y2: Number(p.y2) || 0,
    };
    const longSide = Math.max(Math.abs(box.x2 - box.x1), Math.abs(box.y2 - box.y1));
    if (longSide < params.minBoxSidePx) continue;
    if (scores[i] != null && scores[i] < params.minConfidence) continue;

    points.push(box);
    classes.push({ name: className });
    if (scores[i] != null) keptScores.push(scores[i]);
  }

  // Recompute averageDoor from kept doors when possible
  const doorLens = points
    .filter((_, i) => classes[i].name === 'door')
    .map((d) => Math.max(Math.abs(d.x2 - d.x1), Math.abs(d.y2 - d.y1)));
  if (doorLens.length) {
    averageDoor = doorLens.reduce((a, b) => a + b, 0) / doorLens.length;
  }

  return {
    Width: width,
    Height: height,
    averageDoor,
    points,
    classes,
    scores: keptScores,
    source: 'unity-api',
    unityParams: params,
  };
}

/**
 * XHR so we can report upload progress (fetch upload progress is unavailable).
 * @param {string} url
 * @param {FormData} form
 * @param {{ signal?: AbortSignal, onProgress?: (info: AnalyzeProgress) => void }} opts
 */
function postFormData(url, form, opts = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'text';

    const onAbort = () => {
      try { xhr.abort(); } catch { /* ignore */ }
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        opts.onProgress?.({
          stage: 'upload',
          loaded: event.loaded,
          total: event.total,
          ratio: event.loaded / event.total,
        });
      } else {
        opts.onProgress?.({ stage: 'upload', ratio: null });
      }
    };

    xhr.upload.onload = () => {
      opts.onProgress?.({ stage: 'analyze', ratio: null });
    };

    xhr.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        opts.onProgress?.({
          stage: 'download',
          loaded: event.loaded,
          total: event.total,
          ratio: event.loaded / event.total,
        });
      }
    };

    xhr.onerror = () => {
      opts.signal?.removeEventListener('abort', onAbort);
      reject(new Error('network'));
    };

    xhr.onabort = () => {
      opts.signal?.removeEventListener('abort', onAbort);
      const err = new Error('canceled');
      err.code = 'CANCELED';
      reject(err);
    };

    xhr.onload = () => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(i18nError('error.apiHttp', {
          status: xhr.status,
          statusText: xhr.statusText || '',
        }));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch {
        reject(i18nError('error.invalidDetection'));
        return;
      }
      resolve(parsed);
    };

    opts.onProgress?.({ stage: 'upload', ratio: 0, loaded: 0, total: 0 });
    xhr.send(form);
  });
}

function normalizeApiUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) throw i18nError('error.apiUrl');
  // Upstream application.py serves POST / (not /api_predict)
  return raw.replace(/\/api_predict\/?$/i, '').replace(/\/?$/, '') + '/';
}
