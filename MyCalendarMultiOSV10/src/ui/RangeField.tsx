import { formatMessage } from "../domain/i18n";
import type { Messages } from "../domain/messages";
import { MinusIcon, PlusIcon } from "./icons";

/** A slider with step buttons on either side, for the settings that take a number. */
export function RangeField({
  id,
  name,
  value,
  min,
  max,
  step = 1,
  buttonStep = step,
  title,
  t,
  onChange,
}: {
  id: string;
  /** Spoken in the button labels, e.g. "투명도 줄이기". */
  name: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** The buttons land on multiples of this, so a value set by dragging snaps back onto the grid. */
  buttonStep?: number;
  title?: string;
  t: Messages;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const lower = clamp(Math.ceil(value / buttonStep) * buttonStep - buttonStep);
  const higher = clamp(Math.floor(value / buttonStep) * buttonStep + buttonStep);
  return (
    <div className="opacity range-field" title={title}>
      <button
        type="button"
        className="icon-btn"
        aria-label={formatMessage(t.decrease, { name })}
        title={formatMessage(t.decrease, { name })}
        disabled={value <= min}
        onClick={() => onChange(lower)}
      >
        <MinusIcon />
      </button>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <button
        type="button"
        className="icon-btn"
        aria-label={formatMessage(t.increase, { name })}
        title={formatMessage(t.increase, { name })}
        disabled={value >= max}
        onClick={() => onChange(higher)}
      >
        <PlusIcon />
      </button>
      <strong>{value}%</strong>
    </div>
  );
}
