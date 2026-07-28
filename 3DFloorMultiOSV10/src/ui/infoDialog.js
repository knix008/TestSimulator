import { t } from '../i18n/index.js';

const APP_INFO = {
  name: 'FloorPlanTo3D — Multi OS',
  version: '1.0.0',
  author: 'SHKWON',
  email: 'knix008@naver.com',
  license: 'MIT',
};

let dialogEls = null;
let previousFocus = null;

function ensureDialog() {
  if (dialogEls) return dialogEls;

  const overlay = document.createElement('div');
  overlay.id = 'infoDialog';
  overlay.className = 'app-dialog info-dialog hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'infoDialogTitle');
  overlay.innerHTML = `
    <div class="app-dialog__panel info-dialog__panel">
      <header class="app-dialog__header">
        <h2 id="infoDialogTitle" class="app-dialog__title">Info</h2>
        <button type="button" class="app-dialog__close" id="infoDialogClose" aria-label="Close">×</button>
      </header>
      <div class="app-dialog__body" id="infoDialogBody"></div>
      <footer class="app-dialog__actions">
        <button type="button" class="primary" id="infoDialogOk">Close</button>
      </footer>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => hideInfoDialog();
  overlay.querySelector('#infoDialogClose').addEventListener('click', close);
  overlay.querySelector('#infoDialogOk').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      hideInfoDialog();
    }
  });

  dialogEls = {
    overlay,
    title: overlay.querySelector('#infoDialogTitle'),
    body: overlay.querySelector('#infoDialogBody'),
    okBtn: overlay.querySelector('#infoDialogOk'),
    closeBtn: overlay.querySelector('#infoDialogClose'),
  };
  return dialogEls;
}

function renderBody() {
  const { body } = ensureDialog();
  const mail = APP_INFO.email;
  body.innerHTML = `
    <p class="info-dialog__app">${APP_INFO.name}</p>
    <p class="info-dialog__desc">${t('infoDialog.description')}</p>
    <dl class="info-dialog__meta">
      <div><dt>${t('infoDialog.version')}</dt><dd>${APP_INFO.version}</dd></div>
      <div><dt>${t('infoDialog.author')}</dt><dd>${APP_INFO.author}</dd></div>
      <div><dt>${t('infoDialog.email')}</dt><dd><a href="mailto:${mail}">${mail}</a></dd></div>
      <div><dt>${t('infoDialog.license')}</dt><dd>${APP_INFO.license}</dd></div>
    </dl>
  `;
}

function applyLocaleToChrome() {
  const els = ensureDialog();
  els.title.textContent = t('infoDialog.title');
  els.okBtn.textContent = t('infoDialog.close');
  els.closeBtn.setAttribute('aria-label', t('infoDialog.close'));
}

export function refreshInfoDialogLocale() {
  if (!dialogEls) return;
  applyLocaleToChrome();
  if (!dialogEls.overlay.classList.contains('hidden')) {
    renderBody();
  }
}

export function showInfoDialog() {
  const els = ensureDialog();
  previousFocus = document.activeElement;
  applyLocaleToChrome();
  renderBody();
  els.overlay.classList.remove('hidden');
  els.okBtn.focus();
}

export function hideInfoDialog() {
  if (!dialogEls) return;
  dialogEls.overlay.classList.add('hidden');
  if (previousFocus && typeof previousFocus.focus === 'function') {
    previousFocus.focus();
  }
  previousFocus = null;
}
