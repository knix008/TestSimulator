//! install.rs - 운영체제마다 다른 설치 자리와 절차.
//!
//! ```text
//! Windows  %LOCALAPPDATA%\Programs\Chunjiin\chunjiin.exe   실행 파일
//!          시작 메뉴\프로그램\천지인 한글 입력기.lnk        바로 가기
//!          HKCU\...\Uninstall\Chunjiin                     "설정 > 앱" 목록
//!
//! Linux    ~/.local/share/Chunjiin/chunjiin                실행 파일
//!          ~/.local/bin/chunjiin                           PATH 에 걸리는 링크
//!          ~/.local/share/applications/chunjiin.desktop    프로그램 목록 항목
//!          ~/.local/share/icons/.../chunjiin.png           아이콘
//!
//! macOS    ~/Applications/Chunjiin.app                     앱 묶음
//! ```
//!
//! 모두 사용자 영역이라 관리자 권한(sudo)이 필요 없다.

use std::io;
use std::path::{Path, PathBuf};

// VERSION 과 ICON_PNG 은 운영체제마다 쓰는 데가 달라서 쓰는 자리에서 부른다.
use crate::APP_NAME;

/// 품고 있는 실행 파일의 이름이다.
pub fn exe_name() -> &'static str {
    if cfg!(windows) {
        "chunjiin.exe"
    } else {
        "chunjiin"
    }
}

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// 설치 폴더의 기본값이다.
pub fn default_target() -> PathBuf {
    #[cfg(windows)]
    {
        let base = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(home);
        base.join("Programs").join(APP_NAME)
    }
    #[cfg(target_os = "macos")]
    {
        home().join("Applications").join(format!("{APP_NAME}.app"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        home().join(".local").join("share").join(APP_NAME)
    }
}

/// 설치된 실행 파일의 자리다.
pub fn installed_exe(target: &Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        target.join("Contents").join("MacOS").join(exe_name())
    }
    #[cfg(not(target_os = "macos"))]
    {
        target.join(exe_name())
    }
}

/// 그 폴더에 이미 설치되어 있는지 본다.
pub fn is_installed(target: &Path) -> bool {
    !target.as_os_str().is_empty() && installed_exe(target).exists()
}

fn err(msg: impl Into<String>) -> io::Error {
    io::Error::other(msg.into())
}

// ---------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------

#[cfg(windows)]
mod plat {
    use super::*;
    use std::process::Command;

    const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Chunjiin";

    /// 시작 메뉴 바로 가기의 자리다.
    fn shortcut_path() -> PathBuf {
        let appdata = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(home);
        appdata
            .join(r"Microsoft\Windows\Start Menu\Programs")
            .join("천지인 한글 입력기.lnk")
    }

    pub fn install(target: &Path, data: &[u8]) -> io::Result<()> {
        std::fs::create_dir_all(target)
            .map_err(|e| err(format!("폴더를 만들지 못했습니다: {e}")))?;

        let exe = target.join(exe_name());
        write_exe(&exe, data)?;

        // 설치 프로그램 자신을 제거기로 복사해 둔다.
        if let Ok(me) = std::env::current_exe() {
            if let Ok(raw) = std::fs::read(&me) {
                let _ = std::fs::write(target.join("uninstall.exe"), raw);
            }
        }

        make_shortcut(&shortcut_path(), &exe, target)
            .map_err(|e| err(format!("바로 가기를 만들지 못했습니다: {e}")))?;
        write_uninstall_entry(target, &exe)
            .map_err(|e| err(format!("등록 정보를 쓰지 못했습니다: {e}")))?;
        Ok(())
    }

    /// 실행 파일을 쓴다.
    /// 이미 돌고 있으면 덮어쓸 수 없으므로, 옆으로 밀어 두고 새로 쓴다.
    fn write_exe(path: &Path, data: &[u8]) -> io::Result<()> {
        if std::fs::write(path, data).is_ok() {
            return Ok(());
        }
        let old = path.with_extension("exe.old");
        let _ = std::fs::remove_file(&old);
        std::fs::rename(path, &old).map_err(|e| {
            err(format!(
                "실행 파일을 쓰지 못했습니다(프로그램이 실행 중일 수 있습니다): {e}"
            ))
        })?;
        std::fs::write(path, data).map_err(|e| err(format!("실행 파일을 쓰지 못했습니다: {e}")))
    }

    /// `.lnk` 파일을 만든다.
    ///
    /// `IShellLink` 는 COM 이라 직접 부르려면 꾸러미가 늘어난다.
    /// Windows 에 늘 있는 PowerShell 의 `WScript.Shell` 로 대신한다.
    fn make_shortcut(link: &Path, exe: &Path, work_dir: &Path) -> io::Result<()> {
        if let Some(dir) = link.parent() {
            std::fs::create_dir_all(dir)?;
        }

        // 작은따옴표는 PowerShell 문자열에서 두 번 적어 막는다.
        let q = |p: &Path| format!("'{}'", p.display().to_string().replace('\'', "''"));

        let script = format!(
            "$s = (New-Object -ComObject WScript.Shell).CreateShortcut({});\
             $s.TargetPath = {};\
             $s.WorkingDirectory = {};\
             $s.IconLocation = {};\
             $s.Description = '천지인 한글 입력기';\
             $s.Save()",
            q(link),
            q(exe),
            q(work_dir),
            q(exe)
        );

        let out = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()?;
        if !out.status.success() {
            return Err(err(String::from_utf8_lossy(&out.stderr).trim().to_string()));
        }
        Ok(())
    }

    /// "설정 > 앱" 목록에 나오도록 등록 정보를 쓴다.
    ///
    /// 레지스트리 꾸러미를 들이지 않고 `reg.exe` 로 쓴다. Windows 에 늘 있고,
    /// 쓰는 값이 여섯 개뿐이라 이것으로 넉넉하다.
    fn write_uninstall_entry(target: &Path, exe: &Path) -> io::Result<()> {
        let uninstaller = target.join("uninstall.exe");
        let pairs: [(&str, String); 6] = [
            ("DisplayName", "천지인 한글 입력기".into()),
            ("DisplayVersion", crate::VERSION.into()),
            ("Publisher", "SHKWON".into()),
            ("DisplayIcon", exe.display().to_string()),
            ("InstallLocation", target.display().to_string()),
            ("UninstallString", uninstaller.display().to_string()),
        ];

        for (name, value) in pairs {
            let out = Command::new("reg")
                .args([
                    "add",
                    &format!(r"HKCU\{UNINSTALL_KEY}"),
                    "/v",
                    name,
                    "/t",
                    "REG_SZ",
                    "/d",
                    &value,
                    "/f",
                ])
                .output()?;
            if !out.status.success() {
                return Err(err(String::from_utf8_lossy(&out.stderr).trim().to_string()));
            }
        }

        let _ = Command::new("reg")
            .args([
                "add",
                &format!(r"HKCU\{UNINSTALL_KEY}"),
                "/v",
                "NoModify",
                "/t",
                "REG_DWORD",
                "/d",
                "1",
                "/f",
            ])
            .output();
        Ok(())
    }

    pub fn uninstall(target: &Path) -> io::Result<()> {
        let _ = std::fs::remove_file(shortcut_path());
        let _ = Command::new("reg")
            .args(["delete", &format!(r"HKCU\{UNINSTALL_KEY}"), "/f"])
            .output();

        // 제거기 자신이 그 폴더에서 돌고 있으면 지금 지울 수 없다.
        // 잠깐 기다렸다 지우는 cmd 를 띄우고 우리는 물러난다.
        let me = std::env::current_exe().unwrap_or_default();
        let inside = me
            .display()
            .to_string()
            .to_lowercase()
            .starts_with(&target.display().to_string().to_lowercase());

        if inside {
            Command::new("cmd")
                .args([
                    "/C",
                    &format!(
                        "timeout /t 2 /nobreak >nul & rd /s /q \"{}\"",
                        target.display()
                    ),
                ])
                .spawn()?;
            return Ok(());
        }

        std::fs::remove_dir_all(target).map_err(|e| err(format!("폴더를 지우지 못했습니다: {e}")))
    }
}

// ---------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------

#[cfg(all(unix, not(target_os = "macos")))]
mod plat {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    pub fn install(target: &Path, data: &[u8]) -> io::Result<()> {
        std::fs::create_dir_all(target)
            .map_err(|e| err(format!("폴더를 만들지 못했습니다: {e}")))?;

        let exe = target.join(exe_name());
        std::fs::write(&exe, data).map_err(|e| err(format!("실행 파일을 쓰지 못했습니다: {e}")))?;
        std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755))?;

        let home = home();

        // PATH 에 잡히도록 ~/.local/bin 에 심볼릭 링크를 건다.
        let bin = home.join(".local").join("bin");
        if std::fs::create_dir_all(&bin).is_ok() {
            let link = bin.join(exe_name());
            let _ = std::fs::remove_file(&link);
            let _ = std::os::unix::fs::symlink(&exe, &link);
        }

        let icon_dir = home.join(".local/share/icons/hicolor/256x256/apps");
        let icon = icon_dir.join("chunjiin.png");
        if std::fs::create_dir_all(&icon_dir).is_ok() {
            let _ = std::fs::write(&icon, crate::ICON_PNG);
        }

        let app_dir = home.join(".local").join("share").join("applications");
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| err(format!("프로그램 목록 폴더를 만들지 못했습니다: {e}")))?;

        let desktop = format!(
            "[Desktop Entry]\n\
             Type=Application\n\
             Name=Chunjiin Hangul Keyboard\n\
             Name[ko]=천지인 한글 입력기\n\
             Comment=12-key Chunjiin Hangul input\n\
             Comment[ko]=12키 천지인 자판 한글 입력기\n\
             Exec={}\n\
             Icon={}\n\
             Terminal=false\n\
             Categories=Utility;\n\
             StartupWMClass=chunjiin\n",
            exe.display(),
            icon.display()
        );
        std::fs::write(app_dir.join("chunjiin.desktop"), desktop)
    }

    pub fn uninstall(target: &Path) -> io::Result<()> {
        std::fs::remove_dir_all(target)
            .map_err(|e| err(format!("폴더를 지우지 못했습니다: {e}")))?;

        let home = home();
        let _ = std::fs::remove_file(home.join(".local/bin").join(exe_name()));
        let _ = std::fs::remove_file(home.join(".local/share/applications/chunjiin.desktop"));
        let _ =
            std::fs::remove_file(home.join(".local/share/icons/hicolor/256x256/apps/chunjiin.png"));
        Ok(())
    }
}

// ---------------------------------------------------------------------
// macOS
// ---------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod plat {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// `.app` 묶음을 만든다.
    pub fn install(target: &Path, data: &[u8]) -> io::Result<()> {
        let macos = target.join("Contents").join("MacOS");
        let res = target.join("Contents").join("Resources");
        for d in [&macos, &res] {
            std::fs::create_dir_all(d)
                .map_err(|e| err(format!("폴더를 만들지 못했습니다: {e}")))?;
        }

        let exe = macos.join(exe_name());
        std::fs::write(&exe, data).map_err(|e| err(format!("실행 파일을 쓰지 못했습니다: {e}")))?;
        std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755))?;
        let _ = std::fs::write(res.join("chunjiin.png"), crate::ICON_PNG);

        let plist = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key><string>{APP_NAME}</string>
	<key>CFBundleDisplayName</key><string>{APP_NAME}</string>
	<key>CFBundleIdentifier</key><string>com.knix008.chunjiin</string>
	<key>CFBundleVersion</key><string>{ver}</string>
	<key>CFBundleShortVersionString</key><string>{ver}</string>
	<key>CFBundleExecutable</key><string>{}</string>
	<key>CFBundleIconFile</key><string>chunjiin.png</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
"#,
            exe_name(),
            ver = crate::VERSION
        );
        std::fs::write(target.join("Contents").join("Info.plist"), plist)
    }

    pub fn uninstall(target: &Path) -> io::Result<()> {
        std::fs::remove_dir_all(target).map_err(|e| err(format!("폴더를 지우지 못했습니다: {e}")))
    }
}

pub use plat::{install, uninstall};
