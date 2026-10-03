import { useEffect, useState } from "react";
import { subscribeAppearance } from "../core/appearance";
import { applyTheme } from "../core/themes";
import { ApiError, api } from "./api";
import { MergeTool, SideBySideDiff, ToolStatus } from "./BuiltinTools";
import { translate, type Lang } from "./i18n";
import { FileTypeIcon } from "./icons";
import { readToolRequest, type ToolRequest } from "./toolLaunch";

export function ToolWindow() {
  const [request, setRequest] = useState<ToolRequest | null>(() => readToolRequest());
  const [lang, setLang] = useState<Lang>("ko");
  const [error, setError] = useState("");
  const [diff, setDiff] = useState<{ path: string; left: string; right: string; leftVersion: string; rightVersion: string } | null>(null);
  const [merge, setMerge] = useState<{ path: string; base: string; local: string; remote: string } | null>(null);
  const t = (key: string) => translate(lang, key);

  useEffect(() => {
    const sync = () => setRequest(readToolRequest());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    api.bootstrap().then((boot) => setLang(boot.settings.language)).catch(() => undefined);
    return subscribeAppearance((patch) => {
      if (patch.theme) applyTheme(patch.theme);
      if (patch.language === "ko" || patch.language === "en") setLang(patch.language);
    });
  }, []);

  useEffect(() => {
    if (!request) return;
    let stop = false;
    setError("");
    setDiff(null);
    setMerge(null);
    const title = request.kind === "diff" ? "Diff" : "Diff & Merge";
    document.title = `${title} — ${request.file}`;
    const pending = request.kind === "diff"
      ? api.diffSides(request.sha, request.file).then((sides) => { if (!stop) setDiff(sides); })
      : api.mergeSources(request.file).then((sources) => {
        if (!stop) setMerge({ path: sources.path, base: sources.base, local: sources.local, remote: sources.remote });
      });
    pending.catch((reason) => { if (!stop) setError(describe(reason)); });
    return () => { stop = true; };
  }, [request]);

  const file = request?.file ?? diff?.path ?? merge?.path ?? "";
  return (
    <div className="tool-window">
      <header className="tool-titlebar">
        <strong className="file-title" title={file}>
          {file && <FileTypeIcon path={file} />}
          <span>{file}</span>
        </strong>
        {window.mygit?.window && <ToolWindowControls t={t} />}
      </header>
      {error && (
        <div className="tool-error">
          <strong>{t("errorTitle")}</strong>
          <textarea readOnly value={error} onFocus={(event) => event.currentTarget.select()} />
        </div>
      )}
      {diff && <SideBySideDiff path={diff.path} left={diff.left} right={diff.right} leftVersion={diff.leftVersion} rightVersion={diff.rightVersion} lang={lang} t={t} />}
      {merge && (
        <MergeTool
          key={`${merge.path}\n${merge.base}\n${merge.local}\n${merge.remote}`}
          path={merge.path}
          base={merge.base}
          local={merge.local}
          remote={merge.remote}
          lang={lang}
          t={t}
          onSave={async (content) => {
            await api.saveMerge(merge.path, content);
            window.close();
          }}
          onError={(reason) => setError(describe(reason))}
        />
      )}
      {!diff && !merge && (
        <ToolStatus t={t} lang={lang} path={request?.file ?? ""} state={error ? "error" : "loading"} detail={error} />
      )}
    </div>
  );
}

function ToolWindowControls(props: { t: (key: string) => string }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const controls = window.mygit?.window;
    if (!controls) return;
    void controls.isMaximized().then(setMaximized);
    return controls.onMaximized(setMaximized);
  }, []);
  return (
    <div className="window-controls">
      <button type="button" aria-label={props.t("minimize")} title={props.t("minimize")} onClick={() => void window.mygit?.window?.minimize()}>
        <WindowGlyph kind="minimize" />
      </button>
      <button type="button" aria-label={maximized ? props.t("restore") : props.t("maximize")} title={maximized ? props.t("restore") : props.t("maximize")} onClick={() => void window.mygit?.window?.toggleMaximize().then(setMaximized)}>
        <WindowGlyph kind={maximized ? "restore" : "maximize"} />
      </button>
      <button type="button" className="close" aria-label={props.t("close")} title={props.t("close")} onClick={() => void window.mygit?.window?.close()}>
        <WindowGlyph kind="close" />
      </button>
    </div>
  );
}

function WindowGlyph(props: { kind: "minimize" | "maximize" | "restore" | "close" }) {
  if (props.kind === "minimize") return <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5.5h8" /></svg>;
  if (props.kind === "maximize") return <svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" /></svg>;
  if (props.kind === "restore") return <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2.5h4.5V7M2.5 4H7v4.5H2.5z" /></svg>;
  return <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8" /></svg>;
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.detail?.trim() || error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
