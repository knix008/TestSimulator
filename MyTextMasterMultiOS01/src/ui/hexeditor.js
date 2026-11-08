// The hex editor: offset | 16 bytes (8 + 8) | ASCII, drawn only for the visible rows so files of
// tens of MB scroll smoothly. Click a byte or a character; type hex digits (hex column) or text
// (ASCII column). Insert toggles overwrite / insert; Delete and Backspace remove bytes; Ctrl+Z / Ctrl+Y
// undo and redo; Ctrl+G goes to an offset; Ctrl+F finds hex bytes or text. The value under the
// cursor is shown as 8/16/32-bit numbers (status hook).
import { escapeHtml } from './dom.js';

const ROW = 16;
const ROW_HEIGHT = 22;
const hex2 = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const printable = (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·');

/** Bytes ↔ hex text helpers (also used by tests). */
export const toHex = (bytes, sep = ' ') => Array.from(bytes, hex2).join(sep);
export function parseHex(text) {
  const clean = String(text).replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  if (!clean || clean.length % 2) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The first index ≥ from where `needle` occurs in `bytes` (wrapping), or -1. */
export function findBytes(bytes, needle, from = 0) {
  if (!needle.length) return -1;
  const search = (start, end) => {
    outer: for (let i = start; i <= end - needle.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) if (bytes[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  };
  const hit = search(from, bytes.length);
  return hit >= 0 ? hit : search(0, Math.min(bytes.length, from + needle.length - 1));
}

/** Numbers at an offset (little and big endian). */
export function inspect(bytes, at) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const left = bytes.length - at;
  const out = { u8: bytes[at], i8: left >= 1 ? view.getInt8(at) : null };
  if (left >= 2) { out.u16le = view.getUint16(at, true); out.u16be = view.getUint16(at, false); }
  if (left >= 4) { out.u32le = view.getUint32(at, true); out.u32be = view.getUint32(at, false); out.i32le = view.getInt32(at, true); out.f32le = view.getFloat32(at, true); }
  return out;
}

export class HexEditor {
  /** host: element to fill; hooks: onChange(), onCursor(info), labels: { … } */
  constructor(host, hooks) {
    this.host = host;
    this.hooks = hooks;
    this.doc = null;
    host.innerHTML = `<div class="hex-head"><span class="hex-off">Offset</span><span class="hex-bytes">${Array.from({ length: ROW }, (_, i) => `<i>${hex2(i)}</i>`).join('')}</span><span class="hex-ascii">ASCII</span></div>
      <div class="hex-scroll" tabindex="0"><div class="hex-space"></div><div class="hex-rows"></div></div>`;
    this.scroll = host.querySelector('.hex-scroll');
    this.space = host.querySelector('.hex-space');
    this.rows = host.querySelector('.hex-rows');
    this.scroll.addEventListener('scroll', () => this.draw(), { passive: true });
    this.scroll.addEventListener('pointerdown', (event) => this.onPointer(event));
    this.scroll.addEventListener('keydown', (event) => this.onKey(event));
    new ResizeObserver(() => this.draw()).observe(this.scroll);
  }

  show(doc) {
    this.doc = doc;
    doc.hex ??= { cursor: 0, anchor: 0, nibble: 0, column: 'hex', insert: false, undo: [], redo: [], top: 0 };
    this.space.style.height = `${(Math.ceil((doc.bytes.length + 1) / ROW)) * ROW_HEIGHT}px`;
    this.scroll.scrollTop = doc.hex.top;
    this.draw();
    this.report();
  }

  get state() { return this.doc.hex; }
  focus() { this.scroll.focus({ preventScroll: true }); }

  draw() {
    if (!this.doc) return;
    const bytes = this.doc.bytes;
    const s = this.state;
    s.top = this.scroll.scrollTop;
    const first = Math.floor(this.scroll.scrollTop / ROW_HEIGHT);
    const count = Math.ceil(this.scroll.clientHeight / ROW_HEIGHT) + 1;
    const total = Math.ceil((bytes.length + 1) / ROW);
    const [lo, hi] = [Math.min(s.anchor, s.cursor), Math.max(s.anchor, s.cursor)];
    const html = [];
    for (let r = first; r < Math.min(total, first + count); r += 1) {
      const start = r * ROW;
      const cells = [];
      const chars = [];
      for (let i = 0; i < ROW; i += 1) {
        const at = start + i;
        if (at > bytes.length) { cells.push('<b class="none"></b>'); chars.push('<b class="none"></b>'); continue; }
        const end = at === bytes.length;
        const cls = `${at === s.cursor ? `cur ${s.column === 'hex' ? 'focus' : ''}` : ''} ${at >= lo && at <= hi && s.anchor !== s.cursor ? 'sel' : ''} ${i === 8 ? 'gap' : ''} ${end ? 'end' : ''}`;
        cells.push(`<b class="${cls}" data-at="${at}" data-col="hex">${end ? '··' : hex2(bytes[at])}</b>`);
        chars.push(`<b class="${cls.replace('gap', '')} ${s.column === 'ascii' && at === s.cursor ? 'focus' : ''}" data-at="${at}" data-col="ascii">${end ? ' ' : escapeHtml(printable(bytes[at]))}</b>`);
      }
      html.push(`<div class="hex-row" style="top:${r * ROW_HEIGHT}px"><span class="hex-off">${start.toString(16).padStart(8, '0').toUpperCase()}</span><span class="hex-bytes">${cells.join('')}</span><span class="hex-ascii">${chars.join('')}</span></div>`);
    }
    this.rows.innerHTML = html.join('');
  }

  report() {
    const s = this.state;
    const bytes = this.doc.bytes;
    const [lo, hi] = [Math.min(s.anchor, s.cursor), Math.max(s.anchor, s.cursor)];
    this.hooks.onCursor?.({ offset: s.cursor, size: bytes.length, selected: s.anchor === s.cursor ? 0 : hi - lo + 1, insert: s.insert, values: s.cursor < bytes.length ? inspect(bytes, s.cursor) : null });
  }

  reveal() {
    const row = Math.floor(this.state.cursor / ROW);
    const top = row * ROW_HEIGHT;
    if (top < this.scroll.scrollTop) this.scroll.scrollTop = top;
    else if (top + ROW_HEIGHT > this.scroll.scrollTop + this.scroll.clientHeight) this.scroll.scrollTop = top + ROW_HEIGHT - this.scroll.clientHeight;
  }

  move(to, extend = false) {
    const s = this.state;
    s.cursor = Math.max(0, Math.min(this.doc.bytes.length, to));
    if (!extend) s.anchor = s.cursor;
    s.nibble = 0;
    this.reveal();
    this.draw();
    this.report();
  }

  onPointer(event) {
    const cell = event.target.closest('[data-at]');
    if (!cell) return;
    event.preventDefault();
    this.focus();
    this.state.column = cell.dataset.col;
    this.move(Number(cell.dataset.at), event.shiftKey);
    const move = (e) => {
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-at]');
      if (over) this.move(Number(over.dataset.at), true);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Replaces bytes [from, to) with `insert`, keeping undo. */
  edit(from, to, insert, { cursor } = {}) {
    if (this.doc.readOnly) return;
    const bytes = this.doc.bytes;
    const removed = bytes.slice(from, to);
    const next = new Uint8Array(bytes.length - (to - from) + insert.length);
    next.set(bytes.subarray(0, from));
    next.set(insert, from);
    next.set(bytes.subarray(to), from + insert.length);
    this.doc.bytes = next;
    this.state.undo.push({ from, removed, inserted: insert.slice(), cursor: this.state.cursor });
    if (this.state.undo.length > 2000) this.state.undo.shift();
    this.state.redo = [];
    this.doc.hexVersion = (this.doc.hexVersion ?? 0) + 1;
    this.space.style.height = `${Math.ceil((next.length + 1) / ROW) * ROW_HEIGHT}px`;
    if (cursor !== undefined) { this.state.cursor = cursor; this.state.anchor = cursor; }
    this.reveal();
    this.draw();
    this.report();
    this.hooks.onChange?.();
  }

  undo(redo = false) {
    const s = this.state;
    const step = (redo ? s.redo : s.undo).pop();
    if (!step) return;
    const bytes = this.doc.bytes;
    const [remove, put] = redo ? [step.removed, step.inserted] : [step.inserted, step.removed];
    const next = new Uint8Array(bytes.length - remove.length + put.length);
    next.set(bytes.subarray(0, step.from));
    next.set(put, step.from);
    next.set(bytes.subarray(step.from + remove.length), step.from + put.length);
    this.doc.bytes = next;
    (redo ? s.undo : s.redo).push(step);
    this.doc.hexVersion = (this.doc.hexVersion ?? 0) + (redo ? 1 : -1);
    this.space.style.height = `${Math.ceil((next.length + 1) / ROW) * ROW_HEIGHT}px`;
    this.move(step.from);
    this.hooks.onChange?.();
  }

  selection() {
    const s = this.state;
    return s.anchor === s.cursor ? null : { from: Math.min(s.anchor, s.cursor), to: Math.max(s.anchor, s.cursor) + 1 };
  }

  selectedBytes() { const sel = this.selection(); return sel ? this.doc.bytes.slice(sel.from, sel.to) : this.doc.bytes.slice(this.state.cursor, this.state.cursor + 1); }

  typeByte(value) {
    const s = this.state;
    const bytes = this.doc.bytes;
    const sel = this.selection();
    if (sel) { this.edit(sel.from, sel.to, Uint8Array.of(value), { cursor: sel.from + 1 }); return; }
    if (s.insert || s.cursor >= bytes.length) this.edit(s.cursor, s.cursor, Uint8Array.of(value), { cursor: s.cursor + 1 });
    else this.edit(s.cursor, s.cursor + 1, Uint8Array.of(value), { cursor: s.cursor + 1 });
  }

  typeNibble(digit) {
    const s = this.state;
    const bytes = this.doc.bytes;
    if (s.nibble === 0) {
      const sel = this.selection();
      const at = sel ? sel.from : s.cursor;
      const old = at < bytes.length && !s.insert && !sel ? bytes[at] : 0;
      const value = (digit << 4) | (old & 0x0f);
      if (sel) this.edit(sel.from, sel.to, Uint8Array.of(value), { cursor: sel.from });
      else if (s.insert || at >= bytes.length) this.edit(at, at, Uint8Array.of(value), { cursor: at });
      else this.edit(at, at + 1, Uint8Array.of(value), { cursor: at });
      s.nibble = 1;
      this.draw();
    } else {
      const at = s.cursor;
      this.edit(at, at + 1, Uint8Array.of((this.doc.bytes[at] & 0xf0) | digit), { cursor: at + 1 });
      s.nibble = 0;
    }
  }

  onKey(event) {
    const s = this.state;
    const ctrl = event.ctrlKey || event.metaKey;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -ROW, ArrowDown: ROW }[event.key];
    const page = Math.max(1, Math.floor(this.scroll.clientHeight / ROW_HEIGHT) - 1) * ROW;
    if (step !== undefined) { event.preventDefault(); this.move(s.cursor + step, event.shiftKey); return; }
    if (event.key === 'PageDown' || event.key === 'PageUp') { event.preventDefault(); this.move(s.cursor + (event.key === 'PageDown' ? page : -page), event.shiftKey); return; }
    if (event.key === 'Home') { event.preventDefault(); this.move(ctrl ? 0 : s.cursor - (s.cursor % ROW), event.shiftKey); return; }
    if (event.key === 'End') { event.preventDefault(); this.move(ctrl ? this.doc.bytes.length : s.cursor - (s.cursor % ROW) + ROW - 1, event.shiftKey); return; }
    if (event.key === 'Tab') { event.preventDefault(); s.column = s.column === 'hex' ? 'ascii' : 'hex'; s.nibble = 0; this.draw(); return; }
    if (event.key === 'Insert') { event.preventDefault(); s.insert = !s.insert; this.report(); return; }
    if (ctrl && event.key.toLowerCase() === 'a') { event.preventDefault(); s.anchor = 0; s.cursor = Math.max(0, this.doc.bytes.length - 1); this.draw(); this.report(); return; }
    if (ctrl && event.key.toLowerCase() === 'z') { event.preventDefault(); this.undo(event.shiftKey); return; }
    if (ctrl && event.key.toLowerCase() === 'y') { event.preventDefault(); this.undo(true); return; }
    if (ctrl || event.altKey) return; // the app's shortcuts (save, go to, find …)
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      const sel = this.selection();
      if (sel) this.edit(sel.from, sel.to, new Uint8Array(0), { cursor: sel.from });
      else if (event.key === 'Delete' && s.cursor < this.doc.bytes.length) this.edit(s.cursor, s.cursor + 1, new Uint8Array(0), { cursor: s.cursor });
      else if (event.key === 'Backspace' && s.cursor > 0) this.edit(s.cursor - 1, s.cursor, new Uint8Array(0), { cursor: s.cursor - 1 });
      return;
    }
    if (event.key.length !== 1) return;
    event.preventDefault();
    if (s.column === 'hex') {
      if (/^[0-9a-f]$/i.test(event.key)) this.typeNibble(parseInt(event.key, 16));
    } else {
      const code = event.key.charCodeAt(0);
      if (code < 0x80) this.typeByte(code);
      else for (const b of new TextEncoder().encode(event.key)) this.typeByte(b);
    }
  }

  goTo(offset) { this.move(offset); this.focus(); }

  /** Finds hex ("DE AD") or text from after the cursor; returns true when found (and selects it). */
  find(query, asHex) {
    const needle = asHex ? parseHex(query) : new TextEncoder().encode(query);
    if (!needle?.length) return false;
    const at = findBytes(this.doc.bytes, needle, this.state.cursor + 1);
    if (at < 0) return false;
    this.state.anchor = at;
    this.state.cursor = at + needle.length - 1;
    this.reveal();
    this.draw();
    this.report();
    this.focus();
    return true;
  }
}
