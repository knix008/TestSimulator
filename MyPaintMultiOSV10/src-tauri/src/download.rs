//! "Open a web address": the picture is fetched here, where no cross-origin rule applies,
//! and handed to the page as base64 with the same shape the Electron build returned:
//! `{ name, type, url, bytes, base64 }`. Only http and https, at most 256 MB, with
//! progress every 32 KB and a stop button (`cancel`).
use base64::Engine;
use serde::Serialize;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Url;

pub const LIMIT: usize = 256 * 1024 * 1024;
const STEP: usize = 32 * 1024;

#[derive(Debug, Serialize)]
pub struct Downloaded {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    pub bytes: usize,
    pub base64: String,
}

/// The http(s) address in `link`, or the message the page shows.
pub fn parse(link: &str) -> Result<Url, String> {
    let target = Url::parse(link.trim()).map_err(|_| "That is not a web address.".to_string())?;
    if target.scheme() != "http" && target.scheme() != "https" {
        return Err("Only http and https addresses can be downloaded.".into());
    }
    Ok(target)
}

pub fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = |b: u8| (b as char).to_digit(16);
            if let (Some(high), Some(low)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push((high * 16 + low) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn extension_for(content_type: &str) -> Option<&'static str> {
    let kind = content_type.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    Some(match kind.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        "image/x-icon" | "image/vnd.microsoft.icon" => "ico",
        "image/avif" => "avif",
        "image/tiff" => "tif",
        "image/heic" => "heic",
        "image/heif" => "heif",
        "image/jp2" | "image/jpx" => "jp2",
        "application/dicom" => "dcm",
        _ => return None,
    })
}

fn has_extension(name: &str) -> bool {
    match name.rfind('.') {
        Some(at) => {
            let ext = &name[at + 1..];
            (1..=5).contains(&ext.len()) && ext.chars().all(|c| c.is_ascii_alphanumeric())
        }
        None => false,
    }
}

/// A file name for what came back: the last path segment when it has an extension,
/// otherwise that segment (or the host) plus the extension the content type implies.
pub fn name_from_url(target: &Url, content_type: &str) -> String {
    let last = target
        .path_segments()
        .and_then(|segments| segments.filter(|s| !s.is_empty()).last().map(percent_decode))
        .unwrap_or_default();
    if !last.is_empty() && has_extension(&last) {
        return last;
    }
    let host: String = target.host_str().unwrap_or("").chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-').collect();
    let base = if !last.is_empty() {
        last
    } else if !host.is_empty() {
        host
    } else {
        "download".to_string()
    };
    match extension_for(content_type) {
        Some(ext) => format!("{base}.{ext}"),
        None => base,
    }
}

/// Fetches `target`, calling `progress(received, total)` every 32 KB and at the end.
/// `stop` set from another thread ends it with "The download was stopped."
pub fn fetch(target: &Url, stop: &AtomicBool, mut progress: impl FnMut(usize, usize)) -> Result<Downloaded, String> {
    let stopped = || "The download was stopped.".to_string();
    let agent = ureq::AgentBuilder::new().redirects(10).build();
    let response = match agent.get(target.as_str()).call() {
        Ok(response) => response,
        Err(ureq::Error::Status(code, response)) => {
            return Err(format!("The server answered {} {}.", code, response.status_text()).replace(" .", "."));
        }
        Err(error) => {
            if stop.load(Ordering::SeqCst) {
                return Err(stopped());
            }
            return Err(error.to_string());
        }
    };
    let total: usize = response.header("content-length").and_then(|v| v.trim().parse().ok()).unwrap_or(0);
    if total > LIMIT {
        return Err("That file is larger than 256 MB.".into());
    }
    let content_type = response.header("content-type").unwrap_or("").to_string();
    let final_url = Url::parse(response.get_url()).unwrap_or_else(|_| target.clone());
    let mut reader = response.into_reader();
    let mut data: Vec<u8> = Vec::with_capacity(total.min(LIMIT));
    let mut buffer = vec![0u8; 64 * 1024];
    let mut announced = 0usize;
    loop {
        if stop.load(Ordering::SeqCst) {
            return Err(stopped());
        }
        let n = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&buffer[..n]);
        if data.len() > LIMIT {
            return Err("That file is larger than 256 MB.".into());
        }
        if data.len() - announced >= STEP {
            announced = data.len();
            progress(data.len(), total);
        }
    }
    progress(data.len(), total);
    if data.is_empty() {
        return Err("The address gave back an empty file.".into());
    }
    Ok(Downloaded {
        name: name_from_url(&final_url, &content_type),
        kind: content_type,
        url: target.as_str().to_string(),
        bytes: data.len(),
        base64: base64::engine::general_purpose::STANDARD.encode(&data),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(text: &str) -> Url {
        Url::parse(text).unwrap()
    }

    #[test]
    fn only_web_addresses_are_accepted() {
        assert!(parse("https://example.com/a.png").is_ok());
        assert!(parse("  http://example.com/a.png ").is_ok());
        assert_eq!(parse("file:///C:/a.png").unwrap_err(), "Only http and https addresses can be downloaded.");
        assert_eq!(parse("not a url").unwrap_err(), "That is not a web address.");
    }

    #[test]
    fn names_come_from_the_path_or_the_content_type() {
        assert_eq!(name_from_url(&url("https://example.com/pics/cat.png"), "image/png"), "cat.png");
        assert_eq!(name_from_url(&url("https://example.com/pics/%EA%B3%A0%EC%96%91%EC%9D%B4.jpg"), ""), "고양이.jpg");
        assert_eq!(name_from_url(&url("https://example.com/render"), "image/webp; q=1"), "render.webp");
        assert_eq!(name_from_url(&url("https://example.com/"), "image/jpeg"), "example.com.jpg");
        assert_eq!(name_from_url(&url("https://example.com/blob"), "text/html"), "blob");
    }

    #[test]
    fn percent_signs_that_are_not_escapes_stay() {
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("a%20b"), "a b");
        assert_eq!(percent_decode("%zz"), "%zz");
    }
}
