//! MyMarkdownMaster core — the Rust heart of the app, shared by the desktop backend (src-tauri) and the web
//! build (crates/mdwasm → WebAssembly): note parsing, the vault index and link resolution, search,
//! Markdown rendering with Obsidian's syntax, link updates on rename, templates and dates, writing
//! statistics and style checks, and every export format. `engine::Engine::call` is the one JSON API.
pub mod options;
pub mod scan;
pub mod note;
pub mod index;
pub mod search;
pub mod emoji;
pub mod render;
pub mod rename;
pub mod template;
pub mod writing;
pub mod engine;
pub mod base64;
pub mod export;
