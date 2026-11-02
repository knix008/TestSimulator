/**
 * The recent list, with the management the menu cannot offer: remove one entry, or
 * clear the lot. Ten entries is the cap, so the list always fits the window.
 */
import { useState } from "react";
import { recentKey, type RecentEntry } from "../../core/settings.js";
import { api } from "../api.js";
import type { DialogProps } from "../DialogHost.js";
import { Icon } from "../icons.js";
import { Button, Buttons } from "./parts.js";

const ICONS: Record<string, string> = {
  files: "compareFiles",
  directories: "folders",
  merge: "merge",
  conflict: "conflict",
  repository: "repository",
  session: "session",
};

export function RecentDialog({ settings, t, resolve, close }: DialogProps) {
  const [entries, setEntries] = useState<RecentEntry[]>(settings.recent ?? []);

  const remove = async (entry: RecentEntry) => {
    const saved = await api.removeRecent(recentKey(entry)).catch(() => null);
    setEntries(saved ? saved.recent : entries.filter((item) => item !== entry));
  };

  return (
    <>
      <ul className="recent-list">
        {entries.map((entry, index) => (
          <li key={`${entry.kind}-${index}`} className="recent-item">
            <button
              type="button"
              className="recent-open"
              data-recent={index}
              title={entry.paths.join("\n")}
              onClick={() => resolve({ kind: entry.kind, paths: entry.paths })}
            >
              <Icon name={ICONS[entry.kind] ?? "file"} size={15} />
              <span className="recent-label">{entry.paths.join("  ↔  ")}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              title={t("dlg.remove")}
              aria-label={t("dlg.remove")}
              data-remove={index}
              onClick={() => void remove(entry)}
            >
              <Icon name="trash" size={14} />
            </button>
          </li>
        ))}
        {entries.length === 0 ? <li className="empty-row">{t("settings.noRecent")}</li> : null}
      </ul>

      <Buttons>
        <Button
          icon="clearAll"
          name="clear"
          disabled={entries.length === 0}
          onClick={async () => {
            await api.clearRecent().catch(() => null);
            setEntries([]);
          }}
        >
          {t("dlg.clearAll")}
        </Button>
        <Button icon="close" name="close" primary onClick={close}>{t("dlg.close")}</Button>
      </Buttons>
    </>
  );
}
