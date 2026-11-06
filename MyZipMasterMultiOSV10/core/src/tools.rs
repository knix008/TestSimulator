//! The tools beside the archiver proper: checksums, splitting any file, benchmark.

use std::collections::BTreeMap;
use std::io::{Read, Write};

use serde::{Deserialize, Serialize};
use sha1::Digest;

use crate::codecs::{self, copy_all};
use crate::error::{Error, Result};
use crate::model::*;
use crate::vfs::Fs;
use crate::volumes::{discover, ConcatReader, Naming, SplitWriter, VolumeKind};

// ── Checksums ─────────────────────────────────────────────────────────────────────────────────

pub const HASH_NAMES: &[&str] = &["crc32", "crc64", "md5", "sha1", "sha256", "sha512", "blake3"];

/// CRC-64/XZ, the one 7-Zip shows.
struct Crc64(u64);

fn crc64_table() -> &'static [u64; 256] {
    static TABLE: std::sync::OnceLock<[u64; 256]> = std::sync::OnceLock::new();
    TABLE.get_or_init(|| {
        let mut t = [0u64; 256];
        for (i, slot) in t.iter_mut().enumerate() {
            let mut c = i as u64;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xC96C_5795_D787_0F42 ^ (c >> 1) } else { c >> 1 };
            }
            *slot = c;
        }
        t
    })
}

impl Crc64 {
    fn update(&mut self, data: &[u8]) {
        let t = crc64_table();
        let mut c = !self.0;
        for &b in data {
            c = t[((c ^ b as u64) & 0xFF) as usize] ^ (c >> 8);
        }
        self.0 = !c;
    }
}

enum Hasher {
    Crc32(crc32fast::Hasher),
    Crc64(Crc64),
    Md5(md5::Md5),
    Sha1(sha1::Sha1),
    Sha256(sha2::Sha256),
    Sha512(sha2::Sha512),
    Blake3(Box<blake3::Hasher>),
}

impl Hasher {
    fn new(name: &str) -> Result<Self> {
        Ok(match name {
            "crc32" => Hasher::Crc32(crc32fast::Hasher::new()),
            "crc64" => Hasher::Crc64(Crc64(0)),
            "md5" => Hasher::Md5(md5::Md5::new()),
            "sha1" => Hasher::Sha1(sha1::Sha1::new()),
            "sha256" => Hasher::Sha256(sha2::Sha256::new()),
            "sha512" => Hasher::Sha512(sha2::Sha512::new()),
            "blake3" => Hasher::Blake3(Box::new(blake3::Hasher::new())),
            other => return Err(Error::Invalid(format!("unknown checksum {other}"))),
        })
    }

    fn update(&mut self, data: &[u8]) {
        match self {
            Hasher::Crc32(h) => h.update(data),
            Hasher::Crc64(h) => h.update(data),
            Hasher::Md5(h) => h.update(data),
            Hasher::Sha1(h) => h.update(data),
            Hasher::Sha256(h) => h.update(data),
            Hasher::Sha512(h) => h.update(data),
            Hasher::Blake3(h) => {
                h.update(data);
            }
        }
    }

    fn finish(self) -> String {
        fn hex(bytes: &[u8]) -> String {
            bytes.iter().map(|b| format!("{b:02x}")).collect()
        }
        match self {
            Hasher::Crc32(h) => format!("{:08x}", h.finalize()),
            Hasher::Crc64(h) => format!("{:016x}", h.0),
            Hasher::Md5(h) => hex(&h.finalize()),
            Hasher::Sha1(h) => hex(&h.finalize()),
            Hasher::Sha256(h) => hex(&h.finalize()),
            Hasher::Sha512(h) => hex(&h.finalize()),
            Hasher::Blake3(h) => h.finalize().to_hex().to_string(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashOptions {
    pub paths: Vec<String>,
    #[serde(default)]
    pub algorithms: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashedFile {
    pub path: String,
    pub size: u64,
    pub hashes: BTreeMap<String, String>,
}

fn gather(fs: &Fs, path: &str, out: &mut Vec<(String, u64)>) -> Result<()> {
    let meta = fs.meta(path)?.ok_or_else(|| Error::Io(format!("{path}: not found")))?;
    if meta.is_dir {
        let mut items = fs.read_dir(path)?;
        items.sort_by(|a, b| a.name.cmp(&b.name));
        for item in items {
            if !item.meta.is_symlink {
                gather(fs, &fs.join(path, &item.name), out)?;
            }
        }
    } else {
        out.push((path.to_string(), meta.size));
    }
    Ok(())
}

pub fn hash(ctx: &Ctx, opts: &HashOptions) -> Result<Vec<HashedFile>> {
    let names: Vec<&str> = if opts.algorithms.is_empty() {
        vec!["crc32", "sha256"]
    } else {
        opts.algorithms.iter().map(String::as_str).collect()
    };
    let mut files = Vec::new();
    for p in &opts.paths {
        gather(&ctx.fs, p, &mut files)?;
    }
    let tally = Tally::new(ctx, files.iter().map(|f| f.1).sum());
    let mut out = Vec::with_capacity(files.len());
    for (path, size) in files {
        let mut hashers: Vec<(String, Hasher)> =
            names.iter().map(|n| Ok((n.to_string(), Hasher::new(n)?))).collect::<Result<_>>()?;
        let mut src = ctx.fs.open(&path)?;
        let mut buf = vec![0u8; 256 * 1024];
        loop {
            ctx.check()?;
            let n = src.read(&mut buf)?;
            if n == 0 {
                break;
            }
            for (_, h) in &mut hashers {
                h.update(&buf[..n]);
            }
            tally.add(n as u64, &path);
        }
        out.push(HashedFile {
            path,
            size,
            hashes: hashers.into_iter().map(|(n, h)| (n, h.finish())).collect(),
        });
    }
    Ok(out)
}

// ── Splitting any file ────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitOptions {
    pub path: String,
    pub volume_size: u64,
    /// Folder for the parts; defaults to beside the file.
    #[serde(default)]
    pub out_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputFile {
    pub path: String,
    pub size: u64,
}

pub fn output_files(fs: &Fs, names: &[String]) -> Result<Vec<OutputFile>> {
    names.iter().map(|p| Ok(OutputFile { path: p.clone(), size: fs.size(p)? })).collect()
}

pub fn split_file(ctx: &Ctx, opts: &SplitOptions) -> Result<Vec<OutputFile>> {
    if opts.volume_size == 0 {
        return Err(Error::Invalid("part size must be above zero".into()));
    }
    let size = ctx.fs.size(&opts.path)?;
    let base = match &opts.out_dir {
        Some(dir) if !dir.is_empty() => ctx.fs.join(dir, &ctx.fs.file_name(&opts.path)),
        _ => opts.path.clone(),
    };
    let tally = Tally::new(ctx, size);
    let mut out = SplitWriter::new(ctx.fs.clone(), &base, Naming::Numbered, Some(opts.volume_size))?;
    let mut src = ctx.fs.open(&opts.path)?;
    let name = ctx.fs.file_name(&opts.path);
    let mut sink = TallyWriter { inner: &mut out, tally, name };
    if let Err(e) = copy_all(&mut src, &mut sink) {
        out.abort();
        return Err(ctx.after::<()>(Err(Error::from(e))).unwrap_err());
    }
    let names = out.finish()?;
    output_files(&ctx.fs, &names)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinOptions {
    /// Any one part.
    pub path: String,
    /// Defaults to the name without `.001`, beside the parts.
    #[serde(default)]
    pub output: Option<String>,
    #[serde(default)]
    pub overwrite: bool,
}

pub fn join_files(ctx: &Ctx, opts: &JoinOptions) -> Result<OutputFile> {
    let set = discover(&ctx.fs, &opts.path)?;
    if set.naming != VolumeKind::Numbered {
        return Err(Error::Invalid("not a numbered part (.001)".into()));
    }
    let output = match &opts.output {
        Some(o) if !o.is_empty() => o.clone(),
        _ => {
            let first = &set.paths[0];
            first.rsplit_once('.').map(|(h, _)| h.to_string()).unwrap_or_else(|| format!("{first}.joined"))
        }
    };
    if ctx.fs.exists(&output) && !opts.overwrite {
        return Err(Error::Exists(output));
    }
    let mut src = ConcatReader::new(ctx.fs.clone(), &set.paths)?;
    let tally = Tally::new(ctx, src.len());
    let temp = format!("{output}.zmtmp");
    let result = (|| -> Result<()> {
        let handle = ctx.fs.create(&temp)?;
        let mut sink = TallyWriter { inner: handle, tally, name: ctx.fs.file_name(&output) };
        copy_all(&mut src, &mut sink)?;
        sink.flush()?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = ctx.fs.remove_file(&temp);
        return Err(ctx.after::<()>(Err(e)).unwrap_err());
    }
    if ctx.fs.exists(&output) {
        ctx.fs.remove_file(&output)?;
    }
    ctx.fs.rename(&temp, &output)?;
    Ok(OutputFile { size: ctx.fs.size(&output)?, path: output })
}

// ── Benchmark ─────────────────────────────────────────────────────────────────────────────────

static CLOCK: std::sync::OnceLock<fn() -> f64> = std::sync::OnceLock::new();

/// Browsers' engines have no system clock from inside; the host gives one.
pub fn set_clock(clock: fn() -> f64) {
    let _ = CLOCK.set(clock);
}

fn now_ms() -> f64 {
    if let Some(c) = CLOCK.get() {
        return c();
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
        return START.get_or_init(std::time::Instant::now).elapsed().as_secs_f64() * 1000.0;
    }
    #[cfg(target_arch = "wasm32")]
    0.0
}

/// Text-like data: compressible, but not trivially so, the same on every machine.
pub fn benchmark_data(size: usize) -> Vec<u8> {
    const WORDS: &[&str] = &[
        "archive", "volume", "compress", "deflate", "dictionary", "header", "record", "checksum", "stream", "packed",
        "solid", "window", "entropy", "literal", "match", "offset", "length", "block", "frame", "index",
    ];
    let mut out = Vec::with_capacity(size + 16);
    let mut state = 0x2545_F491_4F6C_DD1Du64;
    while out.len() < size {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        if state % 11 == 0 {
            // A little noise, so the coders cannot run away with it.
            out.extend_from_slice(&state.to_le_bytes());
        } else {
            out.extend_from_slice(WORDS[(state >> 32) as usize % WORDS.len()].as_bytes());
            out.push(b' ');
        }
    }
    out.truncate(size);
    out
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkOptions {
    #[serde(default = "default_bench_mb")]
    pub megabytes: u32,
    #[serde(default)]
    pub methods: Vec<String>,
}

fn default_bench_mb() -> u32 {
    16
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkResult {
    pub method: String,
    pub size: u64,
    pub packed: u64,
    pub compress_mb_s: f64,
    pub decompress_mb_s: f64,
}

pub fn benchmark(ctx: &Ctx, opts: &BenchmarkOptions) -> Result<Vec<BenchmarkResult>> {
    let size = (opts.megabytes.clamp(1, 512) as usize) << 20;
    let data = benchmark_data(size);
    let default = ["deflate", "bzip2", "lzma2", "zstd"];
    let methods: Vec<String> = if opts.methods.is_empty() {
        default.iter().map(|m| m.to_string()).collect()
    } else {
        opts.methods.clone()
    };
    let total = (methods.len() * 2) as u64 * size as u64;
    let tally = Tally::new(ctx, total);
    let mut out = Vec::new();
    for method in &methods {
        ctx.check()?;
        let t0 = now_ms();
        let packed = compress_bench(method, &data)?;
        let t1 = now_ms();
        tally.add(size as u64, method);
        ctx.check()?;
        let plain = decompress_bench(method, &packed)?;
        let t2 = now_ms();
        tally.add(size as u64, method);
        if plain != data {
            return Err(Error::Corrupt(format!("{method}: decompressed data differs")));
        }
        let mb = size as f64 / (1 << 20) as f64;
        out.push(BenchmarkResult {
            method: method.clone(),
            size: size as u64,
            packed: packed.len() as u64,
            compress_mb_s: mb / ((t1 - t0).max(0.001) / 1000.0),
            decompress_mb_s: mb / ((t2 - t1).max(0.001) / 1000.0),
        });
    }
    Ok(out)
}

fn compress_bench(method: &str, data: &[u8]) -> Result<Vec<u8>> {
    let out = Vec::new();
    Ok(match method {
        "deflate" => {
            let mut w = codecs::deflate_writer(out, 6);
            w.write_all(data)?;
            w.finish()?
        }
        "bzip2" => {
            let mut w = codecs::bzip2_writer(out, 6);
            w.write_all(data)?;
            w.finish()?
        }
        "lzma2" => {
            let mut w = codecs::xz_writer(out, 6)?;
            w.write_all(data)?;
            w.finish()?
        }
        "zstd" => {
            let mut sink = out;
            codecs::zstd_compress(data, &mut sink, 3)?;
            sink
        }
        other => return Err(Error::Invalid(format!("unknown method {other}"))),
    })
}

fn decompress_bench(method: &str, data: &[u8]) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    match method {
        "deflate" => {
            flate2::read::DeflateDecoder::new(data).read_to_end(&mut out)?;
        }
        "bzip2" => {
            bzip2::read::BzDecoder::new(data).read_to_end(&mut out)?;
        }
        "lzma2" => {
            lzma_rust2::XzReader::new(data, true).read_to_end(&mut out)?;
        }
        "zstd" => {
            codecs::zstd_reader(data)?.read_to_end(&mut out)?;
        }
        other => return Err(Error::Invalid(format!("unknown method {other}"))),
    }
    Ok(out)
}
