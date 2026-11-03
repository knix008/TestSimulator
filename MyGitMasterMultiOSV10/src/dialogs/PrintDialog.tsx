/**
 * Print preview as a dialog of its own (a resizable OS window on the desktop): page
 * setup on the left, the laid-out pages on the right, Print sends the pages to the
 * system print dialog from this window.
 *
 *   host.openDialog("print", { report })   — payload: { report, setup? }
 */
import { useState } from "react";
import { defaultPageSetup, type PageSetup } from "../../core/printLayout";
import type { Report } from "../../core/report";
import { printReport } from "../exportReport";
import { Icon } from "../icons";
import type { DialogComponentProps } from "../popupRegistry";
import { PrintPreview } from "../PrintPreview";

export type PrintPayload = { report: Report; setup?: PageSetup };

export function PrintDialog({ payload, t, close }: DialogComponentProps) {
  const request = payload as PrintPayload | null;
  const [setup, setSetup] = useState<PageSetup | null>(() => request?.report ? request.setup ?? defaultPageSetup(request.report.title) : null);
  if (!request?.report || !setup) return null;
  return (
    <div className="popup-print">
      <div className="popup-print-body">
        <PrintPreview report={request.report} setup={setup} t={t} onSetup={setSetup} />
      </div>
      <footer className="popup-footer">
        <button type="button" onClick={close}>{t("close")}</button>
        <button type="button" className="primary" onClick={() => printReport(request.report, setup)}>
          <Icon name="print" />{t("print")}
        </button>
      </footer>
    </div>
  );
}
