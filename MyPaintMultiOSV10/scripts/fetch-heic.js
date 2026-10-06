/* Fetches the HEIC / HEIF samples into samples/.
 *
 * Nothing in this toolchain can write HEVC, so unlike every other sample these three are
 * downloaded rather than generated. Each one is decoded with libheif before it is kept, so a
 * file that arrives broken is never written. Files already present are left alone; pass
 * --force to fetch them again.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "samples");
const force = process.argv.indexOf("--force") >= 0;

const SAMPLES = [
  {
    file: "photo.heic",
    url: "https://nokiatech.github.io/heif/content/images/ski_jump_1440x960.heic",
    note: "Nokia's HEIF sample page",
  },
  {
    file: "example.heif",
    url: "https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic",
    note: "the libheif example image",
  },
  {
    file: "conformance.heic",
    url: "https://github.com/nokiatech/heif_conformance/raw/master/conformance_files/C003.heic",
    note: "Nokia's HEIF conformance file C003",
  },
  {
    file: "grid.heic",
    url: "https://github.com/nokiatech/heif_conformance/raw/master/conformance_files/C007.heic",
    note: "Nokia's HEIF conformance file C007, a 2x2 grid",
  },
];

async function decodes(bytes) {
  const factory = require(path.join(root, "node_modules", "libheif-js", "libheif-wasm", "libheif-bundle.js"));
  const lib = await factory({ print() {}, printErr() {} });
  const decoder = new lib.HeifDecoder();
  const images = decoder.decode(bytes);
  if (!images || !images.length) return null;
  // The same choice MyPaint makes: the file's primary image, not simply the first one.
  const image = images.find((item) => { try { return item.is_primary(); } catch (error) { return false; } }) || images[0];
  const width = image.get_width();
  const height = image.get_height();
  const out = new Uint8ClampedArray(width * height * 4);
  const ok = await new Promise((resolve) => {
    image.display({ data: out, width: width, height: height }, (done) => resolve(Boolean(done)));
  });
  images.forEach((item) => { try { item.free(); } catch (error) { /* already freed */ } });
  return ok ? { width: width, height: height } : null;
}

async function main() {
  fs.mkdirSync(dest, { recursive: true });
  let kept = 0;
  for (const item of SAMPLES) {
    const target = path.join(dest, item.file);
    if (!force && fs.existsSync(target)) {
      console.log("have  " + item.file);
      kept += 1;
      continue;
    }
    try {
      const response = await fetch(item.url, { redirect: "follow" });
      if (!response.ok) {
        console.log("skip  " + item.file + ": HTTP " + response.status);
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const result = await decodes(bytes);
      if (!result) {
        console.log("skip  " + item.file + ": libheif could not decode what arrived");
        continue;
      }
      fs.writeFileSync(target, Buffer.from(bytes));
      kept += 1;
      console.log("kept  " + item.file.padEnd(18) + result.width + "x" + result.height + "  " +
        Math.round(bytes.length / 1024) + " KB  from " + item.note);
    } catch (error) {
      console.log("skip  " + item.file + ": " + error.message);
    }
  }
  if (!kept) {
    console.error("no HEIC sample could be fetched; MyPaint still reads any .heic from a phone");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
