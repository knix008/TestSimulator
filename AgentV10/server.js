const http = require("http");
const fs = require("fs");
const path = require("path");
const { OLLAMA_URL, DEFAULT_MODEL } = require("./ollama");
const { handleChat } = require("./routes/chat");
const { handleModels } = require("./routes/models");

const HOST = "127.0.0.1";
const PORT = process.env.PORT || 3000;

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        resolve(parsed);
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    serveFile(res, path.join(__dirname, "public", "index.html"), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/styles.css") {
    serveFile(res, path.join(__dirname, "public", "styles.css"), "text/css; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/app.js") {
    serveFile(res, path.join(__dirname, "public", "app.js"), "application/javascript; charset=utf-8");
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    handleChat(req, res, { readJsonBody, sendJson });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/models") {
    handleModels(req, res, { sendJson });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`Demo chat server running on http://${HOST}:${PORT}`);
  console.log(`Using Ollama endpoint: ${OLLAMA_URL}`);
  console.log(`Default model: ${DEFAULT_MODEL}`);
});
