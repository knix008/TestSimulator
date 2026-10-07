/**
 * The right panel: what this merge is and how far it has got.
 *
 * Like the left one it exists only on a merge tab, and it answers the questions a
 * merge raises that a comparison does not: where the three inputs came from, where
 * the result will be written, how the conflicts were settled — and, for the selected
 * one, how its three sides differ in size.
 *
 * It is read-only. Everything that changes something is on the toolbar, in the left
 * panel, or on the panes themselves — the one button in its header closes the panel,
 * which changes the window rather than the merge.
 */
import {
  conflictCount,
  conflicts,
  resolvedCount,
  type ConflictResolution,
} from "../core/mergeDocument.js";
import { Icon } from "./icons.js";
import { useApp, type MergeTab } from "./state.js";

export function RightPanel({ tab }: { tab: MergeTab }) {
  const app = useApp();
  const { t, settings } = app;
  const list = conflicts(tab.document);
  const total = conflictCount(tab.document);
  const resolved = resolvedCount(tab.document);
  const selected = list[tab.selectedConflict];

  // How the settled conflicts were settled — the shape of the merge at a glance.
  const tally = new Map<ConflictResolution, number>();
  for (const hunk of list) tally.set(hunk.resolution, (tally.get(hunk.resolution) ?? 0) + 1);
  const breakdown: [ConflictResolution, string][] = [
    ["base", t("cmd.merge.takeBase")],
    ["local", t("cmd.merge.takeLocal")],
    ["remote", t("cmd.merge.takeRemote")],
    ["both", t("cmd.merge.takeBoth")],
    ["edited", t("status.modifiedFlag")],
  ];

  return (
    <aside className="panel panel-right" style={{ width: settings.rightPanelWidth }}>
      <header className="panel-title">
        <Icon name="merge" size={15} />
        <span>{t("merge.info")}</span>
        {/* Closed from its own header, the way the left panel is; the rail it leaves
            against the right edge is what opens it again. */}
        <button
          type="button"
          className="icon-button"
          data-command="panel.collapseRight"
          title={t("panel.collapse")}
          onClick={() => void app.updateSettings({ showRightPanel: false })}
        >
          <Icon name="next" size={14} />
        </button>
      </header>

      <div className="panel-scroll">
        <Section title={t("merge.inputs")}>
          <Row label={t("merge.source")}>{t(`merge.source.${tab.info.source}` as never)}</Row>
          {tab.info.basePath ? <Row label={t("pane.base")}><Path value={tab.info.basePath} /></Row> : null}
          <Row label={t("pane.local")}><Path value={tab.info.localPath} /></Row>
          <Row label={t("pane.remote")}><Path value={tab.info.remotePath} /></Row>
          <Row label={t("merge.result")}><Path value={tab.info.mergedPath} /></Row>
        </Section>

        <Section title={t("merge.progress")}>
          <Row label={t("merge.conflicts")}>{total}</Row>
          <Row label={t("merge.resolved")}>
            <span className={resolved === total ? "count-added" : undefined}>{resolved}</span>
          </Row>
          <Row label={t("status.unresolved")}>
            <span className={total - resolved > 0 ? "count-removed" : undefined}>{total - resolved}</span>
          </Row>
          <Row label={t("label.encoding")}>
            {tab.document.newline === "\r\n" ? t("status.encodingCrlf") : t("status.encodingLf")}
          </Row>
          <Row label={t("right.status")}>{tab.dirty ? t("status.modifiedFlag") : t("status.saved")}</Row>
        </Section>

        {resolved > 0 ? (
          <Section title={t("merge.howResolved")}>
            {breakdown
              .filter(([key]) => (tally.get(key) ?? 0) > 0)
              .map(([key, label]) => <Row key={key} label={label}>{tally.get(key)}</Row>)}
          </Section>
        ) : null}

        {selected ? (
          <Section title={t("merge.selected")}>
            <Row label={t("merge.conflicts")}>#{tab.selectedConflict + 1}</Row>
            <Row label={t("right.status")}>{resolutionLabel(selected.resolution, t)}</Row>
            {selected.hasBase ? <Row label={t("pane.base")}>{t("misc.lines", selected.baseLines.length)}</Row> : null}
            <Row label={t("pane.local")}>{t("misc.lines", selected.localLines.length)}</Row>
            <Row label={t("pane.remote")}>{t("misc.lines", selected.remoteLines.length)}</Row>
          </Section>
        ) : null}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="property-row">
      <span className="property-label" title={label}>{label}</span>
      <span className="property-value">{children}</span>
    </div>
  );
}

function Path({ value }: { value: string | null }) {
  if (!value) return <>-</>;
  return <span className="path" title={value}>{value}</span>;
}

function resolutionLabel(resolution: string, t: ReturnType<typeof useApp>["t"]): string {
  switch (resolution) {
    case "base": return t("cmd.merge.takeBase");
    case "local": return t("cmd.merge.takeLocal");
    case "remote": return t("cmd.merge.takeRemote");
    case "both": return t("cmd.merge.takeBoth");
    case "edited": return t("status.modifiedFlag");
    default: return t("status.unresolved");
  }
}
