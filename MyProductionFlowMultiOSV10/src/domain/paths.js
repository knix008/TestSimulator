// File path helpers that work for Windows and POSIX paths and plain web file names.
export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop();
export const directoryOf = (path) => { const s = String(path ?? ''); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i > 0 ? s.slice(0, i) : ''; };
export const extensionOf = (path) => { const b = baseName(path); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; };
export const stripExtension = (name) => { const b = String(name ?? ''); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(0, i) : b; };
export const withExtension = (path, ext) => (extensionOf(path) === ext ? path : `${path}.${ext}`);
export const fileSafe = (text) => String(text ?? '').replace(/[\\/:*?"<>|]/g, '_');
