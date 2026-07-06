import { t } from '../i18n/index.js';
import { showApiError } from '../errors/errorDetail.js';
import { normalizeFontScaleStep } from '../ui/fontScale.js';

let layer = null;

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
    layer.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    layer.querySelector('.modal-close').addEventListener('click', closeModal);
  }
  return layer;
}

export function closeModal() {
  if (!layer) {
    return;
  }
  layer.classList.add('hidden');
  layer.querySelector('.modal-body').replaceChildren();
  layer.querySelector('.modal-footer').replaceChildren();
}

export function openModal({ title, bodyNode, footerNodes = [] }) {
  const root = ensureLayer();
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
  try {
    const result = await window.myworkspace.getAppInfo();
    if (result?.ok && result.version) {
      version = result.version;
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

export async function showPreferencesDialog(api, onSaved) {
  const config = await api.getUiConfig();
  const body = document.createElement('div');
  body.className = 'form-grid';
  body.innerHTML = `
    <label>${t.preferencesTheme}
      <select id="pref-theme">
        <option value="Light">${t.themeLight}</option>
        <option value="Dark">${t.themeDark}</option>
      </select>
    </label>
    <label>${t.preferencesLanguage}
      <select id="pref-language">
        <option value="Korean">${t.languageKorean}</option>
        <option value="English">${t.languageEnglish}</option>
      </select>
    </label>
    <label>${t.preferencesFontScale}
      <select id="pref-font-scale">
        <option value="-2">${t.fontScaleMuchSmaller}</option>
        <option value="-1">${t.fontScaleSmaller}</option>
        <option value="0">${t.fontScaleNormal}</option>
        <option value="1">${t.fontScaleLarger}</option>
        <option value="2">${t.fontScaleMuchLarger}</option>
      </select>
    </label>
    <p class="modal-hint">${t.preferencesRestartHint}</p>
  `;
  body.querySelector('#pref-theme').value = config.theme || 'Light';
  body.querySelector('#pref-language').value = config.language || 'Korean';
  body.querySelector('#pref-font-scale').value = String(normalizeFontScaleStep(config.fontScaleStep));

  openModal({
    title: t.preferencesTitle,
    bodyNode: body,
    footerNodes: [
      createButton(t.buttonCancel, { onClick: closeModal }),
      createButton(t.buttonSave, {
        primary: true,
        onClick: async () => {
          const theme = body.querySelector('#pref-theme').value;
          const language = body.querySelector('#pref-language').value;
          const fontScaleStep = normalizeFontScaleStep(body.querySelector('#pref-font-scale').value);
          const result = await api.saveUiConfig({
            Theme: theme,
            Language: language,
            FontScaleStep: fontScaleStep
          });
          if (result?.ok === false) {
            showApiError(t.errPreferences, result);
            return;
          }
          document.body.dataset.theme = theme.toLowerCase() === 'dark' ? 'dark' : 'light';
          onSaved?.({ theme, language, fontScaleStep });
          closeModal();
        }
      })
    ]
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
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'form-grid';
    body.innerHTML = `
      <label>${t.tableInsertRows}
        <input id="table-rows" class="modal-input" type="number" min="1" max="20" value="3" />
      </label>
      <label>${t.tableInsertCols}
        <input id="table-cols" class="modal-input" type="number" min="1" max="20" value="3" />
      </label>
    `;

    const finish = (value) => {
      closeModal();
      resolve(value);
    };

    openModal({
      title: t.tableInsertTitle,
      bodyNode: body,
      footerNodes: [
        createButton(t.buttonCancel, { onClick: () => finish(null) }),
        createButton(t.buttonInsert, {
          primary: true,
          onClick: () => {
            const rows = Number.parseInt(body.querySelector('#table-rows').value, 10) || 3;
            const cols = Number.parseInt(body.querySelector('#table-cols').value, 10) || 3;
            finish({
              rows: Math.min(20, Math.max(1, rows)),
              cols: Math.min(20, Math.max(1, cols))
            });
          }
        })
      ]
    });
  });
}

export function showDatabaseSettingsDialog() {
  const body = document.createElement('p');
  body.textContent =
    '현재 Electron 버전은 로컬 SQLite를 기본으로 사용합니다. MariaDB/MySQL/PostgreSQL 연결 UI는 WinV10과 동일하게 확장 예정입니다.';
  openModal({
    title: 'DB 연결 설정',
    bodyNode: body,
    footerNodes: [createButton('닫기', { primary: true, onClick: closeModal })]
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
    for (const user of users) {
      const row = document.createElement('div');
      row.className = 'admin-user-row';
      row.innerHTML = `<strong>${user.username}</strong> <span>${user.role}</span>`;
      const actions = document.createElement('div');
      actions.className = 'admin-user-actions';

      const editBtn = createButton('편집', {
        onClick: async () => {
          const username = await showInputDialog({
            title: '사용자 편집',
            label: '사용자 ID',
            defaultValue: user.username
          });
          if (username == null) {
            return;
          }
          const role = await showInputDialog({
            title: '사용자 편집',
            label: '역할 (Admin / User)',
            defaultValue: user.role
          });
          if (role == null) {
            return;
          }
          const newPassword = await showInputDialog({
            title: '사용자 편집',
            label: '새 비밀번호 (변경하지 않으면 비워두세요)',
            defaultValue: ''
          });
          if (newPassword == null) {
            return;
          }
          const updated = await api.updateUser({
            id: user.id,
            username,
            role,
            newPassword: newPassword.trim() || null
          });
          if (!updated.ok) {
            showApiError('사용자 편집', updated);
            return;
          }
          const refreshed = await api.getUsers();
          if (refreshed.ok) {
            renderUsers(refreshed.users);
          }
        }
      });

      const deleteBtn = createButton('삭제', {
        onClick: async () => {
          const confirmed = await showConfirmDialog({
            title: '사용자 삭제',
            message: `${user.username} 사용자를 삭제할까요?`,
            confirmLabel: '삭제',
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
    title: '사용자 관리',
    bodyNode: body,
    footerNodes: [
      createButton('닫기', { onClick: closeModal }),
      createButton('사용자 추가', {
        primary: true,
        onClick: async () => {
          const username = await showInputDialog({
            title: '사용자 추가',
            label: '사용자 ID'
          });
          if (!username?.trim()) {
            return;
          }
          const password = await showInputDialog({
            title: '사용자 추가',
            label: '비밀번호'
          });
          if (!password) {
            return;
          }
          const role = await showInputDialog({
            title: '사용자 추가',
            label: '역할 (Admin / User)',
            defaultValue: 'User'
          });
          if (!role) {
            return;
          }
          const created = await api.createUser({ username, password, role });
          if (!created.ok) {
            showApiError('사용자 추가', created);
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
    showApiError('프로필', profile);
    return;
  }

  const username = await showInputDialog({
    title: '프로필 편집',
    label: '사용자 ID',
    defaultValue: profile.user.username
  });
  if (username == null || !username.trim()) {
    return;
  }

  const result = await api.updateProfile(username.trim());
  if (!result.ok) {
    showApiError('프로필 편집', result);
    return;
  }
  onUpdated?.(result.user);
}

export async function showChangePasswordDialog(api) {
  const currentPassword = await showInputDialog({
    title: '비밀번호 변경',
    label: '현재 비밀번호'
  });
  if (currentPassword == null) {
    return;
  }
  const newPassword = await showInputDialog({
    title: '비밀번호 변경',
    label: '새 비밀번호'
  });
  if (newPassword == null) {
    return;
  }
  const confirmPassword = await showInputDialog({
    title: '비밀번호 변경',
    label: '새 비밀번호 확인'
  });
  if (confirmPassword == null) {
    return;
  }
  if (newPassword !== confirmPassword) {
    showApiError('비밀번호 변경', { message: '새 비밀번호가 일치하지 않습니다.' });
    return;
  }

  const result = await api.changePassword(currentPassword, newPassword);
  if (!result.ok) {
    showApiError('비밀번호 변경', result);
    return;
  }

  await showConfirmDialog({
    title: '비밀번호 변경',
    message: '비밀번호가 변경되었습니다.',
    confirmLabel: '확인',
    cancelLabel: '닫기'
  });
}

export async function showNotificationSettingsDialog(api, onUpdated) {
  const profile = await api.getProfile();
  if (!profile.ok) {
    showApiError('알림 설정', profile);
    return;
  }

  const body = document.createElement('div');
  body.className = 'form-grid';
  body.innerHTML = `
    <label>이메일
      <input id="notify-email" class="modal-input" type="email" />
    </label>
    <label class="checkbox-row">
      <input id="notify-page" type="checkbox" />
      Page 업데이트 알림
    </label>
    <label class="checkbox-row">
      <input id="notify-workspace" type="checkbox" />
      Workspace 변경 알림
    </label>
  `;
  body.querySelector('#notify-email').value = profile.user.email || '';
  body.querySelector('#notify-page').checked = Boolean(profile.user.notifyOnPageUpdate);
  body.querySelector('#notify-workspace').checked = Boolean(profile.user.notifyOnWorkspaceChange);

  openModal({
    title: '알림 설정',
    bodyNode: body,
    footerNodes: [
      createButton('취소', { onClick: closeModal }),
      createButton('저장', {
        primary: true,
        onClick: async () => {
          const result = await api.updateNotificationSettings({
            email: body.querySelector('#notify-email').value,
            notifyOnPageUpdate: body.querySelector('#notify-page').checked,
            notifyOnWorkspaceChange: body.querySelector('#notify-workspace').checked
          });
          if (!result.ok) {
            showApiError('알림 설정', result);
            return;
          }
          closeModal();
          onUpdated?.(result.user);
        }
      })
    ]
  });
}

export function showExportFormatDialog(title) {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'form-grid';
    body.innerHTML = `
      <label class="checkbox-row"><input type="radio" name="export-format" value="markdown" checked /> Markdown (.md)</label>
      <label class="checkbox-row"><input type="radio" name="export-format" value="word" /> Word (.docx)</label>
      <label class="checkbox-row"><input type="radio" name="export-format" value="pdf" /> PDF (.pdf)</label>
    `;

    const finish = (value) => {
      closeModal();
      resolve(value);
    };

    openModal({
      title,
      bodyNode: body,
      footerNodes: [
        createButton('취소', { onClick: () => finish(null) }),
        createButton('내보내기', {
          primary: true,
          onClick: () => {
            const selected = body.querySelector('input[name="export-format"]:checked');
            finish(selected?.value || 'markdown');
          }
        })
      ]
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
