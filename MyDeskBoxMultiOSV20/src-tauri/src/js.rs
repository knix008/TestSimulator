// 자바스크립트와 같은 셈을 하는 작은 도구들. Electron 판과 자리·크기가 한 픽셀도 어긋나지 않게 한다.

use std::time::{SystemTime, UNIX_EPOCH};

// Math.round. 반은 늘 위로 올린다 (-2.5 → -2). Rust 의 round 는 0 에서 멀어지는 쪽이다.
pub fn round(x: f64) -> f64 {
    (x + 0.5).floor()
}

pub fn now_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

// Number.prototype.toString(36)
pub fn base36(mut n: u64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}

// 숫자를 사람이 읽는 꼴로. 1234567 → "1,234,567" (ko-KR, en-US 모두 쉼표다).
pub fn grouped(n: u64) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}

// Number.prototype.toFixed. 반은 위로 올린다.
pub fn to_fixed(n: f64, digits: usize) -> String {
    let f = 10f64.powi(digits as i32);
    format!("{:.*}", digits, ((n * f) + 0.5).floor() / f)
}

// 현지 시각 (년, 월, 일, 시, 분, 초).
pub fn local_parts(ms: f64) -> (i64, u32, u32, u32, u32, u32) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{FILETIME, SYSTEMTIME};
        use windows::Win32::System::Time::{FileTimeToSystemTime, SystemTimeToTzSpecificLocalTime};
        let ticks = ((ms / 1000.0) as i64 + 11_644_473_600) as u64 * 10_000_000 + ((ms % 1000.0) as u64) * 10_000;
        let ft = FILETIME { dwLowDateTime: ticks as u32, dwHighDateTime: (ticks >> 32) as u32 };
        let mut utc = SYSTEMTIME::default();
        let mut local = SYSTEMTIME::default();
        unsafe {
            if FileTimeToSystemTime(&ft, &mut utc).is_ok() && SystemTimeToTzSpecificLocalTime(None, &utc, &mut local).is_ok() {
                return (local.wYear as i64, local.wMonth as u32, local.wDay as u32, local.wHour as u32, local.wMinute as u32, local.wSecond as u32);
            }
        }
    }
    civil((ms / 1000.0).floor() as i64)
}

// 1970 년부터 센 초를 날짜로 (UTC).
fn civil(secs: i64) -> (i64, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d, (rem / 3600) as u32, (rem % 3600 / 60) as u32, (rem % 60) as u32)
}

// Date.prototype.toLocaleString — ko-KR 은 "2026. 10. 16. 오후 3:04:05", en-US 는 "10/16/2026, 3:04:05 PM".
pub fn locale_string(ms: f64, lang: &str) -> String {
    let (y, mo, d, h, mi, s) = local_parts(ms);
    let pm = h >= 12;
    let h12 = if h % 12 == 0 { 12 } else { h % 12 };
    if lang == "en" {
        format!("{mo}/{d}/{y}, {h12}:{mi:02}:{s:02} {}", if pm { "PM" } else { "AM" })
    } else {
        format!("{y}. {mo}. {d}. {} {h12}:{mi:02}:{s:02}", if pm { "오후" } else { "오전" })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounds_like_javascript() {
        assert_eq!(round(2.5), 3.0);
        assert_eq!(round(-2.5), -2.0);
        assert_eq!(round(-2.6), -3.0);
        assert_eq!(base36(35), "z");
        assert_eq!(base36(36), "10");
        assert_eq!(grouped(1234567), "1,234,567");
        assert_eq!(grouped(12), "12");
        assert_eq!(to_fixed(1.25, 1), "1.3");
        assert_eq!(to_fixed(12.4, 0), "12");
        assert_eq!(civil(0), (1970, 1, 1, 0, 0, 0));
        assert_eq!(civil(1_700_000_000), (2023, 11, 14, 22, 13, 20));
    }
}
