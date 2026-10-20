// The guide wears the app's theme. The app publishes its resolved palette to
// localStorage (src/lib/settings.js, publishThemePalette); this page reads it
// on load and follows the `storage` event while it stays open. Without a
// palette (the page opened on its own) the OS light / dark scheme applies.
(function () {
  var KEY = 'mypdfviewer-theme-palette';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }

  function apply(p) {
    var root = document.documentElement;
    var v = p && p.vars;
    if (!v || !v['--bg']) return;
    var set = function (name, value) { if (value) root.style.setProperty(name, value); };
    set('--bg', v['--bg']);
    set('--panel', v['--panel'] || v['--bg-2']);
    set('--text', v['--text']);
    set('--dim', v['--text-dim']);
    set('--muted', v['--muted']);
    set('--border', v['--border']);
    set('--accent', v['--accent']);
    set('--code', v['--bg-3']);
    set('--accent-soft', 'color-mix(in srgb, ' + v['--accent'] + ' 14%, ' + (v['--panel'] || v['--bg']) + ')');
    root.style.colorScheme = p.dark ? 'dark' : 'light';
    root.setAttribute('data-theme', p.id || '');
  }

  apply(read());
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) apply(read());
  });
})();
