// The LVGL settings window: lv_conf.h as controls. Its contents come from the lv_conf_template.h
// of the project's own LVGL version, so each version gets its own window.
import { useEffect, useMemo, useState } from "react";
import { Dialog, versionChoices } from "./dialogs.jsx";
import { ColorField, IconSelect, Stepper, Toggle } from "./controls.jsx";
import { Icon } from "./icons.jsx";
import { host } from "./host.js";
import { engineFor } from "./lvgl/versions.js";
import { confActive, confDefault, confNeeds, confValue, parseConfTemplate, setConfValue, unknownOverrides, validConfValue } from "./lvgl/lvconf.js";

/** The file a version's options come from: the installed one, else the bundled one. */
async function loadTemplate(version) {
  const installed = await host.lvglConfTemplate(version).catch(() => null);
  if (installed?.text) return { kind: "installed", path: installed.path, text: installed.text };
  const { CONF_TEMPLATES } = await import("./lvgl/confTemplates.js");
  if (CONF_TEMPLATES[version]) return { kind: "bundled", version, text: CONF_TEMPLATES[version] };
  const { engine } = engineFor(version);
  return { kind: "nearest", version: engine, text: CONF_TEMPLATES[engine] };
}

const hexOf = (value) => `#${(/0x([0-9a-f]{1,6})/i.exec(value)?.[1] ?? "000000").padStart(6, "0")}`;

function TextValue({ id, value, onChange, t }) {
  const [typing, setTyping] = useState(null);
  const shown = typing ?? value;
  const valid = validConfValue(shown);
  return (
    <input
      className={valid ? "text-input conf-text" : "text-input conf-text invalid"}
      data-field={id}
      value={shown}
      spellCheck={false}
      title={valid ? shown : t("conf.badValue")}
      onChange={(event) => {
        setTyping(event.target.value);
        if (validConfValue(event.target.value)) onChange(event.target.value);
      }}
      onBlur={() => setTyping(null)}
    />
  );
}

function ConfControl({ option, value, onChange, t }) {
  const id = `conf-${option.name}`;
  if (option.kind === "bool") return <Toggle id={id} checked={value === "1"} onChange={(on) => onChange(on ? "1" : "0")} />;
  if (option.kind === "enum") {
    const choices = option.choices.includes(value) ? option.choices : [value, ...option.choices];
    return <IconSelect id={id} value={value} options={choices.map((item) => ({ value: item, label: item, icon: "conf" }))} onChange={onChange} />;
  }
  if (option.kind === "int") {
    const number = Number.parseInt(value, 10);
    if (String(number) === value.trim()) return <Stepper id={id} value={number} onChange={(next) => onChange(String(next))} />;
  }
  if (option.kind === "color") {
    return <ColorField id={id} value={hexOf(value)} onChange={(next) => next && onChange(`lv_color_hex(0x${next.slice(1)})`)} />;
  }
  return <TextValue id={id} value={value} onChange={onChange} t={t} />;
}

export function LvConfDialog({ t, store, installed, onVersion, onClose }) {
  const project = store.project;
  const overrides = project.lvConf;
  const [source, setSource] = useState(null);
  const [section, setSection] = useState(null);
  const [search, setSearch] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);

  useEffect(() => {
    let alive = true;
    setSource(null);
    loadTemplate(project.lvgl).then((loaded) => {
      if (alive) setSource(loaded);
    });
    return () => {
      alive = false;
    };
  }, [project.lvgl, installed]);

  const model = useMemo(() => (source ? parseConfTemplate(source.text) : null), [source]);
  const titles = model?.sections.map((item) => item.title) ?? [];
  const current = titles.includes(section) ? section : titles[0];
  const edit = (name, value) => store.update((draft) => setConfValue(draft, model, name, value), { coalesce: `conf:${name}` });
  const changedIn = (item) => item.groups.reduce((sum, group) => sum + group.names.filter((name) => overrides?.[name] !== undefined).length, 0);

  // A search or the changed filter looks through every section.
  const query = search.trim().toLowerCase();
  const matches = (option) => (!onlyChanged || overrides?.[option.name] !== undefined) && (!query || option.name.toLowerCase().includes(query) || option.description.toLowerCase().includes(query));
  const shown = !model ? [] : model.sections
    .filter((item) => query || onlyChanged || item.title === current)
    .flatMap((item) => item.groups.map((group) => ({ key: `${item.title}/${group.title}`, section: item.title, title: group.title, names: group.names.filter((name) => matches(model.options.get(name))) })))
    .filter((group) => group.names.length);
  const unknown = model ? unknownOverrides(model, overrides) : [];
  const count = overrides ? Object.keys(overrides).length : 0;

  let origin = "";
  if (source?.kind === "installed") origin = source.path;
  else if (source?.kind === "bundled") origin = t("conf.bundled", { version: source.version });
  else if (source?.kind === "nearest") origin = t("conf.nearest", { engine: source.version, version: project.lvgl });

  return (
    <Dialog
      title={t("conf.title")}
      icon="conf"
      onClose={onClose}
      id="lvconf"
      width={900}
      footer={(
        <>
          <button type="button" data-command="conf-reset-all" disabled={!count} onClick={() => store.update((draft) => { delete draft.lvConf; })}><Icon name="undo" /> {t("conf.resetAll")}</button>
          <span className="conf-count" data-conf-count={count}>{t("conf.changed", { count })}</span>
          <button type="button" className="primary" data-command="conf-close" onClick={onClose}><Icon name="close" size={14} /> {t("dialog.close")}</button>
        </>
      )}
    >
      <div className="conf-window">
        <div className="conf-head">
          <span className="conf-label">{t("settings.version")}</span>
          <IconSelect id="confVersion" value={project.lvgl} options={versionChoices(t, installed, project.lvgl)} onChange={onVersion} />
          <span className="conf-label">{t("conf.source")}</span>
          <code className="conf-source" data-conf-source={source?.kind ?? ""} title={origin}>{origin || t("conf.loading")}</code>
          <span className="conf-label">{t("conf.output")}</span>
          <code className="conf-source">config/lv_conf.h</code>
        </div>
        <p className="conf-note" data-conf-note=""><Icon name="info" size={14} /> {t("conf.engineNote")}</p>
        {unknown.length > 0 && (
          <p className="conf-note conf-unknown" data-conf-unknown={unknown.length}>
            <Icon name="warning" size={14} />
            <span title={unknown.join(", ")}>{t("conf.unknown", { count: unknown.length, names: unknown.slice(0, 4).join(", ") })}</span>
            <button type="button" className="conf-link" data-command="conf-drop-unknown" onClick={() => store.update((draft) => {
              for (const name of unknown) delete draft.lvConf[name];
              if (!Object.keys(draft.lvConf).length) delete draft.lvConf;
            })}><Icon name="delete" size={14} /> {t("conf.dropUnknown")}</button>
          </p>
        )}
        <div className="conf-tools">
          <span className="conf-search"><Icon name="search" size={14} /><input className="text-input" data-field="confSearch" placeholder={t("conf.search")} value={search} onChange={(event) => setSearch(event.target.value)} /></span>
          <span className="conf-filter"><Toggle id="confOnlyChanged" checked={onlyChanged} onChange={setOnlyChanged} /> {t("conf.onlyChanged")}</span>
          <span className="conf-total" data-conf-total={model?.options.size ?? 0}>{t("conf.total", { count: model?.options.size ?? 0 })}</span>
        </div>
        <div className="conf-layout">
          <nav className="conf-sections" data-conf-sections="">
            {model?.sections.map((item) => {
              const changed = changedIn(item);
              return (
                <button type="button" key={item.title} data-conf-section={item.title} className={item.title === current && !query && !onlyChanged ? "active" : undefined} title={item.title} onClick={() => { setSection(item.title); setSearch(""); setOnlyChanged(false); }}>
                  <span className="conf-section-name"><Icon name="conf" size={14} /> {item.title}</span>
                  {changed > 0 && <b>{changed}</b>}
                </button>
              );
            })}
          </nav>
          <div className="conf-options" data-conf-options="">
            {model && shown.length === 0 && <p className="start-empty" data-conf-empty="">{t("conf.none")}</p>}
            {shown.map((group) => (
              <section key={group.key}>
                {(group.title || query || onlyChanged) && <h4>{query || onlyChanged ? `${group.section}${group.title ? ` › ${group.title}` : ""}` : group.title}</h4>}
                {group.names.map((name) => {
                  const option = model.options.get(name);
                  const value = confValue(model, overrides, name);
                  const active = confActive(model, overrides, name);
                  const changed = overrides?.[name] !== undefined;
                  const standard = confDefault(model, overrides, name);
                  return (
                    <div key={name} className={`conf-row${active ? "" : " off"}${changed ? " changed" : ""}`} data-conf={name} data-changed={changed ? "" : undefined} data-active={active ? "" : undefined}>
                      <div className="conf-name">
                        <code>{name}</code>
                        {option.description && <span title={option.description}>{option.description.replace(/\n/g, " ")}</span>}
                        {!active && <em>{t("conf.needs", { condition: confNeeds(model, name) })}</em>}
                      </div>
                      <fieldset className="conf-value" disabled={!active}>
                        <ConfControl option={option} value={value} onChange={(next) => edit(name, next)} t={t} />
                      </fieldset>
                      <button type="button" className="mini" data-conf-reset={name} disabled={!changed} title={t("conf.reset", { value: standard || "-" })} aria-label={t("conf.reset", { value: standard || "-" })} onClick={() => edit(name, undefined)}><Icon name="undo" size={14} /></button>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
