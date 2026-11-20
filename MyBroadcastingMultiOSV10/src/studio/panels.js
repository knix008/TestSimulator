// The docks in the MySketchBook panels:
//   left   — Scenes (list) over Sources (tree of the edited scene, groups open and close);
//   right  — the selected source: Properties · Filters · Transform · Audio (advanced audio properties);
//   bottom — Audio mixer · Transitions · Controls · Media · Stats · Messages · Problems.
// Each function returns HTML; app.js wires the data-* attributes. Meters are updated in place (updateMeters).
import { ALIGNMENTS, BLEND_MODES, BOUNDS_TYPES, FILTER_TYPES, SCALE_FILTERS, SOURCE_TYPES, TRANSITION_TYPES, filtersFor } from '../bc/catalog.js';
import * as M from '../bc/model.js';
import { faderToMul, mulToDb, mulToFader } from '../bc/engine/audio.js';
import { FEATURES } from '../bc/features.js';
import { icon } from '../icons.js';
import { getLanguage, t } from '../i18n.js';
import { stepperHtml } from '../stepper.js';
import { escapeHtml as esc } from '../ui/dom.js';
import { formHtml } from './propform.js';
import { formatSeconds } from './studio.js';

const btn = (attrs, glyph, tip, { label = false, cls = 'icon-button', disabled = false } = {}) => `<button type="button" class="${cls}" ${attrs} title="${esc(tip)}" aria-label="${esc(tip)}" ${disabled ? 'disabled' : ''}>${icon(glyph)}${label ? `<span>${esc(tip)}</span>` : ''}</button>`;
const sourceName = (c, id) => c.sources[id]?.name ?? M.sceneById(c, id)?.name ?? '?';
const sourceIcon = (c, id) => (M.sceneById(c, id) ? 'srcScene' : SOURCE_TYPES[c.sources[id]?.type]?.icon ?? 'dot');
const stepper = (key, value, min, max, step, unit, labelKey) => stepperHtml({ key, value, min, max, step, unit, label: t(labelKey), decreaseTip: t('stepper.decrease', { label: t(labelKey) }), increaseTip: t('stepper.increase', { label: t(labelKey) }) });
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ───────────────────────── left: scenes and sources

/** `tail`: markup placed at the right end of the head (the panel's collapse button). */
export function scenesHtml(studio, tail = '') {
  const c = studio.c;
  const edit = studio.editScene.id;
  const rows = c.scenes.filter((s) => !s.temporary).map((s, i) => {
    const program = s.id === c.current; const preview = studio.studioMode && s.id === c.preview;
    return `<div class="list-row scene-row ${s.id === edit ? 'selected' : ''}" data-scene="${esc(s.id)}" draggable="false" title="${esc(s.name)}">
      <span class="row-grip" data-scene-grip="${i}" title="${esc(t('panel.dragToMove'))}">${icon('grip')}</span>${icon('srcScene')}<span class="row-name">${esc(s.name)}</span>
      ${program ? `<span class="tag live" title="${esc(t('studio.program'))}">${esc(t('studio.programShort'))}</span>` : ''}${preview ? `<span class="tag preview" title="${esc(t('studio.preview'))}">${esc(t('studio.previewShort'))}</span>` : ''}
      ${s.override ? `<span class="tag" title="${esc(t('scene.overrideTip'))}">${icon('transitionGo')}</span>` : ''}</div>`;
  }).join('');
  return `<section class="dock dock-scenes" data-dock="scenes">
    <h3 class="dock-head">${icon('srcScene')}<span>${esc(t('dock.scenes'))}</span><i class="bottom-count">${c.scenes.length}</i><span class="grow"></span>
      ${btn('data-command="addScene"', 'plus', t('action.addScene'))}${btn('data-command="removeScene"', 'minus', t('action.removeScene'), { disabled: c.scenes.length <= 1 })}
      ${btn('data-command="sceneFilters"', 'filters', t('action.sceneFilters'))}${btn('data-command="sceneUp"', 'arrowUp', t('action.sceneUp'))}${btn('data-command="sceneDown"', 'arrowDown', t('action.sceneDown'))}${tail ? `<span class="dock-head-sep"></span>${tail}` : ''}</h3>
    <div class="dock-list scene-list" data-list="scenes">${rows}</div></section>`;
}

function itemRow(studio, item, depth, index, parent) {
  const c = studio.c;
  const sel = studio.selection.items.has(item.id);
  const src = c.sources[item.source];
  const kids = item.children ? `<div class="tree-children" ${item.collapsed ? 'hidden' : ''}>${[...item.children].reverse().map((k, i) => itemRow(studio, k, depth + 1, item.children.length - 1 - i, item)).join('')}</div>` : '';
  const rt = studio.engine?.runtime(item.source);
  const warn = rt?.status === 'error' || rt?.status === 'waiting';
  return `<div class="tree-node"><div class="list-row source-row ${sel ? 'selected' : ''} ${item.visible ? '' : 'hidden-item'}" data-item="${esc(item.id)}" data-index="${index}" data-parent="${esc(parent?.id ?? '')}" style="--depth:${depth}" title="${esc(sourceName(c, item.source))}">
      <span class="row-grip" data-item-grip="${esc(item.id)}" title="${esc(t('panel.dragToMove'))}">${icon('grip')}</span>
      ${item.children ? `<button class="icon-button tiny" data-item-collapse="${esc(item.id)}" title="${esc(t(item.collapsed ? 'panel.expand' : 'panel.collapse'))}">${icon(item.collapsed ? 'chevronRight' : 'chevronDown')}</button>` : ''}
      ${icon(sourceIcon(c, item.source))}<span class="row-name">${esc(sourceName(c, item.source))}</span>
      ${warn ? `<span class="tag warn" title="${esc(t(`status.source.${rt.status}`))}">${icon('warning')}</span>` : ''}
      ${src?.audio && src.audio.muted ? `<span class="tag" title="${esc(t('audio.muted'))}">${icon('muted')}</span>` : ''}
      <button class="icon-button tiny" data-item-eye="${esc(item.id)}" aria-pressed="${item.visible}" title="${esc(t(item.visible ? 'action.hideItem' : 'action.showItem'))}">${icon(item.visible ? 'eye' : 'eyeOff')}</button>
      <button class="icon-button tiny" data-item-lock="${esc(item.id)}" aria-pressed="${item.locked}" title="${esc(t(item.locked ? 'action.unlockItem' : 'action.lockItem'))}">${icon(item.locked ? 'lock' : 'unlock')}</button>
    </div>${kids}</div>`;
}

export function sourcesHtml(studio) {
  const scene = studio.editScene;
  const items = [...scene.items].reverse(); // the top of the list is drawn last (on top)
  const any = studio.selection.items.size > 0;
  return `<section class="dock dock-sources" data-dock="sources">
    <h3 class="dock-head">${icon('sources')}<span>${esc(t('dock.sources'))}</span><i class="bottom-count">${M.allItems(scene).length}</i><span class="grow"></span>
      ${btn('data-command="addSourceMenu"', 'plus', t('action.addSource'))}${btn('data-command="removeItems"', 'minus', t('action.removeItems'), { disabled: !any })}
      ${btn('data-command="openProperties"', 'gear', t('action.properties'), { disabled: !any })}${btn('data-command="openFilters"', 'filters', t('action.filters'), { disabled: !any })}
      ${btn('data-command="itemUp"', 'arrowUp', t('action.itemUp'), { disabled: !any })}${btn('data-command="itemDown"', 'arrowDown', t('action.itemDown'), { disabled: !any })}</h3>
    <div class="dock-list source-tree" data-list="sources">${items.length ? items.map((it, i) => itemRow(studio, it, 0, scene.items.length - 1 - i, null)).join('') : `<p class="dock-empty">${icon('info')}<span>${esc(t('dock.noSources'))}</span><button class="small-button" data-command="addSourceMenu">${icon('plus')}<span>${esc(t('action.addSource'))}</span></button></p>`}</div></section>`;
}

// ───────────────────────── right: the selected source

export const RIGHT_TABS = ['props', 'filters', 'transform', 'audio'];
const TAB_ICONS = { props: 'gear', filters: 'filters', transform: 'transform', audio: 'mixer' };

/** The right panel with nothing selected: what goes out now, the outputs with their buttons, performance. */
export function overviewHtml(studio, ctx = {}) {
  const c = studio.c;
  const s = studio.stats();
  const sys = ctx.sys ?? null;
  const o = studio.outputs;
  const program = M.sceneById(c, c.current);
  const preview = studio.studioMode ? M.sceneById(c, c.preview) : null;
  const tr = c.transitions.find((x) => x.id === c.transition);
  const card = (glyph, key, body, extra = '') => `<section class="ov-card ${extra}"><h4>${icon(glyph)}<span>${esc(t(key))}</span></h4>${body}</section>`;
  const kv = (label, value, cls = '') => `<div class="ov-row"><span class="muted">${esc(label)}</span><b class="${cls}">${esc(value)}</b></div>`;
  const out = (glyph, key, on, detail, command, startKey, stopKey) => `<div class="ov-out ${on ? 'on' : ''}">${icon(glyph)}<span class="ov-out-name">${esc(t(key))}</span><span class="ov-out-detail">${esc(detail)}</span>
    <button class="small-button ${on ? 'danger' : ''}" data-command="${command}">${icon(on ? 'stop' : 'play')}<span>${esc(t(on ? stopKey : startKey))}</span></button></div>`;
  const st = s.stream;
  const streamDetail = st ? [formatSeconds(st.seconds), `${Math.round(st.kbps)} kb/s`, st.viewers != null ? t('overview.viewers', { n: st.viewers }) : ''].filter(Boolean).join(' · ') : t('out.state.off');
  const rec = s.recording;
  const recDetail = rec ? [formatSeconds(rec.seconds), `${(rec.bytes / 1048576).toFixed(1)} MB`, rec.paused ? t('out.state.paused') : ''].filter(Boolean).join(' · ') : t('out.state.off');
  return [
    card('program', 'overview.onAir', `<div class="ov-scene">${icon('srcScene')}<b>${esc(program?.name ?? '—')}</b>${st ? `<span class="tag live">${esc(t('studio.programShort'))}</span>` : ''}</div>
      ${preview ? kv(t('studio.preview'), preview.name) : ''}${kv(t('overview.transition'), `${tr ? (tr.name || t(`trn.${tr.type}`)) : '—'} · ${c.duration} ms`)}
      ${kv(t('overview.counts'), t('overview.countsValue', { scenes: c.scenes.length, sources: Object.keys(c.sources).length }))}`),
    card('stream', 'overview.outputs', [
      out('stream', 'overview.stream', Boolean(o.stream), streamDetail, 'toggleStream', 'action.startStream', 'action.stopStream'),
      out('record', 'overview.record', Boolean(o.recording), recDetail, 'toggleRecording', 'action.startRecording', 'action.stopRecording'),
      out('replay', 'overview.replay', Boolean(o.replay), s.replay ? `${s.replay.seconds.toFixed(0)} s · ${(s.replay.bytes / 1048576).toFixed(1)} MB` : t('out.state.off'), 'toggleReplay', 'action.startReplay', 'action.stopReplay'),
      out('vcam', 'overview.vcam', Boolean(o.vcam), t(o.vcam ? 'out.state.live' : 'out.state.off'), 'toggleVirtualCam', 'action.startVirtualCam', 'action.stopVirtualCam'),
      st?.urls?.length ? `<button class="small-button ov-links" data-command="viewerLinks">${icon('webrtc')}<span>${esc(t('action.viewerLinks'))}</span></button>` : '',
    ].join('')),
    card('stats', 'overview.performance', [
      kv('FPS', `${s.fps} / ${Math.round(s.target)}`, s.fps < s.target * 0.9 ? 'warn' : 'ok'),
      kv(t('stats.render'), `${s.renderMs.toFixed(1)} ms`),
      kv(t('overview.dropped'), `${s.lagged + s.skipped}`, s.lagged + s.skipped ? 'warn' : ''),
      sys?.cpu != null ? kv('CPU', `${Math.round(sys.cpu)} %`) : '',
      sys?.memoryTotal ? kv(t('stats.memory'), `${(sys.appMemory / 1048576).toFixed(0)} MB`) : '',
    ].join('')),
    `<p class="ov-hint">${icon('info')}<span>${esc(t('right.nothing'))}</span></p>`,
  ].join('');
}

/** Left panel, under the sources: the usual sources one click away. */
export const QUICK_ADD = [['dshow_input', 'srcCamera'], ['monitor_capture', 'srcDisplay'], ['window_capture', 'srcWindow'], ['image_source', 'srcImage'], ['text_gdiplus', 'srcText'], ['ffmpeg_source', 'srcMedia'], ['browser_source', 'srcBrowser'], ['color_source_v3', 'srcColor']];
export function quickAddHtml(open = true) {
  return `<section class="quick-add ${open ? 'open' : ''}"><button type="button" class="quick-add-head" data-quick-toggle>${icon(open ? 'chevronDown' : 'chevronRight')}<span>${esc(t('quick.title'))}</span></button>
    ${open ? `<div class="quick-grid">${QUICK_ADD.map(([type, glyph]) => `<button type="button" class="quick-tile" data-add-source="${type}" title="${esc(t(`src.${type}`))}">${icon(glyph)}<span>${esc(t(`quick.${type}`))}</span></button>`).join('')}</div>` : ''}</section>`;
}

export function rightHtml(studio, tab, ctx) {
  const c = studio.c;
  const item = studio.selectedItems()[0] ?? null;
  const sourceId = item?.source ?? studio.selection.source ?? null;
  const source = c.sources[sourceId] ?? null;
  const scene = !source && sourceId ? M.sceneById(c, sourceId) : null;
  const tabs = `<div class="right-tabrow"><div class="seg-toggle right-tabs" role="tablist">${RIGHT_TABS.map((id) => `<button class="${tab === id ? 'active' : ''}" data-right-tab="${id}" role="tab" aria-selected="${tab === id}" title="${esc(t(`right.${id}`))}">${icon(TAB_ICONS[id])}<span>${esc(t(`right.${id}`))}</span></button>`).join('')}</div>${ctx?.collapse ?? ''}</div>`;
  if (!source && !scene) return `${tabs}<div class="right-body overview" data-overview>${overviewHtml(studio, ctx)}</div>`;
  const name = source?.name ?? scene.name;
  const type = source?.type ?? 'scene';
  const head = `<div class="right-head">${icon(SOURCE_TYPES[type]?.icon ?? 'srcScene')}<input class="text-input right-name" data-rename-source="${esc(sourceId)}" value="${esc(name)}" aria-label="${esc(t('action.renameSource'))}" /><span class="muted">${esc(t(`src.${type}`))}</span></div>`;
  let body = '';
  if (tab === 'props') body = propsBody(studio, source, scene, ctx);
  else if (tab === 'filters') body = filtersBody(studio, source ?? scene, sourceId, ctx);
  else if (tab === 'transform') body = item ? transformBody(studio, item) : `<p class="muted">${esc(t('right.selectItem'))}</p>`;
  else body = source?.audio ? audioBody(studio, source) : `<p class="muted">${esc(t('right.noAudio'))}</p>`;
  return `${tabs}${head}<div class="right-body" data-right-body="${tab}">${body}</div>`;
}

function propsBody(studio, source, scene, ctx) {
  if (scene) {
    const c = studio.c;
    const o = scene.override;
    return `<div class="prop-form"><div class="form-row"><label class="form-label">${esc(t('scene.override'))}</label><div class="form-control"><select data-scene-override="${esc(scene.id)}" data-icon="transitionGo"><option value="">${esc(t('scene.overrideNone'))}</option>${c.transitions.map((x) => `<option value="${esc(x.id)}" ${o?.transition === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
      ${o ? `<div class="form-row"><label class="form-label">${esc(t('trn.duration'))}</label><div class="form-control">${stepper(`override|${scene.id}`, o.duration ?? c.duration, 50, 20000, 50, 'ms', 'trn.duration')}</div></div>` : ''}</div>`;
  }
  const rt = studio.engine?.runtime(source.id);
  const info = rt?.info?.() ?? {};
  const status = `<div class="source-status status-${esc(info.status ?? 'idle')}">${icon(info.status === 'ready' ? 'check' : info.status === 'error' ? 'error' : 'info')}<span>${esc(t(`status.source.${info.status ?? 'idle'}`))}${info.width ? ` · ${info.width}×${info.height}` : ''}${info.label ? ` · ${esc(info.label)}` : ''}${info.error ? ` · ${esc(t(`error.source.${info.error}`, null, info.error))}` : ''}</span></div>`;
  const media = rt?.mediaState?.() ? mediaControlsHtml(source.id, rt.mediaState()) : '';
  return `${status}${media}${formHtml(SOURCE_TYPES[source.type].props, source.settings, `src:${source.id}`, ctx)}
    <div class="right-foot"><button class="small-button" data-command="resetProperties">${icon('reset')}<span>${esc(t('action.resetProperties'))}</span></button>
    <button class="small-button" data-command="sourceScreenshot">${icon('screenshot')}<span>${esc(t('action.screenshotSource'))}</span></button>
    <button class="small-button" data-command="sourceProjector">${icon('projector')}<span>${esc(t('action.sourceProjector'))}</span></button></div>`;
}

export function mediaControlsHtml(id, st) {
  const playing = st.kind === 'media' ? st.playing : !st.paused;
  const time = st.kind === 'media' ? `<span class="media-time">${formatSeconds(st.time / 1000)} / ${formatSeconds(st.duration / 1000)}</span><input type="range" min="0" max="${Math.max(1, Math.round(st.duration))}" value="${Math.round(st.time)}" data-media-seek="${esc(id)}" aria-label="${esc(t('media.seek'))}" />` : st.kind === 'slides' ? `<span class="media-time">${st.index + 1} / ${st.count}</span>` : '';
  const b = (action, glyph) => btn(`data-media="${esc(id)}" data-action="${action}"`, glyph, t(`media.${action}`));
  return `<div class="media-controls" data-media-box="${esc(id)}">${b(playing ? 'pause' : 'play', playing ? 'pause' : 'play')}${b('stop', 'stop')}${b('restart', 'restart')}${st.count > 1 || st.kind === 'slides' ? `${b('previous', 'previous')}${b('next', 'next')}` : ''}${time}${st.name ? `<span class="muted media-name">${esc(st.name)}</span>` : ''}</div>`;
}

function filtersBody(studio, holder, sourceId, ctx) {
  const type = holder.type ?? 'scene';
  const list = holder.filters ?? [];
  const chosen = list.find((f) => f.id === ctx.filter) ?? list[0] ?? null;
  const rows = list.map((f, i) => `<div class="list-row filter-row ${chosen?.id === f.id ? 'selected' : ''}" data-filter="${esc(f.id)}" title="${esc(f.name)}">
      <input type="checkbox" data-filter-enabled="${esc(f.id)}" ${f.enabled ? 'checked' : ''} title="${esc(t('filter.enabled'))}" aria-label="${esc(t('filter.enabled'))}" />
      ${icon(FILTER_TYPES[f.type]?.icon ?? 'filters')}<span class="row-name">${esc(f.name)}</span><span class="muted">${esc(t(`flt.kind.${FILTER_TYPES[f.type]?.kind}`))}</span>
      ${btn(`data-filter-move="${esc(f.id)}:-1"`, 'arrowUp', t('filter.up'), { disabled: i === 0, cls: 'icon-button tiny' })}${btn(`data-filter-move="${esc(f.id)}:1"`, 'arrowDown', t('filter.down'), { disabled: i === list.length - 1, cls: 'icon-button tiny' })}
      ${btn(`data-filter-remove="${esc(f.id)}"`, 'trash', t('filter.remove'), { cls: 'icon-button tiny danger' })}</div>`).join('');
  const kinds = type === 'scene' ? Object.keys(FILTER_TYPES).filter((k) => FILTER_TYPES[k].kind === 'video') : filtersFor(type);
  const add = `<select data-filter-add="${esc(sourceId)}" data-icon="plus" aria-label="${esc(t('filter.add'))}"><option value="">${esc(t('filter.add'))}</option>${['video', 'audio'].map((kind) => { const ids = kinds.filter((k) => FILTER_TYPES[k].kind === kind); return ids.length ? `<optgroup label="${esc(t(`flt.kind.${kind}`))}">${ids.map((k) => `<option value="${k}" data-icon="${FILTER_TYPES[k].icon}">${esc(t(`flt.${k}`))}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>`;
  const unsupported = chosen && FILTER_TYPES[chosen.type]?.unsupported ? `<p class="notice warn">${icon('warning')}<span>${esc(t(`filter.unsupported.${FILTER_TYPES[chosen.type].unsupported}`))}</span></p>` : '';
  return `<div class="filter-tools">${add}${btn('data-command="copyFilters"', 'copy', t('action.copyFilters'))}${btn('data-command="pasteFilters"', 'paste', t('action.pasteFilters'), { disabled: !studio.filterClip })}</div>
    <div class="dock-list filter-list">${rows || `<p class="muted">${esc(t('filter.none'))}</p>`}</div>
    ${chosen ? `<h4 class="sub-head">${icon(FILTER_TYPES[chosen.type]?.icon ?? 'filters')}<input class="text-input" data-filter-name="${esc(chosen.id)}" value="${esc(chosen.name)}" aria-label="${esc(t('filter.rename'))}" /></h4>${unsupported}${formHtml(FILTER_TYPES[chosen.type].props, chosen.settings, `flt:${sourceId}:${chosen.id}`, ctx)}` : ''}`;
}

function transformBody(studio, item) {
  const tr = item.transform;
  const [w, h] = studio.sizeOf(item);
  const id = esc(item.id);
  const group = Boolean(item.children);
  const sel = (key, list, value, prefix) => `<select data-transform-select="${key}" data-icon="${prefix}">${list.map((v) => `<option value="${v}" ${v === value ? 'selected' : ''}>${esc(t(`${prefix}.${v}`))}</option>`).join('')}</select>`;
  const trn = (key, ref) => `<select data-item-transition="${key}" data-icon="transitionGo"><option value="">${esc(t('item.transitionNone'))}</option>${Object.keys(TRANSITION_TYPES).filter((k) => k !== 'stinger_transition').map((k) => `<option value="${k}" ${ref?.type === k ? 'selected' : ''}>${esc(t(`trn.${k}`))}</option>`).join('')}</select>${ref ? stepper(`itemtr|${key}`, ref.duration ?? 300, 50, 20000, 50, 'ms', 'trn.duration') : ''}`;
  const row = (label, control) => `<div class="form-row"><label class="form-label">${esc(t(label))}</label><div class="form-control">${control}</div></div>`;
  const size = `${stepper('tf|w', round(Math.abs(w * tr.sx) - 0, 1), 1, 100000, 1, 'px', 'transform.width')}${stepper('tf|h', round(Math.abs(h * tr.sy), 1), 1, 100000, 1, 'px', 'transform.height')}`;
  return `<div class="prop-form transform-form" data-transform="${id}">
    ${row('transform.position', `${stepper('tf|x', round(tr.x, 1), -100000, 100000, 1, 'px', 'transform.x')}${stepper('tf|y', round(tr.y, 1), -100000, 100000, 1, 'px', 'transform.y')}`)}
    ${row('transform.rotation', stepper('tf|rot', round(tr.rot, 2), 0, 360, 1, '°', 'transform.rotation'))}
    ${row('transform.size', size)}
    ${row('transform.scale', `${stepper('tf|sx', round(tr.sx, 3), -100, 100, 0.01, '', 'transform.scaleX')}${stepper('tf|sy', round(tr.sy, 3), -100, 100, 0.01, '', 'transform.scaleY')}`)}
    ${group ? '' : row('transform.align', sel('align', ALIGNMENTS, tr.align, 'align'))}
    ${group ? '' : row('transform.boundsType', sel('bounds.type', BOUNDS_TYPES, tr.bounds.type, 'bounds'))}
    ${group || tr.bounds.type === 'none' ? '' : `${row('transform.boundsSize', `${stepper('tf|bounds.w', round(tr.bounds.w, 1), 1, 100000, 1, 'px', 'transform.boundsW')}${stepper('tf|bounds.h', round(tr.bounds.h, 1), 1, 100000, 1, 'px', 'transform.boundsH')}`)}${row('transform.boundsAlign', sel('bounds.align', ALIGNMENTS, tr.bounds.align, 'align'))}<div class="form-row wide"><label class="check-row"><input type="checkbox" data-transform-check="bounds.crop" ${tr.bounds.crop ? 'checked' : ''} /><span>${esc(t('transform.boundsCrop'))}</span></label></div>`}
    ${group ? '' : row('transform.crop', `<div class="crop-grid">${['l', 't', 'r', 'b'].map((k) => stepper(`tf|crop.${k}`, tr.crop[k], 0, 100000, 1, 'px', `transform.crop.${k}`)).join('')}</div>`)}
    ${row('transform.blend', sel('blend', BLEND_MODES, item.blend, 'blend'))}
    ${row('transform.scaleFilter', sel('scaleFilter', SCALE_FILTERS, item.scaleFilter, 'scaleFilter'))}
    ${row('item.showTransition', trn('show', item.show))}
    ${row('item.hideTransition', trn('hide', item.hide))}
    <div class="transform-buttons">${[['fit', 'fitScreen'], ['stretch', 'stretchScreen'], ['center', 'centerScreen'], ['flipH', 'flipH'], ['flipV', 'flipV'], ['rotCW', 'rotateCw'], ['rotCCW', 'rotateCcw'], ['reset', 'reset']].map(([cmd, glyph]) => `<button class="small-button" data-transform-cmd="${cmd}" title="${esc(t(`transform.cmd.${cmd}`))}">${icon(glyph)}<span>${esc(t(`transform.cmd.${cmd}`))}</span></button>`).join('')}</div></div>`;
}

function audioBody(studio, source) {
  const a = source.audio;
  const id = esc(source.id);
  const db = a.volume > 0 ? round(mulToDb(a.volume), 1) : -100;
  const row = (label, control) => `<div class="form-row"><label class="form-label">${esc(t(label))}</label><div class="form-control">${control}</div></div>`;
  return `<div class="prop-form audio-form" data-audio-form="${id}">
    ${row('audio.volume', stepper(`aud|${source.id}|db`, db, -100, 26, 0.1, 'dB', 'audio.volume'))}
    <div class="form-row wide"><label class="check-row"><input type="checkbox" data-audio-check="${id}|muted" ${a.muted ? 'checked' : ''} /><span>${esc(t('audio.mute'))}</span></label><label class="check-row"><input type="checkbox" data-audio-check="${id}|mono" ${a.mono ? 'checked' : ''} /><span>${esc(t('audio.mono'))}</span></label></div>
    ${row('audio.balance', `<span class="slider-row"><button type="button" class="slider-step" data-slider-step="-1">−</button><input type="range" min="0" max="1" step="0.01" value="${a.balance}" data-audio-range="${id}|balance" aria-label="${esc(t('audio.balance'))}" /><button type="button" class="slider-step" data-slider-step="1">+</button><output>${Math.round((a.balance - 0.5) * 200)}</output></span>`)}
    ${row('audio.sync', stepper(`aud|${source.id}|sync`, a.sync, -950, 20000, 10, 'ms', 'audio.sync'))}
    ${row('audio.monitor', `<select data-audio-select="${id}|monitor" data-icon="headphones">${['off', 'monitorOnly', 'both'].map((v) => `<option value="${v}" ${a.monitor === v ? 'selected' : ''}>${esc(t(`audio.monitor.${v}`))}</option>`).join('')}</select>`)}
    ${row('audio.tracks', `<span class="tracks">${a.tracks.map((on, i) => `<label class="track-box" title="${esc(t('audio.trackN', { n: i + 1 }))}"><input type="checkbox" data-audio-track="${id}|${i}" ${on ? 'checked' : ''} /><span>${i + 1}</span></label>`).join('')}</span>`)}
    <div class="form-row wide"><label class="check-row"><input type="checkbox" data-audio-check="${id}|ptt.enabled" ${a.ptt.enabled ? 'checked' : ''} /><span>${esc(t('audio.ptt'))}</span></label>${a.ptt.enabled ? stepper(`aud|${source.id}|ptt.delay`, a.ptt.delay, 0, 5000, 10, 'ms', 'audio.pttDelay') : ''}</div>
    <div class="form-row wide"><label class="check-row"><input type="checkbox" data-audio-check="${id}|ptm.enabled" ${a.ptm.enabled ? 'checked' : ''} /><span>${esc(t('audio.ptm'))}</span></label>${a.ptm.enabled ? stepper(`aud|${source.id}|ptm.delay`, a.ptm.delay, 0, 5000, 10, 'ms', 'audio.ptmDelay') : ''}</div>
    <p class="muted">${icon('keyboard')}<span>${esc(t('audio.pttHint'))}</span></p></div>`;
}

// ───────────────────────── bottom docks

export const BOTTOM_TABS = ['mixer', 'transitions', 'controls', 'media', 'stats', 'messages', 'problems'];
export const BOTTOM_ICONS = { mixer: 'mixer', transitions: 'transitionGo', controls: 'controls', media: 'play', stats: 'stats', messages: 'info', problems: 'warning' };

export function mixerHtml(studio, settings) {
  const c = studio.c;
  const shown = Object.values(c.sources).filter((s) => s.audio && SOURCE_TYPES[s.type]?.audio && s.type !== 'group' && (!s.audio.hidden || settings.mixerShowHidden));
  const active = studio.engine?.audibleProgram ?? new Set();
  const vertical = settings.mixerLayout === 'vertical';
  const strips = shown.map((s) => {
    const a = s.audio;
    const db = a.volume > 0 ? mulToDb(a.volume) : -Infinity;
    const live = active.has(s.id) || s.global;
    return `<div class="mixer-strip ${a.muted ? 'muted' : ''} ${live ? '' : 'inactive'}" data-strip="${esc(s.id)}" title="${esc(s.name)}">
      <div class="strip-head">${icon(SOURCE_TYPES[s.type].icon)}<span class="row-name">${esc(s.name)}</span>${s.global ? `<span class="tag">${esc(t('audio.globalTag'))}</span>` : ''}<span class="grow"></span><span class="strip-db" data-strip-db="${esc(s.id)}">${Number.isFinite(db) ? `${db.toFixed(1)} dB` : '-∞ dB'}</span></div>
      <div class="meter" data-meter="${esc(s.id)}"><div class="meter-ch"><i class="meter-fill"></i><i class="meter-peak"></i></div><div class="meter-ch"><i class="meter-fill"></i><i class="meter-peak"></i></div><div class="meter-scale">${[-60, -50, -40, -30, -20, -10, -5, 0].map((d) => `<span style="--pos:${(d + 60) / 60}">${d}</span>`).join('')}</div></div>
      <div class="strip-controls"><span class="slider-row fader"><button type="button" class="slider-step" data-slider-step="-1" title="${esc(t('audio.volumeDown'))}">−</button><input type="range" min="0" max="1" step="0.001" value="${mulToFader(a.volume)}" data-fader="${esc(s.id)}" aria-label="${esc(t('audio.volume'))}" /><button type="button" class="slider-step" data-slider-step="1" title="${esc(t('audio.volumeUp'))}">+</button></span>
        <button class="icon-button ${a.muted ? 'active danger' : ''}" data-mute="${esc(s.id)}" aria-pressed="${a.muted}" title="${esc(t(a.muted ? 'audio.unmute' : 'audio.mute'))}">${icon(a.muted ? 'muted' : 'volume')}</button>
        <button class="icon-button ${a.monitor !== 'off' ? 'active' : ''}" data-monitor="${esc(s.id)}" title="${esc(t(`audio.monitor.${a.monitor}`))}">${icon('headphones')}</button>
        <button class="icon-button" data-strip-menu="${esc(s.id)}" title="${esc(t('audio.menu'))}">${icon('gear')}</button></div></div>`;
  }).join('');
  return `<div class="mixer ${vertical ? 'vertical' : 'horizontal'}">${strips || `<p class="dock-empty">${icon('info')}<span>${esc(t('audio.noSources'))}</span></p>`}</div>`;
}

/** Level bars, peak holds and dB text, every frame (no re-render). Decay as Settings › Audio says. */
export function updateMeters(root, studio, settings, state) {
  const mixer = studio.mixer;
  if (!mixer?.ctx) return;
  const decay = { fast: 23.53, medium: 11.76, slow: 8.57 }[studio.profile.audio.meterDecay] ?? 23.53; // dB per second
  const now = performance.now();
  const dt = Math.min(0.2, (now - (state.last ?? now)) / 1000);
  state.last = now;
  state.levels ??= new Map();
  for (const el of root.querySelectorAll('[data-meter]')) {
    const id = el.dataset.meter;
    const m = mixer.meter(id);
    const prev = state.levels.get(id) ?? { lvl: [-60, -60], peak: [-60, -60], held: [0, 0] };
    const chans = el.querySelectorAll('.meter-ch');
    for (let ch = 0; ch < 2; ch++) {
      const level = Math.max(-60, Math.min(0, m?.peak[ch] ?? -60));
      prev.lvl[ch] = level >= prev.lvl[ch] ? level : Math.max(level, prev.lvl[ch] - decay * dt);
      if (level >= prev.peak[ch]) { prev.peak[ch] = level; prev.held[ch] = now; } else if (now - prev.held[ch] > 1500) prev.peak[ch] = Math.max(level, prev.peak[ch] - 20 * dt);
      const box = chans[ch];
      if (!box) continue;
      box.style.setProperty('--level', String((prev.lvl[ch] + 60) / 60));
      box.style.setProperty('--peak', String((prev.peak[ch] + 60) / 60));
      box.classList.toggle('clip', prev.peak[ch] >= -0.5);
    }
    state.levels.set(id, prev);
  }
  void settings;
}

export function transitionsHtml(studio) {
  const c = studio.c;
  const cur = M.transitionById(c, c.transition);
  const props = cur && TRANSITION_TYPES[cur.type].props.length ? formHtml(TRANSITION_TYPES[cur.type].props, cur.settings, `trn:${cur.id}`, {}) : `<p class="muted">${esc(t('trn.noProperties'))}</p>`;
  return `<div class="transitions-dock">
    <div class="form-row"><label class="form-label">${esc(t('trn.current'))}</label><div class="form-control"><select data-transition-select data-icon="transitionGo">${c.transitions.map((x) => `<option value="${esc(x.id)}" data-icon="${TRANSITION_TYPES[x.type].icon}" ${x.id === c.transition ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      ${btn('data-command="addTransitionMenu"', 'plus', t('trn.add'))}${btn('data-command="removeTransition"', 'minus', t('trn.remove'), { disabled: !cur || (TRANSITION_TYPES[cur.type].fixed && c.transitions.filter((x) => x.type === cur.type).length === 1) })}${btn('data-command="renameTransition"', 'rename', t('trn.rename'))}</div></div>
    <div class="form-row"><label class="form-label">${esc(t('trn.duration'))}</label><div class="form-control">${stepper('duration|', c.duration, 50, 20000, 50, 'ms', 'trn.duration')}</div></div>
    ${cur?.type === 'cut_transition' ? '' : props}</div>`;
}

export function controlsHtml(studio) {
  const o = studio.outputs;
  const s = studio.stats();
  const b = (command, glyph, label, { on = false, cls = '' } = {}) => `<button class="button control-button ${on ? 'on' : ''} ${cls}" data-command="${command}" aria-pressed="${on}" title="${esc(label)}">${icon(glyph)}<span>${esc(label)}</span></button>`;
  return `<div class="controls-dock">
    ${b('toggleStream', o.stream ? 'streamStop' : 'stream', t(o.stream ? 'action.stopStream' : 'action.startStream'), { on: Boolean(o.stream), cls: 'live' })}
    ${b('toggleRecording', o.recording ? 'recordStop' : 'record', t(o.recording ? 'action.stopRecording' : 'action.startRecording'), { on: Boolean(o.recording), cls: 'rec' })}
    ${o.recording ? b('togglePause', o.recording.paused ? 'play' : 'pause', t(o.recording.paused ? 'action.unpauseRecording' : 'action.pauseRecording'), { on: o.recording.paused }) + b('splitRecording', 'split', t('action.splitRecording')) + b('addChapter', 'chapter', t('action.addChapter')) : ''}
    ${b('toggleReplay', 'replay', t(o.replay ? 'action.stopReplay' : 'action.startReplay'), { on: Boolean(o.replay) })}${o.replay ? b('saveReplay', 'replaySave', t('action.saveReplay')) : ''}
    ${b('toggleVirtualCam', 'vcam', t(o.vcam ? 'action.stopVirtualCam' : 'action.startVirtualCam'), { on: o.vcam })}
    ${b('toggleStudio', 'studio', t('action.studioMode'), { on: studio.studioMode })}
    ${b('settings', 'gear', t('action.settings'))}
    <div class="controls-info"><span>${icon('stream')}${s.stream ? formatSeconds(s.stream.seconds) : '00:00:00'}</span><span>${icon('record')}${s.recording ? formatSeconds(s.recording.seconds) : '00:00:00'}</span></div></div>`;
}

export function mediaDockHtml(studio) {
  const c = studio.c;
  const list = Object.values(c.sources).filter((s) => SOURCE_TYPES[s.type]?.media || s.type === 'slideshow' || (s.type === 'text_gdiplus' && ['countdown', 'stopwatch'].includes(s.settings.text_mode)));
  if (!list.length) return `<p class="dock-empty">${icon('info')}<span>${esc(t('media.none'))}</span></p>`;
  return `<div class="media-dock">${list.map((s) => { const st = studio.engine?.runtime(s.id)?.mediaState?.(); return `<div class="media-row">${icon(SOURCE_TYPES[s.type].icon)}<b>${esc(s.name)}</b>${st ? mediaControlsHtml(s.id, st) : `<span class="muted">${esc(t('media.notReady'))}</span>`}</div>`; }).join('')}</div>`;
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
export function statsRows(studio, sys) {
  const s = studio.stats();
  const rows = [
    ['stats.fps', `${s.fps} / ${round(s.target, 2)}`],
    ['stats.render', `${s.renderMs.toFixed(2)} ms`],
    ['stats.lagged', `${s.lagged} / ${s.frames} (${s.frames ? ((s.lagged / s.frames) * 100).toFixed(1) : '0.0'}%)`],
    ['stats.skipped', `${s.skipped} / ${s.encoded + s.skipped} (${s.encoded + s.skipped ? ((s.skipped / (s.encoded + s.skipped)) * 100).toFixed(1) : '0.0'}%)`],
    ['stats.cpu', sys?.cpu != null ? `${sys.cpu.toFixed(1)}% (${t('stats.app')} ${sys.appCpu?.toFixed(1) ?? '—'}%)` : '—'],
    ['stats.memory', sys?.memoryTotal ? `${mb(sys.appMemory)} · ${mb(sys.memoryUsed)} / ${mb(sys.memoryTotal)}` : '—'],
    ['stats.disk', sys?.diskTotal ? `${(sys.diskFree / 1073741824).toFixed(1)} GB / ${(sys.diskTotal / 1073741824).toFixed(0)} GB` : '—'],
    ['stats.stream', s.stream ? `${t(`out.state.${s.stream.state}`)} · ${Math.round(s.stream.kbps)} kb/s · ${mb(s.stream.bytes)} · ${t('stats.dropped')} ${s.stream.dropped}` : t('out.state.off')],
    ...(s.stream?.viewers != null ? [['stats.viewers', String(s.stream.viewers)]] : []),
    ['stats.recording', s.recording ? `${t(`out.state.${s.recording.state}`)} · ${formatSeconds(s.recording.seconds)} · ${mb(s.recording.bytes)}` : t('out.state.off')],
    ['stats.replay', s.replay ? `${s.replay.seconds.toFixed(1)} s · ${mb(s.replay.bytes)}` : t('out.state.off')],
    ['stats.vcam', t(s.vcam ? 'out.state.live' : 'out.state.off')],
  ];
  return rows;
}
export function statsHtml(studio, sys) {
  return `<div class="stats-dock"><div class="stats-table">${statsRows(studio, sys).map(([k, v]) => `<div class="stats-row"><span class="muted">${esc(t(k))}</span><b>${esc(v)}</b></div>`).join('')}</div>
    <div class="stats-tools"><button class="small-button" data-command="resetStats">${icon('reset')}<span>${esc(t('action.resetStats'))}</span></button><button class="small-button" data-command="statsWindow">${icon('stats')}<span>${esc(t('action.statsWindow'))}</span></button></div></div>`;
}

export function messagesHtml(lines, filter = 'all') {
  const shown = lines.filter((l) => filter === 'all' || l.level === filter).slice(-400).reverse();
  return `<div class="log-tools"><select data-log-filter data-icon="filter">${['all', 'info', 'warning', 'error', 'ffmpeg'].map((v) => `<option value="${v}" ${v === filter ? 'selected' : ''}>${esc(t(`log.${v}`))}</option>`).join('')}</select><span class="grow"></span>
    <button class="small-button" data-command="copyLog">${icon('copy')}<span>${esc(t('action.copyLog'))}</span></button><button class="small-button" data-command="saveLog">${icon('save')}<span>${esc(t('action.saveLog'))}</span></button><button class="small-button danger" data-command="clearLog">${icon('clearHistory')}<span>${esc(t('action.clearLog'))}</span></button></div>
    <div class="problems-list log-list">${shown.map((l) => `<div class="problem-row bottom-row log-row ${l.level}"><span class="cell sev">${icon(l.level === 'error' ? 'error' : l.level === 'warning' ? 'warning' : l.level === 'ffmpeg' ? 'terminal' : 'info')}</span><span class="cell">${esc(l.text)}</span><span class="cell muted">${esc(l.at.toLocaleTimeString(getLanguage() === 'ko' ? 'ko-KR' : 'en-US'))}</span></div>`).join('') || `<p class="problems-empty">${icon('info')}<span>${esc(t('log.empty'))}</span></p>`}</div>`;
}

export function problemsHtml(problems) {
  return `<div class="problems-list">${problems.map((p, i) => `<div class="problem-row bottom-row sev-${p.severity} link" data-problem="${i}"><span class="cell sev">${icon(p.severity === 'error' ? 'error' : p.severity === 'warning' ? 'warning' : 'info')}</span><span class="cell">${esc(t(`problem.${p.kind}`, p.params))}</span><span class="cell muted">${esc(t(`problems.sev.${p.severity}`))}</span></div>`).join('') || `<p class="problems-empty">${icon('check')}<span>${esc(t('bottom.noProblems'))}</span></p>`}</div>`;
}

/** The feature list (Help › Features): what the program does and how each part works on this platform. */
export function featuresTableHtml() {
  const lang = getLanguage();
  return FEATURES.map((f) => `<tr><td><code>${esc(f.id)}</code></td><td>${esc(lang === 'ko' ? f.ko : f.en)}</td><td>${esc(t(`feature.status.${f.status}`))}</td></tr>`).join('');
}

export { faderToMul };
