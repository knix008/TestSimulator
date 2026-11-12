// The code editor: a window of its own for the application code (src/app) and the generated
// code. The application code is saved by itself as it is typed, to its own folder apart from
// the design; generated files that hold the design go back into the design (and the project
// is saved by itself when it has a folder). The editor builds and runs the program.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dialog, WindowButtons } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { isEditableCode } from "./lvgl/codeparse.js";
import { glueIdentifiers } from "./lvgl/gluegen.js";
import { BINDINGS_FILE, VM_FILE } from "./lvgl/glueparse.js";
import { parseBuildProblems } from "./lvgl/problems.js";

const APP = "src/app/";
const SAVE_DELAY = 400;
const APPLY_DELAY = 250;
const SOURCE = /^src\/app\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:c|h|cpp|hpp|cc)$/;

const TOKEN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|#[a-z]+\b|\b(?:void|static|int|char|bool|return|if|else|for|while|do|switch|case|break|continue|default|extern|const|struct|typedef|enum|unsigned|signed|sizeof|true|false|NULL|int32_t|uint32_t|uint8_t|int16_t|uint16_t|float|double|long|short|class|namespace|public|private|auto|new|delete|nullptr)\b|\b0x[0-9a-fA-F]+\b|\b\d+\b|\b(?:LV|MV)_[A-Z0-9_]+\b|\blv_[a-z0-9_]+\b|\b(?:mv|vm)_[A-Za-z0-9_]+\b|\bglue_init\b)/g;

function classOf(token) {
  if (token.startsWith("/*") || token.startsWith("//")) return "c-comment";
  if (token.startsWith('"') || token.startsWith("'")) return "c-string";
  if (token.startsWith("#")) return "c-pre";
  if (/^(0x|\d)/.test(token)) return "c-number";
  if (/^(LV|MV)_/.test(token)) return "c-const";
  if (token.startsWith("lv_")) return "c-call";
  if (/^(mv_|vm_|glue_init)/.test(token)) return "c-glue";
  return "c-key";
}

/** The library calls the logic uses besides its ViewModels (engine/mvvm/mvvm.h). */
const LIBRARY = ["glue_init", "mv_get_int", "mv_get_bool", "mv_get_string", "mv_set_int", "mv_set_bool", "mv_set_string", "mv_observe", "mv_unobserve", "mv_notify", "mv_format", "mv_timer_start", "mv_timer_stop", "mv_prop_t", "mv_observer_t", "mv_timer_t"];

/** Why a generated file cannot be edited, and where its contents come from. */
function readOnlyReason(file) {
  if (file.startsWith("lib/mvvm/")) return "code.readOnlyLib";
  if (file.startsWith("src/glue/")) return "code.readOnlyGlue";
  if (file === "CMakeLists.txt") return "code.readOnlyCmake";
  return "code.readOnly";
}

/** One file, editable or not: colours under a transparent text area, line numbers, marks, completion. */
function SourcePane({ t, name, text, editable, marks, focusLine, completions, onChange, onBlur, onKeys }) {
  const input = useRef(null);
  const pre = useRef(null);
  const gutter = useRef(null);
  const [metrics, setMetrics] = useState({ line: 17.4, char: 7 });
  const [popup, setPopup] = useState(null);
  const parts = useMemo(() => text.split(TOKEN), [text]);
  const lines = useMemo(() => text.split("\n").length, [text]);

  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    const view = element.ownerDocument.defaultView;
    const style = view.getComputedStyle(element);
    const context = element.ownerDocument.createElement("canvas").getContext("2d");
    context.font = `${style.fontSize} ${style.fontFamily}`;
    setMetrics({ line: Number.parseFloat(style.lineHeight) || 17.4, char: context.measureText("M").width || 7 });
  }, []);
  // A new file, or a line to show: the view goes there.
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    if (focusLine) {
      element.scrollTop = Math.max(0, (focusLine - 1) * metrics.line - element.clientHeight / 2);
      let at = 0;
      for (let row = 1; row < focusLine; row++) at = text.indexOf("\n", at) + 1;
      element.focus();
      element.setSelectionRange(at, at);
    } else {
      element.scrollTop = 0;
    }
    follow();
    setPopup(null);
    // Only when the file or the asked line changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, focusLine]);

  const follow = () => {
    const element = input.current;
    if (!element) return;
    if (pre.current) {
      pre.current.scrollTop = element.scrollTop;
      pre.current.scrollLeft = element.scrollLeft;
    }
    if (gutter.current) gutter.current.scrollTop = element.scrollTop;
  };

  /** The word being typed before the caret, when it can be completed. */
  const suggest = (element) => {
    const at = element.selectionStart;
    if (at !== element.selectionEnd) return setPopup(null);
    const before = element.value.slice(0, at);
    const word = /\b((?:vm|mv)_[A-Za-z0-9_]*|glu[A-Za-z_]*)$/.exec(before)?.[1];
    if (!word || word.length < 3) return setPopup(null);
    const items = completions.filter((item) => item.startsWith(word) && item !== word).slice(0, 12);
    if (!items.length) return setPopup(null);
    const row = before.split("\n").length - 1;
    const column = before.length - before.lastIndexOf("\n") - 1 - word.length;
    // Below the line, or above it when the list would run past the bottom of the pane.
    const below = 8 + (row + 1) * metrics.line - element.scrollTop;
    const height = Math.min(240, items.length * 22 + 8);
    const y = below + height > element.clientHeight ? below - metrics.line - height : below;
    setPopup({ word, items, chosen: 0, x: Math.max(0, 10 + column * metrics.char - element.scrollLeft), y: Math.max(0, y) });
    return undefined;
  };
  const accept = (item) => {
    const element = input.current;
    element.focus();
    element.setSelectionRange(element.selectionStart - popup.word.length, element.selectionStart);
    element.ownerDocument.execCommand("insertText", false, item);
    setPopup(null);
  };
  const keyDown = (event) => {
    if (popup) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setPopup({ ...popup, chosen: (popup.chosen + step + popup.items.length) % popup.items.length });
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        accept(popup.items[popup.chosen]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setPopup(null);
        return;
      }
    }
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && editable) {
      event.preventDefault();
      event.currentTarget.ownerDocument.execCommand("insertText", false, "    ");
      return;
    }
    onKeys?.(event);
  };

  return (
    <div className="editor-pane">
      <div className="editor-gutter" ref={gutter} aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => {
          const mark = marks.find((item) => item.line === index + 1);
          return <div key={index} className={mark ? `editor-line-number ${mark.severity}` : "editor-line-number"} title={mark?.text}>{index + 1}</div>;
        })}
        <div className="editor-gutter-end" />
      </div>
      <div className="code-edit">
        <pre ref={pre} data-editor-code="" aria-hidden="true">
          {marks.map((mark) => <i key={`${mark.line}:${mark.text}`} className={`code-focus editor-mark ${mark.severity}`} style={{ top: 8 + (mark.line - 1) * metrics.line, height: metrics.line }} />)}
          {focusLine && <i className="code-focus" style={{ top: 8 + (focusLine - 1) * metrics.line, height: metrics.line }} />}
          {parts.map((part, at) => (at % 2 ? <span key={at} className={classOf(part)}>{part}</span> : part))}
        </pre>
        <textarea
          ref={input}
          key={name}
          data-editor-input={name}
          aria-label={name}
          value={text}
          readOnly={!editable}
          wrap="off"
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value);
            suggest(event.target);
          }}
          onScroll={() => {
            follow();
            setPopup(null);
          }}
          onBlur={() => {
            setTimeout(() => setPopup(null), 150);
            onBlur?.();
          }}
          onKeyDown={keyDown}
          onClick={() => setPopup(null)}
        />
        {popup && (
          <div className="editor-complete" data-editor-complete="" style={{ left: popup.x, top: popup.y }} role="listbox">
            {popup.items.map((item, index) => (
              <button
                type="button"
                key={item}
                role="option"
                aria-selected={index === popup.chosen}
                data-complete={item}
                className={index === popup.chosen ? "active" : undefined}
                onPointerDown={(event) => {
                  event.preventDefault();
                  accept(item);
                }}
              >
                <Icon name={item.startsWith("vm_") ? "viewModel" : "code"} size={12} /> {item}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const clock = () => new Date().toTimeString().slice(0, 8);

/**
 * The editor window. `appCode` is the application code on disk; `generated` the generated files.
 * `onEditGenerated(file, text)` applies an edit of a generated file to the design and returns
 * { changed, errors }. Writing the application code goes through `writeApp` (autosave).
 */
export function CodeEditorWindow({ t, project, projectName, generated, appCode, appDir, writeApp, renameApp, deleteApp, onEditGenerated, native, onRun, buildLines, logLines, problems, request, onClose }) {
  // Files being typed: what the editor shows until the disk (or the design) has caught up.
  const [buffers, setBuffers] = useState({});
  const buffersRef = useRef(buffers);
  buffersRef.current = buffers;
  const [drafts, setDrafts] = useState({});
  const [results, setResults] = useState({});
  const [opened, setOpened] = useState(["src/app/app.c"]);
  const [current, setCurrent] = useState("src/app/app.c");
  const [focus, setFocus] = useState(null);
  const [saveState, setSaveState] = useState({ kind: "idle" });
  const [bottom, setBottom] = useState("build");
  const [naming, setNaming] = useState(null);
  const [armedDelete, setArmedDelete] = useState(null);
  const timers = useRef(new Map());
  const applyTimer = useRef(null);
  const ownChange = useRef(false);

  const appFiles = useMemo(() => [...new Set([...Object.keys(appCode), ...Object.keys(buffers)])].filter((file) => file.startsWith(APP)).sort(), [appCode, buffers]);
  const generatedFiles = useMemo(() => Object.keys(generated).filter((file) => !file.startsWith("src/ui/images/") && !file.startsWith("src/ui/fonts/")).sort(), [generated]);
  const isApp = (file) => file.startsWith(APP);
  const exists = (file) => (isApp(file) ? appFiles.includes(file) : file in generated);
  const name = exists(current) ? current : appFiles[0] ?? generatedFiles[0];
  const tabs = opened.filter(exists);
  if (name && !tabs.includes(name)) tabs.push(name);

  const textOf = (file) => (isApp(file) ? buffers[file] ?? appCode[file] ?? "" : drafts[file] ?? generated[file] ?? "");
  const editable = (file) => (isApp(file) ? !!appDir : isEditableCode(file));
  const completions = useMemo(() => [...glueIdentifiers(project), ...LIBRARY].sort(), [project]);

  // Asked from outside: a problem or a build error to show.
  useEffect(() => {
    if (!request) return;
    setCurrent(request.file);
    setOpened((list) => (list.includes(request.file) ? list : [...list, request.file]));
    setFocus({ file: request.file, line: request.line, at: request.at });
  }, [request]);

  // The design changed by anything but this editor: the generated files follow it.
  const generatedRef = useRef(generated);
  useEffect(() => {
    if (generatedRef.current === generated) return;
    generatedRef.current = generated;
    if (ownChange.current) {
      ownChange.current = false;
      return;
    }
    setDrafts({});
    setResults({});
  }, [generated]);

  /* ------------------------------------------------- the application code, saved by itself */
  const save = async (file, text) => {
    timers.current.delete(file);
    setSaveState({ kind: "saving" });
    try {
      await writeApp(file, text);
      setSaveState({ kind: "saved", at: clock() });
      // Saved as it is now: the disk shows it from here on.
      setBuffers((state) => (state[file] === text ? Object.fromEntries(Object.entries(state).filter(([key]) => key !== file)) : state));
    } catch (error) {
      setSaveState({ kind: "error", text: String(error?.message ?? error) });
    }
  };
  const schedule = (file, text) => {
    clearTimeout(timers.current.get(file)?.timer);
    timers.current.set(file, { text, timer: setTimeout(() => void save(file, text), SAVE_DELAY) });
  };
  /** Everything typed reaches the disk now (before a build, and when the window closes). */
  const flush = async () => {
    const pending = [...timers.current.entries()];
    for (const [, item] of pending) clearTimeout(item.timer);
    await Promise.all(pending.map(([file, item]) => save(file, item.text)));
    if (applyTimer.current) applyNow();
  };
  useEffect(() => () => {
    for (const [file, item] of timers.current) {
      clearTimeout(item.timer);
      void writeApp(file, item.text);
    }
    // Only on closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------- generated code, back into the design */
  const pendingApply = useRef(null);
  const applyNow = () => {
    clearTimeout(applyTimer.current);
    applyTimer.current = null;
    const pending = pendingApply.current;
    if (!pending) return;
    pendingApply.current = null;
    const outcome = onEditGenerated(pending.file, pending.text);
    if (outcome.changed) ownChange.current = true;
    setResults((state) => ({ ...state, [pending.file]: outcome }));
  };
  const settle = () => {
    if (applyTimer.current) applyNow();
    const file = name;
    if (isApp(file) || drafts[file] === undefined) return;
    if (!results[file]?.errors.length) {
      setDrafts(({ [file]: _done, ...rest }) => rest);
      setResults(({ [file]: _done, ...rest }) => rest);
    }
  };

  const change = (text) => {
    if (isApp(name)) {
      setBuffers((state) => ({ ...state, [name]: text }));
      schedule(name, text);
      return;
    }
    setDrafts((state) => ({ ...state, [name]: text }));
    pendingApply.current = { file: name, text };
    clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(applyNow, APPLY_DELAY);
  };

  const run = async () => {
    await flush();
    onRun();
  };
  const keys = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void flush();
    }
    if (event.key === "F5") {
      event.preventDefault();
      void run();
    }
  };

  /* ---------------------------------------------------------------- files */
  const open = (file) => {
    settle();
    setCurrent(file);
    setOpened((list) => (list.includes(file) ? list : [...list, file]));
    setFocus(null);
  };
  const closeTab = (file) => {
    const list = tabs.filter((item) => item !== file);
    setOpened(list);
    if (file === name) setCurrent(list[list.length - 1] ?? "src/app/app.c");
  };
  const validNew = (path, from = null) => SOURCE.test(path) && (path === from || !appFiles.some((file) => file.toLowerCase() === path.toLowerCase()));
  const finishNaming = async () => {
    const { mode, from, value } = naming;
    const path = value.trim().startsWith(APP) ? value.trim() : `${APP}${value.trim()}`;
    if (!validNew(path, from)) return;
    setNaming(null);
    try {
      if (mode === "new") {
        const header = /\.(h|hpp)$/.test(path);
        const guard = path.split("/").pop().replace(/\W/g, "_").toUpperCase();
        const text = header ? `#ifndef ${guard}\n#define ${guard}\n\n#endif\n` : '#include "glue.h"\n\n';
        await writeApp(path, text);
        open(path);
      } else if (path !== from) {
        await flush();
        await renameApp(from, path);
        setOpened((list) => list.map((item) => (item === from ? path : item)));
        if (current === from) setCurrent(path);
      }
    } catch (error) {
      setSaveState({ kind: "error", text: String(error?.message ?? error) });
    }
  };
  const remove = async (file) => {
    if (armedDelete !== file) {
      setArmedDelete(file);
      setTimeout(() => setArmedDelete((value) => (value === file ? null : value)), 3000);
      return;
    }
    setArmedDelete(null);
    clearTimeout(timers.current.get(file)?.timer);
    timers.current.delete(file);
    setBuffers(({ [file]: _gone, ...rest }) => rest);
    try {
      await deleteApp(file);
      closeTab(file);
    } catch (error) {
      setSaveState({ kind: "error", text: String(error?.message ?? error) });
    }
  };

  /* -------------------------------------------------------------- marks */
  const buildProblems = useMemo(() => parseBuildProblems(buildLines.map((line) => line.text)), [buildLines]);
  const codeProblems = useMemo(() => [
    ...problems.filter((problem) => problem.file).map((problem) => ({ file: problem.file, line: problem.line, severity: problem.severity, text: t(`problem.${problem.code}`, problem.params) })),
    ...buildProblems.filter((problem) => problem.file).map((problem) => ({ file: problem.file, line: problem.line, severity: problem.severity, text: problem.params.text })),
  ], [problems, buildProblems, t]);
  const result = results[name];
  const marks = [
    ...codeProblems.filter((problem) => problem.file === name),
    ...(result?.errors ?? []).map((error) => ({ line: error.line, severity: "error", text: t(`codeError.${error.code}`, error.params) })),
  ];
  const fileHasProblem = (file) => codeProblems.some((problem) => problem.file === file && problem.severity === "error");

  let status;
  if (isApp(name)) {
    if (!appDir) status = <span className="code-note" data-editor-status="nodir"><Icon name="info" size={14} /> {t("editor.noFolder")}</span>;
    else if (saveState.kind === "error") status = <span className="code-note code-note-error" data-editor-status="save-error"><Icon name="error" size={14} /> {t("editor.saveError", { text: saveState.text })}</span>;
    else status = <span className="code-note" data-editor-status={saveState.kind}><Icon name="save" size={14} /> {saveState.kind === "saved" ? t("editor.saved", { time: saveState.at }) : saveState.kind === "saving" ? t("editor.saving") : t("editor.autosave")} <span className="editor-dir" title={appDir}>{appDir}</span></span>;
  } else if (result?.errors.length) {
    const error = result.errors[0];
    status = <span className="code-note code-note-error" data-editor-status="code-error"><Icon name="error" size={14} /> {t("code.line", { line: error.line })} {t(`codeError.${error.code}`, error.params)}</span>;
  } else if (isEditableCode(name)) {
    const which = name === BINDINGS_FILE ? "code.editableBindings" : VM_FILE.test(name) ? "code.editableVm" : name.endsWith("main.c") ? "code.editableMain" : name.endsWith("/ui.c") ? "code.editableUi" : name.endsWith("lv_conf.h") ? "code.editableConf" : "code.editable";
    status = <span className="code-note" data-editor-status="design"><Icon name="design" size={14} /> {t(which)} {t("editor.designSaved")}</span>;
  } else {
    status = <span className="code-note" data-editor-status="readonly"><Icon name="info" size={14} /> {t(readOnlyReason(name))}</span>;
  }

  const running = native !== "idle";
  const treeGroup = (title, icon, files, app) => (
    <section className="editor-group" data-editor-group={app ? "app" : "generated"}>
      <h4>
        <Icon name={icon} size={14} />
        <span>{title}</span>
        {app && appDir && <button type="button" className="mini" data-command="editor-new" title={t("editor.newFile")} aria-label={t("editor.newFile")} onClick={() => setNaming({ mode: "new", from: null, value: "logic.c" })}><Icon name="add" size={14} /></button>}
      </h4>
      {app && naming?.mode === "new" && (
        <input className={validNew(naming.value.startsWith(APP) ? naming.value : `${APP}${naming.value}`) ? "text-input editor-name" : "text-input editor-name invalid"} data-editor-name="" autoFocus value={naming.value} onChange={(event) => setNaming({ ...naming, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void finishNaming(); if (event.key === "Escape") { event.stopPropagation(); setNaming(null); } }} onBlur={() => setNaming(null)} title={t("editor.nameTip")} />
      )}
      {files.map((file) => (
        naming?.mode === "rename" && naming.from === file ? (
          <input key={file} className={validNew(naming.value.startsWith(APP) ? naming.value : `${APP}${naming.value}`, file) ? "text-input editor-name" : "text-input editor-name invalid"} data-editor-name="" autoFocus value={naming.value} onChange={(event) => setNaming({ ...naming, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void finishNaming(); if (event.key === "Escape") { event.stopPropagation(); setNaming(null); } }} onBlur={() => setNaming(null)} title={t("editor.nameTip")} />
        ) : (
          <div key={file} className={file === name ? "editor-file selected" : "editor-file"}>
            <button type="button" className="editor-file-name" data-editor-file={file} title={file} onClick={() => open(file)}>
              <Icon name={/\.(h|hpp)$/.test(file) ? "conf" : "code"} size={13} />
              <span>{app ? file.slice(APP.length) : file}</span>
              {fileHasProblem(file) && <Icon name="error" size={12} />}
              {app && buffers[file] !== undefined && <i className="editor-dirty" title={t("editor.saving")} />}
              {!app && !isEditableCode(file) && <Icon name="lock" size={11} />}
            </button>
            {app && appDir && (
              <>
                <button type="button" className="mini" data-command="editor-rename" data-file={file} title={t("editor.rename")} aria-label={t("editor.rename")} onClick={() => setNaming({ mode: "rename", from: file, value: file.slice(APP.length) })}><Icon name="label" size={12} /></button>
                <button type="button" className={armedDelete === file ? "mini armed" : "mini"} data-command="editor-delete" data-file={file} title={t(armedDelete === file ? "editor.deleteAgain" : "editor.delete")} aria-label={t("editor.delete")} onClick={() => void remove(file)}><Icon name="delete" size={12} /></button>
              </>
            )}
          </div>
        )
      ))}
    </section>
  );

  const outputLines = bottom === "build" ? buildLines : logLines;
  return (
    <Dialog title={t("editor.title", { name: projectName })} icon="code" onClose={() => { void flush(); onClose(); }} id="editor" width={1100} height={720} bare standsFree>
      <div
        className="editor-window"
        data-editor=""
        onKeyDown={(event) => {
          // Escape belongs to the editor (completion, renaming); it never closes the window.
          if (event.key === "Escape") event.stopPropagation();
          keys(event);
        }}
      >
        <div className="editor-bar" data-window-drag="">
          <span className="editor-bar-title" data-dialog-title=""><Icon name="code" /><span>{t("editor.title", { name: projectName })}</span></span>
          <button type="button" className={running ? "tool-button editor-run stop" : "tool-button editor-run"} data-command="editor-run" title={t(running ? "cmd.nativeStop" : "editor.runTip")} onClick={() => void run()}>
            <Icon name={running ? "stop" : "native"} size={16} /> {t(running ? "cmd.nativeStop" : "editor.run")}
          </button>
          <span className="editor-state" data-editor-native={native}>{native === "building" ? t("status.building") : native === "running" ? t("status.native") : ""}</span>
          <span className="guide-bar-gap" />
          <WindowButtons t={t} onClose={() => { void flush(); onClose(); }} />
        </div>
        <div className="editor-main">
          <nav className="editor-tree" data-editor-tree="">
            {treeGroup(t("editor.appGroup"), "viewModel", appFiles, true)}
            {treeGroup(t("editor.generatedGroup"), "build", generatedFiles, false)}
          </nav>
          <div className="editor-body">
            <div className="code-tab-bar">
              <div className="code-tabs">
                {tabs.map((file) => (
                  <span key={file} className={file === name ? "editor-tab active" : "editor-tab"}>
                    <button type="button" data-editor-tab={file} title={file} onClick={() => open(file)}>{file.split("/").pop()}{isApp(file) && buffers[file] !== undefined ? " •" : ""}</button>
                    <button type="button" className="mini" aria-label={t("dialog.close")} title={t("dialog.close")} onClick={() => closeTab(file)}><Icon name="close" size={10} /></button>
                  </span>
                ))}
              </div>
            </div>
            {name ? (
              <SourcePane
                t={t}
                name={name}
                text={textOf(name)}
                editable={editable(name)}
                marks={marks}
                focusLine={focus && focus.file === name ? focus.line : null}
                completions={completions}
                onChange={change}
                onBlur={settle}
                onKeys={keys}
              />
            ) : <div className="editor-empty">{t("editor.noFolder")}</div>}
            <div className="code-status">{status}</div>
          </div>
        </div>
        <div className="editor-bottom">
          <div className="bottom-tabs">
            <button type="button" data-editor-bottom="build" className={bottom === "build" ? "active" : undefined} onClick={() => setBottom("build")}><Icon name="build" /> {t("panel.build")}</button>
            <button type="button" data-editor-bottom="log" className={bottom === "log" ? "active" : undefined} onClick={() => setBottom("log")}><Icon name="log" /> {t("editor.output")}</button>
            <button type="button" data-editor-bottom="problems" className={bottom === "problems" ? "active" : undefined} onClick={() => setBottom("problems")}>
              <Icon name="problems" /> {t("panel.problems")}
              {codeProblems.length > 0 && <b className="problem-count" data-errors={codeProblems.some((item) => item.severity === "error") ? "" : undefined}>{codeProblems.length}</b>}
            </button>
          </div>
          {bottom === "problems" ? (
            <div className="editor-list" data-editor-problems="">
              {codeProblems.length === 0 && <div className="problems-empty"><Icon name="check" /> {t("problem.none")}</div>}
              {codeProblems.map((problem, index) => (
                <button type="button" key={index} className="editor-problem" data-editor-problem={`${problem.file}:${problem.line}`} onClick={() => { open(problem.file); setFocus({ file: problem.file, line: problem.line, at: Date.now() }); }}>
                  <Icon name={problem.severity === "error" ? "error" : "warning"} size={13} />
                  <span className="editor-where">{problem.file}:{problem.line}</span>
                  <span>{problem.text}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="editor-list log-list" data-editor-output={bottom}>
              {outputLines.map((line, index) => {
                const found = bottom === "build" ? parseBuildProblems([line.text])[0] : null;
                return found?.file ? (
                  <button type="button" key={index} className={`log-line editor-jump ${line.kind ?? ""}`} onClick={() => { open(found.file); setFocus({ file: found.file, line: found.line, at: Date.now() }); }}>
                    <time>{line.time}</time><span>{line.text}</span>
                  </button>
                ) : (
                  <div className={`log-line ${line.kind ?? ""}`} key={index}><time>{line.time}</time><span>{line.text}</span></div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
