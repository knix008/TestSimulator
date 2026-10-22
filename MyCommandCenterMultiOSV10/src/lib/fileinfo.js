// What is *inside* a file, for the file-info window's "Content" section:
// a picture's size and format (EXIF for a JPEG, the tags of a DICOM / TIFF),
// a text file's encoding and line count, an archive's kind, the signature of
// anything else. Everything comes from one fs.readFile (the viewer's own
// limits apply: 24 MB for pictures, the first 8 MB of a text file).
import { call } from './backend';
import { decodeImage, base64ToBytes, isImageName, extOf } from './images';
import { readExif, exifRows } from './exif';
import { t } from './i18n';
import { formatSize } from './format';

// Rows: [label, value]. `label` is an i18n key.
export async function describeContent(info) {
  if (!info || info.isDir) return [];
  const rows = [];
  let archive = null;
  try { archive = await call('archive.describe', { path: info.path }); } catch { /* not an archive */ }
  if (archive && archive.isArchive) {
    rows.push(['info_archive', archive.isSplit ? t('info_archive_split', { base: archive.base || '' }) : t('info_archive_yes')]);
    if (archive.isSplit) return rows;
  }
  let data;
  try { data = await call('fs.readFile', { path: info.path }); } catch (err) { return rows.concat([['info_content', err && err.message ? err.message : String(err)]]); }
  if (data.kind === 'image') {
    if (data.truncated || !data.base64) return rows.concat([['info_image', t('viewer_too_large')]]);
    try {
      const d = await decodeImage(data, info.name);
      const mp = (d.width * d.height) / 1e6;
      rows.push(['info_dimensions', `${d.width} × ${d.height} px  ·  ${mp >= 0.1 ? `${mp.toFixed(1)} MP  ·  ` : ''}${ratio(d.width, d.height)}`]);
      rows.push(['info_format', `${data.mime}${d.note ? `  ·  ${d.note}` : ''}`]);
      for (const [k, v] of d.details || []) rows.push([k, v]);
      if (extOf(info.name) === 'jpg' || extOf(info.name) === 'jpeg' || extOf(info.name) === 'jfif') rows.push(...exifRows(readExif(base64ToBytes(data.base64))));
    } catch (err) {
      rows.push(['info_image', t('img_decode_failed', { name: info.name })], ['info_error', err && err.message ? err.message : String(err)]);
    }
    return rows;
  }
  if (data.kind === 'text') {
    const text = data.text || '';
    const crlf = (text.match(/\r\n/g) || []).length, lf = (text.match(/(^|[^\r])\n/g) || []).length;
    const lines = text ? (text.match(/\n/g) || []).length + (text.endsWith('\n') ? 0 : 1) : 0;
    const words = (text.match(/\S+/g) || []).length;
    let eol = crlf && lf ? t('info_eol_mixed') : crlf ? 'CRLF' : lf ? 'LF' : '—';
    rows.push(['info_text', `${data.encoding}  ·  ${t('viewer_lines', { n: lines })}  ·  ${t('info_words', { n: words })}  ·  ${t('info_chars', { n: text.length })}${data.truncated ? `  ·  ${t('viewer_truncated')}` : ''}`]);
    rows.push(['info_eol', eol]);
    const longest = text.split(/\r?\n/).reduce((m, l) => Math.max(m, l.length), 0);
    rows.push(['info_longest_line', t('info_chars', { n: longest })]);
    return rows;
  }
  // Binary: the first bytes (a magic number tells a lot to a trained eye).
  const bytes = base64ToBytes(data.base64 || '').subarray(0, 16);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
  const ascii = Array.from(bytes, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
  rows.push(['info_binary', `${formatSize(data.size)}`], ['info_signature', `${hex}  ${ascii}`]);
  return rows;
}

function ratio(w, h) {
  const g = (a, b) => (b ? g(b, a % b) : a);
  const d = g(w, h);
  const rw = w / d, rh = h / d;
  if (rw <= 32 && rh <= 32) return `${rw}:${rh}`;
  return `${(w / h).toFixed(2)}:1`;
}

export { isImageName };
