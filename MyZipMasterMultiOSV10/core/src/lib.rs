//! MyZipMaster's engine. The desktop app and the web build call the same functions: the desktop
//! on real files, the web build on files held in memory.

pub mod codecs;
pub mod detect;
pub mod error;
pub mod formats;
pub mod model;
pub mod ops;
pub mod tools;
pub mod vfs;
pub mod volumes;

pub use error::{Error, Result};
pub use model::{ArchiveInfo, Ctx, Entry, Format, NoProgress, Progress};
pub use vfs::{Fs, MemFs, Vfs};

#[cfg(not(target_arch = "wasm32"))]
pub use vfs::OsFs;

use serde::de::DeserializeOwned;
use serde::Serialize;

fn parse<T: DeserializeOwned>(json: &str) -> Result<T> {
    serde_json::from_str(json).map_err(|e| Error::Invalid(format!("options: {e}")))
}

/// JSON options to their struct, for operations that do not go through `dispatch`.
pub fn parse_options<T: DeserializeOwned>(json: &str) -> Result<T> {
    parse(json)
}

fn text<T: Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value).map_err(|e| Error::Invalid(format!("result: {e}")))
}

/// Runs an operation by name with JSON options, returning JSON. Both front ends come through here.
pub fn dispatch(ctx: &Ctx, op: &str, options: &str) -> Result<String> {
    match op {
        "list" => text(&ops::list(ctx, &parse(options)?)?),
        "extract" => text(&ops::extract(ctx, &parse(options)?)?),
        "conflicts" => text(&ops::conflicts(ctx, &parse(options)?)?),
        "test" => text(&ops::test(ctx, &parse(options)?)?),
        "create" => text(&ops::create(ctx, &parse(options)?)?),
        "modify" => text(&ops::modify(ctx, &parse(options)?)?),
        "convert" => text(&ops::convert(ctx, &parse(options)?)?),
        "repair" => text(&ops::repair(ctx, &parse(options)?)?),
        "hash" => text(&tools::hash(ctx, &parse(options)?)?),
        "split" => text(&tools::split_file(ctx, &parse(options)?)?),
        "join" => text(&tools::join_files(ctx, &parse(options)?)?),
        "benchmark" => text(&tools::benchmark(ctx, &parse(options)?)?),
        other => Err(Error::Invalid(format!("unknown operation {other}"))),
    }
}

/// The result shape the front ends expect, whichever way it went. A panic in a decoder, on a file
/// made to cause one, becomes an error for that operation rather than the end of the program.
pub fn dispatch_envelope(ctx: &Ctx, op: &str, options: &str) -> String {
    let run = std::panic::AssertUnwindSafe(|| dispatch(ctx, op, options));
    match std::panic::catch_unwind(run) {
        Ok(Ok(result)) => format!("{{\"ok\":true,\"result\":{result}}}"),
        Ok(Err(e)) => serde_json::json!({ "ok": false, "code": e.code(), "detail": e.detail() }).to_string(),
        Err(_) => serde_json::json!({ "ok": false, "code": "corrupt", "detail": "the decoder could not handle this data" }).to_string(),
    }
}
