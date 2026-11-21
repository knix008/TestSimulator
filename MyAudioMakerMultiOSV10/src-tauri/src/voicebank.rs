//! AI singing voice banks (DiffSinger, OpenUtau layout) and vocoders, kept in
//! `<app data>/voicebanks/<id>/`. Downloads run on a thread of their own (they go on when
//! the settings window closes), resume from a `.part` file, are checked (size and SHA-256
//! when known) and unpacked — also a bank zipped inside the downloaded zip, as TIGER ships.
//! Progress goes to every window as the `voicebank-progress` event. The page reads model
//! files through the asset protocol (`convertFileSrc`), small files through `voicebank_read`.
use crate::tr;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const EVENT: &str = "voicebank-progress";
const META: &str = ".myaudiomaker.json";
const CHUNK: usize = 256 * 1024;

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub id: String,
    pub kind: String,
    /// queued · download · verify · unzip · ready · error · cancelled
    pub phase: String,
    pub done: u64,
    pub total: u64,
    /// Bytes per second while downloading.
    pub speed: f64,
    pub file: String,
    pub error: String,
    pub code: String,
}

struct Job {
    cancel: Arc<AtomicBool>,
    last: Progress,
}

fn jobs() -> &'static Mutex<HashMap<String, Job>> {
    static JOBS: OnceLock<Mutex<HashMap<String, Job>>> = OnceLock::new();
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock_jobs() -> std::sync::MutexGuard<'static, HashMap<String, Job>> {
    jobs().lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// An error with a code the page translates (`network`, `checksum`, `size`, `notBank`, `cancelled`, …).
struct Failure {
    code: &'static str,
    message: String,
}

impl Failure {
    fn new(code: &'static str, message: String) -> Self {
        Failure { code, message }
    }
}

fn io(code: &'static str) -> impl Fn(std::io::Error) -> Failure {
    move |error| Failure::new(code, error.to_string())
}

/// `<app data>/voicebanks`, created, and readable through the asset protocol.
pub fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let base = match std::env::var_os("MYAUDIOMAKER_DATA_DIR") {
        Some(dir) => PathBuf::from(dir),
        None => app
            .path()
            .app_data_dir()
            .map_err(|error| tr!("데이터 폴더를 찾을 수 없습니다: {error}", "The data folder was not found: {error}"))?,
    };
    let dir = base.join("voicebanks");
    fs::create_dir_all(&dir).map_err(|error| tr!("음성 뱅크 폴더를 만들 수 없습니다: {error}", "Could not create the voice bank folder: {error}"))?;
    let _ = app.asset_protocol_scope().allow_directory(&dir, true);
    Ok(dir)
}

/// Ids are folder names: letters, digits, '.', '_' and '-'.
fn check_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty() && id.len() <= 80 && !id.starts_with('.') && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if ok { Ok(()) } else { Err(tr!("잘못된 음성 뱅크 이름입니다: {id}", "Invalid voice bank id: {id}")) }
}

/// A path inside a bank, refusing `..` and absolute parts.
fn inside(dir: &Path, relative: &str) -> Result<PathBuf, String> {
    let mut out = dir.to_path_buf();
    for part in relative.split(['/', '\\']) {
        match part {
            "" | "." => {}
            ".." => return Err(tr!("잘못된 경로입니다: {relative}", "Invalid path: {relative}")),
            p if p.contains(':') => return Err(tr!("잘못된 경로입니다: {relative}", "Invalid path: {relative}")),
            p => out.push(p),
        }
    }
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    path: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BankEntry {
    id: String,
    dir: String,
    files: Vec<FileEntry>,
    meta: Option<serde_json::Value>,
}

fn walk(dir: &Path, prefix: &str, out: &mut Vec<FileEntry>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if prefix.is_empty() && name == META {
            continue;
        }
        let rel = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() {
            walk(&entry.path(), &rel, out);
        } else if kind.is_file() {
            out.push(FileEntry { path: rel, size: entry.metadata().map(|m| m.len()).unwrap_or(0) });
        }
    }
}

/// Installed banks and vocoders with their files and the page's metadata.
#[tauri::command]
pub async fn voicebank_list(app: AppHandle) -> Result<Vec<BankEntry>, String> {
    let dir = root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let id = entry.file_name().to_string_lossy().to_string();
                if id.starts_with('.') || !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }
                let mut files = Vec::new();
                walk(&entry.path(), "", &mut files);
                let meta = fs::read_to_string(entry.path().join(META)).ok().and_then(|text| serde_json::from_str(&text).ok());
                out.push(BankEntry { id, dir: entry.path().to_string_lossy().to_string(), files, meta });
            }
        }
        out.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(out)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// The voice bank folder (for the asset protocol URLs the page builds).
#[tauri::command]
pub fn voicebank_root(app: AppHandle) -> Result<String, String> {
    Ok(root(&app)?.to_string_lossy().to_string())
}

/// Stores the page's metadata of a bank (licence accepted, catalog id, version …).
#[tauri::command]
pub fn voicebank_write_meta(app: AppHandle, id: String, meta: serde_json::Value) -> Result<(), String> {
    check_id(&id)?;
    let dir = root(&app)?.join(&id);
    if !dir.is_dir() {
        return Err(tr!("음성 뱅크가 없습니다: {id}", "The voice bank is not installed: {id}"));
    }
    let text = serde_json::to_string_pretty(&meta).map_err(|error| error.to_string())?;
    fs::write(dir.join(META), text).map_err(|error| tr!("저장하지 못했습니다: {error}", "Could not save: {error}"))
}

/// Removes an installed bank (and a half-downloaded file of it).
#[tauri::command]
pub async fn voicebank_remove(app: AppHandle, id: String) -> Result<(), String> {
    check_id(&id)?;
    if lock_jobs().get(&id).map(|job| !job.cancel.load(Ordering::Relaxed) && is_running(&job.last)).unwrap_or(false) {
        return Err(tr!("내려받는 중에는 지울 수 없습니다.", "It cannot be removed while it downloads."));
    }
    let dir = root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _ = fs::remove_file(dir.join(".downloads").join(format!("{id}.part")));
        let target = dir.join(&id);
        if target.exists() {
            fs::remove_dir_all(&target).map_err(|error| tr!("지우지 못했습니다: {error}", "Could not remove it: {error}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// One file of a bank as raw bytes (small files: YAML, licence texts, embeddings).
#[tauri::command]
pub async fn voicebank_read(app: AppHandle, id: String, path: String) -> Result<tauri::ipc::Response, String> {
    check_id(&id)?;
    let file = inside(&root(&app)?.join(&id), &path)?;
    let bytes = tauri::async_runtime::spawn_blocking(move || fs::read(&file).map_err(|error| tr!("파일을 읽을 수 없습니다 ({path}): {error}", "Could not read the file ({path}): {error}")))
        .await
        .map_err(|error| error.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

fn is_running(p: &Progress) -> bool {
    matches!(p.phase.as_str(), "queued" | "download" | "verify" | "unzip")
}

/// The state of every download or import started since the app opened.
#[tauri::command]
pub fn voicebank_jobs() -> Vec<Progress> {
    lock_jobs().values().map(|job| job.last.clone()).collect()
}

/// Stops a download (the part already fetched is kept, so the next start resumes).
#[tauri::command]
pub fn voicebank_cancel(id: String) {
    if let Some(job) = lock_jobs().get(&id) {
        job.cancel.store(true, Ordering::Relaxed);
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJob {
    id: String,
    /// "bank" or "vocoder": what the archive must contain.
    kind: String,
    url: String,
    size: Option<u64>,
    sha256: Option<String>,
    /// Start again: forget the part already fetched and the installed copy.
    #[serde(default)]
    fresh: bool,
}

struct Reporter {
    app: AppHandle,
    progress: Progress,
    last_emit: Instant,
}

impl Reporter {
    fn new(app: &AppHandle, id: &str, kind: &str) -> Self {
        Reporter { app: app.clone(), progress: Progress { id: id.into(), kind: kind.into(), phase: "queued".into(), ..Default::default() }, last_emit: Instant::now() - Duration::from_secs(1) }
    }

    fn set(&mut self, phase: &str, done: u64, total: u64, file: &str) {
        let changed = self.progress.phase != phase;
        self.progress.phase = phase.into();
        self.progress.done = done;
        self.progress.total = total;
        self.progress.file = file.into();
        if changed || done == total || self.last_emit.elapsed() >= Duration::from_millis(100) {
            self.emit();
        }
    }

    fn emit(&mut self) {
        self.last_emit = Instant::now();
        if let Some(job) = lock_jobs().get_mut(&self.progress.id) {
            job.last = self.progress.clone();
        }
        let _ = self.app.emit(EVENT, self.progress.clone());
    }
}

/// Starts a download in the background; progress arrives as `voicebank-progress` events.
#[tauri::command]
pub fn voicebank_download(app: AppHandle, job: DownloadJob) -> Result<(), String> {
    check_id(&job.id)?;
    if !job.url.starts_with("https://github.com/") {
        return Err(tr!("허용되지 않은 주소입니다: {}", "This address is not allowed: {}", job.url));
    }
    let dir = root(&app)?;
    let cancel = start_job(&job.id, &job.kind)?;
    std::thread::spawn(move || {
        let mut reporter = Reporter::new(&app, &job.id, &job.kind);
        reporter.emit();
        let result = download(&dir, &job, &cancel, &mut reporter).and_then(|part| {
            install(&dir, &part, &job.id, &job.kind, &cancel, &mut reporter)?;
            let _ = fs::remove_file(&part);
            Ok(())
        });
        finish(&mut reporter, result, &cancel);
    });
    Ok(())
}

/// Installs a voice bank or vocoder from a zip file the user chose (in the background).
#[tauri::command]
pub fn voicebank_import(app: AppHandle, id: String, kind: String, path: PathBuf) -> Result<(), String> {
    check_id(&id)?;
    let dir = root(&app)?;
    if !path.is_file() {
        return Err(tr!("파일이 없습니다: {}", "The file does not exist: {}", path.display()));
    }
    let cancel = start_job(&id, &kind)?;
    std::thread::spawn(move || {
        let mut reporter = Reporter::new(&app, &id, &kind);
        reporter.emit();
        let result = install(&dir, &path, &id, &kind, &cancel, &mut reporter);
        finish(&mut reporter, result, &cancel);
    });
    Ok(())
}

fn start_job(id: &str, kind: &str) -> Result<Arc<AtomicBool>, String> {
    let mut all = lock_jobs();
    if all.get(id).map(|job| is_running(&job.last)).unwrap_or(false) {
        return Err(tr!("이미 진행 중입니다.", "It is already in progress."));
    }
    let cancel = Arc::new(AtomicBool::new(false));
    all.insert(id.into(), Job { cancel: cancel.clone(), last: Progress { id: id.into(), kind: kind.into(), phase: "queued".into(), ..Default::default() } });
    Ok(cancel)
}

fn finish(reporter: &mut Reporter, result: Result<(), Failure>, cancel: &AtomicBool) {
    match result {
        Ok(()) => {
            let total = reporter.progress.total;
            reporter.progress.speed = 0.0;
            reporter.set("ready", total, total, "");
        }
        Err(failure) => {
            let cancelled = failure.code == "cancelled" || cancel.load(Ordering::Relaxed);
            reporter.progress.code = if cancelled { "cancelled".into() } else { failure.code.into() };
            reporter.progress.error = failure.message;
            reporter.progress.speed = 0.0;
            let (done, total) = (reporter.progress.done, reporter.progress.total);
            reporter.set(if cancelled { "cancelled" } else { "error" }, done, total, "");
        }
    }
}

fn cancelled(cancel: &AtomicBool) -> Result<(), Failure> {
    if cancel.load(Ordering::Relaxed) { Err(Failure::new("cancelled", tr!("취소했습니다.", "Cancelled."))) } else { Ok(()) }
}

/// Fetches the file into `.downloads/<id>.part`, resuming what is already there, and checks it.
fn download(dir: &Path, job: &DownloadJob, cancel: &AtomicBool, reporter: &mut Reporter) -> Result<PathBuf, Failure> {
    let downloads = dir.join(".downloads");
    fs::create_dir_all(&downloads).map_err(io("disk"))?;
    let part = downloads.join(format!("{}.part", job.id));
    if job.fresh {
        let _ = fs::remove_file(&part);
        let installed = dir.join(&job.id);
        if installed.exists() {
            fs::remove_dir_all(&installed).map_err(io("disk"))?;
        }
    }
    let mut have = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    if let Some(size) = job.size {
        if have > size {
            let _ = fs::remove_file(&part);
            have = 0;
        }
    }
    let name = job.url.rsplit('/').next().unwrap_or("").to_string();
    if job.size.map(|size| size == 0 || have < size).unwrap_or(true) {
        let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(20)).timeout_read(Duration::from_secs(60)).redirects(8).build();
        let mut request = agent.get(&job.url).set("User-Agent", "MyAudioMaker-voicebank");
        if have > 0 {
            request = request.set("Range", &format!("bytes={have}-"));
        }
        let response = match request.call() {
            Ok(response) => response,
            Err(ureq::Error::Status(416, _)) if have > 0 => {
                // Nothing left to fetch, or a stale part: check what we have below.
                return finish_download(&part, job, have, reporter).map(|_| part);
            }
            Err(ureq::Error::Status(code, _)) => return Err(Failure::new("network", tr!("서버가 {code} 오류를 돌려주었습니다.", "The server answered with error {code}."))),
            Err(error) => return Err(Failure::new("network", error.to_string())),
        };
        let resumed = response.status() == 206;
        if !resumed {
            have = 0;
        }
        let length: Option<u64> = response.header("Content-Length").and_then(|v| v.parse().ok());
        let total = job.size.or(length.map(|l| l + have)).unwrap_or(0);
        let mut file = OpenOptions::new().create(true).write(true).truncate(!resumed).open(&part).map_err(io("disk"))?;
        if resumed {
            file.seek(SeekFrom::End(0)).map_err(io("disk"))?;
        }
        let mut reader = response.into_reader();
        let mut buffer = vec![0u8; CHUNK];
        let mut done = have;
        let started = Instant::now();
        let mut window = (Instant::now(), done);
        reporter.set("download", done, total, &name);
        loop {
            cancelled(cancel)?;
            let n = reader.read(&mut buffer).map_err(|error| Failure::new("network", error.to_string()))?;
            if n == 0 {
                break;
            }
            file.write_all(&buffer[..n]).map_err(io("disk"))?;
            done += n as u64;
            // Speed over the last couple of seconds.
            let elapsed = window.0.elapsed().as_secs_f64();
            if elapsed >= 0.5 {
                let rate = (done - window.1) as f64 / elapsed;
                reporter.progress.speed = if reporter.progress.speed > 0.0 { reporter.progress.speed * 0.6 + rate * 0.4 } else { rate };
                window = (Instant::now(), done);
            } else if started.elapsed().as_secs_f64() > 0.0 && reporter.progress.speed == 0.0 {
                reporter.progress.speed = (done - have) as f64 / started.elapsed().as_secs_f64().max(0.001);
            }
            reporter.set("download", done, total.max(done), &name);
        }
        file.flush().map_err(io("disk"))?;
        drop(file);
        have = done;
    }
    reporter.progress.speed = 0.0;
    finish_download(&part, job, have, reporter)?;
    Ok(part)
}

/// Size and checksum. A file that fails is deleted, so the next try starts clean.
fn finish_download(part: &Path, job: &DownloadJob, have: u64, reporter: &mut Reporter) -> Result<(), Failure> {
    let size = fs::metadata(part).map(|m| m.len()).unwrap_or(have);
    if let Some(expected) = job.size {
        if expected > 0 && size != expected {
            let _ = fs::remove_file(part);
            return Err(Failure::new("size", tr!("내려받은 크기가 다릅니다 ({size} / {expected} 바이트).", "The downloaded size is wrong ({size} of {expected} bytes).")));
        }
    }
    if let Some(expected) = job.sha256.as_deref().filter(|s| !s.is_empty()) {
        let mut file = File::open(part).map_err(io("disk"))?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1 << 20];
        let mut done = 0u64;
        loop {
            let n = file.read(&mut buffer).map_err(io("disk"))?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
            done += n as u64;
            reporter.set("verify", done, size, "SHA-256");
        }
        let actual: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if !actual.eq_ignore_ascii_case(expected) {
            drop(file);
            let _ = fs::remove_file(part);
            return Err(Failure::new("checksum", tr!("파일 검사(SHA-256)가 맞지 않습니다. 다시 내려받으세요.", "The file check (SHA-256) failed. Download it again.")));
        }
    }
    Ok(())
}

/// Unpacks an archive into `<root>/<id>`: through a temporary folder, so a broken archive never
/// leaves a half-installed bank behind. A zip inside the zip is unpacked too.
fn install(dir: &Path, archive: &Path, id: &str, kind: &str, cancel: &AtomicBool, reporter: &mut Reporter) -> Result<(), Failure> {
    let tmp = dir.join(format!(".tmp-{id}"));
    if tmp.exists() {
        fs::remove_dir_all(&tmp).map_err(io("disk"))?;
    }
    let result = (|| {
        fs::create_dir_all(&tmp).map_err(io("disk"))?;
        unzip(archive, &tmp, cancel, reporter)?;
        let marker = if kind == "vocoder" { "vocoder.yaml" } else { "dsconfig.yaml" };
        let mut found = find_root(&tmp, marker, 0);
        if found.is_none() {
            // TIGER: "Voice Library/TIGER_DS_v106.zip" inside the downloaded zip.
            let mut inner = Vec::new();
            find_zips(&tmp, 0, &mut inner);
            for (n, zip) in inner.iter().enumerate() {
                let target = tmp.join(format!(".inner-{n}"));
                fs::create_dir_all(&target).map_err(io("disk"))?;
                unzip(zip, &target, cancel, reporter)?;
                let _ = fs::remove_file(zip);
                found = find_root(&target, marker, 0);
                if found.is_some() {
                    break;
                }
            }
        }
        let Some(found) = found else {
            let other = if kind == "vocoder" { "dsconfig.yaml" } else { "vocoder.yaml" };
            let code = if find_root(&tmp, other, 0).is_some() { if kind == "vocoder" { "isBank" } else { "isVocoder" } } else { "notBank" };
            return Err(Failure::new(code, tr!("압축 파일에 {marker}가 없습니다.", "The archive has no {marker}.")));
        };
        let target = dir.join(id);
        if target.exists() {
            fs::remove_dir_all(&target).map_err(io("disk"))?;
        }
        fs::rename(&found, &target).map_err(io("disk"))?;
        Ok(())
    })();
    let _ = fs::remove_dir_all(&tmp);
    result
}

fn unzip(archive: &Path, target: &Path, cancel: &AtomicBool, reporter: &mut Reporter) -> Result<(), Failure> {
    let file = File::open(archive).map_err(io("disk"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|error| Failure::new("badZip", tr!("압축 파일을 열 수 없습니다: {error}", "The archive cannot be opened: {error}")))?;
    let mut total = 0u64;
    for i in 0..zip.len() {
        if let Ok(entry) = zip.by_index_raw(i) {
            total += entry.size();
        }
    }
    let mut done = 0u64;
    let mut buffer = vec![0u8; CHUNK];
    for i in 0..zip.len() {
        cancelled(cancel)?;
        let mut entry = zip.by_index(i).map_err(|error| Failure::new("badZip", error.to_string()))?;
        let Some(name) = entry.enclosed_name() else { continue };
        if name.components().any(|c| c.as_os_str() == "__MACOSX") {
            continue;
        }
        let out = target.join(&name);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(io("disk"))?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(io("disk"))?;
        }
        let shown = name.to_string_lossy().to_string();
        let mut writer = File::create(&out).map_err(io("disk"))?;
        loop {
            cancelled(cancel)?;
            let n = entry.read(&mut buffer).map_err(|error| Failure::new("badZip", error.to_string()))?;
            if n == 0 {
                break;
            }
            writer.write_all(&buffer[..n]).map_err(io("disk"))?;
            done += n as u64;
            reporter.set("unzip", done, total.max(done), &shown);
        }
    }
    Ok(())
}

/// The shallowest folder holding `marker` (depth ≤ 4).
fn find_root(dir: &Path, marker: &str, depth: usize) -> Option<PathBuf> {
    if dir.join(marker).is_file() {
        return Some(dir.to_path_buf());
    }
    if depth >= 4 {
        return None;
    }
    let mut dirs: Vec<PathBuf> = fs::read_dir(dir).ok()?.flatten().filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false)).map(|e| e.path()).collect();
    dirs.sort();
    dirs.iter().find_map(|d| find_root(d, marker, depth + 1))
}

fn find_zips(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && depth < 3 {
            find_zips(&path, depth + 1, out);
        } else if path.extension().map(|e| e.eq_ignore_ascii_case("zip") || e.eq_ignore_ascii_case("oudep")).unwrap_or(false) {
            out.push(path);
        }
    }
    out.sort_by_key(|p| std::cmp::Reverse(fs::metadata(p).map(|m| m.len()).unwrap_or(0)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_and_paths_are_checked() {
        assert!(check_id("tiger").is_ok());
        assert!(check_id("pc_nsf_hifigan_44.1k_hop512_128bin_2025.02").is_ok());
        assert!(check_id("../x").is_err());
        assert!(check_id(".tmp").is_err());
        let base = Path::new("bank");
        assert!(inside(base, "dsdur/dsconfig.yaml").is_ok());
        assert!(inside(base, "../secret").is_err());
        assert!(inside(base, "C:/x").is_err());
    }

    #[test]
    fn finds_the_bank_root_inside_folders() {
        let tmp = tempfile::tempdir().unwrap();
        let deep = tmp.path().join("PACK").join("bank");
        fs::create_dir_all(&deep).unwrap();
        fs::write(deep.join("dsconfig.yaml"), "acoustic: a.onnx").unwrap();
        assert_eq!(find_root(tmp.path(), "dsconfig.yaml", 0).unwrap(), deep);
        assert!(find_root(tmp.path(), "vocoder.yaml", 0).is_none());
    }
}
