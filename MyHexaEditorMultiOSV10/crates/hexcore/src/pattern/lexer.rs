//! Tokens of the template language.

#[derive(Clone, Debug, PartialEq)]
pub enum Tok {
    Ident(String),
    Int(u64),
    Float(f64),
    Str(String),
    Char(u64),
    Punct(&'static str),
    /// `#pragma …` / `#include …`: the rest of the line.
    Pragma(String),
    Eof,
}

#[derive(Clone, Debug)]
pub struct Token {
    pub tok: Tok,
    pub line: u32,
    pub col: u32,
}

#[derive(Clone, Debug)]
pub struct PErr {
    pub line: u32,
    pub col: u32,
    pub message: String,
}

const PUNCTS: &[&str] = &[
    "<<=", ">>=", "==", "!=", "<=", ">=", "&&", "||", "<<", ">>", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "++", "--", "::", "->",
    "+", "-", "*", "/", "%", "&", "|", "^", "~", "!", "<", ">", "=", "?", ":", ";", ",", ".", "(", ")", "{", "}", "[", "]", "@", "$",
];

fn escape(chars: &[char], i: &mut usize) -> Option<u32> {
    let c = *chars.get(*i)?;
    *i += 1;
    Some(match c {
        'n' => 10,
        't' => 9,
        'r' => 13,
        '0' => 0,
        'a' => 7,
        'b' => 8,
        'f' => 12,
        'v' => 11,
        'e' => 27,
        'x' => {
            let mut v = 0u32;
            let mut n = 0;
            while n < 2 && *i < chars.len() && chars[*i].is_ascii_hexdigit() {
                v = v * 16 + chars[*i].to_digit(16).unwrap();
                *i += 1;
                n += 1;
            }
            v
        }
        other => other as u32,
    })
}

pub fn lex(src: &str) -> Result<Vec<Token>, PErr> {
    let chars: Vec<char> = src.chars().collect();
    let mut out = Vec::new();
    let (mut i, mut line, mut col) = (0usize, 1u32, 1u32);
    let err = |line, col, message: String| PErr { line, col, message };
    while i < chars.len() {
        let c = chars[i];
        if c == '\n' {
            i += 1;
            line += 1;
            col = 1;
            continue;
        }
        if c.is_whitespace() {
            i += 1;
            col += 1;
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            i += 2;
            col += 2;
            while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                if chars[i] == '\n' {
                    line += 1;
                    col = 1;
                } else {
                    col += 1;
                }
                i += 1;
            }
            i += 2;
            col += 2;
            continue;
        }
        let (tl, tc) = (line, col);
        let start = i;
        if c == '#' {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            let text: String = chars[start + 1..i].iter().collect();
            col += (i - start) as u32;
            out.push(Token { tok: Tok::Pragma(text.trim().to_string()), line: tl, col: tc });
            continue;
        }
        if c.is_ascii_alphabetic() || c == '_' {
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            let text: String = chars[start..i].iter().collect();
            col += (i - start) as u32;
            out.push(Token { tok: Tok::Ident(text), line: tl, col: tc });
            continue;
        }
        if c.is_ascii_digit() || (c == '.' && chars.get(i + 1).is_some_and(|d| d.is_ascii_digit())) {
            let lower_next = chars.get(i + 1).map(|x| x.to_ascii_lowercase());
            let tok = if c == '0' && matches!(lower_next, Some('x') | Some('b') | Some('o')) {
                let radix = match lower_next { Some('x') => 16, Some('b') => 2, _ => 8 };
                i += 2;
                let s = i;
                while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                    i += 1;
                }
                let digits: String = chars[s..i].iter().filter(|c| **c != '_').collect();
                let digits = digits.trim_end_matches(['u', 'U', 'l', 'L']);
                Tok::Int(u64::from_str_radix(digits, radix).map_err(|_| err(tl, tc, format!("bad number 0{}{}", lower_next.unwrap(), digits)))?)
            } else {
                let mut float = false;
                while i < chars.len() {
                    let d = chars[i];
                    if d.is_ascii_digit() || d == '_' {
                        i += 1;
                    } else if d == '.' && !float {
                        float = true;
                        i += 1;
                    } else if (d == 'e' || d == 'E') && chars.get(i + 1).is_some_and(|x| x.is_ascii_digit() || *x == '-' || *x == '+') {
                        float = true;
                        i += 2;
                    } else {
                        break;
                    }
                }
                let text: String = chars[start..i].iter().filter(|c| **c != '_').collect();
                while i < chars.len() && matches!(chars[i], 'u' | 'U' | 'l' | 'L' | 'f' | 'F') {
                    i += 1;
                }
                if float {
                    Tok::Float(text.parse().map_err(|_| err(tl, tc, format!("bad number {text}")))?)
                } else {
                    Tok::Int(text.parse().map_err(|_| err(tl, tc, format!("bad number {text}")))?)
                }
            };
            col += (i - start) as u32;
            out.push(Token { tok, line: tl, col: tc });
            continue;
        }
        if c == '"' || c == '\'' {
            i += 1;
            let mut text = String::new();
            let mut closed = false;
            while i < chars.len() {
                let d = chars[i];
                if d == c {
                    i += 1;
                    closed = true;
                    break;
                }
                if d == '\n' {
                    break;
                }
                i += 1;
                if d == '\\' {
                    if let Some(v) = escape(&chars, &mut i) {
                        text.push(char::from_u32(v).unwrap_or('?'));
                    }
                } else {
                    text.push(d);
                }
            }
            if !closed {
                return Err(err(tl, tc, "unterminated text".into()));
            }
            col += (i - start) as u32;
            let tok = if c == '"' {
                Tok::Str(text)
            } else {
                let v = text.chars().fold(0u64, |acc, ch| (acc << 8) | (ch as u64 & 0xFFFF_FFFF));
                Tok::Char(v)
            };
            out.push(Token { tok, line: tl, col: tc });
            continue;
        }
        let rest: String = chars[i..(i + 3).min(chars.len())].iter().collect();
        match PUNCTS.iter().find(|p| rest.starts_with(**p)) {
            Some(p) => {
                i += p.len();
                col += p.len() as u32;
                out.push(Token { tok: Tok::Punct(p), line: tl, col: tc });
            }
            None => return Err(err(tl, tc, format!("unexpected character '{c}'"))),
        }
    }
    out.push(Token { tok: Tok::Eof, line, col });
    Ok(out)
}
