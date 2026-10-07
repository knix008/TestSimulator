import type { CSSProperties } from "react";
import { DATE_FONT_STACKS, DATE_FONT_WEIGHT_VALUES, type DateFont } from "../domain/settings";

/** CSS variables the date grid reads; the size still comes from the window width and only gets scaled here. */
export function dateFontStyle(settings: DateFont): CSSProperties {
  return {
    "--date-font-scale": String(settings.dateFontScale),
    // Left unset for the default font: an unresolved variable makes font-family inherit like before.
    ...(settings.dateFontFamily === "system" ? {} : { "--date-font": DATE_FONT_STACKS[settings.dateFontFamily] }),
    "--date-weight": String(DATE_FONT_WEIGHT_VALUES[settings.dateFontWeight]),
    "--date-style": settings.dateFontItalic ? "italic" : "normal",
  } as CSSProperties;
}
