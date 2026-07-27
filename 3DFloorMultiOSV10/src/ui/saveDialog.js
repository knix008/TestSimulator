import { t } from '../i18n/index.js';
import { EXPORT_FORMATS } from '../exporters/modelExport.js';

let dialogEls = null;
let previousFocus = null;
let resolvePick = null;

function ensureDialog() {
  if (dialogEls) return dialogEls;

  const overlay = document.createElement('div');
  overlay.id = 'saveDialog';
  overlay.className = 'app-dialog save-dialog hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'saveDialogTitle');
  overlay.innerHTML = `
    <div class="app-dialog__panel save-dialog__panel">
      <header class="app-dialog__header">
        <h2 id="saveDialogTitle" class="app-dialog__title">Save</h2>
        <button type="button" class="app-dialog__close" id="saveDialogClose" aria-label="Close">×</button>
      </header>
      <p class="app-dialog__summary" id="saveDialogSummary"></p>
      <div class="save-dialog__formats" id="saveDialogFormats" role="radiogroup"></div>
      <footer class="app-dialog__actions">
        <button type="button" id="saveDialogCancel">Cancel</button>
        <button type="button" class="primary" id="saveDialogOk">Save</button>
      </footer>
    </div>
  `;
  document.body.appendChild(overlay);

  const finish = (value) => {
    hideSaveDialog();
    if (resolvePick) {
      const r = resolvePick;
      resolvePick = null;
      r(value);
    }
  };

  overlay.querySelector('#saveDialogClose').addEventListener('click', () => finish(null));
  overlay.querySelector('#saveDialogCancel').addEventListener('click', () => finish(null));
  overlay.querySelector('#saveDialogOk').addEventListener('click', () => {
    const checked = overlay.querySelector('input[name="saveFormat"]:checked');
    finish(checked?.value || null);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) finish(null);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      finish(null);
    }
  });

  dialogEls = {
    overlay,
    title: overlay.querySelector('#saveDialogTitle'),
    summary: overlay.querySelector('#saveDialogSummary'),
    formats: overlay.querySelector('#saveDialogFormats'),
    okBtn: overlay.querySelector('#saveDialogOk'),
    cancelBtn: overlay.querySelector('#saveDialogCancel'),
    closeBtn: overlay.querySelector('#saveDialogClose'),
  };
  return dialogEls;
}

function applyLocaleToChrome() {
  const els = ensureDialog();
  els.title.textContent = t('saveDialog.title');
  els.summary.textContent = t('saveDialog.summary');
  els.okBtn.textContent = t('saveDialog.save');
  els.cancelBtn.textContent = t('saveDialog.cancel');
  els.closeBtn.setAttribute('aria-label', t('saveDialog.cancel'));
}

function renderFormats(selectedId = 'glb') {
  const els = ensureDialog();
  els.formats.innerHTML = EXPORT_FORMATS.map((fmt) => `
    <label class="save-dialog__option">
      <input type="radio" name="saveFormat" value="${fmt.id}" ${fmt.id === selectedId ? 'checked' : ''} />
      <span class="save-dialog__option-text">
        <span class="save-dialog__option-label">${t(fmt.labelKey)}</span>
        <span class="save-dialog__option-hint">${t(fmt.hintKey)}</span>
      </span>
    </label>
  `).join('');
}

export function refreshSaveDialogLocale() {
  if (!dialogEls) return;
  const checked = dialogEls.overlay.querySelector('input[name="saveFormat"]:checked')?.value || 'glb';
  applyLocaleToChrome();
  if (!dialogEls.overlay.classList.contains('hidden')) {
    renderFormats(checked);
  }
}

export function hideSaveDialog() {
  if (!dialogEls) return;
  dialogEls.overlay.classList.add('hidden');
  if (previousFocus && typeof previousFocus.focus === 'function') {
    previousFocus.focus();
  }
  previousFocus = null;
}

/**
 * @returns {Promise<string | null>} selected format id, or null if canceled
 */
export function showSaveDialog({ defaultFormat = 'glb' } = {}) {
  const els = ensureDialog();
  previousFocus = document.activeElement;
  applyLocaleToChrome();
  renderFormats(defaultFormat);
  els.overlay.classList.remove('hidden');
  els.okBtn.focus();

  return new Promise((resolve) => {
    resolvePick = resolve;
  });
}
