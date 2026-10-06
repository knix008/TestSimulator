import { useState } from "react";
import { ApiError } from "./api";
import type { Translate } from "./i18n";

type Props = {
  t: Translate;
  error: unknown;
  onClose: () => void;
  copyText: (value: string) => void;
};

/** Copyable error popup — nothing is swallowed silently, as in the WinForms build. */
export function ErrorDialog({ t, error, onClose, copyText }: Props) {
  const [copied, setCopied] = useState(false);
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof ApiError ? error.code : error instanceof Error ? error.name : "ERROR";
  const detail = error instanceof ApiError
    ? error.detail
    : error instanceof Error
      ? error.stack || error.message
      : String(error);

  const body = `${t("errorCode")}: ${code}\n${t("errorMessage")}: ${message}\n\n${detail}`;

  return (
    <div className="modal-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal error" role="alertdialog" aria-label={t("errorTitle")}>
        <header className="modal-header is-error">{t("errorTitle")}</header>
        <div className="modal-body">
          <p className="error-message">{message}</p>
          <dl className="error-grid">
            <dt>{t("errorCode")}</dt>
            <dd>{code}</dd>
            <dt>{t("errorDetail")}</dt>
            <dd><pre>{detail}</pre></dd>
          </dl>
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              copyText(body);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? t("copied") : t("errorCopy")}
          </button>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={onClose}>{t("ok")}</button>
        </footer>
      </div>
    </div>
  );
}
