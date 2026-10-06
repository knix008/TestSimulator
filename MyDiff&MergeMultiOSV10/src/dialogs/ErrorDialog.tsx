/**
 * The error dialog.
 *
 * It shows what failed in one sentence and the whole technical detail underneath,
 * and the detail is selectable and copyable in one click — an error a user cannot
 * copy is an error they cannot report.
 */
import { useState } from "react";
import type { DialogProps } from "../DialogHost.js";
import * as host from "../host.js";
import { Icon } from "../icons.js";
import { Button, Buttons } from "./parts.js";

type ErrorPayload = { title?: string; message?: string; detail?: string; code?: string };

export function ErrorDialog({ payload, t, close }: DialogProps) {
  const error = (payload ?? {}) as ErrorPayload;
  const [copied, setCopied] = useState(false);

  const full = [
    error.title ? `${error.title}` : "",
    `${error.code ?? "ERROR"}: ${error.message ?? t("error.generic")}`,
    "",
    error.detail ?? "",
  ].filter(Boolean).join("\n");

  return (
    <>
      <div className="error-head">
        <Icon name="error" size={28} />
        <div>
          <p className="error-message" data-testid="error-message">{error.message || t("error.generic")}</p>
          <p className="error-code">{error.code ?? "ERROR"}</p>
        </div>
      </div>

      <label className="field-stack">
        <span className="field-label">{t("error.detail")}</span>
        <textarea
          className="error-detail"
          readOnly
          data-testid="error-detail"
          value={error.detail ?? error.message ?? ""}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>

      <Buttons>
        <Button
          icon="copy"
          name="copy"
          onClick={async () => {
            await host.copyText(full);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? t("dlg.copied") : t("error.copy")}
        </Button>
        <Button icon="check" name="close" primary onClick={close}>{t("dlg.close")}</Button>
      </Buttons>
    </>
  );
}
