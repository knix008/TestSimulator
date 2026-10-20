use std::path::Path;

use crate::inclusion::normalize_drive_root;

/// Volumes MyDeskSearch can offer in the indexing scope.
/// Windows: ready drive letters. macOS: `/` and `/Volumes/*`. Linux: real filesystems from `/proc/mounts`.
pub fn ready_volumes() -> Vec<String> {
    #[cfg(windows)]
    {
        windows_ready_drives(|letter| {
            let root = format!("{letter}:\\");
            Path::new(&root).exists()
        })
    }
    #[cfg(target_os = "macos")]
    {
        macos_volumes()
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        match std::fs::read_to_string("/proc/mounts") {
            Ok(text) => parse_proc_mounts(&text),
            Err(_) => vec!["/".to_string()],
        }
    }
}

pub fn windows_ready_drives(exists: impl Fn(char) -> bool) -> Vec<String> {
    ('A'..='Z')
        .filter(|letter| exists(*letter))
        .filter_map(|letter| normalize_drive_root(&format!("{letter}:")))
        .collect()
}

pub fn parse_proc_mounts(text: &str) -> Vec<String> {
    const SKIP_TYPES: &[&str] = &[
        "proc",
        "sysfs",
        "devtmpfs",
        "devpts",
        "cgroup",
        "cgroup2",
        "pstore",
        "bpf",
        "tracefs",
        "debugfs",
        "securityfs",
        "configfs",
        "fusectl",
        "mqueue",
        "hugetlbfs",
        "autofs",
        "rpc_pipefs",
        "nfsd",
        "binfmt_misc",
        "overlay",
        "tmpfs",
        "squashfs",
    ];
    let mut mounts = Vec::new();
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let _device = parts.next();
        let Some(mount) = parts.next() else { continue };
        let Some(fstype) = parts.next() else { continue };
        if SKIP_TYPES.contains(&fstype) {
            continue;
        }
        let decoded = decode_mount(mount);
        if decoded.starts_with("/proc")
            || decoded.starts_with("/sys")
            || decoded.starts_with("/dev")
        {
            continue;
        }
        if let Some(root) = normalize_drive_root(&decoded) {
            if !mounts.iter().any(|existing: &String| existing == &root) {
                mounts.push(root);
            }
        }
    }
    if mounts.is_empty() {
        mounts.push("/".to_string());
    }
    mounts.sort();
    mounts
}

fn decode_mount(value: &str) -> String {
    let mut out = String::new();
    let bytes = value.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' && i + 3 < bytes.len() {
            if let Ok(code) =
                u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 4]).unwrap_or(""), 8)
            {
                out.push(code as char);
                i += 4;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

#[cfg(target_os = "macos")]
fn macos_volumes() -> Vec<String> {
    let mut volumes = vec!["/".to_string()];
    if let Ok(entries) = std::fs::read_dir("/Volumes") {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(root) = normalize_drive_root(&path.to_string_lossy()) {
                    volumes.push(root);
                }
            }
        }
    }
    volumes.sort();
    volumes.dedup();
    volumes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_drive_letters_follow_the_probe() {
        let drives = windows_ready_drives(|letter| letter == 'C' || letter == 'E');
        assert_eq!(drives, vec!["C:\\".to_string(), "E:\\".to_string()]);
    }

    #[test]
    fn proc_mounts_keeps_real_filesystems() {
        let text = "\
proc /proc proc rw 0 0
sysfs /sys sysfs rw 0 0
/dev/nvme0n1p2 / ext4 rw 0 0
/dev/sda1 /mnt/data btrfs rw 0 0
tmpfs /run tmpfs rw 0 0
/dev/sdb1 /media/user/Stick vfat rw 0 0
";
        let mounts = parse_proc_mounts(text);
        assert!(mounts.iter().any(|m| m == "/"));
        assert!(mounts.iter().any(|m| m == "/mnt/data/"));
        assert!(mounts.iter().any(|m| m == "/media/user/Stick/"));
        assert!(!mounts.iter().any(|m| m.starts_with("/run")));
        assert!(!mounts.iter().any(|m| m.starts_with("/proc")));
        assert!(!mounts.iter().any(|m| m.starts_with("/sys")));
    }
}
