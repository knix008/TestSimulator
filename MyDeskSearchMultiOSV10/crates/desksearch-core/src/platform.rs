use std::path::{Path, PathBuf};
use std::process::Command;

pub const STARTUP_VALUE_NAME: &str = "MyDeskSearch";
pub const LINUX_DESKTOP_FILE: &str = "mydesksearch.desktop";
pub const MACOS_LABEL: &str = "com.mydesksearch.app";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AutostartArtifact {
    WindowsRun { value_name: String, command: String },
    DesktopFile { relative_path: String, body: String },
    LaunchAgent { relative_path: String, body: String },
}

pub fn autostart_artifact(exe: &Path) -> AutostartArtifact {
    if cfg!(windows) {
        AutostartArtifact::WindowsRun {
            value_name: STARTUP_VALUE_NAME.to_string(),
            command: windows_run_command(exe),
        }
    } else if cfg!(target_os = "macos") {
        AutostartArtifact::LaunchAgent {
            relative_path: format!("Library/LaunchAgents/{MACOS_LABEL}.plist"),
            body: render_macos_plist(exe),
        }
    } else {
        AutostartArtifact::DesktopFile {
            relative_path: format!(".config/autostart/{LINUX_DESKTOP_FILE}"),
            body: render_linux_desktop(exe),
        }
    }
}

pub fn windows_run_command(exe: &Path) -> String {
    format!("\"{}\"", exe.display())
}

pub fn render_linux_desktop(exe: &Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=MyDeskSearch\nExec=\"{}\"\nX-GNOME-Autostart-enabled=true\n",
        exe.display()
    )
}

pub fn render_macos_plist(exe: &Path) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>{label}</string>
<key>ProgramArguments</key><array><string>{exe}</string></array>
<key>RunAtLoad</key><true/>
</dict></plist>
"#,
        label = MACOS_LABEL,
        exe = xml_escape(&exe.display().to_string())
    )
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

pub fn write_autostart(home: &Path, exe: &Path) -> std::io::Result<PathBuf> {
    let artifact = autostart_artifact(exe);
    match artifact {
        AutostartArtifact::WindowsRun { .. } => {
            install_windows_run(exe)?;
            Ok(exe.to_path_buf())
        }
        AutostartArtifact::DesktopFile {
            relative_path,
            body,
        }
        | AutostartArtifact::LaunchAgent {
            relative_path,
            body,
        } => {
            let path = home.join(relative_path);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, body)?;
            Ok(path)
        }
    }
}

pub fn remove_autostart(home: &Path) -> std::io::Result<()> {
    if cfg!(windows) {
        return remove_windows_run();
    }
    let artifact = autostart_artifact(Path::new("desksearch"));
    let relative = match artifact {
        AutostartArtifact::DesktopFile { relative_path, .. }
        | AutostartArtifact::LaunchAgent { relative_path, .. } => relative_path,
        AutostartArtifact::WindowsRun { .. } => return Ok(()),
    };
    let path = home.join(relative);
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

pub fn set_run_at_startup(enabled: bool, exe: &Path) -> std::io::Result<()> {
    let home = home_dir();
    if enabled {
        write_autostart(&home, exe).map(|_| ())
    } else {
        remove_autostart(&home)
    }
}

fn home_dir() -> PathBuf {
    if cfg!(windows) {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            return PathBuf::from(profile);
        }
    }
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

#[cfg(windows)]
fn install_windows_run(exe: &Path) -> std::io::Result<()> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
        .map_err(io_reg)?
        .0;
    key.set_value(STARTUP_VALUE_NAME, &windows_run_command(exe))
        .map_err(io_reg)?;
    Ok(())
}

#[cfg(windows)]
fn remove_windows_run() -> std::io::Result<()> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_READ | KEY_WRITE,
        )
        .map_err(io_reg)?;
    match key.delete_value(STARTUP_VALUE_NAME) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(windows)]
fn io_reg(error: std::io::Error) -> std::io::Error {
    error
}

#[cfg(not(windows))]
fn install_windows_run(_exe: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
fn remove_windows_run() -> std::io::Result<()> {
    Ok(())
}

pub fn open_path(path: &Path) -> std::io::Result<()> {
    spawn_detached(open_command(path))
}

pub fn reveal_path(path: &Path) -> std::io::Result<()> {
    spawn_detached(reveal_command(path))
}

pub fn open_command(path: &Path) -> Command {
    #[cfg(windows)]
    {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", &path.to_string_lossy()]);
        command
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg(path);
        command
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    }
}

pub fn reveal_command(path: &Path) -> Command {
    #[cfg(windows)]
    {
        let mut command = Command::new("explorer");
        command.arg(format!("/select,{}", path.display()));
        command
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.args(["-R"]);
        command.arg(path);
        command
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = path.parent().unwrap_or(path);
        let mut command = Command::new("xdg-open");
        command.arg(parent);
        command
    }
}

fn spawn_detached(mut command: Command) -> std::io::Result<()> {
    command.spawn().map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn autostart_text_names_the_executable() {
        let exe = Path::new("/opt/mydesksearch");
        let linux = render_linux_desktop(exe);
        assert!(linux.contains("Exec=\"/opt/mydesksearch\""));
        assert!(linux.contains("Name=MyDeskSearch"));
        let mac = render_macos_plist(Path::new(
            "/Applications/MyDeskSearch.app/Contents/MacOS/mydesksearch",
        ));
        assert!(mac.contains("<key>RunAtLoad</key><true/>"));
        assert!(mac.contains(MACOS_LABEL));
        assert_eq!(
            windows_run_command(Path::new(r"C:\Program Files\MyDeskSearch\mydesksearch.exe")),
            r#""C:\Program Files\MyDeskSearch\mydesksearch.exe""#
        );
    }

    #[test]
    fn file_autostart_roundtrip_uses_the_home_directory() {
        let home = tempfile::tempdir().unwrap();
        let exe = home.path().join("mydesksearch");
        if cfg!(windows) {
            let artifact = AutostartArtifact::DesktopFile {
                relative_path: ".config/autostart/mydesksearch.desktop".to_string(),
                body: render_linux_desktop(&exe),
            };
            let path = home.path().join(&artifact_relative(&artifact));
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, render_linux_desktop(&exe)).unwrap();
            assert!(std::fs::read_to_string(path)
                .unwrap()
                .contains("MyDeskSearch"));
        } else {
            let path = write_user_artifact(home.path(), &exe);
            assert!(path.exists());
            remove_user_artifact(home.path());
            assert!(!path.exists());
        }
    }

    fn artifact_relative(artifact: &AutostartArtifact) -> String {
        match artifact {
            AutostartArtifact::DesktopFile { relative_path, .. }
            | AutostartArtifact::LaunchAgent { relative_path, .. } => relative_path.clone(),
            AutostartArtifact::WindowsRun { .. } => String::new(),
        }
    }

    fn write_user_artifact(home: &Path, exe: &Path) -> PathBuf {
        let artifact = if cfg!(target_os = "macos") {
            AutostartArtifact::LaunchAgent {
                relative_path: format!("Library/LaunchAgents/{MACOS_LABEL}.plist"),
                body: render_macos_plist(exe),
            }
        } else {
            AutostartArtifact::DesktopFile {
                relative_path: format!(".config/autostart/{LINUX_DESKTOP_FILE}"),
                body: render_linux_desktop(exe),
            }
        };
        let (relative, body) = match artifact {
            AutostartArtifact::DesktopFile {
                relative_path,
                body,
            }
            | AutostartArtifact::LaunchAgent {
                relative_path,
                body,
            } => (relative_path, body),
            AutostartArtifact::WindowsRun { .. } => unreachable!(),
        };
        let path = home.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, body).unwrap();
        path
    }

    fn remove_user_artifact(home: &Path) {
        let _ = std::fs::remove_file(home.join(".config/autostart").join(LINUX_DESKTOP_FILE));
        let _ = std::fs::remove_file(
            home.join("Library/LaunchAgents")
                .join(format!("{MACOS_LABEL}.plist")),
        );
    }
}
