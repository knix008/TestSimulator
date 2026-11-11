// The query box of the advanced search: a text area over a mirror that underlines the error the core
// reports (POST /jql/validate → details.position/length), and an autocomplete list from GET /jql/suggest
// at the caret. Enter runs the query (when no suggestion is open), Ctrl+Space opens the suggestions.
//
//   const editor = new JqlEditor(host, { api, value, placeholder, onSubmit(text), onChange(text), onValidity(result) })
//   editor.value / editor.setValue(text) / editor.focus() / editor.validate() → result / editor.destroy()
import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../icons.js';
import { L } from './texts.js';

const KIND_ICON = { field: 'field', operator: 'filter', value: 'tag', keyword: 'sort', function: 'clock' };

export class JqlEditor {
  constructor(host, { api, value = '', placeholder = '', onSubmit = null, onChange = null, onValidity = null, compact = false } = {}) {
    this.api = api;
    this.onSubmit = onSubmit;
    this.onChange = onChange;
    this.onValidity = onValidity;
    this.result = { ok: true };
    this.items = [];
    this.active = 0;
    this.context = null;
    this.seq = 0;
    host.innerHTML = `<div class="mbv-jql ${compact ? 'compact' : ''}">
      <div class="mbv-jql-box">
        <div class="mbv-jql-mirror" aria-hidden="true"></div>
        <textarea class="mbv-jql-input" rows="1" spellcheck="false" autocomplete="off" aria-label="${escapeHtml(L('jqlLabel'))}" placeholder="${escapeHtml(placeholder || L('jqlPlaceholder'))}"></textarea>
      </div>
      <div class="mbv-jql-status" role="status"></div>
      <div class="mbv-jql-suggest" role="listbox" hidden></div>
    </div>`;
    this.root = host.firstElementChild;
    this.input = this.root.querySelector('textarea');
    this.mirror = this.root.querySelector('.mbv-jql-mirror');
    this.status = this.root.querySelector('.mbv-jql-status');
    this.list = this.root.querySelector('.mbv-jql-suggest');
    this.input.value = value;
    this.bind();
    this.paint();
    if (value) this.scheduleValidate(0);
  }

  get value() { return this.input.value; }

  setValue(text, { validate = true } = {}) {
    this.input.value = text ?? '';
    this.paint();
    this.closeList();
    if (validate) this.scheduleValidate(0);
  }

  focus() { this.input.focus(); this.input.setSelectionRange(this.input.value.length, this.input.value.length); }

  destroy() { clearTimeout(this.vt); clearTimeout(this.st); this.root.remove(); }

  bind() {
    const input = this.input;
    input.addEventListener('input', () => {
      this.paint();
      this.onChange?.(input.value);
      this.scheduleValidate();
      this.scheduleSuggest();
    });
    input.addEventListener('scroll', () => { this.mirror.scrollTop = input.scrollTop; });
    input.addEventListener('click', () => { if (!this.list.hidden) this.scheduleSuggest(0); });
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) this.closeList(); }, 120));
    input.addEventListener('keydown', (event) => {
      const open = !this.list.hidden && this.items.length;
      if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        this.setActive(this.active + (event.key === 'ArrowDown' ? 1 : -1));
        return;
      }
      if (open && (event.key === 'Enter' || event.key === 'Tab')) {
        event.preventDefault();
        this.accept(this.items[this.active]);
        return;
      }
      if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeList(); return; }
      if (event.key === ' ' && event.ctrlKey) { event.preventDefault(); this.scheduleSuggest(0); return; }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.closeList();
        this.submit();
      }
    });
    this.list.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const row = event.target.closest('[data-index]');
      if (row) this.accept(this.items[Number(row.dataset.index)]);
    });
  }

  async submit() {
    clearTimeout(this.st);
    this.seq++;
    this.closeList();
    const result = await this.validate();
    if (result.ok) this.onSubmit?.(this.input.value);
  }

  /** The text again in the mirror, with the error range underlined. */
  paint() {
    const text = this.input.value;
    const error = this.result.ok ? null : this.result.error?.details ?? null;
    let html;
    if (error && Number.isFinite(error.position)) {
      const start = Math.max(0, Math.min(text.length, error.position));
      const end = Math.max(start, Math.min(text.length, start + (error.length || 0)));
      const mark = end > start ? text.slice(start, end) : ' ';
      html = `${escapeHtml(text.slice(0, start))}<mark class="mbv-jql-error" data-pos="${start}">${escapeHtml(mark)}</mark>${escapeHtml(text.slice(end))}`;
    } else html = escapeHtml(text);
    this.mirror.innerHTML = `${html}​`;
    // Grows with the text up to four lines.
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 96)}px`;
    this.mirror.style.height = this.input.style.height;
  }

  scheduleValidate(delay = 260) {
    clearTimeout(this.vt);
    this.vt = setTimeout(() => this.validate(), delay);
  }

  async validate() {
    clearTimeout(this.vt);
    const text = this.input.value;
    let result;
    try {
      result = text.trim() ? await this.api.validateJql(text) : { ok: true };
    } catch (error) {
      result = { ok: false, error: { code: error.code ?? 'ERROR', message: error.message, details: error.details ?? {} } };
    }
    if (text !== this.input.value) return this.result;
    this.result = result ?? { ok: true };
    this.root.classList.toggle('invalid', !this.result.ok);
    this.status.innerHTML = this.result.ok
      ? (text.trim() ? `${icon('check', 'icon tiny')}<span>${escapeHtml(L('jqlValid'))}</span>` : '')
      : `${icon('error', 'icon tiny')}<span>${escapeHtml(this.errorText(this.result.error))}</span>`;
    this.status.className = `mbv-jql-status ${this.result.ok ? 'ok' : 'bad'}`;
    this.paint();
    this.onValidity?.(this.result);
    return this.result;
  }

  errorText(error) {
    if (!error) return '';
    const known = { JQL_SYNTAX: 'errSyntax', JQL_UNKNOWN_FIELD: 'errField', JQL_BAD_OPERATOR: 'errOperator', JQL_BAD_VALUE: 'errValue', JQL_UNKNOWN_FUNCTION: 'errFunction' }[error.code];
    const where = Number.isFinite(error.details?.position) ? L('errAt', { pos: error.details.position + 1 }) : '';
    return `${known ? L(known) : error.code ?? ''}${where} — ${error.message ?? ''}`;
  }

  scheduleSuggest(delay = 140) {
    clearTimeout(this.st);
    this.st = setTimeout(() => this.suggest(), delay);
  }

  async suggest() {
    const text = this.input.value;
    const caret = this.input.selectionStart ?? text.length;
    const seq = ++this.seq;
    let out;
    try { out = await this.api.suggestJql(text, caret); } catch { return; }
    if (seq !== this.seq || document.activeElement !== this.input) return;
    this.context = out;
    this.items = (out?.items ?? []).slice(0, 40);
    if (!this.items.length) { this.closeList(); return; }
    this.active = 0;
    this.list.innerHTML = this.items.map((item, i) => `<div class="mbv-jql-item ${i === 0 ? 'active' : ''}" role="option" data-index="${i}" title="${escapeHtml(item.detail ?? item.label)}">${icon(KIND_ICON[out.kind] ?? 'dot', 'icon tiny')}<span>${escapeHtml(item.label)}</span>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}</div>`).join('');
    this.list.hidden = false;
    this.placeList(out.start ?? caret);
  }

  /** Under the word being completed. */
  placeList(offset) {
    const marker = document.createElement('span');
    const text = this.input.value;
    this.mirror.textContent = text.slice(0, offset);
    marker.textContent = '​';
    this.mirror.append(marker);
    const box = this.root.querySelector('.mbv-jql-box').getBoundingClientRect();
    const m = marker.getBoundingClientRect();
    this.paint();
    const left = Math.max(0, Math.min(m.left - box.left - this.input.scrollLeft, box.width - 220));
    this.list.style.left = `${Math.round(left)}px`;
    this.list.style.top = `${Math.round(Math.min(m.bottom, box.bottom) - box.top + 4)}px`;
  }

  setActive(i) {
    if (!this.items.length) return;
    this.active = (i + this.items.length) % this.items.length;
    const rows = [...this.list.children];
    rows.forEach((row, k) => row.classList.toggle('active', k === this.active));
    rows[this.active]?.scrollIntoView({ block: 'nearest' });
  }

  accept(item) {
    if (!item || !this.context) return;
    const text = this.input.value;
    const { start, end } = this.context;
    const insert = item.insert ?? item.label;
    const after = text.slice(end);
    const space = after.startsWith(' ') ? '' : ' ';
    const next = `${text.slice(0, start)}${insert}${space}${after}`;
    this.input.value = next;
    const caret = start + insert.length + space.length;
    this.input.setSelectionRange(caret, caret);
    this.closeList();
    this.paint();
    this.onChange?.(next);
    this.scheduleValidate(120);
    this.scheduleSuggest(60);
  }

  closeList() { this.list.hidden = true; this.items = []; }
}
