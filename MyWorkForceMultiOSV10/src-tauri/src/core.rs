// The data service (server/index.mjs) on port 1481. The installed app starts its own copy from the
// resources (runtime/: a Node executable and the esbuild bundle server.cjs, see
// scripts/stage-runtime.mjs), so a fresh install can sign in without Node.js on the machine.
//
// A run from the checkout falls back to `node server/index.mjs` (MYWORKFORCE_NODE overrides node).
// When the port is already taken (the Vite dev server started one, or a company server runs here)
// the new copy reports that and ends by itself. The service gets --parent-pid and stops when the app is gone;
// the app also stops it on exit. Its output goes to <app data>/data/service.log.
use std::fs::File;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

static CHILD: Mutex<Option<Child>> = Mutex::new(None);

/// Tauri hands out the resource folder as a verbatim path (\\?\C:\…); Node cannot start a script from one.
pub fn plain_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    match text.strip_prefix(r"\\?\") {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') => PathBuf::from(rest),
        _ => path,
    }
}

struct Launch {
    node: PathBuf,
    entry: PathBuf,
    cwd: PathBuf,
}

fn locate(resources: Option<PathBuf>) -> Option<Launch> {
    let bundled = resources.map(|dir| plain_path(dir).join("runtime")).and_then(|runtime| {
        let node = runtime.join(if cfg!(windows) { "node.exe" } else { "node" });
        let entry = runtime.join("server.cjs");
        (node.is_file() && entry.is_file()).then(|| Launch { node, entry, cwd: runtime })
    });
    let checkout = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let source = checkout.join("server").join("index.mjs").is_file().then(|| Launch {
        node: PathBuf::from(std::env::var("MYWORKFORCE_NODE").unwrap_or_else(|_| "node".into())),
        entry: plain_path(checkout.canonicalize().unwrap_or(checkout.clone())).join("server").join("index.mjs"),
        cwd: plain_path(checkout.canonicalize().unwrap_or(checkout)),
    });
    bundled.or(source)
}

/// Starts the data service. `data_dir` keeps the database, the connection and the sessions.
pub fn start(resources: Option<PathBuf>, data_dir: &Path) -> Result<(), String> {
    let launch = locate(resources).ok_or_else(|| crate::tr!(
        "데이터 서비스 파일이 없습니다 (프로그램 옆 runtime/). MyWorkForce 를 다시 설치하세요.",
        "The data service files are missing (runtime/ next to the program). Reinstall MyWorkForce."
    ))?;
    std::fs::create_dir_all(data_dir).map_err(|error| error.to_string())?;
    let log = File::create(data_dir.join("service.log")).map_err(|error| error.to_string())?;
    let errors = log.try_clone().map_err(|error| error.to_string())?;
    let mut cmd = Command::new(&launch.node);
    cmd.arg(&launch.entry)
        .arg("--data")
        .arg(plain_path(data_dir.to_path_buf()))
        .arg("--parent-pid")
        .arg(std::process::id().to_string())
        .current_dir(&launch.cwd)
        .env_remove("ELECTRON_RUN_AS_NODE")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(errors));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window for the service.
        cmd.creation_flags(0x08000000);
    }
    let child = cmd.spawn().map_err(|error| crate::tr!(
        "데이터 서비스를 시작할 수 없습니다 ({}): {error}",
        "Cannot start the data service with {} ({error})",
        launch.node.display()
    ))?;
    *CHILD.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);
    Ok(())
}

pub fn stop() {
    if let Some(mut child) = CHILD.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_path_strips_the_verbatim_prefix() {
        assert_eq!(plain_path(PathBuf::from(r"\\?\C:\Program Files\x")), PathBuf::from(r"C:\Program Files\x"));
        assert_eq!(plain_path(PathBuf::from(r"\\?\UNC\server\share")), PathBuf::from(r"\\server\share"));
        assert_eq!(plain_path(PathBuf::from("/usr/lib/x")), PathBuf::from("/usr/lib/x"));
    }

    #[test]
    fn the_checkout_service_is_found() {
        let launch = locate(None).expect("server/index.mjs in the checkout");
        assert!(launch.entry.is_file());
        assert!(!launch.entry.to_string_lossy().starts_with(r"\\?\"));
    }
}
