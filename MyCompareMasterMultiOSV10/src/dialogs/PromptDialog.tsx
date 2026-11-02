/**
 * The web build's file picker.
 *
 * A browser cannot show a native Open dialog that returns a path, and the server is
 * the one with the file system, so the dialog browses it over the API: drives at the
 * top, a folder listing underneath, and the chosen path in an editable box so a path
 * can also simply be typed or pasted.
 *
 * `mode` is `file`, `directory` or `save`.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import type { BrowseResult } from "../../core/fsBrowse.js";
import type { DialogProps } from "../DialogHost.js";
import { Icon } from "../icons.js";
import { Button, Buttons } from "./parts.js";

type PromptPayload = { mode?: "file" | "directory" | "save"; title?: string; defaultPath?: string };

export function PromptDialog({ settings, payload, t, resolve, close }: DialogProps) {
  const options = (payload ?? {}) as PromptPayload;
  const mode = options.mode ?? "file";
  const [listing, setListing] = useState<BrowseResult | null>(null);
  const [drives, setDrives] = useState<{ label: string; path: string }[]>([]);
  const [value, setValue] = useState(options.defaultPath ?? "");
  const [error, setError] = useState("");

  const load = useCallback((target: string) => {
    api.browse(target)
      .then((result) => {
        setListing(result);
        setError("");
        if (mode === "directory") setValue(result.path);
      })
      .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
  }, [mode]);

  useEffect(() => {
    api.drives()
      .then((result) => {
        setDrives(result.drives);
        const start = options.defaultPath
          ? options.defaultPath.replace(/[\\/][^\\/]*$/, "")
          : settings.recentDirectories?.[0] || result.home;
        load(start);
      })
      .catch((failure) => setError(String(failure)));
    // Only on first mount: afterwards the user drives the listing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = () => {
    if (!value.trim()) return;
    resolve(value.trim());
  };

  return (
    <>
      <div className="picker-places">
        {drives.map((drive) => (
          <button key={drive.path} type="button" className="place" title={drive.path} onClick={() => load(drive.path)}>
            <Icon name="monitor" size={14} />
            <span>{drive.label}</span>
          </button>
        ))}
        {(settings.recentDirectories ?? []).slice(0, 4).map((directory) => (
          <button key={directory} type="button" className="place" title={directory} onClick={() => load(directory)}>
            <Icon name="clock" size={14} />
            <span>{directory.split(/[\\/]/).filter(Boolean).pop()}</span>
          </button>
        ))}
      </div>

      <div className="picker-path">
        <button
          type="button"
          className="icon-button"
          title={t("cmd.nav.prevDiff")}
          disabled={!listing?.parent}
          onClick={() => listing?.parent && load(listing.parent)}
        >
          <Icon name="up" size={15} />
        </button>
        <span className="path" title={listing?.path}>{listing?.path ?? "..."}</span>
      </div>

      <div className="picker-list" role="listbox">
        {(listing?.entries ?? []).map((entry) => (
          <button
            key={entry.path}
            type="button"
            role="option"
            aria-selected={value === entry.path}
            className={`picker-row${entry.directory ? " directory" : ""}${value === entry.path ? " selected" : ""}`}
            data-entry={entry.name}
            onClick={() => {
              if (entry.directory && mode === "directory") setValue(entry.path);
              else if (!entry.directory) setValue(entry.path);
            }}
            onDoubleClick={() => {
              if (entry.directory) load(entry.path);
              else resolve(entry.path);
            }}
          >
            <Icon name={entry.directory ? "folder" : "file"} size={14} />
            <span className="picker-name">{entry.name}</span>
          </button>
        ))}
        {listing && listing.entries.length === 0 ? <div className="empty-row">{t("settings.noRecent")}</div> : null}
      </div>

      <label className="field">
        <span className="field-label">{t("label.path")}</span>
        <span className="field-control">
          <input
            className="text-input"
            data-field="path"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") choose();
            }}
          />
        </span>
      </label>

      {error ? <p className="field-error">{error}</p> : null}

      <Buttons>
        <Button icon="close" name="cancel" onClick={close}>{t("dlg.cancel")}</Button>
        <Button icon="check" name="ok" primary disabled={!value.trim()} onClick={choose}>{t("dlg.ok")}</Button>
      </Buttons>
    </>
  );
}
