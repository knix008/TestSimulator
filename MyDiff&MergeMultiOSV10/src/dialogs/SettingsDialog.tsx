/**
 * Settings.
 *
 * Tabs rather than one long scroll, because the window is a fixed size and must not
 * scroll; each setting is one line. Changes are written as they are made and published to
 * the other windows, so the app behind the dialog follows along live instead of waiting
 * for an OK.
 *
 * The terminal takes three tabs of its own. The first is the shell and how its output is
 * read; the second is the prompt — presets, which segments show, the colour per
 * repository state — and the third the prompts the user saved under a name, with the
 * segment-by-segment editor behind them. They are three because each is a whole screen's
 * work, and sharing one tab would have meant scrolling.
 */
import { useEffect, useMemo, useState } from "react";
import { LANGUAGES } from "../../core/i18n.js";
import {
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  MAX_FONT_SIZE,
  MAX_ZOOM,
  MIN_FONT_SIZE,
  MIN_ZOOM,
  recentKey,
  TERMINAL_CRS,
  TERMINAL_EOLS,
  type AppSettings,
  type TerminalCr,
  type TerminalEol,
} from "../../core/settings.js";
import type { CustomPrompt, PromptConfig } from "../../core/prompt.js";
import type { FontFamily } from "../../core/fonts.js";
import { CUSTOM_THEME_ID, HEADER_PALETTE, THEMES, type CustomTheme } from "../../core/themes.js";
import { api, type ToolRegistration } from "../api.js";
import type { DialogProps } from "../DialogHost.js";
import * as host from "../host.js";
import { Icon } from "../icons.js";
import { Button, Buttons, CheckField, Field, StepperField, TabPanel, Tabs } from "./parts.js";
import { PromptCustom, PromptPresets } from "./PromptEditor.js";

export function SettingsDialog({ payload, settings: initial, t, close }: DialogProps) {
  const requested = (payload as { tab?: string } | null)?.tab;
  const [tab, setTab] = useState(requested ?? "general");
  const [settings, setSettings] = useState<AppSettings & { settingsPath: string }>(initial);
  const [fonts, setFonts] = useState<FontFamily[]>([]);
  const [tools, setTools] = useState<{ diff: ToolRegistration; merge: ToolRegistration } | null>(null);
  // `null` until the check has answered: the list is built by starting each shell, so
  // for a moment there is nothing to show and "none installed" would be a lie.
  const [shells, setShells] = useState<{ id: string; label: string }[] | null>(null);

  useEffect(() => {
    api.fonts().then(setFonts).catch(() => setFonts([]));
    api.gitTools().then(setTools).catch(() => setTools(null));
    // Refreshed rather than cached: a shell installed since the app started should appear.
    api.termShells(true).then(setShells).catch(() => setShells([]));
  }, []);

  const save = async (patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    const saved = await api.updateSettings(patch).catch(() => null);
    if (saved) {
      setSettings(saved);
      host.publishSettings(saved);
    }
  };

  const monospace = useMemo(() => fonts.filter((font) => font.monospace), [fonts]);
  const proportional = useMemo(() => fonts.filter((font) => !font.monospace), [fonts]);
  const light = useMemo(() => THEMES.filter((item) => item.kind === "light"), []);
  const dark = useMemo(() => THEMES.filter((item) => item.kind === "dark"), []);
  const name = (item: { ko: string; en: string }) => (settings.language === "en" ? item.en : item.ko);

  const custom = (patch: Partial<CustomTheme>) =>
    save({ customTheme: { ...settings.customTheme, ...patch }, theme: CUSTOM_THEME_ID });

  return (
    <>
      <Tabs
        active={tab}
        onSelect={setTab}
        tabs={[
          { id: "general", label: t("settings.tab.general"), icon: "settings" },
          { id: "appearance", label: t("settings.tab.appearance"), icon: "theme" },
          { id: "custom", label: t("settings.tab.custom"), icon: "palette" },
          { id: "font", label: t("settings.tab.font"), icon: "font" },
          { id: "compare", label: t("settings.tab.compare"), icon: "compareFiles" },
          { id: "git", label: t("settings.tab.git"), icon: "git" },
          { id: "terminal", label: t("settings.tab.terminal"), icon: "terminal" },
          { id: "prompt", label: t("settings.tab.prompt"), icon: "code" },
          { id: "promptCustom", label: t("settings.tab.promptCustom"), icon: "bookmark" },
        ]}
      />

      <TabPanel active={tab} id="general">
        <Field label={t("settings.language")}>
          <select
            className="select"
            data-field="language"
            value={settings.language}
            onChange={(event) => void save({ language: event.target.value === "en" ? "en" : "ko" })}
          >
            {LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <CheckField label={t("settings.confirmExit")} name="confirmExit" icon="warning"
          checked={settings.confirmExit} onChange={(value) => void save({ confirmExit: value })} />
        <CheckField label={t("settings.restoreSession")} name="restoreSession" icon="session"
          checked={settings.restoreSession} onChange={(value) => void save({ restoreSession: value })} />
      </TabPanel>

      <TabPanel active={tab} id="appearance">
        <Field label={t("settings.theme")} hint={`${THEMES.length + 1}`}>
          <select
            className="select"
            data-field="theme"
            value={settings.theme}
            onChange={(event) => void save({ theme: event.target.value })}
          >
            <optgroup label={t("settings.themeLight")}>
              {light.map((item) => <option key={item.id} value={item.id}>{name(item)}</option>)}
            </optgroup>
            <optgroup label={t("settings.themeDark")}>
              {dark.map((item) => <option key={item.id} value={item.id}>{name(item)}</option>)}
            </optgroup>
            <optgroup label={t("settings.themeCustom")}>
              <option value={CUSTOM_THEME_ID}>{t("settings.themeCustom")}</option>
            </optgroup>
          </select>
        </Field>
        <StepperField
          label={t("cmd.view.zoomIn")} name="zoom"
          min={MIN_ZOOM} max={MAX_ZOOM} step={10} suffix="%"
          value={settings.zoom}
          onChange={(value) => void save({ zoom: value })}
        />

        <p className="field-note">{t("settings.panels")}</p>
        <CheckField label={t("settings.showLeftPanel")} name="showLeftPanel" icon="panelLeft"
          checked={settings.showLeftPanel} onChange={(value) => void save({ showLeftPanel: value })} />
        <CheckField label={t("settings.showRightPanel")} name="showRightPanel" icon="panelRight"
          checked={settings.showRightPanel} onChange={(value) => void save({ showRightPanel: value })} />
        <CheckField label={t("settings.showLogPanel")} name="showLogPanel" icon="list"
          checked={settings.showLogPanel} onChange={(value) => void save({ showLogPanel: value })} />
        <CheckField label={t("settings.showTerminalPanel")} name="showTerminalPanel" icon="terminal"
          checked={settings.showTerminalPanel} onChange={(value) => void save({ showTerminalPanel: value })} />
        <CheckField label={t("cmd.view.statusBar")} name="showStatusBar" icon="statusBar"
          checked={settings.showStatusBar} onChange={(value) => void save({ showStatusBar: value })} />
        <StepperField
          label={t("settings.panelWidth")} name="panelWidth"
          min={MIN_PANEL_WIDTH} max={MAX_PANEL_WIDTH} step={8} suffix="px"
          value={settings.leftPanelWidth}
          onChange={(value) => void save({ leftPanelWidth: value, rightPanelWidth: value })}
        />

        <p className="field-note">{t("settings.paneColors")}</p>
        {(["base", "local", "remote", "result"] as const).map((pane) => (
          <Field key={pane} label={t(`pane.${pane}` as Parameters<typeof t>[0])}>
            <span className="swatch-strip">
              {HEADER_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`swatch-chip${settings.headerColors[pane] === color ? " active" : ""}`}
                  style={{ background: color }}
                  title={color}
                  aria-label={`${pane} ${color}`}
                  onClick={() => void save({ headerColors: { ...settings.headerColors, [pane]: color } })}
                />
              ))}
            </span>
          </Field>
        ))}
      </TabPanel>

      <TabPanel active={tab} id="custom">
        <p className="field-note">{t("settings.customNote")}</p>
        <Field label={t("settings.customKind")}>
          <select
            className="select"
            data-field="customKind"
            value={settings.customTheme.kind}
            onChange={(event) => void custom({ kind: event.target.value === "dark" ? "dark" : "light" })}
          >
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select>
        </Field>
        {([
          ["bg", "settings.customBg"],
          ["panel", "settings.customPanel"],
          ["text", "settings.customText"],
          ["accent", "settings.customAccent"],
        ] as const).map(([key, label]) => (
          <Field key={key} label={t(label)}>
            <span className="color-field">
              <input
                type="color"
                className="color-input"
                data-field={`custom-${key}`}
                value={settings.customTheme[key]}
                aria-label={t(label)}
                onChange={(event) => void custom({ [key]: event.target.value } as Partial<CustomTheme>)}
              />
              <code className="code-line">{settings.customTheme[key]}</code>
            </span>
          </Field>
        ))}
        <Buttons>
          <Button icon="palette" name="useCustom" primary onClick={() => void save({ theme: CUSTOM_THEME_ID })}>
            {t("settings.useCustom")}
          </Button>
        </Buttons>
      </TabPanel>

      <TabPanel active={tab} id="font">
        <Field label={t("settings.fontFamily")} hint={`${fonts.length}`}>
          <select
            className="select"
            data-field="fontFamily"
            value={settings.font.family}
            onChange={(event) => void save({ font: { ...settings.font, family: event.target.value } })}
          >
            <option value={initial.font.family}>{t("settings.preview")} (default)</option>
            {monospace.length > 0 ? (
              <optgroup label="Monospace">
                {monospace.map((font) => <option key={font.family} value={font.family}>{font.family}</option>)}
              </optgroup>
            ) : null}
            {proportional.length > 0 ? (
              <optgroup label="Sans / Serif">
                {proportional.map((font) => <option key={font.family} value={font.family}>{font.family}</option>)}
              </optgroup>
            ) : null}
          </select>
        </Field>
        <StepperField
          label={t("settings.fontSize")} name="fontSize"
          min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} suffix="px"
          value={settings.font.size}
          onChange={(value) => void save({ font: { ...settings.font, size: value } })}
        />
        <Field label={t("settings.fontWeight")}>
          <select
            className="select"
            data-field="fontWeight"
            value={settings.font.weight}
            onChange={(event) =>
              void save({ font: { ...settings.font, weight: event.target.value === "bold" ? "bold" : "normal" } })}
          >
            <option value="normal">{t("settings.fontWeight.normal")}</option>
            <option value="bold">{t("settings.fontWeight.bold")}</option>
          </select>
        </Field>
        <Field label={t("settings.fontStyle")}>
          <select
            className="select"
            data-field="fontStyle"
            value={settings.font.style}
            onChange={(event) =>
              void save({ font: { ...settings.font, style: event.target.value === "italic" ? "italic" : "normal" } })}
          >
            <option value="normal">{t("settings.fontStyle.normal")}</option>
            <option value="italic">{t("settings.fontStyle.italic")}</option>
          </select>
        </Field>
        <div
          className="font-preview"
          data-testid="font-preview"
          style={{
            fontFamily: settings.font.family,
            fontSize: settings.font.size,
            fontWeight: settings.font.weight,
            fontStyle: settings.font.style,
          }}
        >
          ABCDEFG abcdefg 0123456789 한글 미리보기
        </div>
      </TabPanel>

      <TabPanel active={tab} id="compare">
        <CheckField label={t("settings.wordWrap")} name="wordWrap" icon="wrap"
          checked={settings.wordWrap} onChange={(value) => void save({ wordWrap: value })} />
        <CheckField label={t("settings.wordHighlight")} name="wordHighlight" icon="highlight"
          checked={settings.wordHighlight} onChange={(value) => void save({ wordHighlight: value })} />
        <CheckField label={t("view.differencesOnly")} name="differencesOnly" icon="filter"
          checked={settings.differencesOnly} onChange={(value) => void save({ differencesOnly: value })} />
        <CheckField label={t("settings.ignoreWhitespace")} name="ignoreWhitespace" icon="whitespace"
          checked={settings.ignoreWhitespace} onChange={(value) => void save({ ignoreWhitespace: value })} />
        <CheckField label={t("settings.ignoreCase")} name="ignoreCase" icon="letterCase"
          checked={settings.ignoreCase} onChange={(value) => void save({ ignoreCase: value })} />

        {/* The grammar rules. Unlike the switches above they change what counts as
            a difference by reading the file's language, so each one re-runs the
            comparison rather than only repainting it. */}
        <p className="field-note">{t("settings.grammarRules")}</p>
        <CheckField label={t("cmd.view.ignoreComments")} name="ignoreComments" icon="comment"
          checked={settings.ignoreComments} onChange={(value) => void save({ ignoreComments: value })} />
        <CheckField label={t("cmd.view.ignoreQuoteStyle")} name="ignoreQuoteStyle" icon="quote"
          checked={settings.ignoreQuoteStyle} onChange={(value) => void save({ ignoreQuoteStyle: value })} />
        <CheckField label={t("cmd.view.ignoreNumberFormat")} name="ignoreNumberFormat" icon="hash"
          checked={settings.ignoreNumberFormat} onChange={(value) => void save({ ignoreNumberFormat: value })} />
        <CheckField label={t("cmd.view.syntaxHighlight")} name="syntaxHighlight" icon="palette"
          checked={settings.syntaxHighlight} onChange={(value) => void save({ syntaxHighlight: value })} />
        <Field label={t("settings.excludes")}>
          <input
            className="text-input"
            data-field="excludes"
            defaultValue={settings.excludes.join(", ")}
            onBlur={(event) =>
              void save({ excludes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
          />
        </Field>
        <Field label={t("dir.masks")}>
          <input
            className="text-input"
            data-field="includeMasks"
            placeholder="*.ts, *.md"
            defaultValue={settings.includeMasks.join(", ")}
            onBlur={(event) =>
              void save({ includeMasks: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
          />
        </Field>
        <Field label={t("dir.excludeMasks")}>
          <input
            className="text-input"
            data-field="excludeMasks"
            placeholder="*.log, *.tmp"
            defaultValue={settings.excludeMasks.join(", ")}
            onBlur={(event) =>
              void save({ excludeMasks: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
          />
        </Field>
      </TabPanel>

      <TabPanel active={tab} id="git">
        <Field label={t("settings.difftoolState")}>
          <span className={tools?.diff.registered ? "badge on" : "badge"}>
            {tools?.diff.registered ? t("settings.registered") : t("settings.notRegistered")}
          </span>
        </Field>
        <Field label="difftool">
          <code className="code-line" title={tools?.diff.command}>{tools?.diff.command ?? "-"}</code>
        </Field>
        <Field label={t("settings.mergetoolState")}>
          <span className={tools?.merge.registered ? "badge on" : "badge"}>
            {tools?.merge.registered ? t("settings.registered") : t("settings.notRegistered")}
          </span>
        </Field>
        <Field label="mergetool">
          <code className="code-line" title={tools?.merge.command}>{tools?.merge.command ?? "-"}</code>
        </Field>
        <Buttons>
          <Button icon="git" name="difftool"
            onClick={async () => setTools(await api.setGitTool("diff", !tools?.diff.registered).catch(() => tools))}>
            {tools?.diff.registered ? t("settings.unregister") : t("settings.register")} difftool
          </Button>
          <Button icon="merge" name="mergetool"
            onClick={async () => setTools(await api.setGitTool("merge", !tools?.merge.registered).catch(() => tools))}>
            {tools?.merge.registered ? t("settings.unregister") : t("settings.register")} mergetool
          </Button>
        </Buttons>
      </TabPanel>

      <TabPanel active={tab} id="terminal">
        <Field label={t("settings.termCwd")} hint={t("settings.termCwdHint")}>
          <input
            className="text-input"
            data-field="termCwd"
            placeholder={t("settings.termCwdDefault")}
            spellCheck={false}
            defaultValue={settings.termCwd}
            key={settings.termCwd}
            onBlur={(event) => void save({ termCwd: event.target.value })}
          />
          <Button
            icon="folder"
            name="browseTermCwd"
            onClick={async () => {
              const picked = await host.pickDirectory({
                title: t("settings.termCwd"),
                defaultPath: settings.termCwd || undefined,
              });
              if (picked) void save({ termCwd: picked });
            }}
          >
            {t("dlg.browse")}
          </Button>
        </Field>
        <Field label={t("settings.termShell")} hint={t("settings.termShellHint")}>
          {shells === null ? (
            <select className="select" data-field="termShell" disabled value="">
              <option value="">{t("settings.termShellChecking")}</option>
            </select>
          ) : (
            <select
              className="select"
              data-field="termShell"
              value={settings.termShell}
              onChange={(event) => void save({ termShell: event.target.value })}
            >
              <option value="">{t("settings.termShellDefault", shells[0]?.label ?? "-")}</option>
              {shells.map((shell) => <option key={shell.id} value={shell.id}>{shell.label}</option>)}
              {/* A shell chosen before it was uninstalled still has to be shown, or the
                  list would silently read as though something else had been chosen. */}
              {settings.termShell && !shells.some((shell) => shell.id === settings.termShell) ? (
                <option value={settings.termShell}>{t("settings.termShellMissing", settings.termShell)}</option>
              ) : null}
            </select>
          )}
        </Field>
        <Field label={t("settings.termEol")} hint={t("settings.termEolHint")}>
          <select
            className="select"
            data-field="termEol"
            value={settings.termEol}
            onChange={(event) => void save({ termEol: event.target.value as TerminalEol })}
          >
            {TERMINAL_EOLS.map((value) => (
              <option key={value} value={value}>{t(`settings.termEol.${value}` as "settings.termEol.lf")}</option>
            ))}
          </select>
        </Field>
        <Field label={t("settings.termCr")}>
          <select
            className="select"
            data-field="termCr"
            value={settings.termCr}
            onChange={(event) => void save({ termCr: event.target.value as TerminalCr })}
          >
            {TERMINAL_CRS.map((value) => (
              <option key={value} value={value}>{t(`settings.termCr.${value}` as "settings.termCr.strip")}</option>
            ))}
          </select>
        </Field>
        <CheckField label={t("settings.termColor")} name="termColor" icon="palette"
          checked={settings.termColor} onChange={(value) => void save({ termColor: value })} />
        <p className="field-note">{t("settings.termColorHint")}</p>
      </TabPanel>

      <TabPanel active={tab} id="prompt">
        <PromptPresets
          value={settings.prompt}
          onChange={(prompt) => void save({ prompt })}
          custom={settings.customPrompts}
          language={settings.language}
          t={t}
        />
      </TabPanel>

      <TabPanel active={tab} id="promptCustom">
        <PromptCustom
          value={settings.prompt}
          onChange={(prompt) => void save({ prompt })}
          custom={settings.customPrompts}
          onCustomChange={(list: CustomPrompt[], apply?: PromptConfig) =>
            void save(apply ? { customPrompts: list, prompt: apply } : { customPrompts: list })}
          language={settings.language}
          t={t}
        />
      </TabPanel>

      <Buttons>
        <Button
          icon="refresh"
          name="reset"
          onClick={async () => {
            const saved = await api.resetSettings().catch(() => null);
            if (saved) {
              setSettings(saved);
              host.publishSettings(saved);
            }
          }}
        >
          {t("dlg.reset")}
        </Button>
        <Button icon="check" name="close" primary onClick={close}>{t("dlg.close")}</Button>
      </Buttons>
    </>
  );
}
