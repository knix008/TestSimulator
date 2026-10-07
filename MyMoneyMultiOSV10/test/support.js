import { createApp } from "../src/app.js";

export function jsonResponse(body, ok = true, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok,
    status,
    json: async () => body,
    text: async () => text,
  };
}

export function textResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => JSON.parse(body),
    text: async () => String(body),
  };
}

export const SAMPLE_DATES = ["2026-10-05", "2026-10-06", "2026-10-07"];

function stampOf(date) {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

/** A Yahoo chart payload whose last close is `last` and whose previous close is `last - step`. */
export function yahooBody(symbol, dates, last = 100, step = 2, currency = "KRW") {
  const closes = dates.map((_, index) => last - step * (dates.length - 1 - index));
  return {
    chart: {
      result: [
        {
          meta: {
            symbol,
            currency,
            fullExchangeName: "Test Exchange",
            longName: `${symbol} Inc`,
            chartPreviousClose: closes[closes.length - 2] ?? closes[0],
          },
          timestamp: dates.map(stampOf),
          indicators: {
            quote: [
              {
                open: closes.map((close) => close - 1),
                high: closes.map((close) => close + 2),
                low: closes.map((close) => close - 2),
                close: closes,
                volume: closes.map(() => 1_200_000),
              },
            ],
          },
        },
      ],
    },
  };
}

export function newsBody(titles = ["삼성전자 신고가", "코스피 상승 마감"], { images = false } = {}) {
  const items = titles
    .map((title, index) => {
      const media = images ? `<media:content url="https://img.example/${index}.jpg"/>` : "";
      return `<item><title><![CDATA[${title}]]></title><link>https://news.example/${index}</link><source url="https://news.example">Example News</source><pubDate>Wed, 07 Oct 2026 0${index}:00:00 GMT</pubDate>${media}</item>`;
    })
    .join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

export function frankfurterBody(base = "KRW") {
  return { base, date: "2026-10-07", rates: { USD: 0.00074, EUR: 0.00068, JPY: 0.11, CNY: 0.0053, GBP: 0.00056, THB: 0.024, AUD: 0.00107 } };
}

export function erApiBody(base = "KRW") {
  return {
    result: "success",
    base_code: base,
    time_last_update_utc: "Wed, 07 Oct 2026 00:00:00 +0000",
    rates: { [base]: 1, USD: 0.00076, EUR: 0.0007, JPY: 0.113, CNY: 0.0055, GBP: 0.00056, THB: 0.024, AUD: 0.00107 },
  };
}

/** Both Yahoo hosts answer every quote; the rate feeds and the news feed answer too. */
export function defaultFetch(url) {
  const href = String(url);
  if (href.includes("finance/search")) return jsonResponse({ quotes: [] });
  if (href.includes("/v8/finance/chart/")) {
    const symbol = decodeURIComponent(href.split("/chart/")[1].split("?")[0]);
    // The failover host answers with a slightly different close, so averaging stays visible.
    return jsonResponse(yahooBody(symbol, SAMPLE_DATES, href.includes("query2") ? 102 : 100, 2));
  }
  if (href.includes("frankfurter")) return jsonResponse(frankfurterBody("KRW"));
  if (href.includes("open.er-api.com")) return jsonResponse(erApiBody("KRW"));
  if (href.includes("news.google.com")) return textResponse(newsBody());
  if (href.includes("yna.co.kr") || href.includes("bbci.co.uk")) return textResponse(newsBody(["사진 있는 기사"], { images: true }));
  return jsonResponse({ error: "unknown" }, false, 404);
}

export function createMemoryPlatform() {
  const files = new Map();
  const platform = {
    kind: "test",
    nativePopups: false,
    nativeMenus: false,
    nativeWindow: false,
    resizeSteps: [],
    resizeTargets: [],
    moveSteps: [],
    fonts: ["Segoe UI", "Malgun Gothic", "Arial", "Consolas", "Times New Roman"],
    files,
    settings: null,
    prints: [],
    external: [],
    commands: [],
    quit: 0,
    nextSavePath: null,
    nextOpen: null,
    nextImage: null,
    imageStarts: [],
    lastStartDir: undefined,
    clipboardText: "",
    fetchImpl: defaultFetch,
    readSettingsSync() {
      return this.settings ? structuredClone(this.settings) : null;
    },
    async readSettings() {
      return this.readSettingsSync();
    },
    async writeSettings(data) {
      this.settings = structuredClone(data);
    },
    async listFonts() {
      return [...this.fonts];
    },
    async resizeWindow(step) {
      this.resizeSteps.push(step);
    },
    async moveWindow(step) {
      this.moveSteps.push(step);
    },
    async resizeWindowTo(size) {
      this.resizeTargets.push(size);
      return size;
    },
    onWindowState(callback) {
      this.emitWindowState = callback;
    },
    async fetch(url, options) {
      return this.fetchImpl(url, options);
    },
    async openFile({ startDir }) {
      this.lastStartDir = startDir;
      const next = this.nextOpen;
      this.nextOpen = null;
      return next;
    },
    async saveFile({ startDir, text }) {
      this.lastStartDir = startDir;
      if (!this.nextSavePath) return null;
      const filePath = this.nextSavePath;
      this.nextSavePath = null;
      files.set(filePath, text);
      return { path: filePath, directory: filePath.replace(/\\/g, "/").replace(/\/[^/]*$/, "") };
    },
    async readFile(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`ENOENT ${filePath}`);
        error.code = "ENOENT";
        throw error;
      }
      return files.get(filePath);
    },
    async writeFile(filePath, text) {
      if (this.onWrite) await this.onWrite();
      files.set(filePath, text);
      return { path: filePath, directory: filePath.replace(/\\/g, "/").replace(/\/[^/]*$/, "") };
    },
    async pickImage({ startDir } = {}) {
      this.imageStarts.push(startDir || "");
      return this.nextImage;
    },
    async print(payload) {
      this.prints.push(payload);
    },
    async openExternal(url) {
      this.external.push(url);
    },
    async windowControl(action) {
      this.commands.push(action);
    },
    async confirmQuit() {
      this.quit += 1;
    },
    async writeClipboard(text) {
      this.clipboardText = String(text);
    },
    async readClipboard() {
      return this.clipboardText;
    },
  };
  return platform;
}

export async function settle() {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function withApp(fn, options = {}) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const platform = options.platform || createMemoryPlatform();
  if (options.fonts) platform.fonts = options.fonts;
  if (options.fetch) platform.fetchImpl = options.fetch;
  const app = createApp(root, {
    platform,
    autoLoad: false,
    now: () => new Date(2026, 9, 7, 9, 0, 0),
    ...options.app,
  });
  await app.ready;
  try {
    await fn({ app, platform, root });
  } finally {
    app.destroy();
    root.remove();
  }
}
