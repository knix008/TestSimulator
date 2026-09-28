// The window is never allowed to be narrower than the toolbar.
//
// Every toolbar button is a command of its own and icon-only, so a clipped
// button is a command the user cannot reach and cannot even see. The width the
// toolbar needs is therefore not a constant in a stylesheet: it is measured
// from the row that is really on screen (the button count depends on the
// platform — only Windows and macOS have "move to trash") and reported both to
// the page and to the host:
//
//   • the page — `--chrome-min-w` on :root, which `.app` uses as its
//     min-width, so a browser window narrower than that scrolls sideways
//     instead of clipping the row.
//   • the desktop app — win:minwidth (electron/ipc.js) makes it the window's
//     minimum width and widens the window if it happens to be narrower, so no
//     size the user can drag the window to ever cuts a button off.
import { setMinContentWidth } from './backend';

// The width a single non-wrapping flex row needs: every child's own width with
// its margins, plus the gaps between them and the row's own padding and
// borders. `.tb-spacer` (flex: 1) is the slack, not content, so it counts as
// nothing — and children taken out of the flow (a menu popup drawn in the page)
// are not part of the row at all.
export function rowWidth(el) {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  const gap = parseFloat(cs.columnGap) || 0;
  const kids = Array.from(el.children).filter((k) => {
    const s = getComputedStyle(k);
    return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed';
  });
  let w = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
    + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0)
    + gap * Math.max(0, kids.length - 1);
  for (const k of kids) {
    const s = getComputedStyle(k);
    w += (parseFloat(s.marginLeft) || 0) + (parseFloat(s.marginRight) || 0);
    if (!k.classList.contains('tb-spacer')) w += k.getBoundingClientRect().width;
  }
  return Math.ceil(w);
}

let applied = 0;

export function setChromeMinWidth(px) {
  const want = Math.ceil(Number(px) || 0);
  if (!Number.isFinite(want) || want < 320 || want === applied) return;
  applied = want;
  document.documentElement.style.setProperty('--chrome-min-w', `${want}px`);
  setMinContentWidth(want);
}
