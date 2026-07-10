import { t, onUiLanguageChange } from '../i18n/index.js';

export function createStatusBar() {
  const left = document.getElementById('status-left');
  const save = document.getElementById('status-save');

  let currentUser = null;
  let currentPageTitle = null;
  let saveKind = 'none';
  let saveText = null;

  function renderLeft() {
    if (!currentUser) {
      if (currentPageTitle) {
        left.textContent = t.statusPage(currentPageTitle);
      } else {
        left.textContent = t.statusLoginRequired;
      }
      return;
    }

    const role = currentUser.role === 'Admin' ? t.statusAdmin : t.statusUser;
    left.textContent = currentPageTitle
      ? t.statusPage(currentPageTitle)
      : `${currentUser.username} (${role})`;
  }

  function renderSave() {
    save.className = 'status-item status-save';
    if (saveKind === 'modified') {
      save.classList.add('is-modified');
      save.textContent = saveText || t.saveModified;
    } else if (saveKind === 'saved') {
      save.classList.add('is-saved');
      save.textContent = saveText || t.saveSaved;
    } else if (saveKind === 'autosaved') {
      save.classList.add('is-saved');
      save.textContent = saveText || t.saveAutoSaved;
    } else if (saveKind === 'error') {
      save.classList.add('is-error');
      save.textContent = saveText || t.saveFailed;
    } else if (saveKind === 'saving') {
      save.textContent = saveText || t.saveSaved;
    } else {
      save.textContent = '';
    }
  }

  function refreshLocalizedUi() {
    renderLeft();
    renderSave();
  }

  onUiLanguageChange(() => {
    refreshLocalizedUi();
  });

  return {
    setLoginRequired() {
      currentUser = null;
      currentPageTitle = null;
      saveKind = 'none';
      saveText = null;
      renderLeft();
      save.textContent = '';
      save.className = 'status-item status-save';
    },
    setUser(user, pageTitle = null) {
      if (!user) {
        currentUser = null;
        currentPageTitle = pageTitle;
        if (pageTitle) {
          renderLeft();
        } else {
          this.setLoginRequired();
        }
        return;
      }

      currentUser = user;
      currentPageTitle = pageTitle;
      renderLeft();
    },
    setSaveStatus(kind, text = null) {
      saveKind = kind;
      saveText = text;
      renderSave();
    },
    refreshLocalizedUi
  };
}
