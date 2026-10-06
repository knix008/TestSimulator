import { useMemo, useState } from "react";
import type { DirectoryCompareResult, FileCompareStatus } from "../core/dirCompare";
import { api, type SessionSummary, type Settings } from "./api";
import { Icon } from "./icons";
import { SplitPane } from "./SplitPane";
import type { Translate } from "./i18n";

type Props = {
  t: Translate;
  settings: Settings;
  result: DirectoryCompareResult | null;
  onResult: (result: DirectoryCompareResult | null) => void;
  onSession: (summary: SessionSummary) => void;
  onError: (error: unknown) => void;
  pickDirectory: (title: string) => Promise<string | null>;
  children: React.ReactNode;
};

const STATUS_KEYS: Record<FileCompareStatus, "dirStatusSame" | "dirStatusDifferent" | "dirStatusLeftOnly" | "dirStatusRightOnly"> = {
  same: "dirStatusSame",
  different: "dirStatusDifferent",
  leftOnly: "dirStatusLeftOnly",
  rightOnly: "dirStatusRightOnly",
};

/** Directory compare: two folder trees matched by relative path, with per-file status. */
export function DirectoryPanel(props: Props) {
  const { t, result, onResult, onError } = props;
  const [left, setLeft] = useState(result?.left ?? props.settings.lastDirectories?.left ?? "");
  const [right, setRight] = useState(result?.right ?? props.settings.lastDirectories?.right ?? "");
  const [excludes, setExcludes] = useState(props.settings.excludes.join(", "));
  const [filter, setFilter] = useState("");
  const [hidden, setHidden] = useState<Set<FileCompareStatus>>(new Set(["same"]));
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");

  const compare = async () => {
    if (!left.trim() || !right.trim()) {
      onError(new Error(t("dirSelectBoth")));
      return;
    }
    setBusy(true);
    try {
      const response = await api.compareDirectories(
        left.trim(),
        right.trim(),
        excludes.split(",").map((item) => item.trim()).filter(Boolean),
      );
      onResult(response.directory);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const open = async (rel: string) => {
    setSelected(rel);
    try {
      const response = await api.openDirectoryEntry(rel);
      props.onSession(response.session);
    } catch (error) {
      onError(error);
    }
  };

  const entries = useMemo(() => {
    if (!result) return [];
    const needle = filter.trim().toLowerCase();
    return result.entries.filter((entry) =>
      !hidden.has(entry.status) && (needle === "" || entry.rel.toLowerCase().includes(needle)));
  }, [result, filter, hidden]);

  const toggle = (status: FileCompareStatus) => {
    const next = new Set(hidden);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setHidden(next);
  };

  return (
    <div className="dir-layout">
      <div className="dir-form">
        <label className="dir-field">
          <span>{t("dirLeft")}</span>
          <span className="row">
            <input className="input" value={left} onChange={(event) => setLeft(event.target.value)} />
            <button
              type="button"
              className="btn icon"
              title={t("dirSelectLeft")}
              onClick={async () => {
                const picked = await props.pickDirectory(t("dirSelectLeft"));
                if (picked) setLeft(picked);
              }}
            >
              <Icon name="folder" />
            </button>
          </span>
        </label>
        <label className="dir-field">
          <span>{t("dirRight")}</span>
          <span className="row">
            <input className="input" value={right} onChange={(event) => setRight(event.target.value)} />
            <button
              type="button"
              className="btn icon"
              title={t("dirSelectRight")}
              onClick={async () => {
                const picked = await props.pickDirectory(t("dirSelectRight"));
                if (picked) setRight(picked);
              }}
            >
              <Icon name="folder" />
            </button>
          </span>
        </label>
        <label className="dir-field">
          <span>{t("dirExcludes")}</span>
          <input className="input" value={excludes} onChange={(event) => setExcludes(event.target.value)} />
        </label>
        <button type="button" className="btn primary" onClick={() => void compare()} disabled={busy}>
          <Icon name="dirCompare" /> {t("dirCompare")}
        </button>
      </div>

      <div className="dir-toolbar">
        <span className="dir-filter">
          <Icon name="search" />
          <input
            className="input"
            placeholder={t("dirFilter")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </span>
        {(["different", "leftOnly", "rightOnly", "same"] as FileCompareStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            className={`chip status-${status}${hidden.has(status) ? " is-off" : ""}`}
            onClick={() => toggle(status)}
          >
            {t(STATUS_KEYS[status])}
            {result && <em>{count(result, status)}</em>}
          </button>
        ))}
        {result && (
          <span className="dir-summary">
            {t("dirSummary", result.same, result.different, result.leftOnly, result.rightOnly)}
          </span>
        )}
      </div>

      <SplitPane direction="column" className="dir-split" storageKey="dir-main">
        <div className="dir-table-wrap">
          {!result && <p className="notice">{t("dirEmpty")}</p>}
          {result && entries.length === 0 && <p className="notice">{t("dirNoEntries")}</p>}
          {result && entries.length > 0 && (
            <table className="dir-table">
              <thead>
                <tr>
                  <th>{t("dirColumnPath")}</th>
                  <th className="narrow">{t("dirColumnStatus")}</th>
                  <th className="narrow num">{t("dirColumnLeft")}</th>
                  <th className="narrow num">{t("dirColumnRight")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.rel}
                    className={`status-${entry.status}${selected === entry.rel ? " is-active" : ""}`}
                    onDoubleClick={() => void open(entry.rel)}
                    onClick={() => setSelected(entry.rel)}
                    title={t("dirOpenHint")}
                  >
                    <td className="path">{entry.rel}</td>
                    <td className="narrow">{t(STATUS_KEYS[entry.status])}</td>
                    <td className="narrow num">{size(entry.leftSize)}</td>
                    <td className="narrow num">{size(entry.rightSize)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result?.truncated && <p className="notice warn">{t("dirTruncated")}</p>}
        </div>

        <div className="dir-diff">{props.children}</div>
      </SplitPane>
    </div>
  );
}

function count(result: DirectoryCompareResult, status: FileCompareStatus): number {
  switch (status) {
    case "same": return result.same;
    case "different": return result.different;
    case "leftOnly": return result.leftOnly;
    default: return result.rightOnly;
  }
}

function size(value: number | null): string {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
