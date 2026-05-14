import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getOrCreateTts,
  synthesizeToWavBuffer,
  listVoicesFromTts,
  resolveModelDir,
  isReady,
} from "./sherpa-tts.mjs";
import { wavBufferToMp3Buffer } from "./wav-to-mp3.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 3847;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function parseSid(voice) {
  if (voice === undefined || voice === null) return 0;
  const s = String(voice).trim();
  if (!s) return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

app.get("/api/health", async (_req, res) => {
  try {
    await getOrCreateTts();
    res.json({
      ok: true,
      engine: "sherpa-onnx",
      modelDir: resolveModelDir(),
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      engine: "sherpa-onnx",
      modelDir: resolveModelDir(),
      error: String(e?.message || e),
    });
  }
});

app.get("/api/voices", async (_req, res) => {
  try {
    await getOrCreateTts();
    res.json({ ok: true, voices: listVoicesFromTts() });
  } catch (e) {
    res.status(503).json({
      ok: false,
      voices: [],
      error: String(e?.message || e),
    });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const raw = typeof req.body?.text === "string" ? req.body.text : "";
    const text = raw.trim();
    if (!text) {
      res.status(400).json({ error: "텍스트가 비어 있습니다." });
      return;
    }
    if (text.length > 8000) {
      res.status(400).json({ error: "텍스트는 8000자 이하로 입력해 주세요." });
      return;
    }

    const sid = parseSid(req.body?.voice);

    const buf = await synthesizeToWavBuffer(text, {
      sid,
      ratePercent: req.body?.ratePercent,
      pitchHz: req.body?.pitchHz,
      volumePercent: req.body?.volumePercent,
    });
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    res.send(buf);
  } catch (e) {
    res.status(503).json({ error: String(e?.message || e) });
  }
});

const wavBodyParser = express.raw({
  type: ["audio/wav", "application/octet-stream"],
  limit: "50mb",
});

app.post("/api/wav-to-mp3", wavBodyParser, (req, res) => {
  try {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "WAV 바이너리 본문이 필요합니다." });
      return;
    }
    const mp3 = wavBufferToMp3Buffer(body);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(mp3);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/api/tts-from-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ error: "텍스트 파일을 선택해 주세요." });
      return;
    }
    const enc = (req.body?.encoding || "utf-8").toString();
    let text;
    try {
      text = new TextDecoder(enc).decode(req.file.buffer);
    } catch {
      text = req.file.buffer.toString("utf-8");
    }
    const trimmed = text.trim();
    if (!trimmed) {
      res.status(400).json({ error: "파일 내용이 비어 있습니다." });
      return;
    }
    if (trimmed.length > 8000) {
      res.status(400).json({ error: "파일 텍스트는 8000자 이하여야 합니다." });
      return;
    }

    const sid = parseSid(req.body?.voice);

    const buf = await synthesizeToWavBuffer(trimmed, {
      sid,
      ratePercent: req.body?.ratePercent,
      pitchHz: req.body?.pitchHz,
      volumePercent: req.body?.volumePercent,
    });
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    res.send(buf);
  } catch (e) {
    res.status(503).json({ error: String(e?.message || e) });
  }
});

async function start() {
  try {
    await getOrCreateTts();
    console.log(`Sherpa TTS 준비됨 (모델: ${resolveModelDir()})`);
  } catch (e) {
    console.warn("Sherpa TTS 초기화 실패 — 모델을 배치한 뒤 서버를 다시 시작하세요.");
    console.warn(String(e?.message || e));
  }

  app.listen(port, () => {
    console.log(`TTS Web (오프라인): http://localhost:${port}`);
    console.log(`모델 경로: ${resolveModelDir()}`);
    if (!isReady()) {
      console.log(`상태 확인: GET http://localhost:${port}/api/health`);
    }
  });
}

start();
