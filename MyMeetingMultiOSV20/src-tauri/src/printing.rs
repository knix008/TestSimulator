// Printing without the system's dialog: the print window lists the printers, and its Print button
// sends the pages straight to the chosen one (or, for "Save as PDF", to a file). WebView2 can do this
// on Windows. WKWebView and WebKitGTK cannot, so elsewhere the list is empty and the system's dialog
// is what remains.
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintJob {
    printer: Option<String>,
    pdf_path: Option<String>,
    width_mm: f64,
    height_mm: f64,
    copies: i32,
}

/// The installed printers and the default one.
#[tauri::command(async)]
pub fn list_printers() -> Value {
    let (printers, default) = installed();
    json!({ "direct": cfg!(windows), "printers": printers, "default": default })
}

#[tauri::command(async)]
pub fn print_window(window: tauri::WebviewWindow, job: PrintJob) -> Result<(), String> {
    send(&window, job)
}

#[cfg(windows)]
fn installed() -> (Vec<String>, Option<String>) {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Graphics::Printing::{EnumPrintersW, GetDefaultPrinterW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W};
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let (mut needed, mut count) = (0u32, 0u32);
    let mut printers = Vec::new();
    unsafe {
        let _ = EnumPrintersW(flags, PCWSTR::null(), 4, None, &mut needed, &mut count);
        // In u64s: the structures at its start need their alignment.
        let mut buffer = vec![0u64; (needed as usize).div_ceil(8)];
        let bytes = std::slice::from_raw_parts_mut(buffer.as_mut_ptr().cast::<u8>(), needed as usize);
        if needed > 0 && EnumPrintersW(flags, PCWSTR::null(), 4, Some(bytes), &mut needed, &mut count).is_ok() {
            for info in std::slice::from_raw_parts(buffer.as_ptr().cast::<PRINTER_INFO_4W>(), count as usize) {
                if let Ok(name) = info.pPrinterName.to_string() {
                    printers.push(name);
                }
            }
        }
    }
    let mut length = 0u32;
    let default = unsafe {
        let _ = GetDefaultPrinterW(None, &mut length);
        let mut name = vec![0u16; length as usize];
        if length > 0 && GetDefaultPrinterW(Some(PWSTR(name.as_mut_ptr())), &mut length).as_bool() {
            PCWSTR(name.as_ptr()).to_string().ok()
        } else {
            None
        }
    };
    printers.sort_by_key(|name| name.to_lowercase());
    (printers, default)
}

#[cfg(not(windows))]
fn installed() -> (Vec<String>, Option<String>) {
    (Vec::new(), None)
}

#[cfg(windows)]
fn send(window: &tauri::WebviewWindow, job: PrintJob) -> Result<(), String> {
    use std::sync::mpsc;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2PrintSettings2, ICoreWebView2_16, ICoreWebView2_2, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
        COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE, COREWEBVIEW2_PRINT_STATUS_SUCCEEDED,
    };
    use webview2_com::{PrintCompletedHandler, PrintToPdfCompletedHandler};
    use windows::core::{Interface, HSTRING, PCWSTR};

    if job.printer.is_none() && job.pdf_path.is_none() {
        return Err("no printer chosen".into());
    }
    let (done, finished) = mpsc::channel::<Result<(), String>>();
    window
        .with_webview(move |webview| {
            let answer = done.clone();
            let started = (|| unsafe {
                let core = webview.controller().CoreWebView2()?;
                let environment = core.cast::<ICoreWebView2_2>()?.Environment()?.cast::<ICoreWebView2Environment6>()?;
                let settings = environment.CreatePrintSettings()?;
                // The sheet is given portrait, and turned: a printer takes its paper that way.
                let landscape = job.width_mm > job.height_mm;
                let (short, long) = (job.width_mm.min(job.height_mm) / 25.4, job.width_mm.max(job.height_mm) / 25.4);
                settings.SetOrientation(if landscape { COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE } else { COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT })?;
                settings.SetPageWidth(short)?;
                settings.SetPageHeight(long)?;
                settings.SetMarginTop(0.0)?;
                settings.SetMarginBottom(0.0)?;
                settings.SetMarginLeft(0.0)?;
                settings.SetMarginRight(0.0)?;
                settings.SetScaleFactor(1.0)?;
                settings.SetShouldPrintBackgrounds(true)?;
                settings.SetShouldPrintHeaderAndFooter(false)?;
                if let Some(path) = &job.pdf_path {
                    let reply = done.clone();
                    let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, written| {
                        let _ = reply.send(match result {
                            Ok(()) if written => Ok(()),
                            Ok(()) => Err("the PDF was not written".to_string()),
                            Err(error) => Err(error.to_string()),
                        });
                        Ok(())
                    }));
                    let path = HSTRING::from(path.as_str());
                    return core.cast::<ICoreWebView2_7>()?.PrintToPdf(PCWSTR(path.as_ptr()), &settings, &handler);
                }
                let printer = HSTRING::from(job.printer.as_deref().unwrap_or_default());
                let named = settings.cast::<ICoreWebView2PrintSettings2>()?;
                named.SetPrinterName(PCWSTR(printer.as_ptr()))?;
                named.SetCopies(job.copies.clamp(1, 99))?;
                let reply = done.clone();
                let handler = PrintCompletedHandler::create(Box::new(move |result, status| {
                    let _ = reply.send(match result {
                        Ok(()) if status == COREWEBVIEW2_PRINT_STATUS_SUCCEEDED => Ok(()),
                        Ok(()) if status == COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE => Err("printer-unavailable".to_string()),
                        Ok(()) => Err(format!("print status {}", status.0)),
                        Err(error) => Err(error.to_string()),
                    });
                    Ok(())
                }));
                core.cast::<ICoreWebView2_16>()?.Print(&settings, &handler)
            })();
            if let Err(error) = started {
                let _ = answer.send(Err(error.to_string()));
            }
        })
        .map_err(|e| e.to_string())?;
    finished.recv_timeout(std::time::Duration::from_secs(300)).map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
fn send(window: &tauri::WebviewWindow, _job: PrintJob) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}
