// Writes samples/ — one small file per commonly used language / format, plus
// encoding and line-ending variants and a set of raster images — to try the
// editor with:
//   node scripts/make-samples.mjs
// The files are committed; this script only exists to regenerate them.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { encodeIco } from './ico.mjs';

const require = createRequire(import.meta.url);
const iconv = require('iconv-lite');
const dicom = require('../core/dicom');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'samples');

const files = {
  'README.md': `# samples

My Editor 가 지원하는 파일 형식의 예제 모음입니다. 파일 › 폴더 열기로 이 폴더를 열면 트리에서 하나씩 열어 볼 수 있습니다.

| 폴더 / 파일 | 내용 |
|---|---|
| \`code/\` | JavaScript · TypeScript · JSX · Python · C · C++ · C# · Java · Go · Rust · PHP · Ruby · Shell · PowerShell · SQL · Lua · Kotlin · Swift |
| \`web/\` | HTML · CSS · SCSS · Vue · Svelte-style 마크업 |
| \`data/\` | JSON · YAML · TOML · XML · CSV · INI · .env · Dockerfile · Makefile · .gitignore |
| \`text/\` | 일반 텍스트, 로그, Markdown(WYSIWYG 도구 모음 · 미리보기), 스펠링 체크용 영어 문장 |
| \`encodings/\` | UTF-8 (BOM 있음/없음), UTF-16 LE/BE, EUC-KR(CP949), Shift_JIS, Windows-1252 — 인코딩 자동 감지와 다시 열기 |
| \`eol/\` | CRLF · LF · CR 줄 끝 — 상태 표시줄의 줄 끝 표시와 변환 |
| \`images/\` | PNG · JPEG · GIF · WebP · AVIF · BMP · ICO · DICOM — 그림으로 열기 / 16진수 보기. HEIC/HEIF 는 카메라 파일을 직접 여세요. \`logo.svg\` 는 소스로 열림 |

> \`text/spelling.txt\` 와 \`code/comments.c\` 에는 일부러 틀린 영어 단어가 들어 있습니다.
`,

  // ── code ──
  'code/app.js': `// JavaScript — ES modules, classes, template strings, async/await
import { readFile } from 'node:fs/promises';

const GREETING = '안녕하세요, My Editor!';

/**
 * Counts the lines of a text file.
 * @param {string} file
 */
export async function countLines(file) {
  const text = await readFile(file, 'utf-8');
  const lines = text.split(/\\r?\\n/);
  return { file, lines: lines.length, longest: Math.max(...lines.map((l) => l.length)) };
}

export default class Greeter {
  #name;
  constructor(name = 'world') { this.#name = name; }
  greet() { return \`\${GREETING} \${this.#name} \${42 * 2}\`; }
}
`,
  'code/types.ts': `// TypeScript — interfaces, generics, enums, type guards
export interface Document {
  id: number;
  path: string | null;
  encoding: 'utf8' | 'utf16le' | 'cp949';
  dirty: boolean;
}

export enum Eol { CRLF = 'crlf', LF = 'lf', CR = 'cr' }

export function first<T>(items: readonly T[], predicate: (item: T) => boolean): T | undefined {
  for (const item of items) if (predicate(item)) return item;
  return undefined;
}

export const isDirty = (d: Document): d is Document & { dirty: true } => d.dirty;

const docs: Document[] = [{ id: 1, path: null, encoding: 'utf8', dirty: true }];
console.log(first(docs, isDirty)?.id ?? 'none', Eol.LF);
`,
  'code/Component.jsx': `// JSX — a React component with hooks
import React, { useEffect, useState } from 'react';

export function Clock({ format = 'ko-KR' }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="clock" title={now.toISOString()}>
      <span>{now.toLocaleTimeString(format)}</span>
      {now.getSeconds() % 2 === 0 && <span className="tick">•</span>}
    </div>
  );
}
`,
  'code/util.py': `"""Python — type hints, dataclasses, comprehensions, f-strings."""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class FileInfo:
    path: Path
    size: int = 0
    tags: list[str] = field(default_factory=list)

    def describe(self) -> str:
        return f"{self.path.name}: {self.size:,} bytes {' '.join('#' + t for t in self.tags)}"


def scan(root: Path) -> list[FileInfo]:
    return [FileInfo(p, p.stat().st_size) for p in root.iterdir() if p.is_file()]


if __name__ == "__main__":
    for info in scan(Path(sys.argv[1] if len(sys.argv) > 1 else ".")):
        print(info.describe())
`,
  'code/comments.c': `/* C — the spell checker looks at comments and strings only (see 설정).
   This commnt contains a misteak on purpose. */
#include <stdio.h>
#include <stdlib.h>

#define MAX_ITEMS 16

typedef struct {
    int id;
    const char *name;
} item_t;

static int compare(const void *a, const void *b) {
    return ((const item_t *)a)->id - ((const item_t *)b)->id;   // ascending by id
}

int main(int argc, char **argv) {
    item_t items[MAX_ITEMS] = { { 3, "three" }, { 1, "one" }, { 2, "two" } };
    qsort(items, 3, sizeof(item_t), compare);
    for (int i = 0; i < 3; i++) printf("%d %s\\n", items[i].id, items[i].name);
    printf("Helo wrold from %s\\n", argc > 0 ? argv[0] : "?");   /* misspelled string */
    return EXIT_SUCCESS;
}
`,
  'code/shapes.cpp': `// C++17 — classes, smart pointers, ranges-style loops
#include <iostream>
#include <memory>
#include <vector>
#include <cmath>

struct Shape {
    virtual ~Shape() = default;
    virtual double area() const = 0;
    virtual const char* name() const = 0;
};

struct Circle : Shape {
    explicit Circle(double r) : r_(r) {}
    double area() const override { return M_PI * r_ * r_; }
    const char* name() const override { return "circle"; }
private:
    double r_;
};

int main() {
    std::vector<std::unique_ptr<Shape>> shapes;
    shapes.push_back(std::make_unique<Circle>(1.5));
    for (const auto& s : shapes) std::cout << s->name() << ": " << s->area() << '\\n';
}
`,
  'code/Program.cs': `// C# — records, LINQ, pattern matching
using System;
using System.Linq;

namespace Samples;

public record Person(string Name, int Age);

public static class Program
{
    public static void Main()
    {
        var people = new[] { new Person("Kim", 34), new Person("Lee", 27), new Person("Park", 45) };
        var adults = people.Where(p => p.Age >= 30).OrderBy(p => p.Name);
        foreach (var p in adults)
            Console.WriteLine(p switch { { Age: > 40 } => $"{p.Name} (senior)", _ => p.Name });
    }
}
`,
  'code/Main.java': `// Java — generics, streams, records
import java.util.List;
import java.util.stream.Collectors;

public class Main {
    record Point(int x, int y) {
        double distance() { return Math.sqrt(x * x + y * y); }
    }

    public static void main(String[] args) {
        List<Point> points = List.of(new Point(3, 4), new Point(1, 1), new Point(6, 8));
        String far = points.stream()
            .filter(p -> p.distance() > 2)
            .map(Point::toString)
            .collect(Collectors.joining(", "));
        System.out.println("far points: " + far);
    }
}
`,
  'code/main.go': `// Go — goroutines, channels, structs
package main

import (
	"fmt"
	"sync"
)

type Job struct {
	ID   int
	Name string
}

func worker(id int, jobs <-chan Job, wg *sync.WaitGroup) {
	defer wg.Done()
	for j := range jobs {
		fmt.Printf("worker %d handled %s\\n", id, j.Name)
	}
}

func main() {
	jobs := make(chan Job, 4)
	var wg sync.WaitGroup
	for i := 1; i <= 2; i++ {
		wg.Add(1)
		go worker(i, jobs, &wg)
	}
	for i, n := range []string{"alpha", "beta", "gamma"} {
		jobs <- Job{ID: i, Name: n}
	}
	close(jobs)
	wg.Wait()
}
`,
  'code/main.rs': `// Rust — enums, pattern matching, iterators, Result
use std::collections::HashMap;

#[derive(Debug)]
enum Token { Word(String), Number(i64) }

fn tokenize(input: &str) -> Vec<Token> {
    input.split_whitespace().map(|s| match s.parse::<i64>() {
        Ok(n) => Token::Number(n),
        Err(_) => Token::Word(s.to_string()),
    }).collect()
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for t in tokenize("one 1 two 2 two 3") {
        let key = match t { Token::Word(_) => "word", Token::Number(_) => "number" };
        *counts.entry(key).or_default() += 1;
    }
    println!("{counts:?}");
    Ok(())
}
`,
  'code/index.php': `<?php
// PHP — classes, arrays, string interpolation
declare(strict_types=1);

final class Greeter
{
    public function __construct(private string $name = 'world') {}

    public function greet(): string
    {
        return "Hello, {$this->name}!";
    }
}

$people = ['Kim' => 34, 'Lee' => 27];
foreach ($people as $name => $age) {
    echo (new Greeter($name))->greet(), " ($age)\\n";
}
`,
  'code/app.rb': `# Ruby — classes, blocks, string interpolation
class Stack
  def initialize = @items = []
  def push(x) = @items.push(x) && self
  def pop = @items.pop
  def each(&block) = @items.reverse.each(&block)
end

s = Stack.new.push(1).push(2).push(3)
s.each { |x| puts "item #{x}" }
puts "popped #{s.pop}"
`,
  'code/deploy.sh': `#!/usr/bin/env bash
# Shell — functions, conditionals, loops
set -euo pipefail

TARGET="\${1:-dist}"
log() { printf '[%s] %s\\n' "$(date +%H:%M:%S)" "$*"; }

if [[ ! -d "$TARGET" ]]; then
  log "creating $TARGET"
  mkdir -p "$TARGET"
fi

for f in *.txt; do
  [[ -e "$f" ]] || continue
  cp -- "$f" "$TARGET/"
  log "copied $f"
done
log "done"
`,
  'code/backup.ps1': `# PowerShell — parameters, pipelines, objects
param(
    [Parameter(Mandatory)] [string] $Source,
    [string] $Destination = "$env:TEMP\\backup"
)

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Get-ChildItem -Path $Source -File -Recurse |
    Where-Object { $_.Length -gt 0 } |
    ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $Destination
        Write-Host ("copied {0} ({1:N0} bytes)" -f $_.Name, $_.Length)
    }
`,
  'code/schema.sql': `-- SQL — DDL, joins, aggregates, window functions
CREATE TABLE authors (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL
);

CREATE TABLE books (
    id        INTEGER PRIMARY KEY,
    author_id INTEGER REFERENCES authors(id),
    title     TEXT NOT NULL,
    year      INTEGER
);

INSERT INTO authors VALUES (1, 'Kim'), (2, 'Lee');
INSERT INTO books VALUES (1, 1, 'First', 2001), (2, 1, 'Second', 2005), (3, 2, 'Other', 2010);

SELECT a.name, COUNT(*) AS books, MAX(b.year) AS latest,
       RANK() OVER (ORDER BY COUNT(*) DESC) AS rnk
FROM authors a JOIN books b ON b.author_id = a.id
GROUP BY a.name
ORDER BY rnk;
`,
  'code/game.lua': `-- Lua — tables, metatables, closures
local Vector = {}
Vector.__index = Vector

function Vector.new(x, y) return setmetatable({ x = x, y = y }, Vector) end
function Vector.__add(a, b) return Vector.new(a.x + b.x, a.y + b.y) end
function Vector:length() return math.sqrt(self.x ^ 2 + self.y ^ 2) end

local function counter()
  local n = 0
  return function() n = n + 1; return n end
end

local v = Vector.new(3, 4) + Vector.new(1, 1)
local next = counter()
print(v:length(), next(), next())
`,
  'code/Main.kt': `// Kotlin — data classes, extension functions, when
data class User(val name: String, val age: Int)

fun List<User>.adults() = filter { it.age >= 18 }

fun describe(u: User) = when {
    u.age < 13 -> "child"
    u.age < 20 -> "teen"
    else -> "adult"
}

fun main() {
    val users = listOf(User("Kim", 12), User("Lee", 17), User("Park", 40))
    users.adults().forEach { println("\${it.name}: \${describe(it)}") }
}
`,
  'code/main.swift': `// Swift — structs, optionals, guard, closures
import Foundation

struct Temperature {
    var celsius: Double
    var fahrenheit: Double { celsius * 9 / 5 + 32 }
}

func parse(_ text: String) -> Temperature? {
    guard let value = Double(text) else { return nil }
    return Temperature(celsius: value)
}

let inputs = ["21.5", "abc", "-3"]
inputs.compactMap(parse).forEach { print(String(format: "%.1f°C = %.1f°F", $0.celsius, $0.fahrenheit)) }
`,

  // ── web ──
  'web/index.html': `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>HTML 샘플</title>
  <link rel="stylesheet" href="style.css">
  <style>
    .hero { padding: 2rem; background: linear-gradient(90deg, #1e3a8a, #0ea5e9); color: #fff; }
  </style>
</head>
<body>
  <header class="hero">
    <h1>My Editor</h1>
    <p>HTML 안의 <em>CSS</em> 와 <strong>JavaScript</strong> 도 함께 강조됩니다.</p>
  </header>
  <main>
    <ul id="list"></ul>
    <button type="button" onclick="add()">추가</button>
  </main>
  <script>
    let n = 0;
    function add() {
      const li = document.createElement('li');
      li.textContent = \`item \${++n}\`;
      document.getElementById('list').appendChild(li);
    }
  </script>
</body>
</html>
`,
  'web/style.css': `/* CSS — custom properties, nesting-free selectors, media queries */
:root {
  --bg: #12161c;
  --fg: #e4e9f0;
  --accent: #4cc9f0;
}

body {
  margin: 0;
  font: 14px/1.5 system-ui, 'Noto Sans KR', sans-serif;
  color: var(--fg);
  background: var(--bg);
}

.card {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  padding: 16px;
}

.card > a:hover { color: var(--accent); text-decoration: underline; }

@media (max-width: 600px) {
  .card { grid-template-columns: 1fr; }
}
`,
  'web/theme.scss': `// SCSS — variables, nesting, mixins
$accent: #4cc9f0;
$radius: 6px;

@mixin panel($bg) {
  background: $bg;
  border-radius: $radius;
  padding: 8px 12px;
}

.toolbar {
  @include panel(#1a2029);
  display: flex;
  gap: 4px;

  button {
    border: 0;
    color: inherit;
    &:hover { background: lighten(#1a2029, 8%); }
    &.on { color: $accent; }
  }
}
`,
  'web/App.vue': `<template>
  <div class="counter">
    <button @click="count--">−</button>
    <span>{{ count }}</span>
    <button @click="count++">+</button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const count = ref(0);
</script>

<style scoped>
.counter { display: inline-flex; gap: 8px; align-items: center; }
</style>
`,

  // ── data ──
  'data/config.json': `{
  "name": "my-editor",
  "version": "1.0.0",
  "settings": {
    "theme": "midnight",
    "fontSize": 14,
    "wordWrap": false,
    "encodings": ["utf8", "utf16le", "cp949"]
  },
  "recent": [
    { "path": "C:\\\\work\\\\notes.txt", "line": 12 },
    { "path": "/home/user/todo.md", "line": 1 }
  ],
  "nullable": null
}
`,
  'data/docker-compose.yaml': `# YAML — nested maps, lists, anchors
version: "3.9"

x-common: &common
  restart: unless-stopped
  logging:
    driver: json-file
    options: { max-size: "10m" }

services:
  web:
    <<: *common
    image: nginx:1.27
    ports:
      - "8080:80"
    volumes:
      - ./dist:/usr/share/nginx/html:ro
  api:
    <<: *common
    build: .
    environment:
      - NODE_ENV=production
      - PORT=5190
`,
  'data/config.toml': `# TOML — tables, arrays of tables, dates
title = "My Editor"

[server]
host = "127.0.0.1"
port = 5190
token = ""

[editor]
font_size = 14
tab_size = 4
insert_spaces = true
themes = ["midnight", "daylight", "nord"]

[[recent]]
path = "notes.txt"
opened = 2026-09-15T10:00:00Z

[[recent]]
path = "README.md"
opened = 2026-09-14T18:30:00Z
`,
  'data/books.xml': `<?xml version="1.0" encoding="UTF-8"?>
<!-- XML — elements, attributes, CDATA -->
<library name="샘플">
  <book id="1" year="2001">
    <title>First</title>
    <author>Kim</author>
  </book>
  <book id="2" year="2010">
    <title>Other</title>
    <author>Lee</author>
    <note><![CDATA[Contains <markup> that is not parsed]]></note>
  </book>
</library>
`,
  'data/people.csv': `id,name,city,joined,score
1,Kim,Seoul,2020-03-01,88.5
2,Lee,Busan,2021-07-15,92
3,Park,"Daegu, Suseong",2019-11-30,79.25
4,Choi,Incheon,2022-01-10,
`,
  'data/settings.ini': `; INI — sections, keys, comments
[general]
language = ko
theme = midnight

[editor]
font_size = 14
tab_size = 4
word_wrap = false

# hash comments work too
[paths]
folder = C:\\Users\\me\\Documents
`,
  'data/.env': `# .env — key/value environment file
NODE_ENV=development
PORT=5190
API_TOKEN=change-me
DEBUG=my-editor:*
`,
  'data/Dockerfile': `# Dockerfile — multi-stage build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/core ./core
EXPOSE 5190
CMD ["node", "server/server.js", "--host", "0.0.0.0"]
`,
  'data/Makefile': `# Makefile — targets, variables, pattern rules
CC      := gcc
CFLAGS  := -Wall -O2
SRC     := $(wildcard *.c)
OBJ     := $(SRC:.c=.o)

all: app

app: $(OBJ)
\t$(CC) $(CFLAGS) -o $@ $^

%.o: %.c
\t$(CC) $(CFLAGS) -c $< -o $@

clean:
\trm -f $(OBJ) app

.PHONY: all clean
`,
  'data/.gitignore': `# Dependencies
node_modules/

# Build output
dist/
release/
*.log

# OS noise
.DS_Store
Thumbs.db
`,

  // ── text ──
  'text/notes.txt': `일반 텍스트 파일입니다.
Plain text — no syntax highlighting, every English word is spell-checked.

- 탭과 공백:\t탭 문자 다음에 오는 글자
- 끝에 공백이 있는 줄:
- 긴 줄: 자동 줄 바꿈(보기 › 자동 줄 바꿈)을 켜면 이 줄이 창 폭에 맞춰 접혀서 표시됩니다. 끄면 가로로 스크롤됩니다. 상태 표시줄에서 줄·열, 글자 수, 인코딩, 줄 끝을 확인할 수 있습니다.
`,
  'text/spelling.txt': `This paragraph has a few misspeled words so the spell checker can be tried.
The quick brown fox jumps over the lazy dog — that sentense is fine.
Right-click an underlined word for sugestions, or add it to the dictionary.
URLs like https://example.com/path, identifiers like my_var2 and acronyms like NASA are skipped.
`,
  'text/server.log': `2026-09-15 10:00:01 INFO  server started on http://127.0.0.1:5190
2026-09-15 10:00:05 INFO  GET /index.html 200 12ms
2026-09-15 10:00:06 WARN  fs.list C:\\temp took 850ms
2026-09-15 10:01:12 ERROR file.read ENOENT: C:\\temp\\missing.txt
    at read (core/files.js:31:9)
2026-09-15 10:02:00 INFO  session saved (4 tabs)
`,
  'text/guide.md': `# Markdown 샘플

이 파일을 열면 **WYSIWYG** 도구 모음이 나타납니다. 커서가 있는 줄에서만 기호가 보입니다.

## 서식

*기울임*, **굵게**, ~~취소선~~, \`인라인 코드\`, [링크](https://example.com)

### 목록

- 첫째
- 둘째
  - 들여쓴 항목
1. 번호 하나
2. 번호 둘

- [x] 완료한 일
- [ ] 남은 일 — 체크박스를 클릭해 보세요

> 인용문입니다. 왼쪽에 막대가 표시됩니다.

\`\`\`js
function hello(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

| 열 1 | 열 2 |
| --- | --- |
| 값 | 값 |

---

#### H4 제목
##### H5 제목
###### H6 제목
`,

  // ── images (raster files are written as bytes after this map; SVG is text) ──
  'images/README.md': `# images

래스터 그림 파일입니다. 열면 **그림이 편집 칸을 채우고**, 아래 **16진수** 버튼(또는 편집기 메뉴 › 이미지를 16진수로 보기)으로 바이트를 볼 수 있습니다. 미니맵·옆 미리보기 창은 쓰지 않습니다.

| 파일 | 확인할 것 |
|---|---|
| \`sample.png\` | 불투명 PNG |
| \`transparent.png\` | 투명 배경 — 바둑판 무늬 위에 그려지는지 |
| \`sample.jpg\` | JPEG |
| \`sample.gif\` | GIF |
| \`sample.webp\` | WebP |
| \`sample.avif\` | AVIF |
| \`sample.bmp\` | BMP |
| \`sample.ico\` | ICO (여러 크기) |
| \`sample.dcm\` | DICOM 한 장 — 윈도우/레벨 · 프리셋 · 반전 · HU |
| \`multi.dcm\` | DICOM 여러 프레임 — 슬라이더 · 연속 재생 |
| \`series/ct-001.dcm\` … | 같은 시리즈 3장 — 슬라이더로 넘김 |
| \`logo.svg\` | **예외** — SVG 는 텍스트 문서. 소스 편집 + 미리보기 (Ctrl+Shift+M) |

클릭하면 창에 맞춤 ↔ 원본 크기(1:1)를 전환합니다. HEIC/HEIF 는 샘플을 넣지 않습니다(카메라 파일을 열어 보세요).
`,
  'images/logo.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <!-- SVG is edited as source; Ctrl+Shift+M draws this next to the editor. -->
  <rect width="320" height="200" fill="#1a2744"/>
  <rect x="28" y="28" width="264" height="144" rx="18" fill="#3a86ff"/>
  <circle cx="118" cy="100" r="42" fill="#ffbe0b"/>
  <g fill="#ffffff" font-family="Segoe UI, sans-serif">
    <text x="175" y="96" font-size="28" font-weight="700">SVG</text>
    <text x="175" y="126" font-size="13" fill="#d6e4ff">source + preview</text>
  </g>
</svg>
`,
};

fs.rmSync(out, { recursive: true, force: true });
for (const [rel, text] of Object.entries(files)) {
  const p = path.join(out, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

// ── encodings (same text, different bytes) ──
const KO = '한글 인코딩 테스트 — Encoding test\n두 번째 줄: 가나다라 ABC 123\n';
const JA = '日本語のテキスト — Shift_JIS\n二行目: あいうえお ABC 123\n';
const enc = path.join(out, 'encodings');
fs.mkdirSync(enc, { recursive: true });
fs.writeFileSync(path.join(enc, 'utf8.txt'), KO);
fs.writeFileSync(path.join(enc, 'utf8-bom.txt'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(KO)]));
fs.writeFileSync(path.join(enc, 'utf16le.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(KO, 'utf16le')]));
fs.writeFileSync(path.join(enc, 'utf16be.txt'), Buffer.concat([Buffer.from([0xfe, 0xff]), iconv.encode(KO, 'utf16be')]));
fs.writeFileSync(path.join(enc, 'euc-kr.txt'), iconv.encode(KO.replace('—', '-'), 'cp949'));
fs.writeFileSync(path.join(enc, 'shift-jis.txt'), iconv.encode(JA.replace('—', '-'), 'shiftjis'));
fs.writeFileSync(path.join(enc, 'windows-1252.txt'), iconv.encode('Café — naïve façade, £5 · ½\n', 'windows1252'));
fs.writeFileSync(path.join(enc, 'README.md'), `# encodings

같은 내용을 다른 인코딩으로 저장한 파일들입니다. 열면 상태 표시줄에 감지된 인코딩이 표시됩니다.

- \`utf8.txt\`, \`utf8-bom.txt\` — BOM 유무
- \`utf16le.txt\`, \`utf16be.txt\` — UTF-16 (BOM)
- \`euc-kr.txt\` — 한국어 Windows 코드 페이지(CP949). 한국어 Windows 에서는 자동 감지, 다른 환경에서는 인코딩 › 다시 열기 › 한국어(EUC-KR / CP949)
- \`shift-jis.txt\` — 일본어. 인코딩 › 다시 열기 › 日本語 (Shift_JIS)
- \`windows-1252.txt\` — 서유럽 문자. 자동 감지되지 않으면 Western (Windows-1252) 로 다시 열기
`);

// ── line endings ──
const eol = path.join(out, 'eol');
fs.mkdirSync(eol, { recursive: true });
const LINES = ['first line', 'second line', '셋째 줄', ''];
fs.writeFileSync(path.join(eol, 'crlf.txt'), LINES.join('\r\n'));
fs.writeFileSync(path.join(eol, 'lf.txt'), LINES.join('\n'));
fs.writeFileSync(path.join(eol, 'cr.txt'), LINES.join('\r'));
fs.writeFileSync(path.join(eol, 'mixed.txt'), 'crlf line\r\nlf line\nanother crlf\r\n');
fs.writeFileSync(path.join(eol, 'README.md'), `# eol

줄 끝 문자만 다른 파일들입니다. 상태 표시줄의 CRLF / LF / CR 버튼으로 확인하고 바꿔서 저장해 보세요. \`mixed.txt\` 는 가장 많이 쓰인 줄 끝(CRLF)으로 감지됩니다.
`);

await writeImages(path.join(out, 'images'));

const count = fs.readdirSync(out, { recursive: true }).filter((n) => fs.statSync(path.join(out, String(n))).isFile()).length;
console.log(`[samples] wrote ${count} files to ${path.relative(path.join(__dirname, '..'), out)}/`);

// ── raster images (PNG · JPEG · GIF · WebP · AVIF · BMP · ICO) ──
// SVG is a text sample (images/logo.svg above). These files open as a picture
// in the editor, with an optional hex view.
function sampleSvg(label, { transparent = false } = {}) {
  const bg = transparent ? 'none' : '#1a2744';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <rect width="640" height="400" fill="${bg}"/>
  <rect x="48" y="48" width="544" height="304" rx="28" fill="#3a86ff"/>
  <circle cx="220" cy="200" r="78" fill="#ffbe0b"/>
  <text x="330" y="188" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="700">${label}</text>
  <text x="330" y="232" fill="#d6e4ff" font-family="Segoe UI, Arial, sans-serif" font-size="22">My Editor sample</text>
</svg>`;
}

function encodeBmp(w, h, rgba) {
  const stride = (w * 3 + 3) & ~3;
  const data = stride * h;
  const buf = Buffer.alloc(54 + data);
  buf.write('BM', 0);
  buf.writeUInt32LE(54 + data, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(data, 34);
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y;
    let o = 54 + y * stride;
    for (let x = 0; x < w; x++) {
      const i = (srcY * w + x) * 4;
      buf[o++] = rgba[i + 2];
      buf[o++] = rgba[i + 1];
      buf[o++] = rgba[i];
    }
  }
  return buf;
}

function encodeGif(w, h, rgba) {
  const index = Buffer.alloc(w * h);
  const palette = [];
  const map = new Map();
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4] & 0xf0, g = rgba[i * 4 + 1] & 0xf0, b = rgba[i * 4 + 2] & 0xf0;
    const k = (r << 16) | (g << 8) | b;
    let p = map.get(k);
    if (p == null) {
      p = palette.length < 256 ? palette.length : 0;
      if (palette.length < 256) { palette.push([r, g, b]); map.set(k, p); }
    }
    index[i] = p;
  }
  const sizeBits = Math.max(2, Math.ceil(Math.log2(Math.max(palette.length, 2))));
  const ncolors = 1 << sizeBits;
  const pal = Buffer.alloc(ncolors * 3);
  for (let i = 0; i < palette.length; i++) { pal[i * 3] = palette[i][0]; pal[i * 3 + 1] = palette[i][1]; pal[i * 3 + 2] = palette[i][2]; }

  const clear = 1 << sizeBits, eoi = clear + 1, codeSize = sizeBits + 1;
  const limit = (1 << codeSize) - 1 - eoi;
  let acc = 0, bits = 0;
  const bytes = [];
  const put = (code, width) => {
    acc |= code << bits;
    bits += width;
    while (bits >= 8) { bytes.push(acc & 255); acc >>= 8; bits -= 8; }
  };
  put(clear, codeSize);
  let n = 0;
  for (let i = 0; i < index.length; i++) {
    put(index[i], codeSize);
    if (++n >= limit) { put(clear, codeSize); n = 0; }
  }
  put(eoi, codeSize);
  if (bits) bytes.push(acc & 255);

  const blocks = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    blocks.push(Buffer.from([chunk.length, ...chunk]));
  }
  blocks.push(Buffer.from([0]));

  const header = Buffer.alloc(13);
  header.write('GIF89a', 0);
  header.writeUInt16LE(w, 6);
  header.writeUInt16LE(h, 8);
  header[10] = 0x80 | ((sizeBits - 1) & 7);
  const img = Buffer.alloc(10);
  img[0] = 0x2c;
  img.writeUInt16LE(w, 5);
  img.writeUInt16LE(h, 7);
  const min = Buffer.from([sizeBits]);
  const trailer = Buffer.from([0x3b]);
  return Buffer.concat([header, pal, img, min, ...blocks, trailer]);
}

async function writeImages(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const sharp = (await import('sharp')).default;
  const raster = async (label, opts) => {
    const png = await sharp(Buffer.from(sampleSvg(label, opts))).png().toBuffer();
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { png, rgba: data, w: info.width, h: info.height };
  };

  const png = await raster('PNG');
  fs.writeFileSync(path.join(dir, 'sample.png'), png.png);

  const jpeg = await raster('JPEG');
  fs.writeFileSync(path.join(dir, 'sample.jpg'), await sharp(jpeg.png).jpeg({ quality: 85 }).toBuffer());

  const gif = await raster('GIF');
  fs.writeFileSync(path.join(dir, 'sample.gif'), encodeGif(gif.w, gif.h, gif.rgba));

  const webp = await raster('WebP');
  fs.writeFileSync(path.join(dir, 'sample.webp'), await sharp(webp.png).webp({ quality: 85 }).toBuffer());

  try {
    const avif = await raster('AVIF');
    fs.writeFileSync(path.join(dir, 'sample.avif'), await sharp(avif.png).avif({ quality: 50 }).toBuffer());
  } catch (e) {
    console.warn('[samples] AVIF skipped:', e.message);
  }

  const bmp = await raster('BMP');
  fs.writeFileSync(path.join(dir, 'sample.bmp'), encodeBmp(bmp.w, bmp.h, bmp.rgba));

  const alpha = await raster('PNG', { transparent: true });
  fs.writeFileSync(path.join(dir, 'transparent.png'), alpha.png);

  const icoPng = async (size) => sharp(Buffer.from(sampleSvg('ICO'))).resize(size, size, { fit: 'cover' }).png().toBuffer();
  const ico = [];
  for (const size of [16, 32, 48, 256]) ico.push({ size, png: new Uint8Array(await icoPng(size)) });
  fs.writeFileSync(path.join(dir, 'sample.ico'), Buffer.from(encodeIco(ico)));

  const dcmPix = new Uint8Array(160 * 100);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 160; x++) dcmPix[y * 160 + x] = Math.round((x / 159) * 220);
  fs.writeFileSync(path.join(dir, 'sample.dcm'), dicom.encodeUncompressed({
    width: 160, height: 100, pixels: dcmPix, patientName: 'Sample^Patient', patientId: 'S1',
    modality: 'CT', studyDesc: 'My Editor', seriesDesc: 'Single', ww: 220, wl: 110,
  }));
  const cine = new Uint8Array(80 * 60 * 6);
  for (let f = 0; f < 6; f++) {
    for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) cine[f * 80 * 60 + y * 80 + x] = Math.min(255, x * 2 + f * 20);
  }
  fs.writeFileSync(path.join(dir, 'multi.dcm'), dicom.encodeUncompressed({
    width: 80, height: 60, pixels: cine, frames: 6, modality: 'XA', seriesDesc: 'Cine', ww: 255, wl: 127,
  }));
  const seriesDir = path.join(dir, 'series');
  fs.mkdirSync(seriesDir, { recursive: true });
  const seriesUid = '1.2.826.0.1.3680043.8.498.1001';
  for (let i = 1; i <= 3; i++) {
    const p = new Uint8Array(64 * 48);
    p.fill(40 + i * 50);
    fs.writeFileSync(path.join(seriesDir, `ct-00${i}.dcm`), dicom.encodeUncompressed({
      width: 64, height: 48, pixels: p, instance: i, seriesUid, seriesDesc: 'Chest', modality: 'CT', ww: 200, wl: 90,
    }));
  }
}
