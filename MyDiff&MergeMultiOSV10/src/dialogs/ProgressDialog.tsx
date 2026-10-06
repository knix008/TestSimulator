/**
 * The progress popup.
 *
 * Shown only for work that has already taken longer than a third of a second (see
 * `withProgress` in state.tsx), so a fast operation never flashes a window up. The bar
 * is indeterminate because the operations it covers — walking a directory tree,
 * reading a pair of files — cannot report a percentage honestly.
 */
import type { DialogProps } from "../DialogHost.js";
import { Icon } from "../icons.js";
import type { StringKey } from "../../core/i18n.js";

export function ProgressDialog({ payload, t }: DialogProps) {
  const label = (payload as { label?: StringKey } | null)?.label;
  return (
    <div className="progress-body">
      <Icon name="clock" size={26} />
      <p className="progress-label" data-testid="progress-label">
        {label ? t(label) : t("progress.title")}
      </p>
      <div className="progress-track" role="progressbar" aria-busy="true">
        <div className="progress-fill" />
      </div>
    </div>
  );
}
