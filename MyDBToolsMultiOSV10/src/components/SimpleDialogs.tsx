// About, error, confirm and prompt dialogs — ports of Dialogs/{AboutDialog,ErrorDialog}.cs.
import { useEffect, useState, type ReactNode } from 'react';
import { getLanguage, useT } from '../i18n';
import { Dialog } from './Dialog';
import { Icons } from './Icons';
import { APP_NAME, APP_TITLE, APP_VERSION } from '../appInfo';
// The same artwork the installer and the executable carry (assets/), so the
// About box matches the taskbar icon.
import appIcon from '../../assets/icons/256x256.png';

/** What the About window lists, as label / value rows (also copied as text). */
interface AboutFact {
  label: string;
  value: string;
}

interface HostFacts {
  tauri: string;
  webview: string;
  os: string;
  arch: string;
  dataDir: string;
}

const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
const reactVersion = typeof __REACT_VERSION__ !== 'undefined' ? __REACT_VERSION__ : '';
const viteVersion = typeof __VITE_VERSION__ !== 'undefined' ? __VITE_VERSION__ : '';

/**
 * The About window, laid out like the other apps' (My Photo Work, MyUMLMaker):
 * a title card with the 3D icon, name, version and a one-line description; the
 * facts (version, build date, author, licence, runtime, built with, platform,
 * data folder); what the app offers at a glance; and Copy / User guide / Close.
 */
export function AboutDialog({ onClose, onUserGuide }: { onClose: () => void; onUserGuide?: () => void }) {
  const t = useT();
  const [host, setHost] = useState<HostFacts | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke<HostFacts>('app_info').then(setHost).catch(() => {}),
    );
  }, []);

  const built = (() => {
    if (!buildTime) return '—';
    try {
      return new Date(buildTime).toLocaleString(getLanguage() === 'ko' ? 'ko-KR' : 'en-GB');
    } catch {
      return buildTime;
    }
  })();

  const facts: AboutFact[] = [
    { label: t('AboutFactVersion'), value: APP_VERSION },
    { label: t('AboutFactBuilt'), value: built },
    { label: t('AboutFactAuthor'), value: 'SHKWON (knix008@naver.com)' },
    { label: t('AboutFactLicense'), value: t('AboutLicenseValue') },
    {
      label: t('AboutFactRuntime'),
      value: host ? `Tauri ${host.tauri} · WebView ${host.webview}` : t('AboutRuntimeBrowser'),
    },
    { label: t('AboutFactBuiltWith'), value: `React ${reactVersion} · Vite ${viteVersion} · TypeScript` },
    { label: t('AboutFactPlatform'), value: host ? `${host.os} ${host.arch}` : navigator.userAgent.split(') ')[0].replace('Mozilla/5.0 (', '') },
    ...(host ? [{ label: t('AboutFactData'), value: host.dataDir }] : []),
  ];

  const features: [ReactNode, string][] = [
    [<Icons.Database key="d" />, t('AboutFeatureDatabases')],
    [<Icons.Examples key="e" />, t('AboutFeatureExamples')],
    [<Icons.Palette key="p" />, t('AboutFeatureThemes')],
    [<Icons.Analyze key="a" />, t('AboutFeatureAnalysis')],
    [<Icons.Export key="x" />, t('AboutFeatureExport')],
    [<Icons.Print key="r" />, t('AboutFeaturePrint')],
  ];

  const copy = async () => {
    const text = [`${APP_TITLE}`, t('AboutTagline'), '', ...facts.map((f) => `${f.label}: ${f.value}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog
      title={t('AboutTitle')}
      icon={<Icons.About />}
      onClose={onClose}
      cancelLabel={t('BtnClose')}
      width={600}
      height={560}
      extraActions={
        <>
          <button className="btn" data-action="about-copy" onClick={() => void copy()}>
            {copied ? <Icons.Success /> : <Icons.Doc />}
            <span>{copied ? t('AboutCopied') : t('AboutCopy')}</span>
          </button>
          {onUserGuide && (
            <button className="btn" data-action="about-guide" onClick={onUserGuide}>
              <Icons.Book />
              <span>{t('MenuUserGuide')}</span>
            </button>
          )}
        </>
      }
    >
      <div className="about-card">
        <img className="about-icon" src={appIcon} alt="" width={96} height={96} draggable={false} />
        <div className="about-card-text">
          <h2 className="about-name">
            {APP_NAME} <span className="about-badge">v{APP_VERSION}</span>
          </h2>
          <p className="about-tagline">{t('AboutTagline')}</p>
          <p className="about-platforms">Windows · macOS · Linux · Web</p>
        </div>
      </div>

      <dl className="about-facts">
        {facts.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd title={f.value}>{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="about-features">
        {features.map(([icon, text]) => (
          <span key={text} className="about-feature">
            {icon}
            <span>{text}</span>
          </span>
        ))}
      </div>

      <p className="about-copyright">Copyright © 2026 SHKWON. All rights reserved.</p>
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
        <button className="btn" data-action="error-copy" onClick={copy}>
          {copied ? <Icons.Success /> : <Icons.Copy />}
          <span>{copied ? t('ErrorCopied') : t('ErrorBtnCopy')}</span>
        </button>
      }
    >
      <p className="error-message">{message}</p>
      {details && (
        <>
          <button className="link-button" data-action="error-details" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
            <span>{t('ErrorDetails')}</span>
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
  /**
   * What confirming does, for the button icons: "save" (save / don't save /
   * cancel), "delete" (a bin), or a plain check mark when absent.
   */
  intent?: 'save' | 'delete';
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
  intent,
  onConfirm,
  onDiscard,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <Dialog
      title={title ?? t('MsgConfirm')}
      icon={intent === 'delete' ? <Icons.Warning /> : <Icons.Question />}
      onClose={onCancel}
      onOk={onConfirm}
      okLabel={confirmLabel ?? t('BtnOk')}
      cancelLabel={cancelLabel ?? t('BtnCancel')}
      okIcon={intent === 'save' ? <Icons.Save /> : intent === 'delete' ? <Icons.Delete /> : undefined}
      width={440}
      height={260}
      extraActions={
        discardLabel && onDiscard ? (
          <button className="btn" data-action="dialog-discard" onClick={onDiscard}>
            <Icons.Discard />
            <span>{discardLabel}</span>
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
