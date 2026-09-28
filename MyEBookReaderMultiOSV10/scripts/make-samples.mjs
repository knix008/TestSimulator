// Builds the sample books in samples/.
//
// They are real files in every format the reader opens, written from scratch so
// the repository carries no third-party content: the tests open them, and they
// double as something to look at on a fresh install. Deliberately written with
// Node's own zlib — the reader's ZIP and DEFLATE code is ours, so the samples
// must not be produced by it or a bug would cancel itself out.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const out = path.join(root, 'samples');

// ── A tiny ZIP writer (stored + deflate) ──────────────────
function crc32(bytes) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const deflate = entry.store !== true;
    const body = deflate ? zlib.deflateRawSync(raw, { level: 9 }) : raw;
    const method = deflate ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);          // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBytes.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, nameBytes]));

    offset += local.length + nameBytes.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// ── A tiny PNG writer, for the pictures inside the samples ──
function png(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let at = 0;
  for (let y = 0; y < height; y++) {
    raw[at++] = 0;                     // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      raw[at++] = r; raw[at++] = g; raw[at++] = b;
    }
  }

  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
    return Buffer.concat([head, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CHAPTERS = [
  {
    title: '첫 장 — 열기 (Opening)',
    body: [
      'MyEBookReader 는 EPUB·PDF·MOBI·FB2·CBZ·Markdown·HTML·텍스트를 한 프로그램에서 읽습니다.',
      'This sample book exists so the reader can be exercised end to end: a table of contents, several chapters, an image, an internal link and text long enough to paginate.',
      '왼쪽 패널에서 목차를, 오른쪽 패널에서 책 정보와 읽기 설정을 볼 수 있습니다.',
    ],
  },
  {
    title: '둘째 장 — 표시 (Marks)',
    body: [
      '글을 선택하고 형광펜 버튼을 누르면 그 부분이 칠해지고, 오른쪽 패널의 목록에 남습니다.',
      'Bookmarks, highlights and notes are kept in a reading file (.ebkr) next to the book, so the book itself is never rewritten.',
      '<a href="ch3.xhtml">셋째 장으로 이동</a> — 책 안의 링크도 따라갑니다.',
    ],
  },
  {
    title: '셋째 장 — 그림과 인쇄 (Pictures and printing)',
    body: [
      '<img src="../images/plate.png" alt="a generated plate"/>',
      '그림은 책 안에 들어 있는 자원을 그대로 보여 줍니다.',
      'Printing offers everything, this chapter, or a range you type, with a preview that uses the paper size and margins you chose.',
      ...Array.from({ length: 12 }, (_, i) => `단락 ${i + 1}. 페이지 넘김 방식을 "한 쪽씩 보기"로 바꾸면 이 장이 여러 쪽으로 나뉩니다. Paragraph ${i + 1} of filler text so that pagination has something to do.`),
    ],
  },
];

function xhtml(title, body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko">
<head><title>${title}</title><link rel="stylesheet" href="../style.css"/></head>
<body>
  <h1>${title}</h1>
${body.map((line) => (line.startsWith('<') ? `  ${line}` : `  <p>${line}</p>`)).join('\n')}
</body>
</html>`;
}

function buildEpub() {
  const plate = png(240, 160, (x, y) => [
    40 + ((x * 200) / 240) | 0,
    90 + ((y * 120) / 160) | 0,
    180 - ((x * 100) / 240) | 0,
  ]);
  const cover = png(200, 300, (x, y) => [
    20 + ((y * 60) / 300) | 0,
    60 + ((x * 80) / 200) | 0,
    120 + ((y * 100) / 300) | 0,
  ]);

  const manifest = CHAPTERS.map((_, i) => `    <item id="ch${i + 1}" href="text/ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n');
  const spine = CHAPTERS.map((_, i) => `    <itemref idref="ch${i + 1}"/>`).join('\n');
  const navList = CHAPTERS.map((c, i) => `        <li><a href="text/ch${i + 1}.xhtml">${c.title}</a></li>`).join('\n');

  return zip([
    // The mimetype entry must be first and stored uncompressed.
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    {
      name: 'META-INF/container.xml',
      data: `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    },
    {
      name: 'OEBPS/content.opf',
      data: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>MyEBookReader 샘플 책</dc:title>
    <dc:creator>SHKWON</dc:creator>
    <dc:language>ko</dc:language>
    <dc:identifier id="bookid">urn:uuid:myebookreader-sample-0001</dc:identifier>
    <dc:publisher>TestSimulator</dc:publisher>
    <dc:date>2026-01-01</dc:date>
    <dc:description>모든 기능을 시험하기 위한 샘플 EPUB 입니다.</dc:description>
    <dc:subject>Sample</dc:subject>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>
    <item id="plate" href="images/plate.png" media-type="image/png"/>
    <item id="css" href="style.css" media-type="text/css"/>
${manifest}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>`,
    },
    {
      name: 'OEBPS/nav.xhtml',
      data: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>목차</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>목차</h1>
    <ol>
${navList}
    </ol>
  </nav>
</body>
</html>`,
    },
    {
      name: 'OEBPS/toc.ncx',
      data: `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:myebookreader-sample-0001"/></head>
  <docTitle><text>MyEBookReader 샘플 책</text></docTitle>
  <navMap>
${CHAPTERS.map((c, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${c.title}</text></navLabel>
      <content src="text/ch${i + 1}.xhtml"/>
    </navPoint>`).join('\n')}
  </navMap>
</ncx>`,
    },
    { name: 'OEBPS/style.css', data: 'body { font-family: serif; } h1 { color: #246; }' },
    { name: 'OEBPS/images/cover.png', data: cover },
    { name: 'OEBPS/images/plate.png', data: plate },
    ...CHAPTERS.map((chapter, i) => ({
      name: `OEBPS/text/ch${i + 1}.xhtml`,
      data: xhtml(chapter.title, chapter.body),
    })),
  ]);
}

function buildCbz() {
  const pages = [];
  for (let p = 1; p <= 6; p++) {
    pages.push({
      name: `page${p}.png`,
      data: png(180, 260, (x, y) => [
        (30 * p + x) % 255,
        (90 + y) % 255,
        (200 - 20 * p) % 255,
      ]),
      store: true,     // images are already compressed
    });
  }
  return zip(pages);
}

function buildFb2() {
  const body = CHAPTERS.map((chapter) => `    <section>
      <title><p>${chapter.title}</p></title>
${chapter.body.filter((line) => !line.startsWith('<')).map((line) => `      <p>${line}</p>`).join('\n')}
    </section>`).join('\n');

  return Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <genre>sf</genre>
      <author><first-name>Suho</first-name><last-name>Kwon</last-name></author>
      <book-title>MyEBookReader FB2 샘플</book-title>
      <annotation><p>FictionBook 형식을 시험하기 위한 샘플입니다.</p></annotation>
      <lang>ko</lang>
      <date>2026</date>
    </title-info>
    <publish-info><publisher>TestSimulator</publisher><year>2026</year></publish-info>
  </description>
  <body>
${body}
  </body>
</FictionBook>
`, 'utf8');
}

function buildText() {
  const lines = ['MyEBookReader 텍스트 샘플', ''];
  for (let c = 1; c <= 4; c++) {
    lines.push(`제${c}장 텍스트 장 제목`, '');
    for (let p = 1; p <= 8; p++) {
      lines.push(`${c}-${p}. 평문 텍스트도 장 단위로 나뉘어 목차가 생깁니다. Plain text is split into chapters so it gets a contents list too.`, '');
    }
  }
  return Buffer.from(lines.join('\n'), 'utf8');
}

function buildMarkdown() {
  return Buffer.from(`# MyEBookReader Markdown 샘플

마크다운은 **굵게**, *기울임*, \`코드\`, [링크](https://example.com) 를 그대로 보여 줍니다.

## 첫째 절

- 목록 항목 하나
- 목록 항목 둘
- 목록 항목 셋

> 인용문도 지원합니다.

\`\`\`js
console.log('fenced code blocks too');
\`\`\`

## 둘째 절

| 형식 | 확장자 |
| --- | --- |
| EPUB | .epub |
| 만화 | .cbz |

두 번째 절의 본문입니다. The second section exists so the contents list has more than one entry.
`, 'utf8');
}

function buildHtml() {
  return Buffer.from(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>MyEBookReader HTML 샘플</title></head>
<body>
  <h1>첫째 부분</h1>
  <p>단독 HTML 파일도 제목을 기준으로 나뉘어 읽힙니다.</p>
  <h1>둘째 부분</h1>
  <p>A standalone HTML book is split at its top-level headings.</p>
</body></html>
`, 'utf8');
}

// ── MOBI (PalmDOC compression) ────────────────────────────
function palmDocCompress(input) {
  // Literal bytes and the "space + letter" pairing only: a correct PalmDOC
  // stream that the reader has to decompress, without needing a matcher.
  const out = [];
  for (let i = 0; i < input.length; i++) {
    const byte = input[i];
    if (byte === 0x20 && i + 1 < input.length && input[i + 1] >= 0x40 && input[i + 1] < 0x80) {
      out.push(input[i + 1] ^ 0x80);
      i++;
    } else if (byte >= 0x09 && byte < 0x80) {
      out.push(byte);
    } else {
      out.push(1, byte);      // one literal byte follows
    }
  }
  return Buffer.from(out);
}

function buildMobi() {
  const html = `<html><head><guide></guide></head><body>${
    CHAPTERS.map((chapter, i) => `${i ? '<mbp:pagebreak/>' : ''}<h1>${chapter.title}</h1>${
      chapter.body.filter((line) => !line.startsWith('<')).map((line) => `<p>${line}</p>`).join('')
    }`).join('')
  }</body></html>`;

  const text = Buffer.from(html, 'utf8');
  const RECORD = 4096;
  const records = [];
  for (let at = 0; at < text.length; at += RECORD) {
    records.push(palmDocCompress(text.subarray(at, Math.min(at + RECORD, text.length))));
  }

  const title = Buffer.from('MyEBookReader MOBI 샘플', 'utf8');
  const author = Buffer.from('SHKWON', 'utf8');

  // EXTH: author (100) and publisher (101).
  const exthEntries = [[100, author], [101, Buffer.from('TestSimulator', 'utf8')]];
  const exthBody = Buffer.concat(exthEntries.map(([type, value]) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(type, 0);
    head.writeUInt32BE(8 + value.length, 4);
    return Buffer.concat([head, value]);
  }));
  const exthHead = Buffer.alloc(12);
  exthHead.write('EXTH', 0, 'ascii');
  exthHead.writeUInt32BE(12 + exthBody.length, 4);
  exthHead.writeUInt32BE(exthEntries.length, 8);
  const exthPad = Buffer.alloc((4 - ((12 + exthBody.length) % 4)) % 4);
  const exth = Buffer.concat([exthHead, exthBody, exthPad]);

  // Record 0: PalmDOC header (16) + MOBI header (232) + EXTH + the title.
  const MOBI_HEADER_LENGTH = 232;
  const record0 = Buffer.alloc(16 + MOBI_HEADER_LENGTH);
  record0.writeUInt16BE(2, 0);                  // compression: PalmDOC
  record0.writeUInt32BE(text.length, 4);        // uncompressed text length
  record0.writeUInt16BE(records.length, 8);     // text record count
  record0.writeUInt16BE(RECORD, 10);            // record size
  record0.writeUInt16BE(0, 12);                 // no encryption
  record0.write('MOBI', 16, 'ascii');
  record0.writeUInt32BE(MOBI_HEADER_LENGTH, 20);
  record0.writeUInt32BE(2, 24);                 // mobi type: book
  record0.writeUInt32BE(65001, 28);             // UTF-8
  record0.writeUInt32BE(6, 32);                 // unique id
  record0.writeUInt32BE(6, 36);                 // file version
  record0.writeUInt32BE(16 + MOBI_HEADER_LENGTH + exth.length, 84);   // full name offset
  record0.writeUInt32BE(title.length, 88);      // full name length
  record0.writeUInt32BE(9, 92);                 // locale: ko
  record0.writeUInt32BE(0xffffffff, 108);       // first image record: none
  record0.writeUInt32BE(0x40, 128);             // EXTH present

  const head0 = Buffer.concat([record0, exth, title, Buffer.alloc(2)]);
  const allRecords = [head0, ...records];

  const name = Buffer.alloc(32);
  name.write('MyEBookReaderSample', 0, 'latin1');
  const header = Buffer.alloc(78);
  name.copy(header, 0);
  header.writeUInt16BE(0, 32);                  // attributes
  header.writeUInt16BE(1, 34);                  // version
  header.write('BOOKMOBI', 60, 'ascii');
  header.writeUInt16BE(allRecords.length, 76);

  const tableSize = allRecords.length * 8;
  // The record table is followed by two padding bytes before the first record.
  let offset = header.length + tableSize + 2;
  const table = Buffer.alloc(tableSize);
  allRecords.forEach((record, i) => {
    table.writeUInt32BE(offset, i * 8);
    table.writeUInt32BE(i, i * 8 + 4);          // attributes + unique id
    offset += record.length;
  });

  return Buffer.concat([header, table, Buffer.alloc(2), ...allRecords]);
}

// ── A minimal, valid PDF ──────────────────────────────────
function buildPdf() {
  const lines = [
    'BT /F1 22 Tf 60 740 Td (MyEBookReader PDF sample) Tj ET',
    'BT /F1 13 Tf 60 700 Td (Fixed-layout formats are drawn page by page.) Tj ET',
    'BT /F1 13 Tf 60 676 Td (Zoom, rotation and printing all work on pages.) Tj ET',
  ];
  const content = `${lines.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    `<< /Length 74 >>\nstream\nBT /F1 16 Tf 60 740 Td (Page two of the PDF sample.) Tj ET\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startxref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) pdf += `${String(at).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ── Pictures: one the browser decodes, and two it cannot ──
function buildPng() {
  return png(480, 320, (x, y) => [
    40 + ((x * 180) / 480) | 0,
    120 + ((y * 100) / 320) | 0,
    200 - ((x * 120) / 480) | 0,
  ]);
}

/** A baseline, uncompressed RGB TIFF — decoded by the app's own reader. */
function buildTiff() {
  const width = 240;
  const height = 160;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3;
      pixels[at] = (x * 255 / width) | 0;
      pixels[at + 1] = (y * 255 / height) | 0;
      pixels[at + 2] = 160;
    }
  }

  const entries = [
    [256, 3, 1, width], [257, 3, 1, height], [258, 3, 1, 8], [259, 3, 1, 1],
    [262, 3, 1, 2], [273, 4, 1, 0], [277, 3, 1, 3], [278, 3, 1, height],
    [279, 4, 1, pixels.length], [284, 3, 1, 1],
  ];
  const ifdSize = 2 + entries.length * 12 + 4;
  const dataOffset = 8 + ifdSize;
  entries[5][3] = dataOffset;

  const out = Buffer.alloc(dataOffset + pixels.length);
  out.write('II', 0, 'ascii');
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(8, 4);
  out.writeUInt16LE(entries.length, 8);
  entries.forEach(([tag, type, count, value], i) => {
    const at = 10 + i * 12;
    out.writeUInt16LE(tag, at);
    out.writeUInt16LE(type, at + 2);
    out.writeUInt32LE(count, at + 4);
    if (type === 3) out.writeUInt16LE(value, at + 8);
    else out.writeUInt32LE(value, at + 8);
  });
  pixels.copy(out, dataOffset);
  return out;
}

/** A small 16-bit DICOM image, explicit VR little endian. */
function buildDicom() {
  const width = 128;
  const height = 128;
  const pixels = Buffer.alloc(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const value = Math.max(0, 3200 - Math.round(Math.hypot(dx, dy) * 40));
      pixels.writeUInt16LE(value, (y * width + x) * 2);
    }
  }

  const parts = [];
  const element = (group, elem, vr, payload) => {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'latin1');
    const padded = body.length % 2 ? Buffer.concat([body, Buffer.from([0x20])]) : body;
    if (vr === 'OW') {
      const head = Buffer.alloc(12);
      head.writeUInt16LE(group, 0);
      head.writeUInt16LE(elem, 2);
      head.write(vr, 4, 'ascii');
      head.writeUInt32LE(padded.length, 8);
      parts.push(head, padded);
      return;
    }
    const head = Buffer.alloc(8);
    head.writeUInt16LE(group, 0);
    head.writeUInt16LE(elem, 2);
    head.write(vr, 4, 'ascii');
    head.writeUInt16LE(padded.length, 6);
    parts.push(head, padded);
  };
  const us = (value) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(value, 0);
    return b;
  };

  const metaBody = (() => {
    const syntax = Buffer.from('1.2.840.10008.1.2.1\u0000', 'latin1');
    const head = Buffer.alloc(8);
    head.writeUInt16LE(0x0002, 0);
    head.writeUInt16LE(0x0010, 2);
    head.write('UI', 4, 'ascii');
    head.writeUInt16LE(syntax.length, 6);
    return Buffer.concat([head, syntax]);
  })();
  const groupLength = Buffer.alloc(12);
  groupLength.writeUInt16LE(0x0002, 0);
  groupLength.writeUInt16LE(0x0000, 2);
  groupLength.write('UL', 4, 'ascii');
  groupLength.writeUInt16LE(4, 6);
  groupLength.writeUInt32LE(metaBody.length, 8);

  element(0x0008, 0x0060, 'CS', 'OT');
  element(0x0008, 0x1030, 'LO', 'MyEBookReader sample study');
  element(0x0010, 0x0010, 'PN', 'SAMPLE^PATIENT');
  element(0x0028, 0x0002, 'US', us(1));
  element(0x0028, 0x0004, 'CS', 'MONOCHROME2');
  element(0x0028, 0x0010, 'US', us(height));
  element(0x0028, 0x0011, 'US', us(width));
  element(0x0028, 0x0100, 'US', us(16));
  element(0x0028, 0x0101, 'US', us(16));
  element(0x0028, 0x0103, 'US', us(0));
  element(0x7fe0, 0x0010, 'OW', pixels);

  return Buffer.concat([
    Buffer.alloc(128), Buffer.from('DICM', 'ascii'), groupLength, metaBody, ...parts,
  ]);
}

const FILES = [
  ['sample.epub', buildEpub],
  ['sample.png', buildPng],
  ['sample.tif', buildTiff],
  ['sample.dcm', buildDicom],
  ['sample.cbz', buildCbz],
  ['sample.fb2', buildFb2],
  ['sample.txt', buildText],
  ['sample.md', buildMarkdown],
  ['sample.html', buildHtml],
  ['sample.mobi', buildMobi],
  ['sample.pdf', buildPdf],
];

fs.mkdirSync(out, { recursive: true });
for (const [name, build] of FILES) {
  const data = build();
  fs.writeFileSync(path.join(out, name), data);
  console.log(`[samples] ${name} — ${data.length.toLocaleString()} bytes`);
}
console.log(`[samples] Wrote ${FILES.length} sample books to samples/`);
