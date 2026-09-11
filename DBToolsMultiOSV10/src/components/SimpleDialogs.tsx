// About, error, confirm and prompt dialogs — ports of Dialogs/{AboutDialog,ErrorDialog}.cs.
import { useState } from 'react';
import { useT } from '../i18n';
import { Dialog } from './Dialog';
import { Icons } from './Icons';
import { APP_NAME, APP_VERSION } from '../appInfo';
// The same artwork electron-builder stamps on the executable, so the About box
// matches the taskbar / Finder icon. Vite bundles it for web and packaged builds.
import appIcon from '../../build/icons/256x256.png';

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Dialog title={t('AboutTitle')} icon={<Icons.About />} onClose={onClose} cancelLabel={t('BtnClose')} width={520} height={460}>
      <div className="about-header">
        <img className="about-icon" src={appIcon} alt="" width={80} height={80} draggable={false} />
        <div>
          <h2 className="about-name">{APP_NAME}</h2>
          <p className="about-version">{t('AboutVersion').replace('{0}', APP_VERSION)}</p>
        </div>
      </div>
      <pre className="about-description">{t('AboutDescription')}</pre>
      <p className="about-platform">Web · Windows · macOS · Linux</p>
    </Dialog>
  );
}

interface ErrorDialogProps {
  message: string;
  details?: string | null;
  onClose: () => void;
}

export function ErrorDialog({ message, details, onClose }: ErrorDialogProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText([message, details].filter(Boolean).join('\n\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog
      title={t('ErrorTitle')}
      icon={<Icons.Warning />}
      onClose={onClose}
      cancelLabel={t('ErrorBtnClose')}
      width={560}
      height={440}
      extraActions={
        <button className="btn" onClick={copy}>
          {copied ? t('ErrorCopied') : t('ErrorBtnCopy')}
        </button>
      }
    >
      <p className="error-message">{message}</p>
      {details && (
        <>
          <button className="link-button" onClick={() => setExpanded((v) => !v)}>
            {t('ErrorDetails')} {expanded ? '▴' : '▾'}
          </button>
          {expanded && <pre className="error-details">{details}</pre>}
        </>
      )}
    </Dialog>
  );
}

interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional third action, e.g. "Don't save". */
  discardLabel?: string;
  onConfirm: () => void;
  onDiscard?: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  discardLabel,
  onConfirm,
  onDiscard,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <Dialog
      title={title ?? t('MsgConfirm')}
      icon={<Icons.Question />}
      onClose={onCancel}
      onOk={onConfirm}
      okLabel={confirmLabel ?? t('BtnOk')}
      cancelLabel={cancelLabel ?? t('BtnCancel')}
      width={440}
      height={260}
      extraActions={
        discardLabel && onDiscard ? (
          <button className="btn" onClick={onDiscard}>
            {discardLabel}
          </button>
        ) : undefined
      }
    >
      <p className="confirm-message">{message}</p>
    </Dialog>
  );
}

/**
 * Shown when a save or an export finishes. Separate from NoticeDialog so the
 * result reads as a result — a success mark and the path it was written to,
 * rather than a generic notice.
 */
export function DoneDialog({
  message,
  detail,
  onClose,
}: {
  message: string;
  detail?: string | null;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Dialog
      title={t('MsgDoneTitle')}
      icon={<Icons.Success />}
      onClose={onClose}
      cancelLabel={t('BtnClose')}
      width={520}
      height={260}
    >
      <div className="done-body">
        <span className="done-mark">
          <Icons.Success />
        </span>
        <div>
          <p className="done-message">{message}</p>
          {detail && <p className="done-detail">{detail}</p>}
        </div>
      </div>
    </Dialog>
  );
}

export function NoticeDialog({ message, onClose }: { message: string; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog title={t('MsgNotice')} icon={<Icons.About />} onClose={onClose} cancelLabel={t('BtnClose')} width={440} height={250}>
      <p className="confirm-message">{message}</p>
    </Dialog>
  );
}

interface PromptDialogProps {
  title: string;
  label: string;
  initialValue: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export function PromptDialog({ title, label, initialValue, onSubmit, onClose }: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <Dialog title={title} icon={<Icons.Edit />} onClose={onClose} onOk={() => onSubmit(value.trim())} width={420} height={230}>
      <div className="form-grid">
        <label>{label}</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit(value.trim())}
        />
      </div>
    </Dialog>
  );
}
