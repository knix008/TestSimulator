// Programs MyShell runs (anything that is not a built-in command) start in a
// pseudo terminal, so they see a terminal and keep their colours, progress
// bars and prompts; through plain pipes most of them turn colour off.
//
// Windows: ConPTY with PSEUDOCONSOLE_INHERIT_CURSOR — the console asks the
// terminal where the cursor is (ESC[6n, which xterm.js answers through the
// shell) and draws from there instead of clearing the screen. The command
// line is passed as built by the Node host (cmd.exe needs `/d /s /c "…"`
// exactly as typed, which no argv quoting gives).
// Elsewhere: openpty via portable-pty.

use std::collections::BTreeMap;
use std::sync::Arc;

pub struct Spec {
    pub file: String,
    pub args: Vec<String>,
    /// Windows only: the full CreateProcess command line.
    pub command_line: String,
    pub cwd: String,
    pub env: BTreeMap<String, String>,
    pub cols: u16,
    pub rows: u16,
}

pub type OnData = Box<dyn Fn(Vec<u8>) + Send + 'static>;
pub type OnExit = Box<dyn FnOnce(i32) + Send + 'static>;

/// How long the output must stay quiet after the program ended before the
/// terminal is closed: the console renders on a timer, the last frame can lag.
const DRAIN_QUIET_MS: u64 = 60;
const DRAIN_MAX_MS: u64 = 600;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn wait_quiet(last_data: &std::sync::atomic::AtomicU64, reader_done: &std::sync::atomic::AtomicBool) {
    use std::sync::atomic::Ordering;
    let start = now_ms();
    loop {
        if reader_done.load(Ordering::SeqCst) {
            return;
        }
        let now = now_ms();
        if now.saturating_sub(last_data.load(Ordering::SeqCst)) >= DRAIN_QUIET_MS || now - start >= DRAIN_MAX_MS {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(15));
    }
}

#[cfg(windows)]
pub use win::Pty;

#[cfg(unix)]
pub use unix::Pty;

pub fn spawn(spec: Spec, on_data: OnData, on_exit: OnExit) -> Result<Arc<Pty>, String> {
    Pty::spawn(spec, on_data, on_exit)
}

#[cfg(windows)]
mod win {
    use super::{now_ms, wait_quiet, OnData, OnExit, Spec};
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{Arc, Mutex};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Storage::FileSystem::{ReadFile, WriteFile};
    use windows_sys::Win32::System::Console::{
        ClosePseudoConsole, CreatePseudoConsole, ResizePseudoConsole, COORD, HPCON, PSEUDOCONSOLE_INHERIT_CURSOR,
    };
    use windows_sys::Win32::System::Pipes::CreatePipe;
    use windows_sys::Win32::System::Threading::{
        CreateProcessW, DeleteProcThreadAttributeList, GetExitCodeProcess, InitializeProcThreadAttributeList,
        TerminateProcess, UpdateProcThreadAttribute, WaitForSingleObject, CREATE_UNICODE_ENVIRONMENT,
        EXTENDED_STARTUPINFO_PRESENT, INFINITE, LPPROC_THREAD_ATTRIBUTE_LIST, PROCESS_INFORMATION,
        PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, STARTF_USESTDHANDLES, STARTUPINFOEXW,
    };

    /// A raw handle that may cross threads (the kernel object is thread-safe).
    #[derive(Clone, Copy)]
    struct Raw(isize);
    unsafe impl Send for Raw {}
    unsafe impl Sync for Raw {}
    impl Raw {
        fn h(self) -> HANDLE {
            self.0 as HANDLE
        }
    }

    pub struct Pty {
        pid: u32,
        process: Raw,
        input: Mutex<Option<Raw>>,
        console: Mutex<Option<HPCON>>,
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// CreateProcess environment block: sorted (case-insensitively) K=V\0 … \0.
    fn env_block(env: &std::collections::BTreeMap<String, String>) -> Vec<u16> {
        let mut pairs: Vec<(&String, &String)> = env.iter().filter(|(k, _)| !k.is_empty() && !k.contains('=')).collect();
        pairs.sort_by(|a, b| a.0.to_uppercase().cmp(&b.0.to_uppercase()));
        let mut out = Vec::new();
        for (k, v) in pairs {
            out.extend(format!("{k}={v}").encode_utf16());
            out.push(0);
        }
        if out.is_empty() {
            out.push(0);
        }
        out.push(0);
        out
    }

    fn last_error(what: &str) -> String {
        format!("{what}: {}", std::io::Error::last_os_error())
    }

    impl Pty {
        pub fn spawn(spec: Spec, on_data: OnData, on_exit: OnExit) -> Result<Arc<Pty>, String> {
            unsafe {
                let mut in_read: HANDLE = std::ptr::null_mut();
                let mut in_write: HANDLE = std::ptr::null_mut();
                let mut out_read: HANDLE = std::ptr::null_mut();
                let mut out_write: HANDLE = std::ptr::null_mut();
                if CreatePipe(&mut in_read, &mut in_write, std::ptr::null(), 0) == 0 {
                    return Err(last_error("CreatePipe"));
                }
                if CreatePipe(&mut out_read, &mut out_write, std::ptr::null(), 0) == 0 {
                    CloseHandle(in_read);
                    CloseHandle(in_write);
                    return Err(last_error("CreatePipe"));
                }
                let size = COORD { X: spec.cols.max(1) as i16, Y: spec.rows.max(1) as i16 };
                let mut hpc: HPCON = 0;
                let hr = CreatePseudoConsole(size, in_read, out_write, PSEUDOCONSOLE_INHERIT_CURSOR, &mut hpc);
                // The console holds its own duplicates now.
                CloseHandle(in_read);
                CloseHandle(out_write);
                if hr < 0 {
                    CloseHandle(in_write);
                    CloseHandle(out_read);
                    return Err(format!("CreatePseudoConsole failed (0x{:08x})", hr as u32));
                }

                let mut attr_size: usize = 0;
                InitializeProcThreadAttributeList(std::ptr::null_mut(), 1, 0, &mut attr_size);
                let mut attr_buf = vec![0u8; attr_size.max(64)];
                let attrs = attr_buf.as_mut_ptr() as LPPROC_THREAD_ATTRIBUTE_LIST;
                let fail = |what: &str| {
                    let e = last_error(what);
                    ClosePseudoConsole(hpc);
                    CloseHandle(in_write);
                    CloseHandle(out_read);
                    e
                };
                if InitializeProcThreadAttributeList(attrs, 1, 0, &mut attr_size) == 0 {
                    return Err(fail("InitializeProcThreadAttributeList"));
                }
                if UpdateProcThreadAttribute(
                    attrs,
                    0,
                    PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE as usize,
                    hpc as *const core::ffi::c_void,
                    std::mem::size_of::<HPCON>(),
                    std::ptr::null_mut(),
                    std::ptr::null(),
                ) == 0
                {
                    DeleteProcThreadAttributeList(attrs);
                    return Err(fail("UpdateProcThreadAttribute"));
                }

                let mut si: STARTUPINFOEXW = std::mem::zeroed();
                si.StartupInfo.cb = std::mem::size_of::<STARTUPINFOEXW>() as u32;
                // No std handles of ours: the program must talk to the pseudo console.
                si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
                si.lpAttributeList = attrs;
                let mut pi: PROCESS_INFORMATION = std::mem::zeroed();
                let line = if spec.command_line.is_empty() {
                    std::iter::once(spec.file.clone()).chain(spec.args.iter().cloned()).collect::<Vec<_>>().join(" ")
                } else {
                    spec.command_line.clone()
                };
                let mut cmdline = wide(&line);
                let cwd = wide(&spec.cwd);
                let env = env_block(&spec.env);
                let ok = CreateProcessW(
                    std::ptr::null(),
                    cmdline.as_mut_ptr(),
                    std::ptr::null(),
                    std::ptr::null(),
                    0,
                    EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT,
                    env.as_ptr() as *const core::ffi::c_void,
                    if spec.cwd.is_empty() { std::ptr::null() } else { cwd.as_ptr() },
                    &si.StartupInfo,
                    &mut pi,
                );
                DeleteProcThreadAttributeList(attrs);
                drop(attr_buf);
                if ok == 0 {
                    return Err(fail(&spec.file));
                }
                CloseHandle(pi.hThread);

                let pty = Arc::new(Pty {
                    pid: pi.dwProcessId,
                    process: Raw(pi.hProcess as isize),
                    input: Mutex::new(Some(Raw(in_write as isize))),
                    console: Mutex::new(Some(hpc)),
                });

                let last_data = Arc::new(AtomicU64::new(now_ms()));
                let reader_done = Arc::new(AtomicBool::new(false));
                let out = Raw(out_read as isize);
                let reader = {
                    let last_data = last_data.clone();
                    let reader_done = reader_done.clone();
                    std::thread::spawn(move || {
                        let mut buf = vec![0u8; 16 * 1024];
                        loop {
                            let mut n: u32 = 0;
                            let ok = ReadFile(out.h(), buf.as_mut_ptr(), buf.len() as u32, &mut n, std::ptr::null_mut());
                            if ok == 0 || n == 0 {
                                break;
                            }
                            last_data.store(now_ms(), Ordering::SeqCst);
                            on_data(buf[..n as usize].to_vec());
                        }
                        CloseHandle(out.h());
                        reader_done.store(true, Ordering::SeqCst);
                    })
                };

                let waiter = pty.clone();
                std::thread::spawn(move || {
                    WaitForSingleObject(waiter.process.h(), INFINITE);
                    let mut code: u32 = 0;
                    GetExitCodeProcess(waiter.process.h(), &mut code);
                    wait_quiet(&last_data, &reader_done);
                    // Closing the console ends its output pipe, so the reader finishes.
                    if let Some(hpc) = waiter.console.lock().unwrap().take() {
                        ClosePseudoConsole(hpc);
                    }
                    let _ = reader.join();
                    if let Some(input) = waiter.input.lock().unwrap().take() {
                        CloseHandle(input.h());
                    }
                    on_exit(code as i32);
                });
                Ok(pty)
            }
        }

        pub fn pid(&self) -> u32 {
            self.pid
        }

        pub fn write(&self, data: &[u8]) {
            let guard = self.input.lock().unwrap();
            let Some(input) = *guard else { return };
            let mut rest = data;
            while !rest.is_empty() {
                let mut n: u32 = 0;
                let ok = unsafe { WriteFile(input.h(), rest.as_ptr(), rest.len() as u32, &mut n, std::ptr::null_mut()) };
                if ok == 0 || n == 0 {
                    break;
                }
                rest = &rest[n as usize..];
            }
        }

        pub fn resize(&self, cols: u16, rows: u16) {
            if let Some(hpc) = *self.console.lock().unwrap() {
                unsafe {
                    ResizePseudoConsole(hpc, COORD { X: cols.max(1) as i16, Y: rows.max(1) as i16 });
                }
            }
        }

        pub fn kill(&self) {
            unsafe {
                TerminateProcess(self.process.h(), 1);
            }
        }
    }

    impl Drop for Pty {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.process.h());
            }
        }
    }
}

#[cfg(unix)]
mod unix {
    use super::{now_ms, wait_quiet, OnData, OnExit, Spec};
    use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
    use std::io::{Read, Write};
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{Arc, Mutex};

    pub struct Pty {
        pid: u32,
        master: Mutex<Option<Box<dyn MasterPty + Send>>>,
        writer: Mutex<Option<Box<dyn Write + Send>>>,
        killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    }

    impl Pty {
        pub fn spawn(spec: Spec, on_data: OnData, on_exit: OnExit) -> Result<Arc<Pty>, String> {
            let err = |e: &dyn std::fmt::Display| e.to_string();
            let pair = native_pty_system()
                .openpty(PtySize { rows: spec.rows.max(1), cols: spec.cols.max(1), pixel_width: 0, pixel_height: 0 })
                .map_err(|e| err(&e))?;
            let mut cmd = CommandBuilder::new(&spec.file);
            cmd.args(&spec.args);
            if !spec.cwd.is_empty() {
                cmd.cwd(&spec.cwd);
            }
            cmd.env_clear();
            for (k, v) in &spec.env {
                cmd.env(k, v);
            }
            let mut child = pair.slave.spawn_command(cmd).map_err(|e| format!("{}: {e}", spec.file))?;
            drop(pair.slave);
            let mut reader = pair.master.try_clone_reader().map_err(|e| err(&e))?;
            let writer = pair.master.take_writer().map_err(|e| err(&e))?;
            let pty = Arc::new(Pty {
                pid: child.process_id().unwrap_or(0),
                master: Mutex::new(Some(pair.master)),
                writer: Mutex::new(Some(writer)),
                killer: Mutex::new(child.clone_killer()),
            });

            let last_data = Arc::new(AtomicU64::new(now_ms()));
            let reader_done = Arc::new(AtomicBool::new(false));
            let reader_thread = {
                let last_data = last_data.clone();
                let reader_done = reader_done.clone();
                std::thread::spawn(move || {
                    let mut buf = vec![0u8; 16 * 1024];
                    loop {
                        match reader.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => {
                                last_data.store(now_ms(), Ordering::SeqCst);
                                on_data(buf[..n].to_vec());
                            }
                        }
                    }
                    reader_done.store(true, Ordering::SeqCst);
                })
            };

            let waiter = pty.clone();
            std::thread::spawn(move || {
                let code = child.wait().map(|s| s.exit_code() as i32).unwrap_or(1);
                wait_quiet(&last_data, &reader_done);
                waiter.writer.lock().unwrap().take();
                // A background grandchild can keep the terminal open; the master goes regardless.
                waiter.master.lock().unwrap().take();
                if reader_done.load(Ordering::SeqCst) {
                    let _ = reader_thread.join();
                }
                on_exit(code);
            });
            Ok(pty)
        }

        pub fn pid(&self) -> u32 {
            self.pid
        }

        pub fn write(&self, data: &[u8]) {
            if let Some(w) = self.writer.lock().unwrap().as_mut() {
                let _ = w.write_all(data);
                let _ = w.flush();
            }
        }

        pub fn resize(&self, cols: u16, rows: u16) {
            if let Some(m) = self.master.lock().unwrap().as_ref() {
                let _ = m.resize(PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 });
            }
        }

        pub fn kill(&self) {
            let _ = self.killer.lock().unwrap().kill();
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::sync::mpsc;

    fn spec(line: &str) -> Spec {
        let env: BTreeMap<String, String> = std::env::vars().collect();
        Spec {
            file: "cmd.exe".into(),
            args: vec![],
            command_line: format!("cmd.exe /d /s /c \"{line}\""),
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            env,
            cols: 80,
            rows: 24,
        }
    }

    /// Answer the console's cursor question the way xterm.js would.
    fn run(line: &str) -> (String, i32) {
        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        let (etx, erx) = mpsc::channel::<i32>();
        let pty = spawn(spec(line), Box::new(move |d| { let _ = tx.send(d); }), Box::new(move |c| { let _ = etx.send(c); })).unwrap();
        let mut out = Vec::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        loop {
            if let Ok(d) = rx.recv_timeout(std::time::Duration::from_millis(50)) {
                if String::from_utf8_lossy(&d).contains("\x1b[6n") {
                    pty.write(b"\x1b[1;1R");
                }
                out.extend(d);
            }
            if let Ok(code) = erx.try_recv() {
                while let Ok(d) = rx.try_recv() {
                    out.extend(d);
                }
                return (String::from_utf8_lossy(&out).to_string(), code);
            }
            assert!(std::time::Instant::now() < deadline, "timed out: {}", String::from_utf8_lossy(&out));
        }
    }

    #[test]
    fn runs_a_cmd_line_and_reports_its_exit_code() {
        let (out, code) = run("echo hello-pty && exit /b 3");
        assert!(out.contains("hello-pty"), "{out:?}");
        assert_eq!(code, 3);
    }

    #[test]
    fn keeps_colour_sequences() {
        // PowerShell writes coloured text through the console: it must arrive as SGR sequences.
        let (out, _) = run("powershell -NoProfile -Command Write-Host -ForegroundColor Red RED-TEXT");
        assert!(out.contains("RED-TEXT"), "{out:?}");
        let red = ["\x1b[31m", "\x1b[91m", "\x1b[38;5;9m", "\x1b[38;5;1m"].iter().any(|sgr| out.contains(&format!("{sgr}RED-TEXT")));
        assert!(red, "no colour in {out:?}");
        // The console asks where the cursor is instead of clearing the screen.
        assert!(out.contains("\x1b[6n") && !out.contains("\x1b[2J"), "{out:?}");
    }
}
