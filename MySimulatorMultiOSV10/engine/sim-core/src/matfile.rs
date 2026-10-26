//! MATLAB data files: level 5 (.mat v5/v6/v7, compressed or not) read and
//! written, and v7.3 (HDF5) read. Every variable type MATLAB saves is kept:
//! numeric arrays of any class and dimension (complex too), logical, char,
//! cell arrays, structures (and objects as structures) and sparse matrices.
//! `to_dataset` lays the variables out as tables, grids and result values.

use crate::data::{Column, Dataset, Grid, Table};
use crate::formats::zlib;

#[derive(Clone, Debug, PartialEq)]
pub enum MatValue {
    /// Column-major numbers; `class` is "double", "single", "int8" … "uint64" or "logical".
    Num { dims: Vec<usize>, re: Vec<f64>, im: Option<Vec<f64>>, class: String },
    /// Character array: one string per row.
    Char { dims: Vec<usize>, rows: Vec<String> },
    Cell { dims: Vec<usize>, items: Vec<MatValue> },
    /// items[element][field]
    Struct { dims: Vec<usize>, fields: Vec<String>, items: Vec<Vec<MatValue>> },
    /// Compressed sparse column: rows (0-based), column starts and values.
    Sparse { m: usize, n: usize, ir: Vec<usize>, jc: Vec<usize>, re: Vec<f64>, im: Option<Vec<f64>> },
}

impl MatValue {
    pub fn scalar(v: f64) -> MatValue {
        MatValue::Num { dims: vec![1, 1], re: vec![v], im: None, class: "double".into() }
    }
    pub fn dims(&self) -> Vec<usize> {
        match self {
            MatValue::Num { dims, .. } | MatValue::Char { dims, .. } | MatValue::Cell { dims, .. } | MatValue::Struct { dims, .. } => dims.clone(),
            MatValue::Sparse { m, n, .. } => vec![*m, *n],
        }
    }
}

const CLASSES: [&str; 16] = ["", "cell", "struct", "object", "char", "sparse", "double", "single", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64"];

// ───────────────────────── level 5 reader

/// A data element: (type, body, rest after padding to 8 bytes).
fn tag(b: &[u8]) -> Result<(u32, &[u8], &[u8]), String> {
    if b.len() < 8 {
        return Err("the MATLAB file is cut short".into());
    }
    let first = u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
    if first >> 16 != 0 {
        let ty = first & 0xffff;
        let size = ((first >> 16) as usize).min(4);
        return Ok((ty, &b[4..4 + size], &b[8..]));
    }
    let size = u32::from_le_bytes([b[4], b[5], b[6], b[7]]) as usize;
    let body = b.get(8..8 + size).ok_or("the MATLAB file is cut short")?;
    let padded = if first == 15 { size } else { size.div_ceil(8) * 8 };
    Ok((first, body, b.get(8 + padded..).unwrap_or(&[])))
}

fn numbers(ty: u32, body: &[u8]) -> Vec<f64> {
    let chunk = |w: usize| body.chunks_exact(w);
    match ty {
        1 => body.iter().map(|&v| v as i8 as f64).collect(),
        2 | 16 => body.iter().map(|&v| v as f64).collect(),
        3 => chunk(2).map(|c| i16::from_le_bytes([c[0], c[1]]) as f64).collect(),
        4 | 17 => chunk(2).map(|c| u16::from_le_bytes([c[0], c[1]]) as f64).collect(),
        5 => chunk(4).map(|c| i32::from_le_bytes([c[0], c[1], c[2], c[3]]) as f64).collect(),
        6 | 18 => chunk(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]) as f64).collect(),
        7 => chunk(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]) as f64).collect(),
        9 => chunk(8).map(|c| f64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]])).collect(),
        12 => chunk(8).map(|c| i64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]]) as f64).collect(),
        13 => chunk(8).map(|c| u64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]]) as f64).collect(),
        _ => Vec::new(),
    }
}

/// Column-major characters (m × n) → m row strings.
fn char_rows(codes: &[f64], dims: &[usize]) -> Vec<String> {
    let m = dims.first().copied().unwrap_or(0);
    let n: usize = dims.iter().skip(1).product();
    (0..m).map(|r| (0..n).filter_map(|c| codes.get(c * m + r)).map(|v| char::from_u32(*v as u32).unwrap_or('?')).collect()).collect()
}

/// Reads level-5 variables: (name, value).
pub fn read_v5(bytes: &[u8]) -> Result<Vec<(String, MatValue)>, String> {
    if bytes.len() < 128 || bytes[126..128] != *b"IM" {
        return Err("not a little-endian MATLAB level 5 file".into());
    }
    let mut out = Vec::new();
    elements(&bytes[128..], &mut out)?;
    Ok(out)
}

fn elements(mut b: &[u8], out: &mut Vec<(String, MatValue)>) -> Result<(), String> {
    while b.len() >= 8 {
        let (ty, body, rest) = tag(b)?;
        match ty {
            15 => elements(&zlib(body)?, out)?,
            14 => {
                if let Some(v) = matrix(body)? {
                    out.push(v);
                }
            }
            _ => {}
        }
        b = rest;
    }
    Ok(())
}

/// One miMATRIX body → (name, value); None for types that hold no data (function handles, opaque objects).
fn matrix(b: &[u8]) -> Result<Option<(String, MatValue)>, String> {
    if b.is_empty() {
        return Ok(Some((String::new(), MatValue::Num { dims: vec![0, 0], re: Vec::new(), im: None, class: "double".into() })));
    }
    let (_, flags, rest) = tag(b)?;
    let class = flags.first().copied().unwrap_or(0) as usize;
    let fl = flags.get(1).copied().unwrap_or(0);
    let (complex, logical) = (fl & 0x08 != 0, fl & 0x02 != 0);
    if class == 17 || class == 16 || class > 17 {
        return Ok(None); // opaque / function handle
    }
    let (_, dims_b, rest) = tag(rest)?;
    let dims: Vec<usize> = numbers(5, dims_b).iter().map(|v| *v as usize).collect();
    let (_, name_b, mut rest) = tag(rest)?;
    let name = String::from_utf8_lossy(name_b).trim_end_matches('\0').to_string();
    let count: usize = dims.iter().product();
    let value = match class {
        6..=15 => {
            let (ty, real, r2) = tag(rest)?;
            let mut re = numbers(ty, real);
            re.resize(count, 0.0);
            let im = if complex {
                let (ty, imag, _) = tag(r2)?;
                let mut v = numbers(ty, imag);
                v.resize(count, 0.0);
                Some(v)
            } else {
                None
            };
            MatValue::Num { dims, re, im, class: if logical { "logical".into() } else { CLASSES[class].into() } }
        }
        4 => {
            let codes = if count == 0 {
                Vec::new()
            } else {
                let (ty, data, _) = tag(rest)?;
                if ty == 16 {
                    String::from_utf8_lossy(data).chars().map(|c| c as u32 as f64).collect()
                } else {
                    numbers(ty, data)
                }
            };
            MatValue::Char { rows: char_rows(&codes, &dims), dims }
        }
        1 => {
            let mut items = Vec::with_capacity(count);
            for _ in 0..count {
                let (ty, body, r2) = tag(rest)?;
                if ty != 14 {
                    return Err(format!("{name}: a cell element is not a matrix"));
                }
                items.push(matrix(body)?.map(|v| v.1).unwrap_or(MatValue::Num { dims: vec![0, 0], re: Vec::new(), im: None, class: "double".into() }));
                rest = r2;
            }
            MatValue::Cell { dims, items }
        }
        2 | 3 => {
            if class == 3 {
                let (_, _cls, r2) = tag(rest)?;
                rest = r2;
            }
            let (_, len_b, r2) = tag(rest)?;
            let len = numbers(5, len_b).first().copied().unwrap_or(0.0) as usize;
            let (_, names_b, r3) = tag(r2)?;
            rest = r3;
            let fields: Vec<String> = if len == 0 { Vec::new() } else { names_b.chunks(len).map(|c| String::from_utf8_lossy(c).trim_end_matches('\0').to_string()).filter(|s| !s.is_empty()).collect() };
            let mut items = Vec::with_capacity(count);
            for _ in 0..count {
                let mut row = Vec::with_capacity(fields.len());
                for _ in 0..fields.len() {
                    let (_, body, r2) = tag(rest)?;
                    row.push(matrix(body)?.map(|v| v.1).unwrap_or(MatValue::Num { dims: vec![0, 0], re: Vec::new(), im: None, class: "double".into() }));
                    rest = r2;
                }
                items.push(row);
            }
            MatValue::Struct { dims, fields, items }
        }
        5 => {
            let (_, ir_b, r2) = tag(rest)?;
            let (_, jc_b, r3) = tag(r2)?;
            let (ty, pr_b, r4) = tag(r3)?;
            let ir: Vec<usize> = numbers(5, ir_b).iter().map(|v| *v as usize).collect();
            let jc: Vec<usize> = numbers(5, jc_b).iter().map(|v| *v as usize).collect();
            let nnz = jc.last().copied().unwrap_or(0);
            let mut re = numbers(ty, pr_b);
            re.resize(nnz, 0.0);
            let im = if complex {
                let (ty, pi_b, _) = tag(r4)?;
                Some(numbers(ty, pi_b))
            } else {
                None
            };
            MatValue::Sparse { m: dims.first().copied().unwrap_or(0), n: dims.get(1).copied().unwrap_or(0), ir: ir[..nnz.min(ir.len())].to_vec(), jc, re, im }
        }
        _ => return Ok(None),
    };
    Ok(Some((name, value)))
}

// ───────────────────────── level 5 writer

fn element(ty: u32, data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + data.len() + 8);
    if data.len() <= 4 && ty != 14 {
        out.extend_from_slice(&(ty | ((data.len() as u32) << 16)).to_le_bytes());
        let mut d = data.to_vec();
        d.resize(4, 0);
        out.extend_from_slice(&d);
        return out;
    }
    out.extend_from_slice(&ty.to_le_bytes());
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(data);
    while out.len() % 8 != 0 {
        out.push(0);
    }
    out
}

fn matrix_bytes(name: &str, v: &MatValue) -> Vec<u8> {
    let mut body = Vec::new();
    let dims_el = |dims: &[usize]| {
        let d: Vec<u8> = dims.iter().flat_map(|v| (*v as i32).to_le_bytes()).collect();
        element(5, &d)
    };
    let f64s = |v: &[f64]| -> Vec<u8> { v.iter().flat_map(|x| x.to_le_bytes()).collect() };
    let flags = |class: u8, fl: u8, nz: u32| {
        let mut f = vec![class, fl, 0, 0];
        f.extend_from_slice(&nz.to_le_bytes());
        element(6, &f)
    };
    match v {
        MatValue::Num { dims, re, im, class } => {
            let logical = class == "logical";
            let code = if logical { 9 } else { CLASSES.iter().position(|c| c == class).unwrap_or(6) as u8 };
            body.extend(flags(code, (if im.is_some() { 0x08 } else { 0 }) | (if logical { 0x02 } else { 0 }), 0));
            body.extend(dims_el(dims));
            body.extend(element(1, name.as_bytes()));
            if logical {
                body.extend(element(2, &re.iter().map(|v| (*v != 0.0) as u8).collect::<Vec<_>>()));
            } else {
                body.extend(element(9, &f64s(re)));
                if let Some(im) = im {
                    body.extend(element(9, &f64s(im)));
                }
            }
        }
        MatValue::Char { dims, rows } => {
            body.extend(flags(4, 0, 0));
            body.extend(dims_el(dims));
            body.extend(element(1, name.as_bytes()));
            let m = rows.len();
            let n = dims.get(1).copied().unwrap_or(0);
            let chars: Vec<Vec<char>> = rows.iter().map(|r| r.chars().collect()).collect();
            let mut codes = Vec::with_capacity(m * n * 2);
            for c in 0..n {
                for row in chars.iter() {
                    let ch = row.get(c).copied().unwrap_or(' ') as u32;
                    codes.extend_from_slice(&(ch.min(0xffff) as u16).to_le_bytes());
                }
            }
            body.extend(element(4, &codes));
        }
        MatValue::Cell { dims, items } => {
            body.extend(flags(1, 0, 0));
            body.extend(dims_el(dims));
            body.extend(element(1, name.as_bytes()));
            for it in items {
                body.extend(matrix_bytes("", it));
            }
        }
        MatValue::Struct { dims, fields, items } => {
            body.extend(flags(2, 0, 0));
            body.extend(dims_el(dims));
            body.extend(element(1, name.as_bytes()));
            let len = fields.iter().map(|f| f.len() + 1).max().unwrap_or(1).max(1);
            body.extend(element(5, &(len as i32).to_le_bytes()));
            let mut names = Vec::new();
            for f in fields {
                let mut b = f.as_bytes().to_vec();
                b.resize(len, 0);
                names.extend(b);
            }
            body.extend(element(1, &names));
            for row in items {
                for it in row {
                    body.extend(matrix_bytes("", it));
                }
            }
        }
        MatValue::Sparse { m, n, ir, jc, re, im } => {
            body.extend(flags(5, if im.is_some() { 0x08 } else { 0 }, re.len().max(1) as u32));
            body.extend(dims_el(&[*m, *n]));
            body.extend(element(1, name.as_bytes()));
            body.extend(element(5, &ir.iter().flat_map(|v| (*v as i32).to_le_bytes()).collect::<Vec<_>>()));
            body.extend(element(5, &jc.iter().flat_map(|v| (*v as i32).to_le_bytes()).collect::<Vec<_>>()));
            body.extend(element(9, &f64s(re)));
            if let Some(im) = im {
                body.extend(element(9, &f64s(im)));
            }
        }
    }
    element(14, &body)
}

/// A level 5 MAT-file (uncompressed) holding these variables.
pub fn write_v5(vars: &[(String, MatValue)]) -> Vec<u8> {
    let mut head = b"MATLAB 5.0 MAT-file, Platform: MySimulator, Created by: MySimulator".to_vec();
    head.resize(116, b' ');
    head.extend_from_slice(&[0; 8]);
    head.extend_from_slice(&0x0100u16.to_le_bytes());
    head.extend_from_slice(b"IM");
    for (name, v) in vars {
        head.extend(matrix_bytes(name, v));
    }
    head
}

// ───────────────────────── v7.3 (HDF5) reader

struct H5<'a> {
    b: &'a [u8],
    base: usize,
    so: usize,
    sl: usize,
}

#[derive(Default, Clone)]
struct Dtype {
    class: u8,
    size: usize,
    signed: bool,
    big: bool,
    /// Compound members: (name, offset, type).
    members: Vec<(String, usize, Dtype)>,
}

#[derive(Default)]
struct ObjInfo {
    dims: Vec<usize>,
    dtype: Option<Dtype>,
    layout: Option<(u8, usize, usize, Vec<usize>, Vec<u8>)>, // class, address, size, chunk dims, compact data
    filters: Vec<(u16, Vec<u32>)>,
    attrs: Vec<(String, Dtype, Vec<usize>, Vec<u8>)>,
    symtab: Option<(usize, usize)>,
    links: Vec<(String, usize)>,
}

impl<'a> H5<'a> {
    fn uint(&self, p: usize, n: usize) -> Result<usize, String> {
        let s = self.b.get(p..p + n).ok_or("the HDF5 file is cut short")?;
        Ok(s.iter().rev().fold(0usize, |a, v| (a << 8) | *v as usize))
    }
    fn addr(&self, p: usize) -> Result<usize, String> {
        let v = self.uint(p, self.so)?;
        Ok(if v == usize::MAX || (self.so == 8 && v == u64::MAX as usize) { usize::MAX } else { v })
    }
    fn at(&self, a: usize) -> usize {
        self.base + a
    }

    fn dtype(&self, p: usize) -> Result<(Dtype, usize), String> {
        let cv = self.b[p];
        let class = cv & 0x0f;
        let version = cv >> 4;
        let bits = [self.b[p + 1], self.b[p + 2], self.b[p + 3]];
        let size = self.uint(p + 4, 4)?;
        let mut t = Dtype { class, size, signed: bits[0] & 0x08 != 0, big: bits[0] & 0x01 != 0, members: Vec::new() };
        let mut len = 8;
        match class {
            0 => len += 4,
            1 => len += 12,
            6 => {
                let n = (bits[0] as usize) | ((bits[1] as usize) << 8);
                let mut q = p + 8;
                for _ in 0..n {
                    let end = self.b[q..].iter().position(|c| *c == 0).ok_or("bad compound name")?;
                    let name = String::from_utf8_lossy(&self.b[q..q + end]).to_string();
                    q += if version < 3 { (end + 1).div_ceil(8) * 8 } else { end + 1 };
                    let off = if version < 3 {
                        let o = self.uint(q, 4)?;
                        q += 4;
                        o
                    } else {
                        let w = if size < 256 { 1 } else if size < 65536 { 2 } else { 4 };
                        let o = self.uint(q, w)?;
                        q += w;
                        o
                    };
                    if version == 1 {
                        q += 28;
                    }
                    let (mt, ml) = self.dtype(q)?;
                    q += ml;
                    t.members.push((name, off, mt));
                }
                len = q - p;
            }
            7 => {}
            3 => {}
            9 => {
                let (_, bl) = self.dtype(p + 8)?;
                len += bl;
            }
            _ => {}
        }
        Ok((t, len))
    }

    fn dataspace(&self, p: usize) -> Result<Vec<usize>, String> {
        let version = self.b[p];
        let rank = self.b[p + 1] as usize;
        let start = if version == 1 { p + 8 } else { p + 4 };
        if version >= 2 && self.b[p + 3] == 2 {
            return Ok(vec![0]); // null dataspace
        }
        (0..rank).map(|i| self.uint(start + i * self.sl, self.sl)).collect()
    }

    /// Parses an object header (v1 or v2) into the messages we use.
    fn object(&self, addr: usize) -> Result<ObjInfo, String> {
        let mut info = ObjInfo::default();
        let p = self.at(addr);
        let mut blocks: Vec<(usize, usize, bool)> = Vec::new(); // start, end, v2
        if self.b.get(p..p + 4) == Some(b"OHDR") {
            let flags = self.b[p + 5];
            let mut q = p + 6;
            if flags & 0x20 != 0 {
                q += 16;
            }
            if flags & 0x10 != 0 {
                q += 4;
            }
            let w = 1 << (flags & 3);
            let size = self.uint(q, w)?;
            q += w;
            blocks.push((q, q + size, true));
        } else {
            let size = self.uint(p + 8, 4)?;
            blocks.push((p + 16, p + 16 + size, false));
        }
        let mut k = 0;
        while k < blocks.len() {
            let (mut q, end, v2) = blocks[k];
            let creation = v2 && self.b.get(self.at(addr) + 5).is_some_and(|f| f & 0x04 != 0);
            while q + if v2 { 4 } else { 8 } <= end {
                let (ty, size, hdr) = if v2 {
                    let h = if creation { 6 } else { 4 };
                    (self.b[q] as usize, self.uint(q + 1, 2)?, h)
                } else {
                    (self.uint(q, 2)?, self.uint(q + 2, 2)?, 8)
                };
                let d = q + hdr;
                match ty {
                    0x01 => info.dims = self.dataspace(d)?,
                    0x03 => info.dtype = Some(self.dtype(d)?.0),
                    0x08 => {
                        let version = self.b[d];
                        if version == 3 {
                            match self.b[d + 1] {
                                0 => {
                                    let n = self.uint(d + 2, 2)?;
                                    info.layout = Some((0, 0, n, Vec::new(), self.b[d + 4..d + 4 + n].to_vec()));
                                }
                                1 => info.layout = Some((1, self.addr(d + 2)?, self.uint(d + 2 + self.so, self.sl)?, Vec::new(), Vec::new())),
                                _ => {
                                    let rank = self.b[d + 2] as usize;
                                    let bt = self.addr(d + 3)?;
                                    let dims: Vec<usize> = (0..rank).map(|i| self.uint(d + 3 + self.so + 4 * i, 4)).collect::<Result<_, _>>()?;
                                    info.layout = Some((2, bt, 0, dims, Vec::new()));
                                }
                            }
                        } else if version < 3 {
                            let rank = self.b[d + 1] as usize;
                            let class = self.b[d + 2];
                            let mut r = d + 8;
                            let a = if class != 0 {
                                let a = self.addr(r)?;
                                r += self.so;
                                a
                            } else {
                                0
                            };
                            let dims: Vec<usize> = (0..rank).map(|i| self.uint(r + 4 * i, 4)).collect::<Result<_, _>>()?;
                            r += 4 * rank;
                            match class {
                                0 => {
                                    let n = self.uint(r, 4)?;
                                    info.layout = Some((0, 0, n, Vec::new(), self.b[r + 4..r + 4 + n].to_vec()));
                                }
                                1 => info.layout = Some((1, a, dims.iter().product(), Vec::new(), Vec::new())),
                                _ => info.layout = Some((2, a, 0, dims, Vec::new())),
                            }
                        } else {
                            return Err("this HDF5 chunk index (layout version 4) is not supported".into());
                        }
                    }
                    0x0B => {
                        let version = self.b[d];
                        let n = self.b[d + 1] as usize;
                        let mut r = if version == 1 { d + 8 } else { d + 2 };
                        for _ in 0..n {
                            let id = self.uint(r, 2)? as u16;
                            let name_len = if version == 1 || id >= 256 { self.uint(r + 2, 2)? } else { 0 };
                            r += if version == 1 || id >= 256 { 4 } else { 2 };
                            let nvals = self.uint(r + 2, 2)?;
                            r += 4;
                            r += if version == 1 { name_len.div_ceil(8) * 8 } else { name_len };
                            let vals: Vec<u32> = (0..nvals).map(|i| self.uint(r + 4 * i, 4).map(|v| v as u32)).collect::<Result<_, _>>()?;
                            r += 4 * nvals;
                            if version == 1 && nvals % 2 == 1 {
                                r += 4;
                            }
                            info.filters.push((id, vals));
                        }
                    }
                    0x0C => {
                        let version = self.b[d];
                        let name_size = self.uint(d + 2, 2)?;
                        let dt_size = self.uint(d + 4, 2)?;
                        let ds_size = self.uint(d + 6, 2)?;
                        let mut r = d + if version == 3 { 9 } else { 8 };
                        let pad = |n: usize| if version == 1 { n.div_ceil(8) * 8 } else { n };
                        let name = String::from_utf8_lossy(&self.b[r..r + name_size]).trim_end_matches('\0').to_string();
                        r += pad(name_size);
                        let (dt, _) = self.dtype(r)?;
                        r += pad(dt_size);
                        let dims = self.dataspace(r)?;
                        r += pad(ds_size);
                        let count: usize = dims.iter().product::<usize>().max(1);
                        let len = (count * dt.size).min(end.saturating_sub(r));
                        info.attrs.push((name, dt, dims, self.b[r..r + len].to_vec()));
                    }
                    0x06 => {
                        // Link message (new-style compact groups).
                        let flags = self.b[d + 1];
                        let mut r = d + 2;
                        let link_type = if flags & 0x08 != 0 {
                            r += 1;
                            self.b[r - 1]
                        } else {
                            0
                        };
                        if flags & 0x04 != 0 {
                            r += 8;
                        }
                        if flags & 0x10 != 0 {
                            r += 1;
                        }
                        let w = 1 << (flags & 3);
                        let nl = self.uint(r, w)?;
                        r += w;
                        let name = String::from_utf8_lossy(&self.b[r..r + nl]).to_string();
                        r += nl;
                        if link_type == 0 {
                            info.links.push((name, self.addr(r)?));
                        }
                    }
                    0x10 => {
                        let a = self.at(self.addr(d)?);
                        let l = self.uint(d + self.so, self.sl)?;
                        if v2 {
                            blocks.push((a + 4, a + l - 4, true));
                        } else {
                            blocks.push((a, a + l, false));
                        }
                    }
                    0x11 => info.symtab = Some((self.addr(d)?, self.addr(d + self.so)?)),
                    _ => {}
                }
                q = d + size;
            }
            k += 1;
        }
        Ok(info)
    }

    /// The members of an old-style group: B-tree of symbol table nodes + local heap.
    fn group_members(&self, btree: usize, heap: usize) -> Result<Vec<(String, usize)>, String> {
        let hp = self.at(heap);
        if self.b.get(hp..hp + 4) != Some(b"HEAP") {
            return Err("bad HDF5 local heap".into());
        }
        let data = self.at(self.addr(hp + 8 + 2 * self.sl)?);
        let name_at = |off: usize| -> String {
            let s = &self.b[data + off..];
            let end = s.iter().position(|c| *c == 0).unwrap_or(0);
            String::from_utf8_lossy(&s[..end]).to_string()
        };
        let mut out = Vec::new();
        let mut stack = vec![btree];
        while let Some(node) = stack.pop() {
            let p = self.at(node);
            if self.b.get(p..p + 4) == Some(b"SNOD") {
                let n = self.uint(p + 6, 2)?;
                let mut q = p + 8;
                for _ in 0..n {
                    let name_off = self.uint(q, self.so)?;
                    let obj = self.addr(q + self.so)?;
                    out.push((name_at(name_off), obj));
                    q += 2 * self.so + 8 + 16;
                }
                continue;
            }
            if self.b.get(p..p + 4) != Some(b"TREE") {
                return Err("bad HDF5 B-tree".into());
            }
            let entries = self.uint(p + 6, 2)?;
            let mut q = p + 8 + 2 * self.so + self.sl;
            for _ in 0..entries {
                stack.push(self.addr(q)?);
                q += self.so + self.sl;
            }
        }
        Ok(out)
    }

    /// The raw bytes of a dataset (row-major in the HDF5 dimensions).
    fn data(&self, info: &ObjInfo) -> Result<Vec<u8>, String> {
        let dt = info.dtype.as_ref().ok_or("a dataset without a type")?;
        let count: usize = info.dims.iter().product();
        let total = count * dt.size;
        let Some((class, a, size, chunk, compact)) = &info.layout else { return Ok(vec![0; total]) };
        match class {
            0 => Ok(compact.clone()),
            1 => {
                if *a == usize::MAX {
                    return Ok(vec![0; total]);
                }
                let p = self.at(*a);
                Ok(self.b.get(p..p + total.min(*size.max(&total))).ok_or("the HDF5 data is cut short")?.to_vec())
            }
            _ => {
                let rank = info.dims.len();
                let mut out = vec![0u8; total];
                let cdims = &chunk[..rank];
                let mut stack = vec![*a];
                while let Some(node) = stack.pop() {
                    let p = self.at(node);
                    if self.b.get(p..p + 4) != Some(b"TREE") {
                        return Err("bad HDF5 chunk B-tree".into());
                    }
                    let level = self.b[p + 5];
                    let entries = self.uint(p + 6, 2)?;
                    let key_size = 8 + 8 * (rank + 1);
                    let mut q = p + 8 + 2 * self.so;
                    for _ in 0..entries {
                        let csize = self.uint(q, 4)?;
                        let mask = self.uint(q + 4, 4)?;
                        let offs: Vec<usize> = (0..rank).map(|i| self.uint(q + 8 + 8 * i, 8)).collect::<Result<_, _>>()?;
                        let child = self.addr(q + key_size)?;
                        if level > 0 {
                            stack.push(child);
                        } else {
                            let cp = self.at(child);
                            let mut raw = self.b.get(cp..cp + csize).ok_or("the HDF5 chunk is cut short")?.to_vec();
                            for (k, (id, vals)) in info.filters.iter().enumerate().rev() {
                                if mask & (1 << k) != 0 {
                                    continue;
                                }
                                raw = match id {
                                    1 => zlib(&raw)?,
                                    2 => {
                                        let w = vals.first().copied().unwrap_or(dt.size as u32) as usize;
                                        let n = raw.len() / w.max(1);
                                        let mut o = vec![0u8; raw.len()];
                                        for i in 0..n {
                                            for j in 0..w {
                                                o[i * w + j] = raw[j * n + i];
                                            }
                                        }
                                        o
                                    }
                                    3 => raw[..raw.len().saturating_sub(4)].to_vec(),
                                    other => return Err(format!("HDF5 filter {other} is not supported")),
                                };
                            }
                            // Copy the chunk into place (row-major, clipped at the edges).
                            let cn: usize = cdims.iter().product();
                            for e in 0..cn {
                                let mut rem = e;
                                let mut idx = vec![0usize; rank];
                                for d in (0..rank).rev() {
                                    idx[d] = rem % cdims[d];
                                    rem /= cdims[d];
                                }
                                let mut lin = 0;
                                let mut inside = true;
                                for d in 0..rank {
                                    let g = offs[d] + idx[d];
                                    if g >= info.dims[d] {
                                        inside = false;
                                        break;
                                    }
                                    lin = lin * info.dims[d] + g;
                                }
                                if inside && (e + 1) * dt.size <= raw.len() {
                                    out[lin * dt.size..(lin + 1) * dt.size].copy_from_slice(&raw[e * dt.size..(e + 1) * dt.size]);
                                }
                            }
                        }
                        q += key_size + self.so;
                    }
                }
                Ok(out)
            }
        }
    }

    fn num(&self, dt: &Dtype, b: &[u8]) -> f64 {
        let v: Vec<u8> = if dt.big { b.iter().rev().copied().collect() } else { b.to_vec() };
        match (dt.class, dt.size) {
            (1, 8) => f64::from_le_bytes(v[..8].try_into().unwrap()),
            (1, 4) => f32::from_le_bytes(v[..4].try_into().unwrap()) as f64,
            (0, n) => {
                let u = v.iter().take(n).rev().fold(0u64, |a, x| (a << 8) | *x as u64);
                if dt.signed {
                    let shift = 64 - 8 * n as u32;
                    (((u << shift) as i64) >> shift) as f64
                } else {
                    u as f64
                }
            }
            _ => f64::NAN,
        }
    }

    fn attr_text(info: &ObjInfo, name: &str) -> Option<String> {
        info.attrs.iter().find(|a| a.0 == name).map(|a| String::from_utf8_lossy(&a.3).trim_end_matches('\0').trim().to_string())
    }

    fn value(&self, addr: usize, depth: usize) -> Result<MatValue, String> {
        if depth > 32 {
            return Err("the HDF5 structure nests too deep".into());
        }
        let info = self.object(addr)?;
        let class = Self::attr_text(&info, "MATLAB_class").unwrap_or_else(|| "double".into());
        // Groups are structures.
        if info.symtab.is_some() || (!info.links.is_empty() && info.dtype.is_none()) {
            let members = match info.symtab {
                Some((bt, heap)) => self.group_members(bt, heap)?,
                None => info.links.clone(),
            };
            let mut fields = Vec::new();
            let mut row = Vec::new();
            for (name, a) in members {
                fields.push(name);
                row.push(self.value(a, depth + 1)?);
            }
            return Ok(MatValue::Struct { dims: vec![1, 1], fields, items: vec![row] });
        }
        let dt = info.dtype.clone().ok_or("an HDF5 object without a type")?;
        let hdims = info.dims.clone();
        let mdims: Vec<usize> = if hdims.is_empty() { vec![1, 1] } else if hdims.len() == 1 { vec![hdims[0], 1] } else { hdims.iter().rev().copied().collect() };
        let raw = self.data(&info)?;
        if info.attrs.iter().any(|a| a.0 == "MATLAB_empty") {
            return Ok(match class.as_str() {
                "char" => MatValue::Char { dims: vec![0, 0], rows: Vec::new() },
                "cell" => MatValue::Cell { dims: vec![0, 0], items: Vec::new() },
                _ => MatValue::Num { dims: vec![0, 0], re: Vec::new(), im: None, class },
            });
        }
        let count: usize = mdims.iter().product();
        match dt.class {
            7 => {
                // Object references: a cell array.
                let mut items = Vec::with_capacity(count);
                for i in 0..count {
                    let r = raw[i * dt.size..(i + 1) * dt.size].iter().rev().fold(0usize, |acc, v| (acc << 8) | *v as usize);
                    items.push(self.value(r, depth + 1)?);
                }
                Ok(MatValue::Cell { dims: mdims, items })
            }
            6 => {
                let re_m = dt.members.iter().find(|m| m.0 == "real").ok_or("a compound type that is not complex")?;
                let im_m = dt.members.iter().find(|m| m.0 == "imag").ok_or("a compound type that is not complex")?;
                let re: Vec<f64> = (0..count).map(|i| self.num(&re_m.2, &raw[i * dt.size + re_m.1..])).collect();
                let im: Vec<f64> = (0..count).map(|i| self.num(&im_m.2, &raw[i * dt.size + im_m.1..])).collect();
                Ok(MatValue::Num { dims: mdims, re, im: Some(im), class })
            }
            0 | 1 => {
                let vals: Vec<f64> = (0..count).map(|i| self.num(&dt, &raw[i * dt.size..(i + 1) * dt.size])).collect();
                Ok(match class.as_str() {
                    "char" => MatValue::Char { rows: char_rows(&vals, &mdims), dims: mdims },
                    _ => MatValue::Num { dims: mdims, re: vals, im: None, class },
                })
            }
            _ => Err(format!("HDF5 type class {} is not supported", dt.class)),
        }
    }
}

/// Reads a v7.3 MAT-file (HDF5): numeric, logical, char, complex, cell and struct variables.
pub fn read_v73(bytes: &[u8]) -> Result<Vec<(String, MatValue)>, String> {
    let sig = b"\x89HDF\r\n\x1a\n";
    let base = [0usize, 512, 1024, 2048, 4096].into_iter().find(|&o| bytes.get(o..o + 8) == Some(&sig[..])).ok_or("not an HDF5 file")?;
    let version = bytes[base + 8];
    let mut h = H5 { b: bytes, base, so: 8, sl: 8 };
    let root = if version <= 1 {
        h.so = bytes[base + 13] as usize;
        h.sl = bytes[base + 14] as usize;
        let mut p = base + 24 + if version == 1 { 4 } else { 0 };
        let b0 = h.addr(p)?;
        h.base = if b0 == usize::MAX { base } else { base.max(b0) };
        p += 4 * h.so;
        // Root symbol table entry: object header address.
        h.addr(p + h.so)?
    } else {
        h.so = bytes[base + 9] as usize;
        h.sl = bytes[base + 10] as usize;
        let p = base + 12;
        let b0 = h.addr(p)?;
        h.base = base.max(b0);
        h.addr(p + 3 * h.so)?
    };
    let info = h.object(root)?;
    let members = match info.symtab {
        Some((bt, heap)) => h.group_members(bt, heap)?,
        None => info.links.clone(),
    };
    let mut out = Vec::new();
    for (name, a) in members {
        if name.starts_with('#') {
            continue; // #refs# and #subsystem#
        }
        out.push((name, h.value(a, 0)?));
    }
    Ok(out)
}

/// Any MAT-file: level 5 or v7.3.
pub fn read(bytes: &[u8]) -> Result<Vec<(String, MatValue)>, String> {
    // v7.3 files carry the same header with version 0x0200 and HDF5 after a 512-byte user block.
    if bytes.len() >= 128 && bytes[126..128] == *b"IM" && bytes[124..126] != [0x00, 0x02] {
        return read_v5(bytes);
    }
    if bytes.len() >= 128 && bytes[126..128] == *b"MI" {
        return Err("big-endian MAT-files are not supported".into());
    }
    read_v73(bytes)
}

// ───────────────────────── as a dataset

struct Flat {
    scalars: Vec<(String, f64)>,
    vectors: Vec<(String, Vec<f64>)>,
    texts: Vec<(String, Vec<String>)>,
    matrices: Vec<(String, usize, usize, Vec<f64>)>,
    notes: Vec<String>,
}

fn flatten(name: &str, v: &MatValue, f: &mut Flat) {
    match v {
        MatValue::Num { dims, re, im, .. } => {
            let count = re.len();
            let parts: Vec<(String, &Vec<f64>)> = match im {
                Some(im) => vec![(format!("{name}_re"), re), (format!("{name}_im"), im)],
                None => vec![(name.to_string(), re)],
            };
            for (n, data) in parts {
                if count == 0 {
                    f.notes.push(format!("{n} is empty"));
                } else if count == 1 {
                    f.scalars.push((n, data[0]));
                } else if dims.iter().filter(|d| **d > 1).count() <= 1 {
                    f.vectors.push((n, data.clone()));
                } else {
                    let m = dims[0];
                    let cols = dims[1];
                    let pages: usize = dims.iter().skip(2).product();
                    for p in 0..pages {
                        let label = if pages > 1 { format!("{n}(:,:,{})", p + 1) } else { n.clone() };
                        f.matrices.push((label, m, cols, data[p * m * cols..(p + 1) * m * cols].to_vec()));
                    }
                }
            }
        }
        MatValue::Char { rows, .. } => f.texts.push((name.to_string(), rows.clone())),
        MatValue::Cell { items, .. } => {
            for (i, it) in items.iter().enumerate() {
                flatten(&format!("{name}{{{}}}", i + 1), it, f);
            }
        }
        MatValue::Struct { fields, items, .. } => {
            for (e, row) in items.iter().enumerate() {
                let prefix = if items.len() > 1 { format!("{name}({})", e + 1) } else { name.to_string() };
                for (field, it) in fields.iter().zip(row) {
                    flatten(&format!("{prefix}.{field}"), it, f);
                }
            }
        }
        MatValue::Sparse { m, n, ir, jc, re, .. } => {
            if m * n <= 1_000_000 {
                let mut dense = vec![0.0; m * n];
                for c in 0..*n {
                    for k in jc[c]..jc[c + 1].min(re.len()) {
                        dense[c * m + ir[k]] = re[k];
                    }
                }
                flatten(name, &MatValue::Num { dims: vec![*m, *n], re: dense, im: None, class: "double".into() }, f);
            } else {
                f.notes.push(format!("{name} is a {m} × {n} sparse matrix with {} non-zeros (too large to expand)", re.len()));
            }
        }
    }
}

/// The variables as tables (vectors share one, each matrix its own with a grid), result values and text.
pub fn to_dataset(vars: &[(String, MatValue)]) -> Dataset {
    let mut f = Flat { scalars: Vec::new(), vectors: Vec::new(), texts: Vec::new(), matrices: Vec::new(), notes: Vec::new() };
    for (name, v) in vars {
        flatten(name, v, &mut f);
    }
    let mut d = Dataset::default();
    if !f.vectors.is_empty() {
        let longest = f.vectors.iter().map(|v| v.1.len()).max().unwrap_or(0);
        let mut t = Table::new("variables");
        for (n, mut v) in f.vectors {
            v.resize(longest, f64::NAN);
            t.push(Column::new(&n, "", v));
        }
        d.tables.push(t);
    }
    for (name, m, n, data) in f.matrices {
        let mut t = Table::new(&name);
        for c in 0..n.min(200) {
            t.push(Column::new(&format!("{name}_{}", c + 1), "", data[c * m..(c + 1) * m].to_vec()));
        }
        d.tables.push(t);
        let z: Vec<f64> = (0..m).flat_map(|r| (0..n).map(move |c| (r, c))).map(|(r, c)| data[c * m + r]).collect();
        d.grids.push(Grid { name: name.clone(), x: (1..=n).map(|v| v as f64).collect(), y: (1..=m).map(|v| v as f64).collect(), z, x_label: "column".into(), y_label: "row".into(), z_label: name, x_names: None, y_names: None });
    }
    if !f.texts.is_empty() {
        let mut t = Table::new("text");
        let mut names = Vec::new();
        let mut values = Vec::new();
        for (n, rows) in &f.texts {
            for (i, r) in rows.iter().enumerate() {
                names.push(if rows.len() > 1 { format!("{n}({})", i + 1) } else { n.clone() });
                values.push(r.clone());
            }
        }
        t.push(Column::text("variable", names));
        t.push(Column::text("text", values));
        d.tables.push(t);
    }
    for (n, v) in f.scalars {
        d.scalar(&n, v, "");
    }
    d.scalar("variables", vars.len() as f64, "");
    let mut text: Vec<String> = f.texts.iter().map(|(n, r)| format!("{n} = '{}'", r.join("' / '"))).collect();
    text.extend(f.notes);
    d.text = text.join("\n");
    d
}

/// A table as MAT variables: each numeric column a column vector, text columns as cell arrays of strings.
pub fn from_table(t: &Table) -> Vec<(String, MatValue)> {
    t.columns
        .iter()
        .map(|c| {
            let name = crate::expr::sanitize_name(&c.name);
            let v = match &c.labels {
                Some(l) => MatValue::Cell { dims: vec![l.len(), 1], items: l.iter().map(|s| MatValue::Char { dims: vec![1, s.chars().count()], rows: vec![s.clone()] }).collect() },
                None => MatValue::Num { dims: vec![c.values.len(), 1], re: c.values.clone(), im: None, class: "double".into() },
            };
            (name, v)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v5_round_trip_of_every_kind() {
        let vars = vec![
            ("a".to_string(), MatValue::scalar(3.5)),
            ("m".to_string(), MatValue::Num { dims: vec![2, 3], re: vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0], im: None, class: "double".into() }),
            ("z".to_string(), MatValue::Num { dims: vec![1, 2], re: vec![1.0, 2.0], im: Some(vec![-1.0, 0.5]), class: "double".into() }),
            ("flag".to_string(), MatValue::Num { dims: vec![1, 3], re: vec![1.0, 0.0, 1.0], im: None, class: "logical".into() }),
            ("s".to_string(), MatValue::Char { dims: vec![2, 3], rows: vec!["abc".into(), "dé ".into()] }),
            ("c".to_string(), MatValue::Cell { dims: vec![1, 2], items: vec![MatValue::scalar(1.0), MatValue::Char { dims: vec![1, 2], rows: vec!["hi".into()] }] }),
            ("st".to_string(), MatValue::Struct { dims: vec![1, 2], fields: vec!["x".into(), "name".into()], items: vec![vec![MatValue::scalar(1.0), MatValue::Char { dims: vec![1, 1], rows: vec!["p".into()] }], vec![MatValue::scalar(2.0), MatValue::Char { dims: vec![1, 1], rows: vec!["q".into()] }]] }),
            ("sp".to_string(), MatValue::Sparse { m: 3, n: 3, ir: vec![0, 2, 1], jc: vec![0, 1, 2, 3], re: vec![5.0, 6.0, 7.0], im: None }),
        ];
        let bytes = write_v5(&vars);
        let back = read(&bytes).unwrap();
        assert_eq!(back, vars);
        let d = to_dataset(&back);
        assert_eq!(d.get_scalar("a"), Some(3.5));
        assert_eq!(d.get_scalar("st(2).x"), Some(2.0));
        assert_eq!(d.get_scalar("c{1}"), Some(1.0));
        assert!(d.tables.iter().any(|t| t.name == "m"));
        assert!(d.text.contains("s = 'abc' / 'dé '"));
    }
}
