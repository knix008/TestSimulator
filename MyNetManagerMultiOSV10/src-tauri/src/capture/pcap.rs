//! libpcap / Npcap core for live capture. No Tauri in here: `capture.rs` wraps it in commands,
//! and the module can be built on its own (test harness) with `#[path = ".../pcap.rs"] mod pcap;`.
//!
//! The library is loaded at run time with `libloading`, so nothing is needed at build time and the
//! app still starts (and explains how to install Npcap / libpcap) when it is missing.
//!
//! Threading: a capture owns one `pcap_t`. Only its capture thread calls into that handle
//! (`pcap_next_ex`, `pcap_stats`, `pcap_close`); other threads only call `pcap_breakloop`, which
//! libpcap documents as safe from another thread, and only while the handle is known to be open.

#![allow(non_camel_case_types, dead_code)]

use libloading::Library;
use serde::{Deserialize, Serialize};
use std::ffi::{c_char, c_int, c_uint, c_void, CStr, CString};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

// ───────────────────────── errors

/// Error sent to the page as `{ code, message }`; the UI translates by `code`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CaptureError {
    pub code: &'static str,
    pub message: String,
}

impl CaptureError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

impl std::fmt::Display for CaptureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.message, self.code)
    }
}

impl std::error::Error for CaptureError {}

pub const E_NO_LIBRARY: &str = "no_library";
pub const E_PERMISSION: &str = "permission";
pub const E_NO_SUCH_DEVICE: &str = "no_such_device";
pub const E_ACTIVATE_FAILED: &str = "activate_failed";
pub const E_FILTER_INVALID: &str = "filter_invalid";
pub const E_RFMON_UNSUPPORTED: &str = "rfmon_unsupported";
pub const E_IFACE_NOT_UP: &str = "iface_not_up";
pub const E_FINDALLDEVS: &str = "findalldevs_failed";
pub const E_CAPTURE: &str = "capture_error";
pub const E_NOT_FOUND: &str = "not_found";
pub const E_INVALID: &str = "invalid_argument";

/// How to get capture rights on this OS (added to `permission` errors).
pub fn permission_hint() -> String {
    #[cfg(windows)]
    {
        "Npcap refused access. Npcap is installed with \"Restrict Npcap driver's access to Administrators only\": \
         accept the Windows permission prompt (NpcapHelper) when a capture starts, run MyNetManager as administrator, \
         or reinstall Npcap from https://npcap.com without that option."
            .to_string()
    }
    #[cfg(target_os = "linux")]
    {
        let exe = std::env::current_exe()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| "/path/to/mynetmanager".to_string());
        format!(
            "Capturing needs the CAP_NET_RAW and CAP_NET_ADMIN capabilities. Grant them once with: \
             sudo setcap cap_net_raw,cap_net_admin=eip {exe} (then restart the app), or run it as root. \
             Membership of the wireshark group only covers Wireshark's own dumpcap."
        )
    }
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        "Access to /dev/bpf* is denied. Install Wireshark's \"ChmodBPF\" package (it gives the access_bpf group \
         read/write access to /dev/bpf* at every boot and adds your user to it), or for this session only: \
         sudo chmod o+rw /dev/bpf*"
            .to_string()
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos", target_os = "ios")))]
    {
        "Access to the capture device is denied; run as root or give your user read/write access to /dev/bpf*.".to_string()
    }
}

fn no_library_message(detail: &str) -> String {
    #[cfg(windows)]
    let how = "Npcap is not installed. Install it from https://npcap.com and restart MyNetManager.";
    #[cfg(target_os = "linux")]
    let how = "libpcap was not found. Install it (Debian/Ubuntu: sudo apt install libpcap0.8, \
               Fedora: sudo dnf install libpcap, Arch: sudo pacman -S libpcap) and restart MyNetManager.";
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    let how = "The system libpcap (/usr/lib/libpcap.A.dylib) could not be loaded.";
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos", target_os = "ios")))]
    let how = "libpcap was not found; install it with your package manager.";
    if detail.is_empty() {
        how.to_string()
    } else {
        format!("{how} ({detail})")
    }
}

// ───────────────────────── FFI declarations

pub const PCAP_ERRBUF_SIZE: usize = 256;
pub const PCAP_NETMASK_UNKNOWN: u32 = 0xffff_ffff;
pub const PCAP_CHAR_ENC_UTF_8: c_uint = 1;
pub const PCAP_TSTAMP_PRECISION_MICRO: c_int = 0;
pub const PCAP_TSTAMP_PRECISION_NANO: c_int = 1;

pub const PCAP_IF_LOOPBACK: u32 = 0x0000_0001;
pub const PCAP_IF_UP: u32 = 0x0000_0002;
pub const PCAP_IF_RUNNING: u32 = 0x0000_0004;
pub const PCAP_IF_WIRELESS: u32 = 0x0000_0008;

pub const PCAP_WARNING: c_int = 1;
pub const PCAP_WARNING_PROMISC_NOTSUP: c_int = 2;
pub const PCAP_WARNING_TSTAMP_TYPE_NOTSUP: c_int = 3;
pub const PCAP_ERROR: c_int = -1;
pub const PCAP_ERROR_BREAK: c_int = -2;
pub const PCAP_ERROR_NOT_ACTIVATED: c_int = -3;
pub const PCAP_ERROR_ACTIVATED: c_int = -4;
pub const PCAP_ERROR_NO_SUCH_DEVICE: c_int = -5;
pub const PCAP_ERROR_RFMON_NOTSUP: c_int = -6;
pub const PCAP_ERROR_NOT_RFMON: c_int = -7;
pub const PCAP_ERROR_PERM_DENIED: c_int = -8;
pub const PCAP_ERROR_IFACE_NOT_UP: c_int = -9;
pub const PCAP_ERROR_CANTSET_TSTAMP_TYPE: c_int = -10;
pub const PCAP_ERROR_PROMISC_PERM_DENIED: c_int = -11;
pub const PCAP_ERROR_TSTAMP_PRECISION_NOTSUP: c_int = -12;

pub const DLT_NULL: i32 = 0;
pub const DLT_EN10MB: i32 = 1;
pub const DLT_LINUX_SLL: i32 = 113;

#[repr(C)]
pub struct pcap_t {
    _private: [u8; 0],
}

/// `struct sockaddr` is only ever read through `read_sockaddr` (layout differs per OS).
#[repr(C)]
pub struct sockaddr {
    _private: [u8; 0],
}

#[repr(C)]
pub struct pcap_addr_t {
    pub next: *mut pcap_addr_t,
    pub addr: *mut sockaddr,
    pub netmask: *mut sockaddr,
    pub broadaddr: *mut sockaddr,
    pub dstaddr: *mut sockaddr,
}

#[repr(C)]
pub struct pcap_if_t {
    pub next: *mut pcap_if_t,
    pub name: *mut c_char,
    pub description: *mut c_char,
    pub addresses: *mut pcap_addr_t,
    pub flags: u32,
}

/// `struct timeval` as libpcap hands it out in `pcap_pkthdr`:
/// Windows: two `long` (i32, i32); macOS/iOS: `__darwin_time_t` (i64) + `__darwin_suseconds_t` (i32, then padding);
/// Linux and the other Unixes: `time_t` + `suseconds_t`, both `long` (i64/i64 on 64-bit, i32/i32 on 32-bit).
#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct timeval {
    pub tv_sec: i32,
    pub tv_usec: i32,
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct timeval {
    pub tv_sec: std::ffi::c_long,
    pub tv_usec: i32,
}

#[cfg(not(any(windows, target_os = "macos", target_os = "ios")))]
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct timeval {
    pub tv_sec: std::ffi::c_long,
    pub tv_usec: std::ffi::c_long,
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct pcap_pkthdr {
    pub ts: timeval,
    pub caplen: u32,
    pub len: u32,
}

#[repr(C)]
pub struct bpf_program {
    pub bf_len: c_uint,
    pub bf_insns: *mut c_void,
}

/// `struct pcap_stat`. Windows builds of libpcap may append fields (ps_capt, ps_sent, ps_netdrop),
/// so the buffer handed to `pcap_stats` is padded.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct pcap_stat {
    pub ps_recv: c_uint,
    pub ps_drop: c_uint,
    pub ps_ifdrop: c_uint,
    _extra: [c_uint; 5],
}

type FnLibVersion = unsafe extern "C" fn() -> *const c_char;
type FnInit = unsafe extern "C" fn(c_uint, *mut c_char) -> c_int;
type FnFindAllDevs = unsafe extern "C" fn(*mut *mut pcap_if_t, *mut c_char) -> c_int;
type FnFreeAllDevs = unsafe extern "C" fn(*mut pcap_if_t);
type FnCreate = unsafe extern "C" fn(*const c_char, *mut c_char) -> *mut pcap_t;
type FnSetInt = unsafe extern "C" fn(*mut pcap_t, c_int) -> c_int;
type FnHandleInt = unsafe extern "C" fn(*mut pcap_t) -> c_int;
type FnGetErr = unsafe extern "C" fn(*mut pcap_t) -> *mut c_char;
type FnStatusToStr = unsafe extern "C" fn(c_int) -> *const c_char;
type FnCompile = unsafe extern "C" fn(*mut pcap_t, *mut bpf_program, *const c_char, c_int, u32) -> c_int;
type FnSetFilter = unsafe extern "C" fn(*mut pcap_t, *mut bpf_program) -> c_int;
type FnFreeCode = unsafe extern "C" fn(*mut bpf_program);
type FnOpenDead = unsafe extern "C" fn(c_int, c_int) -> *mut pcap_t;
type FnNextEx = unsafe extern "C" fn(*mut pcap_t, *mut *mut pcap_pkthdr, *mut *const u8) -> c_int;
type FnHandle = unsafe extern "C" fn(*mut pcap_t);
type FnStats = unsafe extern "C" fn(*mut pcap_t, *mut pcap_stat) -> c_int;

/// The loaded library and its entry points. Function pointers stay valid while `_lib` lives.
pub struct PcapLib {
    pub path: String,
    pub version: String,
    _lib: Library,
    #[cfg(windows)]
    _packet: Option<Library>,
    findalldevs: FnFindAllDevs,
    freealldevs: FnFreeAllDevs,
    create: FnCreate,
    set_snaplen: FnSetInt,
    set_promisc: FnSetInt,
    set_timeout: FnSetInt,
    set_buffer_size: FnSetInt,
    set_rfmon: Option<FnSetInt>,
    can_set_rfmon: Option<FnHandleInt>,
    set_immediate_mode: Option<FnSetInt>,
    set_tstamp_precision: Option<FnSetInt>,
    get_tstamp_precision: Option<FnHandleInt>,
    activate: FnHandleInt,
    geterr: FnGetErr,
    statustostr: Option<FnStatusToStr>,
    datalink: FnHandleInt,
    snapshot: FnHandleInt,
    compile: FnCompile,
    setfilter: FnSetFilter,
    freecode: FnFreeCode,
    open_dead: FnOpenDead,
    next_ex: FnNextEx,
    breakloop: FnHandle,
    stats: FnStats,
    close: FnHandle,
}

/// `pcap_compile` is not thread-safe in old libpcaps. Kept apart from `DEVS_LOCK`: checking a filter
/// never touches the driver and must not wait behind a slow `pcap_findalldevs`.
static COMPILE_LOCK: Mutex<()> = Mutex::new(());
/// Serialises `pcap_findalldevs` (old libpcaps keep global state there).
static DEVS_LOCK: Mutex<()> = Mutex::new(());

static LIBRARY: Mutex<Option<Arc<PcapLib>>> = Mutex::new(None);

/// Candidate library files, most specific first.
fn candidates() -> Vec<String> {
    #[cfg(windows)]
    {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
        vec![format!(r"{root}\System32\Npcap\wpcap.dll"), "wpcap.dll".to_string()]
    }
    #[cfg(target_os = "linux")]
    {
        vec!["libpcap.so.1".into(), "libpcap.so.0.8".into(), "libpcap.so".into()]
    }
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        vec!["/usr/lib/libpcap.A.dylib".into(), "libpcap.A.dylib".into(), "libpcap.dylib".into()]
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos", target_os = "ios")))]
    {
        vec!["libpcap.so.1".into(), "libpcap.so".into()]
    }
}

#[cfg(windows)]
unsafe fn open_library(path: &str) -> Result<(Library, Option<Library>), String> {
    use libloading::os::windows::{Library as WinLibrary, LOAD_WITH_ALTERED_SEARCH_PATH};
    let full = std::path::Path::new(path);
    if full.is_absolute() {
        // wpcap.dll needs Packet.dll from the same folder (not on the DLL search path):
        // load it first, and load wpcap with the altered search path (its own folder first).
        let packet = full
            .parent()
            .map(|dir| dir.join("Packet.dll"))
            .and_then(|p| WinLibrary::load_with_flags(p, LOAD_WITH_ALTERED_SEARCH_PATH).ok())
            .map(Library::from);
        let lib = WinLibrary::load_with_flags(full, LOAD_WITH_ALTERED_SEARCH_PATH).map_err(|e| e.to_string())?;
        Ok((lib.into(), packet))
    } else {
        Library::new(path).map(|l| (l, None)).map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
unsafe fn open_library(path: &str) -> Result<(Library, Option<Library>), String> {
    Library::new(path).map(|l| (l, None)).map_err(|e| e.to_string())
}

unsafe fn sym<T: Copy>(lib: &Library, name: &str) -> Result<T, String> {
    let mut z = name.as_bytes().to_vec();
    z.push(0);
    lib.get::<T>(&z).map(|s| *s).map_err(|_| format!("{name} missing"))
}

unsafe fn opt_sym<T: Copy>(lib: &Library, name: &str) -> Option<T> {
    sym(lib, name).ok()
}

impl PcapLib {
    unsafe fn load(path: &str) -> Result<PcapLib, String> {
        let (lib, _packet) = open_library(path)?;
        #[cfg(not(windows))]
        let _ = _packet;
        let lib_version: FnLibVersion = sym(&lib, "pcap_lib_version")?;
        // UTF-8 names and error texts (Npcap would otherwise use the local code page).
        if let Some(init) = opt_sym::<FnInit>(&lib, "pcap_init") {
            let mut err = [0 as c_char; PCAP_ERRBUF_SIZE];
            init(PCAP_CHAR_ENC_UTF_8, err.as_mut_ptr());
        }
        let version = cstr(lib_version());
        Ok(PcapLib {
            path: path.to_string(),
            version,
            findalldevs: sym(&lib, "pcap_findalldevs")?,
            freealldevs: sym(&lib, "pcap_freealldevs")?,
            create: sym(&lib, "pcap_create")?,
            set_snaplen: sym(&lib, "pcap_set_snaplen")?,
            set_promisc: sym(&lib, "pcap_set_promisc")?,
            set_timeout: sym(&lib, "pcap_set_timeout")?,
            set_buffer_size: sym(&lib, "pcap_set_buffer_size")?,
            set_rfmon: opt_sym(&lib, "pcap_set_rfmon"),
            can_set_rfmon: opt_sym(&lib, "pcap_can_set_rfmon"),
            set_immediate_mode: opt_sym(&lib, "pcap_set_immediate_mode"),
            set_tstamp_precision: opt_sym(&lib, "pcap_set_tstamp_precision"),
            get_tstamp_precision: opt_sym(&lib, "pcap_get_tstamp_precision"),
            activate: sym(&lib, "pcap_activate")?,
            geterr: sym(&lib, "pcap_geterr")?,
            statustostr: opt_sym(&lib, "pcap_statustostr"),
            datalink: sym(&lib, "pcap_datalink")?,
            snapshot: sym(&lib, "pcap_snapshot")?,
            compile: sym(&lib, "pcap_compile")?,
            setfilter: sym(&lib, "pcap_setfilter")?,
            freecode: sym(&lib, "pcap_freecode")?,
            open_dead: sym(&lib, "pcap_open_dead")?,
            next_ex: sym(&lib, "pcap_next_ex")?,
            breakloop: sym(&lib, "pcap_breakloop")?,
            stats: sym(&lib, "pcap_stats")?,
            close: sym(&lib, "pcap_close")?,
            _lib: lib,
            #[cfg(windows)]
            _packet,
        })
    }

    unsafe fn err_of(&self, p: *mut pcap_t) -> String {
        cstr((self.geterr)(p))
    }

    unsafe fn status_text(&self, status: c_int) -> String {
        match self.statustostr {
            Some(f) => cstr(f(status)),
            None => format!("pcap status {status}"),
        }
    }
}

/// The loaded library, loading it on first use. A failure is not cached, so installing Npcap /
/// libpcap while the app runs works on the next call.
pub fn library() -> Result<Arc<PcapLib>, CaptureError> {
    let mut slot = LIBRARY.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(lib) = slot.as_ref() {
        return Ok(lib.clone());
    }
    let mut errors = Vec::new();
    for path in candidates() {
        match unsafe { PcapLib::load(&path) } {
            Ok(lib) => {
                let lib = Arc::new(lib);
                *slot = Some(lib.clone());
                return Ok(lib);
            }
            Err(e) => errors.push(format!("{path}: {e}")),
        }
    }
    Err(CaptureError::new(E_NO_LIBRARY, no_library_message(&errors.join("; "))))
}

fn cstr(p: *const c_char) -> String {
    if p.is_null() {
        return String::new();
    }
    unsafe { String::from_utf8_lossy(CStr::from_ptr(p).to_bytes()).trim().to_string() }
}

fn errbuf_text(buf: &[c_char]) -> String {
    let bytes: Vec<u8> = buf.iter().take_while(|&&c| c != 0).map(|&c| c as u8).collect();
    String::from_utf8_lossy(&bytes).trim().to_string()
}

// ───────────────────────── backend info

#[derive(Debug, Clone, Serialize)]
pub struct BackendInfo {
    pub available: bool,
    pub library: Option<String>,
    pub version: Option<String>,
    /// Message when unavailable.
    pub error: Option<String>,
    /// Error code when unavailable (`no_library`).
    pub code: Option<String>,
    /// Windows: Npcap was installed with "Restrict Npcap driver's access to Administrators only".
    #[serde(rename = "adminOnly")]
    pub admin_only: bool,
    /// This process runs elevated (administrator).
    pub elevated: bool,
    /// The first capture of this process shows a Windows permission (UAC) prompt for NpcapHelper.exe
    /// and `capture_start` waits until it is answered (declined → `permission` error).
    #[serde(rename = "needsPrompt")]
    pub needs_prompt: bool,
}

pub fn backend_info() -> BackendInfo {
    let (admin_only, elevated) = (npcap_admin_only(), process_elevated());
    let needs_prompt = needs_elevation_prompt();
    match library() {
        Ok(lib) => BackendInfo {
            available: true,
            library: Some(lib.path.clone()),
            version: Some(lib.version.clone()),
            error: None,
            code: None,
            admin_only,
            elevated,
            needs_prompt,
        },
        Err(e) => BackendInfo {
            available: false,
            library: None,
            version: None,
            error: Some(e.message),
            code: Some(e.code.to_string()),
            admin_only,
            elevated,
            needs_prompt: false,
        },
    }
}

// ───────────────────────── Npcap "administrators only" mode
//
// With AdminOnly=1, a process that is not elevated cannot open the Npcap driver itself: on the first
// driver access (pcap_findalldevs, pcap_activate…) Packet.dll starts NpcapHelper.exe elevated, which
// shows a UAC prompt, and the call blocks until the prompt is answered — possibly forever when nobody
// is at the screen. So nothing may touch the driver before the user asks for a capture: the
// interface list then comes from the Windows adapter table, and only `capture_start` opens the driver.

/// Set once a capture was activated in this process (the helper is then running; no more prompts).
static DRIVER_GRANTED: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
mod winsec {
    use std::ffi::c_void;

    #[link(name = "advapi32")]
    extern "system" {
        fn RegGetValueW(hkey: isize, subkey: *const u16, value: *const u16, flags: u32, ty: *mut u32, data: *mut c_void, cb: *mut u32) -> i32;
        fn OpenProcessToken(process: isize, access: u32, token: *mut isize) -> i32;
        fn GetTokenInformation(token: isize, class: u32, info: *mut c_void, len: u32, ret: *mut u32) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> isize;
        fn CloseHandle(handle: isize) -> i32;
    }

    const HKEY_LOCAL_MACHINE: isize = 0x8000_0002u32 as i32 as isize;
    const RRF_RT_REG_DWORD: u32 = 0x10;
    const TOKEN_QUERY: u32 = 0x8;
    const TOKEN_ELEVATION: u32 = 20;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn reg_dword(subkey: &str, value: &str) -> Option<u32> {
        let (k, v) = (wide(subkey), wide(value));
        let mut data = 0u32;
        let mut cb = 4u32;
        let rc = unsafe { RegGetValueW(HKEY_LOCAL_MACHINE, k.as_ptr(), v.as_ptr(), RRF_RT_REG_DWORD, std::ptr::null_mut(), &mut data as *mut u32 as *mut c_void, &mut cb) };
        (rc == 0).then_some(data)
    }

    pub fn elevated() -> bool {
        unsafe {
            let mut token = 0isize;
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return false;
            }
            let mut elevation = 0u32;
            let mut len = 0u32;
            let ok = GetTokenInformation(token, TOKEN_ELEVATION, &mut elevation as *mut u32 as *mut c_void, 4, &mut len) != 0;
            CloseHandle(token);
            ok && elevation != 0
        }
    }
}

/// Npcap's "Restrict Npcap driver's access to Administrators only" install option.
pub fn npcap_admin_only() -> bool {
    #[cfg(windows)]
    {
        winsec::reg_dword(r"SYSTEM\CurrentControlSet\Services\npcap\Parameters", "AdminOnly").unwrap_or(0) != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

pub fn process_elevated() -> bool {
    #[cfg(windows)]
    {
        winsec::elevated()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// True while touching the driver would show a UAC prompt and block until it is answered.
pub fn needs_elevation_prompt() -> bool {
    npcap_admin_only() && !process_elevated() && !DRIVER_GRANTED.load(Ordering::SeqCst)
}

// ───────────────────────── sockaddr

/// `struct sockaddr` layout: Windows and Linux start with a 16-bit family in host order;
/// the BSDs (macOS included) start with `u8 sa_len, u8 sa_family`. `AF_INET` is 2 everywhere,
/// `AF_INET6` differs (Windows 23, Linux 10, macOS/iOS 30, FreeBSD/DragonFly 28, Open/NetBSD 24).
/// Both `sockaddr_in` (addr at 4..8) and `sockaddr_in6` (addr at 8..24) agree on offsets.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SockaddrLayout {
    Windows,
    Linux,
    Bsd { af_inet6: u8 },
}

#[cfg(windows)]
pub const NATIVE_LAYOUT: SockaddrLayout = SockaddrLayout::Windows;
#[cfg(any(target_os = "macos", target_os = "ios"))]
pub const NATIVE_LAYOUT: SockaddrLayout = SockaddrLayout::Bsd { af_inet6: 30 };
#[cfg(any(target_os = "freebsd", target_os = "dragonfly"))]
pub const NATIVE_LAYOUT: SockaddrLayout = SockaddrLayout::Bsd { af_inet6: 28 };
#[cfg(any(target_os = "openbsd", target_os = "netbsd"))]
pub const NATIVE_LAYOUT: SockaddrLayout = SockaddrLayout::Bsd { af_inet6: 24 };
#[cfg(not(any(
    windows,
    target_os = "macos",
    target_os = "ios",
    target_os = "freebsd",
    target_os = "dragonfly",
    target_os = "openbsd",
    target_os = "netbsd"
)))]
pub const NATIVE_LAYOUT: SockaddrLayout = SockaddrLayout::Linux;

const AF_INET: u16 = 2;
const SOCKADDR_IN_LEN: usize = 16;
const SOCKADDR_IN6_LEN: usize = 28;

fn family_of(layout: SockaddrLayout, bytes: &[u8]) -> Option<u16> {
    match layout {
        SockaddrLayout::Windows | SockaddrLayout::Linux => Some(u16::from_ne_bytes([*bytes.first()?, *bytes.get(1)?])),
        SockaddrLayout::Bsd { .. } => bytes.get(1).map(|&b| b as u16),
    }
}

fn af_inet6(layout: SockaddrLayout) -> u16 {
    match layout {
        SockaddrLayout::Windows => 23,
        SockaddrLayout::Linux => 10,
        SockaddrLayout::Bsd { af_inet6 } => af_inet6 as u16,
    }
}

/// IPv4 / IPv6 address of a sockaddr given as bytes; other families (AF_PACKET, AF_LINK…) → None.
pub fn parse_sockaddr(layout: SockaddrLayout, bytes: &[u8]) -> Option<IpAddr> {
    let family = family_of(layout, bytes)?;
    if family == AF_INET && bytes.len() >= 8 {
        return Some(IpAddr::V4(Ipv4Addr::new(bytes[4], bytes[5], bytes[6], bytes[7])));
    }
    if family == af_inet6(layout) && bytes.len() >= 24 {
        let mut a = [0u8; 16];
        a.copy_from_slice(&bytes[8..24]);
        return Some(IpAddr::V6(Ipv6Addr::from(a)));
    }
    None
}

/// Reads a `struct sockaddr *` from libpcap (or GetAdaptersAddresses): looks at the family first
/// and only then reads as many bytes as that family's struct has.
unsafe fn read_sockaddr(p: *const u8) -> Option<IpAddr> {
    if p.is_null() {
        return None;
    }
    let head = std::slice::from_raw_parts(p, 2);
    let family = family_of(NATIVE_LAYOUT, head)?;
    let size = if family == AF_INET {
        SOCKADDR_IN_LEN
    } else if family == af_inet6(NATIVE_LAYOUT) {
        SOCKADDR_IN6_LEN
    } else {
        return None;
    };
    parse_sockaddr(NATIVE_LAYOUT, std::slice::from_raw_parts(p, size))
}

// ───────────────────────── interfaces

#[derive(Debug, Clone, Serialize)]
pub struct Interface {
    pub name: String,
    pub description: String,
    pub friendly: String,
    pub addresses: Vec<String>,
    pub loopback: bool,
    pub up: bool,
    pub running: bool,
    pub wireless: bool,
    /// Expected link-layer type (best guess without opening the device; `capture_start` returns the real one).
    pub linktype: i32,
}

fn guess_linktype(name: &str, loopback: bool) -> i32 {
    if cfg!(windows) {
        if loopback || name.contains("NPF_Loopback") {
            return DLT_NULL;
        }
    } else if cfg!(target_os = "linux") {
        if name == "any" {
            return DLT_LINUX_SLL;
        }
    } else if loopback || name.starts_with("utun") || name.starts_with("lo") {
        // macOS / BSD loopback and tunnels use the BSD loopback header.
        return DLT_NULL;
    }
    DLT_EN10MB
}

pub fn interfaces() -> Result<Vec<Interface>, CaptureError> {
    let lib = library()?;
    #[cfg(windows)]
    if needs_elevation_prompt() {
        // Listing through Npcap would pop up a UAC prompt and block (see "administrators only" above).
        return Ok(win::list_from_adapters());
    }
    let mut list = Vec::new();
    unsafe {
        let mut all: *mut pcap_if_t = std::ptr::null_mut();
        let mut err = [0 as c_char; PCAP_ERRBUF_SIZE];
        let rc = {
            let _g = DEVS_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            (lib.findalldevs)(&mut all, err.as_mut_ptr())
        };
        if rc != 0 {
            let msg = errbuf_text(&err);
            let code = if looks_like_permission(&msg) { E_PERMISSION } else { E_FINDALLDEVS };
            let msg = if code == E_PERMISSION { format!("{msg}. {}", permission_hint()) } else { msg };
            return Err(CaptureError::new(code, msg));
        }
        let mut cur = all;
        while !cur.is_null() {
            let dev = &*cur;
            let name = cstr(dev.name);
            let description = cstr(dev.description);
            let mut addresses = Vec::new();
            let mut a = dev.addresses;
            while !a.is_null() {
                if let Some(ip) = read_sockaddr((*a).addr as *const u8) {
                    let s = ip.to_string();
                    if !addresses.contains(&s) {
                        addresses.push(s);
                    }
                }
                a = (*a).next;
            }
            let loopback = dev.flags & PCAP_IF_LOOPBACK != 0;
            list.push(Interface {
                linktype: guess_linktype(&name, loopback),
                friendly: name.clone(),
                name,
                description,
                addresses,
                loopback,
                up: dev.flags & PCAP_IF_UP != 0,
                running: dev.flags & PCAP_IF_RUNNING != 0,
                wireless: dev.flags & PCAP_IF_WIRELESS != 0,
            });
            cur = dev.next;
        }
        if !all.is_null() {
            (lib.freealldevs)(all);
        }
    }
    #[cfg(windows)]
    win::decorate(&mut list);
    Ok(list)
}

#[cfg(windows)]
mod win {
    //! Windows names: Npcap lists `\Device\NPF_{GUID}` with a generic description; the adapter
    //! table gives the name users know ("Wi-Fi", "이더넷 3") and its addresses.
    use super::{read_sockaddr, Interface, DLT_EN10MB, DLT_NULL};
    use windows::Win32::NetworkManagement::IpHelper::{GetAdaptersAddresses, GET_ADAPTERS_ADDRESSES_FLAGS, IP_ADAPTER_ADDRESSES_LH};

    const GAA_FLAGS: u32 = 0x2 | 0x4 | 0x8; // skip anycast, multicast, DNS servers
    const ERROR_BUFFER_OVERFLOW: u32 = 111;
    const IF_TYPE_SOFTWARE_LOOPBACK: u32 = 24;
    const IF_TYPE_IEEE80211: u32 = 71;
    const IF_OPER_STATUS_UP: i32 = 1;

    pub struct Adapter {
        pub guid: String,
        pub friendly: String,
        pub description: String,
        pub addresses: Vec<String>,
        pub up: bool,
        pub wireless: bool,
        pub loopback: bool,
        pub if_type: u32,
    }

    unsafe fn wide(p: *const u16) -> String {
        if p.is_null() {
            return String::new();
        }
        let mut n = 0;
        while *p.add(n) != 0 {
            n += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(p, n))
    }

    pub fn adapters() -> Vec<Adapter> {
        let mut out = Vec::new();
        let mut size: u32 = 32 * 1024;
        for _ in 0..4 {
            // u64 storage keeps the buffer 8-byte aligned for the structs inside.
            let mut buf = vec![0u64; (size as usize).div_ceil(8)];
            let rc = unsafe {
                GetAdaptersAddresses(0, GET_ADAPTERS_ADDRESSES_FLAGS(GAA_FLAGS), None, Some(buf.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH), &mut size)
            };
            if rc == ERROR_BUFFER_OVERFLOW {
                continue;
            }
            if rc != 0 {
                return out;
            }
            unsafe {
                let mut cur = buf.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
                while !cur.is_null() {
                    let a = &*cur;
                    let guid = super::cstr(a.AdapterName.0 as *const _);
                    let mut addresses = Vec::new();
                    let mut u = a.FirstUnicastAddress;
                    while !u.is_null() {
                        if let Some(ip) = read_sockaddr((*u).Address.lpSockaddr as *const u8) {
                            let s = ip.to_string();
                            if !addresses.contains(&s) {
                                addresses.push(s);
                            }
                        }
                        u = (*u).Next;
                    }
                    out.push(Adapter {
                        guid,
                        friendly: wide(a.FriendlyName.0),
                        description: wide(a.Description.0),
                        addresses,
                        up: a.OperStatus.0 == IF_OPER_STATUS_UP,
                        wireless: a.IfType == IF_TYPE_IEEE80211,
                        loopback: a.IfType == IF_TYPE_SOFTWARE_LOOPBACK,
                        if_type: a.IfType,
                    });
                    cur = a.Next;
                }
            }
            return out;
        }
        out
    }

    /// `\Device\NPF_{4D36E972-...}` → `{4D36E972-...}`.
    pub fn guid_of(name: &str) -> Option<&str> {
        let start = name.find('{')?;
        let end = name[start..].find('}')? + start;
        Some(&name[start..=end])
    }

    /// The interface list without touching the Npcap driver: Npcap names its devices
    /// `\Device\NPF_{adapter GUID}` (plus `\Device\NPF_Loopback`), so the adapter table is enough.
    /// Used while opening the driver would show a UAC prompt; an adapter Npcap is not bound to fails
    /// later in `capture_start` with `no_such_device`.
    pub fn list_from_adapters() -> Vec<Interface> {
        // Ethernet, PPP, proprietary virtual, Wi-Fi, mobile broadband; not tunnels or the IP loopback.
        const TYPES: [u32; 6] = [6, 23, 53, 71, 243, 244];
        let mut list: Vec<Interface> = adapters()
            .into_iter()
            .filter(|a| TYPES.contains(&a.if_type) && a.guid.starts_with('{'))
            .map(|a| Interface {
                name: format!(r"\Device\NPF_{}", a.guid),
                friendly: if a.friendly.is_empty() { a.description.clone() } else { a.friendly },
                description: a.description,
                addresses: a.addresses,
                loopback: false,
                up: a.up,
                running: a.up,
                wireless: a.wireless,
                linktype: DLT_EN10MB,
            })
            .collect();
        list.push(Interface {
            name: r"\Device\NPF_Loopback".to_string(),
            description: "Adapter for loopback traffic capture".to_string(),
            friendly: "Adapter for loopback traffic capture".to_string(),
            addresses: vec!["::1".to_string(), "127.0.0.1".to_string()],
            loopback: true,
            up: true,
            running: true,
            wireless: false,
            linktype: DLT_NULL,
        });
        list
    }

    pub fn decorate(list: &mut [Interface]) {
        let adapters = adapters();
        for dev in list.iter_mut() {
            if dev.name.ends_with("NPF_Loopback") {
                dev.friendly = "Adapter for loopback traffic capture".to_string();
                dev.loopback = true;
                dev.up = true;
                dev.running = true;
                dev.linktype = DLT_NULL;
                continue;
            }
            let adapter = guid_of(&dev.name).and_then(|guid| adapters.iter().find(|a| a.guid.eq_ignore_ascii_case(guid)));
            let Some(a) = adapter else {
                // Hidden adapters (WAN Miniport …) are not in the table: the description is the best name.
                if !dev.description.is_empty() {
                    dev.friendly = dev.description.clone();
                }
                continue;
            };
            if !a.friendly.is_empty() {
                dev.friendly = a.friendly.clone();
            }
            if dev.description.is_empty() || dev.description.starts_with("Network adapter '") {
                dev.description = a.description.clone();
            }
            for ip in &a.addresses {
                if !dev.addresses.contains(ip) {
                    dev.addresses.push(ip.clone());
                }
            }
            dev.up = dev.up || a.up;
            dev.running = dev.running || a.up;
            dev.wireless = dev.wireless || a.wireless;
            dev.loopback = dev.loopback || a.loopback;
        }
    }
}

// ───────────────────────── filter check

#[derive(Debug, Clone, Serialize)]
pub struct FilterCheck {
    pub ok: bool,
    pub error: Option<String>,
}

/// Compiles a capture (BPF) filter for a link type without opening a device.
pub fn check_filter(linktype: i32, filter: &str) -> Result<FilterCheck, CaptureError> {
    let lib = library()?;
    if filter.trim().is_empty() {
        return Ok(FilterCheck { ok: true, error: None });
    }
    let Ok(text) = CString::new(filter) else {
        return Ok(FilterCheck { ok: false, error: Some("filter contains a NUL character".into()) });
    };
    unsafe {
        let p = (lib.open_dead)(linktype, 262_144);
        if p.is_null() {
            return Err(CaptureError::new(E_INVALID, format!("unsupported link type {linktype}")));
        }
        let mut prog = bpf_program { bf_len: 0, bf_insns: std::ptr::null_mut() };
        let rc = {
            let _g = COMPILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            (lib.compile)(p, &mut prog, text.as_ptr(), 1, PCAP_NETMASK_UNKNOWN)
        };
        let result = if rc == 0 {
            (lib.freecode)(&mut prog);
            FilterCheck { ok: true, error: None }
        } else {
            FilterCheck { ok: false, error: Some(lib.err_of(p)) }
        };
        (lib.close)(p);
        Ok(result)
    }
}

// ───────────────────────── batch format

/// Little-endian batch: `[u32 count]` then per packet `[u32 sec][u32 nsec][u32 caplen][u32 len][caplen bytes]`.
pub struct BatchEncoder {
    buf: Vec<u8>,
    count: u32,
}

pub const BATCH_HEADER: usize = 4;
pub const PACKET_HEADER: usize = 16;

impl Default for BatchEncoder {
    fn default() -> Self {
        Self::new()
    }
}

impl BatchEncoder {
    pub fn new() -> Self {
        Self::with_capacity(64 * 1024)
    }

    pub fn with_capacity(cap: usize) -> Self {
        let mut buf = Vec::with_capacity(cap.max(BATCH_HEADER));
        buf.extend_from_slice(&[0; BATCH_HEADER]);
        Self { buf, count: 0 }
    }

    pub fn push(&mut self, sec: u32, nsec: u32, len: u32, data: &[u8]) {
        self.buf.extend_from_slice(&sec.to_le_bytes());
        self.buf.extend_from_slice(&nsec.to_le_bytes());
        self.buf.extend_from_slice(&(data.len() as u32).to_le_bytes());
        self.buf.extend_from_slice(&len.to_le_bytes());
        self.buf.extend_from_slice(data);
        self.count += 1;
    }

    pub fn count(&self) -> u32 {
        self.count
    }

    pub fn is_empty(&self) -> bool {
        self.count == 0
    }

    /// Encoded size so far, header included.
    pub fn byte_len(&self) -> usize {
        self.buf.len()
    }

    /// The finished batch; the encoder starts over.
    pub fn take(&mut self) -> Vec<u8> {
        let cap = self.buf.capacity();
        let mut out = std::mem::replace(&mut self.buf, Vec::with_capacity(cap.min(1 << 20)));
        out[0..4].copy_from_slice(&self.count.to_le_bytes());
        self.buf.extend_from_slice(&[0; BATCH_HEADER]);
        self.count = 0;
        out
    }
}

/// One decoded packet of a batch (tests and tools).
#[derive(Debug, PartialEq, Eq)]
pub struct BatchPacket<'a> {
    pub sec: u32,
    pub nsec: u32,
    pub len: u32,
    pub data: &'a [u8],
}

pub fn decode_batch(bytes: &[u8]) -> Option<Vec<BatchPacket<'_>>> {
    let rd = |o: usize| -> Option<u32> { Some(u32::from_le_bytes(bytes.get(o..o + 4)?.try_into().ok()?)) };
    let count = rd(0)? as usize;
    let mut out = Vec::with_capacity(count);
    let mut o = BATCH_HEADER;
    for _ in 0..count {
        let (sec, nsec, caplen, len) = (rd(o)?, rd(o + 4)?, rd(o + 8)? as usize, rd(o + 12)?);
        o += PACKET_HEADER;
        let data = bytes.get(o..o + caplen)?;
        o += caplen;
        out.push(BatchPacket { sec, nsec, len, data });
    }
    (o == bytes.len()).then_some(out)
}

/// Seconds / nanoseconds of a libpcap timestamp (`frac` is µs or ns depending on the precision).
pub fn split_timestamp(sec: i64, frac: i64, nano: bool) -> (u32, u32) {
    let mut ns = if nano { frac } else { frac.saturating_mul(1000) };
    let mut s = sec;
    if ns >= 1_000_000_000 {
        s += ns / 1_000_000_000;
        ns %= 1_000_000_000;
    }
    if ns < 0 {
        ns = 0;
    }
    (s.clamp(0, u32::MAX as i64) as u32, ns as u32)
}

// ───────────────────────── live capture

#[derive(Debug, Clone, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct StartOptions {
    pub iface: String,
    pub snaplen: i32,
    pub promisc: bool,
    pub filter: String,
    pub buffer_mb: u32,
    pub timeout_ms: u32,
    pub monitor: bool,
}

impl Default for StartOptions {
    fn default() -> Self {
        Self { iface: String::new(), snaplen: 262_144, promisc: true, filter: String::new(), buffer_mb: 4, timeout_ms: 100, monitor: false }
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
pub struct Stats {
    pub recv: u32,
    pub drop: u32,
    pub ifdrop: u32,
}

/// Flush a batch after this much time or this many bytes, whichever comes first.
pub const FLUSH_INTERVAL: Duration = Duration::from_millis(100);
pub const FLUSH_BYTES: usize = 512 * 1024;
const STATS_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Clone, Copy)]
struct Handle(*mut pcap_t);
// The pointer is only dereferenced by libpcap under the rules described at the top of the file.
unsafe impl Send for Handle {}
unsafe impl Sync for Handle {}

struct Shared {
    lib: Arc<PcapLib>,
    /// `Some` while the handle is open; the capture thread closes it under this lock.
    handle: Mutex<Option<Handle>>,
    stop: AtomicBool,
    stats: Mutex<Stats>,
}

/// Called with each finished batch; return `false` to stop the capture (receiver gone).
pub type BatchSink = Box<dyn FnMut(Vec<u8>) -> bool + Send>;
/// Called once when the capture thread ends: `(requested, error)`. `requested` is true when
/// `stop()` (or a `false` from the sink) ended it; `error` is set when libpcap failed.
pub type EndSink = Box<dyn FnOnce(bool, Option<CaptureError>, Stats) + Send>;

pub struct LiveCapture {
    shared: Arc<Shared>,
    thread: Mutex<Option<JoinHandle<()>>>,
    pub linktype: i32,
    pub snaplen: i32,
    pub nanosecond: bool,
    pub warning: Option<String>,
}

fn looks_like_permission(msg: &str) -> bool {
    let m = msg.to_ascii_lowercase();
    m.contains("permission") || m.contains("denied") || m.contains("not permitted") || m.contains("eperm") || m.contains("eacces")
}

unsafe fn activate_error(lib: &PcapLib, p: *mut pcap_t, status: c_int, iface: &str) -> CaptureError {
    let status_text = lib.status_text(status);
    let detail = lib.err_of(p);
    let text = if detail.is_empty() || detail == status_text { status_text } else { format!("{status_text}: {detail}") };
    let text = format!("{iface}: {text}");
    match status {
        PCAP_ERROR_NO_SUCH_DEVICE => CaptureError::new(E_NO_SUCH_DEVICE, text),
        PCAP_ERROR_PERM_DENIED | PCAP_ERROR_PROMISC_PERM_DENIED => CaptureError::new(E_PERMISSION, format!("{text}. {}", permission_hint())),
        PCAP_ERROR_RFMON_NOTSUP => CaptureError::new(E_RFMON_UNSUPPORTED, text),
        PCAP_ERROR_IFACE_NOT_UP => CaptureError::new(E_IFACE_NOT_UP, text),
        _ if looks_like_permission(&text) => CaptureError::new(E_PERMISSION, format!("{text}. {}", permission_hint())),
        _ => CaptureError::new(E_ACTIVATE_FAILED, text),
    }
}

/// Opens, configures and activates the interface, sets the filter and starts the capture thread.
pub fn start(opts: &StartOptions, mut on_batch: BatchSink, on_end: EndSink) -> Result<LiveCapture, CaptureError> {
    let lib = library()?;
    if opts.iface.is_empty() {
        return Err(CaptureError::new(E_INVALID, "no interface given"));
    }
    let Ok(name) = CString::new(opts.iface.as_str()) else {
        return Err(CaptureError::new(E_INVALID, "interface name contains a NUL character"));
    };
    let filter = CString::new(opts.filter.as_str()).map_err(|_| CaptureError::new(E_FILTER_INVALID, "filter contains a NUL character"))?;
    let snaplen = if opts.snaplen <= 0 { 262_144 } else { opts.snaplen.clamp(64, 262_144) };
    let timeout = opts.timeout_ms.clamp(10, 1000) as c_int;
    let buffer = (opts.buffer_mb.clamp(1, 1024) as c_int).saturating_mul(1024 * 1024);

    unsafe {
        let mut err = [0 as c_char; PCAP_ERRBUF_SIZE];
        let p = (lib.create)(name.as_ptr(), err.as_mut_ptr());
        if p.is_null() {
            let msg = errbuf_text(&err);
            let code = if looks_like_permission(&msg) { E_PERMISSION } else { E_NO_SUCH_DEVICE };
            let msg = if code == E_PERMISSION { format!("{msg}. {}", permission_hint()) } else { format!("{}: {msg}", opts.iface) };
            return Err(CaptureError::new(code, msg));
        }
        let fail = |e: CaptureError| -> Result<LiveCapture, CaptureError> {
            (lib.close)(p);
            Err(e)
        };
        (lib.set_snaplen)(p, snaplen);
        (lib.set_promisc)(p, opts.promisc as c_int);
        (lib.set_timeout)(p, timeout);
        (lib.set_buffer_size)(p, buffer);
        if let Some(f) = lib.set_immediate_mode {
            f(p, 1);
        }
        if opts.monitor {
            match (lib.can_set_rfmon, lib.set_rfmon) {
                (Some(can), Some(set)) => {
                    let rc = can(p);
                    if rc == 1 {
                        set(p, 1);
                    } else if rc == 0 {
                        return fail(CaptureError::new(E_RFMON_UNSUPPORTED, format!("{}: monitor mode is not supported on this interface", opts.iface)));
                    } else {
                        let e = activate_error(&lib, p, rc, &opts.iface);
                        return fail(e);
                    }
                }
                _ => return fail(CaptureError::new(E_RFMON_UNSUPPORTED, "monitor mode is not supported by this libpcap")),
            }
        }
        let mut nanosecond = false;
        if let Some(f) = lib.set_tstamp_precision {
            nanosecond = f(p, PCAP_TSTAMP_PRECISION_NANO) == 0;
        }
        let status = (lib.activate)(p);
        if status < 0 {
            let e = activate_error(&lib, p, status, &opts.iface);
            return fail(e);
        }
        // The driver is open (in "administrators only" mode the UAC prompt was accepted): listing
        // interfaces through Npcap no longer prompts in this process.
        DRIVER_GRANTED.store(true, Ordering::SeqCst);
        let warning = if status > 0 {
            let s = lib.status_text(status);
            let d = lib.err_of(p);
            Some(if d.is_empty() || d == s { s } else { format!("{s}: {d}") })
        } else {
            None
        };
        if let Some(f) = lib.get_tstamp_precision {
            nanosecond = f(p) == PCAP_TSTAMP_PRECISION_NANO;
        } else if lib.set_tstamp_precision.is_none() {
            nanosecond = false;
        }
        if !opts.filter.trim().is_empty() {
            let mut prog = bpf_program { bf_len: 0, bf_insns: std::ptr::null_mut() };
            let rc = {
                let _g = COMPILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
                (lib.compile)(p, &mut prog, filter.as_ptr(), 1, PCAP_NETMASK_UNKNOWN)
            };
            if rc != 0 {
                let e = CaptureError::new(E_FILTER_INVALID, lib.err_of(p));
                return fail(e);
            }
            let rc = (lib.setfilter)(p, &mut prog);
            (lib.freecode)(&mut prog);
            if rc != 0 {
                let e = CaptureError::new(E_FILTER_INVALID, lib.err_of(p));
                return fail(e);
            }
        }
        let linktype = (lib.datalink)(p);
        let snaplen = (lib.snapshot)(p);

        let shared = Arc::new(Shared { lib: lib.clone(), handle: Mutex::new(Some(Handle(p))), stop: AtomicBool::new(false), stats: Mutex::new(Stats::default()) });
        let worker = shared.clone();
        let handle = Handle(p);
        let thread = std::thread::Builder::new()
            .name(format!("capture {}", opts.iface))
            .spawn(move || {
                let handle = handle;
                let (requested, error) = capture_loop(&worker, handle.0, nanosecond, &mut on_batch);
                let stats = {
                    let _g = worker.handle.lock().unwrap_or_else(|e| e.into_inner());
                    *worker.stats.lock().unwrap_or_else(|e| e.into_inner())
                };
                {
                    let mut h = worker.handle.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(Handle(p)) = h.take() {
                        (worker.lib.close)(p);
                    }
                }
                on_end(requested, error, stats);
            });
        let thread = match thread {
            Ok(t) => t,
            Err(e) => {
                shared.handle.lock().unwrap_or_else(|e| e.into_inner()).take();
                return fail(CaptureError::new(E_CAPTURE, format!("cannot start the capture thread: {e}")));
            }
        };
        Ok(LiveCapture { shared, thread: Mutex::new(Some(thread)), linktype, snaplen, nanosecond, warning })
    }
}

unsafe fn read_stats(lib: &PcapLib, p: *mut pcap_t) -> Option<Stats> {
    let mut st = pcap_stat::default();
    ((lib.stats)(p, &mut st) == 0).then_some(Stats { recv: st.ps_recv, drop: st.ps_drop, ifdrop: st.ps_ifdrop })
}

/// The capture thread: reads packets, sends batches, refreshes the statistics.
/// Returns `(requested, error)`.
unsafe fn capture_loop(shared: &Shared, p: *mut pcap_t, nano: bool, sink: &mut BatchSink) -> (bool, Option<CaptureError>) {
    let lib = &shared.lib;
    let mut batch = BatchEncoder::new();
    let mut last_flush = Instant::now();
    let mut last_stats = Instant::now();
    let outcome: (bool, Option<CaptureError>);
    loop {
        if shared.stop.load(Ordering::SeqCst) {
            outcome = (true, None);
            break;
        }
        let mut hdr: *mut pcap_pkthdr = std::ptr::null_mut();
        let mut data: *const u8 = std::ptr::null();
        let rc = (lib.next_ex)(p, &mut hdr, &mut data);
        match rc {
            1 if !hdr.is_null() && !data.is_null() => {
                let h = *hdr;
                let (sec, nsec) = split_timestamp(h.ts.tv_sec as i64, h.ts.tv_usec as i64, nano);
                batch.push(sec, nsec, h.len, std::slice::from_raw_parts(data, h.caplen as usize));
            }
            1 | 0 => {}
            PCAP_ERROR_BREAK => {
                outcome = (true, None);
                break;
            }
            _ => {
                let msg = lib.err_of(p);
                let msg = if msg.is_empty() { lib.status_text(rc) } else { msg };
                let code = if looks_like_permission(&msg) { E_PERMISSION } else { E_CAPTURE };
                outcome = (false, Some(CaptureError::new(code, msg)));
                break;
            }
        }
        if !batch.is_empty() && (batch.byte_len() >= FLUSH_BYTES || last_flush.elapsed() >= FLUSH_INTERVAL) {
            if !sink(batch.take()) {
                outcome = (true, None);
                break;
            }
            last_flush = Instant::now();
        } else if batch.is_empty() {
            last_flush = Instant::now();
        }
        if last_stats.elapsed() >= STATS_INTERVAL {
            if let Some(s) = read_stats(lib, p) {
                *shared.stats.lock().unwrap_or_else(|e| e.into_inner()) = s;
            }
            last_stats = Instant::now();
        }
    }
    if !batch.is_empty() {
        sink(batch.take());
    }
    if let Some(s) = read_stats(lib, p) {
        *shared.stats.lock().unwrap_or_else(|e| e.into_inner()) = s;
    }
    outcome
}

impl LiveCapture {
    /// Latest statistics (refreshed by the capture thread about twice a second).
    pub fn stats(&self) -> Stats {
        *self.shared.stats.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Asks the thread to stop without waiting.
    pub fn request_stop(&self) {
        self.shared.stop.store(true, Ordering::SeqCst);
        let h = self.shared.handle.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(Handle(p)) = *h {
            unsafe { (self.shared.lib.breakloop)(p) };
        }
    }

    /// Stops, waits for the thread (it flushes the last batch and closes the handle), returns the final statistics.
    /// Blocks for at most about one read timeout.
    pub fn stop(&self) -> Stats {
        self.request_stop();
        let thread = self.thread.lock().unwrap_or_else(|e| e.into_inner()).take();
        if let Some(t) = thread {
            // Dropped from the capture thread itself (its end callback): nothing to wait for.
            if t.thread().id() != std::thread::current().id() {
                let _ = t.join();
            }
        }
        self.stats()
    }

    pub fn is_finished(&self) -> bool {
        self.thread.lock().unwrap_or_else(|e| e.into_inner()).as_ref().is_none_or(|t| t.is_finished())
    }
}

impl Drop for LiveCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

// ───────────────────────── tests

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batch_roundtrip() {
        let mut b = BatchEncoder::with_capacity(8);
        assert!(b.is_empty());
        b.push(1_700_000_000, 123_456_789, 60, &[1, 2, 3]);
        b.push(5, 0, 1514, &[]);
        b.push(6, 999_999_999, 4, &[9, 8, 7, 6]);
        assert_eq!(b.count(), 3);
        assert_eq!(b.byte_len(), 4 + 3 * 16 + 3 + 4); // header, 3 packet headers, 3 + 0 + 4 data bytes
        let bytes = b.take();
        assert_eq!(&bytes[0..4], &3u32.to_le_bytes());
        // first packet header, little endian
        assert_eq!(&bytes[4..8], &1_700_000_000u32.to_le_bytes());
        assert_eq!(&bytes[8..12], &123_456_789u32.to_le_bytes());
        assert_eq!(&bytes[12..16], &3u32.to_le_bytes());
        assert_eq!(&bytes[16..20], &60u32.to_le_bytes());
        assert_eq!(&bytes[20..23], &[1, 2, 3]);
        let pk = decode_batch(&bytes).unwrap();
        assert_eq!(pk.len(), 3);
        assert_eq!(pk[0], BatchPacket { sec: 1_700_000_000, nsec: 123_456_789, len: 60, data: &[1, 2, 3] });
        assert_eq!(pk[1], BatchPacket { sec: 5, nsec: 0, len: 1514, data: &[] });
        assert_eq!(pk[2].data, &[9, 8, 7, 6]);
        // encoder is reusable after take()
        assert!(b.is_empty());
        b.push(1, 2, 3, &[4]);
        let again = b.take();
        assert_eq!(decode_batch(&again).unwrap().len(), 1);
        // empty batch is just the count
        assert_eq!(b.take(), vec![0, 0, 0, 0]);
        // truncated input is rejected
        assert!(decode_batch(&bytes[..bytes.len() - 1]).is_none());
    }

    #[test]
    fn timestamps() {
        assert_eq!(split_timestamp(10, 250_000, false), (10, 250_000_000));
        assert_eq!(split_timestamp(10, 250_000, true), (10, 250_000));
        assert_eq!(split_timestamp(10, 1_500_000, false), (11, 500_000_000));
        assert_eq!(split_timestamp(-5, 0, true), (0, 0));
    }

    fn v4(prefix: [u8; 2]) -> Vec<u8> {
        let mut b = vec![0u8; 16];
        b[0..2].copy_from_slice(&prefix);
        b[2..4].copy_from_slice(&80u16.to_be_bytes());
        b[4..8].copy_from_slice(&[192, 168, 1, 20]);
        b
    }

    fn v6(prefix: [u8; 2]) -> Vec<u8> {
        let mut b = vec![0u8; 28];
        b[0..2].copy_from_slice(&prefix);
        let ip: Ipv6Addr = "fe80::1234:5678:9abc:def0".parse().unwrap();
        b[8..24].copy_from_slice(&ip.octets());
        b
    }

    #[test]
    fn sockaddr_layouts() {
        let ip4: IpAddr = "192.168.1.20".parse().unwrap();
        let ip6: IpAddr = "fe80::1234:5678:9abc:def0".parse().unwrap();
        // Windows: u16 family (AF_INET6 = 23)
        assert_eq!(parse_sockaddr(SockaddrLayout::Windows, &v4(2u16.to_ne_bytes())), Some(ip4));
        assert_eq!(parse_sockaddr(SockaddrLayout::Windows, &v6(23u16.to_ne_bytes())), Some(ip6));
        // Linux: u16 family (AF_INET6 = 10); AF_PACKET (17) is ignored
        assert_eq!(parse_sockaddr(SockaddrLayout::Linux, &v4(2u16.to_ne_bytes())), Some(ip4));
        assert_eq!(parse_sockaddr(SockaddrLayout::Linux, &v6(10u16.to_ne_bytes())), Some(ip6));
        assert_eq!(parse_sockaddr(SockaddrLayout::Linux, &v6(17u16.to_ne_bytes())), None);
        assert_eq!(parse_sockaddr(SockaddrLayout::Linux, &v6(23u16.to_ne_bytes())), None);
        // macOS: sa_len, sa_family (AF_INET6 = 30); AF_LINK (18) is ignored
        let mac = SockaddrLayout::Bsd { af_inet6: 30 };
        assert_eq!(parse_sockaddr(mac, &v4([16, 2])), Some(ip4));
        assert_eq!(parse_sockaddr(mac, &v6([28, 30])), Some(ip6));
        assert_eq!(parse_sockaddr(mac, &v6([20, 18])), None);
        // FreeBSD AF_INET6 = 28
        assert_eq!(parse_sockaddr(SockaddrLayout::Bsd { af_inet6: 28 }, &v6([28, 28])), Some(ip6));
        // too short
        assert_eq!(parse_sockaddr(SockaddrLayout::Windows, &[2, 0, 0]), None);
        assert_eq!(parse_sockaddr(SockaddrLayout::Windows, &v6(23u16.to_ne_bytes())[..20]), None);
    }

    #[test]
    fn native_sockaddr_pointer() {
        let bytes = match NATIVE_LAYOUT {
            SockaddrLayout::Bsd { af_inet6 } => v6([28, af_inet6]),
            l => v6((af_inet6(l)).to_ne_bytes()),
        };
        assert_eq!(unsafe { read_sockaddr(bytes.as_ptr()) }, Some("fe80::1234:5678:9abc:def0".parse().unwrap()));
        assert_eq!(unsafe { read_sockaddr(std::ptr::null()) }, None);
    }

    #[test]
    fn struct_layouts() {
        use std::mem::{offset_of, size_of};
        #[cfg(windows)]
        {
            assert_eq!(size_of::<pcap_pkthdr>(), 16);
            assert_eq!(offset_of!(pcap_pkthdr, caplen), 8);
        }
        #[cfg(all(target_os = "linux", target_pointer_width = "64"))]
        {
            assert_eq!(size_of::<pcap_pkthdr>(), 24);
            assert_eq!(offset_of!(pcap_pkthdr, caplen), 16);
        }
        #[cfg(all(target_os = "macos", target_pointer_width = "64"))]
        {
            assert_eq!(size_of::<pcap_pkthdr>(), 24);
            assert_eq!(offset_of!(pcap_pkthdr, caplen), 16);
        }
        assert_eq!(offset_of!(pcap_if_t, flags), 4 * size_of::<usize>());
        assert_eq!(size_of::<pcap_addr_t>(), 5 * size_of::<usize>());
    }

    /// Never touches the Npcap driver (no UAC prompt in "administrators only" mode).
    #[cfg(windows)]
    #[test]
    fn adapter_table_list() {
        let list = win::list_from_adapters();
        assert!(list.iter().any(|i| i.name == r"\Device\NPF_Loopback" && i.loopback && i.linktype == DLT_NULL));
        assert!(list.iter().all(|i| i.name.starts_with(r"\Device\NPF_") && !i.friendly.is_empty()));
        let _ = (npcap_admin_only(), process_elevated());
    }

    #[cfg(windows)]
    #[test]
    fn npf_guid() {
        assert_eq!(win::guid_of(r"\Device\NPF_{4D36E972-E325-11CE-BFC1-08002BE10318}"), Some("{4D36E972-E325-11CE-BFC1-08002BE10318}"));
        assert_eq!(win::guid_of(r"\Device\NPF_Loopback"), None);
    }

    /// Lists interfaces and captures 3 s of loopback traffic while sending UDP datagrams to
    /// 127.0.0.1. Needs Npcap/libpcap (and rights): `cargo test -- --ignored --nocapture live_loopback`.
    #[test]
    #[ignore]
    fn live_loopback() {
        let info = backend_info();
        println!("backend: {info:?}");
        assert!(info.available, "{info:?}");
        let list = interfaces().expect("interfaces");
        println!("{} interfaces", list.len());
        for i in &list {
            println!("  {} | {} | {} | {:?} loop={} up={} run={} wifi={} dlt={}", i.name, i.friendly, i.description, i.addresses, i.loopback, i.up, i.running, i.wireless, i.linktype);
        }
        let lo = list
            .iter()
            .find(|i| i.name.ends_with("NPF_Loopback") || i.name == "lo" || i.name == "lo0")
            .or_else(|| list.iter().find(|i| i.loopback))
            .expect("loopback interface");
        assert!(check_filter(lo.linktype, "udp port 50999").unwrap().ok);
        let bad = check_filter(lo.linktype, "udp port nope and").unwrap();
        println!("bad filter -> {:?}", bad.error);
        assert!(!bad.ok);
        let noop = || -> (BatchSink, EndSink) { (Box::new(|_| true), Box::new(|_, _, _| {})) };
        let (b, e) = noop();
        let err = start(&StartOptions { iface: "no-such-interface-xyz".into(), ..Default::default() }, b, e).err().expect("bad interface fails");
        println!("bad interface -> {err:?}");
        assert!(err.code == E_NO_SUCH_DEVICE || err.code == E_ACTIVATE_FAILED, "{err:?}");
        let (b, e) = noop();
        let err = start(&StartOptions { iface: lo.name.clone(), filter: "tcp port".into(), ..Default::default() }, b, e).err().expect("bad filter fails");
        println!("bad filter at start -> {err:?}");
        assert_eq!(err.code, E_FILTER_INVALID);

        let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
        let (etx, erx) = std::sync::mpsc::channel::<(bool, Option<CaptureError>, Stats)>();
        let opts = StartOptions { iface: lo.name.clone(), filter: "udp port 50999".into(), ..Default::default() };
        let cap = start(&opts, Box::new(move |b| tx.send(b).is_ok()), Box::new(move |r, e, s| {
            let _ = etx.send((r, e, s));
        }))
        .expect("start");
        println!("started: linktype={} snaplen={} nano={} warning={:?}", cap.linktype, cap.snaplen, cap.nanosecond, cap.warning);

        let sock = std::net::UdpSocket::bind("127.0.0.1:0").unwrap();
        let t0 = Instant::now();
        let mut sent = 0;
        while t0.elapsed() < Duration::from_secs(3) {
            sock.send_to(&[0x55u8; 32], "127.0.0.1:50999").unwrap();
            sent += 1;
            std::thread::sleep(Duration::from_millis(100));
        }
        let mid = cap.stats();
        let t_stop = Instant::now();
        let stats = cap.stop();
        let stop_ms = t_stop.elapsed().as_millis();
        let (requested, error, _) = erx.recv_timeout(Duration::from_secs(2)).expect("end callback");
        assert!(requested && error.is_none(), "{error:?}");

        let mut batches = 0;
        let mut packets = 0;
        let mut prev = (0u32, 0u32);
        for b in rx.try_iter() {
            batches += 1;
            for p in decode_batch(&b).expect("well-formed batch") {
                packets += 1;
                assert!(p.nsec < 1_000_000_000);
                assert!((p.sec, p.nsec) >= prev, "timestamps go forward");
                prev = (p.sec, p.nsec);
                assert!(p.data.len() as u32 <= p.len);
            }
        }
        println!("sent {sent} datagrams, captured {packets} packets in {batches} batches, stats mid={mid:?} final={stats:?}, stop took {stop_ms} ms");
        assert!(packets >= sent - 1, "captured {packets} of {sent}");
        assert!(stop_ms < 1500);
        assert!(cap.is_finished());
    }

    /// Bursts 20 000 × 1000-byte datagrams to 127.0.0.1 and checks the batches stay near 512 KiB.
    /// `cargo test -- --ignored --nocapture live_loopback_burst`
    #[test]
    #[ignore]
    fn live_loopback_burst() {
        let list = interfaces().expect("interfaces");
        let lo = list.iter().find(|i| i.loopback).expect("loopback interface");
        let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
        let opts = StartOptions { iface: lo.name.clone(), filter: "udp port 50998".into(), buffer_mb: 16, ..Default::default() };
        let cap = start(&opts, Box::new(move |b| tx.send(b).is_ok()), Box::new(|_, _, _| {})).expect("start");
        let sock = std::net::UdpSocket::bind("127.0.0.1:0").unwrap();
        let t0 = Instant::now();
        for _ in 0..20_000 {
            let _ = sock.send_to(&[0xAAu8; 1000], "127.0.0.1:50998");
        }
        let send_ms = t0.elapsed().as_millis();
        std::thread::sleep(Duration::from_millis(500));
        let stats = cap.stop();
        let (mut batches, mut packets, mut largest) = (0, 0, 0);
        for b in rx.try_iter() {
            batches += 1;
            largest = largest.max(b.len());
            packets += decode_batch(&b).expect("well-formed batch").len();
        }
        println!("sent 20000 in {send_ms} ms, captured {packets} in {batches} batches, largest batch {largest} bytes, stats {stats:?}");
        assert!(largest <= FLUSH_BYTES + PACKET_HEADER + 262_144);
        assert!(packets > 0);
    }
}
