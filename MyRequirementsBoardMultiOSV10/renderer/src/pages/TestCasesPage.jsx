import { useEffect, useState } from 'react';
import { Pencil, Search } from 'lucide-react';
import { api } from '../api/client.js';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import TableInlineSelect from '../components/TableInlineSelect.jsx';
import TestCaseEditDialog from '../components/TestCaseEditDialog.jsx';
import { getDisplayProjectName } from '../lib/displayLabels.js';

const TC_STATUS_KEYS = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'];

export default function TestCasesPage() {
  const { activeProject, canEditProject } = useProject();
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', requirementId: '' });
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const load = async () => {
    if (!activeProject) return;
    const params = {};
    if (filters.q) params.q = filters.q;
    if (filters.status) params.status = filters.status;
    if (filters.requirementId) params.requirementId = filters.requirementId;

    const [testCases, requirementList] = await Promise.all([
      api.listTestCases(activeProject.id, params),
      api.listRequirements(activeProject.id),
    ]);
    setItems(testCases);
    setRequirements(requirementList);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [activeProject, filters.status, filters.requirementId]);

  const handleSearch = (e) => {
    e.preventDefault();
    load().catch((err) => setError(err.message));
  };

  const openEdit = (item) => {
    setSelectedId(item.id);
    setEditingItem(item);
  };

  const closeEdit = () => {
    setEditingItem(null);
  };

  const handleSaved = (updated) => {
    setItems((prev) => prev.map((row) => (
      row.id === updated.id
        ? {
          ...row,
          title: updated.title,
          description: updated.description,
          steps: updated.steps,
          expectedResult: updated.expectedResult,
          status: updated.status,
          updatedAt: updated.updatedAt,
        }
        : row
    )));
  };

  const handleInlineStatusChange = async (item, nextStatus) => {
    if (!canEditProject || item.status === nextStatus) return;

    const previousValue = item.status;
    setItems((prev) => prev.map((row) => (
      row.id === item.id ? { ...row, status: nextStatus } : row
    )));

    try {
      await api.updateTestCase(item.requirementId, item.id, { status: nextStatus });
    } catch (err) {
      setItems((prev) => prev.map((row) => (
        row.id === item.id ? { ...row, status: previousValue } : row
      )));
      setError(err.message);
    }
  };

  const getTcStatusLabel = (key) => (
    TC_STATUS_KEYS.includes(key) ? t(`tcStatus.${key}`) : key
  );

  if (!activeProject) {
    return (
      <div className="container">
        <p>{t('common.noProject')}</p>
        <p className="muted">{t('common.requestProjectAssign')}</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>{t('testCasesPage.title', { name: getDisplayProjectName(activeProject, t) })}</h1>
      <p className="muted">{t('requirements.tcNumberingNote')}</p>
      {error && <p className="error">{error}</p>}

      <div className="requirements-toolbar toolbar">
        <form className="requirements-toolbar__search" onSubmit={handleSearch}>
          <input
            placeholder={t('testCasesPage.searchPlaceholder')}
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
          <select
            value={filters.requirementId}
            onChange={(e) => setFilters({ ...filters, requirementId: e.target.value })}
            aria-label={t('testCasesPage.requirementFilter')}
          >
            <option value="">{t('testCasesPage.allRequirements')}</option>
            {requirements.map((req) => (
              <option key={req.id} value={req.id}>{req.code} — {req.title}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            aria-label={t('testCasesPage.statusFilter')}
          >
            <option value="">{t('testCasesPage.allStatuses')}</option>
            {TC_STATUS_KEYS.map((key) => (
              <option key={key} value={key}>{t(`tcStatus.${key}`)}</option>
            ))}
          </select>
          <IconButton icon={Search} className="btn-secondary" type="submit" tooltip={t('testCasesPage.tipSearch')}>
            {t('common.search')}
          </IconButton>
        </form>
      </div>

      <table>
        <thead>
          <tr>
            <th>{t('common.code')}</th>
            <th>{t('testCasesPage.requirement')}</th>
            <th>{t('common.title')}</th>
            <th>{t('common.description')}</th>
            <th>{t('common.status')}</th>
            <th>{t('common.updatedAt')}</th>
            {canEditProject && <th aria-hidden="true" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className={`row-selectable${selectedId === item.id ? ' row-selected' : ''}`}
              onClick={() => openEdit(item)}
            >
              <td title={item.code}>{item.code}</td>
              <td title={item.requirementTitle}>{item.requirementCode}</td>
              <td title={item.title}>{item.title}</td>
              <td title={item.description}>{item.description || t('common.dash')}</td>
              <td className="test-cases-table__status-cell" onClick={(e) => e.stopPropagation()}>
                <TableInlineSelect
                  value={TC_STATUS_KEYS.includes(item.status) ? item.status : 'NOT_RUN'}
                  options={TC_STATUS_KEYS}
                  getLabel={getTcStatusLabel}
                  onChange={(value) => { void handleInlineStatusChange(item, value); }}
                  disabled={!canEditProject}
                  variant="badge"
                  ariaLabel={t('common.status')}
                />
              </td>
              <td>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : t('common.dash')}</td>
              {canEditProject && (
                <td onClick={(e) => e.stopPropagation()}>
                  <IconButton
                    icon={Pencil}
                    className="btn-secondary table-action"
                    type="button"
                    onClick={() => openEdit(item)}
                    tooltip={t('requirements.tipEditTc')}
                  >
                    {t('common.edit')}
                  </IconButton>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="muted">{t('requirements.tcEmpty')}</p>}

      <TestCaseEditDialog
        open={Boolean(editingItem)}
        testCase={editingItem}
        readOnly={!canEditProject}
        onClose={closeEdit}
        onSaved={handleSaved}
      />
    </div>
  );
}
