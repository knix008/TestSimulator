import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Eraser, FileDown, Pencil, Plus, Search, Sparkles, Square, Trash2 } from 'lucide-react';
import { api } from '../api/client.js';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useExcelDialogs } from '../context/ExcelDialogContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { IconLink } from '../components/IconLink.jsx';
import { openRowContextMenu, useContextMenu } from '../components/ContextMenu.jsx';
import { useUndoHistory } from '../context/UndoHistoryContext.jsx';
import { getDisplayProjectName } from '../lib/displayLabels.js';
import { requirementPayload } from '../lib/requirementUndoActions.js';
import TableInlineSelect from '../components/TableInlineSelect.jsx';
import SortableTableHeader from '../components/SortableTableHeader.jsx';
import AiRefineConfirmDialog from '../components/AiRefineConfirmDialog.jsx';
import ClearClassificationConfirmDialog from '../components/ClearClassificationConfirmDialog.jsx';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog.jsx';
import ErrorDialog from '../components/ErrorDialog.jsx';
import { useAiRefineJob } from '../context/AiRefineContext.jsx';
import { useAiRefineRowHighlight } from '../hooks/useAiRefineRowHighlight.js';
import { useAiRefinePageSync } from '../hooks/useAiRefinePageSync.js';
import { useRequirementsTableColumns } from '../hooks/useRequirementsTableColumns.js';
import { useTableSort } from '../hooks/useTableSort.js';
import { usePageToolbarLayout } from '../hooks/usePageToolbarLayout.js';
import { useStatusBarReport } from '../hooks/useStatusBarReport.js';
import { hasRequirementRefineGap } from '../lib/aiRefineEligibility.js';
import { REQUIREMENTS_TABLE_SORT, sortRows } from '../lib/tableSort.js';

const STATUS_KEYS = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DONE'];
const PRIORITY_KEYS = ['LOW', 'MEDIUM', 'HIGH'];

export default function RequirementsPage() {
  const { activeProject, canEditProject, updateActiveProjectUiSettings } = useProject();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { openContextMenu } = useContextMenu();
  const { push, subscribe } = useUndoHistory();
  const { subscribeDataChange, openExport, notifyDataChange } = useExcelDialogs();
  const [items, setItems] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', priority: '' });
  const [error, setError] = useState('');
  const [aiRefineConfirm, setAiRefineConfirm] = useState(null);
  const [clearClassificationPending, setClearClassificationPending] = useState(null);
  const [deletePending, setDeletePending] = useState(null);
  const refineJob = useAiRefineJob('requirements');
  const refining = refineJob.refining && refineJob.projectId === activeProject?.id;
  const refineProgress = refining ? refineJob.progress : null;
  const refinedRowIds = refineJob.projectId === activeProject?.id ? refineJob.refinedRowIds : [];
  const {
    resetRefineState,
    applyRowCommitted,
    isCellRefined,
  } = useAiRefineRowHighlight({
    tableFieldKeys: ['title', 'description', 'category', 'classification', 'priority', 'status'],
  });
  const { sort, toggleSort } = useTableSort();
  usePageToolbarLayout([selected.length, refining, canEditProject, language]);

  const {
    columns,
    widths,
    resizingColumnId,
    startResize,
  } = useRequirementsTableColumns({
    projectId: activeProject?.id,
    uiSettings: activeProject?.uiSettings,
    canEdit: canEditProject,
    onUiSettingsSaved: updateActiveProjectUiSettings,
  });

  const columnLabels = useMemo(() => ({
    code: t('common.requirementCode'),
    classification: t('common.classification'),
    title: t('common.title'),
    category: t('common.category'),
    description: t('common.description'),
    assignee: t('common.assignee'),
    priority: t('common.priority'),
    status: t('common.status'),
    testCaseCount: t('requirements.tc'),
  }), [t]);

  const assigneeLabelById = useMemo(() => new Map(
    assignableUsers.map((user) => [
      String(user.id),
      user.name || user.username || `${t('common.id')} ${user.id}`,
    ]),
  ), [assignableUsers, t]);

  const assigneeOptions = useMemo(
    () => ['', ...assignableUsers.map((user) => String(user.id))],
    [assignableUsers],
  );

  const sortedItems = useMemo(
    () => sortRows(items, sort, REQUIREMENTS_TABLE_SORT),
    [items, sort],
  );

  const statusHint = useMemo(() => {
    if (selected.length > 0) return t('statusBar.selectedCount', { count: selected.length });
    return t('statusBar.itemCount', { count: items.length });
  }, [selected.length, items.length, t]);

  useStatusBarReport({
    hint: statusHint,
  });

  useAiRefinePageSync('requirements', { applyRowCommitted, setItems });

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
    const [list, users] = await Promise.all([
      api.listRequirements(activeProject.id, filters),
      canEditProject ? api.listAssignableUsers() : Promise.resolve([]),
    ]);
    setItems(list);
    setAssignableUsers(users);
    setSelected([]);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [activeProject, filters.status, filters.priority]);

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
      const snapshots = await Promise.all(
        ids.map((reqId) => api.getRequirement(activeProject.id, reqId)),
      );
      await api.bulkDeleteRequirements(activeProject.id, ids);
      push({
        type: 'requirements.delete',
        snapshots,
        deletedIds: [...ids],
      });
      notifyDataChange();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkDelete = () => handleDeleteSelection(selected);

  const handleClearClassification = () => {
    if (selected.length === 0) return;
    const targetItems = items.filter((i) => selected.includes(i.id) && i.classification !== '');
    if (targetItems.length === 0) {
      setError(t('requirements.clearClassificationEmpty'));
      return;
    }
    setClearClassificationPending(targetItems);
  };

  const handleClearClassificationConfirm = async () => {
    const targetItems = clearClassificationPending;
    setClearClassificationPending(null);
    if (!targetItems?.length) return;
    try {
      await Promise.all(
        targetItems.map((item) => api.updateRequirement(activeProject.id, item.id, { classification: '' })),
      );
      notifyDataChange();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

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
    const targetItems = scopedItems.filter(hasRequirementRefineGap);

    if (targetItems.length === 0) {
      setError(t('requirements.aiRefineEmpty'));
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
    void refineJob.startRequirementsRefine({
      projectId: activeProject.id,
      items: targetItems,
    });
  };

  const handleInlineFieldChange = async (item, field, nextValue) => {
    if (!canEditProject || !activeProject || item[field] === nextValue) return;

    const before = requirementPayload(item);
    const after = { ...before, [field]: nextValue };
    const previousValue = item[field];

    setItems((prev) => prev.map((row) => (
      row.id === item.id ? { ...row, [field]: nextValue } : row
    )));

    try {
      await api.updateRequirement(activeProject.id, item.id, after);
      push({
        type: 'requirement.update',
        requirementId: item.id,
        before,
        after,
      });
    } catch (err) {
      setItems((prev) => prev.map((row) => (
        row.id === item.id ? { ...row, [field]: previousValue } : row
      )));
      setError(err.message);
    }
  };

  const handleInlineAssigneeChange = async (item, nextValue) => {
    if (!canEditProject || !activeProject) return;

    const nextAssigneeUserId = nextValue ? Number(nextValue) : null;
    const currentAssigneeUserId = item.assigneeUserId ?? null;
    if (currentAssigneeUserId === nextAssigneeUserId) return;

    const before = requirementPayload(item);
    const after = { ...before, assigneeUserId: nextAssigneeUserId };
    const previousAssigneeName = item.assigneeName || '';
    const nextAssigneeName = nextAssigneeUserId
      ? (assigneeLabelById.get(String(nextAssigneeUserId)) || '')
      : '';

    setItems((prev) => prev.map((row) => (
      row.id === item.id
        ? { ...row, assigneeUserId: nextAssigneeUserId, assigneeName: nextAssigneeName }
        : row
    )));

    try {
      await api.updateRequirement(activeProject.id, item.id, after);
      push({
        type: 'requirement.update',
        requirementId: item.id,
        before,
        after,
      });
    } catch (err) {
      setItems((prev) => prev.map((row) => (
        row.id === item.id
          ? { ...row, assigneeUserId: currentAssigneeUserId, assigneeName: previousAssigneeName }
          : row
      )));
      setError(err.message);
    }
  };

  const handleRowClick = (e, item) => {
    if (!canEditProject) return;
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
          menu.push({
            id: 'edit',
            icon: Pencil,
            label: t('common.edit'),
            tooltip: t('requirements.tipEdit'),
            onClick: () => navigate(`/requirements/${selection[0]}/edit`),
          });
        }

        menu.push({
          id: 'delete',
          icon: Trash2,
          label: count > 1 ? t('common.selectDelete', { count }) : t('common.delete'),
          tooltip: t('requirements.tipDelete'),
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
        tooltip: t('requirements.tipEdit'),
        onClick: () => navigate(`/requirements/${selected[0]}/edit`),
      }] : []),
      {
        id: 'delete',
        icon: Trash2,
        label: t('common.selectDelete', { count: selected.length }),
        tooltip: t('requirements.tipDelete'),
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

  const renderHeaderCell = (column) => {
    const priorityClass = column.id === 'priority' ? 'requirements-table__priority-cell' : '';
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
        <th key={column.id} className={priorityClass}>
          <input
            type="checkbox"
            checked={selected.length === items.length && items.length > 0}
            onChange={(e) => toggleAll(e.target.checked)}
          />
          {resizeHandle}
        </th>
      );
    }

    if (column.id === 'actions') {
      return <th key={column.id} aria-hidden="true" />;
    }

    return (
      <SortableTableHeader
        key={column.id}
        columnId={column.id}
        label={columnLabels[column.id]}
        sort={sort}
        onSort={toggleSort}
        className={priorityClass}
        title={getSortTitle(column.id)}
        sortable={Boolean(REQUIREMENTS_TABLE_SORT[column.id])}
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
          <td key={column.id} onClick={stop}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(e) => toggleOne(item.id, e.target.checked)}
            />
          </td>
        );
      case 'code':
        return <td key={column.id} title={item.code}>{item.code}</td>;
      case 'classification':
        return (
          <td key={column.id} className={isCellRefined(item.id, 'classification') ? 'cell-refined' : ''} title={item.classification}>
            {item.classification || t('common.dash')}
          </td>
        );
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
      case 'category':
        return (
          <td key={column.id} className={isCellRefined(item.id, 'category') ? 'cell-refined' : ''} title={item.category}>
            {item.category}
          </td>
        );
      case 'priority':
        return (
          <td key={column.id} className="requirements-table__priority-cell" onClick={stop}>
            <TableInlineSelect
              value={item.priority}
              options={PRIORITY_KEYS}
              getLabel={(key) => t(`priority.${key}`)}
              onChange={(value) => { void handleInlineFieldChange(item, 'priority', value); }}
              disabled={!canEditProject}
              variant="badge"
              ariaLabel={t('common.priority')}
            />
          </td>
        );
      case 'assignee':
        return (
          <td key={column.id} onClick={stop} title={item.assigneeName || t('common.unassigned')}>
            {canEditProject ? (
              <TableInlineSelect
                value={String(item.assigneeUserId || '')}
                options={assigneeOptions}
                getLabel={(key) => (key ? (assigneeLabelById.get(String(key)) || key) : t('common.unassigned'))}
                onChange={(value) => { void handleInlineAssigneeChange(item, value); }}
                disabled={!canEditProject}
                variant="text"
                ariaLabel={t('common.assignee')}
              />
            ) : (item.assigneeName || t('common.unassigned'))}
          </td>
        );
      case 'status':
        return (
          <td key={column.id} onClick={stop}>
            <TableInlineSelect
              value={item.status}
              options={STATUS_KEYS}
              getLabel={(key) => t(`status.${key}`)}
              onChange={(value) => { void handleInlineFieldChange(item, 'status', value); }}
              disabled={!canEditProject}
              variant="text"
              ariaLabel={t('common.status')}
            />
          </td>
        );
      case 'testCaseCount':
        return <td key={column.id}>{item.testCaseCount}</td>;
      case 'actions':
        return (
          <td key={column.id} onClick={stop}>
            {canEditProject && (
              <IconLink
                icon={Pencil}
                className="btn btn-secondary table-action"
                to={`/requirements/${item.id}/edit`}
                tooltip={t('requirements.tipEdit')}
              >
                {t('common.edit')}
              </IconLink>
            )}
          </td>
        );
      default:
        return <td key={column.id} />;
    }
  };

  if (!activeProject) {
    return (
      <div className="container container--wide">
        <p>{t('common.noProject')}</p>
        <p className="muted">{t('common.requestProjectAssign')}</p>
      </div>
    );
  }

  return (
    <div className="container container--wide">
      <h1>{t('requirements.title', { name: getDisplayProjectName(activeProject, t) })}</h1>
      <p className="muted">{t('requirements.numberingNote')}</p>
      <ErrorDialog message={error || refineJob.error} onClose={() => setError('')} />
      <div className="requirements-toolbar toolbar">
        <form className="requirements-toolbar__search" onSubmit={handleSearch}>
          <input placeholder={t('requirements.searchPlaceholder')} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label={t('requirements.statusFilter')}>
            <option value="">{t('status.all')}</option>
            {STATUS_KEYS.map((k) => <option key={k} value={k}>{t(`status.${k}`)}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} aria-label={t('requirements.priorityFilter')}>
            <option value="">{t('priority.all')}</option>
            {PRIORITY_KEYS.map((k) => <option key={k} value={k}>{t(`priority.${k}`)}</option>)}
          </select>
          <IconButton icon={Search} className="btn-secondary" type="submit" tooltip={t('requirements.tipSearch')}>{t('common.search')}</IconButton>
        </form>
        {canEditProject && (
          <IconButton
            icon={refining ? Square : Sparkles}
            className={refining ? 'btn-danger' : 'btn-secondary'}
            type="button"
            onClick={handleAiRefineClick}
            disabled={!refining && items.length === 0}
            tooltip={refining ? t('common.aiRefineStopTip') : t('requirements.aiRefineTip')}
          >
            {refining ? t('common.aiRefineStop') : t('requirements.aiRefine')}
          </IconButton>
        )}
        {canEditProject && (
          <IconLink icon={Plus} className="btn btn-primary" to="/requirements/new" tooltip={t('requirements.tipNew')}>{t('requirements.new')}</IconLink>
        )}
        {canEditProject && selected.length > 0 && (
          <IconButton icon={Trash2} className="btn-danger" type="button" onClick={handleBulkDelete} tooltip={t('requirements.tipDelete')}>
            {t('common.selectDelete', { count: selected.length })}
          </IconButton>
        )}
        {canEditProject && selected.length > 0 && (
          <IconButton icon={Eraser} className="btn-secondary" type="button" onClick={handleClearClassification} tooltip={t('requirements.tipClearClassification')}>
            {t('requirements.clearClassification')}
          </IconButton>
        )}
        {selected.length > 0 && (
          <IconButton
            icon={FileDown}
            className="btn-secondary"
            type="button"
            onClick={() => openExport(selected)}
            tooltip={t('export.tipDownload')}
          >
            {t('export.exportSelected', { count: selected.length })}
          </IconButton>
        )}
      </div>

      <table className="requirements-table requirements-table--resizable" onContextMenu={handleTableContextMenu}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={{ width: `${widths[column.id]}px` }} />
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
                canEditProject ? 'row-selectable' : '',
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
      {items.length === 0 && <p className="muted">{t('requirements.empty')}</p>}
      {canEditProject && selected.length > 0 && (
        <p className="muted">{t('requirements.selectedHint', { count: selected.length })}</p>
      )}

      <AiRefineConfirmDialog
        open={Boolean(aiRefineConfirm)}
        count={aiRefineConfirm?.targetItems.length ?? 0}
        selected={aiRefineConfirm?.selected ?? false}
        entity="requirements"
        onConfirm={handleAiRefineConfirm}
        onCancel={() => setAiRefineConfirm(null)}
      />
      <ClearClassificationConfirmDialog
        open={Boolean(clearClassificationPending)}
        count={clearClassificationPending?.length ?? 0}
        onConfirm={handleClearClassificationConfirm}
        onCancel={() => setClearClassificationPending(null)}
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
