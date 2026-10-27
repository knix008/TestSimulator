/**
 * Settings › Prompt — the terminal prompt theme editor (ported from Command
 * Center's PromptEditor).
 *
 *   Pane "prompt" (presets):
 *     1. Preview of the current prompt (three sample states).
 *     2. Presets: a card per preset, drawn with the real renderer; click = apply.
 *     3. Custom prompts: save the current one, rename / re-save / delete.
 *     4. Quick options: which segments to show, shape, path style, two lines,
 *        git display mode, the git state colours.
 *   Pane "promptEdit" (advanced):
 *     1. The same preview.
 *     2. Master–detail editor — the segment list on the left, the selected
 *        segment's fields on the right.
 *
 * Every change calls onChange({ config, gitMode, presetId, customPrompts });
 * the settings dialog applies it right away. Both panes keep a fixed layout
 * (fixed preview slots, fixed editor height) so the settings window can keep
 * a fixed size without scrollbars.
 */
import {
  PRESETS,
  SEGMENT_TYPES,
  SEGMENT_STYLES,
  GIT_STATE_NAMES,
  GIT_STATE_COLORS,
  normalizePromptGitMode,
  normalizePrompt,
  clonePrompt,
  defaultTemplate,
  presetConfig,
  isPromptModified,
  normalizeCustomPrompts,
  customPromptsAsPresets,
  newCustomPromptId,
  renderPromptHtml,
  applyGitMode,
  sampleStatesFor,
} from '../../shared/prompt-core.js';

import { enhanceNumberInputs } from './num-field.js';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PATH_STYLES = ['full', 'folder', 'agnoster', 'agnoster_full', 'agnoster_short', 'agnoster_left', 'letter', 'mixed', 'unique'];
// Order and default colours of the segments the simple switches can add.
const QUICK = [
  ['os', '#0077c2', '#ffffff'],
  ['session', '#c386f1', '#ffffff'],
  ['shell', '#5c6bc0', '#ffffff'],
  ['path', '#ff479c', '#ffffff'],
  ['git', 'auto', '#1b1e24'],
  ['executiontime', '#83769c', '#ffffff'],
  ['status', '#00897b', '#ffffff'],
  ['time', '#2e9599', '#ffffff'],
];
const QUICK_ORDER = QUICK.map((q) => q[0]);
const COLOR_NAMES = ['accent', 'foreground', 'background', 'auto', 'transparent', 'parentBackground'];
const PREVIEW_KINDS = ['clean', 'dirty', 'plain'];

function options(items, selected) {
  return items
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

/** colour picker + free text (names work too) */
function colorFieldHtml(name, value) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#888888';
  return `<span class="pe-color" data-pe-color="${name}">
    <input type="color" value="${hex}" data-pe-color-pick="${name}" />
    <input class="mono" value="${escapeHtml(value || '')}" data-pe-color-text="${name}" spellcheck="false" list="pe-color-names" />
  </span>`;
}

export function createPromptEditor({ i18n, theme, font = null, platform = 'win32', config, gitMode = 'status', customPrompts = [], onChange }) {
  let cfg = normalizePrompt(config);
  let mode = normalizePromptGitMode(gitMode);
  let custom = normalizeCustomPrompts(customPrompts);
  let sel = { b: 0, s: 0 };
  let note = '';
  const samples = sampleStatesFor(platform);
  const lang = i18n.lang === 'ko' ? 'ko' : 'en';

  const t = (key, fallback) => i18n.t(`prompt.${key}`, fallback ?? key);
  const fmt = (key, vars) => Object.entries(vars || {}).reduce((s, [k, v]) => s.replace(`{${k}}`, v), t(key));
  const presets = () => ({ ...PRESETS, ...customPromptsAsPresets(custom) });
  const presetLabel = (id) => {
    const p = presets()[id];
    return p ? (lang === 'ko' ? p.label : p.labelEn) : '';
  };
  const customCurrent = () => custom.find((c) => c.id === cfg.preset) || null;
  const modified = () => isPromptModified(cfg, presets());
  const currentPresetId = () => (cfg.preset && presets()[cfg.preset] && !modified() ? cfg.preset : '');
  const allSegs = () => cfg.blocks.flatMap((b) => b.segments);
  const styleOf = () => {
    const s = allSegs().find((x) => x.type !== 'text');
    return s ? s.style : 'powerline';
  };
  const typeLabel = (type) => t(`types.${type}`, type);

  /* ---------------------------------------------------------------- */
  /* Rendering                                                        */
  /* ---------------------------------------------------------------- */

  function previewHtml() {
    return PREVIEW_KINDS.map(
      (kind) => `<div class="pe-preview-line">${renderPromptHtml(cfg, applyGitMode(samples[kind], mode), theme)}<span class="pe-preview-label">${escapeHtml(
        t(`samples.${kind}`)
      )}</span></div>`
    ).join('');
  }

  // The preview uses the terminal's own font and cell height, so arrows and
  // diamonds (one cell wide, full cell height) look exactly as in the terminal.
  const fontStyle = font?.family
    ? `font-family:${escapeHtml(font.family)};font-size:${Number(font.size) || 14}px;`
    : '';
  const previewSection = () => `
    <div class="settings-section">
      <h3 class="settings-section-title">${t('previewLabel', 'Preview')} <span class="settings-sub">${t('preview', '')}</span></h3>
      <pre class="term-out pe-preview-out" data-pe-preview style="${fontStyle}background:${escapeHtml(theme.bg)};color:${escapeHtml(
        theme.fg
      )}"></pre>
    </div>`;

  function presetCardsHtml() {
    return Object.entries(PRESETS)
      .map(
        ([id, p]) => `
      <button type="button" class="pe-preset" data-pe-preset="${escapeHtml(id)}" title="${escapeHtml(lang === 'ko' ? p.label : p.labelEn)}">
        <pre class="term-out pe-preset-out" style="background:${escapeHtml(theme.bg)};color:${escapeHtml(theme.fg)}">${renderPromptHtml(
          p.config,
          samples.mini,
          theme
        )}</pre>
        <span class="pe-preset-name ellipsis">${escapeHtml(lang === 'ko' ? p.label : p.labelEn)}</span>
      </button>`
      )
      .join('');
  }

  const customOptionsHtml = () =>
    `<option value="">${escapeHtml(t('customNone', '(saved prompts)'))}</option>` +
    custom.map((c) => `<option value="${escapeHtml(c.id)}"${cfg.preset === c.id ? ' selected' : ''}>★ ${escapeHtml(c.label)}</option>`).join('');

  // ---- pane 1: presets + quick options ----
  const presetsPane = document.createElement('div');
  presetsPane.className = 'prompt-editor pe-pane';
  presetsPane.innerHTML = `
    <datalist id="pe-color-names">${COLOR_NAMES.map((x) => `<option value="${x}"></option>`).join('')}</datalist>
    ${previewSection()}
    <div class="settings-section">
      <h3 class="settings-section-title">${t('presets', 'Presets')} <span class="settings-sub" data-pe-current></span></h3>
      <div class="pe-presets">${presetCardsHtml()}</div>
    </div>
    <div class="settings-section">
      <div class="pe-quick pe-custom-row">
        <span class="muted small">${t('customPrompts', 'Custom prompts:')}</span>
        <select class="settings-select pe-custom-select" data-pe-custom-select>${customOptionsHtml()}</select>
        <input class="settings-text pe-custom-name" data-pe-custom-name maxlength="40" spellcheck="false" placeholder="${escapeHtml(
          t('customName', 'Name')
        )}" />
        <button type="button" class="modal-btn pe-btn" data-pe-custom-save>＋ ${t('saveCustom', 'Save the current prompt')}</button>
        <button type="button" class="modal-btn pe-btn" data-pe-custom-update title="${escapeHtml(t('updateCustomTip', ''))}">${t(
          'updateCustom',
          'Save changes'
        )}</button>
        <button type="button" class="modal-btn pe-btn" data-pe-custom-delete>✕ ${t('deleteCustom', 'Delete')}</button>
      </div>
      <p class="settings-hint pe-hint-line" data-pe-custom-hint>${escapeHtml(t('customHint', ''))}</p>
    </div>
    <div class="settings-section">
      <h3 class="settings-section-title">${t('customize', 'Quick options')}</h3>
      <div class="pe-quick">
        <span class="muted small">${t('show', 'Show:')}</span>
        ${QUICK_ORDER.map(
          (ty) => `<label class="settings-check pe-check"><input type="checkbox" data-pe-show="${ty}" /><span>${typeLabel(ty)}</span></label>`
        ).join('')}
      </div>
      <div class="pe-quick">
        <span class="muted small">${t('shape', 'Shape:')}</span>
        <select class="settings-select" data-pe-shape>${options(
          SEGMENT_STYLES.map((x) => [x, t(`styles.${x}`, x)]),
          'powerline'
        )}</select>
        <span class="muted small">${t('pathStyle', 'Path style')}</span>
        <select class="settings-select" data-pe-path-style>${options(
          [
            ['full', t('pathFull')],
            ['folder', t('pathFolder')],
            ['agnoster_short', t('pathShort')],
            ['agnoster', t('pathAgnoster')],
          ],
          'full'
        )}</select>
        <label class="settings-check pe-check"><input type="checkbox" data-pe-two-lines /><span>${t('twoLines', 'Two lines')}</span></label>
        <span class="muted small">${t('gitMode', 'Git status')}</span>
        <select class="settings-select" data-pe-git-mode>${options(
          [
            ['off', t('gitModes.off')],
            ['branch', t('gitModes.branch')],
            ['status', t('gitModes.status')],
          ],
          mode
        )}</select>
      </div>
      <div class="pe-quick pe-gitcolors">
        <label class="settings-check pe-check" title="${escapeHtml(t('gitColorsTip', ''))}"><input type="checkbox" data-pe-git-colors /><span>${t(
          'gitColors',
          'git state colours:'
        )}</span></label>
        ${GIT_STATE_NAMES.map(
          (k) => `<label class="pe-gitcolor" title="${escapeHtml(t(`gitStates.${k}`, k))}">
            <input type="color" data-pe-gitcolor="${k}" /><span data-pe-gitcolor-label="${k}">${escapeHtml(t(`gitStates.${k}`, k))}</span>
          </label>`
        ).join('')}
        <button type="button" class="modal-btn pe-btn" data-pe-gitcolors-reset>${t('gitColorsReset', 'Defaults')}</button>
      </div>
      <p class="settings-hint pe-hint-line">${escapeHtml(t('hint', ''))}</p>
    </div>`;

  // ---- pane 2: advanced (master–detail) ----
  const editPane = document.createElement('div');
  editPane.className = 'prompt-editor pe-pane';
  editPane.innerHTML = `
    ${previewSection()}
    <div class="settings-section">
      <h3 class="settings-section-title">${t('advanced', 'Advanced')} <span class="settings-sub">${escapeHtml(t('advancedHint', ''))}</span></h3>
      <div class="pe-advanced">
        <div class="pe-list">
          <div class="pe-list-rows" data-pe-rows></div>
          <div class="pe-list-tools">
            <select class="settings-select" data-pe-add>
              <option value="">${escapeHtml(t('addSegment', '+ Add segment…'))}</option>
              ${options(SEGMENT_TYPES.map((x) => [x, typeLabel(x)]), '')}
            </select>
            <button type="button" class="modal-btn pe-icon-btn" data-pe-up title="${escapeHtml(t('up', 'Up'))}">▲</button>
            <button type="button" class="modal-btn pe-icon-btn" data-pe-down title="${escapeHtml(t('down', 'Down'))}">▼</button>
            <button type="button" class="modal-btn pe-icon-btn" data-pe-remove title="${escapeHtml(t('remove', 'Remove segment'))}">✕</button>
            <button type="button" class="modal-btn pe-icon-btn" data-pe-add-block title="${escapeHtml(t('addBlock', 'Add block (line)'))}">＋</button>
          </div>
        </div>
        <div class="pe-detail" data-pe-detail></div>
      </div>
      <div class="pe-note muted small ellipsis" data-pe-note>&nbsp;</div>
    </div>`;

  const q = (root, selector) => root.querySelector(selector);
  const qa = (root, selector) => [...root.querySelectorAll(selector)];

  /* ---- detail fields (the right-hand side of the advanced editor) ---- */

  function detailHtml(s) {
    if (!s) return `<div class="muted small pe-select-hint">${escapeHtml(t('selectHint', 'Pick a segment in the list on the left.'))}</div>`;
    const p = s.properties || {};
    const lines = (arr) => (Array.isArray(arr) ? arr.join('\n') : '');
    const isPath = s.type === 'path';
    const isGit = s.type === 'git';
    const isStatus = s.type === 'status';
    const isExec = s.type === 'executiontime';
    const isOs = s.type === 'os';
    const isDiamond = s.style === 'diamond';
    return `
      <div class="pe-fields form-grid">
        <label>${t('type', 'Type')}</label>
        <div class="pe-row">
          <select class="settings-select" data-pe-f="type">${options(SEGMENT_TYPES.map((x) => [x, typeLabel(x)]), s.type)}</select>
          <select class="settings-select" data-pe-f="style">${options(SEGMENT_STYLES.map((x) => [x, t(`styles.${x}`, x)]), s.style)}</select>
          <label class="settings-check pe-check"><input type="checkbox" data-pe-f="enabled" ${s.enabled !== false ? 'checked' : ''} /><span>${t(
            'enabled',
            'Shown'
          )}</span></label>
        </div>
        <label>${t('colors', 'Text / background')}</label>
        <div class="pe-row">${colorFieldHtml('foreground', s.foreground)}${colorFieldHtml('background', s.background)}</div>
        <label>${t('template', 'Template')}</label>
        <textarea class="mono" rows="1" data-pe-f="template" spellcheck="false">${escapeHtml(s.template)}</textarea>
        <label>${t('bgTemplates', 'Background templates')}</label>
        <textarea class="mono" rows="1" data-pe-f="background_templates" spellcheck="false" title="${escapeHtml(
          t('bgTemplatesHint', 'one per line, first match wins')
        )}" placeholder="{{ if .Working.Changed }}#ff9248{{ end }}">${escapeHtml(
          lines(s.background_templates)
        )}</textarea>
        <label class="pe-type-label">${
          isPath ? t('pathStyle') : isGit ? t('branchIcon') : isExec ? t('threshold') : isOs ? t('osIcons') : isStatus ? '' : ' '
        }</label>
        <div class="pe-row pe-type-row">
          <select class="settings-select" data-pe-p="style" ${isPath ? '' : 'hidden'}>${options(PATH_STYLES.map((x) => [x, x]), p.style || 'full')}</select>
          <span class="muted small" ${isPath ? '' : 'hidden'}>${t('maxDepth', 'Max depth')}</span>
          <input type="number" min="1" max="20" class="settings-number pe-num" data-pe-p="max_depth" value="${p.max_depth || 1}" ${isPath ? '' : 'hidden'} />
          <span class="muted small" ${isPath ? '' : 'hidden'}>${t('folderSep', 'Folder separator')}</span>
          <input class="settings-text mono pe-short" data-pe-p="folder_separator_icon" value="${escapeHtml(
            p.folder_separator_icon === undefined ? '' : p.folder_separator_icon
          )}" placeholder="${escapeHtml(t('folderSepHint', ''))}" ${isPath ? '' : 'hidden'} />
          <input class="settings-text mono pe-short" data-pe-p="branch_icon" value="${escapeHtml(p.branch_icon === undefined ? '⎇ ' : p.branch_icon)}" ${
            isGit ? '' : 'hidden'
          } />
          <label class="settings-check pe-check" ${isStatus ? '' : 'hidden'}><input type="checkbox" data-pe-p-bool="always_enabled" ${
            p.always_enabled ? 'checked' : ''
          } /><span>${t('alwaysEnabled', 'Show on success (0) too')}</span></label>
          <input type="number" min="0" class="settings-number pe-num" data-pe-p="threshold" value="${p.threshold === undefined ? 500 : p.threshold}" ${
            isExec ? '' : 'hidden'
          } />
          <input class="settings-text mono pe-short" data-pe-p="windows" placeholder="windows" value="${escapeHtml(p.windows || '')}" ${isOs ? '' : 'hidden'} />
          <input class="settings-text mono pe-short" data-pe-p="macos" placeholder="macos" value="${escapeHtml(p.macos || '')}" ${isOs ? '' : 'hidden'} />
          <input class="settings-text mono pe-short" data-pe-p="linux" placeholder="linux" value="${escapeHtml(p.linux || '')}" ${isOs ? '' : 'hidden'} />
        </div>
        <label>${isDiamond ? t('diamonds', 'Leading / trailing') : ' '}</label>
        <div class="pe-row">
          <input class="settings-text mono pe-short" data-pe-f="leading_diamond" value="${escapeHtml(s.leading_diamond || '')}" ${isDiamond ? '' : 'hidden'} />
          <input class="settings-text mono pe-short" data-pe-f="trailing_diamond" value="${escapeHtml(s.trailing_diamond || '')}" ${isDiamond ? '' : 'hidden'} />
        </div>
        <span></span>
        <span class="muted small pe-vars" title="${escapeHtml(t(`vars.${s.type}`, ''))}">${escapeHtml(t(`vars.${s.type}`, ''))}</span>
      </div>`;
  }

  function rowsHtml() {
    const swatch = (s) => (s.background && s.background !== 'transparent' && /^#/.test(s.background) ? s.background : 'var(--button-hover)');
    return cfg.blocks
      .map(
        (b, bi) => `
        <div class="pe-list-block">
          <span>${escapeHtml(fmt('block', { n: bi + 1 }))}</span>
          ${bi > 0 ? `<button type="button" class="pe-x" data-pe-remove-block="${bi}" title="${escapeHtml(t('removeBlock', 'Remove block'))}">✕</button>` : ''}
        </div>
        ${b.segments
          .map(
            (sg, si) => `
          <button type="button" class="pe-list-row${sel.b === bi && sel.s === si ? ' active' : ''}${sg.enabled === false ? ' off' : ''}" data-pe-row="${bi}:${si}">
            <span class="pe-swatch" style="background:${swatch(sg)}"></span>
            <span class="ellipsis">${escapeHtml(typeLabel(sg.type))}${sg.type === 'text' ? ` "${escapeHtml(sg.template.trim().slice(0, 12))}"` : ''}</span>
          </button>`
          )
          .join('')}`
      )
      .join('');
  }

  const selected = () => (cfg.blocks[sel.b] && cfg.blocks[sel.b].segments[sel.s] ? cfg.blocks[sel.b].segments[sel.s] : null);

  /** Push the model into every control (both panes). */
  function sync({ detail = true } = {}) {
    [presetsPane, editPane].forEach((pane) => {
      q(pane, '[data-pe-preview]').innerHTML = previewHtml();
    });

    // pane 1
    qa(presetsPane, '[data-pe-preset]').forEach((btn) => btn.classList.toggle('active', btn.dataset.pePreset === cfg.preset));
    q(presetsPane, '[data-pe-current]').textContent =
      cfg.preset && presets()[cfg.preset]
        ? fmt(modified() ? 'currentModified' : 'current', { name: presetLabel(cfg.preset) })
        : t('customCurrent', 'Current: custom');
    const cc = customCurrent();
    q(presetsPane, '[data-pe-custom-select]').innerHTML = customOptionsHtml();
    const nameInput = q(presetsPane, '[data-pe-custom-name]');
    if (document.activeElement !== nameInput) nameInput.value = cc ? cc.label : '';
    q(presetsPane, '[data-pe-custom-update]').disabled = !cc || !modified();
    q(presetsPane, '[data-pe-custom-delete]').disabled = !cc;
    q(presetsPane, '[data-pe-custom-hint]').textContent = note || t('customHint', '');
    QUICK_ORDER.forEach((ty) => {
      q(presetsPane, `[data-pe-show="${ty}"]`).checked = allSegs().some((s) => s.type === ty && s.enabled !== false);
    });
    q(presetsPane, '[data-pe-shape]').value = styleOf();
    const pathSeg = allSegs().find((s) => s.type === 'path');
    const pathSel = q(presetsPane, '[data-pe-path-style]');
    const ps = (pathSeg && pathSeg.properties && pathSeg.properties.style) || 'full';
    pathSel.value = ['full', 'folder', 'agnoster_short', 'agnoster'].includes(ps) ? ps : 'full';
    pathSel.disabled = !pathSeg;
    q(presetsPane, '[data-pe-two-lines]').checked = cfg.blocks.length > 1;
    q(presetsPane, '[data-pe-git-mode]').value = mode;
    q(presetsPane, '[data-pe-git-colors]').checked = cfg.git_state_colors !== false;
    GIT_STATE_NAMES.forEach((k) => {
      const input = q(presetsPane, `[data-pe-gitcolor="${k}"]`);
      input.value = cfg.git_colors[k];
      input.disabled = cfg.git_state_colors === false;
      q(presetsPane, `[data-pe-gitcolor-label="${k}"]`).style.color = cfg.git_colors[k];
    });
    q(presetsPane, '[data-pe-gitcolors-reset]').disabled = GIT_STATE_NAMES.every((k) => cfg.git_colors[k] === GIT_STATE_COLORS[k]);

    // pane 2
    if (!cfg.blocks[sel.b]) sel = { b: 0, s: 0 };
    if (!cfg.blocks[sel.b].segments[sel.s]) sel = { b: sel.b, s: Math.max(0, cfg.blocks[sel.b].segments.length - 1) };
    q(editPane, '[data-pe-rows]').innerHTML = rowsHtml();
    const s = selected();
    q(editPane, '[data-pe-up]').disabled = !s || sel.s === 0;
    q(editPane, '[data-pe-down]').disabled = !s || sel.s >= cfg.blocks[sel.b].segments.length - 1;
    q(editPane, '[data-pe-remove]').disabled = !s;
    if (detail) {
      q(editPane, '[data-pe-detail]').innerHTML = detailHtml(s);
      wireDetail();
    }
    q(editPane, '[data-pe-note]').textContent = note || ' ';
  }

  function emit() {
    onChange?.({
      config: clonePrompt(cfg),
      gitMode: mode,
      presetId: currentPresetId(),
      customPrompts: custom.map((c) => ({ ...c, config: clonePrompt(c.config) })),
    });
  }

  const update = (fn, opts) => {
    const c = clonePrompt(cfg);
    fn(c);
    cfg = normalizePrompt(c);
    sync(opts);
    emit();
  };

  /* ---------------------------------------------------------------- */
  /* Presets / custom prompts                                         */
  /* ---------------------------------------------------------------- */

  const applyPreset = (id) => {
    const p = presets()[id];
    if (!p) return;
    cfg = normalizePrompt({ ...clonePrompt(p.config), preset: id });
    sel = { b: 0, s: 0 };
    note = '';
    sync();
    emit();
  };
  const saveCustom = () => {
    const id = newCustomPromptId();
    const typed = q(presetsPane, '[data-pe-custom-name]').value.trim();
    const base = cfg.preset && presets()[cfg.preset] ? presetLabel(cfg.preset).replace(/\s*\(.*\)$/, '') : 'Prompt';
    const label = !customCurrent() && typed ? typed : `${base} ${t('customCopy', '(custom)')}`;
    const config = normalizePrompt({ ...clonePrompt(cfg), preset: id });
    custom = [...custom, { id, label, config }];
    cfg = clonePrompt(config);
    note = fmt('customSaved', { name: label });
    sync();
    emit();
  };
  const updateCustom = () => {
    const cc = customCurrent();
    if (!cc) return;
    cc.config = normalizePrompt({ ...clonePrompt(cfg), preset: cc.id });
    note = fmt('customSaved', { name: cc.label });
    sync();
    emit();
  };
  const renameCustom = (label) => {
    const cc = customCurrent();
    if (!cc || !label.trim()) return;
    cc.label = label.trim();
    q(presetsPane, '[data-pe-custom-select]').innerHTML = customOptionsHtml();
    emit();
  };
  const removeCustom = () => {
    const cc = customCurrent();
    if (!cc) return;
    custom = custom.filter((c) => c.id !== cc.id);
    cfg = presetConfig('default');
    sel = { b: 0, s: 0 };
    note = '';
    sync();
    emit();
  };

  /* ---------------------------------------------------------------- */
  /* Quick options                                                    */
  /* ---------------------------------------------------------------- */

  const toggleType = (ty, on) =>
    update((c) => {
      const segs = c.blocks.flatMap((b) => b.segments).filter((s) => s.type === ty);
      if (segs.length) {
        for (const s of segs) s.enabled = on;
        return;
      }
      if (!on) return;
      // Not in the theme yet: add one in the usual order, in the theme's shape and colours.
      const [, bg, fg] = QUICK.find((qq) => qq[0] === ty);
      const style = styleOf();
      const segNew = {
        type: ty,
        enabled: true,
        style,
        powerline_symbol: '',
        foreground: style === 'plain' ? (ty === 'git' ? 'auto' : 'foreground') : fg,
        background: style === 'plain' ? 'transparent' : bg,
        template: defaultTemplate(ty),
        properties: ty === 'status' ? { always_enabled: true } : {},
      };
      const block = c.blocks[0].segments;
      const rank = QUICK_ORDER.indexOf(ty);
      let at = block.findIndex((s) => QUICK_ORDER.indexOf(s.type) > rank && s.type !== 'text');
      if (at < 0) {
        const lastText = block.length && block[block.length - 1].type === 'text' ? block.length - 1 : block.length;
        at = lastText;
      }
      block.splice(at, 0, segNew);
    });
  const setShape = (style) =>
    update((c) => {
      for (const b of c.blocks)
        for (const s of b.segments) {
          if (s.type === 'text' && style !== 'plain') continue;
          s.style = style;
          if (style === 'plain') {
            s.background = 'transparent';
            if (s.foreground === 'background') s.foreground = 'accent';
          } else if (s.background === 'transparent') s.background = (QUICK.find((qq) => qq[0] === s.type) || [0, 'accent'])[1];
        }
    });
  const setPathStyle = (st) =>
    update((c) => {
      for (const b of c.blocks)
        for (const s of b.segments)
          if (s.type === 'path')
            s.properties = { ...(s.properties || {}), style: st, max_depth: st === 'agnoster_short' ? 3 : (s.properties && s.properties.max_depth) || 1 };
    });
  const setTwoLines = (on) =>
    update((c) => {
      if (on && c.blocks.length === 1)
        c.blocks.push({
          type: 'prompt',
          alignment: 'left',
          newline: true,
          segments: [
            {
              type: 'status',
              enabled: true,
              style: 'plain',
              foreground: '#7CFC8B',
              background: 'transparent',
              foreground_templates: ['{{ if gt .Code 0 }}#ff5c5c{{ end }}'],
              template: '❯',
              properties: { always_enabled: true },
            },
          ],
        });
      else if (!on && c.blocks.length > 1) {
        const first = c.blocks[0];
        for (const b of c.blocks.slice(1)) for (const s of b.segments) if (s.type !== 'status' || s.template !== '❯') first.segments.push(s);
        c.blocks = [first];
      }
    });

  /* ---------------------------------------------------------------- */
  /* Wiring — pane 1                                                  */
  /* ---------------------------------------------------------------- */

  presetsPane.addEventListener('click', (e) => {
    const card = e.target.closest('[data-pe-preset]');
    if (card) applyPreset(card.dataset.pePreset);
  });
  q(presetsPane, '[data-pe-custom-select]').addEventListener('change', (e) => {
    if (e.target.value) applyPreset(e.target.value);
  });
  q(presetsPane, '[data-pe-custom-name]').addEventListener('input', (e) => renameCustom(e.target.value));
  q(presetsPane, '[data-pe-custom-save]').addEventListener('click', saveCustom);
  q(presetsPane, '[data-pe-custom-update]').addEventListener('click', updateCustom);
  q(presetsPane, '[data-pe-custom-delete]').addEventListener('click', removeCustom);
  qa(presetsPane, '[data-pe-show]').forEach((input) => input.addEventListener('change', () => toggleType(input.dataset.peShow, input.checked)));
  q(presetsPane, '[data-pe-shape]').addEventListener('change', (e) => setShape(e.target.value));
  q(presetsPane, '[data-pe-path-style]').addEventListener('change', (e) => setPathStyle(e.target.value));
  q(presetsPane, '[data-pe-two-lines]').addEventListener('change', (e) => setTwoLines(e.target.checked));
  q(presetsPane, '[data-pe-git-mode]').addEventListener('change', (e) => {
    mode = normalizePromptGitMode(e.target.value);
    sync({ detail: false });
    emit();
  });
  q(presetsPane, '[data-pe-git-colors]').addEventListener('change', (e) =>
    update((c) => {
      c.git_state_colors = e.target.checked;
    })
  );
  qa(presetsPane, '[data-pe-gitcolor]').forEach((input) =>
    input.addEventListener('input', () =>
      update((c) => {
        c.git_colors[input.dataset.peGitcolor] = input.value;
      }, { detail: false })
    )
  );
  q(presetsPane, '[data-pe-gitcolors-reset]').addEventListener('click', () =>
    update((c) => {
      c.git_colors = { ...GIT_STATE_COLORS };
    })
  );

  /* ---------------------------------------------------------------- */
  /* Wiring — pane 2                                                  */
  /* ---------------------------------------------------------------- */

  const newSeg = (type) => ({
    type,
    enabled: true,
    style: styleOf(),
    powerline_symbol: '',
    foreground: '#ffffff',
    background: (QUICK.find((qq) => qq[0] === type) || [0, '#4cc9f0'])[1],
    template: defaultTemplate(type),
    properties: {},
  });

  q(editPane, '[data-pe-rows]').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-pe-remove-block]');
    if (rm) {
      const bi = Number(rm.dataset.peRemoveBlock);
      update((c) => {
        c.blocks.splice(bi, 1);
        sel = { b: 0, s: 0 };
      });
      return;
    }
    const row = e.target.closest('[data-pe-row]');
    if (!row) return;
    const [b, s] = row.dataset.peRow.split(':').map(Number);
    sel = { b, s };
    sync();
  });
  q(editPane, '[data-pe-add]').addEventListener('change', (e) => {
    const ty = e.target.value;
    e.target.value = '';
    if (!ty) return;
    update((c) => {
      const b = c.blocks[Math.min(sel.b, c.blocks.length - 1)];
      b.segments.push(newSeg(ty));
      sel = { b: Math.min(sel.b, c.blocks.length - 1), s: b.segments.length - 1 };
    });
  });
  q(editPane, '[data-pe-up]').addEventListener('click', () =>
    update((c) => {
      const a = c.blocks[sel.b].segments;
      if (sel.s <= 0) return;
      [a[sel.s - 1], a[sel.s]] = [a[sel.s], a[sel.s - 1]];
      sel = { b: sel.b, s: sel.s - 1 };
    })
  );
  q(editPane, '[data-pe-down]').addEventListener('click', () =>
    update((c) => {
      const a = c.blocks[sel.b].segments;
      if (sel.s >= a.length - 1) return;
      [a[sel.s + 1], a[sel.s]] = [a[sel.s], a[sel.s + 1]];
      sel = { b: sel.b, s: sel.s + 1 };
    })
  );
  q(editPane, '[data-pe-remove]').addEventListener('click', () =>
    update((c) => {
      if (!c.blocks[sel.b] || !c.blocks[sel.b].segments[sel.s]) return;
      c.blocks[sel.b].segments.splice(sel.s, 1);
      sel = { b: sel.b, s: Math.max(0, sel.s - 1) };
    })
  );
  q(editPane, '[data-pe-add-block]').addEventListener('click', () =>
    update((c) => {
      c.blocks.push({ type: 'prompt', alignment: 'left', newline: true, segments: [newSeg('text')] });
      sel = { b: c.blocks.length - 1, s: 0 };
    })
  );

  /** Detail-field listeners (re-attached after each detail render). */
  function wireDetail() {
    const detail = q(editPane, '[data-pe-detail]');
    enhanceNumberInputs(detail);
    const setSeg = (fn, opts) =>
      update((c) => {
        const s = c.blocks[sel.b] && c.blocks[sel.b].segments[sel.s];
        if (s) fn(s);
      }, opts);
    const fromLines = (txt) => {
      const a = txt
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      return a.length ? a : undefined;
    };
    qa(detail, '[data-pe-f]').forEach((el) => {
      const key = el.dataset.peF;
      const event = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(event, () => {
        if (key === 'type') {
          setSeg((s) => {
            s.type = el.value;
            s.template = defaultTemplate(el.value);
            s.properties = {};
          });
        } else if (key === 'enabled') setSeg((s) => (s.enabled = el.checked));
        else if (key === 'background_templates') setSeg((s) => (s.background_templates = fromLines(el.value)), { detail: false });
        else if (key === 'style') setSeg((s) => (s.style = el.value));
        else setSeg((s) => (s[key] = el.value), { detail: false });
      });
    });
    qa(detail, '[data-pe-p]').forEach((el) => {
      const key = el.dataset.peP;
      const event = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(event, () =>
        setSeg((s) => {
          const v = el.type === 'number' ? Number(el.value) : el.value;
          s.properties = { ...(s.properties || {}), [key]: v };
        }, { detail: false })
      );
    });
    qa(detail, '[data-pe-p-bool]').forEach((el) => {
      el.addEventListener('change', () =>
        setSeg((s) => {
          s.properties = { ...(s.properties || {}), [el.dataset.pePBool]: el.checked };
        }, { detail: false })
      );
    });
    qa(detail, '[data-pe-color-pick]').forEach((el) => {
      el.addEventListener('input', () => {
        const name = el.dataset.peColorPick;
        q(detail, `[data-pe-color-text="${name}"]`).value = el.value;
        setSeg((s) => (s[name] = el.value), { detail: false });
      });
    });
    qa(detail, '[data-pe-color-text]').forEach((el) => {
      el.addEventListener('input', () => {
        const name = el.dataset.peColorText;
        if (/^#[0-9a-fA-F]{6}$/.test(el.value)) q(detail, `[data-pe-color-pick="${name}"]`).value = el.value;
        setSeg((s) => (s[name] = el.value), { detail: false });
      });
    });
  }

  sync();

  return {
    presetsPane,
    editPane,
    getState: () => ({
      config: clonePrompt(cfg),
      gitMode: mode,
      presetId: currentPresetId(),
      customPrompts: custom.map((c) => ({ ...c, config: clonePrompt(c.config) })),
    }),
    setGitMode(next) {
      mode = normalizePromptGitMode(next);
      sync({ detail: false });
    },
  };
}
