import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
// The published fontkit build is CommonJS, so it is loaded through a local bridge.
// @ts-expect-error fontkit.cjs has no declaration file.
import fontkitModule from "./fontkit.cjs";
import type { Report } from "./report.js";

export async function renderPdf(report: Report): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkitModule);
  const embedded = await embedFont(pdf);
  const font = embedded.font;
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 36;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensure = (height: number) => {
    if (y - height >= margin) return;
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const draw = (text: string, size: number, bold = false) => {
    const lines = wrap(drawable(text, font), font, size, pageWidth - margin * 2);
    for (const line of lines) {
      ensure(size + 4);
      page.drawText(line, { x: margin, y: y - size, size, font, color: rgb(bold ? 0.08 : 0.12, 0.08, 0.1) });
      y -= size + 3;
    }
  };

  draw(report.title, 16, true);
  draw(report.generatedAt, 9);
  y -= 4;
  for (const row of report.summary) draw(`${row.label}: ${row.value}`, 10);
  for (const table of report.tables) {
    y -= 8;
    draw(table.title, 13, true);
    drawTable(table.headers, table.rows, {
      pageRef: () => page,
      y: () => y,
      setY: (next) => { y = next; },
      ensure,
      font,
      margin,
      pageWidth,
    });
  }
  if (report.text) {
    y -= 8;
    draw(report.text.title, 13, true);
    for (const line of report.text.body.split(/\r?\n/)) draw(line || " ", 9);
  }
  return pdf.save();
}

async function embedFont(pdf: PDFDocument): Promise<{ font: PDFFont }> {
  const file = koreanFontFile();
  if (file) {
    try {
      const font = await pdf.embedFont(fs.readFileSync(file), { subset: true });
      return { font };
    } catch {
      /* fall back to a standard font when the system font cannot be embedded */
    }
  }
  return { font: await pdf.embedFont(StandardFonts.Helvetica) };
}

function koreanFontFile(): string | null {
  const windows = process.env.WINDIR || "C:\\Windows";
  const candidates = [
    path.join(windows, "Fonts", "malgun.ttf"),
    path.join(windows, "Fonts", "malgunsl.ttf"),
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
  ];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) ?? null;
}

function drawable(text: string, font: PDFFont): string {
  let out = "";
  for (const ch of text) {
    if (ch === "\n" || ch === "\t") {
      out += ch;
      continue;
    }
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const ch of text.replaceAll("\t", "  ")) {
    if (ch === "\n") {
      lines.push(current);
      current = "";
      continue;
    }
    const next = current + ch;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(current);
      current = ch === " " ? "" : ch;
    } else current = next;
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

function drawTable(headers: string[], rows: string[][], view: {
  pageRef: () => PDFPage;
  y: () => number;
  setY: (y: number) => void;
  ensure: (height: number) => void;
  font: PDFFont;
  margin: number;
  pageWidth: number;
}) {
  const size = 8;
  const columns = Math.max(headers.length, 1);
  const width = (view.pageWidth - view.margin * 2) / columns;
  const paint = (cells: string[], header: boolean) => {
    const wrapped = cells.map((cell) => wrap(drawable(cell, view.font), view.font, size, width - 6));
    const height = Math.max(...wrapped.map((lines) => lines.length), 1) * (size + 2) + 6;
    view.ensure(height);
    let x = view.margin;
    const top = view.y();
    wrapped.forEach((lines, index) => {
      view.pageRef().drawRectangle({
        x,
        y: top - height,
        width,
        height,
        borderColor: rgb(0.75, 0.75, 0.75),
        borderWidth: 0.4,
        ...(header ? { color: rgb(0.93, 0.93, 0.93) } : {}),
      });
      lines.forEach((line, lineIndex) => {
        view.pageRef().drawText(line, {
          x: x + 3,
          y: top - 4 - size - lineIndex * (size + 2),
          size,
          font: view.font,
          color: rgb(0.1, 0.1, 0.1),
        });
      });
      x += width;
      if (index >= columns) return;
    });
    view.setY(top - height);
  };
  paint(headers, true);
  for (const row of rows) paint(headers.map((_, index) => row[index] ?? ""), false);
}
