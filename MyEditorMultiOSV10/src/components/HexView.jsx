// Hex view of a binary file (a document of kind 'hex', see App openHex):
// the classic hex-editor layout — offset · 16 bytes as hex · the same bytes
// as ASCII. The file is never loaded whole: the bytes of the rows in view are
// fetched in 64 KB chunks through `read(offset, length)` (file.readRange) and
// kept in a small cache, so a multi-GB file opens instantly and scrolls like
// a small one; only the visible rows are in the DOM. Read-only: clicking
// selects a byte (shift-click a range) which is highlighted in both columns
// and described in the footer; Ctrl+C copies the selection as hex (up to
// 1 MB), Ctrl+A selects everything. The header offers to open the file as
// text after all (a text file with a stray NUL byte is taken for binary).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { writeClipboardText } from '../lib/backend';
import { Icon } from './Icons';

const COLS = 16;
const CHUNK = 65536;
const CACHE_CHUNKS = 256;          // 16 MB of bytes kept at most
const COPY_MAX = 1024 * 1024;
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase());
const CHR = Array.from({ length: 256 }, (_, i) => (i >= 0x20 && i < 0x7f ? String.fromCharCode(i) : '·'));
const OVERSCAN = 8;
// Browsers stop laying out around 33 million px: a taller file is scrolled
// through a shorter box and the scroll position is scaled to a row.
const MAX_SCROLL = 30 * 1000 * 1000;

const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 * 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`);

// read(offset, length) → a promise of a Uint8Array; `version` changes when the file did (reload): the cache starts over.
export function HexView({ size, name, read, version, fontSize, onOpenAsText, onMessage }) {
  useLanguage();
  const scrollRef = useRef(null);
  const cache = useRef(new Map());              // chunk index → Uint8Array
  const pending = useRef(new Map());            // chunk index → Promise
  const [, bump] = useState(0);                 // re-render when a chunk arrives
  const [top, setTop] = useState(0);            // scrollTop
  const [height, setHeight] = useState(0);      // viewport height
  const [sel, setSel] = useState(null);         // { anchor, head } byte offsets (inclusive)
  const rows = Math.ceil(size / COLS);
  const rowH = Math.round((Number(fontSize) || 14) * 1.5);
  const fullH = rows * rowH;
  const scrollH = Math.min(fullH, MAX_SCROLL);
  const scale = scrollH ? fullH / scrollH : 1;      // > 1 only for files beyond the browser's limit
  const offsetDigits = Math.max(8, Math.max(0, size - 1).toString(16).length);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { cache.current.clear(); pending.current.clear(); setSel(null); bump((v) => v + 1); }, [read, version, size]);

  // The chunk holding `offset`, fetched when missing (the rows show '..' meanwhile).
  const chunkOf = (offset) => {
    const idx = Math.floor(offset / CHUNK);
    const have = cache.current.get(idx);
    if (have) return have;
    if (!pending.current.has(idx)) {
      const job = read(idx * CHUNK, CHUNK).then((bytes) => {
        pending.current.delete(idx);
        if (cache.current.size >= CACHE_CHUNKS) cache.current.delete(cache.current.keys().next().value);   // the oldest goes
        cache.current.set(idx, bytes);
        bump((v) => v + 1);
      }).catch(() => { pending.current.delete(idx); });
      pending.current.set(idx, job);
    }
    return null;
  };
  const byteAt = (offset) => { const c = chunkOf(offset); return c ? c[offset - Math.floor(offset / CHUNK) * CHUNK] : -1; };

  // The row under the top edge, in file terms: the scroll position as a
  // fraction of the box's travel, applied to the file's height (with the
  // unscaled box this is scrollTop itself); rows are laid out from there,
  // positioned in the box, not the file, so the box can be shorter.
  const el0 = scrollRef.current;
  const maxTop = el0 ? Math.max(0, el0.scrollHeight - el0.clientHeight) : 0;
  const virtualTop = maxTop > 0 ? Math.max(0, Math.min(top, maxTop) / maxTop * (fullH + rowH - height)) : 0;
  const firstVisible = Math.floor(virtualTop / rowH);
  const frac = virtualTop - firstVisible * rowH;
  const first = Math.max(0, firstVisible - OVERSCAN);
  const last = Math.min(rows, Math.ceil((virtualTop + height) / rowH) + OVERSCAN);
  const rowTop = (r) => top + (r - firstVisible) * rowH - frac;
  // With a scaled box the wheel would jump `scale` rows per notch: scroll by
  // rows instead (a native listener — React's onWheel is passive and cannot cancel).
  const scaleRef = useRef(1); scaleRef.current = scale;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (scaleRef.current <= 1) return;
      e.preventDefault();
      el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + e.deltaY / scaleRef.current));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const lo = sel ? Math.min(sel.anchor, sel.head) : -1, hi = sel ? Math.max(sel.anchor, sel.head) : -1;

  const pick = (e, offset) => {
    if (offset >= size) return;
    setSel(e.shiftKey && sel ? { anchor: sel.anchor, head: offset } : { anchor: offset, head: offset });
    scrollRef.current && scrollRef.current.focus();
  };
  const copy = async () => {
    if (!sel) return;
    const n = Math.min(hi - lo + 1, COPY_MAX);
    let bytes;
    try { bytes = await read(lo, n); } catch { return; }
    const parts = new Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) parts[i] = HEX[bytes[i]];
    await writeClipboardText(parts.join(' '));
    if (onMessage) onMessage(t(n < hi - lo + 1 ? 'hex_copied_max' : 'hex_copied', { n: bytes.length.toLocaleString() }));
  };
  const onKey = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); copy(); }
    else if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); if (size) setSel({ anchor: 0, head: size - 1 }); }
    else if (e.key === 'Escape') setSel(null);
  };

  // The rows in view: one line per column, the selected bytes marked.
  // Rebuilt on every scroll / chunk arrival — cheap, it is a screenful.
  const lines = [];
  for (let r = first; r < last; r++) {
    const start = r * COLS, end = Math.min(start + COLS, size);
    const hex = [], asc = [];
    for (let i = start; i < end; i++) {
      const b = byteAt(i);
      const inSel = i >= lo && i <= hi;
      if (b < 0) { hex.push(<span key={i} className="hx wait" onMouseDown={(e) => pick(e, i)}>··</span>); asc.push(<span key={i} className="hc np" onMouseDown={(e) => pick(e, i)}> </span>); continue; }
      hex.push(<span key={i} className={`hx ${inSel ? 'sel' : ''} ${b === 0 ? 'nul' : ''}`} onMouseDown={(e) => pick(e, i)}>{HEX[b]}</span>);
      asc.push(<span key={i} className={`hc ${inSel ? 'sel' : ''} ${b < 0x20 || b >= 0x7f ? 'np' : ''}`} onMouseDown={(e) => pick(e, i)}>{CHR[b]}</span>);
    }
    lines.push(
      <div key={r} className="hex-row" style={{ top: rowTop(r), height: rowH }}>
        <span className="hex-off" style={{ width: `${offsetDigits}ch` }}>{start.toString(16).toUpperCase().padStart(offsetDigits, '0')}</span>
        <span className="hex-bytes">{hex}</span>
        <span className="hex-ascii">{asc}</span>
      </div>,
    );
  }

  const at = sel ? sel.head : null;
  const atByte = at != null ? byteAt(at) : -1;
  return (
    <div className="hex-view" style={{ fontSize: fontSize ? `${fontSize}px` : undefined }}>   {/* always the default monospace font (styles: --mono), whatever the editor font: the columns must line up */}
      <div className="hex-head">
        <Icon name="binary" size={14} className="muted" />
        <span className="hex-name ellipsis" title={name}>{name}</span>
        <span className="muted small">{t('hex_info', { size: fmtSize(size), bytes: size.toLocaleString() })}</span>
        <span className="spacer" />
        {onOpenAsText && <button className="btn small" onClick={onOpenAsText} title={t('hex_as_text_tip')}>{t('hex_as_text')}</button>}
      </div>
      <div className="hex-scroll" ref={scrollRef} tabIndex={0} onScroll={(e) => setTop(e.currentTarget.scrollTop)} onKeyDown={onKey}>
        <div className="hex-cols" style={{ height: rowH }}>
          <span className="hex-off" style={{ width: `${offsetDigits}ch` }}>{t('hex_offset')}</span>
          <span className="hex-bytes">{Array.from({ length: COLS }, (_, i) => <span key={i} className="hx">{HEX[i]}</span>)}</span>
          <span className="hex-ascii muted">{t('hex_text')}</span>
        </div>
        <div className="hex-body" style={{ height: scrollH }}>{lines}</div>
        {!size && <div className="hex-empty muted">{t('hex_empty')}</div>}
      </div>
      <div className="hex-foot muted small">
        {at != null
          ? <>{t('hex_at', { hex: at.toString(16).toUpperCase().padStart(offsetDigits, '0'), dec: at.toLocaleString() })}{atByte >= 0 && <> · {t('hex_value', { hex: HEX[atByte], dec: atByte, chr: CHR[atByte] })}</>}{hi > lo && <> · {t('hex_selected', { n: (hi - lo + 1).toLocaleString() })}</>}</>
          : t('hex_hint')}
      </div>
    </div>
  );
}

export default HexView;
