'use strict';

// A tolerant HTML tokenizer. It does not build a DOM; it streams start tags,
// their attributes, raw text of script/style, comments and text. It is
// deliberately forgiving of malformed markup (unquoted attrs, missing closers,
// stray '<', etc.) because real pages are messy.

function tokenize(html) {
  const tokens = [];
  const len = html.length;
  let i = 0;
  while (i < len) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      if (i < len) tokens.push({ type: 'text', text: html.slice(i) });
      break;
    }
    if (lt > i) tokens.push({ type: 'text', text: html.slice(i, lt) });

    // Comment / doctype
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      const stop = end === -1 ? len : end + 3;
      tokens.push({ type: 'comment', text: html.slice(lt + 4, end === -1 ? len : end) });
      i = stop;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt + 1);
      i = end === -1 ? len : end + 1;
      continue;
    }

    // End tag
    if (html[lt + 1] === '/') {
      const end = html.indexOf('>', lt + 2);
      const name = html.slice(lt + 2, end === -1 ? len : end).trim().toLowerCase();
      tokens.push({ type: 'end', name });
      i = end === -1 ? len : end + 1;
      continue;
    }

    // Start tag — but only if it looks like a tag name char
    if (!/[a-zA-Z]/.test(html[lt + 1] || '')) {
      tokens.push({ type: 'text', text: '<' });
      i = lt + 1;
      continue;
    }

    const end = findTagEnd(html, lt + 1);
    const inner = html.slice(lt + 1, end.pos);
    const parsed = parseTag(inner);
    i = end.pos + 1;

    // Raw-text elements: capture body verbatim until matching close tag.
    if ((parsed.name === 'script' || parsed.name === 'style' || parsed.name === 'textarea') && !end.selfClose) {
      const closeRe = new RegExp(`</${parsed.name}`, 'i');
      const rest = html.slice(i);
      const m = closeRe.exec(rest);
      const rawEnd = m ? i + m.index : len;
      parsed.raw = html.slice(i, rawEnd);
      tokens.push({ type: 'start', ...parsed, selfClose: false });
      const gt = html.indexOf('>', rawEnd);
      i = gt === -1 ? len : gt + 1;
      continue;
    }

    tokens.push({ type: 'start', ...parsed, selfClose: end.selfClose });
  }
  return tokens;
}

function findTagEnd(html, from) {
  let i = from;
  let quote = null;
  while (i < html.length) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      const selfClose = html[i - 1] === '/';
      return { pos: i, selfClose };
    }
    i += 1;
  }
  return { pos: html.length, selfClose: false };
}

function parseTag(inner) {
  // strip trailing slash
  inner = inner.replace(/\/\s*$/, '');
  const nameMatch = /^([a-zA-Z][a-zA-Z0-9:-]*)/.exec(inner);
  const name = nameMatch ? nameMatch[1].toLowerCase() : '';
  const attrs = {};
  let s = inner.slice(name.length);
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = attrRe.exec(s))) {
    if (m[0].trim() === '') {
      if (attrRe.lastIndex === m.index) attrRe.lastIndex += 1;
      continue;
    }
    const key = m[1].toLowerCase();
    let val = m[4] !== undefined ? m[4] : m[5] !== undefined ? m[5] : m[6] !== undefined ? m[6] : '';
    attrs[key] = decodeEntities(val);
  }
  return { name, attrs };
}

function decodeEntities(s) {
  if (!s || s.indexOf('&') === -1) return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)));
}

function safeChar(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

// Extract links, forms, scripts and inline script bodies from a page.
function extract(html) {
  const tokens = tokenize(html);
  const links = new Set();
  const scripts = new Set();
  const inlineScripts = [];
  const forms = [];
  let currentForm = null;

  for (const t of tokens) {
    if (t.type !== 'start') {
      if (t.type === 'end' && t.name === 'form' && currentForm) {
        forms.push(currentForm);
        currentForm = null;
      }
      continue;
    }
    const a = t.attrs || {};
    switch (t.name) {
      case 'a':
      case 'area':
        if (a.href) links.add(a.href);
        break;
      case 'link':
        if (a.href) links.add(a.href);
        break;
      case 'iframe':
      case 'frame':
        if (a.src) links.add(a.src);
        break;
      case 'img':
      case 'source':
        if (a.src) links.add(a.src);
        if (a.srcset) for (const part of a.srcset.split(',')) links.add(part.trim().split(/\s+/)[0]);
        break;
      case 'script':
        if (a.src) scripts.add(a.src);
        if (t.raw && t.raw.trim()) inlineScripts.push(t.raw);
        break;
      case 'form': {
        if (currentForm) forms.push(currentForm);
        currentForm = {
          action: a.action || '',
          method: (a.method || 'GET').toUpperCase(),
          enctype: a.enctype || 'application/x-www-form-urlencoded',
          fields: [],
        };
        break;
      }
      case 'input':
      case 'textarea':
      case 'select':
        if (currentForm) {
          currentForm.fields.push({
            name: a.name || '',
            type: (a.type || (t.name === 'input' ? 'text' : t.name)).toLowerCase(),
            value: a.value || '',
            autocomplete: a.autocomplete !== undefined ? a.autocomplete : null,
          });
        }
        break;
      default:
        break;
    }
  }
  if (currentForm) forms.push(currentForm);
  return {
    links: [...links],
    scripts: [...scripts],
    inlineScripts,
    forms,
  };
}

module.exports = { tokenize, extract, parseTag, decodeEntities };
