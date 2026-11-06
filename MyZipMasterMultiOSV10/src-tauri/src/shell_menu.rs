//! The file manager's right-click menu.
//!
//! Windows: keys under the current user's classes; the installer turns them on, Settings turns them
//! on and off. Explorer on Windows 11 shows them under "Show more options"; its first menu takes a
//! signed package. Linux: a Dolphin service menu and Nautilus scripts. macOS: Finder Quick Actions.
//! Both write under the user's home, only when asked to in Settings.
//!
//! In test mode nothing real is touched: another registry branch, and a folder in the test's config.

#[cfg(not(windows))]
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

pub const ARCHIVE_EXTS: &[&str] = &[
    "zip", "zipx", "7z", "rar", "tar", "gz", "tgz", "bz2", "tbz", "tbz2", "xz", "txz", "zst", "tzst", "cab", "iso", "001",
];

const FLAGS: &[(&str, &str)] = &[
    ("--shell-add", "add"),
    ("--shell-extract-here", "extract-here"),
    ("--shell-extract-folder", "extract-folder"),
    ("--shell-test", "test"),
];

struct Labels {
    group: &'static str,
    add: &'static str,
    open: &'static str,
    here: &'static str,
    folder: &'static str,
    test: &'static str,
}

fn labels(lang: &str) -> Labels {
    if lang == "ko" {
        Labels {
            group: "MyZipMaster",
            add: "MyZipMaster로 압축",
            open: "열기",
            here: "여기에 풀기",
            folder: "압축 파일 이름의 폴더로 풀기",
            test: "압축 파일 검사",
        }
    } else {
        Labels {
            group: "MyZipMaster",
            add: "Compress with MyZipMaster",
            open: "Open",
            here: "Extract here",
            folder: "Extract to a folder named after the archive",
            test: "Test the archive",
        }
    }
}

fn test_mode() -> bool {
    std::env::var("MYZIPMASTER_TEST").is_ok()
}

fn program() -> Result<String, String> {
    // An AppImage runs from a temporary mount; its own path is the one that lasts.
    if let Ok(image) = std::env::var("APPIMAGE") {
        if !image.is_empty() {
            return Ok(image);
        }
    }
    std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).map_err(|e| e.to_string())
}

// ── Started from the menu ─────────────────────────────────────────────────────────────────────────

fn parse_request(args: &[String]) -> Option<(&'static str, Vec<String>)> {
    let (_, action) = FLAGS.iter().find(|(flag, _)| args.first().map(String::as_str) == Some(*flag))?;
    Some((action, args[1..].to_vec()))
}

/// Explorer starts one process per selected file. The first of them collects the others' files and
/// goes on; the rest leave. Returns what this window is to do.
pub fn gather_request(args: &[String]) -> Option<Value> {
    let (action, paths) = parse_request(args)?;
    let inbox = crate::data_dir().join("shell-inbox");
    if std::fs::create_dir_all(&inbox).is_err() {
        return Some(json!({ "action": action, "paths": paths }));
    }
    let mine = inbox.join(format!("{action}-{}.txt", std::process::id()));
    let _ = std::fs::write(&mine, paths.join("\n"));

    let lock = inbox.join(format!("{action}.lock"));
    // One left by a process that died must not silence the menu for good.
    if let Ok(age) = std::fs::metadata(&lock).and_then(|m| m.modified()).and_then(|t| t.elapsed().map_err(std::io::Error::other)) {
        if age.as_secs() > 10 {
            let _ = std::fs::remove_file(&lock);
        }
    }
    if std::fs::OpenOptions::new().write(true).create_new(true).open(&lock).is_err() {
        std::process::exit(0);
    }
    std::thread::sleep(std::time::Duration::from_millis(500));

    let mut all: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&inbox) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with(&format!("{action}-")) && name.ends_with(".txt") {
                if let Ok(text) = std::fs::read_to_string(entry.path()) {
                    all.extend(text.lines().filter(|l| !l.is_empty()).map(str::to_owned));
                }
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    let _ = std::fs::remove_file(&lock);
    all.sort();
    all.dedup();
    Some(json!({ "action": action, "paths": all }))
}

// ── Windows ───────────────────────────────────────────────────────────────────────────────────────

#[cfg(windows)]
mod win {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    fn root() -> &'static str {
        if super::test_mode() { "Software\\MyZipMasterTest\\Classes" } else { "Software\\Classes" }
    }
    fn hkcu() -> RegKey {
        RegKey::predef(HKEY_CURRENT_USER)
    }
    fn add_keys() -> [String; 2] {
        [format!("{}\\*\\shell\\MyZipMaster.Add", root()), format!("{}\\Directory\\shell\\MyZipMaster.Add", root())]
    }
    fn archive_key(ext: &str) -> String {
        format!("{}\\SystemFileAssociations\\.{ext}\\shell\\MyZipMaster", root())
    }
    fn e(err: std::io::Error) -> String {
        err.to_string()
    }

    fn verb(parent: &RegKey, name: &str, label: &str, command: &str, single: bool) -> Result<(), String> {
        let (key, _) = parent.create_subkey(name).map_err(e)?;
        key.set_value("", &label).map_err(e)?;
        if single {
            key.set_value("MultiSelectModel", &"Single").map_err(e)?;
        }
        let (cmd, _) = key.create_subkey("command").map_err(e)?;
        cmd.set_value("", &command).map_err(e)
    }

    pub fn register(lang: &str) -> Result<(), String> {
        let exe = super::program()?;
        let l = super::labels(lang);
        let icon = format!("\"{exe}\",0");
        for path in add_keys() {
            let (key, _) = hkcu().create_subkey(&path).map_err(e)?;
            key.set_value("", &l.add).map_err(e)?;
            key.set_value("Icon", &icon).map_err(e)?;
            // Without this Explorer hides the item when more than fifteen files are selected.
            key.set_value("MultiSelectModel", &"Player").map_err(e)?;
            let (cmd, _) = key.create_subkey("command").map_err(e)?;
            cmd.set_value("", &format!("\"{exe}\" --shell-add \"%1\"")).map_err(e)?;
        }
        for ext in super::ARCHIVE_EXTS {
            let (key, _) = hkcu().create_subkey(archive_key(ext)).map_err(e)?;
            key.set_value("MUIVerb", &l.group).map_err(e)?;
            key.set_value("Icon", &icon).map_err(e)?;
            key.set_value("SubCommands", &"").map_err(e)?;
            let (shell, _) = key.create_subkey("shell").map_err(e)?;
            verb(&shell, "1open", l.open, &format!("\"{exe}\" \"%1\""), true)?;
            verb(&shell, "2here", l.here, &format!("\"{exe}\" --shell-extract-here \"%1\""), false)?;
            verb(&shell, "3folder", l.folder, &format!("\"{exe}\" --shell-extract-folder \"%1\""), false)?;
            verb(&shell, "4test", l.test, &format!("\"{exe}\" --shell-test \"%1\""), true)?;
        }
        Ok(())
    }

    pub fn unregister() -> Result<(), String> {
        let mut paths: Vec<String> = add_keys().to_vec();
        paths.extend(super::ARCHIVE_EXTS.iter().map(|ext| archive_key(ext)));
        for path in paths {
            match hkcu().delete_subkey_all(&path) {
                Ok(()) => {}
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
                Err(err) => return Err(err.to_string()),
            }
        }
        Ok(())
    }

    pub fn is_on() -> bool {
        hkcu().open_subkey(&add_keys()[0]).is_ok()
    }
}

// ── Linux and macOS: files in the home folder ─────────────────────────────────────────────────────

struct PlanFile {
    path: String,
    content: String,
    executable: bool,
}

const KIO_DIR: &str = ".local/share/kio/servicemenus";
const NAUTILUS_DIR: &str = ".local/share/nautilus/scripts";
const SERVICES_DIR: &str = "Library/Services";

fn xml(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn linux_plan(exe: &str, lang: &str) -> Vec<PlanFile> {
    let l = labels(lang);
    let mimes = "application/zip;application/x-7z-compressed;application/vnd.rar;application/x-rar;application/x-tar;application/gzip;application/x-bzip2;application/x-xz;application/zstd;application/vnd.ms-cab-compressed;application/x-iso9660-image;";
    let mut plan = vec![
        PlanFile {
            path: format!("{KIO_DIR}/myzipmaster-add.desktop"),
            content: format!(
                "[Desktop Entry]\nType=Service\nMimeType=all/allfiles;inode/directory;\nActions=add;\n\n[Desktop Action add]\nName={}\nIcon=myzipmaster\nExec=\"{exe}\" --shell-add %F\n",
                l.add
            ),
            executable: true,
        },
        PlanFile {
            path: format!("{KIO_DIR}/myzipmaster-archive.desktop"),
            content: format!(
                "[Desktop Entry]\nType=Service\nMimeType={mimes}\nX-KDE-Submenu={group}\nActions=here;folder;test;\n\n[Desktop Action here]\nName={here}\nExec=\"{exe}\" --shell-extract-here %F\n\n[Desktop Action folder]\nName={folder}\nExec=\"{exe}\" --shell-extract-folder %F\n\n[Desktop Action test]\nName={test}\nExec=\"{exe}\" --shell-test %f\n",
                group = l.group,
                here = l.here,
                folder = l.folder,
                test = l.test
            ),
            executable: true,
        },
    ];
    for (label, flag) in [(l.add, "--shell-add"), (l.here, "--shell-extract-here"), (l.folder, "--shell-extract-folder")] {
        plan.push(PlanFile {
            path: format!("{NAUTILUS_DIR}/MyZipMaster - {label}"),
            content: format!(
                "#!/bin/bash\nIFS=$'\\n' read -d '' -r -a files <<< \"$NAUTILUS_SCRIPT_SELECTED_FILE_PATHS\"\nexec \"{exe}\" {flag} \"${{files[@]}}\"\n"
            ),
            executable: true,
        });
    }
    plan
}

fn mac_plan(exe: &str, lang: &str) -> Vec<PlanFile> {
    let l = labels(lang);
    let mut plan = Vec::new();
    for (label, flag) in [(l.add, "--shell-add"), (l.here, "--shell-extract-here"), (l.folder, "--shell-extract-folder")] {
        let dir = format!("{SERVICES_DIR}/MyZipMaster {label}.workflow/Contents");
        plan.push(PlanFile {
            path: format!("{dir}/Info.plist"),
            content: format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>NSServices</key><array><dict>
<key>NSMenuItem</key><dict><key>default</key><string>{name}</string></dict>
<key>NSMessage</key><string>runWorkflowAsService</string>
<key>NSRequiredContext</key><dict><key>NSApplicationIdentifier</key><string>com.apple.finder</string></dict>
<key>NSSendFileTypes</key><array><string>public.item</string></array>
</dict></array>
</dict></plist>
"#,
                name = xml(label)
            ),
            executable: false,
        });
        let command = xml(&format!("\"{exe}\" {flag} \"$@\" >/dev/null 2>&1 &"));
        plan.push(PlanFile {
            path: format!("{dir}/document.wflow"),
            content: format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>AMApplicationBuild</key><string>523</string>
<key>AMApplicationVersion</key><string>2.10</string>
<key>AMDocumentVersion</key><string>2</string>
<key>actions</key><array><dict><key>action</key><dict>
<key>AMAccepts</key><dict><key>Container</key><string>List</string><key>Optional</key><true/><key>Types</key><array><string>com.apple.cocoa.path</string></array></dict>
<key>AMActionVersion</key><string>2.0.3</string>
<key>AMApplication</key><array><string>Automator</string></array>
<key>AMProvides</key><dict><key>Container</key><string>List</string><key>Types</key><array><string>com.apple.cocoa.string</string></array></dict>
<key>ActionBundlePath</key><string>/System/Library/Automator/Run Shell Script.action</string>
<key>ActionName</key><string>Run Shell Script</string>
<key>ActionParameters</key><dict>
<key>COMMAND_STRING</key><string>{command}</string>
<key>CheckedForUserDefaultShell</key><true/>
<key>inputMethod</key><integer>1</integer>
<key>shell</key><string>/bin/sh</string>
<key>source</key><string></string>
</dict>
<key>BundleIdentifier</key><string>com.apple.RunShellScript</string>
<key>CFBundleVersion</key><string>2.0.3</string>
<key>Class Name</key><string>RunShellScriptAction</string>
<key>InputUUID</key><string>7C2E8A10-6D44-4B11-9A52-1F0A6E3B7C01</string>
<key>OutputUUID</key><string>7C2E8A10-6D44-4B11-9A52-1F0A6E3B7C02</string>
<key>UUID</key><string>7C2E8A10-6D44-4B11-9A52-1F0A6E3B7C03</string>
</dict></dict></array>
<key>connectors</key><dict/>
<key>workflowMetaData</key><dict>
<key>serviceInputTypeIdentifier</key><string>com.apple.Automator.fileSystemObject</string>
<key>serviceOutputTypeIdentifier</key><string>com.apple.Automator.nothing</string>
<key>serviceProcessesInput</key><integer>0</integer>
<key>workflowTypeIdentifier</key><string>com.apple.Automator.servicesMenu</string>
</dict>
</dict></plist>
"#
            ),
            executable: false,
        });
    }
    plan
}

#[cfg(not(windows))]
mod unix {
    use super::*;

    fn home() -> Result<PathBuf, String> {
        if test_mode() {
            return Ok(crate::data_dir().join("shell-home"));
        }
        std::env::var("HOME").map(PathBuf::from).map_err(|e| e.to_string())
    }

    fn plan(exe: &str, lang: &str) -> Vec<PlanFile> {
        if cfg!(target_os = "macos") { mac_plan(exe, lang) } else { linux_plan(exe, lang) }
    }

    pub fn register(lang: &str) -> Result<(), String> {
        unregister()?;
        let base = home()?;
        for file in plan(&program()?, lang) {
            let path = base.join(&file.path);
            std::fs::create_dir_all(path.parent().unwrap_or(&base)).map_err(|e| e.to_string())?;
            std::fs::write(&path, file.content).map_err(|e| e.to_string())?;
            if file.executable {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    /// Only what carries this program's name goes.
    fn ours(dir: &Path, prefix: &str) -> Vec<PathBuf> {
        std::fs::read_dir(dir)
            .map(|entries| entries.flatten().filter(|e| e.file_name().to_string_lossy().starts_with(prefix)).map(|e| e.path()).collect())
            .unwrap_or_default()
    }

    fn installed() -> Result<Vec<PathBuf>, String> {
        let base = home()?;
        let mut list = ours(&base.join(KIO_DIR), "myzipmaster-");
        list.extend(ours(&base.join(NAUTILUS_DIR), "MyZipMaster - "));
        list.extend(ours(&base.join(SERVICES_DIR), "MyZipMaster "));
        Ok(list)
    }

    pub fn unregister() -> Result<(), String> {
        for path in installed()? {
            let done = if path.is_dir() { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) };
            done.map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn is_on() -> bool {
        installed().map(|l| !l.is_empty()).unwrap_or(false)
    }
}

#[cfg(windows)]
use win as system;
#[cfg(not(windows))]
use unix as system;

// ── Commands ──────────────────────────────────────────────────────────────────────────────────────

/// `--register-shell-menu`, for the installer, and the rest for tests. These run and leave, without a window.
pub fn run_cli(args: &[String], installer_language: Option<&str>) -> Option<i32> {
    let done = |r: Result<(), String>| {
        if let Err(e) = &r {
            eprintln!("{e}");
        }
        i32::from(r.is_err())
    };
    match args.first().map(String::as_str) {
        Some("--register-shell-menu") => {
            let lang = args.get(1).map(String::as_str).or(installer_language).unwrap_or("en");
            Some(done(system::register(lang)))
        }
        Some("--unregister-shell-menu") => Some(done(system::unregister())),
        Some("--print-shell-menu") => {
            let show = |plan: Vec<PlanFile>| -> Vec<Value> {
                plan.into_iter().map(|f| json!({ "path": f.path, "content": f.content, "executable": f.executable })).collect()
            };
            let lang = args.get(1).map(String::as_str).unwrap_or("en");
            println!("{}", json!({ "linux": show(linux_plan("/opt/my app/myzipmaster", lang)), "macos": show(mac_plan("/Applications/A & B.app/Contents/MacOS/myzipmaster", lang)) }));
            Some(0)
        }
        _ => None,
    }
}

#[tauri::command]
pub fn shell_menu_status() -> Value {
    json!({ "on": system::is_on(), "platform": std::env::consts::OS })
}

#[tauri::command]
pub fn set_shell_menu(on: bool, lang: String) -> Result<(), String> {
    if on { system::register(&lang) } else { system::unregister() }
}

/// Windows does not let a program make itself the default; this opens the page where the user can.
#[tauri::command]
pub fn open_default_apps() -> Result<(), String> {
    if test_mode() {
        return std::fs::write(crate::data_dir().join("default-apps-opened"), "1").map_err(|e| e.to_string());
    }
    if !cfg!(windows) {
        return Err("only on Windows".into());
    }
    std::process::Command::new("explorer").arg("ms-settings:defaultapps").spawn().map(|_| ()).map_err(|e| e.to_string())
}

