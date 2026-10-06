/**
 * The tab strip.
 *
 * When there are more tabs than fit, the strip does not get a scrollbar: a pair of
 * `‹ ›` buttons appears at the right edge and scrolls it, which is both the
 * requirement and the nicer thing to hit with a mouse. The buttons are hidden
 * entirely while everything fits.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons.js";
import { useApp, type Tab } from "./state.js";

const ICONS: Record<Tab["kind"], string> = {
  compare: "compareFiles",
  directory: "folders",
  merge: "merge",
  git: "repository",
};

export function TabBar({ onContextMenu }: { onContextMenu: (event: React.MouseEvent) => void }) {
  const app = useApp();
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    setOverflow(strip.scrollWidth > strip.clientWidth + 2);
  }, []);

  useEffect(() => {
    measure();
    const strip = stripRef.current;
    if (!strip) return;
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [measure, app.tabs.length]);

  // Keep the active tab in view when it changes from elsewhere (a new comparison).
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !app.activeId) return;
    const element = strip.querySelector<HTMLElement>(`[data-tab="${app.activeId}"]`);
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [app.activeId]);

  const scrollBy = (direction: -1 | 1) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * Math.max(160, strip.clientWidth * 0.6), behavior: "smooth" });
  };

  if (app.tabs.length === 0) return <div className="tabbar empty" />;

  return (
    <div className="tabbar" onContextMenu={onContextMenu}>
      <div className="tab-strip" ref={stripRef}>
        {app.tabs.map((tab) => (
          <div
            key={tab.id}
            data-tab={tab.id}
            className={`tab${tab.id === app.activeId ? " active" : ""}`}
            title={tabTitle(tab)}
            onPointerDown={() => app.setActive(tab.id)}
            onAuxClick={(event) => {
              if (event.button === 1) app.closeTab(tab.id);
            }}
          >
            <Icon name={ICONS[tab.kind]} size={15} />
            <span className="tab-label">{tab.title}</span>
            {tab.kind === "merge" && tab.dirty ? <span className="tab-dirty" aria-hidden="true">●</span> : null}
            <button
              type="button"
              className="tab-close"
              title={app.t("tip.closeTab")}
              aria-label={app.t("cmd.file.closeTab")}
              onPointerDown={(event) => {
                event.stopPropagation();
                app.closeTab(tab.id);
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>

      {overflow ? (
        <div className="tab-scrollers">
          <button
            type="button"
            className="tab-scroll"
            data-command="tabs.prev"
            title={app.t("tip.tabsPrev")}
            aria-label={app.t("tip.tabsPrev")}
            onClick={() => scrollBy(-1)}
          >
            <Icon name="prev" size={15} />
          </button>
          <button
            type="button"
            className="tab-scroll"
            data-command="tabs.next"
            title={app.t("tip.tabsNext")}
            aria-label={app.t("tip.tabsNext")}
            onClick={() => scrollBy(1)}
          >
            <Icon name="next" size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function tabTitle(tab: Tab): string {
  if (tab.kind === "compare") return `${tab.summary.left.label}\n${tab.summary.right.label}`;
  if (tab.kind === "directory") return `${tab.result.left}\n${tab.result.right}`;
  if (tab.kind === "merge") return tab.info.mergedPath;
  return tab.repository.path;
}
