//! So that nothing just dies: whatever ends the page or the program writes what
//! happened to crash.log (with the files it was reading), and the page shows that
//! text in the copyable error window — right after a reload, or at the next start
//! when the program itself went down. A kill or a shutdown writes nothing, so it
//! raises no false alarm.

use crate::tr;
use std::collections::VecDeque;
use std::io::Write;
use std::path::PathBuf;
#[cfg(windows)]
use std::sync::atomic::AtomicBool;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

const KEEP_READS: usize = 6;
const MAX_REPORT: usize = 64 * 1024;

static LOG: OnceLock<PathBuf> = OnceLock::new();
static VERSION: OnceLock<String> = OnceLock::new();
static READS: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

pub fn init(log: PathBuf, version: String) {
    let _ = LOG.set(log);
    let _ = VERSION.set(version);
}

/// Remembers a file being read: the likely culprit when the page runs out of memory.
pub fn note_read(path: &str, size: u64) {
    if let Ok(mut reads) = READS.try_lock() {
        if reads.len() == KEEP_READS {
            reads.pop_front();
        }
        reads.push_back(format!("{path} ({size} bytes)"));
    }
}

/// Readable UTC time without a date library (days to civil date, Howard Hinnant's algorithm).
fn stamp(seconds: u64) -> String {
    let days = (seconds / 86_400) as i64 + 719_468;
    let era = days.div_euclid(146_097);
    let day_of_era = days.rem_euclid(146_097);
    let year_of_era = (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted + 2) / 5 + 1;
    let month = if shifted < 10 { shifted + 3 } else { shifted - 9 };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02} UTC", seconds / 3600 % 24, seconds / 60 % 60, seconds % 60)
}

/// The report text. Must stay safe to call from a crash handler: no waiting on locks.
pub fn report(what: &str, details: &str) -> String {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let version = VERSION.get().map(String::as_str).unwrap_or("");
    let mut text = format!("MyPhotoManager {version} · {} · {}\n{what}\n", stamp(now), std::env::consts::OS);
    if !details.is_empty() {
        text.push_str(details);
        text.push('\n');
    }
    if let Ok(reads) = READS.try_lock() {
        if !reads.is_empty() {
            text.push_str(&tr!("최근에 읽은 파일 (마지막이 가장 최근):\n", "Files read most recently (newest last):\n"));
            for read in reads.iter() {
                text.push_str("  ");
                text.push_str(read);
                text.push('\n');
            }
        }
    }
    text
}

/// Adds a report to crash.log for the page to show.
pub fn write(what: &str, details: &str) {
    let Some(path) = LOG.get() else { return };
    let _ = std::fs::create_dir_all(path.parent().unwrap_or(std::path::Path::new(".")));
    let entry = format!("{}\n", report(what, details));
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(entry.as_bytes());
    }
}

/// What crash.log holds (newest part if it is long) and clears it; the text moves on to
/// crash-history.log so it can still be found after the window is closed.
pub fn take() -> Option<String> {
    let path = LOG.get()?;
    let bytes = std::fs::read(path).ok()?;
    let _ = std::fs::remove_file(path);
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path.with_file_name("crash-history.log")) {
        let _ = file.write_all(&bytes);
    }
    let start = bytes.len().saturating_sub(MAX_REPORT);
    let text = String::from_utf8_lossy(&bytes[start..]).trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// Access violations and the like: a line in the log before Windows ends the program.
#[cfg(windows)]
pub fn catch_native_crashes() {
    use windows_sys::Win32::System::Diagnostics::Debug::{SetUnhandledExceptionFilter, EXCEPTION_POINTERS};
    unsafe extern "system" fn on_crash(info: *const EXCEPTION_POINTERS) -> i32 {
        let (code, address) = unsafe {
            let record = info.as_ref().map(|pointers| pointers.ExceptionRecord).filter(|record| !record.is_null());
            record.map(|record| ((*record).ExceptionCode, (*record).ExceptionAddress as usize)).unwrap_or((0, 0))
        };
        write(&tr!("프로그램이 비정상 종료되었습니다.", "The program crashed."), &format!("Exception 0x{:08X} at 0x{address:X}", code as u32));
        0 // EXCEPTION_CONTINUE_SEARCH: Windows goes on to end the program as usual
    }
    unsafe {
        SetUnhandledExceptionFilter(Some(on_crash));
    }
}

#[cfg(not(windows))]
pub fn catch_native_crashes() {}

/// Tells about the page's process dying or hanging (WebView2), and brings the page back.
#[cfg(windows)]
pub fn watch_webview(window: &tauri::WebviewWindow) {
    use tauri::Manager;
    use webview2_com::ProcessFailedEventHandler;
    let app = window.app_handle().clone();
    let events = app.clone();
    let _ = window.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
            if let Some(args) = args {
                process_failed(&events, &args);
            }
            Ok(())
        }));
        let mut token = 0;
        let _ = core.add_ProcessFailed(&handler, &mut token);
    });
    watch_heartbeat(app);
}

#[cfg(not(windows))]
pub fn watch_webview(_window: &tauri::WebviewWindow) {}

/// The page's last sign of life, in seconds since the program started; 0 = not watching
/// (still loading, or hidden, when the browser slows the page's timers right down).
static LAST_BEAT: AtomicU64 = AtomicU64::new(0);
static STARTED: OnceLock<std::time::Instant> = OnceLock::new();
#[cfg(windows)]
static KILLED_HUNG_PAGE: AtomicBool = AtomicBool::new(false);
#[cfg(windows)]
static ASKING: AtomicBool = AtomicBool::new(false);

fn seconds() -> u64 {
    STARTED.get_or_init(std::time::Instant::now).elapsed().as_secs().max(1)
}

/// Called by the page every few seconds.
pub fn beat(hidden: bool) {
    LAST_BEAT.store(if hidden { 0 } else { seconds() }, Ordering::Relaxed);
}

/// WebView2's own "unresponsive" event only comes when a hung page ignores real input,
/// so the page reports in instead, and silence means its thread is stuck.
#[cfg(windows)]
fn watch_heartbeat(app: tauri::AppHandle) {
    let limit = if std::env::var_os("MYPHOTO_TEST_CRASH").is_some() { 12 } else { 30 };
    std::thread::spawn(move || {
        let mut last_tick = seconds();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let now = seconds();
            // The computer slept (or this thread starved): the silence says nothing about the page.
            if now - last_tick > 6 && LAST_BEAT.load(Ordering::Relaxed) != 0 {
                beat(false);
            }
            last_tick = now;
            let last = LAST_BEAT.load(Ordering::Relaxed);
            if last != 0 && now.saturating_sub(last) > limit {
                beat(false);
                ask_about_hung_page(&app, &format!("no sign of life for {limit} s"));
            }
        }
    });
}

/// It may still be working: only the user can tell whether to give up on it.
#[cfg(windows)]
fn ask_about_hung_page(app: &tauri::AppHandle, details: &str) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    if ASKING.swap(true, Ordering::SeqCst) {
        return;
    }
    let handle = app.clone();
    let what = tr!("화면이 응답하지 않습니다. 다시 불러올까요? (작업 중이던 폴더는 닫힙니다)", "The window is not responding. Reload it? (The folder you are in will close.)");
    let text = report(&what, details);
    let details = details.to_string();
    let finish = move |give_up: bool| {
        ASKING.store(false, Ordering::SeqCst);
        if give_up {
            write(&tr!("화면이 응답하지 않아 다시 불러왔습니다. 작업 중이던 폴더는 닫았습니다.", "The window stopped responding and was reloaded. The folder you were in has been closed."), &details);
            KILLED_HUNG_PAGE.store(true, Ordering::SeqCst);
            end_page_processes(&handle);
        } else {
            beat(false);
        }
    };
    if std::env::var_os("MYPHOTO_TEST_CRASH").is_some() {
        finish(true);
        return;
    }
    let buttons = MessageDialogButtons::OkCancelCustom(tr!("다시 불러오기", "Reload"), tr!("계속 기다리기", "Keep waiting"));
    app.dialog().message(text).title("MyPhotoManager").buttons(buttons).show(finish);
}

/// A page stuck in a loop never gets to a reload, so its process has to end; WebView2 then
/// reports that as any other dead page.
#[cfg(windows)]
fn end_page_processes(app: &tauri::AppHandle) {
    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows_core::Interface;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
    let Some(main) = app.get_webview_window("main") else { return };
    let _ = main.with_webview(|webview| unsafe {
        let Ok(environment) = webview.environment().cast::<ICoreWebView2Environment8>() else { return };
        let Ok(infos) = environment.GetProcessInfos() else { return };
        let mut count = 0;
        let _ = infos.Count(&mut count);
        for index in 0..count {
            let Ok(info) = infos.GetValueAtIndex(index) else { continue };
            let mut kind = COREWEBVIEW2_PROCESS_KIND::default();
            let mut id = 0;
            if info.Kind(&mut kind).is_ok() && kind == COREWEBVIEW2_PROCESS_KIND_RENDERER && info.ProcessId(&mut id).is_ok() {
                let process = OpenProcess(PROCESS_TERMINATE, 0, id as u32);
                if !process.is_null() {
                    TerminateProcess(process, 1);
                    CloseHandle(process);
                }
            }
        }
    });
}

/// Loads the page again, in every window that has one of its own.
#[cfg(windows)]
fn reload(app: &tauri::AppHandle) {
    use tauri::Manager;
    for label in ["main", "guide"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.with_webview(|webview| unsafe {
                if let Ok(core) = webview.controller().CoreWebView2() {
                    let _ = core.Reload();
                }
            });
        }
    }
}

#[cfg(windows)]
fn process_failed(app: &tauri::AppHandle, args: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2ProcessFailedEventArgs) {
    use tauri_plugin_dialog::DialogExt;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows_core::{Interface, PWSTR};

    static LAST_RELOAD: AtomicU64 = AtomicU64::new(0);

    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
    unsafe {
        let _ = args.ProcessFailedKind(&mut kind);
    }
    let mut details = format!("ProcessFailedKind {}", kind.0);
    if let Ok(more) = args.cast::<ICoreWebView2ProcessFailedEventArgs2>() {
        let mut reason = COREWEBVIEW2_PROCESS_FAILED_REASON::default();
        let mut exit_code = 0;
        let mut description = PWSTR::null();
        unsafe {
            let _ = more.Reason(&mut reason);
            let _ = more.ExitCode(&mut exit_code);
            let _ = more.ProcessDescription(&mut description);
        }
        let reason = match reason {
            COREWEBVIEW2_PROCESS_FAILED_REASON_OUT_OF_MEMORY => "out of memory".to_string(),
            COREWEBVIEW2_PROCESS_FAILED_REASON_CRASHED => "crashed".to_string(),
            COREWEBVIEW2_PROCESS_FAILED_REASON_TERMINATED => "terminated".to_string(),
            COREWEBVIEW2_PROCESS_FAILED_REASON_UNRESPONSIVE => "unresponsive".to_string(),
            COREWEBVIEW2_PROCESS_FAILED_REASON_LAUNCH_FAILED => "launch failed".to_string(),
            other => format!("{}", other.0),
        };
        details.push_str(&format!(", reason: {reason}, exit code: {exit_code} (0x{:08X})", exit_code as u32));
        if !description.is_null() {
            details.push_str(&format!(", process: {}", webview2_com::take_pwstr(description)));
        }
    }

    if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED {
        LAST_BEAT.store(0, Ordering::Relaxed); // silent until the new page reports in
        // A page we ended ourselves is already in the log, as a page that hung.
        if !KILLED_HUNG_PAGE.swap(false, Ordering::SeqCst) {
            write(&tr!("화면 프로세스가 죽어 화면을 다시 불러왔습니다. 작업 중이던 폴더는 닫았습니다.", "The page's process died, so the window was reloaded. The folder you were in has been closed."), &details);
        }
        // Never a reload loop: when the page dies again at once the report stays for the next start.
        let now = seconds();
        if now.saturating_sub(LAST_RELOAD.swap(now, Ordering::Relaxed)) >= 5 {
            reload(app);
        }
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE {
        ask_about_hung_page(app, &details);
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED {
        // The whole web engine is gone and no page can show anything: say so here and restart clean.
        let what = tr!("웹 엔진(WebView2)이 종료되어 프로그램을 닫습니다. 다음 실행 때 이 내용을 다시 복사할 수 있습니다.", "The web engine (WebView2) ended, so the program is closing. You can copy this text at the next start.");
        write(&what, &details);
        let handle = app.clone();
        app.dialog().message(report(&what, &details)).title("MyPhotoManager").show(move |_| handle.exit(1));
    }
    // GPU and helper processes restart by themselves.
}

#[cfg(test)]
mod tests {
    use super::stamp;

    #[test]
    fn stamps_are_utc_dates() {
        assert_eq!(stamp(0), "1970-01-01 00:00:00 UTC");
        assert_eq!(stamp(951_782_400), "2000-02-29 00:00:00 UTC");
        assert_eq!(stamp(1_793_874_896), "2026-11-05 10:34:56 UTC");
    }
}
