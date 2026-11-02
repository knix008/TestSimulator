/**
 * Find, replace, go to line, and bookmarks — the row above a comparison.
 *
 * Searching is done by the server over the whole file rather than in the renderer
 * over the few hundred rows that happen to be loaded: a search that silently stopped
 * at the edge of what you had scrolled past would be worse than no search. What
 * comes back is a list of row numbers, which is all the bar needs to say "3 / 47"
 * and to step through them.
 *
 * Replace is only offered when the comparison is editable, and it says how many it
 * changed rather than leaving you to look.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SearchFlags } from "./api.js";
import { Icon } from "./icons.js";
import { useApp } from "./state.js";

export type FindState = {
  query: string;
  matches: number[];
  at: number;
};

export function FindBar({
  compareId,
  rowCount,
  editable,
  bookmarks,
  onMatches,
  onGo,
  onToggleBookmark,
  onNextBookmark,
  onReplaced,
}: {
  compareId: string;
  rowCount: number;
  editable: boolean;
  bookmarks: number[];
  /** The rows that matched, so the view can highlight them. */
  onMatches: (rows: number[]) => void;
  onGo: (row: number) => void;
  onToggleBookmark: () => void;
  onNextBookmark: () => void;
  onReplaced: () => void;
}) {
  const app = useApp();
  const { t } = app;
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [flags, setFlags] = useState<SearchFlags>({});
  const [matches, setMatches] = useState<number[]>([]);
  const [at, setAt] = useState(0);
  const [showReplace, setShowReplace] = useState(false);
  const [line, setLine] = useState("");
  const findRef = useRef<HTMLInputElement>(null);
  const lineRef = useRef<HTMLInputElement>(null);

  // A fresh comparison starts with nothing found; leaving the old matches up would
  // point at rows that are not there any more.
  useEffect(() => {
    setMatches([]);
    setAt(0);
    onMatches([]);
  }, [compareId, onMatches]);

  const run = useCallback(async (next: string, options: SearchFlags) => {
    if (!next) {
      setMatches([]);
      setAt(0);
      onMatches([]);
      return;
    }
    const rows = await api.searchCompare(compareId, next, options).catch(() => []);
    setMatches(rows);
    setAt(0);
    onMatches(rows);
    if (rows.length > 0) onGo(rows[0]);
  }, [compareId, onGo, onMatches]);

  // Searching as you type, but not on every keystroke: a long file searched six
  // times while a word is typed is six searches thrown away.
  useEffect(() => {
    const timer = setTimeout(() => void run(query, flags), 180);
    return () => clearTimeout(timer);
  }, [flags, query, run]);

  const step = (direction: 1 | -1) => {
    if (matches.length === 0) return;
    const next = (at + direction + matches.length) % matches.length;
    setAt(next);
    onGo(matches[next]);
  };

  const goToLine = () => {
    const wanted = Number(line);
    if (!Number.isFinite(wanted) || wanted < 1) return;
    onGo(Math.min(rowCount - 1, Math.round(wanted) - 1));
  };

  const replaceAll = async (side: "left" | "right") => {
    if (!query) return;
    const outcome = await api.replaceAll(compareId, side, query, replacement, flags).catch(() => null);
    if (!outcome) return;
    app.setStatus((t) => t("find.replaced", outcome.replaced));
    onReplaced();
    void run(query, flags);
  };

  // Ctrl+F puts the cursor in the box, Ctrl+H opens Replace, Ctrl+G goes to a line —
  // the shortcuts people already have in their fingers.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        findRef.current?.focus();
        findRef.current?.select();
      } else if (key === "h" && editable) {
        event.preventDefault();
        setShowReplace(true);
        findRef.current?.focus();
      } else if (key === "g") {
        event.preventDefault();
        lineRef.current?.focus();
        lineRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable]);

  const toggle = (name: keyof SearchFlags, label: string, icon: string) => (
    <button
      type="button"
      className={`chip icon-only${flags[name] ? " checked" : ""}`}
      data-find-flag={name}
      title={label}
      aria-label={label}
      aria-pressed={Boolean(flags[name])}
      onClick={() => setFlags((current) => ({ ...current, [name]: !current[name] }))}
    >
      <Icon name={icon} size={13} />
    </button>
  );

  return (
    <div className="pane-find-row">
      <span className="pane-find">
        <Icon name="find" size={14} />
        <input
          ref={findRef}
          className="find-input"
          type="search"
          data-field="find"
          value={query}
          placeholder={t("cmd.edit.find")}
          aria-label={t("cmd.edit.find")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              step(event.shiftKey ? -1 : 1);
            }
          }}
        />
      </span>

      {toggle("caseSensitive", t("find.case"), "letterCase")}
      {toggle("wholeWord", t("find.word"), "whitespace")}
      {toggle("regex", t("find.regex"), "hash")}

      <span className="find-count" data-testid="find-count">
        {query ? (matches.length > 0 ? t("find.at", at + 1, matches.length) : t("find.none")) : ""}
      </span>

      <button type="button" className="chip icon-only" data-find="prev" title={t("find.prev")}
        disabled={matches.length === 0} onClick={() => step(-1)}>
        <Icon name="up" size={13} />
      </button>
      <button type="button" className="chip icon-only" data-find="next" title={t("find.next")}
        disabled={matches.length === 0} onClick={() => step(1)}>
        <Icon name="down" size={13} />
      </button>

      {editable ? (
        <button
          type="button"
          className={`chip icon-only${showReplace ? " checked" : ""}`}
          data-find="toggleReplace"
          title={t("find.replace")}
          onClick={() => setShowReplace((current) => !current)}
        >
          <Icon name="edit" size={13} />
        </button>
      ) : null}

      {editable && showReplace ? (
        <>
          <input
            className="find-input"
            data-field="replace"
            value={replacement}
            placeholder={t("find.replace")}
            aria-label={t("find.replace")}
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button type="button" className="chip" data-find="replaceLeft" title={t("find.replaceLeft")}
            disabled={matches.length === 0} onClick={() => void replaceAll("left")}>
            <Icon name="leftOnly" size={13} />
            <span>{t("pane.left")}</span>
          </button>
          <button type="button" className="chip" data-find="replaceRight" title={t("find.replaceRight")}
            disabled={matches.length === 0} onClick={() => void replaceAll("right")}>
            <Icon name="rightOnly" size={13} />
            <span>{t("pane.right")}</span>
          </button>
        </>
      ) : null}

      <span className="tree-divider" />

      <span className="pane-find" title={t("find.goToLine")}>
        <Icon name="hash" size={13} />
        <input
          ref={lineRef}
          className="find-input line-input"
          data-field="goToLine"
          value={line}
          inputMode="numeric"
          placeholder={t("find.line")}
          aria-label={t("find.goToLine")}
          onChange={(event) => setLine(event.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              goToLine();
            }
          }}
        />
      </span>

      <button type="button" className="chip icon-only" data-find="bookmark" title={t("find.bookmark")}
        onClick={onToggleBookmark}>
        <Icon name="bookmark" size={13} />
      </button>
      <button type="button" className="chip" data-find="nextBookmark" title={t("find.nextBookmark")}
        disabled={bookmarks.length === 0} onClick={onNextBookmark}>
        <Icon name="next" size={13} />
        <span>{bookmarks.length}</span>
      </button>

      <span className="tree-spacer" />
    </div>
  );
}
