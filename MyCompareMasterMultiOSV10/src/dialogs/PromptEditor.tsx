/**
 * The terminal prompt editor, in two halves because it is two jobs.
 *
 * `PromptPresets` (Settings › Prompt) is the one most people want: a live preview of three
 * states, a card per preset drawn with the real renderer, the switches for which segments
 * show and what shape they take, and the colour per repository state.
 *
 * `PromptCustom` (Settings › Custom prompts) is the other: the prompts the user saved
 * under a name, and the master–detail editor behind them — the segment list on the left,
 * everything about the selected segment on the right.
 *
 * Both edit the same config and report every change through `onChange`, which the settings
 * dialog writes at once, so the terminal behind the window follows along live.
 */
import { useMemo, useState } from "react";
import React from "react";
import {
  clonePrompt,
  defaultTemplate,
  GIT_STATE_COLORS,
  GIT_STATE_NAMES,
  normalizePrompt,
  PRESETS,
  SAMPLE_STATES,
  SEGMENT_STYLES,
  SEGMENT_TYPES,
  type CustomPrompt,
  type Preset,
  type PromptConfig,
  type PromptSegment,
  type SegmentStyle,
  type SegmentType,
} from "../../core/prompt.js";
import type { Translate } from "../../core/i18n.js";
import { Icon } from "../icons.js";
import { Prompt } from "../Prompt.js";
import { Button, Field } from "./parts.js";

/** The path styles the detail editor offers; the quick list below is shorter on purpose. */
const PATH_STYLES = ["full", "folder", "agnoster", "agnoster_full", "agnoster_short", "agnoster_left", "letter", "mixed", "unique"];

/** Order and default colours of the segments the quick switches can add. */
const QUICK: [SegmentType, string, string][] = [
  ["os", "#0077c2", "#ffffff"],
  ["session", "#c386f1", "#ffffff"],
  ["shell", "#5c6bc0", "#ffffff"],
  ["path", "#ff479c", "#ffffff"],
  ["git", "auto", "#1b1e24"],
  ["executiontime", "#83769c", "#ffffff"],
  ["status", "#00897b", "#ffffff"],
  ["time", "#2e9599", "#ffffff"],
];
const QUICK_ORDER = QUICK.map(([type]) => type);

export type PromptEditorProps = {
  value: PromptConfig;
  onChange: (config: PromptConfig) => void;
  custom: CustomPrompt[];
  /** Stores the list, optionally switching to one of its prompts at the same time. */
  onCustomChange: (list: CustomPrompt[], apply?: PromptConfig) => void;
  language: string;
  t: Translate;
};

/** Everything both halves need worked out once from the config. */
function usePrompt({ value, custom, language }: Pick<PromptEditorProps, "value" | "custom" | "language">) {
  const config = useMemo(() => normalizePrompt(value), [value]);
  // Built-in presets and the user's own, looked up alike.
  const presets = useMemo<Record<string, Preset>>(() => ({
    ...PRESETS,
    ...Object.fromEntries(custom
      .filter((entry) => entry && entry.id && entry.config)
      .map((entry) => [entry.id, {
        label: entry.label,
        labelEn: entry.label,
        config: { ...normalizePrompt(entry.config), preset: entry.id },
        custom: true,
      } satisfies Preset])),
  }), [custom]);
  const presetLabel = (id: string) => (presets[id] ? (language === "en" ? presets[id].labelEn : presets[id].label) : "");
  const modified = Boolean(config.preset && presets[config.preset])
    && JSON.stringify(config) !== JSON.stringify(normalizePrompt(presets[config.preset].config));
  const currentCustom = config.preset && presets[config.preset]?.custom
    ? custom.find((entry) => entry.id === config.preset) ?? null
    : null;
  return { config, presets, presetLabel, modified, currentCustom };
}

/* ------------------------------------------------------------------ *
 * Settings › Prompt
 * ------------------------------------------------------------------ */

export function PromptPresets({ value, onChange, custom, language, t }: Omit<PromptEditorProps, "onCustomChange">) {
  const { config, presets, presetLabel, modified } = usePrompt({ value, custom, language });
  const update = (change: (draft: PromptConfig) => void) => {
    const draft = clonePrompt(config);
    change(draft);
    onChange(normalizePrompt(draft));
  };

  const allSegments = config.blocks.flatMap((block) => block.segments);
  const styled = allSegments.find((segment) => segment.type !== "text");
  const shape: SegmentStyle = styled ? styled.style : "powerline";
  const pathSegment = allSegments.find((segment) => segment.type === "path");
  const twoLines = config.blocks.length > 1;

  const shows = (type: SegmentType) =>
    allSegments.some((segment) => segment.type === type && segment.enabled !== false);

  /** A segment the theme does not have yet is added in the usual order and shape. */
  const toggleType = (type: SegmentType, on: boolean) => update((draft) => {
    const existing = draft.blocks.flatMap((block) => block.segments).filter((segment) => segment.type === type);
    if (existing.length) {
      for (const segment of existing) segment.enabled = on;
      return;
    }
    if (!on) return;
    const [, background, foreground] = QUICK.find((entry) => entry[0] === type) as [SegmentType, string, string];
    const segment: PromptSegment = {
      type,
      enabled: true,
      style: shape,
      powerline_symbol: "",
      foreground: shape === "plain" ? (type === "git" ? "auto" : "foreground") : foreground,
      background: shape === "plain" ? "transparent" : background,
      leading_diamond: "",
      trailing_diamond: "",
      template: defaultTemplate(type),
      properties: type === "status" ? { always_enabled: true } : {},
    };
    const segments = draft.blocks[0].segments;
    const rank = QUICK_ORDER.indexOf(type);
    let at = segments.findIndex((item) => QUICK_ORDER.indexOf(item.type) > rank && item.type !== "text");
    if (at < 0) at = segments.length && segments[segments.length - 1].type === "text" ? segments.length - 1 : segments.length;
    segments.splice(at, 0, segment);
  });

  const setShape = (next: SegmentStyle) => update((draft) => {
    for (const block of draft.blocks) {
      for (const segment of block.segments) {
        if (segment.type === "text" && next !== "plain") continue;
        segment.style = next;
        if (next === "plain") {
          segment.background = "transparent";
          if (segment.foreground === "background") segment.foreground = "accent";
        } else if (segment.background === "transparent") {
          segment.background = (QUICK.find((entry) => entry[0] === segment.type) ?? [segment.type, "accent", ""])[1];
        }
      }
    }
  });

  const setPathStyle = (style: string) => update((draft) => {
    for (const block of draft.blocks) {
      for (const segment of block.segments) {
        if (segment.type !== "path") continue;
        segment.properties = {
          ...segment.properties,
          style,
          max_depth: style === "agnoster_short" ? 3 : Number(segment.properties.max_depth) || 1,
        };
      }
    }
  });

  const setTwoLines = (on: boolean) => update((draft) => {
    if (on && draft.blocks.length === 1) {
      draft.blocks.push({
        type: "prompt",
        alignment: "left",
        newline: true,
        segments: [{
          type: "status",
          enabled: true,
          style: "plain",
          foreground: "#7cfc8b",
          background: "transparent",
          foreground_templates: ["{{ if gt .Code 0 }}#ff5c5c{{ end }}"],
          powerline_symbol: "",
          leading_diamond: "",
          trailing_diamond: "",
          template: "❯",
          properties: { always_enabled: true },
        }],
      });
    } else if (!on && draft.blocks.length > 1) {
      const first = draft.blocks[0];
      for (const block of draft.blocks.slice(1)) {
        for (const segment of block.segments) {
          if (segment.type !== "status" || segment.template !== "❯") first.segments.push(segment);
        }
      }
      draft.blocks = [first];
    }
  });

  return (
    <div className="prompt-editor">
      <pre className="term-out pe-preview" title={t("pe.preview")}>
        {(["clean", "dirty", "plain"] as const).map((sample) => (
          <React.Fragment key={sample}>
            <Prompt config={config} state={SAMPLE_STATES[sample]} title={t(`pe.sample.${sample}` as "pe.sample.clean")} />
            <span className="muted">{t(`pe.sample.${sample}` as "pe.sample.clean")}</span>
            {"\n"}
          </React.Fragment>
        ))}
      </pre>

      <p className="field-note">
        {t("pe.presets")}
        <span className="muted">
          {config.preset && presets[config.preset]
            ? t(modified ? "pe.currentModified" : "pe.current", presetLabel(config.preset))
            : t("pe.customCurrent")}
        </span>
      </p>
      <div className="pe-presets">
        {Object.entries(presets).map(([id, preset]) => (
          <button
            type="button"
            key={id}
            className={`pe-preset${config.preset === id ? " active" : ""}${preset.custom ? " custom" : ""}`}
            data-preset={id}
            title={language === "en" ? preset.labelEn : preset.label}
            onClick={() => onChange(clonePrompt(preset.config))}
          >
            <pre className="term-out pe-preset-out"><Prompt config={preset.config} state={SAMPLE_STATES.mini} /></pre>
            <span className="pe-preset-name ellipsis">
              {preset.custom ? <span className="pe-star">★</span> : null}
              {language === "en" ? preset.labelEn : preset.label}
            </span>
          </button>
        ))}
      </div>

      <p className="field-note">{t("pe.customize")}</p>
      <div className="pe-quick">
        <span className="muted">{t("pe.show")}</span>
        {QUICK.map(([type]) => (
          <label className="pe-check" key={type}>
            <input
              type="checkbox"
              data-field={`pe-show-${type}`}
              checked={shows(type)}
              onChange={(event) => toggleType(type, event.target.checked)}
            />
            {t(`pe.type.${type}` as "pe.type.path")}
          </label>
        ))}
      </div>
      <div className="pe-quick">
        <span className="muted">{t("pe.shape")}</span>
        <select className="select" data-field="pe-shape" value={shape}
          onChange={(event) => setShape(event.target.value as SegmentStyle)}>
          {SEGMENT_STYLES.map((style) => (
            <option key={style} value={style}>{t(`pe.style.${style}` as "pe.style.plain")}</option>
          ))}
        </select>
        <span className="muted">{t("pe.pathStyle")}</span>
        <select
          className="select"
          data-field="pe-path-style"
          value={String(pathSegment?.properties.style ?? "full")}
          disabled={!pathSegment}
          onChange={(event) => setPathStyle(event.target.value)}
        >
          <option value="full">{t("pe.pathFull")}</option>
          <option value="folder">{t("pe.pathFolder")}</option>
          <option value="agnoster_short">{t("pe.pathShort")}</option>
          <option value="agnoster">{t("pe.pathAgnoster")}</option>
        </select>
        <label className="pe-check">
          <input type="checkbox" data-field="pe-two-lines" checked={twoLines}
            onChange={(event) => setTwoLines(event.target.checked)} />
          {t("pe.twoLines")}
        </label>
        <label className="pe-check">
          <input type="checkbox" data-field="pe-final-space" checked={config.final_space !== false}
            onChange={(event) => update((draft) => { draft.final_space = event.target.checked; })} />
          {t("pe.finalSpace")}
        </label>
      </div>

      <div className="pe-quick pe-gitcolors">
        <label className="pe-check" title={t("pe.gitColorsTip")}>
          <input type="checkbox" data-field="pe-git-colors" checked={config.git_state_colors !== false}
            onChange={(event) => update((draft) => { draft.git_state_colors = event.target.checked; })} />
          {t("pe.gitColors")}
        </label>
        {GIT_STATE_NAMES.map((name) => (
          <label className="pe-gitcolor" key={name} title={t(`terminal.gs.${name}` as "terminal.gs.none")}>
            <input
              type="color"
              data-field={`pe-git-${name}`}
              value={config.git_colors[name]}
              disabled={config.git_state_colors === false}
              onChange={(event) => update((draft) => { draft.git_colors[name] = event.target.value; })}
            />
            <span style={{ color: config.git_colors[name] }}>{t(`pe.gs.${name}` as "pe.gs.modified")}</span>
          </label>
        ))}
        <Button
          icon="refresh"
          name="pe-git-reset"
          disabled={GIT_STATE_NAMES.every((name) => config.git_colors[name] === GIT_STATE_COLORS[name])}
          onClick={() => update((draft) => { draft.git_colors = { ...GIT_STATE_COLORS }; })}
        >
          {t("pe.gs.reset")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Settings › Custom prompts
 * ------------------------------------------------------------------ */

export function PromptCustom({ value, onChange, custom, onCustomChange, language, t }: PromptEditorProps) {
  const { config, presets, presetLabel, modified, currentCustom } = usePrompt({ value, custom, language });
  const [selected, setSelected] = useState({ block: 0, segment: 0 });
  const [note, setNote] = useState("");

  const update = (change: (draft: PromptConfig) => void) => {
    const draft = clonePrompt(config);
    change(draft);
    onChange(normalizePrompt(draft));
  };

  const saveCustom = () => {
    const id = `custom-${Date.now().toString(36)}`;
    const base = config.preset && presets[config.preset]
      ? presetLabel(config.preset).replace(/\s*\(.*\)$/, "")
      : "Prompt";
    const label = `${base} ${t("pe.customCopy")}`;
    const stored = { ...clonePrompt(config), preset: id };
    onCustomChange([...custom, { id, label, config: stored }], stored);
    setNote(t("pe.customSaved", label));
  };
  const updateCustom = () => {
    if (!currentCustom) return;
    onCustomChange(custom.map((entry) => (entry.id === currentCustom.id
      ? { ...entry, config: { ...clonePrompt(config), preset: entry.id } }
      : entry)));
    setNote(t("pe.customSaved", currentCustom.label));
  };
  const renameCustom = (label: string) => {
    if (!currentCustom) return;
    onCustomChange(custom.map((entry) => (entry.id === currentCustom.id ? { ...entry, label } : entry)));
  };
  const removeCustom = () => {
    if (!currentCustom) return;
    onCustomChange(custom.filter((entry) => entry.id !== currentCustom.id), clonePrompt(PRESETS.default.config));
    setSelected({ block: 0, segment: 0 });
    setNote("");
  };

  const styled = config.blocks.flatMap((block) => block.segments).find((segment) => segment.type !== "text");
  const shape: SegmentStyle = styled ? styled.style : "powerline";
  const newSegment = (type: SegmentType): PromptSegment => ({
    type,
    enabled: true,
    style: shape,
    powerline_symbol: "",
    foreground: "#ffffff",
    background: (QUICK.find((entry) => entry[0] === type) ?? [type, "#4cc9f0", ""])[1],
    leading_diamond: "",
    trailing_diamond: "",
    template: defaultTemplate(type),
    properties: {},
  });

  const block = config.blocks[selected.block];
  const current = block?.segments[selected.segment] ?? null;
  const swatch = (segment: PromptSegment) =>
    (segment.background && segment.background !== "transparent" && segment.background.startsWith("#")
      ? segment.background
      : "var(--hover)");

  return (
    <div className="prompt-editor">
      <pre className="term-out pe-preview small" title={t("pe.preview")}>
        {(["clean", "dirty"] as const).map((sample) => (
          <React.Fragment key={sample}>
            <Prompt config={config} state={SAMPLE_STATES[sample]} />
            {"\n"}
          </React.Fragment>
        ))}
      </pre>

      <p className="field-note">{t("pe.customPrompts")}</p>
      <div className="pe-quick">
        <Button icon="plus" name="pe-save-custom" onClick={saveCustom}>{t("pe.saveCustom")}</Button>
        {currentCustom ? (
          <>
            <input
              className="text-input"
              data-field="pe-custom-name"
              value={currentCustom.label}
              placeholder={t("pe.customName")}
              spellCheck={false}
              onChange={(event) => renameCustom(event.target.value)}
            />
            <Button icon="save" name="pe-update-custom" disabled={!modified} title={t("pe.updateCustomTip")}
              onClick={updateCustom}>
              {t("pe.updateCustom")}
            </Button>
            <Button icon="trash" name="pe-delete-custom" onClick={removeCustom}>{t("pe.deleteCustom")}</Button>
          </>
        ) : (
          <span className="muted">{t("pe.customHint")}</span>
        )}
        {note ? <span className="muted ellipsis" title={note}>{note}</span> : null}
      </div>

      <p className="field-note">{t("pe.segments")}</p>
      <div className="pe-advanced">
        <div className="pe-list">
          <div className="pe-list-rows">
            {config.blocks.map((item, blockIndex) => (
              <React.Fragment key={blockIndex}>
                <div className="pe-list-block">
                  <span>{t("pe.block", blockIndex + 1)}</span>
                  {blockIndex > 0 ? (
                    <button type="button" className="icon-button" title={t("pe.removeBlock")}
                      onClick={() => update((draft) => { draft.blocks.splice(blockIndex, 1); })}>
                      <Icon name="close" size={11} />
                    </button>
                  ) : null}
                </div>
                {item.segments.map((segment, segmentIndex) => (
                  <button
                    type="button"
                    key={segmentIndex}
                    className={`pe-list-row${selected.block === blockIndex && selected.segment === segmentIndex ? " active" : ""}`
                      + `${segment.enabled === false ? " off" : ""}`}
                    onClick={() => setSelected({ block: blockIndex, segment: segmentIndex })}
                  >
                    <span className="pe-swatch" style={{ background: swatch(segment) }} />
                    <span className="ellipsis">
                      {t(`pe.type.${segment.type}` as "pe.type.path")}
                      {segment.type === "text" ? ` "${segment.template.trim().slice(0, 12)}"` : ""}
                    </span>
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>
          <div className="pe-list-tools">
            <select
              className="select"
              data-field="pe-add-segment"
              value=""
              onChange={(event) => {
                const type = event.target.value as SegmentType;
                if (!type) return;
                update((draft) => {
                  const at = Math.min(selected.block, draft.blocks.length - 1);
                  draft.blocks[at].segments.push(newSegment(type));
                  setSelected({ block: at, segment: draft.blocks[at].segments.length - 1 });
                });
              }}
            >
              <option value="">{t("pe.addSegment")}</option>
              {SEGMENT_TYPES.map((type) => (
                <option key={type} value={type}>{t(`pe.type.${type}` as "pe.type.path")}</option>
              ))}
            </select>
            <button type="button" className="icon-button" title={t("pe.up")} disabled={!current || selected.segment === 0}
              onClick={() => update((draft) => {
                const list = draft.blocks[selected.block].segments;
                [list[selected.segment - 1], list[selected.segment]] = [list[selected.segment], list[selected.segment - 1]];
                setSelected({ ...selected, segment: selected.segment - 1 });
              })}>
              <Icon name="up" size={13} />
            </button>
            <button
              type="button"
              className="icon-button"
              title={t("pe.down")}
              disabled={!current || selected.segment >= (block?.segments.length ?? 0) - 1}
              onClick={() => update((draft) => {
                const list = draft.blocks[selected.block].segments;
                [list[selected.segment + 1], list[selected.segment]] = [list[selected.segment], list[selected.segment + 1]];
                setSelected({ ...selected, segment: selected.segment + 1 });
              })}
            >
              <Icon name="down" size={13} />
            </button>
            <button type="button" className="icon-button" title={t("pe.remove")} disabled={!current}
              onClick={() => update((draft) => {
                draft.blocks[selected.block].segments.splice(selected.segment, 1);
                setSelected({ ...selected, segment: Math.max(0, selected.segment - 1) });
              })}>
              <Icon name="trash" size={13} />
            </button>
            <button type="button" className="icon-button" title={t("pe.addBlock")}
              onClick={() => update((draft) => {
                draft.blocks.push({ type: "prompt", alignment: "left", newline: true, segments: [newSegment("text")] });
                setSelected({ block: draft.blocks.length - 1, segment: 0 });
              })}>
              <Icon name="plus" size={13} />
            </button>
          </div>
        </div>
        <div className="pe-detail">
          {current ? (
            <SegmentFields
              segment={current}
              t={t}
              onChange={(next) => update((draft) => { draft.blocks[selected.block].segments[selected.segment] = next; })}
            />
          ) : (
            <p className="muted">{t("pe.selectHint")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One segment's fields
 * ------------------------------------------------------------------ */

function ColorField({ value, onChange, t }: { value: string; onChange: (value: string) => void; t: Translate }) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#888888";
  return (
    <span className="pe-color">
      <input type="color" value={hex} title={t("pe.pickColor")} onChange={(event) => onChange(event.target.value)} />
      <input className="text-input mono" value={value} spellCheck={false} list="pe-color-names"
        onChange={(event) => onChange(event.target.value)} />
    </span>
  );
}

function SegmentFields({ segment, onChange, t }: {
  segment: PromptSegment;
  onChange: (segment: PromptSegment) => void;
  t: Translate;
}) {
  const set = <K extends keyof PromptSegment>(key: K, value: PromptSegment[K]) => onChange({ ...segment, [key]: value });
  const setProperty = (key: string, value: unknown) =>
    onChange({ ...segment, properties: { ...segment.properties, [key]: value } });
  const properties = segment.properties;
  const lines = (list: string[] | undefined) => (Array.isArray(list) ? list.join("\n") : "");
  const fromLines = (text: string) => {
    const list = text.split("\n").map((line) => line.trim()).filter(Boolean);
    return list.length ? list : undefined;
  };

  return (
    <div className="pe-fields">
      <datalist id="pe-color-names">
        {["accent", "foreground", "background", "auto", "transparent", "parentBackground"].map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <Field label={t("pe.type")}>
        <select
          className="select"
          data-field="pe-segment-type"
          value={segment.type}
          onChange={(event) => onChange({
            ...segment,
            type: event.target.value as SegmentType,
            template: defaultTemplate(event.target.value),
            properties: {},
          })}
        >
          {SEGMENT_TYPES.map((type) => (
            <option key={type} value={type}>{t(`pe.type.${type}` as "pe.type.path")}</option>
          ))}
        </select>
        <select className="select" data-field="pe-segment-style" value={segment.style}
          onChange={(event) => set("style", event.target.value as SegmentStyle)}>
          {SEGMENT_STYLES.map((style) => (
            <option key={style} value={style}>{t(`pe.style.${style}` as "pe.style.plain")}</option>
          ))}
        </select>
        <label className="pe-check">
          <input type="checkbox" data-field="pe-segment-enabled" checked={segment.enabled !== false}
            onChange={(event) => set("enabled", event.target.checked)} />
          {t("pe.enabled")}
        </label>
      </Field>

      <Field label={t("pe.colors")}>
        <ColorField value={segment.foreground} t={t} onChange={(value) => set("foreground", value)} />
        <ColorField value={segment.background} t={t} onChange={(value) => set("background", value)} />
      </Field>

      <Field label={t("pe.template")}>
        <input className="text-input mono" data-field="pe-segment-template" value={segment.template} spellCheck={false}
          onChange={(event) => set("template", event.target.value)} />
      </Field>

      <Field label={t("pe.bgTemplates")} hint={t("pe.templatesHint")}>
        <textarea
          className="text-input mono"
          data-field="pe-segment-bg-templates"
          rows={2}
          spellCheck={false}
          placeholder="{{ if .Working.Changed }}#ff9248{{ end }}"
          value={lines(segment.background_templates)}
          onChange={(event) => set("background_templates", fromLines(event.target.value))}
        />
      </Field>

      {segment.type === "path" ? (
        <Field label={t("pe.pathStyle")}>
          <select className="select" data-field="pe-segment-path-style" value={String(properties.style ?? "full")}
            onChange={(event) => setProperty("style", event.target.value)}>
            {PATH_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
          </select>
          <span className="muted">{t("pe.maxDepth")}</span>
          <input className="text-input narrow" type="number" min={1} max={20} data-field="pe-segment-max-depth"
            title={t("pe.maxDepth")}
            value={Number(properties.max_depth) || 1}
            onChange={(event) => setProperty("max_depth", Number(event.target.value))} />
          <span className="muted">{t("pe.folderSep")}</span>
          <input className="text-input narrow mono" data-field="pe-segment-folder-sep"
            placeholder={t("pe.folderSepHint")}
            value={properties.folder_separator_icon === undefined ? "" : String(properties.folder_separator_icon)}
            onChange={(event) => setProperty("folder_separator_icon", event.target.value)} />
        </Field>
      ) : null}

      {segment.type === "git" ? (
        <Field label={t("pe.branchIcon")}>
          <input className="text-input mono" data-field="pe-segment-branch-icon"
            value={properties.branch_icon === undefined ? "⎇ " : String(properties.branch_icon)}
            onChange={(event) => setProperty("branch_icon", event.target.value)} />
        </Field>
      ) : null}

      {segment.type === "status" ? (
        <Field label={t("pe.alwaysEnabled")} hint={t("pe.alwaysEnabledHint")}>
          <input type="checkbox" data-field="pe-segment-always" checked={Boolean(properties.always_enabled)}
            onChange={(event) => setProperty("always_enabled", event.target.checked)} />
        </Field>
      ) : null}

      {segment.type === "executiontime" ? (
        <Field label={t("pe.threshold")} hint={t("pe.thresholdHint")}>
          <input className="text-input narrow" type="number" min={0} data-field="pe-segment-threshold"
            value={properties.threshold === undefined ? 500 : Number(properties.threshold)}
            onChange={(event) => setProperty("threshold", Number(event.target.value))} />
        </Field>
      ) : null}

      {segment.type === "os" ? (
        <Field label={t("pe.osIcons")} hint={t("pe.osIconsHint")}>
          {(["windows", "macos", "linux"] as const).map((key) => (
            <input
              key={key}
              className="text-input narrow mono"
              data-field={`pe-segment-os-${key}`}
              placeholder={key}
              value={properties[key] === undefined ? "" : String(properties[key])}
              onChange={(event) => setProperty(key, event.target.value)}
            />
          ))}
        </Field>
      ) : null}

      {segment.style === "diamond" ? (
        <Field label={t("pe.diamonds")}>
          <input className="text-input narrow mono" data-field="pe-segment-leading" value={segment.leading_diamond}
            onChange={(event) => set("leading_diamond", event.target.value)} />
          <input className="text-input narrow mono" data-field="pe-segment-trailing" value={segment.trailing_diamond}
            onChange={(event) => set("trailing_diamond", event.target.value)} />
        </Field>
      ) : null}

      <p className="pe-vars muted">{t(`pe.vars.${segment.type}` as "pe.vars.text")}</p>
    </div>
  );
}
