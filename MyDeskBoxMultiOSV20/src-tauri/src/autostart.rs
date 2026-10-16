// 로그인할 때 스스로 켜지기 (Electron 판 src/main/autostart.js).
//
// 설치하고 시스템을 다시 켜면 MyDeskBox 가 알아서 돌아와 있어야 한다.
//  - Windows : HKCU\…\Run 에 'MyDeskBox' 라는 이름으로 적는다. Electron 판과 같은 이름이라
//              제거 프로그램(hooks.nsh)이 그 이름으로 찾아 치운다.
//  - macOS   : ~/Library/LaunchAgents 에 plist 를 둔다.
//  - Linux   : ~/.config/autostart 에 .desktop 파일을 둔다. AppImage 면 바깥 경로를 적는다.
//
// 설정과 운영체제가 어긋날 수 있어(다시 설치, 사람이 지움) 켤 때마다 맞춘다(sync).
// 개발 중에 띄운 것(디버그 빌드)은 등록하지 않는다. 그 실행 파일은 target 폴더 안에 있다.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub const DESKTOP_FILE: &str = "mydeskbox.desktop";
pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

pub enum Backend {
    #[cfg(windows)]
    Registry,
    #[allow(dead_code)]
    LaunchAgent(PathBuf),
    #[allow(dead_code)]
    DesktopFile(PathBuf),
    // 검사용. 적힌 값만 기억한다.
    #[allow(dead_code)]
    Memory(Mutex<Option<String>>),
}

pub struct Autostart {
    pub packaged: bool,
    pub exe: String,
    pub backend: Backend,
}

// .desktop 안에서 Exec 에 넣을 경로. 빈칸이 든 자리는 따옴표로 감싼다.
pub fn quoted(value: &str) -> String {
    if value.contains([' ', '\t', '"', '\'']) {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value.to_string()
    }
}

pub fn linux_body(name: &str, exe: &str) -> String {
    [
        "[Desktop Entry]".to_string(),
        "Type=Application".to_string(),
        format!("Name={name}"),
        format!("Exec={}", quoted(exe)),
        "Terminal=false".to_string(),
        "NoDisplay=true".to_string(),
        "X-GNOME-Autostart-enabled=true".to_string(),
        String::new(),
    ]
    .join("\n")
}

pub fn mac_plist(exe: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n  <key>Label</key>\n  <string>com.suhokwon.mydeskbox</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>{}</string>\n  </array>\n  <key>RunAtLoad</key>\n  <true/>\n</dict>\n</plist>\n",
        exe.replace('&', "&amp;").replace('<', "&lt;")
    )
}

impl Autostart {
    // 이 운영체제의 진짜 자리.
    pub fn system(packaged: bool) -> Self {
        let exe = std::env::var("APPIMAGE")
            .ok()
            .filter(|v| !v.is_empty())
            .or_else(|| std::env::current_exe().ok().map(|p| p.to_string_lossy().into_owned()))
            .unwrap_or_default();
        #[cfg(windows)]
        let backend = Backend::Registry;
        #[cfg(target_os = "macos")]
        let backend = Backend::LaunchAgent(
            PathBuf::from(crate::desktop::files::home()).join("Library/LaunchAgents/com.suhokwon.mydeskbox.plist"),
        );
        #[cfg(all(not(windows), not(target_os = "macos")))]
        let backend = {
            let base = std::env::var("XDG_CONFIG_HOME")
                .ok()
                .filter(|v| !v.is_empty())
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(crate::desktop::files::home()).join(".config"));
            Backend::DesktopFile(base.join("autostart").join(DESKTOP_FILE))
        };
        Self { packaged, exe, backend }
    }

    // 지금 운영체제에 등록돼 있는가.
    pub fn enabled(&self, name: &str) -> bool {
        match &self.backend {
            #[cfg(windows)]
            Backend::Registry => crate::reg::read_string(crate::reg::HKCU, RUN_KEY, &label(name)).is_some(),
            Backend::LaunchAgent(file) | Backend::DesktopFile(file) => file.exists(),
            Backend::Memory(m) => m.lock().unwrap().is_some(),
        }
    }

    // 사람이 설정에서 켜고 끌 때. 운영체제에 실제로 적었으면 참을 준다.
    pub fn apply(&self, on: bool, name: &str) -> bool {
        if !self.packaged {
            return false;
        }
        let name = label(name);
        match &self.backend {
            #[cfg(windows)]
            Backend::Registry => {
                if on {
                    crate::reg::write_string(crate::reg::HKCU, RUN_KEY, &name, &format!("\"{}\"", self.exe))
                } else {
                    crate::reg::delete_value(crate::reg::HKCU, RUN_KEY, &name);
                    true
                }
            }
            Backend::LaunchAgent(file) => write_or_remove(file, on.then(|| mac_plist(&self.exe))),
            Backend::DesktopFile(file) => write_or_remove(file, on.then(|| linux_body(&name, &self.exe))),
            Backend::Memory(m) => {
                *m.lock().unwrap() = on.then(|| self.exe.clone());
                true
            }
        }
    }

    // 켤 때마다 한 번. 설정 쪽을 참으로 보고 운영체제를 거기에 맞춘다.
    // 끄기로 해 둔 경우에는 남아 있을 때만 지운다.
    pub fn sync(&self, on: bool, name: &str) -> bool {
        if !self.packaged {
            return false;
        }
        if !on && !self.enabled(name) {
            return false;
        }
        self.apply(on, name)
    }
}

fn label(name: &str) -> String {
    if name.is_empty() {
        "MyDeskBox".into()
    } else {
        name.to_string()
    }
}

fn write_or_remove(file: &PathBuf, body: Option<String>) -> bool {
    match body {
        None => match fs::remove_file(file) {
            Ok(_) => true,
            Err(e) => e.kind() == std::io::ErrorKind::NotFound,
        },
        Some(body) => {
            if let Some(dir) = file.parent() {
                if fs::create_dir_all(dir).is_err() {
                    return false;
                }
            }
            fs::write(file, body).is_ok()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn linux(dir: &std::path::Path, exe: &str, packaged: bool) -> Autostart {
        Autostart { packaged, exe: exe.into(), backend: Backend::DesktopFile(dir.join("autostart").join(DESKTOP_FILE)) }
    }

    #[test]
    fn enabling_writes_and_disabling_removes_the_desktop_file() {
        let dir = tempfile::tempdir().unwrap();
        let auto = linux(dir.path(), "/opt/mydeskbox/MyDeskBox", true);
        assert!(auto.apply(true, "MyDeskBox"));
        let file = dir.path().join("autostart").join(DESKTOP_FILE);
        let body = fs::read_to_string(&file).unwrap();
        for line in ["[Desktop Entry]", "Type=Application", "Name=MyDeskBox", "Exec=/opt/mydeskbox/MyDeskBox", "X-GNOME-Autostart-enabled=true", "Terminal=false", "NoDisplay=true"] {
            assert!(body.lines().any(|l| l == line), "{line}");
        }
        assert!(body.ends_with('\n'));
        assert!(auto.enabled("MyDeskBox"));
        assert!(auto.apply(true, ""));
        assert_eq!(fs::read_dir(dir.path().join("autostart")).unwrap().count(), 1);
        assert!(fs::read_to_string(&file).unwrap().contains("Name=MyDeskBox"));
        assert!(auto.apply(false, "MyDeskBox"));
        assert!(!file.exists());
        assert!(!auto.enabled("MyDeskBox"));
        assert!(!auto.sync(false, "MyDeskBox"), "tried to delete a file that does not exist");
        assert!(auto.sync(true, "MyDeskBox"));
        assert!(file.exists());
    }

    #[test]
    fn a_development_run_is_not_registered() {
        let dir = tempfile::tempdir().unwrap();
        let auto = linux(dir.path(), "/x", false);
        assert!(!auto.apply(true, "MyDeskBox"));
        assert!(!auto.sync(true, "MyDeskBox"));
        assert!(!dir.path().join("autostart").exists());
    }

    #[test]
    fn paths_with_spaces_are_quoted() {
        assert_eq!(quoted("/home/me/Apps/My Desk Box.AppImage"), "\"/home/me/Apps/My Desk Box.AppImage\"");
        assert_eq!(quoted("/opt/mydeskbox/MyDeskBox"), "/opt/mydeskbox/MyDeskBox");
        assert!(mac_plist("/Applications/MyDeskBox.app/Contents/MacOS/MyDeskBox").contains("<string>/Applications/MyDeskBox.app"));
    }
}
