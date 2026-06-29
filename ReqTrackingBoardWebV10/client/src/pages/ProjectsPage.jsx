import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../api';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { formatDate } from '../utils/helpers';
import { formatProjectHistorySummary } from '../utils/projectHistory';

const emptyForm = { code: '', name: '', description: '', status: 'active' };

function formatMemberRole(role, t) {
  return role === 'project_admin' ? t('projects.projectAdmin') : t('projects.member');
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { refreshProjects, setActiveProjectId } = useProject();
  const [projects, setProjects] = useState([]);
  const [discoverable, setDiscoverable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyProject, setHistoryProject] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, all] = await Promise.all([
        api.get('/projects/mine'),
        isAdmin ? Promise.resolve({ data: [] }) : api.get('/projects'),
      ]);
      setProjects(mine.data);
      if (!isAdmin) {
        const memberIds = new Set(mine.data.map(p => p.id));
        setDiscoverable(all.data.filter(p => !memberIds.has(p.id)));
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const requestJoin = async (projectId) => {
    setMessage('');
    try {
      await api.post(`/projects/${projectId}/join-requests`, { message: '' });
      setMessage(t('projects.joinRequestSent'));
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
    }
  };

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await api.post('/projects', form);
      setModalOpen(false);
      setForm(emptyForm);
      await load();
      await refreshProjects();
      setActiveProjectId(res.data.id);
      setMessage(t('projects.createdAsAdmin'));
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const closeCreateModal = () => {
    setModalOpen(false);
    setForm(emptyForm);
  };

  const openHistory = async (project) => {
    setHistoryProject(project);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await api.get(`/projects/${project.id}/history`, { params: { limit: 200 } });
      setHistoryItems(res.data);
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const canSave = form.code.trim().length > 0 && form.name.trim().length > 0;

  return (
    <Layout>
      <div className="page-header">
        <h2>{t('projects.title')}</h2>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <span className="btn-icon" aria-hidden="true">➕</span>
          {t('projects.create')}
        </button>
      </div>

      {message && <div className="alert">{message}</div>}
      {loading ? (
        <div className="empty-state">{t('common.loading')}</div>
      ) : (
        <>
          <div className="card">
            <h3>{t('projects.myProjects')}</h3>
            {projects.length === 0 ? (
              <div className="empty-state">{t('projects.noMembership')}</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('projects.code')}</th>
                    <th>{t('projects.name')}</th>
                    <th>{t('projects.role')}</th>
                    <th>{t('projects.participants')}</th>
                    <th>{t('projects.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(p => (
                    <tr key={p.id}>
                      <td>{p.code}</td>
                      <td>{p.name}</td>
                      <td>{p.memberRole === 'project_admin' ? t('projects.projectAdmin') : t('projects.member')}</td>
                      <td>
                        {(p.members?.length ?? 0) === 0 ? (
                          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t('projects.noParticipants')}</span>
                        ) : (
                          <div className="project-participant-list">
                            {p.members.map(member => (
                              <span key={member.userId} className="project-participant-tag">
                                <span className="project-participant-name">{member.displayName || member.username}</span>
                                <span className="project-participant-role">{formatMemberRole(member.role, t)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => openHistory(p)}
                          style={{ marginRight: 8 }}
                        >
                          {t('projects.history')}
                        </button>
                        {(isAdmin || p.memberRole === 'project_admin') && (
                          <Link className="btn btn-sm btn-secondary" to={`/projects/${p.id}/admin`}>
                            {t('projects.manage')}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!isAdmin && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>{t('projects.joinable')}</h3>
              {discoverable.length === 0 ? (
                <div className="empty-state">{t('projects.noJoinable')}</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('projects.code')}</th>
                      <th>{t('projects.name')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoverable.map(p => (
                      <tr key={p.id}>
                        <td>{p.code}</td>
                        <td>{p.name}</td>
                        <td>
                          <button className="btn btn-sm btn-primary" onClick={() => requestJoin(p.id)}>
                            {t('projects.requestJoin')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      <Modal
        open={modalOpen}
        title={t('projects.create')}
        onClose={closeCreateModal}
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeCreateModal} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !canSave}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
          {t('projects.createHint')}
        </p>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="project-code">{t('projects.code')} *</label>
            <input
              id="project-code"
              className="form-control"
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value })}
              placeholder={t('projects.codePlaceholder')}
              autoFocus
            />
            <small style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {t('projects.codeHint')}
            </small>
          </div>
          <div className="form-group">
            <label htmlFor="project-name">{t('projects.name')} *</label>
            <input
              id="project-name"
              className="form-control"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder={t('projects.namePlaceholder')}
            />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="project-description">{t('projects.description')}</label>
          <textarea
            id="project-description"
            className="form-control"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder={t('projects.descriptionPlaceholder')}
          />
        </div>
      </Modal>

      <Modal
        open={historyOpen}
        title={t('projects.historyTitle', { name: historyProject?.name || '' })}
        onClose={() => setHistoryOpen(false)}
        footer={
          <button className="btn btn-secondary" onClick={() => setHistoryOpen(false)}>
            {t('common.close')}
          </button>
        }
      >
        {historyLoading ? (
          <div className="empty-state">{t('common.loading')}</div>
        ) : historyItems.length === 0 ? (
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
