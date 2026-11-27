//! Checksums and hashes over a range.
//!
//! CONTRACT
//! `hash(src, {offset?, length?, algorithms: [id…]}, progress)` → `{ results: [{ id, name, value }], offset, length }`
//!   `value`: lower-case hex (big-endian, as the tools print it), one pass over the data for all algorithms.
//!   Unknown ids are an error. No `algorithms`: crc32, md5, sha1, sha256.
//! `list()` → `[{ id, name, bits, group: "checksum"|"crc"|"hash" }]` — every algorithm `hash` accepts.
//!
//! Hashing a single buffer directly: `digest_bytes(id, bytes)` → hex.
use crate::doc::Bytes;
use crate::util::{for_each_chunk, hex_string, range_of, Progress};
use crc::{Crc, Digest as CrcDigest};
use serde_json::{json, Value};
use sha2::digest::DynDigest;

/// (id, name, bits, group)
pub const ALGORITHMS: &[(&str, &str, u32, &str)] = &[
    ("sum8", "Checksum-8", 8, "checksum"),
    ("sum16", "Checksum-16", 16, "checksum"),
    ("sum32", "Checksum-32", 32, "checksum"),
    ("sum64", "Checksum-64", 64, "checksum"),
    ("xor8", "XOR-8", 8, "checksum"),
    ("crc8", "CRC-8", 8, "crc"),
    ("crc16", "CRC-16 (ARC)", 16, "crc"),
    ("crc16ccitt", "CRC-16 CCITT-FALSE", 16, "crc"),
    ("crc16xmodem", "CRC-16 XMODEM", 16, "crc"),
    ("crc16modbus", "CRC-16 MODBUS", 16, "crc"),
    ("crc32", "CRC-32", 32, "crc"),
    ("crc32c", "CRC-32C (Castagnoli)", 32, "crc"),
    ("crc32bzip2", "CRC-32 BZIP2", 32, "crc"),
    ("crc64ecma", "CRC-64 ECMA-182", 64, "crc"),
    ("crc64xz", "CRC-64 XZ", 64, "crc"),
    ("adler32", "Adler-32", 32, "crc"),
    ("fletcher16", "Fletcher-16", 16, "crc"),
    ("fletcher32", "Fletcher-32", 32, "crc"),
    ("md2", "MD2", 128, "hash"),
    ("md4", "MD4", 128, "hash"),
    ("md5", "MD5", 128, "hash"),
    ("sha1", "SHA-1", 160, "hash"),
    ("sha224", "SHA-224", 224, "hash"),
    ("sha256", "SHA-256", 256, "hash"),
    ("sha384", "SHA-384", 384, "hash"),
    ("sha512", "SHA-512", 512, "hash"),
    ("sha512_256", "SHA-512/256", 256, "hash"),
    ("sha3_224", "SHA3-224", 224, "hash"),
    ("sha3_256", "SHA3-256", 256, "hash"),
    ("sha3_384", "SHA3-384", 384, "hash"),
    ("sha3_512", "SHA3-512", 512, "hash"),
    ("keccak256", "Keccak-256", 256, "hash"),
    ("ripemd160", "RIPEMD-160", 160, "hash"),
    ("blake2b512", "BLAKE2b-512", 512, "hash"),
    ("blake2s256", "BLAKE2s-256", 256, "hash"),
    ("blake3", "BLAKE3", 256, "hash"),
];

static CRC8: Crc<u8> = Crc::<u8>::new(&crc::CRC_8_SMBUS);
static CRC16: Crc<u16> = Crc::<u16>::new(&crc::CRC_16_ARC);
static CRC16CCITT: Crc<u16> = Crc::<u16>::new(&crc::CRC_16_IBM_3740);
static CRC16XMODEM: Crc<u16> = Crc::<u16>::new(&crc::CRC_16_XMODEM);
static CRC16MODBUS: Crc<u16> = Crc::<u16>::new(&crc::CRC_16_MODBUS);
static CRC32: Crc<u32> = Crc::<u32>::new(&crc::CRC_32_ISO_HDLC);
static CRC32C: Crc<u32> = Crc::<u32>::new(&crc::CRC_32_ISCSI);
static CRC32BZIP2: Crc<u32> = Crc::<u32>::new(&crc::CRC_32_BZIP2);
static CRC64ECMA: Crc<u64> = Crc::<u64>::new(&crc::CRC_64_ECMA_182);
static CRC64XZ: Crc<u64> = Crc::<u64>::new(&crc::CRC_64_XZ);

/// MD2 (RFC 1319), small enough to carry here.
struct Md2 {
    state: [u8; 48],
    checksum: [u8; 16],
    buffer: [u8; 16],
    filled: usize,
}

const MD2_S: [u8; 256] = [
    41, 46, 67, 201, 162, 216, 124, 1, 61, 54, 84, 161, 236, 240, 6, 19, 98, 167, 5, 243, 192, 199, 115, 140, 152, 147, 43, 217, 188, 76, 130, 202, 30, 155,
    87, 60, 253, 212, 224, 22, 103, 66, 111, 24, 138, 23, 229, 18, 190, 78, 196, 214, 218, 158, 222, 73, 160, 251, 245, 142, 187, 47, 238, 122, 169, 104,
    121, 145, 21, 178, 7, 63, 148, 194, 16, 137, 11, 34, 95, 33, 128, 127, 93, 154, 90, 144, 50, 39, 53, 62, 204, 231, 191, 247, 151, 3, 255, 25, 48, 179,
    72, 165, 181, 209, 215, 94, 146, 42, 172, 86, 170, 198, 79, 184, 56, 210, 150, 164, 125, 182, 118, 252, 107, 226, 156, 116, 4, 241, 69, 157, 112, 89,
    100, 113, 135, 32, 134, 91, 207, 101, 230, 45, 168, 2, 27, 96, 37, 173, 174, 176, 185, 246, 28, 70, 97, 105, 52, 64, 126, 15, 85, 71, 163, 35, 221, 81,
    175, 58, 195, 92, 249, 206, 186, 197, 234, 38, 44, 83, 13, 110, 133, 40, 132, 9, 211, 223, 205, 244, 65, 129, 77, 82, 106, 220, 55, 200, 108, 193, 171,
    250, 36, 225, 123, 8, 12, 189, 177, 74, 120, 136, 149, 139, 227, 99, 232, 109, 233, 203, 213, 254, 59, 0, 29, 57, 242, 239, 183, 14, 102, 88, 208, 228,
    166, 119, 114, 248, 235, 117, 75, 10, 49, 68, 80, 180, 143, 237, 31, 26, 219, 153, 141, 51, 159, 17, 131, 20,
];

impl Md2 {
    fn new() -> Self {
        Md2 { state: [0; 48], checksum: [0; 16], buffer: [0; 16], filled: 0 }
    }
    fn block(&mut self, block: &[u8; 16]) {
        for i in 0..16 {
            self.state[16 + i] = block[i];
            self.state[32 + i] = self.state[16 + i] ^ self.state[i];
        }
        let mut t = 0u8;
        for j in 0..18u8 {
            for k in 0..48 {
                self.state[k] ^= MD2_S[t as usize];
                t = self.state[k];
            }
            t = t.wrapping_add(j);
        }
        let mut l = self.checksum[15];
        for i in 0..16 {
            self.checksum[i] ^= MD2_S[(block[i] ^ l) as usize];
            l = self.checksum[i];
        }
    }
    fn update(&mut self, mut data: &[u8]) {
        while !data.is_empty() {
            let n = (16 - self.filled).min(data.len());
            self.buffer[self.filled..self.filled + n].copy_from_slice(&data[..n]);
            self.filled += n;
            data = &data[n..];
            if self.filled == 16 {
                let b = self.buffer;
                self.block(&b);
                self.filled = 0;
            }
        }
    }
    fn finish(mut self) -> Vec<u8> {
        let pad = (16 - self.filled) as u8;
        let padding = vec![pad; pad as usize];
        self.update(&padding);
        let checksum = self.checksum;
        self.block(&checksum);
        self.state[..16].to_vec()
    }
}

enum State {
    Sum(u64, u32),
    Xor8(u8),
    Crc8(CrcDigest<'static, u8>),
    Crc16(CrcDigest<'static, u16>),
    Crc32(CrcDigest<'static, u32>),
    Crc64(CrcDigest<'static, u64>),
    Adler(u32, u32),
    Fletcher16(u32, u32),
    /// sums and a pending odd byte
    Fletcher32(u32, u32, Option<u8>),
    Md2(Box<Md2>),
    Dyn(Box<dyn DynDigest>),
    Blake3(Box<blake3::Hasher>),
}

impl State {
    fn new(id: &str) -> Result<State, String> {
        Ok(match id {
            "sum8" => State::Sum(0, 8),
            "sum16" => State::Sum(0, 16),
            "sum32" => State::Sum(0, 32),
            "sum64" => State::Sum(0, 64),
            "xor8" => State::Xor8(0),
            "crc8" => State::Crc8(CRC8.digest()),
            "crc16" => State::Crc16(CRC16.digest()),
            "crc16ccitt" => State::Crc16(CRC16CCITT.digest()),
            "crc16xmodem" => State::Crc16(CRC16XMODEM.digest()),
            "crc16modbus" => State::Crc16(CRC16MODBUS.digest()),
            "crc32" => State::Crc32(CRC32.digest()),
            "crc32c" => State::Crc32(CRC32C.digest()),
            "crc32bzip2" => State::Crc32(CRC32BZIP2.digest()),
            "crc64ecma" => State::Crc64(CRC64ECMA.digest()),
            "crc64xz" => State::Crc64(CRC64XZ.digest()),
            "adler32" => State::Adler(1, 0),
            "fletcher16" => State::Fletcher16(0, 0),
            "fletcher32" => State::Fletcher32(0, 0, None),
            "md2" => State::Md2(Box::new(Md2::new())),
            "md4" => State::Dyn(Box::new(md4::Md4::default())),
            "md5" => State::Dyn(Box::new(md5::Md5::default())),
            "sha1" => State::Dyn(Box::new(sha1::Sha1::default())),
            "sha224" => State::Dyn(Box::new(sha2::Sha224::default())),
            "sha256" => State::Dyn(Box::new(sha2::Sha256::default())),
            "sha384" => State::Dyn(Box::new(sha2::Sha384::default())),
            "sha512" => State::Dyn(Box::new(sha2::Sha512::default())),
            "sha512_256" => State::Dyn(Box::new(sha2::Sha512_256::default())),
            "sha3_224" => State::Dyn(Box::new(sha3::Sha3_224::default())),
            "sha3_256" => State::Dyn(Box::new(sha3::Sha3_256::default())),
            "sha3_384" => State::Dyn(Box::new(sha3::Sha3_384::default())),
            "sha3_512" => State::Dyn(Box::new(sha3::Sha3_512::default())),
            "keccak256" => State::Dyn(Box::new(sha3::Keccak256::default())),
            "ripemd160" => State::Dyn(Box::new(ripemd::Ripemd160::default())),
            "blake2b512" => State::Dyn(Box::new(blake2::Blake2b512::default())),
            "blake2s256" => State::Dyn(Box::new(blake2::Blake2s256::default())),
            "blake3" => State::Blake3(Box::new(blake3::Hasher::new())),
            other => return Err(format!("unknown algorithm {other}")),
        })
    }

    fn update(&mut self, data: &[u8]) {
        match self {
            State::Sum(s, _) => {
                for &b in data {
                    *s = s.wrapping_add(b as u64);
                }
            }
            State::Xor8(x) => {
                for &b in data {
                    *x ^= b;
                }
            }
            State::Crc8(d) => d.update(data),
            State::Crc16(d) => d.update(data),
            State::Crc32(d) => d.update(data),
            State::Crc64(d) => d.update(data),
            State::Adler(a, b) => {
                for chunk in data.chunks(5552) {
                    for &x in chunk {
                        *a += x as u32;
                        *b += *a;
                    }
                    *a %= 65521;
                    *b %= 65521;
                }
            }
            State::Fletcher16(a, b) => {
                for &x in data {
                    *a = (*a + x as u32) % 255;
                    *b = (*b + *a) % 255;
                }
            }
            State::Fletcher32(a, b, pending) => {
                let mut rest = data;
                if let Some(low) = pending.take() {
                    if let Some((&high, tail)) = rest.split_first() {
                        let w = low as u32 | ((high as u32) << 8);
                        *a = (*a + w) % 65535;
                        *b = (*b + *a) % 65535;
                        rest = tail;
                    } else {
                        *pending = Some(low);
                        return;
                    }
                }
                let mut pairs = rest.chunks_exact(2);
                for p in &mut pairs {
                    let w = p[0] as u32 | ((p[1] as u32) << 8);
                    *a = (*a + w) % 65535;
                    *b = (*b + *a) % 65535;
                }
                if let [last] = pairs.remainder() {
                    *pending = Some(*last);
                }
            }
            State::Md2(m) => m.update(data),
            State::Dyn(d) => d.update(data),
            State::Blake3(h) => {
                h.update(data);
            }
        }
    }

    fn finish(self) -> String {
        match self {
            State::Sum(s, bits) => {
                let v = if bits == 64 { s } else { s & ((1u64 << bits) - 1) };
                format!("{:0width$x}", v, width = (bits / 4) as usize)
            }
            State::Xor8(x) => format!("{x:02x}"),
            State::Crc8(d) => format!("{:02x}", d.finalize()),
            State::Crc16(d) => format!("{:04x}", d.finalize()),
            State::Crc32(d) => format!("{:08x}", d.finalize()),
            State::Crc64(d) => format!("{:016x}", d.finalize()),
            State::Adler(a, b) => format!("{:08x}", ((b % 65521) << 16) | (a % 65521)),
            State::Fletcher16(a, b) => format!("{:04x}", (b << 8) | a),
            State::Fletcher32(mut a, mut b, pending) => {
                if let Some(low) = pending {
                    a = (a + low as u32) % 65535;
                    b = (b + a) % 65535;
                }
                format!("{:08x}", (b << 16) | a)
            }
            State::Md2(m) => hex_string(&m.finish(), false),
            State::Dyn(d) => hex_string(&d.finalize(), false),
            State::Blake3(h) => hex_string(h.finalize().as_bytes(), false),
        }
    }
}

fn name_of(id: &str) -> &'static str {
    ALGORITHMS.iter().find(|a| a.0 == id).map(|a| a.1).unwrap_or("")
}

/// One algorithm over one buffer (lower-case hex).
pub fn digest_bytes(id: &str, bytes: &[u8]) -> Result<String, String> {
    let mut state = State::new(id)?;
    state.update(bytes);
    Ok(state.finish())
}

pub fn hash(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let (offset, length) = range_of(src, args);
    let ids: Vec<String> = match args.get("algorithms").and_then(|v| v.as_array()) {
        Some(list) if !list.is_empty() => list.iter().filter_map(|v| v.as_str().map(str::to_string)).collect(),
        _ => ["crc32", "md5", "sha1", "sha256"].iter().map(|s| s.to_string()).collect(),
    };
    let mut states = ids.iter().map(|id| State::new(id).map(|s| (id.clone(), s))).collect::<Result<Vec<_>, _>>()?;
    for_each_chunk(src, offset, length, 1 << 20, progress, |_, chunk| {
        for (_, s) in states.iter_mut() {
            s.update(chunk);
        }
        true
    })?;
    let results: Vec<Value> = states.into_iter().map(|(id, s)| json!({ "id": id, "name": name_of(&id), "value": s.finish() })).collect();
    Ok(json!({ "results": results, "offset": offset, "length": length }))
}

pub fn list() -> Value {
    Value::Array(ALGORITHMS.iter().map(|(id, name, bits, group)| json!({ "id": id, "name": name, "bits": bits, "group": group })).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(id: &str, data: &[u8]) -> String {
        digest_bytes(id, data).unwrap()
    }

    #[test]
    fn known_vectors() {
        let n = b"123456789";
        assert_eq!(d("crc32", n), "cbf43926");
        assert_eq!(d("crc32c", n), "e3069283");
        assert_eq!(d("crc16", n), "bb3d");
        assert_eq!(d("crc16ccitt", n), "29b1");
        assert_eq!(d("crc16modbus", n), "4b37");
        assert_eq!(d("crc16xmodem", n), "31c3");
        assert_eq!(d("crc32bzip2", n), "fc891918");
        assert_eq!(d("crc64xz", n), "995dc9bbdf1939fa");
        assert_eq!(d("crc64ecma", n), "6c40df5f0b497347");
        assert_eq!(d("crc8", n), "f4");
        assert_eq!(d("adler32", n), "091e01de");
        assert_eq!(d("fletcher16", b"abcde"), "c8f0");
        assert_eq!(d("fletcher32", b"abcde"), "f04fc729");
        assert_eq!(d("sum8", n), "dd");
        let abc = b"abc";
        assert_eq!(d("md5", abc), "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(d("md4", abc), "a448017aaf21d8525fc10ae87aa6729d");
        assert_eq!(d("md2", abc), "da853b0d3f88d99b30283a69e6ded6bb");
        assert_eq!(d("md2", b""), "8350e5a3e24c153df2275c9f80692773");
        assert_eq!(d("sha1", abc), "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert!(d("sha256", abc).starts_with("ba7816bf8f01cfea"));
        assert!(d("sha3_256", abc).starts_with("3a985da74fe225b2"));
        assert!(d("keccak256", b"").starts_with("c5d2460186f7233c"));
        assert!(d("ripemd160", abc).starts_with("8eb208f7e05d987a"));
        assert!(d("blake3", b"").starts_with("af1349b9f5f9a1a6"));
        let mut s = MD2_S.to_vec();
        s.sort();
        assert_eq!(s, (0..=255u8).collect::<Vec<_>>());
    }

    #[test]
    fn chunked_pass_matches() {
        let data: Vec<u8> = (0..3_000_001u32).map(|i| (i * 7 + 3) as u8).collect();
        let ids: Vec<&str> = ALGORITHMS.iter().map(|a| a.0).collect();
        let r = hash(&data, &json!({ "algorithms": ids }), &mut crate::util::no_progress()).unwrap();
        for item in r["results"].as_array().unwrap() {
            let id = item["id"].as_str().unwrap();
            assert_eq!(item["value"].as_str().unwrap(), d(id, &data), "{id}");
        }
    }
}
