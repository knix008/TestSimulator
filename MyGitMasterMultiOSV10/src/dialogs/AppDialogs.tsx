/**
 * The app's dialogs — open, clone, browse, auth, commit, categories, preferences,
 * confirm, prompt, text, report, about, error, export — as popup dialogs: on the
 * desktop each is its own OS window (title bar with icon and title, movable anywhere,
 * even off the main window); in the browser the same component is the in-page modal.
 *
 * App keeps describing a dialog as a `DialogState` and still awaits answers the way it
 * always did (src/App.tsx `useDialogWindow`): the state is the payload, the dialog edits
 * its own copy, and answers with an `AppDialogResult`:
 *
 *   submit      the edited form (open, clone, browse, commit, categories, export)
 *   value       auth → credentials, confirm → true, prompt → the text
 *   categories  "Manage categories" pressed in the commit dialog
 *
 * Preferences, report and text dialogs need nothing back: preferences save every change
 * at once (and publish it, so the main window follows), the report / status dialogs
 * export and print by themselves.
 */
import { useEffect, useState } from "react";
import { BUILTIN_MERGE_TOOL, isBuiltinMergeTool } from "../../core/mergeTool";
import type { Report, ReportFormat } from "../../core/report";
import packageJson from "../../package.json";
import { api, type Settings } from "../api";
import appIcon from "../appIcon";
import { buildStatusReport, downloadReport } from "../exportReport";
import * as host from "../host";
import { Icon, type IconName } from "../icons";
import type { DialogComponentProps } from "../popupRegistry";
import { PromptSettings } from "../settings/PromptSettings";
import { StartSettings } from "../settings/StartSettings";
import type { PrefsTab } from "../settings/types";
import { type AppDialogResult, type DialogPayload } from "./appDialogTypes";
import { ThemePicker } from "../ThemePicker";

const DIFF_ARGS = "\"{left}\" \"{right}\"";
const MERGE_ARGS = "\"{base}\" \"{local}\" \"{remote}\" \"{merged}\"";

export function AppDialog({ payload, settings, lang, t, onPrefs, resolve, close }: DialogComponentProps) {
  const [dialog, setDialog] = useState<DialogPayload>(payload as DialogPayload);
  const [copied, setCopied] = useState(false);
  const [shells, setShells] = useState<{ id: string; label: string; command: string }[]>([]);
  const [preferredShell, setPreferredShell] = useState("");
  const [diffTools, setDiffTools] = useState<{ id: string; label: string; args: string; mergeArgs: string }[]>([]);
  const [prefsTab, setPrefsTab] = useState<PrefsTab>(dialog.type === "prefs" ? dialog.tab ?? "general" : "general");

  useEffect(() => {
    if (dialog.type !== "prefs") return;
    let stop = false;
    api.shells().then((result) => {
      if (stop) return;
      setShells(result.shells);
      setPreferredShell(result.selected);
      setDialog((current) => {
        if (current.type !== "prefs") return current;
        if (current.shell && result.shells.some((shell) => shell.id === current.shell)) return current;
        return { ...current, shell: result.selected };
      });
    }).catch(() => undefined);
    api.diffTools().then((result) => {
      if (!stop) setDiffTools(result.tools);
    }).catch(() => undefined);
    return () => { stop = true; };
    // Loaded once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (dialog.type === "auth") resolve({ kind: "value", value: { username: dialog.username, password: dialog.password, remember: dialog.remember } } satisfies AppDialogResult);
    else if (dialog.type === "confirm") resolve({ kind: "value", value: true } satisfies AppDialogResult);
    else if (dialog.type === "prompt") resolve({ kind: "value", value: dialog.value.trim() || null } satisfies AppDialogResult);
    else if (dialog.type === "prefs") close();
    else if (dialog.type === "open" || dialog.type === "clone" || dialog.type === "browse" || dialog.type === "commit" || dialog.type === "categories" || dialog.type === "export") {
      resolve({ kind: "submit", dialog } satisfies AppDialogResult);
    }
  };

  const copyDetail = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.querySelector<HTMLTextAreaElement>(".error-detail");
      area?.focus();
      area?.select();
      document.execCommand("copy");
    }
    setCopied(true);
  };

  /** Report and status dialogs export by themselves; Print opens the print preview window. */
  const exportReport = async (kind: ReportFormat | "print") => {
    try {
      const report = dialog.type === "report"
        ? dialog.report
        : dialog.type === "text" && dialog.save
          ? buildStatusReport({ t, summary: await api.summary(), text: dialog.text })
          : null;
      if (!report) return;
      if (kind === "print") {
        void host.openDialog("print", { report });
        close();
        return;
      }
      await downloadReport(report, kind);
    } catch (error) {
      void host.openDialog("error", { type: "error", message: t("errorTitle"), detail: error instanceof Error ? error.message : String(error) });
    }
  };

  const restore = async () => {
    const saved = await api.resetSettings();
    host.publishSettings(saved);
    setDialog((current) => current.type === "prefs" ? {
      ...current,
      language: saved.language,
      theme: saved.theme,
      tool: saved.externalDiffToolPath,
      args: saved.externalDiffToolArguments || DIFF_ARGS,
      mergeTool: saved.externalMergeToolPath,
      mergeArgs: saved.externalMergeToolArguments || MERGE_ARGS,
      shell: saved.terminalShell || preferredShell,
    } : current);
  };

  const browseTool = async (kind: "diff" | "merge") => {
    if (dialog.type !== "prefs") return;
    const current = kind === "diff" ? dialog.tool : dialog.mergeTool;
    // The picker opens in the current tool's folder, or else where programs are installed.
    const picked = window.mgm?.pickFile ? await window.mgm.pickFile(isBuiltinMergeTool(current) ? "" : current) : window.prompt(t(kind === "diff" ? "diffTool" : "mergeTool"), current);
    if (!picked) return;
    const known = diffTools.find((item) => sameToolPath(item.id, picked));
    if (kind === "diff") {
      const args = known?.args || (dialog.args.includes("{left}") ? dialog.args : DIFF_ARGS);
      setDialog((next) => next.type === "prefs" ? { ...next, tool: picked, args } : next);
      onPrefs({ externalDiffToolPath: picked, externalDiffToolArguments: args });
      return;
    }
    const mergeArgs = known?.mergeArgs || (dialog.mergeArgs.includes("{merged}") ? dialog.mergeArgs : MERGE_ARGS);
    setDialog((next) => next.type === "prefs" ? { ...next, mergeTool: picked, mergeArgs } : next);
    onPrefs({ externalMergeToolPath: picked, externalMergeToolArguments: mergeArgs });
  };

  const kindClass = dialog.type === "prefs" ? "dialog prefs" : dialog.type === "error" ? "dialog wide" : dialog.type === "report" ? "dialog report" : dialog.type === "about" ? "dialog about" : "dialog";
  const urls = settings.recentCloneUrls ?? [];

  return (
    <form className={`${kindClass} in-popup`} data-dialog-type={dialog.type} onSubmit={(event) => { event.preventDefault(); if (dialog.type !== "error") submit(); }}>
      <div className="body">
        {dialog.type === "open" && <Field label={t("path")} value={dialog.path} autoFocus onChange={(path) => setDialog({ ...dialog, path })} />}
        {(dialog.type === "clone" || dialog.type === "browse") && (
          <>
            <Field label={t("url")} value={dialog.url} autoFocus onChange={(url) => setDialog({ ...dialog, url })} list={urls} />
            {dialog.type === "clone" && (
              <Field label={t("destination")} value={dialog.destination} onChange={(destination) => setDialog({ ...dialog, destination })} />
            )}
            <Field label={t("username")} value={dialog.username} onChange={(username) => setDialog({ ...dialog, username })} />
            <Field label={t("password")} value={dialog.password} password onChange={(password) => setDialog({ ...dialog, password })} />
          </>
        )}
        {dialog.type === "auth" && (
          <>
            <Field label={t("username")} value={dialog.username} autoFocus onChange={(username) => setDialog({ ...dialog, username })} />
            <Field label={t("password")} value={dialog.password} password onChange={(password) => setDialog({ ...dialog, password })} />
            <label><span /><input type="checkbox" checked={dialog.remember} onChange={(event) => setDialog({ ...dialog, remember: event.target.checked })} /> {t("remember")}</label>
          </>
        )}
        {dialog.type === "commit" && (
          <>
            <label>{t("category")}
              <select value={dialog.category} onChange={(event) => setDialog({ ...dialog, category: event.target.value })}>
                {settings.commitCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <Field label={t("subject")} value={dialog.subject} autoFocus onChange={(subject) => setDialog({ ...dialog, subject })} />
            <label>{t("body")}<textarea value={dialog.body} onChange={(event) => setDialog({ ...dialog, body: event.target.value })} /></label>
            <button type="button" onClick={() => resolve({ kind: "categories" } satisfies AppDialogResult)}><Icon name="list" />{t("manageCategories")}</button>
          </>
        )}
        {dialog.type === "categories" && (
          <label>{t("category")}<textarea value={dialog.text} autoFocus onChange={(event) => setDialog({ ...dialog, text: event.target.value })} /></label>
        )}
        {dialog.type === "prefs" && (
          <>
            <div className="prefs-tabs">
              <PrefsTabButton tab="general" current={prefsTab} icon="prefs" label={t("prefsGeneral")} onSelect={setPrefsTab} />
              <PrefsTabButton tab="theme" current={prefsTab} icon="theme" label={t("theme")} onSelect={setPrefsTab} />
              <PrefsTabButton tab="start" current={prefsTab} icon="home" label={t("prefsStart")} onSelect={setPrefsTab} />
              <PrefsTabButton tab="prompt" current={prefsTab} icon="terminal" label={t("prefsPrompt")} onSelect={setPrefsTab} />
              <PrefsTabButton tab="promptEdit" current={prefsTab} icon="edit" label={t("prefsPromptEdit")} onSelect={setPrefsTab} />
              <PrefsTabButton tab="tools" current={prefsTab} icon="snapshot" label={t("prefsTools")} onSelect={setPrefsTab} />
            </div>
            <div className={`prefs-page ${prefsTab}`}>
              {prefsTab === "general" && (
                <>
                  <label>{t("language")}
                    <select value={dialog.language} onChange={(event) => {
                      const language = event.target.value === "en" ? "en" : "ko";
                      setDialog({ ...dialog, language });
                      onPrefs({ language });
                    }}>
                      <option value="ko">한국어</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                  <label>{t("terminalShell")}
                    <select value={dialog.shell} onChange={(event) => {
                      const shell = event.target.value;
                      setDialog({ ...dialog, shell });
                      onPrefs({ terminalShell: shell });
                    }}>
                      {shells.map((shell) => <option key={shell.id} value={shell.id}>{shell.label}</option>)}
                    </select>
                  </label>
                  <label className="check-line">
                    <input type="checkbox" checked={settings.showTutorial !== false} onChange={(event) => onPrefs({ showTutorial: event.target.checked })} />
                    {t("showTutorialAtStart")}
                  </label>
                </>
              )}
              {prefsTab === "start" && <StartSettings settings={settings} lang={lang} t={t} onPrefs={onPrefs} />}
              {(prefsTab === "prompt" || prefsTab === "promptEdit") && (
                <PromptSettings pane={prefsTab === "prompt" ? "prompt" : "edit"} settings={settings} lang={lang} t={t} onPrefs={onPrefs} />
              )}
              {prefsTab === "theme" && (
                <ThemePicker
                  settings={settings}
                  lang={lang}
                  t={t}
                  onChange={(theme) => {
                    setDialog({ ...dialog, theme });
                    onPrefs({ theme });
                  }}
                  onPrefs={onPrefs}
                />
              )}
              {prefsTab === "tools" && (
                <>
                  <div className="tool-block">
                    <div className="tool-line">
                      <span>{t("diffTool")}</span>
                      <span className="tool-pick">
                        <select value={selectedDiffTool(diffTools, dialog.tool)} onChange={(event) => {
                          const tool = event.target.value;
                          const known = diffTools.find((item) => sameToolPath(item.id, tool));
                          const args = known?.args || dialog.args;
                          setDialog({ ...dialog, tool, args });
                          onPrefs({ externalDiffToolPath: tool, externalDiffToolArguments: args });
                        }}>
                          <option value="">{t("empty")}</option>
                          {diffToolOptions(diffTools, dialog.tool, dialog.args).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                        <button type="button" onClick={() => void browseTool("diff")}><Icon name="open" />{t("diffBrowse")}</button>
                      </span>
                    </div>
                    <div className="tool-line">
                      <span>{t("path")}</span>
                      <input value={dialog.tool} onChange={(event) => { const tool = event.target.value; setDialog({ ...dialog, tool }); onPrefs({ externalDiffToolPath: tool }); }} />
                    </div>
                    <div className="tool-line">
                      <span title={t("diffArgs")}>{t("toolArgs")}</span>
                      <input value={dialog.args} title={t("diffArgs")} onChange={(event) => { const args = event.target.value; setDialog({ ...dialog, args }); onPrefs({ externalDiffToolArguments: args }); }} />
                    </div>
                  </div>
                  <div className="tool-block">
                    <div className="tool-line">
                      <span title={t("mergeTool")}>{t("mergeTool")}</span>
                      <span className="tool-pick">
                        <select value={selectedMergeTool(diffTools, dialog.mergeTool)} onChange={(event) => {
                          const mergeTool = event.target.value;
                          if (isBuiltinMergeTool(mergeTool)) {
                            setDialog({ ...dialog, mergeTool: BUILTIN_MERGE_TOOL });
                            onPrefs({ externalMergeToolPath: BUILTIN_MERGE_TOOL });
                            return;
                          }
                          const known = diffTools.find((item) => sameToolPath(item.id, mergeTool));
                          const mergeArgs = known?.mergeArgs || dialog.mergeArgs;
                          setDialog({ ...dialog, mergeTool, mergeArgs });
                          onPrefs({ externalMergeToolPath: mergeTool, externalMergeToolArguments: mergeArgs });
                        }}>
                          {mergeToolOptions(diffTools, dialog.mergeTool, t("builtinMergeTool")).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                        <button type="button" onClick={() => void browseTool("merge")}><Icon name="open" />{t("diffBrowse")}</button>
                      </span>
                    </div>
                    <div className="tool-line">
                      <span>{t("path")}</span>
                      <input
                        value={isBuiltinMergeTool(dialog.mergeTool) ? "" : dialog.mergeTool}
                        disabled={isBuiltinMergeTool(dialog.mergeTool)}
                        placeholder={isBuiltinMergeTool(dialog.mergeTool) ? t("builtinMergeTool") : ""}
                        onChange={(event) => { const mergeTool = event.target.value; setDialog({ ...dialog, mergeTool }); onPrefs({ externalMergeToolPath: mergeTool }); }}
                      />
                    </div>
                    <div className="tool-line">
                      <span title={t("mergeArgs")}>{t("toolArgs")}</span>
                      <input value={dialog.mergeArgs} title={t("mergeArgs")} disabled={isBuiltinMergeTool(dialog.mergeTool)} onChange={(event) => { const mergeArgs = event.target.value; setDialog({ ...dialog, mergeArgs }); onPrefs({ externalMergeToolArguments: mergeArgs }); }} />
                    </div>
                    <div className="tool-hint">{t("mergeToolHint")}</div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
        {dialog.type === "confirm" && <pre className="detail">{dialog.message}</pre>}
        {dialog.type === "prompt" && <Field label={dialog.label} value={dialog.value} autoFocus onChange={(value) => setDialog({ ...dialog, value })} />}
        {dialog.type === "text" && <pre className="detail">{dialog.text}</pre>}
        {dialog.type === "report" && <ReportPreview report={dialog.report} more={t("reportListed")} />}
        {dialog.type === "about" && (
          <div className="about-body">
            <img className="about-icon" src={appIcon} alt="" />
            <div className="about-copy">
              <p className="about-name"><strong>My Git Master</strong><span>{packageJson.version}</span></p>
              <p>{t("aboutText")}</p>
            </div>
            <dl className="about-meta">
              <dt>{t("appVersion")}</dt>
              <dd>{packageJson.version}</dd>
              <dt>{t("buildInfo")}</dt>
              <dd>{formatBuild(__MGM_BUILD__)}</dd>
              <dt>{t("platform")}</dt>
              <dd>{platformName()}</dd>
              <dt>{t("creator")}</dt>
              <dd className="about-author">{t("authorName")}</dd>
            </dl>
          </div>
        )}
        {dialog.type === "error" && (
          <>
            {dialog.message && dialog.message !== dialog.detail ? <p className="error-message">{dialog.message}</p> : null}
            <textarea className="error-detail" readOnly rows={Math.min(14, Math.max(3, dialog.detail.split("\n").length + 1))} value={dialog.detail} onFocus={(event) => event.currentTarget.select()} />
          </>
        )}
        {dialog.type === "export" && <Field label={t("destination")} value={dialog.path} autoFocus onChange={(path) => setDialog({ ...dialog, path })} />}
      </div>
      <footer>
        {dialog.type === "prefs" && (
          <button type="button" className="restore" onClick={() => void restore()}>
            <Icon name="undo" />
            {t("restoreDefaults")}
          </button>
        )}
        {dialog.type !== "error" && dialog.type !== "text" && dialog.type !== "about" && dialog.type !== "report" && dialog.type !== "prefs" && (
          <button type="button" onClick={close}>{t("cancel")}</button>
        )}
        {(dialog.type === "report" || (dialog.type === "text" && dialog.save)) && <ReportActions t={t} onExport={(kind) => void exportReport(kind)} />}
        {(dialog.type === "auth" || dialog.type === "confirm" || dialog.type === "prompt" || dialog.type === "open" || dialog.type === "clone" || dialog.type === "browse" || dialog.type === "commit" || dialog.type === "categories" || dialog.type === "export" || dialog.type === "prefs") && (
          <button className="primary" type="submit">{t("ok")}</button>
        )}
        {(dialog.type === "error" || dialog.type === "text" || dialog.type === "about" || dialog.type === "report") && (
          <>
            {dialog.type === "error" && (
              <button type="button" onClick={() => void copyDetail(dialog.detail)}>
                <Icon name="copy" />
                {copied ? t("copied") : t("copy")}
              </button>
            )}
            <button className="primary" type="button" onClick={close}>{t("close")}</button>
          </>
        )}
      </footer>
    </form>
  );
}

function PrefsTabButton({ tab, current, icon, label, onSelect }: { tab: PrefsTab; current: PrefsTab; icon: IconName; label: string; onSelect: (tab: PrefsTab) => void }) {
  return (
    <button type="button" className={current === tab ? "active" : ""} aria-pressed={current === tab} onClick={() => onSelect(tab)}>
      <Icon name={icon} />{label}
    </button>
  );
}

function Field(props: { label: string; value: string; password?: boolean; list?: string[]; autoFocus?: boolean; onChange: (value: string) => void }) {
  return (
    <label>
      {props.label}
      <input type={props.password ? "password" : "text"} value={props.value} autoFocus={props.autoFocus} list={props.list ? "recent-urls" : undefined} onChange={(event) => props.onChange(event.target.value)} />
      {props.list && (
        <datalist id="recent-urls">
          {props.list.map((url) => <option key={url} value={url} />)}
        </datalist>
      )}
    </label>
  );
}

function ReportPreview({ report, more }: { report: Report; more: string }) {
  return (
    <div className="report-preview">
      <p className="meta">{report.generatedAt}</p>
      <table className="report-table">
        <tbody>
          {report.summary.map((row) => (
            <tr key={row.label}><th>{row.label}</th><td>{row.value}</td></tr>
          ))}
        </tbody>
      </table>
      {report.tables.map((table) => (
        <section key={table.title}>
          <h3>{table.title}</h3>
          <table className="report-table">
            <thead><tr>{table.headers.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead>
            <tbody>
              {table.rows.slice(0, 8).map((row, index) => (
                <tr key={index}>{table.headers.map((_, column) => <td key={column}>{row[column] ?? ""}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {table.rows.length > 8 && <p className="meta">{more}: {table.rows.length}</p>}
        </section>
      ))}
      {report.text && (
        <section>
          <h3>{report.text.title}</h3>
          <pre className="detail">{report.text.body}</pre>
        </section>
      )}
    </div>
  );
}

function ReportActions(props: { t: (key: string) => string; onExport: (kind: ReportFormat | "print") => void }) {
  const items: { kind: ReportFormat | "print"; label: string; icon: IconName }[] = [
    { kind: "print", label: props.t("print"), icon: "print" },
    { kind: "md", label: props.t("saveMarkdown"), icon: "export" },
    { kind: "docx", label: props.t("saveWord"), icon: "export" },
    { kind: "xlsx", label: props.t("saveExcel"), icon: "export" },
    { kind: "csv", label: props.t("saveCsv"), icon: "export" },
    { kind: "pdf", label: props.t("savePdf"), icon: "export" },
  ];
  return (
    <>
      {items.map((item) => (
        <button key={item.kind} type="button" onClick={() => props.onExport(item.kind)}>
          <Icon name={item.icon} />
          {item.label}
        </button>
      ))}
    </>
  );
}

function sameToolPath(left: string, right: string): boolean {
  if (!left || !right) return false;
  return /[\\]/.test(left) || /[\\]/.test(right) ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function diffToolOptions(tools: { id: string; label: string; args: string }[], current: string, args: string) {
  if (!current || tools.some((item) => sameToolPath(item.id, current))) return tools;
  const name = current.split(/[/\\]/).pop() || current;
  return [...tools, { id: current, label: name, args }];
}

function selectedDiffTool(tools: { id: string; label: string; args: string }[], current: string): string {
  return tools.find((item) => sameToolPath(item.id, current))?.id ?? current;
}

function mergeToolOptions(tools: { id: string; label: string }[], current: string, builtinLabel: string) {
  const options = [{ id: BUILTIN_MERGE_TOOL, label: builtinLabel }, ...tools.map((item) => ({ id: item.id, label: item.label }))];
  if (current && !isBuiltinMergeTool(current) && !tools.some((item) => sameToolPath(item.id, current))) {
    options.push({ id: current, label: current.split(/[/\\]/).pop() || current });
  }
  return options;
}

function selectedMergeTool(tools: { id: string }[], current: string): string {
  if (isBuiltinMergeTool(current) || !current) return BUILTIN_MERGE_TOOL;
  return tools.find((item) => sameToolPath(item.id, current))?.id ?? current;
}

function formatBuild(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function platformName(): string {
  const platform = window.mgm?.platform ?? navigator.platform;
  if (platform === "win32" || /^win/i.test(platform)) return "Windows";
  if (platform === "darwin" || /mac/i.test(platform)) return "macOS";
  if (platform === "linux" || /linux/i.test(platform)) return "Linux";
  return "Web";
}

export type { Settings };
export * from "./appDialogTypes";
