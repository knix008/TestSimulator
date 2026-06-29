import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api';
import Layout from '../components/Layout';
import Modal from '../components/Modal';

const emptyForm = { code: '', name: '', description: '', status: 'active' };

export default function AdminProjectsPage() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/projects/admin/overview')
      .then(res => setOverview(res.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (project) => {
    setEditing(project);
    setForm({
      code: project.code,
      name: project.name,
      description: project.description || '',
      status: project.status,
    });
    setModalOpen(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await api.put(`/projects/${editing.id}`, form);
      } else {
        await api.post('/projects', form);
      }
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
    }
  };

  const remove = async (project) => {
    if (!window.confirm(t('projects.deleteConfirm', { name: project.name }))) return;
    try {
      await api.delete(`/projects/${project.id}`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || t('common.error'));
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <h2>{t('projects.adminOverview')}</h2>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm(emptyForm); setModalOpen(true); }}>
          {t('projects.create')}
        </button>
      </div>
      {message && <div className="alert">{message}</div>}
      {loading ? (
        <div className="empty-state">{t('common.loading')}</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('projects.code')}</th>
              <th>{t('projects.name')}</th>
              <th>{t('dashboard.totalRequirements')}</th>
              <th>{t('dashboard.totalTestCases')}</th>
              <th>{t('dashboard.passRate')}</th>
              <th>{t('projects.members')}</th>
              <th>{t('projects.pendingRequests')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {overview.map(p => (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>{p.stats.requirements.total}</td>
                <td>{p.stats.testCases.total}</td>
                <td>{p.stats.passRate}%</td>
                <td>{p.stats.memberCount}</td>
                <td>{p.stats.pendingJoinRequests}</td>
                <td>
                  <button className="btn btn-sm btn-secondary" onClick={() => openEdit(p)}>{t('common.edit')}</button>
                  <button className="btn btn-sm btn-danger" style={{ marginLeft: 8 }} onClick={() => remove(p)}>{t('common.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={modalOpen}
        title={editing ? t('projects.edit') : t('projects.create')}
        onClose={() => { setModalOpen(false); setEditing(null); setForm(emptyForm); }}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setModalOpen(false); setEditing(null); setForm(emptyForm); }}>
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={!form.code.trim() || !form.name.trim()}
            >
              {t('common.save')}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="admin-project-code">{t('projects.code')} *</label>
            <input
              id="admin-project-code"
              className="form-control"
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="admin-project-name">{t('projects.name')} *</label>
            <input
              id="admin-project-name"
              className="form-control"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="admin-project-description">{t('projects.description')}</label>
          <textarea
            id="admin-project-description"
            className="form-control"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={3}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="admin-project-status">{t('projects.status')}</label>
          <select
            id="admin-project-status"
            className="form-control"
            value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value })}
          >
            <option value="active">{t('projects.statusActive')}</option>
            <option value="archived">{t('projects.statusArchived')}</option>
          </select>
        </div>
      </Modal>
    </Layout>
  );
}
