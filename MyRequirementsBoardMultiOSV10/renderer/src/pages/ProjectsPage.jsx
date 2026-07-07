import { useEffect, useState } from 'react';
import { FolderOpen, Pencil, Plus, Save, Trash2, Users } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { IconText } from '../components/IconText.jsx';
import { openRowContextMenu, useContextMenu } from '../components/ContextMenu.jsx';
import { getDisplayProjectName, getDisplayUserName } from '../lib/displayLabels.js';

function ProjectMemberPicker({ users, members, onChange, excludeUserId = null }) {
  const { t } = useLanguage();
  const assignable = users.filter((u) => u.role !== 'ADMIN' && u.isActive && u.id !== excludeUserId);

  const isSelected = (userId) => members.some((m) => m.userId === userId);
  const getRole = (userId) => members.find((m) => m.userId === userId)?.memberRole || 'VIEWER';

  const toggleMember = (userId, checked) => {
    if (checked) onChange([...members, { userId, memberRole: 'VIEWER' }]);
    else onChange(members.filter((m) => m.userId !== userId));
  };

  const updateRole = (userId, memberRole) => {
    onChange(members.map((m) => (m.userId === userId ? { ...m, memberRole } : m)));
  };

  return (
    <div className="project-member-picker">
      {assignable.length === 0 && <p className="muted">{t('projects.noAssignableUsers')}</p>}
      {assignable.map((user) => {
        const selected = isSelected(user.id);
        return (
          <div key={user.id} className="project-member-picker__row">
            <label className="project-member-picker__item">
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => toggleMember(user.id, e.target.checked)}
              />
              <span>{getDisplayUserName(user, t)} ({user.username})</span>
            </label>
            <select
              value={getRole(user.id)}
              disabled={!selected}
              onChange={(e) => updateRole(user.id, e.target.value)}
              aria-label={t('projects.memberRoleFor', { name: getDisplayUserName(user, t) })}
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

export default function ProjectsPage() {
  const { user, hasRole } = useAuth();
  const { refreshProjects, selectProject } = useProject();
  const { openContextMenu } = useContextMenu();
  const { t } = useLanguage();
  const isAdmin = hasRole('ADMIN');
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ code: '', name: '', description: '', members: [] });
  const [editForm, setEditForm] = useState(null);
  const [memberAssignments, setMemberAssignments] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    const projectList = await api.listProjects(isAdmin);
    const userList = await api.listAssignableUsers();
    setProjects(projectList);
    setUsers(userList);
    setSelected([]);
    if (!editForm) setMemberAssignments([]);
  };

  useEffect(() => { load().catch((e) => setError(e.message)); }, [isAdmin]);

  const loadMembers = async (projectId) => {
    const members = await api.listProjectMembers(projectId);
    setMemberAssignments(members.map((m) => ({ userId: m.id, memberRole: m.memberRole })));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createProject(form);
      setForm({ code: '', name: '', description: '', members: [] });
      await load();
      await refreshProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    const project = projects.find((p) => p.id === id);
    if (!project || project.code === 'DEFAULT') return;
    if (!window.confirm(t('projects.deleteConfirm'))) return;
    try {
      await api.deleteProject(id);
      await load();
      await refreshProjects();
      setEditForm(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = async (project) => {
    if (!project.canManage && !isAdmin) {
      setError(t('projects.noEditPermission'));
      return;
    }
    setEditForm({
      id: project.id,
      name: project.name,
      description: project.description || '',
      isActive: project.isActive,
      canManage: project.canManage || isAdmin,
    });
    await loadMembers(project.id);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editForm) return;
    setError('');
    try {
      await api.updateProject(editForm.id, {
        name: editForm.name,
        description: editForm.description,
        isActive: editForm.isActive,
      });
      await api.setProjectMembers(editForm.id, memberAssignments);
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
        const canDelete = targets.filter((p) => p.code !== 'DEFAULT' && (p.isOwner || isAdmin));
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
              if (!window.confirm(t('projects.bulkDeleteConfirm', { count: canDelete.length }))) return;
              for (const p of canDelete) await api.deleteProject(p.id);
              await load();
              await refreshProjects();
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
      {error && <p className="error">{error}</p>}

      <div className="card">
        <h2>{t('projects.new')}</h2>
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <label>{t('common.code')}</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t('projects.codePlaceholder')} required />
          </div>
          <div className="form-row">
            <label>{t('common.name')}</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-row">
            <label>{t('common.description')}</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {users.length > 0 && (
            <div className="form-row">
              <label>{t('projects.membersOptional')}</label>
              <ProjectMemberPicker
                users={users}
                members={form.members}
                onChange={(members) => setForm({ ...form, members })}
                excludeUserId={user?.id}
              />
            </div>
          )}
          <IconButton icon={Plus} className="btn-primary" type="submit" tooltip={t('projects.tipCreate')}>{t('common.create')}</IconButton>
        </form>
      </div>

      {editForm && (
        <div className="card">
          <h2>{t('projects.edit')}</h2>
          <form onSubmit={handleSaveEdit}>
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
                <label>
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  />
                  {' '}{t('projects.activeProject')}
                </label>
              </div>
            )}
            {users.length > 0 && (
              <div className="form-row">
                <label><IconText icon={Users}>{t('projects.membersAndRoles')}</IconText></label>
                <ProjectMemberPicker
                  users={users}
                  members={memberAssignments}
                  onChange={setMemberAssignments}
                />
              </div>
            )}
            <div className="form-actions">
              <IconButton icon={Save} className="btn-primary" type="submit" tooltip={t('projects.tipSave')}>{t('common.save')}</IconButton>
              <IconButton icon={Pencil} className="btn-secondary" type="button" onClick={() => setEditForm(null)} tooltip={t('projects.tipCancelEdit')}>{t('common.cancel')}</IconButton>
            </div>
          </form>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>{t('common.code')}</th>
            <th>{t('common.name')}</th>
            <th>{t('projects.myRole')}</th>
            {isAdmin && <th>{t('common.status')}</th>}
            <th>{t('projects.reqCount')}</th>
            <th>{t('common.updatedAt')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
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
                  {(p.isOwner || isAdmin) && p.code !== 'DEFAULT' && (
                    <IconButton icon={Trash2} className="btn-danger" type="button" onClick={() => handleDelete(p.id)} tooltip={t('projects.tipDelete')}>
                      {t('common.delete')}
                    </IconButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
