// The side and bottom panels: palette, component tree, attributes, code and log.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { ColorField, IconSelect, SizeField, Stepper, Toggle } from "./controls.jsx";
import { ACTION_IDS, GRID_CELL_PROPS, PALETTE, TRIGGERS, WIDGETS, availableIn } from "./lvgl/schema.js";
import { findNode, findParent, sanitizeName, setProp, walk } from "./lvgl/project.js";

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

export function Palette({ t, version, disabled, onDragStart, onAdd }) {
  return (
    <div className="panel-body palette">
      {PALETTE.map(({ group, items: all }) => ({ group, items: all.filter((type) => availableIn(type, version)) })).map(({ group, items }) => (
        <section key={group}>
          <h4>{t(`palette.${group}`)}</h4>
          <div className="palette-grid">
            {items.map((type) => (
              <button
                type="button"
                key={type}
                data-palette={type}
                className="palette-item"
                disabled={disabled}
                title={t(`widget.${type}`)}
                onPointerDown={(event) => event.button === 0 && onDragStart(type, event)}
                onDoubleClick={() => onAdd(type)}
              >
                <Icon name={WIDGETS[type].icon} />
                <span>{t(`widget.${type}`)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
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
  if (key === "duration") return "ms";
  if (key === "totalTicks" || key === "majorEvery") return t("unit.ticks");
  if (["year", "month", "day", "digits"].includes(key)) return t(`unit.${key}`);
  return t("unit.value");
}

function PropInput({ t, node, prop, edit, project, onImportImage }) {
  const value = node.props[prop.key];
  const set = (next) => edit(prop.key, next);
  switch (prop.kind) {
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
const TEXT_ACTIONS = new Set(["log", "setText"]);

function EventRow({ t, event, index, project, onChange, onRemove }) {
  const targets = useMemo(() => {
    const list = [];
    walk(project, (node) => {
      const isScreen = node.type === "screen";
      if (event.action === "screen" ? isScreen : !isScreen) list.push({ value: node.id, label: node.name, icon: WIDGETS[node.type].icon });
    });
    return list;
  }, [project, event.action]);
  return (
    <div className="event-row" data-event={index}>
      <div className="event-head">
        <IconSelect id="trigger" value={event.trigger} options={TRIGGERS.map((value) => ({ value, label: t(`trigger.${value}`) }))} onChange={(trigger) => onChange({ trigger })} />
        <button type="button" className="mini" title={t("event.remove")} aria-label={t("event.remove")} onClick={onRemove}><Icon name="delete" size={14} /></button>
      </div>
      <IconSelect id="action" value={event.action} options={Object.keys(ACTION_IDS).map((value) => ({ value, label: t(`action.${value}`) }))} onChange={(action) => onChange({ action, target: "" })} />
      {!NO_TARGET.has(event.action) && <IconSelect id="target" value={event.target} options={targets} title={t("event.target")} onChange={(target) => onChange({ target })} />}
      {TEXT_ACTIONS.has(event.action) && (
        <input className="text-input" data-field="eventText" placeholder={t("event.message")} value={event.text ?? ""} onChange={(input) => onChange({ text: input.target.value })} />
      )}
    </div>
  );
}

export function Attributes({ t, store, selected, readOnly, onImportImage }) {
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
      <section>
        <h4>{t("group.identity")}</h4>
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
      </section>
      {groups.map((group) => {
        const props = definition.props.filter((prop) => prop.group === group);
        if (!props.length) return null;
        return (
          <section key={group}>
            <h4>{t(`group.${group}`)}</h4>
            {props.map((prop) => (
              <Field key={prop.key} label={t(`prop.${prop.key}`)}>
                <PropInput t={t} node={node} prop={prop} edit={edit} project={project} onImportImage={onImportImage} />
              </Field>
            ))}
          </section>
        );
      })}
      {node.type !== "screen" && (
        <section>
          <h4>{t("group.events")}</h4>
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
        </section>
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

/** Read-only generated code with light syntax colours. */
export function CodeView({ files }) {
  const names = Object.keys(files);
  const [chosen, setName] = useState("src/ui/ui.c");
  const name = names.includes(chosen) ? chosen : names[0];
  const parts = useMemo(() => (files[name] ?? "").split(TOKEN), [files, name]);
  return (
    <div className="code-view">
      <div className="code-tabs">
        {names.map((item) => (
          <button type="button" key={item} data-code-tab={item} title={item} className={item === name ? "active" : undefined} onClick={() => setName(item)}>{item.split("/").pop()}</button>
        ))}
      </div>
      <pre data-code="">
        {parts.map((part, index) => (index % 2 ? <span key={index} className={classOf(part)}>{part}</span> : part))}
      </pre>
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
