// The code editor: a window of its own for the application code (src/app) and the generated
// code, on CodeMirror 6. The application code is saved by itself as it is typed, to its own
// folder apart from the design; generated files that hold the design go back into the design
// (and the project is saved by itself when it has a folder). It builds, runs and stops the
// program, and cleans the build. Each file keeps its own undo history while the window is open.
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dialog, ResizeGrip, WindowButtons, usePopout } from "./dialogs.jsx";
import { host } from "./host.js";
import { Icon } from "./icons.jsx";
import { MenuItems } from "./ContextMenu.jsx";
import { isEditableCode } from "./lvgl/codeparse.js";
import { glueIdentifiers } from "./lvgl/gluegen.js";
import { BINDINGS_FILE, VM_FILE } from "./lvgl/glueparse.js";
import { parseBuildProblems } from "./lvgl/problems.js";
import { viewModels, vmPrefix } from "./lvgl/viewmodel.js";
import { EditorView, External, autoIndent, createState, indentFor, indentPart, diagnosticsFor, misspelledAt, phrasesFor, phrasesPart, readOnlyPart, setDiagnostics, spellChecking, spellPart, wrapPart } from "./editor/codemirror.js";
import { LANGUAGES, languageOf, misspelled, spellerFor, wordsFromList } from "./editor/spell.js";
import { dictionaryFiles } from "./editor/dictionaries.js";
import { EditorState, Transaction } from "@codemirror/state";
import { indentLess, indentMore, redo, redoDepth, selectAll, toggleComment, undo, undoDepth } from "@codemirror/commands";
import { gotoLine, openSearchPanel } from "@codemirror/search";

const APP = "src/app/";
const SAVE_DELAY = 400;
const APPLY_DELAY = 250;
const SOURCE = /^src\/app\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:c|h|cpp|hpp|cc)$/;
const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];
const PREFS = "mylvglstudio.editor";

/** The library calls the logic uses besides its ViewModels (engine/mvvm/mvvm.h). */
const LIBRARY = {
  glue_init: "void glue_init(void)",
  mv_get_int: "int32_t (mv_prop_t *)", mv_get_bool: "bool (mv_prop_t *)", mv_get_string: "const char * (mv_prop_t *)",
  mv_set_int: "bool (mv_prop_t *, int32_t)", mv_set_bool: "bool (mv_prop_t *, bool)", mv_set_string: "bool (mv_prop_t *, const char *)",
  mv_observe: "mv_observer_t * (prop, cb, user)", mv_unobserve: "void (prop, observer)", mv_notify: "void (mv_prop_t *)", mv_format: "void (out, size, format, prop)",
  mv_timer_start: "mv_timer_t * (period_ms, cb, user)", mv_timer_stop: "void (mv_timer_t *)",
  mv_prop_t: "type", mv_observer_t: "type", mv_timer_t: "type",
};
const C_WORDS = ["include", "define", "static", "const", "void", "int", "bool", "char", "int32_t", "uint32_t", "uint8_t", "return", "struct", "typedef", "unsigned", "while", "switch", "break", "continue", "default", "sizeof", "printf", "true", "false", "NULL"];

/** Why a generated file cannot be edited, and where its contents come from. */
function readOnlyReason(file) {
  if (file.startsWith("lib/mvvm/")) return "code.readOnlyLib";
  if (file.startsWith("src/glue/")) return "code.readOnlyGlue";
  if (file === "CMakeLists.txt") return "code.readOnlyCmake";
  return "code.readOnly";
}

const readPrefs = () => {
  try {
    return { font: 13, wrap: false, files: true, bottom: true, ...JSON.parse(localStorage.getItem(PREFS) ?? "{}") };
  } catch {
    return { font: 13, wrap: false, files: true, bottom: true };
  }
};
const writePrefs = (prefs) => {
  try {
    localStorage.setItem(PREFS, JSON.stringify(prefs));
  } catch { /* blocked storage: for this session only */ }
};

/**
 * One CodeMirror view showing the current file; every other file waits as its EditorState,
 * with its own undo history. `text` is what the file holds now (the disk, the design, or what
 * is being typed): when it changes from outside, the editor shows it, out of the undo history.
 */
const CodePane = forwardRef(function CodePane({ file, text, readOnly, marks, wrap, language, spell, tabSize, items, focus, actions, onChange, onInfo, onLeave, onMenu }, ref) {
  const host = useRef(null);
  const view = useRef(null);
  const states = useRef(new Map());
  const shown = useRef(file);
  const latest = useRef({});
  latest.current = { items, actions, onChange, onInfo, onLeave, wrap, language, spell, tabSize };

  const reported = useRef("");
  const report = (state) => {
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head);
    const info = { line: line.number, column: selection.head - line.from + 1, selected: Math.abs(selection.to - selection.from), undo: undoDepth(state), redo: redoDepth(state), lines: state.doc.lines };
    const key = JSON.stringify(info);
    if (key === reported.current) return;
    reported.current = key;
    latest.current.onInfo(info);
  };
  const make = (value, locked) => createState(value, {
    readOnly: locked,
    wrap: latest.current.wrap,
    language: latest.current.language,
    spell: latest.current.spell,
    tabSize: latest.current.tabSize,
    items: () => latest.current.items,
    actions: {
      save: () => latest.current.actions.save(),
      run: () => latest.current.actions.run(),
      stop: () => latest.current.actions.stop(),
      gotoLine: (target) => gotoLine(target),
    },
    onUpdate: (update) => {
      if (update.docChanged && !update.transactions.some((tr) => tr.isUserEvent("external"))) latest.current.onChange(shown.current, update.state.doc.toString());
      if (update.docChanged || update.selectionSet || update.transactions.length) report(update.state);
      if (update.focusChanged && !update.view.hasFocus) latest.current.onLeave();
    },
  });
  /** Shows `value` as the file's text, as a change from outside: not undoable, not reported. */
  const replace = (value) => {
    const current = view.current;
    if (!current || current.state.doc.toString() === value) return;
    current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: value }, annotations: [External, Transaction.addToHistory.of(false)] });
  };

  useLayoutEffect(() => {
    view.current = new EditorView({ parent: host.current, root: host.current.ownerDocument, state: make(text, readOnly) });
    report(view.current.state);
    // Read-only hook for the GUI test: the text, and a selection to type over.
    host.current.mlsEditor = {
      text: () => view.current.state.doc.toString(),
      select: (from, to = from) => {
        view.current.focus();
        view.current.dispatch({ selection: { anchor: from, head: to } });
      },
      readOnly: () => view.current.state.readOnly,
      caretLine: () => view.current.state.doc.lineAt(view.current.state.selection.main.head).number,
    };
    return () => {
      view.current.destroy();
      view.current = null;
    };
    // Made once; files are switched below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Another file: the one shown is kept with its history, the next one comes back with its own.
  useLayoutEffect(() => {
    const current = view.current;
    if (!current || shown.current === file) return;
    states.current.set(shown.current, current.state);
    shown.current = file;
    const kept = states.current.get(file);
    current.setState(kept ?? make(text, readOnly));
    current.dispatch({ effects: [readOnlyPart.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]), wrapPart.reconfigure(wrap ? EditorView.lineWrapping : []), phrasesPart.reconfigure(phrasesFor(language)), spellPart.reconfigure(spellChecking(spell)), indentPart.reconfigure(indentFor(tabSize))] });
    replace(text);
    report(current.state);
    // Only when the file changes; its text is followed by the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  useEffect(() => {
    if (shown.current === file) replace(text);
  }, [file, text]);
  useEffect(() => {
    view.current?.dispatch({ effects: readOnlyPart.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]) });
  }, [readOnly]);
  useEffect(() => {
    view.current?.dispatch({ effects: wrapPart.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);
  // The tab width of the settings: the file shown follows at once, the others when shown.
  useEffect(() => {
    view.current?.dispatch({ effects: indentPart.reconfigure(indentFor(tabSize)) });
  }, [tabSize]);
  // Spell checking switched, or its words or languages changed: checked again.
  useEffect(() => {
    view.current?.dispatch({ effects: spellPart.reconfigure(spellChecking(spell)) });
  }, [spell]);
  // The main window's language changed: CodeMirror's own texts follow it.
  useEffect(() => {
    view.current?.dispatch({ effects: phrasesPart.reconfigure(phrasesFor(language)) });
  }, [language]);
  useEffect(() => {
    const current = view.current;
    if (current) current.dispatch(setDiagnostics(current.state, diagnosticsFor(current.state, marks)));
  }, [marks, file]);
  // A line asked for: the caret goes there and the view shows it.
  useEffect(() => {
    const current = view.current;
    if (!focus || focus.file !== file || !current) return;
    const line = current.state.doc.line(Math.min(Math.max(1, focus.line), current.state.doc.lines));
    current.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
    current.focus();
  }, [focus, file]);

  /** What the toolbar and the menus do. Clipboard: the window's own, so it works in a window of its own. */
  useImperativeHandle(ref, () => {
    const run = (command) => () => {
      const current = view.current;
      if (!current) return false;
      current.focus();
      return command(current);
    };
    const clipboard = () => host.current.ownerDocument.defaultView.navigator.clipboard;
    const selectionText = (current) => current.state.sliceDoc(current.state.selection.main.from, current.state.selection.main.to);
    return {
      undo: run(undo),
      redo: run(redo),
      selectAll: run(selectAll),
      comment: run(toggleComment),
      indent: run(indentMore),
      outdent: run(indentLess),
      autoIndent: run(autoIndent),
      find: run(openSearchPanel),
      replace: run((current) => {
        openSearchPanel(current);
        setTimeout(() => current.dom.querySelector(".cm-search input[name=replace]")?.focus(), 0);
        return true;
      }),
      gotoLine: run(gotoLine),
      copy: run((current) => {
        const value = selectionText(current);
        if (value) void clipboard().writeText(value).catch(() => {});
        return true;
      }),
      cut: run((current) => {
        const value = selectionText(current);
        if (!value || current.state.readOnly) return false;
        void clipboard().writeText(value).catch(() => {});
        current.dispatch(current.state.replaceSelection(""));
        return true;
      }),
      paste: run((current) => {
        if (current.state.readOnly) return false;
        void clipboard().readText().then((value) => {
          if (value) current.dispatch(current.state.replaceSelection(value), { userEvent: "input.paste" });
        }, () => {});
        return true;
      }),
      deleteSelection: run((current) => {
        if (current.state.readOnly) return false;
        current.dispatch(current.state.replaceSelection(""));
        return true;
      }),
      /** The misspelled word under a point of the window, or null. */
      misspelledAt: (x, y) => {
        const current = view.current;
        const pos = current?.posAtCoords({ x, y });
        return pos === null || pos === undefined ? null : misspelledAt(current.state, pos);
      },
      replaceRange: (from, to, value) => {
        const current = view.current;
        if (!current || current.state.readOnly) return;
        current.dispatch({ changes: { from, to, insert: value }, userEvent: "input.spell" });
        current.focus();
      },
      wordAtCaret: () => {
        const current = view.current;
        if (!current) return "";
        const word = current.state.wordAt(current.state.selection.main.head);
        return word ? current.state.sliceDoc(word.from, word.to) : "";
      },
      text: () => view.current?.state.doc.toString() ?? "",
      focus: () => view.current?.focus(),
      forget: (name) => states.current.delete(name),
      rename: (from, to) => {
        if (states.current.has(from)) {
          states.current.set(to, states.current.get(from));
          states.current.delete(from);
        }
        if (shown.current === from) shown.current = to;
      },
    };
  });

  return (
    <div
      className="editor-pane"
      ref={host}
      data-editor-pane={file}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onMenu(event);
      }}
    />
  );
});

/** A right-click menu inside the editor window; it closes on any press outside it, or Escape. */
function EditorMenu({ x, y, items, onClose }) {
  const menu = useRef(null);
  const [place, setPlace] = useState({ left: x, top: y, visibility: "hidden" });
  useLayoutEffect(() => {
    const element = menu.current;
    const view = element.ownerDocument.defaultView;
    const rect = element.getBoundingClientRect();
    setPlace({ left: Math.max(4, Math.min(x, view.innerWidth - rect.width - 4)), top: Math.max(4, Math.min(y, view.innerHeight - rect.height - 4)), visibility: "visible" });
  }, [x, y]);
  useEffect(() => {
    const doc = menu.current.ownerDocument;
    const away = (event) => {
      if (!menu.current?.contains(event.target)) onClose();
    };
    const key = (event) => {
      if (event.key === "Escape") onClose();
    };
    doc.addEventListener("pointerdown", away, true);
    doc.addEventListener("keydown", key, true);
    return () => {
      doc.removeEventListener("pointerdown", away, true);
      doc.removeEventListener("keydown", key, true);
    };
  }, [onClose]);
  // The main window's menu, item for item: the same look in both windows.
  return (
    <div className="menu-pop context-menu" ref={menu} role="menu" data-editor-menu="" style={place}>
      <MenuItems items={items.filter(Boolean)} onClose={onClose} />
    </div>
  );
}

const clock = () => new Date().toTimeString().slice(0, 8);


/**
 * Spell checking and the dictionaries: on or off, which languages, and the user's own words
 * (added one by one, from the right-click menu, or from a word list file).
 */
function SpellPanel({ t, spell, onSpell, onPickWordList, onClose }) {
  const [word, setWord] = useState("");
  const [note, setNote] = useState("");
  const add = () => {
    const value = word.trim();
    if (!value || /\s/.test(value)) return;
    onSpell({ ...spell, words: [...new Set([...spell.words, value])] });
    setWord("");
  };
  const importList = async () => {
    const text = await onPickWordList();
    if (text === null) return;
    const words = wordsFromList(text);
    onSpell({ ...spell, words: [...new Set([...spell.words, ...words])] });
    setNote(t("spell.imported", { count: words.length }));
  };
  const toggleLanguage = (language) => onSpell({ ...spell, languages: spell.languages.includes(language) ? spell.languages.filter((item) => item !== language) : [...spell.languages, language] });
  return (
    <div className="spell-panel" data-spell-panel="" role="dialog" aria-label={t("spell.title")}>
      <header>
        <Icon name="guide" size={14} />
        <b>{t("spell.title")}</b>
        <button type="button" className="mini" data-command="spell-close" aria-label={t("dialog.close")} title={t("dialog.close")} onClick={onClose}><Icon name="close" size={12} /></button>
      </header>
      <label className="spell-row">
        <input type="checkbox" data-spell-enabled="" checked={spell.enabled} onChange={() => onSpell({ ...spell, enabled: !spell.enabled })} />
        <span>{t("spell.enabled")}</span>
      </label>
      <p className="spell-note">{t("spell.where")}</p>
      <h4>{t("spell.dictionaries")}</h4>
      {LANGUAGES.map((language) => (
        <label className="spell-row" key={language}>
          <input type="checkbox" data-spell-language={language} checked={spell.languages.includes(language)} onChange={() => toggleLanguage(language)} />
          <span>{t(`spell.language.${language}`)}</span>
        </label>
      ))}
      <h4>{t("spell.userWords", { count: spell.words.length })}</h4>
      <div className="spell-add">
        <input className="text-input" data-spell-word="" value={word} placeholder={t("spell.wordPlaceholder")} onChange={(event) => setWord(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") add(); }} />
        <button type="button" className="editor-tool" data-command="spell-add" disabled={!word.trim() || /\s/.test(word.trim())} onClick={add}><Icon name="add" size={14} /><span>{t("spell.add")}</span></button>
      </div>
      <ul className="spell-words" data-spell-words="">
        {spell.words.length === 0 && <li className="spell-empty">{t("spell.none")}</li>}
        {spell.words.map((item) => (
          <li key={item}>
            <span>{item}</span>
            <button type="button" className="mini" data-spell-remove={item} aria-label={t("spell.remove", { word: item })} title={t("spell.remove", { word: item })} onClick={() => onSpell({ ...spell, words: spell.words.filter((other) => other !== item) })}><Icon name="close" size={11} /></button>
          </li>
        ))}
      </ul>
      <div className="spell-foot">
        <button type="button" className="editor-tool" data-command="spell-import" onClick={() => void importList()}><Icon name="open" size={14} /><span>{t("spell.import")}</span></button>
        <span className="spell-note">{note}</span>
      </div>
    </div>
  );
}
const MIN_HEIGHT = 520;

/**
 * Keeps the window at least as wide as its toolbar and its title bar need, on one line each:
 * measured from what is drawn, so it follows the language and the labels. In a window of its
 * own the window gets that minimum; inside the page the editor itself does.
 */
function useMinimumSize(bar, toolbar, ready, language) {
  const [width, setWidth] = useState({ content: 0, frame: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const tools = toolbar.current;
      const title = bar.current;
      if (!tools || !title) return;
      const style = (element) => element.ownerDocument.defaultView.getComputedStyle(element);
      // A length that is not a number ("normal") counts as 0: a NaN would never equal itself and
      // would make every measurement look like a change.
      const px = (value) => Number.parseFloat(value) || 0;
      const pads = (element) => px(style(element).paddingLeft) + px(style(element).paddingRight);
      // Each item's natural width (scrollWidth), not its drawn one: the title shrinks with the
      // window, and measuring that would feed the window's size back into its own minimum.
      const natural = (child) => Math.max(child.scrollWidth, child.getBoundingClientRect().width);
      const toolsWidth = [...tools.children].reduce((sum, child) => sum + natural(child), 0) + pads(tools);
      const titleWidth = [...title.children].filter((child) => !child.classList.contains("guide-bar-gap")).reduce((sum, child) => sum + natural(child), 0)
        + pads(title) + px(style(title).columnGap) * (title.children.length - 1) + 24;
      // The dialog's frame around the editor (its borders) counts too, and a few pixels to spare:
      // rounding must never cut the last button (the close button).
      const panel = tools.closest(".dialog");
      // Its borders only: a scrollbar comes and goes with the size, and would feed back into it.
      const frame = panel ? Math.ceil(px(style(panel).borderLeftWidth) + px(style(panel).borderRightWidth)) : 0;
      const content = Math.ceil(Math.max(toolsWidth, titleWidth)) + 8;
      if (!Number.isFinite(content) || !Number.isFinite(frame)) return;
      setWidth((old) => (old.content === content && old.frame === frame ? old : { content, frame }));
    };
    measure();
    if (!toolbar.current) return undefined;
    const Observer = toolbar.current.ownerDocument.defaultView.ResizeObserver ?? ResizeObserver;
    const watch = new Observer(() => measure());
    for (const element of [toolbar.current, bar.current]) for (const child of element?.children ?? []) watch.observe(child);
    return () => watch.disconnect();
    // Again when the window's content is there, and when the language changes the labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, language]);
  return width;
}

/**
 * Gives the window the editor is in its minimum size. Rendered inside the dialog: only there is
 * the window known (the editor's own component sits outside it).
 */
function WindowMinimum({ width, height }) {
  const pop = usePopout();
  useEffect(() => {
    if (pop && width) void host.popoutMinSize(pop.label, width, height).catch(() => {});
  }, [pop, width, height]);
  return <span hidden data-window-label={pop?.label ?? ""} data-window-min={width ? `${width}x${height}` : ""} />;
}

/**
 * The editor window. `appCode` is the application code on disk; `generated` the generated files.
 * `onEditGenerated(file, text)` applies an edit of a generated file to the design and returns
 * { changed, errors }. Writing the application code goes through `writeApp` (autosave).
 */
export function CodeEditorWindow({ t, language, spell, tabSize = 4, onSpell, onPickWordList, project, projectName, generated, appCode, appDir, writeApp, renameApp, deleteApp, onEditGenerated, native, onRun, onStop, onBuild, onClean, onSettings, onAbout, onGuide, buildLines, logLines, problems, request, onClose }) {
  // Files being typed: what the editor shows until the disk (or the design) has caught up.
  const [buffers, setBuffers] = useState({});
  const [drafts, setDrafts] = useState({});
  const [results, setResults] = useState({});
  const [opened, setOpened] = useState(["src/app/app.c"]);
  const [current, setCurrent] = useState("src/app/app.c");
  const [focus, setFocus] = useState(null);
  const [saveState, setSaveState] = useState({ kind: "idle" });
  const [bottom, setBottom] = useState("build");
  const [naming, setNaming] = useState(null);
  const [armedDelete, setArmedDelete] = useState(null);
  const [info, setInfo] = useState({ line: 1, column: 1, selected: 0, undo: 0, redo: 0, lines: 1 });
  const [menu, setMenu] = useState(null);
  const [prefs, setPrefs] = useState(readPrefs);
  const [spellPanel, setSpellPanel] = useState(false);
  /** Spellers loaded so far, for suggestions in the right-click menu. */
  const spellers = useRef({});
  // What the editor checks with: null when spell checking is off.
  const spellCheck = useMemo(() => {
    if (!spell.enabled || !spell.languages.length) return null;
    return async (words) => {
      const needed = [...new Set(words.map((item) => languageOf(item.word)))].filter((item) => spell.languages.includes(item));
      for (const item of needed) spellers.current[item] ??= await spellerFor(item, dictionaryFiles);
      return misspelled(words, { known: (word, kind) => spellers.current[kind]?.spell(word) ?? true, languages: spell.languages, userWords: spell.words });
    };
  }, [spell]);
  const addWord = (word) => onSpell({ ...spell, words: [...new Set([...spell.words, word])] });
  const pane = useRef(null);
  const listRef = useRef(null);
  const barRef = useRef(null);
  const toolbarRef = useRef(null);
  // The bars exist once the window is open: a callback ref says so.
  const [barsReady, setBarsReady] = useState(false);
  const toolbarReady = (element) => {
    toolbarRef.current = element;
    if (!!element !== barsReady) setBarsReady(!!element);
  };
  const minimum = useMinimumSize(barRef, toolbarRef, barsReady, language);
  const minimumWidth = minimum.content;
  const timers = useRef(new Map());
  const applyTimer = useRef(null);
  const pendingApply = useRef(null);

  const appFiles = useMemo(() => [...new Set([...Object.keys(appCode), ...Object.keys(buffers)])].filter((file) => file.startsWith(APP)).sort(), [appCode, buffers]);
  const generatedFiles = useMemo(() => Object.keys(generated).filter((file) => !file.startsWith("src/ui/images/") && !file.startsWith("src/ui/fonts/")).sort(), [generated]);
  const isApp = (file) => file.startsWith(APP);
  const exists = (file) => (isApp(file) ? appFiles.includes(file) : file in generated);
  const name = exists(current) ? current : appFiles[0] ?? generatedFiles[0] ?? "src/app/app.c";
  const tabs = opened.filter(exists);
  if (!tabs.includes(name)) tabs.push(name);

  const textOf = (file) => (isApp(file) ? buffers[file] ?? appCode[file] ?? "" : drafts[file] ?? generated[file] ?? "");
  const editable = (file) => (isApp(file) ? !!appDir && appFiles.includes(file) : isEditableCode(file));
  const items = useMemo(() => {
    const described = new Map();
    for (const vm of viewModels(project)) {
      const prefix = vmPrefix(vm);
      described.set(`${prefix}_init`, `ViewModel ${vm.name}`);
      for (const prop of vm.props) {
        const kind = { int: "int32_t", bool: "bool", string: "const char *" }[prop.type];
        described.set(`${prefix}_get_${prop.name}`, `${kind} ${vm.name}.${prop.name}`);
        described.set(`${prefix}_set_${prop.name}`, `(${kind}) ${vm.name}.${prop.name}`);
        described.set(`${prefix}_prop_${prop.name}`, `mv_prop_t * ${vm.name}.${prop.name}`);
      }
    }
    for (const id of glueIdentifiers(project)) if (!described.has(id)) described.set(id, "");
    return [
      ...[...described].map(([label, detail]) => ({ label, detail, type: "function", boost: 2 })),
      ...Object.entries(LIBRARY).map(([label, detail]) => ({ label, detail, type: detail === "type" ? "type" : "function", boost: 1 })),
      ...C_WORDS.map((label) => ({ label, type: "keyword" })),
    ];
  }, [project]);

  // Asked from outside: a problem or a build error to show.
  useEffect(() => {
    if (!request) return;
    setCurrent(request.file);
    setOpened((list) => (list.includes(request.file) ? list : [...list, request.file]));
    setFocus({ file: request.file, line: request.line, at: request.at });
  }, [request]);

  /* ------------------------------------------------- the application code, saved by itself */
  const save = async (file, text) => {
    timers.current.delete(file);
    setSaveState({ kind: "saving" });
    try {
      await writeApp(file, text);
      setSaveState({ kind: "saved", at: clock() });
      setBuffers((state) => (state[file] === text ? Object.fromEntries(Object.entries(state).filter(([key]) => key !== file)) : state));
    } catch (error) {
      setSaveState({ kind: "error", text: String(error?.message ?? error) });
    }
  };
  const schedule = (file, text) => {
    clearTimeout(timers.current.get(file)?.timer);
    timers.current.set(file, { text, timer: setTimeout(() => void save(file, text), SAVE_DELAY) });
  };
  /** Everything typed reaches the disk and the design now (before a build, and on closing). */
  const flush = async () => {
    if (applyTimer.current) applyNow();
    const pending = [...timers.current.entries()];
    for (const [, item] of pending) clearTimeout(item.timer);
    await Promise.all(pending.map(([file, item]) => save(file, item.text)));
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
  const applyNow = () => {
    clearTimeout(applyTimer.current);
    applyTimer.current = null;
    const pending = pendingApply.current;
    if (!pending) return;
    pendingApply.current = null;
    const outcome = onEditGenerated(pending.file, pending.text);
    setResults((state) => ({ ...state, [pending.file]: outcome }));
  };
  /** Leaving the editor: a generated file read without error shows again as the design prints it. */
  const settle = () => {
    if (applyTimer.current) applyNow();
    setDrafts((state) => {
      const drop = Object.keys(state).filter((file) => file !== name || !results[file]?.errors.length);
      if (!drop.length) return state;
      const next = { ...state };
      for (const file of drop) delete next[file];
      return next;
    });
  };

  const change = (file, text) => {
    if (isApp(file)) {
      setBuffers((state) => ({ ...state, [file]: text }));
      schedule(file, text);
      return;
    }
    setDrafts((state) => ({ ...state, [file]: text }));
    pendingApply.current = { file, text };
    clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(applyNow, APPLY_DELAY);
  };

  const running = native !== "idle";
  const run = async () => {
    await flush();
    if (!running) onRun();
  };
  const stop = () => {
    if (running) onStop();
  };
  const build = async () => {
    await flush();
    if (!running) onBuild();
  };

  /* ---------------------------------------------------------------- files */
  const open = (file, line = null) => {
    settle();
    setCurrent(file);
    setOpened((list) => (list.includes(file) ? list : [...list, file]));
    setFocus(line ? { file, line, at: Date.now() } : null);
  };
  const closeTab = (file) => {
    const list = tabs.filter((item) => item !== file);
    setOpened(list);
    if (file === name) setCurrent(list[list.length - 1] ?? "src/app/app.c");
  };
  const fullName = (value) => (value.trim().startsWith(APP) ? value.trim() : `${APP}${value.trim()}`);
  const validNew = (path, from = null) => SOURCE.test(path) && (path === from || !appFiles.some((file) => file.toLowerCase() === path.toLowerCase()));
  const startNew = () => appDir && setNaming({ mode: "new", from: null, value: "logic.c" });
  const startRename = (file) => isApp(file) && appDir && setNaming({ mode: "rename", from: file, value: file.slice(APP.length) });
  const finishNaming = async () => {
    const { mode, from, value } = naming;
    const path = fullName(value);
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
        pane.current?.rename(from, path);
        setOpened((list) => list.map((item) => (item === from ? path : item)));
        if (current === from) setCurrent(path);
      }
    } catch (error) {
      setSaveState({ kind: "error", text: String(error?.message ?? error) });
    }
  };
  const remove = async (file) => {
    if (!isApp(file) || !appDir) return;
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
      pane.current?.forget(file);
      closeTab(file);
    } catch (error) {
      setSaveState({ kind: "error", text: String(error?.message ?? error) });
    }
  };

  /* -------------------------------------------------------------- problems */
  const buildProblems = useMemo(() => parseBuildProblems(buildLines.map((line) => line.text)), [buildLines]);
  const codeProblems = useMemo(() => [
    ...problems.filter((problem) => problem.file).map((problem) => ({ file: problem.file, line: problem.line, severity: problem.severity, text: t(`problem.${problem.code}`, problem.params) })),
    ...buildProblems.filter((problem) => problem.file).map((problem) => ({ file: problem.file, line: problem.line, severity: problem.severity, text: problem.params.text })),
  ], [problems, buildProblems, t]);
  const result = results[name];
  const marks = useMemo(() => [
    ...codeProblems.filter((problem) => problem.file === name),
    ...(result?.errors ?? []).map((error) => ({ line: error.line, severity: "error", text: t(`codeError.${error.code}`, error.params) })),
  ], [codeProblems, name, result, t]);
  const fileHasProblem = (file) => codeProblems.some((problem) => problem.file === file && problem.severity === "error");

  /* ------------------------------------------------------------- commands */
  const canEdit = editable(name);
  const changePrefs = (patch) => setPrefs((value) => {
    const next = { ...value, ...patch };
    writePrefs(next);
    return next;
  });
  // A build or a run starts: its output is shown, even with the bottom panel folded.
  useEffect(() => {
    if (native !== "idle") setPrefs((value) => (value.bottom ? value : { ...value, bottom: true }));
  }, [native]);
  const fontStep = (step) => {
    const at = FONT_SIZES.indexOf(prefs.font);
    changePrefs({ font: FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (at < 0 ? 3 : at) + step))] });
  };
  const p = () => pane.current;
  const cmd = {
    newFile: { id: "new", icon: "new", label: t("editor.tb.new"), disabled: !appDir, run: startNew },
    save: { id: "save", icon: "save", label: t("editor.tb.save"), keys: "Ctrl+S", run: () => void flush() },
    rename: { id: "rename", icon: "label", label: t("editor.rename"), disabled: !isApp(name) || !appDir, run: () => startRename(name) },
    remove: { id: "delete", icon: "delete", label: t(armedDelete === name ? "editor.deleteAgain" : "editor.delete"), disabled: !isApp(name) || !appDir, run: () => void remove(name) },
    undo: { id: "undo", icon: "undo", label: t("cmd.undo"), keys: "Ctrl+Z", disabled: !info.undo || !canEdit, run: () => p()?.undo() },
    redo: { id: "redo", icon: "redo", label: t("cmd.redo"), keys: "Ctrl+Y", disabled: !info.redo || !canEdit, run: () => p()?.redo() },
    cut: { id: "cut", icon: "cut", label: t("cmd.cut"), keys: "Ctrl+X", disabled: !info.selected || !canEdit, run: () => p()?.cut() },
    copy: { id: "copy", icon: "copy", label: t("cmd.copy"), keys: "Ctrl+C", disabled: !info.selected, run: () => p()?.copy() },
    paste: { id: "paste", icon: "paste", label: t("cmd.paste"), keys: "Ctrl+V", disabled: !canEdit, run: () => p()?.paste() },
    deleteText: { id: "deleteText", icon: "close", label: t("cmd.delete"), keys: "Del", disabled: !info.selected || !canEdit, run: () => p()?.deleteSelection() },
    selectAll: { id: "selectAll", icon: "selectAll", label: t("cmd.selectAll"), keys: "Ctrl+A", run: () => p()?.selectAll() },
    find: { id: "find", icon: "search", label: t("editor.tb.find"), keys: "Ctrl+F", run: () => p()?.find() },
    replace: { id: "replace", icon: "replace", label: t("editor.tb.replace"), keys: "Ctrl+H", disabled: !canEdit, run: () => p()?.replace() },
    gotoLine: { id: "gotoLine", icon: "gotoLine", label: t("editor.tb.gotoLine"), keys: "Ctrl+G", run: () => p()?.gotoLine() },
    comment: { id: "comment", icon: "comment", label: t("editor.tb.comment"), keys: "Ctrl+/", disabled: !canEdit, run: () => p()?.comment() },
    indent: { id: "indent", icon: "indent", label: t("editor.tb.indent"), keys: "Ctrl+]", disabled: !canEdit, run: () => p()?.indent() },
    autoIndent: { id: "autoIndent", icon: "autoIndent", label: t("editor.tb.autoIndent"), keys: "Shift+Alt+F", disabled: !canEdit, run: () => p()?.autoIndent() },
    outdent: { id: "outdent", icon: "outdent", label: t("editor.tb.outdent"), keys: "Ctrl+[", disabled: !canEdit, run: () => p()?.outdent() },
    build: { id: "build", icon: "hammer", label: t("editor.tb.build"), keys: "Ctrl+B", disabled: running, run: () => void build() },
    run: { id: "run", icon: "native", label: t("editor.run"), keys: "F5", disabled: running, run: () => void run() },
    stop: { id: "stop", icon: "stop", label: t("editor.tb.stop"), keys: "Shift+F5", disabled: !running, run: stop },
    clean: { id: "clean", icon: "broom", label: t("editor.clean"), disabled: running, run: onClean },
    smaller: { id: "fontSmaller", icon: "zoomOut", label: t("editor.tb.smaller"), disabled: prefs.font <= FONT_SIZES[0], run: () => fontStep(-1) },
    bigger: { id: "fontBigger", icon: "zoomIn", label: t("editor.tb.bigger"), disabled: prefs.font >= FONT_SIZES[FONT_SIZES.length - 1], run: () => fontStep(1) },
    wrap: { id: "wrap", icon: "wrap", label: t("editor.tb.wrap"), pressed: prefs.wrap, run: () => changePrefs({ wrap: !prefs.wrap }) },
  };
  // Keys in this window belong to the editor, never to the main window behind it. CodeMirror has
  // had them first: what it did (its keymap prevents the default) is not done twice.
  const keys = (event) => {
    if (event.defaultPrevented) {
      event.stopPropagation();
      return undefined;
    }
    const mod = event.ctrlKey || event.metaKey;
    const letter = event.key.toLowerCase();
    const take = (command) => {
      event.preventDefault();
      event.stopPropagation();
      if (!command.disabled) command.run();
    };
    if (event.key === "Escape") return event.stopPropagation();
    if (event.key === "F5") return take(event.shiftKey ? cmd.stop : cmd.run);
    if (event.key === "F1") return take({ run: onGuide });
    if (mod && letter === "s") return take(cmd.save);
    if (mod && letter === "h") return take(cmd.replace);
    if (mod && letter === "b") return take(cmd.build);
    if (mod || event.key === "Delete" || event.key.startsWith("Arrow")) event.stopPropagation();
    return undefined;
  };
  const viewModelOf = (word) => viewModels(project).find((vm) => word.startsWith(`${vmPrefix(vm)}_`));
  const codeMenu = (event) => {
    const word = pane.current?.wordAtCaret() ?? "";
    const vm = viewModelOf(word);
    // A misspelled word under the pointer: its suggestions, and adding it to the dictionary.
    const wrong = spellCheck ? pane.current?.misspelledAt(event.clientX, event.clientY) : null;
    const suggestions = wrong ? (spellers.current[languageOf(wrong.word)]?.suggest(wrong.word) ?? []).slice(0, 5) : [];
    const spelling = wrong ? [
      ...suggestions.map((suggestion, index) => ({ id: `suggest-${index}`, icon: "check", label: suggestion, disabled: !canEdit, run: () => pane.current?.replaceRange(wrong.from, wrong.to, suggestion) })),
      ...(suggestions.length ? [] : [{ id: "suggest-none", icon: "info", label: t("spell.noSuggestion"), disabled: true, run: () => {} }]),
      { id: "addWord", icon: "add", label: t("spell.addWord", { word: wrong.word }), run: () => addWord(wrong.word) },
      "-",
    ] : [];
    const dictionary = [{ id: "dictionary", icon: "spellBook", label: t("spell.dictionaryMenu"), run: () => setSpellPanel(true) }, { ...spellTool, id: "spellToggle", label: t(spell.enabled ? "spell.turnOff" : "spell.turnOn") }];
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: [...spelling, cmd.undo, cmd.redo, "-", cmd.cut, cmd.copy, cmd.paste, cmd.deleteText, cmd.selectAll, "-", cmd.comment, cmd.indent, cmd.outdent, cmd.autoIndent, "-", cmd.find, cmd.replace, cmd.gotoLine,
        vm && { id: "openVm", icon: "viewModel", label: t("editor.menu.openVm", { vm: vm.name }), run: () => open(`src/glue/${vmPrefix(vm)}.c`) },
        "-", ...dictionary, "-", cmd.build, cmd.run, cmd.stop],
    });
  };
  const fileMenu = (event, file) => {
    event.preventDefault();
    event.stopPropagation();
    const app = isApp(file);
    const win = event.currentTarget.ownerDocument.defaultView;
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { id: "open", icon: "open", label: t("editor.menu.open"), run: () => open(file) },
        app && { ...cmd.rename, disabled: !appDir, run: () => startRename(file) },
        app && { ...cmd.remove, label: t(armedDelete === file ? "editor.deleteAgain" : "editor.delete"), disabled: !appDir, run: () => void remove(file) },
        "-",
        cmd.newFile,
        { id: "copyPath", icon: "copy", label: t("editor.menu.copyPath"), run: () => void win.navigator.clipboard.writeText(file).catch(() => {}) },
      ],
    });
  };

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
    status = <span className="code-note" data-editor-status="readonly"><Icon name="lock" size={14} /> {t(readOnlyReason(name))}</span>;
  }

  const tool = (command, { iconOnly = false } = {}) => (
    <button
      type="button"
      key={command.id}
      aria-label={command.label}
      className={(command.pressed ? "editor-tool pressed" : "editor-tool") + (iconOnly ? " icon-only" : "")}
      data-editor-command={command.id}
      disabled={command.disabled}
      aria-pressed={command.pressed}
      title={command.keys ? `${command.label} (${command.keys})` : command.label}
      onPointerDown={(event) => event.preventDefault()}
      onClick={command.run}
    >
      <Icon name={command.icon} size={iconOnly ? 15 : 16} />
      {!iconOnly && <span>{command.label}</span>}
    </button>
  );
  const spellTool = { id: "spell", icon: "spell", label: t("spell.toggleTip"), keys: "", pressed: spell.enabled, run: () => onSpell({ ...spell, enabled: !spell.enabled }) };
  // The file list and the bottom panel: on or off, from the toolbar's right end and from their own title bars.
  const toggleFiles = () => changePrefs({ files: !prefs.files });
  const toggleBottom = () => changePrefs({ bottom: !prefs.bottom });
  const filesTool = { id: "files", icon: prefs.files ? "foldLeft" : "unfoldLeft", label: t(prefs.files ? "editor.tb.filesHide" : "editor.tb.filesShow"), pressed: prefs.files, run: toggleFiles };
  const bottomTool = { id: "bottom", icon: prefs.bottom ? "foldBottom" : "unfoldBottom", label: t(prefs.bottom ? "editor.tb.bottomHide" : "editor.tb.bottomShow"), pressed: prefs.bottom, run: toggleBottom };
  const showOutput = (tab) => {
    setBottom(tab);
    if (!prefs.bottom) changePrefs({ bottom: true });
  };
  const groups = [
    [cmd.newFile, cmd.save, cmd.rename, cmd.remove],
    [cmd.undo, cmd.redo],
    [cmd.cut, cmd.copy, cmd.paste],
    [cmd.find, cmd.replace, cmd.gotoLine],
    [cmd.comment, cmd.indent, cmd.outdent, cmd.autoIndent],
    [spellTool, { id: "dictionary", icon: "spellBook", label: t("spell.dictionaryMenu"), pressed: spellPanel, run: () => setSpellPanel((value) => !value) }],
    [cmd.build, cmd.run, cmd.stop, cmd.clean],
    [filesTool, bottomTool],
  ];

  const nameInput = (from) => (
    <input
      key={from ?? "new"}
      className={validNew(fullName(naming.value), from) ? "text-input editor-name" : "text-input editor-name invalid"}
      data-editor-name=""
      autoFocus
      value={naming.value}
      title={t("editor.nameTip")}
      onChange={(event) => setNaming({ ...naming, value: event.target.value })}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") void finishNaming();
        if (event.key === "Escape") setNaming(null);
      }}
      onBlur={() => setNaming(null)}
    />
  );
  const treeGroup = (title, icon, files, app) => (
    <section className="editor-group" data-editor-group={app ? "app" : "generated"}>
      <h4>
        <Icon name={icon} size={14} />
        <span>{title}</span>
        {app && appDir && <button type="button" className="mini" data-command="editor-new" title={t("editor.newFile")} aria-label={t("editor.newFile")} onClick={startNew}><Icon name="add" size={14} /></button>}
      </h4>
      {app && naming?.mode === "new" && nameInput(null)}
      {files.map((file) => (
        naming?.mode === "rename" && naming.from === file ? nameInput(file) : (
          <div key={file} className={file === name ? "editor-file selected" : "editor-file"} onContextMenu={(event) => fileMenu(event, file)}>
            <button type="button" className="editor-file-name" data-editor-file={file} title={file} onClick={() => open(file)}>
              <Icon name={/\.(h|hpp)$/.test(file) ? "conf" : "code"} size={13} />
              <span>{app ? file.slice(APP.length) : file}</span>
              {fileHasProblem(file) && <Icon name="error" size={12} />}
              {app && buffers[file] !== undefined && <i className="editor-dirty" title={t("editor.saving")} />}
              {!app && !isEditableCode(file) && <Icon name="lock" size={11} />}
            </button>
            {app && appDir && (
              <>
                <button type="button" className="mini" data-command="editor-rename" data-file={file} title={t("editor.rename")} aria-label={t("editor.rename")} onClick={() => startRename(file)}><Icon name="label" size={12} /></button>
                <button type="button" className={armedDelete === file ? "mini armed" : "mini"} data-command="editor-delete" data-file={file} title={t(armedDelete === file ? "editor.deleteAgain" : "editor.delete")} aria-label={t("editor.delete")} onClick={() => void remove(file)}><Icon name="delete" size={12} /></button>
              </>
            )}
          </div>
        )
      ))}
    </section>
  );

  const outputLines = bottom === "build" ? buildLines : logLines;
  // The build, the program's output and the problems always show their last line.
  const lastCount = bottom === "problems" ? codeProblems.length : outputLines.length;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [bottom, lastCount]);
  const close = () => {
    void flush();
    onClose();
  };
  return (
    <Dialog title={t("editor.title", { name: projectName })} icon="codeEditor" onClose={close} id="editor" width={1280} height={800} bare standsFree keepOnEscape ownGrip>
      <div className="editor-window" data-editor="" data-min-width={minimumWidth || undefined} style={{ "--editor-font": `${prefs.font}px`, minWidth: minimumWidth || undefined, minHeight: MIN_HEIGHT }} onKeyDown={keys}>
        <div className="editor-bar" data-window-drag="" ref={barRef}>
          <span className="editor-bar-title" data-dialog-title=""><Icon name="codeEditor" /><span>{t("editor.title", { name: projectName })}</span></span>
          <span className="editor-state" data-editor-native={native}>{native === "building" ? t("status.building") : native === "running" ? t("status.native") : ""}</span>
          <span className="guide-bar-gap" />
          <button type="button" className="editor-tool" data-editor-command="guide" title={`${t("guide.editor")} (F1)`} onPointerDown={(event) => event.preventDefault()} onClick={onGuide}><Icon name="guide" size={16} /><span>{t("editor.tb.guide")}</span></button>
          <button type="button" className="editor-tool" data-editor-command="settings" title={t("cmd.preferences")} onPointerDown={(event) => event.preventDefault()} onClick={onSettings}><Icon name="settings" size={16} /><span>{t("editor.tb.settings")}</span></button>
          <button type="button" className="editor-tool" data-editor-command="about" title={t("cmd.about")} onPointerDown={(event) => event.preventDefault()} onClick={onAbout}><Icon name="about" size={16} /><span>{t("editor.tb.about")}</span></button>
          <WindowButtons t={t} onClose={close} />
        </div>
        <div className="editor-toolbar" role="toolbar" data-editor-toolbar="" ref={toolbarReady}>
          {groups.map((group, index) => (
            <span className={group[0].id === "files" ? "editor-tool-group editor-tool-end" : "editor-tool-group"} key={index}>{group.map((command) => tool(command, { iconOnly: true }))}</span>
          ))}
        </div>
        <div className={prefs.files ? "editor-main" : "editor-main no-files"}>
          {!prefs.files && (
            <button type="button" className="panel-strip editor-strip" data-editor-expand="files" title={t("editor.tb.filesShow")} aria-label={t("editor.tb.filesShow")} onClick={toggleFiles}>
              <Icon name="unfoldLeft" size={16} />
              <Icon name="open" />
              <span>{t("editor.panel.files")}</span>
            </button>
          )}
          <nav className="editor-tree" data-editor-tree="" hidden={!prefs.files}>
            <div className="editor-panel-title" data-editor-panel-title="files">
              <Icon name="open" size={14} />
              <span>{t("editor.panel.files")}</span>
              <button type="button" className="mini" data-editor-fold="files" title={t("editor.tb.filesHide")} aria-label={t("editor.tb.filesHide")} onClick={toggleFiles}><Icon name="foldLeft" size={16} /></button>
            </div>
            {treeGroup(t("editor.appGroup"), "viewModel", appFiles, true)}
            {treeGroup(t("editor.generatedGroup"), "build", generatedFiles, false)}
          </nav>
          <div className="editor-body">
            <div className="code-tab-bar">
              <div className="code-tabs">
                {tabs.map((file) => (
                  <span key={file} className={file === name ? "editor-tab active" : "editor-tab"} onContextMenu={(event) => fileMenu(event, file)}>
                    <button type="button" data-editor-tab={file} title={file} onClick={() => open(file)}>{file.split("/").pop()}{isApp(file) && buffers[file] !== undefined ? " •" : ""}</button>
                    <button type="button" className="mini" aria-label={t("dialog.close")} title={t("dialog.close")} onClick={() => closeTab(file)}><Icon name="close" size={10} /></button>
                  </span>
                ))}
              </div>
            </div>
            <CodePane
              ref={pane}
              file={name}
              text={textOf(name)}
              readOnly={!canEdit}
              marks={marks}
              wrap={prefs.wrap}
              language={language}
              spell={spellCheck}
              tabSize={tabSize}
              items={items}
              focus={focus}
              actions={{ save: () => void flush(), run: () => void run(), stop, gotoLine: () => p()?.gotoLine() }}
              onChange={change}
              onInfo={setInfo}
              onLeave={settle}
              onMenu={codeMenu}
            />
          </div>
        </div>
        <div className={prefs.bottom ? "editor-bottom" : "editor-bottom folded"} data-editor-bottom-panel={prefs.bottom ? "open" : "folded"}>
          <div className="bottom-tabs">
            <button type="button" data-editor-bottom="build" className={bottom === "build" && prefs.bottom ? "active" : undefined} onClick={() => showOutput("build")}><Icon name="build" /> {t("panel.build")}</button>
            <button type="button" data-editor-bottom="log" className={bottom === "log" && prefs.bottom ? "active" : undefined} onClick={() => showOutput("log")}><Icon name="log" /> {t("editor.output")}</button>
            <button type="button" data-editor-bottom="problems" className={bottom === "problems" && prefs.bottom ? "active" : undefined} onClick={() => showOutput("problems")}>
              <Icon name="problems" /> {t("panel.problems")}
              {codeProblems.length > 0 && <b className="problem-count" data-errors={codeProblems.some((item) => item.severity === "error") ? "" : undefined}>{codeProblems.length}</b>}
            </button>
            <button type="button" className="mini bottom-fold" data-editor-fold="bottom" title={t(prefs.bottom ? "editor.tb.bottomHide" : "editor.tb.bottomShow")} aria-label={t(prefs.bottom ? "editor.tb.bottomHide" : "editor.tb.bottomShow")} onClick={toggleBottom}><Icon name={prefs.bottom ? "collapseDown" : "collapseUp"} size={14} /></button>
          </div>
          {!prefs.bottom ? null : bottom === "problems" ? (
            <div className="editor-list" data-editor-problems="" ref={listRef}>
              {codeProblems.length === 0 && <div className="problems-empty"><Icon name="check" /> {t("problem.none")}</div>}
              {codeProblems.map((problem, index) => (
                <button type="button" key={index} className="editor-problem" data-editor-problem={`${problem.file}:${problem.line}`} onClick={() => open(problem.file, problem.line)}>
                  <Icon name={problem.severity === "error" ? "error" : "warning"} size={13} />
                  <span className="editor-where">{problem.file}:{problem.line}</span>
                  <span>{problem.text}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="editor-list log-list" data-editor-output={bottom} ref={listRef}>
              {outputLines.map((line, index) => {
                const found = bottom === "build" ? parseBuildProblems([line.text])[0] : null;
                return found?.file ? (
                  <button type="button" key={index} className={`log-line editor-jump ${line.kind ?? ""}`} onClick={() => open(found.file, found.line)}>
                    <time>{line.time}</time><span>{line.text}</span>
                  </button>
                ) : (
                  <div className={`log-line ${line.kind ?? ""}`} key={index}><time>{line.time}</time><span>{line.text}</span></div>
                );
              })}
            </div>
          )}
        </div>
        <WindowMinimum width={minimumWidth ? minimumWidth + minimum.frame : 0} height={MIN_HEIGHT} />
        <div className="statusbar editor-statusbar" data-editor-statusbar="">
          <span className="status-cell editor-status-note">{status}</span>
          <span className="status-cell" data-editor-position="">{t("editor.position", { line: info.line, column: info.column })}{info.selected ? ` · ${t("editor.selected", { count: info.selected })}` : ""}</span>
          <span className="status-cell" data-editor-lines="">{t("editor.lines", { count: info.lines })}</span>
          <span className="status-cell" data-editor-mode="">{canEdit ? (isApp(name) ? t("editor.mode.logic") : t("editor.mode.design")) : t("editor.mode.readOnly")}</span>
          <span className="status-cell editor-view-tools" data-editor-view="">
            {tool(cmd.smaller, { iconOnly: true })}
            <span className="editor-font-size" title={t("editor.fontSize")}>{prefs.font}px</span>
            {tool(cmd.bigger, { iconOnly: true })}
          </span>
          <span className="status-cell editor-view-tools">
            {tool(cmd.wrap)}
          </span>
          <span className="status-end"><ResizeGrip /></span>
        </div>
        {spellPanel && <SpellPanel t={t} spell={spell} onSpell={onSpell} onPickWordList={onPickWordList} onClose={() => setSpellPanel(false)} />}
        {menu && <EditorMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      </div>
    </Dialog>
  );
}
