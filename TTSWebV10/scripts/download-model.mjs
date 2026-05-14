/**
 * Sherpa-ONNX 한국어 VITS 모델(vits-mimic3-ko_KO-kss_low)을 GitHub 릴리스에서 받아
 * 프로젝트의 models/ 아래에 풉니다. (최초 1회 또는 --force 시 재설치)
 *
 * 사용: node scripts/download-model.mjs
 *       npm run download-model
 * 옵션: --force  기존 models/vits-mimic3-ko_KO-kss_low 폴더와 캐시 아카이브를 지우고 다시 받습니다.
 *
 * 필요: tar(bzip2 지원) — Windows 10+ 기본 tar, macOS/Linux 동일.
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const MODEL_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-mimic3-ko_KO-kss_low.tar.bz2";
const ARCHIVE_NAME = "vits-mimic3-ko_KO-kss_low.tar.bz2";
const MODEL_FOLDER = "vits-mimic3-ko_KO-kss_low";
const ONNX_NAME = "ko_KO-kss_low.onnx";

const modelsDir = path.join(projectRoot, "models");
const archivePath = path.join(modelsDir, ARCHIVE_NAME);
const modelPath = path.join(modelsDir, MODEL_FOLDER);
const onnxPath = path.join(modelPath, ONNX_NAME);

const force = process.argv.includes("--force");

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

function runTarExtract() {
  return new Promise((resolve, reject) => {
    const args = ["-xf", archivePath, "-C", modelsDir];
    const child = spawn("tar", args, { stdio: "inherit", shell: false });
    child.on("error", (err) => {
      reject(
        new Error(
          `tar 실행 실패: ${err.message}\n` +
            "Windows에서는 '시스템에 tar가 있는지' 확인하세요. 없으면 Git Bash 또는 WSL에서 동일 스크립트를 실행할 수 있습니다.",
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar 종료 코드: ${code}`));
    });
  });
}

async function main() {
  if ((await pathExists(onnxPath)) && !force) {
    console.log(`이미 모델이 있습니다: ${onnxPath}`);
    console.log("다시 받으려면: npm run download-model -- --force");
    return;
  }

  if (force) {
    if (await pathExists(modelPath)) {
      console.log("제거 중:", modelPath);
      await fs.rm(modelPath, { recursive: true, force: true });
    }
    if (await pathExists(archivePath)) {
      console.log("제거 중:", archivePath);
      await fs.unlink(archivePath);
    }
  }

  await fs.mkdir(modelsDir, { recursive: true });

  console.log("다운로드:", MODEL_URL);
  const res = await fetch(MODEL_URL, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`다운로드 실패 HTTP ${res.status} ${res.statusText}`);
  }
  const len = res.headers.get("content-length");
  if (len) console.log("예상 크기:", formatBytes(Number(len)));

  if (!res.body) {
    throw new Error("응답 본문이 없습니다.");
  }

  const webStream = /** @type {import('node:stream/web').ReadableStream} */ (res.body);
  const nodeReadable = Readable.fromWeb(webStream);
  await pipeline(nodeReadable, createWriteStream(archivePath));

  const st = await fs.stat(archivePath);
  console.log("저장됨:", archivePath, `(${formatBytes(st.size)})`);

  console.log("압축 해제 중 →", modelsDir);
  await runTarExtract();

  await fs.unlink(archivePath).catch(() => {});

  if (!(await pathExists(onnxPath))) {
    throw new Error(
      `압축 해제 후 ONNX를 찾을 수 없습니다: ${onnxPath}\n` +
        "아카이브 구조가 바뀌었을 수 있습니다. models/README.md 의 수동 절차를 확인하세요.",
    );
  }

  console.log("완료. 모델 디렉터리:", modelPath);
  console.log("다음: npm start");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
