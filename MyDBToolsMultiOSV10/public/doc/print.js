// The print window of the user guide and tutorial: printer and page settings on
// the left, a live preview on the right. "Print" sends the document straight to
// the chosen printer (WebView2, Windows desktop); "Save as PDF" writes a PDF. In
// a browser, or on macOS / Linux, Print opens the system print dialog instead.
(function () {
  'use strict';
  var M = window.DocMarkdown;
  var I = window.DocIcons;
  var params = new URLSearchParams(location.search);
  var doc = params.get('doc') === 'tutorial' ? 'tutorial' : 'guide';
  var lang = params.get('lang') === 'en' ? 'en' : 'ko';
  var bridge = M.tauri();

  var T = {
    ko: {
      title: '인쇄', guide: '사용자 설명서', tutorial: '튜토리얼', printer: '프린터', copies: '매수', collate: '한 부씩',
      duplex: '양면', one: '단면', long: '긴 쪽 넘김', short: '짧은 쪽 넘김', page: '페이지 설정', paper: '용지',
      orientation: '방향', portrait: '세로', landscape: '가로', margins: '여백', narrow: '좁게', normal: '보통', wide: '넓게',
      font: '글꼴 크기', pages: '페이지', all: '모두', range: '범위', grey: '흑백', headers: '머리글·쪽 번호',
      print: '인쇄', pdf: 'PDF로 저장', close: '닫기', system: '인쇄를 누르면 시스템 인쇄 대화 상자가 열립니다.',
      silent: '선택한 프린터로 바로 인쇄합니다.', sending: '프린터로 보내는 중…', sent: '{0}(으)로 보냈습니다.',
      saved: 'PDF를 저장했습니다: {0} ({1}쪽)', failed: '인쇄하지 못했습니다: {0}', def: '기본', options: '출력',
      sheet: '용지: {0} · {1} × {2} mm',
    },
    en: {
      title: 'Print', guide: 'User guide', tutorial: 'Tutorial', printer: 'Printer', copies: 'Copies', collate: 'Collate',
      duplex: 'Two-sided', one: 'One-sided', long: 'Long edge', short: 'Short edge', page: 'Page setup', paper: 'Paper',
      orientation: 'Orientation', portrait: 'Portrait', landscape: 'Landscape', margins: 'Margins', narrow: 'Narrow', normal: 'Normal', wide: 'Wide',
      font: 'Font size', pages: 'Pages', all: 'All', range: 'Range', grey: 'Greyscale', headers: 'Header and page numbers',
      print: 'Print', pdf: 'Save as PDF', close: 'Close', system: 'Print opens the system print dialog.',
      silent: 'Prints straight to the chosen printer.', sending: 'Sending to the printer…', sent: 'Sent to {0}.',
      saved: 'Saved the PDF: {0} ({1} pages)', failed: 'Printing failed: {0}', def: 'default', options: 'Output',
      sheet: 'Paper: {0} · {1} × {2} mm',
    },
  }[lang];
  function fmt(s) {
    var args = Array.prototype.slice.call(arguments, 1);
    return s.replace(/\{(\d+)\}/g, function (_, i) { return args[Number(i)]; });
  }

  var PAPERS = { A4: [210, 297], A3: [297, 420], A5: [148, 210], B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
  var MARGINS = { narrow: 8, normal: 15, wide: 25 };
  var state = {
    printer: '', printers: [], silent: false, copies: 1, collate: true, duplex: 'none',
    paper: 'A4', landscape: false, margin: 'normal', font: Math.max(9, Math.min(18, M.fontSize() - 3)),
    allPages: true, ranges: '', grey: false, headers: true,
  };
  var bodyHtml = '';
  var title = T[doc];

  M.followTheme();
  document.documentElement.lang = lang;
  document.title = 'MyDBTools — ' + T.title + ' — ' + title;

  // ── settings panel ───────────────────────────────────────────────────────
  function option(value, label, selected) {
    return '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' + M.esc(label) + '</option>';
  }
  function field(label, control) {
    return '<label class="pp-field"><span class="pp-label">' + label + '</span><span class="pp-control">' + control + '</span></label>';
  }
  function renderSettings() {
    var s = state;
    var printers = s.silent && s.printers.length
      ? field(T.printer, '<select id="printer">' + s.printers.map(function (p) {
          return option(p.name, p.name + (p.isDefault ? ' (' + T.def + ')' : ''), p.name === s.printer);
        }).join('') + '</select>') +
        field(T.copies, '<span class="pp-stepper"><button type="button" id="copies-down">' + I.minus + '</button><output>' + s.copies + '</output><button type="button" id="copies-up">' + I.plus + '</button></span>') +
        field(T.collate, '<input type="checkbox" id="collate"' + (s.collate ? ' checked' : '') + '>') +
        field(T.duplex, '<select id="duplex">' + option('none', T.one, s.duplex === 'none') + option('long', T.long, s.duplex === 'long') + option('short', T.short, s.duplex === 'short') + '</select>')
      : '<p class="pp-hint">' + T.system + '</p>';
    var paperRange = Object.keys(PAPERS).map(function (k) { return option(k, k, k === s.paper); }).join('');
    document.getElementById('settings').innerHTML =
      '<div class="pp-head">' + I.print + '<strong>' + T.title + '</strong><span class="pp-head-sub">— ' + M.esc(title) + '</span>' +
      '<button type="button" class="pp-head-close" id="head-close" title="' + T.close + '" aria-label="' + T.close + '">' + I.close + '</button></div>' +
      '<section class="pp-section"><h3>' + I.print + T.printer + '</h3>' + printers + '</section>' +
      '<section class="pp-section"><h3>' + I.guide + T.page + '</h3>' +
      field(T.paper, '<select id="paper">' + paperRange + '</select>') +
      field(T.orientation, '<span class="pp-seg"><button type="button" id="portrait" class="' + (!s.landscape ? 'active' : '') + '">' + I.portrait + T.portrait + '</button><button type="button" id="landscape" class="' + (s.landscape ? 'active' : '') + '">' + I.landscape + T.landscape + '</button></span>') +
      field(T.margins, '<select id="margin">' + option('narrow', T.narrow + ' (8 mm)', s.margin === 'narrow') + option('normal', T.normal + ' (15 mm)', s.margin === 'normal') + option('wide', T.wide + ' (25 mm)', s.margin === 'wide') + '</select>') +
      field(T.font, '<span class="pp-stepper"><button type="button" id="font-down" title="−">' + I.minus + '</button><output class="pp-font">' + s.font + 'px</output><button type="button" id="font-up" title="+">' + I.plus + '</button></span>') +
      field(T.pages, '<span class="pp-pages"><select id="pages">' + option('all', T.all, s.allPages) + option('range', T.range, !s.allPages) + '</select>' + (s.allPages ? '' : '<input type="text" id="ranges" placeholder="1-3, 5" value="' + M.esc(s.ranges) + '">') + '</span>') +
      '</section>' +
      '<section class="pp-section"><h3>' + I.font + T.options + '</h3>' +
      field(T.grey, '<input type="checkbox" id="grey"' + (s.grey ? ' checked' : '') + '>') +
      field(T.headers, '<input type="checkbox" id="headers"' + (s.headers ? ' checked' : '') + '>') +
      '</section>' +
      '<div class="pp-actions">' +
      '<button type="button" class="primary" id="print">' + I.print + '<span>' + T.print + '</span></button>' +
      '<button type="button" id="pdf">' + I.pdf + '<span>' + T.pdf + '</span></button>' +
      '<button type="button" id="close">' + I.close + '<span>' + T.close + '</span></button>' +
      '</div>';
    wire();
  }

  function on(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  }
  function wire() {
    on('printer', 'change', function (e) { state.printer = e.target.value; });
    on('copies-down', 'click', function () { state.copies = Math.max(1, state.copies - 1); renderSettings(); });
    on('copies-up', 'click', function () { state.copies = Math.min(99, state.copies + 1); renderSettings(); });
    on('collate', 'change', function (e) { state.collate = e.target.checked; });
    on('duplex', 'change', function (e) { state.duplex = e.target.value; });
    on('paper', 'change', function (e) { state.paper = e.target.value; update(); });
    on('portrait', 'click', function () { state.landscape = false; update(); });
    on('landscape', 'click', function () { state.landscape = true; update(); });
    on('margin', 'change', function (e) { state.margin = e.target.value; update(); });
    on('font-down', 'click', function () { state.font = Math.max(8, state.font - 1); update(); });
    on('font-up', 'click', function () { state.font = Math.min(24, state.font + 1); update(); });
    on('pages', 'change', function (e) { state.allPages = e.target.value === 'all'; renderSettings(); });
    on('ranges', 'input', function (e) { state.ranges = e.target.value; });
    on('grey', 'change', function (e) { state.grey = e.target.checked; update(); });
    on('headers', 'change', function (e) { state.headers = e.target.checked; });
    on('print', 'click', print);
    on('pdf', 'click', savePdf);
    on('close', 'click', closeWindow);
    on('head-close', 'click', closeWindow);
  }

  // ── the print document ───────────────────────────────────────────────────
  function sheet() {
    var p = PAPERS[state.paper];
    return state.landscape ? { w: p[1], h: p[0] } : { w: p[0], h: p[1] };
  }
  function printHtml(preview) {
    var size = sheet();
    var margin = MARGINS[state.margin];
    var css = [
      '@page { size: ' + size.w + 'mm ' + size.h + 'mm; margin: 0; }',
      '* { box-sizing: border-box; }',
      'html, body { margin: 0; background: #fff; }',
      'body { font-family: "Malgun Gothic", "맑은 고딕", "Noto Sans KR", system-ui, sans-serif; color: #111827;',
      '  font-size: ' + state.font + 'px; line-height: 1.6; padding: ' + margin + 'mm; width: ' + size.w + 'mm;',
      state.grey ? '  filter: grayscale(1);' : '',
      '  -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      'h1 { font-size: 1.9em; margin: 0 0 .6em; } h2 { font-size: 1.45em; margin: 1.4em 0 .5em; border-bottom: 1px solid #ddd; padding-bottom: .2em; break-after: avoid; }',
      'h3 { font-size: 1.15em; margin: 1.1em 0 .4em; break-after: avoid; } h4 { font-size: 1em; }',
      'table { border-collapse: collapse; margin: .6em 0; font-size: .92em; break-inside: avoid; } th, td { border: 1px solid #ccc; padding: .25em .5em; text-align: left; vertical-align: top; } th { background: #f3f4f6; }',
      'pre { background: #f6f8fa; border: 1px solid #e5e7eb; border-radius: 4px; padding: .6em; white-space: pre-wrap; font-size: .85em; break-inside: avoid; }',
      'code { font-family: Consolas, "D2Coding", monospace; font-size: .9em; } blockquote { margin: .6em 0; padding: .2em .8em; border-left: 3px solid #2563eb; background: #eff6ff; }',
      'a { color: #1d4ed8; text-decoration: none; } img { max-width: 100%; } hr { border: none; border-top: 1px solid #ddd; }',
      // The preview sheet scrolls with the wheel but shows no scroll bars.
      preview ? 'html { overflow-x: hidden; scrollbar-width: none; } html::-webkit-scrollbar { display: none; }' : '',
    ].join('\n');
    return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><title>MyDBTools — ' + M.esc(title) +
      '</title><style>' + css + '</style></head><body>' + bodyHtml + '</body></html>';
  }

  // ── preview ──────────────────────────────────────────────────────────────
  var PX = 96 / 25.4;
  function update() {
    renderSettings();
    var size = sheet();
    var frame = document.getElementById('frame');
    var pane = document.getElementById('preview');
    var sheetEl = document.getElementById('sheet');
    var wPx = size.w * PX;
    var scale = Math.min((pane.clientWidth - 40) / wPx, 1.2);
    var hPx = (pane.clientHeight - 40) / scale;
    frame.style.width = wPx + 'px';
    frame.style.height = hPx + 'px';
    frame.style.transform = 'scale(' + scale + ')';
    sheetEl.style.width = wPx * scale + 'px';
    sheetEl.style.height = hPx * scale + 'px';
    frame.srcdoc = printHtml(true);
    document.getElementById('info').textContent = fmt(T.sheet, state.paper + ' · ' + (state.landscape ? T.landscape : T.portrait), Math.round(size.w), Math.round(size.h));
  }
  window.addEventListener('resize', update);

  // ── printing ─────────────────────────────────────────────────────────────
  function message(text) {
    document.getElementById('message').textContent = text;
  }
  function job() {
    var size = sheet();
    return {
      html: printHtml(),
      widthMm: size.w,
      heightMm: size.h,
      marginMm: 0,
      color: !state.grey,
      duplex: state.duplex === 'none' ? null : state.duplex,
      collate: state.collate,
      pageRanges: state.allPages ? null : state.ranges,
      headerTitle: state.headers ? 'MyDBTools — ' + title : null,
    };
  }
  function systemPrint() {
    var frame = document.getElementById('frame');
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }
  function savePdf() {
    if (!bridge) return systemPrint();
    bridge
      .invoke('files_pick_save', { name: 'MyDBTools-' + doc + '-' + lang + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      .then(function (output) {
        if (!output) return;
        var j = job();
        j.output = output;
        return bridge.invoke('print_pdf', { job: j }).then(function (r) {
          message(fmt(T.saved, output, r.pages));
        });
      })
      .catch(function (e) { message(fmt(T.failed, String(e))); });
  }
  function print() {
    if (!bridge || !state.silent) return systemPrint();
    message(T.sending);
    var j = job();
    j.printer = state.printer || null;
    j.copies = state.copies;
    bridge
      .invoke('print_html', { job: j })
      .then(function () { message(fmt(T.sent, state.printer || T.def)); })
      .catch(function (e) {
        if (String(e) === 'file-printer') return savePdf();
        message(fmt(T.failed, String(e)));
      });
  }
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      print();
    }
    if (e.key === 'Escape') closeWindow();
  });

  // window.close() would leave the desktop shell's window registered; ask the shell.
  function closeWindow() {
    if (bridge) bridge.invoke('plugin:window|close', { label: 'doc-print' }).catch(function () { window.close(); });
    else window.close();
  }

  // ── start ────────────────────────────────────────────────────────────────
  var render = M.create(lang);
  fetch(M.files[doc][lang])
    .then(function (r) { return r.text(); })
    .then(function (md) {
      bodyHtml = render(md).html;
      update();
      message(bridge ? T.silent : T.system);
    });
  if (bridge) {
    bridge.invoke('print_info').then(function (info) {
      state.printers = info.printers;
      state.silent = info.silent;
      var d = info.printers.filter(function (p) { return p.isDefault; })[0] || info.printers[0];
      state.printer = d ? d.name : '';
      renderSettings();
      message(state.silent ? T.silent : T.system);
    }).catch(function () {});
  }
  renderSettings();
})();
