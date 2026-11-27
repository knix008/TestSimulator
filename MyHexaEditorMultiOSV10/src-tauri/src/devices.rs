//! Disks and process memory, per operating system.
//!   Windows: volumes (\\.\C:) and physical drives (\\.\PhysicalDriveN), DeviceIoControl for their size; processes by
//!            Toolhelp, their memory by VirtualQueryEx / ReadProcessMemory / WriteProcessMemory.
//!   Linux:   /sys/block for disks; /proc for processes, /proc/<pid>/maps and /proc/<pid>/mem for their memory.
//!   macOS:   /dev/disk*; processes are listed (ps) but their memory cannot be opened (task_for_pid needs an entitlement).
use crate::sources::Region;
use serde::Serialize;
use std::fs::File;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Disk {
    pub path: String,
    pub name: String,
    pub size: Option<u64>,
    /// "volume" | "physical" | "partition"
    pub kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Proc {
    pub pid: u32,
    pub name: String,
    pub memory: Option<u64>,
}

// ───────────────────────── Windows

#[cfg(windows)]
mod os {
    use super::*;
    use crate::tr;
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives};
    use windows::Win32::System::Diagnostics::Debug::{ReadProcessMemory, WriteProcessMemory};
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    use windows::Win32::System::Ioctl::{DISK_GEOMETRY, GET_LENGTH_INFORMATION, IOCTL_DISK_GET_DRIVE_GEOMETRY, IOCTL_DISK_GET_LENGTH_INFO};
    use windows::Win32::System::Memory::{VirtualQueryEx, MEMORY_BASIC_INFORMATION, MEM_COMMIT, PAGE_EXECUTE_READWRITE, PAGE_EXECUTE_WRITECOPY, PAGE_GUARD, PAGE_NOACCESS, PAGE_READWRITE, PAGE_WRITECOPY};
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_OPERATION, PROCESS_VM_READ, PROCESS_VM_WRITE};
    use windows::Win32::System::IO::DeviceIoControl;

    pub struct ProcessHandle(HANDLE);
    unsafe impl Send for ProcessHandle {}
    unsafe impl Sync for ProcessHandle {}
    impl Drop for ProcessHandle {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn ioctl<T: Default>(file: &File, code: u32) -> Option<T> {
        let handle = HANDLE(file.as_raw_handle() as *mut c_void);
        let mut out = T::default();
        let mut returned = 0u32;
        unsafe { DeviceIoControl(handle, code, None, 0, Some(&mut out as *mut T as *mut c_void), std::mem::size_of::<T>() as u32, Some(&mut returned), None) }.ok()?;
        Some(out)
    }

    /// A volume (\\.\C:) is locked and dismounted before raw writes; a physical disk or an image needs nothing.
    pub fn prepare_disk_write(file: &File, path: &str) -> Result<(), String> {
        let volume = path.starts_with("\\\\.\\") && path.ends_with(':');
        if !volume {
            return Ok(());
        }
        let handle = HANDLE(file.as_raw_handle() as *mut c_void);
        let mut returned = 0u32;
        // FSCTL_LOCK_VOLUME, FSCTL_DISMOUNT_VOLUME
        unsafe { DeviceIoControl(handle, 0x0009_0018, None, 0, None, 0, Some(&mut returned), None) }
            .map_err(|e| tr!("볼륨을 잠글 수 없습니다(사용 중인 파일이 있음): {e}", "Could not lock the volume (files are in use): {e}"))?;
        unsafe { DeviceIoControl(handle, 0x0009_0020, None, 0, None, 0, Some(&mut returned), None) }.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn read_exact_at(file: &File, mut offset: u64, mut buf: &mut [u8]) -> std::io::Result<()> {
        use std::os::windows::fs::FileExt;
        while !buf.is_empty() {
            let n = file.seek_read(buf, offset)?;
            if n == 0 {
                return Err(std::io::Error::from(std::io::ErrorKind::UnexpectedEof));
            }
            offset += n as u64;
            buf = &mut buf[n..];
        }
        Ok(())
    }

    pub fn write_all_at(file: &File, mut offset: u64, mut buf: &[u8]) -> std::io::Result<()> {
        use std::os::windows::fs::FileExt;
        while !buf.is_empty() {
            let n = file.seek_write(buf, offset)?;
            offset += n as u64;
            buf = &buf[n..];
        }
        Ok(())
    }

    pub fn disk_geometry(file: &File, _path: &str) -> Result<(u64, u64), String> {
        let len = ioctl::<GET_LENGTH_INFORMATION>(file, IOCTL_DISK_GET_LENGTH_INFO).map(|l| l.Length as u64);
        let sector = ioctl::<DISK_GEOMETRY>(file, IOCTL_DISK_GET_DRIVE_GEOMETRY).map(|g| g.BytesPerSector as u64).unwrap_or(512);
        match len {
            Some(len) if len > 0 => Ok((len, sector)),
            _ => Err(tr!("디스크 크기를 알 수 없습니다", "The size of the disk is unknown")),
        }
    }

    pub fn list_disks() -> Vec<Disk> {
        let mut out = Vec::new();
        let mask = unsafe { GetLogicalDrives() };
        for i in 0..26u32 {
            if mask & (1 << i) == 0 {
                continue;
            }
            let letter = (b'A' + i as u8) as char;
            let root = wide(&format!("{letter}:\\"));
            let kind = unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) };
            // 2 removable, 3 fixed, 4 network, 5 CD-ROM, 6 RAM disk
            if !matches!(kind, 2 | 3 | 5 | 6) {
                continue;
            }
            let mut total = 0u64;
            let size = unsafe { GetDiskFreeSpaceExW(PCWSTR(root.as_ptr()), None, Some(&mut total), None) }.ok().map(|_| total);
            let label = match kind { 2 => tr!("이동식", "Removable"), 5 => "CD/DVD".into(), 6 => "RAM".into(), _ => tr!("로컬 디스크", "Local disk") };
            out.push(Disk { path: format!("\\\\.\\{letter}:"), name: format!("{letter}: ({label})"), size, kind: "volume".into() });
        }
        for n in 0..16 {
            let path = format!("\\\\.\\PhysicalDrive{n}");
            match File::open(&path) {
                Ok(file) => {
                    let size = disk_geometry(&file, &path).ok().map(|g| g.0);
                    out.push(Disk { path, name: tr!("물리 디스크 {n}", "Physical disk {n}"), size, kind: "physical".into() });
                }
                Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
                    out.push(Disk { path, name: tr!("물리 디스크 {n} (관리자 권한 필요)", "Physical disk {n} (needs administrator)"), size: None, kind: "physical".into() })
                }
                Err(_) => {}
            }
        }
        out
    }

    pub fn list_processes() -> Result<Vec<Proc>, String> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }.map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut ok = unsafe { Process32FirstW(snapshot, &mut entry) }.is_ok();
        while ok {
            let end = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..end]);
            if entry.th32ProcessID != 0 {
                out.push(Proc { pid: entry.th32ProcessID, name, memory: None });
            }
            ok = unsafe { Process32NextW(snapshot, &mut entry) }.is_ok();
        }
        unsafe {
            let _ = CloseHandle(snapshot);
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(out)
    }

    pub fn open_process(pid: u32) -> Result<ProcessHandle, String> {
        let full = PROCESS_VM_READ | PROCESS_QUERY_INFORMATION | PROCESS_VM_WRITE | PROCESS_VM_OPERATION;
        let handle = unsafe { OpenProcess(full, false, pid) }
            .or_else(|_| unsafe { OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, pid) })
            .map_err(|e| tr!("프로세스 {pid}를 열 수 없습니다(권한): {e}", "Could not open process {pid} (permissions): {e}"))?;
        Ok(ProcessHandle(handle))
    }

    pub fn process_regions(handle: &ProcessHandle) -> Result<Vec<Region>, String> {
        let mut out = Vec::new();
        let mut address = 0usize;
        loop {
            let mut info = MEMORY_BASIC_INFORMATION::default();
            let n = unsafe { VirtualQueryEx(handle.0, Some(address as *const c_void), &mut info, std::mem::size_of::<MEMORY_BASIC_INFORMATION>()) };
            if n == 0 {
                break;
            }
            let start = info.BaseAddress as u64;
            let end = start + info.RegionSize as u64;
            if info.State == MEM_COMMIT {
                let p = info.Protect;
                let readable = (p.0 & PAGE_NOACCESS.0) == 0 && (p.0 & PAGE_GUARD.0) == 0 && p.0 != 0;
                let writable = (p.0 & (PAGE_READWRITE.0 | PAGE_WRITECOPY.0 | PAGE_EXECUTE_READWRITE.0 | PAGE_EXECUTE_WRITECOPY.0)) != 0;
                out.push(Region { start, end, readable, writable });
            }
            if end as usize <= address {
                break;
            }
            address = end as usize;
        }
        if out.is_empty() {
            return Err(tr!("읽을 수 있는 메모리가 없습니다", "No readable memory"));
        }
        Ok(out)
    }

    pub fn read_process(handle: &ProcessHandle, address: u64, buf: &mut [u8]) -> Result<(), String> {
        let mut read = 0usize;
        unsafe { ReadProcessMemory(handle.0, address as *const c_void, buf.as_mut_ptr() as *mut c_void, buf.len(), Some(&mut read)) }.map_err(|e| e.to_string())
    }

    pub fn write_process(handle: &ProcessHandle, address: u64, data: &[u8]) -> Result<(), String> {
        let mut written = 0usize;
        unsafe { WriteProcessMemory(handle.0, address as *const c_void, data.as_ptr() as *const c_void, data.len(), Some(&mut written)) }
            .map_err(|e| tr!("프로세스 메모리에 쓸 수 없습니다 ({address:#x}): {e}", "Could not write process memory at {address:#x}: {e}"))
    }
}

// ───────────────────────── Linux and macOS

#[cfg(unix)]
mod os {
    use super::*;
    use crate::tr;
    use std::io::{Seek, SeekFrom};
    use std::os::unix::fs::FileExt;

    pub struct ProcessHandle {
        pid: u32,
        mem: File,
    }

    pub fn prepare_disk_write(_file: &File, _path: &str) -> Result<(), String> {
        Ok(())
    }

    pub fn read_exact_at(file: &File, offset: u64, buf: &mut [u8]) -> std::io::Result<()> {
        file.read_exact_at(buf, offset)
    }

    pub fn write_all_at(file: &File, offset: u64, buf: &[u8]) -> std::io::Result<()> {
        file.write_all_at(buf, offset)
    }

    pub fn disk_geometry(file: &File, _path: &str) -> Result<(u64, u64), String> {
        #[cfg(target_os = "macos")]
        {
            use std::os::unix::io::AsRawFd;
            let fd = file.as_raw_fd();
            let mut count: u64 = 0;
            let mut size: u32 = 0;
            // DKIOCGETBLOCKCOUNT, DKIOCGETBLOCKSIZE
            unsafe {
                libc::ioctl(fd, 0x4008_6419, &mut count);
                libc::ioctl(fd, 0x4004_6418, &mut size);
            }
            if count > 0 && size > 0 {
                return Ok((count * size as u64, size as u64));
            }
        }
        let mut f = file;
        let len = f.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
        if len == 0 {
            return Err(tr!("디스크 크기를 알 수 없습니다", "The size of the disk is unknown"));
        }
        Ok((len, 512))
    }

    pub fn list_disks() -> Vec<Disk> {
        let mut out = Vec::new();
        #[cfg(target_os = "linux")]
        if let Ok(entries) = std::fs::read_dir("/sys/block") {
            let mut names: Vec<String> = entries.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
            names.sort();
            for name in names {
                if name.starts_with("loop") || name.starts_with("ram") || name.starts_with("zram") {
                    continue;
                }
                let sectors = |p: String| std::fs::read_to_string(p).ok().and_then(|s| s.trim().parse::<u64>().ok()).map(|n| n * 512);
                out.push(Disk { path: format!("/dev/{name}"), name: name.clone(), size: sectors(format!("/sys/block/{name}/size")), kind: "physical".into() });
                if let Ok(parts) = std::fs::read_dir(format!("/sys/block/{name}")) {
                    let mut parts: Vec<String> = parts.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|p| p.starts_with(&name)).collect();
                    parts.sort();
                    for part in parts {
                        out.push(Disk { path: format!("/dev/{part}"), name: part.clone(), size: sectors(format!("/sys/block/{name}/{part}/size")), kind: "partition".into() });
                    }
                }
            }
        }
        #[cfg(target_os = "macos")]
        if let Ok(entries) = std::fs::read_dir("/dev") {
            let mut names: Vec<String> = entries.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.starts_with("disk")).collect();
            names.sort();
            for name in names {
                let path = format!("/dev/{name}");
                let size = File::open(&path).ok().and_then(|f| disk_geometry(&f, &path).ok()).map(|g| g.0);
                out.push(Disk { path, kind: if name.contains('s') { "partition".into() } else { "physical".into() }, name, size });
            }
        }
        out
    }

    pub fn list_processes() -> Result<Vec<Proc>, String> {
        let mut out = Vec::new();
        #[cfg(target_os = "linux")]
        for entry in std::fs::read_dir("/proc").map_err(|e| e.to_string())?.flatten() {
            let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() else { continue };
            let name = std::fs::read_to_string(format!("/proc/{pid}/comm")).map(|s| s.trim().to_string()).unwrap_or_default();
            let memory = std::fs::read_to_string(format!("/proc/{pid}/statm")).ok().and_then(|s| s.split_whitespace().nth(1).and_then(|x| x.parse::<u64>().ok())).map(|pages| pages * 4096);
            out.push(Proc { pid, name, memory });
        }
        #[cfg(target_os = "macos")]
        {
            let output = std::process::Command::new("ps").args(["-axo", "pid=,rss=,comm="]).output().map_err(|e| e.to_string())?;
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let mut parts = line.split_whitespace();
                let (Some(pid), Some(rss)) = (parts.next(), parts.next()) else { continue };
                let name: String = parts.collect::<Vec<_>>().join(" ");
                if let Ok(pid) = pid.parse::<u32>() {
                    out.push(Proc { pid, name: name.rsplit('/').next().unwrap_or(&name).to_string(), memory: rss.parse::<u64>().ok().map(|k| k * 1024) });
                }
            }
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(out)
    }

    pub fn open_process(pid: u32) -> Result<ProcessHandle, String> {
        #[cfg(target_os = "macos")]
        {
            let _ = pid;
            Err(tr!("macOS에서는 다른 프로세스의 메모리를 열 수 없습니다(권한 정책).", "On macOS another process's memory cannot be opened (system policy)."))
        }
        #[cfg(not(target_os = "macos"))]
        {
            let path = format!("/proc/{pid}/mem");
            let mem = File::options().read(true).write(true).open(&path).or_else(|_| File::open(&path)).map_err(|e| {
                tr!("프로세스 {pid}의 메모리를 열 수 없습니다(ptrace 권한, sudo 필요할 수 있음): {e}", "Could not open the memory of process {pid} (ptrace permission; sudo may be needed): {e}")
            })?;
            Ok(ProcessHandle { pid, mem })
        }
    }

    pub fn process_regions(handle: &ProcessHandle) -> Result<Vec<Region>, String> {
        let maps = std::fs::read_to_string(format!("/proc/{}/maps", handle.pid)).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for line in maps.lines() {
            let mut parts = line.split_whitespace();
            let (Some(range), Some(perms)) = (parts.next(), parts.next()) else { continue };
            let Some((a, b)) = range.split_once('-') else { continue };
            let (Ok(start), Ok(end)) = (u64::from_str_radix(a, 16), u64::from_str_radix(b, 16)) else { continue };
            // [vsyscall] and the like cannot be read through /proc/<pid>/mem.
            if start >= 0xffff_8000_0000_0000 {
                continue;
            }
            out.push(Region { start, end, readable: perms.starts_with('r'), writable: perms.as_bytes().get(1) == Some(&b'w') });
        }
        Ok(out)
    }

    pub fn read_process(handle: &ProcessHandle, address: u64, buf: &mut [u8]) -> Result<(), String> {
        handle.mem.read_exact_at(buf, address).map_err(|e| e.to_string())
    }

    pub fn write_process(handle: &ProcessHandle, address: u64, data: &[u8]) -> Result<(), String> {
        handle.mem.write_all_at(data, address).map_err(|e| tr!("프로세스 메모리에 쓸 수 없습니다 ({address:#x}): {e}", "Could not write process memory at {address:#x}: {e}"))
    }
}

/// Writes `data` at `offset` of a disk, volume or image in whole sectors (read-modify-write).
pub fn write_disk(path: &str, offset: u64, data: &[u8], sector: u64) -> Result<(), String> {
    let file = std::fs::OpenOptions::new().read(true).write(true).open(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            tr!("디스크에 쓸 권한이 없습니다. 관리자 권한(sudo)으로 실행하세요: {e}", "No permission to write the disk. Run as administrator (sudo): {e}")
        } else {
            tr!("디스크를 쓰기로 열 수 없습니다: {e}", "Could not open the disk for writing: {e}")
        }
    })?;
    os::prepare_disk_write(&file, path)?;
    let start = offset / sector * sector;
    let end = (offset + data.len() as u64).div_ceil(sector) * sector;
    let mut block = vec![0u8; (end - start) as usize];
    os::read_exact_at(&file, start, &mut block).map_err(|e| tr!("디스크를 읽을 수 없습니다: {e}", "Could not read the disk: {e}"))?;
    let from = (offset - start) as usize;
    block[from..from + data.len()].copy_from_slice(data);
    os::write_all_at(&file, start, &block).map_err(|e| tr!("디스크에 쓸 수 없습니다 ({start:#x}): {e}", "Could not write the disk at {start:#x}: {e}"))?;
    file.sync_all().map_err(|e| e.to_string())
}

pub use os::{disk_geometry, list_disks, list_processes, open_process, process_regions, read_process, write_process, ProcessHandle};
