//! ZIP encryption: WinZip AES (AE-2) and the legacy "ZipCrypto" stream cipher.

use std::io::{self, Read, Write};

use aes::cipher::{BlockEncrypt, KeyInit};
use hmac::{Hmac, Mac};
use sha1::Sha1;

use crate::error::{Error, Result};

type HmacSha1 = Hmac<Sha1>;

/// AES with the key length chosen at run time. WinZip uses 128, 192 or 256.
enum AnyAes {
    A128(aes::Aes128),
    A192(aes::Aes192),
    A256(aes::Aes256),
}

impl AnyAes {
    fn new(key: &[u8]) -> Self {
        match key.len() {
            16 => AnyAes::A128(aes::Aes128::new_from_slice(key).unwrap()),
            24 => AnyAes::A192(aes::Aes192::new_from_slice(key).unwrap()),
            _ => AnyAes::A256(aes::Aes256::new_from_slice(key).unwrap()),
        }
    }

    fn encrypt(&self, block: &mut [u8; 16]) {
        let b = aes::Block::from_mut_slice(block);
        match self {
            AnyAes::A128(c) => c.encrypt_block(b),
            AnyAes::A192(c) => c.encrypt_block(b),
            AnyAes::A256(c) => c.encrypt_block(b),
        }
    }
}

/// CTR mode with WinZip's little-endian counter starting at 1.
struct Ctr {
    cipher: AnyAes,
    counter: u128,
    block: [u8; 16],
    used: usize,
}

impl Ctr {
    fn new(key: &[u8]) -> Self {
        Ctr { cipher: AnyAes::new(key), counter: 0, block: [0; 16], used: 16 }
    }

    fn apply(&mut self, data: &mut [u8]) {
        for byte in data {
            if self.used == 16 {
                self.counter = self.counter.wrapping_add(1);
                self.block = self.counter.to_le_bytes();
                self.cipher.encrypt(&mut self.block);
                self.used = 0;
            }
            *byte ^= self.block[self.used];
            self.used += 1;
        }
    }
}

pub const AES_SALT_256: usize = 16;
pub const AES_AUTH: usize = 10;

pub fn aes_salt_len(strength: u8) -> usize {
    match strength {
        1 => 8,
        2 => 12,
        _ => 16,
    }
}

fn aes_key_len(strength: u8) -> usize {
    match strength {
        1 => 16,
        2 => 24,
        _ => 32,
    }
}

/// (encryption key, authentication key, 2-byte password check)
fn derive(password: &[u8], salt: &[u8], strength: u8) -> (Vec<u8>, Vec<u8>, [u8; 2]) {
    let n = aes_key_len(strength);
    let mut out = vec![0u8; n * 2 + 2];
    pbkdf2::pbkdf2::<HmacSha1>(password, salt, 1000, &mut out).expect("hmac accepts any key");
    (out[..n].to_vec(), out[n..n * 2].to_vec(), [out[n * 2], out[n * 2 + 1]])
}

pub struct AesWriter<W: Write> {
    inner: W,
    ctr: Ctr,
    mac: HmacSha1,
    buf: Vec<u8>,
}

impl<W: Write> AesWriter<W> {
    /// Writes the salt and password check at once.
    pub fn new(mut inner: W, password: &[u8], strength: u8) -> Result<Self> {
        let mut salt = vec![0u8; aes_salt_len(strength)];
        getrandom::fill(&mut salt).map_err(|e| Error::Io(format!("no random source: {e}")))?;
        let (key, auth, check) = derive(password, &salt, strength);
        inner.write_all(&salt)?;
        inner.write_all(&check)?;
        Ok(AesWriter {
            inner,
            ctr: Ctr::new(&key),
            mac: <HmacSha1 as Mac>::new_from_slice(&auth).expect("hmac accepts any key"),
            buf: Vec::new(),
        })
    }

    pub fn finish(mut self) -> Result<W> {
        let tag = self.mac.finalize().into_bytes();
        self.inner.write_all(&tag[..AES_AUTH])?;
        Ok(self.inner)
    }
}

impl<W: Write> Write for AesWriter<W> {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        self.buf.clear();
        self.buf.extend_from_slice(data);
        self.ctr.apply(&mut self.buf);
        self.mac.update(&self.buf);
        self.inner.write_all(&self.buf)?;
        Ok(data.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

pub struct AesReader<R: Read> {
    inner: R,
    ctr: Ctr,
    mac: Option<HmacSha1>,
    remaining: u64,
}

impl<R: Read> AesReader<R> {
    /// `total` is the whole stored size: salt, check, data and tag.
    pub fn new(mut inner: R, password: &[u8], strength: u8, total: u64) -> Result<Self> {
        let salt_len = aes_salt_len(strength);
        let overhead = (salt_len + 2 + AES_AUTH) as u64;
        if total < overhead {
            return Err(Error::Corrupt("AES entry too short".into()));
        }
        let mut salt = vec![0u8; salt_len];
        inner.read_exact(&mut salt)?;
        let mut check = [0u8; 2];
        inner.read_exact(&mut check)?;
        let (key, auth, expected) = derive(password, &salt, strength);
        if check != expected {
            return Err(Error::WrongPassword);
        }
        Ok(AesReader {
            inner,
            ctr: Ctr::new(&key),
            mac: Some(<HmacSha1 as Mac>::new_from_slice(&auth).expect("hmac accepts any key")),
            remaining: total - overhead,
        })
    }
}

impl<R: Read> Read for AesReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.remaining == 0 {
            // Checked once, when the data has been read to the end.
            if let Some(mac) = self.mac.take() {
                let mut tag = [0u8; AES_AUTH];
                self.inner.read_exact(&mut tag)?;
                let want = mac.finalize().into_bytes();
                if want[..AES_AUTH] != tag {
                    return Err(io::Error::new(io::ErrorKind::InvalidData, "AES authentication failed"));
                }
            }
            return Ok(0);
        }
        let want = buf.len().min(self.remaining.min(usize::MAX as u64) as usize);
        let n = self.inner.read(&mut buf[..want])?;
        if n == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "AES data truncated"));
        }
        if let Some(mac) = &mut self.mac {
            mac.update(&buf[..n]);
        }
        self.ctr.apply(&mut buf[..n]);
        self.remaining -= n as u64;
        Ok(n)
    }
}

// ── ZipCrypto ─────────────────────────────────────────────────────────────────────────────────

fn crc_table() -> &'static [u32; 256] {
    static TABLE: std::sync::OnceLock<[u32; 256]> = std::sync::OnceLock::new();
    TABLE.get_or_init(|| {
        let mut t = [0u32; 256];
        for (i, slot) in t.iter_mut().enumerate() {
            let mut c = i as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            }
            *slot = c;
        }
        t
    })
}

#[derive(Clone)]
struct Keys(u32, u32, u32);

impl Keys {
    fn new(password: &[u8]) -> Self {
        let mut k = Keys(0x1234_5678, 0x2345_6789, 0x3456_7890);
        for &b in password {
            k.update(b);
        }
        k
    }

    fn update(&mut self, b: u8) {
        let t = crc_table();
        self.0 = t[((self.0 ^ b as u32) & 0xFF) as usize] ^ (self.0 >> 8);
        self.1 = self.1.wrapping_add(self.0 & 0xFF).wrapping_mul(134775813).wrapping_add(1);
        self.2 = t[((self.2 ^ (self.1 >> 24)) & 0xFF) as usize] ^ (self.2 >> 8);
    }

    fn stream(&self) -> u8 {
        let t = (self.2 | 2) as u16;
        (t.wrapping_mul(t ^ 1) >> 8) as u8
    }

    fn encrypt(&mut self, b: u8) -> u8 {
        let c = b ^ self.stream();
        self.update(b);
        c
    }

    fn decrypt(&mut self, c: u8) -> u8 {
        let b = c ^ self.stream();
        self.update(b);
        b
    }
}

pub const ZIPCRYPTO_HEADER: usize = 12;

pub struct ZipCryptoWriter<W: Write> {
    inner: W,
    keys: Keys,
    buf: Vec<u8>,
}

impl<W: Write> ZipCryptoWriter<W> {
    /// `check` is the top byte of the file's CRC, which the reader compares against.
    pub fn new(mut inner: W, password: &[u8], check: u8) -> Result<Self> {
        let mut keys = Keys::new(password);
        let mut head = [0u8; ZIPCRYPTO_HEADER];
        getrandom::fill(&mut head[..11]).map_err(|e| Error::Io(format!("no random source: {e}")))?;
        head[11] = check;
        for b in &mut head {
            *b = keys.encrypt(*b);
        }
        inner.write_all(&head)?;
        Ok(ZipCryptoWriter { inner, keys, buf: Vec::new() })
    }

    pub fn into_inner(self) -> W {
        self.inner
    }
}

impl<W: Write> Write for ZipCryptoWriter<W> {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        self.buf.clear();
        for &b in data {
            self.buf.push(self.keys.encrypt(b));
        }
        self.inner.write_all(&self.buf)?;
        Ok(data.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

pub struct ZipCryptoReader<R: Read> {
    inner: R,
    keys: Keys,
}

impl<R: Read> ZipCryptoReader<R> {
    pub fn new(mut inner: R, password: &[u8], check: u8) -> Result<Self> {
        let mut keys = Keys::new(password);
        let mut head = [0u8; ZIPCRYPTO_HEADER];
        inner.read_exact(&mut head)?;
        let mut last = 0;
        for &c in &head {
            last = keys.decrypt(c);
        }
        if last != check {
            return Err(Error::WrongPassword);
        }
        Ok(ZipCryptoReader { inner, keys })
    }
}

impl<R: Read> Read for ZipCryptoReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.inner.read(buf)?;
        for b in &mut buf[..n] {
            *b = self.keys.decrypt(*b);
        }
        Ok(n)
    }
}
