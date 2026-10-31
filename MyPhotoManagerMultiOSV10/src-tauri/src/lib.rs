// link.exe prints "Creating library …" when it builds the cdylib import library.
#![allow(unknown_lints, linker_messages)]

pub mod bgmodels;
pub mod catalogdb;
pub mod files;
pub mod mtp;
pub mod i18n;
pub mod printing;
pub mod thumbstore;
pub mod window_state;

use files::{Conflict, Entry, Listing, OpResult, Place};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Every webview in the process must share these (WebView2 refuses a second
/// environment with different arguments).
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

#[derive(Default)]
struct Shared {
    /// Images or folders given on the command line, handed to the UI once.
    startup_paths: Vec<PathBuf>,
}

type AppState = Mutex<Shared>;

fn lock(state: &AppState) -> std::sync::MutexGuard<'_, Shared> {
    state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| tr!("작업 실행 실패: {error}", "The task failed: {error}"))?
}

fn app_title(info: &tauri::PackageInfo) -> String {
    format!("MyPhotoManager {}", info.version)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: String,
    version: String,
    commit: &'static str,
    rustc: &'static str,
    build_time: u64,
    target: &'static str,
    profile: &'static str,
    tauri: &'static str,
    os: &'static str,
    arch: &'static str,
    data_dir: String,
}

#[tauri::command]
fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        name: app.package_info().name.clone(),
        version: app.package_info().version.to_string(),
        commit: env!("BUILD_COMMIT"),
        rustc: env!("BUILD_RUSTC"),
        build_time: env!("BUILD_UNIX_TIME").parse().unwrap_or(0),
        target: env!("BUILD_TARGET"),
        profile: env!("BUILD_PROFILE"),
        tauri: tauri::VERSION,
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        data_dir: data_dir(&app).map(|dir| files::path_text(&dir)).unwrap_or_default(),
    }
}

#[tauri::command]
fn set_language(language: String) {
    i18n::set_english(language.starts_with("en"));
}

/// Paths from the command line (double-clicked image, "Open with"), once.
#[tauri::command]
fn startup_paths(state: tauri::State<'_, AppState>) -> Vec<PathBuf> {
    std::mem::take(&mut lock(&state).startup_paths)
}

/// Arguments that name existing files or folders (flags are ignored).
fn existing_paths(args: impl IntoIterator<Item = String>) -> Vec<PathBuf> {
    args.into_iter()
        .filter(|arg| !arg.starts_with("--"))
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .map(|path| std::fs::canonicalize(&path).map(|p| strip_verbatim(&p)).unwrap_or(path))
        .collect()
}

/// `\\?\C:\x` → `C:\x` (canonicalize adds the prefix on Windows).
fn strip_verbatim(path: &Path) -> PathBuf {
    let text = files::path_text(path);
    match text.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC\\") => PathBuf::from(rest),
        _ => path.to_path_buf(),
    }
}

// ───────────────────────── browsing

#[tauri::command]
fn list_places() -> Vec<Place> {
    files::places()
}

#[tauri::command]
async fn list_dir(path: PathBuf, hidden: bool, probe: Option<bool>) -> Result<Listing, String> {
    blocking(move || files::list_dir(&path, hidden, probe.unwrap_or(true))).await
}

#[tauri::command]
async fn stat_paths(paths: Vec<PathBuf>) -> Result<Vec<Option<Entry>>, String> {
    blocking(move || Ok(files::stat_paths(&paths))).await
}

#[tauri::command]
async fn walk_files(path: PathBuf, hidden: bool, extensions: Vec<String>, limit: usize) -> Result<Vec<Entry>, String> {
    blocking(move || Ok(files::walk_files(&path, hidden, &extensions, limit))).await
}

// ───────────────────────── writing files

/// `%XX` decoding for the path header (headers carry ASCII only).
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(value) = hex.and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Writes the raw request body to the file named by the `x-path` header
/// (percent-encoded). Binary data travels without base64.
#[tauri::command]
async fn write_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err(tr!("저장할 데이터가 없습니다.", "There is no data to save."));
    };
    let path = request
        .headers()
        .get("x-path")
        .and_then(|value| value.to_str().ok())
        .map(percent_decode)
        .ok_or_else(|| tr!("저장할 경로가 없습니다.", "No path to save to."))?;
    let data = data.clone();
    blocking(move || files::write_atomic(Path::new(&path), &data)).await
}

/// Reads a file in the backend. The webview must not map a file that a later
/// move or overwrite will change.
#[tauri::command]
async fn read_file(path: String, max: Option<usize>) -> Result<Vec<u8>, String> {
    blocking(move || {
        if let Some(max) = max {
            use std::io::Read;
            let mut file = std::fs::File::open(&path).map_err(|error| error.to_string())?;
            let mut buf = vec![0_u8; max];
            let n = file.read(&mut buf).map_err(|error| error.to_string())?;
            buf.truncate(n);
            Ok(buf)
        } else {
            std::fs::read(&path).map_err(|error| error.to_string())
        }
    }).await
}

// ───────────────────────── file operations

#[tauri::command]
async fn copy_paths(sources: Vec<PathBuf>, dir: PathBuf, conflict: Conflict) -> Result<Vec<OpResult>, String> {
    blocking(move || Ok(files::copy_into(&sources, &dir, conflict))).await
}

#[tauri::command]
async fn move_paths(sources: Vec<PathBuf>, dir: PathBuf, conflict: Conflict) -> Result<Vec<OpResult>, String> {
    blocking(move || Ok(files::move_into(&sources, &dir, conflict))).await
}

#[tauri::command]
async fn rename_path(path: PathBuf, name: String) -> Result<String, String> {
    blocking(move || files::rename_entry(&path, &name).map(|p| files::path_text(&p))).await
}

#[tauri::command]
async fn delete_paths(paths: Vec<PathBuf>, trash: bool) -> Result<Vec<OpResult>, String> {
    blocking(move || Ok(files::delete_entries(&paths, trash))).await
}

#[tauri::command]
async fn create_dir(parent: PathBuf, name: String) -> Result<String, String> {
    blocking(move || files::create_dir(&parent, &name).map(|p| files::path_text(&p))).await
}

#[tauri::command]
async fn set_modified(path: PathBuf, millis: f64) -> Result<(), String> {
    blocking(move || files::set_modified(&path, millis)).await
}

// ───────────────────────── originals (restore after editing)

fn originals_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("originals"))
}

fn original_of(app: &AppHandle, path: &Path) -> Result<PathBuf, String> {
    let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    Ok(originals_dir(app)?.join(format!("{}{ext}", files::path_key(path))))
}

/// Keeps a copy of the file before it is first overwritten by an edit.
/// Returns true when a new backup was made.
#[tauri::command]
async fn backup_original(app: AppHandle, path: PathBuf) -> Result<bool, String> {
    let backup = original_of(&app, &path)?;
    blocking(move || {
        if backup.exists() {
            return Ok(false);
        }
        std::fs::create_dir_all(backup.parent().unwrap_or(Path::new("."))).map_err(|e| e.to_string())?;
        std::fs::copy(&path, &backup).map_err(|e| e.to_string())?;
        Ok(true)
    })
    .await
}

#[tauri::command]
fn has_originals(app: AppHandle, paths: Vec<PathBuf>) -> Vec<bool> {
    paths.iter().map(|path| original_of(&app, path).map(|backup| backup.exists()).unwrap_or(false)).collect()
}

/// Puts the saved original back and forgets the backup.
#[tauri::command]
async fn restore_original(app: AppHandle, path: PathBuf) -> Result<(), String> {
    let backup = original_of(&app, &path)?;
    blocking(move || {
        if !backup.exists() {
            return Err(tr!("저장된 원본이 없습니다.", "There is no saved original."));
        }
        let data = std::fs::read(&backup).map_err(|e| e.to_string())?;
        files::write_atomic(&path, &data)?;
        std::fs::remove_file(&backup).map_err(|e| e.to_string())
    })
    .await
}

/// Where the saved original of `path` is kept (None when there is none) — the
/// editor re-opens it to change an earlier edit without losing quality.
#[tauri::command]
fn original_path(app: AppHandle, path: PathBuf) -> Option<String> {
    original_of(&app, &path).ok().filter(|backup| backup.exists()).map(|backup| files::path_text(&backup))
}

#[tauri::command]
fn discard_original(app: AppHandle, path: PathBuf) -> Result<(), String> {
    let backup = original_of(&app, &path)?;
    if backup.exists() {
        std::fs::remove_file(backup).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ───────────────────────── shell

/// Tests: with MYPHOTO_FAKE_SHELL=<log file> the shell actions (file manager,
/// default program, links, wallpaper, "Open with") are only written to that
/// file as "action<TAB>target" lines — nothing opens on the test machine.
fn fake_shell(action: &str, target: &str) -> bool {
    let Some(log) = std::env::var_os("MYPHOTO_FAKE_SHELL") else { return false };
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(log) {
        let _ = writeln!(file, "{action}\t{target}");
    }
    true
}

#[tauri::command]
fn reveal_path(path: PathBuf) -> Result<(), String> {
    if fake_shell("reveal", &files::path_text(&path)) {
        return Ok(());
    }
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|error| tr!("탐색기에서 열 수 없습니다: {error}", "Could not show it in the file manager: {error}"))
}

#[tauri::command]
fn open_path(path: PathBuf) -> Result<(), String> {
    if fake_shell("open", &files::path_text(&path)) {
        return Ok(());
    }
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|error| tr!("열 수 없습니다: {error}", "Could not open it: {error}"))
}

/// Opens files in a program the user registered as an external editor
/// (Photoshop, GIMP …). On macOS an .app bundle is started with `open -a`.
#[tauri::command]
fn open_in_program(program: PathBuf, paths: Vec<PathBuf>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let listed = paths.iter().map(|p| files::path_text(p)).collect::<Vec<_>>().join("\t");
    if fake_shell("editor", &format!("{}\t{listed}", files::path_text(&program))) {
        return Ok(());
    }
    if !program.exists() {
        return Err(tr!("프로그램을 찾을 수 없습니다: {}", "Program not found: {}", files::path_text(&program)));
    }
    #[cfg(target_os = "macos")]
    let mut command = if program.extension().is_some_and(|ext| ext == "app") {
        let mut c = std::process::Command::new("open");
        c.arg("-a").arg(&program);
        c
    } else {
        std::process::Command::new(&program)
    };
    #[cfg(not(target_os = "macos"))]
    let mut command = std::process::Command::new(&program);
    command.args(&paths).spawn().map(|_| ()).map_err(|error| tr!("실행할 수 없습니다: {error}", "Could not start it: {error}"))
}

/// The system's "Open with" chooser (Windows). Elsewhere: false (the UI then
/// offers the default program / file manager).
#[tauri::command]
fn open_with(path: PathBuf) -> Result<bool, String> {
    // Tests: no modal system dialog.
    if path.exists() && fake_shell("openWith", &files::path_text(&path)) {
        return Ok(true);
    }
    #[cfg(windows)]
    {
        std::process::Command::new("rundll32.exe")
            .arg("shell32.dll,OpenAs_RunDLL")
            .arg(&path)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(true)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(false)
    }
}

/// Scans a page with the system scanner dialog and saves it as JPEG `target`.
/// Windows: WIA dialog. Linux: `scanimage` (SANE). Returns false when cancelled.
#[tauri::command]
/// Scans one page to `target` (Windows: WIA dialog). Returns the saved file —
/// elsewhere `scanimage` writes PNG, so the extension may differ — or None when cancelled.
async fn scan_image(target: PathBuf) -> Result<Option<String>, String> {
    blocking(move || {
        // Tests: a picture stands in for the scanner.
        if let Some(sample) = std::env::var_os("MYPHOTO_FAKE_SCANNER") {
            std::fs::copy(sample, &target).map_err(|error| error.to_string())?;
            return Ok(Some(files::path_text(&target)));
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let script = format!(
                "$ErrorActionPreference='Stop'; $d = New-Object -ComObject WIA.CommonDialog; $i = $d.ShowAcquireImage(1, 1, 131072, '{{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}}', $false, $true, $false); if ($i) {{ if (Test-Path -LiteralPath '{0}') {{ Remove-Item -LiteralPath '{0}' }}; $i.SaveFile('{0}'); 'saved' }}",
                files::path_text(&target).replace('\'', "''")
            );
            let output = std::process::Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-STA", "-Command", &script])
                .creation_flags(0x0800_0000)
                .output()
                .map_err(|error| error.to_string())?;
            if output.status.success() {
                return Ok(String::from_utf8_lossy(&output.stdout).contains("saved").then(|| files::path_text(&target)));
            }
            let message = String::from_utf8_lossy(&output.stderr).lines().find(|l| !l.trim().is_empty()).unwrap_or("").to_string();
            Err(tr!("스캐너를 쓸 수 없습니다: {message}", "The scanner is not available: {message}"))
        }
        #[cfg(not(windows))]
        {
            let png = target.with_extension("png");
            let status = std::process::Command::new("scanimage")
                .args(["--format=png", "--resolution", "300", "-o"])
                .arg(&png)
                .status()
                .map_err(|_| tr!("스캐너 도구(scanimage)가 없습니다.", "No scanner tool (scanimage) is installed."))?;
            Ok(status.success().then(|| files::path_text(&png)))
        }
    })
    .await
}

#[tauri::command]
async fn sync_dirs(source: PathBuf, target: PathBuf, mirror: bool, extensions: Vec<String>) -> Result<files::SyncReport, String> {
    blocking(move || files::sync_dirs(&source, &target, mirror, &extensions)).await
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    // Web links and e-mail (sharing opens a new message).
    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) {
        return Err("only http(s) and mailto links".into());
    }
    if fake_shell("url", &url) {
        return Ok(());
    }
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_wallpaper(path: PathBuf) -> Result<(), String> {
    if fake_shell("wallpaper", &files::path_text(&path)) {
        return Ok(());
    }
    blocking(move || {
        wallpaper::set_from_path(&files::path_text(&path)).map_err(|error| tr!("바탕 화면을 바꾸지 못했습니다: {error}", "Could not set the wallpaper: {error}"))
    })
    .await
}

/// Closes a dialog window opened by the page (its webview alone closes with window.close()).
#[tauri::command]
fn close_dialog_window(app: AppHandle, label: String) {
    if label.starts_with("dialog-") {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.destroy();
        }
    }
}

#[tauri::command]
fn list_printers() -> Vec<printing::Printer> {
    printing::printers()
}

/// Prints the page as it is (the prepared sheets) without the print preview.
#[tauri::command]
async fn print_direct(window: WebviewWindow, options: printing::PrintOptions) -> Result<(), String> {
    blocking(move || printing::print_direct(&window, options)).await
}

#[tauri::command]
fn print_window(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| tr!("인쇄를 시작할 수 없습니다: {error}", "Could not start printing: {error}"))
}

// ───────────────────────── app data (catalog database, settings)

/// The app's own data folder (tests point it elsewhere with MYPHOTO_DATA_DIR).
fn model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("models"))
}

#[tauri::command]
fn bg_model_info(app: AppHandle, id: String) -> Result<bgmodels::ModelInfo, String> {
    bgmodels::info(&model_dir(&app)?, &id)
}

#[tauri::command]
async fn bg_model_download(app: AppHandle, id: String) -> Result<(), String> {
    let dir = model_dir(&app)?;
    bgmodels::download(app, dir, id).await
}

#[tauri::command]
fn bg_model_cancel(id: String) {
    bgmodels::cancel(&id);
}

#[tauri::command]
fn bg_model_delete(app: AppHandle, id: String) -> Result<(), String> {
    bgmodels::delete(&model_dir(&app)?, &id)
}

#[tauri::command]
async fn bg_model_read(app: AppHandle, id: String) -> Result<Vec<u8>, String> {
    let dir = model_dir(&app)?;
    blocking(move || bgmodels::read(&dir, &id)).await
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("MYPHOTO_DATA_DIR") {
        return Ok(PathBuf::from(dir));
    }
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn thumb_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("thumbnails"))
}

/// The stored thumbnails of a directory (index.json text) or null.
#[tauri::command]
async fn thumb_index(app: AppHandle, dir: String) -> Result<Option<String>, String> {
    let root = thumb_root(&app)?;
    blocking(move || Ok(thumbstore::read_index(&root, &dir))).await
}

#[tauri::command]
async fn thumb_index_save(app: AppHandle, dir: String, json: String) -> Result<(), String> {
    let root = thumb_root(&app)?;
    blocking(move || thumbstore::write_index(&root, &dir, &json)).await
}

/// One thumbnail image (raw body; headers x-dir and x-name, percent-encoded). Returns its path.
#[tauri::command]
async fn thumb_put(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("no thumbnail data".into());
    };
    let header = |name: &str| request.headers().get(name).and_then(|value| value.to_str().ok()).map(percent_decode);
    let dir = header("x-dir").ok_or("no directory")?;
    let name = header("x-name").ok_or("no name")?;
    let root = thumb_root(&app)?;
    let data = data.clone();
    blocking(move || thumbstore::put(&root, &dir, &name, &data).map(|path| files::path_text(&path))).await
}

#[tauri::command]
async fn thumb_stats(app: AppHandle) -> Result<usize, String> {
    let root = thumb_root(&app)?;
    blocking(move || Ok(thumbstore::count(&root))).await
}

#[tauri::command]
async fn thumb_clear(app: AppHandle) -> Result<(), String> {
    let root = thumb_root(&app)?;
    blocking(move || thumbstore::clear(&root)).await
}

fn data_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let valid = !name.is_empty() && name.len() < 80 && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')) && !name.starts_with('.');
    if !valid {
        return Err(format!("bad data file name: {name}"));
    }
    Ok(data_dir(app)?.join(name))
}

#[tauri::command]
async fn data_read(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = data_file(&app, &name)?;
    blocking(move || match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    })
    .await
}

#[tauri::command]
async fn data_write(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let path = data_file(&app, &name)?;
    blocking(move || files::write_atomic(&path, content.as_bytes())).await
}

// ───────────────────────── catalog database (SQLite)

fn catalog_db(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("catalog.sqlite"))
}

/// The catalog as JSON, or null before the first save (the page then migrates catalog.json).
#[tauri::command]
async fn catalog_db_load(app: AppHandle) -> Result<Option<String>, String> {
    let path = catalog_db(&app)?;
    blocking(move || catalogdb::load(&path)).await
}

/// Writes the records that changed (JSON texts), removes deleted ones, and stores the catalog-wide lists.
#[tauri::command]
async fn catalog_db_save(app: AppHandle, upserts: Vec<(String, String)>, removes: Vec<String>, meta: Vec<(String, String)>) -> Result<(), String> {
    let path = catalog_db(&app)?;
    blocking(move || catalogdb::save(&path, &upserts, &removes, &meta)).await
}

/// Phones and cameras connected over USB (MTP).
#[tauri::command]
async fn mtp_devices() -> Result<Vec<mtp::Device>, String> {
    blocking(|| Ok(mtp::devices())).await
}

/// Copies a device's new photos into <data>/mtp/<device> for the import dialog.
#[tauri::command]
async fn mtp_stage(app: AppHandle, id: String, name: String) -> Result<mtp::Staged, String> {
    let dest = data_dir(&app)?.join("mtp").join(mtp::folder_name(&name));
    blocking(move || mtp::stage(&id, &dest)).await
}

#[tauri::command]
async fn catalog_db_info(app: AppHandle) -> Result<catalogdb::Info, String> {
    let path = catalog_db(&app)?;
    blocking(move || catalogdb::info(&path)).await
}

// ───────────────────────── app

#[derive(Clone, Serialize)]
struct FatalError {
    message: String,
    location: String,
}

fn install_panic_hook(app: &AppHandle) {
    let handle = app.clone();
    let log = data_dir(app).ok().map(|dir| dir.join("crash.log"));
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".into());
        let location = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_default();
        if let Some(path) = &log {
            let _ = std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")));
            let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let entry = format!("[{stamp}] panicked at {location}\n{message}\n{}\n\n", std::backtrace::Backtrace::force_capture());
            let _ = std::fs::OpenOptions::new().create(true).append(true).open(path).and_then(|mut file| std::io::Write::write_all(&mut file, entry.as_bytes()));
        }
        let _ = handle.emit_to("main", "fatal-error", FatalError { message, location });
        default(info);
    }));
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.destroy();
    }
    app.exit(0);
}

/// The user guide (doc/index.html) in its own window, not owned by the main one
/// so it can sit anywhere. `query` carries the language and the theme. A second
/// request brings the open guide forward (the page follows later changes itself).
/// Async: a window made inside a synchronous command deadlocks on Windows.
#[tauri::command]
async fn open_guide(app: AppHandle, query: String) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("guide") {
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }
    let mut builder = WebviewWindowBuilder::new(&app, "guide", WebviewUrl::App(format!("doc/index.html?{query}").into()))
        .title(tr!("MyPhotoManager 사용 설명서", "MyPhotoManager User Guide"))
        .inner_size(1060.0, 780.0)
        .min_inner_size(720.0, 480.0)
        .additional_browser_args(BROWSER_ARGS)
        .on_document_title_changed(|window, title| {
            let _ = window.set_title(&title);
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone()).map_err(|e| e.to_string())?;
    }
    if let Some(main) = app.get_webview_window("main") {
        let scale = main.scale_factor().unwrap_or(1.0);
        if let Ok(p) = main.outer_position() {
            builder = builder.position(f64::from(p.x) / scale + 60.0, f64::from(p.y) / scale + 40.0);
        }
    }
    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

fn focus_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // One MyPhotoManager: opening another image hands it to the running one.
    // Tests run copies side by side (MYPHOTO_MULTI=1).
    if std::env::var_os("MYPHOTO_MULTI").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = existing_paths(argv.into_iter().skip(1));
            if !paths.is_empty() {
                let _ = app.emit_to("main", "open-paths", paths);
            }
            focus_main(app);
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            install_panic_hook(app.handle());
            lock(&app.state::<AppState>()).startup_paths = existing_paths(std::env::args().skip(1));
            let state_path = window_state::state_file(app.handle());
            let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(app.handle(), path));
            // Dialogs open as their own windows (window.open from the page): a real
            // top-level window owned by the main one, fixed in size, with the app's
            // icon and the dialog's title. The page fills it (same origin, about:blank).
            let handle = app.handle().clone();
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(app_title(app.package_info()))
                .min_inner_size(960.0, 600.0)
                .visible(false)
                .additional_browser_args(BROWSER_ARGS)
                .on_new_window(move |url, features| {
                    // The page names the window in the URL fragment (about:blank#dialog-7) so it
                    // can close it again by that label (close_dialog_window).
                    static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
                    let label = url
                        .fragment()
                        .filter(|f| f.starts_with("dialog-") && f.len() < 64 && f.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
                        .map(str::to_string)
                        .unwrap_or_else(|| format!("dialog-{}", NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
                    let mut popup = WebviewWindowBuilder::new(&handle, label, WebviewUrl::External("about:blank".parse().expect("url")))
                        .window_features(features)
                        .additional_browser_args(BROWSER_ARGS)
                        .resizable(false)
                        .maximizable(false)
                        .minimizable(false)
                        .skip_taskbar(true)
                        .on_document_title_changed(|window, title| {
                            let _ = window.set_title(&title);
                        });
                    if let Some(icon) = handle.default_window_icon() {
                        popup = match popup.icon(icon.clone()) {
                            Ok(next) => next,
                            Err(_) => return tauri::webview::NewWindowResponse::Deny,
                        };
                    }
                    if let Some(main) = handle.get_webview_window("main") {
                        popup = match popup.parent(&main) {
                            Ok(next) => next,
                            Err(_) => return tauri::webview::NewWindowResponse::Deny,
                        };
                    }
                    match popup.build() {
                        Ok(window) => tauri::webview::NewWindowResponse::Create { window },
                        Err(_) => tauri::webview::NewWindowResponse::Deny,
                    }
                });
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    .maximized(state.maximized),
                None => builder.inner_size(1440.0, 900.0).center(),
            };
            let main = builder.build()?;
            // The guide is not owned by the main window: it goes with it, or the program would keep running.
            let handle = app.handle().clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::Destroyed = event {
                    if let Some(guide) = handle.get_webview_window("guide") {
                        let _ = guide.destroy();
                    }
                }
            });
            if let Some(path) = state_path {
                window_state::track(&main, path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            set_language,
            startup_paths,
            list_places,
            list_dir,
            stat_paths,
            walk_files,
            write_file,
            read_file,
            copy_paths,
            move_paths,
            rename_path,
            delete_paths,
            create_dir,
            set_modified,
            backup_original,
            has_originals,
            restore_original,
            discard_original,
            original_path,
            open_with,
            open_in_program,
            scan_image,
            sync_dirs,
            reveal_path,
            open_path,
            open_url,
            set_wallpaper,
            print_window,
            print_direct,
            close_dialog_window,
            thumb_index,
            thumb_index_save,
            thumb_put,
            thumb_stats,
            thumb_clear,
            list_printers,
            data_read,
            data_write,
            bg_model_info,
            bg_model_download,
            bg_model_cancel,
            bg_model_delete,
            bg_model_read,
            catalog_db_load,
            catalog_db_save,
            catalog_db_info,
            mtp_devices,
            mtp_stage,
            quit_app,
            open_guide,
            start_file_drag
        ])
        .run(tauri::generate_context!())
        .expect("error while running MyPhotoManager");
}

/// Drag selected files and folders out of the window into Explorer or another app.
/// Runs on the UI thread: the OS drag loop has to start while the mouse button is down.
#[tauri::command]
fn start_file_drag(window: WebviewWindow, paths: Vec<String>) -> Result<(), String> {
    let files: Vec<PathBuf> = paths
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .collect();
    if files.is_empty() {
        return Err(tr!(
            "끌어낼 파일이나 폴더가 없습니다.",
            "There is nothing to drag out."
        ));
    }
    let icon = drag_icon_path()?;
    let (tx, rx) = std::sync::mpsc::channel();
    let host = window.clone();
    window
        .run_on_main_thread(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                drag_out(&host, files, icon)
            }));
            let outcome = match result {
                Ok(value) => value,
                Err(_) => Err(tr!(
                    "파일을 바깥으로 끌어내지 못했습니다.",
                    "Could not drag the files out."
                )),
            };
            let _ = tx.send(outcome);
        })
        .map_err(|error| error.to_string())?;
    rx.recv().map_err(|error| error.to_string())?
}

fn drag_icon_path() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join("myphotomanager-drag.png");
    if !path.is_file() {
        std::fs::write(&path, drag_png()).map_err(|error| error.to_string())?;
    }
    Ok(path)
}

#[cfg(target_os = "linux")]
fn drag_out(window: &WebviewWindow, files: Vec<PathBuf>, icon: PathBuf) -> Result<(), String> {
    let gtk_window = window.gtk_window().map_err(|error| error.to_string())?;
    drag::start_drag(
        &gtk_window,
        drag::DragItem::Files(files),
        drag::Image::File(icon),
        |_, _| {},
        drag::Options { skip_animatation_on_cancel_or_failure: false, mode: drag::DragMode::Copy },
    )
    .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "linux"))]
fn drag_out(window: &WebviewWindow, files: Vec<PathBuf>, icon: PathBuf) -> Result<(), String> {
    drag::start_drag(
        window,
        drag::DragItem::Files(files),
        drag::Image::File(icon),
        |_, _| {},
        drag::Options { skip_animatation_on_cancel_or_failure: false, mode: drag::DragMode::Copy },
    )
    .map_err(|error| error.to_string())
}

fn drag_png() -> Vec<u8> {
    fn crc32(data: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFFu32;
        for &byte in data {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                let mask = (crc & 1).wrapping_neg();
                crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
            }
        }
        !crc
    }
    fn chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let mut out = (data.len() as u32).to_be_bytes().to_vec();
        out.extend_from_slice(kind);
        out.extend_from_slice(data);
        let mut hashed = kind.to_vec();
        hashed.extend_from_slice(data);
        out.extend_from_slice(&crc32(&hashed).to_be_bytes());
        out
    }
    fn adler32(data: &[u8]) -> u32 {
        let mut a = 1u32;
        let mut b = 0u32;
        for &byte in data {
            a = (a + u32::from(byte)) % 65521;
            b = (b + a) % 65521;
        }
        (b << 16) | a
    }

    let (width, height) = (32u32, 32u32);
    let mut raw = Vec::with_capacity(((1 + width * 4) * height) as usize);
    for y in 0..height {
        raw.push(0);
        for x in 0..width {
            let edge = x < 2 || y < 2 || x + 2 >= width || y + 2 >= height;
            let rgba: [u8; 4] = if edge { [30, 90, 180, 255] } else { [232, 242, 252, 255] };
            raw.extend_from_slice(&rgba);
        }
    }
    let mut zlib = vec![0x78, 0x01];
    let mut offset = 0;
    while offset < raw.len() {
        let size = (raw.len() - offset).min(65535);
        let last = offset + size == raw.len();
        zlib.push(if last { 1 } else { 0 });
        zlib.extend_from_slice(&(size as u16).to_le_bytes());
        zlib.extend_from_slice(&(!(size as u16)).to_le_bytes());
        zlib.extend_from_slice(&raw[offset..offset + size]);
        offset += size;
    }
    zlib.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    png.extend(chunk(b"IHDR", &ihdr));
    png.extend(chunk(b"IDAT", &zlib));
    png.extend(chunk(b"IEND", &[]));
    png
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drag_preview_is_a_png() {
        let png = super::drag_png();
        assert!(png.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
        assert!(png.windows(4).any(|bytes| bytes == b"IEND"));
    }

    #[test]
    fn decodes_percent_encoded_paths() {
        assert_eq!(percent_decode("C%3A%5C%EC%82%AC%EC%A7%84%5Ca%20b.jpg"), "C:\\사진\\a b.jpg");
        assert_eq!(percent_decode("plain/path.jpg"), "plain/path.jpg");
        assert_eq!(percent_decode("bad%zz%4"), "bad%zz%4");
    }

    #[test]
    fn startup_arguments_keep_existing_paths_only() {
        let dir = tempfile::tempdir().unwrap();
        let image = dir.path().join("a.jpg");
        std::fs::write(&image, b"x").unwrap();
        let found = existing_paths(vec!["--flag".into(), files::path_text(&image), "missing.jpg".into()]);
        assert_eq!(found.len(), 1);
        assert!(!files::path_text(&found[0]).starts_with(r"\\?\"));
        assert!(found[0].ends_with("a.jpg"));
    }
}
