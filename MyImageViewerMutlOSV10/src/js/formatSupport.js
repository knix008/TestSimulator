/* Format detection and special format support */
window.FormatSupport = (() => {
  const IMAGE_EXTS = new Set([
    'jpg','jpeg','png','gif','bmp','webp','svg','ico','tiff','tif',
    'heic','heif','hif','dcm','dicom','avif',
  ]);
  const VIDEO_EXTS = new Set([
    'mp4','webm','ogv','mov','avi','mkv','m4v','flv','wmv','3gp',
    'mpeg','mpg','ts','m2ts','vob','rm','rmvb',
  ]);
  const AUDIO_EXTS = new Set([
    'mp3','wav','flac','aac','m4a','ogg','opus','wma','aiff','aif',   // (no MIDI: nothing here can synthesise it)
  ]);
  const NATIVE_EXTS = new Set([
    'jpg','jpeg','png','gif','bmp','webp','svg','ico','avif',
  ]);
  const TIFF_EXTS = new Set(['tiff','tif']);
  const HEIC_EXTS = new Set(['heic','heif','hif']);
  const DCM_EXTS  = new Set(['dcm','dicom']);

  function getExtension(filePath) {
    const parts = filePath.split(/[/\\]/);
    const name  = parts[parts.length - 1] || '';
    const dot   = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  }

  function isImage(filePath) { return IMAGE_EXTS.has(getExtension(filePath)); }
  function isVideo(filePath) { return VIDEO_EXTS.has(getExtension(filePath)); }
  function isAudio(filePath) { return AUDIO_EXTS.has(getExtension(filePath)); }
  function isSupportedFile(filePath) { return isImage(filePath) || isVideo(filePath) || isAudio(filePath); }
  function isNativeImage(filePath) { return NATIVE_EXTS.has(getExtension(filePath)); }
  function isTiff(filePath)  { return TIFF_EXTS.has(getExtension(filePath)); }
  function isHeic(filePath)  { return HEIC_EXTS.has(getExtension(filePath)); }
  function isDcm(filePath)   { return DCM_EXTS.has(getExtension(filePath)); }
  /** Formats that should keep frame animation in an <img> (not canvas). */
  /** A format that can hold an animation (whether this file does: hasAnimation). */
  function isAnimatedImage(filePath) {
    const ext = getExtension(filePath);
    return ext === 'gif' || ext === 'webp';
  }

  /**
   * Does this GIF / WebP (a data URL of the file) really have more than one frame?
   * Most WebP files and many GIFs are stills: those open in the editor like any picture,
   * so the right panel (histogram, colour, adjustments) works on them.
   *   WebP: an extended header (VP8X) with the animation flag, or an ANIM chunk.
   *   GIF:  more than one Graphic Control Extension (one per frame of an animation).
   */
  function hasAnimation(dataUrl) {
    try {
      const comma = dataUrl.indexOf(',');
      const bin = atob(dataUrl.slice(comma + 1));
      if (bin.startsWith('RIFF') && bin.slice(8, 12) === 'WEBP') {
        if (bin.slice(12, 16) === 'VP8X' && (bin.charCodeAt(20) & 0x02)) return true;
        return bin.includes('ANIM');
      }
      if (bin.startsWith('GIF')) {
        let frames = 0;
        for (let i = bin.indexOf('\x21\xF9\x04'); i >= 0; i = bin.indexOf('\x21\xF9\x04', i + 3)) {
          if (++frames > 1) return true;
        }
        return false;
      }
    } catch { /* unreadable: treat as animated, as before */ }
    return true;
  }

  /* ── TIFF decoder using UTIF.js (optional vendor dependency) ── */
  async function decodeTiff(buffer) {
    if (window.UTIF) {
      try {
        const ifds = UTIF.decode(buffer);
        if (!ifds.length) throw new Error('No IFD found');
        UTIF.decodeImage(buffer, ifds[0]);
        const rgba = UTIF.toRGBA8(ifds[0]);
        const w = ifds[0].width;
        const h = ifds[0].height;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(w, h);
        imgData.data.set(rgba);
        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
      } catch (e) {
        console.error('UTIF decode failed:', e);
      }
    }
    // Fallback: try native (some browsers/Electron builds support TIFF)
    return null;
  }

  /* ── HEIC/HEIF decoder using heic2any or a native Image fallback ── */
  async function decodeHeic(buffer) {
    if (window.heic2any) {
      try {
        const blob = new Blob([buffer], { type: 'image/heic' });
        const outBlob = await heic2any({ blob, toType: 'image/jpeg', quality: 0.9 });
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(Array.isArray(outBlob) ? outBlob[0] : outBlob);
        });
      } catch (e) {
        console.error('heic2any decode failed:', e);
      }
    }
    try {
      const blob = new Blob([buffer], { type: 'image/heic' });
      const objUrl = URL.createObjectURL(blob);
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            resolve(c.toDataURL('image/jpeg', 0.92));
          };
          img.onerror = () => reject(new Error('native HEIC decode failed'));
          img.src = objUrl;
        });
        return dataUrl;
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    } catch (e) {
      console.error('Native HEIC decode failed:', e);
    }
    return null;
  }

  /* ── Convert ArrayBuffer to base64 data URL ── */
  function bufferToDataUrl(buffer, mimeType) {
    const bytes = new Uint8Array(buffer);
    let binary  = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return `data:${mimeType};base64,${btoa(binary)}`;
  }

  /* ── Main entry: load a file and return a data URL (or null on failure) ── */
  async function loadImageFile(filePath) {
    const ext = getExtension(filePath);

    if (isVideo(filePath)) return { type: 'video', filePath };
    if (isAudio(filePath)) return { type: 'audio', filePath };

    if (isNativeImage(filePath)) {
      const dataUrl = await window.electronAPI.readFileBase64(filePath);
      if (dataUrl && !dataUrl.error && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        if (isAnimatedImage(filePath) && hasAnimation(dataUrl)) return { type: 'animated', dataUrl };
        return { type: 'image', dataUrl };
      }
      if (ext === 'webp' || ext === 'avif') {
        const converted = await window.electronAPI.convertToPng(filePath);
        if (converted && !converted.error && typeof converted === 'string' && converted.startsWith('data:')) {
          return { type: 'image', dataUrl: converted };
        }
      }
      return { type: 'error', message: (dataUrl && dataUrl.error) || 'Could not load image' };
    }

    if (isTiff(filePath) || isHeic(filePath)) {
      const result = await window.electronAPI.convertToPng(filePath);
      if (result && !result.error && typeof result === 'string'
          && (result.startsWith('data:') || result.startsWith('file:') || result.startsWith('blob:'))) {
        return { type: 'image', dataUrl: result };
      }
      const dataUrl = await window.electronAPI.readFileBase64(filePath);
      if (dataUrl && dataUrl.error) return { type: 'error', message: dataUrl.error };
      const b64 = (dataUrl && dataUrl.includes(',')) ? dataUrl.split(',')[1] : null;
      if (b64) {
        const bin = atob(b64);
        const buf = new ArrayBuffer(bin.length);
        const u8  = new Uint8Array(buf);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        if (isTiff(filePath)) {
          const decoded = await decodeTiff(buf);
          if (decoded) return { type: 'image', dataUrl: decoded };
        } else {
          const decoded = await decodeHeic(buf);
          if (decoded) return { type: 'image', dataUrl: decoded };
        }
      }
      return {
        type: 'error',
        message: (result && result.error) || 'Could not decode HEIC/HEIF/TIFF image',
      };
    }

    if (isDcm(filePath)) return loadDicomFile(filePath);

    const dataUrl = await window.electronAPI.readFileBase64(filePath);
    if (dataUrl && dataUrl.error) return { type: 'error', message: dataUrl.error };
    return { type: 'image', dataUrl };
  }

  /** hasAnimation on the file's bytes (no base64 string, no copy). */
  function hasAnimationBytes(u8) {
    const at = (i, s) => { for (let k = 0; k < s.length; k++) if (u8[i + k] !== s.charCodeAt(k)) return false; return true; };
    const find = (s, from) => {
      const a = s.charCodeAt(0);
      for (let i = u8.indexOf(a, from); i >= 0 && i + s.length <= u8.length; i = u8.indexOf(a, i + 1)) if (at(i, s)) return i;
      return -1;
    };
    if (at(0, 'RIFF') && at(8, 'WEBP')) {
      if (at(12, 'VP8X') && (u8[20] & 0x02)) return true;
      return find('ANIM', 12) >= 0;
    }
    if (at(0, 'GIF')) {
      let frames = 0;
      for (let i = find('\x21\xF9\x04', 0); i >= 0; i = find('\x21\xF9\x04', i + 3)) if (++frames > 1) return true;
      return false;
    }
    return true;
  }

  const VIEW_MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp',
    webp: 'image/webp', ico: 'image/x-icon', avif: 'image/avif',
  };

  /**
   * The viewer's open. Like loadImageFile, but a still picture the webview decodes comes back
   * as { type: 'image', blob }: its bytes arrive as an ArrayBuffer (no base64 string to build
   * and parse) and decodeOffThread turns them into pixels in a worker. Everything else — and
   * anything that fails here — takes loadImageFile's path.
   */
  async function loadImageForView(filePath) {
    const ext = getExtension(filePath);
    const api = window.electronAPI || {};
    if (VIEW_MIME[ext] && typeof api.readFileBytes === 'function'
        && typeof Worker === 'function' && typeof OffscreenCanvas === 'function') {
      try {
        const bytes = await readFileBytes(filePath);
        if (bytes && bytes.length) {
          if (isAnimatedImage(filePath) && hasAnimationBytes(bytes)) return loadImageFile(filePath);
          return { type: 'image', blob: new Blob([bytes], { type: VIEW_MIME[ext] }) };
        }
      } catch { /* the old path below */ }
    }
    return loadImageFile(filePath);
  }

  /* One viewer decode at a time: a newer open ends the older one (its worker is dropped),
     so stepping quickly through big photos never queues decodes nobody will see. */
  let _viewWorker = null;
  let _viewJob = null;   // { id, reject }
  let _viewSeq = 0;

  /**
   * Decode `blob` off the UI thread. Resolves { bitmap, w, h, pixels?: ImageData, copy?: ImageData }
   * (pixels / copy when opts.pixels); rejects when it cannot be decoded or a newer decode
   * replaced it (err.superseded).
   */
  function decodeOffThread(blob, opts = {}) {
    if (_viewJob) {
      const old = _viewJob;
      _viewJob = null;
      try { _viewWorker?.terminate(); } catch { /* ignore */ }
      _viewWorker = null;
      const err = new Error('superseded');
      err.superseded = true;
      old.reject(err);
    }
    return new Promise((resolve, reject) => {
      const id = ++_viewSeq;
      if (!_viewWorker) _viewWorker = new Worker('./js/imageWorker.js');
      const worker = _viewWorker;
      _viewJob = { id, reject };
      const finish = () => { if (_viewJob && _viewJob.id === id) _viewJob = null; };
      worker.onmessage = (e) => {
        const m = e.data || {};
        if (m.id !== id) return;
        finish();
        if (!m.ok) { reject(new Error(m.error || 'decode failed')); return; }
        const out = { bitmap: m.bitmap, w: m.w, h: m.h };
        if (m.data) out.pixels = new ImageData(new Uint8ClampedArray(m.data), m.w, m.h);
        if (m.copy) out.copy = new ImageData(new Uint8ClampedArray(m.copy), m.w, m.h);
        resolve(out);
      };
      worker.onerror = (e) => {
        finish();
        try { worker.terminate(); } catch { /* ignore */ }
        if (_viewWorker === worker) _viewWorker = null;
        reject(new Error((e && e.message) || 'decode worker failed'));
      };
      worker.postMessage({ id, blob, pixels: !!opts.pixels });
    });
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleString();
    } catch { return isoStr; }
  }

  /* ── DICOM: decoded in the renderer so window / frame changes never re-read the file ── */
  async function readFileBytes(filePath) {
    if (typeof window.electronAPI.readFileBytes === 'function') {
      const bytes = await window.electronAPI.readFileBytes(filePath);
      if (bytes && bytes.error) throw new Error(bytes.error);
      if (bytes instanceof Uint8Array) return bytes;
      if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
      if (bytes && bytes.buffer) return new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
    }
    const dataUrl = await window.electronAPI.readFileBase64(filePath);
    if (dataUrl && dataUrl.error) throw new Error(dataUrl.error);
    const b64 = (typeof dataUrl === 'string' && dataUrl.includes(',')) ? dataUrl.split(',')[1] : null;
    if (!b64) throw new Error('Could not read file');
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  async function loadDicomFile(filePath) {
    let rendererError = null;
    if (window.DicomDecoder && typeof DicomDecoder.load === 'function') {
      try {
        const bytes = await readFileBytes(filePath);
        const image = await DicomDecoder.load(bytes);
        const { canvas } = await image.toCanvas({});
        return { type: 'image', canvas, dicom: image, dicomMeta: image.meta, dicomTags: image.tags };
      } catch (e) {
        rendererError = e;
        console.error('Renderer DICOM decode failed:', e);
      }
    }
    // Fallback: main-process decode (desktop) — a plain picture without window / frame controls
    try {
      const result = await window.electronAPI.decodeDicom(filePath);
      if (result && !result.error) {
        if (typeof result === 'string') return { type: 'image', dataUrl: result };
        if (result.dataUrl) return { type: 'image', dataUrl: result.dataUrl, dicomMeta: result.meta, dicomTags: result.tags };
      }
      if (result && result.error && !rendererError) rendererError = new Error(result.error);
    } catch (e) {
      if (!rendererError) rendererError = e;
    }
    return { type: 'error', message: (rendererError && rendererError.message) || 'Could not decode DICOM file' };
  }

  async function decodeDicomBuffer(buffer) {
    if (!window.DicomDecoder) return { error: 'DICOM decoder not available' };
    return DicomDecoder.decodeToDisplay(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  }

  return {
    getExtension, isImage, isVideo, isAudio, isSupportedFile,
    isNativeImage, isTiff, isHeic, isDcm, isAnimatedImage, hasAnimation,
    loadImageFile, loadImageForView, decodeOffThread, hasAnimationBytes, loadDicomFile, readFileBytes, formatFileSize, formatDate, decodeDicomBuffer,
    IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS,
  };
})();
