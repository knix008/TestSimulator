/**
 * Controls shared by the start screen and the Settings window's Start screen tab:
 * the value stepper with a bar, the background picker, and the one way both write
 * `settings.startScreen` (saved, then published so every window follows).
 */
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import type { StringKey } from "../core/i18n.js";
import { type BackgroundKind, BACKGROUND_KINDS, sanitizeStartScreen, type StartScreenSettings } from "../core/startScreen.js";
import { api } from "./api.js";
import * as host from "./host.js";
import { Icon } from "./icons.js";
import { BACKGROUND_ICONS } from "./startBackground.js";
import "./startControls.css";

type T = (key: StringKey, ...args: (string | number)[]) => string;

/* ------------------------------------------------------------------ saving */

// Rapid changes (a stepper held down, a card dropped twice) build on the last value
// sent rather than on settings that have not come back yet.
let pending: StartScreenSettings | null = null;

export async function saveStartScreen(current: StartScreenSettings, patch: Partial<StartScreenSettings>): Promise<void> {
  const next = sanitizeStartScreen({ ...(pending ?? current), ...patch });
  pending = next;
  try {
    const saved = await api.updateSettings({ startScreen: next });
    host.publishSettings(saved);
  } catch {
    /* the server is gone; the control shows the old value again */
  } finally {
    if (pending === next) pending = null;
  }
}

/* -------------------------------------------------------- [−] [bar] [n] [+] */

export function RangeStepper({
  value,
  min,
  max,
  step,
  suffix,
  label,
  name,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  label: string;
  name: string;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.max(min, Math.min(max, Math.round(next / step) * step));
  const bar = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const fraction = (value - min) / (max - min || 1);

  const fromPointer = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    return clamp(min + ((clientX - rect.left) / rect.width) * (max - min));
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    let last = fromPointer(event.clientX);
    if (last !== value) onChange(last);
    const target = event.currentTarget;
    const move = (ev: globalThis.PointerEvent) => {
      const next = fromPointer(ev.clientX);
      if (next !== last) {
        last = next;
        onChange(next);
      }
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowRight" || event.key === "ArrowUp" ? step
      : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -step
        : event.key === "PageUp" ? step * 5
          : event.key === "PageDown" ? -step * 5 : 0;
    if (event.key === "Home") onChange(min);
    else if (event.key === "End") onChange(max);
    else if (delta) onChange(clamp(value + delta));
    else return;
    event.preventDefault();
  };
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && draft.trim() !== "") {
      const next = clamp(parsed);
      setDraft(String(next));
      if (next !== value) onChange(next);
    } else {
      setDraft(String(value));
    }
  };

  return (
    <span className="range-stepper" data-range={name}>
      <button
        type="button"
        className="range-step"
        data-step={`${name}:down`}
        title={`${label} −`}
        aria-label={`${label} −`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <Icon name="minus" size={13} />
      </button>
      <div
        ref={bar}
        className="range-bar"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value}${suffix ?? ""}`}
        title={`${label}: ${value}${suffix ?? ""}`}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <span className="range-fill" style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
        <span className="range-thumb" style={{ left: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
      </div>
      <span className="range-value">
        <input
          type="number"
          data-field={name}
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-label={label}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
        />
        {suffix ? <span className="range-suffix">{suffix}</span> : null}
      </span>
      <button
        type="button"
        className="range-step"
        data-step={`${name}:up`}
        title={`${label} +`}
        aria-label={`${label} +`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        <Icon name="plus" size={13} />
      </button>
    </span>
  );
}

/* --------------------------------------------------------- background picker */

export function backgroundName(t: T, kind: BackgroundKind): string {
  return t(`start.bg.${kind}` as StringKey);
}

/** Every background as a named tile with its icon; the description is the tooltip. */
export function BackgroundGrid({
  value,
  t,
  onChange,
  shuffle,
}: {
  value: BackgroundKind;
  t: T;
  onChange: (kind: BackgroundKind) => void;
  /** The shuffle switch as the last tile, when given. */
  shuffle?: { on: boolean; seconds: number; onToggle: () => void };
}) {
  return (
    <div className="bg-grid" role="radiogroup" aria-label={t("start.background")}>
      {BACKGROUND_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          role="radio"
          aria-checked={value === kind}
          className={`bg-tile${value === kind ? " on" : ""}`}
          data-background={kind}
          title={`${backgroundName(t, kind)} — ${t(`start.bg.${kind}.hint` as StringKey)}`}
          onClick={() => onChange(kind)}
        >
          <Icon name={BACKGROUND_ICONS[kind]} size={15} />
          <span>{backgroundName(t, kind)}</span>
        </button>
      ))}
      {shuffle ? (
        <button
          type="button"
          role="switch"
          aria-checked={shuffle.on}
          className={`bg-tile shuffle${shuffle.on ? " on" : ""}`}
          data-background-shuffle=""
          title={t("start.shuffleTip", shuffle.seconds)}
          onClick={shuffle.onToggle}
        >
          <Icon name="sync" size={15} />
          <span>{t("start.shuffle")}</span>
        </button>
      ) : null}
    </div>
  );
}
