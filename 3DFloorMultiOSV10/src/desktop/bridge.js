/**
 * Electron desktop bridge helpers.
 * In the browser (Vite-only) these fall back gracefully.
 */

export function isDesktopApp() {
  return Boolean(window.fp3dDesktop?.isDesktop);
}

/**
 * Native open dialog that restores the last-used directory (Electron).
 * @param {{ mode?: 'any'|'image'|'model', multiple?: boolean, title?: string }} options
 * @returns {Promise<File[]>}
 */
export async function openDesktopFiles(options = {}) {
  if (!isDesktopApp()) return [];
  const rows = await window.fp3dDesktop.openFiles(options);
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((row) => {
    const bytes = toUint8Array(row.data);
    return new File([bytes], row.name, { type: row.type || '' });
  });
}

function toUint8Array(data) {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  // Older Electron Buffer clone shape: { type: 'Buffer', data: number[] }
  if (data.type === 'Buffer' && Array.isArray(data.data)) {
    return Uint8Array.from(data.data);
  }
  if (Array.isArray(data)) return Uint8Array.from(data);
  return new Uint8Array();
}

function bytesToBase64(bytes) {
  const u8 = toUint8Array(bytes);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < u8.length; i += chunk) {
    const slice = u8.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

/** Remember directories from FileList / File[] (drag-drop or HTML input in Electron). */
export async function rememberDesktopFiles(files) {
  if (!isDesktopApp() || !files?.length) return;
  const paths = [];
  for (const file of files) {
    const p = window.fp3dDesktop.getPathForFile?.(file);
    if (p) paths.push(p);
  }
  if (!paths.length) return;
  try {
    await window.fp3dDesktop.rememberPaths(paths);
  } catch {
    // ignore
  }
}

/**
 * Save a PNG data URL. Uses native Save dialog on Electron; otherwise triggers a browser download.
 * @param {string} dataUrl
 * @param {string} defaultName
 * @returns {Promise<{ canceled?: boolean, ok?: boolean, name?: string }>}
 */
export async function savePngDataUrl(dataUrl, defaultName = 'floorplan-3d.png') {
  return saveExportFile({
    defaultName,
    dataUrl,
    mime: 'image/png',
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  });
}

/**
 * Save exported bytes/text/data-URL via Electron dialog or browser download.
 * @param {{
 *   defaultName: string,
 *   bytes?: ArrayBuffer | Uint8Array,
 *   text?: string,
 *   dataUrl?: string,
 *   mime?: string,
 *   filters?: { name: string, extensions: string[] }[],
 *   title?: string,
 * }} options
 */
export async function saveExportFile(options) {
  const {
    defaultName,
    bytes,
    text,
    dataUrl,
    mime = 'application/octet-stream',
    filters = [{ name: 'All Files', extensions: ['*'] }],
    title = 'Save',
  } = options;

  if (isDesktopApp() && typeof window.fp3dDesktop.saveFile === 'function') {
    let dataBase64 = '';
    if (dataUrl) {
      dataBase64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    } else if (bytes) {
      dataBase64 = bytesToBase64(bytes);
    } else if (typeof text === 'string') {
      return window.fp3dDesktop.saveFile({
        defaultName,
        dataText: text,
        filters,
        title,
      });
    }
    return window.fp3dDesktop.saveFile({
      defaultName,
      dataBase64,
      filters,
      title,
    });
  }

  // Browser download
  let blob;
  if (dataUrl) {
    const res = await fetch(dataUrl);
    blob = await res.blob();
  } else if (typeof text === 'string') {
    blob = new Blob([text], { type: mime });
  } else if (bytes) {
    blob = new Blob([bytes], { type: mime });
  } else {
    return { canceled: false, ok: false, error: 'empty' };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { canceled: false, ok: true, name: defaultName };
}
