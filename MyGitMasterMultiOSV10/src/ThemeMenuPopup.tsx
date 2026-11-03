/**
 * The theme drop-down in a menu window of its own (registered as the "theme" menu):
 * src/ThemeMenu.tsx, answering `theme:<id>` for a theme and `settings` for the button
 * that opens Preferences › Theme (see src/menuPopup.ts).
 */
import { THEME_MENU_SETTINGS, themeMenuChoice } from "./menuPopup";
import type { MenuComponentProps } from "./popupRegistry";
import { ThemeMenu } from "./ThemeMenu";

export function ThemeMenuPopup({ settings, lang, t, choose }: MenuComponentProps) {
  return (
    <ThemeMenu
      settings={settings}
      lang={lang}
      t={t}
      onChoose={(id) => choose(themeMenuChoice(id))}
      onSettings={() => choose(THEME_MENU_SETTINGS)}
    />
  );
}
