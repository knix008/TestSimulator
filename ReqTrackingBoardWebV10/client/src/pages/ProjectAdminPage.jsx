import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../api';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { useProject } from '../context/ProjectContext';
import { formatDate } from '../utils/helpers';
import { formatProjectHistorySummary } from '../utils/projectHistory';

const emptyAddForm = { userId: '', role: 'member', permission: 'view' };

export default function ProjectAdminPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { refreshProjects } = useProject();
  const [project, setProject] = useState(null);
  const [projectForm, setProjectForm] = useState({ code: '', name: '', description: '' });
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [savingProject, setSavingProject] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projectRes, membersRes, requestsRes, historyRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/members`),
        api.get(`/projects/${id}/join-requests`, { params: { status: 'pending' } }),
        api.get(`/projects/${id}/history`, { params: { limit: 200 } }),
      ]);
      setProject(projectRes.data);
      setProjectForm({
        code: projectRes.data.code || '',
        name: projectRes.data.name || '',
        description: projectRes.data.description || '',
      });
      setMembers(membersRes.data);
      setRequests(requestsRes.data);
      setHistoryItems(historyRes.data);
      const usersRes = await api.get(`/projects/${id}/available-users`);
      setUsers(usersRes.data);
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { load(); }, [load]);

  const reviewRequest = async (requestId, approve) => {
    try {
      await api.post(`/projects/${id}/join-requests/${requestId}/${approve ? 'approve' : 'reject'}`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
    }
  };

  const saveProject = async () => {
    if (!projectForm.code.trim() || !projectForm.name.trim()) return;
    setSavingProject(true);
    setMessage('');
    try {
      const res = await api.put(`/projects/${id}`, projectForm);
      setProject(res.data);
      await refreshProjects();
      setMessage(t('projects.projectSaved'));
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
    } finally {
      setSavingProject(false);
    }
  };

  const updateMember = async (userId, patch) => {
    setMessage('');
    try {
      await api.put(`/projects/${id}/members/${userId}`, patch);
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
    }
  };

  const addMember = async () => {
    try {
      await api.post(`/projects/${id}/members`, addForm);
      setAddOpen(false);
      setAddForm(emptyAddForm);
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
    }
  };

  const removeMember = async (userId) => {
    if (!window.confirm(t('projects.removeMemberConfirm'))) return;
    try {
      await api.delete(`/projects/${id}/members/${userId}`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
    }
  };

  const canSaveProject = projectForm.code.trim().length > 0 && projectForm.name.trim().length > 0;

  if (loading) return <Layout><div className="empty-state">{t('common.loading')}</div></Layout>;

  return (
    <Layout>
      <div className="page-header">
        <h2>{t('projects.manageTitle', { name: project?.name || id })}</h2>
        <button className="btn btn-secondary" onClick={() => setHistoryOpen(true)}>
          <span className="btn-icon" aria-hidden="true">📜</span>
          {t('projects.history')}
        </button>
      </div>
      {message && <div className="alert">{message}</div>}

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h3>{t('projects.projectSettings')}</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={saveProject}
            disabled={savingProject || !canSaveProject}
          >
            {savingProject ? t('common.loading') : t('common.save')}
          </button>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="edit-project-code">{t('projects.code')} *</label>
            <input
              id="edit-project-code"
              className="form-control"
              value={projectForm.code}
              onChange={e => setProjectForm({ ...projectForm, code: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-project-name">{t('projects.name')} *</label>
            <input
              id="edit-project-name"
              className="form-control"
              value={projectForm.name}
              onChange={e => setProjectForm({ ...projectForm, name: e.target.value })}
            />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="edit-project-description">{t('projects.description')}</label>
          <textarea
            id="edit-project-description"
            className="form-control"
            value={projectForm.description}
            onChange={e => setProjectForm({ ...projectForm, description: e.target.value })}
            rows={3}
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h3>{t('projects.members')}</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>{t('projects.addMember')}</button>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('users.displayName')}</th>
                <th>{t('users.username')}</th>
                <th>{t('projects.role')}</th>
                <th>{t('users.permission')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id}>
                  <td>{m.displayName}</td>
                  <td>{m.username}</td>
                  <td>
                    <select
                      className="form-control"
                      style={{ minWidth: 140 }}
                      value={m.role}
                      onChange={e => updateMember(m.userId, { role: e.target.value, permission: m.permission })}
                    >
                      <option value="member">{t('projects.member')}</option>
                      <option value="project_admin">{t('projects.projectAdmin')}</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className="form-control"
                      style={{ minWidth: 120 }}
                      value={m.permission}
                      onChange={e => updateMember(m.userId, { role: m.role, permission: e.target.value })}
                    >
                      <option value="view">{t('users.permissionView')}</option>
                      <option value="edit">{t('users.permissionEdit')}</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => removeMember(m.userId)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>{t('projects.pendingRequests')}</h3>
        {requests.length === 0 ? (
          <div className="empty-state">{t('projects.noPendingRequests')}</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('users.displayName')}</th>
                  <th>{t('users.username')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td>{r.displayName}</td>
                    <td>{r.username}</td>
                    <td>
                      <button className="btn btn-sm btn-primary" onClick={() => reviewRequest(r.id, true)}>{t('projects.approve')}</button>
                      <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }} onClick={() => reviewRequest(r.id, false)}>{t('projects.reject')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={addOpen}
        title={t('projects.addMember')}
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAddOpen(false)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={addMember} disabled={!addForm.userId}>{t('common.save')}</button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor="member-user">{t('users.username')}</label>
          <select
            id="member-user"
            className="form-control"
            value={addForm.userId}
            onChange={e => setAddForm({ ...addForm, userId: e.target.value })}
          >
            <option value="">{t('projects.selectUser')}</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.displayName} ({u.username})</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="member-role">{t('projects.role')}</label>
            <select
              id="member-role"
              className="form-control"
              value={addForm.role}
              onChange={e => setAddForm({ ...addForm, role: e.target.value })}
            >
              <option value="member">{t('projects.member')}</option>
              <option value="project_admin">{t('projects.projectAdmin')}</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="member-permission">{t('users.permission')}</label>
            <select
              id="member-permission"
              className="form-control"
              value={addForm.permission}
              onChange={e => setAddForm({ ...addForm, permission: e.target.value })}
            >
              <option value="view">{t('users.permissionView')}</option>
              <option value="edit">{t('users.permissionEdit')}</option>
            </select>
          </div>
        </div>
      </Modal>

      <Modal
        open={historyOpen}
        title={t('projects.historyTitle', { name: project?.name || id })}
        onClose={() => setHistoryOpen(false)}
        footer={
          <button className="btn btn-secondary" onClick={() => setHistoryOpen(false)}>
            {t('common.close')}
          </button>
        }
      >
        {historyItems.length === 0 ? (
          <div className="empty-state">{t('projects.historyEmpty')}</div>
        ) : (
          <div className="table-container" style={{ maxHeight: 420, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('projects.historyWhen')}</th>
                  <th>{t('projects.historyWho')}</th>
                  <th>{t('projects.historyAction')}</th>
                  <th>{t('projects.historyDetails')}</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(entry.changedAt)}</td>
                    <td>{entry.changedByName || '-'}</td>
                    <td>{t(`projects.historyActions.${entry.action}`)}</td>
                    <td style={{ fontSize: 12, maxWidth: 360 }}>{formatProjectHistorySummary(entry, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
