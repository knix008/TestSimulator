// Turns the form for each content type into the text that goes into the symbol.
// The formats are the de-facto ones phone cameras understand (ZXing conventions).

export const CONTENT_TYPES = {
  text: [{ key: "text", kind: "textarea", rows: 6 }],
  url: [{ key: "url", type: "url", placeholder: "https://example.com" }],
  wifi: [
    { key: "ssid" },
    { key: "password", type: "password" },
    { key: "security", kind: "select", options: ["WPA", "WEP", "nopass"], icons: { WPA: "i-lock", WEP: "i-lock", nopass: "i-unlock" } },
    { key: "hidden", kind: "checkbox" },
  ],
  vcard: [
    { key: "lastName", half: true },
    { key: "firstName", half: true },
    { key: "org", half: true },
    { key: "jobTitle", half: true },
    { key: "phone", type: "tel", half: true },
    { key: "email", type: "email", half: true },
    { key: "website", type: "url" },
    { key: "address" },
    { key: "note", kind: "textarea", rows: 2 },
  ],
  email: [
    { key: "to", type: "email", placeholder: "name@example.com" },
    { key: "subject" },
    { key: "body", kind: "textarea", rows: 4 },
  ],
  sms: [
    { key: "phone", type: "tel", placeholder: "010-1234-5678" },
    { key: "message", kind: "textarea", rows: 4 },
  ],
  tel: [{ key: "phone", type: "tel", placeholder: "010-1234-5678" }],
  geo: [
    { key: "latitude", type: "number", step: "any", half: true, placeholder: "37.5665" },
    { key: "longitude", type: "number", step: "any", half: true, placeholder: "126.9780" },
  ],
};

export const DEFAULT_VALUES = {
  text: { text: "Hello, QR!" },
  url: { url: "https://example.com" },
  wifi: { ssid: "", password: "", security: "WPA", hidden: false },
  vcard: {},
  email: {},
  sms: {},
  tel: {},
  geo: {},
};

/** Backslash-escapes the characters that delimit fields in WIFI: payloads. */
export function escapeWifi(value) {
  return String(value ?? "").replace(/([\\;,:"])/g, "\\$1");
}

/** vCard 3.0 text escaping (RFC 2426 §4). */
export function escapeVcard(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

/** Adds https:// when no scheme is given; "example.com" alone is not opened as a link by most readers. */
export function normalizeUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

const phone = (value) => String(value ?? "").replace(/[^\d+*#]/g, "");
const trimmed = (value) => String(value ?? "").trim();

export function buildPayload(type, values = {}) {
  const v = values;
  switch (type) {
    case "text":
      return String(v.text ?? "");
    case "url":
      return normalizeUrl(v.url);
    case "wifi": {
      const security = v.security === "WEP" || v.security === "nopass" ? v.security : "WPA";
      let out = `WIFI:T:${security};S:${escapeWifi(v.ssid)};`;
      if (security !== "nopass") out += `P:${escapeWifi(v.password)};`;
      if (v.hidden) out += "H:true;";
      return `${out};`;
    }
    case "vcard": {
      const lines = ["BEGIN:VCARD", "VERSION:3.0"];
      const last = trimmed(v.lastName);
      const first = trimmed(v.firstName);
      lines.push(`N:${escapeVcard(last)};${escapeVcard(first)};;;`);
      lines.push(`FN:${escapeVcard([first, last].filter(Boolean).join(" ") || trimmed(v.org))}`);
      if (trimmed(v.org)) lines.push(`ORG:${escapeVcard(trimmed(v.org))}`);
      if (trimmed(v.jobTitle)) lines.push(`TITLE:${escapeVcard(trimmed(v.jobTitle))}`);
      if (trimmed(v.phone)) lines.push(`TEL;TYPE=CELL:${phone(v.phone)}`);
      if (trimmed(v.email)) lines.push(`EMAIL:${escapeVcard(trimmed(v.email))}`);
      if (trimmed(v.website)) lines.push(`URL:${escapeVcard(normalizeUrl(v.website))}`);
      if (trimmed(v.address)) lines.push(`ADR:;;${escapeVcard(trimmed(v.address))};;;;`);
      if (trimmed(v.note)) lines.push(`NOTE:${escapeVcard(v.note)}`);
      lines.push("END:VCARD");
      return lines.join("\n");
    }
    case "email": {
      const params = [];
      if (trimmed(v.subject)) params.push(`subject=${encodeURIComponent(trimmed(v.subject))}`);
      if (String(v.body ?? "")) params.push(`body=${encodeURIComponent(v.body)}`);
      return `mailto:${trimmed(v.to)}${params.length ? `?${params.join("&")}` : ""}`;
    }
    case "sms":
      return `SMSTO:${phone(v.phone)}:${String(v.message ?? "")}`;
    case "tel":
      return `tel:${phone(v.phone)}`;
    case "geo": {
      const lat = Number(v.latitude);
      const lng = Number(v.longitude);
      const ok = (n, limit) => String(n) !== "" && Number.isFinite(n) && Math.abs(n) <= limit;
      if (!ok(lat, 90) || !ok(lng, 180) || trimmed(v.latitude) === "" || trimmed(v.longitude) === "") return "";
      return `geo:${lat},${lng}`;
    }
    default:
      return "";
  }
}
