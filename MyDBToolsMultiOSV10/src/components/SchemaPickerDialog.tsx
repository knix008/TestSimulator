// Which open schemas should this export or report cover?
//
// Only shown when more than one is open — with a single document there is
// nothing to choose, and a dialog that always answers itself is just a step in
// the way. Several may be picked at once: the files then go to one folder
// rather than through one save dialog each.
import { useState } from 'react';
import type { SchemaDocument } from '../hooks/useAppState';
import { documentLabel } from '../hooks/useAppState';
import { getDbDisplayName } from '../types';
import { useT } from '../i18n';
import { Dialog } from './Dialog';
import { Icons } from './Icons';

interface Props {
  title: string;
  documents: SchemaDocument[];
  /** Preselected — the tab the command was invoked from. */
  activeId: string;
  onPick: (documentIds: string[]) => void;
  onClose: () => void;
}

export function SchemaPickerDialog({ title, documents, activeId, onPick, onClose }: Props) {
  const t = useT();
  const [chosen, setChosen] = useState<string[]>([activeId]);

  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  return (
    <Dialog
      title={title}
      icon={<Icons.Doc />}
      onClose={onClose}
      onOk={chosen.length > 0 ? () => onPick(chosen) : undefined}
      okLabel={t('SettingsBtnOk')}
      cancelLabel={t('BtnCancel')}
      width={540}
      height={440}
      extraActions={
        <>
          <button className="btn" onClick={() => setChosen(documents.map((d) => d.id))}>
            {t('PickSelectAll')}
          </button>
          <button className="btn" onClick={() => setChosen([])}>
            {t('PickSelectNone')}
          </button>
        </>
      }
    >
      <p className="picker-intro">{t('PickSchemaIntro')}</p>
      <div className="picker-list">
        {documents.map((document) => (
          <label
            key={document.id}
            className={`picker-item ${chosen.includes(document.id) ? 'chosen' : ''}`}
          >
            <input
              type="checkbox"
              checked={chosen.includes(document.id)}
              onChange={() => toggle(document.id)}
            />
            <span className="picker-icon">
              <Icons.Doc />
            </span>
            <span className="picker-text">
              <span className="picker-name">{documentLabel(document)}</span>
              <span className="picker-detail">
                {t(
                  'PickSchemaDetail',
                  getDbDisplayName(document.schema.TargetDb),
                  document.schema.Tables.length,
                  document.schema.Relationships.length,
                )}
              </span>
              {document.path && <span className="picker-path">{document.path}</span>}
            </span>
          </label>
        ))}
      </div>
      <p className="picker-note">
        {chosen.length > 1 ? t('PickSchemaFolderNote', chosen.length) : t('PickSchemaOneNote')}
      </p>
    </Dialog>
  );
}
