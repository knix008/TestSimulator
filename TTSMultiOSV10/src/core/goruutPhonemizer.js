/**
 * Local goruut (pygoruut) phonemizer for Piper KSS.
 * Model config uses phoneme_type: "pygoruut" — KoreanG2P IPA is incompatible.
 *
 * Downloads neurlang/goruut once into APPDATA\TTSMultiOSV10\goruut-bin,
 * starts a localhost HTTP server, and POSTs /tts/phonemize/sentence.
 */

import fs from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Known release entries (pygoruut releases.py v0.8.0). */
const GORUUT_RELEASES = {
  'win32-x64': {
    size: 96321536,
    sha256: '42a7df59fdcef01520952b6fa05dccccdf73e63934e24d185e1b5e2e65edb818',
    publicName: 'goruut-windows-amd64',
    localName: 'goruut.42a7df59fdcef01520952b6fa05dccccdf73e63934e24d185e1b5e2e65edb818.amd64.windows.exe',
    url: 'https://github.com/neurlang/goruut/releases/download/v0.8.0/goruut-windows-amd64',
  },
  'linux-x64': {
    size: 96089588,
    sha256: 'b8aaaa8eb23d042d18fc6c046efbd18765eebff5b2543ff2be7fb0838eddf621',
    publicName: 'goruut-linux-amd64',
    localName: 'goruut.b8aaaa8eb23d042d18fc6c046efbd18765eebff5b2543ff2be7fb0838eddf621.amd64.linux.bin',
    url: 'https://github.com/neurlang/goruut/releases/download/v0.8.0/goruut-linux-amd64',
  },
  'linux-arm64': {
    size: 95136245,
    sha256: '99ab39d719198a2daa31d55d1eb37a69eab6316b17a4c96de306e5213b11d97b',
    publicName: 'goruut-linux-arm64',
    localName: 'goruut.99ab39d719198a2daa31d55d1eb37a69eab6316b17a4c96de306e5213b11d97b.arm64.linux.bin',
    url: 'https://github.com/neurlang/goruut/releases/download/v0.8.0/goruut-linux-arm64',
  },
};

let serverState = null; // { process, port, binDir, readyPromise }

function resolveGoruutBinDir() {
  const base = process.env.APPDATA || process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(base, 'TTSMultiOSV10', 'goruut-bin');
}

function getPlatformRelease() {
  const key = `${process.platform}-${process.arch}`;
  const release = GORUUT_RELEASES[key];
  if (!release) {
    throw new Error(
      `Piper KSS용 goruut 바이너리가 이 플랫폼(${key})을 지원하지 않습니다. Windows x64 / Linux x64·arm64만 지원합니다.`
    );
  }
  return release;
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fh = await fs.open(filePath, 'r');
  try {
    const stream = fh.createReadStream();
    for await (const chunk of stream) hash.update(chunk);
  } finally {
    await fh.close();
  }
  return hash.digest('hex');
}

async function ensureExecutable(binDir) {
  await fs.mkdir(binDir, { recursive: true });
  const release = getPlatformRelease();
  const dest = path.join(binDir, release.localName);

  if (existsSync(dest)) {
    const st = await fs.stat(dest);
    if (st.size === release.size) {
      const digest = await sha256File(dest);
      if (digest === release.sha256) return dest;
    }
    await fs.unlink(dest).catch(() => {});
  }

  console.log(`[goruut] 다운로드 중 (~${Math.round(release.size / 1e6)} MB): ${release.url}`);
  const res = await fetch(release.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`goruut 다운로드 실패: HTTP ${res.status}`);
  if (!res.body) throw new Error('goruut 다운로드 실패: empty body');

  const tmp = `${dest}.partial`;
  const nodeStream = Readable.fromWeb(res.body);
  await pipeline(nodeStream, createWriteStream(tmp));
  const st = await fs.stat(tmp);
  if (st.size !== release.size) {
    await fs.unlink(tmp).catch(() => {});
    throw new Error(`goruut 크기 불일치: got ${st.size}, expected ${release.size}`);
  }
  const digest = await sha256File(tmp);
  if (digest !== release.sha256) {
    await fs.unlink(tmp).catch(() => {});
    throw new Error('goruut SHA256 불일치');
  }
  await fs.rename(tmp, dest);
  if (process.platform !== 'win32') {
    await fs.chmod(dest, 0o755);
  }
  console.log(`[goruut] 준비 완료: ${dest}`);
  return dest;
}

function pickPort() {
  return 1024 + Math.floor(Math.random() * (65535 - 1024));
}

function httpPostJson(url, body, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`goruut HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
            return;
          }
          try {
            resolve(text ? JSON.parse(text) : {});
          } catch (e) {
            reject(new Error(`goruut JSON 파싱 실패: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('goruut HTTP timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function waitUntilReady(port, child, attempts = 60) {
  const url = `http://127.0.0.1:${port}/tts/phonemize/sentence`;
  for (let i = 0; i < attempts; i++) {
    if (child.exitCode != null) {
      throw new Error(`goruut 프로세스가 시작 전 종료됨 (code=${child.exitCode})`);
    }
    try {
      await httpPostJson(url, {}, 500);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('goruut 서버가 30초 안에 준비되지 않았습니다');
}

async function startServer() {
  if (serverState?.readyPromise) {
    await serverState.readyPromise;
    if (serverState.process && serverState.process.exitCode == null) return serverState;
  }

  const binDir = resolveGoruutBinDir();
  const exePath = await ensureExecutable(binDir);
  const port = pickPort();
  const configPath = path.join(binDir, 'goruut_config.json');
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        Port: String(port),
        AdminPort: String(port - 1),
        PolicyMaxWords: 9999999,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`[goruut] 서버 시작: port=${port}`);
  const child = spawn(exePath, ['--configfile', configPath], {
    cwd: binDir,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  child.stderr?.on('data', () => {});
  child.on('exit', (code) => {
    console.log(`[goruut] 프로세스 종료: code=${code}`);
    if (serverState?.process === child) serverState = null;
  });

  const state = { process: child, port, binDir, readyPromise: null };
  state.readyPromise = waitUntilReady(port, child).then(() => {
    console.log(`[goruut] 준비됨: http://127.0.0.1:${port}`);
    return state;
  });
  serverState = state;

  const stop = () => {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  };
  process.once('exit', stop);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await state.readyPromise;
  return state;
}

/**
 * Phonemize text with goruut (IPA string, words joined by space).
 * @param {string} sentence
 * @param {string} [language='Korean']
 * @returns {Promise<string>}
 */
export async function phonemizeWithGoruut(sentence, language = 'Korean') {
  const state = await startServer();
  const url = `http://127.0.0.1:${state.port}/tts/phonemize/sentence`;
  const data = await httpPostJson(url, {
    Language: language,
    Languages: [],
    Sentence: sentence,
    IsReverse: false,
  });
  const words = Array.isArray(data?.Words) ? data.Words : [];
  if (!words.length) throw new Error('goruut 음소 변환 결과 없음');
  return words
    .map((w) => `${w.PrePunct || ''}${w.Phonetic || ''}${w.PostPunct || ''}`)
    .join(' ')
    .trim();
}

/** Warm goruut binary + server (first Piper use / model select). */
export async function warmGoruut() {
  await startServer();
  await phonemizeWithGoruut('안녕하세요', 'Korean');
  return { warmed: true };
}

/**
 * Split IPA into Piper phoneme tokens present in phoneme_id_map.
 * Skips combining marks / modifiers missing from the map (e.g. ̠ ̹ ̞ ʰ).
 */
export function ipaToPiperTokens(ipa, phonemeIdMap) {
  const map = phonemeIdMap || {};
  const tokens = [];
  for (const ch of ipa) {
    if (map[ch]) tokens.push(ch);
  }
  return tokens;
}
