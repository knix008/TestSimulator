const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "gemma4:26b";
const OLLAMA_BASE_URL = new URL(OLLAMA_URL).origin;

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

async function handleChat(req, res) {
  try {
    const body = await readJsonBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;

    if (messages.length === 0) {
      sendJson(res, 400, { error: "messages is required." });
      return;
    }

    const ollamaResp = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });

    if (!ollamaResp.ok) {
      const text = await ollamaResp.text();
      sendJson(res, ollamaResp.status, {
        error: "Failed to call Ollama.",
        detail: text,
      });
      return;
    }

    const data = await ollamaResp.json();
    const answer = data?.message?.content || "";

    sendJson(res, 200, {
      answer,
      model: data?.model || model,
      done: data?.done ?? true,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: "Server error while handling chat.",
      detail: error.message,
    });
  }
}

async function handleModels(_req, res) {
  try {
    const tagsUrl = new URL("/api/tags", OLLAMA_BASE_URL).toString();
    const ollamaResp = await fetch(tagsUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!ollamaResp.ok) {
      const text = await ollamaResp.text();
      sendJson(res, ollamaResp.status, {
        error: "Failed to fetch Ollama models.",
        detail: text,
      });
      return;
    }

    const data = await ollamaResp.json();
    const models = Array.isArray(data?.models)
      ? data.models
          .map((model) => model?.name)
          .filter((name) => typeof name === "string" && name.trim())
      : [];

    const selectedModel = models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : models[0] || DEFAULT_MODEL;

    sendJson(res, 200, {
      models,
      defaultModel: selectedModel,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: "Server error while loading models.",
      detail: error.message,
    });
  }
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
    handleChat(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/models") {
    handleModels(req, res);
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
