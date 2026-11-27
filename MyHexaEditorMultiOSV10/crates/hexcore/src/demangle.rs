//! Symbol demangling: Itanium C++ (`_Z…`, GCC / Clang), MSVC C++ (`?…@@…`), Rust legacy (`_ZN…17h<hash>E`) and
//! Rust v0 (`_R…`). Swift names (`$s…`, `_T0…`) are recognised but left as they are (no pure-Rust Swift
//! demangler builds for wasm).
//!
//! WIRING (not yet done; for whoever owns lib.rs / engine.rs):
//!   lib.rs:     `pub mod demangle;`
//!   engine.rs:  in `call_with`, under "lists and helpers" (no document; NOT in READONLY):
//!                   "demangle" => crate::demangle::demangle(args),
//!
//! CONTRACT
//! `demangle({ names: ["_ZN3foo3barEv", …] })` → `[{ input, output, scheme, ok }]`, one per name, in order.
//! `demangle({ text: "…free text, e.g. strings found in a binary…" })` → `[{ input, output, scheme, ok, offset }]`
//!   for each mangled name found in the text that demangles (`offset`: byte offset in the text), at most 20000.
//! scheme: "itanium" | "msvc" | "rust-legacy" | "rust-v0" | "swift" | "none". `ok` false: output is the input
//! unchanged (not mangled, not demangled, or Swift).
use regex::Regex;
use serde_json::{json, Value};
use std::sync::OnceLock;

const MAX_NAME: usize = 8192;
const MAX_FOUND: usize = 20000;

pub fn demangle(args: &Value) -> Result<Value, String> {
    if let Some(names) = args.get("names") {
        let list: Vec<&str> = match names {
            Value::Array(a) => a.iter().map(|v| v.as_str().ok_or("names: expected strings")).collect::<Result<_, _>>()?,
            Value::String(s) => s.lines().collect(),
            _ => return Err("names: expected an array of strings".into()),
        };
        return Ok(Value::Array(
            list.iter()
                .map(|n| {
                    let n = n.trim();
                    let (output, scheme, ok) = one(n);
                    json!({ "input": n, "output": output, "scheme": scheme, "ok": ok })
                })
                .collect(),
        ));
    }
    if let Some(text) = args.get("text").and_then(|v| v.as_str()) {
        return Ok(Value::Array(find_in_text(text)));
    }
    Err("demangle: expected `names` or `text`".into())
}

fn rust_legacy_hash() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"17h[0-9a-f]{16}E").unwrap())
}

/// Demangles one name: (output, scheme, demangled?).
pub fn one(name: &str) -> (String, &'static str, bool) {
    let fail = |scheme| (name.to_string(), scheme, false);
    if name.is_empty() || name.len() > MAX_NAME {
        return fail("none");
    }
    let bare = name.trim_start_matches('_');
    let underscores = name.len() - bare.len();
    // Rust v0: _R… (or __R… on macOS)
    if (1..=2).contains(&underscores) && bare.starts_with('R') {
        return match rustc_demangle::try_demangle(name) {
            Ok(d) => (format!("{d:#}"), "rust-v0", true),
            Err(_) => fail("rust-v0"),
        };
    }
    if (1..=3).contains(&underscores) && bare.starts_with('Z') {
        // Rust legacy: Itanium-shaped with a 17h<16 hex>E hash
        if bare.starts_with("ZN") && rust_legacy_hash().is_match(name) {
            if let Ok(d) = rustc_demangle::try_demangle(name) {
                return (format!("{d:#}"), "rust-legacy", true);
            }
        }
        // macOS adds one underscore: __Z… → _Z…
        let itanium = if underscores >= 2 { &name[underscores - 1..] } else { name };
        return match itanium_demangle(itanium) {
            Some(d) => (d, "itanium", true),
            None => fail("itanium"),
        };
    }
    if name.starts_with('?') {
        return match msvc_demangler::demangle(name, msvc_demangler::DemangleFlags::COMPLETE) {
            Ok(d) if !d.is_empty() => (d, "msvc", true),
            _ => fail("msvc"),
        };
    }
    let swift = ["$s", "$S", "$e", "_$s", "_$S", "_$e", "_T0", "$T"];
    if swift.iter().any(|p| name.starts_with(p)) && name.len() > 3 {
        return fail("swift");
    }
    fail("none")
}

fn itanium_demangle(name: &str) -> Option<String> {
    let try_one = |s: &str| cpp_demangle::Symbol::new(s.as_bytes()).ok().and_then(|sym| sym.demangle().ok());
    try_one(name).or_else(|| {
        // trailing punctuation picked up from text
        let t = name.trim_end_matches(['.', '$']);
        if t.len() != name.len() {
            try_one(t)
        } else {
            None
        }
    })
}

fn candidates() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(concat!(
            r"_{1,3}Z[A-Za-z0-9_$.]{2,}",   // Itanium, Rust legacy
            r"|_{1,2}R[A-Za-z0-9_]{2,}",    // Rust v0
            r"|\?[A-Za-z0-9_?@$]*@[A-Za-z0-9_?@$]*", // MSVC
        ))
        .unwrap()
    })
}

/// Mangled names inside free text; only those that demangle are listed.
pub fn find_in_text(text: &str) -> Vec<Value> {
    let mut out = Vec::new();
    let bytes = text.as_bytes();
    for m in candidates().find_iter(text) {
        let start = m.start();
        // must begin a word: `foo_Z3barv` is not a symbol
        if start > 0 {
            let p = bytes[start - 1];
            if p.is_ascii_alphanumeric() || p == b'_' || (p == b'?' && m.as_str().starts_with('?')) {
                continue;
            }
        }
        let name = m.as_str().trim_end_matches('.');
        if name.len() < 4 {
            continue;
        }
        let (output, scheme, ok) = one(name);
        if ok {
            out.push(json!({ "input": name, "output": output, "scheme": scheme, "ok": true, "offset": start }));
            if out.len() >= MAX_FOUND {
                break;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(name: &str) -> (String, &'static str, bool) {
        one(name)
    }

    #[test]
    fn itanium() {
        assert_eq!(d("_ZN3foo3barEv"), ("foo::bar()".into(), "itanium", true));
        assert_eq!(d("_Z1fi").0, "f(int)");
        assert_eq!(d("_ZNSt6vectorIiSaIiEE9push_backERKi").0, "std::vector<int, std::allocator<int> >::push_back(int const&)");
        assert_eq!(d("__ZN3foo3barEv").0, "foo::bar()"); // macOS
        assert_eq!(d("_ZN3foo3barEv.cold").1, "itanium");
        assert!(d("_ZN3foo3barEv.cold").2);
        assert_eq!(d("_Zgarbage!"), ("_Zgarbage!".into(), "itanium", false));
    }

    #[test]
    fn msvc() {
        assert_eq!(d("?f@@YAHQBH@Z"), ("int __cdecl f(int const * const)".into(), "msvc", true));
        let (o, s, ok) = d("??0Foo@@QEAA@XZ");
        assert!(ok && s == "msvc" && o.contains("Foo::Foo"), "{o}");
        assert!(!d("?not mangled").2);
    }

    #[test]
    fn rust() {
        assert_eq!(d("_ZN4core3fmt9Formatter3pad17h6f4b1e5d1b3c2a10E"), ("core::fmt::Formatter::pad".into(), "rust-legacy", true));
        let (o, s, ok) = d("_RNvCs1234_7mycrate3foo");
        assert!(ok && s == "rust-v0" && o == "mycrate::foo", "{o}");
        assert_eq!(d("_RNCNCNgCs6DXkGYLi8lr_2cc5spawn00B5_"), ("cc::spawn::{closure#0}::{closure#0}".into(), "rust-v0", true));
        assert_eq!(d("_RNvC6_123foo3bar").0, "123foo::bar");
        assert_eq!(d("_Rgarbage").1, "rust-v0");
        assert!(!d("_Rgarbage").2);
    }

    #[test]
    fn others_left_alone() {
        assert_eq!(d("main"), ("main".into(), "none", false));
        assert_eq!(d("$s4main3FooV3baryyF"), ("$s4main3FooV3baryyF".into(), "swift", false));
        assert_eq!(d(""), ("".into(), "none", false));
        let long = format!("_Z{}", "N".repeat(20000));
        assert!(!d(&long).2);
    }

    #[test]
    fn names_and_text_through_json() {
        let r = demangle(&json!({ "names": ["_Z1fi", "plain", "?f@@YAHQBH@Z"] })).unwrap();
        assert_eq!(r[0]["output"], "f(int)");
        assert_eq!(r[1]["scheme"], "none");
        assert_eq!(r[1]["output"], "plain");
        assert_eq!(r[2]["scheme"], "msvc");
        let text = "calls _ZN3foo3barEv and ?f@@YAHQBH@Z, also _ZN4core3fmt9Formatter3pad17h6f4b1e5d1b3c2a10E.\n\
                    not this: my_Z1fi, nor _Zxx; v0 _RNvCs1234_7mycrate3foo end";
        let r = demangle(&json!({ "text": text })).unwrap();
        let got: Vec<(String, String)> = r.as_array().unwrap().iter().map(|v| (v["scheme"].as_str().unwrap().into(), v["output"].as_str().unwrap().into())).collect();
        assert_eq!(
            got,
            vec![
                ("itanium".into(), "foo::bar()".into()),
                ("msvc".into(), "int __cdecl f(int const * const)".into()),
                ("rust-legacy".into(), "core::fmt::Formatter::pad".into()),
                ("rust-v0".into(), "mycrate::foo".into()),
            ]
        );
        assert_eq!(r[0]["offset"], 6);
        assert_eq!(r[0]["input"], "_ZN3foo3barEv");
        assert!(demangle(&json!({})).is_err());
    }
}
