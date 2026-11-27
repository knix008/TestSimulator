// The feature checklist: every feature of the programs MyHexaMaster brings together (UltraEdit, HxD, 010 Editor,
// ImHex, WinHex, Hex Fiend, Okteta, Free Hex Editor Neo, MiTeC Hexadecimal Editor, Hackman Suite), where it is
// implemented and which tests prove it. test/unit/features.test.js checks that every `impl` exists and every test
// named in `tests` exists — a feature without a test, or a test that was renamed away, fails `npm test`.
//
// impl:  cmd:<command id> (src/app.js commands) · core:<method> (crates/hexcore/src/engine.rs) · host:<op>
//        (src/tools/host.js) · tauri:<command> (src-tauri) · file:<path>
// tests: unit:<test title, or part of it> (test/unit) · web:<case name part> (test/e2e/web.suite.mjs) ·
//        desktop:<case name part> (test/e2e/desktop.suite.mjs) · rust:<#[test] fn name> · cmd:<id> (the web suite runs
//        every command once) · tutorial (every tutorial step)

const U = 'UltraEdit';
const HXD = 'HxD';
const E010 = '010 Editor';
const IM = 'ImHex';
const WH = 'WinHex';
const HF = 'Hex Fiend';
const OK = 'Okteta';
const FH = 'Free Hex Editor Neo';
const MI = 'MiTeC';
const HM = 'Hackman';

export const FEATURES = [
  // ── files, disks, memory
  { id: 'open-huge', from: [HXD, HF, E010, WH], name: 'Files of any size open at once (only the visible part is read)', impl: ['cmd:open', 'file:src/hex/document.js', 'core:read'], tests: ['web:Large document: 64 MB', 'desktop:A 200 MB file opens at once'] },
  { id: 'new-file', from: [HXD, E010, FH], name: 'New file, new file of a size and fill', impl: ['cmd:newFile', 'cmd:newSized'], tests: ['cmd:newFile', 'cmd:newSized', 'desktop:A new document saved under a name'] },
  { id: 'save-in-place', from: [HXD, HF, E010], name: 'Save patches changed bytes in place; inserts rewrite through a temporary file', impl: ['cmd:save', 'tauri:hex_save'], tests: ['desktop:Overwrite and save: patched in place', 'desktop:Insert and delete, then save', 'rust:patches_when_nothing_moved'] },
  { id: 'save-variants', from: [HXD, E010], name: 'Save as, save all, save the selection', impl: ['cmd:saveAs', 'cmd:saveAll', 'cmd:saveSelection', 'tauri:hex_save_range'], tests: ['desktop:Save a range, split into pieces'] },
  { id: 'reload', from: [E010, U], name: 'Reload a file changed by another program', impl: ['cmd:reload', 'tauri:hex_reload'], tests: ['desktop:Reload picks up a change'] },
  { id: 'readonly', from: [HXD, WH, E010], name: 'Read-only documents and open read-only', impl: ['cmd:readonly', 'cmd:openReadonly', 'core:setReadonly'], tests: ['cmd:readonly', 'desktop:A disk image opened as a disk: read-only until unlocked'] },
  { id: 'disk-editor', from: [HXD, WH, E010, FH], name: 'Disks, volumes and physical drives: list, open, write back sector by sector after unlocking', impl: ['cmd:openDisk', 'tauri:hex_open_disk', 'tauri:hex_list_disks'], tests: ['desktop:Disks and processes are listed', 'desktop:A disk image opened as a disk'] },
  { id: 'image-as-disk', from: [WH], name: 'Interpret an image file as a disk', impl: ['cmd:openImageAsDisk'], tests: ['desktop:Open image file as disk'] },
  { id: 'save-image', from: [WH, HXD], name: 'Save a disk or process memory as an image file', impl: ['cmd:saveImage'], tests: ['desktop:saved as an image'] },
  { id: 'ram-editor', from: [HXD, WH, E010, FH], name: 'Process memory: list processes, open with unreadable holes, write back', impl: ['cmd:openProcess', 'tauri:hex_open_process', 'tauri:hex_process_regions'], tests: ['desktop:this runner\'s own memory opens read-only with unreadable holes'] },
  { id: 'file-tools', from: [HXD, WH], name: 'Split, concatenate, secure wipe (DoD)', impl: ['cmd:filetools', 'tauri:hex_split', 'tauri:hex_concat', 'tauri:hex_wipe'], tests: ['desktop:split into pieces and join them back, wipe a scratch file'] },
  { id: 'explorer', from: [U, E010], name: 'Explorer panel: places, folders, open documents', impl: ['file:src/panels/explorer.js'], tests: ['web:Panels: explorer left', 'desktop:the explorer lists places', 'rust:places_include_home', 'rust:folders_first_then_names'] },
  { id: 'start-page', from: [IM], name: 'Start page with actions, recent files, samples and tools', impl: ['cmd:startPage', 'file:src/ui/startpage.js'], tests: ['web:Card board: actions, recent', 'web:A sample tile opens the file'] },

  // ── editing
  { id: 'hex-typing', from: [HXD, U, E010, HF, OK], name: 'Typing hex digits, insert and overwrite modes', impl: ['cmd:insertMode', 'file:src/hex/hexview.js'], tests: ['web:Typing hex digits in overwrite and insert mode', 'web:Fast typing (no pause between keys'] },
  { id: 'text-typing', from: [HXD, U, E010], name: 'Typing in the text column in the character set (Korean with an input method)', impl: ['file:src/hex/charsets.js'], tests: ['web:Typing text in the text pane', 'unit:typed characters become bytes'] },
  { id: 'undo', from: [HXD, E010, IM, HF], name: 'Unlimited undo and redo; typing merged into one step', impl: ['cmd:undo', 'cmd:redo'], tests: ['unit:typing merges into one undo step', 'rust:edits_and_undo', 'cmd:undo', 'cmd:redo'] },
  { id: 'history', from: [E010, FH], name: 'Edit history: list of steps, jump to any', impl: ['cmd:history', 'core:history', 'core:gotoHistory'], tests: ['web:Edit history: three edits listed'] },
  { id: 'fill-insert', from: [HXD, E010, WH, FH], name: 'Fill selection and insert bytes (pattern, zeros, random, increasing)', impl: ['cmd:fill', 'cmd:insertBytes', 'core:fill'], tests: ['web:Operations through the form window (XOR), transform to a new tab, fill, extract'] },
  { id: 'select-block', from: [HXD, WH], name: 'Select block by start and length or end; select all', impl: ['cmd:selectBlock', 'cmd:selectAll'], tests: ['web:Select block window', 'cmd:selectAll'] },
  { id: 'clipboard', from: [HXD, E010, U, FH], name: 'Copy as hex, text, C, Python, Base64…; paste hex or text', impl: ['cmd:copy', 'cmd:paste', 'cmd:cut'], tests: ['web:Copy as hex and C, paste hex'] },
  { id: 'bookmarks', from: [HXD, E010, IM, WH, OK], name: 'Bookmarks with colours and names, next and previous', impl: ['cmd:bookmarkToggle', 'cmd:bookmarkNext', 'cmd:bookmarkPrev'], tests: ['web:Bookmarks: add, next, remove', 'cmd:bookmarkNext', 'cmd:bookmarkPrev'] },
  { id: 'goto', from: [HXD, U, E010, WH], name: 'Go to offset (absolute, relative, from the end, hex or decimal)', impl: ['cmd:goto', 'host:goto'], tests: ['web:Go to offset window'] },
  { id: 'text-mode', from: [U, E010], name: 'Text editing mode: line numbers, column selection, wrap, find, applied back as bytes (line endings kept)', impl: ['cmd:textMode', 'cmd:columnMode', 'cmd:textWrap', 'file:src/hex/textmode.js'], tests: ['web:Text mode: the document as text', 'cmd:columnMode', 'cmd:textWrap'] },
  { id: 'split-view', from: [OK, E010], name: 'Split view: the same document in two views', impl: ['cmd:splitView'], tests: ['web:Split view: the same document twice'] },
  { id: 'macros', from: [U], name: 'Keystroke macros: record, play, repeat, save and load', impl: ['cmd:macroRecord', 'cmd:macroPlay', 'cmd:macroRepeat', 'cmd:macroSave', 'cmd:macroLoad', 'file:src/domain/macro.js'], tests: ['web:Keystroke macro', 'unit:recording keeps typed keys', 'unit:saved macros: names are unique'] },
  { id: 'scripts', from: [E010], name: 'Scripts that change the document (Write*, InsertBytes, DeleteBytes, Printf …) as one undo step', impl: ['cmd:script', 'core:script', 'core:applyEdits', 'host:runScript'], tests: ['web:Script window', 'unit:patches, demangling and scripts', 'rust:xor_every_byte', 'rust:writes_are_seen_by_later_reads', 'rust:many_random_edits_match_a_model', 'rust:printf_formatting'] },

  // ── view
  { id: 'view-layout', from: [HXD, E010, OK, U], name: 'Bytes per row, grouping, offset and value bases, start address, columns, colours', impl: ['cmd:showText', 'cmd:showOffsets', 'cmd:byteColors', 'cmd:uppercase'], tests: ['web:View settings: bytes per row', 'unit:offsets and byte values in every base'] },
  { id: 'charsets', from: [HXD, OK, E010, U], name: 'Character sets: ASCII, Latin-1, Windows-1252, CP437, EBCDIC, UTF-8, UTF-16, EUC-KR, Shift_JIS', impl: ['file:src/hex/charsets.js'], tests: ['unit:text column: single-byte sets, UTF-8 across rows, UTF-16, EUC-KR'] },
  { id: 'panels', from: [IM, E010], name: 'Explorer left, properties right, log and information below; toolbar never clipped', impl: ['cmd:leftPanel', 'cmd:rightPanel', 'cmd:bottomPanel'], tests: ['web:Panels: explorer left, properties right'] },
  { id: 'themes-language', from: [IM, U], name: 'Themes, fonts, Korean and English with flags, settings window', impl: ['cmd:theme', 'cmd:language', 'cmd:settings'], tests: ['web:English: menus and panels in English', 'web:Korean and English flags', "web:The user's guide and tutorial windows: Korean and English buttons", 'web:Settings window: every tab draws', 'unit:settings are repaired'] },
  { id: 'print', from: [HXD, U, E010, MI], name: 'Print in an OS window: printer, page setup, preview; print goes straight to the printer; help pages too', impl: ['cmd:print', 'file:src/print/printwin.js'], tests: ['web:The user\'s guide prints through the print window', 'desktop:Print from the guide window and from the main window', 'rust:the_print_window_sends_camel_case_and_copies_default_to_one'] },
  { id: 'animation', from: [], name: 'Start page backgrounds and an animation speed of 0–100', impl: ['cmd:shuffleBackground', 'file:src/ui/background.js'], tests: ['unit:animation speed 0–100'] },

  // ── search
  { id: 'find', from: [HXD, U, E010, IM, WH, HF, OK, FH, MI], name: 'Find: hex with ?? and nibble wildcards, text in 14 encodings, regex, integers, floats; find all; count', impl: ['cmd:find', 'core:search', 'core:findAll'], tests: ['web:Find window: hex with wildcards, find all, replace all', 'unit:search: hex wildcards, text in encodings, numbers', 'rust:hex_with_wildcards', 'rust:text_in_encodings', 'rust:numbers_and_regex', 'cmd:findNext', 'cmd:findPrev'] },
  { id: 'replace', from: [HXD, U, E010, FH], name: 'Replace and replace all (one undo step)', impl: ['cmd:replace', 'core:replaceAll'], tests: ['web:Find window: hex with wildcards, find all, replace all', 'rust:across_chunks_and_replace_all'] },
  { id: 'multi-search', from: [WH], name: 'Several terms at once (text, hex, regex), nearest next, combined results', impl: ['host:findAll', 'file:src/tools/toolwin.js'], tests: ['web:Several terms at once'] },
  { id: 'find-in-files', from: [E010, U], name: 'Find in files and folders (recursive)', impl: ['tauri:hex_find_in_files', 'host:findInFiles'], tests: ['desktop:Find in files searches a folder'] },
  { id: 'replace-in-files', from: [E010, U], name: 'Replace in files and folders, .bak backups', impl: ['tauri:hex_replace_in_files', 'host:replaceInFiles'], tests: ['desktop:Replace in files: a folder and its sub-folder'] },

  // ── properties
  { id: 'inspector', from: [HXD, E010, IM, WH, OK, FH], name: 'Data inspector (34 interpretations) with editing', impl: ['core:inspect', 'core:encodeValue'], tests: ['web:Inspector at the caret, edit a value', 'unit:inspector reads and encodes values', 'rust:reads_values', 'rust:encode_round_trips'] },
  { id: 'structure', from: [E010, IM, OK, WH], name: 'Structure tree from templates, click to select, values edited in place', impl: ['core:template', 'file:src/panels/props.js'], tests: ['web:Structure tree from the PNG template', 'web:Structure tree: a value typed in is written'] },
  { id: 'file-info', from: [IM, WH, MI], name: 'File information and type detection (70 formats)', impl: ['core:detect'], tests: ['web:Checksums, statistics and file information', 'rust:detects_formats'] },
  { id: 'hashes', from: [HXD, E010, IM, WH, MI, FH], name: '36 checksums, CRCs and hashes at once', impl: ['cmd:checksums', 'core:hash'], tests: ['unit:hashes match known values', 'rust:known_vectors'] },
  { id: 'hash-db', from: [WH], name: 'Hash database (known / notable, NSRL lists)', impl: ['file:src/domain/hashdb.js'], tests: ['web:Hash database: a hash added as notable', 'unit:hash lists: md5sum, sha256sum, BSD, NSRL CSV', 'unit:categories, add / remove, storage'] },
  { id: 'statistics', from: [HXD, E010, IM, WH, OK], name: 'Statistics: histogram, entropy graph, randomness tests', impl: ['cmd:statistics', 'core:stats'], tests: ['web:Checksums, statistics and file information', 'unit:firmware sample: strings, carving, entropy', 'rust:entropy_extremes', 'rust:random_looks_random'] },

  // ── templates
  { id: 'templates-builtin', from: [E010, IM, HF, OK, WH], name: '18 built-in templates (PNG, ZIP, ELF, PE, MBR/GPT …) run on open', impl: ['core:templates', 'cmd:runTemplate'], tests: ['unit:every sample opens, is detected, and its template parses', 'rust:every_builtin_parses', 'rust:template_png', 'rust:template_pe', 'rust:template_elf', 'rust:template_zip'] },
  { id: 'template-language', from: [E010, IM], name: 'Template language: structs, unions, enums, bitfields, arrays, functions, parent, sizeof, attributes', impl: ['file:crates/hexcore/src/pattern/parser.rs'], tests: ['rust:fields_arrays_and_values', 'rust:endian_enum_bitfield_placement', 'rust:user_functions_with_locals_and_recursion', 'rust:multi_dimensional_arrays', 'rust:parent_field_access', 'rust:static_sizeof_of_structs', 'rust:errors_keep_nodes'] },
  { id: 'template-editor', from: [E010, IM], name: 'Template editor: write, run, save, load', impl: ['cmd:template', 'host:runTemplate', 'host:saveTemplate'], tests: ['web:Template editor: write a template and run it'] },

  // ── tools
  { id: 'strings', from: [IM, WH, OK, MI], name: 'String extraction (ASCII, UTF-8, UTF-16 LE/BE)', impl: ['cmd:strings', 'core:strings'], tests: ['web:Strings, disassembler, recovery, calculator windows', 'rust:ascii_utf8_utf16'] },
  { id: 'disassembler', from: [IM, HM, E010], name: 'Disassembler: x86 16/32/64, ARM, Thumb, ARM64, MIPS, RISC-V, PowerPC, SuperH, 6502, AVR, MSP430, Z80, 8080', impl: ['cmd:disasm', 'core:disasm', 'core:archs', 'file:src/domain/archs.js'], tests: ['unit:disassembler: the app lists every core architecture', 'web:Strings, disassembler, recovery, calculator windows', 'rust:x86_64_prologue', 'rust:mips32_both_endians', 'rust:riscv_base_and_compressed', 'rust:powerpc', 'rust:z80_basic', 'rust:random_bytes_never_panic_and_cover_the_input'] },
  { id: 'calculator', from: [HXD, IM, HM, WH, E010], name: 'Calculator and base converter (8–64 bits, float, text)', impl: ['cmd:calc', 'core:evaluate'], tests: ['unit:calculator', 'web:Strings, disassembler, recovery, calculator windows', 'rust:expressions'] },
  { id: 'carving', from: [WH], name: 'File recovery by headers (26 formats)', impl: ['cmd:carve', 'core:carve'], tests: ['unit:firmware sample: strings, carving, entropy', 'rust:carves_jpegs_and_png', 'web:Strings, disassembler, recovery, calculator windows'] },
  { id: 'compare', from: [HXD, E010, IM, HF, WH, FH], name: 'Compare: same positions or insertions and deletions (Myers), synchronised scrolling', impl: ['cmd:compare', 'cmd:diffNext', 'cmd:diffPrev', 'core:compare'], tests: ['web:Compare tab: two documents side by side', 'unit:compare finds the differences, also with an insertion', 'rust:sync_finds_insertion', 'cmd:diffNext'] },
  { id: 'file-systems', from: [WH], name: 'Partitions (MBR, GPT) and file systems (FAT, exFAT, NTFS, ext2/3/4, HFS+) with deleted files', impl: ['cmd:filesystem', 'core:fsPartitions', 'core:fsList', 'core:fsRead'], tests: ['web:File systems: partitions, a folder, a deleted file', 'unit:the disk sample: MBR partitions, FAT16 and FAT12 files', 'desktop:File systems of a disk image file on disk', 'rust:fat12_volume', 'rust:ntfs_volume', 'rust:ext4_volume', 'rust:gpt_disk', 'rust:hfs_info_list_read'] },
  { id: 'ntfs-full', from: [WH], name: 'NTFS attribute lists, compression (LZNT1), named streams, encryption marks, initialized size', impl: ['file:crates/hexcore/src/fsys/ntfs.rs'], tests: ['rust:ntfs_attribute_list', 'rust:ntfs_compressed', 'rust:ntfs_alternate_data_streams', 'rust:ntfs_encrypted', 'rust:ntfs_initialized_size', 'rust:lznt1_chunks'] },
  { id: 'hfs-full', from: [WH], name: 'HFS+/HFSX: compressed files (zlib, LZVN, LZFSE), hard links, resource forks', impl: ['file:crates/hexcore/src/fsys/hfs.rs'], tests: ['rust:hfs_compressed', 'rust:hfs_hard_links', 'rust:hfs_lzfse_codec', 'rust:hfs_lzvn_matches_reference_encoder'] },
  { id: 'yara', from: [IM], name: 'YARA rules: strings with modifiers, conditions, pe / elf / macho / dotnet / dex / math / hash / magic / console / time modules', impl: ['cmd:yara', 'core:yara'], tests: ['web:YARA: rules scan the document', 'unit:YARA rules: strings, hex jumps, conditions and errors', 'rust:xor_modifier', 'rust:base64_modifiers', 'rust:pe_module_fields', 'rust:math_and_hash_modules', 'rust:private_strings_private_and_global_rules', 'rust:elf_module', 'rust:macho_module', 'rust:dotnet_module', 'rust:dex_module', 'rust:magic_module', 'rust:pe_import_details_delayed_overlay_pdb_signatures', 'rust:of_rule_sets', 'rust:console_and_time'] },
  { id: 'visualizer', from: [IM], name: 'Bytes as a picture (11 pixel formats, digram, entropy map)', impl: ['cmd:visualizer', 'file:src/domain/visual.js'], tests: ['web:Data visualizer', 'unit:pixel formats: grey, RGB/BGR', 'unit:digram counts byte pairs', 'unit:pixel → byte offset'] },
  { id: 'processor', from: [IM], name: 'Data processor: node graph of inputs, operations, transforms and outputs', impl: ['cmd:processor', 'host:evaluateGraph'], tests: ['web:Data processor: a node graph'] },
  { id: 'patches', from: [FH], name: 'Patch files: IPS, IPS32, UPS, BPS (create and apply) and a difference listing', impl: ['cmd:patch', 'core:patchCreate', 'core:patchApply'], tests: ['web:Patch files: IPS, IPS32, UPS, BPS', 'unit:patches, demangling and scripts', 'rust:round_trip_every_format', 'rust:hand_made_bps_with_copies', 'rust:corrupted_patches_are_errors'] },
  { id: 'demangle', from: [IM], name: 'Symbol demangler: C++ (Itanium, MSVC) and Rust', impl: ['cmd:demangle', 'core:demangle'], tests: ['web:Demangler: Itanium, MSVC and Rust', 'rust:itanium', 'rust:msvc'] },

  // ── data
  { id: 'operations', from: [HXD, E010, WH, OK, FH, HM], name: 'Byte operations: XOR, AND, OR, NOT, arithmetic, shifts, rotations, swaps (8–64 bits)', impl: ['cmd:operations', 'core:operation'], tests: ['unit:operations and transforms (xor, swap, base64, zlib, AES) round trip', 'web:Operations through the form window', 'rust:operations'] },
  { id: 'ciphers', from: [WH, HM, E010, FH], name: 'Encryption: AES, DES, 3DES, Blowfish, Twofish, CAST5, Camellia, TEA, XTEA, RC4, ChaCha20, Salsa20', impl: ['core:transform'], tests: ['unit:new ciphers round trip', 'unit:operations and transforms (xor, swap, base64, zlib, AES) round trip', 'rust:transforms_round_trip'] },
  { id: 'compression-encodings', from: [E010, IM, FH], name: 'zlib, Deflate, gzip; Base64, hex, URL', impl: ['core:transform'], tests: ['unit:operations and transforms (xor, swap, base64, zlib, AES) round trip'] },
  { id: 'export-import', from: [HXD, E010, U, FH, MI], name: 'Export (26 formats, source code in 13 languages, Intel HEX, S-record …) and import', impl: ['cmd:exportMenu', 'cmd:import', 'core:export', 'core:import'], tests: ['unit:export and import round trips', 'web:Import Intel HEX from typed text'] },

  // ── app
  { id: 'tool-windows', from: [IM, E010], name: 'Every dialog and tool in its own OS window', impl: ['file:src/tools/toolwin.js'], tests: ['desktop:A tool window opens as an OS window'] },
  { id: 'progress', from: [HXD, WH], name: 'Progress popups for big files and long work, cancellable', impl: ['file:src/core/core-worker.js'], tests: ['desktop:search and hash run in the backend with progress'] },
  { id: 'tutorial', from: [IM], name: 'Tutorial in the app and as a document; user\'s guide in Korean and English with pictures', impl: ['cmd:tutorial', 'cmd:userGuide', 'file:doc/UsersGuide.md', 'file:doc/UsersGuide.en.md'], tests: ['tutorial', 'unit:help pages: guide and tutorial'] },
  { id: 'commands', from: [], name: 'Every command runs without an error', impl: ['file:src/app.js'], tests: ['web:Commands'] },
];
