//! qrcore — QR Code Model 2 encoder (ISO/IEC 18004) with no dependencies.
//!
//! The Tauri app calls it natively; `npm run build:wasm` compiles the same code to
//! WebAssembly for the browser build (see `wasm.rs`). Both hand the page the JSON made by
//! [`encode_json`], so the page never needs to know which one it is talking to.

use std::fmt;

#[cfg(target_arch = "wasm32")]
mod wasm;

/// Error correction level. The ordinal (0..=3) is what the page and the WebAssembly ABI use.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Ecc {
    Low,
    Medium,
    Quartile,
    High,
}

impl Ecc {
    pub const ALL: [Ecc; 4] = [Ecc::Low, Ecc::Medium, Ecc::Quartile, Ecc::High];

    pub fn ordinal(self) -> usize {
        self as usize
    }

    pub fn from_ordinal(n: u32) -> Option<Ecc> {
        Ecc::ALL.get(n as usize).copied()
    }

    pub fn letter(self) -> char {
        ['L', 'M', 'Q', 'H'][self.ordinal()]
    }

    /// The two bits written into the format information (L=01, M=00, Q=11, H=10).
    fn format_bits(self) -> u32 {
        [1, 0, 3, 2][self.ordinal()]
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Numeric,
    Alphanumeric,
    Byte,
    Eci,
}

impl Mode {
    fn indicator(self) -> u32 {
        match self {
            Mode::Numeric => 0x1,
            Mode::Alphanumeric => 0x2,
            Mode::Byte => 0x4,
            Mode::Eci => 0x7,
        }
    }

    /// Width of the character count field: versions 1–9, 10–26 and 27–40 differ.
    fn char_count_bits(self, version: u8) -> usize {
        let band = (version as usize + 7) / 17;
        match self {
            Mode::Numeric => [10, 12, 14][band],
            Mode::Alphanumeric => [9, 11, 13][band],
            Mode::Byte => [8, 16, 16][band],
            Mode::Eci => 0,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Mode::Numeric => "numeric",
            Mode::Alphanumeric => "alphanumeric",
            Mode::Byte => "byte",
            Mode::Eci => "eci",
        }
    }
}

const ALPHANUMERIC: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/// One run of data in a single mode, already turned into bits.
#[derive(Clone, Debug)]
pub struct Segment {
    pub mode: Mode,
    pub num_chars: usize,
    pub bits: Vec<bool>,
}

fn push_bits(out: &mut Vec<bool>, value: u32, len: usize) {
    for i in (0..len).rev() {
        out.push((value >> i) & 1 != 0);
    }
}

impl Segment {
    pub fn bytes(data: &[u8]) -> Segment {
        let mut bits = Vec::with_capacity(data.len() * 8);
        for &b in data {
            push_bits(&mut bits, b as u32, 8);
        }
        Segment { mode: Mode::Byte, num_chars: data.len(), bits }
    }

    /// Digits only (checked by [`Segment::is_numeric`]); three digits pack into 10 bits.
    pub fn numeric(text: &str) -> Segment {
        let mut bits = Vec::with_capacity(text.len() * 10 / 3 + 4);
        for chunk in text.as_bytes().chunks(3) {
            let value = chunk.iter().fold(0u32, |acc, &c| acc * 10 + (c - b'0') as u32);
            push_bits(&mut bits, value, chunk.len() * 3 + 1);
        }
        Segment { mode: Mode::Numeric, num_chars: text.len(), bits }
    }

    /// Characters from the 45-symbol alphanumeric set; two characters pack into 11 bits.
    pub fn alphanumeric(text: &str) -> Segment {
        let mut bits = Vec::with_capacity(text.len() * 11 / 2 + 6);
        for chunk in text.as_bytes().chunks(2) {
            let index = |c: u8| ALPHANUMERIC.iter().position(|&a| a == c).unwrap() as u32;
            if chunk.len() == 2 {
                push_bits(&mut bits, index(chunk[0]) * 45 + index(chunk[1]), 11);
            } else {
                push_bits(&mut bits, index(chunk[0]), 6);
            }
        }
        Segment { mode: Mode::Alphanumeric, num_chars: text.len(), bits }
    }

    /// Extended Channel Interpretation designator (26 = UTF-8).
    pub fn eci(value: u32) -> Segment {
        let mut bits = Vec::new();
        if value < 1 << 7 {
            push_bits(&mut bits, value, 8);
        } else if value < 1 << 14 {
            push_bits(&mut bits, 0b10, 2);
            push_bits(&mut bits, value, 14);
        } else {
            push_bits(&mut bits, 0b110, 3);
            push_bits(&mut bits, value, 21);
        }
        Segment { mode: Mode::Eci, num_chars: 0, bits }
    }

    pub fn is_numeric(text: &str) -> bool {
        text.bytes().all(|c| c.is_ascii_digit())
    }

    pub fn is_alphanumeric(text: &str) -> bool {
        text.bytes().all(|c| ALPHANUMERIC.contains(&c))
    }

    /// The most compact single mode for the text. With `eci_utf8`, non-ASCII text is
    /// preceded by an ECI 26 marker so readers know the bytes are UTF-8.
    pub fn auto(text: &str, eci_utf8: bool) -> Vec<Segment> {
        if text.is_empty() {
            Vec::new()
        } else if Segment::is_numeric(text) {
            vec![Segment::numeric(text)]
        } else if Segment::is_alphanumeric(text) {
            vec![Segment::alphanumeric(text)]
        } else if eci_utf8 && !text.is_ascii() {
            vec![Segment::eci(26), Segment::bytes(text.as_bytes())]
        } else {
            vec![Segment::bytes(text.as_bytes())]
        }
    }
}

/// Bits the segments need at `version`, or None when a character count overflows its field.
fn total_bits(segs: &[Segment], version: u8) -> Option<usize> {
    let mut total = 0usize;
    for seg in segs {
        let cc = seg.mode.char_count_bits(version);
        if cc > 0 && seg.num_chars >= 1 << cc {
            return None;
        }
        total += 4 + cc + seg.bits.len();
    }
    Some(total)
}

/// The same count without the overflow check, for error messages.
fn needed_bits(segs: &[Segment], version: u8) -> usize {
    segs.iter().map(|s| 4 + s.mode.char_count_bits(version) + s.bits.len()).sum()
}

#[derive(Clone, Copy, Debug)]
pub struct Options {
    pub ecc: Ecc,
    pub min_version: u8,
    pub max_version: u8,
    /// None chooses the mask with the lowest penalty score.
    pub mask: Option<u8>,
    /// Raise the error correction level when it still fits in the chosen version.
    pub boost_ecc: bool,
    pub eci_utf8: bool,
}

impl Default for Options {
    fn default() -> Self {
        Options { ecc: Ecc::Medium, min_version: 1, max_version: 40, mask: None, boost_ecc: true, eci_utf8: false }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QrError {
    /// The data does not fit even in `max_version`.
    DataTooLong { data_bits: usize, max_bits: usize },
    Invalid(&'static str),
}

impl fmt::Display for QrError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            QrError::DataTooLong { data_bits, max_bits } => {
                write!(f, "data needs {data_bits} bits but at most {max_bits} fit")
            }
            QrError::Invalid(what) => write!(f, "invalid option: {what}"),
        }
    }
}

impl std::error::Error for QrError {}

/// A finished symbol. `modules` is row-major, `true` = dark, without the quiet zone.
#[derive(Clone, Debug)]
pub struct QrCode {
    pub version: u8,
    pub size: usize,
    pub ecc: Ecc,
    pub mask: u8,
    pub mode: Mode,
    pub data_bits: usize,
    pub capacity_bits: usize,
    pub modules: Vec<bool>,
}

impl QrCode {
    pub fn get(&self, x: usize, y: usize) -> bool {
        self.modules[y * self.size + x]
    }

    pub fn to_json(&self) -> String {
        let modules: String = self.modules.iter().map(|&d| if d { '1' } else { '0' }).collect();
        format!(
            "{{\"version\":{},\"size\":{},\"ecc\":\"{}\",\"mask\":{},\"mode\":\"{}\",\"dataBits\":{},\"capacityBits\":{},\"modules\":\"{}\"}}",
            self.version,
            self.size,
            self.ecc.letter(),
            self.mask,
            self.mode.name(),
            self.data_bits,
            self.capacity_bits,
            modules
        )
    }
}

pub fn encode_text(text: &str, opts: &Options) -> Result<QrCode, QrError> {
    encode_segments(&Segment::auto(text, opts.eci_utf8), opts)
}

pub fn encode_segments(segs: &[Segment], opts: &Options) -> Result<QrCode, QrError> {
    if !(1..=40).contains(&opts.min_version) || !(1..=40).contains(&opts.max_version) {
        return Err(QrError::Invalid("version must be 1..=40"));
    }
    if opts.min_version > opts.max_version {
        return Err(QrError::Invalid("min_version > max_version"));
    }
    if opts.mask.is_some_and(|m| m > 7) {
        return Err(QrError::Invalid("mask must be 0..=7"));
    }

    let mut ecc = opts.ecc;
    let mut version = opts.min_version;
    let used = loop {
        let capacity = num_data_codewords(version, ecc) * 8;
        if let Some(used) = total_bits(segs, version).filter(|&u| u <= capacity) {
            break used;
        }
        if version >= opts.max_version {
            return Err(QrError::DataTooLong { data_bits: needed_bits(segs, version), max_bits: capacity });
        }
        version += 1;
    };
    if opts.boost_ecc {
        for e in Ecc::ALL {
            if e > ecc && used <= num_data_codewords(version, e) * 8 {
                ecc = e;
            }
        }
    }

    let capacity = num_data_codewords(version, ecc) * 8;
    let mut bits = Vec::with_capacity(capacity);
    for seg in segs {
        push_bits(&mut bits, seg.mode.indicator(), 4);
        push_bits(&mut bits, seg.num_chars as u32, seg.mode.char_count_bits(version));
        bits.extend_from_slice(&seg.bits);
    }
    let terminator = (capacity - bits.len()).min(4);
    push_bits(&mut bits, 0, terminator);
    let to_byte = (8 - bits.len() % 8) % 8;
    push_bits(&mut bits, 0, to_byte);
    for pad in [0xEC, 0x11].iter().cycle() {
        if bits.len() >= capacity {
            break;
        }
        push_bits(&mut bits, *pad, 8);
    }
    let codewords: Vec<u8> =
        bits.chunks(8).map(|c| c.iter().fold(0u8, |acc, &b| (acc << 1) | b as u8)).collect();

    let mode = segs.iter().rev().map(|s| s.mode).find(|&m| m != Mode::Eci).unwrap_or(Mode::Byte);
    let mut matrix = Matrix::new(version);
    matrix.draw_function_patterns(ecc);
    matrix.draw_codewords(&add_ecc_and_interleave(&codewords, version, ecc));
    let mask = match opts.mask {
        Some(m) => m,
        None => (0..8u8)
            .min_by_key(|&m| {
                matrix.apply_mask(m);
                matrix.draw_format_bits(ecc, m);
                let score = matrix.penalty_score();
                matrix.apply_mask(m); // XOR again undoes it
                score
            })
            .unwrap(),
    };
    matrix.apply_mask(mask);
    matrix.draw_format_bits(ecc, mask);

    Ok(QrCode {
        version,
        size: matrix.size,
        ecc,
        mask,
        mode,
        data_bits: used,
        capacity_bits: capacity,
        modules: matrix.modules,
    })
}

/// Encodes and serialises in one go; this is the whole interface the page sees.
/// `flags`: bit 0 = boost error correction, bit 1 = UTF-8 ECI. `mask` < 0 means automatic.
pub fn encode_json(text: &str, ecc: u32, min_version: u32, max_version: u32, mask: i32, flags: u32) -> String {
    let Some(ecc) = Ecc::from_ordinal(ecc) else {
        return error_json("invalid", "error correction level must be 0..=3");
    };
    let opts = Options {
        ecc,
        min_version: min_version.min(255) as u8,
        max_version: max_version.min(255) as u8,
        mask: if mask < 0 { None } else { Some(mask.min(255) as u8) },
        boost_ecc: flags & 1 != 0,
        eci_utf8: flags & 2 != 0,
    };
    match encode_text(text, &opts) {
        Ok(qr) => qr.to_json(),
        Err(QrError::DataTooLong { data_bits, max_bits }) => {
            format!("{{\"error\":\"tooLong\",\"dataBits\":{data_bits},\"maxBits\":{max_bits}}}")
        }
        Err(QrError::Invalid(what)) => error_json("invalid", what),
    }
}

fn error_json(kind: &str, message: &str) -> String {
    format!("{{\"error\":\"{kind}\",\"message\":\"{message}\"}}")
}

// ---- Capacity tables (index 0 is unused so the version can index directly) ----

const ECC_CODEWORDS_PER_BLOCK: [[u8; 41]; 4] = [
    [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ERROR_CORRECTION_BLOCKS: [[u8; 41]; 4] = [
    [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/// Modules left for data and error correction once the function patterns are drawn.
fn num_raw_data_modules(version: u8) -> usize {
    let v = version as usize;
    let mut result = (16 * v + 128) * v + 64;
    if v >= 2 {
        let num_align = v / 7 + 2;
        result -= (25 * num_align - 10) * num_align - 55;
        if v >= 7 {
            result -= 36;
        }
    }
    result
}

pub fn num_data_codewords(version: u8, ecc: Ecc) -> usize {
    let v = version as usize;
    let e = ecc.ordinal();
    num_raw_data_modules(version) / 8
        - ECC_CODEWORDS_PER_BLOCK[e][v] as usize * NUM_ERROR_CORRECTION_BLOCKS[e][v] as usize
}

fn alignment_positions(version: u8) -> Vec<usize> {
    if version == 1 {
        return Vec::new();
    }
    let v = version as usize;
    let num_align = v / 7 + 2;
    let size = v * 4 + 17;
    let step = (v * 8 + num_align * 3 + 5) / (num_align * 4 - 4) * 2;
    let mut result: Vec<usize> = (0..num_align - 1).map(|i| size - 7 - i * step).collect();
    result.push(6);
    result.reverse();
    result
}

// ---- Reed–Solomon over GF(2^8) with the polynomial 0x11D ----

fn gf_multiply(x: u8, y: u8) -> u8 {
    let mut z: u8 = 0;
    for i in (0..8).rev() {
        z = (z << 1) ^ ((z >> 7) * 0x1D);
        z ^= ((y >> i) & 1) * x;
    }
    z
}

fn rs_divisor(degree: usize) -> Vec<u8> {
    let mut result = vec![0u8; degree - 1];
    result.push(1);
    let mut root: u8 = 1;
    for _ in 0..degree {
        for j in 0..degree {
            result[j] = gf_multiply(result[j], root);
            if j + 1 < degree {
                result[j] ^= result[j + 1];
            }
        }
        root = gf_multiply(root, 0x02);
    }
    result
}

fn rs_remainder(data: &[u8], divisor: &[u8]) -> Vec<u8> {
    let mut result = vec![0u8; divisor.len()];
    for &b in data {
        let factor = b ^ result.remove(0);
        result.push(0);
        for (x, &y) in result.iter_mut().zip(divisor) {
            *x ^= gf_multiply(y, factor);
        }
    }
    result
}

/// Splits the data into blocks, appends each block's error correction, and interleaves.
fn add_ecc_and_interleave(data: &[u8], version: u8, ecc: Ecc) -> Vec<u8> {
    let v = version as usize;
    let num_blocks = NUM_ERROR_CORRECTION_BLOCKS[ecc.ordinal()][v] as usize;
    let block_ecc_len = ECC_CODEWORDS_PER_BLOCK[ecc.ordinal()][v] as usize;
    let raw_codewords = num_raw_data_modules(version) / 8;
    let num_short_blocks = num_blocks - raw_codewords % num_blocks;
    let short_block_len = raw_codewords / num_blocks;

    let divisor = rs_divisor(block_ecc_len);
    let mut blocks: Vec<Vec<u8>> = Vec::with_capacity(num_blocks);
    let mut k = 0;
    for i in 0..num_blocks {
        let len = short_block_len - block_ecc_len + usize::from(i >= num_short_blocks);
        let mut block = data[k..k + len].to_vec();
        k += len;
        let ecc_bytes = rs_remainder(&block, &divisor);
        if i < num_short_blocks {
            block.push(0); // placeholder so every block has the same length
        }
        block.extend_from_slice(&ecc_bytes);
        blocks.push(block);
    }

    let mut result = Vec::with_capacity(raw_codewords);
    for i in 0..blocks[0].len() {
        for (j, block) in blocks.iter().enumerate() {
            if i != short_block_len - block_ecc_len || j >= num_short_blocks {
                result.push(block[i]);
            }
        }
    }
    result
}

// ---- Module placement ----

struct Matrix {
    version: u8,
    size: usize,
    modules: Vec<bool>,
    is_function: Vec<bool>,
}

impl Matrix {
    fn new(version: u8) -> Matrix {
        let size = version as usize * 4 + 17;
        Matrix { version, size, modules: vec![false; size * size], is_function: vec![false; size * size] }
    }

    fn get(&self, x: usize, y: usize) -> bool {
        self.modules[y * self.size + x]
    }

    fn set_function(&mut self, x: usize, y: usize, dark: bool) {
        let i = y * self.size + x;
        self.modules[i] = dark;
        self.is_function[i] = true;
    }

    fn draw_function_patterns(&mut self, ecc: Ecc) {
        let size = self.size;
        for i in 0..size {
            self.set_function(6, i, i % 2 == 0);
            self.set_function(i, 6, i % 2 == 0);
        }
        self.draw_finder(3, 3);
        self.draw_finder(size - 4, 3);
        self.draw_finder(3, size - 4);

        let positions = alignment_positions(self.version);
        let last = positions.len().wrapping_sub(1);
        for (i, &x) in positions.iter().enumerate() {
            for (j, &y) in positions.iter().enumerate() {
                let on_finder = (i == 0 && j == 0) || (i == 0 && j == last) || (i == last && j == 0);
                if !on_finder {
                    self.draw_alignment(x, y);
                }
            }
        }
        self.draw_format_bits(ecc, 0); // placeholder; marks the cells as function modules
        self.draw_version();
    }

    /// 7×7 finder plus its one-module light separator, clipped at the symbol edge.
    fn draw_finder(&mut self, cx: usize, cy: usize) {
        for dy in -4i32..=4 {
            for dx in -4i32..=4 {
                let x = cx as i32 + dx;
                let y = cy as i32 + dy;
                if x >= 0 && y >= 0 && (x as usize) < self.size && (y as usize) < self.size {
                    let dist = dx.abs().max(dy.abs());
                    self.set_function(x as usize, y as usize, dist != 2 && dist != 4);
                }
            }
        }
    }

    fn draw_alignment(&mut self, cx: usize, cy: usize) {
        for dy in -2i32..=2 {
            for dx in -2i32..=2 {
                let dist = dx.abs().max(dy.abs());
                self.set_function((cx as i32 + dx) as usize, (cy as i32 + dy) as usize, dist != 1);
            }
        }
    }

    fn draw_format_bits(&mut self, ecc: Ecc, mask: u8) {
        let data = ecc.format_bits() << 3 | mask as u32;
        let mut rem = data;
        for _ in 0..10 {
            rem = (rem << 1) ^ ((rem >> 9) * 0x537);
        }
        let bits = (data << 10 | rem) ^ 0x5412;
        let bit = |i: usize| (bits >> i) & 1 != 0;
        let size = self.size;

        // Around the top-left finder.
        for i in 0..=5 {
            self.set_function(8, i, bit(i));
        }
        self.set_function(8, 7, bit(6));
        self.set_function(8, 8, bit(7));
        self.set_function(7, 8, bit(8));
        for i in 9..15 {
            self.set_function(14 - i, 8, bit(i));
        }
        // Split between the other two finders.
        for i in 0..8 {
            self.set_function(size - 1 - i, 8, bit(i));
        }
        for i in 8..15 {
            self.set_function(8, size - 15 + i, bit(i));
        }
        self.set_function(8, size - 8, true); // the always-dark module
    }

    fn draw_version(&mut self) {
        if self.version < 7 {
            return;
        }
        let v = self.version as u32;
        let mut rem = v;
        for _ in 0..12 {
            rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
        }
        let bits = v << 12 | rem;
        for i in 0..18 {
            let dark = (bits >> i) & 1 != 0;
            let a = self.size - 11 + i % 3;
            let b = i / 3;
            self.set_function(a, b, dark);
            self.set_function(b, a, dark);
        }
    }

    /// Zig-zags two columns at a time from the bottom-right, skipping the vertical timing line.
    fn draw_codewords(&mut self, data: &[u8]) {
        let size = self.size as i32;
        let total_bits = data.len() * 8;
        let mut i = 0usize;
        let mut right = size - 1;
        while right >= 1 {
            if right == 6 {
                right = 5;
            }
            for vert in 0..size {
                for j in 0..2 {
                    let x = (right - j) as usize;
                    let upward = (right + 1) & 2 == 0;
                    let y = if upward { size - 1 - vert } else { vert } as usize;
                    let idx = y * self.size + x;
                    if !self.is_function[idx] && i < total_bits {
                        self.modules[idx] = (data[i >> 3] >> (7 - (i & 7))) & 1 != 0;
                        i += 1;
                    }
                }
            }
            right -= 2;
        }
    }

    fn apply_mask(&mut self, mask: u8) {
        for y in 0..self.size {
            for x in 0..self.size {
                let invert = match mask {
                    0 => (x + y) % 2 == 0,
                    1 => y % 2 == 0,
                    2 => x % 3 == 0,
                    3 => (x + y) % 3 == 0,
                    4 => (x / 3 + y / 2) % 2 == 0,
                    5 => x * y % 2 + x * y % 3 == 0,
                    6 => (x * y % 2 + x * y % 3) % 2 == 0,
                    _ => ((x + y) % 2 + x * y % 3) % 2 == 0,
                };
                let idx = y * self.size + x;
                if invert && !self.is_function[idx] {
                    self.modules[idx] = !self.modules[idx];
                }
            }
        }
    }

    fn penalty_score(&self) -> i32 {
        const N1: i32 = 3;
        const N2: i32 = 3;
        const N3: i32 = 40;
        const N4: i32 = 10;
        let size = self.size;
        let mut result = 0;

        for transpose in [false, true] {
            for a in 0..size {
                let mut run_color = false;
                let mut run = 0i32;
                let mut history = FinderPenalty::new(size as i32);
                for b in 0..size {
                    let dark = if transpose { self.get(a, b) } else { self.get(b, a) };
                    if dark == run_color {
                        run += 1;
                        if run == 5 {
                            result += N1;
                        } else if run > 5 {
                            result += 1;
                        }
                    } else {
                        history.add(run);
                        if !run_color {
                            result += history.count_patterns() * N3;
                        }
                        run_color = dark;
                        run = 1;
                    }
                }
                result += history.terminate_and_count(run_color, run) * N3;
            }
        }

        for y in 0..size - 1 {
            for x in 0..size - 1 {
                let c = self.get(x, y);
                if c == self.get(x + 1, y) && c == self.get(x, y + 1) && c == self.get(x + 1, y + 1) {
                    result += N2;
                }
            }
        }

        let dark = self.modules.iter().filter(|&&d| d).count() as i32;
        let total = (size * size) as i32;
        let k = ((dark * 20 - total * 10).abs() + total - 1) / total - 1;
        result + k * N4
    }
}

/// Run-length history for spotting finder-like 1:1:3:1:1 patterns with light space beside them.
struct FinderPenalty {
    qr_size: i32,
    history: [i32; 7],
}

impl FinderPenalty {
    fn new(qr_size: i32) -> Self {
        FinderPenalty { qr_size, history: [0; 7] }
    }

    fn add(&mut self, mut run: i32) {
        if self.history[0] == 0 {
            run += self.qr_size; // the light area outside the symbol
        }
        self.history.copy_within(0..6, 1);
        self.history[0] = run;
    }

    fn count_patterns(&self) -> i32 {
        let h = &self.history;
        let n = h[1];
        let core = n > 0 && h[2] == n && h[3] == n * 3 && h[4] == n && h[5] == n;
        i32::from(core && h[0] >= n * 4 && h[6] >= n) + i32::from(core && h[6] >= n * 4 && h[0] >= n)
    }

    fn terminate_and_count(mut self, run_color: bool, mut run: i32) -> i32 {
        if run_color {
            self.add(run);
            run = 0;
        }
        run += self.qr_size;
        self.add(run);
        self.count_patterns()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(ecc: Ecc) -> Options {
        Options { ecc, boost_ecc: false, ..Options::default() }
    }

    #[test]
    fn modes_are_chosen_by_content() {
        assert_eq!(encode_text("0123456789", &opts(Ecc::Low)).unwrap().mode, Mode::Numeric);
        assert_eq!(encode_text("HELLO WORLD", &opts(Ecc::Low)).unwrap().mode, Mode::Alphanumeric);
        assert_eq!(encode_text("hello", &opts(Ecc::Low)).unwrap().mode, Mode::Byte);
        let eci = Options { eci_utf8: true, ..opts(Ecc::Low) };
        assert_eq!(encode_text("안녕", &eci).unwrap().mode, Mode::Byte);
    }

    #[test]
    fn known_capacities_match_the_standard() {
        // Largest payloads from ISO/IEC 18004 Table 7.
        let cases: [(&str, usize, u8, Ecc); 6] = [
            ("1", 41, 1, Ecc::Low),
            ("A", 10, 1, Ecc::High),
            ("a", 17, 1, Ecc::Low),
            ("1", 7089, 40, Ecc::Low),
            ("A", 1852, 40, Ecc::High),
            ("a", 2953, 40, Ecc::Low),
        ];
        for (unit, max, version, ecc) in cases {
            let o = Options { min_version: version, max_version: version, ..opts(ecc) };
            assert!(encode_text(&unit.repeat(max), &o).is_ok(), "{max}×{unit:?} should fit v{version}-{ecc:?}");
            assert!(encode_text(&unit.repeat(max + 1), &o).is_err(), "{}×{unit:?} should not fit", max + 1);
        }
    }

    #[test]
    fn every_ecc_level_has_consistent_block_tables() {
        for v in 1..=40u8 {
            for e in Ecc::ALL {
                let raw = num_raw_data_modules(v) / 8;
                let blocks = NUM_ERROR_CORRECTION_BLOCKS[e.ordinal()][v as usize] as usize;
                assert!(blocks <= raw, "v{v} {e:?}");
                assert!(num_data_codewords(v, e) > 0);
            }
        }
    }

    #[test]
    fn format_information_matches_the_published_table() {
        // ISO/IEC 18004 Annex C: (L, mask 0) = 111011111000100, (H, mask 7) = 000100000111011.
        let mut m = Matrix::new(1);
        m.draw_format_bits(Ecc::Low, 0);
        let read: String = (0..=5).map(|i| m.get(8, i)).chain([m.get(8, 7), m.get(8, 8), m.get(7, 8)])
            .chain((9..15).map(|i| m.get(14 - i, 8)))
            .rev()
            .map(|d| if d { '1' } else { '0' })
            .collect();
        assert_eq!(read, "111011111000100");
        m.draw_format_bits(Ecc::High, 7);
        let read: String = (0..8).map(|i| m.get(m.size - 1 - i, 8)).chain((8..15).map(|i| m.get(8, m.size - 15 + i)))
            .rev()
            .map(|d| if d { '1' } else { '0' })
            .collect();
        assert_eq!(read, "000100000111011");
    }

    #[test]
    fn finder_patterns_sit_in_three_corners() {
        let qr = encode_text("https://example.com", &Options::default()).unwrap();
        let s = qr.size;
        for (ox, oy) in [(0, 0), (s - 7, 0), (0, s - 7)] {
            for d in 0..7 {
                assert!(qr.get(ox + d, oy) && qr.get(ox, oy + d) && qr.get(ox + 6, oy + d));
            }
            assert!(!qr.get(ox + 1, oy + 1) && qr.get(ox + 3, oy + 3));
        }
    }

    #[test]
    fn version_and_mask_can_be_forced() {
        let o = Options { min_version: 10, mask: Some(5), ..Options::default() };
        let qr = encode_text("hi", &o).unwrap();
        assert_eq!((qr.version, qr.size, qr.mask), (10, 57, 5));
    }

    #[test]
    fn boosting_raises_the_level_only_when_it_fits() {
        let qr = encode_text("hi", &Options::default()).unwrap();
        assert_eq!((qr.version, qr.ecc), (1, Ecc::High));
        let qr = encode_text("hi", &opts(Ecc::Low)).unwrap();
        assert_eq!(qr.ecc, Ecc::Low);
    }

    #[test]
    fn too_long_reports_the_sizes() {
        let o = Options { max_version: 1, ..opts(Ecc::High) };
        match encode_text(&"x".repeat(20), &o) {
            Err(QrError::DataTooLong { data_bits, max_bits }) => assert_eq!((data_bits, max_bits), (172, 72)),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn json_round_trips_the_fields() {
        let json = encode_json("12345", 1, 1, 40, -1, 0);
        assert!(json.starts_with("{\"version\":1,\"size\":21,\"ecc\":\"M\""), "{json}");
        assert!(json.contains("\"mode\":\"numeric\""));
        assert_eq!(json.matches(['0', '1']).count() >= 21 * 21, true);
        assert!(encode_json("x", 9, 1, 40, -1, 0).contains("\"error\":\"invalid\""));
        assert!(encode_json(&"x".repeat(3000), 0, 1, 40, -1, 0).contains("\"error\":\"tooLong\""));
    }

    #[test]
    fn empty_text_still_makes_a_symbol() {
        assert_eq!(encode_text("", &Options::default()).unwrap().version, 1);
    }
}
