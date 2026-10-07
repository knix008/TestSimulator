import { DEFAULT_BOARD, MAX_SYMBOLS, cloneBoard, sanitizeBoard } from "./settings.js";
import { AppError } from "./errors.js";
import { countryName, marketName } from "../market/markets.js";

let seq = 1;

export const VIEWS = ["stocks", "rates", "news"];

export function uid(prefix = "id") {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createBoard(partial = {}) {
  return sanitizeBoard({ ...cloneBoard(DEFAULT_BOARD), ...partial });
}

export function createTab(board) {
  return {
    id: uid("tab"),
    board: createBoard(board),
    view: "stocks",
    properties: {
      label: "",
      favorite: false,
      alertHigh: "",
      alertLow: "",
    },
    selectedSymbol: "",
    data: null,
  };
}

export function createDocument(board) {
  return {
    format: "mymoney",
    formatVersion: 1,
    filePath: "",
    dirty: false,
    activeIndex: 0,
    tabs: [createTab(board)],
  };
}

export function displayMarket(board, language) {
  return marketName(board, language);
}

export function displayCountry(board, language) {
  return countryName(board, language);
}

/** The watchlist with `symbol` added, unchanged when it is already there or full. */
export function withSymbol(board, listing) {
  if (!listing?.symbol) return board;
  if ((board.symbols || []).some((entry) => entry.symbol === listing.symbol)) return board;
  if ((board.symbols || []).length >= MAX_SYMBOLS) return board;
  const entry = {
    symbol: String(listing.symbol),
    code: String(listing.code || String(listing.symbol).split(".")[0]),
    marketCode: String(listing.marketCode || board.marketCode),
    nameKo: String(listing.nameKo || listing.nameEn || listing.symbol),
    nameEn: String(listing.nameEn || listing.nameKo || listing.symbol),
  };
  return { ...board, symbols: [...(board.symbols || []), entry], activeSymbol: board.activeSymbol || entry.symbol };
}

export function withoutSymbol(board, symbol) {
  const symbols = (board.symbols || []).filter((entry) => entry.symbol !== symbol);
  const activeSymbol = symbols.some((entry) => entry.symbol === board.activeSymbol) ? board.activeSymbol : symbols[0]?.symbol || "";
  return { ...board, symbols, activeSymbol };
}

export function serializeDocument(doc) {
  return JSON.stringify(
    {
      format: "mymoney",
      formatVersion: 1,
      activeIndex: doc.activeIndex,
      tabs: doc.tabs.map((tab) => ({
        id: tab.id,
        board: tab.board,
        view: tab.view,
        properties: tab.properties,
        selectedSymbol: tab.selectedSymbol,
        data: tab.data,
      })),
    },
    null,
    2,
  );
}

export function parseDocument(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new AppError("Invalid document", error.message, "DOC_PARSE");
  }
  if (!data || data.format !== "mymoney") {
    throw new AppError("Invalid document", "The file is not a MyMoney document.", "DOC_FORMAT");
  }
  if (!Array.isArray(data.tabs) || data.tabs.length === 0) {
    throw new AppError("Invalid document", "The document has no boards.", "DOC_EMPTY");
  }
  return {
    format: "mymoney",
    formatVersion: 1,
    filePath: "",
    dirty: false,
    activeIndex: Math.max(0, Math.min(data.tabs.length - 1, Number(data.activeIndex) || 0)),
    tabs: data.tabs.map((tab) => ({
      id: tab.id || uid("tab"),
      board: createBoard(tab.board || {}),
      view: VIEWS.includes(tab.view) ? tab.view : "stocks",
      properties: {
        label: String(tab.properties?.label || ""),
        favorite: Boolean(tab.properties?.favorite),
        alertHigh: tab.properties?.alertHigh == null ? "" : String(tab.properties.alertHigh),
        alertLow: tab.properties?.alertLow == null ? "" : String(tab.properties.alertLow),
      },
      selectedSymbol: String(tab.selectedSymbol || ""),
      data: tab.data || null,
    })),
  };
}

export function suggestedFileName(doc, language) {
  const tab = doc.tabs[doc.activeIndex] || doc.tabs[0];
  const name = displayMarket(tab.board, language).replace(/[\\/:*?"<>|]/g, " ").trim() || "market";
  return `${name}.mymoney`;
}
