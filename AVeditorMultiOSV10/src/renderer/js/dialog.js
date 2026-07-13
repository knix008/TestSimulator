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
