// Port of Dialogs/TableEditDialog.cs — name, comment and the column list.
import { useState } from 'react';
import type { DbColumn, DbTable, DbTargetType } from '../types';
import { getTypeDisplay, newColumn } from '../core/schema';
import { useT } from '../i18n';
import { ColumnEditDialog } from './ColumnEditDialog';
import { Dialog } from './Dialog';
import { Icons } from './Icons';

interface Props {
  table: DbTable;
  targetDb: DbTargetType;
  onSave: (table: DbTable) => void;
  onClose: () => void;
}

export function TableEditDialog({ table, targetDb, onSave, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<DbTable>({
    ...table,
    Columns: table.Columns.map((c) => ({ ...c })),
  });
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editing, setEditing] = useState<{ column: DbColumn; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateColumns = (columns: DbColumn[]) => setDraft((d) => ({ ...d, Columns: columns }));

  const addColumn = () => {
    const column = newColumn({ Name: `${t('NewColumnName')}${draft.Columns.length + 1}` });
    setEditing({ column, index: -1 });
  };

  const editColumn = (index: number) => {
    if (index < 0 || index >= draft.Columns.length) return;
    setEditing({ column: { ...draft.Columns[index] }, index });
  };

  const deleteColumn = (index: number) => {
    if (index < 0 || index >= draft.Columns.length) return;
    updateColumns(draft.Columns.filter((_, i) => i !== index));
    setSelectedIndex(-1);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (index < 0 || target < 0 || target >= draft.Columns.length) return;
    const columns = [...draft.Columns];
    [columns[index], columns[target]] = [columns[target], columns[index]];
    updateColumns(columns);
    setSelectedIndex(target);
  };

  const handleColumnSaved = (column: DbColumn) => {
    if (!editing) return;
    const columns = [...draft.Columns];
    if (editing.index < 0) columns.push(column);
    else columns[editing.index] = column;
    updateColumns(columns);
    setEditing(null);
  };

  const handleOk = () => {
    if (!draft.Name.trim()) return setError(t('ErrTableName'));
    onSave({ ...draft, Name: draft.Name.trim() });
  };

  return (
    <>
      <Dialog title={t('TableEditTitle')} icon={<Icons.Table />} onClose={onClose} onOk={handleOk} width={700} height={700}>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          <label>{t('TableEditName')}</label>
          <input value={draft.Name} onChange={(e) => setDraft({ ...draft, Name: e.target.value })} />
          <label>{t('TableEditComment')}</label>
          <input
            value={draft.Comment ?? ''}
            onChange={(e) => setDraft({ ...draft, Comment: e.target.value || null })}
          />
        </div>

        <div className="column-toolbar">
          <button className="btn" onClick={addColumn}>
            {t('TableEditAdd')}
          </button>
          <button className="btn" disabled={selectedIndex < 0} onClick={() => editColumn(selectedIndex)}>
            {t('TableEditEdit')}
          </button>
          <button className="btn" disabled={selectedIndex < 0} onClick={() => deleteColumn(selectedIndex)}>
            {t('TableEditDelete')}
          </button>
          <span className="spacer" />
          <button className="btn" disabled={selectedIndex <= 0} onClick={() => move(selectedIndex, -1)}>
            {t('TableEditMoveUp')}
          </button>
          <button
            className="btn"
            disabled={selectedIndex < 0 || selectedIndex >= draft.Columns.length - 1}
            onClick={() => move(selectedIndex, 1)}
          >
            {t('TableEditMoveDown')}
          </button>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('ColHdrName')}</th>
                <th>{t('ColHdrType')}</th>
                <th className="center">PK</th>
                <th className="center">AI</th>
                <th className="center">NULL</th>
                <th className="center">UQ</th>
                <th>{t('ColHdrDefault')}</th>
              </tr>
            </thead>
            <tbody>
              {draft.Columns.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-row">
                    —
                  </td>
                </tr>
              )}
              {draft.Columns.map((column, index) => (
                <tr
                  key={column.Id}
                  className={index === selectedIndex ? 'selected' : ''}
                  onClick={() => setSelectedIndex(index)}
                  onDoubleClick={() => editColumn(index)}
                >
                  <td>{column.Name}</td>
                  <td>{getTypeDisplay(column)}</td>
                  <td className="center">{column.IsPrimaryKey ? '✓' : ''}</td>
                  <td className="center">{column.IsAutoIncrement ? '✓' : ''}</td>
                  <td className="center">{column.IsNullable ? '✓' : ''}</td>
                  <td className="center">{column.IsUnique ? '✓' : ''}</td>
                  <td>{column.DefaultValue ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dialog>

      {editing && (
        <ColumnEditDialog
          column={editing.column}
          targetDb={targetDb}
          onSave={handleColumnSaved}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
