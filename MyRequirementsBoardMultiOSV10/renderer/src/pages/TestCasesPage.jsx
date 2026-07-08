import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Pencil, Plus, Search, Sparkles, Square, Trash2 } from 'lucide-react';
import { api } from '../api/client.js';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useUndoHistory } from '../context/UndoHistoryContext.jsx';
import { useExcelDialogs } from '../context/ExcelDialogContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { openRowContextMenu, useContextMenu } from '../components/ContextMenu.jsx';
import TableInlineSelect from '../components/TableInlineSelect.jsx';
import SortableTableHeader from '../components/SortableTableHeader.jsx';
import AiRefineConfirmDialog from '../components/AiRefineConfirmDialog.jsx';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog.jsx';
import ErrorDialog from '../components/ErrorDialog.jsx';
import TestCaseEditDialog from '../components/TestCaseEditDialog.jsx';
import { useAiRefineJob } from '../context/AiRefineContext.jsx';
import { useAiRefineRowHighlight } from '../hooks/useAiRefineRowHighlight.js';
import { useAiRefinePageSync } from '../hooks/useAiRefinePageSync.js';
import { useTestCasesTableColumns } from '../hooks/useTestCasesTableColumns.js';
import { useTableSort } from '../hooks/useTableSort.js';
import { usePageToolbarLayout } from '../hooks/usePageToolbarLayout.js';
import { useStatusBarReport } from '../hooks/useStatusBarReport.js';
import { TEST_CASES_TABLE_SORT, sortRows } from '../lib/tableSort.js';
import { toTestCasesColumnPercentWidth } from '../lib/testCasesTableLayout.js';
import { getDisplayProjectName } from '../lib/displayLabels.js';
import { hasTestCaseRefineGap } from '../lib/aiRefineEligibility.js';

const TC_STATUS_KEYS = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'];

export default function TestCasesPage() {
  const {
    activeProject,
    canEditProject,
    updateActiveProjectUiSettings,
  } = useProject();
  const { t, language } = useLanguage();
  const { subscribe } = useUndoHistory();
  const { subscribeDataChange } = useExcelDialogs();
  const { openContextMenu } = useContextMenu();
  const [items, setItems] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', requirementId: '' });
  const [error, setError] = useState('');
  const [aiRefineConfirm, setAiRefineConfirm] = useState(null);
  const [deletePending, setDeletePending] = useState(null);
  const refineJob = useAiRefineJob('testCases');
  const refining = refineJob.refining && refineJob.projectId === activeProject?.id;
  const refineProgress = refining ? refineJob.progress : null;
  const refinedRowIds = refineJob.projectId === activeProject?.id ? refineJob.refinedRowIds : [];
  const {
    resetRefineState,
    applyRowCommitted,
    isCellRefined,
  } = useAiRefineRowHighlight({
    tableFieldKeys: ['title', 'description', 'steps', 'expectedResult', 'status'],
  });
  const [selected, setSelected] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const { sort, toggleSort } = useTableSort();
  usePageToolbarLayout([selected.length, refining, canEditProject, language]);

  const {
    columns,
    widths,
    resizingColumnId,
    startResize,
  } = useTestCasesTableColumns({
    projectId: activeProject?.id,
    uiSettings: activeProject?.uiSettings,
    canEdit: canEditProject,
    onUiSettingsSaved: updateActiveProjectUiSettings,
  });

  const columnLabels = useMemo(() => ({
    code: t('common.code'),
    requirement: t('testCasesPage.requirement'),
    title: t('common.title'),
    description: t('common.description'),
    steps: t('requirements.steps'),
    expectedResult: t('requirements.expectedResult'),
    status: t('common.status'),
    updatedAt: t('common.updatedAt'),
  }), [t]);

  const sortedItems = useMemo(
    () => sortRows(items, sort, TEST_CASES_TABLE_SORT),
    [items, sort],
  );

  const statusHint = useMemo(() => {
    if (selected.length > 0) return t('statusBar.selectedCount', { count: selected.length });
    return t('statusBar.itemCount', { count: items.length });
  }, [selected.length, items.length, t]);

  useStatusBarReport({
    hint: statusHint,
  });

  useAiRefinePageSync('testCases', {
    applyRowCommitted,
    setItems,
    mapMergedRow: (row, merged) => ({ ...row, ...merged, updatedAt: new Date().toISOString() }),
  });

  const getSortTitle = (columnId) => {
    const label = columnLabels[columnId];
    const isActive = sort?.columnId === columnId;
    const directionLabel = isActive
      ? (sort.direction === 'asc' ? t('common.sortAscending') : t('common.sortDescending'))
      : '';
    return isActive
      ? `${t('common.sortColumn', { column: label })} (${directionLabel})`
      : t('common.sortColumn', { column: label });
  };

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
    if (filters.requirementId && !requirementList.some((req) => String(req.id) === String(filters.requirementId))) {
      setFilters((prev) => ({ ...prev, requirementId: '' }));
    }
    setSelected([]);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [activeProject, filters.status, filters.requirementId]);

  useEffect(() => subscribe(() => {
    load().catch((e) => setError(e.message));
  }), [activeProject, subscribe]);

  useEffect(() => subscribeDataChange(() => {
    load().catch((e) => setError(e.message));
  }), [activeProject, subscribeDataChange]);

  const handleSearch = (e) => {
    e.preventDefault();
    load().catch((err) => setError(err.message));
  };

  const openEdit = (item) => {
    setEditingItem(item);
  };

  const openCreate = () => {
    const preferredRequirementId = String(
      filters.requirementId || (requirements.length === 1 ? requirements[0].id : ''),
    );
    const requirement = requirements.find((req) => String(req.id) === preferredRequirementId);

    setEditingItem({
      id: null,
      code: '',
      title: '',
      description: '',
      steps: '',
      expectedResult: '',
      status: 'NOT_RUN',
      requirementId: preferredRequirementId ? Number(preferredRequirementId) : '',
      requirementCode: requirement?.code || '',
      requirementTitle: requirement?.title || '',
      __isNew: true,
    });
  };

  const closeEdit = () => {
    setEditingItem(null);
  };

  const toggleAll = (checked) => {
    setSelected(checked ? items.map((i) => i.id) : []);
  };

  const toggleOne = (id, checked) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const handleDeleteSelection = (ids) => {
    if (ids.length === 0) return;
    setDeletePending(ids);
  };

  const handleDeleteConfirm = async () => {
    const ids = deletePending;
    setDeletePending(null);
    if (!ids?.length) return;
    try {
      const targets = items.filter((item) => ids.includes(item.id));
      await Promise.all(
        targets.map((item) => api.deleteTestCase(item.requirementId, item.id)),
      );
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkDelete = () => handleDeleteSelection(selected);

  const handleAiRefineClick = () => {
    if (refining) {
      refineJob.cancelRefine();
      return;
    }
    void openAiRefineConfirm();
  };

  const openAiRefineConfirm = () => {
    if (!canEditProject || !activeProject) return;

    const scopedItems = selected.length > 0
      ? items.filter((item) => selected.includes(item.id))
      : items;
    const targetItems = scopedItems.filter(hasTestCaseRefineGap);

    if (targetItems.length === 0) {
      setError(t('testCasesPage.aiRefineEmpty'));
      return;
    }

    setAiRefineConfirm({
      targetItems,
      selected: selected.length > 0,
    });
  };

  const handleAiRefineConfirm = () => {
    if (!aiRefineConfirm) return;
    const { targetItems } = aiRefineConfirm;
    setAiRefineConfirm(null);
    resetRefineState();
    setError('');
    void refineJob.startTestCasesRefine({
      projectId: activeProject.id,
      items: targetItems,
      requirements,
    });
  };

  const handleRowClick = (e, item) => {
    if (!canEditProject) {
      openEdit(item);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      toggleOne(item.id, !selected.includes(item.id));
      return;
    }
    setSelected([item.id]);
  };

  const handleRowContextMenu = (e, item) => {
    if (!canEditProject) return;
    openRowContextMenu(e, {
      openContextMenu,
      rowId: item.id,
      selectedIds: selected,
      setSelectedIds: setSelected,
      multiSelect: true,
      items: (selection) => {
        const count = selection.length;
        const menu = [];

        if (count === 1) {
          const target = items.find((row) => row.id === selection[0]);
          menu.push({
            id: 'edit',
            icon: Pencil,
            label: t('common.edit'),
            tooltip: t('requirements.tipEditTc'),
            onClick: () => {
              if (target) openEdit(target);
            },
          });
        }

        menu.push({
          id: 'delete',
          icon: Trash2,
          label: count > 1 ? t('common.selectDelete', { count }) : t('common.delete'),
          tooltip: t('requirements.tipDeleteTc'),
          danger: true,
          onClick: () => handleDeleteSelection(selection),
        });

        menu.push({ separator: true });
        menu.push({
          id: 'select-all',
          icon: CheckSquare,
          label: t('common.selectAll'),
          tooltip: t('requirements.tipSelectAll'),
          disabled: count === items.length,
          onClick: () => setSelected(items.map((i) => i.id)),
        });
        menu.push({
          id: 'clear',
          icon: Square,
          label: t('common.clearSelection'),
          tooltip: t('common.clearSelection'),
          disabled: count === 0,
          onClick: () => setSelected([]),
        });

        return menu;
      },
    });
  };

  const handleTableContextMenu = (e) => {
    if (!canEditProject || selected.length === 0) return;
    e.preventDefault();
    openContextMenu(e, [
      ...(selected.length === 1 ? [{
        id: 'edit',
        icon: Pencil,
        label: t('common.edit'),
        tooltip: t('requirements.tipEditTc'),
        onClick: () => {
          const target = items.find((row) => row.id === selected[0]);
          if (target) openEdit(target);
        },
      }] : []),
      {
        id: 'delete',
        icon: Trash2,
        label: t('common.selectDelete', { count: selected.length }),
        tooltip: t('requirements.tipDeleteTc'),
        danger: true,
        onClick: () => handleDeleteSelection(selected),
      },
      { separator: true },
      {
        id: 'clear',
        icon: Square,
        label: t('common.clearSelection'),
        tooltip: t('common.clearSelection'),
        onClick: () => setSelected([]),
      },
    ]);
  };

  const handleSaved = (updated) => {
    if (editingItem?.__isNew) {
      setItems((prev) => [{ ...updated }, ...prev]);
      return;
    }

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

  const renderHeaderCell = (column) => {
    const resizeHandle = canEditProject && column.id !== 'actions' ? (
      <span
        className={`requirements-table__resize-handle${resizingColumnId === column.id ? ' is-active' : ''}`}
        onMouseDown={(event) => startResize(column.id, event)}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('requirements.resizeColumn')}
      />
    ) : null;

    if (column.id === 'select') {
      return (
        <th key={column.id} className="test-cases-table__head-cell test-cases-table__select-cell">
          <input
            type="checkbox"
            checked={selected.length === items.length && items.length > 0}
            onChange={(e) => toggleAll(e.target.checked)}
            aria-label={t('common.selectAll')}
          />
          {resizeHandle}
        </th>
      );
    }

    if (column.id === 'actions') {
      return <th key={column.id} className="test-cases-table__head-cell test-cases-table__actions-cell" aria-hidden="true" />;
    }

    return (
      <SortableTableHeader
        key={column.id}
        columnId={column.id}
        label={columnLabels[column.id]}
        sort={sort}
        onSort={toggleSort}
        className="test-cases-table__head-cell"
        title={getSortTitle(column.id)}
        sortable={Boolean(TEST_CASES_TABLE_SORT[column.id])}
      >
        {resizeHandle}
      </SortableTableHeader>
    );
  };

  const renderBodyCell = (item, column) => {
    const stop = (event) => event.stopPropagation();

    switch (column.id) {
      case 'select':
        return (
          <td key={column.id} className="test-cases-table__select-cell" onClick={stop}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(e) => toggleOne(item.id, e.target.checked)}
              aria-label={item.code}
            />
          </td>
        );
      case 'code':
        return <td key={column.id} className="test-cases-table__code-cell" title={item.code}>{item.code}</td>;
      case 'requirement':
        return <td key={column.id} className="test-cases-table__requirement-cell" title={item.requirementTitle}>{item.requirementCode}</td>;
      case 'title':
        return (
          <td key={column.id} className={isCellRefined(item.id, 'title') ? 'cell-refined' : ''} title={item.title}>
            {item.title}
          </td>
        );
      case 'description':
        return (
          <td key={column.id} className={isCellRefined(item.id, 'description') ? 'cell-refined' : ''} title={item.description}>
            {item.description || t('common.dash')}
          </td>
        );
      case 'steps':
        return (
          <td key={column.id} className={isCellRefined(item.id, 'steps') ? 'cell-refined' : ''} title={item.steps}>
            {item.steps || t('common.dash')}
          </td>
        );
      case 'expectedResult':
        return (
          <td key={column.id} className={isCellRefined(item.id, 'expectedResult') ? 'cell-refined' : ''} title={item.expectedResult}>
            {item.expectedResult || t('common.dash')}
          </td>
        );
      case 'status':
        return (
          <td key={column.id} className="test-cases-table__status-cell" onClick={stop}>
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
        );
      case 'updatedAt':
        return (
          <td key={column.id}>
            {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : t('common.dash')}
          </td>
        );
      case 'actions':
        return (
          <td key={column.id} className="test-cases-table__actions-cell" onClick={stop}>
            {canEditProject && (
              <IconButton
                icon={Pencil}
                className="btn-secondary table-action table-action--cell"
                type="button"
                onClick={() => openEdit(item)}
                tooltip={t('requirements.tipEditTc')}
              >
                {t('common.edit')}
              </IconButton>
            )}
          </td>
        );
      default:
        return null;
    }
  };

  if (!activeProject) {
    return (
      <div className="container">
        <p>{t('common.noProject')}</p>
        <p className="muted">{t('common.requestProjectAssign')}</p>
      </div>
    );
  }

  return (
    <div className="container container--wide">
      <h1>{t('testCasesPage.title', { name: getDisplayProjectName(activeProject, t) })}</h1>
      <p className="muted">{t('requirements.tcNumberingNote')}</p>
      <ErrorDialog message={error || refineJob.error} onClose={() => setError('')} />
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
        {canEditProject && (
          <IconButton
            icon={refining ? Square : Sparkles}
            className={refining ? 'btn-danger' : 'btn-secondary'}
            type="button"
            onClick={handleAiRefineClick}
            disabled={!refining && items.length === 0}
            tooltip={refining ? t('common.aiRefineStopTip') : t('testCasesPage.aiRefineTip')}
          >
            {refining ? t('common.aiRefineStop') : t('requirements.aiRefine')}
          </IconButton>
        )}
        {canEditProject && (
          <IconButton
            icon={Plus}
            className="btn-primary"
            type="button"
            onClick={openCreate}
            disabled={requirements.length === 0}
            tooltip={t('requirements.tipAddTc')}
          >
            {t('requirements.addTestCase')}
          </IconButton>
        )}
        {canEditProject && selected.length > 0 && (
          <IconButton icon={Trash2} className="btn-danger" type="button" onClick={handleBulkDelete} tooltip={t('requirements.tipDeleteTc')}>
            {t('common.selectDelete', { count: selected.length })}
          </IconButton>
        )}
      </div>

      <table
        className="test-cases-table test-cases-table--resizable"
        onContextMenu={handleTableContextMenu}
      >
          <colgroup>
            {columns.map((column) => (
              <col
                key={column.id}
                style={{ width: toTestCasesColumnPercentWidth(column.id, widths, columns) }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => renderHeaderCell(column))}
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr
                key={item.id}
                data-refine-row-id={item.id}
                className={[
                  'row-selectable',
                  selected.includes(item.id) ? 'row-selected' : '',
                  refineProgress?.id === item.id && (refineProgress.phase === 'generating' || refineProgress.phase === 'saving')
                    ? 'row-refining'
                    : '',
                  refinedRowIds.includes(item.id) ? 'row-refined-updated' : '',
                ].filter(Boolean).join(' ')}
                onClick={(e) => handleRowClick(e, item)}
                onContextMenu={(e) => handleRowContextMenu(e, item)}
              >
                {columns.map((column) => renderBodyCell(item, column))}
              </tr>
            ))}
          </tbody>
      </table>
      {items.length === 0 && <p className="muted">{t('requirements.tcEmpty')}</p>}
      {canEditProject && selected.length > 0 && (
        <p className="muted">{t('requirements.selectedHint', { count: selected.length })}</p>
      )}

      <AiRefineConfirmDialog
        open={Boolean(aiRefineConfirm)}
        count={aiRefineConfirm?.targetItems.length ?? 0}
        selected={aiRefineConfirm?.selected ?? false}
        entity="testCases"
        onConfirm={handleAiRefineConfirm}
        onCancel={() => setAiRefineConfirm(null)}
      />

      <TestCaseEditDialog
        open={Boolean(editingItem)}
        testCase={editingItem}
        mode={editingItem?.__isNew ? 'create' : 'edit'}
        requirements={requirements}
        readOnly={!canEditProject}
        onClose={closeEdit}
        onSaved={handleSaved}
      />
      <DeleteConfirmDialog
        open={Boolean(deletePending)}
        message={t('common.deleteConfirm', { count: deletePending?.length ?? 0 })}
        description={t('common.deleteConfirmIrreversible')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletePending(null)}
      />
    </div>
  );
}
