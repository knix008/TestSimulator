// The file clipboard the panels share.
//
// `move` is a cut: the next paste moves the originals instead of copying them.
// The list is also kept in localStorage so a reload, or another tab of the web
// app, still pastes the cut as a move. The Windows shell clipboard (CF_HDROP)
// is a separate channel written by the Tauri shell — see src-tauri/src/clipdrag.rs.
const KEY = 'cc-file-clip';

let clip = { paths: [], move: false };
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(clip);
}

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && Array.isArray(saved.paths)) clip = { paths: saved.paths.filter(Boolean), move: !!saved.move };
} catch { /* no storage yet, or a private window */ }

export function rememberClip(paths, move) {
  clip = { paths: (paths || []).filter(Boolean).slice(), move: !!move };
  try { localStorage.setItem(KEY, JSON.stringify(clip)); } catch { /* private mode */ }
  emit();
}

export function recallClip() {
  return clip;
}

export function forgetClip() {
  clip = { paths: [], move: false };
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  emit();
}

// `fn` is called immediately with the current clipboard, then on every change.
export function subscribeFileClipboard(fn) {
  listeners.add(fn);
  fn(clip);
  return () => listeners.delete(fn);
}
