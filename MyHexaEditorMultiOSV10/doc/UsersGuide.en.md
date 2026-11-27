# MyHexaMaster User's Guide

MyHexaMaster is a hex editor for viewing and editing files, disks and process memory byte by byte. It brings together the features of UltraEdit, HxD, 010 Editor, ImHex, WinHex, Hex Fiend, Okteta, Free Hex Editor Neo, MiTeC and Hackman in one program. It runs with the same screen as a desktop program (Tauri) on Windows, macOS and Linux and in a web browser, and all byte handling is done by a Rust core.

## 1. Screen layout

| Part | Contents |
| --- | --- |
| Menu bar | File, Edit, Search, View, Data, Tools, Help. Panel buttons and window buttons on the right |
| Toolbar | File, undo, clipboard, edit mode, fill, byte operations, read-only, find, go to, bookmarks, **Tools** (Strings, Disassembler, Calculator, Recovery, Disks and memory, Compare, Template, Edit history, File tools), checksums, text view |
| Left panel | **Explorer**: favorites, home folder, drives, open documents |
| Center | Document tabs. Hex view below the tab bar (source, size, format, INS/OVR, character set, bytes per row, number base, byte order) |
| Right panel | **Properties**: Data inspector, Structure (template), File information, Checksums and hashes, Statistics and entropy, Bookmarks |
| Bottom panel | **Log** and **Information** |
| Status bar | Cursor offset (hex and decimal), selection size, byte value at the cursor, file size, INS/OVR, character set, theme, language |

Every dialog and tool opens in its own movable window (on the web, a window inside the page).

## 2. Opening and saving files

- **Open** (Ctrl+O): there is no size limit. Only the visible part is read, not the whole file, so even multi-GB files open instantly. You can also double-click a file in the Explorer or drag it onto the window.
- **New file** (Ctrl+N), **New file with size**: a document filled with zeros, a pattern, random bytes or an increasing sequence.
- **Open read-only**, **Open disk**, **Open process memory** (desktop).
- **Save** (Ctrl+S): if no byte positions have moved, only the changed parts are written in place (fast even for large files). If there are insertions or deletions, the file is written to a temporary file and then swapped in.
- **Save as** (Ctrl+Shift+S), **Save all**, **Save selection as…**, **Reload from disk**.
- On the web, Chrome and Edge save back to the same file through the File System Access API; other browsers save by downloading.
- For each file, the last cursor position, bookmarks and template are remembered.

## 3. Hex view and editing

- From left to right: the offset, byte and text columns. Bytes are colored by kind (00, printable characters, control characters, 80–FF, FF), and changed bytes are shown in red.
- The row and column with the cursor are highlighted, and the column header also marks the cursor column.
- **Typing**: in the hex column, typing hex digits changes the high nibble, then the low nibble. Press **Tab** to move to the text column; characters you type there become bytes in the current character set (input method editors work too).
- The **Insert** key switches between **Insert mode / Overwrite**. Disks and process memory have a fixed size, so only Overwrite is available.
- **Backspace / Delete**: delete the selection or a byte.
- **Selecting**: drag, Shift+arrow keys, **Select block** (Ctrl+B: start and length/end), **Select all** (Ctrl+A). Double-clicking in the hex column selects one group; in the text column it selects a word.
- **Fill** (Ctrl+E), **Insert bytes** (Ctrl+I): pattern (hex), zeros, random, or an increasing sequence (start, step, unit size).
- **Undo / Redo** (Ctrl+Z / Ctrl+Y) have no step limit, and bytes typed in a row are grouped into one step. In the **Edit history** window you can jump straight to any step.
- A **Read-only** (Ctrl+R) document cannot be changed.
- **View and edit as text** (Ctrl+M): opens the document as text in the current character set; edit it and choose "Apply as bytes" to make it a single edit step (up to 32 MB).

### View settings (View menu, chips on the tab bar)

- Bytes per row: 4, 8, 12, 16, 20, 24, 32, 48, 64, or fit to window width
- Grouping: 1, 2, 4, 8 or 16 bytes
- Offset base: hex, decimal, octal; value display: hex, decimal, octal, binary; uppercase, 0x before offsets, display start address
- Character set: ASCII, Latin-1, Windows-1252, CP437, EBCDIC, UTF-8, UTF-16 LE/BE, EUC-KR, Shift_JIS
- Text column, offset column, column header, byte colors, changed-byte highlight, cursor row/column highlight, hex font and size (Ctrl+= / Ctrl+-)

## 4. Clipboard

- **Copy** (Ctrl+C) copies in the format set in the settings (default: hex). **Copy as**: hex, spaced hex, text, C array, Python bytes, Base64, escaped (\x4D).
- **Paste** (Ctrl+V): in automatic mode, hex text is pasted as bytes and anything else as text. There are also **Paste as hex / Paste as text** (Ctrl+Shift+V). In Insert mode the data is inserted; in Overwrite mode it overwrites.
- **Cut** (Ctrl+X).

## 5. Find, replace, go to, bookmarks

- **Find and replace** (Ctrl+F, Ctrl+H) window:
  - Hex: wildcards such as `??` (one byte) and `4?` or `?F` (one nibble), as in `4D 5A ?? 00`
  - Text: 14 encodings, optional case sensitivity
  - Regular expression: byte regular expressions (`\x50\x4B\x03\x04`, `[\x00-\x1F]+`)
  - Integer (1, 2, 3, 4 or 8 bytes, signed, byte order), floating point (4 or 8 bytes)
  - Scope (whole file / selection only), search backward from the end
  - Next, previous, **Find all** (results list and marks in the hex view), count, replace, **Replace all** (undone in one step)
- **Find next / previous**: F3 / Shift+F3.
- **Go to offset** (Ctrl+G): from the start, forward, backward, from the end; hex or decimal; select from the cursor. A value with `0x` or `h` is read as hex.
- **Bookmarks**: Ctrl+D adds one at the cursor or selection, and F2 / Shift+F2 move between them. In the Bookmarks tab of the right panel you can change their color and name or delete them.

## 6. Properties (right panel)

- **Data inspector**: reads the bytes at the cursor as int8 to int64 (signed/unsigned), int24, float16/32/64, binary, octal, characters (Latin-1, UTF-8, UTF-16), ULEB128, SLEB128, DOS date and time, FILETIME, time_t (32 and 64), OLE date, GUID, IPv4, IPv6, RGB565, RGB, RGBA, and true/false. Switch the byte order with LE/BE, and **double-click** a value to type a new value and write it in place.
- **Structure (template)**: shows the structure found by the template as a tree. Clicking an item selects its bytes, and items with a color are also painted in the hex view.
- **File information**: name, path, source, size, file type and details (image size, executable type …), MIME type, modified, read-only, undo steps, cursor and selection.
- **Checksums and hashes**: computes the chosen algorithms at once for the selection (or the whole file if nothing is selected). Click a value to copy it.
  - Checksums: Checksum-8/16/32/64, XOR-8
  - CRC and similar: CRC-8, CRC-16 (ARC, CCITT-FALSE, XMODEM, MODBUS), CRC-32, CRC-32C, CRC-32 BZIP2, CRC-64 (ECMA, XZ), Adler-32, Fletcher-16/32
  - Hashes: MD2, MD4, MD5, SHA-1, SHA-224/256/384/512, SHA-512/256, SHA3-224/256/384/512, Keccak-256, RIPEMD-160, BLAKE2b-512, BLAKE2s-256, BLAKE3
- **Statistics and entropy**: byte distribution (square-root scale), per-block entropy graph (click to go to that block), entropy, distinct values, ratios of 00, printable, control and 80–FF bytes, mean, median, chi-square, Monte Carlo π, serial correlation, most common values. Compressed or encrypted areas have an entropy close to 8.
- **Bookmarks**: list, color, name, go to, delete.

## 7. Templates

When a file is opened, its format is detected and the matching template runs automatically (you can turn this off in the settings). Built-in templates: PNG, BMP, GIF, JPEG, ZIP (including DOCX, XLSX, JAR, APK), GZIP, WAVE, ELF, PE (EXE, DLL), MBR/GPT, ICO, TAR, Java class, SQLite, Mach-O, MP3 (ID3), WebAssembly, raw data.

In the **Template editor** (Ctrl+T) you can write and run templates yourself, "Save as my template", or save and load them as files (.hexpat).

### Template language (010 Editor / ImHex style)

- Comments `// …`, `/* … */`. Byte order: `#pragma endian big`, `endian little;`, or per field `be u32` / `le u16` (default little)
- Types: `u8 u16 u24 u32 u48 u64`, `s8…s64` (`i8…`), `float` (f32) `double` (f64) `f16` `bool` `char` `wchar` `uleb128` `sleb128`. C and 010 names work too: `uchar byte ushort short uint int ulong long uint64 int64 DWORD WORD BYTE unsigned char …`
- `struct 이름 { 필드; … } [[color("blue")]];`, `union` (all fields at the same position), `enum 이름 : u8 { A = 1, B };`, `bitfield F { a : 1; b : 3; };`, `using Word = u16;`, `typedef u32 DWORD;`
- Fields (type, name, expression, condition, offset): `형 이름;`, arrays `형 이름[식];`, `형 이름[while(조건)];`, `char s[];` (characters up to a 0), `형 이름 @ 오프셋;` (the cursor does not move). char/wchar arrays are shown as text; a u8 array is a single node
- Statements: `if/else`, `while`, `for (let i = 0; i < n; i++)`, `let x = 식;`, `x += 1;`, `break`, `continue`, `return`
- Expressions: `12 0x1F 0b101 0o17 1.5 'A' "글자"`, `+ - * / % & | ^ ~ << >> && || ! == != < <= > >= ?:`, `a.b`, `a[i]`, `$` (current offset), `Enum::값` (enum value)
- Functions: `sizeof addressof endof size() eof() pos() seek(o) skip(n)`, `ReadU8…ReadU64 / ReadS8…S64 / ReadFloat / ReadDouble(o)`, `ReadU32BE/LE`, `ReadString(o, n)`, `find(o, "FF D9")`, `ParseInt(글자, 진법)` (text, base), `strlen min max abs str hex`, `Warning()`, `Error()`
- Attributes: `[[color("#rrggbb"|"red"|0xRRGGBB), comment("…"), name(식), hidden]]` or `<bgcolor=0xRRGGBB, comment="…">`
- Errors are shown with the line and column, and the nodes built up to that point are kept.

Example:

    struct Header {
        char magic[4] [[color("#e5484d")]];
        be u32 length;
        u8 data[length] [[comment("payload")]];
    };
    Header header;

## 8. Tools (toolbar)

| Tool | What it does |
| --- | --- |
| Find and replace | Section 5 |
| Go to offset | Section 5 |
| Strings (Ctrl+Shift+T) | ASCII, UTF-8, UTF-16 LE/BE strings, minimum length, filter, copy all. Click a row to go there |
| Disassembler (Ctrl+Shift+D) | x86 16, 32 and 64-bit (Intel, NASM, MASM, AT&T syntax), ARM 32, Thumb, ARM64. Starts at the cursor or selection, set address, follow cursor, load more, copy |
| Calculator and converter | Evaluates expressions (arithmetic, `%`, `**`, bitwise AND, OR, XOR, NOT, `<<`, `>>`, `0x 0b 0o 'A'`, abs, min, max) at 8, 16, 32 or 64 bits and shows hex, decimal, octal, binary, signed, float32/64 and text. Get the value at the cursor, write to the cursor |
| File recovery (carving) (Ctrl+Shift+F) | Finds files inside disk images and memory dumps by their headers (PNG, JPEG, GIF, BMP, TIFF, WebP, PSD, PDF, ZIP, GZIP, BZIP2, XZ, 7z, RAR, CAB, ELF, PE, Java class, SQLite, MP3, WAV, AVI, MP4, MKV, OGG, FLAC). The length comes from the format structure or an end marker. Go to, open in a new tab, save to file, save all |
| Disks and memory (desktop) | Drives, volumes and physical disks (read-only, administrator rights may be needed), and the memory of running processes (unreadable areas show `??`; saving writes the changed bytes into the process). On macOS, other processes' memory cannot be opened |
| Compare files (Ctrl+K) | Places two documents side by side and paints the bytes that differ. "Same positions" or "Find insertions and deletions" (up to 4 MB). F8 / Shift+F8 go to the next and previous difference, and scrolling is synchronized |
| Template editor (Ctrl+T) | Section 7 |
| Edit history | List of undo steps. Click one to go back to that step |
| File tools (split, join, wipe) | Split (equal-size pieces .001 …), join (several files in order), wipe (overwrite 1, 3 or 7 times with zeros, random data or the DoD method, then delete; desktop) |

## 9. Data menu

- **Byte operations** (selection or whole file): XOR, AND, OR, NOT, add, subtract, multiply, divide, remainder, negate, shift, rotate, fill with value, reverse order, reverse bit order, swap nibbles. Choose the unit size (8, 16, 32 or 64 bits) and byte order. The operand can be decimal, hex with `0x`, hex containing letters (`FF`), or a repeating pattern such as `DE AD`.
- **Swap byte order**: 16, 32 or 64 bits.
- **Encrypt and decrypt**: repeating-key XOR, ROT13, AES (128, 192, 256; ECB, CBC, CTR; PKCS#7), DES, 3DES (ECB, CBC), RC4. Key and IV as hex or text.
- **Compress and decompress**: zlib, Deflate, gzip (level 0–10).
- **Encoding**: Base64, hex text, URL.
- The result is put in place or opened in a new tab. Every operation is undone in one step.
- **Compute checksums and hashes** (Ctrl+Shift+K), **Statistics and entropy**, **Selection to new tab**.

## 10. Export, import, print

- **Export**: hex dump, hex text, C, C++, C#, Java, JavaScript, Python, Rust, Go, Pascal, Visual Basic, assembly (db), Base64, Base32, Ascii85, UUencode, Intel HEX, Motorola S-record, HTML, RTF, Markdown table, JSON, escaped string, binary. If there is a selection, only the selection is exported. You can also send the output straight to the clipboard.
- **Import**: hex text, hex dump, Base64, Base32, Ascii85, UUencode, Intel HEX, S-record (checksums verified, start address shown), source code arrays, JSON, escaped strings — from the clipboard, a file or typed input, into a new tab or at the cursor.
- **Print** (Ctrl+P): prints a hex dump of the selection (or the whole file if nothing is selected). In the print window you choose the printer, paper, orientation, margins and range, preview, then print. A PDF printer saves a PDF file.

## 11. Settings

| Tab | Contents |
| --- | --- |
| General | Language, restore session, open read-only, remember cursor, clock |
| Hex view | Bytes per row, grouping, number base, character set, font, size and line height, start address, columns and colors |
| Editing | Input mode, byte order, copy format, paste, undo steps, run template on open |
| Tools | Number of find results, minimum string length, disassembler architecture and syntax, entropy graph blocks, compare method |
| Theme, fonts, start screen, background, recent files, shortcuts | Program appearance and start screen |

## 12. Keyboard shortcuts

| Key | Action |
| --- | --- |
| Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S / Ctrl+W | New file / Open / Save / Save as / Close |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+X / C / V, Ctrl+Shift+C / V | Cut / Copy / Paste, as text |
| Ctrl+A / Ctrl+B | Select all / Select block |
| Ctrl+F / Ctrl+H / F3 / Shift+F3 | Find / Replace / Next / Previous |
| Ctrl+G / Ctrl+D / F2 / Shift+F2 | Go to offset / Bookmark / Next / Previous bookmark |
| Insert / Tab | Insert mode or Overwrite / Hex column ↔ text column |
| Ctrl+E / Ctrl+I / Ctrl+R / Ctrl+M | Fill / Insert / Read-only / Text view |
| Ctrl+K / F8 / Shift+F8 | Compare / Next / Previous difference |
| Ctrl+T / Ctrl+Shift+D / Ctrl+Shift+T / Ctrl+Shift+F / Ctrl+Shift+K | Template / Disassembler / Strings / Recovery / Checksums |
| Ctrl+P / Ctrl+Shift+P | Print / Command palette |
| Ctrl+= / Ctrl+- / Ctrl+0 | Hex text larger / smaller / default |
| Ctrl+Shift+1 / 2, Ctrl+J | Left / right / bottom panel |
| F1 / Shift+F1 / F11 | Information / Tutorial / Full screen |

## 13. Installing and development

    npm run setup     # 또는 npm install — 필요한 것을 설치하고 준비(git에는 들어가지 않음)
    npm start         # 데스크톱 개발 실행
    npm run dev       # 웹 개발 서버
    npm test          # 시험
    npm run build:win # 설치 프로그램 (build:mac, build:linux, build:all)

Requirements: Node 22+, Rust (rustup). Linux needs the WebKitGTK development packages (`npm run setup` shows the command).
