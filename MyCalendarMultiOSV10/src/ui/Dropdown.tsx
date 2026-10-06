import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  title?: string;
  className?: string;
}

const GAP = 4;
const MARGIN = 8;
const MAX_LIST_HEIGHT = 280;

/**
 * A themed replacement for <select>. The open list of a native select is drawn by the OS, which ignores the theme's
 * colours on some platforms and leaves the items unreadable.
 */
export function Dropdown({ value, options, onChange, ariaLabel, title, className }: DropdownProps) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties>({});
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  const show = () => {
    if (options.length === 0) return;
    setActive(Math.max(0, selectedIndex));
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    setOpen(false);
    buttonRef.current?.focus();
    if (option && option.value !== value) onChange(option.value);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      if (!buttonRef.current) return;
      const button = buttonRef.current.getBoundingClientRect();
      const fontSize = getComputedStyle(buttonRef.current).fontSize;
      const below = window.innerHeight - button.bottom - GAP - MARGIN;
      const above = button.top - GAP - MARGIN;
      const wanted = Math.min(MAX_LIST_HEIGHT, listRef.current?.scrollHeight ?? MAX_LIST_HEIGHT);
      const up = below < wanted && above > below;
      const width = Math.min(button.width, window.innerWidth - 2 * MARGIN);
      setPlace({
        fontSize,
        left: Math.min(Math.max(MARGIN, button.left), window.innerWidth - MARGIN - width),
        width,
        maxHeight: Math.max(0, Math.min(MAX_LIST_HEIGHT, up ? above : below)),
        ...(up ? { bottom: window.innerHeight - button.top + GAP } : { top: button.bottom + GAP }),
      });
    };
    position();
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
      position();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("resize", position);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, place]);

  useEffect(() => {
    if (open && options.length === 0) setOpen(false);
  }, [open, options.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    const move = (index: number) => {
      event.preventDefault();
      event.stopPropagation();
      if (!open) {
        show();
        return;
      }
      setActive(Math.min(last, Math.max(0, index)));
    };
    switch (event.key) {
      case "ArrowDown":
        move(active + 1);
        break;
      case "ArrowUp":
        move(active - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(last);
        break;
      case "PageDown":
        move(active + 8);
        break;
      case "PageUp":
        move(active - 8);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        if (open) choose(active);
        else show();
        break;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        if (open) choose(active);
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const key = event.key.toLocaleLowerCase();
          const start = open ? active : Math.max(0, selectedIndex);
          for (let step = 1; step <= options.length; step += 1) {
            const index = (start + step) % options.length;
            if (options[index].label.toLocaleLowerCase().startsWith(key)) {
              event.stopPropagation();
              if (open) setActive(index);
              else if (options[index].value !== value) onChange(options[index].value);
              break;
            }
          }
        }
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`select dropdown${className ? ` ${className}` : ""}`}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        title={title}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!listRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <span className="dropdown-value">{selected?.label ?? ""}</span>
        <svg className="dropdown-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={`${id}-list`}
            className="dropdown-list"
            role="listbox"
            aria-label={ariaLabel}
            style={place}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === selectedIndex}
                className={index === active ? "active" : undefined}
                onMouseMove={() => setActive(index)}
                onClick={(event) => {
                  event.stopPropagation();
                  choose(index);
                }}
              >
                {option.label}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
