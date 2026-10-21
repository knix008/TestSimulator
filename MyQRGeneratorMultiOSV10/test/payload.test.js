import assert from "node:assert/strict";
import test from "node:test";
import { ALL_STRINGS, KEYS } from "../src/js/i18n.js";
import { buildPayload, CONTENT_TYPES, escapeVcard, escapeWifi, normalizeUrl } from "../src/js/payload.js";

test("URLs get a scheme only when they have none", () => {
  assert.equal(normalizeUrl("example.com/a"), "https://example.com/a");
  assert.equal(normalizeUrl("  http://x.y "), "http://x.y");
  assert.equal(normalizeUrl("mailto:a@b.c"), "mailto:a@b.c");
  assert.equal(normalizeUrl(""), "");
});

test("Wi-Fi payload escapes its delimiters", () => {
  assert.equal(escapeWifi('a;b,c:d\\e"f'), 'a\\;b\\,c\\:d\\\\e\\"f');
  assert.equal(buildPayload("wifi", { ssid: "Home;5G", password: "p:w", security: "WPA" }), "WIFI:T:WPA;S:Home\\;5G;P:p\\:w;;");
  assert.equal(buildPayload("wifi", { ssid: "Cafe", password: "ignored", security: "nopass", hidden: true }), "WIFI:T:nopass;S:Cafe;H:true;;");
});

test("vCard holds only the filled fields, escaped", () => {
  const card = buildPayload("vcard", { lastName: "홍", firstName: "길동", org: "A, B; C", phone: "010-1234-5678", website: "example.com", note: "line1\nline2" });
  assert.deepEqual(card.split("\n"), [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:홍;길동;;;",
    "FN:길동 홍",
    "ORG:A\\, B\\; C",
    "TEL;TYPE=CELL:01012345678",
    "URL:https://example.com",
    "NOTE:line1\\nline2",
    "END:VCARD",
  ]);
  assert.equal(escapeVcard("a\\b"), "a\\\\b");
});

test("email, SMS, phone and location use the common URI forms", () => {
  assert.equal(buildPayload("email", { to: "a@b.c", subject: "Hi there", body: "x&y" }), "mailto:a@b.c?subject=Hi%20there&body=x%26y");
  assert.equal(buildPayload("email", { to: "a@b.c" }), "mailto:a@b.c");
  assert.equal(buildPayload("sms", { phone: "+82 10-1234-5678", message: "안녕" }), "SMSTO:+821012345678:안녕");
  assert.equal(buildPayload("tel", { phone: "(02) 123-4567" }), "tel:021234567");
  assert.equal(buildPayload("geo", { latitude: "37.5665", longitude: "126.978" }), "geo:37.5665,126.978");
  assert.equal(buildPayload("geo", { latitude: "91", longitude: "0" }), "");
  assert.equal(buildPayload("geo", { latitude: "", longitude: "" }), "");
});

test("every content type and field has Korean and English labels", () => {
  for (const [type, fields] of Object.entries(CONTENT_TYPES)) {
    assert.ok(KEYS.includes(`type.${type}`), type);
    for (const f of fields) {
      assert.ok(KEYS.includes(`field.${f.key}`), f.key);
      for (const o of f.options || []) assert.ok(KEYS.includes(`option.${o}`), o);
    }
  }
  assert.deepEqual(Object.keys(ALL_STRINGS.en).sort(), [...KEYS].sort());
});
