import { t, getUiLanguage, toTemplateLanguage, applyLanguage, resolveUiLanguage } from '../i18n/index.js';
import { showApiError } from '../errors/errorDetail.js';
import { normalizeFontScaleStep } from '../ui/fontScale.js';
import { showTableInsertPopup } from '../ui/tableInsertPopup.js';
import { createPastelColorThemePicker } from '../ui/pastelColorThemePicker.js';

let layer = null;
let activeDismissHandler = closeModal;

function ensureLayer() {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'modal-layer hidden';
    layer.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card" role="dialog" aria-modal="true">
        <header class="modal-header">
          <h2 class="modal-title"></h2>
          <button type="button" class="modal-close" aria-label="${t.modalCloseAria}">×</button>
        </header>
        <div class="modal-body"></div>
        <footer class="modal-footer"></footer>
      </div>
    `;
    document.body.appendChild(layer);
    layer.querySelector('.modal-backdrop').addEventListener('click', () => activeDismissHandler());
    layer.querySelector('.modal-close').addEventListener('click', () => activeDismissHandler());
  }
  return layer;
}

export function closeModal() {
  activeDismissHandler = closeModal;
  if (!layer) {
    return;
  }
  layer.classList.add('hidden');
  layer.querySelector('.modal-body').replaceChildren();
  layer.querySelector('.modal-footer').replaceChildren();
}

export function openModal({ title, bodyNode, footerNodes = [], cardClassName = '', onDismiss = null }) {
  activeDismissHandler = onDismiss || closeModal;
  const root = ensureLayer();
  const card = root.querySelector('.modal-card');
  card.className = 'modal-card';
  for (const className of String(cardClassName || '').split(/\s+/).filter(Boolean)) {
    card.classList.add(className);
  }
  root.querySelector('.modal-title').textContent = title;
  root.querySelector('.modal-close')?.setAttribute('aria-label', t.modalCloseAria);
  const body = root.querySelector('.modal-body');
  const footer = root.querySelector('.modal-footer');
  body.replaceChildren();
  footer.replaceChildren();
  if (bodyNode) {
    body.appendChild(bodyNode);
  }
  for (const node of footerNodes) {
    footer.appendChild(node);
  }
  root.classList.remove('hidden');
}

export function createButton(label, { primary = false, onClick } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = primary ? 'btn-primary' : 'modal-btn';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

export function showInputDialog({
  title,
  label,
  defaultValue = '',
  placeholder = '',
  confirmLabel = t.buttonOk,
  cancelLabel = t.buttonCancel,
  multiline = false
}) {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'form-grid';
    const fieldLabel = document.createElement('label');
    fieldLabel.textContent = label;
    const input = multiline ? document.createElement('textarea') : document.createElement('input');
    input.className = 'modal-input';
    if (!multiline) {
      input.type = 'text';
    }
    input.value = defaultValue;
    input.placeholder = placeholder;
    fieldLabel.appendChild(input);
    body.appendChild(fieldLabel);

    const finish = (value) => {
      closeModal();
      resolve(value);
    };

    openModal({
      title,
      bodyNode: body,
      footerNodes: [
        createButton(cancelLabel, { onClick: () => finish(null) }),
        createButton(confirmLabel, {
          primary: true,
          onClick: () => finish(input.value)
        })
      ]
    });

    input.focus();
    input.select?.();
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !multiline) {
        event.preventDefault();
        finish(input.value);
      }
    });
  });
}

export function showConfirmDialog({
  title,
  message,
  confirmLabel = t.buttonOk,
  cancelLabel = t.buttonCancel,
  danger = false
}) {
  return new Promise((resolve) => {
    const body = document.createElement('p');
    body.className = 'confirm-message';
    body.textContent = message;

    const finish = (value) => {
      closeModal();
      resolve(value);
    };

    openModal({
      title,
      bodyNode: body,
      footerNodes: [
        createButton(cancelLabel, { onClick: () => finish(false) }),
        createButton(confirmLabel, {
          primary: true,
          onClick: () => finish(true)
        })
      ]
    });

    if (danger) {
      layer.querySelector('.btn-primary')?.classList.add('btn-danger');
    }
  });
}

export async function showAboutDialog() {
  let version = '0.1.0';
  let build = null;
  try {
    const result = await window.myworkspace.getAppInfo();
    if (result?.ok) {
      if (result.version) {
        version = result.version;
      }
      build = result.build || null;
    }
  } catch {
    // ignore
  }

  const body = document.createElement('div');
  body.className = 'about-body';

  const header = document.createElement('div');
  header.className = 'about-header';

  const icon = document.createElement('img');
  icon.className = 'about-icon';
  icon.src = 'assets/app-icon.png';
  icon.alt = '';
  icon.width = 48;
  icon.height = 48;

  const meta = document.createElement('div');
  meta.className = 'about-meta';

  const name = document.createElement('strong');
  name.className = 'about-app-name';
  name.textContent = t.appName;

  const description = document.createElement('p');
  description.className = 'about-description';
  description.textContent = t.aboutDescription;

  const versionLine = document.createElement('p');
  versionLine.className = 'about-version';
  versionLine.textContent = t.aboutVersionFormat(version);

  meta.append(name, description, versionLine);

  if (build) {
    const buildBlock = document.createElement('div');
    buildBlock.className = 'about-build';

    const locale = toTemplateLanguage(getUiLanguage()) === 'en' ? 'en-US' : 'ko-KR';
    const platformLabel = resolvePlatformLabel(build.builtOnPlatform || build.platform);
    const arch = build.builtOnArch || build.arch || '';

    const lines = [];
    if (build.development) {
      lines.push(t.aboutDevelopmentBuild);
    } else if (build.buildDate) {
      const formattedDate = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(build.buildDate));
      lines.push(t.aboutBuildDateFormat(formattedDate));
    }

    if (build.commit) {
      lines.push(t.aboutBuildCommitFormat(build.commit, build.branch));
    }

    if (platformLabel && arch) {
      lines.push(t.aboutBuildPlatformFormat(platformLabel, arch));
    }

    if (build.electronVersion) {
      lines.push(t.aboutElectronFormat(build.electronVersion));
    }

    for (const text of lines) {
      const line = document.createElement('p');
      line.className = 'about-build-line';
      line.textContent = text;
      buildBlock.appendChild(line);
    }

    if (buildBlock.childElementCount > 0) {
      meta.appendChild(buildBlock);
    }
  }

  header.append(icon, meta);
  body.appendChild(header);

  const copyright = document.createElement('p');
  copyright.className = 'about-copyright';
  copyright.textContent = t.aboutCopyrightFormat(new Date().getFullYear());
  body.appendChild(copyright);

  openModal({
    title: t.menuAbout.replace(/\(&.\)/, ''),
    bodyNode: body,
    footerNodes: [createButton(t.buttonClose, { primary: true, onClick: closeModal })]
  });
}

function resolvePlatformLabel(platform) {
  if (platform === 'win32') {
    return t.platformWin32;
  }
  if (platform === 'darwin') {
    return t.platformDarwin;
  }
  if (platform === 'linux') {
    return t.platformLinux;
  }
  return platform || '';
}

function setFormLabelText(label, text) {
  const control = label.querySelector('select, input, textarea');
  label.textContent = text;
  if (control) {
    label.appendChild(control);
  }
}

function refreshSelectOptions(select, options) {
  const current = select.value;
  select.innerHTML = options
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');
  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

export async function showPreferencesDialog(api, onSaved, { onLanguagePreview } = {}) {
  const config = await api.getUiConfig();
  const original = {
    theme: config.theme || 'Light',
    language: config.language || 'Korean',
    fontScaleStep: normalizeFontScaleStep(config.fontScaleStep),
    colorThemeIndex: config.colorThemeIndex ?? 4,
    useCustomAccentColor: Boolean(config.useCustomAccentColor),
    customAccentArgb: config.customAccentArgb ?? 0xa8d4ff
  };

  const body = document.createElement('div');
  body.className = 'form-grid preferences-form';

  const themeLabel = document.createElement('label');
  themeLabel.textContent = t.preferencesTheme;
  const themeSelect = document.createElement('select');
  themeSelect.id = 'pref-theme';
  themeSelect.innerHTML = `
    <option value="Light">${t.themeLight}</option>
    <option value="Dark">${t.themeDark}</option>
  `;
  themeSelect.value = original.theme;
  themeLabel.appendChild(themeSelect);

  const languageLabel = document.createElement('label');
  languageLabel.textContent = t.preferencesLanguage;
  const languageSelect = document.createElement('select');
  languageSelect.id = 'pref-language';
  languageSelect.innerHTML = `
    <option value="Korean">${t.languageKorean}</option>
    <option value="English">${t.languageEnglish}</option>
  `;
  languageSelect.value = original.language;
  languageLabel.appendChild(languageSelect);

  const fontScaleLabel = document.createElement('label');
  fontScaleLabel.textContent = t.preferencesFontScale;
  const fontScaleSelect = document.createElement('select');
  fontScaleSelect.id = 'pref-font-scale';
  fontScaleSelect.innerHTML = `
    <option value="-2">${t.fontScaleMuchSmaller}</option>
    <option value="-1">${t.fontScaleSmaller}</option>
    <option value="0">${t.fontScaleNormal}</option>
    <option value="1">${t.fontScaleLarger}</option>
    <option value="2">${t.fontScaleMuchLarger}</option>
  `;
  fontScaleSelect.value = String(original.fontScaleStep);
  fontScaleLabel.appendChild(fontScaleSelect);

  const colorPicker = createPastelColorThemePicker({
    initial: original,
    isDark: original.theme === 'Dark',
    onChange: () => {
      void applyLivePreview();
    }
  });

  const hint = document.createElement('p');
  hint.className = 'modal-hint';
  hint.textContent = t.preferencesRestartHint;

  body.append(themeLabel, colorPicker.element, languageLabel, fontScaleLabel, hint);

  let previewSuspended = false;
  let isClosing = false;

  function readCurrentSettings() {
    const color = colorPicker.readValue();
    return {
      theme: themeSelect.value,
      language: languageSelect.value,
      fontScaleStep: normalizeFontScaleStep(fontScaleSelect.value),
      ...color
    };
  }

  function applySettingsToForm(settings) {
    previewSuspended = true;
    try {
      themeSelect.value = settings.theme;
      languageSelect.value = settings.language;
      fontScaleSelect.value = String(settings.fontScaleStep);
      colorPicker.setThemeMode(settings.theme === 'Dark');
      colorPicker.setValue(settings);
    } finally {
      previewSuspended = false;
    }
  }

  function refreshPreferencesDialogLabels(cancelButton, saveButton) {
    layer?.querySelector('.modal-title')?.replaceChildren(document.createTextNode(t.preferencesTitle));
    layer?.querySelector('.modal-close')?.setAttribute('aria-label', t.modalCloseAria);

    previewSuspended = true;
    try {
      setFormLabelText(themeLabel, t.preferencesTheme);
      refreshSelectOptions(themeSelect, [
        ['Light', t.themeLight],
        ['Dark', t.themeDark]
      ]);

      setFormLabelText(languageLabel, t.preferencesLanguage);
      refreshSelectOptions(languageSelect, [
        ['Korean', t.languageKorean],
        ['English', t.languageEnglish]
      ]);

      setFormLabelText(fontScaleLabel, t.preferencesFontScale);
      refreshSelectOptions(fontScaleSelect, [
        ['-2', t.fontScaleMuchSmaller],
        ['-1', t.fontScaleSmaller],
        ['0', t.fontScaleNormal],
        ['1', t.fontScaleLarger],
        ['2', t.fontScaleMuchLarger]
      ]);
    } finally {
      previewSuspended = false;
    }

    colorPicker.refreshLocalizedLabels?.();
    hint.textContent = t.preferencesRestartHint;
    if (cancelButton) {
      cancelButton.textContent = t.buttonCancel;
    }
    if (saveButton) {
      saveButton.textContent = t.buttonSave;
    }
  }

  function syncPreferencesDialogLanguage(settings) {
    const previousLanguage = getUiLanguage();
    const nextLanguage = resolveUiLanguage(settings.language);
    if (previousLanguage === nextLanguage) {
      return false;
    }

    applyLanguage(settings.language);
    refreshPreferencesDialogLabels(cancelButton, saveButton);
    onLanguagePreview?.();
    return true;
  }

  async function applyLivePreview() {
    if (previewSuspended || isClosing) {
      return;
    }

    const current = readCurrentSettings();
    const languageChanged = syncPreferencesDialogLanguage(current);
    await onSaved?.(current, { preview: true });
    if (languageChanged) {
      refreshPreferencesDialogLabels(cancelButton, saveButton);
    }
  }

  async function restoreOriginalSettings() {
    applySettingsToForm(original);
    syncPreferencesDialogLanguage(original);
    await onSaved?.(original, { preview: true });
  }

  async function handleCancel() {
    if (isClosing) {
      return;
    }
    isClosing = true;
    closeModal();
    try {
      await restoreOriginalSettings();
    } finally {
      isClosing = false;
    }
  }

  async function handleSave() {
    if (isClosing) {
      return;
    }

    const current = readCurrentSettings();
    const result = await api.saveUiConfig({
      Theme: current.theme,
      Language: current.language,
      FontScaleStep: current.fontScaleStep,
      ColorThemeIndex: current.colorThemeIndex,
      UseCustomAccentColor: current.useCustomAccentColor,
      CustomAccentArgb: current.customAccentArgb
    });
    if (result?.ok === false) {
      await restoreOriginalSettings();
      showApiError(t.errPreferences, result);
      return;
    }

    isClosing = true;
    closeModal();
    try {
      await onSaved?.(current, { preview: false });
    } finally {
      isClosing = false;
    }
  }

  const cancelButton = createButton(t.buttonCancel, {
    onClick: () => {
      void handleCancel();
    }
  });
  const saveButton = createButton(t.buttonSave, {
    primary: true,
    onClick: () => {
      void handleSave();
    }
  });
  saveButton.classList.add('pastel-save-btn');

  themeSelect.addEventListener('change', () => {
    if (previewSuspended || isClosing) {
      return;
    }
    colorPicker.setThemeMode(themeSelect.value === 'Dark');
    void applyLivePreview();
  });
  languageSelect.addEventListener('change', () => {
    if (previewSuspended || isClosing) {
      return;
    }
    void applyLivePreview();
  });
  fontScaleSelect.addEventListener('change', () => {
    if (previewSuspended || isClosing) {
      return;
    }
    void applyLivePreview();
  });

  openModal({
    title: t.preferencesTitle,
    bodyNode: body,
    onDismiss: () => {
      void handleCancel();
    },
    footerNodes: [cancelButton, saveButton]
  });
}

export async function showPageHistoryDialog(api, pageId, pageTitle, onRestored) {
  const result = await api.getPageVersions(pageId);
  if (!result.ok) {
    showApiError('버전 이력', result);
    return;
  }

  const body = document.createElement('div');
  body.className = 'history-layout';
  const list = document.createElement('div');
  list.className = 'history-list';
  const preview = document.createElement('pre');
  preview.className = 'history-preview';

  let selectedVersionId = null;
  for (const version of result.versions) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-item';
    item.textContent = `${version.savedAt} · ${version.savedByUsername} · ${version.title}`;
    item.addEventListener('click', async () => {
      selectedVersionId = version.id;
      list.querySelectorAll('.history-item').forEach((el) => el.classList.remove('is-active'));
      item.classList.add('is-active');
      const detail = await api.getPageVersion(version.id);
      preview.textContent = detail.ok ? `# ${detail.version.title}\n\n${detail.version.content}` : '';
    });
    list.appendChild(item);
  }

  body.append(list, preview);

  openModal({
    title: `버전 이력 - ${pageTitle}`,
    bodyNode: body,
    footerNodes: [
      createButton('닫기', { onClick: closeModal }),
      createButton('복원', {
        primary: true,
        onClick: async () => {
          if (!selectedVersionId) {
            return;
          }
          const confirmed = await showConfirmDialog({
            title: '버전 복원',
            message: '선택한 버전으로 복원할까요?'
          });
          if (!confirmed) {
            return;
          }
          const restored = await api.restorePageVersion(selectedVersionId);
          if (!restored.ok) {
            showApiError('버전 복원', restored);
            return;
          }
          closeModal();
          onRestored?.(restored.page);
        }
      })
    ]
  });
}

export async function showNewPageDialog(api, templateLanguage = 'ko') {
  const result = await api.listPageTemplates(templateLanguage);
  if (!result.ok) {
    showApiError(t.errPageTemplates, result);
    return null;
  }
  const templateList = result.templates?.length
    ? result.templates
    : [
        {
          id: 'blank',
          name: t.noTemplatesName,
          description: t.noTemplatesDesc
        }
      ];

  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'form-grid';

    const titleLabel = document.createElement('label');
    titleLabel.textContent = t.newPageTitleLabel(t.untitledPageTitle);
    const titleInput = document.createElement('input');
    titleInput.className = 'modal-input';
    titleInput.type = 'text';
    titleLabel.appendChild(titleInput);

    const templateLabel = document.createElement('label');
    templateLabel.textContent = t.newPageTemplateLabel;
    const templateSelect = document.createElement('select');
    templateSelect.className = 'modal-input';
    for (const template of templateList) {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.description ? `${template.name} — ${template.description}` : template.name;
      templateSelect.appendChild(option);
    }
    templateLabel.appendChild(templateSelect);

    body.append(titleLabel, templateLabel);

    const finish = (value) => {
      closeModal();
      resolve(value);
    };

    openModal({
      title: t.menuNewPage,
      bodyNode: body,
      footerNodes: [
        createButton(t.buttonCancel, { onClick: () => finish(null) }),
        createButton(t.buttonCreate, {
          primary: true,
          onClick: () =>
            finish({
              title: titleInput.value,
              templateId: templateSelect.value || templateList[0]?.id || 'blank'
            })
        })
      ]
    });

    titleInput.focus();
  });
}

export function showTableInsertDialog() {
  return showTableInsertPopup();
}

export async function showDatabaseSettingsDialog(api, { onDisconnected, onSaved } = {}) {
  const loaded = await api.getDatabaseConfig();
  if (!loaded.ok) {
    showApiError(t.dbSettingsTitle, loaded);
    return;
  }

  const providers = loaded.providers || [];
  const status = loaded.status || {};
  const config = loaded.config || {};

  const body = document.createElement('div');
  body.className = 'form-grid db-settings-form';

  const providerLabel = document.createElement('label');
  providerLabel.textContent = t.dbLabelProvider;
  const providerSelect = document.createElement('select');
  providerSelect.className = 'modal-input';
  for (const provider of providers) {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.name;
    option.dataset.defaultPort = provider.defaultPort || '';
    providerSelect.appendChild(option);
  }
  providerSelect.value = config.Provider || 'SQLite';
  providerLabel.appendChild(providerSelect);

  const serverPanel = document.createElement('div');
  serverPanel.className = 'db-server-panel form-grid';
  serverPanel.innerHTML = `
    <label>${t.dbLabelServer}<input id="db-server" class="modal-input" type="text" /></label>
    <label>${t.dbLabelPort}<input id="db-port" class="modal-input" type="text" /></label>
    <label>${t.dbLabelDatabase}<input id="db-name" class="modal-input" type="text" /></label>
    <label>${t.dbLabelUser}<input id="db-user" class="modal-input" type="text" /></label>
    <label>${t.dbLabelPassword}<input id="db-password" class="modal-input" type="password" /></label>
  `;

  const sqlitePanel = document.createElement('div');
  sqlitePanel.className = 'db-sqlite-panel form-grid';
  const sqliteRow = document.createElement('label');
  sqliteRow.textContent = t.dbLabelSqliteFile;
  const sqliteInputRow = document.createElement('div');
  sqliteInputRow.className = 'db-sqlite-row';
  const sqliteInput = document.createElement('input');
  sqliteInput.id = 'db-sqlite-path';
  sqliteInput.className = 'modal-input';
  sqliteInput.type = 'text';
  const browseBtn = createButton(t.dbButtonBrowse, {
    onClick: async () => {
      const picked = await api.browseSqliteFile();
      if (picked?.ok && picked.filePath) {
        sqliteInput.value = picked.filePath;
      }
    }
  });
  sqliteInputRow.append(sqliteInput, browseBtn);
  sqliteRow.appendChild(sqliteInputRow);
  sqlitePanel.appendChild(sqliteRow);

  const resultLine = document.createElement('p');
  resultLine.className = 'db-result-line';
  resultLine.textContent = status.connected ? t.dbConnectionActiveStatus : t.dbConnectionDisconnectedStatus;

  body.append(providerLabel, serverPanel, sqlitePanel, resultLine);

  function readForm() {
    return {
      Provider: providerSelect.value,
      Server: body.querySelector('#db-server').value.trim(),
      Port: body.querySelector('#db-port').value.trim(),
      Database: body.querySelector('#db-name').value.trim(),
      User: body.querySelector('#db-user').value.trim(),
      Password: body.querySelector('#db-password').value,
      SqliteFilePath: sqliteInput.value.trim()
    };
  }

  function applyFormValues(values) {
    providerSelect.value = values.Provider || 'SQLite';
    body.querySelector('#db-server').value = values.Server || 'localhost';
    body.querySelector('#db-port').value = values.Port || '';
    body.querySelector('#db-name').value = values.Database || 'myworkspace';
    body.querySelector('#db-user').value = values.User || '';
    body.querySelector('#db-password').value = values.Password || '';
    sqliteInput.value = values.SqliteFilePath || loaded.defaultSqlitePath || '';
    updateProviderUi();
  }

  function updateProviderUi() {
    const isSqlite = providerSelect.value === 'SQLite';
    serverPanel.classList.toggle('hidden', isSqlite);
    sqlitePanel.classList.toggle('hidden', !isSqlite);
    if (isSqlite && !sqliteInput.value.trim()) {
      sqliteInput.value = loaded.defaultSqlitePath || '';
    }
    const selected = providerSelect.selectedOptions[0];
    const defaultPort = selected?.dataset.defaultPort;
    if (!isSqlite && defaultPort && !body.querySelector('#db-port').value.trim()) {
      body.querySelector('#db-port').value = defaultPort;
    }
    if (providerSelect.value === 'PostgreSQL' && !body.querySelector('#db-user').value.trim()) {
      body.querySelector('#db-user').value = 'postgres';
    }
    if (
      (providerSelect.value === 'MariaDB' || providerSelect.value === 'MySQL') &&
      !body.querySelector('#db-user').value.trim()
    ) {
      body.querySelector('#db-user').value = 'root';
    }
  }

  providerSelect.addEventListener('change', updateProviderUi);
  applyFormValues(config);

  const footerNodes = [
    createButton(t.buttonCancel, { onClick: closeModal }),
    createButton(t.dbButtonTestConnection, {
      onClick: async () => {
        resultLine.textContent = t.dbTestingConnection;
        const result = await api.testDatabaseConfig(readForm());
        if (!result.ok) {
          resultLine.textContent = t.dbConnectionFailed;
          showApiError(t.dbConnectionFailed, result);
          return;
        }
        resultLine.textContent = result.databaseCreated ? t.dbConnectionSuccessCreated : t.dbConnectionSuccess;
      }
    })
  ];

  if (!config.ConnectionDisabled) {
    footerNodes.push(
      createButton(t.dbButtonDisconnect, {
        onClick: async () => {
          const confirmed = await showConfirmDialog({
            title: t.dbSettingsTitle,
            message: t.confirmDisconnectDatabase
          });
          if (!confirmed) {
            return;
          }
          const result = await api.disconnectDatabase();
          if (!result.ok) {
            showApiError(t.dbSettingsTitle, result);
            return;
          }
          closeModal();
          onDisconnected?.();
        }
      })
    );
  }

  footerNodes.push(
    createButton(t.buttonSave, {
      primary: true,
      onClick: async () => {
        const payload = readForm();
        const result = await api.saveDatabaseConfig(payload);
        if (!result.ok) {
          showApiError(t.dbSettingsTitle, result);
          return;
        }
        closeModal();
        await showConfirmDialog({
          title: t.dbSettingsTitle,
          message: t.dbSaved,
          confirmLabel: t.buttonOk,
          cancelLabel: t.buttonClose
        });
        onSaved?.(result);
      }
    })
  );

  openModal({
    title: t.dbSettingsTitle,
    bodyNode: body,
    footerNodes
  });
}

export function showAdminPlaceholder(title) {
  const body = document.createElement('p');
  body.textContent = t.featureComingSoon;
  openModal({
    title,
    bodyNode: body,
    footerNodes: [createButton('닫기', { primary: true, onClick: closeModal })]
  });
}

export function showAddUserDialog(initial = null) {
  return new Promise((resolve) => {
    const isEdit = Boolean(initial);
    const body = document.createElement('div');
    body.className = 'add-user-dialog form-grid';

    const prompt = document.createElement('p');
    prompt.className = 'add-user-prompt';
    prompt.textContent = isEdit ? t.userAdminEditPrompt : t.userAdminAddPrompt;
    body.appendChild(prompt);

    const errorEl = document.createElement('p');
    errorEl.className = 'add-user-error hidden';
    errorEl.setAttribute('role', 'alert');
    body.appendChild(errorEl);

    const usernameInput = document.createElement('input');
    usernameInput.className = 'modal-input';
    usernameInput.type = 'text';
    usernameInput.autocomplete = 'username';
    usernameInput.required = true;
    usernameInput.value = initial?.username || '';

    const displayNameInput = document.createElement('input');
    displayNameInput.className = 'modal-input';
    displayNameInput.type = 'text';
    displayNameInput.autocomplete = 'name';
    displayNameInput.required = true;
    displayNameInput.value = initial?.displayName || '';

    const passwordInput = document.createElement('input');
    passwordInput.className = 'modal-input';
    passwordInput.type = 'password';
    passwordInput.autocomplete = 'new-password';
    passwordInput.required = !isEdit;
    passwordInput.placeholder = isEdit ? t.userAdminPasswordOptional : '';

    const emailInput = document.createElement('input');
    emailInput.className = 'modal-input';
    emailInput.type = 'email';
    emailInput.autocomplete = 'email';
    emailInput.value = initial?.email || '';

    const roleSelect = document.createElement('select');
    roleSelect.className = 'modal-input';
    roleSelect.innerHTML = `
      <option value="User">${t.userAdminRoleUser}</option>
      <option value="Admin">${t.userAdminRoleAdmin}</option>
    `;
    roleSelect.value = initial?.role || 'User';

    for (const [labelText, control] of [
      [t.userAdminUsername, usernameInput],
      [t.userAdminDisplayName, displayNameInput],
      [t.userAdminPassword, passwordInput],
      [t.userAdminEmail, emailInput],
      [t.userAdminRole, roleSelect]
    ]) {
      const label = document.createElement('label');
      label.textContent = labelText;
      label.appendChild(control);
      body.appendChild(label);
    }

    const hint = document.createElement('p');
    hint.className = 'modal-hint add-user-role-hint';
    hint.textContent = isEdit ? t.userAdminEditHint : t.userAdminRoleHint;
    body.appendChild(hint);

    const showError = (message) => {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    };
    const clearError = () => {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    };

    const finish = (value) => {
      closeModal();
      resolve(value);
    };

    const submit = () => {
      clearError();
      const username = usernameInput.value.trim();
      const displayName = displayNameInput.value.trim();
      const password = passwordInput.value;
      const email = emailInput.value.trim();
      const role = roleSelect.value;

      if (!username) {
        showError(t.userAdminUsernameRequired);
        usernameInput.focus();
        return;
      }
      if (!displayName) {
        showError(t.userAdminDisplayNameRequired);
        displayNameInput.focus();
        return;
      }
      if (!isEdit && !password) {
        showError(t.userAdminPasswordRequired);
        passwordInput.focus();
        return;
      }

      finish({
        username,
        displayName,
        email,
        role,
        password: password || null
      });
    };

    openModal({
      title: isEdit ? t.userAdminEditTitle : t.userAdminAddTitle,
      bodyNode: body,
      cardClassName: 'modal-card--compact add-user-modal-card',
      footerNodes: [
        createButton(t.buttonCancel, { onClick: () => finish(null) }),
        createButton(isEdit ? t.buttonSave : t.userAdminAdd, { primary: true, onClick: submit })
      ]
    });

    usernameInput.focus();
    body.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
  });
}

export async function showUserAdminDialog(api) {
  const result = await api.getUsers();
  if (!result.ok) {
    showApiError('사용자 관리', result);
    return;
  }

  const body = document.createElement('div');
  body.className = 'admin-users-layout';
  const list = document.createElement('div');
  list.className = 'admin-users-list';

  const renderUsers = (users) => {
    list.replaceChildren();
    if (!users.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-users-empty';
      empty.textContent = t.userAdminEmpty;
      list.appendChild(empty);
      return;
    }

    for (const user of users) {
      const row = document.createElement('div');
      row.className = 'admin-user-row';

      const summary = document.createElement('div');
      summary.className = 'admin-user-summary';
      summary.title = [
        user.displayName || user.username,
        `${t.userAdminUsername}: ${user.username}`,
        `${t.userAdminEmail}: ${user.email || '-'}`,
        String(user.role).toLowerCase() === 'admin' ? t.userAdminRoleAdmin : t.userAdminRoleUser
      ].join('\n');

      const name = document.createElement('span');
      name.className = 'admin-user-name';
      name.textContent = user.displayName || user.username;
      summary.appendChild(name);

      const appendSeparator = () => {
        const separator = document.createElement('span');
        separator.className = 'admin-user-sep';
        separator.textContent = '·';
        separator.setAttribute('aria-hidden', 'true');
        summary.appendChild(separator);
      };

      if (user.displayName && user.displayName !== user.username) {
        appendSeparator();
        const id = document.createElement('span');
        id.className = 'admin-user-id';
        id.textContent = user.username;
        summary.appendChild(id);
      }

      appendSeparator();
      const email = document.createElement('span');
      email.className = 'admin-user-email';
      email.textContent = user.email || '-';
      summary.appendChild(email);

      appendSeparator();
      const roleBadge = document.createElement('span');
      roleBadge.className = `admin-user-role-badge${String(user.role).toLowerCase() === 'admin' ? ' is-admin' : ''}`;
      roleBadge.textContent = String(user.role).toLowerCase() === 'admin'
        ? t.userAdminRoleAdmin
        : t.userAdminRoleUser;
      summary.appendChild(roleBadge);

      row.appendChild(summary);

      const actions = document.createElement('div');
      actions.className = 'admin-user-actions';

      const editBtn = createButton(t.userAdminEdit, {
        onClick: async () => {
          const payload = await showAddUserDialog({
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            role: user.role
          });
          if (!payload) {
            return;
          }
          const updated = await api.updateUser({
            id: user.id,
            username: payload.username,
            displayName: payload.displayName,
            email: payload.email,
            role: payload.role,
            newPassword: payload.password
          });
          if (!updated.ok) {
            showApiError(t.userAdminEditTitle, updated);
            return;
          }
          const refreshed = await api.getUsers();
          if (refreshed.ok) {
            renderUsers(refreshed.users);
          }
        }
      });

      const deleteBtn = createButton(t.userAdminDelete, {
        onClick: async () => {
          const confirmed = await showConfirmDialog({
            title: t.userAdminDeleteTitle,
            message: t.userAdminDeleteConfirm(user.username),
            confirmLabel: t.userAdminDelete,
            danger: true
          });
          if (!confirmed) {
            return;
          }
          const deleted = await api.deleteUser(user.id);
          if (!deleted.ok) {
            showApiError('사용자 삭제', deleted);
            return;
          }
          const refreshed = await api.getUsers();
          if (refreshed.ok) {
            renderUsers(refreshed.users);
          }
        }
      });

      actions.append(editBtn, deleteBtn);
      row.appendChild(actions);
      list.appendChild(row);
    }
  };

  renderUsers(result.users);
  body.appendChild(list);

  openModal({
    title: t.userAdminTitle,
    bodyNode: body,
    footerNodes: [
      createButton(t.buttonClose, { onClick: closeModal }),
      createButton(t.userAdminAdd, {
        primary: true,
        onClick: async () => {
          const payload = await showAddUserDialog();
          if (!payload) {
            return;
          }
          const created = await api.createUser({
            username: payload.username,
            displayName: payload.displayName,
            email: payload.email,
            password: payload.password,
            role: payload.role
          });
          if (!created.ok) {
            showApiError(t.userAdminAddTitle, created);
            return;
          }
          const refreshed = await api.getUsers();
          if (refreshed.ok) {
            renderUsers(refreshed.users);
          }
        }
      })
    ]
  });
}

export async function showEditProfileDialog(api, onUpdated) {
  const profile = await api.getProfile();
  if (!profile.ok) {
    showApiError(t.profileEditTitle, profile);
    return;
  }

  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'add-user-dialog form-grid';

    const prompt = document.createElement('p');
    prompt.className = 'add-user-prompt';
    prompt.textContent = t.profileEditPrompt;
    body.appendChild(prompt);

    const errorEl = document.createElement('p');
    errorEl.className = 'add-user-error hidden';
    errorEl.setAttribute('role', 'alert');
    body.appendChild(errorEl);

    const usernameInput = document.createElement('input');
    usernameInput.className = 'modal-input';
    usernameInput.type = 'text';
    usernameInput.autocomplete = 'username';
    usernameInput.required = true;
    usernameInput.value = profile.user.username || '';

    const displayNameInput = document.createElement('input');
    displayNameInput.className = 'modal-input';
    displayNameInput.type = 'text';
    displayNameInput.autocomplete = 'name';
    displayNameInput.required = true;
    displayNameInput.value = profile.user.displayName || '';

    const emailInput = document.createElement('input');
    emailInput.className = 'modal-input';
    emailInput.type = 'email';
    emailInput.autocomplete = 'email';
    emailInput.value = profile.user.email || '';

    const currentPasswordInput = document.createElement('input');
    currentPasswordInput.className = 'modal-input';
    currentPasswordInput.type = 'password';
    currentPasswordInput.autocomplete = 'current-password';

    const newPasswordInput = document.createElement('input');
    newPasswordInput.className = 'modal-input';
    newPasswordInput.type = 'password';
    newPasswordInput.autocomplete = 'new-password';

    const confirmPasswordInput = document.createElement('input');
    confirmPasswordInput.className = 'modal-input';
    confirmPasswordInput.type = 'password';
    confirmPasswordInput.autocomplete = 'new-password';

    for (const [labelText, control] of [
      [t.userAdminUsername, usernameInput],
      [t.userAdminDisplayName, displayNameInput],
      [t.userAdminEmail, emailInput],
      [t.profileCurrentPassword, currentPasswordInput],
      [t.profileNewPassword, newPasswordInput],
      [t.profileNewPasswordConfirm, confirmPasswordInput]
    ]) {
      const label = document.createElement('label');
      label.textContent = labelText;
      label.appendChild(control);
      body.appendChild(label);
    }

    const hint = document.createElement('p');
    hint.className = 'modal-hint add-user-role-hint';
    hint.textContent = t.profilePasswordChangeHint;
    body.appendChild(hint);

    const showError = (message) => {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    };
    const clearError = () => {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    };

    const finish = async (saved = false) => {
      closeModal();
      resolve(saved);
    };

    const submit = async () => {
      clearError();

      const username = usernameInput.value.trim();
      const displayName = displayNameInput.value.trim();
      const email = emailInput.value.trim();
      const currentPassword = currentPasswordInput.value;
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (!username) {
        showError(t.userAdminUsernameRequired);
        usernameInput.focus();
        return;
      }
      if (!displayName) {
        showError(t.userAdminDisplayNameRequired);
        displayNameInput.focus();
        return;
      }
      if (newPassword || confirmPassword || currentPassword) {
        if (!currentPassword) {
          showError(t.profileCurrentPasswordRequired);
          currentPasswordInput.focus();
          return;
        }
        if (!newPassword) {
          showError(t.userAdminPasswordRequired);
          newPasswordInput.focus();
          return;
        }
        if (newPassword !== confirmPassword) {
          showError(t.userAdminPasswordMismatch);
          confirmPasswordInput.focus();
          return;
        }
      }

      const result = await api.updateProfile({
        username,
        displayName,
        email,
        currentPassword: newPassword ? currentPassword : undefined,
        newPassword: newPassword || undefined
      });
      if (!result.ok) {
        showApiError(t.profileEditTitle, result);
        return;
      }

      onUpdated?.(result.user);
      await finish(true);
    };

    openModal({
      title: t.profileEditTitle,
      bodyNode: body,
      cardClassName: 'modal-card--compact add-user-modal-card',
      footerNodes: [
        createButton(t.buttonCancel, { onClick: () => finish(false) }),
        createButton(t.buttonSave, { primary: true, onClick: () => void submit() })
      ]
    });

    usernameInput.focus();
    body.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    });
  });
}

export async function showChangePasswordDialog(api) {
  await showEditProfileDialog(api);
}

export async function showNotificationsDialog(api, { onOpenNotification, onUpdated } = {}) {
  const initial = await api.getNotifications();
  if (!initial.ok) {
    showApiError(t.notificationsTitle, initial);
    return;
  }

  let notifications = initial.notifications;

  const formatNotificationKind = (kind) => {
    if (kind === 'comment') {
      return t.notificationsKindComment;
    }
    return kind || '-';
  };

  const body = document.createElement('div');
  body.className = 'notifications-layout notifications-layout--table';

  const table = document.createElement('div');
  table.className = 'notifications-table';

  const header = document.createElement('div');
  header.className = 'notifications-table-header';

  const headerMain = document.createElement('div');
  headerMain.className = 'notification-row-main';
  for (const label of [
    t.notificationsColActor,
    t.notificationsColWhen,
    t.notificationsColKind,
    t.notificationsColContent
  ]) {
    const cell = document.createElement('span');
    cell.textContent = label;
    headerMain.appendChild(cell);
  }

  const headerActions = document.createElement('span');
  headerActions.className = 'notifications-table-header-actions';
  headerActions.setAttribute('aria-hidden', 'true');
  header.append(headerMain, headerActions);

  const list = document.createElement('div');
  list.className = 'notifications-list';

  const openNotification = async (notification) => {
    if (!notification) {
      return;
    }

    if (!notification.isRead) {
      const marked = await api.markNotificationRead(notification.id);
      if (marked.ok) {
        notification.isRead = true;
        onUpdated?.();
      }
    }

    if (notification.pageId && onOpenNotification) {
      closeModal();
      await onOpenNotification(notification);
      onUpdated?.();
      return;
    }

    renderNotifications();
  };

  const renderNotifications = () => {
    list.replaceChildren();
    if (!notifications.length) {
      const empty = document.createElement('p');
      empty.className = 'notifications-empty';
      empty.textContent = t.notificationsEmpty;
      list.appendChild(empty);
      return;
    }

    for (const notification of notifications) {
      const row = document.createElement('div');
      row.className = `notification-row${notification.isRead ? '' : ' is-unread'}`;

      const main = document.createElement('div');
      main.className = 'notification-row-main';
      main.setAttribute('role', 'button');
      main.tabIndex = 0;

      const actorEl = document.createElement('span');
      actorEl.className = 'notification-cell notification-cell-actor';
      actorEl.textContent = notification.actorUsername || '-';

      const whenEl = document.createElement('span');
      whenEl.className = 'notification-cell notification-cell-when';
      whenEl.textContent = notification.createdAt || '-';

      const kindEl = document.createElement('span');
      kindEl.className = 'notification-cell notification-cell-kind';
      kindEl.textContent = formatNotificationKind(notification.kind);

      const contentEl = document.createElement('span');
      contentEl.className = 'notification-cell notification-cell-content';

      const titleEl = document.createElement('span');
      titleEl.className = 'notification-content-title';
      titleEl.textContent = notification.title || '';

      const bodyEl = document.createElement('span');
      bodyEl.className = 'notification-content-body';
      bodyEl.textContent = notification.body || '';

      contentEl.append(titleEl);
      if (notification.body && notification.body !== notification.title) {
        contentEl.appendChild(bodyEl);
      }

      main.append(actorEl, whenEl, kindEl, contentEl);
      main.addEventListener('click', () => {
        void openNotification(notification);
      });
      main.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void openNotification(notification);
        }
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'notification-delete';
      deleteButton.textContent = '×';
      deleteButton.setAttribute('aria-label', t.notificationsDelete);
      deleteButton.title = t.notificationsDelete;
      deleteButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const deleted = await api.deleteNotification(notification.id);
        if (!deleted.ok) {
          showApiError(t.notificationsTitle, deleted);
          return;
        }
        notifications = notifications.filter((item) => item.id !== notification.id);
        renderNotifications();
        onUpdated?.();
      });

      row.append(main, deleteButton);
      list.appendChild(row);
    }
  };

  const reloadNotifications = async () => {
    const result = await api.getNotifications();
    if (!result.ok) {
      showApiError(t.notificationsTitle, result);
      return;
    }
    notifications = result.notifications;
    renderNotifications();
  };

  renderNotifications();
  table.append(header, list);
  body.appendChild(table);

  const markAllButton = createButton(t.notificationsMarkAllRead, {
    onClick: async () => {
      const marked = await api.markAllNotificationsRead();
      if (!marked.ok) {
        showApiError(t.notificationsTitle, marked);
        return;
      }
      await reloadNotifications();
      onUpdated?.();
    }
  });

  const deleteAllButton = createButton(t.notificationsDeleteAll, {
    onClick: async () => {
      const confirmed = await showConfirmDialog({
        title: t.notificationsDeleteAll,
        message: t.notificationsDeleteAllConfirm
      });
      if (!confirmed) {
        return;
      }
      const deleted = await api.deleteAllNotifications();
      if (!deleted.ok) {
        showApiError(t.notificationsTitle, deleted);
        return;
      }
      notifications = [];
      renderNotifications();
      onUpdated?.();
    }
  });

  const settingsButton = createButton(t.menuNotificationSettings, {
    onClick: async () => {
      closeModal();
      await showNotificationSettingsDialog(api, onUpdated);
    }
  });

  openModal({
    title: t.notificationsTitle,
    bodyNode: body,
    cardClassName: 'notifications-modal-card',
    footerNodes: [
      createButton(t.buttonClose, { onClick: closeModal }),
      deleteAllButton,
      markAllButton,
      settingsButton
    ],
    onDismiss: () => {
      closeModal();
      onUpdated?.();
    }
  });
}

export async function showNotificationSettingsDialog(api, onUpdated) {
  const profile = await api.getProfile();
  if (!profile.ok) {
    showApiError(t.notificationSettingsTitle, profile);
    return;
  }

  const body = document.createElement('div');
  body.className = 'form-grid';
  body.innerHTML = `
    <label>${t.notificationEmailLabel}
      <input id="notify-email" class="modal-input" type="email" />
    </label>
    <label class="checkbox-row">
      <input id="notify-page" type="checkbox" />
      ${t.notificationPageUpdate}
    </label>
    <label class="checkbox-row">
      <input id="notify-workspace" type="checkbox" />
      ${t.notificationWorkspaceChange}
    </label>
    <label class="checkbox-row">
      <input id="notify-comment" type="checkbox" />
      ${t.notificationComment}
    </label>
  `;
  body.querySelector('#notify-email').value = profile.user.email || '';
  body.querySelector('#notify-page').checked = Boolean(profile.user.notifyOnPageUpdate);
  body.querySelector('#notify-workspace').checked = Boolean(profile.user.notifyOnWorkspaceChange);
  body.querySelector('#notify-comment').checked = Boolean(profile.user.notifyOnComment);

  const saveButton = createButton(t.buttonSave, {
    primary: true,
    onClick: async () => {
      const result = await api.updateNotificationSettings({
        email: body.querySelector('#notify-email').value,
        notifyOnPageUpdate: body.querySelector('#notify-page').checked,
        notifyOnWorkspaceChange: body.querySelector('#notify-workspace').checked,
        notifyOnComment: body.querySelector('#notify-comment').checked
      });
      if (!result.ok) {
        showApiError(t.notificationSettingsTitle, result);
        return;
      }
      closeModal();
      onUpdated?.(result.user);
    }
  });
  saveButton.classList.add('pastel-save-btn');

  openModal({
    title: t.notificationSettingsTitle,
    bodyNode: body,
    footerNodes: [
      createButton(t.buttonCancel, { onClick: closeModal }),
      saveButton
    ]
  });
}

export function showExportFormatDialog(title) {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'export-format-dialog';

    const prompt = document.createElement('p');
    prompt.className = 'export-format-prompt';
    prompt.textContent = t.exportFormatPrompt;
    body.appendChild(prompt);

    const fieldset = document.createElement('fieldset');
    fieldset.className = 'export-format-group';
    const legend = document.createElement('legend');
    legend.textContent = t.exportFormatLegend;
    fieldset.appendChild(legend);

    for (const [value, label] of [
      ['markdown', t.exportFormatMarkdown],
      ['html', t.exportFormatHtml],
      ['word', t.exportFormatWord],
      ['pdf', t.exportFormatPdf]
    ]) {
      const option = document.createElement('label');
      option.className = 'export-format-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'export-format';
      input.value = value;
      input.checked = value === 'markdown';
      const text = document.createElement('span');
      text.textContent = label;
      option.append(input, text);
      fieldset.appendChild(option);
    }
    body.appendChild(fieldset);

    const optionsSection = document.createElement('div');
    optionsSection.className = 'export-format-options';
    optionsSection.id = 'export-markdown-options';

    const optionsLegend = document.createElement('div');
    optionsLegend.className = 'export-format-options-title';
    optionsLegend.textContent = t.exportFormatOptionsLegend;
    optionsSection.appendChild(optionsLegend);

    const base64Option = document.createElement('label');
    base64Option.className = 'export-format-checkbox';
    base64Option.id = 'export-base64-option';
    const base64Checkbox = document.createElement('input');
    base64Checkbox.type = 'checkbox';
    base64Checkbox.id = 'export-embed-images-base64';
    const base64Label = document.createElement('span');
    base64Label.textContent = t.exportEmbedImagesBase64;
    base64Option.append(base64Checkbox, base64Label);
    optionsSection.appendChild(base64Option);

    const base64Hint = document.createElement('p');
    base64Hint.className = 'modal-hint export-base64-hint';
    base64Hint.id = 'export-base64-hint';
    base64Hint.textContent = t.exportEmbedImagesBase64Hint;
    optionsSection.appendChild(base64Hint);
    body.appendChild(optionsSection);

    function syncBase64OptionVisibility() {
      const selected = body.querySelector('input[name="export-format"]:checked');
      const show = selected?.value === 'markdown';
      optionsSection.classList.toggle('hidden', !show);
    }

    body.querySelectorAll('input[name="export-format"]').forEach((input) => {
      input.addEventListener('change', syncBase64OptionVisibility);
    });
    syncBase64OptionVisibility();

    const finish = (value) => {
      closeModal();
      resolve(value);
    };

    const submit = () => {
      const selected = body.querySelector('input[name="export-format"]:checked');
      finish({
        format: selected?.value || 'markdown',
        embedImagesAsBase64: Boolean(base64Checkbox.checked)
      });
    };

    openModal({
      title,
      bodyNode: body,
      cardClassName: 'modal-card--compact export-modal-card',
      footerNodes: [
        createButton(t.buttonCancel, { onClick: () => finish(null) }),
        createButton(t.exportAction, { primary: true, onClick: submit })
      ]
    });

    body.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
  });
}

export function showExportResultDialog({
  success = true,
  title,
  message,
  targetPath = '',
  errorMessage = ''
}) {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'export-result-dialog';

    const status = document.createElement('div');
    status.className = `export-result-status ${success ? 'is-success' : 'is-error'}`;
    status.setAttribute('aria-hidden', 'true');
    status.textContent = success ? '✓' : '✕';
    body.appendChild(status);

    const summary = document.createElement('p');
    summary.className = 'export-result-summary';
    summary.textContent = message || (success ? t.exportResultSuccess : t.exportResultFailed);
    body.appendChild(summary);

    const normalizedPath = String(targetPath || '').trim();
    if (success && normalizedPath) {
      const pathBlock = document.createElement('div');
      pathBlock.className = 'export-result-path-block';

      const pathLabel = document.createElement('div');
      pathLabel.className = 'export-result-path-label';
      pathLabel.textContent = t.exportResultDirectory;

      const pathValue = document.createElement('div');
      pathValue.className = 'export-result-path-value';
      pathValue.textContent = normalizedPath;
      pathValue.title = normalizedPath;

      pathBlock.append(pathLabel, pathValue);
      body.appendChild(pathBlock);
    }

    const errorText = String(errorMessage || '').trim();
    if (!success && errorText) {
      const errorEl = document.createElement('p');
      errorEl.className = 'export-result-error';
      errorEl.textContent = errorText;
      body.appendChild(errorEl);
    }

    const close = () => {
      closeModal();
      resolve();
    };

    openModal({
      title: title || t.exportPageTitle,
      bodyNode: body,
      cardClassName: 'modal-card--compact export-modal-card',
      footerNodes: [createButton(t.buttonOk, { primary: true, onClick: close })]
    });
  });
}

export async function showWorkspaceMembersDialog(api, workspaceId) {
  const load = async () => api.getWorkspaceMembers(workspaceId);
  let state = await load();
  if (!state.ok) {
    showApiError('멤버 관리', state);
    return;
  }

  const body = document.createElement('div');
  body.className = 'admin-users-layout';
  const list = document.createElement('div');
  list.className = 'admin-users-list';
  const addRow = document.createElement('div');
  addRow.className = 'form-grid';

  const userSelect = document.createElement('select');
  userSelect.className = 'modal-input';
  const roleSelect = document.createElement('select');
  roleSelect.className = 'modal-input';
  roleSelect.innerHTML = `
    <option value="Viewer">Viewer</option>
    <option value="Editor">Editor</option>
  `;

  addRow.innerHTML = '<label>사용자</label><label>역할</label>';
  addRow.children[0].appendChild(userSelect);
  addRow.children[1].appendChild(roleSelect);

  function renderMembers(data) {
    list.replaceChildren();
    userSelect.replaceChildren();
    for (const user of data.availableUsers || []) {
      const option = document.createElement('option');
      option.value = String(user.id);
      option.textContent = user.username;
      userSelect.appendChild(option);
    }

    for (const member of data.members || []) {
      const row = document.createElement('div');
      row.className = 'admin-user-row';
      row.innerHTML = `<div><strong>${member.username}</strong> <span>${member.role}</span></div>`;
      const actions = document.createElement('div');
      actions.className = 'admin-user-actions';

      if (member.role !== 'Owner') {
        const roleBtn = createButton('역할 변경', {
          onClick: async () => {
            const role = await showInputDialog({
              title: '역할 변경',
              label: '역할 (Viewer / Editor)',
              defaultValue: member.role
            });
            if (!role) {
              return;
            }
            const result = await api.updateWorkspaceMemberRole(workspaceId, member.userId, role);
            if (!result.ok) {
              showApiError('역할 변경', result);
              return;
            }
            state = await load();
            if (state.ok) {
              renderMembers(state);
            }
          }
        });
        const removeBtn = createButton('제거', {
          onClick: async () => {
            const confirmed = await showConfirmDialog({
              title: '멤버 제거',
              message: `${member.username} 멤버를 제거할까요?`,
              confirmLabel: '제거',
              danger: true
            });
            if (!confirmed) {
              return;
            }
            const result = await api.removeWorkspaceMember(workspaceId, member.userId);
            if (!result.ok) {
              showApiError('멤버 제거', result);
              return;
            }
            state = await load();
            if (state.ok) {
              renderMembers(state);
            }
          }
        });
        actions.append(roleBtn, removeBtn);
      }

      row.appendChild(actions);
      list.appendChild(row);
    }
  }

  renderMembers(state);
  body.append(list, addRow);

  openModal({
    title: t.menuWorkspaceMembers,
    bodyNode: body,
    footerNodes: [
      createButton('닫기', { onClick: closeModal }),
      createButton('멤버 추가', {
        primary: true,
        onClick: async () => {
          const userId = Number.parseInt(userSelect.value, 10);
          if (!Number.isFinite(userId)) {
            showApiError('멤버 추가', { message: '추가할 사용자를 선택하세요.' });
            return;
          }
          const result = await api.addWorkspaceMember(workspaceId, userId, roleSelect.value);
          if (!result.ok) {
            showApiError('멤버 추가', result);
            return;
          }
          state = await load();
          if (state.ok) {
            renderMembers(state);
          }
        }
      })
    ]
  });
}

export async function showEmailSettingsDialog(api) {
  const loaded = await api.getEmailConfig();
  if (!loaded.ok) {
    showApiError('이메일 서버 설정', loaded);
    return;
  }

  const config = loaded.config || {};
  const body = document.createElement('div');
  body.className = 'form-grid';
  body.innerHTML = `
    <label class="checkbox-row"><input id="email-enabled" type="checkbox" /> 이메일 알림 사용</label>
    <label>SMTP 호스트<input id="email-host" class="modal-input" type="text" /></label>
    <label>포트<input id="email-port" class="modal-input" type="number" /></label>
    <label class="checkbox-row"><input id="email-ssl" type="checkbox" /> SSL/TLS 사용</label>
    <label>사용자명<input id="email-user" class="modal-input" type="text" /></label>
    <label>비밀번호<input id="email-pass" class="modal-input" type="password" /></label>
    <label>보내는 주소<input id="email-from" class="modal-input" type="email" /></label>
    <label>표시 이름<input id="email-from-name" class="modal-input" type="text" /></label>
  `;

  body.querySelector('#email-enabled').checked = Boolean(config.Enabled);
  body.querySelector('#email-host').value = config.SmtpHost || '';
  body.querySelector('#email-port').value = config.Port || 587;
  body.querySelector('#email-ssl').checked = config.EnableSsl !== false;
  body.querySelector('#email-user').value = config.Username || '';
  body.querySelector('#email-pass').value = config.Password || '';
  body.querySelector('#email-from').value = config.FromAddress || '';
  body.querySelector('#email-from-name').value = config.FromDisplayName || 'MyWorkspace';

  openModal({
    title: '이메일 서버 설정',
    bodyNode: body,
    footerNodes: [
      createButton('닫기', { onClick: closeModal }),
      createButton('연결 테스트', {
        onClick: async () => {
          const payload = readEmailForm(body);
          const result = await api.testEmailConfig(payload);
          if (!result.ok) {
            showApiError('연결 테스트', result);
            return;
          }
          await showConfirmDialog({
            title: '연결 테스트',
            message: 'SMTP 서버 연결에 성공했습니다.',
            confirmLabel: '확인',
            cancelLabel: '닫기'
          });
        }
      }),
      createButton('저장', {
        primary: true,
        onClick: async () => {
          const payload = readEmailForm(body);
          const result = await api.saveEmailConfig(payload);
          if (!result.ok) {
            showApiError('이메일 서버 설정', result);
            return;
          }
          closeModal();
        }
      })
    ]
  });
}

function readEmailForm(body) {
  return {
    Enabled: body.querySelector('#email-enabled').checked,
    SmtpHost: body.querySelector('#email-host').value.trim(),
    Port: Number(body.querySelector('#email-port').value || 587),
    EnableSsl: body.querySelector('#email-ssl').checked,
    Username: body.querySelector('#email-user').value.trim(),
    Password: body.querySelector('#email-pass').value,
    FromAddress: body.querySelector('#email-from').value.trim(),
    FromDisplayName: body.querySelector('#email-from-name').value.trim() || 'MyWorkspace'
  };
}
