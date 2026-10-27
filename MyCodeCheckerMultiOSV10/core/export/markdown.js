'use strict';

// Markdown (GitHub flavoured) writer for the export document model.
//
//   toMarkdown(model, { embedImages = true, imageDir = 'images' })
//     -> { text, images: [{ path, png }] }
//
// embedImages: pictures go into the file as data: URIs (one self-contained
// .md). Otherwise the text links imageDir/<name>.png and `images` lists the
// files to write next to the .md.

const M = require('./model');

/** Text in a table cell: pipes escaped, line breaks as <br>. */
function cellMd(v) {
  return M.cellText(v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function inline(s) {
  return String(s == null ? '' : s).replace(/\r?\n/g, '  \n');
}

function tableMd(columns, rows, align) {
  const n = Math.max(columns.length, ...rows.map((r) => r.length), 1);
  const head = Array.from({ length: n }, (_, i) => cellMd(columns[i] == null ? '' : columns[i]) || ' ');
  const rule = Array.from({ length: n }, (_, i) => (align[i] === 'right' ? '---:' : '---'));
  const lines = [`| ${head.join(' | ')} |`, `| ${rule.join(' | ')} |`];
  for (const r of rows) lines.push(`| ${Array.from({ length: n }, (_, i) => cellMd(r[i])).join(' | ')} |`);
  return lines.join('\n');
}

function slug(s, fallback) {
  const v = String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return v || fallback;
}

function toMarkdown(model, opts = {}) {
  const m = M.normalize(model);
  const embed = opts.embedImages !== false;
  const dir = String(opts.imageDir || 'images').replace(/\\/g, '/').replace(/\/+$/, '');
  const out = [];
  const images = [];
  const used = new Set();
  if (m.title) out.push(`# ${inline(m.title)}`);
  if (m.subtitle) out.push(`_${inline(m.subtitle)}_`);
  if (m.meta.length) out.push(m.meta.map(([k, v]) => (k ? `- **${inline(k)}**: ${inline(v)}` : `- ${inline(v)}`)).join('\n'));
  for (const b of m.blocks) {
    switch (b.type) {
      case 'h1': out.push(`## ${inline(b.text)}`); break;
      case 'h2': out.push(`### ${inline(b.text)}`); break;
      case 'h3': out.push(`#### ${inline(b.text)}`); break;
      case 'p': out.push(b.small ? `<sub>${inline(b.text)}</sub>` : inline(b.text)); break;
      case 'list': out.push(b.items.map((it) => `- ${inline(it)}`).join('\n')); break;
      case 'badge': out.push(`> **${inline(b.text)}**`); break;
      case 'pagebreak': out.push('---'); break;
      case 'kv': if (b.rows.length) out.push(tableMd(['', ''], b.rows, [])); break;
      case 'table':
        if (b.caption) out.push(`**${inline(b.caption)}**`);
        out.push(tableMd(b.columns, b.rows, M.columnAlign(b)));
        break;
      case 'image': {
        const alt = String(b.alt || '').replace(/[[\]]/g, '');
        let src;
        if (embed) src = `data:image/png;base64,${b.png.toString('base64')}`;
        else {
          let name = slug(b.name || b.alt, `image-${images.length + 1}`);
          while (used.has(name)) name = `${name}-${images.length + 1}`;
          used.add(name);
          const p = `${dir}/${name}.png`;
          images.push({ path: p, png: b.png });
          src = encodeURI(p);
        }
        out.push(`![${alt}](${src})`);
        if (b.caption && b.caption !== b.alt) out.push(`_${inline(b.caption)}_`);
        break;
      }
      default: break;
    }
  }
  return { text: `${out.join('\n\n')}\n`, images };
}

module.exports = { toMarkdown, MIME: 'text/markdown; charset=utf-8' };
