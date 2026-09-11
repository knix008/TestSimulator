// Port of the MainForm structure tree (tables → columns, plus relationships).
import { useMemo, useState } from 'react';
import type { DbSchema } from '../types';
import { getRelationshipTypeLabel } from '../types';
import { findColumn, findTable, getTypeDisplay } from '../core/schema';
import { useT } from '../i18n';

interface Props {
  schema: DbSchema;
  selectedTableId: string | null;
  selectedColumnId: string | null;
  selectedRelationshipId: string | null;
  onSelectTable: (tableId: string, columnId?: string | null) => void;
  onSelectRelationship: (relationshipId: string) => void;
  onEditTable: (tableId: string) => void;
  onEditColumn: (tableId: string, columnId: string) => void;
  onEditRelationship: (relationshipId: string) => void;
}

export function StructureTree(props: Props) {
  const t = useT();
  const { schema } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const needle = query.trim().toLowerCase();

  const tables = useMemo(() => {
    if (!needle) return schema.Tables;
    return schema.Tables.filter(
      (table) =>
        table.Name.toLowerCase().includes(needle) ||
        table.Columns.some((c) => c.Name.toLowerCase().includes(needle)),
    );
  }, [schema.Tables, needle]);

  const matchesColumn = (name: string) => !needle || name.toLowerCase().includes(needle);

  return (
    <div className="tree">
      <input
        className="tree-search"
        placeholder={t('SearchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="tree-group-title">
        {t('TreeTables')} ({schema.Tables.length})
      </div>
      {tables.length === 0 && <div className="tree-empty">{needle ? t('NoResults') : '—'}</div>}
      {tables.map((table) => {
        const isCollapsed = collapsed.has(table.Id) && !needle;
        return (
          <div key={table.Id}>
            <div
              className={`tree-node tree-table ${
                props.selectedTableId === table.Id && !props.selectedColumnId ? 'selected' : ''
              }`}
              onClick={() => props.onSelectTable(table.Id, null)}
              onDoubleClick={() => props.onEditTable(table.Id)}
            >
              <button
                className="tree-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(table.Id);
                }}
                aria-label="toggle"
              >
                {isCollapsed ? '▸' : '▾'}
              </button>
              <span className="tree-label">{table.Name}</span>
              <span className="tree-meta">{table.Columns.length}</span>
            </div>
            {!isCollapsed &&
              table.Columns.filter((c) => matchesColumn(c.Name)).map((column) => (
                <div
                  key={column.Id}
                  className={`tree-node tree-column ${
                    props.selectedColumnId === column.Id ? 'selected' : ''
                  }`}
                  onClick={() => props.onSelectTable(table.Id, column.Id)}
                  onDoubleClick={() => props.onEditColumn(table.Id, column.Id)}
                >
                  <span className={`key-badge ${column.IsPrimaryKey ? 'pk' : ''}`}>
                    {column.IsPrimaryKey ? 'PK' : ''}
                  </span>
                  <span className="tree-label">{column.Name}</span>
                  <span className="tree-meta">{getTypeDisplay(column)}</span>
                </div>
              ))}
          </div>
        );
      })}

      <div className="tree-group-title">
        {t('TreeRelations')} ({schema.Relationships.length})
      </div>
      {schema.Relationships.length === 0 && <div className="tree-empty">—</div>}
      {schema.Relationships.map((rel) => {
        const sourceTable = findTable(schema, rel.SourceTableId);
        const targetTable = findTable(schema, rel.TargetTableId);
        const sourceColumn = findColumn(schema, rel.SourceTableId, rel.SourceColumnId);
        const targetColumn = findColumn(schema, rel.TargetTableId, rel.TargetColumnId);
        return (
          <div
            key={rel.Id}
            className={`tree-node tree-relation ${
              props.selectedRelationshipId === rel.Id ? 'selected' : ''
            }`}
            onClick={() => props.onSelectRelationship(rel.Id)}
            onDoubleClick={() => props.onEditRelationship(rel.Id)}
          >
            <span className="rel-badge">{getRelationshipTypeLabel(rel.Type)}</span>
            <span className="tree-label">
              {sourceTable?.Name ?? '?'}.{sourceColumn?.Name ?? '?'} → {targetTable?.Name ?? '?'}.
              {targetColumn?.Name ?? '?'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
