//! What the broadcasting engine needs from the operating system:
//!
//! * recording files written at any position (the MP4 muxer goes back to its header), sent over raw IPC;
//! * FFmpeg: found (settings, next to the app, PATH, the usual install folders), run as the stream's
//!   transport (Matroska on stdin → RTMP · RTMPS · SRT · RIST · HLS…), for remuxing recordings and for
//!   embedding chapters;
//! * system numbers for the Stats window (CPU, memory, free disk space);
//! * the title of the window in front (the automatic scene switcher).
use serde::Serialize;
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn files() -> &'static Mutex<HashMap<u32, File>> {
    static FILES: OnceLock<Mutex<HashMap<u32, File>>> = OnceLock::new();
    FILES.get_or_init(|| Mutex::new(HashMap::new()))
}

struct Stream {
    child: Child,
    sender: Option<SyncSender<Vec<u8>>>,
}

fn streams() -> &'static Mutex<HashMap<u32, Stream>> {
    static STREAMS: OnceLock<Mutex<HashMap<u32, Stream>>> = OnceLock::new();
    STREAMS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_id() -> u32 {
    static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
    NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
}

// ───────────────────────── recording files

/// Opens (creates, replacing) a recording file; parent folders are made. Returns its handle.
pub fn open_file(path: &Path) -> Result<u32, String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let file = OpenOptions::new().create(true).write(true).truncate(true).read(true).open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let id = next_id();
    files().lock().unwrap().insert(id, file);
    Ok(id)
}

/// Writes `data` at `position` (the muxer writes in order, and once more at the start when it finishes).
pub fn write_at(id: u32, position: u64, data: &[u8]) -> Result<(), String> {
    let mut map = files().lock().unwrap();
    let file = map.get_mut(&id).ok_or("recording file is not open")?;
    file.seek(SeekFrom::Start(position)).map_err(|e| e.to_string())?;
    file.write_all(data).map_err(|e| e.to_string())
}

pub fn close_file(id: u32) -> Result<(), String> {
    if let Some(mut file) = files().lock().unwrap().remove(&id) {
        file.flush().map_err(|e| e.to_string())?;
        file.sync_all().ok();
    }
    Ok(())
}

/// Names in a folder (an empty list when it does not exist): the recording names avoid them.
pub fn list_names(dir: &Path) -> Vec<String> {
    std::fs::read_dir(dir).map(|it| it.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect()).unwrap_or_default()
}

// ───────────────────────── FFmpeg

#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegInfo {
    pub path: String,
    pub version: String,
}

fn exe(name: &str) -> String {
    if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }
}

/// Places FFmpeg is looked for, in order.
pub fn ffmpeg_candidates(custom: Option<&str>, app_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(c) = custom.filter(|c| !c.trim().is_empty()) {
        let p = PathBuf::from(c.trim());
        out.push(if p.is_dir() { p.join(exe("ffmpeg")) } else { p });
    }
    if let Some(dir) = app_dir {
        out.push(dir.join(exe("ffmpeg")));
        out.push(dir.join("ffmpeg").join("bin").join(exe("ffmpeg")));
    }
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            out.push(dir.join(exe("ffmpeg")));
        }
    }
    if cfg!(windows) {
        for base in [std::env::var("ProgramFiles").ok(), std::env::var("LOCALAPPDATA").ok().map(|l| format!("{l}\\Programs"))].into_iter().flatten() {
            out.push(PathBuf::from(&base).join("ffmpeg").join("bin").join("ffmpeg.exe"));
        }
        out.push(PathBuf::from("C:\\ffmpeg\\bin\\ffmpeg.exe"));
    } else {
        for p in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg", "/snap/bin/ffmpeg"] {
            out.push(PathBuf::from(p));
        }
    }
    out
}

fn command(path: &Path) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(path);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// The first FFmpeg that answers `-version`.
pub fn find_ffmpeg(custom: Option<&str>, app_dir: Option<&Path>) -> Option<FfmpegInfo> {
    for candidate in ffmpeg_candidates(custom, app_dir) {
        if !candidate.is_file() {
            continue;
        }
        if let Ok(out) = command(&candidate).arg("-hide_banner").arg("-version").stdin(Stdio::null()).output() {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                let version = text.lines().next().unwrap_or("").replace("ffmpeg version ", "").split_whitespace().next().unwrap_or("").to_string();
                return Some(FfmpegInfo { path: candidate.to_string_lossy().into_owned(), version });
            }
        }
    }
    None
}

/// The FFmpeg arguments that send a Matroska stream on stdin to `url` (copying the video, AAC audio for FLV).
pub fn stream_args(url: &str, audio_codec: &str) -> Vec<String> {
    let lower = url.to_ascii_lowercase();
    let (format, audio): (&str, Vec<&str>) = if lower.starts_with("srt://") || lower.starts_with("rist://") || lower.starts_with("udp://") {
        ("mpegts", vec!["-c:a", "copy"])
    } else if lower.ends_with(".m3u8") {
        ("hls", vec!["-c:a", "copy"])
    } else if lower.starts_with("rtmp://") || lower.starts_with("rtmps://") {
        ("flv", if audio_codec == "aac" { vec!["-c:a", "copy"] } else { vec!["-c:a", "aac", "-b:a", "160k"] })
    } else {
        ("flv", vec!["-c:a", "aac", "-b:a", "160k"])
    };
    let mut args: Vec<String> = ["-hide_banner", "-loglevel", "warning", "-stats_period", "1", "-progress", "pipe:2", "-fflags", "+genpts+nobuffer", "-f", "matroska", "-i", "pipe:0", "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "copy"].iter().map(|s| s.to_string()).collect();
    args.extend(audio.iter().map(|s| s.to_string()));
    if format == "flv" {
        args.extend(["-flvflags", "no_duration_filesize"].iter().map(|s| s.to_string()));
    }
    args.extend(["-f".to_string(), format.to_string(), url.to_string()]);
    args
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamLog {
    id: u32,
    line: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamExit {
    id: u32,
    code: Option<i32>,
}

/// Starts FFmpeg with these arguments and a writer thread for its stdin. Its messages arrive as
/// `ffmpeg-log` events, its end as `ffmpeg-exit`.
pub fn start_stream(app: Option<AppHandle>, ffmpeg: &Path, args: &[String]) -> Result<u32, String> {
    let mut child = command(ffmpeg).args(args).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped()).spawn().map_err(|e| format!("FFmpeg: {e}"))?;
    let id = next_id();
    let stdin: ChildStdin = child.stdin.take().ok_or("no stdin")?;
    // Up to ~4 s of packets wait here; beyond that the engine drops frames (backpressure).
    let (sender, receiver) = sync_channel::<Vec<u8>>(512);
    std::thread::spawn(move || {
        let mut stdin = stdin;
        while let Ok(chunk) = receiver.recv() {
            if stdin.write_all(&chunk).is_err() {
                break;
            }
        }
        let _ = stdin.flush();
    });
    if let Some(stderr) = child.stderr.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Some(app) = &app2 {
                    let _ = app.emit("ffmpeg-log", StreamLog { id, line });
                }
            }
            if let Some(app) = &app2 {
                let code = streams().lock().unwrap().get_mut(&id).and_then(|s| s.child.wait().ok()).and_then(|s| s.code());
                let _ = app.emit("ffmpeg-exit", StreamExit { id, code });
            }
        });
    }
    streams().lock().unwrap().insert(id, Stream { child, sender: Some(sender) });
    Ok(id)
}

/// Queues bytes for FFmpeg's stdin. "backpressure": the queue is full (the network does not keep up).
pub fn write_stream(id: u32, data: Vec<u8>) -> Result<(), String> {
    let map = streams().lock().unwrap();
    let stream = map.get(&id).ok_or("stream ended")?;
    let sender = stream.sender.as_ref().ok_or("stream closing")?;
    match sender.try_send(data) {
        Ok(()) => Ok(()),
        Err(TrySendError::Full(_)) => Err("backpressure".into()),
        Err(TrySendError::Disconnected(_)) => Err("stream ended".into()),
    }
}

/// Closes stdin (FFmpeg finishes the stream) and waits a little for it; then stops it.
pub fn stop_stream(id: u32) {
    let stream = streams().lock().unwrap().remove(&id);
    if let Some(mut stream) = stream {
        stream.sender.take();
        for _ in 0..30 {
            if let Ok(Some(_)) = stream.child.try_wait() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let _ = stream.child.kill();
        let _ = stream.child.wait();
    }
}

/// FFmpeg arguments of a remux: every stream copied; chapters from an FFmetadata file when given.
pub fn remux_args(input: &str, output: &str, metadata: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = vec!["-hide_banner".into(), "-loglevel".into(), "error".into(), "-y".into(), "-i".into(), input.into()];
    if let Some(meta) = metadata {
        args.extend(["-i".into(), meta.into(), "-map_metadata".into(), "1".into(), "-map_chapters".into(), "1".into()]);
    }
    args.extend(["-map".into(), "0".into(), "-c".into(), "copy".into()]);
    let lower = output.to_ascii_lowercase();
    if lower.ends_with(".mp4") || lower.ends_with(".mov") {
        args.extend(["-movflags".into(), "+faststart".into()]);
    }
    args.push(output.into());
    args
}

pub fn remux(ffmpeg: &Path, input: &str, output: &str, metadata: Option<&str>) -> Result<(), String> {
    let out = command(ffmpeg).args(remux_args(input, output, metadata)).stdin(Stdio::null()).output().map_err(|e| format!("FFmpeg: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or("remux failed").to_string())
    }
}

// ───────────────────────── system numbers

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu: f32,
    pub app_cpu: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub app_memory: u64,
    pub disk_free: u64,
    pub disk_total: u64,
}

fn system() -> &'static Mutex<sysinfo::System> {
    static SYS: OnceLock<Mutex<sysinfo::System>> = OnceLock::new();
    SYS.get_or_init(|| Mutex::new(sysinfo::System::new()))
}

pub fn system_stats(disk_path: Option<&Path>) -> SystemStats {
    let mut sys = system().lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let pid = sysinfo::Pid::from_u32(std::process::id());
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
    let (app_cpu, app_memory) = sys.process(pid).map(|p| (p.cpu_usage() / sys.cpus().len().max(1) as f32, p.memory())).unwrap_or((0.0, 0));
    let mut stats = SystemStats { cpu: sys.global_cpu_usage(), app_cpu, memory_used: sys.used_memory(), memory_total: sys.total_memory(), app_memory, ..Default::default() };
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let target = disk_path.map(|p| p.to_path_buf()).unwrap_or_else(std::env::temp_dir);
    // The disk holding the recording folder: the longest mount point that is a prefix of it.
    let best = disks.list().iter().filter(|d| target.starts_with(d.mount_point())).max_by_key(|d| d.mount_point().as_os_str().len());
    if let Some(d) = best {
        stats.disk_free = d.available_space();
        stats.disk_total = d.total_space();
    }
    stats
}

/// The title of the window in front (empty where the platform does not tell).
pub fn foreground_title() -> String {
    #[cfg(windows)]
    {
        #[link(name = "user32")]
        extern "system" {
            fn GetForegroundWindow() -> *mut std::ffi::c_void;
            fn GetWindowTextW(hwnd: *mut std::ffi::c_void, text: *mut u16, max: i32) -> i32;
        }
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return String::new();
            }
            let mut buf = [0u16; 512];
            let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            return String::from_utf16_lossy(&buf[..n.max(0) as usize]);
        }
    }
    #[allow(unreachable_code)]
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_are_written_at_positions() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub").join("a.mp4");
        let id = open_file(&path).unwrap();
        write_at(id, 0, b"hello world").unwrap();
        write_at(id, 6, b"WORLD").unwrap();
        write_at(id, 11, b"!").unwrap();
        close_file(id).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"hello WORLD!");
        assert!(write_at(id, 0, b"x").is_err());
        assert!(list_names(&dir.path().join("sub")).contains(&"a.mp4".to_string()));
        assert!(list_names(&dir.path().join("none")).is_empty());
    }

    #[test]
    fn stream_args_choose_the_container() {
        let flv = stream_args("rtmp://live.twitch.tv/app/key", "aac");
        assert!(flv.windows(2).any(|w| w == ["-f", "flv"]));
        assert!(flv.windows(2).any(|w| w == ["-c:a", "copy"]));
        let opus = stream_args("rtmps://a.rtmp.youtube.com/live2/key", "opus");
        assert!(opus.windows(2).any(|w| w == ["-c:a", "aac"]));
        let srt = stream_args("srt://example.com:9000?streamid=x", "opus");
        assert!(srt.windows(2).any(|w| w == ["-f", "mpegts"]));
        assert_eq!(srt.last().unwrap(), "srt://example.com:9000?streamid=x");
        let hls = stream_args("C:/out/live.m3u8", "aac");
        assert!(hls.windows(2).any(|w| w == ["-f", "hls"]));
    }

    #[test]
    fn remux_args_copy_and_add_chapters() {
        let plain = remux_args("in.mkv", "out.mp4", None);
        assert!(plain.windows(2).any(|w| w == ["-c", "copy"]));
        assert!(plain.contains(&"+faststart".to_string()));
        let chapters = remux_args("in.mkv", "out.mkv", Some("meta.txt"));
        assert!(chapters.windows(2).any(|w| w == ["-map_chapters", "1"]));
        assert!(!chapters.contains(&"+faststart".to_string()));
    }

    #[test]
    fn ffmpeg_candidates_start_with_the_setting() {
        let list = ffmpeg_candidates(Some("X:/tools/ffmpeg.exe"), Some(Path::new("Y:/app")));
        assert_eq!(list[0], PathBuf::from("X:/tools/ffmpeg.exe"));
        assert!(list[1].starts_with("Y:/app"));
        assert!(find_ffmpeg(Some("Z:/nowhere/ffmpeg.exe"), None).map_or(true, |f| !f.path.starts_with("Z:")));
    }

    #[test]
    fn system_stats_report_memory() {
        let s = system_stats(None);
        assert!(s.memory_total > 0);
        assert!(s.memory_used <= s.memory_total);
    }

    #[test]
    fn a_stream_child_receives_stdin_and_exits() {
        // A real FFmpeg when one is installed: null muxer, no network.
        let Some(ff) = find_ffmpeg(None, None) else { return };
        let id = start_stream(None, Path::new(&ff.path), &["-hide_banner".into(), "-f".into(), "lavfi".into(), "-i".into(), "anullsrc".into(), "-t".into(), "0.1".into(), "-f".into(), "null".into(), "-".into()]).unwrap();
        let _ = write_stream(id, vec![0u8; 16]);
        stop_stream(id);
        assert!(write_stream(id, vec![1]).is_err());
    }
}
