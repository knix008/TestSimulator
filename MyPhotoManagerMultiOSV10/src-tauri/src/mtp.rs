//! Phones and cameras connected over USB (MTP / PTP). They have no drive
//! letter, so the import dialog cannot just list a folder:
//!   Windows — the Shell namespace ("This PC") lists them; PowerShell walks
//!             their DCIM / Pictures folders and copies new files out
//!   Linux   — GVFS mounts them under /run/user/<uid>/gvfs/mtp:… (plain files)
//!   macOS   — no system MTP access (Image Capture is not scriptable here)
//! The photos are copied ("staged") into the app data folder, and the normal
//! import dialog then takes over (renaming, date folders, duplicates …).
//! Tests: MYPHOTO_FAKE_MTP=<folder> pretends that folder is a phone.

use serde::Serialize;
use std::path::{Path, PathBuf};

pub const MEDIA: &[&str] = &["jpg", "jpeg", "png", "heic", "heif", "dng", "cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "gif", "webp", "mp4", "mov", "m4v", "3gp", "avi", "mkv"];

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Device {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Debug, Default)]
pub struct Staged {
    pub folder: String,
    pub copied: usize,
    pub skipped: usize,
}

fn is_media(name: &str) -> bool {
    Path::new(name).extension().and_then(|e| e.to_str()).is_some_and(|e| MEDIA.contains(&e.to_ascii_lowercase().as_str()))
}

/// File-name-safe folder name for a device.
pub fn folder_name(name: &str) -> String {
    let clean: String = name.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' }).collect();
    let clean = clean.trim().to_string();
    if clean.is_empty() { "device".into() } else { clean }
}

pub fn devices() -> Vec<Device> {
    if let Some(fake) = std::env::var_os("MYPHOTO_FAKE_MTP") {
        return vec![Device { id: format!("fake:{}", PathBuf::from(fake).display()), name: "Test Phone".into() }];
    }
    platform::devices()
}

/// Copies the device's photos and videos that are not staged yet into `dest`.
pub fn stage(id: &str, dest: &Path) -> Result<Staged, String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    if let Some(folder) = id.strip_prefix("fake:") {
        return copy_tree(Path::new(folder), dest);
    }
    platform::stage(id, dest)
}

/// Copies media files below `from` (photo folders: DCIM, Pictures …, or all when
/// there are none) into `dest`, flat; a file already there with the same size is skipped.
pub fn copy_tree(from: &Path, dest: &Path) -> Result<Staged, String> {
    let mut out = Staged { folder: dest.to_string_lossy().into_owned(), ..Default::default() };
    let roots: Vec<PathBuf> = ["DCIM", "Pictures", "Camera"].iter().map(|d| from.join(d)).filter(|p| p.is_dir()).collect();
    let roots = if roots.is_empty() { vec![from.to_path_buf()] } else { roots };
    let mut stack = roots;
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_media(&name) {
                continue;
            }
            let target = dest.join(&name);
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            if target.metadata().map(|m| m.len() == size).unwrap_or(false) {
                out.skipped += 1;
                continue;
            }
            std::fs::copy(&path, &target).map_err(|e| format!("{name}: {e}"))?;
            if let Ok(modified) = entry.metadata().and_then(|m| m.modified()) {
                let _ = filetime::set_file_mtime(&target, filetime::FileTime::from_system_time(modified));
            }
            out.copied += 1;
        }
    }
    Ok(out)
}

#[cfg(windows)]
mod platform {
    use super::{Device, Staged, MEDIA};
    use std::os::windows::process::CommandExt;
    use std::path::Path;
    use std::process::Command;

    const NO_WINDOW: u32 = 0x0800_0000;

    // ASCII only: Windows PowerShell 5.1 misreads UTF-8 scripts without a BOM.
    const LIST: &str = r#"
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject Shell.Application
$out = @()
foreach ($item in $shell.NameSpace(17).Items()) {
  if ($item.IsFolder -and -not $item.IsFileSystem) { $out += [pscustomobject]@{ id = $item.Path; name = $item.Name } }
}
ConvertTo-Json -InputObject @($out) -Compress
"#;

    const STAGE: &str = r#"
param([string]$Id, [string]$Dest, [string]$Exts)
$ErrorActionPreference = 'Stop'
$exts = $Exts.Split(',')
$shell = New-Object -ComObject Shell.Application
$device = $null
foreach ($item in $shell.NameSpace(17).Items()) { if ($item.Path -eq $Id) { $device = $item } }
if ($null -eq $device) { throw "device not found" }
$target = $shell.NameSpace($Dest)
$script:copied = 0
$script:skipped = 0
function Visit($folder, $depth, $inPhotos) {
  foreach ($item in $folder.Items()) {
    if ($item.IsFolder) {
      $name = $item.Name.ToLower()
      $photos = $inPhotos -or $name -eq 'dcim' -or $name -eq 'pictures' -or $name -eq 'camera'
      if ($depth -lt 1 -or $photos) { if ($depth -lt 7) { Visit $item.GetFolder ($depth + 1) $photos } }
      continue
    }
    if (-not $inPhotos) { continue }
    $ext = [System.IO.Path]::GetExtension($item.Name).TrimStart('.').ToLower()
    if ($exts -notcontains $ext) { continue }
    $path = Join-Path $Dest $item.Name
    if ((Test-Path $path) -and ((Get-Item $path).Length -eq $item.Size)) { $script:skipped++; continue }
    $target.CopyHere($item, 4 + 16 + 1024)
    $waited = 0
    while ($waited -lt 600) {
      Start-Sleep -Milliseconds 100
      $waited++
      if ((Test-Path $path) -and ((Get-Item $path).Length -eq $item.Size)) { break }
    }
    $script:copied++
  }
}
Visit $device.GetFolder 0 $false
ConvertTo-Json -InputObject @{ copied = $script:copied; skipped = $script:skipped } -Compress
"#;

    fn powershell(script: &str, args: &[&str]) -> Result<String, String> {
        let file = std::env::temp_dir().join(format!("myphoto-mtp-{}.ps1", std::process::id()));
        std::fs::write(&file, script).map_err(|e| e.to_string())?;
        let output = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&file)
            .args(args)
            .creation_flags(NO_WINDOW)
            .output()
            .map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&file);
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    pub fn devices() -> Vec<Device> {
        let Ok(text) = powershell(LIST, &[]) else { return Vec::new() };
        serde_json::from_str::<Vec<serde_json::Value>>(&text)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|v| Some(Device { id: v.get("id")?.as_str()?.to_string(), name: v.get("name")?.as_str()?.to_string() }))
            .collect()
    }

    pub fn stage(id: &str, dest: &Path) -> Result<Staged, String> {
        let dest_text = dest.to_string_lossy().into_owned();
        let text = powershell(STAGE, &["-Id", id, "-Dest", &dest_text, "-Exts", &MEDIA.join(",")])?;
        let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        Ok(Staged { folder: dest_text, copied: v["copied"].as_u64().unwrap_or(0) as usize, skipped: v["skipped"].as_u64().unwrap_or(0) as usize })
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::{copy_tree, Device, Staged};
    use std::path::Path;

    fn gvfs() -> Option<std::path::PathBuf> {
        let uid = std::fs::read_to_string("/proc/self/status").ok()?.lines().find_map(|l| l.strip_prefix("Uid:").map(|v| v.split_whitespace().next().unwrap_or("").to_string()))?;
        Some(std::path::PathBuf::from(format!("/run/user/{uid}/gvfs")))
    }

    pub fn devices() -> Vec<Device> {
        let Some(root) = gvfs() else { return Vec::new() };
        let Ok(entries) = std::fs::read_dir(root) else { return Vec::new() };
        entries
            .flatten()
            .filter(|e| {
                let n = e.file_name().to_string_lossy().into_owned();
                n.starts_with("mtp:") || n.starts_with("gphoto2:")
            })
            .map(|e| Device { id: e.path().to_string_lossy().into_owned(), name: e.file_name().to_string_lossy().replace("mtp:host=", "").replace("gphoto2:host=", "") })
            .collect()
    }

    pub fn stage(id: &str, dest: &Path) -> Result<Staged, String> {
        // A device usually shows its storages ("Internal shared storage") one level down.
        let root = Path::new(id);
        let mut total = Staged { folder: dest.to_string_lossy().into_owned(), ..Default::default() };
        let storages: Vec<_> = std::fs::read_dir(root).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
        for storage in if storages.is_empty() { vec![root.to_path_buf()] } else { storages } {
            let part = copy_tree(&storage, dest)?;
            total.copied += part.copied;
            total.skipped += part.skipped;
        }
        Ok(total)
    }
}

#[cfg(not(any(windows, target_os = "linux")))]
mod platform {
    use super::{Device, Staged};
    use std::path::Path;
    pub fn devices() -> Vec<Device> {
        Vec::new()
    }
    pub fn stage(_id: &str, _dest: &Path) -> Result<Staged, String> {
        Err("MTP devices are not available on this system".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stages_photos_once_from_photo_folders() {
        let phone = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(phone.path().join("DCIM/Camera")).unwrap();
        std::fs::create_dir_all(phone.path().join("Download")).unwrap();
        std::fs::write(phone.path().join("DCIM/Camera/IMG_0001.JPG"), b"jpeg-1").unwrap();
        std::fs::write(phone.path().join("DCIM/Camera/VID_0002.mp4"), b"video").unwrap();
        std::fs::write(phone.path().join("DCIM/Camera/notes.txt"), b"no").unwrap();
        std::fs::write(phone.path().join("Download/other.jpg"), b"not from the camera").unwrap();
        let first = copy_tree(phone.path(), dest.path()).unwrap();
        assert_eq!((first.copied, first.skipped), (2, 0));
        assert!(dest.path().join("IMG_0001.JPG").exists() && !dest.path().join("other.jpg").exists());
        let again = copy_tree(phone.path(), dest.path()).unwrap();
        assert_eq!((again.copied, again.skipped), (0, 2), "already staged");
    }

    #[test]
    fn folder_names_are_safe() {
        assert_eq!(folder_name("Galaxy S23 (Mina)"), "Galaxy S23 _Mina_");
        assert_eq!(folder_name("::{20D04FE0}"), "___20D04FE0_");
        assert_eq!(folder_name("   "), "device");
    }
}
