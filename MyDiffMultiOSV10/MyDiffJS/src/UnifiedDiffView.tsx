import { useEffect, useState } from "react";
import { api, type SessionSummary } from "./api";
import { Icon } from "./icons";
import type { Translate } from "./i18n";

type Props = {
  summary: SessionSummary | null;
  t: Translate;
  fontSize: number;
  copyText: (value: string) => void;
};

/** `git diff` output for the selected change, below the side-by-side panes. */
export function UnifiedDiffView({ summary, t, fontSize, copyText }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const isGit = summary?.origin.kind === "git";

  useEffect(() => {
    if (!isGit) {
      setText("");
      return;
    }
    let active = true;
    setLoading(true);
    api.unified()
      .then((response) => {
        if (active) setText(response.text);
      })
      .catch(() => {
        if (active) setText("");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isGit, summary?.id]);

  const lines = text ? text.split(/\r?\n/) : [];

  return (
    <section className="unified">
      <header className="unified-header">
        <span className="unified-title">
          <Icon name="text" /> {t("unifiedDiff")}
        </span>
        {summary && <span className="unified-origin">{summary.origin.detail}</span>}
        {text && (
          <button type="button" className="btn ghost small" onClick={() => copyText(text)}>
            {t("copy")}
          </button>
        )}
      </header>
      <div className="unified-body" style={{ fontSize }}>
        {loading && <p className="notice">{t("statusLoading")}</p>}
        {!loading && !isGit && <p className="notice">{t("tipUnified")}</p>}
        {!loading && isGit && lines.length === 0 && <p className="notice">{t("statusIdentical")}</p>}
        {!loading && lines.map((line, index) => (
          <div key={index} className={`u-line ${lineKind(line)}`}>{line || " "}</div>
        ))}
      </div>
    </section>
  );
}

function lineKind(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "u-file";
  if (line.startsWith("@@")) return "u-hunk";
  if (line.startsWith("+")) return "u-add";
  if (line.startsWith("-")) return "u-del";
  if (line.startsWith("diff ") || line.startsWith("index ")) return "u-meta";
  return "";
}
