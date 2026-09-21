"use strict";

const fs = require("fs");
const path = require("path");

class FileLogger {
  constructor(dir) {
    this.dir = dir;
    this.ring = [];
    this.maxRing = 2000;
    fs.mkdirSync(dir, { recursive: true });
  }

  fileFor(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return path.join(this.dir, `mmon-${y}${m}${d}.log`);
  }

  write(entry) {
    const rec = {
      ts: entry.ts || Date.now(),
      level: entry.level || "info",
      targetId: entry.targetId || "",
      targetName: entry.targetName || "",
      message: entry.message || ""
    };
    this.ring.push(rec);
    if (this.ring.length > this.maxRing) this.ring.shift();
    const line = `${new Date(rec.ts).toISOString()} [${rec.level}] [${rec.targetName || rec.targetId}] ${rec.message}\n`;
    try {
      fs.appendFileSync(this.fileFor(), line, "utf8");
    } catch {
      /* keep UI ring even if disk write fails */
    }
    return rec;
  }

  list() {
    return this.ring.slice();
  }

  exportTo(filePath, format = "txt") {
    if (format === "json") {
      fs.writeFileSync(filePath, JSON.stringify(this.ring, null, 2), "utf8");
      return;
    }
    if (format === "csv") {
      const header = "ts,level,target,message\n";
      const body = this.ring
        .map((r) => `${new Date(r.ts).toISOString()},${r.level},"${(r.targetName || "").replace(/"/g, '""')}","${String(r.message).replace(/"/g, '""')}"`)
        .join("\n");
      fs.writeFileSync(filePath, header + body, "utf8");
      return;
    }
    const text = this.ring
      .map((r) => `${new Date(r.ts).toISOString()} [${r.level}] [${r.targetName || r.targetId}] ${r.message}`)
      .join("\n");
    fs.writeFileSync(filePath, text + "\n", "utf8");
  }
}

module.exports = { FileLogger };
