/**
 * The progress popup as a dialog of its own (src/ProgressPopup.tsx inside the popup
 * frame). App keeps it in step with the progress store (src/progress.ts) through
 * host.updateDialog("progress", state) and closes it when the operation ends; Cancel
 * stops the running git command from here.
 */
import { api } from "../api";
import type { DialogComponentProps } from "../popupRegistry";
import type { ProgressState } from "../progress";
import { ProgressPopup } from "../ProgressPopup";

export function ProgressDialog({ payload, t }: DialogComponentProps) {
  const state = payload as ProgressState | null;
  if (!state) return null;
  return (
    <div className="popup-progress">
      <ProgressPopup state={state} t={t} onCancel={() => void api.cancel().catch(() => undefined)} />
    </div>
  );
}
