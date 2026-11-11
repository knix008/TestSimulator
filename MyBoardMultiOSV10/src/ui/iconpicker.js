// The icon picker (ARCHITECTURE.md §4): one component for every icon field. It runs inside the
// 'iconpicker' popup (popup.js: an OS window on the desktop, a frame on the web) and answers an IconRef.
//
// Tabs:
//   Built-in  — the catalogue (icons-catalog.js): search (ko/en names + keywords) and category chips
//   Emoji     — the bundled list (ui/emoji-data.js): search (en/ko keywords) and categories
//   Uploaded  — the database's pictures (GET /api/icons): upload button, drag & drop, paste (Ctrl+V);
//               PNG JPEG GIF WebP BMP ICO SVG AVIF. Rasters are decoded here and scaled to ≤256 px PNG;
//               animated GIF / WebP are kept as they are up to 512 KB; SVG goes to the core raw (it sanitises it).
//   Letters   — 1–2 letters on a colour
// plus a colour row (tints built-in icons, colours letters) and the user's recent icons.
import { CATALOG, CATALOG_CATEGORIES, CATALOG_NAMES } from '../icons-catalog.js';
import { EMOJI, EMOJI_CATEGORIES } from './emoji-data.js';
import { builtinSvg, colorFor, makeIconRef, normalizeColor, parseIconRef, renderIconRef } from './iconref.js';
import { escapeHtml } from './dom.js';

export const ICON_TABS = ['builtin', 'emoji', 'upload', 'letters'];
export const TINTS = ['', '#1f6feb', '#2f9e8f', '#5f9e35', '#d9822b', '#e5484d', '#c2417a', '#7a5af8', '#8a6d3b', '#4f6d7a', '#111827'];
export const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml', 'image/avif'];
export const UPLOAD_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif'];
export const MAX_RASTER = 256;
export const MAX_ANIMATED_BYTES = 512 * 1024;
export const MAX_SVG_BYTES = 256 * 1024;

const norm = (text) => String(text ?? '').toLowerCase().normalize('NFKC');

/** Built-in names matching `query` (every word must appear in a name or keyword) in `category` ('all' for any). */
export function searchBuiltin(query, category = 'all') {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return CATALOG_NAMES.filter((name) => {
    const e = CATALOG[name];
    if (category !== 'all' && e.c !== category) return false;
    if (!words.length) return true;
    const hay = norm(`${name} ${e.ko} ${e.en} ${e.k ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Emoji entries matching `query` in `category`. */
export function searchEmoji(query, category = 'all') {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return EMOJI.filter(([emoji, cat, en, ko]) => {
    if (category !== 'all' && cat !== category) return false;
    if (!words.length) return true;
    const hay = norm(`${en} ${ko} ${emoji}`);
    return words.every((w) => hay.includes(w));
  });
}

// ───────────────────────── upload: decode, scale, encode

const extensionOf = (name) => String(name ?? '').split('.').pop().toLowerCase();

/** The MIME type of a file from its type or name ('' when it is not an accepted picture). */
export function pictureType(file) {
  const type = String(file?.type ?? '').toLowerCase();
  if (UPLOAD_TYPES.includes(type)) return type === 'image/vnd.microsoft.icon' ? 'image/x-icon' : type;
  const ext = extensionOf(file?.name);
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml', avif: 'image/avif' }[ext] ?? '';
}

/** Whether GIF / WebP bytes hold more than one frame. */
export function isAnimated(bytes, mime) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (mime === 'image/gif') {
    // Count image descriptors that follow a graphic control extension block (21 F9 04 … 00 2C).
    let frames = 0;
    for (let i = 0; i < b.length - 9 && frames < 2; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 0x04 && b[i + 7] === 0x00 && b[i + 8] === 0x2c) frames += 1;
    return frames > 1;
  }
  if (mime === 'image/webp') {
    // RIFF....WEBPVP8X with the animation flag, or an ANIM chunk.
    const text = String.fromCharCode(...b.subarray(0, Math.min(b.length, 64)));
    return text.startsWith('RIFF') && text.includes('WEBPVP8X') && ((b[20] & 0x02) !== 0 || text.includes('ANIM'));
  }
  return false;
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** Size that fits in `max` × `max` keeping the aspect (never enlarged). */
export function fitSize(width, height, max = MAX_RASTER) {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch { /* ICO / BMP in some webviews: through <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Turns a picked / dropped / pasted file into the upload body { name, mime, data (base64), width, height, note }.
 * Throws an Error with .code: 'type' (not a picture), 'decode' (unreadable), 'size' (SVG too large).
 */
export async function prepareUpload(file) {
  const mime = pictureType(file);
  if (!mime) throw Object.assign(new Error('unsupported'), { code: 'type' });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = String(file.name || 'picture').replace(/\.[^.]+$/, '').slice(0, 80) || 'picture';
  if (mime === 'image/svg+xml') {
    if (bytes.length > MAX_SVG_BYTES) throw Object.assign(new Error('svg too large'), { code: 'size' });
    return { name, mime, data: bytesToBase64(bytes), width: 0, height: 0, note: 'svg' };
  }
  const animated = (mime === 'image/gif' || mime === 'image/webp') && isAnimated(bytes, mime);
  let image;
  try { image = await decodeImage(new Blob([bytes], { type: mime })); } catch (error) { throw Object.assign(new Error(String(error?.message ?? error)), { code: 'decode' }); }
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  if (!width || !height) throw Object.assign(new Error('empty picture'), { code: 'decode' });
  if (animated && bytes.length <= MAX_ANIMATED_BYTES) {
    image.close?.();
    return { name, mime, data: bytesToBase64(bytes), width, height, note: 'animated' };
  }
  const size = fitSize(width, height);
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(size.width, size.height) : Object.assign(document.createElement('canvas'), size);
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, size.width, size.height);
  image.close?.();
  const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/png' }) : await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { name, mime: 'image/png', data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())), width: size.width, height: size.height, note: animated ? 'firstFrame' : (size.width < width ? 'scaled' : '') };
}

// ───────────────────────── the component

/**
 * new IconPicker(host, options).
 * options: { value (IconRef), t(key, params), language(), api (ApiClient, optional), recent: [refs],
 *            icon(name) (app icon HTML), onApply(ref), onCancel(), onNotice(kind, text), allowNone }
 */
export class IconPicker {
  constructor(host, options) {
    this.host = host;
    this.o = options;
    const p = parseIconRef(options.value);
    this.tab = { builtin: 'builtin', emoji: 'emoji', upload: 'upload', letters: 'letters' }[p.kind] ?? 'builtin';
    this.value = options.value ?? '';
    this.color = p.color ?? '';
    this.letters = p.kind === 'letters' ? p.text : '';
    this.query = { builtin: '', emoji: '' };
    this.category = { builtin: 'all', emoji: 'all' };
    this.uploads = null;
    this.uploadError = '';
    this.busy = false;
    this.bind();
    this.render();
  }

  t(key, params) { return this.o.t(key, params); }
  get lang() { return this.o.language() === 'en' ? 'en' : 'ko'; }

  setValue(ref) {
    this.value = ref;
    this.renderPreview();
    for (const el of this.host.querySelectorAll('[data-ip-ref]')) el.classList.toggle('active', el.dataset.ipRef === ref || el.dataset.ipBase === parseIconRef(ref).name);
  }

  /** The value with the current colour applied (built-in and letters take the tint). */
  composed(ref = this.value) {
    const p = parseIconRef(ref);
    if (p.kind === 'builtin') return makeIconRef({ kind: 'builtin', name: p.name, color: this.color || null });
    if (p.kind === 'letters') return makeIconRef({ kind: 'letters', text: p.text, color: this.color || colorFor(p.text) });
    return ref;
  }

  render() {
    const icon = this.o.icon;
    const tabs = ICON_TABS.map((id) => `<button type="button" class="tab ${this.tab === id ? 'active' : ''}" role="tab" aria-selected="${this.tab === id}" data-ip-tab="${id}" title="${escapeHtml(this.t(`iconpicker.tab.${id}`))}">${id === 'emoji' ? builtinSvg(CATALOG.smile ? 'smile' : 'star', { size: 16, className: 'icon' }) : icon({ builtin: 'iconInsert', upload: 'imageBg', letters: 'font' }[id])}<span>${escapeHtml(this.t(`iconpicker.tab.${id}`))}</span></button>`).join('');
    this.host.innerHTML = `<div class="iconpicker">
      <nav class="tabs ip-tabs" role="tablist"><div class="tabs-strip">${tabs}</div></nav>
      <div class="ip-body" data-ip-body></div>
      <div class="ip-colors" role="radiogroup" aria-label="${escapeHtml(this.t('iconpicker.color'))}">
        <span class="ip-label">${icon('palette')}<span>${escapeHtml(this.t('iconpicker.color'))}</span></span>
        ${TINTS.map((c) => `<button type="button" class="swatch ip-swatch ${(this.color || '') === c ? 'active' : ''}" data-ip-color="${c}" style="--swatch:${c || 'transparent'}" title="${escapeHtml(c || this.t('iconpicker.colorDefault'))}" aria-label="${escapeHtml(c || this.t('iconpicker.colorDefault'))}">${c ? '' : icon('refresh')}</button>`).join('')}
        <label class="ip-custom" title="${escapeHtml(this.t('iconpicker.colorCustom'))}"><input type="color" data-ip-custom value="${escapeHtml(normalizeColor(this.color) ?? '#1f6feb')}" aria-label="${escapeHtml(this.t('iconpicker.colorCustom'))}" /></label>
      </div>
      <div class="ip-recent" data-ip-recent></div>
      <div class="ip-foot">
        <span class="ip-preview" data-ip-preview></span>
        <span class="grow"></span>
        ${this.o.allowNone !== false ? `<button type="button" class="button" data-ip-act="clear" title="${escapeHtml(this.t('iconpicker.none'))}">${icon('close')}<span>${escapeHtml(this.t('iconpicker.none'))}</span></button>` : ''}
        <button type="button" class="button" data-ip-act="cancel" title="${escapeHtml(this.t('common.cancel'))}">${icon('close')}<span>${escapeHtml(this.t('common.cancel'))}</span></button>
        <button type="button" class="button primary" data-ip-act="apply" title="${escapeHtml(this.t('common.ok'))}">${icon('check')}<span>${escapeHtml(this.t('common.ok'))}</span></button>
      </div>
    </div>`;
    this.renderBody();
    this.renderRecent();
    this.renderPreview();
  }

  renderRecent() {
    const host = this.host.querySelector('[data-ip-recent]');
    const recent = (this.o.recent ?? []).filter(Boolean).slice(0, 16);
    host.hidden = !recent.length;
    host.innerHTML = recent.length ? `<span class="ip-label">${this.o.icon('recent')}<span>${escapeHtml(this.t('iconpicker.recent'))}</span></span>${recent.map((ref) => `<button type="button" class="ip-cell small" data-ip-ref="${escapeHtml(ref)}" title="${escapeHtml(ref)}">${renderIconRef(ref, { size: 20 })}</button>`).join('')}` : '';
  }

  renderPreview() {
    const host = this.host.querySelector('[data-ip-preview]');
    if (!host) return;
    const ref = this.composed();
    host.innerHTML = ref ? `${renderIconRef(ref, { size: 32 })}<code title="${escapeHtml(ref)}">${escapeHtml(ref)}</code>` : `<span class="muted">${escapeHtml(this.t('iconpicker.noneChosen'))}</span>`;
  }

  renderBody() {
    const body = this.host.querySelector('[data-ip-body]');
    const scroll = body.querySelector('.ip-grid')?.scrollTop ?? 0;
    if (this.tab === 'builtin') body.innerHTML = this.builtinHtml();
    else if (this.tab === 'emoji') body.innerHTML = this.emojiHtml();
    else if (this.tab === 'upload') { body.innerHTML = this.uploadHtml(); if (!this.uploads) this.loadUploads(); }
    else body.innerHTML = this.lettersHtml();
    const grid = body.querySelector('.ip-grid');
    if (grid) grid.scrollTop = scroll;
  }

  chips(kind, categories) {
    const current = this.category[kind];
    const all = [{ id: 'all', ko: '전체', en: 'All' }, ...categories];
    return `<div class="ip-chips" role="tablist">${all.map((c) => `<button type="button" class="ip-chip ${current === c.id ? 'active' : ''}" data-ip-cat="${kind}:${c.id}" title="${escapeHtml(c[this.lang])}">${c.icon ? `<i>${escapeHtml(c.icon)}</i>` : ''}<span>${escapeHtml(c[this.lang])}</span></button>`).join('')}</div>`;
  }

  search(kind) {
    return `<label class="search-box ip-search">${this.o.icon('search')}<input type="search" data-ip-search="${kind}" value="${escapeHtml(this.query[kind])}" placeholder="${escapeHtml(this.t(`iconpicker.search.${kind}`))}" aria-label="${escapeHtml(this.t(`iconpicker.search.${kind}`))}" /></label>`;
  }

  builtinHtml() {
    const names = searchBuiltin(this.query.builtin, this.category.builtin);
    const current = parseIconRef(this.value);
    const cells = names.map((name) => `<button type="button" class="ip-cell ${current.kind === 'builtin' && current.name === name ? 'active' : ''}" data-ip-ref="b:${name}" data-ip-base="${name}" title="${escapeHtml(`${CATALOG[name][this.lang]} (${name})`)}">${builtinSvg(name, { size: 22, color: this.color || null })}</button>`).join('');
    return `${this.search('builtin')}${this.chips('builtin', CATALOG_CATEGORIES)}
      <div class="ip-grid" role="listbox" aria-label="${escapeHtml(this.t('iconpicker.tab.builtin'))}">${cells || `<p class="ip-empty muted">${escapeHtml(this.t('iconpicker.noMatch'))}</p>`}</div>
      <p class="ip-count muted">${escapeHtml(this.t('iconpicker.count', { count: names.length }))}</p>`;
  }

  emojiHtml() {
    const list = searchEmoji(this.query.emoji, this.category.emoji);
    const current = parseIconRef(this.value);
    const cells = list.map(([emoji, , en, ko]) => `<button type="button" class="ip-cell emoji ${current.kind === 'emoji' && current.emoji === emoji ? 'active' : ''}" data-ip-ref="e:${escapeHtml(emoji)}" title="${escapeHtml(this.lang === 'en' ? en : `${ko} · ${en}`)}">${escapeHtml(emoji)}</button>`).join('');
    return `${this.search('emoji')}${this.chips('emoji', EMOJI_CATEGORIES)}
      <div class="ip-grid emoji-grid" role="listbox" aria-label="${escapeHtml(this.t('iconpicker.tab.emoji'))}">${cells || `<p class="ip-empty muted">${escapeHtml(this.t('iconpicker.noMatch'))}</p>`}</div>
      <p class="ip-count muted">${escapeHtml(this.t('iconpicker.count', { count: list.length }))}</p>`;
  }

  uploadHtml() {
    const icon = this.o.icon;
    const current = parseIconRef(this.value);
    let grid;
    if (!this.o.api) grid = `<p class="ip-empty muted">${icon('warning')}<span>${escapeHtml(this.t('iconpicker.noCore'))}</span></p>`;
    else if (this.uploads === null) grid = `<p class="ip-empty muted">${icon('hourglass')}<span>${escapeHtml(this.t('iconpicker.loading'))}</span></p>`;
    else if (this.uploadError) grid = `<p class="ip-empty danger-text">${icon('error')}<span>${escapeHtml(this.uploadError)}</span></p>`;
    else if (!this.uploads.length) grid = `<p class="ip-empty muted">${icon('info')}<span>${escapeHtml(this.t('iconpicker.noUploads'))}</span></p>`;
    else grid = this.uploads.map((u) => `<span class="ip-upload ${current.kind === 'upload' && current.id === u.id ? 'active' : ''}"><button type="button" class="ip-cell" data-ip-ref="u:${escapeHtml(u.id)}" title="${escapeHtml(`${u.name ?? ''}${u.width ? ` · ${u.width}×${u.height}` : ''}`)}">${renderIconRef(`u:${u.id}`, { size: 28 })}</button><button type="button" class="ip-del" data-ip-delete="${escapeHtml(u.id)}" title="${escapeHtml(this.t('iconpicker.deleteUpload'))}" aria-label="${escapeHtml(this.t('iconpicker.deleteUpload'))}">${icon('close')}</button></span>`).join('');
    return `<div class="ip-drop" data-ip-drop tabindex="0" title="${escapeHtml(this.t('iconpicker.dropHint'))}">
        ${icon('importFile')}<span>${escapeHtml(this.t('iconpicker.dropHint'))}</span><span class="grow"></span>
        <button type="button" class="button small primary" data-ip-act="upload" ${this.o.api && !this.busy ? '' : 'disabled'}>${icon(this.busy ? 'hourglass' : 'importFile')}<span>${escapeHtml(this.t(this.busy ? 'iconpicker.uploading' : 'iconpicker.upload'))}</span></button>
        <input type="file" data-ip-file hidden multiple accept="${UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',')},image/*" />
      </div>
      <p class="ip-hint muted">${escapeHtml(this.t('iconpicker.uploadHint'))}</p>
      <div class="ip-grid upload-grid" role="listbox" aria-label="${escapeHtml(this.t('iconpicker.tab.upload'))}">${grid}</div>`;
  }

  lettersHtml() {
    const text = this.letters || '';
    const color = this.color || colorFor(text || 'MB');
    return `<div class="ip-letters">
      <label class="row"><span class="row-label">${this.o.icon('font')}<span>${escapeHtml(this.t('iconpicker.letters'))}</span></span><span class="row-control"><input type="text" maxlength="2" data-ip-letters value="${escapeHtml(text)}" placeholder="AB" aria-label="${escapeHtml(this.t('iconpicker.letters'))}" /></span></label>
      <div class="ip-letters-preview">${[48, 32, 20].map((size) => renderIconRef(`l:${text || '?'}${color}`, { size })).join('')}</div>
      <p class="muted">${escapeHtml(this.t('iconpicker.lettersHint'))}</p>
    </div>`;
  }

  async loadUploads() {
    if (!this.o.api) return;
    try {
      const result = await this.o.api.icons({ limit: 500 });
      this.uploads = Array.isArray(result) ? result : result?.items ?? [];
      this.uploadError = '';
    } catch (error) {
      this.uploads = [];
      this.uploadError = `${this.t('iconpicker.loadFailed')}: ${error?.message ?? error}`;
    }
    if (this.tab === 'upload') this.renderBody();
  }

  async uploadFiles(files) {
    const pictures = [...(files ?? [])].filter((f) => f && (pictureType(f) || /^image\//.test(f.type)));
    if (!pictures.length) { this.o.onNotice?.('warning', this.t('iconpicker.notPicture')); return; }
    if (!this.o.api) return;
    this.busy = true;
    this.renderBody();
    let last = null;
    for (const file of pictures) {
      try {
        const body = await prepareUpload(file);
        const row = await this.o.api.uploadIcon({ name: body.name, mime: body.mime, data: body.data });
        last = row?.id ?? row?.icon?.id ?? null;
        if (body.note === 'firstFrame') this.o.onNotice?.('info', this.t('iconpicker.firstFrame', { name: file.name }));
      } catch (error) {
        const key = { type: 'iconpicker.notPicture', decode: 'iconpicker.decodeFailed', size: 'iconpicker.tooLarge' }[error?.code] ?? null;
        this.o.onNotice?.('error', key ? `${this.t(key)} (${file.name})` : `${this.t('iconpicker.uploadFailed')}: ${error?.message ?? error}`);
      }
    }
    this.busy = false;
    this.uploads = null;
    await this.loadUploads();
    if (last) this.setValue(`u:${last}`);
  }

  async deleteUpload(id) {
    try {
      await this.o.api.deleteIcon(id);
      if (parseIconRef(this.value).id === id) this.setValue('');
    } catch (error) {
      this.o.onNotice?.('error', `${this.t('iconpicker.deleteFailed')}: ${error?.message ?? error}`);
    }
    this.uploads = null;
    this.loadUploads();
  }

  bind() {
    const host = this.host;
    host.addEventListener('click', (event) => {
      const el = event.target.closest('[data-ip-tab], [data-ip-cat], [data-ip-ref], [data-ip-color], [data-ip-act], [data-ip-delete]');
      if (!el || el.disabled) return;
      if (el.dataset.ipTab) { this.tab = el.dataset.ipTab; this.render(); return; }
      if (el.dataset.ipCat) { const [kind, cat] = el.dataset.ipCat.split(':'); this.category[kind] = cat; this.renderBody(); return; }
      if (el.dataset.ipDelete) { this.deleteUpload(el.dataset.ipDelete); return; }
      if (el.dataset.ipRef != null) {
        this.setValue(el.dataset.ipRef);
        if (event.detail === 2) this.apply();
        return;
      }
      if (el.dataset.ipColor != null) {
        this.color = el.dataset.ipColor;
        for (const sw of host.querySelectorAll('[data-ip-color]')) sw.classList.toggle('active', sw.dataset.ipColor === this.color);
        if (this.tab === 'builtin' || this.tab === 'letters') this.renderBody();
        this.renderPreview();
        return;
      }
      const act = el.dataset.ipAct;
      if (act === 'apply') this.apply();
      else if (act === 'cancel') this.o.onCancel?.();
      else if (act === 'clear') this.o.onApply?.('');
      else if (act === 'upload') host.querySelector('[data-ip-file]')?.click();
    });
    host.addEventListener('input', (event) => {
      const target = event.target;
      if (target.dataset.ipSearch) {
        const kind = target.dataset.ipSearch;
        this.query[kind] = target.value;
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
          const pos = target.selectionStart;
          this.renderBody();
          const input = host.querySelector(`[data-ip-search="${kind}"]`);
          input?.focus();
          input?.setSelectionRange(pos, pos);
        }, 120);
      } else if ('ipLetters' in target.dataset) {
        this.letters = target.value.trim();
        this.value = this.letters ? `l:${this.letters}` : '';
        const preview = host.querySelector('.ip-letters-preview');
        const color = this.color || colorFor(this.letters || 'MB');
        if (preview) preview.innerHTML = [48, 32, 20].map((size) => renderIconRef(`l:${this.letters || '?'}${color}`, { size })).join('');
        this.renderPreview();
      } else if ('ipCustom' in target.dataset) {
        this.color = target.value;
        for (const sw of host.querySelectorAll('[data-ip-color]')) sw.classList.remove('active');
        this.renderPreview();
      }
    });
    host.addEventListener('change', (event) => {
      const target = event.target;
      if ('ipCustom' in target.dataset && (this.tab === 'builtin' || this.tab === 'letters')) this.renderBody();
      if ('ipFile' in target.dataset) { this.uploadFiles(target.files); target.value = ''; }
    });
    host.addEventListener('dragover', (event) => { if (this.tab === 'upload' || [...(event.dataTransfer?.types ?? [])].includes('Files')) { event.preventDefault(); host.querySelector('[data-ip-drop]')?.classList.add('over'); } });
    host.addEventListener('dragleave', () => host.querySelector('[data-ip-drop]')?.classList.remove('over'));
    host.addEventListener('drop', (event) => {
      event.preventDefault();
      host.querySelector('[data-ip-drop]')?.classList.remove('over');
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) { if (this.tab !== 'upload') { this.tab = 'upload'; this.render(); } this.uploadFiles(files); }
    });
    // Paste a picture (Ctrl+V) anywhere in the picker: it is uploaded.
    globalThis.document?.addEventListener('paste', (event) => {
      if (!host.isConnected) return;
      const files = [...(event.clipboardData?.items ?? [])].filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter(Boolean);
      if (!files.length) return;
      event.preventDefault();
      if (this.tab !== 'upload') { this.tab = 'upload'; this.render(); }
      this.uploadFiles(files);
    });
    host.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.matches?.('[data-ip-letters]')) { event.preventDefault(); this.apply(); }
    });
  }

  apply() {
    if (this.tab === 'letters' && this.letters) this.value = `l:${this.letters}`;
    this.o.onApply?.(this.composed());
  }
}
