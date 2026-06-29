import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { StatusBadge, PriorityBadge } from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import { REQ_STATUSES, PRIORITIES, CATEGORIES } from '../utils/helpers';

const emptyForm = {
  reqId: '', title: '', description: '', category: 'General',
  priority: 'Medium', status: 'Draft', owner: '', version: '1.0',
};

export default function RequirementsPage() {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const params = {};
    if (search) params.search = search;
    if (filterStatus) params.status = filterStatus;
    api.get('/requirements', { params })
      .then(res => setItems(res.data))
      .finally(() => setLoading(false));
  }, [search, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      reqId: item.reqId, title: item.title, description: item.description,
      category: item.category, priority: item.priority, status: item.status,
      owner: item.owner, version: item.version,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/requirements/${editing.id}`, form);
      } else {
        await api.post('/requirements', form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm(t('requirements.confirmDelete'))) return;
    try {
      await api.delete(`/requirements/${item.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || t('common.error'));
    }
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <Layout>
      <div className="page-header">
        <h2>{t('requirements.title')}</h2>
        {canEdit && (
          <button className="btn btn-primary" onClick={openAdd}>+ {t('requirements.add')}</button>
        )}
      </div>

      <div className="toolbar">
        <input
          className="form-control"
          placeholder={t('requirements.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-control" style={{ maxWidth: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{t('common.all')} - {t('requirements.status')}</option>
          {REQ_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="empty-state">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="empty-state">{t('requirements.noData')}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('requirements.reqId')}</th>
                <th>{t('requirements.reqTitle')}</th>
                <th>{t('requirements.category')}</th>
                <th>{t('requirements.priority')}</th>
                <th>{t('requirements.status')}</th>
                <th>{t('requirements.testCases')}</th>
                <th>{t('requirements.passed')}</th>
                <th>{t('requirements.failed')}</th>
                {canEdit && <th>{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.reqId}</strong></td>
                  <td>{item.title}</td>
                  <td>{item.category}</td>
                  <td><PriorityBadge priority={item.priority} /></td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{item.testCaseCount}</td>
                  <td style={{ color: 'var(--success)' }}>{item.passedCount}</td>
                  <td style={{ color: 'var(--danger)' }}>{item.failedCount}</td>
                  {canEdit && (
                    <td className="actions-cell">
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(item)}>{t('common.edit')}</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(item)}>{t('common.delete')}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('requirements.edit') : t('requirements.add')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label>{t('requirements.reqId')} *</label>
            <input className="form-control" value={form.reqId} onChange={set('reqId')} required />
          </div>
          <div className="form-group">
            <label>{t('requirements.version')}</label>
            <input className="form-control" value={form.version} onChange={set('version')} />
          </div>
        </div>
        <div className="form-group">
          <label>{t('requirements.reqTitle')} *</label>
          <input className="form-control" value={form.title} onChange={set('title')} required />
        </div>
        <div className="form-group">
          <label>{t('requirements.description')}</label>
          <textarea className="form-control" value={form.description} onChange={set('description')} rows={3} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{t('requirements.category')}</label>
            <select className="form-control" value={form.category} onChange={set('category')}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{t('requirements.priority')}</label>
            <select className="form-control" value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{t('requirements.status')}</label>
            <select className="form-control" value={form.status} onChange={set('status')}>
              {REQ_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{t('requirements.owner')}</label>
            <input className="form-control" value={form.owner} onChange={set('owner')} />
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
