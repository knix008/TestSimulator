//! External packages MyISOMaker needs, and installing them.
//!
//!   xorriso         create ISO, bootable ISO, full extract      (required)
//!   squashfs-tools  unsquashfs for AppImages of other formats   (optional)
//!
//! Windows: the MSYS2 packages (the program and the runtime libraries it links) are downloaded
//! from repo.msys2.org and unpacked into the app's own folder
//! (%LOCALAPPDATA%\MyISOMaker\tools\msys\usr\bin) — no MSYS2 install, no administrator rights.
//! The repository index (msys.db) gives file names, dependencies and SHA-256 sums.
//! macOS: Homebrew. Linux: the system package manager through pkexec.
//!
//! Progress goes to the page as `pkg:progress` events.

use crate::paths::tools_dir;
use crate::util::*;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

pub const IDS: [&str; 2] = ["xorriso", "squashfs"];

fn root_pkg(id: &str) -> &'static str {
    if id == "xorriso" {
        "xorriso"
    } else {
        "squashfs-tools"
    }
}
fn main_exe(id: &str) -> &'static [&'static str] {
    if id == "xorriso" {
        &["xorriso"]
    } else {
        &["unsquashfs", "mksquashfs"]
    }
}
fn brew_pkg(id: &str) -> &'static str {
    if id == "xorriso" {
        "xorriso"
    } else {
        "squashfs"
    }
}

/// Package names differ between Linux distributions' package managers.
pub fn linux_package(pm: &str, id: &str) -> &'static str {
    match (pm, id) {
        ("pacman", "xorriso") => "libisoburn",
        ("zypper", "squashfs") => "squashfs",
        (_, "xorriso") => "xorriso",
        _ => "squashfs-tools",
    }
}

fn msys_repo() -> String {
    std::env::var("ISOMAKER_MSYS_REPO").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "https://repo.msys2.org/msys/x86_64".into())
}

// ── Where programs are ──────────────────────────────────────

pub fn tools_bin_dir() -> PathBuf {
    tools_dir().join("msys").join("usr").join("bin")
}

/// The app's own copy of a program (Windows).
pub fn app_tool_path(name: &str) -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    let p = tools_bin_dir().join(format!("{name}.exe"));
    p.is_file().then_some(p)
}

fn msys_roots() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = Vec::new();
    for var in ["MSYS2_ROOT", "CYGWIN_ROOT"] {
        if let Some(r) = std::env::var_os(var).filter(|v| !v.is_empty()) {
            v.push(PathBuf::from(r));
        }
    }
    for r in [r"C:\msys64", r"C:\msys32", r"C:\cygwin64", r"C:\cygwin"] {
        v.push(PathBuf::from(r));
    }
    v
}

/// A program installed outside the app: MSYS2 / Cygwin on Windows, Homebrew or the system
/// elsewhere, then PATH.
pub fn system_tool_path(name: &str) -> Option<PathBuf> {
    if cfg!(windows) {
        for root in msys_roots() {
            for c in [root.join("usr").join("bin").join(format!("{name}.exe")), root.join("bin").join(format!("{name}.exe"))] {
                if c.is_file() {
                    return Some(c);
                }
            }
        }
        return which(&format!("{name}.exe"));
    }
    for d in ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin", "/usr/bin", "/usr/sbin", "/bin", "/sbin"] {
        let c = Path::new(d).join(name);
        if c.is_file() {
            return Some(c);
        }
    }
    which(name)
}

/// The app's copy first, then the system's.
pub fn find_tool(name: &str) -> Option<PathBuf> {
    app_tool_path(name).or_else(|| system_tool_path(name))
}

/// An MSYS program finds its DLLs next to it: put its folder first on PATH.
pub fn with_tool_path(cmd: &mut Command, binary: &Path) {
    if cfg!(windows) {
        if let Some(dir) = binary.parent().filter(|d| d.is_absolute()) {
            let mut parts = vec![dir.to_path_buf()];
            parts.extend(std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()));
            if let Ok(p) = std::env::join_paths(parts) {
                cmd.env("PATH", p);
            }
        }
        cmd.env("MSYS2_ARG_CONV_EXCL", "*").env("MSYS_NO_PATHCONV", "1");
    } else {
        cmd.env("PATH", search_path());
    }
}

fn version_of(binary: &Path) -> Option<String> {
    let mut cmd = Command::new(binary);
    cmd.arg("-version");
    with_tool_path(&mut cmd, binary);
    let o = run(&mut cmd, None, Some(Duration::from_secs(8)), &|_, _| {}).ok()?;
    let text = format!("{}\n{}", o.stdout, o.stderr);
    let find = |re: &dyn Fn(&str) -> Option<String>| re(&text);
    find(&|t| after_word(t, "xorriso", true))
        .or_else(|| find(&|t| after_word(t, "version", true)))
        .or_else(|| first_version(&text))
}

/// The version number after `word` ("xorriso 1.5.6", "version 4.6.1").
pub(crate) fn after_word(text: &str, word: &str, ci: bool) -> Option<String> {
    let hay = if ci { text.to_lowercase() } else { text.to_string() };
    let mut from = 0;
    while let Some(i) = hay[from..].find(word) {
        let rest = &text[from + i + word.len()..];
        let trimmed = rest.trim_start_matches([' ', '\t']);
        if trimmed.len() < rest.len() {
            let v: String = trimmed.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
            if v.starts_with(|c: char| c.is_ascii_digit()) {
                return Some(v);
            }
        }
        from += i + word.len();
    }
    None
}

fn first_version(text: &str) -> Option<String> {
    let b = text.as_bytes();
    for i in 0..b.len() {
        if b[i].is_ascii_digit() && (i == 0 || !b[i - 1].is_ascii_digit()) {
            let v: String = text[i..].chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
            if v.contains('.') && v.split('.').nth(1).is_some_and(|s| !s.is_empty()) {
                return Some(v);
            }
        }
    }
    None
}

struct Pm {
    name: &'static str,
}

impl Pm {
    fn detect() -> Option<Pm> {
        if !cfg!(target_os = "linux") {
            return None;
        }
        ["apt-get", "dnf", "pacman", "zypper"].into_iter().find(|n| system_tool_path(n).is_some()).map(|name| Pm { name })
    }
    fn args(&self, action: &str, pkg: &str) -> Vec<String> {
        let v: Vec<&str> = match (self.name, action) {
            ("apt-get", "remove") => vec!["apt-get", "remove", "-y", pkg],
            ("apt-get", "reinstall") => vec!["apt-get", "install", "-y", "--reinstall", pkg],
            ("apt-get", _) => vec!["apt-get", "install", "-y", pkg],
            ("dnf", a) => vec!["dnf", if a == "remove" { "remove" } else if a == "reinstall" { "reinstall" } else { "install" }, "-y", pkg],
            ("pacman", "remove") => vec!["pacman", "-R", "--noconfirm", pkg],
            ("pacman", _) => vec!["pacman", "-S", "--noconfirm", pkg],
            (_, "remove") => vec!["zypper", "--non-interactive", "remove", pkg],
            (_, "reinstall") => vec!["zypper", "--non-interactive", "install", "-f", pkg],
            _ => vec!["zypper", "--non-interactive", "install", pkg],
        };
        v.into_iter().map(String::from).collect()
    }
}

fn method_text() -> String {
    if cfg!(windows) {
        format!("MSYS2 → {}", tools_dir().display())
    } else if cfg!(target_os = "macos") {
        "Homebrew (brew)".into()
    } else {
        Pm::detect().map(|p| format!("{} (pkexec)", p.name)).unwrap_or_else(|| "none".into())
    }
}

pub fn status() -> Value {
    let can_install = if cfg!(windows) {
        true
    } else if cfg!(target_os = "macos") {
        system_tool_path("brew").is_some()
    } else {
        Pm::detect().is_some()
    };
    let method = method_text();
    Value::Array(
        IDS.iter()
            .map(|&id| {
                let exe = main_exe(id)[0];
                let own = app_tool_path(exe);
                let sys = if own.is_some() { None } else { system_tool_path(exe) };
                let state = if own.is_some() { "app" } else if sys.is_some() { "system" } else { "missing" };
                let p = own.or(sys);
                json!({
                    "id": id,
                    "required": id == "xorriso",
                    "state": state,
                    "path": p.as_ref().map(|p| p.to_string_lossy().to_string()),
                    "version": p.as_ref().and_then(|p| version_of(p)),
                    "canInstall": can_install,
                    "method": method,
                })
            })
            .collect(),
    )
}

/// What is missing, required and installable here (installed automatically at start).
pub fn missing_required() -> Value {
    let list = status();
    Value::Array(
        list.as_array()
            .unwrap()
            .iter()
            .filter(|p| p["required"] == true && p["state"] == "missing" && p["canInstall"] == true)
            .map(|p| p["id"].clone())
            .collect(),
    )
}

// ── Jobs ─────────────────────────────────────────────────────

pub type Say<'a> = &'a (dyn Fn(&str, &str, Option<f64>, Option<(u64, u64)>) + Sync);

/// install / reinstall / remove. `emit` gets the `pkg:progress` payloads.
pub fn run_job(id: &str, action: &str, cancel: &Cancel, emit: &(dyn Fn(Value) + Sync)) -> Res<Value> {
    if !IDS.contains(&id) {
        return err(format!("unknown package: {id}"));
    }
    if !["install", "reinstall", "remove"].contains(&action) {
        return err(format!("unknown action: {action}"));
    }
    let say = |phase: &str, message: &str, percent: Option<f64>, bytes: Option<(u64, u64)>| {
        let mut v = json!({ "id": id, "action": action, "phase": phase, "percent": percent, "message": message });
        if let Some((b, t)) = bytes {
            v["bytes"] = json!(b);
            v["total"] = json!(t);
        }
        emit(v);
    };
    let r: Res<()> = (|| {
        if cfg!(windows) {
            if action == "remove" {
                remove_msys(id, &say);
                Ok(())
            } else {
                install_msys(id, action == "reinstall", cancel, &say)
            }
        } else if cfg!(target_os = "macos") {
            let verb = match action {
                "remove" => "uninstall",
                "reinstall" => "reinstall",
                _ => "install",
            };
            let brew = system_tool_path("brew").unwrap_or_else(|| PathBuf::from("brew"));
            run_streamed(&brew.to_string_lossy(), &[verb.to_string(), brew_pkg(id).to_string()], cancel, &say)
        } else {
            let Some(pm) = Pm::detect() else { return err("No supported package manager (apt-get, dnf, pacman, zypper) was found.") };
            run_streamed("pkexec", &pm.args(action, linux_package(pm.name, id)), cancel, &say)
        }
    })();
    match r {
        Ok(()) => {
            say("done", if action == "remove" { "Removed" } else { "Installed" }, Some(100.0), None);
            Ok(status())
        }
        Err(_) if cancel.is_set() => {
            say("canceled", "Canceled", None, None);
            err("PKG_CANCELED")
        }
        Err(e) => {
            say("error", &e, None, None);
            Err(e)
        }
    }
}

fn run_streamed(program: &str, args: &[String], cancel: &Cancel, say: Say) -> Res<()> {
    say("run", &format!("{program} {}", args.join(" ")), None, None);
    let mut cmd = Command::new(program);
    cmd.args(args).env("PATH", search_path());
    let tail = std::sync::Mutex::new(String::new());
    let o = run(&mut cmd, Some(cancel), None, &|_, text| {
        for l in text.split(['\r', '\n']) {
            let s = l.trim();
            if s.is_empty() {
                continue;
            }
            *tail.lock().unwrap() = s.to_string();
            let pct = percent_in(s).map(|p| p.min(99.0));
            say("run", s, pct, None);
        }
    })?;
    if o.code != 0 {
        let t = tail.lock().unwrap().clone();
        return err(format!("{program} exited with {}{}", o.code, if t.is_empty() { String::new() } else { format!(": {t}") }));
    }
    Ok(())
}

/// "…  45%" → 45.
pub fn percent_in(s: &str) -> Option<f64> {
    let i = s.find('%')?;
    let before = s[..i].trim_end();
    let num: String = before.chars().rev().take_while(|c| c.is_ascii_digit() || *c == '.').collect::<Vec<_>>().into_iter().rev().collect();
    num.parse::<f64>().ok().map(|p| p.clamp(0.0, 100.0))
}

// ── Downloads ────────────────────────────────────────────────

pub fn download(url: &str, cancel: &Cancel, on_bytes: &mut dyn FnMut(u64)) -> Res<Vec<u8>> {
    let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(20)).timeout_read(Duration::from_secs(60)).redirects(8).user_agent("MyISOMaker").build();
    let res = match agent.get(url).call() {
        Ok(r) => r,
        Err(ureq::Error::Status(code, _)) => return err(format!("Download failed ({code}): {url}")),
        Err(e) => return err(format!("Could not download {url} ({e}). Check the internet connection.")),
    };
    let mut r = res.into_reader();
    let mut out = Vec::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        cancel.check()?;
        let n = r.read(&mut buf).map_err(|e| format!("Download of {url} broke off ({e})"))?;
        if n == 0 {
            break;
        }
        out.extend_from_slice(&buf[..n]);
        on_bytes(n as u64);
    }
    Ok(out)
}

// ── MSYS2 packages ───────────────────────────────────────────

pub fn decompress(buf: &[u8]) -> Res<Vec<u8>> {
    if buf.len() >= 4 && buf[..4] == [0x28, 0xb5, 0x2f, 0xfd] {
        return crate::squashfs::zstd_decode(buf);
    }
    if buf.len() >= 2 && buf[0] == 0x1f && buf[1] == 0x8b {
        let mut out = Vec::new();
        flate2::read::MultiGzDecoder::new(buf).read_to_end(&mut out).map_err(|e| format!("gzip: {e}"))?;
        return Ok(out);
    }
    if buf.len() >= 2 && buf[0] == 0xfd && buf[1] == 0x37 {
        return err("xz-compressed packages are not supported");
    }
    Ok(buf.to_vec())
}

pub struct TarEntry {
    pub name: String,
    pub kind: u8,
    pub data: Vec<u8>,
}

/// A minimal ustar / pax / GNU reader (enough for pacman packages and databases).
pub fn read_tar(buf: &[u8]) -> Vec<TarEntry> {
    let cstr = |b: &[u8]| {
        let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
        String::from_utf8_lossy(&b[..end]).to_string()
    };
    let mut out = Vec::new();
    let mut off = 0usize;
    let mut pax: Option<String> = None;
    let mut long: Option<String> = None;
    while off + 512 <= buf.len() {
        let h = &buf[off..off + 512];
        if h.iter().all(|&b| b == 0) {
            break;
        }
        let size = usize::from_str_radix(cstr(&h[124..136]).trim(), 8).unwrap_or(0);
        let kind = if h[156] == 0 { b'0' } else { h[156] };
        let prefix = cstr(&h[345..500]);
        let mut name = cstr(&h[0..100]);
        if !prefix.is_empty() {
            name = format!("{prefix}/{name}");
        }
        let start = off + 512;
        let data = buf[start.min(buf.len())..(start + size).min(buf.len())].to_vec();
        off = start + size.div_ceil(512) * 512;
        match kind {
            b'x' => {
                let text = String::from_utf8_lossy(&data);
                pax = text.lines().find_map(|l| l.split_once(" path=").map(|(_, p)| p.to_string()));
            }
            b'L' => long = Some(cstr(&data)),
            b'g' => {}
            _ => {
                out.push(TarEntry { name: pax.take().or(long.take()).unwrap_or(name), kind, data });
                pax = None;
                long = None;
            }
        }
    }
    out
}

#[derive(Clone, Debug)]
pub struct RepoPkg {
    pub name: String,
    pub filename: String,
    pub version: String,
    pub depends: Vec<String>,
    pub provides: Vec<String>,
    pub sha256: String,
    pub csize: u64,
}

fn strip_dep_version(d: &str) -> String {
    d.split(['<', '>', '=']).next().unwrap_or(d).trim().to_string()
}

/// msys.db (zstd/gzip tar of <name-ver>/desc) → packages by name and by what they provide.
pub fn parse_repo_db(raw: &[u8]) -> Res<HashMap<String, RepoPkg>> {
    let mut map: HashMap<String, RepoPkg> = HashMap::new();
    for e in read_tar(&decompress(raw)?) {
        if !e.name.ends_with("/desc") {
            continue;
        }
        let mut d: BTreeMap<String, Vec<String>> = BTreeMap::new();
        let mut key = String::new();
        for line in String::from_utf8_lossy(&e.data).split('\n') {
            if line.len() > 2 && line.starts_with('%') && line.ends_with('%') {
                key = line[1..line.len() - 1].to_string();
                d.insert(key.clone(), Vec::new());
            } else if !key.is_empty() && !line.is_empty() {
                d.get_mut(&key).unwrap().push(line.to_string());
            }
        }
        let first = |k: &str| d.get(k).and_then(|v| v.first()).cloned().unwrap_or_default();
        let list = |k: &str| d.get(k).map(|v| v.iter().map(|s| strip_dep_version(s)).collect()).unwrap_or_default();
        let p = RepoPkg {
            name: first("NAME"),
            filename: first("FILENAME"),
            version: first("VERSION"),
            depends: list("DEPENDS"),
            provides: list("PROVIDES"),
            sha256: first("SHA256SUM"),
            csize: first("CSIZE").parse().unwrap_or(0),
        };
        if !p.name.is_empty() && !p.filename.is_empty() {
            map.insert(p.name.clone(), p);
        }
    }
    // Virtual names (e.g. "sh") resolve to the package that provides them.
    let all: Vec<RepoPkg> = map.values().cloned().collect();
    for p in all {
        for v in &p.provides {
            map.entry(v.clone()).or_insert_with(|| p.clone());
        }
    }
    Ok(map)
}

/// The root package and everything it needs, without what a plain MSYS bin folder never uses.
pub fn resolve_deps(repo: &HashMap<String, RepoPkg>, root: &str) -> Res<Vec<RepoPkg>> {
    // Shells and the file system skeleton are run-time extras of MSYS; the tools work without them.
    let skip: HashSet<&str> = ["sh", "bash", "filesystem", "coreutils", "grep", "sed", "findutils", "gawk", "ncurses-terminfo"].into();
    let mut seen: Vec<RepoPkg> = Vec::new();
    let mut names: HashSet<String> = HashSet::new();
    let mut stack = vec![root.to_string()];
    let mut visit = |stack: &mut Vec<String>, seen: &mut Vec<RepoPkg>| {
        while let Some(n) = stack.pop() {
            if skip.contains(n.as_str()) {
                continue;
            }
            let Some(p) = repo.get(&n) else { continue };
            if !names.insert(p.name.clone()) {
                continue;
            }
            seen.push(p.clone());
            for d in p.depends.iter().rev() {
                stack.push(d.clone());
            }
        }
    };
    visit(&mut stack, &mut seen);
    if seen.is_empty() {
        return err(format!("{root} was not found in the MSYS2 repository"));
    }
    // Every MSYS program links msys-2.0.dll; packages do not list it.
    stack.push("msys2-runtime".into());
    visit(&mut stack, &mut seen);
    Ok(seen)
}

fn manifest_path() -> PathBuf {
    tools_dir().join("manifest.json")
}

fn read_manifest() -> Value {
    std::fs::read_to_string(manifest_path())
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .filter(|m| m.get("packages").is_some_and(Value::is_object))
        .unwrap_or_else(|| json!({ "packages": {} }))
}

fn write_manifest(m: &Value) -> Res<()> {
    std::fs::create_dir_all(tools_dir()).at(&tools_dir())?;
    std::fs::write(manifest_path(), serde_json::to_string_pretty(m).unwrap()).at(&manifest_path())
}

/// Deletes the files of `id` that no other installed package also uses.
fn remove_files(id: &str, m: &mut Value) {
    let pk = m["packages"].as_object().cloned().unwrap_or_default();
    let mine: Vec<String> = pk.get(id).and_then(|v| v["files"].as_array().cloned()).unwrap_or_default().iter().filter_map(|f| f.as_str().map(String::from)).collect();
    let others: HashSet<String> = pk
        .iter()
        .filter(|(k, _)| k.as_str() != id)
        .flat_map(|(_, v)| v["files"].as_array().cloned().unwrap_or_default())
        .filter_map(|f| f.as_str().map(String::from))
        .collect();
    for f in mine {
        if !others.contains(&f) && !f.contains(['/', '\\']) {
            let _ = std::fs::remove_file(tools_bin_dir().join(f));
        }
    }
    if let Some(o) = m["packages"].as_object_mut() {
        o.remove(id);
    }
}

fn remove_msys(id: &str, say: Say) {
    say("run", "Removing…", Some(30.0), None);
    let mut m = read_manifest();
    remove_files(id, &mut m);
    if m["packages"].as_object().is_some_and(|o| o.is_empty()) {
        let _ = std::fs::remove_dir_all(tools_dir());
    } else {
        let _ = write_manifest(&m);
    }
}

fn install_msys(id: &str, reinstall: bool, cancel: &Cancel, say: Say) -> Res<()> {
    say("index", "MSYS2 package index…", Some(2.0), None);
    let repo_url = msys_repo();
    let repo = parse_repo_db(&download(&format!("{repo_url}/msys.db"), cancel, &mut |_| {})?)?;
    say("resolve", "Resolving dependencies…", Some(5.0), None);
    let pkgs = resolve_deps(&repo, root_pkg(id))?;
    let total = pkgs.iter().map(|p| p.csize).sum::<u64>().max(1);
    let mut done = 0u64;
    let bin = tools_bin_dir();
    let mut manifest = read_manifest();
    if reinstall {
        remove_files(id, &mut manifest);
    }
    std::fs::create_dir_all(&bin).at(&bin)?;
    let pct = |done: u64| Some(5.0 + ((done as f64 / total as f64) * 75.0).round().min(75.0));
    let mut downloaded = Vec::new();
    for p in &pkgs {
        let label = format!("{} {}", p.name, p.version);
        say("download", &label, pct(done), Some((done, total)));
        let data = download(&format!("{repo_url}/{}", p.filename), cancel, &mut |n| {
            done += n;
            say("download", &label, pct(done), Some((done, total)));
        })?;
        say("verify", &format!("{}: SHA-256", p.name), None, None);
        if !p.sha256.is_empty() {
            let sum: String = Sha256::digest(&data).iter().map(|b| format!("{b:02x}")).collect();
            if sum != p.sha256 {
                return err(format!("Checksum mismatch: {}", p.filename));
            }
        }
        downloaded.push((p, data));
    }
    let mut files: Vec<String> = Vec::new();
    let count = downloaded.len().max(1);
    for (n, (p, data)) in downloaded.iter().enumerate() {
        cancel.check()?;
        say("unpack", &p.name, Some(80.0 + (((n + 1) as f64 / count as f64) * 18.0).round()), None);
        for e in read_tar(&decompress(data)?) {
            if e.kind != b'0' {
                continue;
            }
            let Some(rel) = e.name.strip_prefix("usr/bin/") else { continue };
            let lower = rel.to_lowercase();
            if rel.is_empty() || rel.contains('/') || !(lower.ends_with(".exe") || lower.ends_with(".dll")) {
                continue;
            }
            std::fs::write(bin.join(rel), &e.data).at(&bin.join(rel))?;
            if !files.contains(&rel.to_string()) {
                files.push(rel.to_string());
            }
        }
    }
    for exe in main_exe(id) {
        if !bin.join(format!("{exe}.exe")).is_file() {
            return err(format!("{exe}.exe is missing after unpacking"));
        }
    }
    files.sort();
    manifest["packages"][id] = json!({ "files": files, "pkgs": pkgs.iter().map(|p| format!("{}-{}", p.name, p.version)).collect::<Vec<_>>(), "at": iso_now() });
    write_manifest(&manifest)?;
    // MSYS wants these folders next to usr/.
    for d in ["tmp", "etc"] {
        let _ = std::fs::create_dir_all(tools_dir().join("msys").join(d));
    }
    say("verify", "Checking the installed program…", Some(99.0), None);
    if id == "xorriso" && version_of(&bin.join("xorriso.exe")).is_none() {
        return err("xorriso was unpacked but does not start");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tar(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut out = Vec::new();
        for (name, body) in files {
            let mut h = [0u8; 512];
            h[..name.len()].copy_from_slice(name.as_bytes());
            h[100..108].copy_from_slice(b"0000644\0");
            h[108..116].copy_from_slice(b"0000000\0");
            h[116..124].copy_from_slice(b"0000000\0");
            h[124..136].copy_from_slice(format!("{:011o}\0", body.len()).as_bytes());
            h[136..148].copy_from_slice(b"00000000000\0");
            h[148..156].copy_from_slice(b"        ");
            h[156] = b'0';
            h[257..263].copy_from_slice(b"ustar\0");
            h[263..265].copy_from_slice(b"00");
            let sum: u32 = h.iter().map(|&b| b as u32).sum();
            h[148..156].copy_from_slice(format!("{sum:06o}\0 ").as_bytes());
            out.extend_from_slice(&h);
            out.extend_from_slice(body);
            out.resize(out.len().div_ceil(512) * 512, 0);
        }
        out.extend_from_slice(&[0u8; 1024]);
        out
    }

    fn desc(name: &str, version: &str, depends: &[&str], provides: &[&str]) -> String {
        let mut v = vec![
            "%FILENAME%".to_string(), format!("{name}-{version}-x86_64.pkg.tar.gz"), String::new(),
            "%NAME%".into(), name.into(), String::new(),
            "%VERSION%".into(), version.into(), String::new(),
            "%CSIZE%".into(), "1234".into(), String::new(),
            "%SHA256SUM%".into(), "a".repeat(64), String::new(),
        ];
        if !depends.is_empty() {
            v.push("%DEPENDS%".into());
            v.extend(depends.iter().map(|s| s.to_string()));
            v.push(String::new());
        }
        if !provides.is_empty() {
            v.push("%PROVIDES%".into());
            v.extend(provides.iter().map(|s| s.to_string()));
            v.push(String::new());
        }
        v.join("\n")
    }

    fn gzip(b: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut z = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        z.write_all(b).unwrap();
        z.finish().unwrap()
    }

    fn repo() -> Vec<u8> {
        let items = [
            ("xorriso-1.5.6-1/desc", desc("xorriso", "1.5.6-1", &["libbz2", "libreadline>=8", "zlib", "libiconv", "sh"], &[])),
            ("libbz2-1.0.8-4/desc", desc("libbz2", "1.0.8-4", &["gcc-libs"], &[])),
            ("libreadline-8.2-1/desc", desc("libreadline", "8.2-1", &["ncurses"], &[])),
            ("ncurses-6.5-2/desc", desc("ncurses", "6.5-2", &["gcc-libs"], &[])),
            ("zlib-1.3.1-1/desc", desc("zlib", "1.3.1-1", &["gcc-libs"], &[])),
            ("libiconv-1.18-1/desc", desc("libiconv", "1.18-1", &["gcc-libs"], &[])),
            ("gcc-libs-13.3-1/desc", desc("gcc-libs", "13.3-1", &[], &[])),
            ("msys2-runtime-3.6-1/desc", desc("msys2-runtime", "3.6-1", &[], &[])),
            ("bash-5.2-1/desc", desc("bash", "5.2-1", &[], &["sh"])),
            ("squashfs-tools-4.7-1/desc", desc("squashfs-tools", "4.7-1", &["zlib", "liblzma"], &[])),
            ("liblzma-5.8-1/desc", desc("liblzma", "5.8-1", &["gcc-libs"], &[])),
        ];
        let files: Vec<(&str, &[u8])> = items.iter().map(|(n, d)| (*n, d.as_bytes())).collect();
        gzip(&tar(&files))
    }

    #[test]
    fn tar_reader_names_and_contents() {
        let t = tar(&[("a/desc", b"hello"), ("b/c.txt", b"world")]);
        let e = read_tar(&t);
        assert_eq!(e.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), ["a/desc", "b/c.txt"]);
        assert_eq!(e[1].data, b"world");
    }

    #[test]
    fn repository_resolves_libraries_runtime_no_shell() {
        let db = parse_repo_db(&repo()).unwrap();
        assert!(db.contains_key("xorriso") && db.contains_key("sh"));
        let mut names: Vec<String> = resolve_deps(&db, "xorriso").unwrap().into_iter().map(|p| p.name).collect();
        names.sort();
        assert_eq!(names, ["gcc-libs", "libbz2", "libiconv", "libreadline", "msys2-runtime", "ncurses", "xorriso", "zlib"]);
        let sq: Vec<String> = resolve_deps(&db, "squashfs-tools").unwrap().into_iter().map(|p| p.name).collect();
        assert!(sq.contains(&"liblzma".into()) && sq.contains(&"msys2-runtime".into()));
        for p in resolve_deps(&db, "xorriso").unwrap() {
            assert!(p.filename.ends_with(".pkg.tar.gz") && p.sha256.len() == 64);
        }
        assert!(resolve_deps(&db, "no-such-package").is_err());
    }

    #[test]
    fn packages_unpack_gzip_and_zstd() {
        let mut exe = b"MZ".to_vec();
        exe.extend(std::iter::repeat_n(7u8, 200));
        let archive = gzip(&tar(&[(".PKGINFO", b"pkgname = xorriso"), ("usr/bin/xorriso.exe", &exe), ("usr/share/man/xorriso.1", b"man")]));
        let entries = read_tar(&decompress(&archive).unwrap());
        assert_eq!(entries.iter().find(|e| e.name == "usr/bin/xorriso.exe").unwrap().data, exe);
        let z = ruzstd::encoding::compress_to_vec(&tar(&[("usr/bin/x.exe", &exe)])[..], ruzstd::encoding::CompressionLevel::Fastest);
        assert_eq!(read_tar(&decompress(&z).unwrap())[0].data, exe);
    }

    #[test]
    fn real_msys2_database_when_present() {
        let root = std::env::var("MSYS2_ROOT").unwrap_or_else(|_| r"C:\msys64".into());
        let db = Path::new(&root).join("var").join("lib").join("pacman").join("sync").join("msys.db");
        let Ok(raw) = std::fs::read(&db) else { return };
        let real = parse_repo_db(&raw).unwrap();
        assert!(real.len() > 500);
        let x: Vec<String> = resolve_deps(&real, "xorriso").unwrap().into_iter().map(|p| p.name).collect();
        for need in ["xorriso", "msys2-runtime", "libbz2", "libreadline", "ncurses", "zlib", "libiconv", "gcc-libs"] {
            assert!(x.contains(&need.to_string()), "{need}");
        }
        let cache = Path::new(&root).join("var").join("cache").join("pacman").join("pkg");
        if let Some(f) = std::fs::read_dir(&cache).ok().and_then(|rd| rd.flatten().map(|d| d.path()).find(|p| {
            let n = p.file_name().unwrap().to_string_lossy();
            n.starts_with("xorriso-") && n.ends_with(".pkg.tar.zst")
        })) {
            let entries = read_tar(&decompress(&std::fs::read(f).unwrap()).unwrap());
            let exe = entries.iter().find(|e| e.name == "usr/bin/xorriso.exe").unwrap();
            assert_eq!(&exe.data[..2], b"MZ");
        }
    }

    #[test]
    fn linux_names_and_versions() {
        assert_eq!(linux_package("apt-get", "xorriso"), "xorriso");
        assert_eq!(linux_package("pacman", "xorriso"), "libisoburn");
        assert_eq!(linux_package("zypper", "squashfs"), "squashfs");
        assert_eq!(linux_package("dnf", "squashfs"), "squashfs-tools");
        assert_eq!(after_word("GNU xorriso 1.5.6 : RockRidge", "xorriso", true).as_deref(), Some("1.5.6"));
        assert_eq!(percent_in("Downloading  45% done"), Some(45.0));
    }
}
