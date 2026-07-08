import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Pencil, Plus, Save, Trash2, UserPlus, Users } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useExcelDialogs } from '../context/ExcelDialogContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { IconText } from '../components/IconText.jsx';
import { openRowContextMenu, useContextMenu } from '../components/ContextMenu.jsx';
import ProjectDeleteConfirmDialog from '../components/ProjectDeleteConfirmDialog.jsx';
import MemberRemoveConfirmDialog from '../components/MemberRemoveConfirmDialog.jsx';
import ErrorDialog from '../components/ErrorDialog.jsx';
import SortableTableHeader from '../components/SortableTableHeader.jsx';
import { useTableSort } from '../hooks/useTableSort.js';
import { useStatusBarReport } from '../hooks/useStatusBarReport.js';
import { PROJECTS_TABLE_SORT, sortRows } from '../lib/tableSort.js';
import { getDisplayProjectName, getDisplayUserName } from '../lib/displayLabels.js';
import { isValidProjectCode, normalizeProjectCode } from '../lib/projectCode.js';

function ProjectMemberPicker({
  users,
  members,
  onChange,
  excludeUserId = null,
  membersOnly = false,
  canEditUserInfo = false,
  onUsersChanged,
  label = null,
}) {
  const { t } = useLanguage();
  const sameUserId = (left, right) => String(left) === String(right);
  const [checkedUserIds, setCheckedUserIds] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: '', email: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [pendingRemove, setPendingRemove] = useState(null);
  const [sort, setSort] = useState({ columnId: 'id', direction: 'asc' });
  const [widths, setWidths] = useState({
    check: 56,
    id: 74,
    name: 230,
    email: 260,
    role: 118,
    action: 170,
  });
  const resizeRef = useRef(null);
  const assignable = users.filter((u) => {
    const selected = members.some((m) => sameUserId(m.userId, u.id));
    return u.role !== 'ADMIN' && u.id !== excludeUserId && (selected || (!membersOnly && u.isActive));
  });

  const sortedAssignable = useMemo(() => {
    const list = [...assignable];
    if (!sort?.columnId) return list;
    const factor = sort.direction === 'desc' ? -1 : 1;
    const toText = (value) => String(value ?? '').toLowerCase();
    list.sort((a, b) => {
      let av;
      let bv;
      if (sort.columnId === 'id') {
        av = Number(a.id) || 0;
        bv = Number(b.id) || 0;
      } else if (sort.columnId === 'name') {
        av = toText(getDisplayUserName(a, t));
        bv = toText(getDisplayUserName(b, t));
      } else if (sort.columnId === 'email') {
        av = toText(a.email || '');
        bv = toText(b.email || '');
      } else if (sort.columnId === 'role') {
        av = toText(getRole(a.id));
        bv = toText(getRole(b.id));
      } else {
        av = toText(a.id);
        bv = toText(b.id);
      }
      if (av === bv) return 0;
      return av > bv ? factor : -factor;
    });
    return list;
  }, [assignable, sort, members, t]);

  const isSelected = (userId) => members.some((m) => sameUserId(m.userId, userId));
  const isChecked = (userId) => checkedUserIds.some((id) => sameUserId(id, userId));
  const getRole = (userId) => members.find((m) => sameUserId(m.userId, userId))?.memberRole || 'VIEWER';

  const selectableMemberIds = useMemo(
    () => sortedAssignable.filter((u) => isSelected(u.id)).map((u) => u.id),
    [sortedAssignable, members],
  );

  const allChecked = selectableMemberIds.length > 0
    && selectableMemberIds.every((id) => isChecked(id));

  const updateRole = (userId, memberRole) => {
    onChange(members.map((m) => (sameUserId(m.userId, userId) ? { ...m, memberRole } : m)));
  };

  const addMember = (userId) => {
    if (members.some((m) => sameUserId(m.userId, userId))) return;
    onChange([...members, { userId, memberRole: 'VIEWER' }]);
  };

  const removeMember = (userId, userName) => {
    setPendingRemove({ type: 'single', userId, userName });
  };

  const confirmRemoveMember = () => {
    if (!pendingRemove) return;
    if (pendingRemove.type === 'single') {
      onChange(members.filter((m) => !sameUserId(m.userId, pendingRemove.userId)));
      setCheckedUserIds((prev) => prev.filter((id) => !sameUserId(id, pendingRemove.userId)));
    } else if (pendingRemove.type === 'bulk') {
      onChange(members.filter((m) => !pendingRemove.ids.some((id) => sameUserId(id, m.userId))));
      setCheckedUserIds([]);
    }
    setPendingRemove(null);
  };

  const openUserInfoEdit = (user) => {
    if (!canEditUserInfo) {
      window.alert(t('common.noPermission'));
      return;
    }
    setEditError('');
    setEditingUser(user);
    setEditDraft({
      name: user.name || '',
      email: user.email || '',
    });
  };

  const closeUserInfoEdit = () => {
    setEditingUser(null);
    setEditDraft({ name: '', email: '' });
    setEditError('');
    setEditSaving(false);
  };

  const saveUserInfoEdit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditSaving(true);
    setEditError('');
    try {
      await api.updateUser(editingUser.id, {
        name: editDraft.name,
        email: editDraft.email,
      });
      if (typeof onUsersChanged === 'function') {
        await onUsersChanged();
      }
      closeUserInfoEdit();
    } catch (err) {
      setEditError(err.message || t('users.tipSave'));
      setEditSaving(false);
    }
  };

  const toggleChecked = (userId, checked) => {
    setCheckedUserIds((prev) => {
      if (checked) {
        if (prev.some((id) => sameUserId(id, userId))) return prev;
        return [...prev, userId];
      }
      return prev.filter((id) => !sameUserId(id, userId));
    });
  };

  const toggleCheckAll = (checked) => {
    if (checked) {
      setCheckedUserIds(selectableMemberIds);
      return;
    }
    setCheckedUserIds([]);
  };

  const removeCheckedMembers = () => {
    if (checkedUserIds.length === 0) return;
    setPendingRemove({ type: 'bulk', ids: [...checkedUserIds], count: checkedUserIds.length });
  };

  const toggleSort = (columnId) => {
    setSort((prev) => {
      if (prev?.columnId === columnId) {
        return {
          columnId,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { columnId, direction: 'asc' };
    });
  };

  const startResize = useCallback((columnId, event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[columnId];

    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      setWidths((prev) => ({
        ...prev,
        [columnId]: Math.max(56, startWidth + delta),
      }));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      resizeRef.current = null;
      document.body.classList.remove('requirements-table--resizing');
    };

    resizeRef.current = { onMove, onUp };
    document.body.classList.add('requirements-table--resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [widths]);

  useEffect(() => {
    setCheckedUserIds((prev) => prev.filter((id) => selectableMemberIds.some((memberId) => sameUserId(memberId, id))));
  }, [selectableMemberIds]);

  useEffect(() => () => {
    if (!resizeRef.current) return;
    document.removeEventListener('mousemove', resizeRef.current.onMove);
    document.removeEventListener('mouseup', resizeRef.current.onUp);
    document.body.classList.remove('requirements-table--resizing');
  }, []);

  const sortIndicator = (columnId) => {
    if (sort?.columnId !== columnId) return '↕';
    return sort.direction === 'asc' ? '↑' : '↓';
  };

  const sortTitle = (columnId, label) => {
    const active = sort?.columnId === columnId;
    const dir = active
      ? (sort.direction === 'asc' ? t('common.sortAscending') : t('common.sortDescending'))
      : t('common.sortAscending');
    return `${t('common.sortColumn', { column: label })} (${dir})`;
  };

  return (
    <div className="project-member-picker-wrap">
      <div className="project-member-picker__bulk-actions">
        {label && <span className="project-member-picker__section-label">{label}</span>}
        {assignable.length > 0 && (
          <IconButton
            icon={Trash2}
            className="btn-danger"
            type="button"
            onClick={removeCheckedMembers}
            disabled={checkedUserIds.length === 0}
            tooltip={t('projects.tipBulkRemoveMembers')}
          >
            {t('common.selectDelete', { count: checkedUserIds.length })}
          </IconButton>
        )}
      </div>
      <div className="project-member-picker">
        {assignable.length === 0 && <p className="muted">{t('projects.noAssignableUsers')}</p>}
        {assignable.length > 0 && (
          <div className="project-member-picker__head">
          <span className="project-member-picker__head-check" style={{ width: `${widths.check}px`, flexBasis: `${widths.check}px` }}>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => toggleCheckAll(e.target.checked)}
              aria-label={t('common.selectAll')}
              disabled={selectableMemberIds.length === 0}
            />
            <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startResize('check', e)} />
          </span>
          <button type="button" className="project-member-picker__head-sort project-member-picker__head-id" style={{ width: `${widths.id}px`, flexBasis: `${widths.id}px` }} onClick={() => toggleSort('id')} title={sortTitle('id', t('common.id'))}>
            <span className="project-member-picker__head-label">{t('common.id')}</span>
            <span className="project-member-picker__sort-indicator">{sortIndicator('id')}</span>
            <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startResize('id', e)} />
          </button>
          <button type="button" className="project-member-picker__head-sort project-member-picker__head-name" style={{ width: `${widths.name}px`, flexBasis: `${widths.name}px` }} onClick={() => toggleSort('name')} title={sortTitle('name', t('common.name'))}>
            <span className="project-member-picker__head-label">{t('common.name')}</span>
            <span className="project-member-picker__sort-indicator">{sortIndicator('name')}</span>
            <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startResize('name', e)} />
          </button>
          <button type="button" className="project-member-picker__head-sort project-member-picker__head-email" style={{ width: `${widths.email}px`, flexBasis: `${widths.email}px` }} onClick={() => toggleSort('email')} title={sortTitle('email', t('common.email'))}>
            <span className="project-member-picker__head-label">{t('common.email')}</span>
            <span className="project-member-picker__sort-indicator">{sortIndicator('email')}</span>
            <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startResize('email', e)} />
          </button>
          <button type="button" className="project-member-picker__head-sort project-member-picker__head-role" style={{ width: `${widths.role}px`, flexBasis: `${widths.role}px` }} onClick={() => toggleSort('role')} title={sortTitle('role', t('projects.memberRoleCol'))}>
            <span className="project-member-picker__head-label">{t('projects.memberRoleCol')}</span>
            <span className="project-member-picker__sort-indicator">{sortIndicator('role')}</span>
            <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startResize('role', e)} />
          </button>
          <span className="project-member-picker__head-action" style={{ width: `${widths.action}px`, flexBasis: `${widths.action}px` }}>
            {t('projects.memberActionCol')}
            <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startResize('action', e)} />
          </span>
        </div>
        )}
        {sortedAssignable.map((user) => {
          const selected = isSelected(user.id);
          return (
            <div key={user.id} className="project-member-picker__row project-member-picker__row--list">
            <div className="project-member-picker__check" style={{ width: `${widths.check}px`, flexBasis: `${widths.check}px` }}>
              <input
                type="checkbox"
                checked={isChecked(user.id)}
                disabled={!selected}
                onChange={(e) => toggleChecked(user.id, e.target.checked)}
                aria-label={t('projects.memberSelectFor', { name: getDisplayUserName(user, t) })}
              />
            </div>
            <div className="project-member-picker__id" style={{ width: `${widths.id}px`, flexBasis: `${widths.id}px` }}>{user.username || 'N/A'}</div>
            <div className="project-member-picker__name" style={{ width: `${widths.name}px`, flexBasis: `${widths.name}px` }} title={getDisplayUserName(user, t) || 'N/A'}>{getDisplayUserName(user, t) || 'N/A'}</div>
            <div className="project-member-picker__email" style={{ width: `${widths.email}px`, flexBasis: `${widths.email}px` }} title={user.email || 'N/A'}>{user.email || 'N/A'}</div>
            <select
              value={getRole(user.id)}
              disabled={!selected}
              style={{ width: `${widths.role}px`, flexBasis: `${widths.role}px` }}
              onChange={(e) => updateRole(user.id, e.target.value)}
              aria-label={t('projects.memberRoleFor', { name: getDisplayUserName(user, t) })}
            >
              <option value="VIEWER">{t('role.member.VIEWER')}</option>
              <option value="EDITOR">{t('role.member.EDITOR')}</option>
            </select>
            <div className="project-member-picker__actions" style={{ width: `${widths.action}px`, flexBasis: `${widths.action}px` }}>
              {!selected ? (
                <IconButton
                  icon={UserPlus}
                  className="btn-primary project-member-picker__add"
                  type="button"
                  onClick={() => addMember(user.id)}
                  tooltip={t('projects.tipAddMember')}
                >
                  {t('projects.addMember')}
                </IconButton>
              ) : (
                <>
                  <IconButton
                    icon={Pencil}
                    className="btn-secondary project-member-picker__edit"
                    type="button"
                    onClick={() => openUserInfoEdit(user)}
                    disabled={!canEditUserInfo}
                    tooltip={t('projects.tipEditMember')}
                  >
                    {t('common.edit')}
                  </IconButton>
                  <IconButton
                    icon={Trash2}
                    className="btn-danger project-member-picker__remove"
                    type="button"
                    onClick={() => removeMember(user.id, getDisplayUserName(user, t))}
                    tooltip={t('projects.tipRemoveMember')}
                  >
                    {t('common.delete')}
                  </IconButton>
                </>
              )}
            </div>
            </div>
          );
        })}

        {editingUser && (
          <div className="modal-overlay" onClick={closeUserInfoEdit} role="presentation">
            <div
              className="modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="member-user-edit-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="test-case-edit-dialog__header">
                <h2 id="member-user-edit-title">{t('users.editUser', { name: getDisplayUserName(editingUser, t) })}</h2>
              </div>
              <div className="test-case-edit-dialog__body">
                {editError && <p className="error">{editError}</p>}
                <form onSubmit={saveUserInfoEdit}>
                  <div className="form-row">
                    <label>{t('common.id')}</label>
                    <input value={editingUser.username || ''} disabled />
                  </div>
                  <div className="form-row">
                    <label>{t('common.name')}</label>
                    <input
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <label>{t('common.email')}</label>
                    <input
                      type="email"
                      value={editDraft.email}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder={t('users.emailPlaceholder')}
                    />
                  </div>
                  <div className="form-actions">
                    <IconButton icon={Save} className="btn-primary" type="submit" disabled={editSaving} tooltip={t('users.tipSave')}>
                      {t('common.save')}
                    </IconButton>
                    <IconButton icon={Pencil} className="btn-secondary" type="button" onClick={closeUserInfoEdit} tooltip={t('users.tipCancel')}>
                      {t('common.cancel')}
                    </IconButton>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
      <MemberRemoveConfirmDialog
        open={Boolean(pendingRemove)}
        name={pendingRemove?.userName || ''}
        count={pendingRemove?.type === 'bulk' ? pendingRemove.count : 1}
        onConfirm={confirmRemoveMember}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}

export default function ProjectsPage() {
  const { user, hasRole } = useAuth();
  const {
    refreshProjects,
    selectProject,
    syncProject,
    activeProject,
    projects: sharedProjects,
    loading: sharedLoading,
  } = useProject();
  const { openContextMenu } = useContextMenu();
  const { t } = useLanguage();
  const { notifyDataChange } = useExcelDialogs();
  const isAdmin = hasRole('ADMIN');
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ code: '', name: '', description: '', members: [] });
  const [createOpen, setCreateOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [memberAssignments, setMemberAssignments] = useState([]);
  const [editMemberUsers, setEditMemberUsers] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ open: false, ids: [] });
  const { sort, toggleSort } = useTableSort();
  const [projectColumnWidths, setProjectColumnWidths] = useState({
    code: 130,
    name: 260,
    memberRole: 130,
    isActive: 110,
    requirementCount: 130,
    updatedAt: 180,
    actions: 190,
  });
  const projectResizeRef = useRef(null);

  const getProjectColumnOrder = useCallback(() => (
    isAdmin
      ? ['code', 'name', 'memberRole', 'isActive', 'requirementCount', 'updatedAt', 'actions']
      : ['code', 'name', 'memberRole', 'requirementCount', 'updatedAt', 'actions']
  ), [isAdmin]);

  const startProjectColumnResize = useCallback((columnId, event) => {
    event.preventDefault();
    event.stopPropagation();
    const order = getProjectColumnOrder();
    const index = order.indexOf(columnId);
    if (index < 0) return;

    const adjacentColumnId = index < order.length - 1
      ? order[index + 1]
      : index > 0
        ? order[index - 1]
        : null;
    if (!adjacentColumnId) return;

    const startX = event.clientX;
    const startWidth = projectColumnWidths[columnId] ?? 120;
    const adjacentStartWidth = projectColumnWidths[adjacentColumnId] ?? 120;
    const minWidths = {
      code: 90,
      name: 140,
      memberRole: 100,
      isActive: 90,
      requirementCount: 100,
      updatedAt: 120,
      actions: 160,
    };
    const minWidth = minWidths[columnId] ?? 90;
    const adjacentMinWidth = minWidths[adjacentColumnId] ?? 90;

    const onMove = (moveEvent) => {
      let delta = moveEvent.clientX - startX;
      const minDeltaForCurrent = minWidth - startWidth;
      const maxDeltaForAdjacent = adjacentStartWidth - adjacentMinWidth;
      if (delta < minDeltaForCurrent) delta = minDeltaForCurrent;
      if (delta > maxDeltaForAdjacent) delta = maxDeltaForAdjacent;

      setProjectColumnWidths((prev) => ({
        ...prev,
        [columnId]: startWidth + delta,
        [adjacentColumnId]: adjacentStartWidth - delta,
      }));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      projectResizeRef.current = null;
      document.body.classList.remove('requirements-table--resizing');
    };

    projectResizeRef.current = { onMove, onUp };
    document.body.classList.add('requirements-table--resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [projectColumnWidths, getProjectColumnOrder]);

  useEffect(() => () => {
    if (!projectResizeRef.current) return;
    document.removeEventListener('mousemove', projectResizeRef.current.onMove);
    document.removeEventListener('mouseup', projectResizeRef.current.onUp);
    document.body.classList.remove('requirements-table--resizing');
  }, []);

  const editPickerUsers = useMemo(() => {
    const merged = new Map();
    for (const u of users) merged.set(String(u.id), u);
    for (const u of editMemberUsers) {
      if (!merged.has(String(u.id))) merged.set(String(u.id), u);
    }
    return Array.from(merged.values());
  }, [users, editMemberUsers]);

  const load = async () => {
    const projectList = await api.listProjects(isAdmin);
    const userList = await api.listAssignableUsers();
    setProjects(projectList);
    setUsers(userList);
    setSelected([]);
    if (!editForm) setMemberAssignments([]);
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        if (sharedProjects.length > 0) {
          setProjects(sharedProjects);
          if (isAdmin) {
            void api.listProjects(true)
              .then((projectList) => {
                if (!cancelled) setProjects(projectList);
              })
              .catch((err) => {
                if (!cancelled) setError(err.message);
              });
          }
          const userList = await api.listAssignableUsers();
          if (!cancelled) {
            setUsers(userList);
            setSelected([]);
            if (!editForm) setMemberAssignments([]);
          }
          return;
        }

        if (sharedLoading) return;
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, sharedProjects, sharedLoading]);

  const sortedProjects = useMemo(
    () => sortRows(projects, sort, PROJECTS_TABLE_SORT),
    [projects, sort],
  );

  const visibleProjects = useMemo(
    () => (editForm ? sortedProjects.filter((p) => p.id !== editForm.id) : sortedProjects),
    [sortedProjects, editForm],
  );

  useStatusBarReport({
    hint: t('statusBar.itemCount', { count: projects.length }),
  });

  const getSortTitle = (columnId, label) => {
    const isActive = sort?.columnId === columnId;
    const directionLabel = isActive
      ? (sort.direction === 'asc' ? t('common.sortAscending') : t('common.sortDescending'))
      : '';
    return isActive
      ? `${t('common.sortColumn', { column: label })} (${directionLabel})`
      : t('common.sortColumn', { column: label });
  };

  const loadMembers = async (projectId) => {
    const members = await api.listProjectMembers(projectId);
    setMemberAssignments(members.map((m) => ({ userId: m.id, memberRole: m.memberRole })));
    setEditMemberUsers(members.map((m) => ({
      id: m.id,
      username: m.username,
      name: m.name,
      email: m.email,
      role: m.globalRole,
      isActive: m.isActive,
    })));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createProject(form);
      setForm({ code: '', name: '', description: '', members: [] });
      setCreateOpen(false);
      await load();
      await refreshProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  const requestDelete = (ids) => {
    const normalized = (Array.isArray(ids) ? ids : [ids])
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id));
    if (normalized.length === 0) return;
    setDeleteDialog({ open: true, ids: normalized });
  };

  const handleConfirmDelete = async () => {
    const ids = deleteDialog.ids;
    if (!ids.length) return;
    setDeleteDialog({ open: false, ids: [] });
    try {
      for (const id of ids) {
        await api.deleteProject(id);
      }
      notifyDataChange();
      await load();
      await refreshProjects();
      if (editForm && ids.some((id) => String(id) === String(editForm.id))) {
        setEditForm(null);
        setEditMemberUsers([]);
      }
      setEditMemberUsers([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = async (project) => {
    if (!project.canManage && !isAdmin) {
      setError(t('projects.noEditPermission'));
      return;
    }
    setSuccess('');
    setError('');
    setEditForm({
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description || '',
      isActive: project.isActive,
      isSystemDefault: project.isSystemDefault,
      canManage: project.canManage || isAdmin,
    });
    await loadMembers(project.id);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editForm) return;
    setError('');
    setSuccess('');

    const nextCode = normalizeProjectCode(editForm.code);
    if (!isValidProjectCode(editForm.code)) {
      setError(t('projects.codeInvalid'));
      return;
    }

    try {
      const payload = {
        code: nextCode,
        name: editForm.name.trim(),
        description: editForm.description,
      };
      if (isAdmin) payload.isActive = editForm.isActive;

      const updated = await api.updateProject(editForm.id, payload);
      if (normalizeProjectCode(updated.code) !== nextCode) {
        setProjects((prev) => prev.map((item) => (
          item.id === updated.id ? { ...item, ...updated } : item
        )));
        setError(t('projects.codeSaveFailed'));
        setEditForm((prev) => (prev ? { ...prev, code: updated.code } : prev));
        return;
      }

      await api.setProjectMembers(editForm.id, memberAssignments);
      syncProject(updated);
      setProjects((prev) => prev.map((item) => (
        item.id === updated.id ? { ...item, ...updated } : item
      )));
      const wasActiveProject = activeProject?.id === updated.id;
      if (wasActiveProject) {
        selectProject(updated);
      }
      setEditForm(null);
      setEditMemberUsers([]);
      if (isAdmin && payload.isActive === false && wasActiveProject) {
        setSuccess(t('projects.deactivatedActiveNote'));
      } else {
        setSuccess(t('projects.saved'));
      }
      await load();
      await refreshProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRowClick = (e, project) => {
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => (
        prev.includes(project.id) ? prev.filter((id) => id !== project.id) : [...prev, project.id]
      ));
      return;
    }
    setSelected([project.id]);
  };

  const handleRowContextMenu = (e, project) => {
    openRowContextMenu(e, {
      openContextMenu,
      rowId: project.id,
      selectedIds: selected,
      setSelectedIds: setSelected,
      multiSelect: true,
      items: (selection) => {
        const targets = projects.filter((p) => selection.includes(p.id));
        const canDelete = targets.filter((p) => (p.canManage || isAdmin));
        const menu = [];

        if (selection.length === 1) {
          const p = projects.find((x) => x.id === selection[0]);
          if (p) {
            menu.push({
              id: 'activate',
              icon: FolderOpen,
              label: t('projects.switchProject'),
              tooltip: t('projects.tipSwitch'),
              onClick: () => selectProject(p),
            });
            if (p.canManage || isAdmin) {
              menu.push({
                id: 'edit',
                icon: Pencil,
                label: t('common.edit'),
                tooltip: t('projects.tipEdit'),
                onClick: () => startEdit(p),
              });
            }
          }
        }

        if (canDelete.length > 0) {
          menu.push({
            id: 'delete',
            icon: Trash2,
            label: selection.length > 1 ? t('common.selectDelete', { count: canDelete.length }) : t('common.delete'),
            tooltip: t('projects.tipDelete'),
            danger: true,
            onClick: async () => {
              requestDelete(canDelete.map((p) => p.id));
            },
          });
        }

        return menu;
      },
    });
  };

  return (
    <div className="container">
      <h1>{isAdmin ? t('projects.adminTitle') : t('projects.myTitle')}</h1>
      <p className="muted">
        {t('projects.intro', { view: t('role.member.VIEWER'), edit: t('role.member.EDITOR') })}
      </p>
      <ErrorDialog message={error} onClose={() => setError('')} />
      {success && <p className="success">{success}</p>}

      {!editForm && (
        <div className="form-actions" style={{ marginBottom: 12 }}>
          <IconButton
            icon={Plus}
            className="btn-primary"
            type="button"
            onClick={() => {
              setError('');
              setSuccess('');
              setForm({ code: '', name: '', description: '', members: [] });
              setCreateOpen(true);
            }}
            tooltip={t('projects.tipCreate')}
          >
            {t('projects.createNewButton')}
          </IconButton>
        </div>
      )}

      {editForm && (
        <div className="card">
          <h2>{t('projects.edit')}</h2>
          <form onSubmit={handleSaveEdit}>
            <div className="form-row">
              <label>{t('common.projectCode')}</label>
              <input
                value={editForm.code}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                placeholder={t('projects.codePlaceholder')}
                required
              />
            </div>
            <div className="form-row">
              <label>{t('common.name')}</label>
              <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div className="form-row">
              <label>{t('common.description')}</label>
              <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            {isAdmin && (
              <div className="form-row">
                <label className="project-active-toggle">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  />
                  <span>{t('projects.activeProject')}</span>
                </label>
                <p className="muted project-active-toggle__help">{t('projects.activeProjectHelp')}</p>
              </div>
            )}
            {editPickerUsers.length > 0 && (
              <div className="form-row project-members-form-row">
                <ProjectMemberPicker
                  label={<IconText icon={Users}>{t('projects.membersAndRoles')}</IconText>}
                  users={editPickerUsers}
                  members={memberAssignments}
                  onChange={setMemberAssignments}
                  canEditUserInfo={isAdmin}
                  onUsersChanged={load}
                />
              </div>
            )}
            <div className="form-actions">
              <IconButton icon={Save} className="btn-primary" type="submit" tooltip={t('projects.tipSave')}>{t('common.save')}</IconButton>
              <IconButton icon={Pencil} className="btn-secondary" type="button" onClick={() => { setEditForm(null); setEditMemberUsers([]); setSuccess(''); }} tooltip={t('projects.tipCancelEdit')}>{t('common.cancel')}</IconButton>
              {(editForm.canManage || isAdmin) && (
                <IconButton
                  icon={Trash2}
                  className="btn-danger"
                  type="button"
                  onClick={() => requestDelete(editForm.id)}
                  tooltip={t('projects.tipDelete')}
                >
                  {t('common.delete')}
                </IconButton>
              )}
            </div>
          </form>
        </div>
      )}

      {!editForm && (
        <table className="projects-table">
          <colgroup>
            <col style={{ width: `${projectColumnWidths.code}px` }} />
            <col style={{ width: `${projectColumnWidths.name}px` }} />
            <col style={{ width: `${projectColumnWidths.memberRole}px` }} />
            {isAdmin && <col style={{ width: `${projectColumnWidths.isActive}px` }} />}
            <col style={{ width: `${projectColumnWidths.requirementCount}px` }} />
            <col style={{ width: `${projectColumnWidths.updatedAt}px` }} />
            <col style={{ width: `${projectColumnWidths.actions}px` }} />
          </colgroup>
          <thead>
            <tr>
              <SortableTableHeader
                columnId="code"
                label={t('common.projectCode')}
                sort={sort}
                onSort={toggleSort}
                title={getSortTitle('code', t('common.projectCode'))}
              >
                <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startProjectColumnResize('code', e)} />
              </SortableTableHeader>
              <SortableTableHeader
                columnId="name"
                label={t('common.name')}
                sort={sort}
                onSort={toggleSort}
                title={getSortTitle('name', t('common.name'))}
              >
                <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startProjectColumnResize('name', e)} />
              </SortableTableHeader>
              <SortableTableHeader
                columnId="memberRole"
                label={t('projects.myRole')}
                sort={sort}
                onSort={toggleSort}
                title={getSortTitle('memberRole', t('projects.myRole'))}
              >
                <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startProjectColumnResize('memberRole', e)} />
              </SortableTableHeader>
              {isAdmin && (
                <SortableTableHeader
                  columnId="isActive"
                  label={t('common.status')}
                  sort={sort}
                  onSort={toggleSort}
                  title={getSortTitle('isActive', t('common.status'))}
                >
                  <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startProjectColumnResize('isActive', e)} />
                </SortableTableHeader>
              )}
              <SortableTableHeader
                columnId="requirementCount"
                label={t('projects.reqCount')}
                sort={sort}
                onSort={toggleSort}
                title={getSortTitle('requirementCount', t('projects.reqCount'))}
              >
                <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startProjectColumnResize('requirementCount', e)} />
              </SortableTableHeader>
              <SortableTableHeader
                columnId="updatedAt"
                label={t('common.updatedAt')}
                sort={sort}
                onSort={toggleSort}
                title={getSortTitle('updatedAt', t('common.updatedAt'))}
              >
                <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startProjectColumnResize('updatedAt', e)} />
              </SortableTableHeader>
              <th aria-hidden="true">
                <span className="requirements-table__resize-handle" role="separator" aria-label={t('requirements.resizeColumn')} onMouseDown={(e) => startProjectColumnResize('actions', e)} />
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleProjects.map((p) => (
              <tr
                key={p.id}
                className={`row-selectable${selected.includes(p.id) ? ' row-selected' : ''}`}
                onClick={(e) => handleRowClick(e, p)}
                onContextMenu={(e) => handleRowContextMenu(e, p)}
              >
                <td>{p.code}</td>
                <td>{getDisplayProjectName(p, t)}</td>
                <td>{t(`role.member.${p.memberRole}`) || p.memberRole}</td>
                {isAdmin && <td>{p.isActive ? t('common.active') : t('common.inactive')}</td>}
                <td>{p.requirementCount}</td>
                <td>{p.updatedAt}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="form-actions">
                    {(p.canManage || isAdmin) && (
                      <IconButton icon={Pencil} className="btn-secondary" type="button" onClick={() => startEdit(p)} tooltip={t('projects.tipEdit')}>{t('common.edit')}</IconButton>
                    )}
                    {(p.canManage || isAdmin) && (
                      <IconButton
                        icon={Trash2}
                        className="btn-danger"
                        type="button"
                        onClick={() => requestDelete(p.id)}
                        tooltip={t('projects.tipDelete')}
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

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)} role="presentation">
          <div
            className="modal-dialog test-case-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="test-case-edit-dialog__header">
              <h2 id="create-project-title">{t('projects.createModalTitle')}</h2>
            </div>
            <div className="test-case-edit-dialog__body">
              <form onSubmit={handleCreate}>
                <div className="form-row">
                  <label>{t('common.projectCode')}</label>
                  <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t('projects.codePlaceholder')} required />
                </div>
                <div className="form-row">
                  <label>{t('common.name')}</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('projects.namePlaceholder')} required />
                </div>
                <div className="form-row">
                  <label>{t('common.description')}</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('projects.descriptionPlaceholder')} />
                </div>
                {users.length > 0 && (
                  <div className="form-row">
                    <label>{t('projects.membersOptional')}</label>
                    <ProjectMemberPicker
                      users={users}
                      members={form.members}
                      onChange={(members) => setForm({ ...form, members })}
                      excludeUserId={user?.id}
                      canEditUserInfo={isAdmin}
                      onUsersChanged={load}
                    />
                  </div>
                )}
                <div className="form-actions">
                  <IconButton icon={Plus} className="btn-primary" type="submit" tooltip={t('projects.tipCreate')}>{t('common.create')}</IconButton>
                  <IconButton icon={Pencil} className="btn-secondary" type="button" onClick={() => setCreateOpen(false)} tooltip={t('projects.tipCancelEdit')}>{t('common.cancel')}</IconButton>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <ProjectDeleteConfirmDialog
        open={deleteDialog.open}
        count={deleteDialog.ids.length}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialog({ open: false, ids: [] })}
      />
    </div>
  );
}
