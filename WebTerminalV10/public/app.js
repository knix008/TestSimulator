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
