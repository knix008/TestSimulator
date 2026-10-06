import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DirectoryCompareResult } from "../core/dirCompare";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "../core/settings";
import { applyTheme } from "../core/themes";
import { api, type RepoInfo, type SessionSummary, type Settings } from "./api";
import { DiffPanes, type DiffPanesHandle } from "./DiffPanes";
import { DirectoryPanel } from "./DirectoryPanel";
import { ErrorDialog } from "./ErrorDialog";
import { GitPanel } from "./GitPanel";
import { Icon } from "./icons";
import { PathPicker } from "./PathPicker";
import { Preferences } from "./Preferences";
import { SplitPane } from "./SplitPane";
import { UnifiedDiffView } from "./UnifiedDiffView";
import { translator, type StringKey } from "./i18n";

type Tab = "git" | "file" | "directory";

type PickerRequest = {
  title: string;
  mode: "file" | "directory";
  resolve: (value: string | null) => void;
};

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [directory, setDirectory] = useState<DirectoryCompareResult | null>(null);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [gitAvailable, setGitAvailable] = useState(true);
  const [tab, setTab] = useState<Tab>("git");
  const [error, setError] = useState<unknown>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [status, setStatus] = useState("");
  const panes = useRef<DiffPanesHandle | null>(null);
  const desktop = typeof window !== "undefined" && Boolean(window.mydiff);

  const t = useMemo(() => translator(settings?.language ?? "ko"), [settings?.language]);

  /* ---------------- bootstrap ---------------- */

  useEffect(() => {
    api.bootstrap()
      .then((boot) => {
        setSettings(boot.settings);
        applyTheme(boot.settings.theme);
        setSession(boot.session);
        setDirectory(boot.directory);
        setRepo(boot.repo);
        setGitAvailable(boot.git);
        if (boot.session) setTab("file");
        else if (boot.directory) setTab("directory");
        if (boot.message) setStatus(boot.message);
      })
      .catch(setError);
  }, []);

  /* ---------------- helpers ---------------- */

  const copyText = useCallback((value: string) => {
    if (window.mydiff?.copyText) {
      void window.mydiff.copyText(value);
      return;
    }
    void navigator.clipboard?.writeText(value).catch(() => undefined);
  }, []);

  const pickPath = useCallback((mode: "file" | "directory", title: string) => {
    if (window.mydiff) {
      return mode === "file" ? window.mydiff.pickFile(title) : window.mydiff.pickDirectory(title);
    }
    return new Promise<string | null>((resolve) => setPicker({ title, mode, resolve }));
  }, []);

  const patchSettings = useCallback((patch: Partial<Settings>, persist = true) => {
    setSettings((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (patch.theme) applyTheme(next.theme);
      return next;
    });
    if (persist) api.saveSettings(patch).catch(setError);
  }, []);

  const openPair = useCallback(async (side: "left" | "right" | "both") => {
    if (!settings) return;
    const current = session;
    let left = side === "right" ? current?.left.path ?? "" : "";
    let right = side === "left" ? current?.right.path ?? "" : "";
    if (side !== "right") {
      const picked = await pickPath("file", t("openLeft"));
      if (!picked) return;
      left = picked;
    }
    if (side !== "left") {
      const picked = await pickPath("file", t("openRight"));
      if (!picked) return;
      right = picked;
    }
    try {
      const response = await api.openFiles(left, right);
      setSession(response.session);
      setTab("file");
    } catch (reason) {
      setError(reason);
    }
  }, [session, settings, pickPath, t]);

  const reload = useCallback(async () => {
    try {
      const response = await api.reload();
      setSession(response.session);
    } catch (reason) {
      setError(reason);
    }
  }, []);

  /* ---------------- keyboard and wheel ---------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        event.preventDefault();
        panes.current?.goToDiff(event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        setMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!settings) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const step = event.deltaY < 0 ? 0.5 : -0.5;
      const size = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, settings.paneFontSize + step));
      if (size !== settings.paneFontSize) patchSettings({ paneFontSize: size });
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [settings?.paneFontSize, patchSettings, settings]);

  // Remember the window size for the next desktop launch.
  useEffect(() => {
    if (!desktop) return;
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        api.saveSettings({
          window: { width: window.outerWidth, height: window.outerHeight, maximized: false },
        }).catch(() => undefined);
      }, 600);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [desktop]);

  if (!settings) {
    return <div className="boot">MyDiff</div>;
  }

  /* ---------------- pieces ---------------- */

  const diffArea = session
    ? <DiffPanes ref={panes} summary={session} settings={settings} t={t} onError={setError} />
    : <div className="empty-panes">{t("statusNoSession")}</div>;

  const gitRight = (
    <SplitPane direction="column" storageKey="git-right">
      {diffArea}
      <UnifiedDiffView summary={session} t={t} fontSize={settings.paneFontSize} copyText={copyText} />
    </SplitPane>
  );

  const menus: { id: string; label: StringKey; items: { label: StringKey; icon: string; action: () => void; disabled?: boolean; checked?: boolean }[] }[] = [
    {
      id: "file",
      label: "menuFile",
      items: [
        { label: "openLeft", icon: "openLeft", action: () => void openPair("left") },
        { label: "openRight", icon: "openRight", action: () => void openPair("right") },
        { label: "reload", icon: "reload", action: () => void reload(), disabled: !session },
        { label: "preferences", icon: "settings", action: () => setShowPrefs(true) },
      ],
    },
    {
      id: "view",
      label: "menuView",
      items: [
        { label: "prevDiff", icon: "prev", action: () => panes.current?.goToDiff(-1), disabled: !session },
        { label: "nextDiff", icon: "next", action: () => panes.current?.goToDiff(1), disabled: !session },
        { label: "wordWrap", icon: "wrap", action: () => patchSettings({ wordWrap: !settings.wordWrap }), checked: settings.wordWrap },
        { label: "wordHighlight", icon: "highlight", action: () => patchSettings({ wordHighlight: !settings.wordHighlight }), checked: settings.wordHighlight },
        {
          label: settings.theme === "dark" ? "themeLight" : "themeDark",
          icon: "theme",
          action: () => patchSettings({ theme: settings.theme === "dark" ? "light" : "dark" }),
        },
        { label: "copyLeft", icon: "copy", action: () => void copySide("left"), disabled: !session },
        { label: "copyRight", icon: "copy", action: () => void copySide("right"), disabled: !session },
      ],
    },
    {
      id: "git",
      label: "menuGit",
      items: [
        { label: "tabGit", icon: "git", action: () => setTab("git") },
        { label: "gitRefresh", icon: "refresh", action: () => setTab("git") },
        { label: "gitAutoRefresh", icon: "refresh", action: () => patchSettings({ autoRefresh: !settings.autoRefresh }), checked: settings.autoRefresh },
      ],
    },
    {
      id: "help",
      label: "menuHelp",
      items: [
        { label: "about", icon: "info", action: () => setShowAbout(true) },
      ],
    },
  ];

  async function copySide(side: "left" | "right") {
    const text = await panes.current?.copySide(side);
    if (text) copyText(text);
  }

  return (
    <div className="app" onPointerDown={(event) => {
      if (menu && !(event.target as HTMLElement).closest(".menu-root")) setMenu(null);
    }}>
      <nav className="menu-bar">
        {menus.map((entry) => (
          <div key={entry.id} className="menu-root">
            <button
              type="button"
              className={`menu-title${menu === entry.id ? " is-open" : ""}`}
              onClick={() => setMenu(menu === entry.id ? null : entry.id)}
            >
              {t(entry.label)}
            </button>
            {menu === entry.id && (
              <div className="menu-drop">
                {entry.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="menu-item"
                    disabled={item.disabled}
                    onClick={() => {
                      setMenu(null);
                      item.action();
                    }}
                  >
                    <Icon name={item.icon} />
                    <span>{t(item.label)}</span>
                    {item.checked && <Icon name="check" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <span className="menu-spacer" />
        <span className="app-name">MyDiff</span>
      </nav>

      <div className="toolbar">
        <button type="button" className="btn tool" title={t("tipOpenLeft")} onClick={() => void openPair("left")}>
          <Icon name="openLeft" /> {t("openLeft")}
        </button>
        <button type="button" className="btn tool" title={t("tipOpenRight")} onClick={() => void openPair("right")}>
          <Icon name="openRight" /> {t("openRight")}
        </button>
        <button type="button" className="btn tool" title={t("tipReload")} disabled={!session} onClick={() => void reload()}>
          <Icon name="reload" /> {t("reload")}
        </button>
        <span className="sep" />
        <button type="button" className="btn tool" title={t("tipPrevDiff")} disabled={!session} onClick={() => panes.current?.goToDiff(-1)}>
          <Icon name="prev" /> {t("prevDiff")}
        </button>
        <button type="button" className="btn tool" title={t("tipNextDiff")} disabled={!session} onClick={() => panes.current?.goToDiff(1)}>
          <Icon name="next" /> {t("nextDiff")}
        </button>
        <span className="sep" />
        <button
          type="button"
          className={`btn tool${settings.wordWrap ? " is-on" : ""}`}
          title={t("tipWordWrap")}
          onClick={() => patchSettings({ wordWrap: !settings.wordWrap })}
        >
          <Icon name="wrap" /> {t("wordWrap")}
        </button>
        <button
          type="button"
          className={`btn tool${settings.wordHighlight ? " is-on" : ""}`}
          title={t("tipWordHighlight")}
          onClick={() => patchSettings({ wordHighlight: !settings.wordHighlight })}
        >
          <Icon name="highlight" />
        </button>
        <span className="sep" />
        <span className="font-size" title={t("tipFontSize")}>
          <Icon name="font" />
          <button type="button" className="btn icon" onClick={() => patchSettings({ paneFontSize: Math.max(MIN_FONT_SIZE, settings.paneFontSize - 0.5) })}>−</button>
          <output>{settings.paneFontSize.toFixed(1)}</output>
          <button type="button" className="btn icon" onClick={() => patchSettings({ paneFontSize: Math.min(MAX_FONT_SIZE, settings.paneFontSize + 0.5) })}>+</button>
        </span>
        <span className="menu-spacer" />
        <button
          type="button"
          className="btn tool"
          title={t("tipTheme")}
          onClick={() => patchSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
        >
          <Icon name="theme" />
        </button>
        <button type="button" className="btn tool" title={t("tipPreferences")} onClick={() => setShowPrefs(true)}>
          <Icon name="settings" />
        </button>
        <button type="button" className="btn tool" title={t("tipAbout")} onClick={() => setShowAbout(true)}>
          <Icon name="info" />
        </button>
      </div>

      <div className="tabs">
        {([
          ["git", "tabGit", "git"],
          ["file", "tabFile", "fileCompare"],
          ["directory", "tabDirectory", "dirCompare"],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            className={`tab${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon name={icon} /> {t(label)}
          </button>
        ))}
      </div>

      <main className="content">
        {tab === "git" && (
          <GitPanel
            t={t}
            language={settings.language}
            settings={settings}
            gitAvailable={gitAvailable}
            initialRepo={repo}
            recent={settings.recentRepositories}
            onRepoChange={setRepo}
            onSession={setSession}
            onError={setError}
            pickDirectory={(title) => pickPath("directory", title)}
            copyText={copyText}
          >
            {gitRight}
          </GitPanel>
        )}
        {tab === "file" && <div className="file-layout">{diffArea}</div>}
        {tab === "directory" && (
          <DirectoryPanel
            t={t}
            settings={settings}
            result={directory}
            onResult={setDirectory}
            onSession={setSession}
            onError={setError}
            pickDirectory={(title) => pickPath("directory", title)}
          >
            {diffArea}
          </DirectoryPanel>
        )}
      </main>

      <footer className="status-bar">
        <span className="status-main">{status || statusLine(session, t)}</span>
        {repo && (
          <span className="status-repo">
            <Icon name="branch" /> {repo.branch ?? t("gitDetached")}
            {repo.ahead > 0 ? ` ↑${repo.ahead}` : ""}
            {repo.behind > 0 ? ` ↓${repo.behind}` : ""}
          </span>
        )}
      </footer>

      {showPrefs && (
        <Preferences
          t={t}
          settings={settings}
          onPreview={(patch) => patchSettings(patch, false)}
          onClose={(saved) => {
            setShowPrefs(false);
            if (saved) api.settings().then(setSettings).catch(setError);
          }}
          onError={setError}
        />
      )}
      {picker && (
        <PathPicker
          t={t}
          title={picker.title}
          mode={picker.mode}
          onPick={(value) => {
            picker.resolve(value);
            setPicker(null);
          }}
        />
      )}
      {showAbout && (
        <div className="modal-backdrop" onPointerDown={(event) => {
          if (event.target === event.currentTarget) setShowAbout(false);
        }}>
          <div className="modal about" role="dialog">
            <header className="modal-header">{t("about")}</header>
            <div className="modal-body">
              <h2>MyDiff</h2>
              <p className="about-body">{t("aboutBody")}</p>
              <p className="about-meta">
                {t("aboutVersion")} 1.0.0 · {t("aboutBuild")} {__MYDIFF_BUILD__.slice(0, 16).replace("T", " ")}
              </p>
              <p className="about-meta">{t("aboutCopyright")}</p>
            </div>
            <footer className="modal-footer">
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={() => setShowAbout(false)}>{t("ok")}</button>
            </footer>
          </div>
        </div>
      )}
      {error !== null && error !== undefined && (
        <ErrorDialog t={t} error={error} onClose={() => setError(null)} copyText={copyText} />
      )}
    </div>
  );
}

function statusLine(session: SessionSummary | null, t: ReturnType<typeof translator>): string {
  if (!session) return t("statusNoSession");
  const left = fileName(session.left.label);
  const right = fileName(session.right.label);
  if (session.identical) return `${left} ↔ ${right} — ${t("statusIdentical")}`;
  if (session.mode === "binary") {
    return `${left} ↔ ${right} — ${t("statusBinary")}, ${session.differentBytes.toLocaleString()} ${t("statusBytesDiffer")}`
      + ` (${t("statusAdded")} ${session.added} / ${t("statusRemoved")} ${session.removed} / ${t("statusModified")} ${session.modified})`;
  }
  return `${left} ↔ ${right} — ${t("statusAdded")} ${session.added} / ${t("statusRemoved")} ${session.removed}`
    + ` / ${t("statusModified")} ${session.modified} · ${session.rowCount.toLocaleString()} ${t("statusRows")}`;
}

function fileName(label: string): string {
  const parts = label.split(/[\\/]/);
  return parts[parts.length - 1] || label;
}
