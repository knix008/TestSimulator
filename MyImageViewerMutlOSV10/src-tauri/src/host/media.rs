// Video / audio through ffmpeg: a playable copy of what the webview cannot decode
// (AVI, WMV, FLV, MPEG-2, TS, 3GP, OGV, AIFF, WMA …) — converted once into a cached MP4
// (H.264 + AAC) or M4A — and the Info panel's media facts, read from ffmpeg's own
// description of the file (duration, streams, codecs, tags).
// ffmpeg: MYIMAGEVIEWER_FFMPEG, then the one the installer brings (runtime/), then the one
// in node_modules/ffmpeg-static (source tree), then the PATH.

use super::{error, file_url, hidden_command, path_key, progress, sha1_hex};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex, OnceLock};

fn ffmpeg() -> PathBuf {
    static PATH: OnceLock<PathBuf> = OnceLock::new();
    PATH.get_or_init(|| {
        let exe = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
        let candidates = [
            std::env::var_os("MYIMAGEVIEWER_FFMPEG").map(PathBuf::from),
            super::runtime_dir().map(|d| d.join(exe)),
            Some(super::project_root().join("node_modules").join("ffmpeg-static").join(exe)),
        ];
        candidates.into_iter().flatten().find(|p| p.is_file()).unwrap_or_else(|| PathBuf::from("ffmpeg"))
    })
    .clone()
}

fn secs(h: &str, m: &str, s: &str) -> f64 {
    h.parse::<f64>().unwrap_or(0.0) * 3600.0 + m.parse::<f64>().unwrap_or(0.0) * 60.0 + s.parse::<f64>().unwrap_or(0.0)
}

/// "Duration: 01:02:03.45" / "time=00:00:12.34" → seconds
fn hms_after(line: &str, tag: &str) -> Option<f64> {
    let rest = &line[line.find(tag)? + tag.len()..];
    let t: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == ':' || *c == '.').collect();
    let mut p = t.split(':');
    let (h, m, s) = (p.next()?, p.next()?, p.next()?);
    Some(secs(h, m, s))
}

static JOBS: Mutex<Option<HashMap<String, Arc<Mutex<()>>>>> = Mutex::new(None);

/// Playable copy of a media file → { path, url } or { error }
pub fn transcode(path: &str, audio_only: bool) -> Value {
    match transcode_file(path, audio_only) {
        Ok(out) => json!({ "path": out.to_string_lossy(), "url": file_url(&out) }),
        Err(e) => error(e),
    }
}

fn transcode_file(path: &str, audio_only: bool) -> Result<PathBuf, String> {
    let st = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let mtime = st.modified().map(super::ms_since_epoch).unwrap_or(0.0).round() as i64;
    let key = sha1_hex(&format!("{}|{}|{mtime}", path_key(path), st.len()));
    let dir = super::user_data_dir().join("MediaCache");
    let out = dir.join(format!("{key}{}", if audio_only { ".m4a" } else { ".mp4" }));
    // One conversion per output: a second request waits for the first and reuses it
    let lock = JOBS.lock().unwrap().get_or_insert_with(HashMap::new).entry(key).or_default().clone();
    let _job = lock.lock().unwrap();
    if std::fs::metadata(&out).map(|m| m.len() > 0).unwrap_or(false) {
        return Ok(out);
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = PathBuf::from(format!("{}.part", out.to_string_lossy()));
    let mut args: Vec<String> = ["-hide_banner", "-nostdin", "-y", "-i", path].map(String::from).to_vec();
    if audio_only {
        args.extend(["-vn", "-c:a", "aac", "-b:a", "192k"].map(String::from));
    } else {
        args.extend(
            [
                "-map", "0:v:0?", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
            ]
            .map(String::from),
        );
    }
    args.extend(["-f".to_string(), (if audio_only { "ipod" } else { "mp4" }).to_string(), tmp.to_string_lossy().into_owned()]);
    let mut child = hidden_command(ffmpeg())
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| if e.kind() == std::io::ErrorKind::NotFound { "ffmpeg not found".to_string() } else { e.to_string() })?;
    // ffmpeg ends its progress lines with \r: read raw chunks and split on both
    let mut stderr = child.stderr.take().unwrap();
    let mut duration = 0.0;
    let mut tail = String::new();
    let mut pending = String::new();
    let mut buf = [0u8; 4096];
    while let Ok(n) = stderr.read(&mut buf) {
        if n == 0 {
            break;
        }
        pending.push_str(&String::from_utf8_lossy(&buf[..n]));
        while let Some(i) = pending.find(['\r', '\n']) {
            let line: String = pending.drain(..=i).collect();
            if let Some(d) = hms_after(&line, "Duration: ") {
                duration = d;
            }
            if let Some(t) = hms_after(&line, "time=") {
                if duration > 0.0 {
                    progress(((t / duration) * 95.0).round().clamp(0.0, 95.0) as u32, "converting");
                }
            }
            if !line.trim().is_empty() {
                tail = line.trim().to_string();
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("ffmpeg failed ({}): {tail}", status.code().unwrap_or(-1)));
    }
    std::fs::rename(&tmp, &out).map_err(|e| e.to_string())?;
    Ok(out)
}

// ── Media facts ──

/// What `ffmpeg -i <file>` prints about the input (it then complains that no output was
/// given, which is expected).
fn probe(path: &str) -> Result<String, String> {
    let out = hidden_command(ffmpeg())
        .args(["-hide_banner", "-nostdin", "-i", path])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| if e.kind() == std::io::ErrorKind::NotFound { "ffmpeg not found".to_string() } else { e.to_string() })?;
    let text = String::from_utf8_lossy(&out.stderr).into_owned();
    if !text.contains("Input #0") {
        let last = text.lines().filter(|l| !l.trim().is_empty()).last().unwrap_or("media meta failed");
        return Err(last.trim().to_string());
    }
    Ok(text)
}

fn pretty_video(codec: &str) -> String {
    match codec {
        "h264" => "H.264 (AVC)".into(),
        "hevc" => "H.265 (HEVC)".into(),
        "vp8" => "VP8".into(),
        "vp9" => "VP9".into(),
        "av1" => "AV1".into(),
        "mpeg4" => "MPEG-4 Part 2".into(),
        "mpeg2video" => "MPEG-2".into(),
        "mpeg1video" => "MPEG-1".into(),
        "theora" => "Theora".into(),
        "mjpeg" => "MJPEG".into(),
        "prores" => "ProRes".into(),
        c if c.starts_with("wmv") => "WMV".into(),
        c => c.to_uppercase(),
    }
}

fn pretty_audio(codec: &str) -> String {
    match codec {
        "aac" => "AAC".into(),
        "mp3" | "mp3float" => "MP3".into(),
        "flac" => "FLAC".into(),
        "opus" => "Opus".into(),
        "vorbis" => "Vorbis".into(),
        "alac" => "ALAC".into(),
        "ac3" => "AC-3".into(),
        "eac3" => "E-AC-3".into(),
        "pcm_f32le" | "pcm_f32be" | "pcm_f64le" | "pcm_f64be" => "IEEE Float".into(),
        c if c.starts_with("pcm_") => "PCM".into(),
        c if c.starts_with("wma") => "WMA".into(),
        c if c.starts_with("adpcm") => "ADPCM".into(),
        c => c.to_uppercase(),
    }
}

fn container_label(formats: &str, ext: &str) -> String {
    let first = formats.split(',').next().unwrap_or("").trim();
    match first {
        "mov" => if ext == "mov" { "QuickTime".into() } else { "MP4".into() },
        "matroska" => if ext == "webm" { "WebM".into() } else { "Matroska".into() },
        "wav" => "WAVE".into(),
        "mp3" => "MPEG".into(),
        "ogg" => "Ogg".into(),
        "flac" => "FLAC".into(),
        "avi" => "AVI".into(),
        "asf" => if ext == "wma" { "WMA".into() } else { "ASF".into() },
        "mpegts" => "MPEG-TS".into(),
        "mpeg" => "MPEG-PS".into(),
        "flv" => "FLV".into(),
        "aiff" => "AIFF".into(),
        "" => ext.to_uppercase(),
        other => other.to_uppercase(),
    }
}

fn first_number_before(text: &str, unit: &str) -> Option<f64> {
    let at = text.find(unit)?;
    let head = text[..at].trim_end();
    let num: String = head.chars().rev().take_while(|c| c.is_ascii_digit() || *c == '.').collect::<Vec<_>>().into_iter().rev().collect();
    num.parse().ok()
}

fn dimensions(text: &str) -> Option<(u32, u32)> {
    // "1920x1080" among the comma separated fields
    text.split([',', ' ']).find_map(|part| {
        let (w, h) = part.trim().split_once('x')?;
        let (w, h) = (w.parse::<u32>().ok()?, h.parse::<u32>().ok()?);
        (w >= 2 && h >= 2).then_some((w, h))
    })
}

fn channel_count(text: &str) -> Option<u32> {
    let fields: Vec<&str> = text.split(',').map(str::trim).collect();
    for f in &fields {
        let n = match *f {
            "mono" => 1,
            "stereo" => 2,
            "2.1" => 3,
            "quad" | "4.0" => 4,
            "5.0" | "5.0(side)" => 5,
            "5.1" | "5.1(side)" => 6,
            "6.1" => 7,
            "7.1" => 8,
            s if s.ends_with(" channels") => s.trim_end_matches(" channels").parse().ok()?,
            _ => continue,
        };
        return Some(n);
    }
    None
}

fn bits_per_sample(codec: &str, text: &str) -> Option<u32> {
    // "(24 bit)" from ffmpeg, else pcm_s16le / s24 / s32 in the codec or sample format
    if let Some(i) = text.find(" bit)") {
        let digits: String = text[..i].chars().rev().take_while(char::is_ascii_digit).collect::<Vec<_>>().into_iter().rev().collect();
        if let Ok(n) = digits.parse() {
            return Some(n);
        }
    }
    let probe = |s: &str| -> Option<u32> {
        ["s8", "u8", "s16", "s24", "s32", "f32", "f64"].iter().find(|k| s.contains(*k)).and_then(|k| k[1..].parse().ok())
    };
    if codec.starts_with("pcm_") {
        return probe(codec);
    }
    if matches!(codec, "flac" | "alac" | "wavpack" | "ape") {
        return text.split(',').map(str::trim).find_map(|f| if f.starts_with('s') || f.starts_with('u') { probe(f) } else { None });
    }
    None
}

/// Audio / video container facts (duration, codecs, size, tags) → { basic, tags, all }
pub fn read_media_meta(path: &str) -> Value {
    if path.is_empty() {
        return Value::Null;
    }
    let ext = super::node_extname(path).trim_start_matches('.').to_lowercase();
    let file_size = std::fs::metadata(path).map(|m| m.len()).ok();
    let text = match probe(path) {
        Ok(t) => t,
        Err(e) => return json!({ "basic": { "error": e }, "tags": {}, "all": {} }),
    };

    let mut container = String::new();
    let mut duration: Option<f64> = None;
    let mut bitrate: Option<f64> = None;
    let mut format_tags: Vec<(String, String)> = Vec::new();
    let (mut width, mut height, mut video_codec, mut frame_rate) = (None, None, None::<String>, None::<f64>);
    let (mut audio_codec, mut audio_raw, mut sample_rate, mut channels, mut bits) = (None::<String>, String::new(), None::<f64>, None, None);
    let mut in_format_meta = false;
    for line in text.lines() {
        let indent = line.len() - line.trim_start().len();
        let t = line.trim();
        if t.starts_with("Input #0, ") {
            container = t["Input #0, ".len()..].split(" from ").next().unwrap_or("").to_string();
            in_format_meta = false;
        } else if indent == 2 && t == "Metadata:" {
            in_format_meta = true;
        } else if indent == 4 && in_format_meta {
            if let Some((k, v)) = t.split_once(':') {
                format_tags.push((k.trim().to_string(), v.trim().to_string()));
            }
        } else if t.starts_with("Duration:") {
            in_format_meta = false;
            duration = hms_after(t, "Duration: ").filter(|d| *d > 0.0);
            if let Some(i) = t.find("bitrate: ") {
                bitrate = first_number_before(&t[i..], " kb/s").map(|k| k * 1000.0);
            }
        } else if t.starts_with("Stream #") {
            in_format_meta = false;
            if let Some(i) = t.find("Video: ") {
                let rest = &t[i + 7..];
                if rest.contains("(attached pic)") || video_codec.is_some() {
                    continue;
                }
                let codec = rest.split([' ', ',']).next().unwrap_or("");
                video_codec = Some(pretty_video(codec));
                if let Some((w, h)) = dimensions(rest) {
                    width = Some(w);
                    height = Some(h);
                }
                frame_rate = first_number_before(rest, " fps");
            } else if let Some(i) = t.find("Audio: ") {
                if audio_codec.is_some() {
                    continue;
                }
                let rest = &t[i + 7..];
                let codec = rest.split([' ', ',']).next().unwrap_or("").to_string();
                audio_codec = Some(pretty_audio(&codec));
                sample_rate = first_number_before(rest, " Hz").filter(|r| *r >= 1000.0);
                channels = channel_count(rest);
                bits = bits_per_sample(&codec, rest);
                audio_raw = codec;
            }
        }
    }

    let has_video = video_codec.is_some() || width.is_some();
    let mut bitrate_estimated = false;
    if bitrate.is_none() {
        if let (Some(d), Some(size)) = (duration, file_size) {
            bitrate = Some(size as f64 * 8.0 / d);
            bitrate_estimated = true;
        }
    }
    let lossless = audio_codec.as_ref().map(|_| {
        audio_raw.starts_with("pcm_") || matches!(audio_raw.as_str(), "flac" | "alac" | "wavpack" | "ape" | "tta" | "mlp" | "truehd")
    });
    let codec = match (&video_codec, &audio_codec) {
        (Some(v), Some(a)) => Some(format!("{v} / {a}")),
        (Some(v), None) => Some(v.clone()),
        (None, Some(a)) => Some(a.clone()),
        _ => None,
    };
    let mut basic = Map::new();
    let mut put = |k: &str, v: Value| {
        if !v.is_null() {
            basic.insert(k.into(), v);
        }
    };
    put("width", json!(width));
    put("height", json!(height));
    put("format", json!(container_label(&container, &ext)));
    put("duration", json!(duration));
    put("bitrate", json!(bitrate));
    put("bitrateEstimated", if bitrate_estimated { json!(true) } else { Value::Null });
    put("sampleRate", json!(sample_rate));
    put("channels", json!(channels));
    put("bitsPerSample", json!(bits));
    put("codec", json!(codec));
    put("videoCodec", json!(video_codec));
    put("audioCodec", json!(audio_codec));
    put("frameRate", json!(frame_rate.filter(|f| *f > 0.0)));
    put("lossless", json!(lossless));
    put("hasAudio", if audio_codec.is_some() { json!(true) } else { Value::Null });
    put("hasVideo", if has_video { json!(true) } else { json!(false) });
    put("mediaKind", json!(if has_video { "video" } else { "audio" }));

    let tag = |names: &[&str]| -> Option<String> {
        format_tags.iter().find(|(k, _)| names.iter().any(|n| k.eq_ignore_ascii_case(n))).map(|(_, v)| v.clone())
    };
    let leading_number = |s: String| -> Value {
        s.split('/').next().and_then(|n| n.trim().parse::<u64>().ok()).map(|n| json!(n)).unwrap_or(json!(s))
    };
    let date = tag(&["date", "creation_time", "year"]);
    let mut tags = Map::new();
    let mut tput = |k: &str, v: Option<Value>| {
        if let Some(v) = v.filter(|v| v.as_str().map(|s| !s.is_empty()).unwrap_or(!v.is_null())) {
            tags.insert(k.into(), v);
        }
    };
    tput("title", tag(&["title"]).map(Value::from));
    tput("artist", tag(&["artist"]).map(Value::from));
    tput("album", tag(&["album"]).map(Value::from));
    tput("albumartist", tag(&["album_artist"]).map(Value::from));
    tput("year", date.as_ref().and_then(|d| d.get(..4)).and_then(|y| y.parse::<u64>().ok()).map(Value::from));
    tput("genre", tag(&["genre"]).map(Value::from));
    tput("comment", tag(&["comment", "description"]).map(Value::from));
    tput("track", tag(&["track"]).map(leading_number));
    tput("disk", tag(&["disc"]).map(leading_number));
    tput("composer", tag(&["composer"]).map(Value::from));
    tput("copyright", tag(&["copyright"]).map(Value::from));
    tput("encoder", tag(&["encoded_by", "encoder"]).map(Value::from));
    tput("date", date.map(Value::from));
    let mut all = tags.clone();
    for (k, v) in &format_tags {
        if !v.is_empty() && !all.contains_key(k) {
            all.insert(k.clone(), json!(v));
        }
    }
    json!({ "basic": basic, "tags": tags, "all": all })
}
