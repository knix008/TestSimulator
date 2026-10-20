// Filesystem helpers behind the renderer's folder panel, recent files and
// "open with" handling. Pure functions over std::fs so they can be unit-tested
// without a window.
use serde::Serialize;
use std::path::{Path, PathBuf};

/// The two document types the app opens: PDFs and .pdfvw workspaces.
const OPENABLE: [&str; 2] = ["pdf", "pdfvw"];

/// True when the last extension is exactly "pdf" (any case). ".pdfvw" and
/// names that merely contain "pdf" do not count.
pub fn is_pdf_name(name: &str) -> bool {
  let n = name.trim();
  match n.rfind('.') {
    Some(i) if i > 0 && i < n.len() - 1 => n[i + 1..].eq_ignore_ascii_case("pdf"),
    _ => false,
  }
}

fn is_openable(path: &Path) -> bool {
  path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| OPENABLE.iter().any(|o| e.eq_ignore_ascii_case(o)))
    .unwrap_or(false)
}

/// The first existing PDF / workspace among command-line arguments. `cwd`
/// resolves relative paths the way the shell that launched us saw them.
pub fn openable_from_args<I, S>(args: I, cwd: &Path) -> Option<PathBuf>
where
  I: IntoIterator<Item = S>,
  S: AsRef<str>,
{
  for raw in args.into_iter().skip(1) {
    let raw = raw.as_ref();
    if raw.is_empty() || raw.starts_with('-') {
      continue;
    }
    let p = Path::new(raw);
    if !is_openable(p) {
      continue;
    }
    let abs = if p.is_absolute() { p.to_path_buf() } else { cwd.join(p) };
    if abs.is_file() {
      return Some(abs);
    }
  }
  None
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Entry {
  pub path: String,
  pub name: String,
  pub kind: &'static str,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub size: Option<u64>,
}

/// One level of a folder: sub-folders first, then PDFs, each sorted by name
/// without regard to case. Hidden (dot) entries and other files are left out.
/// metadata() follows links, so a link to a PDF lists as a PDF.
pub fn read_level(dir: &str) -> Vec<Entry> {
  let root = Path::new(dir);
  if dir.is_empty() || !root.is_dir() {
    return Vec::new();
  }
  let Ok(read) = std::fs::read_dir(root) else { return Vec::new() };
  let mut out = Vec::new();
  for item in read.flatten() {
    let name = item.file_name().to_string_lossy().trim().to_string();
    if name.is_empty() || name.starts_with('.') {
      continue;
    }
    let full = item.path();
    let Ok(meta) = std::fs::metadata(&full) else { continue };
    let path = full.to_string_lossy().to_string();
    if is_pdf_name(&name) && !meta.is_dir() {
      out.push(Entry { path, name, kind: "pdf", size: Some(meta.len()) });
    } else if meta.is_dir() {
      out.push(Entry { path, name, kind: "dir", size: None });
    }
  }
  sort_entries(&mut out);
  out
}

pub fn sort_entries(entries: &mut [Entry]) {
  entries.sort_by(|a, b| {
    let ad = a.kind == "dir";
    let bd = b.kind == "dir";
    bd.cmp(&ad).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
  });
}

#[derive(Debug, Serialize)]
pub struct Drive {
  pub path: String,
  pub name: String,
}

/// Ready volumes for the folder-panel title. A: and B: are skipped because an
/// empty floppy or card reader stalls the existence check for seconds.
pub fn list_drives() -> Vec<Drive> {
  if cfg!(windows) {
    return (b'C'..=b'Z')
      .filter_map(|c| {
        let letter = c as char;
        let root = format!("{letter}:\\");
        Path::new(&root).exists().then(|| Drive { path: root, name: format!("{letter}:") })
      })
      .collect();
  }
  let mut out = vec![Drive { path: "/".into(), name: "/".into() }];
  if cfg!(target_os = "macos") {
    if let Ok(read) = std::fs::read_dir("/Volumes") {
      let mut vols: Vec<Drive> = read
        .flatten()
        .filter_map(|e| {
          let name = e.file_name().to_string_lossy().trim().to_string();
          let full = e.path();
          (!name.is_empty() && !name.starts_with('.') && full.is_dir())
            .then(|| Drive { path: full.to_string_lossy().to_string(), name })
        })
        .collect();
      vols.sort_by(|a, b| a.name.cmp(&b.name));
      out.extend(vols);
    }
  }
  out
}

/// File name for a downloaded document: Content-Disposition first (RFC 5987
/// `filename*=UTF-8''…` or plain `filename="…"`), then the last URL segment.
pub fn download_name(content_disposition: &str, url: &str) -> String {
  let cd = content_disposition;
  let lower = cd.to_ascii_lowercase();
  let pick = |key: &str| -> Option<String> {
    let at = lower.find(key)?;
    let mut v = cd[at + key.len()..].trim_start();
    if let Some(rest) = v.strip_prefix('=') {
      v = rest.trim_start();
    } else {
      return None;
    }
    let v = v.split(';').next().unwrap_or("").trim().trim_matches('"');
    let v = if key == "filename*" {
      let raw = v.rsplit("''").next().unwrap_or(v);
      percent_decode(raw)
    } else {
      v.to_string()
    };
    (!v.is_empty()).then_some(v)
  };
  if let Some(n) = pick("filename*").or_else(|| pick("filename")) {
    return sanitize(&n);
  }
  let path = url.split(['?', '#']).next().unwrap_or("");
  let after_host = path.splitn(4, '/').nth(3).unwrap_or("");
  let last = after_host.rsplit('/').next().unwrap_or("");
  let name = percent_decode(last);
  if name.is_empty() { "download.pdf".into() } else { sanitize(&name) }
}

fn sanitize(name: &str) -> String {
  let base = name.rsplit(['/', '\\']).next().unwrap_or(name).trim();
  if base.is_empty() { "download.pdf".into() } else { base.to_string() }
}

pub fn percent_decode(s: &str) -> String {
  let bytes = s.as_bytes();
  let mut out = Vec::with_capacity(bytes.len());
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'%' && i + 2 < bytes.len() {
      if let Some(v) = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) {
        out.push(v);
        i += 3;
        continue;
      }
    }
    out.push(bytes[i]);
    i += 1;
  }
  String::from_utf8_lossy(&out).to_string()
}

/// Only web pages and mail addresses leave the app; never file: or custom schemes.
pub fn is_external_url(url: &str) -> bool {
  let u = url.trim().to_ascii_lowercase();
  u.starts_with("http://") || u.starts_with("https://") || u.starts_with("mailto:")
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  #[test]
  fn pdf_names() {
    assert!(is_pdf_name("a.pdf"));
    assert!(is_pdf_name("B.PDF"));
    assert!(!is_pdf_name("a.pdfvw"));
    assert!(!is_pdf_name(".pdf"));
    assert!(!is_pdf_name("pdf"));
    assert!(!is_pdf_name("a.pdf.txt"));
  }

  #[test]
  fn finds_openable_argument() {
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("doc.pdf");
    fs::write(&pdf, b"%PDF-1.4").unwrap();
    fs::write(dir.path().join("w.pdfvw"), b"{}").unwrap();
    let args = ["app.exe", "--flag", "missing.pdf", "doc.pdf"];
    assert_eq!(openable_from_args(args, dir.path()), Some(dir.path().join("doc.pdf")));
    let abs = pdf.to_string_lossy().to_string();
    assert_eq!(openable_from_args(["x", abs.as_str()], Path::new("/")), Some(pdf.clone()));
    assert_eq!(openable_from_args(["x", "w.pdfvw"], dir.path()), Some(dir.path().join("w.pdfvw")));
    assert_eq!(openable_from_args(["doc.pdf"], dir.path()), None, "argv[0] is the program");
    assert_eq!(openable_from_args(["x", "notes.txt"], dir.path()), None);
  }

  #[test]
  fn lists_folders_then_pdfs() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir(dir.path().join("zeta")).unwrap();
    fs::create_dir(dir.path().join("Alpha")).unwrap();
    fs::create_dir(dir.path().join(".hidden")).unwrap();
    fs::write(dir.path().join("b.pdf"), b"12345").unwrap();
    fs::write(dir.path().join("A.PDF"), b"1").unwrap();
    fs::write(dir.path().join("notes.txt"), b"x").unwrap();
    fs::write(dir.path().join("w.pdfvw"), b"x").unwrap();
    // Names that only contain "pdf" stay out.
    fs::write(dir.path().join("mypdf.txt"), b"x").unwrap();
    fs::write(dir.path().join("guide.pdfx"), b"x").unwrap();
    let list = read_level(&dir.path().to_string_lossy());
    let names: Vec<_> = list.iter().map(|e| (e.kind, e.name.as_str())).collect();
    assert_eq!(names, vec![("dir", "Alpha"), ("dir", "zeta"), ("pdf", "A.PDF"), ("pdf", "b.pdf")]);
    assert_eq!(list[3].size, Some(5));
    assert!(read_level("").is_empty());
    assert!(read_level(&dir.path().join("nope").to_string_lossy()).is_empty());
  }

  #[test]
  fn drives_are_listed() {
    let d = list_drives();
    assert!(!d.is_empty());
    if cfg!(windows) {
      assert!(d.iter().all(|x| x.path.ends_with(":\\") && x.name.len() == 2));
    } else {
      assert_eq!(d[0].path, "/");
    }
  }

  #[test]
  fn download_names() {
    assert_eq!(download_name("attachment; filename=\"report.pdf\"", "https://x/y"), "report.pdf");
    assert_eq!(download_name("attachment; filename*=UTF-8''%EB%B3%B4%EA%B3%A0.pdf", "https://x/y"), "보고.pdf");
    assert_eq!(download_name("", "https://example.com/files/a%20b.pdf?x=1"), "a b.pdf");
    assert_eq!(download_name("", "https://example.com/"), "download.pdf");
    assert_eq!(download_name("inline; filename=\"../../evil.pdf\"", "https://x/"), "evil.pdf");
  }

  #[test]
  fn external_urls() {
    assert!(is_external_url("https://a.b"));
    assert!(is_external_url("mailto:me@x"));
    assert!(!is_external_url("file:///c:/x"));
    assert!(!is_external_url("javascript:alert(1)"));
  }
}
