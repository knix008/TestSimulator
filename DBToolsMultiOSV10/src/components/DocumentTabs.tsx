// The row of open schemas under the toolbar.
//
// Each tab is one document. The dot marks unsaved changes, the same way the
// window title does, so the two never tell different stories.
import type { SchemaDocument } from '../hooks/useAppState';
import { documentLabel } from '../hooks/useAppState';
import { areEquivalent } from '../core/serializer';
import { useT } from '../i18n';
import { Icons } from './Icons';

interface Props {
  documents: SchemaDocument[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function DocumentTabs({ documents, activeId, onSelect, onClose, onNew }: Props) {
  const t = useT();
  // Always shown, even with one document: the row is where the + button lives,
  // and a bar that appears and disappears makes the layout jump.
  return (
    <div className="doc-tabs" role="tablist">
      {documents.map((document) => {
        const dirty = !areEquivalent(document.saved, document.schema);
        const label = documentLabel(document);
        const active = document.id === activeId;
        return (
          <div
            key={document.id}
            className={`doc-tab ${active ? 'active' : ''}`}
            role="tab"
            aria-selected={active}
            title={document.path ?? label}
            data-doc-id={document.id}
            onMouseDown={(e) => {
              // Middle click closes, as it does in a browser.
              if (e.button === 1) {
                e.preventDefault();
                onClose(document.id);
              }
            }}
            onClick={() => onSelect(document.id)}
          >
            <span className="doc-tab-icon">
              <Icons.Doc />
            </span>
            <span className="doc-tab-label">{label}</span>
            {dirty && <span className="doc-tab-dirty" aria-label={t('UnsavedMarker')}>●</span>}
            <button
              className="doc-tab-close"
              title={t('TtCloseTab')}
              aria-label={t('TtCloseTab')}
              onClick={(e) => {
                e.stopPropagation();
                onClose(document.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <button className="doc-tab-new" title={t('TtNewTab')} aria-label={t('TtNewTab')} onClick={onNew}>
        +
      </button>
    </div>
  );
}
