/**
 * Parse SRT / SMI / VTT into cue list: { start, end, text } in seconds.
 */

function parseTimestamp(ts) {
  const cleaned = ts.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const s = Number(parts[2]);
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return Number(cleaned) || 0;
}

function decodeHtmlEntities(text) {
  const map = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'"
  };
  return text
    .replace(/&nbsp;|&#39;|&quot;|&lt;|&gt;|&amp;/gi, (m) => map[m.toLowerCase()] || m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
}

export function parseSRT(content) {
  const blocks = content.replace(/\r/g, '').split(/\n\s*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length);
    if (lines.length < 2) continue;
    let idx = 0;
    if (/^\d+$/.test(lines[0].trim())) idx = 1;
    const timeLine = lines[idx] || '';
    const m = timeLine.match(/(.+?)\s*-->\s*(.+)/);
    if (!m) continue;
    const start = parseTimestamp(m[1].split(' ')[0]);
    const end = parseTimestamp(m[2].split(' ')[0]);
    const text = lines.slice(idx + 1).join('\n').replace(/\{.*?\}/g, '');
    if (text) cues.push({ start, end, text: stripTags(text) });
  }
  return cues;
}

export function parseVTT(content) {
  const withoutHeader = content.replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n/, '');
  return parseSRT(withoutHeader);
}

export function parseSMI(content) {
  const cues = [];
  const bodyMatch = content.match(/<BODY[^>]*>([\s\S]*?)<\/BODY>/i);
  const body = bodyMatch ? bodyMatch[1] : content;
  const syncRegex = /<SYNC\s+Start\s*=\s*(\d+)\s*>/gi;
  const parts = [];
  let match;
  while ((match = syncRegex.exec(body)) !== null) {
    parts.push({ startMs: Number(match[1]), index: match.index + match[0].length });
  }
  for (let i = 0; i < parts.length; i++) {
    const start = parts[i].startMs / 1000;
    const end = i + 1 < parts.length ? parts[i + 1].startMs / 1000 : start + 3;
    const chunkEnd = i + 1 < parts.length ? parts[i + 1].index - ('<SYNC'.length) : body.length;
    // Find next SYNC tag start more reliably
    const nextSync = body.indexOf('<SYNC', parts[i].index);
    const raw = body.slice(parts[i].index, nextSync === -1 ? body.length : nextSync);
    const pMatch = raw.match(/<P[^>]*>([\s\S]*?)(?:<\/P>|$)/i);
    const text = stripTags(pMatch ? pMatch[1] : raw);
    if (!text || /^&nbsp;$/i.test(text)) continue;
    cues.push({ start, end: Math.max(end, start + 0.2), text });
  }
  return cues;
}

export function parseSubtitle(content, ext = '') {
  const lower = (ext || '').toLowerCase();
  const trimmed = (content || '').replace(/^\uFEFF/, '');
  if (lower === '.smi' || /<SAMI[\s>]/i.test(trimmed) || /<SYNC\s+Start/i.test(trimmed)) {
    return parseSMI(trimmed);
  }
  if (lower === '.vtt' || /^WEBVTT/i.test(trimmed)) {
    return parseVTT(trimmed);
  }
  return parseSRT(trimmed);
}

export class SubtitleRenderer {
  constructor(overlayEl) {
    this.overlay = overlayEl;
    this.cues = [];
    this.enabled = true;
    this._lastText = '';
  }

  setCues(cues) {
    this.cues = Array.isArray(cues) ? cues : [];
    this._lastText = '';
    this.clear();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  setFontSize(px) {
    document.documentElement.style.setProperty('--subtitle-size', `${px}px`);
  }

  clear() {
    this.overlay.textContent = '';
    this.overlay.classList.remove('visible');
    this._lastText = '';
  }

  update(timeSec) {
    if (!this.enabled || !this.cues.length) {
      if (this._lastText) this.clear();
      return;
    }
    const cue = this.cues.find((c) => timeSec >= c.start && timeSec < c.end);
    const text = cue ? cue.text : '';
    if (text === this._lastText) return;
    this._lastText = text;
    if (!text) {
      this.overlay.classList.remove('visible');
      this.overlay.textContent = '';
      return;
    }
    this.overlay.textContent = text;
    this.overlay.classList.add('visible');
  }
}

/**
 * Web mode: try to find sibling subtitle from a FileList / directory selection.
 * Also supports matching by base name when user drops multiple files.
 */
export async function findSubtitleInFileList(mediaFile, fileList) {
  if (!mediaFile || !fileList?.length) return null;
  const base = mediaFile.name.replace(/\.[^.]+$/, '');
  const preferred = ['.smi', '.srt', '.vtt'];
  const files = [...fileList];
  for (const ext of preferred) {
    const hit = files.find((f) => f.name.toLowerCase() === (base + ext).toLowerCase());
    if (hit) {
      const content = await hit.text();
      return { name: hit.name, content, ext: ext };
    }
  }
  return null;
}
