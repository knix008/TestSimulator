//! Just enough DER for pe.signatures: the certificates of an Authenticode PKCS#7 SignedData (version, serial, issuer,
//! subject, validity, signature algorithm, SHA-1 thumbprint). No verification, no signer information. Bounds-checked;
//! malformed data gives no certificate, never a panic.
use std::ops::Range;

pub struct Cert {
    pub der: Vec<u8>,
    pub version: i64,
    pub serial: String,
    pub issuer: String,
    pub subject: String,
    pub not_before: Option<i64>,
    pub not_after: Option<i64>,
    pub algorithm: String,
    pub algorithm_oid: String,
}

/// One element at `at` within `b`: (tag, start of the element, content).
fn tlv(b: &[u8], at: usize) -> Option<(u8, usize, Range<usize>)> {
    let tag = *b.get(at)?;
    let first = *b.get(at + 1)?;
    let (len, header) = if first < 0x80 {
        (first as usize, 2)
    } else {
        let n = (first & 0x7F) as usize;
        if n == 0 || n > 4 {
            return None;
        }
        let mut l = 0usize;
        for k in 0..n {
            l = (l << 8) | *b.get(at + 2 + k)? as usize;
        }
        (l, 2 + n)
    };
    let start = at + header;
    let end = start.checked_add(len)?;
    (end <= b.len()).then_some((tag, at, start..end))
}

/// The elements inside a constructed element's content.
fn children(b: &[u8], r: &Range<usize>) -> Vec<(u8, usize, Range<usize>)> {
    let inner = &b[..r.end];
    let mut out = Vec::new();
    let mut at = r.start;
    while at < r.end && out.len() < 4096 {
        let Some(e) = tlv(inner, at) else { break };
        at = e.2.end;
        out.push(e);
    }
    out
}

fn oid(b: &[u8]) -> String {
    let mut parts: Vec<u64> = Vec::new();
    let mut v = 0u64;
    for (i, &x) in b.iter().enumerate() {
        v = (v << 7) | (x & 0x7F) as u64;
        if x & 0x80 == 0 {
            if parts.is_empty() {
                let first = if v < 80 { v / 40 } else { 2 };
                parts.push(first);
                parts.push(v - first * 40);
            } else {
                parts.push(v);
            }
            v = 0;
        }
        if i > 64 {
            break;
        }
    }
    parts.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(".")
}

fn short_name(oid: &str) -> String {
    match oid {
        "2.5.4.3" => "CN",
        "2.5.4.4" => "SN",
        "2.5.4.5" => "serialNumber",
        "2.5.4.6" => "C",
        "2.5.4.7" => "L",
        "2.5.4.8" => "ST",
        "2.5.4.9" => "street",
        "2.5.4.10" => "O",
        "2.5.4.11" => "OU",
        "2.5.4.12" => "title",
        "2.5.4.17" => "postalCode",
        "2.5.4.42" => "GN",
        "1.2.840.113549.1.9.1" => "emailAddress",
        "1.3.6.1.4.1.311.60.2.1.3" => "jurisdictionC",
        "2.5.4.15" => "businessCategory",
        other => return other.to_string(),
    }
    .to_string()
}

fn algorithm_name(oid: &str) -> String {
    match oid {
        "1.2.840.113549.1.1.4" => "md5WithRSAEncryption",
        "1.2.840.113549.1.1.5" => "sha1WithRSAEncryption",
        "1.2.840.113549.1.1.11" => "sha256WithRSAEncryption",
        "1.2.840.113549.1.1.12" => "sha384WithRSAEncryption",
        "1.2.840.113549.1.1.13" => "sha512WithRSAEncryption",
        "1.2.840.113549.1.1.10" => "rsassaPss",
        "1.2.840.10045.4.1" => "ecdsa-with-SHA1",
        "1.2.840.10045.4.3.2" => "ecdsa-with-SHA256",
        "1.2.840.10045.4.3.3" => "ecdsa-with-SHA384",
        "1.2.840.10045.4.3.4" => "ecdsa-with-SHA512",
        "1.2.840.10040.4.3" => "dsaWithSHA1",
        other => return other.to_string(),
    }
    .to_string()
}

/// A Name as OpenSSL's one-line form: /C=US/O=Example/CN=Example.
fn name(b: &[u8], r: &Range<usize>) -> String {
    let mut out = String::new();
    for set in children(b, r) {
        for atv in children(b, &set.2) {
            let parts = children(b, &atv.2);
            if let (Some(k), Some(v)) = (parts.first(), parts.get(1)) {
                out.push('/');
                out.push_str(&short_name(&oid(&b[k.2.clone()])));
                out.push('=');
                out.push_str(&String::from_utf8_lossy(&b[v.2.clone()]));
            }
        }
    }
    out
}

/// Days since 1970-01-01 of a civil date.
fn days(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// UTCTime / GeneralizedTime as seconds since 1970.
fn time(tag: u8, s: &[u8]) -> Option<i64> {
    let digits: Vec<i64> = s.iter().take_while(|c| c.is_ascii_digit()).map(|c| (c - b'0') as i64).collect();
    let num = |i: usize, n: usize| -> Option<i64> { Some(digits.get(i..i + n)?.iter().fold(0, |v, d| v * 10 + d)) };
    let (year, rest) = match tag {
        0x17 => {
            let yy = num(0, 2)?;
            (if yy < 50 { 2000 + yy } else { 1900 + yy }, 2)
        }
        0x18 => (num(0, 4)?, 4),
        _ => return None,
    };
    let (mo, d, h, mi) = (num(rest, 2)?, num(rest + 2, 2)?, num(rest + 4, 2)?, num(rest + 6, 2)?);
    let sec = num(rest + 8, 2).unwrap_or(0);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) {
        return None;
    }
    Some(days(year, mo, d) * 86400 + h * 3600 + mi * 60 + sec)
}

fn cert(b: &[u8], start: usize, content: &Range<usize>) -> Option<Cert> {
    let top = children(b, content);
    let tbs = top.first().filter(|t| t.0 == 0x30)?;
    let alg = top.get(1).and_then(|a| children(b, &a.2).into_iter().next()).filter(|x| x.0 == 6)?;
    let algorithm_oid = oid(&b[alg.2.clone()]);
    let f = children(b, &tbs.2);
    let mut i = 0;
    let mut version = 1;
    if f.first()?.0 == 0xA0 {
        if let Some(v) = children(b, &f[0].2).first() {
            version = b[v.2.clone()].iter().fold(0i64, |a, &x| (a << 8) | x as i64) + 1;
        }
        i = 1;
    }
    let serial = f.get(i).filter(|s| s.0 == 2)?;
    let bytes = &b[serial.2.clone()];
    let skip = bytes.iter().take_while(|&&x| x == 0).count().min(bytes.len().saturating_sub(1));
    let serial = bytes[skip..].iter().map(|x| format!("{x:02x}")).collect::<Vec<_>>().join(":");
    let issuer = name(b, &f.get(i + 2)?.2);
    let validity = children(b, &f.get(i + 3)?.2);
    let subject = name(b, &f.get(i + 4)?.2);
    let t = |k: usize| validity.get(k).and_then(|v| time(v.0, &b[v.2.clone()]));
    Some(Cert {
        der: b[start..content.end].to_vec(),
        version,
        serial,
        issuer,
        subject,
        not_before: t(0),
        not_after: t(1),
        algorithm: algorithm_name(&algorithm_oid),
        algorithm_oid,
    })
}

/// The certificates of a PKCS#7 ContentInfo holding SignedData.
pub fn certificates(b: &[u8]) -> Vec<Cert> {
    let mut out = Vec::new();
    let Some((0x30, _, info)) = tlv(b, 0) else { return out };
    let info = children(b, &info);
    let Some((0xA0, _, explicit)) = info.get(1).cloned() else { return out };
    let Some((0x30, _, signed)) = tlv(&b[..explicit.end], explicit.start) else { return out };
    let Some((_, _, certs)) = children(b, &signed).into_iter().find(|e| e.0 == 0xA0) else { return out };
    for (tag, start, content) in children(b, &certs) {
        if tag == 0x30 && out.len() < 256 {
            if let Some(c) = cert(b, start, &content) {
                out.push(c);
            }
        }
    }
    out
}
