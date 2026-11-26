//! Mounting an image as a drive: Windows Mount-DiskImage, macOS hdiutil, Linux mount -o loop
//! (fuseiso without root).

use crate::util::*;
use serde_json::{json, Value};
use std::path::Path;
use std::process::Command;

fn result(mounted: bool, mount_point: Option<String>, message: String) -> Value {
    let mut v = json!({ "mounted": mounted, "message": message });
    if let Some(m) = mount_point {
        v["mountPoint"] = json!(m);
    }
    v
}

fn message(o: &Output) -> String {
    let t = if o.stderr.trim().is_empty() { o.stdout.trim() } else { o.stderr.trim() };
    if t.is_empty() {
        format!("exit {}", o.code)
    } else {
        t.to_string()
    }
}

fn exec(program: &str, args: &[&str]) -> Res<Output> {
    let mut cmd = Command::new(program);
    cmd.args(args).env("PATH", search_path());
    run(&mut cmd, None, Some(std::time::Duration::from_secs(120)), &|_, _| {})
}

fn ps_quote(v: &str) -> String {
    v.replace('\'', "''")
}

fn powershell(script: &str) -> Res<Output> {
    let ps = std::env::var_os("SystemRoot")
        .map(|r| Path::new(&r).join("System32").join("WindowsPowerShell").join("v1.0").join("powershell.exe"))
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "powershell.exe".into());
    exec(&ps, &["-NoProfile", "-NonInteractive", "-Command", script])
}

pub fn mount(image: &str) -> Value {
    if !Path::new(image).exists() {
        return result(false, None, format!("Image not found: {image}"));
    }
    if cfg!(windows) {
        let script = format!(
            "$ErrorActionPreference = 'Stop'\n$img = Mount-DiskImage -ImagePath '{}' -PassThru\n$vol = $img | Get-Volume\nif (-not $vol.DriveLetter) {{ throw 'No drive letter assigned' }}\nWrite-Output ($vol.DriveLetter + ':\\')\n",
            ps_quote(image)
        );
        return match powershell(&script) {
            Ok(o) if o.code == 0 => {
                let mp = o.stdout.trim().to_string();
                result(true, Some(mp.clone()), format!("Mounted at {mp}"))
            }
            Ok(o) => result(false, None, message(&o)),
            Err(e) => result(false, None, e),
        };
    }
    if cfg!(target_os = "macos") {
        return match exec("hdiutil", &["attach", "-readonly", image]) {
            Ok(o) if o.code == 0 => {
                let last = o.stdout.trim().lines().last().unwrap_or_default().to_string();
                let mp = last.split('\t').map(str::trim).find(|p| p.starts_with("/Volumes/")).map(String::from).or_else(|| last.split_whitespace().last().map(String::from));
                let msg = mp.as_ref().map(|m| format!("Mounted at {m}")).unwrap_or_else(|| "Mounted".into());
                result(true, mp, msg)
            }
            Ok(o) => result(false, None, message(&o)),
            Err(e) => result(false, None, e),
        };
    }
    let mp = std::env::temp_dir().join(format!("isomaker-mnt-{}", tag()));
    let _ = std::fs::create_dir_all(&mp);
    let mps = mp.to_string_lossy().to_string();
    let first = exec("mount", &["-o", "loop,ro", image, &mps]);
    if let Ok(o) = &first {
        if o.code == 0 {
            return result(true, Some(mps.clone()), format!("Mounted at {mps}"));
        }
    }
    if let Ok(o) = exec("fuseiso", &[image, &mps]) {
        if o.code == 0 {
            return result(true, Some(mps.clone()), format!("Mounted via fuseiso at {mps}"));
        }
    }
    let _ = std::fs::remove_dir(&mp);
    let why = match first {
        Ok(o) => message(&o),
        Err(e) => e,
    };
    result(false, None, format!("{why} (tip: run with privileges or install fuseiso)"))
}

/// Windows: the image path; elsewhere the mount point.
pub fn unmount(target: &str) -> Value {
    if cfg!(windows) {
        let script = format!("$ErrorActionPreference = 'Stop'\nDismount-DiskImage -ImagePath '{}' | Out-Null\n", ps_quote(target));
        return match powershell(&script) {
            Ok(o) if o.code == 0 => result(false, None, "Unmounted".into()),
            Ok(o) => result(true, None, message(&o)),
            Err(e) => result(true, None, e),
        };
    }
    if cfg!(target_os = "macos") {
        return match exec("hdiutil", &["detach", target]) {
            Ok(o) if o.code == 0 => result(false, None, "Unmounted".into()),
            Ok(o) => result(true, None, message(&o)),
            Err(e) => result(true, None, e),
        };
    }
    match exec("umount", &[target]) {
        Ok(o) if o.code == 0 => {
            let _ = std::fs::remove_dir(target);
            result(false, None, "Unmounted".into())
        }
        other => {
            if let Ok(o) = exec("fusermount", &["-u", target]) {
                if o.code == 0 {
                    let _ = std::fs::remove_dir(target);
                    return result(false, None, "Unmounted (fuse)".into());
                }
            }
            let why = match other {
                Ok(o) => message(&o),
                Err(e) => e,
            };
            result(true, None, why)
        }
    }
}
