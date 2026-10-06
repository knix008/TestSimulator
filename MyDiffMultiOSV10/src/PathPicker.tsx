import { useEffect, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import type { Translate } from "./i18n";

type Props = {
  t: Translate;
  title: string;
  mode: "file" | "directory";
  start?: string;
  onPick: (target: string | null) => void;
};

/**
 * Server-side file browser for the web build, where the browser cannot hand the server a
 * real path. The Electron build uses the native dialogs instead.
 */
export function PathPicker({ t, title, mode, start, onPick }: Props) {
  const [path, setPath] = useState(start ?? "");
  const [draft, setDraft] = useState(start ?? "");
  const [entries, setEntries] = useState<{ name: string; path: string; directory: boolean }[]>([]);
  const [parent, setParent] = useState<string | null>(null);
  const [drives, setDrives] = useState<{ label: string; path: string }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.drives().then((response) => {
      setDrives(response.drives);
      if (!path) {
        setPath(response.home);
        setDraft(response.home);
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!path) return;
    api.listDir(path)
      .then((response) => {
        setEntries(response.entries);
        setParent(response.parent);
        setDraft(response.path);
        setError("");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [path]);

  return (
    <div className="modal-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onPick(null);
    }}>
      <div className="modal picker" role="dialog" aria-label={title}>
        <header className="modal-header">{title}</header>
        <div className="picker-bar">
          <button type="button" className="btn icon" title={t("pickUp")} disabled={!parent} onClick={() => parent && setPath(parent)}>
            <Icon name="up" />
          </button>
          <input
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setPath(draft);
            }}
          />
          <button type="button" className="btn" onClick={() => setPath(draft)}>{t("pickPath")}</button>
        </div>
        {drives.length > 0 && (
          <div className="picker-drives">
            {drives.map((drive) => (
              <button key={drive.path} type="button" className="chip" onClick={() => setPath(drive.path)}>
                {drive.label}
              </button>
            ))}
          </div>
        )}
        <div className="picker-list">
          {error && <p className="notice warn">{error}</p>}
          {!error && entries.length === 0 && <p className="notice">{t("pickNoEntries")}</p>}
          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className={`picker-item${entry.directory ? " is-dir" : ""}`}
              onDoubleClick={() => {
                if (entry.directory) setPath(entry.path);
                else if (mode === "file") onPick(entry.path);
              }}
              onClick={() => setDraft(entry.path)}
            >
              <Icon name={entry.directory ? "folder" : "file"} />
              {entry.name}
            </button>
          ))}
        </div>
        <footer className="modal-footer">
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => onPick(null)}>{t("cancel")}</button>
          <button type="button" className="btn primary" onClick={() => onPick(draft || path)}>{t("pickSelect")}</button>
        </footer>
      </div>
    </div>
  );
}
