/**
 * Preferences › Start screen: the same settings the start screen's own cards change
 * (settings.startScreen, core/startScreen.ts), plus "show at startup" and resetting the
 * card arrangement. Every change is saved at once, like the rest of Preferences.
 */
import {
  DEFAULT_START_SCREEN,
  effectiveSpeed,
  OPACITY_MAX,
  OPACITY_MIN,
  OPACITY_STEP,
  SHUFFLE_SECONDS,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  type StartScreenSettings,
} from "../../core/startScreen";
import { BackgroundGrid, RangeStepper, saveStartScreen, startPrefs } from "../startControls";
import { StartIcon } from "../startIcons";
import { showStartScreen } from "../startScreen";
import type { SettingsTabProps } from "./types";
import "../start.css";

export function StartSettings({ settings, t, onPrefs }: SettingsTabProps) {
  const prefs = startPrefs(settings);
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const save = (patch: Partial<StartScreenSettings>) => saveStartScreen(onPrefs, prefs, patch);

  return (
    <div className="start-settings" data-prefs-pane="start">
      <div className="start-settings-row">
        <label className="check-line">
          <input
            type="checkbox"
            data-field="prefsStartShowOnStartup"
            checked={prefs.showOnStartup}
            onChange={(event) => save({ showOnStartup: event.target.checked })}
          />
          {t("startShowAtStartup")}
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            data-field="prefsShowTutorial"
            checked={settings.showTutorial !== false}
            onChange={(event) => onPrefs({ showTutorial: event.target.checked })}
          />
          {t("tourShowAtStart")}
        </label>
      </div>

      <div className="start-settings-label"><StartIcon name="image" size={14} />{t("startBackground")}</div>
      <div className="settings-start-grid">
        <BackgroundGrid
          value={prefs.background}
          t={t}
          onChange={(background) => save({ background })}
          shuffle={{
            on: prefs.shuffleSec > 0,
            seconds: SHUFFLE_SECONDS,
            onToggle: () => save({ shuffleSec: prefs.shuffleSec > 0 ? 0 : SHUFFLE_SECONDS }),
          }}
        />
      </div>

      <div className="start-ranges inline">
        <label className="start-range inline">
          <span className="start-range-label"><StartIcon name="clock" size={14} />{t("startSpeed")}</span>
          <RangeStepper
            compact
            name="prefsStartSpeed"
            label={t("startSpeed")}
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            suffix="%"
            value={effectiveSpeed(prefs, reduced)}
            onChange={(value) => save({ speed: value })}
          />
        </label>
        <label className="start-range inline">
          <span className="start-range-label"><StartIcon name="eye" size={14} />{t("startCardOpacity")}</span>
          <RangeStepper
            compact
            name="prefsStartCardOpacity"
            label={t("startCardOpacity")}
            min={OPACITY_MIN}
            max={OPACITY_MAX}
            step={OPACITY_STEP}
            suffix="%"
            value={prefs.cardOpacity}
            onChange={(value) => save({ cardOpacity: value })}
          />
        </label>
      </div>

      <div className="start-settings-actions">
        <button type="button" data-start-action="show-start" onClick={() => showStartScreen()}>
          <StartIcon name="home" size={14} />
          <span>{t("startShowNow")}</span>
        </button>
        <button type="button" data-start-action="reset-layout" disabled={prefs.layout === null} onClick={() => save({ layout: null })}>
          <StartIcon name="grid" size={14} />
          <span>{t("startResetLayout")}</span>
        </button>
        <button type="button" data-start-action="reset-start" onClick={() => onPrefs({ startScreen: { ...DEFAULT_START_SCREEN } })}>
          <StartIcon name="sync" size={14} />
          <span>{t("startResetAll")}</span>
        </button>
      </div>
    </div>
  );
}
