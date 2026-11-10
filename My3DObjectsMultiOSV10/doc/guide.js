// The bar across the top of the program guide: the text size (aA − 16px +,
// remembered between visits) and the language, as two buttons with a flag
// and the language's own name. Both guide pages load this one script, so the
// Korean and English guides always have the same bar.
(function () {
  var FONT_KEY = 'my3dobjects-guide-font';
  var MIN = 12;
  var MAX = 24;
  var STEP = 1;
  var DEFAULT = 16;

  var FLAG_KO = '<svg class="flag" viewBox="0 0 36 24" width="24" height="16" aria-hidden="true">'
    + '<rect width="36" height="24" rx="2.2" fill="#fff"/>'
    + '<g transform="translate(18 12)"><circle r="6.4" fill="#CD2E3A"/>'
    + '<path d="M0-6.4A6.4 6.4 0 0 1 0 6.4A3.2 3.2 0 0 1 0 0A3.2 3.2 0 0 0 0-6.4Z" fill="#0047A0"/>'
    + '<circle cy="-3.2" r="3.2" fill="#CD2E3A"/><circle cy="3.2" r="3.2" fill="#0047A0"/></g>'
    + '<rect width="36" height="24" rx="2.2" fill="none" stroke="rgba(0,0,0,0.22)"/></svg>';
  var FLAG_EN = '<svg class="flag" viewBox="0 0 36 24" width="24" height="16" aria-hidden="true">'
    + '<rect width="36" height="24" rx="2.2" fill="#012169"/>'
    + '<path d="M0 0L36 24M36 0L0 24" stroke="#fff" stroke-width="5.2"/>'
    + '<path d="M0 0L36 24M36 0L0 24" stroke="#C8102E" stroke-width="2.2"/>'
    + '<rect x="14.4" width="7.2" height="24" fill="#fff"/><rect y="8.4" width="36" height="7.2" fill="#fff"/>'
    + '<rect x="15.6" width="4.8" height="24" fill="#C8102E"/><rect y="9.6" width="36" height="4.8" fill="#C8102E"/>'
    + '<rect width="36" height="24" rx="2.2" fill="none" stroke="rgba(0,0,0,0.22)"/></svg>';

  var CSS = ''
    + ':root { --gt-h: 56px; }'
    + '.guide-top { position: sticky; top: 0; z-index: 20; height: var(--gt-h); display: flex; align-items: center; gap: 14px;'
    + '  padding: 0 18px; background: var(--panel); border-bottom: 1px solid var(--border); font-size: 14px; }'
    + '.guide-top .gt-brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; margin-right: auto; color: var(--text); }'
    + '.guide-top .gt-brand img { width: 28px; height: 28px; }'
    + '.guide-top .gt-group { display: flex; align-items: center; gap: 6px; }'
    + '.guide-top .gt-label { color: var(--dim); font-size: 13px; margin-right: 2px; }'
    + '.guide-top .gt-aa { font-family: Georgia, "Times New Roman", serif; font-size: 18px; color: var(--text); padding: 0 4px; }'
    + '.guide-top button, .guide-top a.gt-lang { display: inline-flex; align-items: center; justify-content: center; gap: 7px;'
    + '  height: 34px; min-width: 34px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--border);'
    + '  background: var(--bg); color: var(--text); font: inherit; font-size: 14px; cursor: pointer; text-decoration: none; }'
    + '.guide-top button:hover:not(:disabled), .guide-top a.gt-lang:hover { border-color: var(--accent); }'
    + '.guide-top button:disabled { opacity: 0.4; cursor: default; }'
    + '.guide-top .gt-size { min-width: 52px; text-align: center; font-variant-numeric: tabular-nums; color: var(--text); }'
    + '.guide-top a.gt-lang.active { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }'
    + '.guide-top .flag { border-radius: 3px; flex: none; }'
    + '.guide-top .gt-sep { width: 1px; height: 26px; background: var(--border); }'
    + 'nav { top: var(--gt-h) !important; height: calc(100vh - var(--gt-h)) !important; }'
    + 'h2, h3 { scroll-margin-top: calc(var(--gt-h) + 12px) !important; }'
    + '@media (max-width: 820px) { .guide-top { flex-wrap: wrap; height: auto; padding: 8px 12px; } .guide-top .gt-brand { width: 100%; }'
    + '  nav { top: 0 !important; height: auto !important; } }';

  function readSize() {
    try {
      var v = parseInt(localStorage.getItem(FONT_KEY), 10);
      if (v >= MIN && v <= MAX) return v;
    } catch (e) { /* no storage: the default size */ }
    return DEFAULT;
  }

  function saveSize(v) {
    try { localStorage.setItem(FONT_KEY, String(v)); } catch (e) { /* not remembered */ }
  }

  // Everything in the guide is sized in rem, so the root size scales it all.
  function applySize(v) {
    document.documentElement.style.fontSize = v + 'px';
  }

  applySize(readSize());

  function build() {
    var ko = document.documentElement.lang !== 'en';
    var text = ko
      ? { title: 'My3DObjects 사용 설명서', size: '글자 크기', smaller: '글자 작게', larger: '글자 크게', lang: '언어' }
      : { title: 'My3DObjects User’s Guide', size: 'Text size', smaller: 'Smaller text', larger: 'Larger text', lang: 'Language' };

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.className = 'guide-top';
    bar.setAttribute('role', 'toolbar');
    bar.innerHTML = ''
      + '<span class="gt-brand"><img src="images/icon.svg" alt="">' + text.title + '</span>'
      + '<div class="gt-group" role="group" aria-label="' + text.size + '" data-guide-font>'
      + '  <span class="gt-label">' + text.size + '</span>'
      + '  <span class="gt-aa" aria-hidden="true">aA</span>'
      + '  <button type="button" data-step="-1" title="' + text.smaller + '" aria-label="' + text.smaller + '">−</button>'
      + '  <span class="gt-size" aria-live="polite"></span>'
      + '  <button type="button" data-step="1" title="' + text.larger + '" aria-label="' + text.larger + '">+</button>'
      + '</div>'
      + '<span class="gt-sep" aria-hidden="true"></span>'
      + '<div class="gt-group" role="group" aria-label="' + text.lang + '" data-guide-lang>'
      + '  <a class="gt-lang' + (ko ? ' active' : '') + '" href="./Guide.html" hreflang="ko" lang="ko"' + (ko ? ' aria-current="page"' : '') + '>' + FLAG_KO + '<span>한국어</span></a>'
      + '  <a class="gt-lang' + (ko ? '' : ' active') + '" href="./Guide.en.html" hreflang="en" lang="en"' + (ko ? '' : ' aria-current="page"') + '>' + FLAG_EN + '<span>English</span></a>'
      + '</div>';
    document.body.insertBefore(bar, document.body.firstChild);

    var sizeEl = bar.querySelector('.gt-size');
    var minus = bar.querySelector('[data-step="-1"]');
    var plus = bar.querySelector('[data-step="1"]');
    function show(v) {
      sizeEl.textContent = v + 'px';
      minus.disabled = v <= MIN;
      plus.disabled = v >= MAX;
    }
    show(readSize());
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-step]');
      if (!b) return;
      var v = Math.min(MAX, Math.max(MIN, readSize() + Number(b.getAttribute('data-step')) * STEP));
      saveSize(v);
      applySize(v);
      show(v);
    });
    // The other guide window (or tab) follows a change made in this one.
    window.addEventListener('storage', function (e) {
      if (e.key !== FONT_KEY) return;
      var v = readSize();
      applySize(v);
      show(v);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
