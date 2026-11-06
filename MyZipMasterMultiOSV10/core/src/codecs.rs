//! Compression streams shared by ZIP, TAR and the single-file formats.

use std::io::{self, Read, Write};

use crate::error::{Error, Result};

/// Compresses what is written to it. `finish` must be called: most codecs write a trailer.
pub enum Compressor<W: Write> {
    Store(W),
    Deflate(flate2::write::DeflateEncoder<W>),
    Gzip(flate2::write::GzEncoder<W>),
    Bzip2(bzip2::write::BzEncoder<W>),
    Lzma(lzma_rust2::LzmaWriter<W>),
    Xz(lzma_rust2::XzWriter<W>),
}

impl<W: Write> Write for Compressor<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            Compressor::Store(w) => w.write(buf),
            Compressor::Deflate(w) => w.write(buf),
            Compressor::Gzip(w) => w.write(buf),
            Compressor::Bzip2(w) => w.write(buf),
            Compressor::Lzma(w) => w.write(buf),
            Compressor::Xz(w) => w.write(buf),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self {
            Compressor::Store(w) => w.flush(),
            Compressor::Deflate(w) => w.flush(),
            Compressor::Gzip(w) => w.flush(),
            Compressor::Bzip2(w) => w.flush(),
            Compressor::Lzma(w) => w.flush(),
            Compressor::Xz(w) => w.flush(),
        }
    }
}

impl<W: Write> Compressor<W> {
    pub fn finish(self) -> Result<W> {
        Ok(match self {
            Compressor::Store(w) => w,
            Compressor::Deflate(w) => w.finish()?,
            Compressor::Gzip(w) => w.finish()?,
            Compressor::Bzip2(w) => w.finish()?,
            Compressor::Lzma(w) => w.finish().map_err(lzma_err)?,
            Compressor::Xz(w) => w.finish().map_err(lzma_err)?,
        })
    }
}

pub fn lzma_err(e: io::Error) -> Error {
    Error::from(e)
}

pub fn deflate_level(level: u32) -> flate2::Compression {
    flate2::Compression::new(level.min(9))
}

pub fn deflate_writer<W: Write>(w: W, level: u32) -> Compressor<W> {
    Compressor::Deflate(flate2::write::DeflateEncoder::new(w, deflate_level(level)))
}

pub fn gzip_writer<W: Write>(w: W, level: u32, name: Option<&str>, mtime: Option<i64>) -> Result<Compressor<W>> {
    let mut b = flate2::GzBuilder::new();
    if let Some(n) = name {
        b = b.filename(n.replace('\0', ""));
    }
    if let Some(t) = mtime {
        b = b.mtime(t.clamp(0, u32::MAX as i64) as u32);
    }
    Ok(Compressor::Gzip(b.write(w, deflate_level(level))))
}

pub fn bzip2_writer<W: Write>(w: W, level: u32) -> Compressor<W> {
    Compressor::Bzip2(bzip2::write::BzEncoder::new(w, bzip2::Compression::new(level.clamp(1, 9))))
}

pub fn xz_writer<W: Write>(w: W, level: u32) -> Result<Compressor<W>> {
    let options = lzma_rust2::XzOptions::with_preset(level.min(9));
    Ok(Compressor::Xz(lzma_rust2::XzWriter::new(w, options).map_err(lzma_err)?))
}

/// The program's levels 1 to 9 on Zstandard's scale, which runs to 19 before needing huge memory.
#[cfg(not(target_arch = "wasm32"))]
pub fn zstd_native_level(level: u32) -> i32 {
    match level {
        0 | 1 => 1,
        2 => 2,
        3 => 3,
        4 => 6,
        5 => 9,
        6 => 12,
        7 => 15,
        8 => 17,
        _ => 19,
    }
}

/// Compresses with the reference library: on the desktop, every level but "store".
#[cfg(not(target_arch = "wasm32"))]
pub fn zstd_compress<R: Read, W: Write>(source: R, target: W, level: u32) -> Result<()> {
    if level == 0 {
        return zstd_compress_portable(source, target, level);
    }
    let mut source = source;
    let mut encoder = zstd::stream::write::Encoder::new(target, zstd_native_level(level)).map_err(Error::from)?;
    encoder.include_checksum(true).map_err(Error::from)?;
    io::copy(&mut source, &mut encoder).map_err(Error::from)?;
    encoder.finish().map_err(Error::from)?;
    Ok(())
}

/// In the browser only the pure-Rust encoder exists.
#[cfg(target_arch = "wasm32")]
pub fn zstd_compress<R: Read, W: Write>(source: R, target: W, level: u32) -> Result<()> {
    zstd_compress_portable(source, target, level)
}

/// Zstandard's level names, for the encoder this project can compile everywhere.
pub fn zstd_level(level: u32) -> ruzstd::encoding::CompressionLevel {
    use ruzstd::encoding::CompressionLevel as L;
    match level {
        0 => L::Uncompressed,
        // ruzstd implements these two; its stronger levels are not implemented yet.
        _ => L::Fastest,
    }
}

/// Zstandard is pull-only in this library: it reads its source to the end. It also unwraps every
/// I/O result, and a panic here would take the whole program down. So its reader and writer never
/// report an error to it: the first one ends the stream, is kept, and is returned afterwards.
pub fn zstd_compress_portable<R: Read, W: Write>(source: R, target: W, level: u32) -> Result<()> {
    let failure = std::cell::RefCell::new(None::<io::Error>);
    {
        let safe_in = QuietRead { inner: source, failure: &failure };
        let safe_out = QuietWrite { inner: target, failure: &failure };
        ruzstd::encoding::compress(safe_in, safe_out, zstd_level(level));
    }
    match failure.into_inner() {
        Some(e) => Err(Error::from(e)),
        None => Ok(()),
    }
}

struct QuietRead<'a, R> {
    inner: R,
    failure: &'a std::cell::RefCell<Option<io::Error>>,
}

impl<R: Read> Read for QuietRead<'_, R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.failure.borrow().is_some() {
            return Ok(0);
        }
        match self.inner.read(buf) {
            Ok(n) => Ok(n),
            Err(e) => {
                *self.failure.borrow_mut() = Some(e);
                Ok(0)
            }
        }
    }
}

struct QuietWrite<'a, W> {
    inner: W,
    failure: &'a std::cell::RefCell<Option<io::Error>>,
}

impl<W: Write> Write for QuietWrite<'_, W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.failure.borrow().is_none() {
            if let Err(e) = self.inner.write_all(buf) {
                *self.failure.borrow_mut() = Some(e);
            }
        }
        Ok(buf.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// Reads every frame: a `.zst` may be several joined together.
pub fn zstd_reader<'a, R: Read + 'a>(source: R) -> Result<Box<dyn Read + 'a>> {
    let mut buffered = io::BufReader::new(source);
    let decoder = ruzstd::decoding::StreamingDecoder::new(buffered_ref(&mut buffered))
        .map(|_| ())
        .map_err(|e| Error::Corrupt(format!("zstd: {e}")));
    decoder?;
    Ok(Box::new(ZstdFrames { source: Some(buffered), decoder: None }))
}

fn buffered_ref<R: Read>(r: &mut io::BufReader<R>) -> PeekOnly<'_, R> {
    PeekOnly(r, 0)
}

/// Lets the decoder look at the first frame's header without consuming it.
struct PeekOnly<'a, R: Read>(&'a mut io::BufReader<R>, usize);

impl<R: Read> Read for PeekOnly<'_, R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        use std::io::BufRead;
        let have = self.0.fill_buf()?;
        let rest = &have[self.1.min(have.len())..];
        let n = rest.len().min(buf.len());
        buf[..n].copy_from_slice(&rest[..n]);
        self.1 += n;
        Ok(n)
    }
}

type ZstdDecoder<R> = ruzstd::decoding::StreamingDecoder<io::BufReader<R>, ruzstd::decoding::FrameDecoder>;

struct ZstdFrames<R: Read> {
    source: Option<io::BufReader<R>>,
    decoder: Option<ZstdDecoder<R>>,
}

impl<R: Read> Read for ZstdFrames<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        use std::io::BufRead;
        loop {
            if let Some(decoder) = self.decoder.as_mut() {
                let n = decoder.read(buf).map_err(|e| {
                    if e.to_string().contains(crate::error::CANCEL_MARK) {
                        e
                    } else {
                        io::Error::new(io::ErrorKind::InvalidData, format!("zstd: {e}"))
                    }
                })?;
                if n > 0 || buf.is_empty() {
                    return Ok(n);
                }
                self.source = self.decoder.take().map(|d| d.into_inner());
            }
            let Some(mut source) = self.source.take() else { return Ok(0) };
            if source.fill_buf()?.is_empty() {
                return Ok(0);
            }
            let next = ruzstd::decoding::StreamingDecoder::new(source)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("zstd: {e}")))?;
            self.decoder = Some(next);
        }
    }
}

/// Counts what passes through.
pub struct CountWriter<W> {
    pub inner: W,
    pub count: u64,
}

impl<W> CountWriter<W> {
    pub fn new(inner: W) -> Self {
        CountWriter { inner, count: 0 }
    }
}

impl<W: Write> Write for CountWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let n = self.inner.write(buf)?;
        self.count += n as u64;
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

/// Hashes and counts what is read through it.
pub struct CrcReader<R> {
    pub inner: R,
    pub hasher: crc32fast::Hasher,
    pub count: u64,
}

impl<R> CrcReader<R> {
    pub fn new(inner: R) -> Self {
        CrcReader { inner, hasher: crc32fast::Hasher::new(), count: 0 }
    }
}

impl<R: Read> Read for CrcReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.hasher.update(&buf[..n]);
        self.count += n as u64;
        Ok(n)
    }
}

/// Fills a buffer as far as the source allows, unlike `read_exact` which errors at the end.
pub fn read_fill<R: Read + ?Sized>(r: &mut R, buf: &mut [u8]) -> io::Result<usize> {
    let mut at = 0;
    while at < buf.len() {
        match r.read(&mut buf[at..]) {
            Ok(0) => break,
            Ok(n) => at += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e),
        }
    }
    Ok(at)
}

/// A big fixed buffer copy: `std::io::copy` uses 8 KB, which is slow for files.
pub fn copy_all<R: Read + ?Sized, W: Write + ?Sized>(r: &mut R, w: &mut W) -> io::Result<u64> {
    let mut buf = vec![0u8; 256 * 1024];
    let mut total = 0;
    loop {
        match r.read(&mut buf) {
            Ok(0) => return Ok(total),
            Ok(n) => {
                w.write_all(&buf[..n])?;
                total += n as u64;
            }
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e),
        }
    }
}
