//! Where a document's original bytes come from. The core only knows memory (`MemSource`, the web build
//! and new documents); the desktop backend adds files, disks and process memory (src-tauri/src/sources.rs).

/// Read-only access to the original bytes of a document.
pub trait Source: Send + Sync {
    /// Total size in bytes.
    fn len(&self) -> u64;
    /// Fills `buf` with the bytes at `offset` (the caller never reads past `len`). Bytes that cannot
    /// be read (see `holes`) are zero.
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> Result<(), String>;
    /// Unreadable ranges (absolute `[start, end)`) within `[offset, offset + len)`: process memory that
    /// is not committed or not readable. Files and memory have none.
    fn holes(&self, _offset: u64, _len: u64) -> Vec<(u64, u64)> {
        Vec::new()
    }
    /// "memory", "file", "disk", "process".
    fn kind(&self) -> &'static str {
        "memory"
    }
    /// Whether the length may change (insert / delete): not for disks and process memory.
    fn resizable(&self) -> bool {
        true
    }
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
    /// The file it reads (files only): saving compares it with the target.
    fn path(&self) -> Option<String> {
        None
    }
    /// Writes changed bytes back where they came from (process memory, saving in place).
    fn write_back(&self, _offset: u64, _data: &[u8]) -> Result<(), String> {
        Err("this source cannot be written".into())
    }
}

/// Bytes held in memory.
pub struct MemSource(pub Vec<u8>);

impl Source for MemSource {
    fn len(&self) -> u64 {
        self.0.len() as u64
    }
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> Result<(), String> {
        let start = offset.min(self.0.len() as u64) as usize;
        let end = (start + buf.len()).min(self.0.len());
        buf[..end - start].copy_from_slice(&self.0[start..end]);
        for b in &mut buf[end - start..] {
            *b = 0;
        }
        Ok(())
    }
}
