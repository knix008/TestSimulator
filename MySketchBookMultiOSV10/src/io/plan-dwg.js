// DWG floor plans. DWG is AutoCAD's closed binary format; the app has no DWG reader of its own. A DWG is
// converted to DXF by one of these, tried in order, and the DXF goes through plan-dxf.js like any other:
//
//   1. desktop: a converter installed on the computer, run by the Tauri command `convert_dwg`
//      (ODA File Converter — free download from opendesign.com — or LibreDWG's dwg2dxf; found on PATH,
//      in the usual install folders, or named by MYSKETCHBOOK_DWG_CONVERTER).
//   2. LibreDWG compiled to WebAssembly (@mlightcad/libredwg-web), if it was put into library/dwg/
//      (`node scripts/fetch-dwg-reader.mjs`). It is NOT part of the app: LibreDWG is GPL-3.0, so shipping it
//      would put the app under the GPL. It is loaded only when present, only when a DWG is opened, offline.
//
// Pure (no DOM, no three): the converters are passed in, so Node tests drive this with stand-ins.

/** DWG version codes (the first six bytes of the file) → AutoCAD release names. */
export const DWG_VERSIONS = {
  MC0: 'R1.0', AC1001: 'R2.2', AC1002: 'R2.5', AC1003: 'R2.6', AC1004: 'R9', AC1006: 'R10', AC1009: 'R11/R12',
  AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018',
};

const bytesOf = (input) => (input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null);

/** The DWG version of the bytes: { code: 'AC1032', release: '2018' }, or null when they are no DWG. */
export function dwgVersion(input) {
  const b = bytesOf(input);
  if (!b || b.length < 6) return null;
  const code = String.fromCharCode(...b.subarray(0, 6));
  if (/^AC10\d\d$/.test(code)) return { code, release: DWG_VERSIONS[code] ?? code };
  if (code.startsWith('MC0.0')) return { code: 'MC0', release: DWG_VERSIONS.MC0 };
  return null;
}
export const isDwg = (input) => dwgVersion(input) != null;
export const isDwgName = (name) => /\.dwg$/i.test(name ?? '');

/**
 * DWG bytes → { dxf: Uint8Array, via, version }. `converters`: [{ name, convert(bytes, version) → Uint8Array | null }],
 * tried in order; null (or a throw) moves on to the next. Throws { code: 'dwg-bad' } for bytes that are no DWG
 * and { code: 'dwg-unavailable', tried: [{ name, error }] } when no converter could do it.
 */
export async function dwgToDxf(input, { converters = [] } = {}) {
  const bytes = bytesOf(input);
  const version = dwgVersion(bytes);
  if (!version) throw Object.assign(new Error('Not a DWG file (no AC10xx version mark at the start)'), { code: 'dwg-bad' });
  const tried = [];
  for (const c of converters) {
    try {
      const out = await c.convert(bytes, version);
      if (out && out.length) {
        const dxf = bytesOf(out) ?? new TextEncoder().encode(String(out));
        return { dxf, via: c.name, version };
      }
      tried.push({ name: c.name, error: 'not available' });
    } catch (error) {
      tried.push({ name: c.name, error: error?.message ?? String(error) });
    }
  }
  throw Object.assign(new Error(`No DWG converter could read this ${version.release} drawing (${tried.map((x) => `${x.name}: ${x.error}`).join('; ') || 'none available'})`), { code: 'dwg-unavailable', tried, version });
}

// ───────────────────────── converters

const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * The desktop converter: `invoke('convert_dwg', { data })` (base64 DWG) → { dxf (base64), converter }.
 * The backend answers the error "no-converter" when neither ODA File Converter nor dwg2dxf is installed.
 */
export function desktopDwgConverter(invoke) {
  return {
    name: 'desktop',
    async convert(bytes) {
      try {
        const out = await invoke('convert_dwg', { data: toBase64(bytes) });
        this.used = out?.converter ?? null;
        return out?.dxf ? fromBase64(out.dxf) : null;
      } catch (error) {
        const text = typeof error === 'string' ? error : error?.message ?? String(error);
        if (/no-converter/.test(text)) return null;
        throw new Error(text);
      }
    },
  };
}

/**
 * LibreDWG (WebAssembly) from library/dwg/, when it is there: `load()` → the module factory (the default export of
 * libredwg-web.js, an Emscripten module), `locate(file)` → the URL of its .wasm. Not shipped (GPL-3.0, see top).
 */
export function wasmDwgConverter({ load, locate }) {
  let module = null;
  return {
    name: 'libredwg-wasm',
    async convert(bytes) {
      if (!module) {
        let factory;
        try { factory = await load(); } catch { return null; } // not installed: next converter
        if (typeof factory !== 'function') return null;
        module = await factory({ locateFile: (file) => locate(file) });
      }
      const FS = module.FS;
      const input = '/mysketchbook-in.dwg'; const output = '/mysketchbook-out.dxf';
      FS.writeFile(input, bytes);
      try {
        // LibreDWG's error bits below 128 are warnings (unknown objects …); 128 and up are fatal.
        const status = module.dwg_write_dxf(input, output);
        if (status >= 128 || !FS.analyzePath(output).exists) throw new Error(`LibreDWG could not read the drawing (error ${status})`);
        return FS.readFile(output);
      } finally {
        for (const f of [input, output]) { try { if (FS.analyzePath(f).exists) FS.unlink(f); } catch { /* gone */ } }
      }
    },
  };
}
