import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, FileDown, Pencil, Plus, Search, Square, Trash2 } from 'lucide-react';
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
import { useRequirementsTableColumns } from '../hooks/useRequirementsTableColumns.js';

const STATUS_KEYS = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DONE'];
const PRIORITY_KEYS = ['LOW', 'MEDIUM', 'HIGH'];

export default function RequirementsPage() {
  const { activeProject, canEditProject, updateActiveProjectUiSettings } = useProject();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { openContextMenu } = useContextMenu();
  const { push, subscribe } = useUndoHistory();
  const { subscribeDataChange, openExport } = useExcelDialogs();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', priority: '' });
  const [error, setError] = useState('');

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
    priority: t('common.priority'),
    status: t('common.status'),
    testCaseCount: t('requirements.tc'),
  }), [t]);

  const load = async () => {
    if (!activeProject) return;
    const list = await api.listRequirements(activeProject.id, filters);
    setItems(list);
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

  const handleDeleteSelection = async (ids) => {
    if (ids.length === 0) return;
    if (!window.confirm(t('common.deleteConfirm', { count: ids.length }))) return;
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
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkDelete = () => handleDeleteSelection(selected);

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
      <th key={column.id} className={priorityClass}>
        {columnLabels[column.id]}
        {resizeHandle}
      </th>
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
        return <td key={column.id} title={item.classification}>{item.classification}</td>;
      case 'title':
        return <td key={column.id} title={item.title}>{item.title}</td>;
      case 'category':
        return <td key={column.id} title={item.category}>{item.category}</td>;
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
      <div className="container">
        <p>{t('common.noProject')}</p>
        <p className="muted">{t('common.requestProjectAssign')}</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>{t('requirements.title', { name: getDisplayProjectName(activeProject, t) })}</h1>
      <p className="muted">{t('requirements.numberingNote')}</p>
      {error && <p className="error">{error}</p>}

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
          <IconLink icon={Plus} className="btn btn-primary" to="/requirements/new" tooltip={t('requirements.tipNew')}>{t('requirements.new')}</IconLink>
        )}
        {canEditProject && selected.length > 0 && (
          <IconButton icon={Trash2} className="btn-danger" type="button" onClick={handleBulkDelete} tooltip={t('requirements.tipDelete')}>
            {t('common.selectDelete', { count: selected.length })}
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
          {items.map((item) => (
            <tr
              key={item.id}
              className={`${canEditProject ? 'row-selectable' : ''}${selected.includes(item.id) ? ' row-selected' : ''}`}
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
    </div>
  );
}
