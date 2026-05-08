const http = require("http");
const path = require("path");
const express = require("express");
const WebSocket = require("ws");
const pty = require("node-pty");
const { Client } = require("ssh2");

const PORT = process.env.PORT || 3000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function safeParse(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch (_error) {
    return null;
  }
}

function createLocalSession(ws) {
  const isWindows = process.platform === "win32";
  const shell = process.env.SHELL || (isWindows ? "powershell.exe" : "bash");
  const cwd = process.env.HOME || process.env.USERPROFILE;
  const term = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd,
    env: process.env,
  });

  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  term.onExit(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send("\r\n[Session ended]\r\n");
      ws.close();
    }
  });

  ws.on("message", (raw) => {
    const msg = safeParse(raw.toString());
    if (!msg) return;

    if (msg.type === "input" && typeof msg.data === "string") {
      term.write(msg.data);
    } else if (msg.type === "resize") {
      const cols = Number(msg.cols) || 100;
      const rows = Number(msg.rows) || 30;
      term.resize(cols, rows);
    }
  });

  ws.on("close", () => {
    term.kill();
  });
}

function createSshSession(ws, config) {
  const ssh = new Client();
  let sshStream = null;

  ssh
    .on("ready", () => {
      ssh.shell(
        { term: "xterm-256color", cols: 100, rows: 30 },
        (err, stream) => {
          if (err) {
            ws.send(`\r\n[ERROR] SSH shell open failed: ${err.message}\r\n`);
            ws.close();
            ssh.end();
            return;
          }

          sshStream = stream;
          ws.send(`\r\n[INFO] Connected to ${config.host}\r\n`);

          stream.on("data", (data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(data.toString("utf8"));
            }
          });

          stream.on("close", () => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send("\r\n[INFO] SSH session closed\r\n");
              ws.close();
            }
            ssh.end();
          });
        }
      );
    })
    .on("error", (err) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\r\n[ERROR] SSH connection failed: ${err.message}\r\n`);
      }
      ws.close();
    })
    .on("close", () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    })
    .connect(config);

  ws.on("message", (raw) => {
    const msg = safeParse(raw.toString());
    if (!msg || !sshStream) return;

    if (msg.type === "input" && typeof msg.data === "string") {
      sshStream.write(msg.data);
    } else if (msg.type === "resize") {
      const cols = Number(msg.cols) || 100;
      const rows = Number(msg.rows) || 30;
      sshStream.setWindow(rows, cols, 0, 0);
    }
  });

  ws.on("close", () => {
    if (sshStream) sshStream.end();
    ssh.end();
  });
}

wss.on("connection", (ws, req) => {
  const fullUrl = new URL(req.url, `http://${req.headers.host}`);
  const host = fullUrl.searchParams.get("host") || "localhost";
  const username = fullUrl.searchParams.get("username") || undefined;
  const password = fullUrl.searchParams.get("password") || undefined;
  const port = Number(fullUrl.searchParams.get("port")) || 22;

  if (LOCAL_HOSTS.has(host.toLowerCase())) {
    ws.send("[INFO] Localhost mode enabled.\r\n");
    createLocalSession(ws);
    return;
  }

  if (!username || !password) {
    ws.send(
      "\r\n[ERROR] Remote server requires username/password query params.\r\n"
    );
    ws.close();
    return;
  }

  createSshSession(ws, { host, port, username, password, readyTimeout: 10000 });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Web terminal server running on http://localhost:${PORT}`);
});
