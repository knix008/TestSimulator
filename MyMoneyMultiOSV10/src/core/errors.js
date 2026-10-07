import { titleText } from "./app-info.js";

export class AppError extends Error {
  constructor(message, details = "", code = "APP") {
    super(message);
    this.name = "AppError";
    this.details = details == null ? "" : String(details);
    this.code = code;
  }
}

export function normalizeError(err, context = {}) {
  const base =
    err instanceof AppError
      ? { message: err.message, details: err.details || err.stack || "", code: err.code || "APP" }
      : {
          message: err && err.message ? String(err.message) : String(err),
          details: err && err.stack ? String(err.stack) : err && err.message ? String(err.message) : String(err),
          code: err && err.code ? String(err.code) : err && err.name && err.name !== "Error" ? String(err.name) : "ERROR",
        };
  if (err instanceof AppError && err.stack && !base.details.includes(err.stack)) base.details = `${base.details}\n${err.stack}`.trim();
  return {
    ...base,
    operation: context.operation ? String(context.operation) : "",
    time: formatTime(context.time || new Date()),
    app: titleText(),
    environment: context.environment ? String(context.environment) : environmentText(),
  };
}

export function errorCopyText(info, labels = {}) {
  const label = (key, fallback) => labels[key] || fallback;
  const head = [`[${info.code}] ${info.message}`];
  if (info.time) head.push(`${label("time", "Time")}: ${info.time}`);
  if (info.operation) head.push(`${label("operation", "Operation")}: ${info.operation}`);
  if (info.app) head.push(`${label("app", "Application")}: ${info.app}`);
  if (info.environment) head.push(`${label("environment", "Environment")}: ${info.environment}`);
  return [...head, "", info.details || ""].join("\n").trim();
}

function formatTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function environmentText() {
  const agent = typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "";
  const electron = agent.match(/Electron\/[\d.]+/)?.[0];
  const chrome = agent.match(/Chrome\/[\d.]+/)?.[0];
  const platform = typeof navigator !== "undefined" ? navigator.platform || "" : "";
  return [electron, chrome, platform].filter(Boolean).join(", ") || agent.slice(0, 80) || "unknown";
}
