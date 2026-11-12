// HTML of the main window's panels (app.js puts it in place and wires the events):
//   left   the photo with its face points, how the face was found, the style buttons
//   centre the gallery cards and the large view's frame
//   right  the selected caricature: name and style, exaggeration, style options, effects
// Every number is a stepper "− value +" in one column; buttons sit in equal-size grids.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { stepperHtml } from '../stepper.js';
import { STYLES, STYLE_OPTION_RANGE, BACKGROUNDS, styleById } from '../engine/styles.js';
import { WARP_KEYS, WARP_RANGE, STRENGTH_RANGE } from '../engine/warp.js';
import { EFFECTS, effectDef } from '../engine/effects.js';
import { featureHandles, standoutFeatures } from '../engine/face.js';

const WARP_ICONS = { head: 'wHead', eyes: 'wEyes', nose: 'wNose', mouth: 'wMouth', chin: 'wChin', jaw: 'wJaw', forehead: 'wForehead', ears: 'wEars', strength: 'wStrength' };
const OPTION_ICONS = { lines: 'optLines', detail: 'optDetail', colors: 'optColors', smooth: 'optSmooth', texture: 'optTexture', background: 'optBackground' };
const HANDLE_ICONS = { face: 'faceFind', eyeL: 'wEyes', eyeR: 'wEyes', nose: 'wNose', mouth: 'wMouth', chin: 'wChin', forehead: 'wForehead' };

export const itemName = (item) => item.name || t(`style.${item.styleId}`);

const stepper = (key, value, { min, max, step, unit = '' }, label) => stepperHtml({
  key, value, min, max, step, unit, label,
  decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }),
});

const row = (glyph, label, control, title = label) => `<div class="prop-row" title="${escapeHtml(title)}"><span class="prop-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="prop-control">${control}</span></div>`;

const segmented = (attr, key, options, current) => `<span class="segmented compact" role="radiogroup">${options.map(([value, label, glyph]) => `<button type="button" class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" ${attr}="${escapeHtml(key)}" data-value="${escapeHtml(value)}" title="${escapeHtml(label)}">${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`).join('')}</span>`;

const sectionHead = (glyph, title, extra = '') => `<h3 class="panel-title">${icon(glyph)}<span>${escapeHtml(title)}</span><span class="grow"></span>${extra}</h3>`;

const gridButton = (attr, value, glyph, label, tip = label, extra = '') => `<button type="button" class="grid-button ${extra}" ${attr}="${escapeHtml(value)}" title="${escapeHtml(tip)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;

// ───────────────────────── left: the photo

export function leftPanelHtml(app) {
  const doc = app.doc();
  if (!doc) {
    return `<div class="panel-empty">${icon('photo', 'icon big')}<p>${escapeHtml(t('panel.noPhoto'))}</p>
      <div class="button-grid two">${gridButton('data-command', 'open', 'folderOpen', t('action.open'))}${gridButton('data-command', 'camera', 'camera', t('action.camera'))}</div></div>`;
  }
  const a = doc.analysis ?? {};
  const method = t(`face.method.${doc.features?.method ?? 'default'}`);
  const maskMethod = t(`face.mask.${a.maskMethod ?? 'shape'}`);
  return `<div class="source-view" id="source-view">
      <img id="source-img" src="${escapeHtml(doc.photo.data)}" alt="${escapeHtml(doc.photo.name)}" draggable="false" />
      <svg id="source-marks" class="source-marks ${app.settings().showLandmarks ? '' : 'hidden'}" aria-hidden="true"></svg>
    </div>
    <p class="panel-hint">${icon('bulb')}<span>${escapeHtml(t('panel.dragHint'))}</span></p>
    <div class="info-rows">
      ${row('faceFind', t('panel.faceMethod'), `<span class="badge ${doc.features?.method === 'landmarks' ? 'ok' : doc.features?.method === 'manual' ? 'info' : 'warn'}">${escapeHtml(method)}</span>`)}
      ${row('fxBackground', t('panel.maskMethod'), `<span class="badge ${a.maskMethod === 'model' ? 'ok' : 'warn'}">${escapeHtml(maskMethod)}</span>`)}
      ${(() => { const s = standoutFeatures(doc.features); return s.length ? row('wNose', t('panel.standout'), `<span class="standout">${s.map((x) => `<span class="badge ${x.percent > 0 ? 'info' : ''}" title="${escapeHtml(t('tip.standout'))}">${escapeHtml(t(`warp.${x.key}`))} ${x.percent > 0 ? '+' : ''}${x.percent}%</span>`).join('')}</span>`, t('tip.standout')) : ''; })()}
      ${a.faces > 1 ? row('user', t('panel.faces'), `<span class="badge info">${escapeHtml(t('panel.facesCount', { count: a.faces }))}</span>`) : ''}
    </div>
    <div class="button-grid two">
      ${gridButton('data-command', 'faceFind', 'faceFind', t('action.faceFind'), t('tip.faceFind'))}
      ${gridButton('data-command', 'faceReset', 'faceReset', t('action.faceReset'), t('tip.faceReset'))}
      ${gridButton('data-command', 'landmarks', 'landmarks', t('action.landmarks'), t('tip.landmarks'), app.settings().showLandmarks ? 'active' : '')}
      ${gridButton('data-command', 'cropFace', 'crop', t('action.cropFace'), t('tip.cropFace'), doc.autoCrop && doc.crop ? 'active' : '')}
      ${gridButton('data-command', 'generate', 'generate', t('action.generate'), t('tip.generate'))}
      ${gridButton('data-command', 'styleSet', 'styleSet', t('tool.styleSet'), t('tip.styleSet'))}
    </div>
    ${sectionHead('styleSet', t('panel.addStyle'), `<span class="panel-note">${STYLES.length}</span>`)}
    <div class="button-grid two style-buttons">${STYLES.map((s) => gridButton('data-add-style', s.id, s.icon, t(`style.${s.id}`), t('tip.addStyle', { name: t(`style.${s.id}`), desc: t(`style.${s.id}.desc`) }))).join('')}</div>`;
}

/** The face points over the photo: SVG in the photo's own pixels (the SVG viewBox). */
export function marksSvg(features, width, height, crop = null) {
  if (!features) return '';
  const frame = crop ? `<rect class="mark-crop" x="${crop.x}" y="${crop.y}" width="${crop.w}" height="${crop.h}"><title>${escapeHtml(t('face.cropFrame'))}</title></rect>` : '';
  const f = features.face;
  const r = Math.max(width, height) / 70;
  const deg = ((f.angle ?? 0) * 180) / Math.PI;
  const handles = featureHandles(features).map((h) => `<g class="mark mark-${h.id}" data-handle="${h.id}" transform="translate(${h.x.toFixed(1)} ${h.y.toFixed(1)})"><title>${escapeHtml(t(`face.point.${h.id}`))}</title><circle r="${(h.id === 'face' ? r * 1.3 : r).toFixed(1)}"/><circle class="mark-dot" r="${(r * 0.32).toFixed(1)}"/></g>`).join('');
  return `${frame}<ellipse class="mark-oval" cx="${f.cx.toFixed(1)}" cy="${f.cy.toFixed(1)}" rx="${f.rx.toFixed(1)}" ry="${f.ry.toFixed(1)}" transform="rotate(${deg.toFixed(2)} ${f.cx.toFixed(1)} ${f.cy.toFixed(1)})" stroke-width="${(r * 0.25).toFixed(1)}"/>
    ${features.eyes.map((e) => `<circle class="mark-ring" cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r="${e.r.toFixed(1)}" stroke-width="${(r * 0.2).toFixed(1)}"/>`).join('')}
    <ellipse class="mark-ring" cx="${features.mouth.x.toFixed(1)}" cy="${features.mouth.y.toFixed(1)}" rx="${features.mouth.w.toFixed(1)}" ry="${Math.max(2, features.mouth.h).toFixed(1)}" stroke-width="${(r * 0.2).toFixed(1)}"/>
    ${handles}`;
}

// ───────────────────────── centre: gallery cards

export function galleryCardHtml(item, { selected, busy, ms, index, showNames }) {
  const style = styleById(item.styleId);
  const w = item.warp;
  const info = `<div class="cari-info"><span>${escapeHtml(t(`style.${item.styleId}.desc`))}</span><span class="cari-warp">${escapeHtml(t('view.warpSummary', { head: Math.round(w.head * 100), eyes: Math.round(w.eyes * 100), nose: Math.round(w.nose * 100), mouth: Math.round(w.mouth * 100) }))}</span><span>${escapeHtml(t('view.effectCount', { count: item.effects.filter((e) => e.on).length }))}</span></div>`;
  return `<article class="cari-card ${selected ? 'selected' : ''} ${busy ? 'busy' : ''}" data-item="${escapeHtml(item.id)}" tabindex="0" role="option" aria-selected="${selected}" title="${escapeHtml(`${index + 1}. ${itemName(item)} — ${t('tip.card')}`)}">
    <div class="cari-thumb"><span class="cari-spinner" aria-hidden="true"></span></div>
    <footer class="cari-foot ${showNames ? '' : 'hidden'}">
      <b class="cari-index">${index + 1}</b>${icon(style.icon)}<span class="cari-name">${escapeHtml(itemName(item))}</span>
      ${item.effects.some((e) => e.on) ? `<span class="cari-fx" title="${escapeHtml(t('tip.hasEffects', { count: item.effects.filter((e) => e.on).length }))}">${icon('addEffect')}</span>` : ''}
      <span class="cari-ms">${ms ? `${ms} ms` : ''}</span>
    </footer>
    ${info}
    <div class="cari-actions">
      <button type="button" class="icon-button" data-card-action="open" title="${escapeHtml(t('action.single'))}" aria-label="${escapeHtml(t('action.single'))}">${icon('viewSingle')}</button>
      <button type="button" class="icon-button" data-card-action="vary" title="${escapeHtml(t('action.vary'))}" aria-label="${escapeHtml(t('action.vary'))}">${icon('vary')}</button>
      <button type="button" class="icon-button" data-card-action="duplicate" title="${escapeHtml(t('action.duplicate'))}" aria-label="${escapeHtml(t('action.duplicate'))}">${icon('duplicate')}</button>
      <button type="button" class="icon-button" data-card-action="export" title="${escapeHtml(t('action.exportImage'))}" aria-label="${escapeHtml(t('action.exportImage'))}">${icon('exportImage')}</button>
      <button type="button" class="icon-button danger" data-card-action="delete" title="${escapeHtml(t('action.delete'))}" aria-label="${escapeHtml(t('action.delete'))}">${icon('trash')}</button>
    </div>
  </article>`;
}

// ───────────────────────── right: the selected caricature

export function rightPanelHtml(app) {
  const doc = app.doc();
  const item = app.selectedItem();
  if (!doc || !item) {
    return `<div class="panel-empty">${icon('gallery', 'icon big')}<p>${escapeHtml(t(doc ? 'panel.noSelection' : 'panel.noPhoto'))}</p></div>`;
  }
  const w = item.warp;
  const o = item.options;
  const styleSelect = `<select class="style-select" data-item-style aria-label="${escapeHtml(t('panel.style'))}" title="${escapeHtml(t('panel.style'))}">${STYLES.map((s) => `<option value="${s.id}" data-icon="${s.icon}" ${s.id === item.styleId ? 'selected' : ''}>${escapeHtml(t(`style.${s.id}`))}</option>`).join('')}</select>`;
  const warpRows = WARP_KEYS.map((key) => row(WARP_ICONS[key], t(`warp.${key}`), stepper(`warp:${key}`, Math.round(w[key] * 100), { min: WARP_RANGE.min * 100, max: WARP_RANGE.max * 100, step: 5, unit: '%' }, t(`warp.${key}`)), t(`warp.${key}.tip`))).join('');
  const strength = row(WARP_ICONS.strength, t('warp.strength'), stepper('warp:strength', Math.round(w.strength * 100), { min: STRENGTH_RANGE.min * 100, max: STRENGTH_RANGE.max * 100, step: 10, unit: '%' }, t('warp.strength')), t('warp.strength.tip'));
  const optionRows = Object.entries(STYLE_OPTION_RANGE).map(([key, range]) => row(OPTION_ICONS[key], t(`option.${key}`), stepper(`option:${key}`, o[key], { ...range, unit: key === 'detail' || key === 'smooth' || key === 'texture' ? '%' : '' }, t(`option.${key}`)), t(`option.${key}.tip`))).join('');
  const bgRow = row(OPTION_ICONS.background, t('option.background'), segmented('data-option-set', 'background', BACKGROUNDS.map((b) => [b, t(`option.background.${b}`)]), o.background), t('option.background.tip'));
  const seedRow = row('seed', t('option.seed'), `<span class="seed-box"><code>${item.seed}</code><button type="button" class="icon-button" data-command="reseed" title="${escapeHtml(t('action.reseed'))}" aria-label="${escapeHtml(t('action.reseed'))}">${icon('dice')}</button></span>`, t('option.seed.tip'));
  return `<div class="props">
      ${row('rename', t('panel.name'), `<input type="text" class="text-field" data-item-name value="${escapeHtml(item.name)}" placeholder="${escapeHtml(t(`style.${item.styleId}`))}" maxlength="80" spellcheck="false" aria-label="${escapeHtml(t('panel.name'))}" />`)}
      ${row(styleById(item.styleId).icon, t('panel.style'), styleSelect, t(`style.${item.styleId}.desc`))}
    </div>
    ${sectionHead('wHead', t('panel.exaggeration'))}
    <div class="props">${warpRows}${strength}
      <div class="button-grid two">
        ${gridButton('data-command', 'warpPersonal', 'faceFind', t('action.warpPersonal'), t('tip.warpPersonal'))}
        ${gridButton('data-command', 'warpStyle', 'refresh', t('action.warpStyle'), t('tip.warpStyle'))}
        ${gridButton('data-command', 'warpNone', 'original', t('action.warpNone'), t('tip.warpNone'))}
        ${gridButton('data-command', 'warpRandom', 'dice', t('action.warpRandom'), t('tip.warpRandom'))}
      </div>
    </div>
    ${sectionHead('optDetail', t('panel.styleOptions'))}
    <div class="props">${optionRows}${bgRow}${seedRow}
      <div class="button-grid two">${gridButton('data-command', 'optionsReset', 'refresh', t('action.optionsReset'), t('tip.optionsReset'))}${gridButton('data-command', 'vary', 'vary', t('action.vary'), t('tip.vary'))}</div>
    </div>
    ${sectionHead('addEffect', t('panel.effects'), `<span class="panel-note">${item.effects.length}</span>`)}
    <div class="props effects">
      <div class="button-grid three">
        ${gridButton('data-command', 'addEffectMenu', 'addEffect', t('action.addEffect'), t('tip.addEffect'))}
        ${gridButton('data-command', 'effectsToAll', 'gallery', t('action.effectsToAll'), t('tip.effectsToAll'))}
        ${gridButton('data-command', 'effectsClear', 'trash', t('action.effectsClear'), t('tip.effectsClear'), 'danger')}
      </div>
      ${item.effects.length ? item.effects.map((e, i) => effectHtml(e, i, item.effects.length)).join('') : `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('panel.noEffects'))}</span></p>`}
    </div>`;
}

function effectHtml(effect, index, count) {
  const def = effectDef(effect.id);
  if (!def) return '';
  const label = t(`effect.${effect.id}`);
  const params = def.params.map((p) => {
    const key = `fx:${index}:${p.key}`;
    const name = t(`effect.param.${p.key}`);
    if (p.type === 'number') return row('dot', name, stepper(key, effect[p.key], p, name));
    if (p.type === 'color') return row('palette', name, `<span class="color-field"><input type="color" data-fx-color="${index}:${p.key}" value="${escapeHtml(effect[p.key])}" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}" /><code>${escapeHtml(effect[p.key])}</code></span>`);
    if (p.type === 'choice') return row('list', name, `<select data-fx-choice="${index}:${p.key}" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}" data-icon="${def.icon}">${p.options.map((opt) => `<option value="${opt}" ${effect[p.key] === opt ? 'selected' : ''}>${escapeHtml(t(`effect.option.${opt}`))}</option>`).join('')}</select>`);
    return row('textTool', name, `<input type="text" class="text-field" data-fx-text="${index}:${p.key}" value="${escapeHtml(effect[p.key])}" placeholder="${escapeHtml(t(`effect.placeholder.${effect.id}`))}" maxlength="200" aria-label="${escapeHtml(name)}" />`);
  }).join('');
  return `<section class="effect-card ${effect.on ? '' : 'off'}" data-effect="${index}">
    <header>
      ${icon(def.icon)}<b title="${escapeHtml(t(`effect.${effect.id}.desc`))}">${escapeHtml(label)}</b><span class="grow"></span>
      <button type="button" class="icon-button" data-fx-action="toggle" data-index="${index}" title="${escapeHtml(t(effect.on ? 'action.effectOff' : 'action.effectOn'))}" aria-pressed="${effect.on}">${icon(effect.on ? 'eye' : 'eyeOff')}</button>
      <button type="button" class="icon-button" data-fx-action="up" data-index="${index}" title="${escapeHtml(t('action.effectUp'))}" ${index === 0 ? 'disabled' : ''}>${icon('arrowUp')}</button>
      <button type="button" class="icon-button" data-fx-action="down" data-index="${index}" title="${escapeHtml(t('action.effectDown'))}" ${index === count - 1 ? 'disabled' : ''}>${icon('arrowDown')}</button>
      <button type="button" class="icon-button danger" data-fx-action="remove" data-index="${index}" title="${escapeHtml(t('action.effectRemove'))}">${icon('trash')}</button>
    </header>
    <div class="effect-params">${params}</div>
  </section>`;
}

/** Menu items for "Add effect": pixel effects, then overlays. */
export function effectMenuItems() {
  const pixel = EFFECTS.filter((e) => !e.overlay);
  const overlay = EFFECTS.filter((e) => e.overlay);
  const item = (e) => ({ id: `custom:fx:${e.id}`, label: t(`effect.${e.id}`), icon: e.icon });
  return [...pixel.map(item), { separator: true }, ...overlay.map(item)];
}
