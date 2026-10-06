/**
 * The left panel on every tab that is not a merge: the sessions.
 *
 * A session is a comparison you want back later — a pair of folders you keep
 * checking, the two files you are working through — so this panel is a list of them,
 * saved ones first and then what you opened recently. Clicking one reopens it.
 *
 * It is the one piece of the window that is about the work rather than about the
 * file in front of you, which is why it survives tab switches and why a merge, which
 * has its conflicts to show instead, replaces it.
 */
import { SESSION_TYPES, sessionType, type SavedSession } from "../core/sessions.js";
import { Icon } from "./icons.js";
import { useApp } from "./state.js";

export function SessionPanel({ onChoose }: { onChoose: (id: string) => void }) {
  const app = useApp();
  const { t, settings } = app;
  const saved = settings.sessions ?? [];
  const recent = settings.recent ?? [];

  return (
    <aside className="panel panel-left" style={{ width: settings.leftPanelWidth }}>
      <header className="panel-title">
        <Icon name="session" size={15} />
        <span>{t("session.title")}</span>
        <button
          type="button"
          className="icon-button"
          data-command="session.save"
          title={t("session.save")}
          disabled={!app.active}
          onClick={() => void app.saveSession()}
        >
          <Icon name="save" size={14} />
        </button>
      </header>

      <div className="panel-scroll">
        <section className="panel-section">
          <h3>{t("session.new")}</h3>
          <div className="panel-actions">
            {SESSION_TYPES.map((type) => (
              <button
                key={type.kind}
                type="button"
                className="panel-button"
                data-session-type={type.kind}
                title={app.language === "en" ? type.enHint : type.koHint}
                onClick={() => onChoose(type.command)}
              >
                <Icon name={type.icon} size={16} />
                <span>{app.language === "en" ? type.en : type.ko}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h3>
            {t("session.saved")}
            <span className="count">{saved.length}</span>
          </h3>
          {saved.length === 0 ? (
            <p className="panel-empty">{t("session.noneSaved")}</p>
          ) : (
            saved.map((item) => <SavedRow key={item.id} session={item} />)
          )}
        </section>

        <section className="panel-section">
          <h3>
            {t("session.recent")}
            <span className="count">{recent.length}</span>
          </h3>
          {recent.length === 0 ? (
            <p className="panel-empty">{t("settings.noRecent")}</p>
          ) : (
            recent.map((entry, index) => (
              <button
                key={index}
                type="button"
                className="panel-button"
                data-recent={index}
                title={entry.paths.join("\n")}
                onClick={() => void app.openRecentEntry(entry.kind, entry.paths)}
              >
                <Icon name={iconForRecent(entry.kind)} size={15} />
                <span>{shortName(entry.paths)}</span>
              </button>
            ))
          )}
        </section>
      </div>
    </aside>
  );
}

function SavedRow({ session }: { session: SavedSession }) {
  const app = useApp();
  const type = sessionType(session.kind);

  return (
    <div className="session-row">
      <button
        type="button"
        className="panel-button"
        data-session={session.id}
        title={session.paths.join("\n")}
        onClick={() => void app.openSavedSession(session)}
      >
        <Icon name={type?.icon ?? "session"} size={15} />
        <span>{session.name}</span>
      </button>
      <button
        type="button"
        className="icon-button"
        data-session-remove={session.id}
        title={app.t("session.remove")}
        onClick={() => void app.removeSession(session.id)}
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}

function iconForRecent(kind: string): string {
  switch (kind) {
    case "directories": return "folders";
    case "merge": return "merge";
    case "conflict": return "conflict";
    case "repository": return "repository";
    case "session": return "session";
    default: return "compareFiles";
  }
}

function shortName(paths: string[]): string {
  const names = paths.slice(0, 2).map((item) => item.split(/[\\/]/).filter(Boolean).pop() ?? item);
  return names.length > 1 ? `${names[0]} ↔ ${names[1]}` : names[0] ?? "";
}
