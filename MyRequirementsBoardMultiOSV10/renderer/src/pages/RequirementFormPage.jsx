import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ClipboardCopy, Loader2, Pencil, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useUndoHistory } from '../context/UndoHistoryContext.jsx';
import { requirementPayload, testCasePayload } from '../lib/requirementUndoActions.js';
import { IconButton } from '../components/IconButton.jsx';
import { IconLink } from '../components/IconLink.jsx';
import TableInlineSelect from '../components/TableInlineSelect.jsx';
import SortableTableHeader from '../components/SortableTableHeader.jsx';
import { openRowContextMenu, useContextMenu } from '../components/ContextMenu.jsx';
import { useTableSort } from '../hooks/useTableSort.js';
import { REQUIREMENT_FORM_TC_SORT, sortRows } from '../lib/tableSort.js';
import { getDisplayProjectName } from '../lib/displayLabels.js';
import { ROUTES } from '../lib/routes.js';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog.jsx';
import ErrorDialog from '../components/ErrorDialog.jsx';

const emptyTestCaseForm = {
  code: '',
  title: '',
  description: '',
  steps: '',
  expectedResult: '',
  status: 'NOT_RUN',
};

const TC_STATUS_KEYS = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'];
const PRIORITY_KEYS = ['LOW', 'MEDIUM', 'HIGH'];
const STATUS_KEYS = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DONE'];

const emptyForm = {
  title: '',
  description: '',
  category: '',
  classification: '',
  priority: 'MEDIUM',
  status: 'DRAFT',
  assigneeUserId: null,
};

export default function RequirementFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { activeProject, canEditProject } = useProject();
  const { t } = useLanguage();
  const { push, subscribe } = useUndoHistory();
  const [form, setForm] = useState(emptyForm);
  const [requirementCode, setRequirementCode] = useState('');
  const savedFormRef = useRef(null);
  const [testCases, setTestCases] = useState([]);
  const [selectedTestCases, setSelectedTestCases] = useState([]);
  const [editingTestCase, setEditingTestCase] = useState(null);
  const [testCaseForm, setTestCaseForm] = useState(emptyTestCaseForm);
  const [error, setError] = useState('');
  const [refining, setRefining] = useState(false);
  const [deleteTcPending, setDeleteTcPending] = useState(null);
  const { openContextMenu } = useContextMenu();
  const { sort, toggleSort } = useTableSort();

  useEffect(() => {
    if (!canEditProject || !isEdit || !activeProject) return;
    api.getRequirement(activeProject.id, id)
      .then((data) => {
        const loaded = {
          title: data.title,
          description: data.description || '',
          category: data.category || '',
          classification: data.classification || '',
          priority: data.priority,
          status: data.status,
          assigneeUserId: data.assigneeUserId ?? null,
        };
        setForm(loaded);
        setRequirementCode(data.code || '');
        savedFormRef.current = loaded;
        setTestCases(data.testCases || []);
        setSelectedTestCases([]);
      })
      .catch((e) => setError(e.message));
  }, [id, isEdit, activeProject]);

  useEffect(() => {
    if (!isEdit || !activeProject) return undefined;
    return subscribe(() => {
      api.getRequirement(activeProject.id, id)
        .then((data) => {
          const loaded = {
            title: data.title,
            description: data.description || '',
            category: data.category || '',
            classification: data.classification || '',
            priority: data.priority,
            status: data.status,
          };
          setForm(loaded);
          setRequirementCode(data.code || '');
          savedFormRef.current = loaded;
          setTestCases(data.testCases || []);
        })
        .catch((e) => setError(e.message));
    });
  }, [id, isEdit, activeProject, subscribe]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeProject) return;
    setError('');
    try {
      if (isEdit) {
        const before = savedFormRef.current || form;
        const updated = await api.updateRequirement(activeProject.id, id, form);
        setRequirementCode(updated.code || '');
        push({
          type: 'requirement.update',
          requirementId: Number(id),
          before: requirementPayload(before),
          after: requirementPayload(form),
        });
        savedFormRef.current = { ...form };
      } else {
        const created = await api.createRequirement(activeProject.id, form);
        push({
          type: 'requirement.create',
          requirementId: created.id,
          snapshot: requirementPayload(form),
        });
      }
      navigate(ROUTES.requirements);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRefine = async () => {
    setRefining(true);
    setError('');
    try {
      const result = await api.refineRequirement(form);
      setForm((prev) => ({
        ...prev,
        title: result.refined.title || prev.title,
        description: result.refined.description || prev.description,
        category: result.refined.category || prev.category,
        classification: result.refined.classification || prev.classification,
        priority: result.refined.priority || prev.priority,
        status: result.refined.status || prev.status,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setRefining(false);
    }
  };

  const reloadTestCases = async () => {
    const data = await api.getRequirement(activeProject.id, id);
    setTestCases(data.testCases || []);
  };

  const startNewTestCase = () => {
    setEditingTestCase('new');
    setTestCaseForm(emptyTestCaseForm);
  };

  const startEditTestCase = (tc) => {
    setEditingTestCase(tc.id);
    setTestCaseForm({
      code: tc.code,
      title: tc.title,
      description: tc.description || '',
      steps: tc.steps || '',
      expectedResult: tc.expectedResult || '',
      status: tc.status || 'NOT_RUN',
    });
  };

  const handleSaveTestCase = async (e) => {
    e.preventDefault();
    if (!testCaseForm.title) {
      setError(t('requirements.tcTitleRequired'));
      return;
    }
    setError('');
    try {
      if (editingTestCase === 'new') {
        const { code: _ignored, ...payload } = testCaseForm;
        const created = await api.createTestCase(id, payload);
        push({
          type: 'testCase.create',
          requirementId: Number(id),
          testCaseId: created.id,
          snapshot: testCasePayload({ ...payload, code: created.code }),
        });
      } else {
        const before = testCases.find((item) => item.id === editingTestCase);
        const { code: _ignored, ...payload } = testCaseForm;
        await api.updateTestCase(id, editingTestCase, payload);
        if (before) {
          push({
            type: 'testCase.update',
            requirementId: Number(id),
            testCaseId: editingTestCase,
            before: testCasePayload(before),
            after: testCasePayload({ ...before, ...payload }),
          });
        }
      }
      await reloadTestCases();
      setEditingTestCase(null);
      setTestCaseForm(emptyTestCaseForm);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleInlineTestCaseStatusChange = async (tc, nextStatus) => {
    if (tc.status === nextStatus) return;

    const before = testCasePayload(tc);
    setTestCases((prev) => prev.map((row) => (
      row.id === tc.id ? { ...row, status: nextStatus } : row
    )));

    try {
      await api.updateTestCase(id, tc.id, { status: nextStatus });
      push({
        type: 'testCase.update',
        requirementId: Number(id),
        testCaseId: tc.id,
        before,
        after: testCasePayload({ ...tc, status: nextStatus }),
      });
    } catch (err) {
      setTestCases((prev) => prev.map((row) => (
        row.id === tc.id ? { ...row, status: tc.status } : row
      )));
      setError(err.message);
    }
  };

  const getTcStatusLabel = (key) => (
    TC_STATUS_KEYS.includes(key) ? t(`tcStatus.${key}`) : key
  );

  const sortedTestCases = useMemo(
    () => sortRows(testCases, sort, REQUIREMENT_FORM_TC_SORT),
    [testCases, sort],
  );

  const getTcSortTitle = (columnId, label) => {
    const isActive = sort?.columnId === columnId;
    const directionLabel = isActive
      ? (sort.direction === 'asc' ? t('common.sortAscending') : t('common.sortDescending'))
      : '';
    return isActive
      ? `${t('common.sortColumn', { column: label })} (${directionLabel})`
      : t('common.sortColumn', { column: label });
  };

  const handleDeleteTestCase = (tcId) => {
    setDeleteTcPending(tcId);
  };

  const handleDeleteTestCaseConfirm = async () => {
    const tcId = deleteTcPending;
    setDeleteTcPending(null);
    if (!tcId) return;
    const target = testCases.find((item) => item.id === tcId);
    setError('');
    try {
      await api.deleteTestCase(id, tcId);
      if (target) {
        push({
          type: 'testCase.delete',
          requirementId: Number(id),
          testCaseId: tcId,
          snapshot: testCasePayload(target),
        });
      }
      await reloadTestCases();
      if (editingTestCase === tcId) {
        setEditingTestCase(null);
        setTestCaseForm(emptyTestCaseForm);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTestCaseContextMenu = (e, tc) => {
    openRowContextMenu(e, {
      openContextMenu,
      rowId: tc.id,
      selectedIds: selectedTestCases,
      setSelectedIds: setSelectedTestCases,
      multiSelect: true,
      items: (selection) => {
        const targets = testCases.filter((item) => selection.includes(item.id));
        return [
          {
            id: 'edit-tc',
            icon: Pencil,
            label: t('common.edit'),
            tooltip: t('requirements.tipEditTc'),
            onClick: () => startEditTestCase(tc),
          },
          {
            id: 'copy-code',
            icon: ClipboardCopy,
            label: t('requirements.copyCode', { count: selection.length }),
            tooltip: t('requirements.tipCopyCode'),
            onClick: () => {
              const text = targets.map((item) => item.code).join('\n');
              navigator.clipboard?.writeText(text);
            },
          },
          {
            id: 'delete-tc',
            icon: Trash2,
            label: t('common.delete'),
            tooltip: t('requirements.tipDeleteTc'),
            danger: true,
            onClick: () => handleDeleteTestCase(tc.id),
          },
        ];
      },
    });
  };

  if (!activeProject) {
    return <div className="container">{t('common.selectProject')}</div>;
  }

  if (!canEditProject) {
    return <div className="container">{t('requirements.noEditPermission')}</div>;
  }

  return (
    <div className="container">
      <h1>{isEdit ? t('requirements.editTitle') : t('requirements.newTitle')}</h1>
      <p className="muted">{t('requirements.projectLabel', { name: getDisplayProjectName(activeProject, t) })}</p>
      <ErrorDialog message={error} onClose={() => setError('')} />

      <form onSubmit={handleSubmit} className="card">
        {isEdit && requirementCode && (
          <div className="form-row">
            <label>{t('common.requirementCode')}</label>
            <input value={requirementCode} readOnly aria-readonly="true" />
          </div>
        )}
        <div className="form-row">
          <label>{t('common.classification')}</label>
          <input
            value={form.classification}
            onChange={(e) => setForm({ ...form, classification: e.target.value })}
            placeholder={t('requirements.classificationPlaceholder')}
          />
        </div>
        <div className="form-row">
          <label>{t('common.title')}</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="form-row">
          <label>{t('common.description')}</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="form-row">
          <label>{t('common.category')}</label>
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t('requirements.categoryPlaceholder')} />
        </div>
        <div className="form-row">
          <label>{t('common.priority')}</label>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {PRIORITY_KEYS.map((k) => <option key={k} value={k}>{t(`priority.${k}`)}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>{t('common.status')}</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUS_KEYS.map((k) => <option key={k} value={k}>{t(`status.${k}`)}</option>)}
          </select>
        </div>

        <div className="form-actions">
          <IconButton
            icon={isEdit ? Save : Plus}
            className="btn-primary"
            type="submit"
            tooltip={isEdit ? t('requirements.tipSave') : t('requirements.tipCreate')}
          >
            {isEdit ? t('requirements.save') : t('common.create')}
          </IconButton>
          <IconButton
            icon={refining ? Loader2 : Sparkles}
            className="btn-secondary"
            type="button"
            onClick={handleRefine}
            disabled={refining}
            iconClassName={refining ? 'icon-spin' : ''}
            tooltip={t('requirements.tipRefine')}
          >
            {refining ? t('requirements.refining') : t('requirements.refine')}
          </IconButton>
          <IconLink icon={ArrowLeft} className="btn btn-secondary" to={ROUTES.requirements} tooltip={t('requirements.back')}>{t('common.cancel')}</IconLink>
        </div>
      </form>

      {isEdit && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0 }}>{t('requirements.testCases')}</h2>
            <IconButton icon={Plus} className="btn-secondary" type="button" onClick={startNewTestCase} tooltip={t('requirements.tipAddTc')}>
              {t('requirements.addTestCase')}
            </IconButton>
          </div>
          <p className="muted">{t('requirements.tcNumberingNote')}</p>

          {editingTestCase && (
            <form onSubmit={handleSaveTestCase} className="card" style={{ marginTop: 16, background: '#f9fafb' }}>
              <h3>{editingTestCase === 'new' ? t('requirements.newTestCase') : t('requirements.editTestCase')}</h3>
              {editingTestCase !== 'new' && testCaseForm.code && (
                <div className="form-row">
                  <label>{t('common.requirementCode')}</label>
                  <input value={testCaseForm.code} readOnly aria-readonly="true" />
                </div>
              )}
              <div className="form-row">
                <label>{t('common.title')}</label>
                <input value={testCaseForm.title} onChange={(e) => setTestCaseForm({ ...testCaseForm, title: e.target.value })} required />
              </div>
              <div className="form-row">
                <label>{t('common.description')}</label>
                <textarea value={testCaseForm.description} onChange={(e) => setTestCaseForm({ ...testCaseForm, description: e.target.value })} />
              </div>
              <div className="form-row">
                <label>{t('requirements.steps')}</label>
                <textarea value={testCaseForm.steps} onChange={(e) => setTestCaseForm({ ...testCaseForm, steps: e.target.value })} />
              </div>
              <div className="form-row">
                <label>{t('requirements.expectedResult')}</label>
                <textarea value={testCaseForm.expectedResult} onChange={(e) => setTestCaseForm({ ...testCaseForm, expectedResult: e.target.value })} />
              </div>
              <div className="form-row">
                <label>{t('common.status')}</label>
                <select value={testCaseForm.status} onChange={(e) => setTestCaseForm({ ...testCaseForm, status: e.target.value })}>
                  {TC_STATUS_KEYS.map((k) => <option key={k} value={k}>{t(`tcStatus.${k}`)}</option>)}
                </select>
              </div>
              <div className="form-actions">
                <IconButton icon={Save} className="btn-primary" type="submit" tooltip={t('requirements.tipSaveTc')}>{t('common.save')}</IconButton>
                <IconButton icon={ArrowLeft} className="btn-secondary" type="button" onClick={() => setEditingTestCase(null)} tooltip={t('users.tipCancel')}>{t('common.cancel')}</IconButton>
              </div>
            </form>
          )}

          {testCases.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <SortableTableHeader
                    columnId="code"
                    label={t('common.requirementCode')}
                    sort={sort}
                    onSort={toggleSort}
                    title={getTcSortTitle('code', t('common.requirementCode'))}
                  />
                  <SortableTableHeader
                    columnId="title"
                    label={t('common.title')}
                    sort={sort}
                    onSort={toggleSort}
                    title={getTcSortTitle('title', t('common.title'))}
                  />
                  <SortableTableHeader
                    columnId="description"
                    label={t('common.description')}
                    sort={sort}
                    onSort={toggleSort}
                    title={getTcSortTitle('description', t('common.description'))}
                  />
                  <SortableTableHeader
                    columnId="status"
                    label={t('common.status')}
                    sort={sort}
                    onSort={toggleSort}
                    title={getTcSortTitle('status', t('common.status'))}
                  />
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {sortedTestCases.map((tc) => (
                  <tr
                    key={tc.id}
                    className={`row-selectable${selectedTestCases.includes(tc.id) ? ' row-selected' : ''}`}
                    onClick={() => setSelectedTestCases([tc.id])}
                    onContextMenu={(e) => handleTestCaseContextMenu(e, tc)}
                  >
                    <td>{tc.code}</td>
                    <td>{tc.title}</td>
                    <td>{tc.description || t('common.dash')}</td>
                    <td className="test-cases-table__status-cell" onClick={(e) => e.stopPropagation()}>
                      <TableInlineSelect
                        value={TC_STATUS_KEYS.includes(tc.status) ? tc.status : 'NOT_RUN'}
                        options={TC_STATUS_KEYS}
                        getLabel={getTcStatusLabel}
                        onChange={(value) => { void handleInlineTestCaseStatusChange(tc, value); }}
                        variant="badge"
                        ariaLabel={t('common.status')}
                      />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <IconButton icon={Pencil} className="btn-secondary" type="button" onClick={() => startEditTestCase(tc)} tooltip={t('requirements.tipEditTc')}>{t('common.edit')}</IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">{t('requirements.tcEmpty')}</p>
          )}
        </div>
      )}
      <DeleteConfirmDialog
        open={deleteTcPending !== null}
        message={t('requirements.tcDeleteConfirm')}
        onConfirm={handleDeleteTestCaseConfirm}
        onCancel={() => setDeleteTcPending(null)}
      />
    </div>
  );
}
