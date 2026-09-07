// The app's own document type: a .pdfvw "workspace" file.
//
// It is plain JSON holding everything the user produced on top of a PDF —
// highlights, bookmarks and the text/image clips they copied — plus a pointer
// back to the PDF itself and the view they left it in. Opening a .pdfvw
// re-opens the PDF and restores all of that.
//
// The file type is registered with the OS by the installer (see the
// `fileAssociations` block in package.json) and has its own icon.

export const WORKSPACE_EXT = 'pdfvw';
export const WORKSPACE_FORMAT = 'mypdfviewer-workspace';
export const WORKSPACE_VERSION = 1;

export function serializeWorkspace({ file, page, view, workspace }) {
  return JSON.stringify({
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    savedAt: new Date().toISOString(),
    pdf: {
      path: file?.path || null,
      name: file?.name || '',
      size: file?.size || 0,
    },
    view: {
      page: page || 1,
      zoomMode: view?.zoomMode || 'fit-width',
      zoom: view?.zoom || 1,
      rotation: view?.rotation || 0,
      pageLayout: view?.pageLayout || 'single',
    },
    workspace: {
      annotations: workspace?.annotations || [],
      clips: workspace?.clips || [],
      bookmarks: workspace?.bookmarks || [],
      rotation: workspace?.rotation || 0,
    },
  }, null, 2);
}

// Throws a descriptive error when the file is not a workspace — the message
// ends up verbatim in the error dialog.
export function parseWorkspace(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not a valid .${WORKSPACE_EXT} file — the JSON could not be parsed (${err.message}).`);
  }
  if (!data || data.format !== WORKSPACE_FORMAT) {
    throw new Error(`Not a MyPDFViewer workspace: expected format "${WORKSPACE_FORMAT}", found "${data?.format ?? 'nothing'}".`);
  }
  if (Number(data.version) > WORKSPACE_VERSION) {
    throw new Error(`This workspace was written by a newer version (file v${data.version}, this build reads v${WORKSPACE_VERSION}).`);
  }
  return {
    pdfPath: data.pdf?.path || null,
    pdfName: data.pdf?.name || '',
    view: data.view || {},
    workspace: {
      annotations: data.workspace?.annotations || [],
      clips: data.workspace?.clips || [],
      bookmarks: data.workspace?.bookmarks || [],
      rotation: data.workspace?.rotation || 0,
    },
  };
}

export function isWorkspacePath(p) {
  return !!p && p.toLowerCase().endsWith(`.${WORKSPACE_EXT}`);
}

// Bytes → text, used when a .pdfvw arrives through the same read path as a PDF.
export function bytesToText(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

// Quick sniff so a mis-named file produces a helpful error rather than a
// pdf.js stack trace.
export function looksLikePdf(bytes) {
  if (!bytes || bytes.length < 5) return false;
  // Some files carry junk before the header, so scan the first KB for %PDF-.
  const head = bytes.subarray(0, Math.min(1024, bytes.length));
  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  outer: for (let i = 0; i <= head.length - sig.length; i++) {
    for (let j = 0; j < sig.length; j++) if (head[i + j] !== sig[j]) continue outer;
    return true;
  }
  return false;
}
