/**
 * The middle of the window: whichever view the active tab calls for, or the welcome
 * screen when nothing is open yet.
 */
import { DiffView } from "./views/DiffView.js";
import { ImageView, isImagePair } from "./views/ImageView.js";
import { DirectoryView } from "./views/DirectoryView.js";
import { GitView } from "./views/GitView.js";
import { MergeView } from "./views/MergeView.js";
import { SESSION_TYPES } from "../core/sessions.js";
import { Icon } from "./icons.js";
import { useCommands } from "./commands.js";
import { useApp } from "./state.js";

export function Workspace({
  onContextMenu,
}: {
  onContextMenu: (
    event: React.MouseEvent,
    target: "pane" | "directory" | "conflict" | "git" | "tab" | "image" | "session" | "log",
  ) => void;
}) {
  const app = useApp();
  const active = app.active;

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
      {!active ? <Welcome />
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

function Welcome() {
  const app = useApp();
  const { commands, run } = useCommands();
  const { t, settings } = app;
  const entries = settings.recent ?? [];



  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>
          <Icon name="merge" size={28} />
          {app.bootstrap?.app.title}
        </h1>
        <p className="welcome-lead">{t("about.description")}</p>

        {/* One tile per kind of session, straight from the catalogue, so the start
            screen can never fall out of step with what the app can actually open. */}
        <div className="welcome-tiles">
          {SESSION_TYPES.map((type) => (
            <button
              key={type.kind}
              type="button"
              className="welcome-tile"
              data-session-type={type.kind}
              data-command={type.command}
              title={app.language === "en" ? type.enHint : type.koHint}
              disabled={!commands[type.command]}
              onClick={() => run(type.command)}
            >
              <Icon name={type.icon} size={22} />
              <span>{app.language === "en" ? type.en : type.ko}</span>
              <small>{app.language === "en" ? type.enHint : type.koHint}</small>
            </button>
          ))}
        </div>

        <h2>
          <Icon name="clock" size={16} />
          {t("cmd.file.recent")}
        </h2>
        <ul className="welcome-recent">
          {entries.map((entry, index) => (
            <li key={`${entry.kind}-${index}`}>
              <button type="button" className="recent-open" data-recent={index}
                title={entry.paths.join("  ↔  ")}
                onClick={() => app.openRecentEntry(entry.kind, entry.paths)}>
                <Icon name={entry.kind === "directories" ? "folders" : entry.kind === "merge" ? "merge" : entry.kind === "repository" ? "repository" : "compareFiles"} size={15} />
                <span className="recent-label">{entry.paths.map(shortName).join("  ↔  ")}</span>
              </button>
              <button
                type="button"
                className="icon-button"
                title={t("dlg.remove")}
                aria-label={t("dlg.remove")}
                onClick={() =>
                  app.updateSettings({ recent: entries.filter((_, position) => position !== index) })}
              >
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
          {entries.length === 0 ? <li className="empty-row">{t("settings.noRecent")}</li> : null}
        </ul>
        {entries.length > 0 ? (
          <button type="button" className="panel-button" data-command="file.clearRecent"
            onClick={() => run("file.clearRecent")}>
            <Icon name="clearAll" size={15} />
            <span>{t("cmd.file.clearRecent")}</span>
          </button>
        ) : null}

        <p className="welcome-hint">
          <Icon name="drag" size={15} />
          {t("pane.dropHint")}
        </p>
      </div>
    </div>
  );
}

function shortName(target: string): string {
  const parts = target.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? target;
}
