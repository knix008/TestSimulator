import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { StatusBadge } from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { TC_STATUSES, formatDate } from '../utils/helpers';

const emptyForm = {
  tcId: '', requirementId: '', title: '', description: '', steps: '',
  expectedResult: '', status: 'Not Run', result: '', notes: '',
};

export default function TestCasesPage() {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const [items, setItems] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterReq, setFilterReq] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const params = {};
    if (filterStatus) params.status = filterStatus;
    if (filterReq) params.requirementId = filterReq;
    Promise.all([
      api.get('/test-cases', { params }),
      api.get('/requirements'),
    ]).then(([tcRes, reqRes]) => {
      setItems(tcRes.data);
      setRequirements(reqRes.data);
    }).finally(() => setLoading(false));
  }, [filterStatus, filterReq]);

  useAutoRefresh(load);

  const openAdd = async () => {
    setEditing(null);
    try {
      const res = await api.get('/test-cases/next-id');
      setForm({ ...emptyForm, tcId: res.data.tcId, requirementId: requirements[0]?.id || '' });
    } catch {
      setForm({ ...emptyForm, requirementId: requirements[0]?.id || '' });
    }
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      tcId: item.tcId, requirementId: item.requirementId, title: item.title,
      description: item.description, steps: item.steps, expectedResult: item.expectedResult,
      status: item.status, result: item.result, notes: item.notes,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, requirementId: parseInt(form.requirementId) };
      let res;
      if (editing) {
        res = await api.put(`/test-cases/${editing.id}`, payload);
      } else {
        res = await api.post('/test-cases', payload);
      }
      if (res.data.shiftedCount > 0) {
        alert(t('testCases.idShifted', { count: res.data.shiftedCount }));
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
    if (!confirm(t('testCases.confirmDelete'))) return;
    try {
      const res = await api.delete(`/test-cases/${item.id}`);
      if (res.data.renumberedCount > 0) {
        alert(t('testCases.idRenumbered', { count: res.data.renumberedCount }));
      }
      load();
    } catch (err) {
      alert(err.response?.data?.error || t('common.error'));
    }
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <Layout>
      <div className="page-header">
        <h2>{t('testCases.title')}</h2>
        {canEdit && (
          <button className="btn btn-primary" onClick={openAdd} disabled={requirements.length === 0}>
            + {t('testCases.add')}
          </button>
        )}
      </div>

      <div className="toolbar">
        <select className="form-control" style={{ maxWidth: 200 }} value={filterReq} onChange={e => setFilterReq(e.target.value)}>
          <option value="">{t('common.all')} - {t('testCases.requirement')}</option>
          {requirements.map(r => <option key={r.id} value={r.id}>{r.reqId} - {r.title}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{t('common.all')} - {t('requirements.status')}</option>
          {TC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="empty-state">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="empty-state">{t('testCases.noData')}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('testCases.tcId')}</th>
                <th>{t('testCases.requirement')}</th>
                <th>{t('testCases.tcTitle')}</th>
                <th>{t('requirements.status')}</th>
                <th>{t('testCases.result')}</th>
                <th>{t('testCases.executedBy')}</th>
                <th>{t('testCases.executedAt')}</th>
                {canEdit && <th>{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.tcId}</strong></td>
                  <td>{item.reqId}</td>
                  <td>{item.title}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{item.result || '-'}</td>
                  <td>{item.executedBy || '-'}</td>
                  <td>{formatDate(item.executedAt)}</td>
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
        title={editing ? t('testCases.edit') : t('testCases.add')}
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
            <label>{t('testCases.tcId')} *</label>
            <input className="form-control" value={form.tcId} onChange={set('tcId')} required />
            {!editing && (
              <small style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {t('testCases.tcIdAutoHint')}
              </small>
            )}
          </div>
          <div className="form-group">
            <label>{t('testCases.requirement')} *</label>
            <select className="form-control" value={form.requirementId} onChange={set('requirementId')}>
              {requirements.map(r => <option key={r.id} value={r.id}>{r.reqId} - {r.title}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>{t('testCases.tcTitle')} *</label>
          <input className="form-control" value={form.title} onChange={set('title')} required />
        </div>
        <div className="form-group">
          <label>{t('requirements.description')}</label>
          <textarea className="form-control" value={form.description} onChange={set('description')} rows={2} />
        </div>
        <div className="form-group">
          <label>{t('testCases.steps')}</label>
          <textarea className="form-control" value={form.steps} onChange={set('steps')} rows={3} />
        </div>
        <div className="form-group">
          <label>{t('testCases.expectedResult')}</label>
          <textarea className="form-control" value={form.expectedResult} onChange={set('expectedResult')} rows={2} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{t('requirements.status')}</label>
            <select className="form-control" value={form.status} onChange={set('status')}>
              {TC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{t('testCases.result')}</label>
            <input className="form-control" value={form.result} onChange={set('result')} />
          </div>
        </div>
        <div className="form-group">
          <label>{t('testCases.notes')}</label>
          <textarea className="form-control" value={form.notes} onChange={set('notes')} rows={2} />
        </div>
      </Modal>
    </Layout>
  );
}
