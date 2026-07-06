import { t } from '../i18n/index.js';

export function createStatusBar() {
  const left = document.getElementById('status-left');
  const save = document.getElementById('status-save');

  return {
    setLoginRequired() {
      left.textContent = t.statusLoginRequired;
      save.textContent = '';
      save.className = 'status-item status-save';
    },
    setUser(user, pageTitle = null) {
      const role = user.role === 'Admin' ? t.statusAdmin : t.statusUser;
      left.textContent = pageTitle ? t.statusPage(pageTitle) : `${user.username} (${role})`;
    },
    setSaveStatus(kind, text = null) {
      save.className = 'status-item status-save';
      if (kind === 'modified') {
        save.classList.add('is-modified');
        save.textContent = text || t.saveModified;
      } else if (kind === 'saved') {
        save.classList.add('is-saved');
        save.textContent = text || t.saveSaved;
      } else if (kind === 'autosaved') {
        save.classList.add('is-saved');
        save.textContent = text || t.saveAutoSaved;
      } else if (kind === 'error') {
        save.classList.add('is-error');
        save.textContent = text || t.saveFailed;
      } else if (kind === 'saving') {
        save.textContent = text || t.saveSaved;
      } else {
        save.textContent = '';
      }
    }
  };
}
