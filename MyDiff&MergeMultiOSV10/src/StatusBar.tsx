/**
 * The status bar: what is open, how it compares, and where the cursor is.
 *
 * The left half is the running message (the result of the last action, or an error);
 * the right half is the state a user checks at a glance — counts, line ending, zoom,
 * language and whether there is unsaved work. The resize grip sits at the very end,
 * in the window's bottom-right corner.
 */
import { conflictCount, resolvedCount } from "../core/mergeDocument.js";
import { formatBytes } from "../core/text.js";
import { Icon } from "./icons.js";
import { ResizeGrip } from "./ResizeGrip.js";
import { useApp } from "./state.js";

export function StatusBar() {
  const app = useApp();
  const { t, active } = app;

  return (
    <div className="status-bar" role="status">
      <span className="status-message" title={app.status}>
        <Icon name={app.dirty ? "modified" : "check"} size={14} />
        {app.status}
      </span>

      <span className="status-spacer" />

      {active?.kind === "compare" ? (
        <>
          <span className="status-cell added" title={t("status.added")}>
            <Icon name="added" size={13} />{active.summary.added}
          </span>
          <span className="status-cell removed" title={t("status.removed")}>
            <Icon name="removed" size={13} />{active.summary.removed}
          </span>
          <span className="status-cell modified" title={t("status.modified")}>
            <Icon name="modified" size={13} />{active.summary.modified}
          </span>
          <span className="status-cell" title={t("label.lines")}>
            {t("status.line")} {active.cursor + 1} / {active.summary.rowCount}
          </span>
          <span className="status-cell" title={t("label.encoding")}>
            {active.summary.left.newline === "\r\n" ? t("status.encodingCrlf") : t("status.encodingLf")}
          </span>
          <span className="status-cell" title={t("label.size")}>
            {formatBytes(active.summary.left.size)} / {formatBytes(active.summary.right.size)}
          </span>
          {active.summary.mode === "binary" ? <span className="status-cell">{t("status.binary")}</span> : null}
        </>
      ) : null}

      {active?.kind === "directory" ? (
        <>
          <span className="status-cell" title={t("status.same")}>
            <Icon name="equal" size={13} />{active.result.same}
          </span>
          <span className="status-cell modified" title={t("status.different")}>
            <Icon name="modified" size={13} />{active.result.different}
          </span>
          <span className="status-cell removed" title={t("status.leftOnly")}>
            <Icon name="leftOnly" size={13} />{active.result.leftOnly}
          </span>
          <span className="status-cell added" title={t("status.rightOnly")}>
            <Icon name="rightOnly" size={13} />{active.result.rightOnly}
          </span>
          <span className="status-cell">{t("misc.entries", active.result.entries.length)}</span>
        </>
      ) : null}

      {active?.kind === "merge" ? (
        <>
          <span className="status-cell conflict" title={t("status.conflicts")}>
            <Icon name="conflict" size={13} />
            {resolvedCount(active.document)} / {conflictCount(active.document)}
          </span>
          <span className="status-cell" title={t("label.encoding")}>
            {active.document.newline === "\r\n" ? t("status.encodingCrlf") : t("status.encodingLf")}
          </span>
          <span className="status-cell" title={active.info.mergedPath}>
            {active.dirty ? t("status.modifiedFlag") : t("status.saved")}
          </span>
        </>
      ) : null}

      {active?.kind === "git" ? (
        <>
          <span className="status-cell" title={active.repository.path}>
            <Icon name="branch" size={13} />
            {active.repository.branch ?? active.repository.head ?? "-"}
          </span>
          <span className="status-cell">{t("misc.files", active.changes.length)}</span>
          {active.conflicted.length > 0 ? (
            <span className="status-cell conflict">
              <Icon name="conflict" size={13} />{active.conflicted.length}
            </span>
          ) : null}
        </>
      ) : null}

      <span className="status-cell" title={t("tip.zoom")}>
        <Icon name="zoomIn" size={13} />{app.settings.zoom}%
      </span>
      <span className="status-cell" title={t("settings.language")}>{app.settings.language.toUpperCase()}</span>
      <ResizeGrip />
    </div>
  );
}
