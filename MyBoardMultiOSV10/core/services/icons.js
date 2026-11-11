// Uploaded icons (§4) and the SVG sanitiser.
import { newId } from '../ids.js';
import { NotFoundError, ValidationError, ForbiddenError, check } from '../errors.js';
import { toApi, emit, nowOf, requireText, requireUser, isAdmin } from './common.js';

export const ICON_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml', 'image/avif'];
const MAX_ICON_BYTES = 512 * 1024;

// ---- SVG sanitiser ---------------------------------------------------------------------------------------------
// A whitelist sanitiser over a small tokenizer: keeps known SVG drawing elements and presentation attributes,
// drops script/style/foreignObject (with content), event handlers, external references, DOCTYPE/ENTITY.

const ALLOWED_TAGS = new Set(('svg g path circle ellipse line polyline polygon rect text tspan textPath defs linearGradient radialGradient stop ' +
  'clipPath mask pattern use symbol title desc marker image filter feBlend feColorMatrix feComponentTransfer feComposite feFlood ' +
  'feGaussianBlur feMerge feMergeNode feOffset feDropShadow feFuncA feFuncR feFuncG feFuncB feMorphology feTurbulence feDisplacementMap').split(' ').map((t) => t.toLowerCase()));
const DROP_WITH_CONTENT = new Set(['script', 'style', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'a', 'animate', 'set', 'animatetransform', 'animatemotion', 'handler', 'listener']);

function safeAttr(name, value) {
  const n = name.toLowerCase();
  if (n.startsWith('on')) return false;
  if (n === 'style') return !/url\s*\(|expression|javascript:|@import|behavior/i.test(value);
  if (n === 'href' || n === 'xlink:href') return /^#/.test(value.trim()) || /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value.trim());
  if (/^(xmlns(:\w+)?)$/.test(n)) return true;
  if (!/^[a-z][a-z0-9:_.-]*$/i.test(n)) return false;
  if (/url\s*\(/i.test(value) && !/^url\(\s*#[\w.-]+\s*\)$/i.test(value.trim())) return false;
  return !/javascript:|vbscript:|data:text/i.test(value);
}

const escAttr = (v) => v.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * @param {string} svg
 * @returns {string} sanitised SVG markup
 */
export function sanitizeSvg(svg) {
  const src = String(svg);
  let out = '';
  let i = 0;
  let dropDepth = 0;
  let dropTag = null;
  const stack = [];
  let sawSvg = false;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { if (!dropDepth) out += escText(src.slice(i)); break; }
    if (lt > i && !dropDepth) out += escText(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? src.length : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt); i = e < 0 ? src.length : e + 3; continue; }
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) { i = skipDecl(src, lt); continue; }
    const m = /^<\/?([a-zA-Z][\w:.-]*)/.exec(src.slice(lt, lt + 100));
    const end = findTagEnd(src, lt);
    if (!m || end < 0) { i = lt + 1; if (!dropDepth) out += '&lt;'; continue; }
    const raw = src.slice(lt, end + 1);
    const closing = raw[1] === '/';
    const name = m[1];
    const lname = name.toLowerCase().replace(/^svg:/, '');
    const selfClosing = /\/\s*>$/.test(raw);
    i = end + 1;
    if (dropDepth) {
      if (lname === dropTag) { if (closing) dropDepth--; else if (!selfClosing) dropDepth++; if (!dropDepth) dropTag = null; }
      continue;
    }
    if (DROP_WITH_CONTENT.has(lname) || !ALLOWED_TAGS.has(lname)) {
      if (!closing && !selfClosing) { dropDepth = 1; dropTag = lname; }
      continue;
    }
    if (closing) {
      const idx = stack.lastIndexOf(lname);
      if (idx >= 0) { while (stack.length > idx) out += `</${stack.pop()}>`; }
      continue;
    }
    if (lname === 'svg') sawSvg = true;
    const attrs = [];
    const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
    const body = raw.slice(1 + name.length, raw.length - (selfClosing ? 2 : 1));
    let a;
    while ((a = re.exec(body))) {
      const an = a[1];
      const av = a[2] ?? a[3] ?? a[4] ?? '';
      if (safeAttr(an, decodeEntities(av))) attrs.push(`${an}="${escAttr(av)}"`);
    }
    const tagName = name.replace(/^svg:/i, '');
    out += `<${tagName}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClosing ? '/>' : '>'}`;
    if (!selfClosing) stack.push(tagName.toLowerCase() === lname ? tagName : lname);
  }
  while (stack.length) out += `</${stack.pop()}>`;
  if (!sawSvg) throw new ValidationError('INVALID_SVG', 'The file is not an SVG image');
  return out.trim();
}

function escText(t) { return t.replace(/<|>/g, (c) => (c === '<' ? '&lt;' : '&gt;')).replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;'); }
function decodeEntities(v) { return v.replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(Number(d))).replace(/&colon;/gi, ':').replace(/&tab;|&newline;/gi, ''); }
function findTagEnd(src, from) {
  let q = null;
  for (let j = from + 1; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') return j;
  }
  return -1;
}
function skipDecl(src, from) {
  // <!DOCTYPE … [ … ]> may contain an internal subset with entity declarations — skip all of it
  let depth = 0;
  for (let j = from + 2; j < src.length; j++) {
    if (src[j] === '[') depth++;
    else if (src[j] === ']') depth--;
    else if (src[j] === '>' && depth <= 0) return j + 1;
  }
  return src.length;
}

/** Sniff the image type from magic bytes. */
export function sniffMime(buf) {
  const b = buf;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  if (b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp' && /avi[fs]/.test(b.toString('ascii', 8, 12))) return 'image/avif';
  const head = b.toString('utf8', 0, Math.min(b.length, 1024)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.includes('<svg')) return 'image/svg+xml';
  return null;
}

export function createIcons(core) {
  const db = () => core.db;
  const META = ['id', 'kind', 'name', 'mime', 'width', 'height', 'created_by', 'created_at', 'updated_at'];
  return {
    async list(ctx) {
      requireUser(ctx);
      return (await db().select('icons', {}, { order: 'created_at', columns: META })).map((r) => ({ ...toApi('icons', r), ref: `u:${r.id}` }));
    },
    /** body: { name, mime?, data: base64, width?, height? } → { id, ref: 'u:<id>', … } */
    async create(ctx, body = {}) {
      requireUser(ctx);
      const name = requireText(body.name || 'icon', 'name', 200);
      let data = body.buffer ? Buffer.from(body.buffer) : Buffer.from(String(body.data || '').replace(/^data:[^,]*,/, ''), 'base64');
      check(data.length > 0, 'EMPTY_FILE', 'The file is empty');
      check(data.length <= MAX_ICON_BYTES, 'FILE_TOO_LARGE', 'Icons are limited to 512 KB', { max: MAX_ICON_BYTES });
      const mime = sniffMime(data);
      check(mime && ICON_MIMES.includes(mime), 'UNSUPPORTED_IMAGE', 'Use PNG, JPEG, GIF, WebP, BMP, ICO, AVIF or SVG');
      if (mime === 'image/svg+xml') data = Buffer.from(sanitizeSvg(data.toString('utf8')), 'utf8');
      const now = nowOf(ctx);
      const row = await db().insert('icons', {
        id: newId(), kind: 'upload', name, mime, data, width: body.width ? Math.round(body.width) : null, height: body.height ? Math.round(body.height) : null,
        created_by: ctx.user?.id || null, created_at: now, updated_at: now,
      });
      const out = { ...toApi('icons', row), ref: `u:${row.id}` };
      emit(core, ctx, 'icon.created', ['icons'], { id: row.id, data: out });
      return out;
    },
    /** → { mime, data: Buffer } (public within the API: icons appear on shared pages) */
    async bytes(id) {
      const r = await db().get('SELECT "mime", "data", "updated_at" FROM "icons" WHERE "id" = ?', [id]);
      if (!r) throw new NotFoundError('ICON_NOT_FOUND', 'Icon not found');
      return { mime: r.mime, data: r.data, updatedAt: r.updated_at };
    },
    async remove(ctx, id) {
      requireUser(ctx);
      const r = await db().get('SELECT "id", "created_by" FROM "icons" WHERE "id" = ?', [id]);
      if (!r) throw new NotFoundError('ICON_NOT_FOUND', 'Icon not found');
      if (r.created_by !== ctx.user?.id && !isAdmin(ctx)) throw new ForbiddenError('NOT_OWNER', 'Only the uploader or an administrator can delete this icon');
      await db().remove('icons', { id });
      emit(core, ctx, 'icon.deleted', ['icons'], { id });
      return { ok: true };
    },
  };
}
