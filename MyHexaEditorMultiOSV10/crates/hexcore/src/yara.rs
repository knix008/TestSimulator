//! YARA rules over a document.
//!
//! CONTRACT
//! `scan(src, {rules: "rule text", offset?, length?, limit: 10000, now?}, progress)` →
//!   `{ matches: [{ rule, tags: [..], meta: {k: v}, strings: [{ id: "$a", offset, length, data: "hex of first 32 bytes", xor?: key }] }],
//!      rules: <count compiled>, errors: [{ line, col, message }], truncated,
//!      log: [console.log / console.hex lines, in evaluation order] }`
//!   `now` (seconds since 1970) sets time.now(); without it the desktop build uses the clock and the WebAssembly build
//!   leaves time.now() undefined. Progress is reported while searching and again for every math / hash range read
//!   during evaluation (each such range counts from 0 to its length); cancelling stops both.
//! `check(args{rules})` → `{ rules, errors }` (compile only).
//!
//! THE SUBSET (YARA 4 syntax). Anything outside it is a compile error with its line and column, never silently ignored.
//!   modules: `import "pe" | "elf" | "macho" | "dotnet" | "dex" | "magic" | "math" | "hash" | "console" | "time"`
//!     (anywhere in the text). Other modules (cuckoo, …) and `include` are errors; using a module without its import is
//!     an error, as is an unknown member (`pe.foo`) or name. Module arrays may nest (pe.import_details[i].functions[j],
//!     macho.file[i].segments[j].sections[k]) and may hold plain values (dotnet.user_strings[i]).
//!   rules: `[private] [global] rule name : tag1 tag2 { meta: … strings: … condition: … }`. private: evaluated and usable by
//!     other rules, not reported. global: while it is false, no rule of the text matches.
//!   meta values: "text", numbers (also negative), true / false.
//!   strings (several anonymous `$ = …` allowed):
//!     text `$a = "text"` (escapes \n \t \r \\ \" \xHH) with ascii, wide, nocase, fullword, private and
//!       xor (keys 0x00-0xFF, so the plain text too) / xor(0x10) / xor(0x01-0x7F): applied after wide, as YARA does (the
//!       zero bytes of wide text become the key); not with nocase. Matches report the key (`xor`).
//!       base64 / base64wide / base64("64-character alphabet") (same for base64wide): the three encodings of the text at
//!       the three byte alignments, without the leading / trailing characters that depend on neighbouring bytes (YARA's
//!       way). With wide the wide text is encoded; base64wide looks for the encoding as wide text; both may be given.
//!       Not with nocase, xor or fullword.
//!     hex `$b = { 4D 5A ?? 4? ?F [2] [2-4] [4-] ( 90 | 91 92 ) }` with private.
//!     regex `$c = /regex/is` (byte regex, flags i s) with nocase, ascii, wide (every atom followed by 00), fullword, private.
//!     private strings work in conditions but are left out of the reported `strings`.
//!   condition: and or not ( ), defined, true false, numbers (12, 0x1F, 0o17, 10KB, 2MB, 7.5), "text" (escapes as above),
//!     + - * \ % & | ^ ~ << >>, == != < <= > >= (numbers with numbers, texts with texts),
//!     contains icontains startswith istartswith endswith iendswith iequals, `matches /regex/is`,
//!     $a (found), #a (count), @a / @a[i] (offset of the i-th, 1-based), !a / !a[i] (length), $a at expr, $a in (lo..hi),
//!     #a in (lo..hi), any / all / none / N / N% of them | ($a, $b*) | (rule1, rule_prefix*) (rule sets),
//!     for <quantifier> of <string set> : ( … $ … ), for <quantifier> i in (lo..hi) | (a, b, c) : ( … i … ),
//!     for <quantifier> x in <module array> : ( … x.field … ) (also nested: for any f in imp.functions : …),
//!     for <quantifier> k, v in <module dictionary> : ( … ),
//!     filesize, entrypoint (PE / ELF entry point as a file offset, else 0), uint8 uint16 uint32 int8 int16 int32
//!     (+ be variants) (offset), and other rules by name.
//!   pe (from the scanned data when it starts with MZ and e_lfanew points at PE\0\0): is_pe (0 when not PE), machine,
//!     number_of_sections, timestamp, entry_point (file offset), entry_point_raw (RVA), characteristics, subsystem,
//!     image_base, size_of_image, size_of_headers, checksum, dll_characteristics, file_alignment, section_alignment,
//!     dll_name, number_of_imports (DLLs), number_of_imported_functions, number_of_exports,
//!     sections[i].name / virtual_address / virtual_size / raw_data_offset / raw_data_size / characteristics,
//!     rich_signature.offset / length / key / raw_data / clear_data, rich_signature.version(v[, toolid]) /
//!     toolid(t[, version]) (sum of the counts of the matching entries), number_of_resources, resource_timestamp,
//!     resource_version.major / minor, resources[i].type / id / language (numbers; undefined for a named level) /
//!     type_string / name_string / language_string (the raw UTF-16LE name) / rva / offset / length,
//!     version_info["CompanyName"] (dictionary of the first version resource, UTF-8), number_of_version_infos,
//!     version_info_list[i].key / value, import_details[i].library_name / number_of_functions / functions[j].name /
//!     ordinal / rva, number_of_delayed_imports, number_of_delayed_imported_functions, delayed_import_details[i]
//!     (likewise), overlay.offset / size (after the end of the last section's raw data; 0 / 0 without overlay),
//!     pdb_path (CodeView RSDS / NB10), number_of_signatures and signatures[i].issuer / subject (OpenSSL one-line form
//!     "/C=US/O=…/CN=…") / serial ("01:ab:…") / version / algorithm / algorithm_oid / not_before / not_after (seconds
//!     since 1970) / thumbprint (SHA-1 of the certificate) / number_of_certificates: one element per certificate of
//!     the PKCS#7 SignedData blobs (WIN_CERTIFICATE type 2) in the certificate table, as YARA 4.0 had it; nothing is
//!     verified and signer infos are not read (no valid_on(), no countersignatures),
//!     imphash() (pefile's rules; ordinal names only for the WinSock 1.1 ordinals of ws2_32 / wsock32 and oleaut32
//!     2-12, other ordinals give "ordN"), imports("dll") (functions imported from it), imports("dll", "function" |
//!     ordinal), imports(/dll/, /function/) (either may be a regex; with a regex: the number of matching functions),
//!     imports(pe.IMPORT_STANDARD | IMPORT_DELAYED | IMPORT_ANY, dll[, function]), delayed_imports(dll[, function]),
//!     exports("name" | ordinal | /regex/), section_index("name" | rva), rva_to_offset(rva)
//!     (YARA's mapping: the raw offset rounded down to min(FileAlignment, 0x200), only inside raw data), is_dll(),
//!     is_32bit(), is_64bit() (DLL and function names compared without case), and the constants MACHINE_* (UNKNOWN I386
//!     AMD64 ARM ARMNT ARM64 IA64), RELOCS_STRIPPED EXECUTABLE_IMAGE LARGE_ADDRESS_AWARE MACHINE_32BIT DEBUG_STRIPPED
//!     SYSTEM DLL, SUBSYSTEM_* (UNKNOWN NATIVE WINDOWS_GUI WINDOWS_CUI EFI_APPLICATION), SECTION_* (CNT_CODE
//!     CNT_INITIALIZED_DATA CNT_UNINITIALIZED_DATA MEM_DISCARDABLE MEM_SHARED MEM_EXECUTE MEM_READ MEM_WRITE),
//!     DYNAMIC_BASE NX_COMPAT GUARD_CF, RESOURCE_TYPE_* (CURSOR BITMAP ICON MENU DIALOG STRING FONTDIR FONT ACCELERATOR
//!     RCDATA MESSAGETABLE GROUP_CURSOR GROUP_ICON VERSION DLGINCLUDE PLUGPLAY VXD ANICURSOR ANIICON HTML MANIFEST).
//!   elf (32 / 64-bit, either byte order; everything undefined when not ELF): type, machine, entry_point (file offset,
//!     through a PT_LOAD segment or a section), number_of_sections, number_of_segments, sh_offset, sh_entry_size,
//!     ph_offset, ph_entry_size, sections[i].name / type / flags / address / size / offset, segments[i].type / flags /
//!     offset / virtual_address / physical_address / file_size / memory_size / alignment, dynamic_section_entries
//!     (up to and including DT_NULL), dynamic[i].type / val, symtab_entries, symtab[i].name / value / size / type / bind /
//!     shndx / other, dynsym_entries, dynsym[i] likewise, and the constants ET_* EM_* SHT_* SHF_* PT_* PF_* DT_* STT_* STB_*.
//!   macho (32 / 64-bit, either byte order, and fat binaries): fat_magic, nfat_arch, fat_arch[i].cputype / cpusubtype /
//!     offset / size / align, and for a single file (or file[i] of a fat binary, offsets relative to its slice):
//!     magic, cputype, cpusubtype, filetype, ncmds, sizeofcmds, flags, reserved, number_of_segments, entry_point (LC_MAIN
//!     entryoff, or the LC_UNIXTHREAD pc of x86 / x86_64 / ARM / ARM64 / PowerPC through the segments), stack_size,
//!     segments[i].segname / vmaddr / vmsize / fileoff / fsize (also filesize) / maxprot / initprot / nsects / flags,
//!     segments[i].sections[j].sectname / segname / addr / size / offset / align / reloff / nreloc / flags,
//!     dylibs[i].name / timestamp / current_version / compatibility_version ("x.y.z"), rpaths[i], entitlements[i] (the
//!     keys of the code signature's entitlements plist), has_dylib(path), has_rpath(path), has_entitlement(name)
//!     (any file of a fat binary), file_index_for_arch(cputype[, subtype]), entry_point_for_arch(cputype[, subtype])
//!     (absolute offset), and the constants MH_* (magics, file types, flags) FAT_* CPU_TYPE_* CPU_SUBTYPE_* SG_* S_*.
//!     A CAFEBABE header with more than 32 architectures is taken for a Java class file, not Mach-O.
//!   dotnet (from the PE's CLI header; is_dotnet 0 otherwise): is_dotnet, version, module_name, number_of_streams,
//!     streams[i].name / offset (file offset) / size, number_of_guids, guids[i], number_of_user_strings,
//!     user_strings[i] (raw UTF-16LE), number_of_resources, resources[i].offset / length / name (resources in this file),
//!     assembly.name / culture / version.major / minor / build_number / revision_number, number_of_assembly_refs,
//!     assembly_refs[i] (the same fields), number_of_modulerefs, modulerefs[i], typelib (the GuidAttribute value).
//!     Not: classes, methods, constants, field offsets.
//!   dex (little-endian DEX): header.magic / checksum / signature / file_size / header_size / endian_tag / link_size /
//!     link_offset / map_offset / {string,type,proto,field,method}_ids_{size,offset} / class_defs_size / _offset /
//!     data_size / data_offset, number_of_strings / types / fields / methods / classes, string_ids[i].offset / size /
//!     value, type_ids[i].descriptor_idx, field_ids[i].class_idx / type_idx / name_idx, method_ids[i].class_idx /
//!     proto_idx / name_idx, methods[i].name / class_name (from the method ids; class data is not decoded),
//!     class_defs[i].class_idx / access_flags / super_class_idx / interfaces_offset / source_file_idx /
//!     annotations_offset / class_data_offset / static_values_offset, has_method([class,] name), has_class(class),
//!     DEX_FILE_MAGIC_035…039, ENDIAN_CONSTANT, REVERSE_ENDIAN_CONSTANT, NO_INDEX, ACC_*.
//!   magic: type() (this crate's file type name, with its details) and mime_type(), not libmagic's texts.
//!   math: entropy, mean, serial_correlation, monte_carlo_pi (offset, size) | ("text"); deviation(offset, size, mean) |
//!     ("text", mean); count(byte[, offset, size]), percentage(byte[, offset, size]), mode([offset, size]) (no range:
//!     the whole data); in_range(x, lo, hi), to_number(bool), abs, min, max, to_string(n[, 8 | 10 | 16]), MEAN_BYTES.
//!   hash: md5 sha1 sha256 (offset, size) | ("text") → lower-case hex text; crc32 → number.
//!   console: log("text"[, number | text]), hex(number) | hex("text", number) → true, appending a line to `log`.
//!   time: now().
//!   Undefined values (a field of another file type, @a[9] past the last match, uint32 past the end, a range outside
//!     the data, division by zero) make the expression undefined: comparisons and arithmetic on it are undefined, `not`
//!     of it is undefined, and undefined counts as false in and / or / of / for and as a rule's result.
//!   Matches are searched in chunks (overlap: the longest literal string, 64 KiB for jumps and regular expressions);
//!   matches of one string do not overlap. A rule with an error is skipped; the others still run.
//!   Not supported: other modules (cuckoo, …), functions on array elements (pe.signatures[i].valid_on), and the module
//!   fields not listed above.
use crate::doc::Bytes;
use crate::util::{hex_string, range_of, Args, Progress, CANCELLED};
use regex::bytes::{Regex, RegexBuilder};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

#[path = "yara_pe.rs"]
mod pe_module;
#[path = "yara_elf.rs"]
mod elf_module;
#[path = "yara_math.rs"]
mod math_module;
#[path = "yara_macho.rs"]
mod macho_module;
#[path = "yara_dotnet.rs"]
mod dotnet_module;
#[path = "yara_dex.rs"]
mod dex_module;
#[path = "yara_der.rs"]
mod der;
use elf_module::Elf;
use math_module::Stats;
use pe_module::Pe;

// ───────────── tokens

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Ident(String),
    /// $name, $ (anonymous), $name* (prefix set)
    Str(String),
    Count(String),
    At(String),
    Len(String),
    Num(i64),
    Float(f64),
    Text(String),
    Hex(String),
    Regex(String, String),
    Punct(&'static str),
    Eof,
}

#[derive(Clone, Debug)]
struct Token {
    tok: Tok,
    line: usize,
    col: usize,
}

#[derive(Debug, Clone)]
pub struct YaraError {
    pub line: usize,
    pub col: usize,
    pub message: String,
}

fn err<T>(t: &Token, message: impl Into<String>) -> Result<T, YaraError> {
    Err(YaraError { line: t.line, col: t.col, message: message.into() })
}

fn lex(text: &str) -> (Vec<Token>, Vec<YaraError>) {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut errors = Vec::new();
    let (mut i, mut line, mut col) = (0usize, 1usize, 1usize);
    // After `=` in a strings section a `{` starts a hex string and a `/` a regular expression (also after `matches`).
    let mut after_assign = false;
    // After `(` or `,` a `/` starts a regular expression (a function argument such as pe.imports(/kernel32/i)).
    let mut regex_ok = false;
    macro_rules! adv {
        () => {{
            if chars[i] == '\n' {
                line += 1;
                col = 1;
            } else {
                col += 1;
            }
            i += 1;
        }};
    }
    while i < chars.len() {
        let c = chars[i];
        let (l, co) = (line, col);
        if c.is_whitespace() {
            adv!();
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                adv!();
            }
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            adv!();
            adv!();
            while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                adv!();
            }
            if i < chars.len() {
                adv!();
                adv!();
            }
            continue;
        }
        let push = |out: &mut Vec<Token>, tok: Tok| out.push(Token { tok, line: l, col: co });
        if after_assign && c == '{' {
            adv!();
            let mut body = String::new();
            while i < chars.len() && chars[i] != '}' {
                body.push(chars[i]);
                adv!();
            }
            if i < chars.len() {
                adv!();
            } else {
                errors.push(YaraError { line: l, col: co, message: "unterminated hex string".into() });
            }
            push(&mut out, Tok::Hex(body));
            after_assign = false;
            continue;
        }
        if (after_assign || regex_ok) && c == '/' {
            regex_ok = false;
            adv!();
            let mut body = String::new();
            while i < chars.len() && chars[i] != '/' {
                if chars[i] == '\\' && i + 1 < chars.len() {
                    body.push('\\');
                    adv!();
                }
                body.push(chars[i]);
                adv!();
            }
            if i < chars.len() {
                adv!();
            } else {
                errors.push(YaraError { line: l, col: co, message: "unterminated regular expression".into() });
            }
            let mut flags = String::new();
            while i < chars.len() && (chars[i] == 'i' || chars[i] == 's') {
                flags.push(chars[i]);
                adv!();
            }
            push(&mut out, Tok::Regex(body, flags));
            after_assign = false;
            continue;
        }
        after_assign = false;
        regex_ok = false;
        if c == '"' {
            adv!();
            let mut s = String::new();
            while i < chars.len() && chars[i] != '"' {
                if chars[i] == '\\' && i + 1 < chars.len() {
                    adv!();
                    match chars[i] {
                        'n' => s.push('\n'),
                        't' => s.push('\t'),
                        'r' => s.push('\r'),
                        'x' => {
                            let h: String = chars[i + 1..(i + 3).min(chars.len())].iter().collect();
                            match u8::from_str_radix(&h, 16) {
                                Ok(v) => {
                                    // Keep raw bytes: private-use characters carry them (decoded in `text_bytes`).
                                    s.push(char::from_u32(0xF0000 + v as u32).unwrap());
                                    adv!();
                                    adv!();
                                }
                                Err(_) => errors.push(YaraError { line, col, message: "bad \\x escape".into() }),
                            }
                        }
                        '"' | '\\' => s.push(chars[i]),
                        other => errors.push(YaraError { line, col, message: format!("illegal escape sequence \\{other} (use \\n \\t \\r \\\\ \\\" or \\xHH)") }),
                    }
                    adv!();
                    continue;
                }
                s.push(chars[i]);
                adv!();
            }
            if i < chars.len() {
                adv!();
            } else {
                errors.push(YaraError { line: l, col: co, message: "unterminated string".into() });
            }
            push(&mut out, Tok::Text(s));
            continue;
        }
        if c.is_ascii_digit() {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric()) {
                adv!();
            }
            let word: String = chars[start..i].iter().collect::<String>().to_ascii_lowercase();
            if word.bytes().all(|b| b.is_ascii_digit()) && chars.get(i) == Some(&'.') && chars.get(i + 1).is_some_and(|d| d.is_ascii_digit()) {
                adv!();
                while i < chars.len() && chars[i].is_ascii_digit() {
                    adv!();
                }
                let text: String = chars[start..i].iter().collect();
                match text.parse::<f64>() {
                    Ok(f) => push(&mut out, Tok::Float(f)),
                    Err(_) => errors.push(YaraError { line: l, col: co, message: format!("not a number: {text}") }),
                }
                continue;
            }
            let (digits, mult) = if let Some(d) = word.strip_suffix("kb") { (d.to_string(), 1024) } else if let Some(d) = word.strip_suffix("mb") { (d.to_string(), 1 << 20) } else { (word.clone(), 1) };
            let v = if let Some(h) = digits.strip_prefix("0x") { i64::from_str_radix(h, 16) } else if let Some(o) = digits.strip_prefix("0o") { i64::from_str_radix(o, 8) } else { digits.parse() };
            match v.ok().and_then(|v| v.checked_mul(mult)) {
                Some(v) => push(&mut out, Tok::Num(v)),
                None => errors.push(YaraError { line: l, col: co, message: format!("not a number: {word}") }),
            }
            continue;
        }
        if matches!(c, '$' | '#' | '@' | '!') && (chars.get(i + 1).is_some_and(|n| n.is_ascii_alphanumeric() || *n == '_' || *n == '*') || matches!(c, '$' | '#' | '@')) {
            let kind = c;
            adv!();
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_' || chars[i] == '*') {
                adv!();
            }
            let name: String = chars[start..i].iter().collect();
            if kind == '!' && name.is_empty() {
                push(&mut out, Tok::Punct("!"));
                continue;
            }
            push(&mut out, match kind {
                '$' => Tok::Str(name),
                '#' => Tok::Count(name),
                '@' => Tok::At(name),
                _ => Tok::Len(name),
            });
            continue;
        }
        if c.is_alphabetic() || c == '_' {
            let start = i;
            while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                adv!();
            }
            let word: String = chars[start..i].iter().collect();
            after_assign = word == "matches";
            push(&mut out, Tok::Ident(word));
            continue;
        }
        const PUNCT: &[&str] = &["..", "==", "!=", "<=", ">=", "<<", ">>", "{", "}", "(", ")", "[", "]", ":", ",", "=", "<", ">", "+", "-", "*", "\\", "%", "&", "|", "^", "~", "!", "."];
        let rest: String = chars[i..(i + 2).min(chars.len())].iter().collect();
        match PUNCT.iter().find(|p| rest.starts_with(**p)) {
            Some(p) => {
                for _ in 0..p.len() {
                    adv!();
                }
                if *p == "=" {
                    after_assign = true;
                }
                regex_ok = *p == "(" || *p == ",";
                push(&mut out, Tok::Punct(p));
            }
            None => {
                errors.push(YaraError { line: l, col: co, message: format!("unexpected '{c}'") });
                adv!();
            }
        }
    }
    out.push(Token { tok: Tok::Eof, line, col });
    (out, errors)
}

// ───────────── rules

#[derive(Debug, Clone)]
struct StringDef {
    /// the name without `$`; anonymous strings get "\u{1}N"
    id: String,
    regex: Regex,
    fullword: bool,
    private: bool,
    /// xor strings: the first plain byte (the key of a match is its first byte xor this)
    xor_first: Option<u8>,
    /// The longest match a literal can have (overlap between chunks); None: unbounded (64 KiB).
    reach: Option<usize>,
}

fn shown(id: &str) -> String {
    if id.starts_with('\u{1}') { "$".into() } else { format!("${id}") }
}

#[derive(Debug, Clone)]
enum Set {
    Them,
    List(Vec<String>),
    /// rule names (prefixes already expanded)
    Rules(Vec<String>),
}

#[derive(Debug, Clone)]
enum Quant {
    All,
    Any,
    None,
    Num(Box<Expr>),
    Percent(Box<Expr>),
}

#[derive(Debug, Clone)]
enum Iter {
    Range(Box<Expr>, Box<Expr>),
    List(Vec<Expr>),
    /// a module array ("pe.sections", or a nested one with the indexes of its parents): the variable is the index
    Array(&'static str, Vec<Expr>),
    /// a module dictionary ("pe.version_info"): key and value
    Dict(&'static str),
}

#[derive(Debug, Clone)]
enum Expr {
    Num(i64),
    Float(f64),
    Text(Vec<u8>),
    Filesize,
    Entrypoint,
    Var(String, Kind),
    /// a regular expression as a function argument
    Re(Regex),
    Found(String),
    FoundAt(String, Box<Expr>),
    FoundIn(String, Box<Expr>, Box<Expr>),
    Count(String),
    CountIn(String, Box<Expr>, Box<Expr>),
    Offset(String, Box<Expr>),
    Length(String, Box<Expr>),
    Read(String, Box<Expr>),
    Rule(String),
    Not(Box<Expr>),
    Defined(Box<Expr>),
    Neg(Box<Expr>),
    BitNot(Box<Expr>),
    Bin(&'static str, Box<Expr>, Box<Expr>),
    Matches(Box<Expr>, Regex),
    Of(Quant, Set),
    ForOf(Quant, Set, Box<Expr>),
    ForIn(Quant, Vec<String>, Iter, Box<Expr>),
    /// a module field ("pe.machine")
    Field(&'static str, Kind),
    /// a module array element field: ("pe.sections", [index], "name"); nested arrays have one index per level
    /// ("pe.import_details.functions", [i, j], "name"); a scalar array has the field ""
    Elem(&'static str, Vec<Expr>, &'static str, Kind),
    /// a module dictionary entry: ("pe.version_info", key)
    Dict(&'static str, Box<Expr>),
    /// module function: "pe.imports", "math.entropy", "hash.md5", … and what it returns
    Call(&'static str, Vec<Expr>, Kind),
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Kind {
    Num,
    Str,
    /// a regular expression (function arguments only)
    Re,
}

fn kind(e: &Expr) -> Kind {
    match e {
        Expr::Text(_) | Expr::Dict(..) => Kind::Str,
        Expr::Re(_) => Kind::Re,
        Expr::Var(_, k) | Expr::Field(_, k) | Expr::Elem(.., k) | Expr::Call(.., k) => *k,
        _ => Kind::Num,
    }
}

const MODULES: &[&str] = &["pe", "elf", "macho", "dotnet", "dex", "magic", "math", "hash", "console", "time"];

/// `n` bytes at `off`, or None past the end (for the module parsers).
fn read_at(src: &dyn Bytes, off: u64, n: u64) -> Option<Vec<u8>> {
    if off.checked_add(n)? > src.len() || n > 1 << 30 {
        return None;
    }
    let mut b = vec![0u8; n as usize];
    src.read(off, &mut b).ok()?;
    Some(b)
}

/// The fields of one Mach-O file (macho.<field> of a single file and macho.file[i].<field> of a fat binary).
const MACHO_FILE: &[(&str, Kind)] = &[
    ("magic", N), ("cputype", N), ("cpusubtype", N), ("filetype", N), ("ncmds", N), ("sizeofcmds", N), ("flags", N), ("reserved", N),
    ("number_of_segments", N), ("entry_point", N), ("stack_size", N),
];
const MACHO_SEGMENT: &[(&str, Kind)] = &[
    ("segname", S), ("vmaddr", N), ("vmsize", N), ("fileoff", N), ("fsize", N), ("filesize", N), ("maxprot", N), ("initprot", N), ("nsects", N),
    ("flags", N),
];
const MACHO_SECTION: &[(&str, Kind)] = &[
    ("sectname", S), ("segname", S), ("addr", N), ("size", N), ("offset", N), ("align", N), ("reloff", N), ("nreloc", N), ("flags", N),
];
const MACHO_DYLIB: &[(&str, Kind)] = &[("name", S), ("timestamp", N), ("compatibility_version", S), ("current_version", S)];
const IMPORT_DETAIL: &[(&str, Kind)] = &[("library_name", S), ("number_of_functions", N)];
const IMPORT_FUNCTION: &[(&str, Kind)] = &[("name", S), ("ordinal", N), ("rva", N)];
const ASSEMBLY: &[(&str, Kind)] = &[
    ("name", S), ("culture", S), ("version.major", N), ("version.minor", N), ("version.build_number", N), ("version.revision_number", N),
];
const SCALAR_TEXT: &[(&str, Kind)] = &[("", S)];

/// text constants
const STR_CONSTS: &[(&str, &[u8])] = &[
    ("dex.DEX_FILE_MAGIC_035", b"dex\n035\0"), ("dex.DEX_FILE_MAGIC_036", b"dex\n036\0"), ("dex.DEX_FILE_MAGIC_037", b"dex\n037\0"),
    ("dex.DEX_FILE_MAGIC_038", b"dex\n038\0"), ("dex.DEX_FILE_MAGIC_039", b"dex\n039\0"),
];

use Kind::{Num as N, Str as S};

/// module fields
const FIELDS: &[(&str, Kind)] = &[
    ("pe.is_pe", N), ("pe.machine", N), ("pe.number_of_sections", N), ("pe.timestamp", N), ("pe.entry_point", N), ("pe.entry_point_raw", N),
    ("pe.characteristics", N), ("pe.subsystem", N), ("pe.image_base", N), ("pe.size_of_image", N), ("pe.size_of_headers", N), ("pe.checksum", N),
    ("pe.dll_characteristics", N), ("pe.file_alignment", N), ("pe.section_alignment", N), ("pe.dll_name", S), ("pe.number_of_imports", N),
    ("pe.number_of_imported_functions", N), ("pe.number_of_exports", N), ("pe.number_of_resources", N), ("pe.resource_timestamp", N),
    ("pe.resource_version.major", N), ("pe.resource_version.minor", N), ("pe.number_of_version_infos", N), ("pe.number_of_signatures", N),
    ("pe.rich_signature.offset", N), ("pe.rich_signature.length", N), ("pe.rich_signature.key", N), ("pe.rich_signature.raw_data", S),
    ("pe.rich_signature.clear_data", S),
    ("elf.type", N), ("elf.machine", N), ("elf.entry_point", N), ("elf.number_of_sections", N), ("elf.number_of_segments", N),
    ("elf.sh_offset", N), ("elf.sh_entry_size", N), ("elf.ph_offset", N), ("elf.ph_entry_size", N), ("elf.dynamic_section_entries", N),
    ("elf.symtab_entries", N), ("elf.dynsym_entries", N),
    ("pe.number_of_delayed_imports", N), ("pe.number_of_delayed_imported_functions", N), ("pe.overlay.offset", N), ("pe.overlay.size", N),
    ("pe.pdb_path", S),
    ("macho.fat_magic", N), ("macho.nfat_arch", N), ("macho.magic", N), ("macho.cputype", N), ("macho.cpusubtype", N), ("macho.filetype", N),
    ("macho.ncmds", N), ("macho.sizeofcmds", N), ("macho.flags", N), ("macho.reserved", N), ("macho.number_of_segments", N),
    ("macho.entry_point", N), ("macho.stack_size", N),
    ("dotnet.is_dotnet", N), ("dotnet.version", S), ("dotnet.module_name", S), ("dotnet.number_of_streams", N), ("dotnet.number_of_guids", N),
    ("dotnet.number_of_user_strings", N), ("dotnet.number_of_resources", N), ("dotnet.number_of_assembly_refs", N),
    ("dotnet.number_of_modulerefs", N), ("dotnet.typelib", S), ("dotnet.assembly.name", S), ("dotnet.assembly.culture", S),
    ("dotnet.assembly.version.major", N), ("dotnet.assembly.version.minor", N), ("dotnet.assembly.version.build_number", N),
    ("dotnet.assembly.version.revision_number", N),
    ("dex.header.magic", S), ("dex.header.checksum", N), ("dex.header.signature", S), ("dex.header.file_size", N), ("dex.header.header_size", N),
    ("dex.header.endian_tag", N), ("dex.header.link_size", N), ("dex.header.link_offset", N), ("dex.header.map_offset", N),
    ("dex.header.string_ids_size", N), ("dex.header.string_ids_offset", N), ("dex.header.type_ids_size", N), ("dex.header.type_ids_offset", N),
    ("dex.header.proto_ids_size", N), ("dex.header.proto_ids_offset", N), ("dex.header.field_ids_size", N), ("dex.header.field_ids_offset", N),
    ("dex.header.method_ids_size", N), ("dex.header.method_ids_offset", N), ("dex.header.class_defs_size", N),
    ("dex.header.class_defs_offset", N), ("dex.header.data_size", N), ("dex.header.data_offset", N),
    ("dex.number_of_strings", N), ("dex.number_of_types", N), ("dex.number_of_fields", N), ("dex.number_of_methods", N), ("dex.number_of_classes", N),
];

const SYMBOL: &[(&str, Kind)] = &[("name", S), ("value", N), ("size", N), ("type", N), ("bind", N), ("shndx", N), ("other", N)];

/// module arrays and the fields of their elements
const ARRAYS: &[(&str, &[(&str, Kind)])] = &[
    ("pe.sections", &[("name", S), ("virtual_address", N), ("virtual_size", N), ("raw_data_offset", N), ("raw_data_size", N), ("characteristics", N)]),
    ("pe.resources", &[("type", N), ("id", N), ("language", N), ("type_string", S), ("name_string", S), ("language_string", S), ("rva", N), ("offset", N), ("length", N)]),
    ("pe.version_info_list", &[("key", S), ("value", S)]),
    ("elf.sections", &[("name", S), ("type", N), ("flags", N), ("address", N), ("size", N), ("offset", N)]),
    ("elf.segments", &[("type", N), ("flags", N), ("offset", N), ("virtual_address", N), ("physical_address", N), ("file_size", N), ("memory_size", N), ("alignment", N)]),
    ("elf.dynamic", &[("type", N), ("val", N)]),
    ("elf.symtab", SYMBOL),
    ("elf.dynsym", SYMBOL),
    ("pe.import_details", IMPORT_DETAIL),
    ("pe.import_details.functions", IMPORT_FUNCTION),
    ("pe.delayed_import_details", IMPORT_DETAIL),
    ("pe.delayed_import_details.functions", IMPORT_FUNCTION),
    ("pe.signatures", &[("issuer", S), ("subject", S), ("serial", S), ("version", N), ("algorithm", S), ("algorithm_oid", S), ("not_before", N), ("not_after", N), ("thumbprint", S), ("number_of_certificates", N)]),
    ("macho.segments", MACHO_SEGMENT),
    ("macho.segments.sections", MACHO_SECTION),
    ("macho.dylibs", MACHO_DYLIB),
    ("macho.rpaths", SCALAR_TEXT),
    ("macho.entitlements", SCALAR_TEXT),
    ("macho.fat_arch", &[("cputype", N), ("cpusubtype", N), ("offset", N), ("size", N), ("align", N)]),
    ("macho.file", MACHO_FILE),
    ("macho.file.segments", MACHO_SEGMENT),
    ("macho.file.segments.sections", MACHO_SECTION),
    ("macho.file.dylibs", MACHO_DYLIB),
    ("macho.file.rpaths", SCALAR_TEXT),
    ("macho.file.entitlements", SCALAR_TEXT),
    ("dotnet.streams", &[("name", S), ("offset", N), ("size", N)]),
    ("dotnet.guids", SCALAR_TEXT),
    ("dotnet.user_strings", SCALAR_TEXT),
    ("dotnet.modulerefs", SCALAR_TEXT),
    ("dotnet.resources", &[("offset", N), ("length", N), ("name", S)]),
    ("dotnet.assembly_refs", ASSEMBLY),
    ("dex.string_ids", &[("offset", N), ("size", N), ("value", S)]),
    ("dex.type_ids", &[("descriptor_idx", N)]),
    ("dex.field_ids", &[("class_idx", N), ("type_idx", N), ("name_idx", N)]),
    ("dex.method_ids", &[("class_idx", N), ("proto_idx", N), ("name_idx", N)]),
    ("dex.methods", &[("name", S), ("class_name", S)]),
    ("dex.class_defs", &[("class_idx", N), ("access_flags", N), ("super_class_idx", N), ("interfaces_offset", N), ("source_file_idx", N), ("annotations_offset", N), ("class_data_offset", N), ("static_values_offset", N)]),
];

/// module dictionaries (text keys and values)
const DICTS: &[&str] = &["pe.version_info"];

const CONSTS: &[(&str, i64)] = &[
    ("pe.MACHINE_UNKNOWN", 0), ("pe.MACHINE_I386", 0x14C), ("pe.MACHINE_AMD64", 0x8664), ("pe.MACHINE_ARM", 0x1C0), ("pe.MACHINE_ARMNT", 0x1C4),
    ("pe.MACHINE_ARM64", 0xAA64), ("pe.MACHINE_IA64", 0x200),
    ("pe.RELOCS_STRIPPED", 0x1), ("pe.EXECUTABLE_IMAGE", 0x2), ("pe.LARGE_ADDRESS_AWARE", 0x20), ("pe.MACHINE_32BIT", 0x100),
    ("pe.DEBUG_STRIPPED", 0x200), ("pe.SYSTEM", 0x1000), ("pe.DLL", 0x2000),
    ("pe.SUBSYSTEM_UNKNOWN", 0), ("pe.SUBSYSTEM_NATIVE", 1), ("pe.SUBSYSTEM_WINDOWS_GUI", 2), ("pe.SUBSYSTEM_WINDOWS_CUI", 3),
    ("pe.SUBSYSTEM_EFI_APPLICATION", 10),
    ("pe.SECTION_CNT_CODE", 0x20), ("pe.SECTION_CNT_INITIALIZED_DATA", 0x40), ("pe.SECTION_CNT_UNINITIALIZED_DATA", 0x80),
    ("pe.SECTION_MEM_DISCARDABLE", 0x0200_0000), ("pe.SECTION_MEM_SHARED", 0x1000_0000), ("pe.SECTION_MEM_EXECUTE", 0x2000_0000),
    ("pe.SECTION_MEM_READ", 0x4000_0000), ("pe.SECTION_MEM_WRITE", 0x8000_0000),
    ("pe.DYNAMIC_BASE", 0x40), ("pe.NX_COMPAT", 0x100), ("pe.GUARD_CF", 0x4000),
    ("pe.RESOURCE_TYPE_CURSOR", 1), ("pe.RESOURCE_TYPE_BITMAP", 2), ("pe.RESOURCE_TYPE_ICON", 3), ("pe.RESOURCE_TYPE_MENU", 4),
    ("pe.RESOURCE_TYPE_DIALOG", 5), ("pe.RESOURCE_TYPE_STRING", 6), ("pe.RESOURCE_TYPE_FONTDIR", 7), ("pe.RESOURCE_TYPE_FONT", 8),
    ("pe.RESOURCE_TYPE_ACCELERATOR", 9), ("pe.RESOURCE_TYPE_RCDATA", 10), ("pe.RESOURCE_TYPE_MESSAGETABLE", 11),
    ("pe.RESOURCE_TYPE_GROUP_CURSOR", 12), ("pe.RESOURCE_TYPE_GROUP_ICON", 14), ("pe.RESOURCE_TYPE_VERSION", 16),
    ("pe.RESOURCE_TYPE_DLGINCLUDE", 17), ("pe.RESOURCE_TYPE_PLUGPLAY", 19), ("pe.RESOURCE_TYPE_VXD", 20), ("pe.RESOURCE_TYPE_ANICURSOR", 21),
    ("pe.RESOURCE_TYPE_ANIICON", 22), ("pe.RESOURCE_TYPE_HTML", 23), ("pe.RESOURCE_TYPE_MANIFEST", 24),
    ("elf.ET_NONE", 0), ("elf.ET_REL", 1), ("elf.ET_EXEC", 2), ("elf.ET_DYN", 3), ("elf.ET_CORE", 4),
    ("elf.EM_NONE", 0), ("elf.EM_M32", 1), ("elf.EM_SPARC", 2), ("elf.EM_386", 3), ("elf.EM_68K", 4), ("elf.EM_88K", 5), ("elf.EM_860", 7),
    ("elf.EM_MIPS", 8), ("elf.EM_MIPS_RS3_LE", 10), ("elf.EM_PPC", 20), ("elf.EM_PPC64", 21), ("elf.EM_ARM", 40), ("elf.EM_X86_64", 62),
    ("elf.EM_AARCH64", 183), ("elf.EM_RISCV", 243),
    ("elf.SHT_NULL", 0), ("elf.SHT_PROGBITS", 1), ("elf.SHT_SYMTAB", 2), ("elf.SHT_STRTAB", 3), ("elf.SHT_RELA", 4), ("elf.SHT_HASH", 5),
    ("elf.SHT_DYNAMIC", 6), ("elf.SHT_NOTE", 7), ("elf.SHT_NOBITS", 8), ("elf.SHT_REL", 9), ("elf.SHT_SHLIB", 10), ("elf.SHT_DYNSYM", 11),
    ("elf.SHF_WRITE", 1), ("elf.SHF_ALLOC", 2), ("elf.SHF_EXECINSTR", 4),
    ("elf.PT_NULL", 0), ("elf.PT_LOAD", 1), ("elf.PT_DYNAMIC", 2), ("elf.PT_INTERP", 3), ("elf.PT_NOTE", 4), ("elf.PT_SHLIB", 5), ("elf.PT_PHDR", 6),
    ("elf.PT_TLS", 7), ("elf.PT_GNU_EH_FRAME", 0x6474_E550), ("elf.PT_GNU_STACK", 0x6474_E551), ("elf.PT_GNU_RELRO", 0x6474_E552),
    ("elf.PF_X", 1), ("elf.PF_W", 2), ("elf.PF_R", 4),
    ("elf.DT_NULL", 0), ("elf.DT_NEEDED", 1), ("elf.DT_PLTRELSZ", 2), ("elf.DT_PLTGOT", 3), ("elf.DT_HASH", 4), ("elf.DT_STRTAB", 5),
    ("elf.DT_SYMTAB", 6), ("elf.DT_RELA", 7), ("elf.DT_RELASZ", 8), ("elf.DT_RELAENT", 9), ("elf.DT_STRSZ", 10), ("elf.DT_SYMENT", 11),
    ("elf.DT_INIT", 12), ("elf.DT_FINI", 13), ("elf.DT_SONAME", 14), ("elf.DT_RPATH", 15), ("elf.DT_SYMBOLIC", 16), ("elf.DT_REL", 17),
    ("elf.DT_RELSZ", 18), ("elf.DT_RELENT", 19), ("elf.DT_PLTREL", 20), ("elf.DT_DEBUG", 21), ("elf.DT_TEXTREL", 22), ("elf.DT_JMPREL", 23),
    ("elf.DT_RUNPATH", 29),
    ("elf.STT_NOTYPE", 0), ("elf.STT_OBJECT", 1), ("elf.STT_FUNC", 2), ("elf.STT_SECTION", 3), ("elf.STT_FILE", 4), ("elf.STT_COMMON", 5),
    ("elf.STT_TLS", 6), ("elf.STB_LOCAL", 0), ("elf.STB_GLOBAL", 1), ("elf.STB_WEAK", 2),
    ("pe.IMPORT_STANDARD", 1), ("pe.IMPORT_DELAYED", 2), ("pe.IMPORT_ANY", 3),
    ("macho.MH_MAGIC", 0xFEED_FACE), ("macho.MH_CIGAM", 0xCEFA_EDFE), ("macho.MH_MAGIC_64", 0xFEED_FACF), ("macho.MH_CIGAM_64", 0xCFFA_EDFE),
    ("macho.FAT_MAGIC", 0xCAFE_BABE), ("macho.FAT_CIGAM", 0xBEBA_FECA), ("macho.FAT_MAGIC_64", 0xCAFE_BABF), ("macho.FAT_CIGAM_64", 0xBFBA_FECA),
    ("macho.CPU_ARCH_ABI64", 0x0100_0000), ("macho.CPU_TYPE_MC680X0", 6), ("macho.CPU_TYPE_X86", 7), ("macho.CPU_TYPE_I386", 7),
    ("macho.CPU_TYPE_X86_64", 0x0100_0007), ("macho.CPU_TYPE_MIPS", 8), ("macho.CPU_TYPE_MC98000", 10), ("macho.CPU_TYPE_ARM", 12),
    ("macho.CPU_TYPE_ARM64", 0x0100_000C), ("macho.CPU_TYPE_MC88000", 13), ("macho.CPU_TYPE_SPARC", 14), ("macho.CPU_TYPE_POWERPC", 18),
    ("macho.CPU_TYPE_POWERPC64", 0x0100_0012),
    ("macho.CPU_SUBTYPE_INTEL_MODEL_ALL", 0), ("macho.CPU_SUBTYPE_386", 3), ("macho.CPU_SUBTYPE_X86_ALL", 3), ("macho.CPU_SUBTYPE_X86_64_ALL", 3),
    ("macho.CPU_SUBTYPE_ARM_ALL", 0), ("macho.CPU_SUBTYPE_ARM_V7", 9), ("macho.CPU_SUBTYPE_ARM64_ALL", 0), ("macho.CPU_SUBTYPE_ARM64E", 2),
    ("macho.CPU_SUBTYPE_POWERPC_ALL", 0),
    ("macho.MH_OBJECT", 1), ("macho.MH_EXECUTE", 2), ("macho.MH_FVMLIB", 3), ("macho.MH_CORE", 4), ("macho.MH_PRELOAD", 5), ("macho.MH_DYLIB", 6),
    ("macho.MH_DYLINKER", 7), ("macho.MH_BUNDLE", 8), ("macho.MH_DYLIB_STUB", 9), ("macho.MH_DSYM", 10), ("macho.MH_KEXT_BUNDLE", 11),
    ("macho.MH_NOUNDEFS", 0x1), ("macho.MH_INCRLINK", 0x2), ("macho.MH_DYLDLINK", 0x4), ("macho.MH_BINDATLOAD", 0x8), ("macho.MH_PREBOUND", 0x10),
    ("macho.MH_SPLIT_SEGS", 0x20), ("macho.MH_TWOLEVEL", 0x80), ("macho.MH_FORCE_FLAT", 0x100), ("macho.MH_WEAK_DEFINES", 0x8000),
    ("macho.MH_BINDS_TO_WEAK", 0x10000), ("macho.MH_ALLOW_STACK_EXECUTION", 0x20000), ("macho.MH_PIE", 0x20_0000),
    ("macho.MH_NO_HEAP_EXECUTION", 0x100_0000), ("macho.MH_APP_EXTENSION_SAFE", 0x200_0000),
    ("macho.SG_HIGHVM", 0x1), ("macho.SG_FVMLIB", 0x2), ("macho.SG_NORELOC", 0x4), ("macho.SG_PROTECTED_VERSION_1", 0x8),
    ("macho.S_REGULAR", 0), ("macho.S_ZEROFILL", 1), ("macho.S_CSTRING_LITERALS", 2), ("macho.S_ATTR_PURE_INSTRUCTIONS", 0x8000_0000),
    ("macho.S_ATTR_SOME_INSTRUCTIONS", 0x400),
    ("dex.ENDIAN_CONSTANT", 0x1234_5678), ("dex.REVERSE_ENDIAN_CONSTANT", 0x7856_3412), ("dex.NO_INDEX", 0xFFFF_FFFF),
    ("dex.ACC_PUBLIC", 0x1), ("dex.ACC_PRIVATE", 0x2), ("dex.ACC_PROTECTED", 0x4), ("dex.ACC_STATIC", 0x8), ("dex.ACC_FINAL", 0x10),
    ("dex.ACC_SYNCHRONIZED", 0x20), ("dex.ACC_INTERFACE", 0x200), ("dex.ACC_ABSTRACT", 0x400), ("dex.ACC_ENUM", 0x4000),
    ("dex.ACC_CONSTRUCTOR", 0x10000),
];

const FLOAT_CONSTS: &[(&str, f64)] = &[("math.MEAN_BYTES", 127.5)];

/// module functions: name, accepted argument kinds (n number, s text, r regex), result, how to call it
const FUNCS: &[(&str, &[&str], Kind, &str)] = &[
    ("pe.imports", &["s", "ss", "sn", "sr", "r", "rr", "rs", "ns", "nss", "nsn", "nsr", "nr", "nrr", "nrs"], N, "pe.imports([pe.IMPORT_STANDARD | IMPORT_DELAYED | IMPORT_ANY,] \"dll\" | /dll/[, \"function\" | /function/ | ordinal])"),
    ("pe.delayed_imports", &["s", "ss", "sn", "sr", "r", "rr", "rs"], N, "pe.delayed_imports(\"dll\" | /dll/[, \"function\" | /function/ | ordinal])"),
    ("pe.imphash", &[""], S, "pe.imphash()"),
    ("macho.has_dylib", &["s"], N, "macho.has_dylib(\"path\")"),
    ("macho.has_rpath", &["s"], N, "macho.has_rpath(\"path\")"),
    ("macho.has_entitlement", &["s"], N, "macho.has_entitlement(\"name\")"),
    ("macho.file_index_for_arch", &["n", "nn"], N, "macho.file_index_for_arch(cputype[, cpusubtype])"),
    ("macho.entry_point_for_arch", &["n", "nn"], N, "macho.entry_point_for_arch(cputype[, cpusubtype])"),
    ("dex.has_method", &["s", "ss"], N, "dex.has_method([\"class descriptor\",] \"name\")"),
    ("dex.has_class", &["s"], N, "dex.has_class(\"class descriptor\")"),
    ("magic.type", &[""], S, "magic.type()"),
    ("magic.mime_type", &[""], S, "magic.mime_type()"),
    ("pe.exports", &["s", "n", "r"], N, "pe.exports(\"name\" | ordinal | /regex/)"),
    ("pe.section_index", &["s", "n"], N, "pe.section_index(\"name\" | rva)"),
    ("pe.rva_to_offset", &["n"], N, "pe.rva_to_offset(rva)"),
    ("pe.is_dll", &[""], N, "pe.is_dll()"),
    ("pe.is_32bit", &[""], N, "pe.is_32bit()"),
    ("pe.is_64bit", &[""], N, "pe.is_64bit()"),
    ("pe.rich_signature.version", &["n", "nn"], N, "pe.rich_signature.version(version[, toolid])"),
    ("pe.rich_signature.toolid", &["n", "nn"], N, "pe.rich_signature.toolid(toolid[, version])"),
    ("math.entropy", &["nn", "s"], N, "math.entropy(offset, size) or math.entropy(\"text\")"),
    ("math.mean", &["nn", "s"], N, "math.mean(offset, size) or math.mean(\"text\")"),
    ("math.serial_correlation", &["nn", "s"], N, "math.serial_correlation(offset, size) or math.serial_correlation(\"text\")"),
    ("math.monte_carlo_pi", &["nn", "s"], N, "math.monte_carlo_pi(offset, size) or math.monte_carlo_pi(\"text\")"),
    ("math.deviation", &["nnn", "sn"], N, "math.deviation(offset, size, mean) or math.deviation(\"text\", mean)"),
    ("math.count", &["n", "nnn"], N, "math.count(byte[, offset, size])"),
    ("math.percentage", &["n", "nnn"], N, "math.percentage(byte[, offset, size])"),
    ("math.mode", &["", "nn"], N, "math.mode([offset, size])"),
    ("math.in_range", &["nnn"], N, "math.in_range(value, lower, upper)"),
    ("math.to_number", &["n"], N, "math.to_number(condition)"),
    ("math.abs", &["n"], N, "math.abs(number)"),
    ("math.min", &["nn"], N, "math.min(a, b)"),
    ("math.max", &["nn"], N, "math.max(a, b)"),
    ("math.to_string", &["n", "nn"], S, "math.to_string(number[, base 8 | 10 | 16])"),
    ("hash.md5", &["nn", "s"], S, "hash.md5(offset, size) or hash.md5(\"text\")"),
    ("hash.sha1", &["nn", "s"], S, "hash.sha1(offset, size) or hash.sha1(\"text\")"),
    ("hash.sha256", &["nn", "s"], S, "hash.sha256(offset, size) or hash.sha256(\"text\")"),
    ("hash.crc32", &["nn", "s"], N, "hash.crc32(offset, size) or hash.crc32(\"text\")"),
    ("console.log", &["s", "sn", "ss"], N, "console.log(\"text\"[, number | \"text\"])"),
    ("console.hex", &["n", "sn"], N, "console.hex(number) or console.hex(\"text\", number)"),
    ("time.now", &[""], N, "time.now()"),
];

/// math / hash functions that read data (a range of the document or a text)
const DATA_FUNCS: &[&str] = &[
    "math.entropy", "math.mean", "math.serial_correlation", "math.monte_carlo_pi", "math.deviation", "math.count", "math.percentage",
    "math.mode", "hash.md5", "hash.sha1", "hash.sha256", "hash.crc32",
];

/// Whether `path` is a module member or the beginning of one.
fn module_path_exists(path: &str) -> bool {
    let prefix = format!("{path}.");
    let keys = FIELDS.iter().map(|f| f.0).chain(ARRAYS.iter().map(|a| a.0)).chain(DICTS.iter().copied()).chain(CONSTS.iter().map(|c| c.0));
    let keys = keys.chain(STR_CONSTS.iter().map(|c| c.0));
    keys.chain(FLOAT_CONSTS.iter().map(|c| c.0)).chain(FUNCS.iter().map(|f| f.0)).any(|k| k == path || k.starts_with(&prefix))
}

#[derive(Debug, Clone)]
enum VarKind {
    Val(Kind),
    /// the index of an element of a module array (after the indexes of its parent elements)
    Elem(&'static str, Vec<Expr>),
}

/// What a module path names: a value, or (only valid after `in`) a whole array or dictionary.
enum Ref {
    Expr(Expr),
    Array(&'static str, Vec<Expr>),
    Dict(&'static str),
}

/// After an element: done, or a nested array.
enum Member {
    Done(Expr),
    Nested(&'static str, Vec<Expr>),
}

const MODIFIERS: &[&str] = &["nocase", "wide", "ascii", "fullword", "private", "xor", "base64", "base64wide"];
const STR_OPS: &[&str] = &["contains", "icontains", "startswith", "istartswith", "endswith", "iendswith", "iequals"];
const B64: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

#[derive(Debug, Clone)]
struct Rule {
    name: String,
    private: bool,
    global: bool,
    tags: Vec<String>,
    meta: Map<String, Value>,
    strings: Vec<StringDef>,
    condition: Expr,
}

#[derive(Default)]
struct Mods {
    nocase: bool,
    wide: bool,
    ascii: bool,
    fullword: bool,
    private: bool,
    xor: Option<(u8, u8)>,
    base64: bool,
    base64wide: bool,
    alphabet: Option<Vec<u8>>,
}

struct Parser {
    toks: Vec<Token>,
    pos: usize,
    rule_names: Vec<String>,
    imports: Vec<String>,
    /// the string ids of the rule whose condition is parsed
    cur_strings: Vec<String>,
    /// loop variables in scope
    loop_vars: Vec<(String, VarKind)>,
    /// depth of `for … of` bodies (where `$` is valid)
    for_of: usize,
    /// while parsing the quantifier of `for`: a number followed by `of` is not `N of set`
    no_of: bool,
}

impl Parser {
    fn peek(&self) -> &Token {
        &self.toks[self.pos.min(self.toks.len() - 1)]
    }
    fn peek_at(&self, k: usize) -> Option<&Tok> {
        self.toks.get(self.pos + k).map(|t| &t.tok)
    }
    fn next(&mut self) -> Token {
        let t = self.peek().clone();
        if self.pos < self.toks.len() - 1 {
            self.pos += 1;
        }
        t
    }
    fn is_punct(&self, p: &str) -> bool {
        matches!(&self.peek().tok, Tok::Punct(x) if *x == p)
    }
    fn is_ident(&self, word: &str) -> bool {
        matches!(&self.peek().tok, Tok::Ident(x) if x == word)
    }
    fn expect(&mut self, p: &str) -> Result<(), YaraError> {
        if self.is_punct(p) {
            self.next();
            Ok(())
        } else {
            let t = self.peek().clone();
            err(&t, format!("'{p}' expected"))
        }
    }
    fn ident(&mut self) -> Result<String, YaraError> {
        let t = self.next();
        match t.tok {
            Tok::Ident(s) => Ok(s),
            _ => err(&t, "a name is expected"),
        }
    }

    fn rule(&mut self) -> Result<Rule, YaraError> {
        let (mut private, mut global) = (false, false);
        self.loop_vars.clear();
        self.for_of = 0;
        self.no_of = false;
        self.cur_strings.clear();
        while self.is_ident("private") || self.is_ident("global") {
            if self.is_ident("private") {
                private = true;
            } else {
                global = true;
            }
            self.next();
        }
        let t = self.next();
        if t.tok != Tok::Ident("rule".into()) {
            return err(&t, "'rule' expected");
        }
        let name = self.ident()?;
        let mut tags = Vec::new();
        if self.is_punct(":") {
            self.next();
            while let Tok::Ident(tag) = &self.peek().tok {
                tags.push(tag.clone());
                self.next();
            }
        }
        self.expect("{")?;
        let mut meta = Map::new();
        let mut strings: Vec<StringDef> = Vec::new();
        let mut condition = None;
        let mut anonymous = 0;
        loop {
            let t = self.peek().clone();
            match &t.tok {
                Tok::Ident(s) if s == "meta" => {
                    self.next();
                    self.expect(":")?;
                    while let Tok::Ident(key) = self.peek().tok.clone() {
                        if ["strings", "condition"].contains(&key.as_str()) && matches!(self.peek_at(1), Some(Tok::Punct(":"))) {
                            break;
                        }
                        self.next();
                        self.expect("=")?;
                        let v = self.next();
                        let value = match v.tok {
                            Tok::Text(s) => json!(s),
                            Tok::Num(n) => json!(n),
                            Tok::Float(f) => json!(f),
                            Tok::Punct("-") => match self.next().tok {
                                Tok::Num(n) => json!(-n),
                                Tok::Float(f) => json!(-f),
                                _ => return err(&v, "a meta value is expected"),
                            },
                            Tok::Ident(b) if b == "true" || b == "false" => json!(b == "true"),
                            _ => return err(&v, "a meta value is expected"),
                        };
                        meta.insert(key, value);
                    }
                }
                Tok::Ident(s) if s == "strings" => {
                    self.next();
                    self.expect(":")?;
                    while let Tok::Str(id) = self.peek().tok.clone() {
                        let at = self.next();
                        if id.contains('*') {
                            return err(&at, format!("${id}: '*' is not allowed in a string name"));
                        }
                        self.expect("=")?;
                        let id = if id.is_empty() {
                            anonymous += 1;
                            format!("\u{1}{anonymous}")
                        } else {
                            id
                        };
                        let def = self.string_def(&id, &at)?;
                        if strings.iter().any(|d| d.id == def.id) {
                            return err(&at, format!("${id} is defined twice"));
                        }
                        strings.push(def);
                    }
                }
                Tok::Ident(s) if s == "condition" => {
                    self.next();
                    self.expect(":")?;
                    self.cur_strings = strings.iter().map(|d| d.id.clone()).collect();
                    condition = Some(self.expr()?);
                }
                Tok::Punct("}") => {
                    self.next();
                    break;
                }
                _ => return err(&t, "meta:, strings:, condition: or '}' expected"),
            }
        }
        let condition = condition.ok_or(YaraError { line: t_line(&self.toks, self.pos), col: 1, message: format!("rule {name} has no condition") })?;
        Ok(Rule { name, private, global, tags, meta, strings, condition })
    }

    fn byte_value(&mut self) -> Result<u8, YaraError> {
        let t = self.next();
        match t.tok {
            Tok::Num(v) if (0..=255).contains(&v) => Ok(v as u8),
            _ => err(&t, "a key from 0 to 255 is expected"),
        }
    }

    fn string_def(&mut self, id: &str, at: &Token) -> Result<StringDef, YaraError> {
        let t = self.next();
        let mut m = Mods::default();
        let mut seen: Vec<String> = Vec::new();
        while let Tok::Ident(word) = self.peek().tok.clone() {
            if !MODIFIERS.contains(&word.as_str()) {
                break;
            }
            let mt = self.next();
            if seen.contains(&word) {
                return err(&mt, format!("duplicate modifier {word}"));
            }
            match word.as_str() {
                "nocase" => m.nocase = true,
                "wide" => m.wide = true,
                "ascii" => m.ascii = true,
                "fullword" => m.fullword = true,
                "private" => m.private = true,
                "xor" => {
                    let range = if self.is_punct("(") {
                        self.next();
                        let lo = self.byte_value()?;
                        let hi = if self.is_punct("-") {
                            self.next();
                            self.byte_value()?
                        } else {
                            lo
                        };
                        self.expect(")")?;
                        if hi < lo {
                            return err(&mt, "xor(lo-hi): lo must not be above hi");
                        }
                        (lo, hi)
                    } else {
                        (0, 255)
                    };
                    m.xor = Some(range);
                }
                _ => {
                    if word == "base64" {
                        m.base64 = true;
                    } else {
                        m.base64wide = true;
                    }
                    if self.is_punct("(") {
                        self.next();
                        let a = self.next();
                        let Tok::Text(s) = a.tok.clone() else { return err(&a, "a base64 alphabet (text) is expected") };
                        let alphabet = text_bytes(&s);
                        if alphabet.len() != 64 {
                            return err(&a, format!("a base64 alphabet must have 64 characters (this one has {})", alphabet.len()));
                        }
                        if m.alphabet.as_ref().is_some_and(|prev| *prev != alphabet) {
                            return err(&a, "base64 and base64wide must use the same alphabet");
                        }
                        m.alphabet = Some(alphabet);
                        self.expect(")")?;
                    }
                }
            }
            seen.push(word);
        }
        let name = shown(id);
        match &t.tok {
            Tok::Hex(_) => {
                if let Some(w) = seen.iter().find(|w| *w != "private") {
                    return err(at, format!("{name}: {w} cannot be used with a hex string"));
                }
            }
            Tok::Regex(..) => {
                if let Some(w) = seen.iter().find(|w| w.starts_with("xor") || w.starts_with("base64")) {
                    return err(at, format!("{name}: {w} cannot be used with a regular expression"));
                }
            }
            Tok::Text(_) => {
                if m.xor.is_some() && m.nocase {
                    return err(at, format!("{name}: xor cannot be used with nocase"));
                }
                if (m.base64 || m.base64wide) && (m.nocase || m.xor.is_some() || m.fullword) {
                    return err(at, format!("{name}: base64 cannot be used with nocase, xor or fullword"));
                }
            }
            _ => {}
        }
        let regex_i = matches!(&t.tok, Tok::Regex(_, f) if f.contains('i'));
        let mut xor_first = None;
        let (pattern, reach) = match t.tok.clone() {
            Tok::Text(s) => {
                let bytes = text_bytes(&s);
                if bytes.is_empty() {
                    return err(&t, format!("{name}: empty string"));
                }
                let mut forms = Vec::new();
                if m.ascii || !m.wide {
                    forms.push(bytes.clone());
                }
                if m.wide {
                    forms.push(widen(&bytes));
                }
                let mut alts: Vec<Vec<u8>> = Vec::new();
                if m.base64 || m.base64wide {
                    let alphabet = m.alphabet.clone().unwrap_or_else(|| B64.to_vec());
                    for f in &forms {
                        for v in base64_variants(f, &alphabet) {
                            if m.base64wide {
                                alts.push(widen(&v));
                            }
                            if m.base64 {
                                alts.push(v);
                            }
                        }
                    }
                    if alts.is_empty() {
                        return err(&t, format!("{name}: too short for base64"));
                    }
                } else if let Some((lo, hi)) = m.xor {
                    xor_first = Some(bytes[0]);
                    for f in &forms {
                        for k in lo..=hi {
                            alts.push(f.iter().map(|b| b ^ k).collect());
                        }
                    }
                } else {
                    alts = forms;
                }
                let mut unique: Vec<Vec<u8>> = Vec::new();
                for a in alts {
                    if !unique.contains(&a) {
                        unique.push(a);
                    }
                }
                let reach = unique.iter().map(Vec::len).max().unwrap_or(0);
                (format!("(?:{})", unique.iter().map(|a| lit(a)).collect::<Vec<_>>().join("|")), Some(reach))
            }
            Tok::Hex(body) => (hex_regex(&body).map_err(|e| YaraError { line: t.line, col: t.col, message: e })?, None),
            Tok::Regex(body, flags) => {
                let mut alts = Vec::new();
                if m.ascii || !m.wide {
                    alts.push(format!("(?:{body})"));
                }
                if m.wide {
                    alts.push(format!("(?:{})", widen_regex(&body)));
                }
                (format!("(?{}:{})", if flags.contains('s') { "s" } else { "-s" }, alts.join("|")), None)
            }
            _ => return err(&t, "a string, a hex string or a regular expression is expected"),
        };
        let regex = RegexBuilder::new(&pattern)
            .unicode(false)
            .case_insensitive(m.nocase || regex_i)
            .size_limit(64 << 20)
            .build()
            .map_err(|e| YaraError { line: at.line, col: at.col, message: format!("{name}: {e}") })?;
        Ok(StringDef { id: id.to_string(), regex, fullword: m.fullword, private: m.private, xor_first, reach })
    }

    /// A reference to a string of the rule ($a, #a, @a, !a; `$` alone inside `for … of`).
    fn check_string(&self, name: &str, t: &Token) -> Result<(), YaraError> {
        if name.is_empty() {
            return if self.for_of > 0 { Ok(()) } else { err(t, "a string without a name is only valid inside 'for … of'") };
        }
        if name.contains('*') {
            return err(t, format!("${name}: a string set is only valid after 'of'"));
        }
        if !self.cur_strings.iter().any(|s| s == name) {
            return err(t, format!("undefined string identifier ${name}"));
        }
        Ok(())
    }

    // condition grammar: or < and < not/defined < relational < bitor < xor < bitand < shift < additive < multiplicative < unary
    fn expr(&mut self) -> Result<Expr, YaraError> {
        let mut left = self.and()?;
        while self.is_ident("or") {
            self.next();
            left = Expr::Bin("or", Box::new(left), Box::new(self.and()?));
        }
        Ok(left)
    }
    fn and(&mut self) -> Result<Expr, YaraError> {
        let mut left = self.not()?;
        while self.is_ident("and") {
            self.next();
            left = Expr::Bin("and", Box::new(left), Box::new(self.not()?));
        }
        Ok(left)
    }
    fn not(&mut self) -> Result<Expr, YaraError> {
        if self.is_ident("not") {
            self.next();
            return Ok(Expr::Not(Box::new(self.not()?)));
        }
        if self.is_ident("defined") {
            self.next();
            return Ok(Expr::Defined(Box::new(self.not()?)));
        }
        self.relational()
    }
    fn relational(&mut self) -> Result<Expr, YaraError> {
        let left = self.binary(0)?;
        let t = self.peek().clone();
        for op in ["==", "!=", "<=", ">=", "<", ">"] {
            if self.is_punct(op) {
                self.next();
                let right = self.binary(0)?;
                if kind(&left) != kind(&right) {
                    return err(&t, format!("type mismatch: '{op}' between a text and a number"));
                }
                let op: &'static str = ["==", "!=", "<=", ">=", "<", ">"].into_iter().find(|o| *o == op).unwrap();
                return Ok(Expr::Bin(op, Box::new(left), Box::new(right)));
            }
        }
        if let Tok::Ident(word) = &t.tok {
            if let Some(op) = STR_OPS.iter().find(|o| *o == word) {
                self.next();
                let right = self.binary(0)?;
                if kind(&left) != Kind::Str || kind(&right) != Kind::Str {
                    return err(&t, format!("'{op}' needs texts on both sides"));
                }
                return Ok(Expr::Bin(op, Box::new(left), Box::new(right)));
            }
            if word == "matches" {
                self.next();
                let r = self.next();
                let Tok::Regex(body, flags) = r.tok.clone() else { return err(&r, "a regular expression /…/ is expected after 'matches'") };
                if kind(&left) != Kind::Str {
                    return err(&t, "'matches' needs a text on the left");
                }
                let regex = RegexBuilder::new(&format!("(?{}:{body})", if flags.contains('s') { "s" } else { "-s" }))
                    .unicode(false)
                    .case_insensitive(flags.contains('i'))
                    .size_limit(64 << 20)
                    .build()
                    .map_err(|e| YaraError { line: r.line, col: r.col, message: e.to_string() })?;
                return Ok(Expr::Matches(Box::new(left), regex));
            }
        }
        Ok(left)
    }
    fn binary(&mut self, level: usize) -> Result<Expr, YaraError> {
        const LEVELS: &[&[&str]] = &[&["|"], &["^"], &["&"], &["<<", ">>"], &["+", "-"], &["*", "\\", "%"]];
        if level == LEVELS.len() {
            return self.unary();
        }
        let mut left = self.binary(level + 1)?;
        'again: loop {
            for op in LEVELS[level] {
                if self.is_punct(op) {
                    // `N% of them` is a quantifier, not a remainder.
                    if *op == "%" && matches!(self.peek_at(1), Some(Tok::Ident(w)) if w == "of") {
                        return Ok(left);
                    }
                    let t = self.next();
                    let right = self.binary(level + 1)?;
                    if kind(&left) == Kind::Str || kind(&right) == Kind::Str {
                        return err(&t, format!("'{op}' cannot be used with a text"));
                    }
                    left = Expr::Bin(op, Box::new(left), Box::new(right));
                    continue 'again;
                }
            }
            return Ok(left);
        }
    }
    fn unary(&mut self) -> Result<Expr, YaraError> {
        if self.is_punct("-") {
            self.next();
            return Ok(Expr::Neg(Box::new(self.unary()?)));
        }
        if self.is_punct("~") {
            self.next();
            return Ok(Expr::BitNot(Box::new(self.unary()?)));
        }
        self.primary()
    }

    fn range(&mut self) -> Result<(Expr, Expr), YaraError> {
        self.expect("(")?;
        let lo = self.binary(0)?;
        self.expect("..")?;
        let hi = self.binary(0)?;
        self.expect(")")?;
        Ok((lo, hi))
    }

    fn set(&mut self) -> Result<Set, YaraError> {
        if self.is_ident("them") {
            self.next();
            return Ok(Set::Them);
        }
        self.expect("(")?;
        if matches!(self.peek().tok, Tok::Ident(_)) {
            return self.rule_set();
        }
        let mut list = Vec::new();
        loop {
            let t = self.next();
            match t.tok.clone() {
                Tok::Str(s) => {
                    match s.strip_suffix('*') {
                        Some(prefix) => {
                            if !self.cur_strings.iter().any(|id| id.starts_with(prefix)) {
                                return err(&t, format!("no string matches ${s}"));
                            }
                        }
                        None => self.check_string(&s, &t)?,
                    }
                    list.push(s)
                }
                _ => return err(&t, "a string ($name or $prefix*) is expected"),
            }
            if self.is_punct(",") {
                self.next();
                continue;
            }
            self.expect(")")?;
            return Ok(Set::List(list));
        }
    }

    fn quantifier_after(&mut self, q: Quant) -> Result<Expr, YaraError> {
        // `of` has been seen.
        let set = self.set()?;
        Ok(Expr::Of(q, set))
    }

    fn need_module(&self, module: &str, t: &Token) -> Result<(), YaraError> {
        if self.imports.iter().any(|m| m == module) {
            Ok(())
        } else {
            err(t, format!("\"{module}\" is used but not imported (add: import \"{module}\")"))
        }
    }

    /// `(rule1, rule_prefix*)` after `of` (the `(` has been read).
    fn rule_set(&mut self) -> Result<Set, YaraError> {
        let mut names = Vec::new();
        loop {
            let t = self.next();
            let Tok::Ident(name) = t.tok.clone() else { return err(&t, "a rule name (or prefix*) is expected") };
            if self.is_punct("*") {
                self.next();
                let found: Vec<String> = self.rule_names.iter().filter(|r| r.starts_with(&name)).cloned().collect();
                if found.is_empty() {
                    return err(&t, format!("no rule matches {name}*"));
                }
                names.extend(found);
            } else if self.rule_names.contains(&name) {
                names.push(name);
            } else {
                return err(&t, format!("undefined rule \"{name}\""));
            }
            if self.is_punct(",") {
                self.next();
                continue;
            }
            self.expect(")")?;
            return Ok(Set::Rules(names));
        }
    }

    /// A module path (the module name has been read): a value, or an array / dictionary itself.
    fn module_ref(&mut self, module: &str, t: &Token) -> Result<Ref, YaraError> {
        self.need_module(module, t)?;
        let mut path = module.to_string();
        let mut last = t.clone();
        loop {
            if let Some(&(array, _)) = ARRAYS.iter().find(|a| a.0 == path) {
                return self.array_ref(array, Vec::new());
            }
            if let Some(&dict) = DICTS.iter().find(|d| **d == path) {
                if !self.is_punct("[") {
                    return Ok(Ref::Dict(dict));
                }
                self.next();
                let key = self.expr()?;
                self.expect("]")?;
                if kind(&key) != Kind::Str {
                    return err(&last, format!("the key of {dict} must be a text"));
                }
                return Ok(Ref::Expr(Expr::Dict(dict, Box::new(key))));
            }
            if let Some(f) = FUNCS.iter().find(|f| f.0 == path) {
                return Ok(Ref::Expr(self.call(f, &last)?));
            }
            if let Some(&(f, k)) = FIELDS.iter().find(|f| f.0 == path) {
                return Ok(Ref::Expr(Expr::Field(f, k)));
            }
            if let Some((_, v)) = CONSTS.iter().find(|c| c.0 == path) {
                return Ok(Ref::Expr(Expr::Num(*v)));
            }
            if let Some((_, v)) = FLOAT_CONSTS.iter().find(|c| c.0 == path) {
                return Ok(Ref::Expr(Expr::Float(*v)));
            }
            if let Some((_, v)) = STR_CONSTS.iter().find(|c| c.0 == path) {
                return Ok(Ref::Expr(Expr::Text(v.to_vec())));
            }
            if !self.is_punct(".") {
                return err(&last, format!("unknown identifier \"{path}\" (incomplete: a member of it is expected)"));
            }
            self.next();
            last = self.peek().clone();
            let member = self.ident()?;
            path = format!("{path}.{member}");
            if !module_path_exists(&path) {
                return err(&last, format!("unknown identifier \"{path}\": module \"{module}\" has no member \"{member}\""));
            }
        }
    }

    /// At a module array (with the indexes of its parents): `[i]` and what follows, or the array itself.
    fn array_ref(&mut self, mut array: &'static str, mut idx: Vec<Expr>) -> Result<Ref, YaraError> {
        loop {
            if !self.is_punct("[") {
                return Ok(Ref::Array(array, idx));
            }
            let t = self.next();
            let i = self.expr()?;
            self.expect("]")?;
            if kind(&i) != Kind::Num {
                return err(&t, format!("the index of {array} must be a number"));
            }
            idx.push(i);
            match self.elem_member(array, idx)? {
                Member::Done(e) => return Ok(Ref::Expr(e)),
                Member::Nested(n, ix) => {
                    array = n;
                    idx = ix;
                }
            }
        }
    }

    /// After an element of `array` (indexes `idx`, its own last): the value of a scalar array, `.field` or `.nested`.
    fn elem_member(&mut self, array: &'static str, idx: Vec<Expr>) -> Result<Member, YaraError> {
        let fields = ARRAYS.iter().find(|a| a.0 == array).map(|a| a.1).unwrap_or(&[]);
        if let [("", k)] = fields {
            return Ok(Member::Done(Expr::Elem(array, idx, "", *k)));
        }
        self.expect(".")?;
        let ft = self.peek().clone();
        let mut f = self.ident()?;
        // dotted fields (assembly_refs[i].version.major)
        while !fields.iter().any(|x| x.0 == f) && fields.iter().any(|x| x.0.starts_with(&format!("{f}."))) && self.is_punct(".") {
            self.next();
            f = format!("{f}.{}", self.ident()?);
        }
        let nested = format!("{array}.{f}");
        if let Some(&(n, _)) = ARRAYS.iter().find(|a| a.0 == nested) {
            return Ok(Member::Nested(n, idx));
        }
        match fields.iter().find(|x| x.0 == f) {
            Some(&(f, k)) => Ok(Member::Done(Expr::Elem(array, idx, f, k))),
            None => err(&ft, format!("an element of {array} has no field \"{f}\" (fields: {})", fields.iter().map(|x| x.0).collect::<Vec<_>>().join(", "))),
        }
    }

    /// A module name or a loop variable (the name has been read); None for other names.
    fn name_ref(&mut self, name: &str, t: &Token) -> Result<Option<Ref>, YaraError> {
        if let Some((_, vk)) = self.loop_vars.iter().rev().find(|v| v.0 == name).cloned() {
            return Ok(Some(match vk {
                VarKind::Val(k) => Ref::Expr(Expr::Var(name.to_string(), k)),
                VarKind::Elem(array, mut idx) => {
                    idx.push(Expr::Var(name.to_string(), Kind::Num));
                    match self.elem_member(array, idx)? {
                        Member::Done(e) => Ref::Expr(e),
                        Member::Nested(n, ix) => self.array_ref(n, ix)?,
                    }
                }
            }));
        }
        if MODULES.contains(&name) {
            return Ok(Some(self.module_ref(name, t)?));
        }
        Ok(None)
    }

    /// A function argument: an expression or a regular expression.
    fn arg(&mut self) -> Result<Expr, YaraError> {
        if let Tok::Regex(body, flags) = self.peek().tok.clone() {
            let r = self.next();
            let regex = RegexBuilder::new(&format!("(?{}:{body})", if flags.contains('s') { "s" } else { "-s" }))
                .unicode(false)
                .case_insensitive(flags.contains('i'))
                .size_limit(64 << 20)
                .build()
                .map_err(|e| YaraError { line: r.line, col: r.col, message: e.to_string() })?;
            return Ok(Expr::Re(regex));
        }
        self.expr()
    }

    fn call(&mut self, f: &(&'static str, &'static [&'static str], Kind, &'static str), at: &Token) -> Result<Expr, YaraError> {
        let &(name, sigs, ret, usage) = f;
        if !self.is_punct("(") {
            return err(&self.peek().clone(), format!("{name} is a function: {usage}"));
        }
        self.next();
        let mut args = Vec::new();
        if !self.is_punct(")") {
            loop {
                args.push(self.arg()?);
                if !self.is_punct(",") {
                    break;
                }
                self.next();
            }
        }
        self.expect(")")?;
        let sig: String = args.iter().map(|a| match kind(a) { Kind::Num => 'n', Kind::Str => 's', Kind::Re => 'r' }).collect();
        if !sigs.contains(&sig.as_str()) {
            return err(at, format!("wrong arguments: {usage}"));
        }
        Ok(Expr::Call(name, args, ret))
    }

    fn primary(&mut self) -> Result<Expr, YaraError> {
        let t = self.next();
        match t.tok.clone() {
            Tok::Num(n) => {
                if !self.no_of {
                    if self.is_punct("%") && matches!(self.peek_at(1), Some(Tok::Ident(w)) if w == "of") {
                        self.next();
                        self.next();
                        return self.quantifier_after(Quant::Percent(Box::new(Expr::Num(n))));
                    }
                    if self.is_ident("of") {
                        self.next();
                        return self.quantifier_after(Quant::Num(Box::new(Expr::Num(n))));
                    }
                }
                Ok(Expr::Num(n))
            }
            Tok::Float(f) => Ok(Expr::Float(f)),
            Tok::Text(s) => Ok(Expr::Text(text_bytes(&s))),
            Tok::Punct("(") => {
                let saved = std::mem::replace(&mut self.no_of, false);
                let e = self.expr()?;
                self.no_of = saved;
                self.expect(")")?;
                if !self.no_of && self.is_ident("of") {
                    self.next();
                    return self.quantifier_after(Quant::Num(Box::new(e)));
                }
                Ok(e)
            }
            Tok::Str(name) => {
                self.check_string(&name, &t)?;
                if self.is_ident("at") {
                    self.next();
                    return Ok(Expr::FoundAt(name, Box::new(self.binary(0)?)));
                }
                if self.is_ident("in") {
                    self.next();
                    let (lo, hi) = self.range()?;
                    return Ok(Expr::FoundIn(name, Box::new(lo), Box::new(hi)));
                }
                Ok(Expr::Found(name))
            }
            Tok::Count(name) => {
                self.check_string(&name, &t)?;
                if self.is_ident("in") {
                    self.next();
                    let (lo, hi) = self.range()?;
                    return Ok(Expr::CountIn(name, Box::new(lo), Box::new(hi)));
                }
                Ok(Expr::Count(name))
            }
            Tok::At(name) | Tok::Len(name) => {
                self.check_string(&name, &t)?;
                let index = if self.is_punct("[") {
                    self.next();
                    let e = self.expr()?;
                    self.expect("]")?;
                    e
                } else {
                    Expr::Num(1)
                };
                Ok(if matches!(t.tok, Tok::At(_)) { Expr::Offset(name, Box::new(index)) } else { Expr::Length(name, Box::new(index)) })
            }
            Tok::Ident(word) => match word.as_str() {
                "true" => Ok(Expr::Num(1)),
                "false" => Ok(Expr::Num(0)),
                "filesize" => Ok(Expr::Filesize),
                "entrypoint" => Ok(Expr::Entrypoint),
                "them" => err(&t, "'them' must follow 'of'"),
                "all" | "any" | "none" => {
                    let q = match word.as_str() { "all" => Quant::All, "any" => Quant::Any, _ => Quant::None };
                    if !self.is_ident("of") {
                        return err(&self.peek().clone(), "'of' expected");
                    }
                    self.next();
                    self.quantifier_after(q)
                }
                "for" => self.for_loop(),
                f if is_read_fn(f) => {
                    self.expect("(")?;
                    let e = self.expr()?;
                    self.expect(")")?;
                    Ok(Expr::Read(f.to_string(), Box::new(e)))
                }
                name => {
                    match self.name_ref(name, &t)? {
                        Some(Ref::Expr(e)) => return Ok(e),
                        Some(Ref::Array(a, _)) => return err(&t, format!("{a} is an array: use {a}[index]… or 'for … in {a}'")),
                        Some(Ref::Dict(d)) => return err(&t, format!("{d} is a dictionary: use {d}[\"key\"] or 'for … k, v in {d}'")),
                        None => {}
                    }
                    if self.rule_names.iter().any(|r| r == name) {
                        return Ok(Expr::Rule(name.to_string()));
                    }
                    err(&t, format!("undefined identifier \"{name}\""))
                }
            },
            _ => err(&t, "an expression is expected"),
        }
    }

    /// `for` has been read.
    fn for_loop(&mut self) -> Result<Expr, YaraError> {
        let q = if self.is_ident("all") {
            self.next();
            Quant::All
        } else if self.is_ident("any") {
            self.next();
            Quant::Any
        } else if self.is_ident("none") {
            self.next();
            Quant::None
        } else {
            let saved = std::mem::replace(&mut self.no_of, true);
            let e = self.binary(0);
            self.no_of = saved;
            let e = Box::new(e?);
            if self.is_punct("%") {
                self.next();
                Quant::Percent(e)
            } else {
                Quant::Num(e)
            }
        };
        if self.is_ident("of") {
            self.next();
            let st = self.peek().clone();
            let set = self.set()?;
            if matches!(set, Set::Rules(_)) {
                return err(&st, "'for … of' needs a string set ($a, $b*) or them");
            }
            self.expect(":")?;
            self.expect("(")?;
            self.for_of += 1;
            let body = self.expr();
            self.for_of -= 1;
            let body = body?;
            self.expect(")")?;
            return Ok(Expr::ForOf(q, set, Box::new(body)));
        }
        let mut vars = vec![self.ident()?];
        while self.is_punct(",") {
            self.next();
            vars.push(self.ident()?);
        }
        if !self.is_ident("in") {
            return err(&self.peek().clone(), "'in' or 'of' expected");
        }
        self.next();
        let it = self.peek().clone();
        let iter = if let Tok::Ident(name) = it.tok.clone() {
            self.next();
            match self.name_ref(&name, &it)? {
                Some(Ref::Array(a, idx)) => Iter::Array(a, idx),
                Some(Ref::Dict(d)) => Iter::Dict(d),
                Some(Ref::Expr(_)) => return err(&it, "this is not an array or a dictionary"),
                None => return err(&it, "a range (lo..hi), a list (a, b, …), a module array or a module dictionary is expected after 'in'"),
            }
        } else if self.is_punct("(") {
            self.next();
            let first = self.binary(0)?;
            if self.is_punct("..") {
                self.next();
                let hi = self.binary(0)?;
                self.expect(")")?;
                Iter::Range(Box::new(first), Box::new(hi))
            } else {
                let mut items = vec![first];
                while self.is_punct(",") {
                    self.next();
                    items.push(self.binary(0)?);
                }
                self.expect(")")?;
                Iter::List(items)
            }
        } else {
            return err(&it, "a range (lo..hi), a list (a, b, …), a module array or a module dictionary is expected after 'in'");
        };
        let items_ok = match &iter {
            Iter::Range(lo, hi) => kind(lo) == Kind::Num && kind(hi) == Kind::Num,
            Iter::List(list) => list.iter().all(|e| kind(e) == Kind::Num),
            _ => true,
        };
        if !items_ok {
            return err(&it, "'for … in' iterates over numbers");
        }
        let kinds = match &iter {
            Iter::Dict(_) => vec![VarKind::Val(Kind::Str), VarKind::Val(Kind::Str)],
            Iter::Array(array, idx) => vec![VarKind::Elem(array, idx.clone())],
            _ => vec![VarKind::Val(Kind::Num)],
        };
        if kinds.len() != vars.len() {
            return err(&it, format!("this iterator gives {} variable(s), {} given", kinds.len(), vars.len()));
        }
        self.expect(":")?;
        self.expect("(")?;
        let depth = self.loop_vars.len();
        self.loop_vars.extend(vars.iter().cloned().zip(kinds));
        let body = self.expr();
        self.loop_vars.truncate(depth);
        let body = body?;
        self.expect(")")?;
        Ok(Expr::ForIn(q, vars, iter, Box::new(body)))
    }
}

fn t_line(toks: &[Token], pos: usize) -> usize {
    toks.get(pos).map(|t| t.line).unwrap_or(0)
}

fn is_read_fn(name: &str) -> bool {
    matches!(name, "uint8" | "uint16" | "uint32" | "int8" | "int16" | "int32" | "uint16be" | "uint32be" | "int16be" | "int32be" | "uint8be" | "int8be")
}

/// Text from the lexer: private-use characters U+F0000..U+F00FF are raw \xHH bytes, the rest UTF-8.
fn text_bytes(s: &str) -> Vec<u8> {
    let mut out = Vec::new();
    for c in s.chars() {
        let n = c as u32;
        if (0xF0000..=0xF00FF).contains(&n) {
            out.push((n - 0xF0000) as u8);
        } else {
            let mut buf = [0u8; 4];
            out.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());
        }
    }
    out
}

fn lit(b: &[u8]) -> String {
    b.iter().map(|x| format!("\\x{x:02X}")).collect()
}

fn widen(b: &[u8]) -> Vec<u8> {
    b.iter().flat_map(|&x| [x, 0]).collect()
}

/// Base64 without padding.
fn b64_encode(data: &[u8], alphabet: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..=c.len() {
            out.push(alphabet[(n >> (18 - 6 * i)) as usize & 63]);
        }
    }
    out
}

/// The parts of the base64 encodings of `s` (at offsets 0, 1, 2 within a 3-byte group) that do not depend on the
/// bytes around it.
fn base64_variants(s: &[u8], alphabet: &[u8]) -> Vec<Vec<u8>> {
    (0..3)
        .filter_map(|i| {
            let mut d = vec![0u8; i];
            d.extend_from_slice(s);
            let enc = b64_encode(&d, alphabet);
            let lead = [0, 2, 3][i];
            let trail = usize::from(d.len() % 3 != 0);
            (enc.len() > lead + trail).then(|| enc[lead..enc.len() - trail].to_vec())
        })
        .collect()
}

/// A regular expression for wide text: every atom (literal, class, `.`, escape) followed by a zero byte.
fn widen_regex(re: &str) -> String {
    let c: Vec<char> = re.chars().collect();
    let mut out = String::new();
    let atom = |out: &mut String, a: &[char]| {
        out.push_str("(?:");
        out.extend(a);
        out.push_str("\\x00)");
    };
    let mut i = 0;
    while i < c.len() {
        let start = i;
        match c[i] {
            '\\' => {
                let e = c.get(i + 1).copied().unwrap_or('\\');
                i += 2;
                if e == 'x' {
                    if c.get(i) == Some(&'{') {
                        while i < c.len() && c[i] != '}' {
                            i += 1;
                        }
                        i += 1;
                    } else {
                        i += 2;
                    }
                }
                i = i.min(c.len());
                if matches!(e, 'b' | 'B' | 'A' | 'z') {
                    out.extend(&c[start..i]);
                } else {
                    atom(&mut out, &c[start..i]);
                }
            }
            '[' => {
                i += 1;
                if c.get(i) == Some(&'^') {
                    i += 1;
                }
                if c.get(i) == Some(&']') {
                    i += 1;
                }
                while i < c.len() && c[i] != ']' {
                    if c[i] == '\\' {
                        i += 2;
                    } else if c[i] == '[' && c.get(i + 1) == Some(&':') {
                        while i < c.len() && !(c[i] == ':' && c.get(i + 1) == Some(&']')) {
                            i += 1;
                        }
                        i += 2;
                    } else {
                        i += 1;
                    }
                }
                i = (i + 1).min(c.len());
                atom(&mut out, &c[start..i]);
            }
            '(' => {
                i += 1;
                if c.get(i) == Some(&'?') {
                    while i < c.len() && !matches!(c[i], ':' | ')' | '>') {
                        i += 1;
                    }
                    i = (i + 1).min(c.len());
                }
                out.extend(&c[start..i]);
            }
            '{' => {
                let mut j = i + 1;
                while j < c.len() && (c[j].is_ascii_digit() || c[j] == ',') {
                    j += 1;
                }
                if j > i + 1 && c.get(j) == Some(&'}') {
                    out.extend(&c[i..=j]);
                    i = j + 1;
                } else {
                    i += 1;
                    atom(&mut out, &c[start..i]);
                }
            }
            ')' | '|' | '^' | '$' | '*' | '+' | '?' => {
                out.push(c[i]);
                i += 1;
            }
            _ => {
                i += 1;
                atom(&mut out, &c[start..i]);
            }
        }
    }
    out
}

/// A YARA hex string as a byte regular expression.
fn hex_regex(body: &str) -> Result<String, String> {
    let chars: Vec<char> = body.chars().filter(|c| !c.is_whitespace()).collect();
    let mut out = String::new();
    let mut i = 0;
    let mut depth = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '(' => {
                out.push_str("(?:");
                depth += 1;
                i += 1;
            }
            ')' => {
                if depth == 0 {
                    return Err("')' without '('".into());
                }
                out.push(')');
                depth -= 1;
                i += 1;
            }
            '|' => {
                out.push('|');
                i += 1;
            }
            '[' => {
                let end = chars[i..].iter().position(|&x| x == ']').ok_or("']' is missing")? + i;
                let inner: String = chars[i + 1..end].iter().collect();
                let (lo, hi) = match inner.split_once('-') {
                    None => (inner.clone(), inner.clone()),
                    Some((a, b)) => (if a.is_empty() { "0".into() } else { a.to_string() }, b.to_string()),
                };
                let lo: usize = lo.parse().map_err(|_| format!("bad jump [{inner}]"))?;
                if hi.is_empty() {
                    out.push_str(&format!("(?s:.){{{lo},}}"));
                } else {
                    let hi: usize = hi.parse().map_err(|_| format!("bad jump [{inner}]"))?;
                    if hi < lo {
                        return Err(format!("bad jump [{inner}]"));
                    }
                    out.push_str(&format!("(?s:.){{{lo},{hi}}}"));
                }
                i = end + 1;
            }
            _ => {
                let a = c;
                let b = *chars.get(i + 1).ok_or("a hex byte needs two digits")?;
                let class = |hi: Option<u8>, lo: Option<u8>| -> String {
                    let mut s = String::from("[");
                    for v in 0..=255u8 {
                        if hi.is_none_or(|h| v >> 4 == h) && lo.is_none_or(|l| v & 15 == l) {
                            s.push_str(&format!("\\x{v:02X}"));
                        }
                    }
                    s.push(']');
                    s
                };
                let hv = if a == '?' { None } else { Some(a.to_digit(16).ok_or_else(|| format!("not a hex digit: {a}"))? as u8) };
                let lv = if b == '?' { None } else { Some(b.to_digit(16).ok_or_else(|| format!("not a hex digit: {b}"))? as u8) };
                match (hv, lv) {
                    (Some(h), Some(l)) => out.push_str(&format!("\\x{:02X}", (h << 4) | l)),
                    (None, None) => out.push_str("(?s:.)"),
                    _ => out.push_str(&class(hv, lv)),
                }
                i += 2;
            }
        }
    }
    if depth != 0 {
        return Err("'(' without ')'".into());
    }
    if out.is_empty() {
        return Err("empty hex string".into());
    }
    Ok(out)
}

/// Compiles the rule text: the rules that compiled and the errors.
fn compile(text: &str) -> (Vec<Rule>, Vec<YaraError>) {
    let (toks, mut errors) = lex(text);
    // Rule names first, so conditions can refer to them (also to later rules).
    let mut names = Vec::new();
    for w in toks.windows(2) {
        if w[0].tok == Tok::Ident("rule".into()) {
            if let Tok::Ident(n) = &w[1].tok {
                names.push(n.clone());
            }
        }
    }
    // `import "…"` (known modules only) and `include "…"` (not supported).
    let mut imports = Vec::new();
    let mut kept = Vec::new();
    let mut i = 0;
    while i < toks.len() {
        if let (Tok::Ident(w), Some(Token { tok: Tok::Text(m), line, col })) = (&toks[i].tok, toks.get(i + 1)) {
            if w == "import" {
                if MODULES.contains(&m.as_str()) {
                    imports.push(m.clone());
                } else {
                    errors.push(YaraError { line: *line, col: *col, message: format!("unknown module \"{m}\" (supported: {})", MODULES.join(", ")) });
                }
                i += 2;
                continue;
            }
            if w == "include" {
                errors.push(YaraError { line: toks[i].line, col: toks[i].col, message: "include is not supported: paste the included rules into the text".into() });
                i += 2;
                continue;
            }
        }
        kept.push(toks[i].clone());
        i += 1;
    }
    let mut p = Parser { toks: kept, pos: 0, rule_names: names, imports, cur_strings: Vec::new(), loop_vars: Vec::new(), for_of: 0, no_of: false };
    let mut rules = Vec::new();
    while p.peek().tok != Tok::Eof {
        let start = p.pos;
        match p.rule() {
            Ok(r) => rules.push(r),
            Err(e) => {
                errors.push(e);
                // Skip to the next rule.
                if p.pos == start {
                    p.next();
                }
                while p.peek().tok != Tok::Eof && !matches!(&p.peek().tok, Tok::Ident(w) if w == "rule" || w == "private" || w == "global") {
                    p.next();
                }
            }
        }
    }
    (rules, errors)
}

// ───────────── matching and evaluation

/// A value in a condition. Undef: YARA's undefined (a missing field, a read past the end, …).
#[derive(Clone, Debug)]
enum Val {
    Int(i64),
    Float(f64),
    Str(Vec<u8>),
    /// a regular expression argument
    Re(Regex),
    Undef,
}

impl PartialEq for Val {
    fn eq(&self, other: &Val) -> bool {
        match (self, other) {
            (Val::Int(a), Val::Int(b)) => a == b,
            (Val::Float(a), Val::Float(b)) => a == b,
            (Val::Str(a), Val::Str(b)) => a == b,
            (Val::Re(a), Val::Re(b)) => a.as_str() == b.as_str(),
            (Val::Undef, Val::Undef) => true,
            _ => false,
        }
    }
}

impl Val {
    fn truthy(&self) -> bool {
        match self {
            Val::Int(v) => *v != 0,
            Val::Float(f) => *f != 0.0,
            Val::Str(s) => !s.is_empty(),
            Val::Re(_) => true,
            Val::Undef => false,
        }
    }
    fn int(&self) -> Option<i64> {
        match self {
            Val::Int(v) => Some(*v),
            Val::Float(f) => Some(*f as i64),
            _ => None,
        }
    }
    fn float(&self) -> f64 {
        match self {
            Val::Int(v) => *v as f64,
            Val::Float(f) => *f,
            _ => f64::NAN,
        }
    }
}

fn bv(b: bool) -> Val {
    Val::Int(b as i64)
}

fn binop(op: &str, x: Val, y: Val) -> Result<Val, String> {
    use Val::*;
    if x == Undef || y == Undef {
        return Ok(Undef);
    }
    if let (Str(a), Str(b)) = (&x, &y) {
        let (la, lb) = (a.to_ascii_lowercase(), b.to_ascii_lowercase());
        let contains = |h: &[u8], n: &[u8]| n.is_empty() || h.windows(n.len()).any(|w| w == n);
        return Ok(bv(match op {
            "==" => a == b,
            "!=" => a != b,
            "<" => a < b,
            "<=" => a <= b,
            ">" => a > b,
            ">=" => a >= b,
            "contains" => contains(a, b),
            "icontains" => contains(&la, &lb),
            "startswith" => a.starts_with(b),
            "istartswith" => la.starts_with(&lb),
            "endswith" => a.ends_with(b),
            "iendswith" => la.ends_with(&lb),
            "iequals" => la == lb,
            _ => return Err(format!("'{op}' cannot be used with texts")),
        }));
    }
    if matches!(x, Str(_)) || matches!(y, Str(_)) {
        return Err(format!("type mismatch: '{op}' between a text and a number"));
    }
    if let (Int(x), Int(y)) = (&x, &y) {
        let (x, y) = (*x, *y);
        return Ok(match op {
            "+" => Int(x.wrapping_add(y)),
            "-" => Int(x.wrapping_sub(y)),
            "*" => Int(x.wrapping_mul(y)),
            "\\" => if y == 0 { Undef } else { Int(x.wrapping_div(y)) },
            "%" => if y == 0 { Undef } else { Int(x.wrapping_rem(y)) },
            "&" => Int(x & y),
            "|" => Int(x | y),
            "^" => Int(x ^ y),
            "<<" => Int(if (0..64).contains(&y) { x << y } else { 0 }),
            ">>" => Int(if (0..64).contains(&y) { x >> y } else { 0 }),
            "==" => bv(x == y),
            "!=" => bv(x != y),
            "<" => bv(x < y),
            "<=" => bv(x <= y),
            ">" => bv(x > y),
            ">=" => bv(x >= y),
            _ => return Err(format!("unknown operator {op}")),
        });
    }
    let (a, b) = (x.float(), y.float());
    Ok(match op {
        "+" => Float(a + b),
        "-" => Float(a - b),
        "*" => Float(a * b),
        "\\" => if b == 0.0 { Undef } else { Float(a / b) },
        "==" => bv(a == b),
        "!=" => bv(a != b),
        "<" => bv(a < b),
        "<=" => bv(a <= b),
        ">" => bv(a > b),
        ">=" => bv(a >= b),
        _ => return Err(format!("'{op}' needs integers")),
    })
}

/// The data of a math / hash call: a range or a text, and the other arguments.
type DataArgs<'x> = (Option<(u64, u64)>, Option<&'x [u8]>, &'x [Val]);

struct Ctx<'a, 'p, 'q> {
    src: &'a dyn Bytes,
    /// progress of math / hash ranges read during evaluation (also cancels)
    progress: &'p mut Progress<'q>,
    /// string id per rule → matches (offset, length)
    found: HashMap<(usize, String), Vec<(u64, u64)>>,
    results: HashMap<String, bool>,
    entry: i64,
    /// loop variables
    vars: HashMap<String, Val>,
    /// the string `$` stands for inside `for … of`
    current: Option<String>,
    /// the module data, parsed when first needed
    pe: Option<Option<Pe>>,
    elf: Option<Option<Elf>>,
    macho: Option<Option<macho_module::MachO>>,
    dotnet: Option<Option<dotnet_module::Dotnet>>,
    dex: Option<Option<dex_module::Dex>>,
    /// magic.type() / mime_type()
    magic: Option<(Vec<u8>, Vec<u8>)>,
    /// statistics of ranges (math) and hash results (rules are evaluated more than once)
    stats: HashMap<(u64, u64), Stats>,
    cache: HashMap<String, Val>,
    /// console.log / console.hex lines of the current evaluation round
    log: Vec<String>,
    /// time.now()
    now: Option<i64>,
}

fn entrypoint(src: &dyn Bytes) -> i64 {
    let read = |o: u64, n: usize| -> Option<Vec<u8>> {
        if o.checked_add(n as u64)? > src.len() {
            return None;
        }
        let mut b = vec![0u8; n];
        src.read(o, &mut b).ok()?;
        Some(b)
    };
    let u16le = |o| read(o, 2).map(|b| u16::from_le_bytes([b[0], b[1]]) as u64);
    let u32le = |o| read(o, 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as u64);
    let head = read(0, 4).unwrap_or_default();
    if head.starts_with(b"MZ") {
        let Some(pe) = u32le(0x3C) else { return 0 };
        if read(pe, 4).as_deref() != Some(b"PE\0\0") {
            return 0;
        }
        let (Some(sections), Some(opt_size), Some(rva)) = (u16le(pe + 6), u16le(pe + 20), u32le(pe + 0x28)) else { return 0 };
        let table = pe + 24 + opt_size;
        for s in 0..sections {
            let at = table + s * 40;
            let (Some(vsize), Some(va), Some(raw_size), Some(raw)) = (u32le(at + 8), u32le(at + 12), u32le(at + 16), u32le(at + 20)) else { break };
            if rva >= va && rva < va + vsize.max(raw_size) {
                return (rva - va + raw) as i64;
            }
        }
        return rva as i64;
    }
    if head == b"\x7FELF" {
        let b = read(0, 64).unwrap_or_default();
        if b.len() < 52 {
            return 0;
        }
        let is64 = b[4] == 2;
        let le = b[5] == 1;
        let rd = |o: usize, n: usize| -> u64 {
            let s = &b[o..o + n];
            let mut v = 0u64;
            for i in 0..n {
                v |= (if le { s[i] } else { s[n - 1 - i] } as u64) << (8 * i);
            }
            v
        };
        let entry = if is64 { rd(24, 8) } else { rd(24, 4) };
        let (phoff, phentsize, phnum) = if is64 { (rd(32, 8), rd(54, 2), rd(56, 2)) } else { (rd(28, 4), rd(42, 2), rd(44, 2)) };
        let need = if is64 { 40 } else { 20 };
        if phentsize < need {
            return 0;
        }
        for i in 0..phnum.min(64) {
            let Some(ph) = phoff.checked_add(i * phentsize).and_then(|o| read(o, phentsize as usize)) else { break };
            let g = |o: usize, n: usize| -> u64 {
                let s = &ph[o..o + n];
                let mut v = 0u64;
                for k in 0..n {
                    v |= (if le { s[k] } else { s[n - 1 - k] } as u64) << (8 * k);
                }
                v
            };
            let (ptype, off, vaddr, filesz) = if is64 { (g(0, 4), g(8, 8), g(16, 8), g(32, 8)) } else { (g(0, 4), g(4, 4), g(8, 4), g(16, 4)) };
            if ptype == 1 && entry >= vaddr && entry - vaddr < filesz {
                return (entry - vaddr).wrapping_add(off) as i64;
            }
        }
        return 0;
    }
    0
}

fn is_word(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

impl Ctx<'_, '_, '_> {
    fn ids_of(&self, rule: &Rule, set: &Set) -> Vec<String> {
        match set {
            Set::Them => rule.strings.iter().map(|s| s.id.clone()).collect(),
            Set::Rules(_) => Vec::new(),
            Set::List(list) => {
                let mut out = Vec::new();
                for item in list {
                    if let Some(prefix) = item.strip_suffix('*') {
                        out.extend(rule.strings.iter().filter(|s| s.id.starts_with(prefix)).map(|s| s.id.clone()));
                    } else {
                        out.push(item.clone());
                    }
                }
                out
            }
        }
    }

    fn string_id(&self, name: &str) -> Result<String, String> {
        if name.is_empty() {
            return self.current.clone().ok_or_else(|| "'$' is only valid inside 'for … of'".to_string());
        }
        Ok(name.to_string())
    }

    fn hits(&self, rule_index: usize, name: &str) -> Result<&[(u64, u64)], String> {
        let id = self.string_id(name)?;
        self.found.get(&(rule_index, id.clone())).map(|v| v.as_slice()).ok_or_else(|| format!("${id} is not defined"))
    }

    fn pe(&mut self) -> Option<&Pe> {
        if self.pe.is_none() {
            self.pe = Some(pe_module::parse(self.src));
        }
        self.pe.as_ref().and_then(|p| p.as_ref())
    }

    fn elf(&mut self) -> Option<&Elf> {
        if self.elf.is_none() {
            self.elf = Some(elf_module::parse(self.src));
        }
        self.elf.as_ref().and_then(|e| e.as_ref())
    }

    fn field(&mut self, path: &str) -> Val {
        match path.split_once('.') {
            Some(("pe", f)) => pe_module::field(self.pe(), f),
            Some(("elf", f)) => elf_module::field(self.elf(), f),
            Some(("macho", f)) => macho_module::field(self.macho(), f),
            Some(("dotnet", f)) => dotnet_module::field(self.dotnet(), f),
            Some(("dex", f)) => dex_module::field(self.dex(), f),
            _ => Val::Undef,
        }
    }

    fn macho(&mut self) -> Option<&macho_module::MachO> {
        if self.macho.is_none() {
            self.macho = Some(macho_module::parse(self.src));
        }
        self.macho.as_ref().and_then(|m| m.as_ref())
    }

    fn dotnet(&mut self) -> Option<&dotnet_module::Dotnet> {
        if self.dotnet.is_none() {
            let src = self.src;
            let d = self.pe().and_then(|p| dotnet_module::parse(src, p));
            self.dotnet = Some(d);
        }
        self.dotnet.as_ref().and_then(|d| d.as_ref())
    }

    fn dex(&mut self) -> Option<&dex_module::Dex> {
        if self.dex.is_none() {
            self.dex = Some(dex_module::parse(self.src));
        }
        self.dex.as_ref().and_then(|d| d.as_ref())
    }

    /// The number of elements of a module array (None: the data is not of that type). `prefix`: the indexes of the
    /// parent elements of a nested array.
    fn array_len(&mut self, array: &str, prefix: &[usize]) -> Option<usize> {
        match array.split_once('.') {
            Some(("pe", a)) => self.pe().map(|p| pe_module::len(p, a, prefix)),
            Some(("elf", a)) => self.elf().map(|e| elf_module::len(e, a)),
            Some(("macho", a)) => self.macho().map(|m| macho_module::len(m, a, prefix)),
            Some(("dotnet", a)) => self.dotnet().map(|d| dotnet_module::len(d, a)),
            Some(("dex", a)) => self.dex().map(|d| dex_module::len(d, a)),
            _ => None,
        }
    }

    fn elem(&mut self, array: &str, idx: &[usize], f: &str) -> Val {
        match array.split_once('.') {
            Some(("pe", a)) => self.pe().map_or(Val::Undef, |p| pe_module::elem(p, a, idx, f)),
            Some(("elf", a)) => self.elf().map_or(Val::Undef, |e| elf_module::elem(e, a, idx[0], f)),
            Some(("macho", a)) => self.macho().map_or(Val::Undef, |m| macho_module::elem(m, a, idx, f)),
            Some(("dotnet", a)) => self.dotnet().map_or(Val::Undef, |d| dotnet_module::elem(d, a, idx[0], f)),
            Some(("dex", a)) => self.dex().map_or(Val::Undef, |d| dex_module::elem(d, a, idx[0], f)),
            _ => Val::Undef,
        }
    }

    /// The entries of a module dictionary (None: the data is not of that type).
    fn dict_entries(&mut self, dict: &str) -> Option<Vec<(Vec<u8>, Vec<u8>)>> {
        match dict {
            "pe.version_info" => self.pe().map(|p| pe_module::dict_entries(p).to_vec()),
            _ => None,
        }
    }

    fn dict_get(&mut self, dict: &str, key: &[u8]) -> Val {
        match dict {
            "pe.version_info" => self.pe().map_or(Val::Undef, |p| pe_module::dict(p, key)),
            _ => Val::Undef,
        }
    }

    fn quant_ok(&mut self, q: &Quant, n_true: usize, total: usize, ri: usize, rule: &Rule) -> Result<bool, String> {
        Ok(match q {
            Quant::All => n_true == total,
            Quant::Any => n_true > 0,
            Quant::None => n_true == 0,
            Quant::Num(e) => self.eval(e, ri, rule)?.int().is_some_and(|n| n_true as i64 >= n),
            Quant::Percent(e) => total > 0 && self.eval(e, ri, rule)?.int().is_some_and(|p| (n_true as i64) * 100 >= p * total as i64),
        })
    }

    /// math / hash functions over a range of the data (read with progress) or over a text.
    fn data_call(&mut self, name: &str, a: &[Val]) -> Result<Val, String> {
        use Val::*;
        let len = self.src.len();
        let range = |o: &Val, n: &Val| match (o.int(), n.int()) {
            (Some(o), Some(n)) if o >= 0 && n >= 0 && (o as u64) <= len => Some((o as u64, (n as u64).min(len - o as u64))),
            _ => None,
        };
        let whole = Some((0, len));
        // the data (a range or a text) and the other arguments
        let (span, text, extra): DataArgs = match (name, a) {
            ("math.count" | "math.percentage", [_]) => (whole, None, a),
            ("math.count" | "math.percentage", [_, o, n]) => (range(o, n), None, &a[..1]),
            ("math.mode", []) => (whole, None, a),
            ("math.deviation", [Str(s), _]) => (None, Some(s.as_slice()), &a[1..]),
            ("math.deviation", [o, n, _]) => (range(o, n), None, &a[2..]),
            (_, [Str(s)]) => (None, Some(s.as_slice()), &[]),
            (_, [o, n]) => (range(o, n), None, &[]),
            _ => return Err(format!("{name}: wrong arguments")),
        };
        if span.is_none() && text.is_none() {
            return Ok(Undef);
        }
        if let Some(alg) = name.strip_prefix("hash.") {
            let key = format!("{alg}{span:?}{text:?}");
            if let Some(v) = self.cache.get(&key) {
                return Ok(v.clone());
            }
            let hex = match (span, text) {
                (Some((o, n)), _) => {
                    let r = crate::hash::hash(self.src, &json!({ "offset": o, "length": n, "algorithms": [alg] }), &mut *self.progress)?;
                    r["results"][0]["value"].as_str().unwrap_or_default().to_string()
                }
                (None, t) => crate::hash::digest_bytes(alg, t.unwrap_or_default())?,
            };
            let v = if alg == "crc32" { Int(i64::from_str_radix(&hex, 16).map_err(|e| e.to_string())?) } else { Str(hex.into_bytes()) };
            self.cache.insert(key, v.clone());
            return Ok(v);
        }
        let f = &name["math.".len()..];
        Ok(match (span, text) {
            (Some(r), _) => {
                if !self.stats.contains_key(&r) {
                    let s = math_module::of_range(self.src, r.0, r.1, &mut *self.progress)?;
                    self.stats.insert(r, s);
                }
                math_module::stat(f, &self.stats[&r], extra)
            }
            (None, t) => math_module::stat(f, &math_module::of_bytes(t.unwrap_or_default()), extra),
        })
    }

    /// A module function with defined arguments.
    fn call(&mut self, name: &str, vals: &[Val]) -> Result<Val, String> {
        use Val::*;
        let (module, f) = name.split_once('.').unwrap_or((name, ""));
        Ok(match module {
            "pe" => match self.pe() {
                Some(p) => pe_module::call(p, f, vals),
                None => Undef,
            },
            "math" | "hash" if DATA_FUNCS.contains(&name) => self.data_call(name, vals)?,
            "math" => math_module::pure(f, vals),
            "console" => {
                let show = |v: &Val| match v {
                    Str(s) => String::from_utf8_lossy(s).into_owned(),
                    Int(i) => i.to_string(),
                    Float(x) => format!("{x:.6}"),
                    _ => String::new(),
                };
                let line = match (f, vals) {
                    ("hex", [Int(n)]) => format!("0x{n:x}"),
                    ("hex", [s, Int(n)]) => format!("{}0x{n:x}", show(s)),
                    _ => vals.iter().map(show).collect(),
                };
                self.log.push(line);
                Int(1)
            }
            "time" => self.now.map_or(Undef, Int),
            "macho" => self.macho().map_or(Undef, |m| macho_module::call(m, f, vals)),
            "dotnet" => self.dotnet().map_or(Undef, |d| dotnet_module::call(d, f, vals)),
            "dex" => self.dex().map_or(Undef, |d| dex_module::call(d, f, vals)),
            "magic" => {
                if self.magic.is_none() {
                    let d = crate::magic::detect(self.src, &json!({}))?;
                    let text = |k: &str| d[k].as_str().unwrap_or_default().to_string();
                    let details = text("details");
                    let description = if details.is_empty() { text("name") } else { format!("{}, {details}", text("name")) };
                    self.magic = Some((description.into_bytes(), text("mime").into_bytes()));
                }
                let (description, mime) = self.magic.clone().unwrap_or_default();
                Str(if f == "type" { description } else { mime })
            }
            _ => Undef,
        })
    }

    /// Array indexes (None when one is undefined or negative).
    fn indexes(&mut self, index: &[Expr], ri: usize, rule: &Rule) -> Result<Option<Vec<usize>>, String> {
        let mut idx = Vec::with_capacity(index.len());
        for i in index {
            match self.eval(i, ri, rule)?.int() {
                Some(i) if i >= 0 => idx.push(i as usize),
                _ => return Ok(None),
            }
        }
        Ok(Some(idx))
    }

    fn eval(&mut self, e: &Expr, ri: usize, rule: &Rule) -> Result<Val, String> {
        use Val::*;
        Ok(match e {
            Expr::Num(n) => Int(*n),
            Expr::Float(f) => Float(*f),
            Expr::Text(s) => Str(s.clone()),
            Expr::Re(r) => Re(r.clone()),
            Expr::Filesize => Int(self.src.len() as i64),
            Expr::Entrypoint => Int(self.entry),
            Expr::Var(name, _) => self.vars.get(name).cloned().ok_or_else(|| format!("unknown name {name}"))?,
            Expr::Found(s) => bv(!self.hits(ri, s)?.is_empty()),
            Expr::FoundAt(s, at) => match self.eval(at, ri, rule)?.int() {
                Some(at) => bv(self.hits(ri, s)?.iter().any(|m| m.0 as i64 == at)),
                None => Undef,
            },
            Expr::FoundIn(s, lo, hi) => match (self.eval(lo, ri, rule)?.int(), self.eval(hi, ri, rule)?.int()) {
                (Some(lo), Some(hi)) => bv(self.hits(ri, s)?.iter().any(|m| (m.0 as i64) >= lo && (m.0 as i64) <= hi)),
                _ => Undef,
            },
            Expr::Count(s) => Int(self.hits(ri, s)?.len() as i64),
            Expr::CountIn(s, lo, hi) => match (self.eval(lo, ri, rule)?.int(), self.eval(hi, ri, rule)?.int()) {
                (Some(lo), Some(hi)) => Int(self.hits(ri, s)?.iter().filter(|m| (m.0 as i64) >= lo && (m.0 as i64) <= hi).count() as i64),
                _ => Undef,
            },
            Expr::Offset(s, i) | Expr::Length(s, i) => {
                let Some(i) = self.eval(i, ri, rule)?.int() else { return Ok(Undef) };
                let hits = self.hits(ri, s)?;
                match (i >= 1).then(|| hits.get(i as usize - 1)).flatten() {
                    Some(m) => Int(if matches!(e, Expr::Offset(..)) { m.0 as i64 } else { m.1 as i64 }),
                    None => Undef,
                }
            }
            Expr::Read(f, at) => {
                let Some(at) = self.eval(at, ri, rule)?.int() else { return Ok(Undef) };
                let width = if f.contains("32") { 4 } else if f.contains("16") { 2 } else { 1 };
                if at < 0 || at as u64 + width > self.src.len() {
                    return Ok(Undef);
                }
                let mut buf = vec![0u8; width as usize];
                self.src.read(at as u64, &mut buf)?;
                let mut v: u64 = 0;
                for k in 0..width as usize {
                    let byte = if f.ends_with("be") { buf[k] } else { buf[width as usize - 1 - k] };
                    v = (v << 8) | byte as u64;
                }
                if f.starts_with("int") {
                    let shift = 64 - 8 * width;
                    Int(((v << shift) as i64) >> shift)
                } else {
                    Int(v as i64)
                }
            }
            Expr::Rule(name) => bv(*self.results.get(name).unwrap_or(&false)),
            Expr::Not(x) => match self.eval(x, ri, rule)? {
                Undef => Undef,
                v => bv(!v.truthy()),
            },
            Expr::Defined(x) => bv(self.eval(x, ri, rule)? != Undef),
            Expr::Neg(x) => match self.eval(x, ri, rule)? {
                Int(v) => Int(v.wrapping_neg()),
                Float(f) => Float(-f),
                Undef => Undef,
                _ => return Err("'-' needs a number".into()),
            },
            Expr::BitNot(x) => match self.eval(x, ri, rule)? {
                Int(v) => Int(!v),
                Undef => Undef,
                _ => return Err("'~' needs an integer".into()),
            },
            Expr::Bin(op, l, r) => {
                if *op == "and" {
                    return Ok(bv(self.eval(l, ri, rule)?.truthy() && self.eval(r, ri, rule)?.truthy()));
                }
                if *op == "or" {
                    return Ok(bv(self.eval(l, ri, rule)?.truthy() || self.eval(r, ri, rule)?.truthy()));
                }
                let (x, y) = (self.eval(l, ri, rule)?, self.eval(r, ri, rule)?);
                binop(op, x, y)?
            }
            Expr::Matches(x, re) => match self.eval(x, ri, rule)? {
                Str(s) => bv(re.is_match(&s)),
                Undef => Undef,
                _ => return Err("'matches' needs a text".into()),
            },
            Expr::Field(path, _) => self.field(path),
            Expr::Elem(array, index, field, _) => {
                let Some(idx) = self.indexes(index, ri, rule)? else { return Ok(Undef) };
                self.elem(array, &idx, field)
            }
            Expr::Dict(dict, key) => match self.eval(key, ri, rule)? {
                Str(k) => self.dict_get(dict, &k),
                _ => Undef,
            },
            Expr::Call(name, args, _) => {
                let mut vals = Vec::with_capacity(args.len());
                for a in args {
                    vals.push(self.eval(a, ri, rule)?);
                }
                if vals.contains(&Undef) {
                    return Ok(Undef);
                }
                self.call(name, &vals)?
            }
            Expr::Of(q, Set::Rules(names)) => {
                let n = names.iter().filter(|r| self.results.get(*r).copied().unwrap_or(false)).count();
                bv(self.quant_ok(q, n, names.len(), ri, rule)?)
            }
            Expr::Of(q, set) => {
                let ids = self.ids_of(rule, set);
                let mut n = 0;
                for id in &ids {
                    if !self.hits(ri, id)?.is_empty() {
                        n += 1;
                    }
                }
                bv(self.quant_ok(q, n, ids.len(), ri, rule)?)
            }
            Expr::ForOf(q, set, body) => {
                let ids = self.ids_of(rule, set);
                let saved = self.current.clone();
                let mut n = 0;
                for id in &ids {
                    self.current = Some(id.clone());
                    let v = self.eval(body, ri, rule);
                    if v.as_ref().is_ok_and(Val::truthy) {
                        n += 1;
                    }
                    if let Err(e) = v {
                        self.current = saved;
                        return Err(e);
                    }
                }
                self.current = saved;
                bv(self.quant_ok(q, n, ids.len(), ri, rule)?)
            }
            Expr::ForIn(q, vars, iter, body) => {
                let (total, items): (usize, Box<dyn Iterator<Item = Vec<Val>>>) = match iter {
                    Iter::Range(lo, hi) => {
                        let (Some(lo), Some(hi)) = (self.eval(lo, ri, rule)?.int(), self.eval(hi, ri, rule)?.int()) else { return Ok(Undef) };
                        if hi.saturating_sub(lo) > 1_000_000 {
                            return Err("the range of 'for … in' is too large".into());
                        }
                        ((hi - lo + 1).max(0) as usize, Box::new((lo..=hi).map(|i| vec![Int(i)])))
                    }
                    Iter::List(list) => {
                        let mut v = Vec::new();
                        for x in list {
                            if let Some(n) = self.eval(x, ri, rule)?.int() {
                                v.push(vec![Int(n)]);
                            }
                        }
                        (v.len(), Box::new(v.into_iter()))
                    }
                    Iter::Array(array, prefix) => match self.indexes(prefix, ri, rule)?.and_then(|p| self.array_len(array, &p)) {
                        Some(n) => (n, Box::new((0..n as i64).map(|i| vec![Int(i)]))),
                        None => return Ok(Undef),
                    },
                    Iter::Dict(dict) => match self.dict_entries(dict) {
                        Some(entries) => (entries.len(), Box::new(entries.into_iter().map(|(k, v)| vec![Str(k), Str(v)]))),
                        None => return Ok(Undef),
                    },
                };
                let saved: Vec<Option<Val>> = vars.iter().map(|v| self.vars.get(v).cloned()).collect();
                let mut n = 0;
                let mut failed = None;
                for item in items {
                    for (v, x) in vars.iter().zip(item) {
                        self.vars.insert(v.clone(), x);
                    }
                    match self.eval(body, ri, rule) {
                        Ok(v) => n += v.truthy() as usize,
                        Err(e) => {
                            failed = Some(e);
                            break;
                        }
                    }
                }
                for (v, s) in vars.iter().zip(saved) {
                    match s {
                        Some(x) => self.vars.insert(v.clone(), x),
                        None => self.vars.remove(v),
                    };
                }
                if let Some(e) = failed {
                    return Err(e);
                }
                bv(self.quant_ok(q, n, total, ri, rule)?)
            }
        })
    }
}

/// All matches of every string of every rule over [start, end), in chunks.
fn search(src: &dyn Bytes, rules: &[Rule], start: u64, end: u64, progress: &mut Progress) -> Result<HashMap<(usize, String), Vec<(u64, u64)>>, String> {
    const CHUNK: u64 = 4 << 20;
    const PER_STRING: usize = 100_000;
    let reach = rules.iter().flat_map(|r| r.strings.iter()).map(|s| s.reach.unwrap_or(64 << 10)).max().unwrap_or(0) as u64;
    let mut found: HashMap<(usize, String), Vec<(u64, u64)>> = HashMap::new();
    for (ri, r) in rules.iter().enumerate() {
        for s in &r.strings {
            found.insert((ri, s.id.clone()), Vec::new());
        }
    }
    let mut pos = start;
    let mut buf = Vec::new();
    while pos < end {
        let scan_end = (pos + CHUNK).min(end);
        let read_end = (scan_end + reach).min(end);
        buf.resize((read_end - pos) as usize, 0);
        src.read(pos, &mut buf)?;
        for (ri, r) in rules.iter().enumerate() {
            for s in &r.strings {
                let list = found.get_mut(&(ri, s.id.clone())).unwrap();
                // Continue after the last match (no overlapping matches of one string).
                let mut at = list.last().map(|&(o, l)| (o + l.max(1)).saturating_sub(pos) as usize).unwrap_or(0);
                while at < buf.len() && list.len() < PER_STRING {
                    let Some(m) = s.regex.find_at(&buf, at) else { break };
                    if m.start() as u64 + pos >= scan_end {
                        break;
                    }
                    let ok = !s.fullword || ((m.start() == 0 && pos == start || m.start() > 0 && !is_word(buf[m.start() - 1])) && (m.end() >= buf.len() || !is_word(buf[m.end()])));
                    if ok {
                        list.push((pos + m.start() as u64, m.len() as u64));
                    }
                    at = if m.end() > m.start() { m.end() } else { m.start() + 1 };
                }
            }
        }
        pos = scan_end;
        if !progress(pos - start, end - start) {
            return Err(CANCELLED.into());
        }
    }
    Ok(found)
}

pub fn scan(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let text = args.str_or("rules", "");
    let (rules, mut errors) = compile(text);
    let (offset, length) = range_of(src, args);
    let limit = args.u64_or("limit", 10_000) as usize;
    let found = search(src, &rules, offset, offset + length, progress)?;
    let now = args.get("now").and_then(Value::as_i64).or_else(clock);
    let mut ctx = Ctx {
        src,
        progress,
        found,
        results: HashMap::new(),
        entry: entrypoint(src),
        vars: HashMap::new(),
        current: None,
        pe: None,
        elf: None,
        macho: None,
        dotnet: None,
        dex: None,
        magic: None,
        stats: HashMap::new(),
        cache: HashMap::new(),
        log: Vec::new(),
        now,
    };
    // Rules referring to later rules: evaluate until nothing changes (at most as many rounds as rules). The log is the
    // last round's.
    let mut outcome: Vec<Option<bool>> = vec![None; rules.len()];
    for _ in 0..rules.len().max(1) {
        let mut changed = false;
        ctx.log.clear();
        for (ri, r) in rules.iter().enumerate() {
            match ctx.eval(&r.condition, ri, r) {
                Err(message) if message == CANCELLED => return Err(message),
                Ok(v) => {
                    let v = v.truthy();
                    if outcome[ri] != Some(v) {
                        outcome[ri] = Some(v);
                        ctx.results.insert(r.name.clone(), v);
                        changed = true;
                    }
                }
                Err(message) => {
                    if outcome[ri].is_none() {
                        errors.push(YaraError { line: 0, col: 0, message: format!("rule {}: {message}", r.name) });
                        outcome[ri] = Some(false);
                        ctx.results.insert(r.name.clone(), false);
                    }
                }
            }
        }
        if !changed {
            break;
        }
    }
    // A global rule that is false: nothing matches.
    if rules.iter().enumerate().any(|(ri, r)| r.global && outcome[ri] != Some(true)) {
        outcome.iter_mut().for_each(|o| *o = Some(false));
    }
    let mut reported = 0usize;
    let mut matches = Vec::new();
    for (ri, r) in rules.iter().enumerate() {
        if outcome[ri] != Some(true) || r.private {
            continue;
        }
        let mut strings = Vec::new();
        for s in r.strings.iter().filter(|s| !s.private) {
            for &(o, l) in &ctx.found[&(ri, s.id.clone())] {
                if reported >= limit {
                    break;
                }
                let mut data = vec![0u8; l.min(32) as usize];
                src.read(o, &mut data)?;
                let mut m = json!({ "id": shown(&s.id), "offset": o, "length": l, "data": hex_string(&data, true) });
                if let (Some(first), Some(&b0)) = (s.xor_first, data.first()) {
                    m["xor"] = json!(b0 ^ first);
                }
                strings.push(m);
                reported += 1;
            }
        }
        matches.push(json!({ "rule": r.name, "tags": r.tags, "meta": Value::Object(r.meta.clone()), "strings": strings }));
    }
    let errors: Vec<Value> = errors.iter().map(|e| json!({ "line": e.line, "col": e.col, "message": e.message })).collect();
    Ok(json!({ "matches": matches, "rules": rules.len(), "errors": errors, "truncated": reported >= limit, "log": ctx.log }))
}

/// Seconds since 1970 for time.now() (none in the WebAssembly build: the page passes `now`).
#[cfg(not(target_arch = "wasm32"))]
fn clock() -> Option<i64> {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_secs() as i64)
}

#[cfg(target_arch = "wasm32")]
fn clock() -> Option<i64> {
    None
}

pub fn check(args: &Value) -> Result<Value, String> {
    let (rules, errors) = compile(args.str_or("rules", ""));
    let errors: Vec<Value> = errors.iter().map(|e| json!({ "line": e.line, "col": e.col, "message": e.message })).collect();
    Ok(json!({ "rules": rules.len(), "errors": errors }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::{b64, no_progress};

    fn sample() -> Vec<u8> {
        let mut d = vec![0u8; 512];
        d[0] = b'M';
        d[1] = b'Z';
        d[0x3C] = 0x80;
        d[0x80..0x84].copy_from_slice(b"PE\0\0");
        d[0x100..0x106].copy_from_slice(&[0xE8, 0x11, 0x22, 0x33, 0x90, 0xC3]);
        d[0x140..0x14B].copy_from_slice(b"Hello World");
        for (i, c) in "secret".bytes().enumerate() {
            d[0x180 + 2 * i] = c;
        }
        d[0x1C0..0x1C3].copy_from_slice(b"abc");
        d[0x1D0..0x1D3].copy_from_slice(b"abc");
        d[0x1E0..0x1E6].copy_from_slice(b"xabcx_");
        d
    }

    fn run(rules: &str) -> Value {
        scan(&sample(), &json!({ "rules": rules }), &mut no_progress()).unwrap()
    }
    fn run_on(data: &[u8], rules: &str) -> Value {
        scan(&data.to_vec(), &json!({ "rules": rules }), &mut no_progress()).unwrap()
    }
    fn names(r: &Value) -> Vec<String> {
        r["matches"].as_array().unwrap().iter().map(|m| m["rule"].as_str().unwrap().to_string()).collect()
    }
    /// One rule per condition: the indexes of the conditions that were true (and no errors).
    fn true_conditions(data: &[u8], imports: &str, strings: &str, conditions: &[&str]) -> Vec<usize> {
        let mut text = imports.to_string();
        for (i, c) in conditions.iter().enumerate() {
            text.push_str(&format!("\nrule c{i} {{ {strings} condition: {c} }}"));
        }
        let r = run_on(data, &text);
        assert_eq!(r["errors"], json!([]), "{r}");
        names(&r).iter().map(|n| n[1..].parse().unwrap()).collect()
    }
    fn first_error(rules: &str) -> Value {
        let c = check(&json!({ "rules": rules })).unwrap();
        c["errors"][0].clone()
    }

    #[test]
    fn mz_header_and_meta() {
        let r = run(r#"import "pe"
            rule mz : exe windows { meta: author = "me" score = 5 ok = true
              strings: $mz = "MZ" condition: $mz at 0 and uint16(0) == 0x5A4D and uint32(0x3C) == 0x80 }"#);
        assert_eq!(names(&r), vec!["mz"]);
        let m = &r["matches"][0];
        assert_eq!(m["tags"], json!(["exe", "windows"]));
        assert_eq!(m["meta"]["score"], json!(5));
        assert_eq!(m["strings"][0]["offset"], json!(0));
    }

    #[test]
    fn hex_jumps_and_alternatives() {
        let r = run("rule call { strings: $c = { E8 ?? [1-3] (90 | 91) C3 } $d = { E8 1? 2? } condition: $c and $d and @c[1] == 0x100 and !c[1] == 6 }");
        assert_eq!(names(&r), vec!["call"]);
        let r = run("rule no { strings: $c = { E8 [4] 91 } condition: $c }");
        assert!(names(&r).is_empty());
    }

    #[test]
    fn nocase_wide_fullword_counts() {
        let r = run(r#"rule text { strings: $h = "hello world" nocase $w = "secret" wide $a = "abc" fullword condition: $h and $w and #a == 2 and #a in (0..0x1C5) == 1 }"#);
        assert_eq!(names(&r), vec!["text"], "{r}");
        let r = run(r#"rule rx { strings: $r = /hel+o w[a-z]+/i condition: $r and @r == 0x140 }"#);
        assert_eq!(names(&r), vec!["rx"]);
    }

    #[test]
    fn of_quantifiers_for_and_rule_references() {
        let rules = r#"
            rule two { strings: $a = "MZ" $b = "PE" $c = "nope" condition: 2 of them and not all of them and any of ($a, $b*) and none of ($c) }
            private rule hidden { condition: filesize == 512 and filesize < 1KB }
            rule uses { condition: hidden and two and entrypoint == 0 }
            rule forof { strings: $a1 = "abc" $a2 = "Hello" condition: for all of ($a*) : ( $ in (0x100..0x200) ) and for any i in (1..#a1) : ( @a1[i] == 0x1D0 ) }
            rule pct { strings: $a = "abc" $b = "Hello" $c = "nope" condition: 50% of them and for 2 of them : ( # >= 1 ) and for 2 i in (1, 2, 3) : ( i > 1 ) }
        "#;
        let r = run(rules);
        assert_eq!(names(&r), vec!["two", "uses", "forof", "pct"], "{r}");
        assert_eq!(r["rules"], json!(5));
    }

    #[test]
    fn errors_skip_only_the_bad_rule() {
        let r = run("rule bad { strings: $a = { 4G } condition: $a }\nrule good { condition: true }\nrule worse { condition: $zz }");
        assert_eq!(names(&r), vec!["good"]);
        let errs = r["errors"].as_array().unwrap();
        assert!(errs.len() >= 2, "{r}");
        assert_eq!(errs[0]["line"], json!(1));
        assert_eq!(errs[1]["line"], json!(3), "{r}");
        let c = check(&json!({ "rules": "rule x { condition: ( }" })).unwrap();
        assert_eq!(c["rules"], json!(0));
        assert_eq!(c["errors"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn across_chunks() {
        let mut d = vec![0u8; (4 << 20) + 100];
        d[(4 << 20) - 2..(4 << 20) + 2].copy_from_slice(b"ABCD");
        let r = scan(&d, &json!({ "rules": "rule x { strings: $a = \"ABCD\" condition: #a == 1 and @a == 4194302 }" }), &mut no_progress()).unwrap();
        assert_eq!(names(&r), vec!["x"]);
    }

    #[test]
    fn xor_modifier() {
        let mut d = vec![0u8; 0x200];
        let plain = b"This program cannot";
        for (i, b) in plain.iter().enumerate() {
            d[0x10 + i] = b ^ 0x5A;
        }
        for (i, b) in widen(b"Hello").iter().enumerate() {
            d[0x100 + i] = b ^ 0x20;
        }
        d[0x180..0x185].copy_from_slice(b"Hello");
        let r = run_on(&d, r#"rule x { strings: $a = "This program cannot" xor condition: $a }"#);
        assert_eq!(names(&r), vec!["x"]);
        assert_eq!(r["matches"][0]["strings"][0]["xor"], json!(0x5A));
        assert_eq!(r["matches"][0]["strings"][0]["offset"], json!(0x10));
        let ok = true_conditions(&d, "", r#"strings: $p = "This program cannot" xor(0x10) $q = "This program cannot" xor(0x50-0x5F)
            $w = "Hello" xor wide $v = "Hello" xor ascii $b = "Hello" xor ascii wide $z = "Hello" xor(0x01-0xFF)"#, &[
            "$p",                                // 0 false: wrong key
            "#q == 1",                           // 1
            "$w and @w == 0x100 and !w == 10",   // 2 xor after wide: the zero bytes carry the key
            "#v == 1 and @v == 0x180",           // 3 ascii only, key 0 (the plain text)
            "#b == 2",                           // 4 both
            "not $z",                            // 5 key 0 excluded
        ]);
        assert_eq!(ok, vec![1, 2, 3, 4, 5]);
        let r = run_on(&d, r#"rule k { strings: $w = "Hello" xor wide condition: $w }"#);
        assert_eq!(r["matches"][0]["strings"][0]["xor"], json!(0x20));
        let e = first_error("rule e {\n strings: $a = \"abc\" xor nocase condition: $a }");
        assert_eq!((e["line"].clone(), e["col"].clone()), (json!(2), json!(11)), "{e}");
        assert!(e["message"].as_str().unwrap().contains("nocase"));
        assert!(first_error(r#"rule e { strings: $a = "abc" xor(0x20-0x10) condition: $a }"#)["message"].as_str().unwrap().contains("xor"));
        assert!(first_error(r#"rule e { strings: $a = "abc" xor(300) condition: $a }"#)["message"].as_str().unwrap().contains("255"));
        assert!(first_error(r#"rule e { strings: $a = { 41 } xor condition: $a }"#)["message"].as_str().unwrap().contains("hex"));
    }

    #[test]
    fn base64_modifiers() {
        // The documented example of YARA.
        let v = base64_variants(b"This program cannot", B64);
        assert_eq!(v, vec![b"VGhpcyBwcm9ncmFtIGNhbm5vd".to_vec(), b"RoaXMgcHJvZ3JhbSBjYW5ub3".to_vec(), b"UaGlzIHByb2dyYW0gY2Fubm90".to_vec()]);
        let mut d = vec![b'.'; 0x400];
        let put = |d: &mut Vec<u8>, at: usize, b: &[u8]| d[at..at + b.len()].copy_from_slice(b);
        put(&mut d, 0x10, b64(b"xThis program cannot be run").as_bytes());
        put(&mut d, 0x100, &widen(b64(b"abThis is wide").as_bytes()));
        put(&mut d, 0x200, b64(&widen(b"Wide in")).as_bytes());
        // A custom alphabet: the standard one reversed.
        let custom: Vec<u8> = B64.iter().rev().copied().collect();
        let encoded: Vec<u8> = b64(b"--Custom alphabet").bytes().filter(|&c| c != b'=').map(|c| custom[B64.iter().position(|&x| x == c).unwrap()]).collect();
        put(&mut d, 0x300, &encoded);
        let alphabet = String::from_utf8(custom).unwrap();
        let strings = format!(r#"strings: $a = "This program cannot" base64 $b = "This is wide" base64wide $c = "This is wide" base64
            $d = "Wide in" wide base64 $e = "Custom alphabet" base64("{alphabet}") $f = "Custom alphabet" base64 $g = "This program" base64 base64wide"#);
        let ok = true_conditions(&d, "", &strings, &["$a and @a > 0x10 and @a < 0x20", "$b and @b > 0x100", "$c", "$d", "$e", "$f", "#g == 1"]);
        assert_eq!(ok, vec![0, 1, 3, 4, 6]);
        assert!(first_error(r#"rule e { strings: $a = "abc" base64 nocase condition: $a }"#)["message"].as_str().unwrap().contains("base64"));
        assert!(first_error(r#"rule e { strings: $a = "abc" base64("short") condition: $a }"#)["message"].as_str().unwrap().contains("64"));
    }

    #[test]
    fn private_strings_private_and_global_rules() {
        let r = run(r#"rule ps { strings: $a = "Hello" private $b = "World" condition: $a and $b and @a == 0x140 }"#);
        assert_eq!(names(&r), vec!["ps"]);
        let s = r["matches"][0]["strings"].as_array().unwrap();
        assert_eq!(s.len(), 1);
        assert_eq!(s[0]["id"], json!("$b"));
        // global false: nothing matches, also rules before it and rules that do not refer to it
        let r = run("rule a { condition: true } global rule g { condition: filesize > 100000 } rule b { condition: true }");
        assert!(names(&r).is_empty(), "{r}");
        let r = run("global rule g { condition: filesize == 512 } rule a { condition: true } private rule p { condition: true } rule b { condition: p }");
        assert_eq!(names(&r), vec!["g", "a", "b"]);
        // global private: applies, not reported
        let r = run("global private rule g { condition: filesize == 512 } rule a { condition: true }");
        assert_eq!(names(&r), vec!["a"]);
        let r = run("private global rule g { condition: false } rule a { condition: true }");
        assert!(names(&r).is_empty());
    }

    #[test]
    fn anonymous_strings_and_wide_regex() {
        let r = run(r#"rule an { strings: $ = "Hello" $ = "World" condition: all of them and for all of them : ( @ > 0x100 ) }"#);
        assert_eq!(names(&r), vec!["an"], "{r}");
        assert_eq!(r["matches"][0]["strings"][0]["id"], json!("$"));
        let ok = true_conditions(&sample(), "", r#"strings: $w = /sec[a-z]+t/ wide $d = /s.c\x72e/ wide $a = /secret/ $b = /se(c|x){1}r[^a]t/ ascii wide"#, &[
            "$w and @w == 0x180 and !w == 12",
            "$d",
            "$a",
            "$b and @b == 0x180",
        ]);
        assert_eq!(ok, vec![0, 1, 3]);
    }

    /// A VS_VERSIONINFO-style block.
    fn vs_block(key: &str, value: &[u8], text: bool, children: &[Vec<u8>]) -> Vec<u8> {
        let mut b = vec![0u8; 6];
        b.extend(utf16z(key));
        while b.len() % 4 != 0 {
            b.push(0);
        }
        b.extend(value);
        for c in children {
            while b.len() % 4 != 0 {
                b.push(0);
            }
            b.extend(c);
        }
        let vlen = if text { value.len() / 2 } else { value.len() };
        let total = b.len() as u16;
        b[0..2].copy_from_slice(&total.to_le_bytes());
        b[2..4].copy_from_slice(&(vlen as u16).to_le_bytes());
        b[4..6].copy_from_slice(&(text as u16).to_le_bytes());
        b
    }
    fn utf16z(s: &str) -> Vec<u8> {
        s.encode_utf16().chain([0]).flat_map(|c| c.to_le_bytes()).collect()
    }
    fn version_resource() -> Vec<u8> {
        let strings = [vs_block("CompanyName", &utf16z("ACME Corp"), true, &[]), vs_block("FileVersion", &utf16z("1.2.3"), true, &[])];
        let table = vs_block("040904b0", &[], true, &strings);
        let info = vs_block("StringFileInfo", &[], true, &[table]);
        vs_block("VS_VERSION_INFO", &[0u8; 52], false, &[info])
    }

    /// A PE32+ DLL: a rich signature at 0x40 (key 0x1234ABCD; build 0x7809 of tools 0x104 ×5 and 0x105 ×3), the PE
    /// header at 0x80, .text and .rdata, imports from KERNEL32.dll (CreateFileA, ExitProcess, ordinal 5) and user32.dll
    /// (MessageBoxA), one named export (DoThing, ordinal 2) of two, resources at RVA 0x2200 (a version resource with
    /// CompanyName / FileVersion, and "ABCD" of the named type "TEST", id 7), two certificate entries at 0x800.
    fn pe_image() -> Vec<u8> {
        let mut d = vec![0u8; 0x830];
        let mut w = |o: usize, b: &[u8]| d[o..o + b.len()].copy_from_slice(b);
        let rd = |rva: usize| rva - 0x2000 + 0x400;
        w(0, b"MZ");
        w(0x3C, &0x80u32.to_le_bytes());
        let key = 0x1234_ABCDu32;
        for (i, v) in [0x536E_6144u32, 0, 0, 0, (0x104 << 16) | 0x7809, 5, (0x105 << 16) | 0x7809, 3].iter().enumerate() {
            w(0x40 + 4 * i, &(v ^ key).to_le_bytes());
        }
        w(0x60, b"Rich");
        w(0x64, &key.to_le_bytes());
        w(0x80, b"PE\0\0");
        w(0x84, &0x8664u16.to_le_bytes());
        w(0x86, &2u16.to_le_bytes());
        w(0x88, &0x5F5E_1000u32.to_le_bytes());
        w(0x94, &0xF0u16.to_le_bytes());
        w(0x96, &0x2022u16.to_le_bytes());
        let o = 0x98;
        w(o, &0x20Bu16.to_le_bytes());
        w(o + 16, &0x1010u32.to_le_bytes());
        w(o + 24, &0x1_8000_0000u64.to_le_bytes());
        w(o + 32, &0x1000u32.to_le_bytes());
        w(o + 36, &0x200u32.to_le_bytes());
        w(o + 56, &0x3000u32.to_le_bytes());
        w(o + 60, &0x200u32.to_le_bytes());
        w(o + 68, &3u16.to_le_bytes());
        w(o + 108, &16u32.to_le_bytes());
        for (i, v) in [0x2100u32, 0x60, 0x2000, 0x3C, 0x2200, 0x100, 0, 0, 0x800, 0x28].iter().enumerate() {
            w(o + 112 + 4 * i, &v.to_le_bytes());
        }
        let sections: [(&[u8], [u32; 4], u32); 2] = [(b".text", [0x100, 0x1000, 0x200, 0x200], 0x6000_0020), (b".rdata", [0x300, 0x2000, 0x400, 0x400], 0x4000_0040)];
        for (i, (name, v, ch)) in sections.iter().enumerate() {
            let at = 0x188 + 40 * i;
            w(at, name);
            for (k, x) in v.iter().enumerate() {
                w(at + 8 + 4 * k, &x.to_le_bytes());
            }
            w(at + 36, &ch.to_le_bytes());
        }
        w(0x210, &[0x55, 0x48, 0x89, 0xE5]);
        for (at, ilt, name) in [(0x2000, 0x2040u32, 0x20C0u32), (0x2014, 0x2060, 0x20D0)] {
            w(rd(at), &ilt.to_le_bytes());
            w(rd(at) + 12, &name.to_le_bytes());
            w(rd(at) + 16, &ilt.to_le_bytes());
        }
        for (i, v) in [0x2080u64, 0x2090, 0x8000_0000_0000_0005].iter().enumerate() {
            w(rd(0x2040) + 8 * i, &v.to_le_bytes());
        }
        w(rd(0x2060), &0x20A0u64.to_le_bytes());
        for (rva, s) in [(0x2082, "CreateFileA"), (0x2092, "ExitProcess"), (0x20A2, "MessageBoxA"), (0x20C0, "KERNEL32.dll"), (0x20D0, "user32.dll"), (0x2140, "test.dll"), (0x2180, "DoThing")] {
            w(rd(rva), s.as_bytes());
        }
        for (k, v) in [0x2140u32, 1, 2, 1, 0x2150, 0x2160, 0x2170].iter().enumerate() {
            w(rd(0x2100) + 12 + 4 * k, &v.to_le_bytes());
        }
        w(rd(0x2150), &[0x00, 0x10, 0, 0, 0x10, 0x10, 0, 0]);
        w(rd(0x2160), &0x2180u32.to_le_bytes());
        w(rd(0x2170), &1u16.to_le_bytes());
        // resource tree: directories at base + offset with (name, data) entries
        let base = rd(0x2200);
        let dirs: [(usize, &[(u32, u32)]); 5] = [
            (0x00, &[(16, 0x8000_0030), (0x8000_00C0, 0x8000_0060)]),
            (0x30, &[(1, 0x8000_0048)]),
            (0x48, &[(0x409, 0x90)]),
            (0x60, &[(7, 0x8000_0078)]),
            (0x78, &[(0x409, 0xA0)]),
        ];
        w(base + 4, &0x1122_3344u32.to_le_bytes());
        w(base + 8, &4u16.to_le_bytes());
        for (at, entries) in dirs {
            w(base + at + 14, &(entries.len() as u16).to_le_bytes());
            for (i, (name, data)) in entries.iter().enumerate() {
                w(base + at + 16 + 8 * i, &name.to_le_bytes());
                w(base + at + 20 + 8 * i, &data.to_le_bytes());
            }
        }
        let version = version_resource();
        w(base + 0x90, &0x2300u32.to_le_bytes());
        w(base + 0x94, &(version.len() as u32).to_le_bytes());
        w(base + 0xA0, &0x22E0u32.to_le_bytes());
        w(base + 0xA4, &4u32.to_le_bytes());
        w(base + 0xC0, &4u16.to_le_bytes());
        w(base + 0xC2, &widen(b"TEST"));
        w(base + 0xE0, b"ABCD");
        w(rd(0x2300), &version);
        // certificate table (a file offset): two WIN_CERTIFICATE entries, the first padded to 8
        w(0x800, &0x14u32.to_le_bytes());
        w(0x818, &0x10u32.to_le_bytes());
        d
    }

    #[test]
    fn pe_module_fields() {
        let conditions = [
            "pe.is_pe",
            "pe.machine == pe.MACHINE_AMD64 and pe.MACHINE_I386 == 0x14C and pe.MACHINE_ARM64 == 0xAA64",
            "pe.number_of_sections == 2",
            "pe.timestamp == 0x5F5E1000",
            "pe.entry_point == 0x210 and pe.entry_point_raw == 0x1010 and $ep at pe.entry_point",
            "pe.characteristics & pe.DLL and pe.characteristics & pe.EXECUTABLE_IMAGE and pe.is_dll()",
            "pe.subsystem == pe.SUBSYSTEM_WINDOWS_CUI and pe.subsystem != pe.SUBSYSTEM_WINDOWS_GUI",
            "pe.image_base == 0x180000000 and pe.is_64bit() and not pe.is_32bit()",
            r#"pe.sections[0].name == ".text" and pe.sections[1].name == ".rdata""#,
            "pe.sections[1].virtual_address == 0x2000 and pe.sections[1].virtual_size == 0x300 and pe.sections[0].raw_data_offset == 0x200 and pe.sections[1].raw_data_size == 0x400",
            "pe.sections[0].characteristics & pe.SECTION_MEM_EXECUTE and not (pe.sections[1].characteristics & pe.SECTION_MEM_EXECUTE)",
            "pe.number_of_imports == 2 and pe.number_of_imported_functions == 4",
            r#"pe.imports("kernel32.DLL") == 3 and pe.imports("USER32.dll") == 1 and pe.imports("ntdll.dll") == 0"#,
            r#"pe.imports("kernel32.dll", "CreateFileA") and pe.imports("KERNEL32.dll", "exitprocess") and pe.imports("kernel32.dll", 5)"#,
            r#"pe.imports("user32.dll", "MessageBoxA") and not pe.imports("user32.dll", "CreateFileA") and not pe.imports("kernel32.dll", 6)"#,
            r#"pe.number_of_exports == 2 and pe.exports("DoThing") and pe.exports("dothing") and pe.exports(1) and pe.exports(2) and not pe.exports("Nope")"#,
            r#"pe.dll_name == "test.dll" and pe.dll_name iequals "TEST.DLL""#,
            r#"for any s in pe.sections : ( s.name == ".rdata" and s.characteristics & pe.SECTION_MEM_READ )"#,
            "for all i in (0..pe.number_of_sections - 1) : ( pe.sections[i].raw_data_size >= 0x200 )",
            r#"pe.sections[0].name contains "tex" and pe.sections[1].name matches /^\.r[a-z]+$/ and pe.sections[0].name startswith ".t""#,
            r#"pe.section_index(".rdata") == 1 and pe.section_index(0x1010) == 0 and not defined pe.section_index(".bss")"#,
            "not defined pe.sections[2].name and defined pe.sections[1].name",
            "pe.size_of_image == 0x3000 and pe.size_of_headers == 0x200",
            r#"for none s in pe.sections : ( s.name == ".bss" )"#,
            "pe.rich_signature.offset == 0x40 and pe.rich_signature.length == 0x20 and pe.rich_signature.key == 0x1234ABCD",
            r#"pe.rich_signature.clear_data startswith "DanS" and not (pe.rich_signature.raw_data startswith "DanS")"#,
            "pe.rich_signature.version(0x7809) == 8 and pe.rich_signature.version(0x7809, 0x104) == 5 and pe.rich_signature.toolid(0x105) == 3 and pe.rich_signature.toolid(0x105, 0x7809) == 3 and pe.rich_signature.toolid(0x999) == 0",
            "pe.number_of_resources == 2 and pe.resource_timestamp == 0x11223344 and pe.resource_version.major == 4 and pe.resource_version.minor == 0",
            "pe.resources[0].type == pe.RESOURCE_TYPE_VERSION and pe.resources[0].id == 1 and pe.resources[0].language == 0x409 and pe.resources[0].offset == 0x700 and pe.resources[0].rva == 0x2300",
            r#"pe.resources[1].type_string == "T\x00E\x00S\x00T\x00" and not defined pe.resources[1].type and pe.resources[1].id == 7 and pe.resources[1].length == 4 and uint32(pe.resources[1].offset) == 0x44434241"#,
            "for any r in pe.resources : ( r.type == pe.RESOURCE_TYPE_VERSION and r.length > 200 )",
            r#"pe.version_info["CompanyName"] == "ACME Corp" and pe.version_info["FileVersion"] == "1.2.3" and not defined pe.version_info["Nope"]"#,
            r#"pe.number_of_version_infos == 2 and pe.version_info_list[1].key == "FileVersion" and pe.version_info_list[0].value contains "ACME""#,
            r#"for any k, v in pe.version_info : ( k == "CompanyName" and v startswith "ACME" ) and for all k, v in pe.version_info : ( v != "" )"#,
            "pe.number_of_signatures == 0 and pe.file_alignment == 0x200 and pe.section_alignment == 0x1000",
            "pe.overlay.offset == 0x800 and pe.overlay.size == 0x30 and not defined pe.pdb_path and pe.number_of_delayed_imports == 0",
            "pe.rva_to_offset(0x1010) == 0x210 and pe.rva_to_offset(0x2300) == 0x700 and pe.rva_to_offset(0x100) == 0x100 and not defined pe.rva_to_offset(0x9000) and not defined pe.rva_to_offset(0x1300)",
            r#"pe.imports(/kernel32/i, /^Create/) == 1 and pe.imports(/32\.dll$/i, /A$/) == 2 and pe.imports("kernel32.dll", /Exit/) == 1 and pe.imports(/user32/) == 1"#,
            "pe.exports(/^Do/) and not pe.exports(/^X/)",
        ];
        let ok = true_conditions(&pe_image(), "import \"pe\"", "strings: $ep = { 55 48 89 E5 }", &conditions);
        assert_eq!(ok, (0..conditions.len()).collect::<Vec<_>>());
        // YARA's rounding: a raw offset of 0x201 maps as 0x200 (FileAlignment 0x200)
        let mut d = pe_image();
        d[0x188 + 20] = 0x01;
        assert_eq!(true_conditions(&d, "import \"pe\"", "", &["pe.entry_point == 0x210", "pe.sections[0].raw_data_offset == 0x201"]), vec![0, 1]);
        let e = first_error("import \"pe\" rule e { condition: pe.version_info[1] == \"x\" }");
        assert!(e["message"].as_str().unwrap().contains("key"), "{e}");
        let e = first_error("import \"pe\" rule e { condition: for any k in pe.version_info : ( true ) }");
        assert!(e["message"].as_str().unwrap().contains("variable"), "{e}");
    }

    #[test]
    fn pe_undefined_on_other_data() {
        let data = b"just some text, not a PE file at all".to_vec();
        let conditions = [
            "pe.is_pe == 0",                                // 0 true
            "not pe.is_pe",                                 // 1 true
            "not defined pe.machine",                       // 2 true
            "pe.MACHINE_I386 == 0x14C",                     // 3 true: constants are defined
            "pe.machine == 0",                              // 4 false
            "pe.machine != 0",                              // 5 false
            "not (pe.machine == 0)",                        // 6 false: not undefined is undefined
            "pe.number_of_sections >= 0",                   // 7 false
            r#"pe.sections[0].name == """#,                 // 8 false
            r#"pe.imports("kernel32.dll")"#,                // 9 false
            "for any s in pe.sections : ( true )",          // 10 false
            "for all s in pe.sections : ( true )",          // 11 false
            "pe.entry_point + 1 > 0",                       // 12 false
            "pe.is_dll() or filesize > 10",                 // 13 true: undefined is false in or
        ];
        let ok = true_conditions(&data, "import \"pe\"", "", &conditions);
        assert_eq!(ok, vec![0, 1, 2, 3, 13]);
        // A file with MZ but no PE signature is not a PE either.
        let mut mz = vec![0u8; 256];
        mz[..2].copy_from_slice(b"MZ");
        mz[0x3C] = 0xF0;
        assert_eq!(true_conditions(&mz, "import \"pe\"", "", &["pe.is_pe", "not defined pe.timestamp"]), vec![1]);
    }

    #[test]
    fn pe_malformed_never_panics() {
        let rules = r#"import "pe"
            rule all_fields { condition: pe.is_pe and pe.machine and pe.number_of_sections and pe.timestamp and pe.entry_point
              and pe.entry_point_raw and pe.characteristics and pe.subsystem and pe.image_base and pe.number_of_imports
              and pe.number_of_exports and pe.imports("kernel32.dll") and pe.imports("kernel32.dll", "CreateFileA")
              and pe.exports("DoThing") and pe.dll_name == "test.dll" and pe.sections[1].name == ".rdata"
              and for any s in pe.sections : ( s.raw_data_size > 0 ) and pe.section_index(".text") == 0
              and pe.number_of_resources == 2 and pe.rich_signature.key and pe.version_info["CompanyName"] == "ACME Corp"
              and pe.overlay.size == 0x30 and pe.imports(/kernel/i, /Create/) and pe.rich_signature.version(0x7809) == 8
              and for any k, v in pe.version_info : ( v contains "1.2" ) and for any r in pe.resources : ( r.length == 4 ) }"#;
        let good = pe_image();
        assert_eq!(names(&run_on(&good, rules)), vec!["all_fields"]);
        // every truncation
        for n in 0..good.len() {
            let r = run_on(&good[..n], rules);
            assert!(r["errors"].as_array().unwrap().is_empty(), "{n}: {r}");
        }
        // random corruption (a fixed LCG)
        let mut seed = 0x1234_5678u64;
        for _ in 0..400 {
            let mut d = good.clone();
            for _ in 0..8 {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                let at = (seed >> 33) as usize % 0x200.max(1);
                let at = at + [0, 0x400, 0x600][(seed >> 7) as usize % 3];
                let n = d.len();
                d[at % n] = (seed >> 13) as u8;
            }
            run_on(&d, rules);
        }
        // extreme values: e_lfanew, section count, optional header size, data directories, thunks
        let mut evil = good.clone();
        evil[0x86..0x88].copy_from_slice(&0xFFFFu16.to_le_bytes());
        evil[0x94..0x96].copy_from_slice(&0xFFFFu16.to_le_bytes());
        run_on(&evil, rules);
        let mut evil = good.clone();
        for k in 0..32 {
            evil[0x98 + 112 + 4 * k] = 0xFF;
        }
        evil[0x98 + 108..0x98 + 112].copy_from_slice(&u32::MAX.to_le_bytes());
        run_on(&evil, rules);
        // resource directories pointing at themselves, huge counts; a version block of length 0xFFFF
        let mut evil = good.clone();
        for at in [0x600 + 0x10 + 4, 0x600 + 0x30 + 16 + 4] {
            evil[at..at + 4].copy_from_slice(&0x8000_0000u32.to_le_bytes());
        }
        evil[0x600 + 12..0x600 + 16].copy_from_slice(&[0xFF; 4]);
        evil[0x700..0x702].copy_from_slice(&[0xFF, 0xFF]);
        run_on(&evil, rules);
        // the rich signature without "DanS"
        let mut evil = good.clone();
        evil[0x40] ^= 1;
        run_on(&evil, rules);
        let mut evil = good.clone();
        for i in 0..3 {
            evil[0x440 + 8 * i..0x448 + 8 * i].copy_from_slice(&0x7FFF_FFFF_FFFF_FFF0u64.to_le_bytes());
        }
        evil[0x500 + 20..0x500 + 24].copy_from_slice(&u32::MAX.to_le_bytes());
        evil[0x500 + 24..0x500 + 28].copy_from_slice(&u32::MAX.to_le_bytes());
        run_on(&evil, rules);
        let mut evil = good.clone();
        evil[0x3C..0x40].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(names(&run_on(&evil, rules)).is_empty());
    }

    #[test]
    fn math_and_hash_modules() {
        let mut d = b"abc".to_vec();
        d.extend(0..=255u8);
        let conditions = [
            r#"hash.md5(0, 3) == "900150983cd24fb0d6963f7d28e17f72""#,
            r#"hash.sha1(0, 3) == "a9993e364706816aba3e25717850c26c9cd0d89d""#,
            r#"hash.sha256(0, 3) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad""#,
            r#"hash.md5("abc") == hash.md5(0, 3) and hash.crc32(0, 3) == 0x352441C2 and hash.crc32("abc") == 0x352441C2"#,
            "math.entropy(3, 256) == 8.0 and math.entropy(0, 1) == 0.0 and math.entropy(3, 256) > 7.9",
            "math.mean(3, 256) == 127.5 and math.mean(0, 1) == 97",
            r#"math.entropy("aabb") == 1.0 and math.mean("ab") == 97.5"#,
            "math.entropy(3, 100000) == 8.0",              // the size is clipped to the data
            "not defined math.entropy(100000, 4) and not defined hash.md5(-1, 4)",
            "math.entropy(0, filesize) * 2 > 14.0 and math.mean(0, filesize) \\ 2 > 60",
        ];
        let ok = true_conditions(&d, "import \"math\" import \"hash\"", "", &conditions);
        assert_eq!(ok, (0..conditions.len()).collect::<Vec<_>>());
    }

    #[test]
    fn unknown_modules_and_identifiers_are_errors() {
        let e = first_error("import \"cuckoo\"\nrule a { condition: true }");
        assert_eq!((e["line"].clone(), e["col"].clone()), (json!(1), json!(8)), "{e}");
        assert!(e["message"].as_str().unwrap().contains("unknown module"));
        let e = first_error("rule b {\n  condition: pe.is_pe }");
        assert_eq!((e["line"].clone(), e["col"].clone()), (json!(2), json!(14)), "{e}");
        assert!(e["message"].as_str().unwrap().contains("import \\\"pe\\\"") || e["message"].as_str().unwrap().contains("import \"pe\""), "{e}");
        let e = first_error("import \"pe\"\nrule c { condition:\n  pe.nonsense == 1 }");
        assert_eq!((e["line"].clone(), e["col"].clone()), (json!(3), json!(6)), "{e}");
        assert!(e["message"].as_str().unwrap().contains("pe.nonsense"));
        let e = first_error("import \"pe\"\nrule c { condition: pe.sections[0].colour == 1 }");
        assert!(e["message"].as_str().unwrap().contains("colour"), "{e}");
        let e = first_error("rule d { condition: foo }");
        assert_eq!((e["line"].clone(), e["col"].clone()), (json!(1), json!(21)), "{e}");
        assert!(e["message"].as_str().unwrap().contains("undefined identifier"));
        assert!(first_error("import \"math\" rule m { condition: math.entropy(0) > 1 }")["message"].as_str().unwrap().contains("math.entropy(offset, size)"));
        assert!(first_error("import \"hash\" rule h { condition: hash.md5(0, 1) == 5 }")["message"].as_str().unwrap().contains("type mismatch"));
        assert!(first_error("import \"pe\" rule p { condition: pe.imports(1) }")["message"].as_str().unwrap().contains("pe.imports"));
        assert!(first_error("include \"other.yar\" rule p { condition: true }")["message"].as_str().unwrap().contains("include"));
        assert!(first_error("rule s { condition: $ }")["message"].as_str().unwrap().contains("for"));
        assert!(first_error("rule s { strings: $a = \"x\" condition: any of ($b*) }")["message"].as_str().unwrap().contains("$b*"));
        // the other rules still compile
        let c = check(&json!({ "rules": "import \"cuckoo\"\nrule a { condition: true }\nrule b { condition: nope }" })).unwrap();
        assert_eq!(c["rules"], json!(1));
        assert_eq!(c["errors"].as_array().unwrap().len(), 2);
        assert!(first_error("import \"elf\" rule e { condition: elf.sections[0].colour == 1 }")["message"].as_str().unwrap().contains("colour"));
        assert!(first_error("import \"elf\" rule e { condition: elf.sections == 1 }")["message"].as_str().unwrap().contains("array"));
        assert!(first_error("import \"math\" rule e { condition: math.to_string(\"x\") == \"x\" }")["message"].as_str().unwrap().contains("math.to_string"));
        assert!(first_error("rule e { condition: console.log(\"x\") }")["message"].as_str().unwrap().contains("import \"console\""));
        assert!(first_error("import \"pe\" rule e { condition: pe.rich_signature == 1 }")["message"].as_str().unwrap().contains("pe.rich_signature"));
    }

    /// An ELF image: header, PT_LOAD + PT_DYNAMIC, sections null .text .dynamic .dynstr .dynsym .strtab .symtab .shstrtab,
    /// dynamic entries NEEDED / STRTAB / NULL (+ padding), symbols main (FUNC) and counter (OBJECT), dynamic symbol puts.
    fn elf_image(is64: bool, le: bool, machine: u16) -> Vec<u8> {
        let mut d = vec![0u8; 0x1000];
        let mut w = |o: usize, v: u64, n: usize| {
            for k in 0..n {
                d[o + k] = (v >> (8 * if le { k } else { n - 1 - k })) as u8;
            }
        };
        let a = if is64 { 8 } else { 4 };
        for (i, b) in [0x7Fu8, b'E', b'L', b'F', if is64 { 2 } else { 1 }, if le { 1 } else { 2 }, 1].iter().enumerate() {
            w(i, *b as u64, 1);
        }
        w(16, 2, 2);
        w(18, machine as u64, 2);
        w(20, 1, 4);
        w(24, 0x400110, a);
        let (phoff_at, shoff_at, rest) = if is64 { (32, 40, 52) } else { (28, 32, 40) };
        w(phoff_at, 0x40, a);
        w(shoff_at, 0x600, a);
        let (phsize, shsize): (usize, usize) = if is64 { (56, 64) } else { (32, 40) };
        for (k, v) in [if is64 { 64 } else { 52 }, phsize as u64, 2, shsize as u64, 8, 7].iter().enumerate() {
            w(rest + 2 * k, *v, 2);
        }
        // program headers: type, flags, offset, vaddr, paddr, filesz, memsz, align
        for (i, s) in [[1u64, 5, 0, 0x400000, 0x400000, 0x1000, 0x1000, 0x1000], [2, 6, 0x200, 0x400200, 0x400200, 6 * 2 * a as u64, 0x60, 8]].iter().enumerate() {
            let at = 0x40 + i * phsize;
            w(at, s[0], 4);
            if is64 {
                w(at + 4, s[1], 4);
                for k in 0..6 {
                    w(at + 8 + 8 * k, s[2 + k], 8);
                }
            } else {
                for k in 0..5 {
                    w(at + 4 + 4 * k, s[2 + k], 4);
                }
                w(at + 24, s[1], 4);
                w(at + 28, s[7], 4);
            }
        }
        for k in 0..32 {
            w(0x100 + k, [0x55, 0x48, 0x89, 0xE5][k % 4], 1);
        }
        for (i, (t, v)) in [(1u64, 1u64), (5, 0x400300), (0, 0), (1, 99)].iter().enumerate() {
            w(0x200 + 2 * a * i, *t, a);
            w(0x200 + 2 * a * i + a, *v, a);
        }
        let put = |w: &mut dyn FnMut(usize, u64, usize), at: usize, s: &[u8]| {
            for (k, b) in s.iter().enumerate() {
                w(at + k, *b as u64, 1);
            }
        };
        put(&mut w, 0x300, b"\0libc.so.6\0puts\0");
        put(&mut w, 0x400, b"\0main\0counter\0");
        let shstr = b"\0.text\0.dynamic\0.dynstr\0.dynsym\0.strtab\0.symtab\0.shstrtab\0";
        put(&mut w, 0x500, shstr);
        let name = |s: &str| shstr.windows(s.len() + 1).position(|x| &x[1..] == s.as_bytes() && x[0] == 0).unwrap() as u64 + 1;
        // symbols: name, value, size, info, shndx
        let syms = if is64 { 24 } else { 16 };
        let sym = |w: &mut dyn FnMut(usize, u64, usize), at: usize, s: [u64; 5]| {
            w(at, s[0], 4);
            if is64 {
                w(at + 4, s[3], 1);
                w(at + 6, s[4], 2);
                w(at + 8, s[1], 8);
                w(at + 16, s[2], 8);
            } else {
                w(at + 4, s[1], 4);
                w(at + 8, s[2], 4);
                w(at + 12, s[3], 1);
                w(at + 14, s[4], 2);
            }
        };
        sym(&mut w, 0x340 + syms, [11, 0, 0, 0x12, 0]);
        sym(&mut w, 0x440 + syms, [1, 0x400110, 16, 0x12, 1]);
        sym(&mut w, 0x440 + 2 * syms, [6, 0x601000, 4, 0x11, 0xFFF1]);
        // sections: name, type, flags, address, offset, size, link
        let sections = [
            [0u64, 0, 0, 0, 0, 0, 0],
            [name(".text"), 1, 6, 0x400100, 0x100, 16, 0],
            [name(".dynamic"), 6, 3, 0x400200, 0x200, 0x60, 3],
            [name(".dynstr"), 3, 2, 0x400300, 0x300, 16, 0],
            [name(".dynsym"), 11, 2, 0x400340, 0x340, 2 * syms as u64, 3],
            [name(".strtab"), 3, 0, 0, 0x400, 14, 0],
            [name(".symtab"), 2, 0, 0, 0x440, 3 * syms as u64, 5],
            [name(".shstrtab"), 3, 0, 0, 0x500, shstr.len() as u64, 0],
        ];
        for (i, s) in sections.iter().enumerate() {
            let at = 0x600 + i * shsize;
            w(at, s[0], 4);
            w(at + 4, s[1], 4);
            if is64 {
                for (k, v) in [s[2], s[3], s[4], s[5]].iter().enumerate() {
                    w(at + 8 + 8 * k, *v, 8);
                }
                w(at + 40, s[6], 4);
            } else {
                for (k, v) in [s[2], s[3], s[4], s[5], s[6]].iter().enumerate() {
                    w(at + 8 + 4 * k, *v, 4);
                }
            }
        }
        d
    }

    #[test]
    fn elf_module() {
        for (is64, le, machine) in [(true, true, "EM_X86_64"), (false, false, "EM_PPC"), (true, false, "EM_AARCH64"), (false, true, "EM_386")] {
            let code = CONSTS.iter().find(|c| c.0 == format!("elf.{machine}")).unwrap().1 as u16;
            let img = elf_image(is64, le, code);
            let conditions = [
                "elf.type == elf.ET_EXEC".to_string(),
                format!("elf.machine == elf.{machine}"),
                "elf.entry_point == 0x110 and $code at elf.entry_point".into(),
                "elf.number_of_sections == 8 and elf.number_of_segments == 2 and elf.sh_offset == 0x600 and elf.ph_offset == 0x40".into(),
                r#"elf.sections[1].name == ".text" and elf.sections[1].type == elf.SHT_PROGBITS and elf.sections[1].flags & elf.SHF_EXECINSTR and elf.sections[1].address == 0x400100 and elf.sections[1].offset == 0x100 and elf.sections[1].size == 16"#.into(),
                "elf.segments[0].type == elf.PT_LOAD and elf.segments[0].flags == elf.PF_R | elf.PF_X and elf.segments[0].virtual_address == 0x400000 and elf.segments[0].file_size == 0x1000 and elf.segments[0].memory_size == 0x1000 and elf.segments[0].alignment == 0x1000".into(),
                "elf.segments[1].type == elf.PT_DYNAMIC and elf.segments[1].offset == 0x200 and elf.segments[1].flags == elf.PF_R | elf.PF_W".into(),
                "elf.dynamic_section_entries == 3 and elf.dynamic[0].type == elf.DT_NEEDED and elf.dynamic[1].val == 0x400300 and elf.dynamic[2].type == elf.DT_NULL and not defined elf.dynamic[3].type".into(),
                r#"elf.symtab_entries == 3 and elf.symtab[1].name == "main" and elf.symtab[1].value == 0x400110 and elf.symtab[1].size == 16 and elf.symtab[1].type == elf.STT_FUNC and elf.symtab[1].bind == elf.STB_GLOBAL and elf.symtab[1].shndx == 1"#.into(),
                r#"elf.dynsym_entries == 2 and elf.dynsym[1].name == "puts" and elf.dynsym[0].name == """#.into(),
                r#"for any s in elf.symtab : ( s.name == "counter" and s.type == elf.STT_OBJECT and s.shndx == 0xFFF1 )"#.into(),
                "for any seg in elf.segments : ( seg.type == elf.PT_DYNAMIC ) and for all s in elf.sections : ( s.offset < filesize )".into(),
                r#"for any i in (0..elf.number_of_sections - 1) : ( elf.sections[i].name == ".shstrtab" and elf.sections[i].type == elf.SHT_STRTAB )"#.into(),
                "entrypoint == elf.entry_point".into(),
            ];
            let refs: Vec<&str> = conditions.iter().map(String::as_str).collect();
            let ok = true_conditions(&img, "import \"elf\"", "strings: $code = { 55 48 89 E5 }", &refs);
            assert_eq!(ok, (0..conditions.len()).collect::<Vec<_>>(), "64-bit {is64}, little-endian {le}");
            // every truncation and random corruption: no panic, no error
            let rule = format!("import \"elf\" rule r {{ strings: $code = {{ 55 48 89 E5 }} condition: {} }}", refs.join(" and "));
            for n in (0..img.len()).step_by(7) {
                let r = run_on(&img[..n], &rule);
                assert!(r["errors"].as_array().unwrap().is_empty(), "{n}: {r}");
            }
            let mut seed = 99u64;
            for _ in 0..200 {
                let mut d = img.clone();
                for _ in 0..8 {
                    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                    let at = (seed >> 33) as usize % 0x700;
                    d[at] = (seed >> 13) as u8;
                }
                run_on(&d, &rule);
            }
        }
        let ok = true_conditions(b"not an ELF file", "import \"elf\"", "", &["not defined elf.type", "elf.number_of_sections >= 0", "for any s in elf.sections : ( true )"]);
        assert_eq!(ok, vec![0]);
    }

    #[test]
    fn math_module_functions() {
        let mut d = b"abc".to_vec();
        d.extend(0..=255u8);
        d.extend([0x00, 0xFF]);
        // independent serial correlation of the 256-byte ramp (YARA's formula, no wrap-around)
        let (mut t1, mut t2, mut t3, mut last) = (0f64, 0f64, 0f64, 0f64);
        for b in 0..=255u8 {
            let u = b as f64;
            t1 += last * u;
            t2 += u;
            t3 += u * u;
            last = u;
        }
        let scc = (256.0 * t1 - t2 * t2) / (256.0 * t3 - t2 * t2);
        let conditions = [
            format!("math.serial_correlation(3, 256) > {} and math.serial_correlation(3, 256) < {}", scc - 1e-9, scc + 1e-9),
            r#"math.serial_correlation("aaaa") == -100000.0"#.into(),
            r#"math.monte_carlo_pi("\x00\x00\x00\x00\x00\x00") > 0.2732 and math.monte_carlo_pi("\x00\x00\x00\x00\x00\x00") < 0.2733"#.into(),
            r#"not defined math.monte_carlo_pi("abc") and math.monte_carlo_pi(3, 256) < 1.0"#.into(),
            "math.deviation(259, 2, math.MEAN_BYTES) == 127.5 and math.MEAN_BYTES == 127.5".into(),
            r#"math.deviation("\x00\xFF", 127.5) == 127.5 and math.deviation("aaa", 97.0) == 0.0"#.into(),
            "math.count(0x61, 0, 3) == 1 and math.count(0x61) == 2 and math.count(0x00) == 2 and not defined math.count(300)".into(),
            "math.percentage(0x61, 0, 3) > 0.333 and math.percentage(0x61, 0, 3) < 0.334 and math.percentage(0x62) > 0.0076 and math.percentage(0x62) < 0.0077".into(),
            "math.mode() == 0x00 and math.mode(0, 3) == 0x61 and math.mode(0x60, 10) == 0x5D".into(),
            "math.in_range(0.5, 0.0, 1.0) and not math.in_range(2, 0, 1) and math.in_range(math.entropy(3, 256), 7.9, 8.1)".into(),
            "math.to_number(1 == 1) == 1 and math.to_number(1 == 2) == 0 and math.abs(-5) == 5 and math.abs(5) == 5".into(),
            "math.min(3, 4) == 3 and math.max(3, 4) == 4 and math.min(-1, 2) == -1".into(),
            r#"math.to_string(32) == "32" and math.to_string(32, 16) == "20" and math.to_string(8, 8) == "10" and math.to_string(-7) == "-7" and not defined math.to_string(1, 7)"#.into(),
            "not defined math.deviation(999999, 1, 1.0) and not defined math.mode(5000, 1)".into(),
        ];
        let refs: Vec<&str> = conditions.iter().map(String::as_str).collect();
        let ok = true_conditions(&d, "import \"math\"", "", &refs);
        assert_eq!(ok, (0..conditions.len()).collect::<Vec<_>>());
    }

    #[test]
    fn of_rule_sets() {
        let r = run(r#"
            rule r_a { condition: true } rule r_b { condition: false } rule r_c { condition: filesize > 0 }
            rule s1 { condition: any of (r_a, r_b) } rule s2 { condition: 2 of (r_*) } rule s3 { condition: all of (r_*) }
            rule s4 { condition: none of (r_b) and 1 of (r_b, r_c) } rule s5 { condition: 50% of (r_*, s1) }
            rule s6 { condition: any of (later) } rule later { condition: true }"#);
        assert_eq!(names(&r), vec!["r_a", "r_c", "s1", "s2", "s4", "s5", "s6", "later"], "{r}");
        assert!(first_error("rule a { condition: any of (nope) }")["message"].as_str().unwrap().contains("nope"));
        assert!(first_error("rule a { condition: any of (zz*) }")["message"].as_str().unwrap().contains("zz*"));
        assert!(first_error("rule a { condition: true } rule b { condition: for any of (a) : ( true ) }")["message"].as_str().unwrap().contains("string set"));
    }

    #[test]
    fn evaluation_reports_progress_and_cancels() {
        let d = vec![7u8; 3 << 20];
        let rules = "import \"hash\" import \"math\" rule h { condition: hash.md5(0, filesize) != \"\" and math.entropy(0, filesize) == 0.0 and hash.md5(0, filesize) != \"x\" }";
        let mut calls = Vec::new();
        let r = scan(&d, &json!({ "rules": rules }), &mut |done, total| {
            calls.push((done, total));
            true
        })
        .unwrap();
        assert_eq!(names(&r), vec!["h"]);
        // one call from the search (a single 4 MiB chunk), three 1 MiB chunks each for md5 and entropy (md5 cached)
        assert_eq!(calls.len(), 7, "{calls:?}");
        assert_eq!(calls[1], (1 << 20, 3 << 20));
        let mut n = 0;
        let r = scan(&d, &json!({ "rules": rules }), &mut |_, _| {
            n += 1;
            n < 3
        });
        assert_eq!(r.unwrap_err(), CANCELLED);
    }

    #[test]
    fn console_and_time() {
        let rules = r#"import "console" import "time"
            rule c { condition: console.log("hello") and console.log("n=", 5) and console.hex("h=", 255) and console.log("s=", "x")
                     and console.hex(16) and time.now() > 1600000000 }
            rule d { condition: false and console.log("never") }
            rule e { condition: c and console.log("after c") }"#;
        let r = run(rules);
        assert_eq!(names(&r), vec!["c", "e"]);
        assert_eq!(r["log"], json!(["hello", "n=5", "h=0xff", "s=x", "0x10", "after c"]));
        let r = scan(&sample(), &json!({ "rules": "import \"time\" rule t { condition: time.now() == 1700000000 }", "now": 1_700_000_000 }), &mut no_progress()).unwrap();
        assert_eq!(names(&r), vec!["t"]);
    }

    /// Every 5th truncation (no error) and 200 random corruptions of `region` (no panic).
    fn fuzz(img: &[u8], rule: &str, region: std::ops::Range<usize>) {
        for n in (0..img.len()).step_by(5) {
            let r = run_on(&img[..n], rule);
            assert!(r["errors"].as_array().unwrap().is_empty(), "{n}: {r}");
        }
        let mut seed = 7u64;
        for _ in 0..200 {
            let mut d = img.to_vec();
            for _ in 0..8 {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                let at = region.start + (seed >> 33) as usize % region.len();
                d[at] = (seed >> 13) as u8;
            }
            run_on(&d, rule);
        }
    }

    /// One rule per condition must hold; then the conjunction under fuzzing.
    fn check_all(img: &[u8], imports: &str, strings: &str, conditions: &[String], region: std::ops::Range<usize>) {
        let refs: Vec<&str> = conditions.iter().map(String::as_str).collect();
        let ok = true_conditions(img, imports, strings, &refs);
        assert_eq!(ok, (0..conditions.len()).collect::<Vec<_>>());
        let rule = format!("{imports} rule r {{ {strings} condition: {} }}", refs.join(" and "));
        assert_eq!(names(&run_on(img, &rule)), vec!["r"]);
        fuzz(img, &rule, region);
    }

    fn der(tag: u8, content: &[u8]) -> Vec<u8> {
        let n = content.len();
        let mut v = vec![tag];
        if n < 0x80 {
            v.push(n as u8);
        } else if n < 0x100 {
            v.extend([0x81, n as u8]);
        } else {
            v.extend([0x82, (n >> 8) as u8, n as u8]);
        }
        v.extend(content);
        v
    }
    fn der_seq(parts: &[Vec<u8>]) -> Vec<u8> {
        der(0x30, &parts.concat())
    }
    fn der_oid(dotted: &str) -> Vec<u8> {
        let p: Vec<u64> = dotted.split('.').map(|x| x.parse().unwrap()).collect();
        let mut out = vec![(p[0] * 40 + p[1]) as u8];
        for &v in &p[2..] {
            let mut groups = vec![(v & 0x7F) as u8];
            let mut v = v >> 7;
            while v > 0 {
                groups.push((v & 0x7F) as u8 | 0x80);
                v >>= 7;
            }
            out.extend(groups.iter().rev());
        }
        der(6, &out)
    }
    fn der_name(parts: &[(&str, &str)]) -> Vec<u8> {
        der_seq(&parts.iter().map(|(o, v)| der(0x31, &der_seq(&[der_oid(o), der(0x13, v.as_bytes())]))).collect::<Vec<_>>())
    }
    fn test_cert(serial: &[u8], issuer: &[(&str, &str)], subject: &[(&str, &str)]) -> Vec<u8> {
        let alg = der_seq(&[der_oid("1.2.840.113549.1.1.11"), der(5, &[])]);
        let validity = der_seq(&[der(0x17, b"200101000000Z"), der(0x17, b"300101000000Z")]);
        let tbs = der_seq(&[der(0xA0, &der(2, &[2])), der(2, serial), alg.clone(), der_name(issuer), validity, der_name(subject), der_seq(&[])]);
        der_seq(&[tbs, alg, der(3, &[0, 1, 2, 3])])
    }
    fn pkcs7(certs: &[Vec<u8>]) -> Vec<u8> {
        let signed = der_seq(&[der(2, &[1]), der(0x31, &[]), der_seq(&[der_oid("1.3.6.1.4.1.311.2.1.4")]), der(0xA0, &certs.concat()), der(0x31, &[])]);
        der_seq(&[der_oid("1.2.840.113549.1.7.2"), der(0xA0, &signed)])
    }

    /// pe_image() with a third section .extra (RVA 0x3000, file 0xA00, 0x300 bytes) holding `extra`, and data
    /// directories (index, RVA, size) set.
    fn pe_with_extra(extra: &[u8], dirs: &[(usize, u32, u32)]) -> Vec<u8> {
        let mut d = pe_image();
        d.resize(0xD00, 0);
        d[0xA00..0xA00 + extra.len()].copy_from_slice(extra);
        d[0x86..0x88].copy_from_slice(&3u16.to_le_bytes());
        let at = 0x188 + 80;
        d[at..at + 6].copy_from_slice(b".extra");
        for (k, v) in [0x300u32, 0x3000, 0x300, 0xA00].iter().enumerate() {
            d[at + 8 + 4 * k..at + 12 + 4 * k].copy_from_slice(&v.to_le_bytes());
        }
        d[at + 36..at + 40].copy_from_slice(&0x4000_0040u32.to_le_bytes());
        for &(i, rva, size) in dirs {
            let o = 0x98 + 112 + 8 * i;
            d[o..o + 4].copy_from_slice(&rva.to_le_bytes());
            d[o + 4..o + 8].copy_from_slice(&size.to_le_bytes());
        }
        d
    }

    #[test]
    fn pe_import_details_delayed_overlay_pdb_signatures() {
        let mut extra = vec![0u8; 0x300];
        let mut w = |o: usize, b: &[u8]| extra[o..o + b.len()].copy_from_slice(b);
        // debug directory at RVA 0x3000: CodeView RSDS at file 0xA40
        w(12, &2u32.to_le_bytes());
        w(16, &0x40u32.to_le_bytes());
        w(20, &0x3040u32.to_le_bytes());
        w(24, &0xA40u32.to_le_bytes());
        w(0x40, b"RSDS");
        w(0x58, b"C:\\build\\test.pdb\0");
        // delay-load descriptor at RVA 0x3100: advapi32.dll, names at 0x3160 (RegOpenKeyExW, ordinal 7), IAT at 0x3140
        w(0x100, &1u32.to_le_bytes());
        w(0x104, &0x3180u32.to_le_bytes());
        w(0x10C, &0x3140u32.to_le_bytes());
        w(0x110, &0x3160u32.to_le_bytes());
        w(0x160, &0x31A0u64.to_le_bytes());
        w(0x168, &0x8000_0000_0000_0007u64.to_le_bytes());
        w(0x180, b"advapi32.dll");
        w(0x1A2, b"RegOpenKeyExW");
        let signer = [("2.5.4.6", "US"), ("2.5.4.10", "Example"), ("2.5.4.3", "Example Signer")];
        let certs = [test_cert(&[0x00, 0x12, 0xAB], &[("2.5.4.6", "US"), ("2.5.4.10", "Test CA"), ("2.5.4.3", "Test Root")], &signer), test_cert(&[0x05], &[("2.5.4.3", "Test Root")], &[("2.5.4.3", "Test Root")])];
        let blob = pkcs7(&certs);
        let entry = 8 + blob.len();
        let mut d = pe_with_extra(&extra, &[(4, 0xD00, ((entry + 7) & !7) as u32), (6, 0x3000, 28), (13, 0x3100, 64)]);
        d.extend((entry as u32).to_le_bytes());
        d.extend(0x0200u16.to_le_bytes());
        d.extend(2u16.to_le_bytes());
        d.extend(&blob);
        while d.len() % 8 != 0 {
            d.push(0);
        }
        let thumb = crate::hash::digest_bytes("sha1", &certs[0]).unwrap();
        let imphash = crate::hash::digest_bytes("md5", b"kernel32.createfilea,kernel32.exitprocess,kernel32.ord5,user32.messageboxa").unwrap();
        let conditions = [
            format!(r#"pe.imphash() == "{imphash}""#),
            r#"pe.import_details[0].library_name == "KERNEL32.dll" and pe.import_details[0].number_of_functions == 3 and pe.import_details[1].number_of_functions == 1"#.into(),
            r#"pe.import_details[0].functions[0].name == "CreateFileA" and pe.import_details[0].functions[2].ordinal == 5 and not defined pe.import_details[0].functions[2].name and pe.import_details[0].functions[1].rva == 0x2048"#.into(),
            r#"for any imp in pe.import_details : ( imp.library_name iequals "user32.dll" and for any f in imp.functions : ( f.name == "MessageBoxA" ) )"#.into(),
            "for all i in (0..pe.number_of_imports - 1) : ( for all f in pe.import_details[i].functions : ( f.rva >= 0x2040 ) )".into(),
            "pe.number_of_delayed_imports == 1 and pe.number_of_delayed_imported_functions == 2".into(),
            r#"pe.delayed_import_details[0].library_name == "advapi32.dll" and pe.delayed_import_details[0].functions[0].name == "RegOpenKeyExW" and pe.delayed_import_details[0].functions[1].ordinal == 7 and pe.delayed_import_details[0].functions[1].rva == 0x3148"#.into(),
            r#"pe.delayed_imports("ADVAPI32.dll", "RegOpenKeyExW") and pe.delayed_imports("advapi32.dll", 7) and pe.imports(pe.IMPORT_DELAYED, "advapi32.dll", "RegOpenKeyExW") and not pe.imports("advapi32.dll", "RegOpenKeyExW")"#.into(),
            r#"pe.imports(pe.IMPORT_ANY, /32\.dll$/i) == 6 and pe.imports(pe.IMPORT_STANDARD, "user32.dll") == 1 and pe.imports(pe.IMPORT_DELAYED, "user32.dll") == 0"#.into(),
            "pe.overlay.offset == 0xD00 and pe.overlay.size == filesize - 0xD00 and pe.overlay.size > 0".into(),
            r#"pe.pdb_path == "C:\\build\\test.pdb""#.into(),
            "pe.number_of_signatures == 2 and pe.signatures[0].number_of_certificates == 2".into(),
            r#"pe.signatures[0].issuer == "/C=US/O=Test CA/CN=Test Root" and pe.signatures[0].subject == "/C=US/O=Example/CN=Example Signer""#.into(),
            r#"pe.signatures[0].serial == "12:ab" and pe.signatures[1].serial == "05" and pe.signatures[0].version == 3"#.into(),
            r#"pe.signatures[0].algorithm == "sha256WithRSAEncryption" and pe.signatures[0].algorithm_oid == "1.2.840.113549.1.1.11""#.into(),
            "pe.signatures[0].not_before == 1577836800 and pe.signatures[0].not_after == 1893456000".into(),
            format!(r#"pe.signatures[0].thumbprint == "{thumb}""#),
            r#"for any s in pe.signatures : ( s.subject == s.issuer and s.subject contains "Root" )"#.into(),
        ];
        check_all(&d, "import \"pe\"", "", &conditions, 0xA00..d.len());
        assert_eq!(pe_module::ordinal_name("ws2_32", 16), Some("recv"));
        assert_eq!(pe_module::ordinal_name("oleaut32", 6), Some("SysFreeString"));
        assert_eq!(pe_module::ordinal_name("kernel32", 1), None);
    }

    /// A Mach-O executable: __PAGEZERO, __TEXT (section __text at file 0xF00), LC_MAIN (64-bit) or LC_UNIXTHREAD
    /// (32-bit PowerPC, pc 0x1F00), libSystem, an rpath and a code signature with one entitlement; 0x1000 bytes.
    fn macho_image(is64: bool, le: bool, cputype: u32) -> Vec<u8> {
        let mut d = vec![0u8; 0x1000];
        let mut w = |o: usize, v: u64, n: usize| {
            for k in 0..n {
                d[o + k] = (v >> (8 * if le { k } else { n - 1 - k })) as u8;
            }
        };
        let put = |w: &mut dyn FnMut(usize, u64, usize), at: usize, s: &[u8]| {
            for (k, b) in s.iter().enumerate() {
                w(at + k, *b as u64, 1);
            }
        };
        let (hdr, seg, sect, word) = if is64 { (32, 72, 80, 8) } else { (28, 56, 68, 4) };
        w(0, if is64 { 0xFEED_FACF } else { 0xFEED_FACE }, 4);
        w(4, cputype as u64, 4);
        w(8, 3, 4);
        w(12, 2, 4);
        w(16, 6, 4);
        w(24, 0x0020_0085, 4);
        let segcmd = |w: &mut dyn FnMut(usize, u64, usize), at: usize, name: &[u8], v: [u64; 4], prot: u64, nsects: u64| {
            w(at, if is64 { 0x19 } else { 1 }, 4);
            w(at + 4, (seg + sect * nsects as usize) as u64, 4);
            for (k, b) in name.iter().enumerate() {
                w(at + 8 + k, *b as u64, 1);
            }
            for (k, x) in v.iter().enumerate() {
                w(at + 24 + word * k, *x, word);
            }
            let o = at + 24 + 4 * word;
            w(o, prot, 4);
            w(o + 4, prot, 4);
            w(o + 8, nsects, 4);
        };
        let mut at = hdr;
        segcmd(&mut w, at, b"__PAGEZERO", [0, 0x1000, 0, 0], 0, 0);
        at += seg;
        segcmd(&mut w, at, b"__TEXT", [0x1000, 0x1000, 0, 0x1000], 5, 1);
        let s = at + seg;
        put(&mut w, s, b"__text");
        put(&mut w, s + 16, b"__TEXT");
        w(s + 32, 0x1F00, word);
        w(s + 32 + word, 0x10, word);
        w(s + 32 + 2 * word, 0xF00, 4);
        at += seg + sect;
        if is64 {
            w(at, 0x8000_0028, 4);
            w(at + 4, 24, 4);
            w(at + 8, 0xF00, 8);
            w(at + 16, 0x10000, 8);
            at += 24;
        } else {
            w(at, 5, 4);
            w(at + 4, 176, 4);
            w(at + 8, 1, 4);
            w(at + 12, 40, 4);
            w(at + 16, 0x1F00, 4);
            at += 176;
        }
        w(at, 0xC, 4);
        w(at + 4, 56, 4);
        w(at + 8, 24, 4);
        w(at + 12, 2, 4);
        w(at + 16, 0x0001_0203, 4);
        w(at + 20, 0x0001_0000, 4);
        put(&mut w, at + 24, b"/usr/lib/libSystem.B.dylib\0");
        at += 56;
        w(at, 0x8000_001C, 4);
        w(at + 4, 48, 4);
        w(at + 8, 12, 4);
        put(&mut w, at + 12, b"@executable_path/../Frameworks\0");
        at += 48;
        w(at, 0x1D, 4);
        w(at + 4, 16, 4);
        w(at + 8, 0x800, 4);
        w(at + 12, 0x100, 4);
        at += 16;
        w(20, (at - hdr) as u64, 4);
        for k in 0..16 {
            w(0xF00 + k, [0x55, 0x48, 0x89, 0xE5][k % 4], 1);
        }
        // the code signature is big-endian whatever the file's byte order
        let xml = b"<plist><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>";
        for (k, v) in [0xFADE_0CC0u32, (28 + xml.len()) as u32, 1, 5, 20, 0xFADE_7171, (8 + xml.len()) as u32].iter().enumerate() {
            d[0x800 + 4 * k..0x804 + 4 * k].copy_from_slice(&v.to_be_bytes());
        }
        d[0x81C..0x81C + xml.len()].copy_from_slice(xml);
        d
    }

    #[test]
    fn macho_module() {
        for (is64, le, cpu, cpu_name, magic) in [(true, true, 0x0100_0007, "CPU_TYPE_X86_64", "MH_MAGIC_64"), (false, false, 18, "CPU_TYPE_POWERPC", "MH_CIGAM"), (true, false, 0x0100_000C, "CPU_TYPE_ARM64", "MH_CIGAM_64")] {
            let img = macho_image(is64, le, cpu);
            let conditions = [
                format!("macho.magic == macho.{magic} and macho.cputype == macho.{cpu_name} and macho.cpusubtype == 3 and macho.filetype == macho.MH_EXECUTE and macho.flags & macho.MH_PIE"),
                "macho.ncmds == 6 and macho.number_of_segments == 2 and not defined macho.fat_magic and not defined macho.nfat_arch".into(),
                r#"macho.segments[1].segname == "__TEXT" and macho.segments[1].vmaddr == 0x1000 and macho.segments[1].vmsize == 0x1000 and macho.segments[1].fileoff == 0 and macho.segments[1].fsize == 0x1000 and macho.segments[1].filesize == 0x1000 and macho.segments[1].nsects == 1 and macho.segments[1].maxprot == 5"#.into(),
                r#"macho.segments[1].sections[0].sectname == "__text" and macho.segments[1].sections[0].segname == "__TEXT" and macho.segments[1].sections[0].addr == 0x1F00 and macho.segments[1].sections[0].size == 0x10 and macho.segments[1].sections[0].offset == 0xF00"#.into(),
                "macho.entry_point == 0xF00 and $code at macho.entry_point".into(),
                r#"macho.has_dylib("/usr/lib/libSystem.B.dylib") and not macho.has_dylib("/usr/lib/x") and macho.dylibs[0].current_version == "1.2.3" and macho.dylibs[0].compatibility_version == "1.0.0" and macho.dylibs[0].timestamp == 2"#.into(),
                r#"macho.has_rpath("@executable_path/../Frameworks") and macho.rpaths[0] == "@executable_path/../Frameworks""#.into(),
                r#"macho.has_entitlement("com.apple.security.get-task-allow") and macho.entitlements[0] == "com.apple.security.get-task-allow" and not macho.has_entitlement("x")"#.into(),
                r#"for any s in macho.segments : ( for any c in s.sections : ( c.sectname == "__text" ) ) and for any e in macho.entitlements : ( e contains "task" )"#.into(),
            ];
            check_all(&img, "import \"macho\"", "strings: $code = { 55 48 89 E5 }", &conditions, 0..0x900);
        }
        // a universal binary: x86_64 (little-endian) at 0x1000, PowerPC (big-endian, LC_UNIXTHREAD) at 0x2000
        let mut fat = vec![0u8; 0x1000];
        for (k, v) in [0xCAFE_BABEu32, 2, 0x0100_0007, 3, 0x1000, 0x1000, 12, 18, 0, 0x2000, 0x1000, 12].iter().enumerate() {
            fat[4 * k..4 * k + 4].copy_from_slice(&v.to_be_bytes());
        }
        fat.extend(macho_image(true, true, 0x0100_0007));
        fat.extend(macho_image(false, false, 18));
        let conditions = [
            "macho.fat_magic == macho.FAT_MAGIC and macho.nfat_arch == 2 and macho.fat_arch[1].offset == 0x2000 and macho.fat_arch[1].size == 0x1000 and macho.fat_arch[0].align == 12".to_string(),
            "macho.file[0].cputype == macho.CPU_TYPE_X86_64 and macho.file[1].magic == macho.MH_CIGAM and macho.file[1].entry_point == 0xF00 and not defined macho.magic".into(),
            r#"macho.file[0].segments[1].sections[0].sectname == "__text" and macho.file[1].dylibs[0].name == "/usr/lib/libSystem.B.dylib" and macho.file[1].rpaths[0] contains "Frameworks""#.into(),
            "macho.file_index_for_arch(macho.CPU_TYPE_POWERPC) == 1 and macho.entry_point_for_arch(macho.CPU_TYPE_X86_64) == 0x1F00 and $code at macho.entry_point_for_arch(macho.CPU_TYPE_POWERPC) and not defined macho.file_index_for_arch(macho.CPU_TYPE_ARM)".into(),
            r#"for any f in macho.file : ( f.cputype == macho.CPU_TYPE_POWERPC ) and for all f in macho.file : ( for any s in f.segments : ( s.segname == "__TEXT" and for any c in s.sections : ( c.addr == 0x1F00 ) ) )"#.into(),
            r#"macho.has_dylib("/usr/lib/libSystem.B.dylib") and macho.has_entitlement("com.apple.security.get-task-allow")"#.into(),
        ];
        check_all(&fat, "import \"macho\"", "strings: $code = { 55 48 89 E5 }", &conditions, 0..0x40);
        // a Java class file shares the magic; other data is not Mach-O
        let ok = true_conditions(b"\xCA\xFE\xBA\xBE\x00\x00\x00\x34rest of a class file", "import \"macho\"", "", &["not defined macho.fat_magic and not defined macho.magic"]);
        assert_eq!(ok, vec![0]);
    }

    /// A .NET PE: pe_image() with the CLI header (RVA 0x3000), one resource (0x3080) and metadata (0x3100: #~ with
    /// Module, TypeRef, MemberRef, CustomAttribute (GuidAttribute), ModuleRef, Assembly, AssemblyRef, ManifestResource;
    /// #Strings, #US, #GUID, #Blob) in .extra.
    fn dotnet_image() -> Vec<u8> {
        let mut strings = vec![0u8];
        let mut add = |s: &str| {
            let at = strings.len() as u16;
            strings.extend(s.as_bytes());
            strings.push(0);
            at
        };
        let (module, guid_attr, interop, ctor) = (add("test.exe"), add("GuidAttribute"), add("System.Runtime.InteropServices"), add(".ctor"));
        let (asm, mscorlib, k32, res) = (add("TestAssembly"), add("mscorlib"), add("kernel32.dll"), add("app.resources"));
        let typelib = b"f0e1d2c3-b4a5-9687-7869-5a4b3c2d1e0f";
        let mut value = vec![1u8, 0, typelib.len() as u8];
        value.extend(typelib);
        value.extend([0, 0]);
        let mut blobs = vec![0u8, value.len() as u8];
        blobs.extend(&value);
        let mut us = vec![0u8, 11];
        us.extend(widen(b"Hello"));
        us.push(0);
        let guid: Vec<u8> = (0..16u8).collect();
        let valid: u64 = [0x00, 0x01, 0x0A, 0x0C, 0x1A, 0x20, 0x23, 0x28].iter().map(|t| 1u64 << t).sum();
        let mut t = vec![0, 0, 0, 0, 2, 0, 0, 1];
        t.extend(valid.to_le_bytes());
        t.extend(0u64.to_le_bytes());
        for _ in 0..8 {
            t.extend(1u32.to_le_bytes());
        }
        let w16 = |t: &mut Vec<u8>, vals: &[u16]| {
            for v in vals {
                t.extend(v.to_le_bytes());
            }
        };
        w16(&mut t, &[0, module, 1, 0, 0]);
        w16(&mut t, &[(1 << 2) | 2, guid_attr, interop]);
        w16(&mut t, &[(1 << 3) | 1, ctor, 0]);
        w16(&mut t, &[(1 << 5) | 14, (1 << 3) | 3, 1]);
        w16(&mut t, &[k32]);
        t.extend(0x8004u32.to_le_bytes());
        w16(&mut t, &[1, 2, 3, 4]);
        t.extend(0u32.to_le_bytes());
        w16(&mut t, &[0, asm, 0]);
        w16(&mut t, &[4, 0, 0, 0]);
        t.extend(0u32.to_le_bytes());
        w16(&mut t, &[0, mscorlib, 0, 0]);
        t.extend(0u32.to_le_bytes());
        t.extend(1u32.to_le_bytes());
        w16(&mut t, &[res, 0]);
        let streams: [(&[u8], &[u8]); 5] = [(b"#~", &t), (b"#Strings", &strings), (b"#US", &us), (b"#GUID", &guid), (b"#Blob", &blobs)];
        let mut md = b"BSJB".to_vec();
        md.extend([1, 0, 1, 0, 0, 0, 0, 0]);
        md.extend(12u32.to_le_bytes());
        md.extend(b"v4.0.30319\0\0");
        md.extend([0, 0, 5, 0]);
        let header_len = md.len() + streams.iter().map(|(n, _)| 8 + (n.len() + 4) / 4 * 4).sum::<usize>();
        let mut data = Vec::new();
        let mut offsets = Vec::new();
        for (_, s) in &streams {
            offsets.push(header_len + data.len());
            data.extend(*s);
            while data.len() % 4 != 0 {
                data.push(0);
            }
        }
        for ((n, s), off) in streams.iter().zip(&offsets) {
            md.extend((*off as u32).to_le_bytes());
            md.extend((s.len() as u32).to_le_bytes());
            let mut name = n.to_vec();
            name.push(0);
            while name.len() % 4 != 0 {
                name.push(0);
            }
            md.extend(name);
        }
        md.extend(data);
        let mut extra = vec![0u8; 0x100];
        for (at, v) in [(0, 72u32), (8, 0x3100), (12, md.len() as u32), (16, 1), (24, 0x3080), (28, 8), (0x80, 4)] {
            extra[at..at + 4].copy_from_slice(&v.to_le_bytes());
        }
        extra[4..8].copy_from_slice(&[2, 0, 5, 0]);
        extra[0x84..0x88].copy_from_slice(b"RSRC");
        extra.extend(&md);
        assert!(extra.len() <= 0x300);
        pe_with_extra(&extra, &[(14, 0x3000, 72)])
    }

    #[test]
    fn dotnet_module() {
        let img = dotnet_image();
        let conditions = [
            r#"dotnet.is_dotnet == 1 and dotnet.version == "v4.0.30319" and dotnet.module_name == "test.exe""#.to_string(),
            r##"dotnet.number_of_streams == 5 and dotnet.streams[0].name == "#~" and dotnet.streams[4].name == "#Blob" and dotnet.streams[0].offset > 0xB00 and dotnet.streams[3].size == 16"##.into(),
            r#"dotnet.number_of_guids == 1 and dotnet.guids[0] == "03020100-0504-0706-0809-0a0b0c0d0e0f" and uint32(dotnet.streams[3].offset) == 0x03020100"#.into(),
            r#"dotnet.number_of_user_strings == 1 and dotnet.user_strings[0] == "H\x00e\x00l\x00l\x00o\x00" and for any s in dotnet.user_strings : ( s startswith "H\x00" )"#.into(),
            r#"dotnet.assembly.name == "TestAssembly" and dotnet.assembly.version.major == 1 and dotnet.assembly.version.minor == 2 and dotnet.assembly.version.build_number == 3 and dotnet.assembly.version.revision_number == 4 and dotnet.assembly.culture == """#.into(),
            r#"dotnet.number_of_assembly_refs == 1 and dotnet.assembly_refs[0].name == "mscorlib" and dotnet.assembly_refs[0].version.major == 4"#.into(),
            r#"dotnet.number_of_modulerefs == 1 and dotnet.modulerefs[0] == "kernel32.dll""#.into(),
            r#"dotnet.number_of_resources == 1 and dotnet.resources[0].name == "app.resources" and dotnet.resources[0].length == 4 and uint32(dotnet.resources[0].offset) == 0x43525352"#.into(),
            r#"dotnet.typelib == "f0e1d2c3-b4a5-9687-7869-5a4b3c2d1e0f""#.into(),
            r#"for any r in dotnet.assembly_refs : ( r.name == "mscorlib" and r.version.major == 4 )"#.into(),
        ];
        check_all(&img, "import \"dotnet\"", "", &conditions, 0xA00..0xD00);
        let ok = true_conditions(&pe_image(), "import \"dotnet\"", "", &["dotnet.is_dotnet == 0 and not defined dotnet.version", "for any s in dotnet.streams : ( true )"]);
        assert_eq!(ok, vec![0]);
        assert!(first_error("import \"dotnet\" rule e { condition: dotnet.user_strings[0].x == 1 }")["message"].as_str().is_some());
    }

    /// A DEX file: strings <init> LMain; Ljava/lang/Object; main V, three types, methods LMain;->main and
    /// Ljava/lang/Object;-><init>, one public class LMain; extending Object.
    fn dex_image() -> Vec<u8> {
        let mut d = vec![0u8; 0x300];
        let mut w = |o: usize, v: u32| d[o..o + 4].copy_from_slice(&v.to_le_bytes());
        for (o, v) in [(8, 0x1122_3344u32), (32, 0x300), (36, 0x70), (40, 0x1234_5678), (56, 5), (60, 0x70), (64, 3), (68, 0x90), (88, 2), (92, 0xA0), (96, 1), (100, 0xB0), (104, 0x100), (108, 0x200)] {
            w(o, v);
        }
        for (k, v) in [1u32, 2, 4].iter().enumerate() {
            w(0x90 + 4 * k, *v);
        }
        w(0xA0, 0);
        w(0xA4, 3);
        w(0xA8, 1);
        w(0xAC, 0);
        w(0xB0, 0);
        w(0xB4, 1);
        w(0xB8, 1);
        w(0xC0, 0xFFFF_FFFF);
        let mut pos = 0x200;
        for (i, s) in ["<init>", "LMain;", "Ljava/lang/Object;", "main", "V"].iter().enumerate() {
            d[0x70 + 4 * i..0x74 + 4 * i].copy_from_slice(&(pos as u32).to_le_bytes());
            d[pos] = s.len() as u8;
            d[pos + 1..pos + 1 + s.len()].copy_from_slice(s.as_bytes());
            pos += s.len() + 2;
        }
        d[..8].copy_from_slice(b"dex\n035\0");
        d[12..32].fill(0xAB);
        d
    }

    #[test]
    fn dex_module() {
        let conditions = [
            "dex.header.magic == dex.DEX_FILE_MAGIC_035 and dex.header.checksum == 0x11223344 and dex.header.endian_tag == dex.ENDIAN_CONSTANT and dex.header.file_size == filesize".to_string(),
            "dex.header.string_ids_size == 5 and dex.header.string_ids_offset == 0x70 and dex.header.method_ids_offset == 0xA0 and dex.header.data_offset == 0x200".into(),
            r#"dex.number_of_strings == 5 and dex.string_ids[3].value == "main" and dex.string_ids[3].size == 4 and dex.string_ids[0].offset == 0x200"#.into(),
            "dex.number_of_types == 3 and dex.type_ids[0].descriptor_idx == 1 and dex.number_of_classes == 1 and dex.class_defs[0].access_flags == dex.ACC_PUBLIC and dex.class_defs[0].source_file_idx == dex.NO_INDEX".into(),
            r#"dex.number_of_methods == 2 and dex.methods[0].name == "main" and dex.methods[0].class_name == "LMain;" and dex.method_ids[1].name_idx == 0 and dex.method_ids[1].class_idx == 1"#.into(),
            r#"dex.has_method("main") and dex.has_method("LMain;", "main") and not dex.has_method("LMain;", "<init>") and dex.has_class("LMain;") and not dex.has_class("LFoo;")"#.into(),
            r#"for any m in dex.methods : ( m.name == "<init>" and m.class_name == "Ljava/lang/Object;" )"#.into(),
            r#"dex.header.signature == "\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB\xAB""#.into(),
        ];
        check_all(&dex_image(), "import \"dex\"", "", &conditions, 0..0x300);
        assert_eq!(true_conditions(b"not a dex file", "import \"dex\"", "", &["not defined dex.header.magic", "dex.number_of_strings >= 0"]), vec![0]);
    }

    #[test]
    fn magic_module() {
        let png = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR\0\0\0\x01\0\0\0\x01\x08\x02\0\0\0".to_vec();
        for data in [pe_image(), png, macho_image(true, true, 0x0100_0007)] {
            let det = crate::magic::detect(&data, &json!({})).unwrap();
            let text = |k: &str| det[k].as_str().unwrap_or_default().replace('\\', "\\\\").replace('"', "\\\"");
            let details = text("details");
            let description = if details.is_empty() { text("name") } else { format!("{}, {details}", text("name")) };
            let c = [format!(r#"magic.type() == "{description}" and magic.mime_type() == "{}""#, text("mime"))];
            let refs: Vec<&str> = c.iter().map(String::as_str).collect();
            assert_eq!(true_conditions(&data, "import \"magic\"", "", &refs), vec![0], "{det}");
        }
        let det = crate::magic::detect(&b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec(), &json!({})).unwrap();
        assert_eq!(det["mime"], json!("image/png"));
    }
}
