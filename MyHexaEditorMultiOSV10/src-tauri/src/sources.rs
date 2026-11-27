//! Where desktop documents read their original bytes (hexcore::Source): files, disks and volumes (read-only, in
//! whole sectors), and the memory of another process (its regions; what is not readable is a hole).
use crate::tr;
use hexcore::Source;
use std::fs::File;
use std::path::{Path, PathBuf};

/// Positional read without moving a shared cursor (several threads read one file).
fn read_at(file: &File, offset: u64, buf: &mut [u8]) -> std::io::Result<usize> {
    #[cfg(windows)]
    {
        std::os::windows::fs::FileExt::seek_read(file, buf, offset)
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::FileExt::read_at(file, buf, offset)
    }
}

fn read_full(file: &File, mut offset: u64, mut buf: &mut [u8]) -> std::io::Result<()> {
    while !buf.is_empty() {
        let n = read_at(file, offset, buf)?;
        if n == 0 {
            buf.fill(0);
            return Ok(());
        }
        offset += n as u64;
        buf = &mut buf[n..];
    }
    Ok(())
}

// ───────────────────────── files

pub struct FileSource {
    pub path: PathBuf,
    file: File,
    len: u64,
}

impl FileSource {
    pub fn open(path: &Path) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| tr!("파일을 열 수 없습니다: {e}", "Could not open the file: {e}"))?;
        let meta = file.metadata().map_err(|e| e.to_string())?;
        if meta.is_dir() {
            return Err(tr!("폴더는 열 수 없습니다", "A folder cannot be opened"));
        }
        Ok(FileSource { path: path.to_path_buf(), file, len: meta.len() })
    }
}

impl Source for FileSource {
    fn len(&self) -> u64 {
        self.len
    }
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> Result<(), String> {
        read_full(&self.file, offset, buf).map_err(|e| e.to_string())
    }
    fn kind(&self) -> &'static str {
        "file"
    }
    fn path(&self) -> Option<String> {
        Some(self.path.to_string_lossy().into_owned())
    }
}

// ───────────────────────── disks and volumes (read-only)

pub struct DiskSource {
    pub path: String,
    file: File,
    len: u64,
    sector: u64,
}

impl DiskSource {
    pub fn open(path: &str) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                tr!("디스크를 열 권한이 없습니다. 관리자 권한(sudo)으로 프로그램을 실행하세요: {e}", "No permission to open the disk. Run the program as administrator (sudo): {e}")
            } else {
                tr!("디스크를 열 수 없습니다: {e}", "Could not open the disk: {e}")
            }
        })?;
        // A disk image file opened as a disk (forensics on an image) has no device geometry: its length, 512-byte sectors.
        let (len, sector) = match crate::devices::disk_geometry(&file, path) {
            Ok(g) => g,
            Err(error) => match file.metadata() {
                Ok(m) if m.is_file() && m.len() > 0 => (m.len(), 512),
                _ => return Err(error),
            },
        };
        Ok(DiskSource { path: path.to_string(), file, len, sector: sector.max(512) })
    }
}

impl Source for DiskSource {
    fn len(&self) -> u64 {
        self.len
    }
    /// Raw devices read whole sectors: the request is widened to sector boundaries.
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> Result<(), String> {
        let s = self.sector;
        let start = offset / s * s;
        let end = (offset + buf.len() as u64).div_ceil(s) * s;
        let mut tmp = vec![0u8; (end - start) as usize];
        read_full(&self.file, start, &mut tmp).map_err(|e| e.to_string())?;
        let from = (offset - start) as usize;
        buf.copy_from_slice(&tmp[from..from + buf.len()]);
        Ok(())
    }
    fn kind(&self) -> &'static str {
        "disk"
    }
    /// Writes changed bytes back to the disk in whole sectors (read, patch, write). A volume is locked and dismounted
    /// first on Windows (its file system must not hold stale data); the caller asked the user to confirm.
    fn write_back(&self, offset: u64, data: &[u8]) -> Result<(), String> {
        crate::devices::write_disk(&self.path, offset, data, self.sector)
    }
    fn resizable(&self) -> bool {
        false
    }
}

// ───────────────────────── process memory

#[derive(Clone, Copy, Debug, serde::Serialize)]
pub struct Region {
    pub start: u64,
    pub end: u64,
    pub readable: bool,
    pub writable: bool,
}

pub struct ProcessSource {
    #[allow(dead_code)]
    pub pid: u32,
    pub regions: Vec<Region>,
    len: u64,
    handle: crate::devices::ProcessHandle,
}

impl ProcessSource {
    pub fn open(pid: u32) -> Result<Self, String> {
        let handle = crate::devices::open_process(pid)?;
        let regions = crate::devices::process_regions(&handle)?;
        let len = regions.iter().map(|r| r.end).max().unwrap_or(0);
        Ok(ProcessSource { pid, regions, len, handle })
    }

    /// Writes changed bytes back into the process (saving).
    pub fn write(&self, offset: u64, data: &[u8]) -> Result<(), String> {
        crate::devices::write_process(&self.handle, offset, data)
    }

    fn readable(&self, offset: u64, len: u64) -> Vec<(u64, u64)> {
        let end = offset + len;
        self.regions.iter().filter(|r| r.readable && r.end > offset && r.start < end).map(|r| (r.start.max(offset), r.end.min(end))).collect()
    }
}

impl Source for ProcessSource {
    fn len(&self) -> u64 {
        self.len
    }
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> Result<(), String> {
        buf.fill(0);
        for (s, e) in self.readable(offset, buf.len() as u64) {
            let part = &mut buf[(s - offset) as usize..(e - offset) as usize];
            // A page can become unreadable after the map was taken: it then stays zero.
            let _ = crate::devices::read_process(&self.handle, s, part);
        }
        Ok(())
    }
    fn holes(&self, offset: u64, len: u64) -> Vec<(u64, u64)> {
        let mut out = Vec::new();
        let mut pos = offset;
        for (s, e) in self.readable(offset, len) {
            if s > pos {
                out.push((pos, s));
            }
            pos = e;
        }
        if pos < offset + len {
            out.push((pos, offset + len));
        }
        out
    }
    fn kind(&self) -> &'static str {
        "process"
    }
    fn write_back(&self, offset: u64, data: &[u8]) -> Result<(), String> {
        self.write(offset, data)
    }
    fn resizable(&self) -> bool {
        false
    }
}
