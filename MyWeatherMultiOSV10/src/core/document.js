import { DEFAULT_LOCATION } from "./settings.js";
import { AppError } from "./errors.js";

let seq = 1;

export function uid(prefix = "id") {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createPlace(partial = {}) {
  return {
    countryCode: partial.countryCode || DEFAULT_LOCATION.countryCode,
    countryKo: partial.countryKo || DEFAULT_LOCATION.countryKo,
    countryEn: partial.countryEn || DEFAULT_LOCATION.countryEn,
    cityKo: partial.cityKo || partial.cityEn || DEFAULT_LOCATION.cityKo,
    cityEn: partial.cityEn || partial.cityKo || DEFAULT_LOCATION.cityEn,
    lat: Number(partial.lat ?? DEFAULT_LOCATION.lat),
    lon: Number(partial.lon ?? DEFAULT_LOCATION.lon),
  };
}

export function createTab(place) {
  return {
    id: uid("tab"),
    place: createPlace(place),
    view: "weekly",
    properties: {
      label: "",
      favorite: false,
      alertHigh: "",
      alertLow: "",
    },
    selectedDate: "",
    weather: null,
  };
}

export function createDocument(place) {
  return {
    format: "myweather",
    formatVersion: 1,
    filePath: "",
    dirty: false,
    activeIndex: 0,
    tabs: [createTab(place)],
  };
}

export function displayCity(place, language) {
  if (!place) return "";
  return language === "ko" ? place.cityKo || place.cityEn : place.cityEn || place.cityKo;
}

export function displayCountry(place, language) {
  if (!place) return "";
  return language === "ko" ? place.countryKo || place.countryEn : place.countryEn || place.countryKo;
}

export function serializeDocument(doc) {
  return JSON.stringify(
    {
      format: "myweather",
      formatVersion: 1,
      activeIndex: doc.activeIndex,
      tabs: doc.tabs.map((tab) => ({
        id: tab.id,
        place: tab.place,
        view: tab.view,
        properties: tab.properties,
        selectedDate: tab.selectedDate,
        weather: tab.weather,
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
  if (!data || data.format !== "myweather") {
    throw new AppError("Invalid document", "The file is not a MyWeather document.", "DOC_FORMAT");
  }
  if (!Array.isArray(data.tabs) || data.tabs.length === 0) {
    throw new AppError("Invalid document", "The document has no locations.", "DOC_EMPTY");
  }
  const doc = {
    format: "myweather",
    formatVersion: 1,
    filePath: "",
    dirty: false,
    activeIndex: Math.max(0, Math.min(data.tabs.length - 1, Number(data.activeIndex) || 0)),
    tabs: data.tabs.map((tab) => ({
      id: tab.id || uid("tab"),
      place: createPlace(tab.place || {}),
      view: ["daily", "weekly", "monthly"].includes(tab.view) ? tab.view : "weekly",
      properties: {
        label: String(tab.properties?.label || ""),
        favorite: Boolean(tab.properties?.favorite),
        alertHigh: tab.properties?.alertHigh == null ? "" : String(tab.properties.alertHigh),
        alertLow: tab.properties?.alertLow == null ? "" : String(tab.properties.alertLow),
      },
      selectedDate: String(tab.selectedDate || ""),
      weather: tab.weather || null,
    })),
  };
  return doc;
}

export function suggestedFileName(doc, language) {
  const tab = doc.tabs[doc.activeIndex] || doc.tabs[0];
  const city = displayCity(tab.place, language).replace(/[\\/:*?"<>|]/g, " ").trim() || "weather";
  return `${city}.myweather`;
}
