/**
 * The path bar at the top of a pane.
 *
 * Each side of a comparison owns one: the folder or file it is showing can be typed,
 * pasted or browsed to from right there, without going back to a dialog. Pressing
 * Enter or leaving the box applies it; Escape puts the old value back.
 */
import { useEffect, useState } from "react";
import * as host from "./host.js";
import { api } from "./api.js";
import { Icon } from "./icons.js";
import { useApp } from "./state.js";

export function PathBar({
  side,
  value,
  kind,
  tint,
  onApply,
  children,
}: {
  side: "left" | "right";
  value: string;
  kind: "file" | "directory";
  /** The finished background and text colour for this pane's title bar. */
  tint?: { background: string; color: string };
  onApply: (next: string) => void;
  children?: React.ReactNode;
}) {
  const app = useApp();
  const { t } = app;
  const [draft, setDraft] = useState(value);

  // Where this pane has been, so Back can go there. One history per pane: the two
  // sides are navigated independently.
  const [history, setHistory] = useState<string[]>([]);

  // Follow the pane when it is changed from elsewhere (Swap, a reload, a drop).
  useEffect(() => {
    setDraft(value);
    setHistory((current) => (value && value !== current[current.length - 1]
      ? [...current, value].slice(-20)
      : current));
  }, [value]);

  const goHome = async () => {
    const places = await api.drives().catch(() => null);
    if (places?.home) onApply(places.home);
  };

  const apply = () => {
    const next = draft.trim();
    if (next && next !== value) onApply(next);
    else setDraft(value);
  };

  const browse = async () => {
    const picked = kind === "directory"
      ? await host.pickDirectory({ title: label(side, kind, t), defaultPath: value })
      : await host.pickFile({ title: label(side, kind, t), defaultPath: value });
    if (picked) {
      setDraft(picked);
      onApply(picked);
    }
  };

  return (
    <div className="path-bar" style={tint} data-side={side}>
      <Icon name={kind === "directory" ? "folder" : "file"} size={15} />
      <input
        className="path-input"
        data-path={side}
        value={draft}
        spellCheck={false}
        title={value}
        placeholder={label(side, kind, t)}
        aria-label={label(side, kind, t)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(value);
            event.currentTarget.blur();
          }
        }}
      />
      {/*
        * A folder pane gets the moves a folder pane needs: back to where it was,
        * up a level, and home. Each one re-points this side only, which is the
        * point of having them per pane rather than on the toolbar.
        */}
      {kind === "directory" ? (
        <>
          <button
            type="button"
            className="icon-button"
            data-path-back={side}
            title={t("path.back")}
            aria-label={t("path.back")}
            disabled={history.length < 2}
            onClick={() => {
              const previous = history[history.length - 2];
              if (previous) onApply(previous);
            }}
          >
            <Icon name="prev" size={14} />
          </button>
        <button
          type="button"
          className="icon-button"
          data-path-up={side}
          title={t("path.up")}
          aria-label={t("path.up")}
          disabled={!value}
          onClick={() => {
            const parent = value.replace(/[\\/]+$/, "").replace(/[\\/][^\\/]+$/, "");
            if (parent && parent !== value) onApply(parent);
          }}
        >
          <Icon name="up" size={14} />
        </button>
          <button
            type="button"
            className="icon-button"
            data-path-home={side}
            title={t("path.home")}
            aria-label={t("path.home")}
            onClick={() => void goHome()}
          >
            <Icon name="home" size={14} />
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="icon-button"
        data-path-browse={side}
        title={t("path.browse")}
        aria-label={t("path.browse")}
        onClick={() => void browse()}
      >
        <Icon name="open" size={14} />
      </button>
      {children}
    </div>
  );
}

function label(side: "left" | "right", kind: "file" | "directory", t: ReturnType<typeof useApp>["t"]): string {
  const which = side === "left" ? t("pane.left") : t("pane.right");
  return `${which} ${kind === "directory" ? t("path.folder") : t("path.file")}`;
}
