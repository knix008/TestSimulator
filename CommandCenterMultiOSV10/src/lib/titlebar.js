// The window's title bar is the page's own top row.
//
// A native caption is painted by the system in the system's colours, so it is
// the one part of the window a theme could not reach. The host therefore hides
// it (electron/main.js: titleBarStyle 'hidden' with a title-bar overlay on
// Windows, 'hiddenInset' on macOS) and the page's top row — the menu bar in the
// main window, the caption strip of a tool window — takes its place, themed
// like everything else. The native window controls stay: they float over that
// row as an overlay whose colours the host is told on every theme change
// (src/themes.js → win:titlebar).
//
// Two things follow for the page, and both are handled here:
//   • the row must keep the controls' own space free — `--wco-left` for the
//     macOS traffic lights, `--wco-right` for minimise / maximise / close.
//     The values change when the window is maximised or the overlay is hidden
//     (full screen), so the geometry is watched, not read once.
//   • `html.wco` says the page owns the title bar, so the stylesheet can make
//     that row draggable and show the window title in it.

const wco = () => (typeof navigator !== 'undefined' ? navigator.windowControlsOverlay : null);

// The host bridge is read straight off the window here, not through lib/backend.js: the theme calls
// this (src/themes.js applyTheme) and backend.js already imports the themes, so going through it would
// make the two modules circular.
const host = () => (typeof window !== 'undefined' ? window.commandCenter : null);

// Hands the theme's title-bar colours to the host on every theme change: the native window controls
// drawn over our row are painted in them (Windows), and the mode goes to the system theme.
export function applyTitlebarTheme(theme) {
  const h = host();
  if (!h || !h.setTitlebar || !theme) return;
  h.setTitlebar({ color: theme.tokens['--bg-elev'], symbolColor: theme.tokens['--fg'], mode: theme.mode });
}

// True where the page draws the title bar itself (the desktop app; never in a browser).
export function inPageTitlebar() {
  const o = wco();
  return !!(o && o.visible);
}

export function watchTitlebarArea() {
  const o = wco();
  if (!o) return () => {};
  const root = document.documentElement;
  const apply = () => {
    const on = !!o.visible;
    root.classList.toggle('wco', on);
    let left = 0, right = 0;
    if (on) {
      const r = o.getTitlebarAreaRect();
      // A zero-width rect means there is no overlay to dodge (full screen): reserve nothing rather
      // than mistake the whole row for the controls' area.
      if (r && r.width > 0) {
        left = Math.max(0, Math.round(r.x));
        right = Math.max(0, Math.round(window.innerWidth - (r.x + r.width)));
      }
    }
    root.style.setProperty('--wco-left', `${left}px`);
    root.style.setProperty('--wco-right', `${right}px`);
  };
  apply();
  o.addEventListener('geometrychange', apply);
  window.addEventListener('resize', apply);
  return () => { o.removeEventListener('geometrychange', apply); window.removeEventListener('resize', apply); };
}
