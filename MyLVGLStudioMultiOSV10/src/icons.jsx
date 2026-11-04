// Stroke icons in the My Git Master manner: 24-unit paths, one hue per icon (icons.css),
// the first shape carrying a light wash of the same colour.
import { PATHS } from "./icons-names.js";

export function Icon({ name, size }) {
  const [[tone, body]] = PATHS[name] ?? PATHS.about;
  return (
    <svg
      className="icon"
      data-tone={tone}
      data-duo=""
      viewBox="0 0 24 24"
      style={size ? { width: size, height: size, minWidth: size, minHeight: size, flexBasis: size } : undefined}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

