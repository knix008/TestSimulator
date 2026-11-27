//! Dates in Moment.js format (what Obsidian's daily notes and templates use) and template expansion:
//! {{title}} {{date}} {{time}} {{date:YYYY-MM-DD}} {{time:HH:mm}} {{yesterday}} {{tomorrow}}.
//! The UI passes "now" (epoch milliseconds and the local UTC offset): WebAssembly has no clock or time zone.
use chrono::{Datelike, Duration, NaiveDateTime, Timelike};

pub fn local_time(epoch_ms: f64, offset_minutes: i32) -> NaiveDateTime {
    let ms = epoch_ms as i64 + offset_minutes as i64 * 60_000;
    chrono::DateTime::from_timestamp_millis(ms).map(|d| d.naive_utc()).unwrap_or_default()
}

const MONTHS_EN: [&str; 12] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_EN: [&str; 7] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_KO: [&str; 7] = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

/// Formats with Moment tokens: YYYY YY Q MMMM MMM MM M DDDD DD D Do dddd ddd dd d E HH H hh h mm m ss s A a ww w X x Z,
/// and [literal] text.
pub fn format_moment(dt: &NaiveDateTime, fmt: &str, lang: &str, offset_minutes: i32) -> String {
    let ko = lang == "ko";
    let chars: Vec<char> = fmt.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    let tokens = ["YYYY", "YY", "MMMM", "MMM", "MM", "M", "DDDD", "DDD", "Do", "DD", "D", "dddd", "ddd", "dd", "d", "E", "HH", "H", "hh", "h", "mm", "m", "ss", "s", "A", "a", "ww", "w", "Q", "X", "x", "Z"];
    while i < chars.len() {
        if chars[i] == '[' {
            let mut j = i + 1;
            while j < chars.len() && chars[j] != ']' { out.push(chars[j]); j += 1; }
            i = j + 1;
            continue;
        }
        let rest: String = chars[i..].iter().collect();
        let Some(tok) = tokens.iter().find(|t| rest.starts_with(**t)) else { out.push(chars[i]); i += 1; continue };
        let wd = dt.weekday().num_days_from_monday() as usize;
        let h12 = { let h = dt.hour() % 12; if h == 0 { 12 } else { h } };
        let s = match *tok {
            "YYYY" => format!("{:04}", dt.year()),
            "YY" => format!("{:02}", dt.year() % 100),
            "Q" => format!("{}", (dt.month() - 1) / 3 + 1),
            "MMMM" => if ko { format!("{}월", dt.month()) } else { MONTHS_EN[dt.month0() as usize].to_string() },
            "MMM" => if ko { format!("{}월", dt.month()) } else { MONTHS_EN[dt.month0() as usize][..3].to_string() },
            "MM" => format!("{:02}", dt.month()),
            "M" => dt.month().to_string(),
            "DDDD" => format!("{:03}", dt.ordinal()),
            "DDD" => dt.ordinal().to_string(),
            "Do" => if ko { format!("{}일", dt.day()) } else { let d = dt.day(); let suf = match (d % 10, d % 100) { (1, x) if x != 11 => "st", (2, x) if x != 12 => "nd", (3, x) if x != 13 => "rd", _ => "th" }; format!("{d}{suf}") },
            "DD" => format!("{:02}", dt.day()),
            "D" => dt.day().to_string(),
            "dddd" => if ko { DAYS_KO[wd].to_string() } else { DAYS_EN[wd].to_string() },
            "ddd" => if ko { DAYS_KO[wd].chars().next().unwrap().to_string() } else { DAYS_EN[wd][..3].to_string() },
            "dd" => if ko { DAYS_KO[wd].chars().next().unwrap().to_string() } else { DAYS_EN[wd][..2].to_string() },
            "d" => ((wd + 1) % 7).to_string(),
            "E" => (wd + 1).to_string(),
            "HH" => format!("{:02}", dt.hour()),
            "H" => dt.hour().to_string(),
            "hh" => format!("{:02}", h12),
            "h" => h12.to_string(),
            "mm" => format!("{:02}", dt.minute()),
            "m" => dt.minute().to_string(),
            "ss" => format!("{:02}", dt.second()),
            "s" => dt.second().to_string(),
            "A" => if ko { if dt.hour() < 12 { "오전" } else { "오후" }.to_string() } else if dt.hour() < 12 { "AM".into() } else { "PM".into() },
            "a" => if ko { if dt.hour() < 12 { "오전" } else { "오후" }.to_string() } else if dt.hour() < 12 { "am".into() } else { "pm".into() },
            "ww" => format!("{:02}", dt.iso_week().week()),
            "w" => dt.iso_week().week().to_string(),
            "X" => (dt.and_utc().timestamp() - offset_minutes as i64 * 60).to_string(),
            "x" => (dt.and_utc().timestamp_millis() - offset_minutes as i64 * 60_000).to_string(),
            "Z" => { let o = offset_minutes; format!("{}{:02}:{:02}", if o < 0 { '-' } else { '+' }, o.abs() / 60, o.abs() % 60) }
            _ => String::new(),
        };
        out.push_str(&s);
        i += tok.chars().count();
    }
    out
}

/// Expands a template's variables. `title` is the new note's name.
pub fn expand(template: &str, title: &str, now: &NaiveDateTime, lang: &str, offset: i32, date_format: &str, time_format: &str) -> String {
    let re = regex::Regex::new(r"\{\{\s*(\w+)(?::([^}]*))?\s*\}\}").unwrap();
    re.replace_all(template, |c: &regex::Captures| {
        let fmt = c.get(2).map(|m| m.as_str().trim());
        match &c[1].to_lowercase()[..] {
            "title" => title.to_string(),
            "date" => format_moment(now, fmt.unwrap_or(date_format), lang, offset),
            "time" => format_moment(now, fmt.unwrap_or(time_format), lang, offset),
            "yesterday" => format_moment(&(*now - Duration::days(1)), fmt.unwrap_or(date_format), lang, offset),
            "tomorrow" => format_moment(&(*now + Duration::days(1)), fmt.unwrap_or(date_format), lang, offset),
            _ => c[0].to_string(),
        }
    }).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn moment() {
        let dt = chrono::NaiveDate::from_ymd_opt(2026, 11, 27).unwrap().and_hms_opt(14, 5, 9).unwrap();
        assert_eq!(format_moment(&dt, "YYYY-MM-DD", "en", 0), "2026-11-27");
        assert_eq!(format_moment(&dt, "dddd, MMMM Do [at] h:mm A", "en", 0), "Friday, November 27th at 2:05 PM");
        assert_eq!(format_moment(&dt, "YYYY년 M월 D일 dddd", "ko", 0), "2026년 11월 27일 금요일");
        let t = expand("# {{title}}\n{{date}} {{time}} {{date:ww}} {{yesterday}} {{unknown}}", "Note", &dt, "en", 0, "YYYY-MM-DD", "HH:mm");
        assert_eq!(t, "# Note\n2026-11-27 14:05 48 2026-11-26 {{unknown}}");
        assert_eq!(local_time(0.0, 540).format("%H").to_string(), "09");
    }
}
