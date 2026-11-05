// Shared inputs: the icon drop-down (native <select> cannot show icons), the −/+ number
// stepper, colour field and on/off switch.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";

const LIST_MAX_HEIGHT = 240;

/** The list opens below its button, or above when the window has more room there. */
function listPlacement(button, count) {
  const rect = button.getBoundingClientRect();
  // The window it is drawn in: a dialog may have its own.
  const { innerHeight } = button.ownerDocument.defaultView;
  const wanted = Math.min(LIST_MAX_HEIGHT, count * 30 + 10);
  const below = innerHeight - rect.bottom - 6;
  const above = rect.top - 6;
  const style = { position: "fixed", left: rect.left, minWidth: rect.width, width: "max-content", maxWidth: Math.max(rect.width, 320), right: "auto" };
  if (below >= wanted || below >= above) return { ...style, top: rect.bottom + 2, bottom: "auto", maxHeight: Math.min(LIST_MAX_HEIGHT, below) };
  return { ...style, top: "auto", bottom: innerHeight - rect.top + 2, maxHeight: Math.min(LIST_MAX_HEIGHT, above) };
}

export function IconSelect({ value, options, onChange, title, id }) {
  const [open, setOpen] = useState(false);
  const host = useRef(null);
  const button = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!host.current?.contains(event.target)) setOpen(false);
    };
    // Its place was worked out from the button, so it cannot follow a scrolling panel.
    const closeOnScroll = (event) => {
      if (!host.current?.contains(event.target)) setOpen(false);
    };
    const closeNow = () => setOpen(false);
    const win = host.current?.ownerDocument.defaultView ?? window;
    win.addEventListener("pointerdown", close, true);
    win.addEventListener("scroll", closeOnScroll, true);
    win.addEventListener("resize", closeNow);
    return () => {
      win.removeEventListener("pointerdown", close, true);
      win.removeEventListener("scroll", closeOnScroll, true);
      win.removeEventListener("resize", closeNow);
    };
  }, [open]);
  const selected = options.find((option) => option.value === value);
  return (
    <div className="icon-select" ref={host} data-select={id}>
      <button type="button" ref={button} className="icon-select-button" title={title} aria-expanded={open} onClick={() => setOpen((state) => !state)}>
        <Icon name={selected?.icon ?? "caretRight"} />
        <span className="icon-select-text">{selected?.label ?? String(value ?? "")}</span>
        <Icon name="caret" size={12} />
      </button>
      {open && (
        <div className="menu-pop icon-select-list" role="listbox" style={listPlacement(button.current, options.length)}>
          {options.map((option) => (
            <button
              type="button"
              key={String(option.value)}
              role="option"
              aria-selected={option.value === value}
              data-value={String(option.value)}
              className={option.value === value ? "selected" : undefined}
              onClick={() => {
                setOpen(false);
                onChange(option.value);
              }}
            >
              <Icon name={option.icon ?? "caretRight"} />
              <span className="menu-label">{option.label}</span>
              {option.note && <span className="menu-note">{option.note}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A text box exactly as wide as what it holds, so the value and its unit centre together. */
const fitWidth = (text) => ({ width: `${Math.max(1, String(text ?? "").length) + 1}ch` });

/** − [value unit] +, the value and its unit centred. Empty means "not set" when `blank` allows it. */
export function Stepper({ value, onChange, min, max, step = 1, placeholder, blank = false, id, unit }) {
  const clamp = (number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number));
  const [typing, setTyping] = useState(null);
  const nudge = (direction) => {
    const base = Number(value);
    setTyping(null);
    onChange(clamp((Number.isFinite(base) ? base : (min ?? 0)) + direction * step));
  };
  const shown = typing ?? value;
  return (
    <div className="stepper" data-field={id}>
      <button type="button" tabIndex={-1} aria-label="-" onClick={() => nudge(-1)}>−</button>
      <span className="stepper-value">
        <input
          value={shown ?? ""}
          placeholder={placeholder}
          inputMode="numeric"
          style={shown === undefined || shown === null || shown === "" ? { width: "100%" } : fitWidth(shown)}
          onChange={(event) => {
            const text = event.target.value.trim();
            setTyping(text);
            if (text === "") {
              if (blank) onChange(undefined);
              return;
            }
            const number = Number.parseInt(text, 10);
            if (Number.isFinite(number) && number === clamp(number)) onChange(number);
          }}
          onBlur={() => {
            const number = Number.parseInt(typing ?? "", 10);
            if (typing !== null && typing !== "" && Number.isFinite(number) && number !== clamp(number)) onChange(clamp(number));
            setTyping(null);
          }}
        />
        {unit && value !== undefined && value !== null && value !== "" && <span className="stepper-unit" data-unit="">{unit}</span>}
      </span>
      <button type="button" tabIndex={-1} aria-label="+" onClick={() => nudge(1)}>+</button>
    </div>
  );
}

/** A size: pixels, a percentage, or "content". The buttons step the number, keeping its form. */
export function SizeField({ value, onChange, placeholder, id }) {
  const text = value === undefined || value === null ? "" : String(value);
  const percent = text.endsWith("%");
  const number = Number.parseInt(text, 10);
  const isNumber = Number.isFinite(number);
  const unit = percent ? "%" : isNumber ? "px" : "";
  const shown = percent ? text.slice(0, -1) : text;
  const nudge = (direction) => {
    const next = Math.max(percent ? 0 : 1, (isNumber ? number : percent ? 0 : 100) + direction);
    onChange(percent ? `${next}%` : next);
  };
  return (
    <div className="stepper" data-field={id}>
      <button type="button" tabIndex={-1} aria-label="-" onClick={() => nudge(-1)}>−</button>
      <span className="stepper-value">
        <input
          value={shown}
          placeholder={placeholder}
          style={shown === "" ? { width: "100%" } : fitWidth(shown)}
          onChange={(event) => {
            const typed = event.target.value.trim();
            if (/^\d+$/.test(typed)) onChange(percent ? `${typed}%` : Number(typed));
            else onChange(typed);
          }}
        />
        {unit && <span className="stepper-unit" data-unit="">{unit}</span>}
      </span>
      <button type="button" tabIndex={-1} aria-label="+" onClick={() => nudge(1)}>+</button>
    </div>
  );
}

export function ColorField({ value, onChange, placeholder, clearLabel, id }) {
  return (
    <div className="color-field" data-field={id}>
      <label className={value ? "swatch" : "swatch empty"} style={value ? { background: value } : undefined}>
        <input type="color" value={value ?? "#808080"} onChange={(event) => onChange(event.target.value)} />
      </label>
      <input
        className="color-text"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => {
          const text = event.target.value.trim();
          if (text === "") onChange(undefined);
          else if (/^#[0-9a-fA-F]{6}$/.test(text)) onChange(text.toLowerCase());
        }}
      />
      {clearLabel && value && (
        <button type="button" className="mini" title={clearLabel} aria-label={clearLabel} onClick={() => onChange(undefined)}>
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, id, label }) {
  return (
    <button
      type="button"
      role="switch"
      data-field={id}
      aria-label={label}
      aria-checked={!!checked}
      className={checked ? "toggle on" : "toggle"}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}

/** The resize marker of every corner: dots in a triangle. */
export function GripDots() {
  return (
    <svg viewBox="0 0 12 12" data-grip="">
      {[[10, 2], [6, 6], [10, 6], [2, 10], [6, 10], [10, 10]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r="1.15" />)}
    </svg>
  );
}
