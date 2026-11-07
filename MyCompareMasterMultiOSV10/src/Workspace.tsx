/**
 * The middle of the window: whichever view the active tab calls for, or the welcome
 * screen (StartPage.tsx) when nothing is open yet or Start brought it forward. Start
 * pressed with nothing open leaves the main window with an empty workspace.
 */
import { DiffView } from "./views/DiffView.js";
import { ImageView, isImagePair } from "./views/ImageView.js";
import { DirectoryView } from "./views/DirectoryView.js";
import { GitView } from "./views/GitView.js";
import { MergeView } from "./views/MergeView.js";
import { StartPage } from "./StartPage.js";
import { useEffect } from "react";
import { useApp } from "./state.js";
import { hideStartScreen, useOnStartScreen } from "./startScreen.js";
import { Icon } from "./icons.js";

export function Workspace({
  onContextMenu,
}: {
  onContextMenu: (
    event: React.MouseEvent,
    target: "pane" | "directory" | "conflict" | "git" | "tab" | "image" | "session" | "log",
  ) => void;
}) {
  const app = useApp();
  // The start screen: nothing open, or brought in front of open tabs by Start.
  const onStart = useOnStartScreen(Boolean(app.active));
  const active = onStart ? null : app.active;

  // Opening something, or switching tab, puts the work back in front.
  useEffect(() => hideStartScreen(), [app.activeId, app.tabs.length]);

  // One handler on the workspace rather than one per view: the menu that opens
  // follows the active tab, so each kind of session offers what can be done in it,
  // and the start screen offers the ways to begin one.
  const target = !active ? "session"
    : active.kind === "directory" ? "directory"
      : active.kind === "merge" ? "conflict"
        : active.kind === "git" ? "git"
          : active.kind === "compare" && isImagePair(active) ? "image"
            : "pane";

  return (
    <main className="workspace" onContextMenu={(event) => onContextMenu(event, target)}>
      {onStart ? <StartPage />
        : !active ? (
          <div className="workspace-empty" data-testid="workspace-empty">
            <Icon name="compareFiles" size={40} />
            <b>{app.t("workspace.empty.title")}</b>
            <span>{app.t("workspace.empty.hint")}</span>
          </div>
        )
        : active.kind === "compare"
          ? isImagePair(active) ? <ImageView tab={active} /> : <DiffView tab={active} />
          : active.kind === "directory"
            ? <DirectoryView tab={active} />
            : active.kind === "merge"
              ? <MergeView tab={active} />
              : <GitView tab={active} />}
    </main>
  );
}
