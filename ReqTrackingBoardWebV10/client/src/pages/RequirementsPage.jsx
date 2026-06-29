import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { StatusBadge, PriorityBadge } from '../components/Badge';
import { useProject } from '../context/ProjectContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useDataSync } from '../context/DataSyncContext';
import { REQ_STATUSES, PRIORITIES, CATEGORIES, formatDate } from '../utils/helpers';
import { buildExportFilename, sanitizeExportPrefix } from '../utils/exportPrefix';

const HISTORY_FIELD_KEYS = {
  reqId: 'reqId',
  title: 'reqTitle',
  description: 'description',
  category: 'category',
  priority: 'priority',
  status: 'status',
  owner: 'owner',
  version: 'version',
};

function formatHistorySummary(entry, t) {
  if (entry.action === 'create') {
    const snap = entry.changes?.snapshot;
    return snap ? `${snap.reqId} — ${snap.title}` : t('requirements.historyCreated');
  }
  if (entry.action === 'delete') {
    const snap = entry.changes?.snapshot;
    return snap ? `${snap.reqId} — ${snap.title}` : t('requirements.historyDeleted');
  }
  const parts = Object.entries(entry.changes || {})
    .filter(([key]) => key !== 'snapshot')
    .map(([key, val]) => {
      const label = t(`requirements.${HISTORY_FIELD_KEYS[key] || key}`);
      return `${label}: "${val.old}" → "${val.new}"`;
    });
  if (entry.note === 'id_shift' || entry.note === 'id_renumber') {
    parts.push(t(`requirements.historyNotes.${entry.note}`));
  }
  return parts.length ? parts.join('; ') : '-';
}

const emptyForm = {
  reqId: '', title: '', description: '', category: 'General',
  priority: 'Medium', status: 'Draft', owner: '', version: '1.0',
};

function participantLabel(member) {
  return (member.displayName || member.username || '').trim();
}

function resolveOwnerForForm(owner, participants) {
  const trimmed = String(owner ?? '').trim();
  if (!trimmed) return '';
  const labels = participants.map(participantLabel);
  if (labels.includes(trimmed)) return trimmed;
  const match = participants.find(
    (p) => participantLabel(p).toLowerCase() === trimmed.toLowerCase()
  );
  return match ? participantLabel(match) : '';
}

export default function RequirementsPage() {
  const { t } = useTranslation();
  const { canEditProject, activeProjectId, activeProject } = useProject();
  const participants = activeProject?.members ?? [];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTitle, setHistoryTitle] = useState('');
  const [historyTarget, setHistoryTarget] = useState(null);
  const [exportPrefix, setExportPrefix] = useState('');
  const fileRef = useRef();
  const { refreshToken } = useDataSync();

  const load = useCallback(() => {
    if (!activeProjectId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const params = { projectId: activeProjectId };
    if (search) params.search = search;
    if (filterStatus) params.status = filterStatus;
    api.get('/requirements', { params })
      .then(res => setItems(res.data))
      .finally(() => setLoading(false));
  }, [search, filterStatus, activeProjectId]);

  useAutoRefresh(load);

  useEffect(() => {
    setExportPrefix(activeProject?.name ?? '');
  }, [activeProjectId, activeProject?.name]);

  const fetchHistory = useCallback(async (item = null) => {
    setHistoryLoading(true);
    setHistoryTitle(item ? `${item.reqId} — ${item.title}` : t('requirements.historyAll'));
    try {
      const url = item ? `/requirements/${item.id}/history` : '/requirements/history';
      const res = await api.get(url, { params: { limit: 200, projectId: activeProjectId } });
      setHistoryItems(res.data);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [t, activeProjectId]);

  useEffect(() => {
    if (historyOpen) fetchHistory(historyTarget);
  }, [refreshToken, historyOpen, historyTarget, fetchHistory]);

  const openAdd = async () => {
    setEditing(null);
    try {
      const res = await api.get('/requirements/next-id', { params: { projectId: activeProjectId } });
      setForm({ ...emptyForm, reqId: res.data.reqId });
    } catch {
      setForm(emptyForm);
    }
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      reqId: item.reqId, title: item.title, description: item.description,
      category: item.category, priority: item.priority, status: item.status,
      owner: resolveOwnerForForm(item.owner, participants), version: item.version,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (form.owner && !participants.some((p) => participantLabel(p) === form.owner)) {
      alert(t('requirements.ownerMustBeParticipant'));
      return;
    }
    setSaving(true);
    try {
      let res;
      if (editing) {
        res = await api.put(`/requirements/${editing.id}`, form);
      } else {
        res = await api.post('/requirements', { ...form, projectId: activeProjectId });
      }
      if (res.data.shiftedCount > 0) {
        alert(t('requirements.idShifted', { count: res.data.shiftedCount }));
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
      const res = await api.delete(`/requirements/${item.id}`);
      if (res.data.renumberedCount > 0) {
        alert(t('requirements.idRenumbered', { count: res.data.renumberedCount }));
      }
      load();
    } catch (err) {
      alert(err.response?.data?.error || t('common.error'));
    }
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const openHistory = (item = null) => {
    setHistoryTarget(item);
    setHistoryOpen(true);
    fetchHistory(item);
  };

  const exportExcel = async () => {
    const prefix = sanitizeExportPrefix(exportPrefix);
    const res = await api.get('/excel/export', {
      params: { projectId: activeProjectId, prefix: prefix || undefined },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildExportFilename(prefix, 'requirements_export', 'xlsx');
    a.click();
    URL.revokeObjectURL(url);
  };

  const importExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post(`/excel/import?projectId=${activeProjectId}`, formData);
      alert(t('requirements.importSuccessMessage', {
        reqs: res.data.requirements,
        tcs: res.data.testCases,
      }));
      load();
    } catch (err) {
      alert(t('requirements.importError') + ': ' + (err.response?.data?.error || err.message));
    }
    fileRef.current.value = '';
  };

  return (
    <Layout>
      {!activeProjectId ? (
        <div className="empty-state">{t('projects.selectProject')}</div>
      ) : (
      <>
      <div className="page-header">
        <h2>{t('requirements.title')}{activeProject ? ` — ${activeProject.name}` : ''}</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => openHistory()}>
            <span className="btn-icon" aria-hidden="true">📜</span>
            {t('requirements.history')}
          </button>
          <button className="btn btn-secondary" onClick={exportExcel}>
            <span className="btn-icon" aria-hidden="true">📤</span>
            {t('requirements.export')}
          </button>
          {canEditProject && (
            <>
              <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                <span className="btn-icon" aria-hidden="true">📥</span>
                {t('requirements.import')}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importExcel} />
              <button className="btn btn-primary" onClick={openAdd}>
                <span className="btn-icon" aria-hidden="true">➕</span>
                {t('requirements.add')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span>{t('common.exportPrefix')}</span>
          <input
            className="form-control"
            style={{ maxWidth: 240 }}
            value={exportPrefix}
            onChange={e => setExportPrefix(e.target.value)}
            placeholder={activeProject?.name ?? ''}
          />
        </label>
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
                {canEditProject && <th>{t('common.actions')}</th>}
                <th>{t('requirements.history')}</th>
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
                  {canEditProject && (
                    <td className="actions-cell">
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(item)}>
                        <span className="btn-icon" aria-hidden="true">✏️</span>
                        {t('common.edit')}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(item)}>
                        <span className="btn-icon" aria-hidden="true">🗑️</span>
                        {t('common.delete')}
                      </button>
                    </td>
                  )}
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => openHistory(item)}>
                      <span className="btn-icon" aria-hidden="true">📜</span>
                      {t('requirements.historyView')}
                    </button>
                  </td>
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
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              <span className="btn-icon" aria-hidden="true">✖️</span>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <span className="btn-icon" aria-hidden="true">💾</span>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label>{t('requirements.reqId')} *</label>
            <input className="form-control" value={form.reqId} onChange={set('reqId')} required />
            {!editing && (
              <small style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {t('requirements.reqIdAutoHint')}
              </small>
            )}
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
            <select className="form-control" value={form.owner} onChange={set('owner')}>
              <option value="">{t('requirements.ownerNone')}</option>
              {participants.map((member) => {
                const label = participantLabel(member);
                return (
                  <option key={member.userId} value={label}>
                    {label}{member.username && member.displayName ? ` (${member.username})` : ''}
                  </option>
                );
              })}
            </select>
            <small style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {t('requirements.ownerHint')}
            </small>
          </div>
        </div>
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={t('requirements.historyTitle', { target: historyTitle })}
        footer={
          <button className="btn btn-secondary" onClick={() => setHistoryOpen(false)}>
            <span className="btn-icon" aria-hidden="true">✖️</span>
            {t('common.close')}
          </button>
        }
      >
        {historyLoading ? (
          <div className="empty-state">{t('common.loading')}</div>
        ) : historyItems.length === 0 ? (
          <div className="empty-state">{t('requirements.historyEmpty')}</div>
        ) : (
          <div className="table-container" style={{ maxHeight: 420, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('requirements.historyWhen')}</th>
                  <th>{t('requirements.historyWho')}</th>
                  <th>{t('requirements.reqId')}</th>
                  <th>{t('requirements.historyAction')}</th>
                  <th>{t('requirements.historyDetails')}</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(entry.changedAt)}</td>
                    <td>{entry.changedByName || '-'}</td>
                    <td><strong>{entry.reqId}</strong></td>
                    <td>{t(`requirements.historyActions.${entry.action}`)}</td>
                    <td style={{ fontSize: 12, maxWidth: 360 }}>{formatHistorySummary(entry, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
      </>
      )}
    </Layout>
  );
}
