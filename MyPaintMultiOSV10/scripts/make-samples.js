/* Writes samples/ — one picture per format MyPaint reads, so every reader can be tried by
 * dragging a file onto the window.
 *
 * PNG, BMP, GIF, TIFF, ICO, JPEG, JPEG 2000, DICOM and the camera RAW containers are written
 * here in Node. WebP (and AVIF where the browser can write it) come from a headless browser,
 * which is the only encoder for them on hand. HEIC/HEIF is the one format with no sample:
 * nothing in this toolchain can write HEVC. See samples/README.md.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const Encoders = require("../src/encoders");
const browser = require("./browser");

const root = path.join(__dirname, "..");
const dest = path.join(root, "samples");

/* ── the picture every sample carries ── */

function scene(width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const at = (y * width + x) * 4;
    rgba[at] = r;
    rgba[at + 1] = g;
    rgba[at + 2] = b;
    rgba[at + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const v = y / (height - 1);
      put(x, y, Math.round(40 + u * 90), Math.round(70 + v * 120), Math.round(210 - u * 70));
    }
  }
  // a horizon, a sun, and three colour bars so a wrong channel order is obvious
  const horizon = Math.round(height * 0.62);
  for (let y = horizon; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (y - horizon) / Math.max(1, height - horizon);
      put(x, y, Math.round(60 + t * 50), Math.round(130 - t * 40), Math.round(70 + t * 20));
    }
  }
  const cx = Math.round(width * 0.74);
  const cy = Math.round(height * 0.26);
  const radius = Math.round(Math.min(width, height) * 0.14);
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (Math.hypot(x - cx, y - cy) <= radius) put(x, y, 253, 224, 71);
    }
  }
  const bars = [[237, 28, 36], [34, 177, 76], [0, 162, 232]];
  const barWidth = Math.round(width * 0.12);
  bars.forEach((color, index) => {
    const left = Math.round(width * 0.06) + index * (barWidth + 6);
    for (let y = Math.round(height * 0.08); y < Math.round(height * 0.30); y += 1) {
      for (let x = left; x < left + barWidth; x += 1) put(x, y, color[0], color[1], color[2]);
    }
  });
  return rgba;
}

function rgbaToRgb(rgba, count) {
  const out = new Uint8Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    out[i * 3] = rgba[i * 4];
    out[i * 3 + 1] = rgba[i * 4 + 1];
    out[i * 3 + 2] = rgba[i * 4 + 2];
  }
  return out;
}

/* ── PNG ── */

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width * 4; x += 1) raw[row + 1 + x] = rgba[y * width * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function scalePng(width, height, rgba, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x * width) / size));
      const sy = Math.min(height - 1, Math.floor((y * height) / size));
      const from = (sy * width + sx) * 4;
      const to = (y * size + x) * 4;
      out[to] = rgba[from];
      out[to + 1] = rgba[from + 1];
      out[to + 2] = rgba[from + 2];
      out[to + 3] = 255;
    }
  }
  return png(size, size, out);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + images.length * 16;
  images.forEach((image) => {
    const entry = Buffer.alloc(16);
    entry[0] = image.size >= 256 ? 0 : image.size;
    entry[1] = image.size >= 256 ? 0 : image.size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(image.png);
    offset += image.png.length;
  });
  return Buffer.concat([header].concat(entries).concat(blobs));
}

/* ── multi-page TIFF (little endian, uncompressed, one strip per page) ── */

function multipageTiff(pages) {
  const u16 = (buffer, at, value) => { buffer[at] = value & 255; buffer[at + 1] = (value >> 8) & 255; };
  const u32 = (buffer, at, value) => {
    buffer[at] = value & 255;
    buffer[at + 1] = (value >> 8) & 255;
    buffer[at + 2] = (value >> 16) & 255;
    buffer[at + 3] = (value >>> 24) & 255;
  };
  const tagCount = 11;
  const ifdSize = 2 + tagCount * 12 + 4;
  let offset = 8;
  const plan = pages.map((page) => {
    const data = page.width * page.height * 3;
    const item = { page: page, dataAt: offset, bpsAt: offset + data, ifdAt: offset + data + 6 };
    offset = item.ifdAt + ifdSize;
    return item;
  });
  const out = Buffer.alloc(offset);
  out[0] = 0x49;
  out[1] = 0x49;
  u16(out, 2, 42);
  u32(out, 4, plan[0].ifdAt);
  plan.forEach((item, index) => {
    const page = item.page;
    const rgb = rgbaToRgb(page.rgba, page.width * page.height);
    rgb.forEach((value, at) => { out[item.dataAt + at] = value; });
    u16(out, item.bpsAt, 8);
    u16(out, item.bpsAt + 2, 8);
    u16(out, item.bpsAt + 4, 8);
    const tags = [
      [254, 4, 1, 0],
      [256, 4, 1, page.width],
      [257, 4, 1, page.height],
      [258, 3, 3, item.bpsAt],
      [259, 3, 1, 1],
      [262, 3, 1, 2],
      [273, 4, 1, item.dataAt],
      [277, 3, 1, 3],
      [278, 4, 1, page.height],
      [279, 4, 1, page.width * page.height * 3],
      [284, 3, 1, 1],
    ];
    u16(out, item.ifdAt, tags.length);
    tags.forEach((tag, slot) => {
      const at = item.ifdAt + 2 + slot * 12;
      u16(out, at, tag[0]);
      u16(out, at + 2, tag[1]);
      u32(out, at + 4, tag[2]);
      if (tag[1] === 3 && tag[2] === 1) u16(out, at + 8, tag[3]);
      else u32(out, at + 8, tag[3]);
    });
    u32(out, item.ifdAt + 2 + tags.length * 12, index + 1 < plan.length ? plan[index + 1].ifdAt : 0);
  });
  return out;
}

/* ── camera RAW containers ──
 * A TIFF directory that names the maker and the model and points at the full-size JPEG the
 * camera stores beside the sensor data, which is exactly what MyPaint reads out of a RAW. */

function rawContainer(jpeg, make, model) {
  const asciiMake = make + "\0";
  const asciiModel = model + "\0";
  const entries = 6;
  const ifdSize = 2 + entries * 12 + 4;
  const makeAt = 8 + ifdSize;
  const modelAt = makeAt + asciiMake.length;
  const jpegAt = modelAt + asciiModel.length + ((modelAt + asciiModel.length) % 2);
  const out = Buffer.alloc(jpegAt + jpeg.length);
  out.write("II", 0, "latin1");
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(8, 4);
  out.writeUInt16LE(entries, 8);
  const put = (index, tag, type, count, value) => {
    const at = 10 + index * 12;
    out.writeUInt16LE(tag, at);
    out.writeUInt16LE(type, at + 2);
    out.writeUInt32LE(count, at + 4);
    out.writeUInt32LE(value, at + 8);
  };
  put(0, 0x00fe, 4, 1, 1);
  put(1, 0x010f, 2, asciiMake.length, makeAt);
  put(2, 0x0110, 2, asciiModel.length, modelAt);
  put(3, 0x0112, 3, 1, 1);
  put(4, 0x0201, 4, 1, jpegAt);
  put(5, 0x0202, 4, 1, jpeg.length);
  out.writeUInt32LE(0, 10 + entries * 12);
  out.write(asciiMake, makeAt, "latin1");
  out.write(asciiModel, modelAt, "latin1");
  Buffer.from(jpeg).copy(out, jpegAt);
  return out;
}

function fujiContainer(jpeg) {
  const head = 148;
  const out = Buffer.alloc(head + jpeg.length);
  out.write("FUJIFILMCCD-RAW 0201FF383501", 0, "latin1");
  out.write("FUJIFILM", 28, "latin1");
  out.write("X-T5", 60, "latin1");
  out.writeUInt32BE(head, 84);
  out.writeUInt32BE(jpeg.length, 88);
  Buffer.from(jpeg).copy(out, head);
  return out;
}

/* ── DICOM ── */

function element(tag, vr, value) {
  const group = tag >>> 16;
  const el = tag & 0xffff;
  let data;
  if (vr === "US") {
    data = Buffer.alloc(2 * value.length);
    value.forEach((item, index) => data.writeUInt16LE(item, index * 2));
  } else if (vr === "OB" || vr === "OW") {
    data = Buffer.from(value);
  } else {
    let text = Array.isArray(value) ? value.join("\\") : String(value);
    if (text.length % 2) text += vr === "UI" ? "\0" : " ";
    data = Buffer.from(text, "latin1");
  }
  const long = ["OB", "OW", "SQ", "UN", "UT"].indexOf(vr) >= 0;
  const head = Buffer.alloc(long ? 12 : 8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(el, 2);
  head.write(vr, 4, "latin1");
  if (long) head.writeUInt32LE(data.length, 8);
  else head.writeUInt16LE(data.length, 6);
  return Buffer.concat([head, data]);
}

function dicomFile(body, instance) {
  const meta = Buffer.concat([
    element(0x00020001, "OB", [0, 1]),
    element(0x00020002, "UI", "1.2.840.10008.5.1.4.1.1.2"),
    element(0x00020003, "UI", "1.2.826.0.1.3680043.9.7777." + instance),
    element(0x00020010, "UI", "1.2.840.10008.1.2.1"),
    element(0x00020012, "UI", "1.2.826.0.1.3680043.9.7777.0"),
  ]);
  const groupLength = Buffer.alloc(12);
  groupLength.writeUInt16LE(2, 0);
  groupLength.writeUInt16LE(0, 2);
  groupLength.write("UL", 4, "latin1");
  groupLength.writeUInt16LE(4, 6);
  groupLength.writeUInt32LE(meta.length, 8);
  return Buffer.concat([Buffer.alloc(128), Buffer.from("DICM", "latin1"), groupLength, meta, body]);
}

function sphere(rows, cols, frames) {
  const out = new Uint16Array(rows * cols * frames);
  const radius = Math.min(rows, cols) * 0.36;
  for (let f = 0; f < frames; f += 1) {
    const slice = (f - (frames - 1) / 2) * (radius / Math.max(1, frames));
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const dx = x - cols / 2;
        const dy = y - rows / 2;
        const distance = Math.sqrt(dx * dx + dy * dy + slice * slice);
        const value = distance < radius ? 1300 - Math.round((distance / radius) * 260) : 120 + ((x + y) % 60);
        out[f * rows * cols + y * cols + x] = value;
      }
    }
  }
  return out;
}

function ctDicom(rows, cols, frames, instance) {
  const pixels = sphere(rows, cols, frames);
  const body = Buffer.concat([
    element(0x00080016, "UI", "1.2.840.10008.5.1.4.1.1.2"),
    element(0x00080018, "UI", "1.2.826.0.1.3680043.9.7777." + instance),
    element(0x00080020, "DA", "20261005"),
    element(0x00080030, "TM", "101500"),
    element(0x00080060, "CS", "CT"),
    element(0x00080070, "LO", "MyPaint samples"),
    element(0x00081030, "LO", "Sample study"),
    element(0x0008103e, "LO", frames > 1 ? "Sphere, eight frames" : "Sphere, one frame"),
    element(0x00100010, "PN", "Sample^Phantom"),
    element(0x00100020, "LO", "PH-100"),
    element(0x00100040, "CS", "O"),
    element(0x00180050, "DS", "2"),
    element(0x00181063, "DS", "100"),
    element(0x0020000d, "UI", "1.2.826.0.1.3680043.9.7777"),
    element(0x0020000e, "UI", "1.2.826.0.1.3680043.9.7777.1"),
    element(0x00200011, "IS", "1"),
    element(0x00200013, "IS", String(instance)),
    element(0x00200032, "DS", ["-64", "-64", "0"]),
    element(0x00200037, "DS", ["1", "0", "0", "0", "1", "0"]),
    element(0x00280002, "US", [1]),
    element(0x00280004, "CS", "MONOCHROME2"),
  ].concat(frames > 1 ? [element(0x00280008, "IS", String(frames))] : []).concat([
    element(0x00280010, "US", [rows]),
    element(0x00280011, "US", [cols]),
    element(0x00280030, "DS", ["0.5", "0.5"]),
    element(0x00280100, "US", [16]),
    element(0x00280101, "US", [16]),
    element(0x00280102, "US", [15]),
    element(0x00280103, "US", [0]),
    element(0x00281050, "DS", "600"),
    element(0x00281051, "DS", "1600"),
    element(0x00281052, "DS", "-1024"),
    element(0x00281053, "DS", "1"),
    element(0x00281054, "LO", "HU"),
    element(0x7fe00010, "OW", Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)),
  ]));
  return dicomFile(body, instance);
}

function rgbDicom(width, height, rgba, instance) {
  const rgb = rgbaToRgb(rgba, width * height);
  const body = Buffer.concat([
    element(0x00080016, "UI", "1.2.840.10008.5.1.4.1.1.7"),
    element(0x00080018, "UI", "1.2.826.0.1.3680043.9.7777." + instance),
    element(0x00080020, "DA", "20261005"),
    element(0x00080060, "CS", "OT"),
    element(0x00080070, "LO", "MyPaint samples"),
    element(0x0008103e, "LO", "Colour capture"),
    element(0x00100010, "PN", "Sample^Colour"),
    element(0x00100020, "LO", "PH-101"),
    element(0x0020000d, "UI", "1.2.826.0.1.3680043.9.7777"),
    element(0x0020000e, "UI", "1.2.826.0.1.3680043.9.7777.2"),
    element(0x00200013, "IS", String(instance)),
    element(0x00280002, "US", [3]),
    element(0x00280004, "CS", "RGB"),
    element(0x00280006, "US", [0]),
    element(0x00280010, "US", [height]),
    element(0x00280011, "US", [width]),
    element(0x00280100, "US", [8]),
    element(0x00280101, "US", [8]),
    element(0x00280102, "US", [7]),
    element(0x00280103, "US", [0]),
    element(0x7fe00010, "OW", Buffer.from(rgb.buffer, rgb.byteOffset, rgb.byteLength)),
  ]);
  return dicomFile(body, instance);
}

/* ── JPEG 2000 container ── */

function jp2Wrap(codestream) {
  const box = (type, payload) => {
    const out = Buffer.alloc(8 + payload.length);
    out.writeUInt32BE(8 + payload.length, 0);
    out.write(type, 4, "latin1");
    Buffer.from(payload).copy(out, 8);
    return out;
  };
  const signature = box("jP  ", Buffer.from([0x0d, 0x0a, 0x87, 0x0a]));
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("jp2 ", "latin1"), Buffer.alloc(4), Buffer.from("jp2 ", "latin1")]));
  return Buffer.concat([signature, ftyp, box("jp2c", Buffer.from(codestream))]);
}

/* ── writing everything out ── */

async function main() {
  fs.mkdirSync(dest, { recursive: true });
  const width = 320;
  const height = 240;
  const rgba = scene(width, height);
  const written = [];
  const write = (name, data) => {
    fs.writeFileSync(path.join(dest, name), Buffer.from(data));
    written.push(name + "  " + Math.round(Buffer.from(data).length / 1024) + " KB");
  };

  write("scene.png", png(width, height, rgba));
  write("scene.bmp", Encoders.bmp({ width: width, height: height, rgba: rgba }));
  write("scene.gif", Encoders.gif({ width: width, height: height, rgba: rgba }));
  write("scene.tif", Encoders.tiff({ width: width, height: height, rgba: rgba, dpi: 150 }));

  const gray16 = new Uint16Array(width * height);
  for (let i = 0; i < gray16.length; i += 1) {
    gray16[i] = Math.round(((rgba[i * 4] * 0.2126 + rgba[i * 4 + 1] * 0.7152 + rgba[i * 4 + 2] * 0.0722) / 255) * 65535);
  }
  write("scene-16bit.tif", Encoders.tiff({ width: width, height: height, gray16: gray16 }));

  const half = scene(160, 120);
  const quarter = scene(80, 60);
  write("pages.tif", multipageTiff([
    { width: width, height: height, rgba: rgba },
    { width: 160, height: 120, rgba: half },
    { width: 80, height: 60, rgba: quarter },
  ]));

  write("scene.ico", ico([16, 32, 48, 256].map((size) => ({ size: size, png: scalePng(width, height, rgba, size) }))));

  // JPEG, through libjpeg-turbo
  const jpegModule = await require(path.join(root, "node_modules", "@cornerstonejs", "codec-libjpeg-turbo-8bit", "dist", "libjpegturbojs.js"))();
  const jpegEncoder = new jpegModule.JPEGEncoder();
  const jpegInput = jpegEncoder.getDecodedBuffer({
    width: width, height: height, bitsPerSample: 8, componentCount: 3, isSigned: false,
  });
  jpegInput.set(rgbaToRgb(rgba, width * height));
  jpegEncoder.setQuality(92);
  jpegEncoder.encode();
  const jpeg = Buffer.from(jpegEncoder.getEncodedBuffer());
  write("scene.jpg", jpeg);

  // JPEG 2000, through OpenJPEG
  const j2kModule = await require(path.join(root, "node_modules", "@cornerstonejs", "codec-openjpeg", "dist", "openjpegjs.js"))();
  const j2kEncoder = new j2kModule.J2KEncoder();
  const j2kInput = j2kEncoder.getDecodedBuffer({
    width: width, height: height, bitsPerSample: 8, componentCount: 3, isSigned: false,
  });
  j2kInput.set(rgbaToRgb(rgba, width * height));
  j2kEncoder.setDecompositions(4);
  j2kEncoder.setCompressionRatio(10);
  j2kEncoder.encode();
  const codestream = Buffer.from(j2kEncoder.getEncodedBuffer());
  write("scene.j2k", codestream);
  write("scene.jp2", jp2Wrap(codestream));

  // camera RAW: the same JPEG inside each maker's container
  const cameras = [
    ["canon-eos-r5.cr2", "Canon", "Canon EOS R5"],
    ["nikon-z9.nef", "NIKON CORPORATION", "NIKON Z 9"],
    ["sony-a7iv.arw", "SONY", "ILCE-7M4"],
    ["adobe.dng", "Adobe", "DNG Converter"],
    ["olympus-om1.orf", "OLYMPUS CORPORATION", "OM-1"],
    ["panasonic-s5.rw2", "Panasonic", "DC-S5M2"],
    ["pentax-k3.pef", "RICOH IMAGING COMPANY, LTD.", "PENTAX K-3 Mark III"],
    ["samsung-nx1.srw", "SAMSUNG", "NX1"],
    ["hasselblad.3fr", "Hasselblad", "X2D 100C"],
    ["phaseone.iiq", "Phase One", "IQ4 150MP"],
    ["sigma.x3f", "SIGMA", "fp L"],
    ["leica.rwl", "LEICA CAMERA AG", "LEICA M11"],
  ];
  cameras.forEach((row) => write(row[0], rawContainer(jpeg, row[1], row[2])));
  write("fujifilm-xt5.raf", fujiContainer(jpeg));

  // DICOM
  write("ct-one-frame.dcm", ctDicom(128, 128, 1, 11));
  write("ct-eight-frames.dcm", ctDicom(96, 96, 8, 12));
  write("colour-capture.dcm", rgbDicom(160, 120, scene(160, 120), 13));
  ["CT_small.dcm", "SC_rgb_small_odd.dcm", "JPEG2000.dcm"].forEach((name) => {
    const from = path.join(root, "test", "fixtures", name);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(dest, name));
      written.push(name + "  (pydicom)");
    }
  });

  // a MyPaint drawing
  const Paint = require("../src/paint");
  const Sample = require("../src/sample");
  write("drawing.mpaint", Buffer.from(Paint.serialize([Paint.createDoc(Sample.welcome), Paint.createDoc(Sample.shapes)]), "utf8"));

  // WebP (and AVIF when the browser can write it) need a browser
  if (browser.findBrowser()) {
    // an empty page is all the browser needs to reach its own encoders
    const blank = [
      "<!DOCTYPE html>",
      '<html lang="en"><head><meta charset="utf-8"><title>sample writer</title></head><body></body></html>',
      "",
    ].join("\n");
    fs.writeFileSync(path.join(dest, "blank.html"), blank);
    const base64 = Buffer.from(png(width, height, rgba)).toString("base64");
    const expression = "(async () => {" +
      "const image = new Image();" +
      "image.src = 'data:image/png;base64," + base64 + "';" +
      "await image.decode();" +
      "const canvas = document.createElement('canvas');" +
      "canvas.width = image.width; canvas.height = image.height;" +
      "canvas.getContext('2d').drawImage(image, 0, 0);" +
      "const out = {};" +
      "for (const type of ['image/webp', 'image/avif']) {" +
      "  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));" +
      "  if (!blob || blob.type !== type) continue;" +
      "  const bytes = new Uint8Array(await blob.arrayBuffer());" +
      "  let binary = '';" +
      "  bytes.forEach((value) => { binary += String.fromCharCode(value); });" +
      "  out[type] = btoa(binary);" +
      "}" +
      "return out;" +
      "})()";
    try {
      const made = await browser.evaluateInPage("/samples/blank.html", expression);
      if (made && made["image/webp"]) write("scene.webp", Buffer.from(made["image/webp"], "base64"));
      if (made && made["image/avif"]) write("scene.avif", Buffer.from(made["image/avif"], "base64"));
    } catch (error) {
      console.log("skipping the browser formats: " + error.message);
    }
  } else {
    console.log("skipping WebP and AVIF: no Edge or Chrome was found.");
  }

  /* A manifest so the test run can open every file in here without being told the list. */
  const kinds = {
    png: "native", jpg: "native", gif: "native", bmp: "native", ico: "native", webp: "native", avif: "native",
    tif: "tiff", tiff: "tiff",
    heic: "heif", heif: "heif",
    jp2: "j2k", j2k: "j2k",
    dcm: "dicom",
  };
  const pictures = fs.readdirSync(dest)
    .filter((name) => {
      const ext = (name.split(".").pop() || "").toLowerCase();
      return Boolean(kinds[ext]) || /\.(cr2|cr3|nef|arw|dng|orf|rw2|pef|srw|3fr|iiq|x3f|raf|rwl)$/i.test(name);
    })
    .sort()
    .map((name) => {
      const ext = (name.split(".").pop() || "").toLowerCase();
      return { file: name, kind: kinds[ext] || "raw" };
    });
  fs.writeFileSync(path.join(dest, "index.json"), JSON.stringify({ pictures: pictures }, null, 1) + "\n");
  written.push("index.json  (" + pictures.length + " pictures)");

  console.log("samples ready in samples/");
  written.forEach((line) => console.log("  " + line));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
