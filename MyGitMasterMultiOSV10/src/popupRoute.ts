/**
 * Which kind of window this page is, from its address:
 *
 *   #menu=        the pooled menu window
 *   #dialog=      a pooled dialog window
 *   #guide[=id]   the user's guide, optionally opened at a section id
 *   anything else the main window (or a Diff / Merge tool window, see toolLaunch.ts)
 */
export type PopupRoute = { kind: "menu" } | { kind: "dialog" } | { kind: "guide"; section: string } | null;

export function popupRoute(hash = typeof location === "undefined" ? "" : location.hash): PopupRoute {
  const route = hash.replace(/^#/, "");
  if (route.startsWith("menu=")) return { kind: "menu" };
  if (route.startsWith("dialog=")) return { kind: "dialog" };
  if (route === "guide" || route.startsWith("guide=")) {
    return { kind: "guide", section: decodeURIComponent(route.slice("guide=".length)) };
  }
  return null;
}
