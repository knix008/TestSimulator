// Port of Dialogs/ColumnEditDialog.cs
import { useState } from 'react';
import type { DbColumn, DbTargetType } from '../types';
import { getTypes, typeHasLength, typeHasPrecisionScale } from '../core/dataTypes';
import { useT } from '../i18n';
import { Dialog } from './Dialog';
import { Icons } from './Icons';

interface Props {
  column: DbColumn;
  targetDb: DbTargetType;
  onSave: (column: DbColumn) => void;
  onClose: () => void;
}

export function ColumnEditDialog({ column, targetDb, onSave, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<DbColumn>({ ...column });
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof DbColumn>(key: K, value: DbColumn[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const numberOrNull = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = parseInt(trimmed, 10);
    return Number.isNaN(n) ? null : n;
  };

  const handleOk = () => {
    if (!draft.Name.trim()) return setError(t('ErrColumnName'));
    if (!draft.DataType.trim()) return setError(t('ErrDataType'));
    onSave({ ...draft, Name: draft.Name.trim(), DataType: draft.DataType.trim() });
  };

  const types = getTypes(targetDb);
  const showLength = typeHasLength(draft.DataType);
  const showPrecision = typeHasPrecisionScale(draft.DataType);

  return (
    <Dialog title={t('ColEditTitle')} icon={<Icons.Column />} onClose={onClose} onOk={handleOk} width={470} height={620}>
      {error && <div className="form-error">{error}</div>}
      <div className="form-grid">
        <label>{t('ColEditName')}</label>
        <input value={draft.Name} onChange={(e) => set('Name', e.target.value)} />

        <label>{t('ColEditType')}</label>
        <input
          list="column-types"
          value={draft.DataType}
          onChange={(e) => set('DataType', e.target.value.toUpperCase())}
        />
        <datalist id="column-types">
          {types.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>

        {showLength && (
          <>
            <label>{t('ColEditLength')}</label>
            <input
              type="number"
              min={1}
              value={draft.Length ?? ''}
              onChange={(e) => set('Length', numberOrNull(e.target.value))}
            />
          </>
        )}

        {showPrecision && (
          <>
            <label>{t('ColEditPrecision')}</label>
            <input
              type="number"
              min={1}
              value={draft.Precision ?? ''}
              onChange={(e) => set('Precision', numberOrNull(e.target.value))}
            />
            <label>{t('ColEditScale')}</label>
            <input
              type="number"
              min={0}
              value={draft.Scale ?? ''}
              onChange={(e) => set('Scale', numberOrNull(e.target.value))}
            />
          </>
        )}

        <label>{t('ColEditDefault')}</label>
        <input
          value={draft.DefaultValue ?? ''}
          onChange={(e) => set('DefaultValue', e.target.value || null)}
        />

        <label>{t('ColEditComment')}</label>
        <input value={draft.Comment ?? ''} onChange={(e) => set('Comment', e.target.value || null)} />
      </div>

      <div className="form-checks">
        <label>
          <input
            type="checkbox"
            checked={draft.IsPrimaryKey}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                IsPrimaryKey: e.target.checked,
                // A PK is implicitly NOT NULL, matching the DDL generator.
                IsNullable: e.target.checked ? false : d.IsNullable,
                IsAutoIncrement: e.target.checked ? d.IsAutoIncrement : false,
              }))
            }
          />
          {t('ColEditPK')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.IsAutoIncrement}
            disabled={!draft.IsPrimaryKey}
            onChange={(e) => set('IsAutoIncrement', e.target.checked)}
          />
          {t('ColEditAI')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.IsNullable}
            disabled={draft.IsPrimaryKey}
            onChange={(e) => set('IsNullable', e.target.checked)}
          />
          {t('ColEditNull')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.IsUnique}
            onChange={(e) => set('IsUnique', e.target.checked)}
          />
          {t('ColEditUnique')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.IsForeignKey}
            onChange={(e) => set('IsForeignKey', e.target.checked)}
          />
          {t('ColEditFK')}
        </label>
      </div>
    </Dialog>
  );
}
