import { useEffect, useState } from 'react';
import { Check, FolderKanban, KeyRound, Pencil, Save, UserCheck, UserPlus, UserX, X } from 'lucide-react';
import { api } from '../api/client.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { openRowContextMenu, useContextMenu } from '../components/ContextMenu.jsx';
import { getDisplayProjectName, getDisplayUserName } from '../lib/displayLabels.js';

function toAssignments(selectedIds, rolesById = {}) {
  return selectedIds.map((projectId) => ({
    projectId,
    memberRole: rolesById[projectId] || 'VIEWER',
  }));
}

function fromAssignments(projects) {
  const ids = projects.map((p) => p.id);
  const roles = Object.fromEntries(projects.map((p) => [p.id, p.memberRole || 'VIEWER']));
  return { ids, roles };
}

function projectDisplayLabel(project, t) {
  const inactive = project.isActive === false ? t('projects.inactiveSuffix') : '';
  return `${getDisplayProjectName(project, t)} (${project.code})${inactive}`;
}

function ProjectAssignmentList({ projects, selectedIds, rolesById, onChange, disabled }) {
  const { t } = useLanguage();
  if (!projects.length) return <p className="muted">{t('projects.noProjectsRegistered')}</p>;

  const setSelected = (projectId, checked) => {
    const nextIds = checked
      ? [...selectedIds, projectId]
      : selectedIds.filter((id) => id !== projectId);
    const nextRoles = { ...rolesById };
    if (checked && !nextRoles[projectId]) nextRoles[projectId] = 'VIEWER';
    onChange({ projectIds: nextIds, rolesById: nextRoles });
  };

  const setRole = (projectId, memberRole) => {
    onChange({ projectIds: selectedIds, rolesById: { ...rolesById, [projectId]: memberRole } });
  };

  return (
    <div className="project-member-picker">
      {projects.map((project) => {
        const selected = selectedIds.includes(project.id);
        return (
          <div key={project.id} className="project-member-picker__row">
            <label className="project-member-picker__item">
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected}
                onChange={(e) => setSelected(project.id, e.target.checked)}
              />
              <span className="project-member-picker__label">{projectDisplayLabel(project, t)}</span>
            </label>
            <select
              value={rolesById[project.id] || 'VIEWER'}
              disabled={disabled || !selected}
              onChange={(e) => setRole(project.id, e.target.value)}
              aria-label={t('projects.memberRoleFor', { name: project.name })}
            >
              <option value="VIEWER">{t('role.member.VIEWER')}</option>
              <option value="EDITOR">{t('role.member.EDITOR')}</option>
            </select>
          </div>
        );
      })}
    </div>
  );
}

export default function UsersPage() {
  const { openContextMenu } = useContextMenu();
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedRequests, setSelectedRequests] = useState([]);
  const [form, setForm] = useState({
    username: '', password: '', name: '', email: '', role: 'VIEWER', projectIds: [], rolesById: {},
  });
  const [editUserId, setEditUserId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editProjectIds, setEditProjectIds] = useState([]);
  const [editRolesById, setEditRolesById] = useState({});
  const [approveProjectIds, setApproveProjectIds] = useState([]);
  const [approveRolesById, setApproveRolesById] = useState({});
  const [passwordUserId, setPasswordUserId] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');

  const load = async () => {
    const [userList, reqList, projectList] = await Promise.all([
      api.listUsers(),
      api.listRegistrationRequests(),
      api.listProjects(true),
    ]);
    setUsers(userList);
    setRequests(reqList);
    setAllProjects(projectList);
    setSelectedUsers([]);
    setSelectedRequests([]);
  };

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createUser({
        ...form,
        projectAssignments: toAssignments(form.projectIds, form.rolesById),
      });
      setForm({
        username: '', password: '', name: '', email: '', role: 'VIEWER', projectIds: [], rolesById: {},
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleApprove = async (id, projectIds = approveProjectIds, rolesById = approveRolesById) => {
    try {
      await api.approveRegistration(id, { projectAssignments: toAssignments(projectIds, rolesById) });
      await load();
      setApproveProjectIds([]);
      setApproveRolesById({});
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = async (id) => {
    try {
      await api.rejectRegistration(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.updateUser(user.id, { isActive: !user.isActive });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const openPasswordChange = (user) => {
    setError('');
    setPasswordUserId(user.id);
    setPasswordForm({ password: '', confirm: '' });
  };

  const savePasswordChange = async (e) => {
    e.preventDefault();
    if (!passwordUserId) return;
    if (!passwordForm.password) {
      setError(t('users.passwordRequired'));
      return;
    }
    if (passwordForm.password !== passwordForm.confirm) {
      setError(t('users.passwordMismatch'));
      return;
    }
    setError('');
    try {
      await api.changeUserPassword(passwordUserId, passwordForm.password);
      setPasswordUserId(null);
      setPasswordForm({ password: '', confirm: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  const openUserEdit = async (user) => {
    setError('');
    setEditUserId(user.id);
    setEditForm({
      username: user.username,
      name: user.name,
      email: user.email || '',
      role: user.role,
      password: '',
      isActive: user.isActive,
      isProtected: user.username === 'admin',
    });
    if (user.role === 'ADMIN') {
      setEditProjectIds([]);
      setEditRolesById({});
      return;
    }
    const projects = await api.getUserProjects(user.id);
    const { ids, roles } = fromAssignments(projects);
    setEditProjectIds(ids);
    setEditRolesById(roles);
  };

  const saveUserEdit = async (e) => {
    e.preventDefault();
    if (!editUserId || !editForm) return;
    setError('');
    try {
      const payload = {
        username: editForm.username,
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        isActive: editForm.isActive,
      };
      await api.updateUser(editUserId, payload);
      if (editForm.password) {
        await api.changeUserPassword(editUserId, editForm.password);
      }
      if (editForm.role !== 'ADMIN') {
        await api.setUserProjects(editUserId, toAssignments(editProjectIds, editRolesById));
      }
      setEditUserId(null);
      setEditForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUserRowClick = (e, user) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedUsers((prev) => (
        prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
      ));
      return;
    }
    setSelectedUsers([user.id]);
    openUserEdit(user);
  };

  const handleUserContextMenu = (e, user) => {
    openRowContextMenu(e, {
      openContextMenu,
      rowId: user.id,
      selectedIds: selectedUsers,
      setSelectedIds: setSelectedUsers,
      multiSelect: true,
      items: (selection) => {
        const targets = users.filter((u) => selection.includes(u.id) && u.username !== 'admin');
        const menu = [];

        if (selection.length === 1) {
          const u = users.find((x) => x.id === selection[0]);
          if (u) {
            menu.push({
              id: 'edit',
              icon: Pencil,
              label: t('users.menuEdit'),
              tooltip: t('users.tipEdit'),
              onClick: () => openUserEdit(u),
            });
            menu.push({
              id: 'password',
              icon: KeyRound,
              label: t('users.menuPassword'),
              tooltip: t('users.tipChangePassword'),
              onClick: () => openPasswordChange(u),
            });
            if (u.username !== 'admin' && u.role !== 'ADMIN') {
              menu.push({
                id: 'assign',
                icon: FolderKanban,
                label: t('users.menuAssign'),
                tooltip: t('users.tipAssign'),
                onClick: () => openUserEdit(u),
              });
            }
            if (u.username !== 'admin') {
              menu.push({
                id: 'toggle',
                icon: u.isActive ? UserX : UserCheck,
                label: u.isActive ? t('users.deactivate') : t('users.activate'),
                tooltip: u.isActive ? t('users.tipToggle') : t('users.tipToggleOn'),
                onClick: () => toggleActive(u),
              });
            }
          }
        }

        if (targets.length > 0) {
          const allActive = targets.every((u) => u.isActive);
          menu.push({
            id: 'bulk-toggle',
            icon: allActive ? UserX : UserCheck,
            label: allActive ? t('users.bulkDeactivate', { count: targets.length }) : t('users.bulkActivate', { count: targets.length }),
            tooltip: allActive ? t('users.tipBulkOff') : t('users.tipBulkOn'),
            onClick: async () => {
              for (const u of targets) {
                await api.updateUser(u.id, { isActive: !allActive });
              }
              await load();
            },
          });
        }

        return menu;
      },
    });
  };

  const handleRequestRowClick = (e, request) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedRequests((prev) => (
        prev.includes(request.id) ? prev.filter((id) => id !== request.id) : [...prev, request.id]
      ));
      return;
    }
    setSelectedRequests([request.id]);
  };

  const handleRequestContextMenu = (e, request) => {
    openRowContextMenu(e, {
      openContextMenu,
      rowId: request.id,
      selectedIds: selectedRequests,
      setSelectedIds: setSelectedRequests,
      multiSelect: true,
      items: (selection) => [
        {
          id: 'approve',
          icon: Check,
          label: selection.length > 1 ? t('users.bulkApprove', { count: selection.length }) : t('users.approve'),
          tooltip: t('users.tipApprove'),
          onClick: async () => {
            for (const id of selection) await handleApprove(id);
          },
        },
        {
          id: 'reject',
          icon: X,
          label: selection.length > 1 ? t('users.bulkReject', { count: selection.length }) : t('users.reject'),
          tooltip: t('users.tipReject'),
          danger: true,
          onClick: async () => {
            for (const id of selection) await handleReject(id);
          },
        },
      ],
    });
  };

  const editUser = users.find((u) => u.id === editUserId);
  const passwordUser = users.find((u) => u.id === passwordUserId);

  return (
    <div className="container">
      <h1>{t('users.title')}</h1>
      <p className="muted">{t('users.intro')}</p>
      {error && <p className="error">{error}</p>}

      {requests.length > 0 && (
        <div className="card">
          <h2>{t('users.pendingTitle', { count: requests.length })}</h2>
          <div className="form-row">
            <label>{t('users.approveProjects')}</label>
            <ProjectAssignmentList
              projects={allProjects.filter((p) => p.isActive)}
              selectedIds={approveProjectIds}
              rolesById={approveRolesById}
              onChange={({ projectIds, rolesById }) => {
                setApproveProjectIds(projectIds);
                setApproveRolesById(rolesById);
              }}
            />
          </div>
          <table>
            <thead>
              <tr><th>{t('common.id')}</th><th>{t('common.name')}</th><th>{t('common.email')}</th><th>{t('users.requestedAt')}</th><th></th></tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr
                  key={r.id}
                  className={`row-selectable${selectedRequests.includes(r.id) ? ' row-selected' : ''}`}
                  onClick={(e) => handleRequestRowClick(e, r)}
                  onContextMenu={(e) => handleRequestContextMenu(e, r)}
                >
                  <td>{r.username}</td>
                  <td>{r.name}</td>
                  <td>{r.email}</td>
                  <td>{r.createdAt}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="form-actions">
                      <IconButton icon={Check} className="btn-primary" type="button" onClick={() => handleApprove(r.id)} tooltip={t('users.tipApprove')}>
                        {t('users.approve')}
                      </IconButton>
                      <IconButton icon={X} className="btn-danger" type="button" onClick={() => handleReject(r.id)} tooltip={t('users.tipReject')}>
                        {t('users.reject')}
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>{t('users.newUser')}</h2>
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <label>{t('common.id')}</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={t('users.loginIdPlaceholder')} required />
          </div>
          <div className="form-row">
            <label>{t('users.defaultPassword')}</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={t('users.initialPasswordPlaceholder')} required />
          </div>
          <div className="form-row">
            <label>{t('common.name')}</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-row">
            <label>{t('common.email')}</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t('users.emailPlaceholder')} />
          </div>
          <div className="form-row">
            <label>{t('users.systemRole')}</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="VIEWER">{t('role.global.VIEWER')}</option>
              <option value="EDITOR">{t('role.global.EDITOR')}</option>
              <option value="ADMIN">{t('role.global.ADMIN')}</option>
            </select>
          </div>
          {form.role !== 'ADMIN' && (
            <div className="form-row">
              <label>{t('users.participateProjects')}</label>
              <ProjectAssignmentList
                projects={allProjects.filter((p) => p.isActive)}
                selectedIds={form.projectIds}
                rolesById={form.rolesById}
                onChange={({ projectIds, rolesById }) => setForm({ ...form, projectIds, rolesById })}
              />
            </div>
          )}
          <IconButton icon={UserPlus} className="btn-primary" type="submit" tooltip={t('users.tipCreate')}>{t('common.create')}</IconButton>
        </form>
      </div>

      {editUser && editForm && (
        <div className="card">
          <h2>{t('users.editUser', { name: editUser.name })}</h2>
          <form onSubmit={saveUserEdit}>
            <div className="form-row">
              <label>{t('common.id')}</label>
              <input
                value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                disabled={editForm.isProtected}
                required
              />
            </div>
            <div className="form-row">
              <label>{t('common.email')}</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder={t('users.emailPlaceholder')}
              />
            </div>
            <div className="form-row">
              <label>{t('common.name')}</label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </div>
            <div className="form-row">
              <label>{t('users.passwordChange')}</label>
              <input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder={t('users.changePasswordPlaceholder')}
                autoComplete="new-password"
              />
            </div>
            <div className="form-row">
              <label>{t('users.systemRole')}</label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                disabled={editForm.isProtected}
              >
                <option value="VIEWER">{t('role.global.VIEWER')}</option>
                <option value="EDITOR">{t('role.global.EDITOR')}</option>
                <option value="ADMIN">{t('role.global.ADMIN')}</option>
              </select>
            </div>
            {!editForm.isProtected && (
              <div className="form-row">
                <label>
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  />
                  {' '}{t('users.activeAccount')}
                </label>
              </div>
            )}
            {editForm.role !== 'ADMIN' && (
              <div className="form-row">
                <label>{t('users.participateProjects')}</label>
                <ProjectAssignmentList
                  projects={allProjects.filter((p) => p.isActive)}
                  selectedIds={editProjectIds}
                  rolesById={editRolesById}
                  onChange={({ projectIds, rolesById }) => {
                    setEditProjectIds(projectIds);
                    setEditRolesById(rolesById);
                  }}
                />
              </div>
            )}
            <div className="form-actions">
              <IconButton icon={Save} className="btn-primary" type="submit" tooltip={t('users.tipSave')}>{t('common.save')}</IconButton>
              <IconButton icon={X} className="btn-secondary" type="button" onClick={() => { setEditUserId(null); setEditForm(null); }} tooltip={t('users.tipCancel')}>{t('common.cancel')}</IconButton>
            </div>
          </form>
        </div>
      )}

      {passwordUser && (
        <div className="card">
          <h2>{t('users.changePassword', { name: passwordUser.name, username: passwordUser.username })}</h2>
          <form onSubmit={savePasswordChange}>
            <div className="form-row">
              <label>{t('users.newPassword')}</label>
              <input
                type="password"
                value={passwordForm.password}
                onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                placeholder={t('users.newPasswordPlaceholder')}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="form-row">
              <label>{t('users.confirmPassword')}</label>
              <input
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                placeholder={t('users.confirmPasswordPlaceholder')}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="form-actions">
              <IconButton icon={KeyRound} className="btn-primary" type="submit" tooltip={t('users.tipPasswordSave')}>{t('users.change')}</IconButton>
              <IconButton
                icon={X}
                className="btn-secondary"
                type="button"
                onClick={() => { setPasswordUserId(null); setPasswordForm({ password: '', confirm: '' }); }}
                tooltip={t('users.tipPasswordCancel')}
              >
                {t('common.cancel')}
              </IconButton>
            </div>
          </form>
        </div>
      )}

      <table>
        <thead>
          <tr><th>{t('common.id')}</th><th>{t('common.name')}</th><th>{t('common.email')}</th><th>{t('users.systemRoleCol')}</th><th>{t('common.status')}</th><th>{t('common.createdAt')}</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              className={`row-selectable${selectedUsers.includes(u.id) ? ' row-selected' : ''}`}
              onClick={(e) => handleUserRowClick(e, u)}
              onContextMenu={(e) => handleUserContextMenu(e, u)}
            >
              <td>{u.username}</td>
              <td>{getDisplayUserName(u, t)}</td>
              <td>{u.email || t('common.dash')}</td>
              <td>{t(`role.global.${u.role}`) || u.role}</td>
              <td>{u.isActive ? t('common.active') : t('common.inactive')}</td>
              <td>{u.createdAt}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <IconButton icon={Pencil} className="btn-secondary" type="button" onClick={() => openUserEdit(u)} tooltip={t('users.tipEdit')}>
                  {t('common.edit')}
                </IconButton>
                <IconButton icon={KeyRound} className="btn-secondary" type="button" onClick={() => openPasswordChange(u)} tooltip={t('users.tipChangePassword')}>
                  {t('users.password')}
                </IconButton>
                {u.username !== 'admin' && (
                  <IconButton
                    icon={u.isActive ? UserX : UserCheck}
                    className="btn-secondary"
                    type="button"
                    onClick={() => toggleActive(u)}
                    tooltip={u.isActive ? t('users.tipToggle') : t('users.tipToggleOn')}
                  >
                    {u.isActive ? t('users.deactivate') : t('users.activate')}
                  </IconButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
