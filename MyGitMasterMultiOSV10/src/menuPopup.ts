/**
 * Menus whose rows carry callbacks — the menubar's drop-downs and every right-click
 * menu — shown through the generic "list" popup (src/MenuList.tsx).
 *
 * A callback cannot travel to the menu's own OS window, so each row goes as an id (its
 * index) and the chosen id is turned back into the row here:
 *
 *   const chosen = await openActionMenu(items, host.anchorFor(button));
 *   chosen?.();
 */
import { anchorFor, openMenu } from "./host";
import type { MenuAnchor } from "./global";
import type { IconName } from "./icons";
import type { MenuItem as ListItem } from "./MenuList";

export type ActionItem =
  | {
    kind?: "item";
    label: string;
    icon: IconName;
    disabled?: boolean;
    shortcut?: string;
    hint?: string;
    action: () => void;
    /** A second, small button at the row's end (remove a recent entry). */
    secondary?: { icon: IconName; label: string; action: () => void };
  }
  | { kind: "separator" }
  | { kind: "header"; label: string };

/** The rows as plain data for the menu window: ids are positions, `n:2` the second button. */
export function listItems(items: ActionItem[]): ListItem[] {
  return items.map((item, index): ListItem => {
    if (item.kind === "separator") return { kind: "separator" };
    if (item.kind === "header") return { kind: "header", label: item.label };
    return {
      id: String(index),
      label: item.label,
      icon: item.icon,
      disabled: item.disabled,
      shortcut: item.shortcut,
      hint: item.hint,
      secondary: item.secondary ? { id: `${index}:2`, icon: item.secondary.icon, label: item.secondary.label } : undefined,
    };
  });
}

/** The callback an answered menu id stands for, or null. */
export function actionOf(items: ActionItem[], id: string | null): (() => void) | null {
  if (!id) return null;
  const [position, part] = id.split(":");
  const item = items[Number(position)];
  if (!item || item.kind === "separator" || item.kind === "header" || item.disabled) return null;
  return part === "2" ? item.secondary?.action ?? null : item.action;
}

/** Shows the rows and resolves with the chosen row's callback (not yet called). */
export async function openActionMenu(items: ActionItem[], anchor: MenuAnchor | Element): Promise<(() => void) | null> {
  const where = anchor instanceof Element ? anchorFor(anchor) : anchor;
  const id = await openMenu("list", { items: listItems(items) }, where);
  return actionOf(items, id);
}

/* The theme drop-down ("theme" menu, src/ThemeMenuPopup.tsx) answers with these. */
export const THEME_MENU_SETTINGS = "settings";
export const themeMenuChoice = (id: string): string => `theme:${id}`;

/** The theme id a theme-menu answer chose, or null. */
export function chosenTheme(answer: string | null): string | null {
  return answer?.startsWith("theme:") ? answer.slice("theme:".length) : null;
}
