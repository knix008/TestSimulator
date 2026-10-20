//! The PyTorch engine's Python side: finding the Pythons on this computer (and
//! whether they already have PyTorch), installing PyTorch into MyTrainer's own
//! virtual environment when none has it, and running a training script.
//!
//! Detection looks everywhere a Python usually lives — MYTRAINER_PYTHON, the
//! app's own environment, an active venv / conda environment, PATH, the Windows
//! `py` launcher, the usual install folders, conda / pyenv installs — and asks
//! each one (python/env_probe.py) for its version and its PyTorch. A Python that
//! already has PyTorch is used as it is; installing is only offered otherwise.
//!
//! A run gets its own folder (data dir/runs/<id>) with the script, the bridge
//! module and the prepared data. Its stdout lines starting with "@@MT " are the
//! bridge's messages (event `py-message`); everything else is console output
//! (`py-output`). Commands go to the script's stdin as JSON lines.
use crate::tr;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const PROBE_SCRIPT: &str = include_str!("../../python/env_probe.py");
pub const BRIDGE_SCRIPT: &str = include_str!("../../python/mytrainer_bridge.py");
const PROBE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct PythonInfo {
    pub path: PathBuf,
    pub executable: String,
    pub version: String,
    pub implementation: String,
    pub bits: u32,
    pub venv: bool,
    pub torch: Option<String>,
    pub cuda: bool,
    pub cuda_version: Option<String>,
    pub gpu: Option<String>,
    pub mps: bool,
    pub numpy: Option<String>,
    pub pip: bool,
    pub venv_module: bool,
    pub error: Option<String>,
    /// Where it was found: "env", "app", "venv", "conda", "path", "launcher", "folder".
    #[serde(default)]
    pub source: String,
    /// MyTrainer's own environment (data dir/pyenv).
    #[serde(default)]
    pub own: bool,
}

impl PythonInfo {
    /// (major, minor) of the version, (0, 0) when unknown.
    pub fn version_pair(&self) -> (u32, u32) {
        let mut parts = self.version.split('.').map(|part| part.parse::<u32>().unwrap_or(0));
        (parts.next().unwrap_or(0), parts.next().unwrap_or(0))
    }

    /// PyTorch wheels exist for 64-bit CPython 3.9 or newer.
    pub fn can_install_torch(&self) -> bool {
        let (major, minor) = self.version_pair();
        self.implementation == "CPython" && self.bits == 64 && major == 3 && minor >= 9
    }

    pub fn has_torch(&self) -> bool {
        self.torch.is_some() && self.numpy.is_some() && self.error.is_none()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detection {
    pub pythons: Vec<PythonInfo>,
    /// The Python with PyTorch MyTrainer would use (index into `pythons`).
    pub best: Option<usize>,
    /// The Python to install PyTorch for when none has it.
    pub base: Option<usize>,
    pub env_dir: PathBuf,
    pub nvidia: bool,
    pub os: &'static str,
}

/// The app's own Python environment.
pub fn env_dir(data: &Path) -> PathBuf {
    data.join("pyenv")
}

pub fn env_python(dir: &Path) -> PathBuf {
    if cfg!(windows) {
        dir.join("Scripts").join("python.exe")
    } else {
        dir.join("bin").join("python3")
    }
}

/// A Windows Store alias ("App execution alias"): it opens the Store instead of running Python.
pub fn is_store_alias(path: &Path) -> bool {
    path.to_string_lossy().to_lowercase().contains("\\windowsapps\\")
}

fn no_window(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    command
}

fn home() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

/// Python inside a conda / venv prefix.
fn prefix_python(prefix: &Path) -> PathBuf {
    if cfg!(windows) {
        prefix.join("python.exe")
    } else {
        prefix.join("bin").join("python3")
    }
}

fn venv_python(prefix: &Path) -> PathBuf {
    if cfg!(windows) {
        prefix.join("Scripts").join("python.exe")
    } else {
        prefix.join("bin").join("python3")
    }
}

fn children(dir: &Path) -> Vec<PathBuf> {
    let mut list: Vec<PathBuf> = std::fs::read_dir(dir).map(|entries| entries.flatten().map(|entry| entry.path()).collect()).unwrap_or_default();
    list.sort();
    list
}

/// Every place a Python might be, with where it came from (not checked yet; duplicates allowed).
pub fn candidates(own_env: &Path) -> Vec<(PathBuf, &'static str)> {
    let mut out: Vec<(PathBuf, &'static str)> = Vec::new();
    if let Some(path) = std::env::var_os("MYTRAINER_PYTHON") {
        out.push((PathBuf::from(path), "env"));
    }
    out.push((env_python(own_env), "app"));
    // The portable Python MyTrainer installs when the computer has none (next to its environment).
    if let Some(data) = own_env.parent() {
        out.push((portable_python(&portable_dir(data)), "app"));
    }
    if let Some(prefix) = std::env::var_os("VIRTUAL_ENV") {
        out.push((venv_python(Path::new(&prefix)), "venv"));
    }
    if let Some(prefix) = std::env::var_os("CONDA_PREFIX") {
        out.push((prefix_python(Path::new(&prefix)), "conda"));
    }
    // PATH
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            for name in ["python3", "python"] {
                let candidate = dir.join(exe(name));
                if candidate.is_file() && !is_store_alias(&candidate) {
                    out.push((candidate, "path"));
                }
            }
        }
    }
    // The Windows launcher knows every python.org / Store install.
    #[cfg(windows)]
    for path in launcher_pythons() {
        out.push((path, "launcher"));
    }
    // Usual install folders.
    let mut folders: Vec<PathBuf> = Vec::new();
    if cfg!(windows) {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            folders.extend(children(&PathBuf::from(local).join("Programs").join("Python")));
        }
        for base in ["C:\\Program Files", "C:\\Program Files (x86)"] {
            folders.extend(children(Path::new(base)).into_iter().filter(|dir| dir.file_name().is_some_and(|name| name.to_string_lossy().to_lowercase().starts_with("python"))));
        }
        folders.extend(children(Path::new("C:\\")).into_iter().filter(|dir| dir.file_name().is_some_and(|name| name.to_string_lossy().to_lowercase().starts_with("python"))));
        for dir in folders {
            out.push((dir.join("python.exe"), "folder"));
        }
    } else {
        for path in ["/usr/bin/python3", "/usr/local/bin/python3", "/opt/homebrew/bin/python3", "/opt/local/bin/python3"] {
            out.push((PathBuf::from(path), "folder"));
        }
        if let Some(home) = home() {
            for version in children(&home.join(".pyenv").join("versions")) {
                out.push((version.join("bin").join("python3"), "folder"));
            }
        }
        if cfg!(target_os = "macos") {
            for version in children(Path::new("/Library/Frameworks/Python.framework/Versions")) {
                out.push((version.join("bin").join("python3"), "folder"));
            }
        }
    }
    // conda / mamba installs and their environments.
    if let Some(home) = home() {
        let mut roots = vec![];
        for name in ["anaconda3", "miniconda3", "miniforge3", "mambaforge", "Anaconda3", "Miniconda3", ".conda"] {
            roots.push(home.join(name));
        }
        if cfg!(windows) {
            if let Some(program_data) = std::env::var_os("ProgramData") {
                for name in ["anaconda3", "miniconda3", "Anaconda3", "Miniconda3"] {
                    roots.push(PathBuf::from(&program_data).join(name));
                }
            }
        } else {
            roots.push(PathBuf::from("/opt/conda"));
            roots.push(PathBuf::from("/opt/anaconda3"));
            roots.push(PathBuf::from("/opt/miniconda3"));
        }
        for root in roots {
            out.push((prefix_python(&root), "conda"));
            for environment in children(&root.join("envs")) {
                out.push((prefix_python(&environment), "conda"));
            }
        }
    }
    out
}

#[cfg(windows)]
fn launcher_pythons() -> Vec<PathBuf> {
    let output = no_window(&mut Command::new("py")).arg("-0p").output();
    let Ok(output) = output else { return Vec::new() };
    parse_launcher_list(&String::from_utf8_lossy(&output.stdout))
}

/// `py -0p` lines: " -V:3.12 *        C:\Python312\python.exe" → the paths.
pub fn parse_launcher_list(text: &str) -> Vec<PathBuf> {
    text.lines()
        .filter_map(|line| {
            // The path starts at its drive letter, one character before ":\".
            let start = line.find(":\\")?.checked_sub(1)?;
            Some(PathBuf::from(line[start..].trim()))
        })
        .filter(|path| path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("exe")))
        .collect()
}

/// Runs a command with a time limit; the output, or None when it failed or took too long.
fn run_with_timeout(command: &mut Command, timeout: Duration) -> Option<std::process::Output> {
    let mut child = no_window(command).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().ok()?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return child.wait_with_output().ok(),
            Ok(None) if started.elapsed() > timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return None,
        }
    }
}

/// Asks one Python about itself (python/env_probe.py, run isolated with -I).
pub fn probe(python: &Path, script: &Path) -> Option<PythonInfo> {
    let output = run_with_timeout(Command::new(python).arg("-I").arg(script).env("PYTHONIOENCODING", "utf-8"), PROBE_TIMEOUT)?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().rev().find(|line| line.trim_start().starts_with('{'))?;
    let mut info: PythonInfo = serde_json::from_str(line).ok()?;
    info.path = python.to_path_buf();
    Some(info)
}

fn canonical_key(path: &Path) -> String {
    let resolved = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let text = resolved.to_string_lossy().to_string();
    if cfg!(windows) {
        text.to_lowercase()
    } else {
        text
    }
}

/// Picks the Python to train with: one with PyTorch — CUDA first, then Apple MPS, then MyTrainer's own, newest PyTorch.
pub fn choose_best(pythons: &[PythonInfo]) -> Option<usize> {
    let mut ranked: Vec<(usize, &PythonInfo)> = pythons.iter().enumerate().filter(|(_, info)| info.has_torch()).collect();
    ranked.sort_by(|(_, a), (_, b)| {
        b.cuda
            .cmp(&a.cuda)
            .then(b.mps.cmp(&a.mps))
            .then(b.own.cmp(&a.own))
            .then(version_key(b.torch.as_deref()).cmp(&version_key(a.torch.as_deref())))
    });
    ranked.first().map(|(index, _)| *index)
}

/// The Python to create MyTrainer's environment from: a 64-bit CPython ≥ 3.9 with venv, newest first (3.13 / 3.12 preferred
/// over a brand-new release PyTorch may not support yet).
pub fn choose_base(pythons: &[PythonInfo]) -> Option<usize> {
    let mut ranked: Vec<(usize, &PythonInfo)> = pythons.iter().enumerate().filter(|(_, info)| info.can_install_torch() && !info.own && !info.venv).collect();
    ranked.sort_by_key(|(_, info)| {
        let (_, minor) = info.version_pair();
        let preferred = matches!(minor, 10..=13);
        (std::cmp::Reverse(preferred), std::cmp::Reverse(info.venv_module), std::cmp::Reverse(minor))
    });
    ranked.first().map(|(index, _)| *index)
}

fn version_key(version: Option<&str>) -> Vec<u32> {
    version.unwrap_or("0").split(['.', '+']).take(3).map(|part| part.parse().unwrap_or(0)).collect()
}

pub fn nvidia_present() -> bool {
    run_with_timeout(&mut Command::new("nvidia-smi").arg("-L"), Duration::from_secs(8)).is_some_and(|output| output.status.success() && !output.stdout.is_empty())
}

/// Finds and probes every Python (in parallel).
pub fn detect(data: &Path) -> Result<Detection, String> {
    std::fs::create_dir_all(data).map_err(|error| error.to_string())?;
    let script = data.join("env_probe.py");
    std::fs::write(&script, PROBE_SCRIPT).map_err(|error| tr!("검사 스크립트를 쓸 수 없습니다: {error}", "Could not write the probe script: {error}"))?;
    let own = env_dir(data);
    let own_python = canonical_key(&env_python(&own));
    let mut seen = std::collections::HashSet::new();
    let list: Vec<(PathBuf, &'static str)> = candidates(&own).into_iter().filter(|(path, _)| path.is_file() && !is_store_alias(path) && seen.insert(canonical_key(path))).collect();
    let handles: Vec<_> = list
        .into_iter()
        .map(|(path, source)| {
            let script = script.clone();
            std::thread::spawn(move || probe(&path, &script).map(|mut info| {
                info.source = source.to_string();
                info
            }))
        })
        .collect();
    let mut pythons: Vec<PythonInfo> = handles.into_iter().filter_map(|handle| handle.join().ok().flatten()).collect();
    // The same interpreter can be reached through two paths (a venv's python and its base): keep the first.
    let mut executables = std::collections::HashSet::new();
    pythons.retain(|info| executables.insert(canonical_key(Path::new(&info.executable))));
    for info in &mut pythons {
        info.own = canonical_key(&info.path) == own_python;
    }
    let best = choose_best(&pythons);
    let base = choose_base(&pythons);
    Ok(Detection { pythons, best, base, env_dir: own, nvidia: nvidia_present(), os: std::env::consts::OS })
}

// ───────────────────────── installing

/// Where install output goes: (stage, line). The app sends it to the window, `--setup-python` prints it.
pub type Log<'a> = &'a (dyn Fn(&str, &str) + Sync);

/// The app's log: every line becomes a `py-install` event for the Python popup.
pub fn app_log(app: &AppHandle) -> impl Fn(&str, &str) + Sync + '_ {
    move |stage: &str, text: &str| {
        let _ = app.emit("py-install", InstallLine { stage: stage.into(), text: text.into() });
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallLine {
    stage: String,
    text: String,
}

/// Runs a command, logging every output line; fails when it exits with an error.
fn run_logged(log: Log, stage: &str, command: &mut Command, cancel: &Arc<Mutex<bool>>) -> Result<(), String> {
    let shown = format!("{:?}", command).replace('"', "");
    log(stage, &format!("$ {shown}"));
    let mut child = no_window(command)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PIP_DISABLE_PIP_VERSION_CHECK", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| tr!("실행할 수 없습니다 ({shown}): {error}", "Could not run ({shown}): {error}"))?;
    let stderr = child.stderr.take();
    let errors = Mutex::new(Vec::<String>::new());
    let status = std::thread::scope(|scope| {
        scope.spawn(|| {
            if let Some(stderr) = stderr {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    if let Ok(mut list) = errors.lock() {
                        list.push(line.clone());
                        if list.len() > 40 {
                            list.remove(0);
                        }
                    }
                    log(stage, &line);
                }
            }
        });
        if let Some(stdout) = child.stdout.take() {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                log(stage, &line);
                if *cancel.lock().unwrap_or_else(|p| p.into_inner()) {
                    let _ = child.kill();
                    break;
                }
            }
        }
        child.wait().map_err(|error| error.to_string())
    })?;
    if *cancel.lock().unwrap_or_else(|p| p.into_inner()) {
        return Err(tr!("설치를 취소했습니다.", "The installation was cancelled."));
    }
    if status.success() {
        Ok(())
    } else {
        let tail = errors.lock().map(|list| list.join("\n")).unwrap_or_default();
        Err(tr!("{shown} 이(가) 실패했습니다 (종료 코드 {}).\n{tail}", "{shown} failed (exit code {}).\n{tail}", status.code().unwrap_or(-1)))
    }
}

/// Which wheel index to install PyTorch from.
pub fn torch_index(variant: &str) -> Option<&'static str> {
    if cfg!(target_os = "macos") {
        return None; // the PyPI wheels include Apple's MPS
    }
    match variant {
        "cuda" => Some("https://download.pytorch.org/whl/cu126"),
        "cpu" => Some("https://download.pytorch.org/whl/cpu"),
        _ => None,
    }
}

pub static INSTALL_CANCEL: std::sync::OnceLock<Arc<Mutex<bool>>> = std::sync::OnceLock::new();

pub fn cancel_flag() -> Arc<Mutex<bool>> {
    INSTALL_CANCEL.get_or_init(|| Arc::new(Mutex::new(false))).clone()
}

fn reset_cancel() -> Arc<Mutex<bool>> {
    let cancel = cancel_flag();
    *cancel.lock().unwrap_or_else(|p| p.into_inner()) = false;
    cancel
}

/// Creates MyTrainer's own environment from `base` and installs PyTorch and NumPy into it. Returns its Python.
pub fn install_torch(log: Log, data: &Path, base: &Path, variant: &str) -> Result<PathBuf, String> {
    let cancel = reset_cancel();
    let dir = env_dir(data);
    let python = env_python(&dir);
    if !python.is_file() {
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
        run_logged(log, "venv", Command::new(base).arg("-m").arg("venv").arg(&dir), &cancel)?;
    }
    run_logged(log, "pip", Command::new(&python).args(["-m", "pip", "install", "--upgrade", "pip"]), &cancel)?;
    let mut torch = Command::new(&python);
    torch.args(["-m", "pip", "install", "--upgrade", "torch"]);
    if let Some(index) = torch_index(variant) {
        torch.args(["--index-url", index]);
    }
    run_logged(log, "torch", &mut torch, &cancel)?;
    run_logged(log, "numpy", Command::new(&python).args(["-m", "pip", "install", "--upgrade", "numpy"]), &cancel)?;
    Ok(python)
}

/// A portable CPython (python-build-standalone) MyTrainer installs for itself when the computer has none.
pub fn portable_dir(data: &Path) -> PathBuf {
    data.join("python")
}

pub fn portable_python(dir: &Path) -> PathBuf {
    if cfg!(windows) {
        dir.join("python.exe")
    } else {
        dir.join("bin").join("python3")
    }
}

const PORTABLE_RELEASE: &str = "20241016";
const PORTABLE_VERSION: &str = "3.12.7";

/// The python-build-standalone archive for this computer, None when there is none.
pub fn portable_url() -> Option<String> {
    let target = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
        _ => return None,
    };
    Some(format!(
        "https://github.com/astral-sh/python-build-standalone/releases/download/{PORTABLE_RELEASE}/cpython-{PORTABLE_VERSION}+{PORTABLE_RELEASE}-{target}-install_only.tar.gz"
    ))
}

/// curl and tar: Windows 10 and newer have both in System32 (preferred over other copies on PATH).
fn system_tool(name: &str) -> PathBuf {
    if cfg!(windows) {
        if let Some(root) = std::env::var_os("SystemRoot") {
            let path = PathBuf::from(root).join("System32").join(exe(name));
            if path.is_file() {
                return path;
            }
        }
    }
    PathBuf::from(name)
}

/// Downloads and unpacks the portable Python into data dir/python. Returns its Python.
fn install_portable(log: Log, data: &Path, cancel: &Arc<Mutex<bool>>) -> Result<PathBuf, String> {
    let url = portable_url().ok_or_else(|| tr!("이 운영체제용 Python 배포본이 없습니다.", "There is no Python build for this system."))?;
    let dir = portable_dir(data);
    let unpack = data.join("python-download");
    let _ = std::fs::remove_dir_all(&unpack);
    std::fs::create_dir_all(&unpack).map_err(|error| error.to_string())?;
    let archive = unpack.join("python.tar.gz");
    log("python", &tr!("Python {PORTABLE_VERSION} 내려받는 중… (약 30 MB)", "Downloading Python {PORTABLE_VERSION}… (about 30 MB)"));
    run_logged(log, "python", Command::new(system_tool("curl")).args(["-L", "--fail", "--silent", "--show-error", "--retry", "3", "-o"]).arg(&archive).arg(&url), cancel)?;
    run_logged(log, "python", Command::new(system_tool("tar")).arg("-xzf").arg(&archive).arg("-C").arg(&unpack), cancel)?;
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::rename(unpack.join("python"), &dir).map_err(|error| error.to_string())?;
    let _ = std::fs::remove_dir_all(&unpack);
    let python = portable_python(&dir);
    if python.is_file() {
        Ok(python)
    } else {
        Err(tr!("Python 을 풀었지만 {} 이(가) 없습니다.", "Python was unpacked but {} is missing.", python.display()))
    }
}

/// Installs Python itself: on Windows with winget (per user), otherwise — or when that fails — a portable Python of MyTrainer's own.
pub fn install_python(log: Log, data: &Path) -> Result<(), String> {
    let cancel = reset_cancel();
    if cfg!(windows) {
        let winget = run_logged(
            log,
            "python",
            Command::new("winget").args(["install", "--id", "Python.Python.3.12", "-e", "--scope", "user", "--silent", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"]),
            &cancel,
        );
        match winget {
            Ok(()) => return Ok(()),
            Err(_) if *cancel.lock().unwrap_or_else(|p| p.into_inner()) => return winget,
            Err(error) => log("python", &tr!("winget 설치 실패 — 휴대용 Python 으로 대신합니다. ({error})", "winget failed — using a portable Python instead. ({error})")),
        }
    }
    install_portable(log, data, &cancel).map(|_| ())
}

/// The PyTorch variant to install: CUDA when there is an NVIDIA GPU (not on macOS, where the default wheel has MPS).
pub fn auto_variant(nvidia: bool) -> &'static str {
    if cfg!(target_os = "macos") {
        "default"
    } else if nvidia {
        "cuda"
    } else {
        "cpu"
    }
}

/// Makes sure a Python with PyTorch exists: nothing when one does; otherwise installs Python (when
/// there is none to build on) and PyTorch. Returns the Python to use.
pub fn setup(log: Log, data: &Path) -> Result<PathBuf, String> {
    log("detect", &tr!("Python / PyTorch 를 찾는 중…", "Looking for Python / PyTorch…"));
    let mut detection = detect(data)?;
    if let Some(best) = detection.best {
        let info = &detection.pythons[best];
        log("done", &tr!("PyTorch {} 이(가) 이미 설치되어 있습니다: {}", "PyTorch {} is already installed: {}", info.torch.as_deref().unwrap_or("?"), info.path.display()));
        return Ok(info.path.clone());
    }
    if detection.base.is_none() {
        log("python", &tr!("PyTorch 를 설치할 Python 이 없어 Python 을 설치합니다.", "There is no Python to install PyTorch for, so Python is installed first."));
        install_python(log, data)?;
        detection = detect(data)?;
    }
    let base = detection.base.map(|index| detection.pythons[index].path.clone());
    let base = match base {
        Some(base) => base,
        // winget installed a Python that is not visible yet (a new PATH): fall back to the portable one.
        None => install_portable(log, data, &reset_cancel())?,
    };
    let variant = auto_variant(detection.nvidia);
    log("torch", &tr!("PyTorch ({variant}) 를 설치합니다 — 기준 Python: {}", "Installing PyTorch ({variant}) — base Python: {}", base.display()));
    let python = install_torch(log, data, &base, variant)?;
    log("done", &tr!("설치를 마쳤습니다: {}", "Installed: {}", python.display()));
    Ok(python)
}

/// The app's data folder without a running app (the same folder Tauri's app_data_dir gives).
pub fn default_data_dir(identifier: &str) -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("MYTRAINER_DATA_DIR") {
        return Some(PathBuf::from(dir));
    }
    let base = if cfg!(windows) {
        PathBuf::from(std::env::var_os("APPDATA")?)
    } else if cfg!(target_os = "macos") {
        home()?.join("Library").join("Application Support")
    } else {
        std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).filter(|dir| dir.is_absolute()).or_else(|| home().map(|home| home.join(".local").join("share")))?
    };
    Some(base.join(identifier))
}

// ───────────────────────── runs

pub struct Run {
    child: Child,
    stdin: Option<ChildStdin>,
}

#[derive(Default)]
pub struct Runs {
    pub map: HashMap<String, Run>,
}

pub type RunState = Mutex<Runs>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunFile {
    pub name: String,
    /// base64 (binary data files) or plain text.
    pub data: String,
    #[serde(default)]
    pub base64: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunLine {
    run: String,
    stream: &'static str,
    text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunExit {
    run: String,
    code: Option<i32>,
}

/// Keeps the newest `keep` run folders.
fn prune_runs(dir: &Path, keep: usize) {
    let mut list = children(dir);
    list.sort();
    let excess = list.len().saturating_sub(keep);
    for old in list.into_iter().take(excess) {
        let _ = std::fs::remove_dir_all(old);
    }
}

fn safe_name(name: &str) -> Option<&str> {
    let ok = !name.is_empty() && name.len() < 120 && !name.contains(['/', '\\', ':']) && !name.starts_with('.');
    ok.then_some(name)
}

/// Writes the run folder and starts `python -u script.py` in it. Returns the run id.
pub fn start_run(app: &AppHandle, state: &RunState, data: &Path, python: &Path, code: &str, files: Vec<RunFile>) -> Result<String, String> {
    use base64::Engine;
    let runs = data.join("runs");
    std::fs::create_dir_all(&runs).map_err(|error| error.to_string())?;
    prune_runs(&runs, 6);
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let id = format!("run-{stamp}");
    let dir = runs.join(&id);
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    std::fs::write(dir.join("train.py"), code).map_err(|error| error.to_string())?;
    std::fs::write(dir.join("mytrainer_bridge.py"), BRIDGE_SCRIPT).map_err(|error| error.to_string())?;
    for file in files {
        let name = safe_name(&file.name).ok_or_else(|| format!("bad file name {}", file.name))?;
        let bytes = if file.base64 {
            base64::engine::general_purpose::STANDARD.decode(file.data.as_bytes()).map_err(|error| error.to_string())?
        } else {
            file.data.into_bytes()
        };
        std::fs::write(dir.join(name), bytes).map_err(|error| error.to_string())?;
    }
    let mut child = no_window(&mut Command::new(python))
        .arg("-u")
        .arg("train.py")
        .current_dir(&dir)
        .env("MYTRAINER_RUN_DIR", &dir)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONPATH", &dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| tr!("Python 을 실행할 수 없습니다 ({}): {error}", "Could not start Python ({}): {error}", python.display()))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdin = child.stdin.take();
    for (stream, pipe) in [("stdout", stdout.map(|s| Box::new(s) as Box<dyn std::io::Read + Send>)), ("stderr", stderr.map(|s| Box::new(s) as Box<dyn std::io::Read + Send>))] {
        let Some(pipe) = pipe else { continue };
        let app = app.clone();
        let run = id.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                if let Some(message) = line.strip_prefix("@@MT ") {
                    let _ = app.emit("py-message", RunLine { run: run.clone(), stream, text: message.to_string() });
                } else {
                    let _ = app.emit("py-output", RunLine { run: run.clone(), stream, text: line });
                }
            }
        });
    }
    state.lock().unwrap_or_else(|p| p.into_inner()).map.insert(id.clone(), Run { child, stdin });
    // Watches for the end of the run.
    let app2 = app.clone();
    let run = id.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(250));
        let state = tauri::Manager::state::<RunState>(&app2);
        let mut runs = state.lock().unwrap_or_else(|p| p.into_inner());
        let Some(entry) = runs.map.get_mut(&run) else { break };
        if let Ok(Some(status)) = entry.child.try_wait() {
            runs.map.remove(&run);
            drop(runs);
            // Let the output threads deliver the last lines first.
            std::thread::sleep(Duration::from_millis(300));
            let _ = app2.emit("py-exit", RunExit { run: run.clone(), code: status.code() });
            break;
        }
    });
    Ok(id)
}

pub fn send(state: &RunState, run: &str, line: &str) -> Result<(), String> {
    let mut runs = state.lock().unwrap_or_else(|p| p.into_inner());
    let entry = runs.map.get_mut(run).ok_or_else(|| tr!("실행 중인 학습이 없습니다.", "That run is not active."))?;
    let stdin = entry.stdin.as_mut().ok_or_else(|| "stdin closed".to_string())?;
    stdin.write_all(line.as_bytes()).and_then(|_| stdin.write_all(b"\n")).and_then(|_| stdin.flush()).map_err(|error| error.to_string())
}

pub fn stop(state: &RunState, run: &str) {
    let mut runs = state.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(entry) = runs.map.get_mut(run) {
        entry.stdin.take();
        let _ = entry.child.kill();
    }
}

pub fn stop_all(state: &RunState) {
    let mut runs = state.lock().unwrap_or_else(|p| p.into_inner());
    for entry in runs.map.values_mut() {
        let _ = entry.child.kill();
    }
    runs.map.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info(version: &str, torch: Option<&str>) -> PythonInfo {
        PythonInfo { version: version.into(), implementation: "CPython".into(), bits: 64, torch: torch.map(String::from), numpy: torch.map(|_| "2.0".to_string()), venv_module: true, ..Default::default() }
    }

    #[test]
    fn parses_the_windows_launcher_list() {
        let text = " -V:3.14 *        C:\\Users\\me\\AppData\\Local\\Programs\\Python\\Python314\\python.exe\n -V:3.12          C:\\Python312\\python.exe\n";
        let paths = parse_launcher_list(text);
        assert_eq!(paths.len(), 2);
        assert!(paths[0].to_string_lossy().ends_with("Python314\\python.exe"));
        assert_eq!(paths[1], PathBuf::from("C:\\Python312\\python.exe"));
    }

    #[test]
    fn store_aliases_are_skipped() {
        assert!(is_store_alias(Path::new("C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe")));
        assert!(!is_store_alias(Path::new("C:\\Python312\\python.exe")));
    }

    #[test]
    fn an_installed_torch_wins_and_cuda_is_preferred() {
        let pythons = vec![info("3.12.1", None), info("3.11.4", Some("2.3.0")), PythonInfo { cuda: true, ..info("3.10.0", Some("2.1.0")) }];
        assert_eq!(choose_best(&pythons), Some(2));
        assert_eq!(choose_best(&pythons[..2]), Some(1));
        assert_eq!(choose_best(&pythons[..1]), None);
    }

    #[test]
    fn the_install_base_is_a_supported_cpython() {
        let pythons = vec![
            PythonInfo { bits: 32, ..info("3.12.0", None) },
            info("3.8.10", None),
            info("3.14.0", None),
            info("3.12.3", None),
        ];
        assert_eq!(choose_base(&pythons), Some(3), "3.12 is preferred over a brand-new 3.14");
        assert_eq!(choose_base(&pythons[..3]), Some(2));
        assert_eq!(choose_base(&pythons[..2]), None);
    }

    #[test]
    fn the_probe_reports_this_computers_python() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("probe.py");
        std::fs::write(&script, PROBE_SCRIPT).unwrap();
        let found: Vec<PythonInfo> = candidates(dir.path()).into_iter().filter(|(path, _)| path.is_file()).take(3).filter_map(|(path, _)| probe(&path, &script)).collect();
        // A computer without Python is fine; one with Python must answer with its version.
        for python in found {
            assert!(python.version.starts_with('3'), "{python:?}");
        }
    }

    #[test]
    fn run_file_names_stay_in_the_run_folder() {
        assert!(safe_name("meta.json").is_some());
        assert!(safe_name("../x").is_none());
        assert!(safe_name("a\\b").is_none());
        assert!(safe_name("").is_none());
    }

    #[test]
    fn a_portable_python_exists_for_this_computer() {
        let url = portable_url().expect("a python-build-standalone target");
        assert!(url.starts_with("https://github.com/astral-sh/python-build-standalone/releases/download/"));
        assert!(url.ends_with("-install_only.tar.gz"));
        // MyTrainer's portable Python is one of the places detection looks.
        let data = Path::new("data");
        assert!(candidates(&env_dir(data)).iter().any(|(path, source)| *path == portable_python(&portable_dir(data)) && *source == "app"));
    }

    #[test]
    fn the_setup_variant_follows_the_gpu() {
        if cfg!(target_os = "macos") {
            assert_eq!(auto_variant(true), "default");
        } else {
            assert_eq!(auto_variant(true), "cuda");
            assert_eq!(auto_variant(false), "cpu");
        }
    }

    /// Downloads the portable Python and installs CPU PyTorch into it (network, ~250 MB):
    /// `cargo test --lib -- --ignored portable_python_installs_pytorch`.
    #[test]
    #[ignore]
    fn portable_python_installs_pytorch() {
        let data = tempfile::tempdir().expect("temp dir");
        let log = |stage: &str, text: &str| println!("[{stage}] {text}");
        let base = install_portable(&log, data.path(), &reset_cancel()).expect("portable Python");
        let python = install_torch(&log, data.path(), &base, "cpu").expect("PyTorch");
        let script = data.path().join("env_probe.py");
        std::fs::write(&script, PROBE_SCRIPT).expect("probe script");
        let info = probe(&python, &script).expect("probe");
        assert!(info.has_torch(), "{info:?}");
    }

    #[test]
    fn the_cli_data_folder_ends_with_the_identifier() {
        if std::env::var_os("MYTRAINER_DATA_DIR").is_none() {
            assert!(default_data_dir("com.shkwon.mytrainer").expect("a data folder").ends_with("com.shkwon.mytrainer"));
        }
    }
}
