const http = require("http");
const fs = require("fs");
const path = require("path");
const express = require("express");
const WebSocket = require("ws");
const pty = require("node-pty");
const { Client } = require("ssh2");

const PORT = process.env.PORT || 3000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);

const app = express();
app.use(express.static(path.join(__dirname, "public")));

// ─── File Upload Endpoint ────────────────────────────────────────────────────
app.post(
  "/api/upload",
  express.raw({ type: "*/*", limit: "500mb" }),
  (req, res) => {
    const rawName = req.headers["x-filename"];
    const filename = rawName
      ? decodeURIComponent(rawName)
      : "uploaded_file";
    const host = (req.query.host || "localhost").toLowerCase();
    const destDir = req.query.path || "";

    if (LOCAL_HOSTS.has(host)) {
      const dir = destDir || process.env.HOME || process.env.USERPROFILE || ".";
      const destPath = path.join(dir, filename);
      fs.writeFile(destPath, req.body, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, path: destPath });
      });
    } else {
      const username = req.query.username;
      const password = req.query.password;
      const port = Number(req.query.port) || 22;
      if (!username || !password) {
        return res.status(400).json({ error: "SSH credentials required" });
      }
      const remotePath = destDir ? `${destDir}/${filename}` : filename;
      const ssh = new Client();
      ssh
        .on("ready", () => {
          ssh.sftp((err, sftp) => {
            if (err) { ssh.end(); return res.status(500).json({ error: err.message }); }
            const ws = sftp.createWriteStream(remotePath);
            ws.on("close", () => { sftp.end(); ssh.end(); res.json({ success: true, path: remotePath }); });
            ws.on("error", (e) => { sftp.end(); ssh.end(); res.status(500).json({ error: e.message }); });
            ws.write(req.body);
            ws.end();
          });
        })
        .on("error", (err) => res.status(500).json({ error: err.message }))
        .connect({ host, port, username, password, readyTimeout: 10000 });
    }
  }
);

// ─── File Download Endpoint ──────────────────────────────────────────────────
app.get("/api/download", (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: "path is required" });

  const host = (req.query.host || "localhost").toLowerCase();
  const filename = path.basename(filePath);

  if (LOCAL_HOSTS.has(host)) {
    res.download(filePath, filename, (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: err.message });
    });
  } else {
    const username = req.query.username;
    const password = req.query.password;
    const port = Number(req.query.port) || 22;
    if (!username || !password) {
      return res.status(400).json({ error: "SSH credentials required" });
    }
    const ssh = new Client();
    ssh
      .on("ready", () => {
        ssh.sftp((err, sftp) => {
          if (err) { ssh.end(); return res.status(500).json({ error: err.message }); }
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.setHeader("Content-Type", "application/octet-stream");
          const rs = sftp.createReadStream(filePath);
          rs.on("error", (e) => { if (!res.headersSent) res.status(500).json({ error: e.message }); ssh.end(); });
          rs.on("end", () => { sftp.end(); ssh.end(); });
          rs.pipe(res);
        });
      })
      .on("error", (err) => {
        if (!res.headersSent) res.status(500).json({ error: err.message });
      })
      .connect({ host, port, username, password, readyTimeout: 10000 });
  }
});

// ─── Directory Browse Endpoint ───────────────────────────────────────────────
app.get("/api/browse", (req, res) => {
  const reqPath = req.query.path || "";
  const host = (req.query.host || "localhost").toLowerCase();

  if (LOCAL_HOSTS.has(host)) {
    const dirPath = reqPath || process.env.HOME || "/";
    fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
      if (err) return res.status(500).json({ error: err.message });
      const items = entries
        .map((e) => ({ name: e.name, isDir: e.isDirectory(), path: path.join(dirPath, e.name) }))
        .sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)));
      res.json({ path: dirPath, items });
    });
  } else {
    const username = req.query.username;
    const password = req.query.password;
    const port = Number(req.query.port) || 22;
    if (!username || !password)
      return res.status(400).json({ error: "SSH credentials required" });

    const ssh = new Client();
    ssh
      .on("ready", () => {
        ssh.sftp((err, sftp) => {
          if (err) { ssh.end(); return res.status(500).json({ error: err.message }); }

          const doList = (absPath) => {
            sftp.readdir(absPath, (err2, list) => {
              sftp.end(); ssh.end();
              if (err2) return res.status(500).json({ error: err2.message });
              const items = list
                .map((e) => ({
                  name: e.filename,
                  isDir: !!(e.attrs.mode && (e.attrs.mode & 0o170000) === 0o040000),
                  path: absPath.replace(/\/$/, "") + "/" + e.filename,
                }))
                .sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)));
              res.json({ path: absPath, items });
            });
          };

          const dirPath = reqPath || ".";
          if (dirPath === ".") {
            sftp.realpath(".", (err2, absPath) => {
              if (err2) { sftp.end(); ssh.end(); return res.status(500).json({ error: err2.message }); }
              doList(absPath);
            });
          } else {
            doList(dirPath);
          }
        });
      })
      .on("error", (err) => res.status(500).json({ error: err.message }))
      .connect({ host, port, username, password, readyTimeout: 10000 });
  }
});

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
