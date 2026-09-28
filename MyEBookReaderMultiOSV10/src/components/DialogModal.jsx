import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { DialogBody, dialogIcon, dialogTitle } from './dialogs.jsx';

// The web build has no second window to open, so a dialog is shown in-page.
//
// It is the same body the desktop popup window renders and it reports the same
// results, so the application's dialog handling does not know (or care) which
// host it is talking to.
const WIDTHS = {
  settings: 820,
  about: 600,
  error: 680,
  progress: 480,
  unsaved: 520,
  print: 980,
  prompt: 560,
  note: 580,
  properties: 640,
  shortcuts: 760,
};

export default function DialogModal({ name, payload, onResult, onClose }) {
  const { t } = useTranslation();
  if (!name || !payload) return null;

  return (
    <Modal
      open
      title={dialogTitle(name, t, payload)}
      icon={dialogIcon(name)}
      onClose={onClose}
      width={WIDTHS[name] || 560}
      className={`dialog-modal dialog-${name}`}
      closeOnBackdrop={name !== 'error' && name !== 'unsaved' && name !== 'progress'}
      closeLabel={t('common.close')}
    >
      <DialogBody name={name} payload={payload} onResult={onResult} />
    </Modal>
  );
}
