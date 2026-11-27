//! The calculator / base converter.
//!
//! CONTRACT
//! `evaluate({expr, width: 8|16|32|64, signed: bool})` → `{ value: "decimal", hex, dec, oct, bin, signed: "decimal", float32, float64,
//!   chars: "the value's bytes as text (big-endian)", width, ok: true }` or an error with a readable message.
//!   expr: integers (123, 0x7B, 7Bh, 0o173, 0b1111011, 'A'), + - * / % ** & | ^ ~ << >> ( ), functions abs min max, unary -.
//!   `value` is the exact result; hex / dec / oct / bin / chars show it wrapped to `width` bits (two's complement),
//!   `signed` the wrapped bits read as a signed number. float32 reads the low 32 bits, float64 the low 64 bits.
//!   Precedence (low → high): | ^ & (<< >>) (+ -) (* / %) unary (- + ~) ** (right-associative).
use crate::util::Args;
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Num(i128),
    Ident(String),
    Op(&'static str),
}

fn lex(text: &str) -> Result<Vec<Tok>, String> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    const OPS: &[&str] = &["**", "<<", ">>", "+", "-", "*", "/", "%", "&", "|", "^", "~", "(", ")", ","];
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if c == '\'' {
            let ch = *chars.get(i + 1).ok_or("unfinished character")?;
            if chars.get(i + 2) != Some(&'\'') {
                return Err("a character is written 'A'".into());
            }
            out.push(Tok::Num(ch as i128));
            i += 3;
            continue;
        }
        if c.is_ascii_digit() {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            let word: String = chars[start..i].iter().filter(|c| **c != '_').collect::<String>().to_ascii_lowercase();
            let parsed = if let Some(h) = word.strip_prefix("0x") {
                i128::from_str_radix(h, 16)
            } else if let Some(o) = word.strip_prefix("0o") {
                i128::from_str_radix(o, 8)
            } else if let Some(b) = word.strip_prefix("0b") {
                i128::from_str_radix(b, 2)
            } else if let Some(h) = word.strip_suffix('h') {
                i128::from_str_radix(h, 16)
            } else {
                word.parse::<i128>()
            };
            out.push(Tok::Num(parsed.map_err(|_| format!("not a number: {word}"))?));
            continue;
        }
        if c.is_ascii_alphabetic() || c == '_' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            out.push(Tok::Ident(chars[start..i].iter().collect::<String>().to_ascii_lowercase()));
            continue;
        }
        let rest: String = chars[i..chars.len().min(i + 2)].iter().collect();
        match OPS.iter().find(|op| rest.starts_with(**op)) {
            Some(op) => {
                out.push(Tok::Op(op));
                i += op.len();
            }
            None => return Err(format!("unexpected '{c}'")),
        }
    }
    Ok(out)
}

struct Parser {
    toks: Vec<Tok>,
    pos: usize,
}

impl Parser {
    fn peek_op(&self, op: &str) -> bool {
        matches!(self.toks.get(self.pos), Some(Tok::Op(o)) if *o == op)
    }
    fn eat(&mut self, op: &str) -> bool {
        if self.peek_op(op) {
            self.pos += 1;
            true
        } else {
            false
        }
    }
    fn binary(&mut self, level: usize) -> Result<i128, String> {
        const LEVELS: &[&[&str]] = &[&["|"], &["^"], &["&"], &["<<", ">>"], &["+", "-"], &["*", "/", "%"]];
        if level == LEVELS.len() {
            return self.unary();
        }
        let mut left = self.binary(level + 1)?;
        'again: loop {
            for op in LEVELS[level] {
                if self.eat(op) {
                    let right = self.binary(level + 1)?;
                    left = apply(op, left, right)?;
                    continue 'again;
                }
            }
            return Ok(left);
        }
    }
    fn unary(&mut self) -> Result<i128, String> {
        if self.eat("-") {
            return Ok(self.unary()?.wrapping_neg());
        }
        if self.eat("+") {
            return self.unary();
        }
        if self.eat("~") {
            return Ok(!self.unary()?);
        }
        let base = self.primary()?;
        if self.eat("**") {
            let exp = self.unary()?;
            return apply("**", base, exp);
        }
        Ok(base)
    }
    fn primary(&mut self) -> Result<i128, String> {
        match self.toks.get(self.pos).cloned() {
            Some(Tok::Num(v)) => {
                self.pos += 1;
                Ok(v)
            }
            Some(Tok::Op("(")) => {
                self.pos += 1;
                let v = self.binary(0)?;
                if !self.eat(")") {
                    return Err("')' is missing".into());
                }
                Ok(v)
            }
            Some(Tok::Ident(name)) => {
                self.pos += 1;
                if !self.eat("(") {
                    return Err(format!("unknown name {name}"));
                }
                let mut args = vec![self.binary(0)?];
                while self.eat(",") {
                    args.push(self.binary(0)?);
                }
                if !self.eat(")") {
                    return Err("')' is missing".into());
                }
                match (name.as_str(), args.as_slice()) {
                    ("abs", [x]) => Ok(x.wrapping_abs()),
                    ("min", [_, ..]) => Ok(*args.iter().min().unwrap()),
                    ("max", [_, ..]) => Ok(*args.iter().max().unwrap()),
                    ("abs", _) => Err("abs takes one value".into()),
                    _ => Err(format!("unknown function {name}")),
                }
            }
            Some(Tok::Op(op)) => Err(format!("unexpected '{op}'")),
            None => Err("the expression ends too early".into()),
        }
    }
}

fn apply(op: &str, a: i128, b: i128) -> Result<i128, String> {
    Ok(match op {
        "+" => a.wrapping_add(b),
        "-" => a.wrapping_sub(b),
        "*" => a.wrapping_mul(b),
        "/" | "%" if b == 0 => return Err("division by zero".into()),
        "/" => a.wrapping_div(b),
        "%" => a.wrapping_rem(b),
        "&" => a & b,
        "|" => a | b,
        "^" => a ^ b,
        "<<" => if (0..128).contains(&b) { a.wrapping_shl(b as u32) } else { 0 },
        ">>" => if (0..128).contains(&b) { a >> b } else if a < 0 { -1 } else { 0 },
        "**" => {
            if b < 0 {
                return Err("negative exponent".into());
            }
            a.wrapping_pow(b.min(u32::MAX as i128) as u32)
        }
        _ => return Err(format!("unknown operator {op}")),
    })
}

pub fn eval_expr(text: &str) -> Result<i128, String> {
    let toks = lex(text)?;
    if toks.is_empty() {
        return Err("type an expression".into());
    }
    let mut p = Parser { toks, pos: 0 };
    let v = p.binary(0)?;
    if p.pos < p.toks.len() {
        return Err(format!("unexpected {:?}", p.toks[p.pos]).replace("Op(", "'").replace("Num(", "").replace("Ident(", "").replace(')', "'"));
    }
    Ok(v)
}

/// Plain within 1e-6 … 1e15, else the shortest exact exponent form.
fn short_float(v: f64, plain: String, exponent: String) -> String {
    if v == 0.0 || !v.is_finite() || (1e-6..1e15).contains(&v.abs()) { plain } else { exponent }
}

pub fn evaluate(args: &Value) -> Result<Value, String> {
    let value = eval_expr(args.str_or("expr", ""))?;
    let width = match args.u64_or("width", 64) {
        8 => 8u32,
        16 => 16,
        32 => 32,
        _ => 64,
    };
    let mask: u128 = (1u128 << width) - 1;
    let bits = (value as u128) & mask;
    let signed = if bits >> (width - 1) & 1 == 1 { bits as i128 - (1i128 << width) } else { bits as i128 };
    let bytes = (bits as u64).to_be_bytes();
    let chars: String = bytes[8 - (width / 8) as usize..].iter().map(|&b| if (0x20..0x7F).contains(&b) { b as char } else { '.' }).collect();
    let digits = (width / 4) as usize;
    Ok(json!({
        "ok": true,
        "value": value.to_string(),
        "hex": format!("{:0digits$X}", bits),
        "dec": bits.to_string(),
        "oct": format!("{:o}", bits),
        "bin": format!("{:0w$b}", bits, w = width as usize),
        "signed": signed.to_string(),
        "float32": short_float(f32::from_bits(bits as u32) as f64, f32::from_bits(bits as u32).to_string(), format!("{:e}", f32::from_bits(bits as u32))),
        "float64": short_float(f64::from_bits(bits as u64), f64::from_bits(bits as u64).to_string(), format!("{:e}", f64::from_bits(bits as u64))),
        "chars": chars,
        "width": width,
        "signedMode": args.bool_or("signed", false),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expressions() {
        assert_eq!(eval_expr("1 + 2 * 3").unwrap(), 7);
        assert_eq!(eval_expr("(1 + 2) * 3").unwrap(), 9);
        assert_eq!(eval_expr("2 ** 3 ** 2").unwrap(), 512);
        assert_eq!(eval_expr("-2 ** 2").unwrap(), -4);
        assert_eq!(eval_expr("0x7B + 7Bh + 0o173 + 0b1111011").unwrap(), 4 * 123);
        assert_eq!(eval_expr("'A' | 0x20").unwrap(), 'a' as i128);
        assert_eq!(eval_expr("1 << 4 | 1").unwrap(), 17);
        assert_eq!(eval_expr("~0 & 0xFF").unwrap(), 255);
        assert_eq!(eval_expr("max(3, 9, 4) - min(2, 5) + abs(-1)").unwrap(), 8);
        assert_eq!(eval_expr("17 % 5 ^ 1").unwrap(), 3);
        assert!(eval_expr("1 / 0").is_err());
        assert!(eval_expr("1 +").is_err());
        assert!(eval_expr("(1").is_err());
        assert!(eval_expr("foo").is_err());
    }

    #[test]
    fn conversions() {
        let r = evaluate(&json!({ "expr": "-1", "width": 16 })).unwrap();
        assert_eq!(r["hex"], "FFFF");
        assert_eq!(r["dec"], "65535");
        assert_eq!(r["signed"], "-1");
        assert_eq!(r["value"], "-1");
        let r = evaluate(&json!({ "expr": "0x3F800000", "width": 32 })).unwrap();
        assert_eq!(r["float32"], "1");
        let r = evaluate(&json!({ "expr": "0x4D5A", "width": 16 })).unwrap();
        assert_eq!(r["chars"], "MZ");
        assert_eq!(r["bin"], "0100110101011010");
        assert_eq!(r["oct"], "46532");
    }
}
