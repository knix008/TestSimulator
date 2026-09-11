// Port of Controls/BufferedPropertyGrid usage in MainForm: an editable property
// sheet for the selected schema / table / column / relationship, with the same
// categories and the "by category" / "alphabetical" sort modes.
import { useMemo } from 'react';
import type {
  DbColumn,
  DbRelationship,
  DbSchema,
  DbTable,
  DbTargetType,
  RelationshipLineStyle,
  RelationshipType,
} from '../types';
import { DB_TARGET_TYPES, getDbDisplayName } from '../types';
import { getTypes } from '../core/dataTypes';
import { primaryKeyCount } from '../core/schema';
import { useT } from '../i18n';

export type SortMode = 'category' | 'alphabetical';

type FieldKind = 'text' | 'number' | 'bool' | 'select' | 'readonly';

interface Field {
  key: string;
  category: string;
  label: string;
  description: string;
  kind: FieldKind;
  value: string | number | boolean | null;
  options?: { value: string; label: string }[];
  apply?: (raw: string | boolean) => void;
}

interface Props {
  schema: DbSchema;
  table: DbTable | null;
  column: DbColumn | null;
  relationship: DbRelationship | null;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  onSchemaChange: (patch: Partial<DbSchema>) => void;
  onTableChange: (tableId: string, patch: Partial<DbTable>) => void;
  onColumnChange: (tableId: string, columnId: string, patch: Partial<DbColumn>) => void;
  onRelationshipChange: (relationshipId: string, patch: Partial<DbRelationship>) => void;
}

export function PropertyGrid(props: Props) {
  const t = useT();
  const { schema, table, column, relationship } = props;

  const fields = useMemo<Field[]>(() => {
    const numberOrNull = (raw: string): number | null => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const n = parseInt(trimmed, 10);
      return Number.isNaN(n) ? null : n;
    };

    if (column && table) {
      const set = (patch: Partial<DbColumn>) => props.onColumnChange(table.Id, column.Id, patch);
      return [
        {
          key: 'name', category: t('PgCatGeneral'), label: t('PgName'),
          description: t('PgDescColName'), kind: 'text', value: column.Name,
          apply: (v) => set({ Name: String(v) }),
        },
        {
          key: 'dataType', category: t('PgCatGeneral'), label: t('PgDataType'),
          description: t('PgDescDataType'), kind: 'select', value: column.DataType,
          options: [
            ...new Set([column.DataType, ...getTypes(schema.TargetDb)]),
          ].map((type) => ({ value: type, label: type })),
          apply: (v) => set({ DataType: String(v) }),
        },
        {
          key: 'length', category: t('PgCatGeneral'), label: t('PgLength'),
          description: t('PgDescLength'), kind: 'number', value: column.Length ?? null,
          apply: (v) => set({ Length: numberOrNull(String(v)) }),
        },
        {
          key: 'precision', category: t('PgCatGeneral'), label: t('PgPrecision'),
          description: t('PgDescPrecision'), kind: 'number', value: column.Precision ?? null,
          apply: (v) => set({ Precision: numberOrNull(String(v)) }),
        },
        {
          key: 'scale', category: t('PgCatGeneral'), label: t('PgScale'),
          description: t('PgDescScale'), kind: 'number', value: column.Scale ?? null,
          apply: (v) => set({ Scale: numberOrNull(String(v)) }),
        },
        {
          key: 'isPrimaryKey', category: t('PgCatConstraints'), label: t('PgPrimaryKey'),
          description: t('PgDescIsPK'), kind: 'bool', value: column.IsPrimaryKey,
          apply: (v) =>
            set({
              IsPrimaryKey: !!v,
              IsNullable: v ? false : column.IsNullable,
              IsAutoIncrement: v ? column.IsAutoIncrement : false,
            }),
        },
        {
          key: 'isAutoIncrement', category: t('PgCatConstraints'), label: t('PgAutoIncrement'),
          description: t('PgDescIsAI'), kind: 'bool', value: column.IsAutoIncrement,
          apply: (v) => set({ IsAutoIncrement: !!v }),
        },
        {
          key: 'isNullable', category: t('PgCatConstraints'), label: t('PgAllowNull'),
          description: t('PgDescIsNull'), kind: 'bool', value: column.IsNullable,
          apply: (v) => set({ IsNullable: !!v }),
        },
        {
          key: 'isUnique', category: t('PgCatConstraints'), label: t('PgUnique'),
          description: t('PgDescIsUnique'), kind: 'bool', value: column.IsUnique,
          apply: (v) => set({ IsUnique: !!v }),
        },
        {
          key: 'isForeignKey', category: t('PgCatConstraints'), label: t('PgForeignKey'),
          description: t('PgDescIsFK'), kind: 'bool', value: column.IsForeignKey,
          apply: (v) => set({ IsForeignKey: !!v }),
        },
        {
          key: 'defaultValue', category: t('PgCatConstraints'), label: t('PgDefaultValue'),
          description: t('PgDescDefault'), kind: 'text', value: column.DefaultValue ?? '',
          apply: (v) => set({ DefaultValue: String(v) || null }),
        },
        {
          key: 'comment', category: t('PgCatInfo'), label: t('PgDescription'),
          description: t('PgDescColComment'), kind: 'text', value: column.Comment ?? '',
          apply: (v) => set({ Comment: String(v) || null }),
        },
      ];
    }

    if (table) {
      const set = (patch: Partial<DbTable>) => props.onTableChange(table.Id, patch);
      return [
        {
          key: 'name', category: t('PgCatGeneral'), label: t('PgName'),
          description: t('PgDescTableName'), kind: 'text', value: table.Name,
          apply: (v) => set({ Name: String(v) }),
        },
        {
          key: 'comment', category: t('PgCatGeneral'), label: t('PgDescription'),
          description: t('PgDescTableComment'), kind: 'text', value: table.Comment ?? '',
          apply: (v) => set({ Comment: String(v) || null }),
        },
        {
          key: 'columnCount', category: t('PgCatStats'), label: t('PgColumnCount'),
          description: t('PgDescColumnCount'), kind: 'readonly', value: table.Columns.length,
        },
        {
          key: 'pkCount', category: t('PgCatStats'), label: t('PgPrimaryKeyCount'),
          description: t('PgDescPkCount'), kind: 'readonly', value: primaryKeyCount(table),
        },
      ];
    }

    if (relationship) {
      const set = (patch: Partial<DbRelationship>) =>
        props.onRelationshipChange(relationship.Id, patch);
      return [
        {
          key: 'name', category: t('PgCatGeneral'), label: t('PgName'),
          description: t('PgDescRelName'), kind: 'text', value: relationship.Name,
          apply: (v) => set({ Name: String(v) }),
        },
        {
          key: 'type', category: t('PgCatGeneral'), label: t('PgRelType'),
          description: t('PgDescRelType'), kind: 'select', value: relationship.Type,
          options: [
            { value: 'OneToOne', label: t('RelType11') },
            { value: 'OneToMany', label: t('RelType1N') },
            { value: 'ManyToMany', label: t('RelTypeNM') },
          ],
          apply: (v) => set({ Type: String(v) as RelationshipType }),
        },
        {
          key: 'lineStyle', category: t('PgCatGeneral'), label: t('PgLineStyle'),
          description: t('PgDescLineStyle'), kind: 'select', value: relationship.LineStyle,
          options: [
            { value: 'Straight', label: t('LineStyleStraight') },
            { value: 'Curved', label: t('LineStyleCurved') },
            { value: 'Orthogonal', label: t('LineStyleOrthogonal') },
          ],
          apply: (v) => set({ LineStyle: String(v) as RelationshipLineStyle, RoutePoints: [] }),
        },
      ];
    }

    // Nothing selected — edit the schema itself.
    return [
      {
        key: 'name', category: t('PgCatGeneral'), label: t('PgName'),
        description: t('PgDescSchemaName'), kind: 'text', value: schema.Name,
        apply: (v) => props.onSchemaChange({ Name: String(v) }),
      },
      {
        key: 'targetDb', category: t('PgCatGeneral'), label: t('PgDbType'),
        description: t('PgDescDbType'), kind: 'select', value: schema.TargetDb,
        options: DB_TARGET_TYPES.map((db) => ({ value: db, label: getDbDisplayName(db) })),
        apply: (v) => props.onSchemaChange({ TargetDb: String(v) as DbTargetType }),
      },
      {
        key: 'tableCount', category: t('PgCatStats'), label: t('PgColumnCount'),
        description: t('PgDescColumnCount'), kind: 'readonly', value: schema.Tables.length,
      },
    ];
  }, [schema, table, column, relationship, t, props]);

  const grouped = useMemo(() => {
    const map = new Map<string, Field[]>();
    for (const field of fields) {
      const list = map.get(field.category) ?? [];
      list.push(field);
      map.set(field.category, list);
    }
    if (props.sortMode === 'alphabetical') {
      for (const list of map.values()) list.sort((a, b) => a.label.localeCompare(b.label));
    }
    return map;
  }, [fields, props.sortMode]);

  return (
    <div className="property-grid">
      <div className="property-toolbar">
        <button
          className={`chip ${props.sortMode === 'category' ? 'active' : ''}`}
          onClick={() => props.onSortModeChange('category')}
          title={t('TtSortCategory')}
        >
          {t('BtnSortCategory')}
        </button>
        <button
          className={`chip ${props.sortMode === 'alphabetical' ? 'active' : ''}`}
          onClick={() => props.onSortModeChange('alphabetical')}
          title={t('TtSortAlpha')}
        >
          {t('BtnSortAlpha')}
        </button>
      </div>

      {[...grouped.entries()].map(([category, list]) => (
        <div key={category} className="property-category">
          <div className="property-category-title">{category}</div>
          {list.map((field) => (
            <div key={field.key} className="property-row" title={field.description}>
              <label className="property-label">{field.label}</label>
              <div className="property-value">
                {field.kind === 'readonly' && <span className="readonly">{String(field.value)}</span>}
                {field.kind === 'bool' && (
                  <input
                    type="checkbox"
                    checked={!!field.value}
                    onChange={(e) => field.apply?.(e.target.checked)}
                  />
                )}
                {field.kind === 'text' && (
                  <input
                    type="text"
                    value={String(field.value ?? '')}
                    onChange={(e) => field.apply?.(e.target.value)}
                  />
                )}
                {field.kind === 'number' && (
                  <input
                    type="number"
                    value={field.value == null ? '' : String(field.value)}
                    onChange={(e) => field.apply?.(e.target.value)}
                  />
                )}
                {field.kind === 'select' && (
                  <select
                    value={String(field.value ?? '')}
                    onChange={(e) => field.apply?.(e.target.value)}
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
