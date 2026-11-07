(function () {
  var KEY = 'my3d.docFont', BASE = 15, MIN = 11, MAX = 24;
  var size = BASE;
  try { var saved = Number(localStorage.getItem(KEY)); if (saved >= MIN && saved <= MAX) size = saved; } catch (e) { /* a private window */ }
  var value = document.getElementById('doc-font-value'), smaller = document.getElementById('doc-font-down'), larger = document.getElementById('doc-font-up'), reset = document.getElementById('doc-font-reset');
  function apply() {
    document.documentElement.style.setProperty('--doc-font', size + 'px');
    value.textContent = size + 'px';
    smaller.disabled = size <= MIN; larger.disabled = size >= MAX;
    try { localStorage.setItem(KEY, String(size)); } catch (e) { /* a private window */ }
  }
  smaller.addEventListener('click', function () { size = Math.max(MIN, size - 1); apply(); });
  larger.addEventListener('click', function () { size = Math.min(MAX, size + 1); apply(); });
  reset.addEventListener('click', function () { size = BASE; apply(); });
  apply();
  var TREE = 'my3d.docTree', fold = document.getElementById('doc-tree-fold');
  function setTree(closed) {
    document.body.classList.toggle('tree-closed', closed);
    fold.textContent = closed ? '›' : '‹';
    fold.title = closed ? fold.dataset.open : fold.dataset.close;
    fold.setAttribute('aria-expanded', String(!closed));
  }
  var closedAtStart = false;
  try { closedAtStart = localStorage.getItem(TREE) === 'closed'; } catch (e) { /* a private window */ }
  setTree(closedAtStart);
  fold.addEventListener('click', function () {
    var closed = !document.body.classList.contains('tree-closed');
    setTree(closed);
    try { localStorage.setItem(TREE, closed ? 'closed' : 'open'); } catch (e) { /* a private window */ }
  });
  var lang = document.getElementById('doc-lang'), page = lang.getAttribute('href').split('#')[0];
  function keepPlace(id) { lang.setAttribute('href', page + (id ? '#' + id : '')); }
  var main = document.querySelector('main');
  var links = {};
  document.querySelectorAll('.doc-tree a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  var sections = Object.keys(links).map(function (id) { return document.getElementById(id); });
  var current = null;
  function mark() {
    var top = main.getBoundingClientRect().top + 40, found = sections[0];
    for (var i = 0; i < sections.length; i++) { if (sections[i].getBoundingClientRect().top <= top) found = sections[i]; else break; }
    if (!found || found === current) return;
    if (current) links[current.id].classList.remove('on');
    current = found;
    var link = links[found.id];
    link.classList.add('on');
    link.scrollIntoView({ block: 'nearest' });
    keepPlace(found.id);
  }
  main.addEventListener('scroll', mark, { passive: true });
  mark();
})();
