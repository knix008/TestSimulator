// The side and bottom panels: palette, component tree, attributes, code and log.
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { Icon } from "./icons.jsx";
import { ColorField, IconSelect, SizeField, Stepper, Toggle } from "./controls.jsx";
import { ACTION_IDS, FONT_SIZES, GRID_CELL_PROPS, PALETTE, TEXT_TARGETS, TRIGGERS, VALUE_TARGETS, WIDGETS, availableIn, bindableKeys } from "./lvgl/schema.js";
import { bindingOf } from "./lvgl/viewmodel.js";
import { BindingEditor, DataContextField, bindNew } from "./ViewModels.jsx";
import { DEFAULT_FONT_SIZE } from "./lvgl/emit.js";
import { fontData } from "./lvgl/fonts.js";
import { findNode, findParent, sanitizeName, setProp, walk } from "./lvgl/project.js";
import { isEditableCode } from "./lvgl/codeparse.js";

/** A panel's title bar: icon, title, and the button that folds the panel. */
export function PanelTitle({ icon, title, id, collapsed, collapseIcon, expandIcon, t, onToggle }) {
  return (
    <h3 data-panel-title={id}>
      <Icon name={icon} />
      <span className="panel-title-text">{title}</span>
      <button type="button" className="mini" data-collapse={id} aria-label={t(collapsed ? "panel.expand" : "panel.collapse")} title={t(collapsed ? "panel.expand" : "panel.collapse")} onClick={onToggle}>
        <Icon name={collapsed ? expandIcon : collapseIcon} size={14} />
      </button>
    </h3>
  );
}

/** A category inside a panel. Folded, its icon, title and the button to unfold it stay. */
function Group({ t, id, icon, title, folds, children }) {
  const key = `group:${id}`;
  const folded = Boolean(folds.collapsed[key]);
  const label = t(folded ? "panel.expand" : "panel.collapse");
  return (
    <section className={folded ? "group folded" : "group"} data-group={id} data-folded={folded ? "" : undefined}>
      <h4 className="group-title" onClick={() => folds.toggle(key)}>
        <Icon name={icon} size={14} />
        <span>{title}</span>
        <button type="button" className="mini" data-group-toggle={id} aria-expanded={!folded} aria-label={`${title}: ${label}`} title={label}><Icon name={folded ? "collapseDown" : "collapseUp"} size={12} /></button>
      </h4>
      {!folded && children}
    </section>
  );
}

const GROUP_ICONS = { identity: "info", layout: "container", content: "label", style: "theme", flags: "check", events: "log" };

export function Palette({ t, version, disabled, onDragStart, onAdd, folds }) {
  return (
    <div className="panel-body palette">
      {PALETTE.map(({ group, items: all }) => ({ group, items: all.filter((type) => availableIn(type, version)) })).map(({ group, items }) => (
        <Group key={group} t={t} id={`palette:${group}`} icon={WIDGETS[items[0]]?.icon ?? "grid"} title={t(`palette.${group}`)} folds={folds}>
          <div className="palette-grid">
            {items.map((type) => (
              <button
                type="button"
                key={type}
                data-palette={type}
                className="palette-item"
                disabled={disabled}
                title={t("palette.tip", { name: t(`widget.${type}`) })}
                onPointerDown={(event) => event.button === 0 && onDragStart(type, event)}
                onDoubleClick={() => onAdd(type)}
              >
                <Icon name={WIDGETS[type].icon} />
                <span>{t(`widget.${type}`)}</span>
              </button>
            ))}
          </div>
        </Group>
      ))}
    </div>
  );
}

/** The files as a tree of folders, folders first, each level by name. */
export function fileTree(paths) {
  const root = { name: "", path: "", folders: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split("/");
    const file = parts.pop();
    let folder = root;
    let at = "";
    for (const part of parts) {
      at = at ? `${at}/${part}` : part;
      if (!folder.folders.has(part)) folder.folders.set(part, { name: part, path: at, folders: new Map(), files: [] });
      folder = folder.folders.get(part);
    }
    folder.files.push({ name: file, path });
  }
  return root;
}

const fileIcon = (name) => {
  if (/\.mylvgl$/i.test(name)) return "projectFile";
  if (/\.(png|jpe?g|bmp|gif|webp|svg)$/i.test(name)) return "image";
  if (/\.(ttf|otf|ttc|otc)$/i.test(name)) return "fontFile";
  if (/\.h$/i.test(name) || /CMakeLists/.test(name)) return "conf";
  return "code";
};

/** The project as it is on disk: its folders and files. Choosing a file opens it. */
export function Explorer({ t, title, paths, current, onOpen }) {
  const [closed, setClosed] = useState({});
  const tree = useMemo(() => fileTree(paths), [paths]);
  const toggle = (path) => setClosed((state) => ({ ...state, [path]: !state[path] }));
  const render = (folder, depth) => {
    const folders = [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
    const files = [...folder.files].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <>
        {folders.map((item) => (
          <div key={item.path}>
            <button type="button" className="tree-row" data-explorer-folder={item.path} aria-expanded={!closed[item.path]} title={item.path} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(item.path)}>
              <Icon name={closed[item.path] ? "collapseRight" : "collapseDown"} size={11} />
              <Icon name="open" size={14} />
              <span className="tree-name">{item.name}</span>
            </button>
            {!closed[item.path] && render(item, depth + 1)}
          </div>
        ))}
        {files.map((item) => (
          <button type="button" key={item.path} className={item.path === current ? "tree-row selected" : "tree-row"} data-explorer={item.path} title={item.path} style={{ paddingLeft: 8 + depth * 14 + 15 }} onClick={() => onOpen(item.path)}>
            <Icon name={fileIcon(item.name)} size={14} />
            <span className="tree-name">{item.name}</span>
          </button>
        ))}
      </>
    );
  };
  return (
    <div className="panel-body tree explorer" data-explorer-tree="" aria-label={t("panel.explorer")}>
      <div className="explorer-root" title={title}><Icon name="open" size={14} /><span className="tree-name">{title}</span></div>
      {render(tree, 0)}
    </div>
  );
}

export function ComponentTree({ t, screen, selected, onSelect }) {
  const row = (node, depth) => (
    <div key={node.id}>
      <button
        type="button"
        data-tree={node.id}
        className={node.id === selected ? "tree-row selected" : "tree-row"}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(node.id)}
        title={t(`widget.${node.type}`)}
      >
        <Icon name={WIDGETS[node.type].icon} />
        <span className="tree-name">{node.name}</span>
        <span className="tree-type">{t(`widget.${node.type}`)}</span>
      </button>
      {node.children.map((child) => row(child, depth + 1))}
    </div>
  );
  return <div className="panel-body tree">{row(screen, 0)}</div>;
}

function Field({ label, children }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">{children}</span>
    </div>
  );
}

const PIXEL_PROPS = new Set(["x", "y", "borderWidth", "radius", "pad", "shadowWidth", "gap", "lineWidth", "columnWidth", "canvasW", "canvasH", "qrSize"]);

/** The unit a number is shown with. */
function unitOf(t, key) {
  if (PIXEL_PROPS.has(key)) return "px";
  if (key === "rotation") return "°";
  if (key === "scale") return "%";
  if (key === "bgOpa" || key === "opa" || key === "ledBright") return "/255";
  if (key === "selected" || key === "separator" || key.startsWith("grid")) return "#";
  if (key === "duration" || key === "animate") return "ms";
  if (key === "totalTicks" || key === "majorEvery") return t("unit.ticks");
  if (["year", "month", "day", "digits"].includes(key)) return t(`unit.${key}`);
  return t("unit.value");
}

function PropInput({ t, node, prop, edit, project, onImportImage, onOpenFonts }) {
  const value = node.props[prop.key];
  const set = (next) => edit(prop.key, next);
  // A project's font comes in any size; the built-in one only in the sizes it was made in.
  if (prop.key === "font" && (node.props.fontFamily !== undefined || project.defaultFont)) {
    return <Stepper id="font" unit="px" value={value} min={6} max={200} blank placeholder={String(DEFAULT_FONT_SIZE)} onChange={set} />;
  }
  switch (prop.kind) {
    case "fontFamily":
      return (
        <span className="image-field">
          <IconSelect
            id="fontFamily"
            value={value ?? ""}
            options={[{ value: "", label: t("font.builtin"), icon: "fontFile" }, ...(project.fonts ?? []).map((font) => ({ value: font.name, label: fontData(font.name)?.info.faces[font.face]?.full ?? font.name, icon: "fontFile" }))]}
            onChange={(next) => {
              if (next === "" && !FONT_SIZES.includes(Number(node.props.font))) edit("font", undefined);
              set(next === "" ? undefined : next);
            }}
          />
          <button type="button" className="wide-button" data-command="font-open" onClick={onOpenFonts}><Icon name="fontFile" /> {t("cmd.fonts")}</button>
        </span>
      );
    case "image":
      return (
        <span className="image-field">
          <IconSelect
            id="src"
            value={value ?? ""}
            options={[{ value: "", label: t("image.none") }, ...(project.images ?? []).map((image) => ({ value: image.name, label: image.name, icon: "image", note: `${image.w}×${image.h}` }))]}
            onChange={(next) => set(next === "" ? undefined : next)}
          />
          <button type="button" className="wide-button" data-command="image-import" onClick={() => onImportImage(node.id)}><Icon name="image" /> {t("image.import")}</button>
        </span>
      );
    case "target": {
      const options = [{ value: "", label: t("target.none") }];
      walk(project, (other) => {
        if (other.type === "textarea") options.push({ value: other.id, label: other.name, icon: "textarea" });
      });
      return <IconSelect id="target" value={value ?? ""} options={options} onChange={(next) => set(next === "" ? undefined : next)} />;
    }
    case "int":
      return <Stepper id={prop.key} unit={unitOf(t, prop.key)} value={value} min={prop.min} max={prop.max} blank placeholder={t("attr.theme")} onChange={set} />;
    case "size":
      return <SizeField id={prop.key} value={value} placeholder={t("attr.sizeHint")} onChange={set} />;
    case "color":
      return <ColorField id={prop.key} value={value} placeholder={t("attr.theme")} clearLabel={t("attr.clear")} onChange={set} />;
    case "bool":
      return <Toggle id={prop.key} checked={value} onChange={set} />;
    case "enum":
      return (
        <IconSelect
          id={prop.key}
          value={value ?? ""}
          options={[{ value: "", label: t("attr.theme") }, ...prop.options.map((option) => ({ value: option, label: prop.key === "font" ? `${option} px` : String(option) }))]}
          onChange={(next) => set(next === "" ? undefined : next)}
        />
      );
    case "lines":
      return <textarea className="text-input" data-field={prop.key} rows={4} value={value ?? ""} onChange={(event) => set(event.target.value)} />;
    default:
      return <input className="text-input" data-field={prop.key} value={value ?? ""} onChange={(event) => set(event.target.value)} />;
  }
}

const NO_TARGET = new Set(["log"]);
const TEXT_ACTIONS = new Set(["log", "setText", "showValue"]);
const VALUE_ACTIONS = new Set(["setValue", "showValue"]);

function EventRow({ t, event, index, project, onChange, onRemove }) {
  const targets = useMemo(() => {
    const list = [];
    walk(project, (node) => {
      const isScreen = node.type === "screen";
      const fits = event.action === "setValue" ? VALUE_TARGETS.has(node.type) : event.action === "showValue" ? TEXT_TARGETS.has(node.type) : true;
      if (fits && (event.action === "screen" ? isScreen : !isScreen)) list.push({ value: node.id, label: node.name, icon: WIDGETS[node.type].icon });
    });
    return list;
  }, [project, event.action]);
  return (
    <div className="event-row" data-event={index}>
      <div className="event-head">
        <IconSelect id="trigger" value={event.trigger} options={TRIGGERS.map((value) => ({ value, label: t(`trigger.${value}`) }))} onChange={(trigger) => onChange({ trigger })} />
        <button type="button" className="mini" title={t("event.remove")} aria-label={t("event.remove")} onClick={onRemove}><Icon name="delete" size={14} /></button>
      </div>
      <IconSelect id="action" value={event.action} options={Object.keys(ACTION_IDS).map((value) => ({ value, label: t(`action.${value}`) }))} onChange={(action) => onChange({ ...(VALUE_ACTIONS.has(action) ? { trigger: "VALUE_CHANGED", text: event.text || "%d" } : {}), action, target: "" })} />
      {!NO_TARGET.has(event.action) && <IconSelect id="target" value={event.target} options={targets} title={t("event.target")} onChange={(target) => onChange({ target })} />}
      {TEXT_ACTIONS.has(event.action) && (
        <input className="text-input" data-field="eventText" placeholder={t(event.action === "showValue" ? "event.format" : "event.message")} title={event.action === "showValue" ? t("event.formatTip") : undefined} value={event.text ?? ""} onChange={(input) => onChange({ text: input.target.value })} />
      )}
    </div>
  );
}

export function Attributes({ t, store, selected, readOnly, onImportImage, onOpenFonts, folds }) {
  const project = store.project;
  const node = selected ? findNode(project, selected) : null;
  if (!node) return <div className="panel-body empty-note">{t("attr.none")}</div>;
  const inGrid = findParent(project, node.id)?.type === "grid";
  const available = availableIn(node.type, project.lvgl);
  const definition = inGrid ? { ...WIDGETS[node.type], props: [...WIDGETS[node.type].props, ...GRID_CELL_PROPS] } : WIDGETS[node.type];
  const edit = (key, value) => {
    store.update((draft) => {
      setProp(findNode(draft, node.id), key, value);
    }, { coalesce: `${node.id}:${key}` });
  };
  const groups = ["layout", "content", "style", "flags"];
  const changeEvents = (change, coalesce) => store.update((draft) => {
    change(findNode(draft, node.id).events);
  }, { coalesce });
  return (
    <div className={readOnly ? "panel-body attributes read-only" : "panel-body attributes"}>
      {!available && <p className="form-note" data-note="unavailable">{t("widget.unavailable")}</p>}
      <Group t={t} id="attr:identity" icon={GROUP_ICONS.identity} title={t("group.identity")} folds={folds}>
        <Field label={t("prop.name")}>
          <input
            className="text-input"
            data-field="name"
            value={node.name}
            onChange={(event) => {
              const name = sanitizeName(event.target.value);
              store.update((draft) => {
                findNode(draft, node.id).name = name;
              }, { coalesce: `${node.id}:name` });
            }}
          />
        </Field>
        {node.type === "screen" && (project.viewModels ?? []).length > 0 && (
          <Field label={t("vm.dataContext")}>
            <DataContextField t={t} store={store} screen={node} />
          </Field>
        )}
      </Group>
      {groups.map((group) => {
        const props = definition.props.filter((prop) => prop.group === group);
        if (!props.length) return null;
        return (
          <Group key={group} t={t} id={`attr:${group}`} icon={GROUP_ICONS[group]} title={t(`group.${group}`)} folds={folds}>
            {props.map((prop) => {
              const input = <PropInput t={t} node={node} prop={prop} edit={edit} project={project} onImportImage={onImportImage} onOpenFonts={onOpenFonts} />;
              const binding = bindingOf(node, prop.key);
              if (binding) {
                return (
                  <Field key={prop.key} label={<span className="bound-label" title={t("bind.bound")}><Icon name="link" size={12} /> {t(`prop.${prop.key}`)}</span>}>
                    <BindingEditor t={t} store={store} node={node} binding={binding} />
                  </Field>
                );
              }
              if (!bindableKeys(node.type).includes(prop.key) || !available) return <Field key={prop.key} label={t(`prop.${prop.key}`)}>{input}</Field>;
              return (
                <Field key={prop.key} label={t(`prop.${prop.key}`)}>
                  <span className="bindable">
                    {input}
                    <button type="button" className="mini bind-button" data-bind={prop.key} title={t("bind.bind")} aria-label={t("bind.bind")} onClick={() => store.update((draft) => void bindNew(draft, node.id, prop.key))}><Icon name="link" size={14} /></button>
                  </span>
                </Field>
              );
            })}
          </Group>
        );
      })}
      {node.type !== "screen" && (
        <Group t={t} id="attr:events" icon={GROUP_ICONS.events} title={t("group.events")} folds={folds}>
          {node.events.map((event, index) => (
            <EventRow
              key={index}
              t={t}
              event={event}
              index={index}
              project={project}
              onChange={(patch) => changeEvents((events) => Object.assign(events[index], patch), `${node.id}:event:${index}:${Object.keys(patch).join()}`)}
              onRemove={() => changeEvents((events) => events.splice(index, 1))}
            />
          ))}
          <button
            type="button"
            className="wide-button"
            data-command="event-add"
            onClick={() => changeEvents((events) => events.push({ trigger: "CLICKED", action: "log", target: "", text: node.name }))}
          >
            <Icon name="add" /> {t("event.add")}
          </button>
        </Group>
      )}
    </div>
  );
}

const TOKEN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|#[a-z]+\b|\b(?:void|static|int|return|if|else|extern|const|true|false|NULL)\b|\b0x[0-9a-f]+\b|\b\d+\b|\bLV_[A-Z0-9_]+\b|\blv_[a-z0-9_]+\b)/g;

function classOf(token) {
  if (token.startsWith("/*") || token.startsWith("//")) return "c-comment";
  if (token.startsWith('"')) return "c-string";
  if (token.startsWith("#")) return "c-pre";
  if (/^(0x|\d)/.test(token)) return "c-number";
  if (token.startsWith("LV_")) return "c-const";
  if (token.startsWith("lv_")) return "c-call";
  return "c-key";
}

const CODE_DEBOUNCE = 250;

/**
 * The generated code, editable: what is typed reaches the design a moment later, and a change
 * in the design replaces the text. The colours are a <pre> under a transparent <textarea>.
 */
export function CodeView({ t, files, extra = {}, focus, readOnly, onEdit, width, onName }) {
  const generatedNames = Object.keys(files);
  const [chosen, setName] = useState("src/ui/ui.c");
  // A file outside the generated code (the project file, an image, a font) gets a tab while it is open.
  const names = extra[chosen] ? [...generatedNames, chosen] : generatedNames;
  const name = names.includes(chosen) ? chosen : names[0];
  const index = names.indexOf(name);
  const opened = extra[name];
  useEffect(() => {
    onName?.(name);
  }, [name, onName]);
  // Text being edited and what became of it, per file. Without an entry the file shows as generated.
  const [drafts, setDrafts] = useState({});
  const [results, setResults] = useState({});
  const text = opened ? opened.text ?? "" : drafts[name] ?? files[name] ?? "";
  const editable = !opened && !readOnly && isEditableCode(name);
  const result = results[name];
  const error = result?.errors[0];
  const parts = useMemo(() => text.split(TOKEN), [text]);
  const pre = useRef(null);
  const input = useRef(null);
  const tabs = useRef(null);
  const timer = useRef(null);
  const ownChange = useRef(false);
  const [lineHeight, setLineHeight] = useState(17.4);
  useEffect(() => {
    tabs.current?.querySelector(".active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [name]);
  useEffect(() => {
    if (focus) setName(focus.file);
  }, [focus]);

  // The design changed by anything but this editor: the code follows it.
  const generated = useRef(files);
  useEffect(() => {
    if (generated.current === files) return;
    generated.current = files;
    if (ownChange.current) {
      ownChange.current = false;
      return;
    }
    setDrafts({});
    setResults({});
  }, [files]);

  const commit = (file, value) => {
    clearTimeout(timer.current);
    timer.current = null;
    const outcome = onEdit(file, value);
    if (outcome.changed) ownChange.current = true;
    setResults((state) => ({ ...state, [file]: outcome }));
    return outcome;
  };
  const change = (value) => {
    setDrafts((state) => ({ ...state, [name]: value }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(name, value), CODE_DEBOUNCE);
  };
  // Leaving the editor: readable code is shown again as the design prints it.
  const settle = () => {
    const value = drafts[name];
    if (value === undefined) return;
    const outcome = timer.current ? commit(name, value) : results[name];
    if (outcome && !outcome.errors.length && !outcome.unused.length) {
      setDrafts(({ [name]: _settled, ...rest }) => rest);
      setResults(({ [name]: _done, ...rest }) => rest);
    }
  };
  const onKeyDown = (event) => {
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && editable) {
      event.preventDefault();
      document.execCommand("insertText", false, "    ");
    }
    if (event.key.toLowerCase() === "s" && event.ctrlKey && timer.current) commit(name, event.currentTarget.value);
  };
  const follow = (event) => {
    if (!pre.current) return;
    pre.current.scrollTop = event.currentTarget.scrollTop;
    pre.current.scrollLeft = event.currentTarget.scrollLeft;
  };
  const showLine = (line) => {
    const element = input.current;
    if (!element) return;
    const height = Number.parseFloat(getComputedStyle(element).lineHeight) || 17.4;
    element.scrollTop = Math.max(0, (line - 1) * height - element.clientHeight / 2);
    let at = 0;
    for (let row = 1; row < line; row++) at = text.indexOf("\n", at) + 1;
    element.focus();
    element.setSelectionRange(at, at);
  };

  const focusLine = focus && focus.file === name ? focus.line : null;
  useLayoutEffect(() => {
    if (!input.current) return;
    const height = Number.parseFloat(getComputedStyle(input.current).lineHeight) || 17.4;
    setLineHeight(height);
    if (!focusLine) return;
    const top = Math.max(0, (focusLine - 1) * height - input.current.clientHeight / 2);
    input.current.scrollTop = top;
    if (pre.current) pre.current.scrollTop = input.current.scrollTop;
  }, [focus, focusLine]);
  // A new file starts at its top, with the colours at the same place as the text.
  useLayoutEffect(() => {
    if (input.current && pre.current) {
      pre.current.scrollTop = input.current.scrollTop;
      pre.current.scrollLeft = input.current.scrollLeft;
    }
  }, [name, text]);

  // The application's own code is shown, never written: it is edited in the user's editor.
  let status = name.startsWith("src/app/")
    ? <span className="code-note" data-code-status="appfile"><Icon name="info" size={14} /> {t("code.appFile")}</span>
    : <span className="code-note" data-code-status="readonly"><Icon name="info" size={14} /> {t("code.readOnly")}</span>;
  if (error) {
    status = (
      <button type="button" className="code-note code-note-error" data-code-status="error" data-code-error={error.code} title={t("code.goToLine")} onClick={() => showLine(error.line)}>
        <Icon name="error" size={14} /> {t("code.line", { line: error.line })} {t(`codeError.${error.code}`, error.params)}
      </button>
    );
  } else if (result?.unused.length) {
    status = <span className="code-note code-note-warning" data-code-status="unused"><Icon name="warning" size={14} /> {t("code.unused", { lines: result.unused.slice(0, 6).join(", ") })}</span>;
  } else if (editable) {
    status = <span className="code-note" data-code-status="editable"><Icon name="code" size={14} /> {t(name.endsWith("main.c") ? "code.editableMain" : name.endsWith("/ui.c") ? "code.editableUi" : name.endsWith("lv_conf.h") ? "code.editableConf" : "code.editable")}</span>;
  }
  return (
    <div className="code-view" style={width ? { width } : undefined}>
      <div className="code-tab-bar">
        <div className="code-tabs" ref={tabs} onWheel={(event) => { event.currentTarget.scrollLeft += event.deltaY; }}>
          {names.map((item) => (
            <button type="button" key={item} data-code-tab={item} title={item} className={item === name ? "active" : undefined} onClick={() => setName(item)}>{item.split("/").pop()}</button>
          ))}
        </div>
        <span className="tab-nav">
          <button type="button" className="mini" data-command="code-prev" disabled={index <= 0} aria-label={t("code.prev")} title={t("code.prev")} onClick={() => setName(names[index - 1])}><Icon name="collapseLeft" size={14} /></button>
          <button type="button" className="mini" data-command="code-next" disabled={index >= names.length - 1} aria-label={t("code.next")} title={t("code.next")} onClick={() => setName(names[index + 1])}><Icon name="collapseRight" size={14} /></button>
        </span>
      </div>
      {opened?.image ? (
        <div className="code-image" data-code-image={name}><img src={opened.image} alt={name} /></div>
      ) : (
      <div className="code-edit">
        <pre data-code="" ref={pre} aria-hidden="true">
          {focusLine && !error && <i className="code-focus" data-code-focus={focusLine} style={{ top: 8 + (focusLine - 1) * lineHeight, height: lineHeight }} />}
          {error && <i className="code-focus code-error" data-code-error-line={error.line} style={{ top: 8 + (error.line - 1) * lineHeight, height: lineHeight }} />}
          {parts.map((part, at) => (at % 2 ? <span key={at} className={classOf(part)}>{part}</span> : part))}
        </pre>
        <textarea
          ref={input}
          key={name}
          data-code-input={name}
          aria-label={name}
          value={text}
          readOnly={!editable}
          wrap="off"
          spellCheck={false}
          onChange={(event) => change(event.target.value)}
          onScroll={follow}
          onBlur={settle}
          onKeyDown={onKeyDown}
        />
      </div>
      )}
      <div className="code-status">{status}</div>
    </div>
  );
}

const SEVERITY_ICON = { error: "error", warning: "warning", info: "info" };

/** The problems, as a list: choosing one goes to its control or to its code. */
export function ProblemsView({ t, problems, chosen, onChoose, onControl, onCode, onManager }) {
  if (!problems.length) {
    return <div className="problems-empty" data-problems="" data-empty=""><Icon name="check" /> {t("problem.none")}</div>;
  }
  return (
    <div className="problems" data-problems="" role="table">
      <div className="problem-head" role="row">
        <span role="columnheader">{t("problem.severity")}</span>
        <span role="columnheader">{t("problem.message")}</span>
        <span role="columnheader">{t("problem.where")}</span>
        <span role="columnheader">{t("problem.go")}</span>
      </div>
      <div className="problem-rows">
        {problems.map((problem) => (
          <div
            key={problem.key}
            role="row"
            tabIndex={0}
            data-problem={problem.code}
            data-severity={problem.severity}
            aria-selected={problem.key === chosen}
            className={problem.key === chosen ? "problem-row selected" : "problem-row"}
            onClick={() => onChoose(problem)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onChoose(problem);
            }}
          >
            <span className="problem-severity" title={t(`problem.${problem.severity}`)}><Icon name={SEVERITY_ICON[problem.severity]} size={14} /> {t(`problem.${problem.severity}`)}</span>
            <span className="problem-message" title={t(`problem.${problem.code}`, problem.params)}>{t(`problem.${problem.code}`, problem.params)}</span>
            <span className="problem-where" title={problem.where ?? problem.nodeName}>
              {problem.node && <Icon name={WIDGETS[problem.type].icon} size={14} />}
              {problem.where ?? (problem.node ? `${problem.screen} › ${problem.nodeName}` : "")}
            </span>
            <span className="problem-go">
              {problem.node && <button type="button" className="mini" data-problem-control="" title={t("problem.toControl")} aria-label={t("problem.toControl")} onClick={(event) => { event.stopPropagation(); onControl(problem); }}><Icon name="design" size={14} /></button>}
              {(problem.node || problem.file) && <button type="button" className="mini" data-problem-code="" disabled={!problem.hasCode} title={t(problem.hasCode ? "problem.toCode" : "problem.noCode")} aria-label={t("problem.toCode")} onClick={(event) => { event.stopPropagation(); onCode(problem); }}><Icon name="code" size={14} /></button>}
              {problem.manager && <button type="button" className="mini" data-problem-manager="" title={t("cmd.manager")} aria-label={t("cmd.manager")} onClick={(event) => { event.stopPropagation(); onManager(); }}><Icon name="manager" size={14} /></button>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LogView({ lines, id }) {
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [lines]);
  return (
    <div className="log-list" data-log={id}>
      {lines.map((line, index) => (
        <div className={`log-line ${line.kind ?? ""}`} key={index}>
          <time>{line.time}</time>
          <span>{line.text}</span>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
