// MVVM in the studio: the ViewModels tab of the bottom panel, and the binding editor of the
// Attributes panel. The document operations live in lvgl/viewmodel.js.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons.jsx";
import { IconSelect, Stepper, Toggle } from "./controls.jsx";
import { BIND_MODES, VM_TYPES, WIDGETS, bindAttr, defaultMode } from "./lvgl/schema.js";
import { findNode, screenOf } from "./lvgl/project.js";
import {
  addViewModel, addVmProp, allBindings, contextOf, editVmProp, findViewModel, fitValue, removeViewModel, removeVmProp,
  renameViewModel, renameVmProp, resolveBinding, setBinding, validVmName, viewModels,
} from "./lvgl/viewmodel.js";

export { bindNew } from "./lvgl/viewmodel.js";

const TYPE_ICON = { int: "spinbox", bool: "switch", string: "label" };

/** A name that is committed on Enter or when the field is left; until then it is a draft. */
function NameInput({ value, valid, onCommit, id, title }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const ok = draft === value || valid(draft);
  const commit = () => {
    if (draft !== value && valid(draft)) onCommit(draft);
    else setDraft(value);
  };
  return (
    <input
      className={ok ? "text-input vm-name" : "text-input vm-name invalid"}
      data-vm-field={id}
      value={draft}
      title={title}
      aria-invalid={!ok}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** An editor for one value of a property's type. */
function ValueInput({ prop, value, onChange, id, disabled }) {
  if (prop.type === "bool") return <Toggle id={id} checked={Boolean(value)} onChange={(next) => !disabled && onChange(next)} />;
  if (prop.type === "string") return <input className="text-input" data-vm-field={id} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
  const ranged = prop.min < prop.max;
  return <Stepper id={id} value={value} min={ranged ? prop.min : undefined} max={ranged ? prop.max : undefined} onChange={(next) => onChange(next === undefined ? 0 : next)} />;
}

/**
 * The ViewModels tab: every ViewModel with its properties, the widgets bound to each, and
 * while the design runs, the value each has now (which can be changed, as the logic would).
 */
export function ViewModelsView({ t, store, live, onLive, onSelectNode, readOnly }) {
  const project = store.project;
  const models = viewModels(project);
  const users = useMemo(() => {
    const map = new Map();
    for (const { node, binding } of allBindings(project)) {
      const found = resolveBinding(project, node, binding);
      if (!found) continue;
      if (!map.has(found.prop)) map.set(found.prop, []);
      map.get(found.prop).push({ node, binding });
    }
    return map;
  }, [project]);
  const change = (fn, coalesce) => store.update(fn, coalesce ? { coalesce } : undefined);
  const running = live !== null && live !== undefined;
  const locked = readOnly || running;

  return (
    <div className="vm-view" data-viewmodels="" data-running={running ? "" : undefined}>
      <div className="vm-toolbar">
        <button type="button" className="tool-button" data-command="vm-add" disabled={locked} onClick={() => change((draft) => void addViewModel(draft))}>
          <Icon name="add" size={14} /> {t("vm.add")}
        </button>
        <span className="vm-hint">{running ? t("vm.runHint") : models.length ? t("vm.hint") : t("vm.none")}</span>
      </div>
      {models.length > 0 && (
        <div className="vm-table" role="table">
          <div className="vm-head" role="row">
            <span role="columnheader">{t("vm.name")}</span>
            <span role="columnheader">{t("vm.type")}</span>
            <span role="columnheader">{t("vm.initial")}</span>
            <span role="columnheader">{t("vm.min")}</span>
            <span role="columnheader">{t("vm.max")}</span>
            <span role="columnheader">{running ? t("vm.now") : ""}</span>
            <span role="columnheader">{t("vm.usedBy")}</span>
            <span role="columnheader" />
          </div>
          <div className="vm-rows">
            {models.map((vm) => (
              <div key={vm.name} className="vm-group" data-vm={vm.name}>
                <div className="vm-model" role="row">
                  <span className="vm-model-name">
                    <Icon name="viewModel" size={14} />
                    {locked ? <b>{vm.name}</b> : (
                      <NameInput
                        id={`vm:${vm.name}`}
                        value={vm.name}
                        title={t("vm.nameTip")}
                        valid={(name) => validVmName(name) && !models.some((other) => other !== vm && other.name.toLowerCase() === name.toLowerCase())}
                        onCommit={(name) => change((draft) => void renameViewModel(draft, vm.name, name))}
                      />
                    )}
                  </span>
                  <span className="vm-model-note">{t("vm.contextOf", { screens: project.screens.filter((screen) => contextOf(project, screen) === vm.name).map((screen) => screen.name).join(", ") || "-" })}</span>
                  <span className="vm-actions">
                    <button type="button" className="mini" data-command="vm-prop-add" disabled={locked} title={t("vm.addProp")} aria-label={t("vm.addProp")} onClick={() => change((draft) => void addVmProp(draft, vm.name, "int"))}><Icon name="add" size={14} /></button>
                    <button type="button" className="mini" data-command="vm-remove" disabled={locked} title={t("vm.remove")} aria-label={t("vm.remove")} onClick={() => change((draft) => void removeViewModel(draft, vm.name))}><Icon name="delete" size={14} /></button>
                  </span>
                </div>
                {vm.props.length === 0 && <div className="vm-empty-row">{t("vm.noProps")}</div>}
                {vm.props.map((prop) => {
                  const key = `${vm.name}.${prop.name}`;
                  const bound = users.get(prop) ?? [];
                  const id = (what) => `${key}:${what}`;
                  return (
                    <div key={prop.name} className="vm-row" role="row" data-vm-prop={key}>
                      <span>
                        {locked ? <span className="vm-prop-name">{prop.name}</span> : (
                          <NameInput
                            id={id("name")}
                            value={prop.name}
                            title={t("vm.nameTip")}
                            valid={(name) => validVmName(name) && !vm.props.some((other) => other !== prop && other.name.toLowerCase() === name.toLowerCase())}
                            onCommit={(name) => change((draft) => void renameVmProp(draft, vm.name, prop.name, name))}
                          />
                        )}
                      </span>
                      <span>
                        <IconSelect id={id("type")} value={prop.type} options={VM_TYPES.map((type) => ({ value: type, label: t(`vm.type.${type}`), icon: TYPE_ICON[type] }))} onChange={(type) => !locked && change((draft) => void editVmProp(draft, vm.name, prop.name, { type }))} />
                      </span>
                      <span><ValueInput id={id("value")} prop={prop} value={prop.value} disabled={locked} onChange={(value) => !locked && change((draft) => void editVmProp(draft, vm.name, prop.name, { value }), `vm:${key}:value`)} /></span>
                      <span>{prop.type === "int" && <Stepper id={id("min")} value={prop.min} onChange={(min) => !locked && change((draft) => void editVmProp(draft, vm.name, prop.name, { min: min ?? 0 }), `vm:${key}:min`)} />}</span>
                      <span>{prop.type === "int" && <Stepper id={id("max")} value={prop.max} onChange={(max) => !locked && change((draft) => void editVmProp(draft, vm.name, prop.name, { max: max ?? 0 }), `vm:${key}:max`)} />}</span>
                      <span className="vm-now" data-vm-now={key}>
                        {running && live[key] !== undefined && <ValueInput id={id("now")} prop={prop} value={live[key]} onChange={(value) => onLive(key, fitValue(prop, value))} />}
                      </span>
                      <span className="vm-users">
                        {bound.length === 0 ? <span className="vm-unused">{t("vm.unused")}</span> : bound.map(({ node, binding }) => (
                          <button type="button" key={`${node.id}:${binding.prop}`} className="vm-user" data-vm-user={`${node.name}.${binding.prop}`} title={t("problem.toControl")} onClick={() => onSelectNode(node.id)}>
                            <Icon name={WIDGETS[node.type].icon} size={12} /> {node.name}.{binding.prop}
                          </button>
                        ))}
                      </span>
                      <span className="vm-actions">
                        <button type="button" className="mini" data-command="vm-prop-remove" disabled={locked} title={t("vm.removeProp")} aria-label={t("vm.removeProp")} onClick={() => change((draft) => void removeVmProp(draft, vm.name, prop.name))}><Icon name="delete" size={14} /></button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- binding */

const CONVERTERS_FOR = (attr, type) => {
  if (attr === "value") return type === "bool" ? ["none", "range", "invert"] : ["none", "range"];
  if (type === "bool") return ["none", "invert"];
  return ["none"];
};

/** The editor that replaces a bound property's value in the Attributes panel. */
export function BindingEditor({ t, store, node, binding }) {
  const project = store.project;
  const screen = screenOf(project, node.id);
  const context = contextOf(project, screen);
  const found = resolveBinding(project, node, binding);
  const attr = bindAttr(binding.prop);
  const update = (patch) => store.update((draft) => {
    const current = findNode(draft, node.id).bindings.find((item) => item.prop === binding.prop);
    setBinding(draft, node.id, binding.prop, { ...current, ...patch });
  }, { coalesce: `${node.id}:bind:${binding.prop}:${Object.keys(patch).join()}` });
  const paths = [];
  for (const vm of viewModels(project)) {
    for (const prop of vm.props) paths.push({ value: `${vm.name}.${prop.name}`, label: vm.name === context ? prop.name : `${vm.name}.${prop.name}`, icon: TYPE_ICON[prop.type], note: t(`vm.type.${prop.type}`) });
  }
  const chosen = found ? `${found.vm.name}.${found.prop.name}` : "";
  if (!found) paths.unshift({ value: "", label: t("bind.missing", { path: binding.vm ? `${binding.vm}.${binding.path}` : binding.path }), icon: "error" });
  const converters = CONVERTERS_FOR(attr, found?.prop.type);
  const fallback = defaultMode(node.type, binding.prop);
  return (
    <div className="binding" data-binding={binding.prop}>
      <div className="binding-head">
        <Icon name="link" size={14} />
        <IconSelect
          id={`bind-path:${binding.prop}`}
          value={chosen}
          options={paths}
          title={t("bind.path")}
          onChange={(value) => {
            if (!value) return;
            const [vm, ...rest] = value.split(".");
            update({ path: rest.join("."), vm: vm === context ? undefined : vm });
          }}
        />
        <button type="button" className="mini" data-command="unbind" data-unbind={binding.prop} title={t("bind.unbind")} aria-label={t("bind.unbind")} onClick={() => store.update((draft) => void setBinding(draft, node.id, binding.prop, null))}><Icon name="unlink" size={14} /></button>
      </div>
      <IconSelect
        id={`bind-mode:${binding.prop}`}
        value={binding.mode ?? "default"}
        title={t("bind.mode")}
        options={[{ value: "default", label: t("bind.modeDefault", { mode: t(`bind.mode.${fallback}`) }) }, ...BIND_MODES.map((mode) => ({ value: mode, label: t(`bind.mode.${mode}`) }))]}
        onChange={(mode) => update({ mode })}
      />
      {converters.length > 1 && (
        <IconSelect
          id={`bind-conv:${binding.prop}`}
          value={binding.converter ?? "none"}
          title={t("bind.converter")}
          options={converters.map((value) => ({ value, label: t(`bind.conv.${value}`) }))}
          onChange={(converter) => update({ converter })}
        />
      )}
      {attr === "text" && (
        <input className="text-input" data-field="bindFormat" placeholder={t("bind.format")} title={t("bind.formatTip")} value={binding.format ?? ""} onChange={(event) => update({ format: event.target.value || undefined })} />
      )}
    </div>
  );
}

/** The screen's data context: the ViewModel its bindings use when they name none. */
export function DataContextField({ t, store, screen }) {
  const project = store.project;
  const models = viewModels(project);
  if (!models.length) return null;
  return (
    <IconSelect
      id="dataContext"
      value={screen.dataContext && findViewModel(project, screen.dataContext) ? screen.dataContext : ""}
      options={[{ value: "", label: t("vm.contextDefault", { vm: models[0].name }), icon: "viewModel" }, ...models.map((vm) => ({ value: vm.name, label: vm.name, icon: "viewModel" }))]}
      onChange={(value) => store.update((draft) => {
        const target = findNode(draft, screen.id);
        if (value) target.dataContext = value;
        else delete target.dataContext;
      })}
    />
  );
}
