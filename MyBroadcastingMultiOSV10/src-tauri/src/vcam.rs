//! The virtual camera device (Windows): other programs (Zoom, Teams, Discord, browsers) see
//! "MyBroadcasting Virtual Camera" in their camera lists. The camera is a DirectShow filter built from
//! native/vcam (softcam, MIT) as resources/vcam/mybroadcasting-vcam.dll. Installing registers it with
//! regsvr32 as administrator (the page asks the user first; Windows shows its UAC prompt). While the
//! camera runs, the page sends JPEG frames of the program; they are decoded here and handed to the DLL.
use serde::Serialize;
use std::path::{Path, PathBuf};

pub const CLSID: &str = "{05C9B2A4-021F-4F3B-9755-D284436FF1DA}";
pub const DLL_NAME: &str = "mybroadcasting-vcam.dll";

#[derive(Serialize, Clone)]
pub struct Status {
    pub supported: bool,
    pub dll: Option<String>,
    pub installed: bool,
    pub registered_path: Option<String>,
    pub running: bool,
}

/// `\\?\C:\…` → `C:\…` (regsvr32 and the registry want the plain form).
pub fn plain(path: &Path) -> String {
    let s = path.to_string_lossy().to_string();
    s.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(s)
}

/// The DLL next to the app (installed: resources), or in the checkout (development).
pub fn dll_path(resource_dir: Option<&Path>) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(dir) = resource_dir {
        candidates.push(dir.join("vcam").join(DLL_NAME));
        candidates.push(dir.join("resources").join("vcam").join(DLL_NAME));
    }
    candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join("vcam").join(DLL_NAME));
    candidates.into_iter().find(|p| p.is_file())
}

/// The registered DLL path ("reg query" of the class id), if any.
#[cfg(windows)]
pub fn registered() -> Option<String> {
    use std::os::windows::process::CommandExt;
    for root in ["HKLM", "HKCU"] {
        let key = format!(r"{root}\SOFTWARE\Classes\CLSID\{CLSID}\InprocServer32");
        let out = std::process::Command::new("reg").args(["query", &key, "/ve"]).creation_flags(0x0800_0000).output().ok()?;
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        if let Some(line) = text.lines().find(|l| l.contains("REG_SZ")) {
            return line.split("REG_SZ").nth(1).map(|p| p.trim().to_string());
        }
    }
    None
}

#[cfg(not(windows))]
pub fn registered() -> Option<String> {
    None
}

#[cfg(windows)]
mod sender {
    use std::ffi::c_void;
    use std::sync::Mutex;
    use windows::core::{PCSTR, PCWSTR, HSTRING};
    use windows::Win32::Foundation::HMODULE;
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    type Create = unsafe extern "C" fn(i32, i32, f32) -> *mut c_void;
    type Delete = unsafe extern "C" fn(*mut c_void);
    type Send = unsafe extern "C" fn(*mut c_void, *const c_void);
    type Connected = unsafe extern "C" fn(*mut c_void) -> bool;

    pub struct Camera {
        _lib: HMODULE,
        handle: *mut c_void,
        delete: Delete,
        send: Send,
        connected: Connected,
        bgr: Vec<u8>,
    }
    unsafe impl std::marker::Send for Camera {}

    pub static CAMERA: Mutex<Option<Camera>> = Mutex::new(None);

    pub fn start(dll: &str, width: u32, height: u32) -> Result<(), String> {
        stop();
        unsafe {
            let lib = LoadLibraryW(PCWSTR(HSTRING::from(dll).as_ptr())).map_err(|e| format!("load {dll}: {e}"))?;
            let get = |name: &[u8]| GetProcAddress(lib, PCSTR(name.as_ptr())).ok_or_else(|| format!("{} missing", String::from_utf8_lossy(&name[..name.len() - 1])));
            let create: Create = std::mem::transmute(get(b"scCreateCamera\0")?);
            let delete: Delete = std::mem::transmute(get(b"scDeleteCamera\0")?);
            let send: Send = std::mem::transmute(get(b"scSendFrame\0")?);
            let connected: Connected = std::mem::transmute(get(b"scIsConnected\0")?);
            // Frame rate 0: each frame goes out when it is sent (the page paces them).
            let handle = create(width as i32, height as i32, 0.0);
            if handle.is_null() {
                return Err("the virtual camera is already in use by another program".into());
            }
            *CAMERA.lock().unwrap() = Some(Camera { _lib: lib, handle, delete, send, connected, bgr: vec![0; (width * height * 3) as usize] });
        }
        Ok(())
    }

    /// One frame: RGB (top-down) of the camera's size → BGR → the camera.
    pub fn frame_rgb(rgb: &[u8]) -> Result<bool, String> {
        let mut guard = CAMERA.lock().unwrap();
        let cam = guard.as_mut().ok_or("not running")?;
        if rgb.len() != cam.bgr.len() {
            return Err(format!("frame of {} bytes, camera wants {}", rgb.len(), cam.bgr.len()));
        }
        for (dst, src) in cam.bgr.chunks_exact_mut(3).zip(rgb.chunks_exact(3)) {
            dst[0] = src[2];
            dst[1] = src[1];
            dst[2] = src[0];
        }
        unsafe {
            (cam.send)(cam.handle, cam.bgr.as_ptr() as *const c_void);
            Ok((cam.connected)(cam.handle))
        }
    }

    pub fn stop() {
        if let Some(cam) = CAMERA.lock().unwrap().take() {
            unsafe { (cam.delete)(cam.handle) };
        }
    }

    pub fn running() -> bool {
        CAMERA.lock().unwrap().is_some()
    }
}

#[cfg(windows)]
pub use sender::{running, start, stop};

#[cfg(not(windows))]
pub fn start(_dll: &str, _w: u32, _h: u32) -> Result<(), String> {
    Err("unsupported".into())
}
#[cfg(not(windows))]
pub fn stop() {}
#[cfg(not(windows))]
pub fn running() -> bool {
    false
}

/// A JPEG frame from the page → RGB of the camera's size → the camera. Returns whether a program watches.
pub fn frame_jpeg(jpeg: &[u8]) -> Result<bool, String> {
    let mut decoder = zune_jpeg::JpegDecoder::new(jpeg);
    let pixels = decoder.decode().map_err(|e| format!("jpeg: {e:?}"))?;
    #[cfg(windows)]
    return sender::frame_rgb(&pixels);
    #[cfg(not(windows))]
    {
        let _ = pixels;
        Err("unsupported".into())
    }
}

/// Registers (or with `remove`, unregisters) the DLL as administrator: Windows asks through its UAC prompt.
/// Err("cancelled") when the user said no there.
#[cfg(windows)]
pub fn register(dll: &str, remove: bool) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let args = if remove { format!("'/u','/s','\"{dll}\"'") } else { format!("'/s','\"{dll}\"'") };
    let script = format!("try {{ $p = Start-Process -FilePath regsvr32.exe -ArgumentList {args} -Verb RunAs -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode }} catch {{ exit 1223 }}");
    let out = std::process::Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", &script]).creation_flags(0x0800_0000).output().map_err(|e| e.to_string())?;
    match out.status.code() {
        Some(0) => Ok(()),
        Some(1223) => Err("cancelled".into()),
        Some(code) => Err(format!("regsvr32 exit {code}")),
        None => Err("regsvr32 did not finish".into()),
    }
}

#[cfg(not(windows))]
pub fn register(_dll: &str, _remove: bool) -> Result<(), String> {
    Err("unsupported".into())
}

pub fn status(resource_dir: Option<&Path>) -> Status {
    let dll = dll_path(resource_dir).map(|p| plain(&p));
    let registered_path = registered();
    let installed = matches!((&dll, &registered_path), (Some(d), Some(r)) if d.eq_ignore_ascii_case(r));
    Status { supported: cfg!(windows), dll, installed, registered_path, running: running() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_and_frames() {
        assert_eq!(plain(Path::new(r"\\?\C:\A\b.dll")), r"C:\A\b.dll");
        assert_eq!(plain(Path::new(r"C:\A\b.dll")), r"C:\A\b.dll");
        // Without a running camera a frame is refused (and a broken JPEG says so).
        assert!(frame_jpeg(b"not a jpeg").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn the_built_dll_exports_the_sender_api() {
        let Some(dll) = dll_path(None) else { return }; // built by npm run build:vcam
        let bytes = std::fs::read(&dll).unwrap();
        for name in ["scCreateCamera", "scSendFrame", "scDeleteCamera", "DllRegisterServer"] {
            assert!(bytes.windows(name.len()).any(|w| w == name.as_bytes()), "{name} in {}", dll.display());
        }
    }
}
