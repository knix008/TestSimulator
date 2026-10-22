// The Rust encoder (as WebAssembly) checked end to end: every symbol it makes must be read
// back by jsQR, an independent decoder, with exactly the bytes that went in.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ECC_LEVELS, encodeArgs, parseResult } from "../src/js/encoder.js";
import { decode, root, wasmEncoder } from "./support.js";

const utf8 = (s) => new TextEncoder().encode(s);

function roundTrip(encode, text, options) {
  const qr = encode(text, options);
  assert.equal(qr.ok, true, `${JSON.stringify(text).slice(0, 40)}: ${JSON.stringify(qr)}`);
  assert.equal(qr.modules.length, qr.size * qr.size);
  assert.equal(qr.size, qr.version * 4 + 17);
  const read = decode(qr.modules, qr.size);
  assert.ok(read, `jsQR could not read v${qr.version}-${qr.ecc} mask ${qr.mask}: ${text.slice(0, 40)}`);
  assert.deepEqual(read.bytes, utf8(text));
  assert.equal(read.version, qr.version);
  return qr;
}

test("the WebAssembly module needs nothing from its host", () => {
  const bytes = fs.readFileSync(path.join(root, "src", "wasm", "qrcore.wasm"));
  const mod = new WebAssembly.Module(bytes);
  assert.deepEqual(WebAssembly.Module.imports(mod), []);
  const names = WebAssembly.Module.exports(mod).map((e) => e.name);
  for (const name of ["memory", "qr_alloc", "qr_free", "qr_encode", "qr_output_ptr"]) assert.ok(names.includes(name), name);
});

test("numeric, alphanumeric and byte data read back at every error correction level", async () => {
  const encode = await wasmEncoder();
  const samples = ["0123456789012345", "HELLO WORLD $%*+-./:", "https://example.com/path?q=1&x=y", "안녕하세요, QR 코드! 🎉"];
  for (const text of samples) {
    for (const ecc of ECC_LEVELS) {
      const qr = roundTrip(encode, text, { ecc, boostEcc: false });
      assert.equal(qr.ecc, ecc);
    }
  }
  assert.equal(encode("0123", {}).mode, "numeric");
  assert.equal(encode("ABC 123", {}).mode, "alphanumeric");
  assert.equal(encode("abc", {}).mode, "byte");
});

test("all eight masks read back", async () => {
  const encode = await wasmEncoder();
  for (let mask = 0; mask < 8; mask += 1) {
    const qr = roundTrip(encode, "mask test 마스크", { ecc: "Q", mask });
    assert.equal(qr.mask, mask);
  }
});

test("every version 1–40 reads back", async () => {
  const encode = await wasmEncoder();
  for (let version = 1; version <= 40; version += 1) {
    const ecc = ECC_LEVELS[version % 4];
    // Fill most of the symbol so every block of data and error correction is exercised.
    const probe = encode("", { ecc, version, boostEcc: false });
    const bytes = Math.max(1, Math.floor((probe.capacityBits - 4 - 16) / 8) - 2);
    let text = "";
    for (let i = 0; text.length < bytes; i += 1) text += String.fromCharCode(97 + ((i * 7 + version) % 26));
    roundTrip(encode, text, { ecc, version, boostEcc: false });
  }
});

test("data that does not fit reports how much was needed", async () => {
  const encode = await wasmEncoder();
  const qr = encode("x".repeat(100), { ecc: "H", version: 3 });
  assert.equal(qr.ok, false);
  assert.equal(qr.error, "tooLong");
  assert.ok(qr.dataBits > qr.maxBits);
  assert.equal(encode("a".repeat(2954), { ecc: "L" }).error, "tooLong");
  assert.equal(encode("a".repeat(2953), { ecc: "L" }).version, 40);
});

test("automatic boost raises error correction without growing the symbol", async () => {
  const encode = await wasmEncoder();
  const plain = encode("https://example.com", { ecc: "L", boostEcc: false });
  const boosted = encode("https://example.com", { ecc: "L", boostEcc: true });
  assert.equal(plain.version, boosted.version);
  assert.ok(ECC_LEVELS.indexOf(boosted.ecc) >= ECC_LEVELS.indexOf(plain.ecc));
});

test("UTF-8 ECI is accepted by readers", async () => {
  const encode = await wasmEncoder();
  const qr = encode("한국어 텍스트", { eciUtf8: true });
  const read = decode(qr.modules, qr.size);
  assert.equal(read?.text, "한국어 텍스트");
});

test("argument mapping matches the Rust ABI", () => {
  assert.deepEqual(encodeArgs({ ecc: "Q", version: 7, mask: 3, boostEcc: false, eciUtf8: true }), { ecc: 2, minVersion: 7, maxVersion: 7, mask: 3, flags: 2 });
  assert.deepEqual(encodeArgs({}), { ecc: 1, minVersion: 1, maxVersion: 40, mask: -1, flags: 1 });
  assert.deepEqual(parseResult('{"error":"invalid","message":"x"}'), { ok: false, error: "invalid", message: "x" });
});
