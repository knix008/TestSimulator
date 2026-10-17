// Runs inside a window (main window or popup); returns content that is cut off:
//  - an element sticking out of the window,
//  - a box that hides part of its content (overflow hidden/clip, or "…" text),
// except places that scroll on purpose (virtual grids, chart areas, tab strips
// with < > buttons, text areas, lists with pagers) — opt out with data-scrolls.
export const CLIP_CHECK = `(() => {
  const out = [];
  const W = document.documentElement.clientWidth;
  const H = document.documentElement.clientHeight;
  const SCROLLERS = '[data-scrolls], .tab-strip, .tabs-strip, .grid-body, .grid-head, .grid-rows, .chart-body, .chart-head, .chart-scale, .gantt-chart, .usage-time, .net-scroll, .net-canvas, .tl-scroll, .graph-scroll, .team-scroll, .cal-scroll, .report-scroll, #view-host, .anim-bg, .app-bg, .start-bg, textarea, select, .print-preview, .preview, canvas, svg, .tour-layer, #tutorial-layer, .web-popup, iframe';
  const visible = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.01; };
  const name = (e) => { const label = (e.getAttribute('title') || e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40); return (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) + (label ? ' "' + label + '"' : ''); };
  // Inside a box that scrolls (with its scroll bar): reachable, not hidden.
  const scrollable = (p) => { const s = getComputedStyle(p); return ['auto', 'scroll'].includes(s.overflowY) || ['auto', 'scroll'].includes(s.overflowX); };
  const inScroller = (e) => { if (e.closest(SCROLLERS)) return true; for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (scrollable(p)) return true; return false; };
  // A one-line list may shorten text with "…" when hovering shows all of it.
  const tooltipHasAll = (e) => { const text = e.textContent.trim(); for (let p = e; p && p !== document.body; p = p.parentElement) { if ((p.getAttribute('title') || '').includes(text)) return true; } return false; };
  const all = [...document.body.querySelectorAll('*')].filter((e) => visible(e) && !(e instanceof SVGElement && e.tagName !== 'svg'));
  for (const e of all) {
    if (inScroller(e) && !e.matches('.tab-strip, .tabs-strip')) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // 1. Sticks out of the window.
    if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1) {
      const hiddenByParent = (() => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { if (p.matches(SCROLLERS) || scrollable(p)) return true; } return false; })();
      if (!hiddenByParent) out.push('outside the window: ' + name(e) + ' [' + Math.round(r.left) + ',' + Math.round(r.top) + ' → ' + Math.round(r.right) + ',' + Math.round(r.bottom) + ' / ' + W + 'x' + H + ']');
      continue;
    }
    const s = getComputedStyle(e);
    if (e.matches('.tab-strip, .tabs-strip')) continue;
    // 2. Hides part of its content.
    const clips = (v) => v === 'hidden' || v === 'clip';
    if ((clips(s.overflowX) && e.scrollWidth > e.clientWidth + 1) || (clips(s.overflowY) && e.scrollHeight > e.clientHeight + 1)) {
      // A child really reaches past the visible box (not just sub-pixel rounding or padding).
      const box = e.getBoundingClientRect();
      const kids = [...e.children].filter(visible);
      const past = kids.some((k) => { const q = k.getBoundingClientRect(); return q.right > box.right + 1.5 || q.bottom > box.bottom + 1.5 || q.left < box.left - 1.5 || q.top < box.top - 1.5; });
      const textCut = !kids.length && e.textContent.trim() && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2) && !(s.textOverflow === 'ellipsis' && tooltipHasAll(e));
      if (past || textCut) out.push('content cut off in ' + name(e) + ' (' + e.scrollWidth + 'x' + e.scrollHeight + ' in ' + e.clientWidth + 'x' + e.clientHeight + ')');
      continue;
    }
    // 3. Text shortened with an ellipsis.
    if (s.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1 && e.textContent.trim() && !tooltipHasAll(e)) out.push('text shortened: ' + name(e));
  }
  return [...new Set(out)];
})()`;
