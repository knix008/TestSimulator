// Stream an audio or video file to the player (GET /api/file.media).
// Range requests let the controls seek without reading the whole file first.
'use strict';

const fs = require('fs');
const path = require('path');

const MIME = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac',
  aac: 'audio/aac', m4a: 'audio/mp4', opus: 'audio/ogg', aiff: 'audio/aiff', aif: 'audio/aiff', wma: 'audio/x-ms-wma',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo',
};

function mediaMime(filePath) {
  return MIME[path.extname(String(filePath || '')).slice(1).toLowerCase()] || '';
}

function fail(res, status, message) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  res.end(message);
}

function serveMedia(req, res, filePath) {
  const mime = mediaMime(filePath);
  if (!filePath || !mime) return fail(res, 415, 'Unsupported media');
  let abs;
  try { abs = path.resolve(String(filePath)); } catch { return fail(res, 400, 'Bad path'); }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) return fail(res, 404, 'Not found');
    const size = st.size;
    const headers = {
      'content-type': mime,
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range, accept-ranges, content-length',
    };
    if (req.method === 'HEAD') {
      headers['content-length'] = size;
      res.writeHead(200, headers);
      res.end();
      return;
    }
    const range = req.headers.range;
    let start = 0;
    let end = size - 1;
    let status = 200;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m || (m[1] === '' && m[2] === '')) {
        res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` });
        res.end();
        return;
      }
      if (m[1] === '') {
        const n = Number(m[2]);
        start = Math.max(0, size - n);
      } else {
        start = Number(m[1]);
        end = m[2] === '' ? size - 1 : Number(m[2]);
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
        res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` });
        res.end();
        return;
      }
      end = Math.min(end, size - 1);
      status = 206;
      headers['content-range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['content-length'] = end - start + 1;
    res.writeHead(status, headers);
    fs.createReadStream(abs, { start, end }).pipe(res);
  });
}

module.exports = { serveMedia, mediaMime };
