// The user guide and tutorial window: loads one of the Markdown documents copied
// here by scripts/build-docs.mjs, renders it (markdown.js) with a table of
// contents, follows the app's theme, and offers the document switch, the font
// size (− size +), the language (Korean / British flags) and Print — which opens
// a print window of its own (print.html) with printer, page settings and preview.
(function () {
  'use strict';
  var M = window.DocMarkdown;
  var I = window.DocIcons;
  var LABELS = {
    ko: {
      guide: '사용자 설명서', tutorial: '튜토리얼', print: '인쇄…', toc: '목차', missing: '문서를 불러오지 못했습니다.',
      font: '글꼴 크기', smaller: '글꼴 작게', larger: '글꼴 크게', reset: '기본 크기로', ko: '한국어', en: 'English',
    },
    en: {
      guide: 'User guide', tutorial: 'Tutorial', print: 'Print…', toc: 'Contents', missing: 'The document could not be loaded.',
      font: 'Font size', smaller: 'Smaller text', larger: 'Larger text', reset: 'Default size', ko: '한국어', en: 'English',
    },
  };

  var params = new URLSearchParams(location.search);
  var doc = params.get('doc') === 'tutorial' ? 'tutorial' : 'guide';
  var lang = params.get('lang') === 'en' ? 'en' : 'ko';
  var L = LABELS[lang];

  M.followTheme();
  M.applyFontSize();

  // ── toolbar ──────────────────────────────────────────────────────────────
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-doc]').forEach(function (b) {
    b.innerHTML = I[b.dataset.doc] + '<span>' + L[b.dataset.doc] + '</span>';
    b.classList.toggle('active', b.dataset.doc === doc);
    b.onclick = function () {
      location.replace('index.html?doc=' + b.dataset.doc + '&lang=' + lang);
    };
  });
  document.querySelectorAll('[data-lang]').forEach(function (b) {
    var code = b.dataset.lang;
    b.innerHTML = (code === 'ko' ? I.flagKo : I.flagEn) + '<span>' + L[code] + '</span>';
    b.title = L[code];
    b.classList.toggle('active', code === lang);
    b.onclick = function () {
      location.replace('index.html?doc=' + doc + '&lang=' + code);
    };
  });

  var sizeOut = document.getElementById('font-size');
  function showSize(v) {
    sizeOut.textContent = v + 'px';
  }
  document.getElementById('font-label').innerHTML = I.font + '<span>' + L.font + '</span>';
  var down = document.getElementById('font-down');
  var up = document.getElementById('font-up');
  var reset = document.getElementById('font-reset');
  down.innerHTML = I.minus;
  up.innerHTML = I.plus;
  reset.innerHTML = I.reset;
  down.title = L.smaller;
  up.title = L.larger;
  reset.title = L.reset;
  down.onclick = function () {
    showSize(M.setFontSize(M.fontSize() - 1));
  };
  up.onclick = function () {
    showSize(M.setFontSize(M.fontSize() + 1));
  };
  reset.onclick = function () {
    showSize(M.setFontSize(M.fontRange.def));
  };
  showSize(M.fontSize());
  window.addEventListener('storage', function () {
    showSize(M.fontSize());
  });

  var printButton = document.getElementById('print');
  printButton.innerHTML = I.print + '<span>' + L.print + '</span>';
  printButton.onclick = function () {
    var query = 'doc=' + doc + '&lang=' + lang;
    var bridge = M.tauri();
    if (bridge) {
      bridge.invoke('open_doc_print', { doc: doc, language: lang });
    } else {
      window.open('print.html?' + query, 'dbtools-doc-print', 'width=1180,height=860');
    }
  };
  document.title = 'DBTools — ' + L[doc];

  // ── window buttons (desktop: the window has no title bar) ────────────────
  (function () {
    var bridge = M.tauri();
    if (!bridge) return;
    var W = lang === 'en'
      ? { min: 'Minimize', max: 'Maximize / restore', close: 'Close' }
      : { min: '최소화', max: '최대화 / 복원', close: '닫기' };
    var call = function (cmd) { return bridge.invoke('plugin:window|' + cmd, { label: 'doc' }); };
    var set = function (id, icon, title, cmd) {
      var b = document.getElementById(id);
      b.innerHTML = icon;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.onclick = function () { call(cmd).catch(function () {}); };
    };
    set('win-min', I.winMin, W.min, 'minimize');
    set('win-max', I.winMax, W.max, 'toggle_maximize');
    set('win-close', I.close, W.close, 'close');
    document.getElementById('win-controls').hidden = false;
    document.documentElement.classList.add('frameless');
    // Double-clicking the bar (not a button) maximizes or restores, like a title bar.
    document.querySelector('.doc-bar').addEventListener('dblclick', function (e) {
      if (!e.target.closest('button, output, select, input')) call('toggle_maximize').catch(function () {});
    });
  })();

  // ── document ─────────────────────────────────────────────────────────────
  var render = M.create(lang);
  fetch(M.files[doc][lang])
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    })
    .then(function (md) {
      var result = render(md);
      document.getElementById('body').innerHTML = result.html;
      document.getElementById('toc').innerHTML =
        '<div class="toc-title">' + I.contents + '<span>' + L.toc + '</span></div>' +
        result.toc
          .map(function (t) {
            return '<a class="toc-' + t.level + '" href="#' + t.id + '">' + t.html.replace(/<a [^>]*>|<\/a>/g, '') + '</a>';
          })
          .join('');
      if (location.hash) {
        var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) target.scrollIntoView();
      }
    })
    .catch(function () {
      document.getElementById('body').innerHTML = '<p>' + L.missing + '</p>';
    });
})();
