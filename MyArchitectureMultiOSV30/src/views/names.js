// Display names of views, sheets and publish sets: names the program made
// ("Section A-A", "South elevation", "Floor plan — 1F", "Room schedule") are
// shown in the UI language; names the user typed are shown as they are.

import { t as tr } from "../ui/i18n.js";
import { KO } from "../ui/i18n-ko.js";

export function displayName(s, t = tr) {
  const name = String(s ?? "");
  if (!name) return name;
  if (name in KO) return t(name);
  // "Floor plan — 1F", "Living room — A"
  const dash = name.split(" — ");
  if (dash.length > 1 && dash.some((x) => x in KO)) return dash.map((x) => displayName(x, t)).join(" — ");
  // "Section A-A", "Section 3", "Detail 2", "Drafting view 1", "Section 1 (copy)"
  const m = name.match(/^(.+?) ([A-Z0-9][A-Za-z0-9-]*|\(copy\))((?: \(copy\))*)$/);
  if (m && m[1] in KO) return `${t(m[1])} ${m[2] === "(copy)" ? `(${t("copy")})` : m[2]}${m[3] ? m[3].replace(/\(copy\)/g, `(${t("copy")})`) : ""}`;
  return name;
}
