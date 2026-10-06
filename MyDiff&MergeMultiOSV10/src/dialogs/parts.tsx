/**
 * The pieces every dialog is built from.
 *
 * One rule drives all of them: a dialog is a fixed-size window with no scrollbar, and
 * each setting occupies exactly one line. Anything that does not fit goes behind a tab
 * rather than below a scroll.
 */
import { useState, type ReactNode } from "react";
import { Icon } from "../icons.js";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field" title={hint}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </div>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  name,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  name: string;
  icon?: string;
}) {
  return (
    <label className="field check-field">
      <span className="field-label">{label}</span>
      <span className="field-control">
        {icon ? <Icon name={icon} size={15} /> : null}
        <input type="checkbox" data-field={name} checked={checked} onChange={(event) => onChange(event.target.checked)} />
      </span>
    </label>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  name,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  name: string;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-control slider">
        <span className="slider-end">{min}</span>
        <input
          type="range"
          data-field={name}
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="slider-end">{max}</span>
        <span className="slider-value">{value}{suffix ?? ""}</span>
      </span>
    </div>
  );
}

/**
 * A number with a decrement and an increment button either side of it.
 *
 * Used everywhere a number is typed — the font size, the margin, the zoom — because a
 * bare spin box's arrows are tiny, differ between platforms, and are hard to hit.
 */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  suffix,
  name,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  name: string;
  label: string;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next * 100) / 100));
  return (
    <span className="stepper">
      <button
        type="button"
        className="stepper-button"
        data-step={`${name}:down`}
        title={`${label} −`}
        aria-label={`${label} −`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <Icon name="minus" size={13} />
      </button>
      <input
        type="number"
        className="stepper-value"
        data-field={name}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(clamp(next));
        }}
      />
      {suffix ? <span className="stepper-suffix">{suffix}</span> : null}
      <button
        type="button"
        className="stepper-button"
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

/** A labelled row holding a stepper — the common case. */
export function StepperField(props: Parameters<typeof Stepper>[0] & { hint?: string }) {
  const { hint, ...stepper } = props;
  return (
    <Field label={stepper.label} hint={hint}>
      <Stepper {...stepper} />
    </Field>
  );
}

export function Tabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: string; label: string; icon: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="dialog-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={`dialog-tab${tab.id === active ? " active" : ""}`}
          data-tab={tab.id}
          title={tab.label}
          onClick={() => onSelect(tab.id)}
        >
          <Icon name={tab.icon} size={15} />
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Buttons({ children }: { children: ReactNode }) {
  return <div className="dialog-buttons">{children}</div>;
}

export function Button({
  children,
  onClick,
  icon,
  primary,
  disabled,
  name,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: string;
  primary?: boolean;
  disabled?: boolean;
  name?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`dialog-button${primary ? " primary" : ""}`}
      data-action={name}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} size={15} /> : null}
      <span>{children}</span>
    </button>
  );
}

/** A tabbed body that keeps each panel the same height, so the window never resizes. */
export function TabPanel({ active, id, children }: { active: string; id: string; children: ReactNode }) {
  if (active !== id) return null;
  return <div className="tab-panel" role="tabpanel" data-panel={id}>{children}</div>;
}

export function useTab(initial: string): [string, (id: string) => void] {
  const [active, setActive] = useState(initial);
  return [active, setActive];
}
