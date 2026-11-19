// Packet bytes: offset, hex (or bits) and ASCII (or EBCDIC) of the selected packet. The bytes of the
// selected tree node are highlighted; a click on a byte selects the most specific node that covers
// it. Extra data sources (reassembled, decompressed …) get tabs below.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';

const EBCDIC = ' '.repeat(64) + ' ' + ' '.repeat(9) + '¢.<(+|&' + ' '.repeat(9) + '!$*);¬-/' + ' '.repeat(8) + '¦,%_>?' + ' '.repeat(9) + '`:#@\'="' + ' abcdefghi' + ' '.repeat(7) + 'jklmnopqr' + ' '.repeat(7) + '~stuvwxyz' + ' '.repeat(22) + '{ABCDEFGHI' + ' '.repeat(6) + '}JKLMNOPQR' + ' '.repeat(6) + '\\ STUVWXYZ' + ' '.repeat(6) + '0123456789' + ' '.repeat(6);
const asciiChar = (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.');
const ebcdicChar = (b) => { const c = EBCDIC[b] ?? ' '; return c === ' ' && b !== 0x40 ? '.' : c; };

export class BytesPane {
  /** app: { settings(), t, onPickNode(node), onContext(event) } */
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.dissection = null;
    this.source = 0;
    this.range = null;
    host.classList.add('bytes-pane');
    host.innerHTML = '<div class="by-scroll" tabindex="0"></div><div class="by-tabs" hidden></div>';
    this.scroller = host.querySelector('.by-scroll');
    this.tabs = host.querySelector('.by-tabs');
    this.scroller.addEventListener('pointerdown', (event) => {
      const cell = event.target.closest('[data-o]');
      if (cell && event.button === 0) this.pick(Number(cell.dataset.o));
    });
    this.scroller.addEventListener('contextmenu', (event) => { event.preventDefault(); app.onContext?.(event); });
    this.tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-source]');
      if (tab) { this.source = Number(tab.dataset.source); this.render(); }
    });
  }

  destroy() { this.host.innerHTML = ''; }

  show(dissection) {
    this.dissection = dissection;
    this.source = 0;
    this.range = null;
    this.render();
  }

  /** Highlights the bytes of `node` (switching to its data source). */
  highlight(node) {
    this.range = node && node.length > 0 ? { start: node.start, length: node.length, source: node.source ?? 0 } : null;
    if (this.range && this.range.source !== this.source) this.source = this.range.source;
    this.render();
    this.scroller.querySelector('.hl')?.scrollIntoView({ block: 'nearest' });
  }

  data() { return this.dissection?.sources?.[this.source]?.data ?? null; }

  render() {
    const t = this.app.t;
    const data = this.data();
    const sources = this.dissection?.sources ?? [];
    this.tabs.hidden = sources.length < 2;
    this.tabs.innerHTML = sources.map((s, i) => `<button class="by-tab ${i === this.source ? 'active' : ''}" data-source="${i}" title="${escapeHtml(s.name)}">${icon(i === 0 ? 'packet' : 'paneBytes')}<span>${escapeHtml(s.name)}</span></button>`).join('');
    if (!data) {
      this.scroller.innerHTML = `<div class="details-empty">${icon('paneBytes')}<span>${escapeHtml(t('bytes.empty'))}</span></div>`;
      return;
    }
    const s = this.app.settings();
    const bits = s.bytesView === 'bits';
    const perLine = bits ? 8 : 16;
    const toChar = s.bytesEncoding === 'ebcdic' ? ebcdicChar : asciiChar;
    const r = this.range && this.range.source === this.source ? this.range : null;
    const inRange = (o) => r && o >= r.start && o < r.start + r.length;
    const lines = [];
    const limit = Math.min(data.length, 65536 * 4);
    for (let line = 0; line < limit; line += perLine) {
      const hex = [];
      const text = [];
      for (let i = 0; i < perLine; i += 1) {
        const o = line + i;
        if (o >= data.length) { hex.push(`<span class="by-pad">${bits ? '        ' : '  '}</span>`); text.push(' '); continue; }
        const b = data[o];
        const hl = inRange(o) ? ' hl' : '';
        hex.push(`<span class="by-b${hl}" data-o="${o}">${bits ? b.toString(2).padStart(8, '0') : b.toString(16).padStart(2, '0')}</span>${!bits && i === 7 ? '<span class="by-gap"> </span>' : ''}`);
        text.push(`<span class="by-c${hl}" data-o="${o}">${escapeHtml(toChar(b))}</span>`);
      }
      lines.push(`<div class="by-line"><span class="by-off">${line.toString(16).padStart(4, '0')}</span><span class="by-hex">${hex.join('')}</span><span class="by-txt">${text.join('')}</span></div>`);
    }
    if (limit < data.length) lines.push(`<div class="by-line muted">… ${escapeHtml(t('bytes.more', { count: data.length - limit }))}</div>`);
    this.scroller.innerHTML = lines.join('');
  }

  /** The deepest tree node of this source whose bytes contain `offset`. */
  nodeAt(offset) {
    let best = null;
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.hidden) continue;
        if ((node.source ?? 0) === this.source && node.length > 0 && offset >= node.start && offset < node.start + node.length) {
          if (!best || node.length <= best.length) best = node;
        }
        if (node.children) walk(node.children);
      }
    };
    walk(this.dissection?.tree ?? []);
    return best;
  }

  pick(offset) {
    const node = this.nodeAt(offset);
    if (node) { this.highlight(node); this.app.onPickNode?.(node); }
  }
}
