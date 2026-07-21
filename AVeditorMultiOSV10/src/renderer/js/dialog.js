import { Icons } from './icons.js';

let _i18n = null;

export function initDialog(i18n) {
  _i18n = i18n;
}

function t(key) {
  return _i18n ? _i18n.t(key) : key.split('.').pop();
}

export function showDialog({ message, title = null, buttons = [], iconHtml = null }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-dialog-overlay';
    overlay.tabIndex = -1;

    const card = document.createElement('div');
    card.className = 'custom-dialog-card';

    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'custom-dialog-title';
      titleEl.textContent = title;
      card.appendChild(titleEl);
    }

    const body = document.createElement('div');
    body.className = 'custom-dialog-body';
    if (iconHtml) {
      const iconEl = document.createElement('span');
      iconEl.className = 'custom-dialog-icon';
      iconEl.innerHTML = iconHtml;
      body.appendChild(iconEl);
    }
    const msgEl = document.createElement('span');
    msgEl.className = 'custom-dialog-message';
    msgEl.textContent = message;
    body.appendChild(msgEl);
    card.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'custom-dialog-footer';

    const close = (value) => {
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      resolve(value);
    };

    for (const btn of buttons) {
      const el = document.createElement('button');
      el.className = 'custom-dialog-btn'
        + (btn.primary ? ' primary' : '')
        + (btn.danger ? ' danger' : '');
      el.innerHTML = `${btn.icon || ''}${btn.label ? `<span>${btn.label}</span>` : ''}`;
      el.addEventListener('click', () => close(btn.value));
      footer.appendChild(el);
    }

    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('visible'));

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const cancelBtn = buttons.find(b => !b.primary);
        close(cancelBtn ? cancelBtn.value : false);
      }
    });

    overlay.focus();
  });
}

export function showConfirm(message) {
  return showDialog({
    message,
    iconHtml: Icons.warning,
    buttons: [
      { icon: Icons.close, label: t('dialog.no'),  value: false },
      { icon: Icons.check, label: t('dialog.yes'), value: true, primary: true },
    ],
  });
}

export function showAlert(message) {
  return showDialog({
    message,
    iconHtml: Icons.info,
    buttons: [
      { icon: Icons.check, label: t('dialog.ok'), value: true, primary: true },
    ],
  });
}

export function showSubtitleSaveFormatDialog(defaultMode = 'target') {
  const opts = typeof defaultMode === 'object' && defaultMode
    ? defaultMode
    : { defaultMode };
  const preferred = String(opts.defaultMode || 'target');
  const previewNames = opts.previewNames || {};
  const previewPaths = opts.previewPaths || {};

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-dialog-overlay';
    overlay.tabIndex = -1;

    const card = document.createElement('div');
    card.className = 'custom-dialog-card subtitle-save-format-card';
    card.innerHTML = `
      <div class="custom-dialog-title">${t('subtitle.saveFormatTitle')}</div>
      <div class="subtitle-save-format-body">
        <div class="subtitle-help-text">${t('subtitle.saveFormatMessage')}</div>
        <label class="subtitle-inline-row">
          <span>${t('subtitle.saveFormatLabel')}</span>
          <select id="subtitle-save-mode">
            <option value="source">${t('subtitle.saveFormatSource')}</option>
            <option value="target">${t('subtitle.saveFormatTarget')}</option>
            <option value="dual">${t('subtitle.saveFormatDual')}</option>
          </select>
        </label>
        <div class="subtitle-save-preview" id="subtitle-save-preview"></div>
      </div>
      <div class="custom-dialog-footer">
        <button type="button" class="custom-dialog-btn" id="subtitle-save-cancel">${Icons.close}<span>${t('dialog.cancel')}</span></button>
        <button type="button" class="custom-dialog-btn primary" id="subtitle-save-ok">${Icons.download}<span>${t('dialog.ok')}</span></button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const modeSel = card.querySelector('#subtitle-save-mode');
    const previewEl = card.querySelector('#subtitle-save-preview');

    if (preferred === 'source' || preferred === 'dual') modeSel.value = preferred;
    else modeSel.value = 'target';

    const updatePreview = () => {
      const mode = modeSel.value;
      const name = String(previewNames[mode] || '').trim();
      const path = String(previewPaths[mode] || '').trim();
      previewEl.textContent = name
        ? `${t('subtitle.saveFormatPreview')}: ${name}${path ? `\n${path}` : ''}`
        : t('subtitle.saveFormatPreviewEmpty');
    };
    updatePreview();
    modeSel.addEventListener('change', updatePreview);

    const close = (value) => {
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      resolve(value);
    };

    card.querySelector('#subtitle-save-cancel').addEventListener('click', () => close(null));
    card.querySelector('#subtitle-save-ok').addEventListener('click', () => close(modeSel.value || 'target'));

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(null);
    });
    overlay.focus();
  });
}

export function showSubtitleOptionsDialog(defaults = {}) {
  const initialRecognition = String(defaults.recognitionLanguage || 'auto');
  const initialOutput = String(defaults.outputLanguage || 'source');
  const initialCustom = String(defaults.customOutputLanguage || '');
  const initialDual = !!defaults.dualMode;
  const initialDualOrder = String(defaults.dualOrder || 'source-first');
  const initialConfidenceProfile = String(defaults.confidenceProfile || 'balanced');
  const initialSuffixSource = String(defaults.suffixSource || '.source');
  const initialSuffixTarget = String(defaults.suffixTarget || '.target');
  const initialSuffixDual = String(defaults.suffixDual || '.dual');
  const initialSuffixLangCode = !!defaults.suffixLangCode;
  const initialSuffixLangFormat = String(defaults.suffixLangFormat || 'iso');

  const recognitionOptions = [
    { value: 'auto', label: t('subtitle.languageAuto') },
    { value: 'en', label: 'English' },
    { value: 'ko', label: 'Korean (한국어)' },
    { value: 'ja', label: 'Japanese (日本語)' },
    { value: 'zh', label: 'Chinese (中文)' },
    { value: 'es', label: 'Spanish (Espanol)' },
    { value: 'fr', label: 'French (Francais)' },
    { value: 'de', label: 'German (Deutsch)' },
    { value: 'it', label: 'Italian (Italiano)' },
    { value: 'pt', label: 'Portuguese (Portugues)' },
    { value: 'ru', label: 'Russian (Russkiy)' },
    { value: 'ar', label: 'Arabic (al-Arabiyyah)' },
    { value: 'hi', label: 'Hindi (Hindi)' },
    { value: 'tr', label: 'Turkish (Turkce)' },
    { value: 'vi', label: 'Vietnamese (Tieng Viet)' },
    { value: 'th', label: 'Thai (Thai)' },
    { value: 'id', label: 'Indonesian (Bahasa Indonesia)' },
    { value: 'pl', label: 'Polish (Polski)' },
    { value: 'nl', label: 'Dutch (Nederlands)' },
    { value: 'sv', label: 'Swedish (Svenska)' },
    { value: 'no', label: 'Norwegian (Norsk)' },
    { value: 'da', label: 'Danish (Dansk)' },
    { value: 'fi', label: 'Finnish (Suomi)' },
    { value: 'cs', label: 'Czech (Cesky)' },
    { value: 'ro', label: 'Romanian (Romana)' },
    { value: 'hu', label: 'Hungarian (Magyar)' },
    { value: 'uk', label: 'Ukrainian (Ukrainska)' },
  ];

  const outputOptions = [
    { value: 'source', label: t('subtitle.outputSource') },
    ...recognitionOptions.filter((x) => x.value !== 'auto'),
    { value: 'custom', label: t('subtitle.outputCustom') },
  ];

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-dialog-overlay';
    overlay.tabIndex = -1;

    const card = document.createElement('div');
    card.className = 'custom-dialog-card subtitle-options-card';

    card.innerHTML = `
      <div class="custom-dialog-title">${t('subtitle.optionsTitle')}</div>
      <div class="subtitle-options-body">
        <label class="ollama-field">
          <span>${t('subtitle.inputLanguage')}</span>
          <select id="subtitle-input-lang"></select>
        </label>
        <label class="ollama-field">
          <span>${t('subtitle.outputLanguage')}</span>
          <select id="subtitle-output-lang"></select>
        </label>
        <label class="ollama-field" id="subtitle-custom-row" style="display:none;">
          <span>${t('subtitle.customLanguage')}</span>
          <input type="text" id="subtitle-custom-lang" placeholder="${t('subtitle.customLanguagePlaceholder')}" />
        </label>
        <label class="subtitle-dual-row">
          <input type="checkbox" id="subtitle-dual-mode" ${initialDual ? 'checked' : ''} />
          <span>${t('subtitle.dualMode')}</span>
        </label>
        <label class="subtitle-inline-row" id="subtitle-dual-order-row">
          <span>${t('subtitle.dualOrder')}</span>
          <select id="subtitle-dual-order">
            <option value="source-first">${t('subtitle.dualOrderSourceFirst')}</option>
            <option value="target-first">${t('subtitle.dualOrderTargetFirst')}</option>
          </select>
        </label>
        <label class="subtitle-inline-row">
          <span>${t('subtitle.confidenceProfile')}</span>
          <select id="subtitle-confidence-profile">
            <option value="strict">${t('subtitle.confidenceProfileStrict')}</option>
            <option value="balanced">${t('subtitle.confidenceProfileBalanced')}</option>
            <option value="lenient">${t('subtitle.confidenceProfileLenient')}</option>
          </select>
        </label>
        <div class="subtitle-help-text" id="subtitle-confidence-help"></div>
        <label class="subtitle-inline-row">
          <span>${t('subtitle.suffixSource')}</span>
          <input type="text" id="subtitle-suffix-source" class="subtitle-suffix-input" />
        </label>
        <label class="subtitle-inline-row">
          <span>${t('subtitle.suffixTarget')}</span>
          <input type="text" id="subtitle-suffix-target" class="subtitle-suffix-input" />
        </label>
        <label class="subtitle-inline-row">
          <span>${t('subtitle.suffixDual')}</span>
          <input type="text" id="subtitle-suffix-dual" class="subtitle-suffix-input" />
        </label>
        <label class="subtitle-dual-row">
          <input type="checkbox" id="subtitle-suffix-langcode" ${initialSuffixLangCode ? 'checked' : ''} />
          <span>${t('subtitle.suffixLangCode')}</span>
        </label>
        <label class="subtitle-inline-row" id="subtitle-suffix-lang-format-row">
          <span>${t('subtitle.suffixLangFormat')}</span>
          <select id="subtitle-suffix-lang-format">
            <option value="iso">${t('subtitle.suffixLangFormatIso')}</option>
            <option value="model">${t('subtitle.suffixLangFormatModel')}</option>
          </select>
        </label>
      </div>
      <div class="custom-dialog-footer">
        <button type="button" class="custom-dialog-btn" id="subtitle-options-cancel">${Icons.close}<span>${t('dialog.cancel')}</span></button>
        <button type="button" class="custom-dialog-btn primary" id="subtitle-options-ok">${Icons.check}<span>${t('dialog.ok')}</span></button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const inputSel = card.querySelector('#subtitle-input-lang');
    const outputSel = card.querySelector('#subtitle-output-lang');
    const customRow = card.querySelector('#subtitle-custom-row');
    const customInput = card.querySelector('#subtitle-custom-lang');
    const dualChk = card.querySelector('#subtitle-dual-mode');
    const dualOrderRow = card.querySelector('#subtitle-dual-order-row');
    const dualOrderSel = card.querySelector('#subtitle-dual-order');
    const confidenceSel = card.querySelector('#subtitle-confidence-profile');
    const confidenceHelp = card.querySelector('#subtitle-confidence-help');
    const suffixSourceInput = card.querySelector('#subtitle-suffix-source');
    const suffixTargetInput = card.querySelector('#subtitle-suffix-target');
    const suffixDualInput = card.querySelector('#subtitle-suffix-dual');
    const suffixLangCodeChk = card.querySelector('#subtitle-suffix-langcode');
    const suffixLangFormatRow = card.querySelector('#subtitle-suffix-lang-format-row');
    const suffixLangFormatSel = card.querySelector('#subtitle-suffix-lang-format');

    const appendOptions = (el, options, initial) => {
      for (const item of options) {
        const opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        el.appendChild(opt);
      }
      if (options.some((x) => x.value === initial)) {
        el.value = initial;
      }
    };

    appendOptions(inputSel, recognitionOptions, initialRecognition);
    appendOptions(outputSel, outputOptions, initialOutput);
    customInput.value = initialCustom;
    if (initialDualOrder === 'target-first') dualOrderSel.value = 'target-first';
    if (initialConfidenceProfile === 'strict' || initialConfidenceProfile === 'lenient') {
      confidenceSel.value = initialConfidenceProfile;
    } else {
      confidenceSel.value = 'balanced';
    }
    suffixSourceInput.value = initialSuffixSource;
    suffixTargetInput.value = initialSuffixTarget;
    suffixDualInput.value = initialSuffixDual;
    if (initialSuffixLangFormat === 'model') suffixLangFormatSel.value = 'model';

    const syncConfidenceHelp = () => {
      const key = confidenceSel.value === 'strict'
        ? 'subtitle.confidenceProfileStrictHelp'
        : confidenceSel.value === 'lenient'
          ? 'subtitle.confidenceProfileLenientHelp'
          : 'subtitle.confidenceProfileBalancedHelp';
      confidenceHelp.textContent = t(key);
    };
    syncConfidenceHelp();
    confidenceSel.addEventListener('change', syncConfidenceHelp);

    const syncCustom = () => {
      customRow.style.display = outputSel.value === 'custom' ? '' : 'none';
    };
    const syncDualRows = () => {
      dualOrderRow.style.display = dualChk?.checked ? '' : 'none';
    };
    const syncSuffixLangRows = () => {
      suffixLangFormatRow.style.display = suffixLangCodeChk?.checked ? '' : 'none';
    };
    syncCustom();
    syncDualRows();
    syncSuffixLangRows();
    outputSel.addEventListener('change', syncCustom);
    dualChk?.addEventListener('change', syncDualRows);
    suffixLangCodeChk?.addEventListener('change', syncSuffixLangRows);

    const close = (value) => {
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      resolve(value);
    };

    card.querySelector('#subtitle-options-cancel').addEventListener('click', () => close(null));
    card.querySelector('#subtitle-options-ok').addEventListener('click', () => {
      const outputLanguage = outputSel.value === 'custom'
        ? String(customInput.value || '').trim().toLowerCase()
        : outputSel.value;
      close({
        recognitionLanguage: inputSel.value || 'auto',
        outputLanguage: outputLanguage || 'source',
        dualMode: !!dualChk?.checked,
        dualOrder: dualOrderSel?.value === 'target-first' ? 'target-first' : 'source-first',
        confidenceProfile: String(confidenceSel?.value || 'balanced'),
        suffixSource: String(suffixSourceInput?.value || '').trim() || '.source',
        suffixTarget: String(suffixTargetInput?.value || '').trim() || '.target',
        suffixDual: String(suffixDualInput?.value || '').trim() || '.dual',
        suffixLangCode: !!suffixLangCodeChk?.checked,
        suffixLangFormat: suffixLangFormatSel?.value === 'model' ? 'model' : 'iso',
      });
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(null);
    });
    overlay.focus();
  });
}
