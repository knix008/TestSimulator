import { getHistoryChannelName } from "./history-bridge.js";
import { t, setLocale, applyI18n } from "./i18n.js";

const CHANNEL = getHistoryChannelName();
const root = document.getElementById("historyWindow");
const listEl = document.getElementById("historyList");
const countEl = document.getElementById("historyCount");
const opacityBar = document.getElementById("historyOpacityBar");
const opacityValue = document.getElementById("historyOpacityValue");
const opacityWrap = document.querySelector(".history-opacity");

/** @type {any[]} */
let items = [];
let locale = "en";
let opacityPct = 100;
let compactMode = false;

function setCompactChrome(on) {
  compactMode = Boolean(on);
  document.documentElement.classList.toggle("is-compact", compactMode);
  document.body.classList.toggle("is-compact", compactMode);
  if (opacityWrap) opacityWrap.hidden = compactMode;
}

function clampOpacity(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 100;
  return Math.min(100, Math.max(20, Math.round(v)));
}

function syncOpacityFill(value) {
  if (!opacityBar) return;
  opacityBar.style.setProperty("--fill", `${value}%`);
}

function updateOpacityUi(value) {
  opacityPct = clampOpacity(value);
  if (opacityBar) {
    opacityBar.value = String(opacityPct);
    opacityBar.setAttribute("aria-valuenow", String(opacityPct));
    opacityBar.setAttribute("aria-valuetext", `${opacityPct}%`);
    opacityBar.setAttribute(
      "aria-label",
      t("spectrumOpacityTipPct", { n: opacityPct }),
    );
    syncOpacityFill(opacityPct);
  }
  if (opacityValue) opacityValue.textContent = `${opacityPct}%`;
}

async function applyLocalOpacity(value, { notify = true } = {}) {
  updateOpacityUi(value);
  if (window.desktopAPI?.setWindowOpacity) {
    await window.desktopAPI.setWindowOpacity(opacityPct / 100);
  } else {
    document.documentElement.style.opacity = String(opacityPct / 100);
  }
  if (notify) emit({ type: "opacity", opacity: opacityPct });
}

function applyThemePayload(theme) {
  if (!theme || typeof theme !== "object") return;
  const html = document.documentElement;
  if (theme.themeId) html.setAttribute("data-theme", theme.themeId);
  if (theme.scheme) {
    html.setAttribute("data-color-scheme", theme.scheme);
    html.style.colorScheme = theme.scheme === "light" ? "light" : "dark";
  }
  if (theme.vars && typeof theme.vars === "object") {
    for (const [key, value] of Object.entries(theme.vars)) {
      if (typeof value === "string") html.style.setProperty(key, value);
    }
  }
}

function historyTypeLabel(type) {
  if (type === "youtube") return t("historyTypeYoutube");
  if (type === "remote") return t("historyTypeRemote");
  if (type === "rtsp") return t("historyTypeRtsp");
  return t("historyTypeFile");
}

function formatHistoryDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatBytes(n) {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function renderList() {
  if (!listEl || !root) return;
  listEl.innerHTML = "";
  root.classList.toggle("is-empty", items.length === 0);
  if (countEl) {
    countEl.textContent = items.length
      ? t("historyCount", { n: items.length })
      : "";
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "history-item";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "history-item-main";
    openBtn.title =
      item.type === "file" ? item.path || item.title : item.url || item.title;

    const badgeClass =
      item.type === "youtube"
        ? "yt"
        : item.type === "rtsp"
          ? "rtsp"
          : item.type === "remote"
            ? "yt"
            : "file";
    const badgeLabel =
      item.type === "youtube"
        ? "YT"
        : item.type === "rtsp"
          ? "RTSP"
          : item.type === "remote"
            ? "URL"
            : "FILE";
    const location = item.type === "file" ? item.path || "" : item.url || "";
    const formatLabel =
      item.type === "youtube"
        ? "YouTube"
        : item.type === "remote"
          ? item.service === "instagram"
            ? "Instagram"
            : item.service === "tiktok"
              ? "TikTok"
              : "URL"
          : item.type === "rtsp"
            ? "RTSP"
            : (item.ext || "").replace(/^\./, "").toUpperCase() || "MEDIA";

    openBtn.innerHTML = `
      <span class="recent-badge ${badgeClass}">${badgeLabel}</span>
      <span class="history-item-text">
        <span class="history-item-title"></span>
        <span class="history-item-path"></span>
        <span class="history-item-meta"></span>
      </span>
    `;
    openBtn.querySelector(".history-item-title").textContent =
      item.title || item.name || "—";
    openBtn.querySelector(".history-item-path").textContent = location || "—";
    const metaBits = [
      historyTypeLabel(item.type),
      formatLabel,
      item.size > 0 ? formatBytes(item.size) : "",
      formatHistoryDate(item.playedAt),
    ].filter(Boolean);
    openBtn.querySelector(".history-item-meta").textContent =
      metaBits.join(" · ");
    openBtn.addEventListener("click", () => {
      emit({ type: "play", id: item.id });
    });

    const footer = document.createElement("div");
    footer.className = "history-item-footer";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "history-item-delete";
    del.textContent = t("historyRemove");
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      emit({ type: "remove", id: item.id });
    });
    footer.appendChild(del);

    li.appendChild(openBtn);
    li.appendChild(footer);
    listEl.appendChild(li);
  }
}

function applyLocalUi() {
  applyI18n(document);
  document.title = `${t("historyTitle")} — MyVideoPlayer`;
  updateOpacityUi(opacityPct);
  setCompactChrome(compactMode);
  renderList();
}

function emit(message) {
  const payload = { channel: CHANNEL, ...message };
  if (window.desktopAPI?.sendHistoryHostMessage) {
    window.desktopAPI.sendHistoryHostMessage(payload);
  }
  try {
    if (typeof BroadcastChannel !== "undefined") {
      new BroadcastChannel(CHANNEL).postMessage(payload);
    }
  } catch {
    /* ignore */
  }
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(payload, window.location.origin);
    } catch {
      /* ignore */
    }
  }
}

function handleMessage(msg) {
  if (!msg || (msg.channel && msg.channel !== CHANNEL)) return;
  switch (msg.type) {
    case "init":
    case "sync":
      if (msg.locale) {
        locale = msg.locale === "ko" ? "ko" : "en";
        setLocale(locale);
      }
      if (Array.isArray(msg.items)) items = msg.items;
      if (msg.theme) applyThemePayload(msg.theme);
      if (msg.opacity != null) {
        void applyLocalOpacity(msg.opacity, { notify: false });
      }
      if (msg.compact != null) compactMode = Boolean(msg.compact);
      applyLocalUi();
      break;
    case "items":
      if (Array.isArray(msg.items)) {
        items = msg.items;
        renderList();
      }
      break;
    case "theme":
      if (msg.theme) applyThemePayload(msg.theme);
      break;
    case "opacity":
      if (msg.opacity != null) {
        void applyLocalOpacity(msg.opacity, { notify: false });
      }
      break;
    case "compact":
      setCompactChrome(Boolean(msg.compact));
      break;
    case "locale":
      locale = msg.locale === "ko" ? "ko" : "en";
      setLocale(locale);
      applyLocalUi();
      break;
    case "close":
      window.close();
      break;
    default:
      break;
  }
}

function bindResizeGrip() {
  const grip = document.getElementById("historyResizeGrip");
  if (!grip) return;

  const MIN_W = 300;
  const MIN_H = 280;
  let resizing = false;
  let startX = 0;
  let startY = 0;
  let startBounds = null;

  const onMove = (e) => {
    if (!resizing || !startBounds) return;
    const dx = e.screenX - startX;
    const dy = e.screenY - startY;
    const width = Math.max(MIN_W, Math.round(startBounds.width + dx));
    const height = Math.max(MIN_H, Math.round(startBounds.height + dy));
    if (window.desktopAPI?.setBounds) {
      void window.desktopAPI.setBounds({
        x: startBounds.x,
        y: startBounds.y,
        width,
        height,
      });
    } else {
      try {
        window.resizeTo(width, height);
      } catch {
        /* ignore */
      }
    }
  };

  const endResize = () => {
    if (!resizing) return;
    resizing = false;
    startBounds = null;
    grip.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", endResize, true);
    window.removeEventListener("pointercancel", endResize, true);
  };

  grip.addEventListener("pointerdown", async (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    startX = e.screenX;
    startY = e.screenY;
    if (window.desktopAPI?.getBounds) {
      startBounds = await window.desktopAPI.getBounds();
    } else {
      startBounds = {
        x: window.screenX,
        y: window.screenY,
        width: window.outerWidth,
        height: window.outerHeight,
      };
    }
    if (!startBounds) return;
    resizing = true;
    grip.classList.add("is-dragging");
    try {
      grip.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", endResize, true);
    window.addEventListener("pointercancel", endResize, true);
  });
}

function bind() {
  document.getElementById("btnHistoryClear")?.addEventListener("click", () => {
    emit({ type: "clear" });
  });
  document
    .getElementById("btnHistoryWinClose")
    ?.addEventListener("click", () => {
      emit({ type: "closed" });
      window.close();
    });

  opacityBar?.addEventListener("input", () => {
    void applyLocalOpacity(opacityBar.value, { notify: true });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (window.desktopAPI?.minimize) {
      void window.desktopAPI.minimize();
    }
  });

  bindResizeGrip();

  window.addEventListener("beforeunload", () => {
    emit({ type: "closed" });
  });

  window.addEventListener("message", (e) => {
    handleMessage(e.data);
  });

  if (typeof BroadcastChannel !== "undefined") {
    const ch = new BroadcastChannel(CHANNEL);
    ch.addEventListener("message", (e) => handleMessage(e.data));
  }

  if (window.desktopAPI?.onHistoryMessage) {
    window.desktopAPI.onHistoryMessage(handleMessage);
  }

  applyLocalUi();
  emit({ type: "ready" });
}

bind();
