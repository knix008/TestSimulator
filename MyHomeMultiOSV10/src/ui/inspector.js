// The right panel's editors: Content (the selected block's fields), Style (its background,
// spacing, alignment and width), Page (name, file name, title, description) and Site (title,
// language, icon, and the design: colours, fonts, corners, width). Pure HTML; app.js handles
// the data-* attributes.
import { blockDef, blockLabel, BUTTON_SHAPES, BUTTON_SIZES, BUTTON_VARIANTS, buttonLook, fieldLabel, normalizeStyle, STYLE_ALIGNS, STYLE_BACKGROUNDS, STYLE_WIDTHS } from '../domain/blocks.js';
import { effectiveDesign, FONT_IDS, FONTS, siteDesignName } from '../domain/designs.js';
import { pageFile } from '../domain/render.js';
import { getPath } from '../domain/site.js';
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { stepperHtml } from '../stepper.js';

const e = escapeHtml;

export const EDITOR_TABS = [['content', 'edit'], ['style', 'formatShape'], ['page', 'pageProps'], ['site', 'siteProps']];

function section(id, glyph, title, body, app, extra = '') {
  const collapsed = app.state.collapsedEditors.has(id);
  return `<section class="prop-section ${collapsed ? 'collapsed' : ''}"><header><button class="section-toggle" data-editor-toggle="${e(id)}" aria-expanded="${!collapsed}" title="${e(title)}">${icon(collapsed ? 'caretRight' : 'caretDown', 'icon tiny')}${icon(glyph)}<span>${e(title)}</span></button>${extra}</header>${collapsed ? '' : `<div class="props">${body}</div>`}</section>`;
}

const row = (label, control, { tall = false, title = label } = {}) => `<div class="prop-row ${tall ? 'tall' : ''}" title="${e(title)}"><span class="prop-label"><span>${e(label)}</span></span><span class="prop-control">${control}</span></div>`;
const switchHtml = (attrs, checked, label) => `<label class="switch-wrap" title="${e(label)}"><input type="checkbox" ${attrs} ${checked ? 'checked' : ''} aria-label="${e(label)}" /><span class="switch" aria-hidden="true"></span></label>`;
const segmented = (attr, options, current) => `<span class="segmented" role="radiogroup">${options.map(([value, label, glyph]) => `<button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" ${attr}="${e(value)}" title="${e(label)}">${glyph ? icon(glyph) : ''}<span>${e(label)}</span></button>`).join('')}</span>`;
const stepper = (key, value, min, max, step, unit, label, t) => stepperHtml({ key, value, min, max, step, unit, label, decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }) });

function imageControl(app, blockId, path, value) {
  const t = app.t;
  const isData = String(value ?? '').startsWith('data:');
  return `<div class="image-field">
    <div class="image-thumb" data-image-choose="${e(path)}" data-block="${e(blockId)}" title="${e(t('field.chooseImage'))}">${value ? `<img src="${e(value)}" alt="" />` : icon('picture')}</div>
    <div class="image-buttons">
      <button class="small-button" data-image-choose="${e(path)}" data-block="${e(blockId)}" title="${e(t('field.chooseImage'))}">${icon('folderOpen')}<span>${e(t('field.chooseImage'))}</span></button>
      <button class="small-button" data-image-art="${e(path)}" data-block="${e(blockId)}" title="${e(t('field.artImage'))}">${icon('sparkles')}<span>${e(t('field.artImage'))}</span></button>
      ${value ? `<button class="small-button danger" data-image-clear="${e(path)}" data-block="${e(blockId)}" title="${e(t('field.clearImage'))}">${icon('imageClear')}<span>${e(t('field.clearImage'))}</span></button>` : ''}
    </div>
    <input type="text" data-prop="${e(path)}" data-block="${e(blockId)}" data-kind="url" value="${e(isData ? '' : value ?? '')}" placeholder="${e(isData ? t('field.embeddedImage') : 'https://…')}" title="${e(t('field.imageUrl'))}" spellcheck="false" />
  </div>`;
}

/** A part with settings of its own (a button, an item), folded under a small header; stays open while redrawn. */
function propsBox(app, key, glyph, title, rows) {
  const open = app.state.openProps?.has(key);
  return `<details class="sub-props" data-props-key="${e(key)}" ${open ? 'open' : ''}><summary title="${e(title)}">${icon(glyph)}<span>${e(title)}</span></summary><div class="sub-props-body">${rows.join('')}</div></details>`;
}

/** A colour with its "automatic" state: the picker, the value, and × to go back to automatic. */
const colorField = (attrs, value, label, clearAttrs, t) => `<span class="color-pair"><input type="color" ${attrs} value="${e(/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#000000')}" aria-label="${e(label)}" />${value ? `<code>${e(value)}</code><button class="icon-button" ${clearAttrs} title="${e(t('style.clear'))}" aria-label="${e(t('style.clear'))}">${icon('close')}</button>` : `<span class="muted">${e(t('style.auto'))}</span>`}</span>`;

/** The settings of one button: style, size, corners, colours, an icon, full width, a new tab. */
function buttonProps(app, blockId, path, raw) {
  const t = app.t;
  const o = buttonLook(raw);
  const a = (key) => `data-button-prop="${e(key)}" data-button-path="${e(path)}" data-block="${e(blockId)}"`;
  const clear = (key) => `data-button-clear="${e(key)}" data-button-path="${e(path)}" data-block="${e(blockId)}"`;
  const choose = (key, list) => `<select ${a(key)} aria-label="${e(t(`button.${key}`))}"><option value="">${e(t('button.default'))}</option>${list.map((v) => `<option value="${v}" ${o[key] === v ? 'selected' : ''}>${e(t(`button.${key}s.${v}`))}</option>`).join('')}</select>`;
  return propsBox(app, `${blockId}:btn:${path}`, 'blkButton', t('button.props'), [
    row(t('button.variant'), choose('variant', BUTTON_VARIANTS)),
    row(t('button.size'), choose('size', BUTTON_SIZES)),
    row(t('button.shape'), choose('shape', BUTTON_SHAPES)),
    row(t('button.bg'), colorField(a('bg'), o.bg, t('button.bg'), clear('bg'), t)),
    row(t('button.color'), colorField(a('color'), o.color, t('button.color'), clear('color'), t)),
    row(t('button.icon'), `<input type="text" ${a('icon')} value="${e(o.icon)}" maxlength="8" placeholder="★ → ✉" spellcheck="false" />`),
    row(t('button.full'), switchHtml(a('full'), o.full, t('button.full'))),
    row(t('button.newTab'), switchHtml(a('newTab'), o.newTab, t('button.newTab'))),
  ]);
}

/** The settings of one item of a list: hidden, highlighted, its colours. */
function itemProps(app, blockId, base, item) {
  const t = app.t;
  const data = (key, kind) => `data-prop="${e(`${base}.${key}`)}" data-block="${e(blockId)}" data-kind="${kind}"`;
  const clear = (key) => `data-prop-clear="${e(`${base}.${key}`)}" data-block="${e(blockId)}"`;
  return propsBox(app, `${blockId}:item:${base}`, 'gear', t('item.props'), [
    row(t('item.hidden'), switchHtml(data('_hidden', 'toggle'), Boolean(item?._hidden), t('item.hidden'))),
    row(t('item.accent'), switchHtml(data('_accent', 'toggle'), Boolean(item?._accent), t('item.accent'))),
    row(t('item.bg'), colorField(data('_bg', 'color'), item?._bg, t('item.bg'), clear('_bg'), t)),
    row(t('item.color'), colorField(data('_color', 'color'), item?._color, t('item.color'), clear('_color'), t)),
  ]);
}

function fieldControl(app, blockId, field, path, value, block = null) {
  if (field.button && block) return fieldControlPlain(app, blockId, field, path, value) + buttonProps(app, blockId, path, block.props?.buttons?.[path]);
  return fieldControlPlain(app, blockId, field, path, value);
}

function fieldControlPlain(app, blockId, field, path, value) {
  const L = app.language();
  const label = fieldLabel(field, L);
  const t = app.t;
  const data = `data-prop="${e(path)}" data-block="${e(blockId)}" data-kind="${e(field.kind)}"`;
  switch (field.kind) {
    case 'textarea': return row(label, `<textarea ${data} rows="3" spellcheck="false">${e(value ?? '')}</textarea>`, { tall: true });
    case 'md': return row(label, `<textarea ${data} rows="7" spellcheck="false" class="md-field">${e(value ?? '')}</textarea><small class="muted">${e(t('field.mdHint'))}</small>`, { tall: true });
    case 'code': return row(label, `<textarea ${data} rows="9" spellcheck="false" class="code-field">${e(value ?? '')}</textarea><small class="muted">${e(t('field.codeHint'))}</small>`, { tall: true });
    case 'image': return row(label, imageControl(app, blockId, path, value), { tall: true });
    case 'url': return row(label, `<input type="text" ${data} list="hm-pages" value="${e(value ?? '')}" spellcheck="false" placeholder="https://… / page.html / #contact" />`);
    case 'number': return row(label, stepper(`prop:${blockId}:${path}`, Number(value) || 0, field.min ?? 0, field.max ?? 9999, field.step ?? 1, '', label, t));
    case 'toggle': return row(label, switchHtml(data, Boolean(value), label));
    case 'select': return row(label, `<select ${data} aria-label="${e(label)}">${field.options.map((o) => `<option value="${e(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${e(L === 'en' ? o.en : o.ko)}</option>`).join('')}</select>`);
    case 'actions': return row(label, `<span class="field-actions">${field.buttons.map((b) => `<button class="small-button" data-command="${e(b.command)}" title="${e(t(b.tip ?? b.label))}">${icon(b.icon)}<span>${e(t(b.label))}</span></button>`).join('')}</span>`, { tall: true });
    case 'color': return row(label, `<input type="color" ${data} value="${e(/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#000000')}" />`);
    default: return row(label, `<input type="text" ${data} value="${e(value ?? '')}" spellcheck="false" />`);
  }
}

function itemsControl(app, block, field) {
  const L = app.language();
  const t = app.t;
  const list = Array.isArray(block.props[field.key]) ? block.props[field.key] : [];
  const cards = list.map((item, i) => {
    const key = `${block.id}:${field.key}:${i}`;
    const collapsed = app.state.collapsedItems.has(key);
    const first = field.item.find((x) => x.kind === 'text');
    const title = (first && item[first.key]) || `${fieldLabel(field, L)} ${i + 1}`;
    return `<div class="item-card ${collapsed ? 'collapsed' : ''}" data-item-card="${e(key)}">
      <div class="item-head"><button class="item-toggle" data-item-toggle="${e(key)}" title="${e(title)}">${icon(collapsed ? 'caretRight' : 'caretDown', 'icon tiny')}<b>${i + 1}</b><span>${e(String(title).slice(0, 40))}</span></button>
        <button class="icon-button" data-item-move="${e(`${field.key}:${i}:-1`)}" data-block="${e(block.id)}" title="${e(t('items.up'))}" ${i === 0 ? 'disabled' : ''}>${icon('arrowUp')}</button>
        <button class="icon-button" data-item-move="${e(`${field.key}:${i}:1`)}" data-block="${e(block.id)}" title="${e(t('items.down'))}" ${i === list.length - 1 ? 'disabled' : ''}>${icon('arrowDown')}</button>
        <button class="icon-button" data-item-copy="${e(`${field.key}:${i}`)}" data-block="${e(block.id)}" title="${e(t('items.duplicate'))}">${icon('duplicate')}</button>
        <button class="icon-button danger" data-item-delete="${e(`${field.key}:${i}`)}" data-block="${e(block.id)}" title="${e(t('items.delete'))}">${icon('trash')}</button></div>
      ${collapsed ? '' : `<div class="item-body">${field.item.map((sub) => fieldControl(app, block.id, sub, `${field.key}.${i}.${sub.key}`, item[sub.key], block)).join('')}${itemProps(app, block.id, `${field.key}.${i}`, item)}</div>`}
    </div>`;
  }).join('');
  return `<div class="items-field"><div class="items-head">${icon('list')}<b>${e(fieldLabel(field, L))}</b><span class="count">${list.length}</span><span class="grow"></span>
    <button class="small-button" data-item-add="${e(field.key)}" data-block="${e(block.id)}" title="${e(t('items.add'))}">${icon('plus')}<span>${e(t('items.add'))}</span></button></div>${cards || `<p class="panel-hint">${e(t('items.empty'))}</p>`}</div>`;
}

/** Content tab: the fields of the selected block. */
export function contentHtml(app, block) {
  const t = app.t;
  if (!block) return `<p class="panel-hint">${icon('info')}<span>${e(t('editors.noBlock'))}</span></p>`;
  const def = blockDef(block.type);
  const L = app.language();
  const simple = def.fields.filter((f) => f.kind !== 'items').map((f) => fieldControl(app, block.id, f, f.key, getPath(block.props, f.key), block)).join('');
  const lists = def.fields.filter((f) => f.kind === 'items').map((f) => itemsControl(app, block, f)).join('');
  const actions = def.global ? '' : `<div class="editor-actions">
    <button class="small-button" data-block-action="up" title="${e(t('action.moveUp'))}">${icon('arrowUp')}<span>${e(t('action.moveUp'))}</span></button>
    <button class="small-button" data-block-action="down" title="${e(t('action.moveDown'))}">${icon('arrowDown')}<span>${e(t('action.moveDown'))}</span></button>
    <button class="small-button" data-block-action="duplicate" title="${e(t('action.duplicate'))}">${icon('duplicate')}<span>${e(t('action.duplicate'))}</span></button>
    <button class="small-button danger" data-block-action="delete" title="${e(t('action.delete'))}">${icon('trash')}<span>${e(t('action.delete'))}</span></button></div>`;
  return section('content', def.icon, blockLabel(block.type, L), `${simple}${actions}`, app) + lists;
}

/** Style tab: how the selected block sits on the page. */
export function styleHtml(app, block) {
  const t = app.t;
  if (!block) return `<p class="panel-hint">${icon('info')}<span>${e(t('editors.noBlock'))}</span></p>`;
  const s = normalizeStyle(block.style, blockDef(block.type));
  const id = block.id;
  const bgNames = STYLE_BACKGROUNDS.map((bg) => [bg, t(`bg.${bg || 'default'}`)]);
  const background = `<select data-style="bg" data-block="${e(id)}" aria-label="${e(t('style.background'))}">${bgNames.map(([value, label]) => `<option value="${e(value)}" ${s.bg === value ? 'selected' : ''}>${e(label)}</option>`).join('')}</select>`;
  const color = (key, label) => `<span class="color-pair"><input type="color" data-style="${key}" data-block="${e(id)}" value="${e(s[key] || '#ffffff')}" aria-label="${e(label)}" />${s[key] ? `<code>${e(s[key])}</code><button class="icon-button" data-style-clear="${key}" data-block="${e(id)}" title="${e(t('style.clear'))}">${icon('close')}</button>` : `<span class="muted">${e(t('style.auto'))}</span>`}</span>`;
  const body = [
    row(t('style.background'), background),
    s.bg === 'custom' ? row(t('style.bgColor'), color('bgColor', t('style.bgColor'))) : '',
    row(t('style.textColor'), color('color', t('style.textColor'))),
    row(t('style.bgImage'), imageControl(app, id, '@style.bgImage', s.bgImage), { tall: true }),
    s.bgImage ? row(t('style.overlay'), stepper(`style:${id}:overlay`, s.overlay, 0, 90, 5, '%', t('style.overlay'), t)) : '',
    row(t('style.padTop'), stepper(`style:${id}:padTop`, s.padTop, 0, 320, 8, 'px', t('style.padTop'), t)),
    row(t('style.padBottom'), stepper(`style:${id}:padBottom`, s.padBottom, 0, 320, 8, 'px', t('style.padBottom'), t)),
    row(t('style.align'), segmented(`data-style-set="align" data-block="${e(id)}" data-value`, STYLE_ALIGNS.map((a) => [a, t(`align.${a}`), `textAlign${a[0].toUpperCase()}${a.slice(1)}`]), s.align)),
    row(t('style.width'), segmented(`data-style-set="width" data-block="${e(id)}" data-value`, STYLE_WIDTHS.map((w) => [w, t(`width.${w}`), `width${w[0].toUpperCase()}${w.slice(1)}`]), s.width)),
    row(t('style.anchor'), `<input type="text" data-style="anchor" data-block="${e(id)}" value="${e(s.anchor)}" placeholder="contact" spellcheck="false" />`, { title: t('style.anchorTip') }),
    row(t('style.radius'), switchHtml(`data-style="radius" data-block="${e(id)}"`, s.radius, t('style.radius'))),
    row(t('style.hideMobile'), switchHtml(`data-style="hideMobile" data-block="${e(id)}"`, s.hideMobile, t('style.hideMobile'))),
    row(t('style.hidden'), switchHtml(`data-style="hidden" data-block="${e(id)}"`, s.hidden, t('style.hidden'))),
    `<div class="editor-actions"><button class="small-button" data-style-reset="${e(id)}" title="${e(t('style.reset'))}">${icon('refresh')}<span>${e(t('style.reset'))}</span></button></div>`,
  ].join('');
  return section('style', 'formatShape', `${t('editors.style')} · ${blockLabel(block.type, app.language())}`, body, app);
}

/** Page tab: the page shown. */
export function pageHtml(app, site, page) {
  const t = app.t;
  const index = site.pages.indexOf(page);
  const body = [
    row(t('page.name'), `<input type="text" data-page-field="name" data-page="${e(page.id)}" value="${e(page.name)}" spellcheck="false" />`),
    row(t('page.file'), index === 0 ? `<span class="path" title="${e(t('page.homeTip'))}">index.html · ${e(t('page.home'))}</span>` : `<span class="slug-field"><input type="text" data-page-field="slug" data-page="${e(page.id)}" value="${e(page.slug)}" spellcheck="false" /><span class="muted">.html</span></span>`),
    row(t('page.title'), `<input type="text" data-page-field="title" data-page="${e(page.id)}" value="${e(page.title)}" placeholder="${e(t('page.titleAuto'))}" spellcheck="false" />`),
    row(t('page.description'), `<textarea data-page-field="description" data-page="${e(page.id)}" rows="3" placeholder="${e(t('page.descriptionHint'))}">${e(page.description)}</textarea>`, { tall: true }),
    row(t('page.nav'), switchHtml(`data-page-field="nav" data-page="${e(page.id)}"`, page.nav !== false, t('page.nav'))),
    row(t('page.blocks'), `<span>${page.blocks.length}</span>`),
    `<div class="editor-actions">
      <button class="small-button" data-command="pageLeft" ${index === 0 ? 'disabled' : ''} title="${e(t('action.pageLeft'))}">${icon('chevronLeft')}<span>${e(t('action.pageLeft'))}</span></button>
      <button class="small-button" data-command="pageRight" ${index === site.pages.length - 1 ? 'disabled' : ''} title="${e(t('action.pageRight'))}">${icon('chevronRight')}<span>${e(t('action.pageRight'))}</span></button>
      <button class="small-button" data-command="duplicatePage" title="${e(t('action.duplicatePage'))}">${icon('duplicate')}<span>${e(t('action.duplicatePage'))}</span></button>
      <button class="small-button danger" data-command="deletePage" ${site.pages.length <= 1 ? 'disabled' : ''} title="${e(t('action.deletePage'))}">${icon('trash')}<span>${e(t('action.deletePage'))}</span></button></div>`,
  ].join('');
  return section('page', 'pageProps', `${t('editors.page')} · ${page.name}`, body, app);
}

/** Site tab: what every page shares, and the design. */
export function siteHtml(app, site) {
  const t = app.t;
  const L = app.language();
  const m = site.meta;
  const d = effectiveDesign(site.design);
  const over = site.design.overrides ?? {};
  const info = [
    row(t('site.title'), `<input type="text" data-site-field="title" value="${e(m.title)}" spellcheck="false" />`),
    row(t('site.description'), `<textarea data-site-field="description" rows="3" placeholder="${e(t('site.descriptionHint'))}">${e(m.description)}</textarea>`, { tall: true }),
    row(t('site.keywords'), `<input type="text" data-site-field="keywords" value="${e(m.keywords)}" placeholder="${e(t('site.keywordsHint'))}" spellcheck="false" />`),
    row(t('site.author'), `<input type="text" data-site-field="author" value="${e(m.author)}" spellcheck="false" />`),
    row(t('site.language'), `<select data-site-field="language"><option value="ko" ${m.language === 'ko' ? 'selected' : ''}>한국어</option><option value="en" ${m.language === 'en' ? 'selected' : ''}>English</option></select>`),
    row(t('site.favicon'), imageControl(app, '@site', '@site.favicon', m.favicon), { tall: true }),
  ].join('');
  const color = (key) => `<span class="color-pair"><input type="color" data-design="${key}" value="${e(d[key])}" aria-label="${e(t(`design.${key}`))}" />${over[key] ? `<code>${e(over[key])}</code><button class="icon-button" data-design-clear="${key}" title="${e(t('style.clear'))}">${icon('close')}</button>` : `<span class="muted">${e(t('design.fromPreset'))}</span>`}</span>`;
  const font = (key) => `<select data-design="${key}">${FONT_IDS.map((id) => `<option value="${id}" ${d[key] === id ? 'selected' : ''}>${e(L === 'en' ? FONTS[id].en : FONTS[id].ko)}</option>`).join('')}</select>`;
  const design = [
    `<div class="design-current"><span class="theme-swatch">${[d.bg, d.primary, d.accent, d.text].map((c) => `<i style="background:${c}"></i>`).join('')}</span><b>${e(siteDesignName(site.design, L))}</b><span class="grow"></span>
      <button class="small-button" data-command="designPicker" title="${e(t('action.designPicker'))}">${icon('palette')}<span>${e(t('action.designPicker'))}</span></button>
      <button class="small-button" data-command="saveDesignAsMine" title="${e(t('action.saveDesignAsMine'))}">${icon('save')}<span>${e(t('design.saveMineShort'))}</span></button></div>`,
    ...['primary', 'accent', 'bg', 'surface', 'text', 'headerBg', 'footerBg'].map((key) => row(t(`design.${key}`), color(key))),
    row(t('design.headingFont'), font('headingFont')),
    row(t('design.bodyFont'), font('bodyFont')),
    row(t('design.radius'), stepper('design:radius', d.radius, 0, 40, 2, 'px', t('design.radius'), t)),
    row(t('design.width'), stepper('design:width', d.width, 720, 1600, 40, 'px', t('design.width'), t)),
    row(t('design.baseSize'), stepper('design:baseSize', d.baseSize, 13, 22, 1, 'px', t('design.baseSize'), t)),
    Object.keys(over).length ? `<div class="editor-actions"><button class="small-button" data-design-reset title="${e(t('design.reset'))}">${icon('refresh')}<span>${e(t('design.reset'))}</span></button></div>` : '',
  ].join('');
  return section('siteInfo', 'siteProps', t('editors.siteInfo'), info, app) + section('design', 'palette', t('editors.design'), design, app);
}

/** <datalist> of the pages for link fields. */
export const pagesDatalist = (site) => `<datalist id="hm-pages">${site.pages.map((p) => `<option value="${e(pageFile(p))}">${e(p.name)}</option>`).join('')}<option value="#contact"></option></datalist>`;
