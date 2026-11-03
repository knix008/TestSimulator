/**
 * The command part of the toolbar: every git command the app has, each a colourful
 * icon (its name is the tooltip and the accessible name). Whatever does not fit the
 * window's width moves, from the end, into the "More" drop-down, where the commands
 * are listed with icon and name — so no command is ever out of reach.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Icon, MenuGlyph, type IconName } from "./icons";
import "./gitToolbar.css";

export type ToolCommand = {
  id: string;
  icon: IconName;
  label: string;
  /** Commands with a different group are separated by a thin line. */
  group: string;
  disabled?: boolean;
  pressed?: boolean;
  /** Spins the icon while the command runs (Refresh). */
  spinning?: boolean;
  onClick: () => void;
};

/** How many commands fit in `available` px, given each one's width (the rest go to More). */
export function fitCount(widths: number[], available: number, moreWidth: number, gap: number): number {
  const total = widths.reduce((sum, width, index) => sum + width + (index ? gap : 0), 0);
  if (total <= available) return widths.length;
  let used = moreWidth;
  for (let index = 0; index < widths.length; index++) {
    used += widths[index] + gap;
    if (used > available) return index;
  }
  return widths.length;
}

const GAP = 4;

/**
 * The width the whole toolbar row needs to show every button: this part's buttons, the
 * other groups of the row (theme, language, settings…), the gaps and the row's padding.
 */
export function rowWidth(row: HTMLElement, own: HTMLElement | null = null, ownNatural = 0): number {
  const children = (Array.from(row.children) as HTMLElement[]).filter((child) => getComputedStyle(child).position !== "absolute");
  const others = children.filter((child) => child !== own).reduce((sum, child) => sum + intrinsicWidth(child) + marginX(child), 0);
  return Math.ceil(ownNatural + others + rowChrome(row, children.length) + FRAME_ALLOWANCE);
}

/** Room for the window's own edge (resize border, rounding at 125 % / 150 % scaling). */
export const FRAME_ALLOWANCE = 8;

const px = (value: string) => Number.parseFloat(value) || 0;

/**
 * An element's horizontal margins. An `auto` margin (the gap that pushes a group to the
 * right) reports the free space it was given, which follows the window — so only small,
 * designed margins count.
 */
function marginX(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const side = (value: string) => {
    const margin = px(value);
    return margin > 0 && margin <= 16 ? margin : 0;
  };
  return side(style.marginLeft) + side(style.marginRight);
}

/** The row's own padding, borders and the gaps between its `count` children. */
function rowChrome(row: HTMLElement, count: number): number {
  const style = getComputedStyle(row);
  return px(style.columnGap) * Math.max(0, count - 1)
    + px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);
}

/**
 * The width an element's content needs — never the width a stretching container was
 * given by the window (that would make the window's minimum follow its current size).
 * A box that does not grow is measured as it is; one that grows (flex-grow, or a
 * block filling its parent) is measured by its own children, recursively.
 */
export function intrinsicWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.position === "absolute") return 0;
  const grows = px(style.flexGrow) > 0 || style.display === "block" || style.display === "grid" || style.display === "flex";
  if (!grows || element.children.length === 0) return element.getBoundingClientRect().width;
  const children = (Array.from(element.children) as HTMLElement[]).filter((child) => getComputedStyle(child).position !== "absolute");
  const inner = children.reduce((sum, child) => sum + intrinsicWidth(child) + marginX(child), 0);
  return inner + rowChrome(element, children.length);
}

export function GitToolbar(props: {
  commands: ToolCommand[];
  moreLabel: string;
  /**
   * Browser build: what does not fit moves into "More". Desktop: off — the window's
   * minimum width (onNaturalWidth) keeps every button visible instead.
   */
  overflow?: boolean;
  /** The row's full natural width, whenever it changes (the window's minimum width). */
  onNaturalWidth?: (width: number) => void;
}) {
  const onNaturalWidth = useRef(props.onNaturalWidth);
  onNaturalWidth.current = props.onNaturalWidth;
  const lastNatural = useRef(0);
  const host = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const overflow = props.overflow !== false;
  const [shown, setShown] = useState(props.commands.length);
  const [open, setOpen] = useState(false);
  const key = props.commands.map((command) => `${command.id}:${command.label}`).join("|");

  useLayoutEffect(() => {
    const box = host.current;
    const ruler = measure.current;
    if (!box || !ruler) return;
    const update = () => {
      // Each slot is a button plus, at a group change, its separator line.
      const slots = Array.from(ruler.querySelectorAll<HTMLElement>(":scope > .git-tool-slot"));
      const widths = slots.map((slot) => slot.getBoundingClientRect().width);
      const more = ruler.querySelector<HTMLElement>("[data-measure-more]")?.getBoundingClientRect().width ?? 60;
      setShown(overflow ? fitCount(widths, box.clientWidth, more + GAP, GAP) : widths.length);
      const row = box.parentElement;
      if (row) {
        const natural = widths.reduce((sum, width, index) => sum + width + (index ? GAP : 0), 0);
        // What the row really needs: the measured buttons, or the row's own content if larger.
        // Only intrinsic content (the buttons and the row's other groups), never the
        // width the stretching row was given: that follows the window.
        const total = rowWidth(row, box, natural);
        if (total !== lastNatural.current) {
          lastNatural.current = total;
          onNaturalWidth.current?.(total);
        }
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    // The other groups of the row change width with the language and the theme's name.
    for (const sibling of Array.from(box.parentElement?.children ?? [])) if (sibling !== box) observer.observe(sibling);
    // Web fonts change every width once they arrive.
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) update();
    });
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [key, overflow]);

  useLayoutEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (event.target instanceof Node && host.current?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, [open]);

  const visible = props.commands.slice(0, shown);
  const hidden = props.commands.slice(shown);
  const button = (command: ToolCommand, index: number, list: ToolCommand[], measuring = false) => {
    const separated = index > 0 && list[index - 1].group !== command.group;
    return (
      <span key={command.id} className="git-tool-slot">
        {separated && <i className="git-tool-sep" aria-hidden="true" />}
        <button
          type="button"
          className={command.pressed ? "git-tool active" : "git-tool"}
          data-command={command.id}
          data-measure={measuring ? "" : undefined}
          data-separated={measuring && separated ? "1" : undefined}
          aria-pressed={command.pressed}
          aria-busy={command.spinning || undefined}
          data-spinning={command.spinning ? "" : undefined}
          aria-label={command.label}
          disabled={command.disabled}
          title={command.label}
          tabIndex={measuring ? -1 : undefined}
          onClick={measuring ? undefined : command.onClick}
        >
          <Icon name={command.icon} />
        </button>
      </span>
    );
  };

  return (
    <div className="git-toolbar" data-overflow={overflow ? "on" : "off"} ref={host}>
      <div className="git-toolbar-ruler" ref={measure} aria-hidden="true">
        {props.commands.map((command, index, list) => button(command, index, list, true))}
        <button type="button" className="git-tool" data-measure-more="" tabIndex={-1}>
          <Icon name="more" />
        </button>
      </div>
      {visible.map((command, index, list) => button(command, index, list))}
      {hidden.length > 0 && (
        <span className="git-tool-slot git-tool-more-host">
          <button type="button" className={open ? "git-tool active" : "git-tool"} aria-expanded={open} aria-label={props.moreLabel} title={props.moreLabel} onClick={() => setOpen((value) => !value)}>
            <Icon name="more" />
          </button>
          {open && (
            <div className="menu-pop git-tool-more" role="menu">
              {hidden.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  role="menuitem"
                  data-command={command.id}
                  className={[command.disabled ? "is-disabled" : "", index > 0 && hidden[index - 1].group !== command.group ? "group-start" : ""].filter(Boolean).join(" ") || undefined}
                  aria-disabled={command.disabled || undefined}
                  aria-pressed={command.pressed}
          aria-busy={command.spinning || undefined}
          data-spinning={command.spinning ? "" : undefined}
                  onClick={() => {
                    if (command.disabled) return;
                    setOpen(false);
                    command.onClick();
                  }}
                >
                  <MenuGlyph name={command.icon} />
                  <span className="menu-label">{command.label}</span>
                </button>
              ))}
            </div>
          )}
        </span>
      )}
    </div>
  );
}
