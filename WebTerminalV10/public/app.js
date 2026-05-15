const terminalWrapEl = document.getElementById("terminalWrap");
const terminalHostEl = document.getElementById("terminalHost");
const tabsEl = document.getElementById("tabs");
const newTabBtn = document.getElementById("newTabBtn");
const connectBtn = document.getElementById("connectBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const hostInputEl = document.getElementById("host");
const portInputEl = document.getElementById("port");
const usernameInputEl = document.getElementById("username");
const passwordInputEl = document.getElementById("password");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const uploadDirEl = document.getElementById("uploadDir");
const downloadPathEl = document.getElementById("downloadPath");
const downloadBtn = document.getElementById("downloadBtn");
const fileStatusEl = document.getElementById("fileStatus");

const tabs = new Map();
let activeTabId = null;
let tabCounter = 0;

function setButtonConnected(isConnected) {
  connectBtn.textContent = isConnected ? "Disconnect" : "Connect";
}

function setConnectionState(state) {
  statusDot.classList.remove("connecting", "connected");

  if (state === "connected") {
    statusDot.classList.add("connected");
    statusText.textContent = "Connected";
    return;
  }

  if (state === "connecting") {
    statusDot.classList.add("connecting");
    statusText.textContent = "Connecting";
    return;
  }

  statusText.textContent = "Disconnected";
}

function getActiveTab() {
  if (!activeTabId) return null;
  return tabs.get(activeTabId) || null;
}

function updateStatusForTab(tab) {
  if (!tab) {
    setButtonConnected(false);
    setConnectionState("disconnected");
    return;
  }

  if (tab.state === "connected") {
    setButtonConnected(true);
    setConnectionState("connected");
    return;
  }

  if (tab.state === "connecting") {
    setButtonConnected(true);
    setConnectionState("connecting");
    return;
  }

  setButtonConnected(false);
  setConnectionState("disconnected");
}

function syncTabSize(tab) {
  if (!tab) return;

  tab.fitAddon.fit();

  if (tab.socket && tab.socket.readyState === WebSocket.OPEN) {
    tab.socket.send(
      JSON.stringify({
        type: "resize",
        cols: tab.term.cols,
        rows: tab.term.rows,
      })
    );
  }
}

function scheduleTabFit(tab) {
  if (!tab) return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      syncTabSize(tab);
    });
  });
}

function renderTabs() {
  const tabButtons = tabsEl.querySelectorAll(".tab");
  for (const btn of tabButtons) btn.remove();

  for (const tab of tabs.values()) {
    const tabBtn = document.createElement("div");
    tabBtn.className = `tab${tab.id === activeTabId ? " active" : ""}`;
    tabBtn.dataset.tabId = tab.id;
    tabBtn.innerHTML = `
      <span>${tab.title}</span>
      <button type="button" class="tab-close" data-close-id="${tab.id}" aria-label="Close tab">x</button>
    `;
    tabsEl.insertBefore(tabBtn, newTabBtn);
  }
}

function activateTab(tabId) {
  const nextTab = tabs.get(tabId);
  if (!nextTab) return;

  for (const tab of tabs.values()) {
    tab.terminalPane.classList.remove("active");
  }
  nextTab.terminalPane.classList.add("active");

  activeTabId = tabId;
  renderTabs();
  updateStatusForTab(nextTab);

  scheduleTabFit(nextTab);
  setTimeout(() => {
    nextTab.term.focus();
  }, 0);
}

function disconnectTab(tab) {
  if (!tab) return;

  if (tab.socket && tab.socket.readyState === WebSocket.OPEN) {
    tab.socket.close();
    return;
  }

  if (tab.socket && tab.socket.readyState === WebSocket.CONNECTING) {
    tab.socket.close();
    tab.term.writeln("\r\n[Connection cancelled]");
    tab.state = "disconnected";
    if (tab.id === activeTabId) updateStatusForTab(tab);
  }
}

function closeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  disconnectTab(tab);
  tab.term.dispose();
  tab.terminalPane.remove();
  tabs.delete(tabId);

  if (tabs.size === 0) {
    createTab();
    return;
  }

  if (activeTabId === tabId) {
    const nextTabId = tabs.keys().next().value;
    activateTab(nextTabId);
  } else {
    renderTabs();
  }
}

function createTab() {
  tabCounter += 1;
  const tabId = `tab-${tabCounter}`;
  const title = `Terminal ${tabCounter}`;

  const terminalPane = document.createElement("div");
  terminalPane.className = "terminal-pane";
  terminalHostEl.appendChild(terminalPane);

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    theme: {
      background: "#020617",
      foreground: "#e2e8f0",
    },
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(terminalPane);

  const tab = {
    id: tabId,
    title,
    terminalPane,
    term,
    fitAddon,
    socket: null,
    state: "disconnected",
  };

  term.onData((data) => {
    if (tab.socket && tab.socket.readyState === WebSocket.OPEN) {
      tab.socket.send(JSON.stringify({ type: "input", data }));
    }
  });

  tabs.set(tabId, tab);
  activateTab(tabId);
  term.writeln("Ready. Click 'Connect' to start a session.");
}

function connectActiveTab() {
  const tab = getActiveTab();
  if (!tab) return;

  const hostInput = hostInputEl.value.trim();
  const host = hostInput || "localhost";
  const port = portInputEl.value.trim() || "22";
  const username = usernameInputEl.value.trim();
  const password = passwordInputEl.value;

  disconnectTab(tab);

  tab.term.clear();
  tab.term.writeln(`[${tab.title}] Connecting to ${host} ...`);
  tab.state = "connecting";
  updateStatusForTab(tab);

  const params = new URLSearchParams({ host, port });
  if (username) params.set("username", username);
  if (password) params.set("password", password);

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  tab.socket = new WebSocket(`${protocol}://${location.host}?${params.toString()}`);

  tab.socket.addEventListener("open", () => {
    tab.state = "connected";
    syncTabSize(tab);
    if (tab.id === activeTabId) updateStatusForTab(tab);
  });

  tab.socket.addEventListener("message", (event) => {
    tab.term.write(event.data);
  });

  tab.socket.addEventListener("close", () => {
    tab.term.writeln("\r\n[Disconnected]");
    tab.state = "disconnected";
    tab.socket = null;
    if (tab.id === activeTabId) updateStatusForTab(tab);
  });
}

// ─── File Transfer Helpers ────────────────────────────────────────────────────
function getConnectionParams() {
  const host = hostInputEl.value.trim() || "localhost";
  const port = portInputEl.value.trim() || "22";
  const username = usernameInputEl.value.trim();
  const password = passwordInputEl.value;
  return new URLSearchParams(
    Object.fromEntries(
      Object.entries({ host, port, username, password }).filter(([, v]) => v)
    )
  );
}

function setFileStatus(msg, type) {
  fileStatusEl.textContent = msg;
  fileStatusEl.className = `file-status${type ? " " + type : ""}`;
}

function showError(msg) {
  alert(msg);
}

function parentPath(p) {
  if (!p || p === "/") return "/";
  const parts = p.split("/").filter(Boolean);
  parts.pop();
  return "/" + parts.join("/") || "/";
}

// ─── File Browser Modal ───────────────────────────────────────────────────────
const fb = {
  overlay:    document.getElementById("fileBrowserModal"),
  titleEl:    document.getElementById("fbTitle"),
  pathInput:  document.getElementById("fbPathInput"),
  upBtn:      document.getElementById("fbUpBtn"),
  goBtn:      document.getElementById("fbGoBtn"),
  list:       document.getElementById("fbList"),
  footerInfo: document.getElementById("fbFooterInfo"),
  cancelBtn:  document.getElementById("fbCancelBtn"),
  actionBtn:  document.getElementById("fbActionBtn"),
  closeBtn:   document.getElementById("fbClose"),

  mode: "dir",          // "dir" | "file"
  currentPath: "",
  selectedPath: null,
  onConfirm: null,

  open(mode, onConfirm) {
    this.mode = mode;
    this.onConfirm = onConfirm;
    this.selectedPath = null;
    this.titleEl.textContent = mode === "dir" ? "Upload — 서버 저장 위치 선택" : "Download — 서버에서 파일 선택";
    this.actionBtn.textContent = mode === "dir" ? "이 위치에 저장" : "이 파일 다운로드";
    this.actionBtn.disabled = mode === "file";
    this.footerInfo.textContent = "";
    this.overlay.style.display = "flex";
    const hint = mode === "dir"
      ? (uploadDirEl.value.trim() || "")
      : (downloadPathEl.value.trim() ? parentPath(downloadPathEl.value.trim()) : "");
    this.browse(hint);
  },

  close() { this.overlay.style.display = "none"; },

  async browse(dirPath) {
    this.selectedPath = null;
    this.footerInfo.textContent = "";
    this.list.innerHTML = '<div class="fb-empty">Loading…</div>';

    const params = getConnectionParams();
    if (dirPath) params.set("path", dirPath);

    try {
      const res = await fetch(`/api/browse?${params}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      this.currentPath = data.path;
      this.pathInput.value = data.path;
      this.renderList(data.items);

      if (this.mode === "dir") {
        this.selectedPath = data.path;
        this.footerInfo.textContent = data.path;
        this.actionBtn.disabled = false;
      }
    } catch (e) {
      this.list.innerHTML = '<div class="fb-empty">—</div>';
      showError(`브라우저 오류: ${e.message}`);
    }
  },

  renderList(items) {
    this.list.innerHTML = "";
    if (!items.length) {
      this.list.innerHTML = '<div class="fb-empty">(비어 있음)</div>';
      return;
    }
    for (const item of items) {
      const el = document.createElement("div");
      el.className = "fb-item";
      el.dataset.path = item.path;
      el.dataset.isDir = item.isDir ? "1" : "0";
      el.innerHTML = `<span class="fb-item-icon">${item.isDir ? "📁" : "📄"}</span><span>${item.name}</span>`;
      this.list.appendChild(el);
    }
  },

  handleClick(el) {
    const isDir = el.dataset.isDir === "1";
    const itemPath = el.dataset.path;

    if (isDir) { this.browse(itemPath); return; }

    if (this.mode === "file") {
      this.list.querySelectorAll(".fb-selected").forEach((e) => e.classList.remove("fb-selected"));
      el.classList.add("fb-selected");
      this.selectedPath = itemPath;
      this.footerInfo.textContent = itemPath;
      this.actionBtn.disabled = false;
    }
  },

  confirm() {
    if (this.mode === "dir" && !this.selectedPath) this.selectedPath = this.currentPath;
    if (this.selectedPath && this.onConfirm) this.onConfirm(this.selectedPath);
    this.close();
  },
};

fb.list.addEventListener("click", (e) => {
  const item = e.target.closest(".fb-item");
  if (item) fb.handleClick(item);
});
fb.list.addEventListener("dblclick", (e) => {
  const item = e.target.closest(".fb-item");
  if (item && item.dataset.isDir === "0" && fb.mode === "file") fb.confirm();
});
fb.upBtn.addEventListener("click", () => fb.browse(parentPath(fb.currentPath)));
fb.goBtn.addEventListener("click", () => fb.browse(fb.pathInput.value.trim()));
fb.pathInput.addEventListener("keydown", (e) => { if (e.key === "Enter") fb.browse(fb.pathInput.value.trim()); });
fb.closeBtn.addEventListener("click", () => fb.close());
fb.cancelBtn.addEventListener("click", () => fb.close());
fb.actionBtn.addEventListener("click", () => fb.confirm());
fb.overlay.addEventListener("click", (e) => { if (e.target === fb.overlay) fb.close(); });

// ─── Upload ───────────────────────────────────────────────────────────────────
async function uploadFiles(files) {
  if (!files.length) return;
  const params = getConnectionParams();
  const dir = uploadDirEl.value.trim();
  if (dir) params.set("path", dir);

  setFileStatus(`Uploading ${files.length} file(s)…`, "");

  const results = await Promise.allSettled(
    Array.from(files).map((file) =>
      fetch(`/api/upload?${params}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Filename": encodeURIComponent(file.name),
        },
        body: file,
      }).then((r) => r.json())
    )
  );

  const failed = results.filter((r) => r.status === "rejected" || r.value?.error);
  if (failed.length === 0) {
    setFileStatus(`${files.length}개 파일 업로드 완료.`, "ok");
  } else {
    const firstErr = failed[0].reason?.message || failed[0].value?.error || "Unknown error";
    setFileStatus("", "");
    showError(`업로드 실패 (${failed.length}개): ${firstErr}`);
  }

  fileInput.value = "";
}

// ─── Download ─────────────────────────────────────────────────────────────────
async function downloadFile() {
  const filePath = downloadPathEl.value.trim();
  if (!filePath) return;

  const params = getConnectionParams();
  params.set("path", filePath);
  const filename = filePath.split("/").pop() || "download";

  setFileStatus("Downloading…", "");
  try {
    const response = await fetch(`/api/download?${params}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      setFileStatus("", "");
      showError(`다운로드 실패: ${err.error}`);
      return;
    }
    const blob = await response.blob();

    if (typeof window.showSaveFilePicker === "function") {
      // File System Access API: 저장 위치와 파일명을 OS 다이얼로그로 선택
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setFileStatus("다운로드 완료.", "ok");
      } catch (e) {
        if (e.name === "AbortError") { setFileStatus("취소됨.", ""); return; }
        throw e;
      }
    } else {
      // Fallback: blob URL — revokeObjectURL을 지연 호출해 파일 손상 방지
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setFileStatus("다운로드 완료.", "ok");
    }
  } catch (e) {
    setFileStatus("", "");
    showError(`다운로드 오류: ${e.message}`);
  }
}

// Upload: ① OS 파일 선택 → ② 서버 저장 디렉토리 선택 → ③ 업로드
uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (!fileInput.files.length) return;
  const pendingFiles = fileInput.files;
  fb.open("dir", (selectedDir) => {
    uploadDirEl.value = selectedDir;
    uploadFiles(pendingFiles);
  });
});

// Download: ① 서버 파일 선택 → ② OS 저장 위치 선택(showSaveFilePicker) → ③ 저장
downloadBtn.addEventListener("click", () => {
  fb.open("file", (selectedFile) => {
    downloadPathEl.value = selectedFile;
    downloadFile();
  });
});

createTab();
scheduleTabFit(getActiveTab());

window.addEventListener("load", () => {
  scheduleTabFit(getActiveTab());
});

window.addEventListener("resize", () => {
  syncTabSize(getActiveTab());
});

if (typeof ResizeObserver !== "undefined") {
  const resizeObserver = new ResizeObserver(() => {
    syncTabSize(getActiveTab());
  });
  resizeObserver.observe(terminalWrapEl);
}

connectBtn.addEventListener("click", () => {
  const tab = getActiveTab();
  if (!tab) return;

  if (tab.socket && (tab.socket.readyState === WebSocket.OPEN || tab.socket.readyState === WebSocket.CONNECTING)) {
    disconnectTab(tab);
    return;
  }

  connectActiveTab();
});

tabsEl.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const closeBtn = event.target.closest(".tab-close");
  if (closeBtn) {
    closeTab(closeBtn.dataset.closeId);
    return;
  }

  const tabBtn = event.target.closest(".tab");
  if (!tabBtn) return;
  activateTab(tabBtn.dataset.tabId);
});

newTabBtn.addEventListener("click", () => {
  createTab();
});
