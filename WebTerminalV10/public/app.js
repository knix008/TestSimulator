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
const terminalEl = document.getElementById("terminal");
const terminalWrapEl = document.getElementById("terminalWrap");
term.open(terminalEl);
fitAddon.fit();

let socket = null;
const connectBtn = document.getElementById("connectBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

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

function syncTerminalSize() {
  fitAddon.fit();
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "resize",
        cols: term.cols,
        rows: term.rows,
      })
    );
  }
}

function disconnect() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
    return;
  }

  if (socket && socket.readyState === WebSocket.CONNECTING) {
    socket.close();
    term.writeln("\r\n[Connection cancelled]");
  }
}

function connect() {
  const hostInput = document.getElementById("host").value.trim();
  const host = hostInput || "localhost";
  const port = document.getElementById("port").value.trim() || "22";
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  disconnect();

  term.clear();
  term.writeln(`Connecting to ${host} ...`);
  setButtonConnected(true);
  setConnectionState("connecting");

  const params = new URLSearchParams({ host, port });
  if (username) params.set("username", username);
  if (password) params.set("password", password);

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}?${params.toString()}`);

  socket.addEventListener("open", () => {
    syncTerminalSize();
    setConnectionState("connected");
  });

  socket.addEventListener("message", (event) => {
    term.write(event.data);
  });

  socket.addEventListener("close", () => {
    term.writeln("\r\n[Disconnected]");
    setButtonConnected(false);
    setConnectionState("disconnected");
    socket = null;
  });
}

term.onData((data) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "input", data }));
  }
});

window.addEventListener("resize", () => {
  syncTerminalSize();
});

if (typeof ResizeObserver !== "undefined") {
  const resizeObserver = new ResizeObserver(() => {
    syncTerminalSize();
  });
  resizeObserver.observe(terminalWrapEl);
}

connectBtn.addEventListener("click", () => {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    disconnect();
    return;
  }

  connect();
});

setButtonConnected(false);
setConnectionState("disconnected");
term.writeln("Ready. Click 'Connect' to start a session.");
