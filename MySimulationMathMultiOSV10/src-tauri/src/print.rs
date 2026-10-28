// Printing for the print dialog (src/print/): the printer list, a PDF of a
// print document and a silent print of it on a chosen printer.
//
// The page receives a finished print document: HTML whose sheets are already
// laid out at paper size (@page size, margin 0 - see src/print/printdoc.js).
// It is written to a temp file and opened in one hidden webview window
// ("print-host"); then
//   print_pdf  -> ICoreWebView2_7::PrintToPdf  (the PDF bytes, page count)
//   print_html -> ICoreWebView2_16::Print with ICoreWebView2PrintSettings2
//                (printer, copies, colour, duplex, collation), no dialog.
// The paper size goes to the print settings too (margins 0, scale 1, no
// browser header / footer), so the settings and the document's @page agree.
// Windows only (WebView2); elsewhere print_info says silent: false and the
// page prints through the webview's own print dialog.
use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    name: String,
    is_default: bool,
    /// The printer writes a file (PDF / XPS writers, OneNote, fax, FILE: or PORTPROMPT:
    /// ports): its driver would open the OS "save print output as" dialog, so the
    /// page saves a PDF through its own save dialog instead (print_pdf).
    file_output: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintInfo {
    printers: Vec<PrinterInfo>,
    /// print_html prints without a dialog.
    silent: bool,
    /// print_pdf works.
    pdf: bool,
}

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PrintJob {
    /// The finished print document.
    html: String,
    /// The sheet as laid out, in mm (landscape sheets are wider than tall).
    width_mm: f64,
    height_mm: f64,
    printer: Option<String>,
    copies: Option<i32>,
    /// false = grayscale.
    color: Option<bool>,
    /// "long" | "short" (two-sided), anything else one-sided.
    duplex: Option<String>,
    collate: Option<bool>,
    /// print_pdf: write the PDF here (the bytes are not sent back then).
    output: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfResult {
    /// base64 (empty when written to `output`).
    pdf: String,
    pages: u32,
    bytes: u64,
    path: String,
}

#[tauri::command]
pub async fn print_info() -> PrintInfo {
    let printers = tauri::async_runtime::spawn_blocking(list_printers).await.unwrap_or_default();
    PrintInfo { printers, silent: cfg!(windows), pdf: cfg!(windows) }
}

#[tauri::command]
pub async fn print_pdf(app: tauri::AppHandle, job: PrintJob) -> Result<PdfResult, String> {
    tauri::async_runtime::spawn_blocking(move || imp::pdf(&app, job)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn print_html(app: tauri::AppHandle, job: PrintJob) -> Result<String, String> {
    // Never a silent job to a file printer: its legacy save dialog would pop up.
    let target = job.printer.clone().unwrap_or_default();
    let printers = tauri::async_runtime::spawn_blocking(list_printers).await.unwrap_or_default();
    let file_printer = printers.iter().find(|p| if target.is_empty() { p.is_default } else { p.name == target }).map(|p| p.file_output).unwrap_or(false);
    if file_printer || is_file_printer(&target, "") {
        return Err("file-printer".into());
    }
    tauri::async_runtime::spawn_blocking(move || imp::print(&app, job)).await.map_err(|e| e.to_string())?
}

/// Closes the hidden print window (the main window is going away).
pub fn close_host(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window(HOST_LABEL) {
        let _ = w.destroy();
    }
}

const HOST_LABEL: &str = "print-host";

/// True for printers that write a file instead of paper (by port or by name).
pub fn is_file_printer(name: &str, port: &str) -> bool {
    let port = port.trim().to_ascii_uppercase();
    let name = name.to_ascii_lowercase();
    port == "FILE:" || port == "PORTPROMPT:" || port.starts_with("SHRFAX") || port.contains("ONENOTE") || port.ends_with(".PDF") || port.ends_with(".XPS")
        || name.contains("print to pdf") || name.contains("xps document writer") || name.contains("onenote") || name == "fax" || name.contains(" pdf") || name.ends_with("pdf")
}

/// Pages of a PDF: the largest /Count of the page tree (Chromium writes it
/// uncompressed), else the number of /Type /Page objects.
pub fn pdf_page_count(bytes: &[u8]) -> u32 {
    let mut best = 0u32;
    let key = b"/Count";
    let mut i = 0;
    while i + key.len() < bytes.len() {
        if &bytes[i..i + key.len()] == key {
            let mut j = i + key.len();
            while j < bytes.len() && bytes[j] == b' ' {
                j += 1;
            }
            let mut n = 0u32;
            let mut any = false;
            while j < bytes.len() && bytes[j].is_ascii_digit() {
                n = n.saturating_mul(10).saturating_add((bytes[j] - b'0') as u32);
                j += 1;
                any = true;
            }
            if any {
                best = best.max(n);
            }
            i = j;
        } else {
            i += 1;
        }
    }
    if best > 0 {
        return best;
    }
    let key = b"/Type /Page";
    let mut n = 0;
    let mut i = 0;
    while i + key.len() < bytes.len() {
        if &bytes[i..i + key.len()] == key && bytes[i + key.len()] != b's' {
            n += 1;
        }
        i += 1;
    }
    n
}

// -- Printer list --
#[cfg(windows)]
fn list_printers() -> Vec<PrinterInfo> {
    use windows::core::PWSTR;
    use windows::Win32::Graphics::Printing::{EnumPrintersW, GetDefaultPrinterW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W};
    let default = unsafe {
        let mut len = 0u32;
        let _ = GetDefaultPrinterW(None, &mut len);
        if len == 0 {
            String::new()
        } else {
            let mut buf = vec![0u16; len as usize];
            if GetDefaultPrinterW(Some(PWSTR(buf.as_mut_ptr())), &mut len).as_bool() {
                String::from_utf16_lossy(&buf[..buf.iter().position(|&c| c == 0).unwrap_or(buf.len())])
            } else {
                String::new()
            }
        }
    };
    let mut out = Vec::new();
    unsafe {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let (mut needed, mut count) = (0u32, 0u32);
        let _ = EnumPrintersW(flags, None, 2, None, &mut needed, &mut count);
        if needed == 0 {
            return out;
        }
        // u64 storage: PRINTER_INFO_2W holds pointers (8-byte alignment).
        let mut store = vec![0u64; (needed as usize).div_ceil(8)];
        let buf = std::slice::from_raw_parts_mut(store.as_mut_ptr() as *mut u8, store.len() * 8);
        if EnumPrintersW(flags, None, 2, Some(buf), &mut needed, &mut count).is_err() {
            return out;
        }
        let items = std::slice::from_raw_parts(store.as_ptr() as *const PRINTER_INFO_2W, count as usize);
        for it in items {
            if it.pPrinterName.is_null() {
                continue;
            }
            let name = it.pPrinterName.to_string().unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            let port = if it.pPortName.is_null() { String::new() } else { it.pPortName.to_string().unwrap_or_default() };
            out.push(PrinterInfo { is_default: name == default, file_output: is_file_printer(&name, &port), name });
        }
    }
    out
}

#[cfg(not(windows))]
fn list_printers() -> Vec<PrinterInfo> {
    // `lpstat -p -d`: "printer NAME is idle..." lines and "system default destination: NAME".
    let Ok(out) = std::process::Command::new("lpstat").args(["-p", "-d"]).output() else { return Vec::new() };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut default = String::new();
    let mut names = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("printer ") {
            if let Some(name) = rest.split_whitespace().next() {
                names.push(name.to_string());
            }
        } else if let Some((_, d)) = line.split_once("default destination:") {
            default = d.trim().to_string();
        }
    }
    names.into_iter().map(|name| PrinterInfo { is_default: name == default, file_output: is_file_printer(&name, ""), name }).collect()
}

// -- WebView2 (Windows) --
#[cfg(windows)]
mod imp {
    use super::{pdf_page_count, PdfResult, PrintJob, HOST_LABEL};
    use base64::Engine;
    use std::path::PathBuf;
    use std::sync::mpsc::{channel, Sender};
    use std::sync::Mutex;
    use std::time::Duration;
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{NavigationCompletedEventHandler, PrintCompletedHandler, PrintToPdfCompletedHandler};
    use windows::core::{Interface, BOOL, HSTRING};

    /// One job at a time (one hidden window, one document).
    static JOB: Mutex<()> = Mutex::new(());
    /// Where the hidden window's NavigationCompleted goes (the current job).
    static NAV: Mutex<Option<Sender<Result<(), String>>>> = Mutex::new(None);

    fn work_dir() -> PathBuf {
        let d = std::env::temp_dir().join("MySimulationMath-print");
        let _ = std::fs::create_dir_all(&d);
        d
    }

    fn host(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
        if let Some(w) = app.get_webview_window(HOST_LABEL) {
            return Ok(w);
        }
        let blank = work_dir().join("blank.html");
        std::fs::write(&blank, "<!doctype html><title>print</title>").map_err(|e| e.to_string())?;
        let url = tauri::Url::from_file_path(&blank).map_err(|_| "bad temp path".to_string())?;
        let mut b = WebviewWindowBuilder::new(app, HOST_LABEL, WebviewUrl::External(url))
            .title("MySimulationMath print")
            .inner_size(820.0, 1100.0)
            .visible(false)
            .focused(false)
            .skip_taskbar(true)
            .decorations(false);
        if let Some(dir) = crate::webview_data_dir(app) {
            b = b.data_directory(dir);
        }
        if let Some(main) = app.get_webview_window("main") {
            // Owned by the main window: it goes when the main window goes.
            b = b.parent(&main).map_err(|e| e.to_string())?;
        }
        let win = b.build().map_err(|e| e.to_string())?;
        // One NavigationCompleted handler for the window's life; each job sets NAV.
        let (tx, rx) = channel::<Result<(), String>>();
        win.with_webview(move |pw| unsafe {
            let r = (|| -> windows::core::Result<()> {
                let core = pw.controller().CoreWebView2()?;
                let handler = NavigationCompletedEventHandler::create(Box::new(|_, args| {
                    let mut ok = BOOL(0);
                    let mut status = COREWEBVIEW2_WEB_ERROR_STATUS(0);
                    if let Some(a) = args {
                        let _ = a.IsSuccess(&mut ok);
                        let _ = a.WebErrorStatus(&mut status);
                    }
                    // A navigation replaced by the next one (the window's first page while the
                    // job's document is already on its way) is not the job's answer.
                    if !ok.as_bool() && status == COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED {
                        return Ok(());
                    }
                    if let Ok(mut slot) = NAV.lock() {
                        if let Some(tx) = slot.take() {
                            let _ = tx.send(if ok.as_bool() { Ok(()) } else { Err(format!("the print document did not load (status {})", status.0)) });
                        }
                    }
                    Ok(())
                }));
                let mut token = 0i64;
                core.add_NavigationCompleted(&handler, &mut token)?;
                Ok(())
            })();
            let _ = tx.send(r.map_err(|e| e.message()));
        })
        .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(20)).map_err(|_| "the print window did not start".to_string())??;
        Ok(win)
    }

    /// Writes the document and loads it in the hidden window (a second try when
    /// the first load of a new window is cut off by the window's own start page).
    fn load(app: &tauri::AppHandle, job: &PrintJob) -> Result<tauri::WebviewWindow, String> {
        match load_once(app, job) {
            Ok(w) => Ok(w),
            Err(_) => {
                std::thread::sleep(Duration::from_millis(300));
                load_once(app, job)
            }
        }
    }

    fn load_once(app: &tauri::AppHandle, job: &PrintJob) -> Result<tauri::WebviewWindow, String> {
        let win = host(app)?;
        let file = work_dir().join("document.html");
        std::fs::write(&file, job.html.as_bytes()).map_err(|e| e.to_string())?;
        let mut url = tauri::Url::from_file_path(&file).map_err(|_| "bad temp path".to_string())?;
        // A new query each time: the same URL would not navigate again.
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        url.set_query(Some(&format!("t={stamp}")));
        let (tx, rx) = channel::<Result<(), String>>();
        *NAV.lock().map_err(|e| e.to_string())? = Some(tx.clone());
        let target = url.to_string();
        win.with_webview(move |pw| unsafe {
            let r = pw.controller().CoreWebView2().and_then(|core| core.Navigate(&HSTRING::from(target.as_str())));
            if let Err(e) = r {
                if let Ok(mut slot) = NAV.lock() {
                    slot.take();
                }
                let _ = tx.send(Err(e.message()));
            }
        })
        .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(60)).map_err(|_| "the print document took too long to load".to_string())??;
        // Layout of the last images / fonts after the load event.
        std::thread::sleep(Duration::from_millis(150));
        Ok(win)
    }

    /// Print settings for the sheet: paper size (portrait numbers + orientation), margins 0, scale 1,
    /// backgrounds on, no browser header / footer; for a printer also its name, copies, colour, duplex.
    unsafe fn settings(core: &ICoreWebView2, job: &PrintJob, for_printer: bool) -> windows::core::Result<ICoreWebView2PrintSettings> {
        let env = core.cast::<ICoreWebView2_2>()?.Environment()?.cast::<ICoreWebView2Environment6>()?;
        let s = env.CreatePrintSettings()?;
        let (w, h) = (job.width_mm.max(10.0) / 25.4, job.height_mm.max(10.0) / 25.4);
        let landscape = w > h;
        s.SetOrientation(if landscape { COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE } else { COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT })?;
        s.SetPageWidth(w.min(h))?;
        s.SetPageHeight(w.max(h))?;
        s.SetMarginTop(0.0)?;
        s.SetMarginBottom(0.0)?;
        s.SetMarginLeft(0.0)?;
        s.SetMarginRight(0.0)?;
        s.SetScaleFactor(1.0)?;
        s.SetShouldPrintBackgrounds(true)?;
        s.SetShouldPrintHeaderAndFooter(false)?;
        s.SetShouldPrintSelectionOnly(false)?;
        if let Ok(s2) = s.cast::<ICoreWebView2PrintSettings2>() {
            s2.SetMediaSize(COREWEBVIEW2_PRINT_MEDIA_SIZE_CUSTOM)?;
            s2.SetPagesPerSide(1)?;
            if for_printer {
                if let Some(name) = job.printer.as_deref().filter(|n| !n.is_empty()) {
                    s2.SetPrinterName(&HSTRING::from(name))?;
                }
                s2.SetCopies(job.copies.unwrap_or(1).clamp(1, 999))?;
                s2.SetColorMode(if job.color == Some(false) { COREWEBVIEW2_PRINT_COLOR_MODE_GRAYSCALE } else { COREWEBVIEW2_PRINT_COLOR_MODE_COLOR })?;
                s2.SetDuplex(match job.duplex.as_deref() {
                    Some("long") => COREWEBVIEW2_PRINT_DUPLEX_TWO_SIDED_LONG_EDGE,
                    Some("short") => COREWEBVIEW2_PRINT_DUPLEX_TWO_SIDED_SHORT_EDGE,
                    _ => COREWEBVIEW2_PRINT_DUPLEX_ONE_SIDED,
                })?;
                s2.SetCollation(if job.collate == Some(false) { COREWEBVIEW2_PRINT_COLLATION_UNCOLLATED } else { COREWEBVIEW2_PRINT_COLLATION_COLLATED })?;
            }
        }
        Ok(s)
    }

    pub fn pdf(app: &tauri::AppHandle, job: PrintJob) -> Result<PdfResult, String> {
        let _guard = JOB.lock().map_err(|e| e.to_string())?;
        let win = load(app, &job)?;
        let to_file = job.output.clone().filter(|p| !p.is_empty());
        let path = to_file.clone().map(PathBuf::from).unwrap_or_else(|| work_dir().join("preview.pdf"));
        let _ = std::fs::remove_file(&path);
        let (tx, rx) = channel::<Result<(), String>>();
        let target = path.to_string_lossy().into_owned();
        let job2 = job.clone();
        win.with_webview(move |pw| unsafe {
            let tx2 = tx.clone();
            let r = (|| -> windows::core::Result<()> {
                let core = pw.controller().CoreWebView2()?;
                let s = settings(&core, &job2, false)?;
                let handler = PrintToPdfCompletedHandler::create(Box::new(move |hr, ok| {
                    let _ = tx2.send(match hr {
                        Err(e) => Err(e.message()),
                        Ok(()) if !ok => Err("PrintToPdf failed".into()),
                        Ok(()) => Ok(()),
                    });
                    Ok(())
                }));
                core.cast::<ICoreWebView2_7>()?.PrintToPdf(&HSTRING::from(target.as_str()), &s, &handler)
            })();
            if let Err(e) = r {
                let _ = tx.send(Err(e.message()));
            }
        })
        .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(120)).map_err(|_| "the PDF took too long".to_string())??;
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let pages = pdf_page_count(&bytes);
        let pdf = if to_file.is_some() { String::new() } else { base64::engine::general_purpose::STANDARD.encode(&bytes) };
        Ok(PdfResult { pdf, pages, bytes: bytes.len() as u64, path: crate::host::slash(&path) })
    }

    pub fn print(app: &tauri::AppHandle, job: PrintJob) -> Result<String, String> {
        let _guard = JOB.lock().map_err(|e| e.to_string())?;
        let win = load(app, &job)?;
        let (tx, rx) = channel::<Result<String, String>>();
        let job2 = job.clone();
        win.with_webview(move |pw| unsafe {
            let tx2 = tx.clone();
            let r = (|| -> windows::core::Result<()> {
                let core = pw.controller().CoreWebView2()?;
                let s = settings(&core, &job2, true)?;
                let handler = PrintCompletedHandler::create(Box::new(move |hr, status| {
                    let _ = tx2.send(match hr {
                        Err(e) => Err(e.message()),
                        Ok(()) if status == COREWEBVIEW2_PRINT_STATUS_SUCCEEDED => Ok("printed".into()),
                        Ok(()) if status == COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE => Err("printer-unavailable".into()),
                        Ok(()) => Err(format!("print failed (status {})", status.0)),
                    });
                    Ok(())
                }));
                core.cast::<ICoreWebView2_16>()?.Print(&s, &handler)
            })();
            if let Err(e) = r {
                let _ = tx.send(Err(e.message()));
            }
        })
        .map_err(|e| e.to_string())?;
        // A driver may ask for a file name (PDF printers); give it time.
        rx.recv_timeout(Duration::from_secs(600)).map_err(|_| "the printer did not answer".to_string())?
    }
}

#[cfg(not(windows))]
mod imp {
    use super::{PdfResult, PrintJob};
    pub fn pdf(_app: &tauri::AppHandle, _job: PrintJob) -> Result<PdfResult, String> {
        Err("unsupported".into())
    }
    pub fn print(_app: &tauri::AppHandle, _job: PrintJob) -> Result<String, String> {
        Err("unsupported".into())
    }
}
