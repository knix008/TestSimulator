pub mod files;
pub mod i18n;
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
    format!("MyPhotoManager v{}", info.version)
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

#[tauri::command]
fn print_window(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| tr!("인쇄를 시작할 수 없습니다: {error}", "Could not start printing: {error}"))
}

// ───────────────────────── app data (catalog database, settings)

/// The app's own data folder (tests point it elsewhere with MYPHOTO_DATA_DIR).
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("MYPHOTO_DATA_DIR") {
        return Ok(PathBuf::from(dir));
    }
    app.path().app_data_dir().map_err(|error| error.to_string())
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
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(app_title(app.package_info()))
                .min_inner_size(960.0, 600.0)
                .visible(false)
                .additional_browser_args(BROWSER_ARGS);
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    .maximized(state.maximized),
                None => builder.inner_size(1440.0, 900.0).center(),
            };
            let main = builder.build()?;
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
            scan_image,
            sync_dirs,
            reveal_path,
            open_path,
            open_url,
            set_wallpaper,
            print_window,
            data_read,
            data_write,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running MyPhotoManager");
}

#[cfg(test)]
mod tests {
    use super::*;

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
