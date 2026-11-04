// The native run: writes the generated project into a per-version folder, builds it with
// CMake + Ninja + gcc against the installed LVGL, and starts it. All output reaches the page
// as "native-log" events and the end as "native-exit". The build folder is kept, so only the
// first run of a version compiles LVGL itself.
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct NativeState {
    child: Arc<Mutex<Option<Child>>>,
    stopped: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
}

/// PATH with the compiler folder in front: another toolchain's make or gcc must not win.
fn tool_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    if cfg!(windows) {
        for dir in ["C:\\msys64\\ucrt64\\bin", "C:\\Msys64\\ucrt64\\bin"] {
            if Path::new(dir).join("gcc.exe").is_file() {
                return format!("{dir};{current}");
            }
        }
    }
    current
}

fn command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.env("PATH", tool_path());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn probe(program: &str, arg: &str) -> Option<String> {
    let output = command(program).arg(arg).stdin(Stdio::null()).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout).lines().next().map(|line| line.trim().to_string())
}

/// Looks for SDL2 the way the build will: through the compiler's own search path.
fn has_sdl() -> bool {
    let Ok(dir) = tempdir() else { return false };
    let source = dir.join("sdl_probe.c");
    if std::fs::write(&source, "#include <SDL2/SDL.h>\nint main(void){return 0;}\n").is_err() {
        return false;
    }
    let ok = command("gcc").arg("-E").arg(&source).stdout(Stdio::null()).stderr(Stdio::null()).status().map(|s| s.success()).unwrap_or(false);
    let _ = std::fs::remove_file(&source);
    ok
}

fn tempdir() -> Result<PathBuf, String> {
    let dir = crate::data_dir().join("native");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command(async)]
pub fn native_check() -> Value {
    json!({
        "gcc": probe("gcc", "--version"),
        "cmake": probe("cmake", "--version"),
        "ninja": probe("ninja", "--version"),
        "sdl": has_sdl(),
    })
}

fn slash(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn emit_line(app: &AppHandle, stream: &str, line: &str) {
    let _ = app.emit("native-log", json!({ "stream": stream, "line": line }));
}

fn pump<R: Read + Send + 'static>(app: AppHandle, stream: &'static str, reader: R) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            emit_line(&app, stream, &line);
        }
    })
}

/// Runs a process, streams its output, and waits for it. `stop` can kill it meanwhile.
fn run_step(app: &AppHandle, state: &NativeHandles, mut cmd: Command, stream: &'static str) -> Result<Option<i32>, String> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let out = child.stdout.take().map(|reader| pump(app.clone(), stream, reader));
    let err = child.stderr.take().map(|reader| pump(app.clone(), stream, reader));
    *state.child.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);
    let code = loop {
        std::thread::sleep(std::time::Duration::from_millis(40));
        let mut slot = state.child.lock().unwrap_or_else(|e| e.into_inner());
        let Some(child) = slot.as_mut() else { break None };
        match child.try_wait() {
            Ok(Some(status)) => {
                *slot = None;
                break status.code();
            }
            Ok(None) => {}
            Err(e) => return Err(e.to_string()),
        }
    };
    if let Some(handle) = out {
        let _ = handle.join();
    }
    if let Some(handle) = err {
        let _ = handle.join();
    }
    Ok(code)
}

#[derive(Clone)]
struct NativeHandles {
    child: Arc<Mutex<Option<Child>>>,
    stopped: Arc<AtomicBool>,
}

fn build_and_run(app: &AppHandle, state: &NativeHandles, version: &str, files: &BTreeMap<String, String>) -> Result<&'static str, String> {
    let lvgl = crate::lvgl::version_dir(version)?;
    if !lvgl.join("lvgl.h").is_file() {
        return Err(format!("LVGL {version} is not installed"));
    }
    let base = crate::data_dir().join("native").join(version);
    let source = base.join("project");
    let build = base.join("build");
    crate::write_tree(&source, files)?;

    if !build.join("build.ninja").is_file() {
        emit_line(app, "build", &format!("Configuring (LVGL {version})..."));
        let mut configure = command("cmake");
        configure
            .arg("-S").arg(&source)
            .arg("-B").arg(&build)
            .args(["-G", "Ninja", "-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_C_COMPILER=gcc"])
            .arg(format!("-DLVGL_DIR={}", slash(&lvgl)));
        let code = run_step(app, state, configure, "build")?;
        if state.stopped.load(Ordering::SeqCst) {
            return Ok("stopped");
        }
        if code != Some(0) {
            let _ = std::fs::remove_dir_all(&build);
            return Err("configure failed".into());
        }
    }

    emit_line(app, "build", "Building...");
    let compile = || {
        let mut cmd = command("cmake");
        cmd.arg("--build").arg(&build);
        cmd
    };
    let mut code = run_step(app, state, compile(), "build")?;
    if state.stopped.load(Ordering::SeqCst) {
        return Ok("stopped");
    }
    // Windows can briefly hold ninja's log right after the last build.
    if code != Some(0) {
        std::thread::sleep(std::time::Duration::from_secs(1));
        code = run_step(app, state, compile(), "build")?;
    }
    if code != Some(0) {
        return Err("build failed".into());
    }

    let exe = build.join(if cfg!(windows) { "app.exe" } else { "app" });
    emit_line(app, "build", &format!("Running {}", exe.display()));
    let _ = app.emit("native-started", json!({}));
    let code = run_step(app, state, command(&exe.to_string_lossy()), "app")?;
    if state.stopped.load(Ordering::SeqCst) {
        return Ok("stopped");
    }
    emit_line(app, "build", &format!("Exited with code {}", code.unwrap_or(-1)));
    Ok("exited")
}

/// Deletes a version's native build; only the next run has to compile LVGL again.
#[tauri::command(async)]
pub fn native_clean(state: tauri::State<NativeState>, version: String) -> Result<(), String> {
    if state.running.load(Ordering::SeqCst) {
        return Err("a native run is in progress".into());
    }
    crate::lvgl::version_dir(&version)?; // checks the form of the version: it becomes a folder name
    let dir = crate::data_dir().join("native").join(&version);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

const MSYS_PACKAGES: [&str; 4] = ["gcc", "cmake", "ninja", "SDL2"];

fn pacman() -> Option<PathBuf> {
    ["C:\\msys64\\usr\\bin\\pacman.exe", "C:\\Msys64\\usr\\bin\\pacman.exe"].iter().map(PathBuf::from).find(|path| path.is_file())
}

/// The commands that install the build tools on this system, shown before anything runs.
/// Only these four packages are named: they pull in no second Node or Python tool chain.
fn install_plan() -> Vec<Vec<String>> {
    let text = |items: &[&str]| items.iter().map(|item| item.to_string()).collect::<Vec<_>>();
    if cfg!(windows) {
        let mut plan = Vec::new();
        let pacman_path = match pacman() {
            Some(path) => path.to_string_lossy().to_string(),
            None => {
                plan.push(text(&["winget", "install", "--id", "MSYS2.MSYS2", "-e", "--silent", "--accept-source-agreements", "--accept-package-agreements"]));
                "C:\\msys64\\usr\\bin\\pacman.exe".to_string()
            }
        };
        let mut step = vec![pacman_path, "-S".to_string(), "--needed".to_string(), "--noconfirm".to_string()];
        step.extend(MSYS_PACKAGES.iter().map(|name| format!("mingw-w64-ucrt-x86_64-{name}")));
        plan.push(step);
        plan
    } else if cfg!(target_os = "macos") {
        vec![text(&["xcode-select", "--install"]), text(&["brew", "install", "cmake", "ninja", "sdl2"])]
    } else {
        vec![text(&["pkexec", "apt-get", "install", "-y", "build-essential", "cmake", "ninja-build", "libsdl2-dev"])]
    }
}

#[tauri::command]
pub fn tools_plan() -> Vec<String> {
    install_plan().iter().map(|step| step.join(" ")).collect()
}

/// Runs the plan in the background; output comes as native-log, the end as tools-exit.
#[tauri::command]
pub fn tools_install(app: AppHandle, state: tauri::State<NativeState>) -> Result<(), String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("already running".into());
    }
    state.stopped.store(false, Ordering::SeqCst);
    let handles = NativeHandles { child: state.child.clone(), stopped: state.stopped.clone() };
    let running = state.running.clone();
    std::thread::spawn(move || {
        let mut result = Ok(());
        for step in install_plan() {
            emit_line(&app, "build", &format!("> {}", step.join(" ")));
            let mut cmd = command(&step[0]);
            cmd.args(&step[1..]);
            match run_step(&app, &handles, cmd, "build") {
                Ok(Some(0)) => {}
                Ok(code) => {
                    result = Err(format!("{} ended with code {}", step[0], code.unwrap_or(-1)));
                    break;
                }
                Err(message) => {
                    result = Err(format!("{}: {message}", step[0]));
                    break;
                }
            }
        }
        running.store(false, Ordering::SeqCst);
        if let Err(message) = &result {
            emit_line(&app, "error", message);
        }
        let _ = app.emit("tools-exit", json!({ "ok": result.is_ok(), "error": result.err() }));
    });
    Ok(())
}

/// Starts in the background and returns at once; the page follows the events.
#[tauri::command]
pub fn native_run(app: AppHandle, state: tauri::State<NativeState>, version: String, files: BTreeMap<String, String>) -> Result<(), String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("already running".into());
    }
    state.stopped.store(false, Ordering::SeqCst);
    let handles = NativeHandles { child: state.child.clone(), stopped: state.stopped.clone() };
    let running = state.running.clone();
    std::thread::spawn(move || {
        let result = build_and_run(&app, &handles, &version, &files);
        running.store(false, Ordering::SeqCst);
        let payload = match result {
            Ok(outcome) => json!({ "ok": true, "outcome": outcome }),
            Err(message) => {
                emit_line(&app, "error", &message);
                json!({ "ok": false, "error": message })
            }
        };
        let _ = app.emit("native-exit", payload);
    });
    Ok(())
}

#[tauri::command]
pub fn native_stop(state: tauri::State<NativeState>) {
    state.stopped.store(true, Ordering::SeqCst);
    if let Some(child) = state.child.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
        let _ = child.kill();
    }
}

/// The studio is closing: the program it started goes with it.
pub fn stop_all(app: &AppHandle) {
    if let Some(state) = app.try_state::<NativeState>() {
        state.stopped.store(true, Ordering::SeqCst);
        if let Some(child) = state.child.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            let _ = child.kill();
        }
    }
}
