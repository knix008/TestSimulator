// The window is never allowed to be narrower than its buttons.
//
// Every toolbar button is a command of its own and icon-only, so a clipped
// button is a command the user cannot reach and cannot even see. The width the
// toolbar needs is therefore not a constant in a stylesheet: it is measured
// from the row that is really on screen (the button count depends on the
// platform — only Windows and macOS have "move to trash") and reported both to
// the page and to the host:
//
//   • the desktop app — setMinContentWidth (src/lib/backend.js) makes it the
//     window's minimum width and widens the window if it happens to be
//     narrower, so no size the user can drag the window to ever cuts a button off.
//     The menu bar, toolbar and status bar stay on screen; the page does not
//     scroll them the way a document would.
import { setMinContentWidth } from './backend';

// The width a single non-wrapping flex row needs: every child's own width with
// its margins, plus the gaps between them and the row's own padding and
// borders. A spacer (flex: 1) is the slack, not content, so it counts as
// nothing — and children taken out of the flow (a menu popup drawn in the page)
// are not part of the row at all.
export function rowWidth(el) {
  if (!el) return 0;
  // A copy at max-content width, so a button that is stretching to fill the
  // window (the function-key bar) is counted at the size of its label, and a
  // spacer counts as nothing.
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.ctx-menu').forEach((node) => node.remove());
  clone.style.position = 'absolute';
  clone.style.top = '-9999px';
  clone.style.left = '0';
  clone.style.width = 'max-content';
  clone.style.height = 'auto';
  clone.style.visibility = 'hidden';
  clone.style.flex = 'none';
  document.body.appendChild(clone);
  const width = Math.ceil(clone.getBoundingClientRect().width);
  clone.remove();
  return width;
}

// The menu bar (with the window buttons), the toolbar and the function-key bar
// each report the width their buttons need, including the right-hand inset
// (--chrome-end) that keeps the last button clear of a scrollbar. That width is
// the desktop window's minimum. The window is wider by the scrollbar itself, so
// the inset stays inside the page and the bar never sits on the About button.
const reported = new Map();
let applied = 0;

function scrollbarWidth() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:-9999px;left:0;width:100px;height:100px;overflow:scroll;opacity:0;pointer-events:none';
  document.body.appendChild(probe);
  const width = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return width > 0 ? width : 0;
}

export function reportChromeRow(id, px) {
  const width = Math.ceil(Number(px) || 0);
  if (!Number.isFinite(width)) return;
  reported.set(id, width);
  const content = Math.max(0, ...reported.values());
  if (content < 320 || content === applied) return;
  applied = content;
  document.documentElement.style.setProperty('--chrome-min-w', `${content}px`);
  setMinContentWidth(content + scrollbarWidth());
}
