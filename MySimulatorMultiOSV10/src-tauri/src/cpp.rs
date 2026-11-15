//! C++ translation of a MATLAB script: find or install a MinGW g++, compile the
//! translated program, and return the JSON the result window draws.

use serde::Serialize;
use sim_core::mlang::cppgen::{self, HEADER, RUNTIME};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const KIT_URL: &str = "https://github.com/skeeto/w64devkit/releases/download/v2.11.0/w64devkit-x64-2.11.0.7z.exe";
const KIT_LABEL: &str = "w64devkit 2.11.0";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CppStatus {
    pub ready: bool,
    /// "managed", "system", or "none".
    pub source: String,
    pub version: String,
    pub path: String,
    pub managed_installed: bool,
}

struct Compiler {
    path: PathBuf,
    version: String,
    managed: bool,
}

fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("MYSIMULATOR_CONFIG_DIR") {
        return Ok(PathBuf::from(dir));
    }
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn managed_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("toolchain").join("mingw"))
}

fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let _ = cmd;
}

fn output_text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).chars().take(6000).collect()
}

fn gxx_version(path: &Path) -> Option<String> {
    let mut cmd = Command::new(path);
    cmd.arg("-dumpmachine");
    no_window(&mut cmd);
    let machine = cmd.output().ok()?;
    if !machine.status.success() {
        return None;
    }
    let machine = String::from_utf8_lossy(&machine.stdout).to_ascii_lowercase();
    if !machine.contains("mingw") {
        return None;
    }
    let mut cmd = Command::new(path);
    cmd.arg("--version");
    no_window(&mut cmd);
    let out = cmd.output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    Some(text.lines().next().unwrap_or("g++").trim().to_string())
}

fn find_exe(dir: &Path, depth: usize) -> Option<PathBuf> {
    if depth == 0 || !dir.is_dir() {
        return None;
    }
    let mut nested = Vec::new();
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.file_name().and_then(|s| s.to_str()) == Some("g++.exe") {
            return Some(path);
        }
        if path.is_dir() {
            nested.push(path);
        }
    }
    for path in nested {
        if let Some(found) = find_exe(&path, depth - 1) {
            return Some(found);
        }
    }
    None
}

fn system_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    for dir in [
        r"C:\msys64\ucrt64\bin",
        r"C:\Msys64\ucrt64\bin",
        r"C:\msys64\mingw64\bin",
        r"C:\Msys64\mingw64\bin",
    ] {
        out.push(PathBuf::from(dir).join("g++.exe"));
    }
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            out.push(dir.join("g++.exe"));
            out.push(dir.join("g++"));
        }
    }
    out
}

fn probe_at(root: &Path) -> (bool, Option<Compiler>) {
    let managed = find_exe(&root.join("toolchain").join("mingw"), 6);
    let managed_ok = managed.as_ref().and_then(|p| gxx_version(p).map(|version| Compiler { path: p.clone(), version, managed: true }));
    if managed_ok.is_some() {
        return (true, managed_ok);
    }
    for candidate in system_candidates() {
        if let Some(version) = gxx_version(&candidate) {
            return (managed.is_some(), Some(Compiler { path: candidate, version, managed: false }));
        }
    }
    (managed.is_some(), None)
}

fn probe(app: &AppHandle) -> (bool, Option<Compiler>) {
    app_dir(app).map(|root| probe_at(&root)).unwrap_or((false, None))
}

fn status_at(root: &Path) -> CppStatus {
    let (managed_installed, compiler) = probe_at(root);
    match compiler {
        Some(c) => CppStatus {
            ready: true,
            source: if c.managed { "managed".into() } else { "system".into() },
            version: c.version,
            path: c.path.display().to_string(),
            managed_installed: c.managed || managed_installed,
        },
        None => CppStatus { ready: false, source: "none".into(), version: String::new(), path: String::new(), managed_installed },
    }
}

fn status_of(app: &AppHandle) -> CppStatus {
    app_dir(app).map(|root| status_at(&root)).unwrap_or(CppStatus { ready: false, source: "none".into(), version: String::new(), path: String::new(), managed_installed: false })
}

fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn download(url: &str, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let script = format!("$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri {} -OutFile {} -UseBasicParsing", ps_quote(url), ps_quote(&dest.display().to_string()));
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    no_window(&mut cmd);
    let out = cmd.output().map_err(|e| format!("could not start PowerShell: {e}"))?;
    if !out.status.success() {
        return Err(format!("download failed: {}", output_text(&out.stderr)));
    }
    if !dest.exists() {
        return Err("the compiler package did not download".into());
    }
    Ok(())
}

fn extract_kit(archive: &Path, dest: &Path) -> Result<(), String> {
    let _ = fs::remove_dir_all(dest);
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(archive);
    cmd.arg("-y").arg(format!("-o{}", dest.display()));
    no_window(&mut cmd);
    let out = cmd.output().map_err(|e| format!("could not extract the compiler package: {e}"))?;
    if find_exe(dest, 6).is_some() {
        return Ok(());
    }
    Err(format!("the package extracted without g++. {}", output_text(&out.stderr)))
}

pub fn install(app: &AppHandle) -> Result<CppStatus, String> {
    let dir = managed_dir(app)?;
    let _ = app.emit("cpp-progress", serde_json::json!({ "message": "download" }));
    let archive = app_dir(app)?.join("toolchain").join("w64devkit.7z.exe");
    download(KIT_URL, &archive)?;
    let _ = app.emit("cpp-progress", serde_json::json!({ "message": "extract" }));
    extract_kit(&archive, &dir)?;
    let mut found = status_of(app);
    if !found.ready {
        return Err(format!("{KIT_LABEL} installed but g++ does not run"));
    }
    if found.source == "managed" {
        found.version = format!("{} — {}", found.version, KIT_LABEL);
    }
    Ok(found)
}

fn remove_at(root: &Path) -> CppStatus {
    let _ = fs::remove_dir_all(root.join("toolchain").join("mingw"));
    let _ = fs::remove_file(root.join("toolchain").join("w64devkit.7z.exe"));
    let _ = fs::remove_dir_all(root.join("toolchain").join("cache"));
    status_at(root)
}

pub fn remove(app: &AppHandle) -> Result<CppStatus, String> {
    Ok(remove_at(&app_dir(app)?))
}

pub fn reinstall(app: &AppHandle) -> Result<CppStatus, String> {
    remove(app)?;
    install(app)
}

fn wait(child: &mut std::process::Child, limit: Duration, what: &str) -> Result<std::process::ExitStatus, String> {
    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Ok(status);
        }
        if start.elapsed() > limit {
            let _ = child.kill();
            return Err(format!("{what} took longer than {} seconds", limit.as_secs()));
        }
        std::thread::sleep(Duration::from_millis(40));
    }
}

fn with_compiler_path(cmd: &mut Command, compiler: &Path) {
    let Some(bin) = compiler.parent() else { return };
    let mut paths = vec![bin.to_path_buf()];
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }
    if let Ok(joined) = std::env::join_paths(paths) {
        cmd.env("PATH", joined);
    }
}

fn cached_object_at(root: &Path, compiler: &Compiler) -> Result<PathBuf, String> {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    RUNTIME.hash(&mut hasher);
    compiler.path.hash(&mut hasher);
    compiler.version.hash(&mut hasher);
    let dir = root.join("toolchain").join("cache").join(format!("{:x}", hasher.finish()));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let obj = dir.join("msim.o");
    if obj.exists() {
        return Ok(obj);
    }
    fs::write(dir.join("msim.hpp"), HEADER).map_err(|e| e.to_string())?;
    fs::write(dir.join("msim.cpp"), RUNTIME).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(&compiler.path);
    cmd.args(["-std=c++17", "-O2", "-c", "msim.cpp", "-o"]).arg(&obj).current_dir(&dir);
    cmd.stderr(std::process::Stdio::piped());
    with_compiler_path(&mut cmd, &compiler.path);
    no_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("could not start g++: {e}"))?;
    let status = wait(&mut child, Duration::from_secs(180), "compiling the C++ runtime")?;
    let mut log = String::new();
    if let Some(mut err) = child.stderr.take() {
        use std::io::Read;
        let _ = err.read_to_string(&mut log);
    }
    if !status.success() {
        let _ = fs::remove_file(&obj);
        return Err(format!("the C++ runtime failed to compile:\n{}", output_text(log.as_bytes())));
    }
    Ok(obj)
}

fn link_exe(compiler: &Path, dir: &Path, obj: &Path, exe: &Path) -> Result<(), String> {
    let attempts: &[&[&str]] = &[
        &["-static", "-static-libgcc", "-static-libstdc++"],
        &["-static-libgcc", "-static-libstdc++"],
        &[],
    ];
    let mut last = String::new();
    for flags in attempts {
        let mut cmd = Command::new(compiler);
        cmd.args(["-std=c++17", "-O2", "-finput-charset=UTF-8", "main.cpp"]).arg(obj).arg("-o").arg(exe).args(*flags).current_dir(dir);
        cmd.stderr(std::process::Stdio::piped()).stdout(std::process::Stdio::piped());
        with_compiler_path(&mut cmd, compiler);
        no_window(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| format!("could not start g++: {e}"))?;
        let status = wait(&mut child, Duration::from_secs(120), "compiling the script")?;
        let mut log = String::new();
        if let Some(mut err) = child.stderr.take() {
            use std::io::Read;
            let _ = err.read_to_string(&mut log);
        }
        if status.success() && exe.exists() {
            return Ok(());
        }
        last = log;
        let lower = last.to_ascii_lowercase();
        let linker = lower.contains("undefined reference") || lower.contains("cannot find") || lower.contains("ld returned") || lower.contains("collect2");
        if !linker {
            break;
        }
    }
    Err(format!("C++ compile failed:\n{}", output_text(last.as_bytes())))
}

fn run_at(root: &Path, code: &str, seed: u64) -> Result<String, String> {
    if code.trim().is_empty() {
        return Err("the script is empty".into());
    }
    let cpp = cppgen::generate(code, seed)?;
    let compiler = probe_at(root).1.ok_or_else(|| "no MinGW g++ was found".to_string())?;
    let obj = cached_object_at(root, &compiler)?;
    let dir = std::env::temp_dir().join(format!("mysimulator-cpp-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let outcome: Result<String, String> = (|| {
        fs::write(dir.join("msim.hpp"), HEADER).map_err(|e| e.to_string())?;
        fs::write(dir.join("main.cpp"), &cpp).map_err(|e| e.to_string())?;
        let exe = dir.join("sim.exe");
        link_exe(&compiler.path, &dir, &obj, &exe)?;
        let result = dir.join("result.json");
        let mut cmd = Command::new(&exe);
        cmd.arg(&result).current_dir(&dir);
        with_compiler_path(&mut cmd, &compiler.path);
        no_window(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| format!("could not start the program: {e}"))?;
        let status = wait(&mut child, Duration::from_secs(60), "the simulation")?;
        if let Ok(body) = fs::read_to_string(&result) {
            if !body.trim().is_empty() {
                return Ok(body);
            }
        }
        if status.success() {
            return Err("the C++ program finished without a result".into());
        }
        Err("the C++ program stopped before writing a result".into())
    })();
    let _ = fs::remove_dir_all(&dir);
    outcome.map_err(|e| e.to_string())
}

pub fn run(app: &AppHandle, code: &str, seed: u64) -> Result<String, String> {
    if probe(app).1.is_none() {
        install(app)?;
    }
    let _ = app.emit("cpp-progress", serde_json::json!({ "message": "compile" }));
    run_at(&app_dir(app)?, code, seed)
}

pub fn transpile(code: &str, seed: u64) -> Result<String, String> {
    cppgen::generate(code, seed)
}

#[tauri::command]
pub fn cpp_toolchain_status(app: AppHandle) -> CppStatus {
    status_of(&app)
}

#[tauri::command]
pub async fn cpp_toolchain_install(app: AppHandle) -> Result<CppStatus, String> {
    tauri::async_runtime::spawn_blocking(move || install(&app)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cpp_toolchain_remove(app: AppHandle) -> Result<CppStatus, String> {
    tauri::async_runtime::spawn_blocking(move || remove(&app)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cpp_toolchain_reinstall(app: AppHandle) -> Result<CppStatus, String> {
    tauri::async_runtime::spawn_blocking(move || reinstall(&app)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cpp_transpile(code: String, seed: Option<u64>) -> Result<String, String> {
    transpile(&code, seed.unwrap_or(1))
}

#[tauri::command]
pub async fn cpp_run(app: AppHandle, code: String, seed: Option<u64>) -> Result<String, String> {
    let seed = seed.unwrap_or(1);
    tauri::async_runtime::spawn_blocking(move || run(&app, &code, seed)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mysim-cpp-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn scalar(v: &Value, name: &str) -> f64 {
        v["scalars"].as_array().and_then(|rows| rows.iter().find(|row| row["name"] == name)).and_then(|row| row["value"].as_f64()).unwrap_or_else(|| panic!("{name} missing in {v}"))
    }

    fn check(name: &str, v: &Value) {
        match name {
            "basics" => {
                assert!(scalar(v, "residual").abs() < 1e-6, "{v}");
                assert!(scalar(v, "condition") > 1.0);
                assert!(v["text"].as_str().unwrap_or("").contains("det(A)"));
            }
            "ode" => {
                let period = scalar(v, "period_estimate");
                assert!((5.0..12.0).contains(&period), "period {period}");
                assert!(!v["series"][0]["lines"].as_array().unwrap().is_empty());
            }
            "signal" => {
                let peak = scalar(v, "peak_Hz");
                assert!((48.0..52.0).contains(&peak), "peak {peak}");
                assert_eq!(v["series"][0]["lines"].as_array().unwrap().len(), 2);
            }
            "fit" => {
                let area = scalar(v, "area");
                assert!((150.0..260.0).contains(&area), "area {area}");
                assert!(v["series"][0]["lines"].as_array().unwrap().len() >= 2);
            }
            "control" => {
                let lines = v["series"][0]["lines"].as_array().unwrap();
                assert_eq!(lines.len(), 2);
                let last = lines[0]["y"].as_array().unwrap().last().unwrap().as_f64().unwrap();
                assert!(last.abs() < 0.3, "did not settle: {last}");
            }
            "surface" => {
                assert!(scalar(v, "zmax") > 5.0);
                assert!(v["grids"][0]["z"].as_array().unwrap().len() > 100);
            }
            "table" => assert!(v["text"].as_str().unwrap_or("").contains('t')),
            "damped" => {
                let peak = scalar(v, "peak");
                assert!((0.0..1.0).contains(&peak), "peak {peak}");
                assert!(!v["series"][0]["lines"].as_array().unwrap().is_empty());
            }
            "written-later" => {
                assert!((9.5..10.5).contains(&scalar(v, "peak")), "{v}");
                assert_eq!(v["series"][0]["lines"].as_array().unwrap().len(), 1, "{v}");
            }
            other => panic!("no check for {other}"),
        }
    }

    #[test]
    fn rejects_an_empty_script_and_a_class() {
        let dir = scratch("reject");
        assert!(run_at(&dir, "   ", 1).unwrap_err().contains("empty"));
        let err = transpile("classdef Foo\nend\n", 1).unwrap_err();
        assert!(err.contains("classdef"), "{err}");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn toolchain_uses_the_system_compiler_and_delete_removes_only_the_package() {
        let Some(system) = system_candidates().into_iter().find(|path| gxx_version(path).is_some()) else {
            eprintln!("no MinGW g++; skipping toolchain test");
            return;
        };
        let dir = scratch("toolchain");
        let before = status_at(&dir);
        assert!(before.ready && before.source == "system", "{:?}", (before.ready, before.source, before.path));
        assert!(before.path.eq_ignore_ascii_case(&system.display().to_string()) || before.path.to_ascii_lowercase().contains("g++"));

        let link = dir.join("toolchain").join("mingw");
        fs::create_dir_all(link.parent().unwrap()).unwrap();
        let bin = system.parent().unwrap();
        let made = Command::new("cmd").args(["/C", "mklink", "/J"]).arg(&link).arg(bin).status().expect("mklink");
        assert!(made.success(), "could not point the package at the compiler");
        fs::write(dir.join("toolchain").join("w64devkit.7z.exe"), b"package").unwrap();
        fs::create_dir_all(dir.join("toolchain").join("cache").join("old")).unwrap();

        let managed = status_at(&dir);
        assert!(managed.ready && managed.source == "managed", "package should win: {} {}", managed.source, managed.path);
        assert!(managed.path.to_ascii_lowercase().contains("toolchain"));
        assert!(system.exists(), "the system compiler must stay");

        let after = remove_at(&dir);
        assert!(!dir.join("toolchain").join("mingw").exists());
        assert!(!dir.join("toolchain").join("w64devkit.7z.exe").exists());
        assert!(!dir.join("toolchain").join("cache").exists());
        assert!(after.ready && after.source == "system", "delete should fall back to the system compiler: {}", after.source);
        assert!(system.exists(), "delete removed the system compiler");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn every_example_and_a_new_script_compile_and_return_plots() {
        let Some(_) = system_candidates().into_iter().find(|path| gxx_version(path).is_some()) else {
            eprintln!("no MinGW g++; skipping compile test");
            return;
        };
        let dir = scratch("examples");
        let mut scripts: Vec<(&str, String)> = cppgen::examples().iter().map(|(name, code)| (*name, (*code).to_string())).collect();
        scripts.push(("written-later", "function y = twice(x)\n  y = 2 * x;\nend\na = (1:5)';\nb = twice(a);\nplot(a, b);\npeak = max(b)\n".into()));
        for (name, code) in scripts {
            let body = run_at(&dir, &code, 1).unwrap_or_else(|e| panic!("{name}: {e}"));
            let value: Value = serde_json::from_str(&body).unwrap_or_else(|e| panic!("{name} json {e}: {body}"));
            assert_eq!(value["ok"], true, "{name}: {body}");
            check(name, &value);
        }
        let missing = run_at(&dir, "not_a_builtin(1)\n", 1).unwrap_or_else(|e| panic!("{e}"));
        let missing: Value = serde_json::from_str(&missing).unwrap();
        assert_eq!(missing["ok"], false, "{missing}");
        assert!(missing["error"].as_str().unwrap_or("").contains("not_a_builtin"), "{missing}");
        assert!(dir.join("toolchain").join("cache").read_dir().unwrap().next().is_some(), "the runtime object was not cached");
        let _ = fs::remove_dir_all(dir);
    }
}
