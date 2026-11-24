// The small Markdown renderer the user guide, the tutorial and their print window
// share (no build step: plain script, window.DocMarkdown). Headings, paragraphs,
// nested lists, tables, code blocks, quotes, rules, links, images, bold, italic.
(function () {
  'use strict';

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function slug(text) {
    return text
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  function create(lang) {
    function inline(text) {
      var codes = [];
      text = text.replace(/`([^`]+)`/g, function (_, c) {
        codes.push('<code>' + esc(c) + '</code>');
        return '\u0000' + (codes.length - 1) + '\u0000';
      });
      text = esc(text);
      text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
      text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
        var md = /^([\w.-]+?)(\.en)?\.md(#.*)?$/.exec(href);
        if (md) {
          var target = /tutorial/i.test(md[1]) ? 'tutorial' : 'guide';
          return '<a href="index.html?doc=' + target + '&lang=' + lang + (md[3] || '') + '">' + label + '</a>';
        }
        var external = /^https?:/.test(href);
        return '<a href="' + href + '"' + (external ? ' target="_blank" rel="noreferrer"' : '') + '>' + label + '</a>';
      });
      text = text.replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
      text = text.replace(/(^|[^\w])_([^_\s][^_]*)_(?=[^\w]|$)/g, '$1<em>$2</em>');
      return text.replace(/\u0000(\d+)\u0000/g, function (_, i) {
        return codes[Number(i)];
      });
    }

    function cells(row) {
      return row
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split(/(?<!\\)\|/)
        .map(function (c) {
          return c.trim().replace(/\\\|/g, '|');
        });
    }

    function list(block) {
      var base = /^(\s*)/.exec(block[0])[1].length;
      var ordered = /^\s*\d+\./.test(block[0]);
      var items = [];
      block.forEach(function (l) {
        var indent = /^(\s*)/.exec(l)[1].length;
        var marker = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(l);
        if (marker && indent <= base + 1) items.push({ text: [marker[2]], sub: [] });
        else if (items.length) {
          if (marker || items[items.length - 1].sub.length) items[items.length - 1].sub.push(l);
          else items[items.length - 1].text.push(l.trim());
        }
      });
      var tag = ordered ? 'ol' : 'ul';
      return (
        '<' + tag + '>' +
        items
          .map(function (it) {
            var sub = it.sub.length
              ? render(it.sub.map(function (s) { return s.replace(/^\s{2,4}/, ''); }).join('\n')).html
              : '';
            return '<li>' + inline(it.text.join(' ')) + sub + '</li>';
          })
          .join('') +
        '</' + tag + '>'
      );
    }

    function render(md) {
      var lines = md.replace(/\r\n/g, '\n').split('\n');
      var out = [];
      var toc = [];
      var i = 0;
      var para = [];
      function flush() {
        if (para.length) out.push('<p>' + inline(para.join(' ')) + '</p>');
        para = [];
      }
      while (i < lines.length) {
        var line = lines[i];
        if (/^\s*```/.test(line)) {
          flush();
          var code = [];
          i++;
          while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
          i++;
          out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
          continue;
        }
        var h = /^(#{1,4})\s+(.*)$/.exec(line);
        if (h) {
          flush();
          var level = h[1].length;
          var html = inline(h[2]);
          var id = slug(h[2]);
          out.push('<h' + level + ' id="' + id + '">' + html + '</h' + level + '>');
          if (level >= 2 && level <= 3) toc.push({ level: level, id: id, html: html });
          i++;
          continue;
        }
        if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
          flush();
          out.push('<hr>');
          i++;
          continue;
        }
        if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
          flush();
          var head = cells(line);
          i += 2;
          var rows = [];
          while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
          out.push(
            '<table><thead><tr>' +
              head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
              '</tr></thead><tbody>' +
              rows
                .map(function (r) {
                  return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
                })
                .join('') +
              '</tbody></table>',
          );
          continue;
        }
        if (/^\s*>/.test(line)) {
          flush();
          var quote = [];
          while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
          out.push('<blockquote>' + render(quote.join('\n')).html + '</blockquote>');
          continue;
        }
        if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
          flush();
          var block = [];
          while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && block.length))) {
            block.push(lines[i++]);
          }
          out.push(list(block));
          continue;
        }
        if (!line.trim()) {
          flush();
          i++;
          continue;
        }
        para.push(line.trim());
        i++;
      }
      flush();
      return { html: out.join('\n'), toc: toc };
    }

    return render;
  }

  var FILES = {
    guide: { ko: 'UsersGuide.md', en: 'UsersGuide.en.md' },
    tutorial: { ko: 'Tutorial.md', en: 'Tutorial.en.md' },
  };

  /** The app's theme (written by the app into localStorage), applied to this page and kept live. */
  function followTheme() {
    function apply() {
      try {
        var saved = JSON.parse(localStorage.getItem('dbtools.docAppearance') || 'null');
        if (!saved) return;
        document.documentElement.setAttribute('style', saved.style || '');
        document.documentElement.dataset.kind = saved.kind;
        document.documentElement.style.colorScheme = saved.kind;
        applyFontSize();
      } catch (e) {
        /* default colours */
      }
    }
    apply();
    window.addEventListener('storage', function (e) {
      if (e.key === 'dbtools.docAppearance') apply();
      if (e.key === FONT_KEY) applyFontSize();
    });
  }

  var FONT_KEY = 'dbtools.docFontSize';
  var FONT_MIN = 11;
  var FONT_MAX = 26;
  var FONT_DEFAULT = 15;

  function fontSize() {
    var n = Number(localStorage.getItem(FONT_KEY));
    return n >= FONT_MIN && n <= FONT_MAX ? n : FONT_DEFAULT;
  }

  function setFontSize(n) {
    var v = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(n)));
    try {
      localStorage.setItem(FONT_KEY, String(v));
    } catch (e) {
      /* this window only */
    }
    applyFontSize(v);
    return v;
  }

  function applyFontSize(v) {
    document.documentElement.style.setProperty('--doc-font-size', (v || fontSize()) + 'px');
  }

  /** The Tauri bridge when this page runs in the desktop shell, else null. */
  function tauri() {
    return window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke ? window.__TAURI_INTERNALS__ : null;
  }

  window.DocMarkdown = {
    create: create,
    files: FILES,
    followTheme: followTheme,
    fontSize: fontSize,
    setFontSize: setFontSize,
    applyFontSize: applyFontSize,
    fontRange: { min: FONT_MIN, max: FONT_MAX, def: FONT_DEFAULT },
    tauri: tauri,
    esc: esc,
  };
})();
