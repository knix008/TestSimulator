/* Format detection and special format support */
window.FormatSupport = (() => {
  const IMAGE_EXTS = new Set([
    'jpg','jpeg','png','gif','bmp','webp','svg','ico','tiff','tif',
    'heic','heif','dcm','dicom','avif',
  ]);
  const VIDEO_EXTS = new Set([
    'mp4','webm','ogv','mov','avi','mkv','m4v','flv','wmv','3gp',
    'mpeg','mpg','ts','m2ts','vob','rm','rmvb',
  ]);
  const AUDIO_EXTS = new Set([
    'mp3','wav','flac','aac','m4a','ogg','opus','wma','mid','midi','aiff','aif',
  ]);
  const NATIVE_EXTS = new Set([
    'jpg','jpeg','png','gif','bmp','webp','svg','ico','avif',
  ]);
  const TIFF_EXTS = new Set(['tiff','tif']);
  const HEIC_EXTS = new Set(['heic','heif']);
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

  /* ── HEIC/HEIF decoder using heic2any (optional vendor dependency) ── */
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
    return null;
  }

  /* ── Minimal DICOM parser ── */
  function parseDicom(buffer) {
    const bytes = new Uint8Array(buffer);
    const view  = new DataView(buffer);

    // Verify DICOM signature (offset 128..131 = "DICM")
    if (bytes.length < 132) return null;
    const sig = String.fromCharCode(bytes[128], bytes[129], bytes[130], bytes[131]);
    if (sig !== 'DICM') {
      // Some DICOM files omit the preamble – try to parse from offset 0
      // (simplified: just report unsupported)
      return null;
    }

    let offset = 132;
    const tags = { rows: 0, cols: 0, bitsAllocated: 8, bitsStored: 8,
                   samplesPerPixel: 1, pixelRepresentation: 0,
                   photometric: 'MONOCHROME2', pixelData: null,
                   patientName: '', studyDate: '', modality: '' };

    const readStr = (off, len) => {
      let s = '';
      for (let i = 0; i < len; i++) {
        const c = bytes[off + i];
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    };

    let explicit = true;

    while (offset < bytes.length - 8) {
      if (offset + 4 > bytes.length) break;

      const group   = view.getUint16(offset,     true);
      const element = view.getUint16(offset + 2, true);
      offset += 4;

      let vr = '', length = 0;

      if (explicit) {
        if (offset + 2 > bytes.length) break;
        vr = String.fromCharCode(bytes[offset], bytes[offset + 1]);
        if (/^[A-Z]{2}$/.test(vr)) {
          offset += 2;
          if (['OB','OD','OF','OL','OW','SQ','UC','UN','UR','UT'].includes(vr)) {
            offset += 2; // reserved
            if (offset + 4 > bytes.length) break;
            length = view.getUint32(offset, true);
            offset += 4;
          } else {
            if (offset + 2 > bytes.length) break;
            length = view.getUint16(offset, true);
            offset += 2;
          }
        } else {
          // Implicit VR fallback
          explicit = false;
          offset -= 2;
          if (offset + 4 > bytes.length) break;
          length = view.getUint32(offset, true);
          offset += 4;
        }
      } else {
        if (offset + 4 > bytes.length) break;
        length = view.getUint32(offset, true);
        offset += 4;
      }

      if (length === 0xFFFFFFFF) { length = 0; } // undefined length – skip

      const valueStart = offset;

      if (group === 0x0028) {
        if      (element === 0x0010) tags.rows              = view.getUint16(offset, true);
        else if (element === 0x0011) tags.cols              = view.getUint16(offset, true);
        else if (element === 0x0100) tags.bitsAllocated     = view.getUint16(offset, true);
        else if (element === 0x0101) tags.bitsStored        = view.getUint16(offset, true);
        else if (element === 0x0103) tags.pixelRepresentation = view.getUint16(offset, true);
        else if (element === 0x0002) tags.samplesPerPixel   = view.getUint16(offset, true);
        else if (element === 0x0004) tags.photometric       = readStr(offset, length);
      } else if (group === 0x0010 && element === 0x0010) {
        tags.patientName = readStr(offset, length);
      } else if (group === 0x0008 && element === 0x0020) {
        tags.studyDate = readStr(offset, length);
      } else if (group === 0x0008 && element === 0x0060) {
        tags.modality = readStr(offset, length);
      } else if (group === 0x7FE0 && element === 0x0010) {
        // Pixel data
        if (length > 0 && offset + length <= bytes.length) {
          tags.pixelData = bytes.slice(offset, offset + length);
        }
        break; // pixel data is the last element we need
      }

      offset = valueStart + length;
      if (offset % 2 !== 0) offset++; // DICOM alignment
    }

    return tags;
  }

  function renderDicomToDataUrl(tags) {
    if (!tags || !tags.pixelData || tags.rows === 0 || tags.cols === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width  = tags.cols;
    canvas.height = tags.rows;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(tags.cols, tags.rows);
    const data    = imgData.data;
    const px      = tags.pixelData;
    const bits    = tags.bitsAllocated;
    const isMono  = !tags.photometric.includes('RGB');
    const isSigned = tags.pixelRepresentation === 1;
    const pixelCount = tags.cols * tags.rows;

    if (bits === 8 && tags.samplesPerPixel === 3 && !isMono) {
      // RGB
      for (let i = 0; i < pixelCount; i++) {
        data[i * 4]     = px[i * 3];
        data[i * 4 + 1] = px[i * 3 + 1];
        data[i * 4 + 2] = px[i * 3 + 2];
        data[i * 4 + 3] = 255;
      }
    } else {
      // Grayscale (8 or 16 bit)
      let minVal = Infinity, maxVal = -Infinity;
      const rawVals = new Array(pixelCount);

      for (let i = 0; i < pixelCount; i++) {
        let val;
        if (bits <= 8) {
          val = isSigned ? (px[i] > 127 ? px[i] - 256 : px[i]) : px[i];
        } else {
          // 16-bit
          const lo = px[i * 2], hi = px[i * 2 + 1];
          const raw = lo | (hi << 8);
          val = isSigned ? (raw > 32767 ? raw - 65536 : raw) : raw;
        }
        rawVals[i] = val;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }

      const range = maxVal - minVal || 1;
      const invert = tags.photometric === 'MONOCHROME1';

      for (let i = 0; i < pixelCount; i++) {
        let gray = Math.round(((rawVals[i] - minVal) / range) * 255);
        if (invert) gray = 255 - gray;
        data[i * 4]     = gray;
        data[i * 4 + 1] = gray;
        data[i * 4 + 2] = gray;
        data[i * 4 + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png'), meta: tags };
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
      return { type: 'image', dataUrl };
    }

    // Read raw buffer via IPC
    const dataUrl = await window.electronAPI.readFileBase64(filePath);
    if (dataUrl && dataUrl.error) return { type: 'error', message: dataUrl.error };

    if (isTiff(filePath) || isHeic(filePath)) {
      // Use main-process converter (HEIC → heic-convert first; TIFF → sharp)
      const result = await window.electronAPI.convertToPng(filePath);
      if (result && !result.error && typeof result === 'string' && result.startsWith('data:')) {
        return { type: 'image', dataUrl: result };
      }
      // Fallback to browser-based decoders
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

    if (isDcm(filePath)) {
      const result = await window.electronAPI.decodeDicom(filePath);
      if (result && !result.error) {
        if (typeof result === 'string') return { type: 'image', dataUrl: result };
        if (result.dataUrl) return { type: 'image', dataUrl: result.dataUrl, dicomMeta: result.meta };
        return { type: 'image', dataUrl: result };
      }
      // Client-side DICOM fallback (web mode)
      try {
        const raw = dataUrl.includes(',') ? dataUrl.split(',')[1] : null;
        if (raw) {
          const bin = atob(raw);
          const buf = new ArrayBuffer(bin.length);
          const u8 = new Uint8Array(buf);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          const tags = parseDicom(buf);
          if (tags && tags.pixelData) {
            const rendered = renderDicomToDataUrl(tags);
            if (rendered) {
              return { type: 'image', dataUrl: rendered.dataUrl, dicomMeta: rendered.meta || tags };
            }
          }
        }
      } catch (e) {
        console.error('Client DICOM decode failed:', e);
      }
      return { type: 'error', message: result?.error || 'Could not decode DICOM file' };
    }

    // Generic fallback
    return { type: 'image', dataUrl };
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

  async function decodeDicomBuffer(buffer) {
    const tags = parseDicom(buffer);
    if (!tags || !tags.pixelData) return { error: 'Could not parse DICOM file' };
    const rendered = renderDicomToDataUrl(tags);
    if (!rendered) return { error: 'Could not render DICOM pixels' };
    return rendered.dataUrl;
  }

  return {
    getExtension, isImage, isVideo, isAudio, isSupportedFile,
    isNativeImage, isTiff, isHeic, isDcm,
    loadImageFile, formatFileSize, formatDate, decodeDicomBuffer,
    IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS,
  };
})();
