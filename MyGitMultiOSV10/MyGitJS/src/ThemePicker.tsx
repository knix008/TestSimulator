import { THEMES, applyTheme } from "../core/themes";
import type { Lang } from "./i18n";

export function ThemePicker(props: {
  lang: Lang;
  value: string;
  mode?: "light" | "dark";
  lightLabel?: string;
  darkLabel?: string;
  onChange: (id: string) => void;
}) {
  const modes = props.mode ? [props.mode] : (["light", "dark"] as const);
  return (
    <div className={props.mode ? "theme-grid" : "theme-picker"}>
      {modes.map((mode) => {
        const themes = THEMES.filter((item) => item.mode === mode);
        const cards = themes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={props.value === item.id ? "theme-card selected" : "theme-card"}
            onClick={() => {
              applyTheme(item.id);
              props.onChange(item.id);
            }}
          >
            <span className="swatches">
              {item.swatch.map((color, index) => <i key={index} style={{ background: color }} />)}
            </span>
            <span>{props.lang === "ko" ? item.nameKo : item.nameEn}</span>
          </button>
        ));
        if (props.mode) return cards;
        return (
          <section key={mode}>
            <div className="group">{mode === "light" ? props.lightLabel : props.darkLabel}</div>
            <div className="theme-grid">{cards}</div>
          </section>
        );
      })}
    </div>
  );
}
