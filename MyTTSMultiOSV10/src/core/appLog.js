import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MAX_LOG_BYTES = 2 * 1024 * 1024;

function dataRoot() {
  const base = process.env.APPDATA || process.env.HOME || process.env.USERPROFILE || os.tmpdir();
  return path.join(base, 'TTSMultiOSV10');
}

export function getLogDir() {
  return path.join(dataRoot(), 'logs');
}

export function getLogPath() {
  return path.join(getLogDir(), 'main.log');
}

function crashGuardPath() {
  return path.join(getLogDir(), 'native-op.json');
}

function formatArg(value) {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function appendLine(level, args) {
  try {
    const logPath = getLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    try {
      if (fs.statSync(logPath).size > MAX_LOG_BYTES) {
        fs.renameSync(logPath, `${logPath}.1`);
      }
    } catch {
      /* no log yet */
    }
    const line = `[${new Date().toISOString()}] [${level}] ${args.map(formatArg).join(' ')}\n`;
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {
    /* logging must never throw */
  }
}

let installed = false;

/** Mirror console output of the main process into a log file. */
export function installFileLogging() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      appendLine(level.toUpperCase(), args);
      original(...args);
    };
  }
  appendLine('INFO', [`===== 프로그램 시작 (pid ${process.pid}, ${process.platform} ${os.release()}) =====`]);
}

export function readLogTail(maxLines = 60) {
  try {
    const text = fs.readFileSync(getLogPath(), 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines).join('\n');
  } catch {
    return '';
  }
}

/** Build a detailed, copy-friendly error report. */
export function describeError(error, context = '') {
  const parts = [];
  if (context) parts.push(context);
  const message = error?.message || String(error ?? '알 수 없는 오류');
  parts.push(message);
  let cause = error?.cause;
  for (let i = 0; i < 4 && cause; i += 1) {
    parts.push(`원인: ${cause?.code ? `[${cause.code}] ` : ''}${cause?.message || String(cause)}`);
    cause = cause.cause;
  }
  if (error?.code) parts.push(`오류 코드: ${error.code}`);
  if (error?.stack) parts.push(`스택:\n${error.stack}`);
  parts.push(`로그 파일: ${getLogPath()}`);
  return parts.join('\n\n');
}

/**
 * Native addons (sherpa-onnx) can abort the whole process without a JS error.
 * Record the operation before entering native code so the next start can report it.
 */
export function beginNativeOp(info) {
  try {
    fs.mkdirSync(getLogDir(), { recursive: true });
    fs.writeFileSync(crashGuardPath(), JSON.stringify({ ...info, startedAt: new Date().toISOString() }), 'utf8');
  } catch {
    /* ignore */
  }
}

export function endNativeOp() {
  try {
    fs.rmSync(crashGuardPath(), { force: true });
  } catch {
    /* ignore */
  }
}

/** Returns the native operation that was running when the previous run died, if any. */
export function takePendingNativeCrash() {
  try {
    const raw = fs.readFileSync(crashGuardPath(), 'utf8');
    fs.rmSync(crashGuardPath(), { force: true });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
