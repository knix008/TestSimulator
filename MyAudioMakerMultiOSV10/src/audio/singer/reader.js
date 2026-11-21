// Reading a voice bank's files from wherever it is stored (works in a Web Worker and in the page):
//   { kind: 'asset', base, dir, sep }  desktop: the Tauri asset protocol (convertFileSrc base + path)
//   { kind: 'opfs', dir, prefix }      web: origin private file system, voicebanks/<dir>/<prefix>/…
//   { kind: 'idb', dir, prefix }       web fallback: IndexedDB "myaudiomaker-voice" › files
//   { kind: 'url', base }              any HTTP folder (tests, the end-to-end script)

const decode = (bytes) => new TextDecoder().decode(bytes);

function idbFile(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('myaudiomaker-voice', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('banks'); req.result.createObjectStore('files'); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('files', 'readonly');
      const get = tx.objectStore('files').get(key);
      get.onsuccess = () => { db.close(); resolve(get.result ?? null); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  });
}

async function opfsFile(dir, rel) {
  let handle = await (await navigator.storage.getDirectory()).getDirectoryHandle('voicebanks');
  const parts = [dir, ...rel.split('/')];
  const name = parts.pop();
  for (const p of parts) if (p) handle = await handle.getDirectoryHandle(p);
  return (await handle.getFileHandle(name)).getFile();
}

/** A `read(path, 'text' | 'bytes')` function for a source. */
export function makeReader(source) {
  const fail = (path, why) => { const e = new Error(`${path}: ${why}`); e.code = 'missing'; return e; };
  const fetchBytes = async (url, path) => {
    const res = await fetch(url);
    if (!res.ok) throw fail(path, `HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  return async (path, kind = 'bytes') => {
    const rel = String(path).replace(/\\/g, '/');
    let bytes;
    if (source.kind === 'asset') {
      const full = `${source.dir}${source.sep}${rel.split('/').join(source.sep)}`;
      bytes = await fetchBytes(`${source.base}${encodeURIComponent(full)}`, rel);
    } else if (source.kind === 'url') {
      bytes = await fetchBytes(`${source.base}${rel.split('/').map(encodeURIComponent).join('/')}`, rel);
    } else if (source.kind === 'opfs') {
      const file = await opfsFile(source.dir, source.prefix ? `${source.prefix}/${rel}` : rel).catch((e) => { throw fail(rel, e.message); });
      return kind === 'text' ? file.text() : new Uint8Array(await file.arrayBuffer());
    } else if (source.kind === 'idb') {
      const blob = await idbFile(`${source.dir}/${source.prefix ? `${source.prefix}/` : ''}${rel}`);
      if (!blob) throw fail(rel, 'not stored');
      return kind === 'text' ? blob.text() : new Uint8Array(await blob.arrayBuffer());
    } else throw new Error(`Unknown voice bank source ${source.kind}`);
    return kind === 'text' ? decode(bytes) : bytes;
  };
}
