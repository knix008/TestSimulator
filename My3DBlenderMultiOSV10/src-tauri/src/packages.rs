//! What the program needs from outside, and fetching it: Preferences › Packages shows the state, and on Windows can download and run
//! the WebView2 setup with progress and a stop button. Everything else the program uses is built in. On macOS and Linux the web view
//! belongs to the system (the Linux packages declare it as a dependency), so there is only the state to show.
use serde::Serialize;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

const WEBVIEW2_SETUP_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
    id: &'static str,
    name: &'static str,
    required: bool,
    installed: bool,
    version: Option<String>,
    can_install: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// idle, download, install, done, failed or cancelled
    phase: String,
    received: u64,
    total: u64,
    error: Option<String>,
}

static PROGRESS: Mutex<Option<Progress>> = Mutex::new(None);
static CANCEL: AtomicBool = AtomicBool::new(false);

fn set(change: impl FnOnce(&mut Progress)) {
    let mut guard = PROGRESS.lock().unwrap_or_else(|p| p.into_inner());
    change(guard.get_or_insert_with(Progress::default));
}

fn phase() -> String {
    PROGRESS.lock().unwrap_or_else(|p| p.into_inner()).as_ref().map(|p| p.phase.clone()).unwrap_or_default()
}

/// Debug builds only: the tests point the download at a local server. The setup itself is never run by a test.
fn setup_url() -> String {
    if cfg!(debug_assertions) {
        if let Ok(url) = std::env::var("MY3DBLENDER_PKG_URL") {
            return url;
        }
    }
    WEBVIEW2_SETUP_URL.to_string()
}

fn skip_running() -> bool {
    cfg!(debug_assertions) && std::env::var_os("MY3DBLENDER_PKG_NO_RUN").is_some()
}

#[tauri::command]
pub fn package_list() -> Vec<PackageInfo> {
    let version = tauri::webview_version().ok();
    vec![PackageInfo {
        id: "webview2",
        name: if cfg!(windows) { "WebView2 Runtime" } else if cfg!(target_os = "macos") { "WebKit" } else { "WebKitGTK" },
        required: true,
        installed: version.is_some(),
        version,
        can_install: cfg!(windows),
    }]
}

#[tauri::command]
pub fn package_progress() -> Progress {
    PROGRESS.lock().unwrap_or_else(|p| p.into_inner()).clone().unwrap_or_else(|| Progress { phase: "idle".into(), ..Progress::default() })
}

#[tauri::command]
pub fn package_cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn package_install(id: String) -> Result<(), String> {
    if id != "webview2" || !cfg!(windows) {
        return Err(format!("{id} cannot be installed from here"));
    }
    let now = phase();
    if now == "download" || now == "install" {
        return Err("already running".into());
    }
    CANCEL.store(false, Ordering::SeqCst);
    set(|p| *p = Progress { phase: "download".into(), ..Progress::default() });
    std::thread::spawn(|| {
        let folder = std::env::temp_dir().join(format!("my3dblender-package-{}", std::process::id()));
        let outcome = run(&folder);
        let _ = std::fs::remove_dir_all(&folder);
        set(|p| match outcome {
            Ok(()) => p.phase = "done".into(),
            Err(None) => p.phase = "cancelled".into(),
            Err(Some(message)) => {
                p.phase = "failed".into();
                p.error = Some(message);
            }
        });
    });
    Ok(())
}

/// `Err(None)`: stopped by the user. `Err(Some(..))`: failed.
fn run(folder: &std::path::Path) -> Result<(), Option<String>> {
    let fail = |e: String| Some(e);
    std::fs::create_dir_all(folder).map_err(|e| fail(e.to_string()))?;
    let setup = folder.join("MicrosoftEdgeWebview2Setup.exe");
    download(&setup_url(), &setup)?;
    if skip_running() {
        return Ok(());
    }
    set(|p| p.phase = "install".into());
    let mut child = std::process::Command::new(&setup).args(["/silent", "/install"]).spawn().map_err(|e| fail(e.to_string()))?;
    loop {
        if CANCEL.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(None);
        }
        match child.try_wait().map_err(|e| fail(e.to_string()))? {
            Some(status) => {
                // The setup reports an error when there was nothing to do: what counts is whether the runtime is there.
                if status.success() || tauri::webview_version().is_ok() {
                    return Ok(());
                }
                return Err(fail(format!("the setup ended with {status}")));
            }
            None => std::thread::sleep(Duration::from_millis(150)),
        }
    }
}

fn download(url: &str, target: &std::path::Path) -> Result<(), Option<String>> {
    let fail = |e: String| Some(e);
    let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(20)).timeout_read(Duration::from_secs(30)).build();
    let response = agent.get(url).call().map_err(|e| fail(e.to_string()))?;
    let total = response.header("Content-Length").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
    set(|p| p.total = total);
    let mut reader = response.into_reader();
    let mut file = std::fs::File::create(target).map_err(|e| fail(e.to_string()))?;
    let mut buffer = vec![0u8; 64 * 1024];
    let mut received = 0u64;
    loop {
        if CANCEL.load(Ordering::SeqCst) {
            return Err(None);
        }
        let n = reader.read(&mut buffer).map_err(|e| fail(e.to_string()))?;
        if n == 0 {
            break;
        }
        file.write_all(&buffer[..n]).map_err(|e| fail(e.to_string()))?;
        received += n as u64;
        set(|p| p.received = received);
    }
    if total > 0 && received < total {
        return Err(fail(format!("the download ended early: {received} of {total} bytes")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_required_package_is_listed_and_the_real_address_is_microsofts() {
        let list = package_list();
        assert_eq!(list[0].id, "webview2");
        assert!(list[0].required);
        assert!(WEBVIEW2_SETUP_URL.starts_with("https://go.microsoft.com/"));
    }

    #[test]
    fn unknown_packages_are_refused() {
        assert!(package_install("nothing".into()).is_err());
    }
}
