// Live Markdown preview next to the editor (Ctrl+Shift+M). Re-renders a
// moment after the document changes and follows the editor's scroll
// position proportionally.
import React, { useEffect, useRef } from 'react';
import { renderMarkdown } from '../lib/markdown';

export function Preview({ view, docVersion, width }) {
  const ref = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!view) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (ref.current) ref.current.innerHTML = renderMarkdown(view.state.doc.toString());
    }, ref.current && ref.current.innerHTML ? 150 : 0);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [view, docVersion]);

  // Scroll sync: editor → preview.
  useEffect(() => {
    if (!view) return undefined;
    const scroller = view.scrollDOM;
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      const ratio = max > 0 ? scroller.scrollTop / max : 0;
      el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
    };
    scroller.addEventListener('scroll', onScroll);
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [view]);

  // Links open in the system browser (Electron denies window.open → shell) / a new tab.
  const onClick = (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
  };

  return <div className="md-preview selectable" ref={ref} style={{ width }} onClick={onClick} />;
}

export default Preview;
