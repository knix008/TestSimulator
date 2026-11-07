// Pictures, video and sound kept beside the minutes instead of inside them: files in the same folder
// as the .mtg, named in the document by file name only. The page shows them through the mtgasset:
// scheme. A file already there is never written over: a new one takes the next free name.
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::http::{header, Request, Response, StatusCode};

/// The same kinds of file the page accepts (src/editor/media.ts).
const MEDIA: &[(&str, &str)] = &[
    ("png", "image/png"), ("apng", "image/apng"), ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("jpe", "image/jpeg"), ("jfif", "image/jpeg"), ("pjpeg", "image/jpeg"), ("pjp", "image/jpeg"),
    ("gif", "image/gif"), ("webp", "image/webp"), ("avif", "image/avif"), ("bmp", "image/bmp"), ("dib", "image/bmp"), ("svg", "image/svg+xml"), ("svgz", "image/svg+xml"), ("ico", "image/x-icon"), ("cur", "image/x-icon"),
    ("mp4", "video/mp4"), ("m4v", "video/mp4"), ("webm", "video/webm"), ("ogv", "video/ogg"), ("mov", "video/quicktime"),
    ("mp3", "audio/mpeg"), ("m4a", "audio/mp4"), ("aac", "audio/aac"), ("wav", "audio/wav"), ("ogg", "audio/ogg"), ("oga", "audio/ogg"), ("opus", "audio/ogg"), ("flac", "audio/flac"),
];

fn mime_of(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_lowercase();
    MEDIA.iter().find(|(known, _)| *known == extension).map(|(_, mime)| *mime)
}

/// A name that stays in its folder and works everywhere, with its kind unchanged.
fn clean_name(name: &str) -> Result<(String, String), String> {
    let name = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let path = Path::new(name);
    if mime_of(path).is_none() {
        return Err(format!("not a media file: {name}"));
    }
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase();
    let stem: String = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .chars()
        .map(|c| if c.is_control() || "<>:\"|?*%#()[]&;".contains(c) { '_' } else { c })
        .take(100)
        .collect();
    let stem = stem.trim().trim_end_matches('.').to_string();
    let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3"].contains(&stem.to_uppercase().as_str());
    Ok((if stem.is_empty() || reserved { format!("media{stem}") } else { stem }, extension))
}

/// Writes under the name, or the first of name-2, name-3 … that is free. Never over an existing file.
fn write_new(dir: &Path, stem: &str, extension: &str, bytes: &[u8]) -> Result<String, String> {
    for number in 1..10_000 {
        let name = if number == 1 { format!("{stem}.{extension}") } else { format!("{stem}-{number}.{extension}") };
        match OpenOptions::new().write(true).create_new(true).open(dir.join(&name)) {
            Ok(mut file) => {
                file.write_all(bytes).map_err(|e| e.to_string())?;
                return Ok(name);
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("no free file name".into())
}

/// Puts a file (base64) in the folder and answers the name it got.
#[tauri::command(async)]
pub fn save_asset(dir: String, name: String, data: String) -> Result<String, String> {
    let (stem, extension) = clean_name(&name)?;
    let bytes = STANDARD.decode(data.trim()).map_err(|e| e.to_string())?;
    write_new(Path::new(&dir), &stem, &extension, &bytes)
}

/// For Save As into another folder: copies a file along and answers its name there. The same file
/// already there is used as it is.
#[tauri::command(async)]
pub fn copy_asset(from: String, to: String, name: String) -> Result<String, String> {
    let (stem, extension) = clean_name(&name)?;
    let plain = Path::new(&name).file_name().ok_or("no file name")?;
    let bytes = std::fs::read(Path::new(&from).join(plain)).map_err(|e| e.to_string())?;
    let target = Path::new(&to).join(plain);
    if std::fs::read(&target).is_ok_and(|there| there == bytes) {
        return Ok(name);
    }
    write_new(Path::new(&to), &stem, &extension, &bytes)
}

/// A file as a data URL, for exports that carry their pictures with them.
#[tauri::command(async)]
pub fn read_asset(dir: String, name: String) -> Result<String, String> {
    let plain = Path::new(&name).file_name().ok_or("no file name")?;
    let path = Path::new(&dir).join(plain);
    let mime = mime_of(&path).ok_or("not a media file")?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(std::fs::read(&path).map_err(|e| e.to_string())?)))
}

fn decode_path(encoded: &str) -> Option<PathBuf> {
    let source = encoded.strip_prefix('/').unwrap_or(encoded).as_bytes();
    let mut bytes = Vec::with_capacity(source.len());
    let mut at = 0;
    while at < source.len() {
        if source[at] == b'%' {
            let hex = std::str::from_utf8(source.get(at + 1..at + 3)?).ok()?;
            bytes.push(u8::from_str_radix(hex, 16).ok()?);
            at += 3;
        } else {
            bytes.push(source[at]);
            at += 1;
        }
    }
    Some(PathBuf::from(String::from_utf8(bytes).ok()?))
}

/// mtgasset://localhost/<the file's whole path, encoded>: media files only.
pub fn serve(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let found = decode_path(request.uri().path()).filter(|path| path.is_absolute()).and_then(|path| Some((mime_of(&path)?, std::fs::read(&path).ok()?)));
    let built = match found {
        Some((mime, bytes)) => Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, mime).header(header::CACHE_CONTROL, "no-store").body(bytes),
        None => Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()),
    };
    built.unwrap_or_else(|_| Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mymeeting-assets-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn names_stay_in_their_folder() {
        assert_eq!(clean_name("..\\..\\photo.PNG").unwrap(), ("photo".into(), "png".into()));
        assert_eq!(clean_name("/etc/a b.jpg").unwrap(), ("a b".into(), "jpg".into()));
        assert_eq!(clean_name("x(1)%.gif").unwrap(), ("x_1__".into(), "gif".into()));
        assert_eq!(clean_name("con.png").unwrap().0, "mediacon");
        assert!(clean_name("run.exe").is_err() && clean_name("minutes.mtg").is_err() && clean_name("noext").is_err());
    }

    #[test]
    fn never_writes_over_a_file() {
        let dir = folder("new");
        assert_eq!(write_new(&dir, "a", "png", b"one").unwrap(), "a.png");
        assert_eq!(write_new(&dir, "a", "png", b"two").unwrap(), "a-2.png");
        assert_eq!(std::fs::read(dir.join("a.png")).unwrap(), b"one");
        assert_eq!(std::fs::read(dir.join("a-2.png")).unwrap(), b"two");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn copies_keep_what_is_there() {
        let (from, to) = (folder("from"), folder("to"));
        std::fs::write(from.join("a.png"), b"mine").unwrap();
        let copy = |name: &str| copy_asset(from.display().to_string(), to.display().to_string(), name.into()).unwrap();
        assert_eq!(copy("a.png"), "a.png");
        assert_eq!(copy("a.png"), "a.png");
        std::fs::write(from.join("a.png"), b"changed").unwrap();
        assert_eq!(copy("a.png"), "a-2.png");
        assert_eq!(std::fs::read(to.join("a.png")).unwrap(), b"mine");
        std::fs::remove_dir_all(from).unwrap();
        std::fs::remove_dir_all(to).unwrap();
    }

    #[test]
    fn serves_only_media_by_whole_path() {
        let dir = folder("serve");
        std::fs::write(dir.join("한 글.png"), b"pic").unwrap();
        std::fs::write(dir.join("secret.txt"), b"no").unwrap();
        let get = |name: &str| {
            let encoded: String = dir.join(name).display().to_string().bytes().map(|b| format!("%{b:02X}")).collect();
            serve(&Request::builder().uri(format!("mtgasset://localhost/{encoded}")).body(Vec::new()).unwrap())
        };
        assert_eq!(get("한 글.png").body(), b"pic");
        assert_eq!(get("secret.txt").status(), StatusCode::NOT_FOUND);
        assert_eq!(get("missing.png").status(), StatusCode::NOT_FOUND);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
