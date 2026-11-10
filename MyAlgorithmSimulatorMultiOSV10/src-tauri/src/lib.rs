mod printing;

use serde::Serialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::Mutex;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

static PRINT_PAYLOAD: Mutex<String> = Mutex::new(String::new());

#[derive(Serialize)]
struct ToolchainStatus { desktop: bool, tools: serde_json::Map<String, serde_json::Value> }

#[derive(Serialize)]
struct RunResult {
    ok: bool,
    compiled: bool,
    compile: String,
    stdout: String,
    stderr: String,
    #[serde(rename = "elapsedMs")] elapsed_ms: u128,
}

fn first_line(command: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(command).args(args).output().ok()?;
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    let line = text.lines().find(|line| !line.trim().is_empty())?.trim().to_string();
    (!line.is_empty()).then_some(line)
}

fn tool(id: &str, command: &str, args: &[&str]) -> (String, serde_json::Value) {
    let version = first_line(command, args);
    (id.to_string(), serde_json::json!({ "installed": version.is_some(), "version": version.unwrap_or_default() }))
}

#[tauri::command]
fn toolchain_status() -> ToolchainStatus {
    let mut tools = serde_json::Map::new();
    for (id, value) in [
        tool("c", "gcc", &["--version"]),
        tool("cpp", "g++", &["--version"]),
        tool("java", "javac", &["-version"]),
        tool("python", "python", &["--version"]),
        tool("go", "go", &["version"]),
        tool("rust", "rustc", &["--version"]),
        tool("javascript", "node", &["--version"]),
    ] { tools.insert(id, value); }
    ToolchainStatus { desktop: true, tools }
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text_file(path: String, text: String) -> Result<(), String> {
    std::fs::write(&path, text).map_err(|error| error.to_string())
}

#[tauri::command]
fn quit(app: AppHandle) { app.exit(0); }

struct Built { binary: PathBuf, log: String, compiled: bool }

fn command_log(output: &std::process::Output) -> String {
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    let err = String::from_utf8_lossy(&output.stderr);
    if !err.is_empty() {
        if !text.is_empty() && !text.ends_with('\n') { text.push('\n'); }
        text.push_str(&err);
    }
    text
}

/// Compiles in a child process. Python and JavaScript have no compile step.
/// Go is built here so its compile log is separate from the program output.
fn compile(language: &str, dir: &PathBuf) -> Result<Built, String> {
    let prog = dir.join(if cfg!(windows) { "prog.exe" } else { "prog" });
    let (program, args): (&str, Vec<String>) = match language {
        "c" => ("gcc", vec!["-O2".into(), "-o".into(), prog.display().to_string(), "main.c".into()]),
        "cpp" => ("g++", vec!["-std=c++17".into(), "-O2".into(), "-o".into(), prog.display().to_string(), "main.cpp".into()]),
        "java" => ("javac", vec!["Main.java".into()]),
        "rust" => ("rustc", vec!["-O".into(), "-o".into(), prog.display().to_string(), "main.rs".into()]),
        "go" => ("go", vec!["build".into(), "-o".into(), prog.display().to_string(), "main.go".into()]),
        "python" => return Ok(Built { binary: PathBuf::new(), log: "python main.py".into(), compiled: false }),
        "javascript" => return Ok(Built { binary: PathBuf::new(), log: "node main.js".into(), compiled: false }),
        other => return Err(format!("unsupported language: {other}")),
    };
    let output = Command::new(program).args(&args).current_dir(dir).output().map_err(|error| format!("{program}: {error}"))?;
    let log = command_log(&output);
    if !output.status.success() {
        return Err(if log.trim().is_empty() { format!("{program} exited with {}", output.status) } else { log });
    }
    let binary = if language == "java" { PathBuf::new() } else { prog };
    Ok(Built { binary, log, compiled: true })
}

fn kill_tree(pid: u32) {
    #[cfg(windows)]
    { let _ = Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]).output(); }
    #[cfg(not(windows))]
    { let _ = Command::new("kill").args(["-9", &pid.to_string()]).output(); }
}

fn run_child(mut command: Command, input: &str, built: Built) -> Result<RunResult, String> {
    let started = Instant::now();
    let mut child = command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|error| error.to_string())?;
    if let Some(mut stdin) = child.stdin.take() { let _ = stdin.write_all(input.as_bytes()); }
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let out_thread = std::thread::spawn(move || { let mut buf = Vec::new(); let mut pipe = stdout; let _ = pipe.read_to_end(&mut buf); buf });
    let err_thread = std::thread::spawn(move || { let mut buf = Vec::new(); let mut pipe = stderr; let _ = pipe.read_to_end(&mut buf); buf });
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? { break status; }
        if started.elapsed() > Duration::from_secs(15) {
            kill_tree(child.id());
            let _ = child.wait();
            return Ok(RunResult { ok: false, compiled: built.compiled, compile: built.log, stdout: String::new(), stderr: "Time limit exceeded (15s)".into(), elapsed_ms: started.elapsed().as_millis() });
        }
        std::thread::sleep(Duration::from_millis(30));
    };
    let clip = |bytes: Vec<u8>| { let mut text = String::from_utf8_lossy(&bytes).to_string(); if text.len() > 100_000 { text.truncate(100_000); text.push_str("\n…"); } text };
    Ok(RunResult { ok: status.success(), compiled: built.compiled, compile: built.log, stdout: clip(out_thread.join().unwrap_or_default()), stderr: clip(err_thread.join().unwrap_or_default()), elapsed_ms: started.elapsed().as_millis() })
}

fn run_code_blocking(language: String, source: String, input: String) -> Result<RunResult, String> {
    if source.len() > 1_000_000 { return Err("source is too large".into()); }
    let dir = std::env::temp_dir().join(format!("myalgosim-{}-{}", std::process::id(), Instant::now().elapsed().as_nanos()));
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let result = (|| {
        let file = match language.as_str() { "c" => "main.c", "cpp" => "main.cpp", "java" => "Main.java", "python" => "main.py", "go" => "main.go", "rust" => "main.rs", "javascript" => "main.js", other => return Err(format!("unsupported language: {other}")) };
        std::fs::write(dir.join(file), &source).map_err(|error| error.to_string())?;
        let built = match compile(&language, &dir) {
            Ok(built) => built,
            Err(log) => return Ok(RunResult { ok: false, compiled: true, compile: log, stdout: String::new(), stderr: String::new(), elapsed_ms: 0 }),
        };
        let mut command = match language.as_str() {
            "python" => Command::new("python"),
            "javascript" => Command::new("node"),
            "java" => Command::new("java"),
            _ => Command::new(&built.binary),
        };
        match language.as_str() {
            "python" => { command.arg("main.py"); }
            "javascript" => { command.arg("main.js"); }
            "java" => { command.args(["-cp", ".", "Main"]); }
            _ => {}
        }
        command.current_dir(&dir);
        run_child(command, &input, built)
    })();
    let _ = std::fs::remove_dir_all(&dir);
    result
}

/// Compile and run stay in child processes. The command itself waits on a
/// worker thread so the window keeps handling input.
#[tauri::command]
async fn run_code(language: String, source: String, input: String) -> Result<RunResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_code_blocking(language, source, input)).await.map_err(|error| error.to_string())?
}

/// winget package id on Windows, brew/apt package name everywhere else.
fn package_of(language: &str) -> Result<(&'static str, &'static str), String> {
    Ok(match language {
        "c" | "cpp" => ("BrechtSanders.WinLibs.POSIX.UCRT", "gcc"),
        "java" => ("Microsoft.OpenJDK.21", "openjdk"),
        "python" => ("Python.Python.3.13", "python"),
        "go" => ("GoLang.Go", "go"),
        "rust" => ("Rustlang.Rustup", "rustup"),
        "javascript" => ("OpenJS.NodeJS", "node"),
        other => return Err(format!("nothing to install for {other}")),
    })
}

fn stream_lines(app: AppHandle, pipe: impl Read + Send + 'static) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        for line in BufReader::new(pipe).lines() {
            let Ok(line) = line else { break };
            let _ = app.emit("install-progress", serde_json::json!({ "line": line }));
        }
    })
}

fn install_toolchain_blocking(app: AppHandle, language: String) -> Result<(), String> {
    let (winget_id, package) = package_of(&language)?;
    let (program, args): (&str, Vec<String>) = if cfg!(windows) {
        ("winget", vec!["install".into(), "-e".into(), "--id".into(), winget_id.into(), "--accept-package-agreements".into(), "--accept-source-agreements".into()])
    } else if cfg!(target_os = "macos") {
        ("brew", vec!["install".into(), package.into()])
    } else {
        let manager = if Command::new("apt-get").arg("--version").output().is_ok() { "apt-get" } else { "dnf" };
        let linux_pkg = match language.as_str() { "c" | "cpp" => "build-essential", "java" => "default-jdk", "python" => "python3", "go" => "golang-go", "rust" => "rustc", "javascript" => "nodejs", _ => package };
        ("sudo", vec![manager.into(), "install".into(), "-y".into(), linux_pkg.into()])
    };
    let mut child = Command::new(program).args(&args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|error| format!("{program}: {error}"))?;
    let mut readers = Vec::new();
    if let Some(pipe) = child.stdout.take() { readers.push(stream_lines(app.clone(), pipe)); }
    if let Some(pipe) = child.stderr.take() { readers.push(stream_lines(app.clone(), pipe)); }
    let status = child.wait().map_err(|error| error.to_string())?;
    for reader in readers { let _ = reader.join(); }
    status.success().then_some(()).ok_or_else(|| format!("{program} exited with {status}"))
}

#[tauri::command]
async fn install_toolchain(app: AppHandle, language: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || install_toolchain_blocking(app, language)).await.map_err(|error| error.to_string())?
}

fn safe_token(value: &str) -> String {
    value.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(32).collect()
}

fn guide_target(raw: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(raw).map_err(|error| error.to_string())?;
    let host = url.host_str().unwrap_or("");
    let local = host == "127.0.0.1" || host == "localhost" || host == "tauri.localhost";
    let path_ok = url.path() == "/doc/UsersGuide.html" || url.path() == "/doc/UsersGuide.en.html";
    if !local || !path_ok || (url.scheme() != "http" && url.scheme() != "https") {
        return Err("invalid guide address".into());
    }
    Ok(url)
}

/// Opens the guide document itself. A window that is already open is destroyed
/// first: navigating that webview can stall the UI thread, so the window
/// neither paints nor closes.
#[tauri::command]
async fn open_guide_window(app: AppHandle, title: String, url: String, lang: String, theme: String, dark: bool) -> Result<(), String> {
    let target = guide_target(&url)?;
    let label = "doc-guide";
    let lang = if safe_token(&lang) == "en" { "en" } else { "ko" };
    let theme = safe_token(&theme);
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.destroy();
        let _ = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(150))).await;
    }
    let script = format!("window.__GUIDE__={{lang:\"{lang}\",theme:\"{theme}\"}};");
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(target))
        .title(title)
        .inner_size(1120.0, 800.0)
        .min_inner_size(720.0, 480.0)
        .center()
        .resizable(true)
        .decorations(true)
        .focused(true)
        .theme(Some(if dark { Theme::Dark } else { Theme::Light }))
        .initialization_script(&script)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_print_payload(payload: String) {
    if let Ok(mut slot) = PRINT_PAYLOAD.lock() { *slot = payload; }
}

#[tauri::command]
fn get_print_payload() -> String {
    PRINT_PAYLOAD.lock().map(|slot| slot.clone()).unwrap_or_default()
}

/// Opens the print window, or brings it forward and reloads the sheet.
#[tauri::command]
fn open_print_window(app: AppHandle, title: String, lang: String, theme: String, dark: bool) -> Result<(), String> {
    let label = "doc-print";
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.set_theme(Some(if dark { Theme::Dark } else { Theme::Light }));
        let _ = window.eval("window.dispatchEvent(new Event('print-refresh'))");
        return Ok(());
    }
    let lang = if safe_token(&lang) == "en" { "en" } else { "ko" };
    let theme = safe_token(&theme);
    let script = format!("window.__PRINT__={{lang:\"{lang}\",theme:\"{theme}\"}};");
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App("print.html".into()))
        .title(title)
        .inner_size(1100.0, 780.0)
        .min_inner_size(760.0, 520.0)
        .center()
        .resizable(true)
        .decorations(true)
        .theme(Some(if dark { Theme::Dark } else { Theme::Light }))
        .initialization_script(&script)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_printers() -> printing::PrinterList {
    printing::printers()
}

#[tauri::command]
async fn print_direct(window: WebviewWindow, job: printing::PrintJob) -> Result<(), String> {
    printing::print(&window, job).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![toolchain_status, read_text_file, write_text_file, run_code, install_toolchain, quit, open_guide_window, open_print_window, set_print_payload, get_print_payload, list_printers, print_direct])
        .run(tauri::generate_context!())
        .expect("error while running MyAlgorithmSimulator");
}
