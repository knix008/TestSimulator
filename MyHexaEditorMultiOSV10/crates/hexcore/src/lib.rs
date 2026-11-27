//! MyHexaMaster core. Everything that understands bytes lives here and is shared by the desktop backend
//! (src-tauri, documents backed by files, disks and process memory) and the web build (crates/hexwasm,
//! documents held in memory). The page talks to it through one JSON API: `engine::Engine::call`.
//!
//! | module | what |
//! | --- | --- |
//! | `source` | where a document's original bytes come from (`Source`: memory here; files, disks, processes in src-tauri) |
//! | `doc` | `Document`: a piece table over a source — overwrite, insert, delete, undo/redo, modified ranges, saving |
//! | `search` | hex (with `??` wildcards), text in many encodings, regular expressions, numbers; find, find all, replace all |
//! | `hash` | checksums (sums, CRC-8…64, Adler, Fletcher) and hashes (MD2…SHA-3, BLAKE, RIPEMD) |
//! | `inspect` | the data inspector: every interpretation of the bytes at the caret, and writing a value back |
//! | `ops` | byte operations (xor, add, shifts, rotations, swaps…), encryption, compression, encodings |
//! | `stats` | histogram, entropy (whole and per block), byte classes |
//! | `strings` | text strings in the data (ASCII, UTF-8, UTF-16) |
//! | `compare` | differences between two documents (byte by byte, or with insertions and deletions) |
//! | `magic` | file type detection and file carving (data recovery by signature) |
//! | `pattern` | the binary template language (010 Editor / ImHex style) and the built-in templates |
//! | `disasm` | disassembler: x86 (16/32/64) and ARM (32, Thumb, 64) |
//! | `export` | hex dumps, source-code arrays, Base64, Intel HEX, Motorola S-record…; and importing them |
//! | `calc` | the calculator / base converter |
//! | `codec` | text encodings used by search and export |
//! | `engine` | JSON dispatch: documents by id and every method above |
pub mod source;
pub mod doc;
pub mod util;
pub mod codec;
pub mod search;
pub mod hash;
pub mod inspect;
pub mod ops;
pub mod stats;
pub mod strings;
pub mod compare;
pub mod magic;
pub mod pattern;
pub mod disasm;
pub mod export;
pub mod calc;
pub mod fsys;
pub mod yara;
pub mod engine;

pub use doc::{Bytes, Document};
pub use engine::Engine;
pub use source::{MemSource, Source};
