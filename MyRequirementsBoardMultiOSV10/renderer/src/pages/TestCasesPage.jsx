import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Pencil, Search, Square, Trash2 } from 'lucide-react';
import { api } from '../api/client.js';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { openRowContextMenu, useContextMenu } from '../components/ContextMenu.jsx';
import TableInlineSelect from '../components/TableInlineSelect.jsx';
import TestCaseEditDialog from '../components/TestCaseEditDialog.jsx';
import { useTestCasesTableColumns } from '../hooks/useTestCasesTableColumns.js';
import { getDisplayProjectName } from '../lib/displayLabels.js';

const TC_STATUS_KEYS = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'];

export default function TestCasesPage() {
  const {
    activeProject,
    canEditProject,
    updateActiveProjectUiSettings,
  } = useProject();
  const { t } = useLanguage();
  const { openContextMenu } = useContextMenu();
  const [items, setItems] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', requirementId: '' });
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [editingItem, setEditingItem] = useState(null);

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
    status: t('common.status'),
    updatedAt: t('common.updatedAt'),
  }), [t]);

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
    setSelected([]);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [activeProject, filters.status, filters.requirementId]);

  const handleSearch = (e) => {
    e.preventDefault();
    load().catch((err) => setError(err.message));
  };

  const openEdit = (item) => {
    setEditingItem(item);
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

  const handleDeleteSelection = async (ids) => {
    if (ids.length === 0) return;
    if (!window.confirm(t('common.deleteConfirm', { count: ids.length }))) return;

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
        <th key={column.id}>
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
      <th key={column.id}>
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
        return <td key={column.id} className="test-cases-table__code-cell" title={item.code}>{item.code}</td>;
      case 'requirement':
        return <td key={column.id} className="test-cases-table__requirement-cell" title={item.requirementTitle}>{item.requirementCode}</td>;
      case 'title':
        return <td key={column.id} title={item.title}>{item.title}</td>;
      case 'description':
        return <td key={column.id} title={item.description}>{item.description || t('common.dash')}</td>;
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
          <td key={column.id} onClick={stop}>
            {canEditProject && (
              <IconButton
                icon={Pencil}
                className="btn-secondary table-action"
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
      {error && <p className="error">{error}</p>}

      <div className="test-cases-list-view">
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
                className={`row-selectable${selected.includes(item.id) ? ' row-selected' : ''}`}
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
      </div>

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
