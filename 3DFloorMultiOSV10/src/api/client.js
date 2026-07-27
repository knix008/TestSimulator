import { i18nError } from '../i18n/index.js';

/**
 * Client for FloorPlanTo3D-API
 * POST multipart/form-data field "image" → detection JSON
 * @see https://github.com/fadyazizz/FloorPlanTo3D-API
 */
export async function analyzeFloorPlan(apiUrl, file) {
  const endpoint = normalizeApiUrl(apiUrl);
  const body = new FormData();
  body.append('image', file, file.name || 'floorplan.png');

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body,
    });
  } catch (err) {
    // Typical when FloorPlanTo3D-API is not running / wrong host
    throw i18nError('error.apiUnreachable', {
      url: endpoint,
      detail: err?.message || String(err),
    });
  }

  if (!response.ok) {
    throw i18nError('error.apiHttp', {
      status: response.status,
      statusText: response.statusText,
    });
  }

  const data = await response.json();
  validateDetection(data);
  return data;
}

function normalizeApiUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    throw i18nError('error.apiUrl');
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function validateDetection(data) {
  if (!data || !Array.isArray(data.points) || !Array.isArray(data.classes)) {
    throw i18nError('error.invalidDetection');
  }
  if (data.points.length !== data.classes.length) {
    throw i18nError('error.lengthMismatch');
  }
}
