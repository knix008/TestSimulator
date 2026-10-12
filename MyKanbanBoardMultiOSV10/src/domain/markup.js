// Formatted text (card descriptions): a small whitelist of tags and only the
// font properties of `style`. Pure string code, so it runs without a DOM
// (unit tests, files read from disk, database rows).

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'span', 'br', 'div', 'p']);
const STYLES = {
  'font-family': /^[\w\s"',.\-ㄱ-힝]{1,120}$/,
  'font-size': /^\d{1,2}(\.\d+)?px$/,
  'font-weight': /^(normal|bold|[1-9]00)$/,
  'font-style': /^(normal|italic)$/,
};

function cleanStyle(style) {
  return String(style ?? '').split(';').map((part) => part.split(':')).map(([name, ...rest]) => [String(name ?? '').trim().toLowerCase(), rest.join(':').trim()])
    .filter(([name, value]) => STYLES[name]?.test(value)).map(([name, value]) => `${name}: ${value}`).join('; ');
}

/** Keeps only safe tags and font styles. Works without a DOM (unit tests, files). */
export function sanitize(html) {
  const out = [];
  const open = [];
  let skip = null; // inside <script>, <style>…: the content is dropped too
  for (const token of String(html ?? '').split(/(<[^>]*>)/)) {
    if (!token) continue;
    if (skip) {
      if (new RegExp(`^<\\s*/\\s*${skip}\\b`, 'i').test(token)) skip = null;
      continue;
    }
    const dropped = /^<\s*(script|style|textarea|iframe|object|template|title)\b/i.exec(token);
    if (dropped) {
      skip = dropped[1].toLowerCase();
      continue;
    }
    if (!token.startsWith('<')) {
      out.push(token.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;')).replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;'));
      continue;
    }
    const match = /^<\s*(\/)?\s*([a-z0-9]+)([^>]*)>$/i.exec(token);
    if (!match) continue;
    const [, closing, rawName, attributes] = match;
    const name = rawName.toLowerCase();
    if (!TAGS.has(name)) continue;
    if (name === 'br') { out.push('<br>'); continue; }
    if (closing) {
      const index = open.lastIndexOf(name);
      if (index < 0) continue;
      while (open.length > index) out.push(`</${open.pop()}>`);
      continue;
    }
    const style = name === 'span' ? cleanStyle(/style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes)?.[2] ?? /style\s*=\s*'([^']*)'/i.exec(attributes)?.[1] ?? '') : '';
    out.push(style ? `<${name} style="${escapeHtml(style)}">` : `<${name}>`);
    open.push(name);
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('');
}

/** Plain text of formatted HTML (line breaks kept). */
export function toPlain(html) {
  return sanitize(html)
    // Line breaks: <br>, and every <div>/<p> starts a line (that is how editors write new lines).
    .replace(/<br>/g, '\n').replace(/<(div|p)(\s[^>]*)?>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

/** Plain text → HTML (for descriptions written before formatting existed). */
export const fromPlain = (text) => escapeHtml(text ?? '').replace(/\n/g, '<br>');
