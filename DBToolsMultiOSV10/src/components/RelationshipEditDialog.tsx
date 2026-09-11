// Port of Dialogs/RelationshipDialog.cs
import { useState } from 'react';
import type { DbRelationship, DbSchema, RelationshipLineStyle, RelationshipType } from '../types';
import { getTypeDisplay } from '../core/schema';
import { useT } from '../i18n';
import { Dialog } from './Dialog';
import { Icons } from './Icons';

interface Props {
  relationship: DbRelationship;
  schema: DbSchema;
  onSave: (relationship: DbRelationship) => void;
  onClose: () => void;
}

const TYPES: RelationshipType[] = ['OneToOne', 'OneToMany', 'ManyToMany'];
const LINE_STYLES: RelationshipLineStyle[] = ['Straight', 'Curved', 'Orthogonal'];

export function RelationshipEditDialog({ relationship, schema, onSave, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<DbRelationship>({
    ...relationship,
    RoutePoints: relationship.RoutePoints.map((p) => ({ ...p })),
  });
  const [error, setError] = useState<string | null>(null);

  const typeLabel = (type: RelationshipType) =>
    type === 'OneToOne' ? t('RelType11') : type === 'OneToMany' ? t('RelType1N') : t('RelTypeNM');

  const lineStyleLabel = (style: RelationshipLineStyle) =>
    style === 'Straight'
      ? t('LineStyleStraight')
      : style === 'Curved'
        ? t('LineStyleCurved')
        : t('LineStyleOrthogonal');

  const sourceTable = schema.Tables.find((tb) => tb.Id === draft.SourceTableId);
  const targetTable = schema.Tables.find((tb) => tb.Id === draft.TargetTableId);

  const setSourceTable = (tableId: string) => {
    const table = schema.Tables.find((tb) => tb.Id === tableId);
    const pk = table?.Columns.find((c) => c.IsPrimaryKey) ?? table?.Columns[0];
    setDraft((d) => ({ ...d, SourceTableId: tableId, SourceColumnId: pk?.Id ?? '' }));
  };

  const setTargetTable = (tableId: string) => {
    const table = schema.Tables.find((tb) => tb.Id === tableId);
    setDraft((d) => ({ ...d, TargetTableId: tableId, TargetColumnId: table?.Columns[0]?.Id ?? '' }));
  };

  const handleOk = () => {
    if (!draft.SourceTableId || !draft.TargetTableId || !draft.SourceColumnId || !draft.TargetColumnId) {
      return setError(t('ErrSrcTgtRequired'));
    }
    if (draft.SourceTableId === draft.TargetTableId) return setError(t('ErrSrcTgtSame'));
    // Changing endpoints invalidates any hand-tuned route.
    const endpointsChanged =
      draft.SourceTableId !== relationship.SourceTableId ||
      draft.TargetTableId !== relationship.TargetTableId ||
      draft.LineStyle !== relationship.LineStyle;
    onSave({ ...draft, RoutePoints: endpointsChanged ? [] : draft.RoutePoints });
  };

  return (
    <Dialog title={t('RelEditTitle')} icon={<Icons.Relation />} onClose={onClose} onOk={handleOk} width={530} height={650}>
      {error && <div className="form-error">{error}</div>}
      <div className="form-grid">
        <label>{t('RelEditName')}</label>
        <input value={draft.Name} onChange={(e) => setDraft({ ...draft, Name: e.target.value })} />

        <label>{t('RelEditType')}</label>
        <select
          value={draft.Type}
          onChange={(e) => setDraft({ ...draft, Type: e.target.value as RelationshipType })}
        >
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {typeLabel(type)}
            </option>
          ))}
        </select>

        <label>{t('RelEditLineStyle')}</label>
        <select
          value={draft.LineStyle}
          onChange={(e) =>
            setDraft({ ...draft, LineStyle: e.target.value as RelationshipLineStyle, RoutePoints: [] })
          }
        >
          {LINE_STYLES.map((style) => (
            <option key={style} value={style}>
              {lineStyleLabel(style)}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="form-fieldset">
        <legend>{t('RelEditSource')}</legend>
        <div className="form-grid">
          <label>{t('RelEditTable')}</label>
          <select value={draft.SourceTableId} onChange={(e) => setSourceTable(e.target.value)}>
            {schema.Tables.map((table) => (
              <option key={table.Id} value={table.Id}>
                {table.Name}
              </option>
            ))}
          </select>
          <label>{t('RelEditColumn')}</label>
          <select
            value={draft.SourceColumnId}
            onChange={(e) => setDraft({ ...draft, SourceColumnId: e.target.value })}
          >
            {(sourceTable?.Columns ?? []).map((column) => (
              <option key={column.Id} value={column.Id}>
                {column.Name} ({getTypeDisplay(column)})
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="form-fieldset">
        <legend>{t('RelEditTarget')}</legend>
        <div className="form-grid">
          <label>{t('RelEditTable')}</label>
          <select value={draft.TargetTableId} onChange={(e) => setTargetTable(e.target.value)}>
            {schema.Tables.map((table) => (
              <option key={table.Id} value={table.Id}>
                {table.Name}
              </option>
            ))}
          </select>
          <label>{t('RelEditColumn')}</label>
          <select
            value={draft.TargetColumnId}
            onChange={(e) => setDraft({ ...draft, TargetColumnId: e.target.value })}
          >
            {(targetTable?.Columns ?? []).map((column) => (
              <option key={column.Id} value={column.Id}>
                {column.Name} ({getTypeDisplay(column)})
              </option>
            ))}
          </select>
        </div>
      </fieldset>
    </Dialog>
  );
}
