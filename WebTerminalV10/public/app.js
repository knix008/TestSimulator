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
term.open(document.getElementById("terminal"));
fitAddon.fit();

let socket = null;

function connect() {
  const hostInput = document.getElementById("host").value.trim();
  const host = hostInput || "localhost";
  const port = document.getElementById("port").value.trim() || "22";
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }

  term.clear();
  term.writeln(`Connecting to ${host} ...`);

  const params = new URLSearchParams({ host, port });
  if (username) params.set("username", username);
  if (password) params.set("password", password);

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}?${params.toString()}`);

  socket.addEventListener("open", () => {
    const { cols, rows } = term;
    socket.send(JSON.stringify({ type: "resize", cols, rows }));
  });

  socket.addEventListener("message", (event) => {
    term.write(event.data);
  });

  socket.addEventListener("close", () => {
    term.writeln("\r\n[Disconnected]");
  });
}

term.onData((data) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "input", data }));
  }
});

window.addEventListener("resize", () => {
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
});

document.getElementById("connectBtn").addEventListener("click", connect);

connect();
