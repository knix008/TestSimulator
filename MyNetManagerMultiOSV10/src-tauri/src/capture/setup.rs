//! Making live capture work on this computer — the program does it itself, after asking (app.js / the Settings
//! window): Windows downloads the newest Npcap from npcap.com, checks its signature and runs its installer as
//! administrator; Linux installs libpcap with the package manager and gives the program the capture capabilities
//! (pkexec, the system's password prompt); macOS gives the administrators group access to /dev/bpf*, now and at
//! every start (a launch daemon, like Wireshark's ChmodBPF). `reinstall` does it again even when all is in place.
//!
//! Each step is reported as a "capture-setup" event ({ step, detail }) for the window to show.

use serde::Serialize;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Serialize)]
pub struct SetupInfo {
    /// "windows" | "linux" | "macos" | other
    pub os: String,
    /// What live capture needs here: "install" (no capture library), "permission" (library there, no rights), or none.
    pub needed: Option<String>,
    /// "npcap" | "libpcap" | "bpf": what setup installs or fixes.
    pub tool: String,
    /// The capture library is there (its version when known).
    pub installed: bool,
    pub version: Option<String>,
    /// The program can do the setup by itself (Linux: pkexec found; macOS: osascript).
    pub automatic: bool,
    /// The command to run by hand when it cannot (or the user prefers to).
    pub manual: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SetupResult {
    pub ok: bool,
    /// The program must start again for the change to apply (Linux capabilities).
    pub restart: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SetupStep {
    pub step: String,
    pub detail: String,
}

fn exists(cmd: &str) -> bool {
    which(cmd).is_some()
}

fn which(cmd: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|dir| dir.join(cmd)).find(|p| p.is_file())
}

/// Linux: the process has CAP_NET_RAW (bit 13) in its effective set, or runs as root.
#[cfg(target_os = "linux")]
fn has_capture_rights() -> bool {
    let Ok(status) = std::fs::read_to_string("/proc/self/status") else { return false };
    let uid_root = status.lines().find(|l| l.starts_with("Uid:")).map(|l| l.split_whitespace().nth(2) == Some("0")).unwrap_or(false);
    let cap = status.lines().find(|l| l.starts_with("CapEff:")).and_then(|l| u64::from_str_radix(l.split_whitespace().nth(1).unwrap_or("0"), 16).ok()).unwrap_or(0);
    uid_root || cap & (1 << 13) != 0
}

/// macOS: /dev/bpf0 can be opened for reading and writing by this user.
#[cfg(target_os = "macos")]
fn has_capture_rights() -> bool {
    std::fs::OpenOptions::new().read(true).write(true).open("/dev/bpf0").is_ok()
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn has_capture_rights() -> bool {
    true
}

/// Linux: the package manager's command that installs (or reinstalls) libpcap.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn linux_install_command(reinstall: bool) -> Option<String> {
    let (pm, line) = if exists("apt-get") {
        ("apt-get", if reinstall { "apt-get install -y --reinstall libpcap0.8" } else { "apt-get install -y libpcap0.8" })
    } else if exists("dnf") {
        ("dnf", if reinstall { "dnf reinstall -y libpcap" } else { "dnf install -y libpcap" })
    } else if exists("yum") {
        ("yum", if reinstall { "yum reinstall -y libpcap" } else { "yum install -y libpcap" })
    } else if exists("zypper") {
        ("zypper", if reinstall { "zypper --non-interactive install -f libpcap1" } else { "zypper --non-interactive install libpcap1" })
    } else if exists("pacman") {
        ("pacman", "pacman -S --noconfirm libpcap")
    } else if exists("apk") {
        ("apk", if reinstall { "apk fix libpcap" } else { "apk add libpcap" })
    } else {
        return None;
    };
    let _ = pm;
    Some(line.to_string())
}

pub fn info() -> SetupInfo {
    let backend = super::pcap::backend_info();
    let installed = backend.available;
    let os = std::env::consts::OS.to_string();
    let exe = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default();
    match os.as_str() {
        "windows" => SetupInfo {
            needed: if installed { None } else { Some("install".into()) },
            tool: "npcap".into(),
            installed,
            version: backend.version,
            automatic: true,
            manual: "https://npcap.com/#download".into(),
            os,
        },
        "linux" => {
            let rights = has_capture_rights();
            let install = linux_install_command(false).unwrap_or_else(|| "(install libpcap with your package manager)".into());
            SetupInfo {
                needed: if !installed { Some("install".into()) } else if !rights { Some("permission".into()) } else { None },
                tool: "libpcap".into(),
                installed,
                version: backend.version,
                automatic: exists("pkexec"),
                manual: format!("sudo {install} && sudo setcap cap_net_raw,cap_net_admin=eip '{exe}'"),
                os,
            }
        }
        "macos" => {
            let rights = has_capture_rights();
            SetupInfo {
                needed: if !installed { Some("install".into()) } else if !rights { Some("permission".into()) } else { None },
                tool: "bpf".into(),
                installed,
                version: backend.version,
                automatic: exists("osascript") || std::path::Path::new("/usr/bin/osascript").exists(),
                manual: "sudo chgrp admin /dev/bpf* && sudo chmod g+rw /dev/bpf*".into(),
                os,
            }
        }
        _ => SetupInfo { needed: if installed { None } else { Some("install".into()) }, tool: "libpcap".into(), installed, version: backend.version, automatic: false, manual: "(install libpcap)".into(), os },
    }
}

/// The Windows steps, in PowerShell (on every Windows 10 / 11): find the newest Npcap, download it, accept it only
/// with a valid signature from its publisher (Nmap Software LLC, formerly Insecure.Com LLC), run the installer
/// elevated and wait for it.
/// The free Npcap has no silent install (OEM only): the installer's own window asks the last questions.
#[cfg_attr(not(windows), allow(dead_code))]
pub const WINDOWS_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Write-Output 'STEP:find:'
$ver = $null
try {
  $page = (Invoke-WebRequest -UseBasicParsing -Uri 'https://npcap.com/' -TimeoutSec 30).Content
  $found = [regex]::Matches($page, 'npcap-(\d+\.\d+)\.exe') | ForEach-Object { [version]$_.Groups[1].Value }
  if ($found) { $ver = ($found | Sort-Object -Descending | Select-Object -First 1).ToString() }
} catch { }
if (-not $ver) { $ver = '1.90' }
# Installed already and as new as npcap.com's: nothing to do, no installer window.
if ($env:MNM_NPCAP_INSTALLED -and ([version]$ver -le [version]$env:MNM_NPCAP_INSTALLED)) { Write-Output "UPTODATE:$env:MNM_NPCAP_INSTALLED"; exit 0 }
$out = Join-Path $env:TEMP "npcap-$ver.exe"
Write-Output "STEP:download:$ver"
Invoke-WebRequest -UseBasicParsing -Uri "https://npcap.com/dist/npcap-$ver.exe" -OutFile $out -TimeoutSec 600
Write-Output 'STEP:verify:'
$sig = Get-AuthenticodeSignature -FilePath $out
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=(Nmap Software LLC|Insecure\.Com LLC)') {
  Remove-Item $out -Force -ErrorAction SilentlyContinue
  throw "The downloaded installer is not signed by the Npcap project ($($sig.Status))"
}
Write-Output 'STEP:install:'
$p = Start-Process -FilePath $out -ArgumentList '/winpcap_mode=yes', '/loopback_support=yes', '/admin_only=no' -Verb RunAs -Wait -PassThru
Remove-Item $out -Force -ErrorAction SilentlyContinue
Write-Output "DONE:$($p.ExitCode)"
"#;

/// Runs `cmd` and reports each "STEP:name:detail" line it prints; returns its output and whether it succeeded.
fn run_reporting(mut cmd: Command, report: &dyn Fn(SetupStep)) -> Result<(String, bool), String> {
    use std::io::{BufRead, BufReader};
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("no output")?;
    let mut lines = Vec::new();
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        if let Some(rest) = line.strip_prefix("STEP:") {
            let (step, detail) = rest.split_once(':').unwrap_or((rest, ""));
            report(SetupStep { step: step.to_string(), detail: detail.to_string() });
        }
        lines.push(line);
    }
    let mut err = String::new();
    if let Some(mut e) = child.stderr.take() {
        use std::io::Read;
        let _ = e.read_to_string(&mut err);
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let text = format!("{}\n{}", lines.join("\n"), err.trim());
    Ok((text, status.success()))
}

pub fn run(reinstall: bool, report: &dyn Fn(SetupStep)) -> SetupResult {
    let os = std::env::consts::OS;
    match os {
        "windows" => {
            let mut cmd = Command::new("powershell");
            cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WINDOWS_SCRIPT]);
            // Installed already: the script compares with the newest Npcap and opens no installer unless it is newer.
            if let Some(current) = installed_npcap_version() {
                cmd.env("MNM_NPCAP_INSTALLED", current);
            }
            let _ = reinstall;
            match run_reporting(cmd, report) {
                Ok((text, _)) if text.lines().any(|l| l.starts_with("UPTODATE:")) => {
                    let version = text.lines().find_map(|l| l.strip_prefix("UPTODATE:")).unwrap_or("").trim().to_string();
                    SetupResult { ok: true, restart: false, message: format!("uptodate:{version}") }
                }
                Ok((text, ok)) => {
                    let code = text.lines().find_map(|l| l.strip_prefix("DONE:")).and_then(|c| c.trim().parse::<i32>().ok());
                    if ok && code == Some(0) {
                        report(SetupStep { step: "check".into(), detail: String::new() });
                        let lib = super::pcap::backend_info();
                        if lib.available {
                            SetupResult { ok: true, restart: false, message: format!("Npcap {}", lib.version.unwrap_or_default()) }
                        } else {
                            // Installed, but this process cannot load it yet (a reinstall over a loaded library): start again.
                            SetupResult { ok: true, restart: true, message: lib.error.unwrap_or_default() }
                        }
                    } else if text.contains("canceled by the user") || text.contains("취소") || code == Some(2) {
                        SetupResult { ok: false, restart: false, message: "cancelled".into() }
                    } else {
                        SetupResult { ok: false, restart: false, message: last_error(&text, code) }
                    }
                }
                Err(e) => SetupResult { ok: false, restart: false, message: e },
            }
        }
        "linux" => {
            let info = info();
            // libpcap and the rights in place: nothing to do (updates come with the system's package manager).
            if info.needed.is_none() {
                return SetupResult { ok: true, restart: false, message: format!("uptodate:{}", info.version.unwrap_or_default()) };
            }
            if !info.automatic {
                return SetupResult { ok: false, restart: false, message: format!("pkexec not found — run: {}", info.manual) };
            }
            let exe = match std::env::current_exe() {
                Ok(p) => p.display().to_string(),
                Err(e) => return SetupResult { ok: false, restart: false, message: e.to_string() },
            };
            let mut script = String::new();
            if reinstall || !info.installed {
                match linux_install_command(reinstall) {
                    Some(line) => script.push_str(&format!("{line} && ")),
                    None => return SetupResult { ok: false, restart: false, message: format!("no known package manager — run: {}", info.manual) },
                }
            }
            script.push_str(&format!("setcap cap_net_raw,cap_net_admin=eip '{}'", exe.replace('\'', r"'\''")));
            report(SetupStep { step: if reinstall || !info.installed { "install".into() } else { "permission".into() }, detail: String::new() });
            let mut cmd = Command::new("pkexec");
            cmd.args(["sh", "-c", &script]);
            match run_reporting(cmd, report) {
                // Capabilities apply when the program starts: it must start again.
                Ok((_, true)) => SetupResult { ok: true, restart: true, message: String::new() },
                Ok((text, false)) => SetupResult { ok: false, restart: false, message: if text.contains("dismissed") || text.contains("Not authorized") { "cancelled".into() } else { last_error(&text, None) } },
                Err(e) => SetupResult { ok: false, restart: false, message: e },
            }
        }
        "macos" => {
            let info = info();
            if info.needed.is_none() {
                return SetupResult { ok: true, restart: false, message: format!("uptodate:{}", info.version.unwrap_or_default()) };
            }
            report(SetupStep { step: "permission".into(), detail: String::new() });
            // A launch daemon gives the admin group read/write on /dev/bpf* at every start; it also runs right now.
            let plist = "<plist><dict><key>Label</key><string>com.shkwon.mynetmanager.chmodbpf</string><key>ProgramArguments</key><array><string>/bin/sh</string><string>-c</string><string>chgrp admin /dev/bpf*; chmod g+rw /dev/bpf*</string></array><key>RunAtLoad</key><true/></dict></plist>";
            let shell = format!(
                "printf '%s' '{plist}' > /Library/LaunchDaemons/com.shkwon.mynetmanager.chmodbpf.plist; chmod 644 /Library/LaunchDaemons/com.shkwon.mynetmanager.chmodbpf.plist; launchctl unload /Library/LaunchDaemons/com.shkwon.mynetmanager.chmodbpf.plist 2>/dev/null; launchctl load -w /Library/LaunchDaemons/com.shkwon.mynetmanager.chmodbpf.plist; chgrp admin /dev/bpf*; chmod g+rw /dev/bpf*"
            );
            let apple = format!("do shell script \"{}\" with administrator privileges", shell.replace('\\', "\\\\").replace('"', "\\\""));
            let mut cmd = Command::new("/usr/bin/osascript");
            cmd.args(["-e", &apple]);
            match run_reporting(cmd, report) {
                Ok((_, true)) => SetupResult { ok: true, restart: false, message: String::new() },
                Ok((text, false)) => SetupResult { ok: false, restart: false, message: if text.contains("-128") { "cancelled".into() } else { last_error(&text, None) } },
                Err(e) => SetupResult { ok: false, restart: false, message: e },
            }
        }
        _ => SetupResult { ok: false, restart: false, message: "This system is not supported".into() },
    }
}

/// The installed Npcap's version ("1.83") from its library version text ("Npcap version 1.83, based on libpcap …").
pub fn installed_npcap_version() -> Option<String> {
    let text = super::pcap::backend_info().version?;
    npcap_version_of(&text)
}

pub fn npcap_version_of(text: &str) -> Option<String> {
    let rest = &text[text.find("Npcap version ")? + "Npcap version ".len()..];
    let v: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let v = v.trim_end_matches('.');
    (!v.is_empty()).then(|| v.to_string())
}

fn last_error(text: &str, code: Option<i32>) -> String {
    let line = text.lines().rev().map(str::trim).find(|l| !l.is_empty() && !l.starts_with("STEP:") && !l.starts_with("DONE:") && !l.starts_with("At line") && !l.starts_with("+")).unwrap_or("");
    match code {
        Some(c) if c != 0 => format!("installer exit code {c}{}", if line.is_empty() { String::new() } else { format!(": {line}") }),
        _ => if line.is_empty() { "setup failed".into() } else { line.to_string() },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn info_names_what_this_system_needs() {
        let i = info();
        assert_eq!(i.os, std::env::consts::OS);
        assert!(!i.tool.is_empty() && !i.manual.is_empty());
        // Capture works on the test machine (the desktop suite needs it too): nothing to set up.
        assert_eq!(i.needed, None, "capture is not ready on this machine: {i:?}");
        assert!(i.installed && i.version.is_some());
    }

    #[test]
    fn the_windows_script_checks_the_signature_before_running_the_installer() {
        let verify = WINDOWS_SCRIPT.find("Get-AuthenticodeSignature").expect("signature check");
        let run = WINDOWS_SCRIPT.find("Start-Process").expect("installer start");
        assert!(verify < run, "the installer must be verified before it runs");
        assert!(WINDOWS_SCRIPT.contains("O=(Nmap Software LLC|Insecure\\.Com LLC)"), "only the Npcap publisher is accepted");
        assert!(WINDOWS_SCRIPT.contains("-Verb RunAs"), "the installer runs as administrator");
        assert!(WINDOWS_SCRIPT.contains("https://npcap.com/dist/"), "downloads only from npcap.com");
    }

    #[test]
    fn the_installed_npcap_version_is_read_from_the_library_text() {
        assert_eq!(npcap_version_of("Npcap version 1.83, based on libpcap version 1.10.5").as_deref(), Some("1.83"));
        assert_eq!(npcap_version_of("libpcap version 1.10.4"), None);
    }

    #[test]
    fn an_installed_npcap_as_new_as_the_newest_opens_no_installer() {
        let check = WINDOWS_SCRIPT.find("UPTODATE").expect("the up-to-date check");
        assert!(check < WINDOWS_SCRIPT.find("Invoke-WebRequest -UseBasicParsing -Uri \"https://npcap.com/dist/").unwrap(), "checked before the download");
        assert!(check < WINDOWS_SCRIPT.find("Start-Process").unwrap(), "checked before the installer");
    }

    #[test]
    fn last_error_keeps_the_reason() {
        assert_eq!(last_error("STEP:find:\nboom\n", None), "boom");
        assert!(last_error("DONE:5", Some(5)).starts_with("installer exit code 5"));
    }
}
