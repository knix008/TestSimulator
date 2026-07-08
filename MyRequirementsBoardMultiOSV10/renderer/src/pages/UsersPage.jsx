import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, FolderKanban, KeyRound, Pencil, Save, Trash2, UserCheck, UserPlus, UserX, X } from 'lucide-react';
import { api } from '../api/client.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { openRowContextMenu, useContextMenu } from '../components/ContextMenu.jsx';
import SortableTableHeader from '../components/SortableTableHeader.jsx';
import { useTableSort } from '../hooks/useTableSort.js';
import UserDeleteConfirmDialog from '../components/UserDeleteConfirmDialog.jsx';
import ErrorDialog from '../components/ErrorDialog.jsx';
import {
  REGISTRATION_REQUESTS_TABLE_SORT,
  USERS_TABLE_SORT,
  sortRows,
} from '../lib/tableSort.js';
import { getDisplayProjectName, getDisplayUserName } from '../lib/displayLabels.js';

function sameId(left, right) {
  return String(left) === String(right);
}

function getRoleForProjectId(rolesById = {}, projectId) {
  return rolesById[projectId] || rolesById[String(projectId)] || 'VIEWER';
}

function toAssignments(selectedIds, rolesById = {}) {
  return selectedIds.map((projectId) => ({
    projectId: Number(projectId),
    memberRole: getRoleForProjectId(rolesById, projectId),
  }));
}

function fromAssignments(projects) {
  const ids = projects.map((p) => Number(p.id));
  const roles = Object.fromEntries(projects.map((p) => [String(p.id), p.memberRole || 'VIEWER']));
  return { ids, roles };
}

function projectDisplayLabel(project, t) {
  const inactive = project.isActive === false ? t('projects.inactiveSuffix') : '';
  return `${getDisplayProjectName(project, t)} (${project.code})${inactive}`;
}

function ProjectAssignmentList({ projects, selectedIds, rolesById, onChange, disabled }) {
  const { t } = useLanguage();
  if (!projects.length) return <p className="muted">{t('projects.noProjectsRegistered')}</p>;

  const isSelected = (projectId) => selectedIds.some((id) => sameId(id, projectId));

  const setSelected = (projectId, checked) => {
    const nextIds = checked
      ? (isSelected(projectId) ? selectedIds : [...selectedIds, projectId])
      : selectedIds.filter((id) => !sameId(id, projectId));
    const nextRoles = { ...rolesById };
    if (checked && !getRoleForProjectId(nextRoles, projectId)) nextRoles[String(projectId)] = 'VIEWER';
    onChange({ projectIds: nextIds, rolesById: nextRoles });
  };

  const setRole = (projectId, memberRole) => {
    onChange({ projectIds: selectedIds, rolesById: { ...rolesById, [String(projectId)]: memberRole } });
  };

  return (
    <div className="project-member-picker">
      {projects.map((project) => {
        const selected = isSelected(project.id);
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
              value={getRoleForProjectId(rolesById, project.id)}
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
  const [createOpen, setCreateOpen] = useState(false);
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState([]);
  const [error, setError] = useState('');
  const [userColumnWidths, setUserColumnWidths] = useState({
    select: 56,
    username: 150,
    name: 170,
    email: 220,
    role: 130,
    isActive: 110,
    createdAt: 170,
    actions: 270,
  });
  const userResizeRef = useRef(null);
  const { sort: requestSort, toggleSort: toggleRequestSort } = useTableSort();
  const { sort: userSort, toggleSort: toggleUserSort } = useTableSort();

  const getUserColumnOrder = useCallback(() => [
    'select',
    'username',
    'name',
    'email',
    'role',
    'isActive',
    'createdAt',
    'actions',
  ], []);

  const startUserColumnResize = useCallback((columnId, event) => {
    event.preventDefault();
    event.stopPropagation();
    const order = getUserColumnOrder();
    const index = order.indexOf(columnId);
    if (index < 0) return;

    const adjacentColumnId = index < order.length - 1
      ? order[index + 1]
      : index > 0
        ? order[index - 1]
        : null;
    if (!adjacentColumnId) return;

    const minWidths = {
      select: 48,
      username: 110,
      name: 120,
      email: 150,
      role: 100,
      isActive: 90,
      createdAt: 120,
      actions: 190,
    };

    const startX = event.clientX;
    const startWidth = userColumnWidths[columnId] ?? 120;
    const adjacentStartWidth = userColumnWidths[adjacentColumnId] ?? 120;
    const minWidth = minWidths[columnId] ?? 90;
    const adjacentMinWidth = minWidths[adjacentColumnId] ?? 90;

    const onMove = (moveEvent) => {
      let delta = moveEvent.clientX - startX;
      const minDeltaForCurrent = minWidth - startWidth;
      const maxDeltaForAdjacent = adjacentStartWidth - adjacentMinWidth;
      if (delta < minDeltaForCurrent) delta = minDeltaForCurrent;
      if (delta > maxDeltaForAdjacent) delta = maxDeltaForAdjacent;

      setUserColumnWidths((prev) => ({
        ...prev,
        [columnId]: startWidth + delta,
        [adjacentColumnId]: adjacentStartWidth - delta,
      }));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      userResizeRef.current = null;
      document.body.classList.remove('requirements-table--resizing');
    };

    userResizeRef.current = { onMove, onUp };
    document.body.classList.add('requirements-table--resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [userColumnWidths, getUserColumnOrder]);

  useEffect(() => () => {
    if (!userResizeRef.current) return;
    document.removeEventListener('mousemove', userResizeRef.current.onMove);
    document.removeEventListener('mouseup', userResizeRef.current.onUp);
    document.body.classList.remove('requirements-table--resizing');
  }, []);

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

  const sortedRequests = useMemo(
    () => sortRows(requests, requestSort, REGISTRATION_REQUESTS_TABLE_SORT),
    [requests, requestSort],
  );

  const sortedUsers = useMemo(
    () => sortRows(users, userSort, USERS_TABLE_SORT),
    [users, userSort],
  );

  const selectableUserIds = useMemo(
    () => sortedUsers.filter((u) => u.role !== 'ADMIN').map((u) => u.id),
    [sortedUsers],
  );

  const checkedUserIds = useMemo(
    () => selectedUsers.filter((id) => selectableUserIds.some((x) => sameId(x, id))),
    [selectedUsers, selectableUserIds],
  );

  const allChecked = selectableUserIds.length > 0
    && selectableUserIds.every((id) => checkedUserIds.some((x) => sameId(x, id)));

  const getColumnSortTitle = (sortState, columnId, label) => {
    const isActive = sortState?.columnId === columnId;
    const directionLabel = isActive
      ? (sortState.direction === 'asc' ? t('common.sortAscending') : t('common.sortDescending'))
      : '';
    return isActive
      ? `${t('common.sortColumn', { column: label })} (${directionLabel})`
      : t('common.sortColumn', { column: label });
  };

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
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleUserChecked = (userId, checked) => {
    setSelectedUsers((prev) => {
      if (checked) {
        if (prev.some((id) => sameId(id, userId))) return prev;
        return [...prev, userId];
      }
      return prev.filter((id) => !sameId(id, userId));
    });
  };

  const toggleUserCheckAll = (checked) => {
    if (checked) {
      setSelectedUsers(selectableUserIds);
      return;
    }
    setSelectedUsers([]);
  };

  const deleteUsersByIds = (ids) => {
    const targets = (Array.isArray(ids) ? ids : [ids])
      .filter((id) => users.some((u) => sameId(u.id, id) && u.role !== 'ADMIN'));
    if (!targets.length) return;
    setDeleteTargetIds(targets);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteUsers = async () => {
    setDeleteDialogOpen(false);
    try {
      for (const id of deleteTargetIds) {
        await api.deleteUser(id);
      }
      setSelectedUsers((prev) => prev.filter((id) => !deleteTargetIds.some((targetId) => sameId(targetId, id))));
      if (editUserId && deleteTargetIds.some((id) => sameId(id, editUserId))) {
        setEditUserId(null);
        setEditForm(null);
      }
      if (passwordUserId && deleteTargetIds.some((id) => sameId(id, passwordUserId))) {
        setPasswordUserId(null);
      }
      setDeleteTargetIds([]);
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
      passwordCurrent: '',
      password: '',
      passwordConfirm: '',
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

    const changingPassword = editForm.passwordCurrent || editForm.password || editForm.passwordConfirm;
    if (changingPassword) {
      if (!editForm.passwordCurrent) { setError(t('users.existingPasswordRequired')); return; }
      if (!editForm.password) { setError(t('users.passwordRequired')); return; }
      if (editForm.password !== editForm.passwordConfirm) { setError(t('users.passwordMismatch')); return; }
    }

    try {
      const payload = {
        username: editForm.username,
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        isActive: editForm.isActive,
      };
      await api.updateUser(editUserId, payload);
      if (changingPassword) {
        await api.changeUserPassword(editUserId, editForm.passwordCurrent, editForm.password);
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
        const deletableTargets = targets.filter((u) => u.role !== 'ADMIN');
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
        if (deletableTargets.length > 0) {
          menu.push({
            id: 'bulk-delete',
            icon: Trash2,
            label: t('users.bulkDelete', { count: deletableTargets.length }),
            tooltip: t('users.tipDelete'),
            danger: true,
            onClick: async () => {
              await deleteUsersByIds(deletableTargets.map((u) => u.id));
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
      <UserDeleteConfirmDialog
        open={deleteDialogOpen}
        count={deleteTargetIds.length}
        onConfirm={confirmDeleteUsers}
        onCancel={() => { setDeleteDialogOpen(false); setDeleteTargetIds([]); }}
      />
      <ErrorDialog message={error} onClose={() => setError('')} />
      <h1>{t('users.title')}</h1>
      <p className="muted">{t('users.intro')}</p>

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
          <table className="users-table">
            <thead>
              <tr>
                <SortableTableHeader
                  columnId="username"
                  label={t('common.id')}
                  sort={requestSort}
                  onSort={toggleRequestSort}
                  title={getColumnSortTitle(requestSort, 'username', t('common.id'))}
                />
                <SortableTableHeader
                  columnId="name"
                  label={t('common.name')}
                  sort={requestSort}
                  onSort={toggleRequestSort}
                  title={getColumnSortTitle(requestSort, 'name', t('common.name'))}
                />
                <SortableTableHeader
                  columnId="email"
                  label={t('common.email')}
                  sort={requestSort}
                  onSort={toggleRequestSort}
                  title={getColumnSortTitle(requestSort, 'email', t('common.email'))}
                />
                <SortableTableHeader
                  columnId="createdAt"
                  label={t('users.requestedAt')}
                  sort={requestSort}
                  onSort={toggleRequestSort}
                  title={getColumnSortTitle(requestSort, 'createdAt', t('users.requestedAt'))}
                />
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {sortedRequests.map((r) => (
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

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)} role="presentation">
          <div
            className="modal-dialog test-case-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="test-case-edit-dialog__header">
              <h2 id="create-user-title">{t('users.newUser')}</h2>
            </div>
            <div className="test-case-edit-dialog__body">
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
                <div className="form-actions">
                  <IconButton icon={UserPlus} className="btn-primary" type="submit" tooltip={t('users.tipCreate')}>{t('common.create')}</IconButton>
                  <IconButton icon={X} className="btn-secondary" type="button" onClick={() => setCreateOpen(false)} tooltip={t('users.tipCancel')}>
                    {t('common.cancel')}
                  </IconButton>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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
              <label>{t('users.existingPassword')}</label>
              <input
                type="password"
                value={editForm.passwordCurrent}
                onChange={(e) => setEditForm({ ...editForm, passwordCurrent: e.target.value })}
                placeholder={t('users.existingPasswordPlaceholder')}
                autoComplete="current-password"
              />
            </div>
            <div className="form-row">
              <label>{t('users.newPassword')}</label>
              <input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder={t('users.newPasswordPlaceholder')}
                autoComplete="new-password"
              />
            </div>
            <div className="form-row">
              <label>{t('users.confirmPassword')}</label>
              <input
                type="password"
                value={editForm.passwordConfirm}
                onChange={(e) => setEditForm({ ...editForm, passwordConfirm: e.target.value })}
                placeholder={t('users.confirmPasswordPlaceholder')}
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
                <label className="project-active-toggle">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  />
                  {t('users.activeAccount')}
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

      {!editUser && !editForm && (
      <div className="form-actions" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
        <IconButton
          icon={UserPlus}
          className="btn-primary"
          type="button"
          onClick={() => {
            setError('');
            setForm({
              username: '', password: '', name: '', email: '', role: 'VIEWER', projectIds: [], rolesById: {},
            });
            setCreateOpen(true);
          }}
          tooltip={t('users.tipCreate')}
        >
          {t('users.newUser')}
        </IconButton>
        <IconButton
          icon={Trash2}
          className="btn-danger"
          type="button"
          onClick={() => deleteUsersByIds(checkedUserIds)}
          disabled={checkedUserIds.length === 0}
          tooltip={t('users.tipDelete')}
        >
          {t('common.selectDelete', { count: checkedUserIds.length })}
        </IconButton>
      </div>
      )}

      {!editUser && !editForm && (
      <table className="users-table users-list-table">
        <colgroup>
          <col style={{ width: `${userColumnWidths.select}px` }} />
          <col style={{ width: `${userColumnWidths.username}px` }} />
          <col style={{ width: `${userColumnWidths.name}px` }} />
          <col style={{ width: `${userColumnWidths.email}px` }} />
          <col style={{ width: `${userColumnWidths.role}px` }} />
          <col style={{ width: `${userColumnWidths.isActive}px` }} />
          <col style={{ width: `${userColumnWidths.createdAt}px` }} />
          <col style={{ width: `${userColumnWidths.actions}px` }} />
        </colgroup>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => toggleUserCheckAll(e.target.checked)}
                aria-label={t('common.selectAll')}
                disabled={selectableUserIds.length === 0}
              />
              <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startUserColumnResize('select', e)} />
            </th>
            <SortableTableHeader
              columnId="username"
              label={t('common.id')}
              sort={userSort}
              onSort={toggleUserSort}
              title={getColumnSortTitle(userSort, 'username', t('common.id'))}
            >
              <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startUserColumnResize('username', e)} />
            </SortableTableHeader>
            <SortableTableHeader
              columnId="name"
              label={t('common.name')}
              sort={userSort}
              onSort={toggleUserSort}
              title={getColumnSortTitle(userSort, 'name', t('common.name'))}
            >
              <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startUserColumnResize('name', e)} />
            </SortableTableHeader>
            <SortableTableHeader
              columnId="email"
              label={t('common.email')}
              sort={userSort}
              onSort={toggleUserSort}
              title={getColumnSortTitle(userSort, 'email', t('common.email'))}
            >
              <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startUserColumnResize('email', e)} />
            </SortableTableHeader>
            <SortableTableHeader
              columnId="role"
              label={t('users.systemRoleCol')}
              sort={userSort}
              onSort={toggleUserSort}
              title={getColumnSortTitle(userSort, 'role', t('users.systemRoleCol'))}
            >
              <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startUserColumnResize('role', e)} />
            </SortableTableHeader>
            <SortableTableHeader
              columnId="isActive"
              label={t('common.status')}
              sort={userSort}
              onSort={toggleUserSort}
              title={getColumnSortTitle(userSort, 'isActive', t('common.status'))}
            >
              <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startUserColumnResize('isActive', e)} />
            </SortableTableHeader>
            <SortableTableHeader
              columnId="createdAt"
              label={t('common.createdAt')}
              sort={userSort}
              onSort={toggleUserSort}
              title={getColumnSortTitle(userSort, 'createdAt', t('common.createdAt'))}
            >
              <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startUserColumnResize('createdAt', e)} />
            </SortableTableHeader>
            <th aria-hidden="true">
              <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startUserColumnResize('actions', e)} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedUsers.map((u) => (
            <tr
              key={u.id}
              className={`row-selectable${selectedUsers.includes(u.id) ? ' row-selected' : ''}`}
              onClick={(e) => handleUserRowClick(e, u)}
              onContextMenu={(e) => handleUserContextMenu(e, u)}
            >
              <td onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedUsers.some((id) => sameId(id, u.id))}
                  disabled={u.role === 'ADMIN'}
                  onChange={(e) => toggleUserChecked(u.id, e.target.checked)}
                  aria-label={`${t('common.selectAll')} ${u.username}`}
                />
              </td>
              <td>{u.username}</td>
              <td>{getDisplayUserName(u, t)}</td>
              <td>{u.email || t('common.dash')}</td>
              <td>{t(`role.global.${u.role}`) || u.role}</td>
              <td>{u.isActive ? t('common.active') : t('common.inactive')}</td>
              <td>{u.createdAt}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <div className="form-actions">
                  <IconButton icon={Pencil} className="btn-secondary" type="button" onClick={() => openUserEdit(u)} tooltip={t('users.tipEdit')}>
                    {t('common.edit')}
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
                  {u.role !== 'ADMIN' && (
                    <IconButton
                      icon={Trash2}
                      className="btn-danger"
                      type="button"
                      onClick={() => deleteUsersByIds([u.id])}
                      tooltip={t('users.tipDelete')}
                    >
                      {t('common.delete')}
                    </IconButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}
