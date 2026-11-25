//! Printing straight to a chosen printer, without the system's print dialog (as MyImage2Text).
//!
//! Windows: WebView2 prints the print dialog's own window — its print view is the page drawn
//! in `.print-sheet` (index.html / app.js `_buildPrintSheet`) — silently to a printer by name,
//! or writes the same page to a PDF file. Printers that ask for a file name (Microsoft Print
//! to PDF, the XPS writer) get the PDF route: the page asks where to save first. Other systems
//! have no printer list here, and the page falls back to the system print dialog.
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};

/// What the print dialog asks for. The page size is in millimetres, orientation already applied.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintJob {
    /// Empty: the default printer.
    #[serde(default)]
    pub printer: String,
    #[serde(default = "one")]
    pub copies: i32,
    pub width_mm: f64,
    pub height_mm: f64,
    /// Grayscale on the printer as well as in the page.
    #[serde(default)]
    pub gray: bool,
}

fn one() -> i32 {
    1
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterList {
    pub printers: Vec<String>,
    pub default_printer: String,
    /// Printers that write a file and ask for its name (port PORTPROMPT: or FILE:).
    pub file_printers: Vec<String>,
    /// False where printing straight to a printer is not available (not Windows).
    pub direct: bool,
}

/// Whether a printer port asks for a file name instead of printing (PORTPROMPT:, FILE:).
pub fn is_file_port(port: &str) -> bool {
    port.split(',').any(|p| {
        let p = p.trim().to_ascii_uppercase();
        p == "PORTPROMPT:" || p == "FILE:"
    })
}

const MM_PER_INCH: f64 = 25.4;

/// Inches for WebView2, and the number of copies inside what a printer accepts.
pub fn job_values(job: &PrintJob) -> (f64, f64, i32) {
    (job.width_mm.max(10.0) / MM_PER_INCH, job.height_mm.max(10.0) / MM_PER_INCH, job.copies.clamp(1, 999))
}

/// Only the print dialog's windows may be printed (the label is the page's to choose).
fn print_window(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    if !label.starts_with("dialog-") {
        return Err("not-a-print-window".into());
    }
    app.get_webview_window(label).ok_or_else(|| "no-print-window".to_string())
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::sync::mpsc;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{PrintCompletedHandler, PrintToPdfCompletedHandler};
    use windows::core::{Interface, HSTRING, PCWSTR, PWSTR};
    use windows::Win32::Graphics::Printing::{EnumPrintersW, GetDefaultPrinterW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_5W};

    pub fn printers() -> PrinterList {
        let mut names = Vec::new();
        let mut file_printers = Vec::new();
        unsafe {
            let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
            let (mut needed, mut count) = (0u32, 0u32);
            // Level 5: the name and the port (a port that asks for a file name marks a file printer).
            let _ = EnumPrintersW(flags, PCWSTR::null(), 5, None, &mut needed, &mut count);
            if needed > 0 {
                // A u64 buffer keeps the records aligned.
                let mut buffer = vec![0u64; (needed as usize).div_ceil(8)];
                let bytes = std::slice::from_raw_parts_mut(buffer.as_mut_ptr().cast::<u8>(), needed as usize);
                if EnumPrintersW(flags, PCWSTR::null(), 5, Some(bytes), &mut needed, &mut count).is_ok() {
                    let records = std::slice::from_raw_parts(buffer.as_ptr().cast::<PRINTER_INFO_5W>(), count as usize);
                    for record in records {
                        if let Ok(name) = record.pPrinterName.to_string() {
                            let port = if record.pPortName.is_null() { String::new() } else { record.pPortName.to_string().unwrap_or_default() };
                            if is_file_port(&port) {
                                file_printers.push(name.clone());
                            }
                            names.push(name);
                        }
                    }
                }
            }
            let mut length = 0u32;
            let _ = GetDefaultPrinterW(None, &mut length);
            let mut wide = vec![0u16; length as usize];
            let default_printer = if length > 0 && GetDefaultPrinterW(Some(PWSTR(wide.as_mut_ptr())), &mut length).as_bool() {
                String::from_utf16_lossy(&wide[..(length as usize).saturating_sub(1)])
            } else {
                String::new()
            };
            names.sort_by_key(|name| name.to_lowercase());
            PrinterList { printers: names, default_printer, file_printers, direct: true }
        }
    }

    /// Print settings of one job: the page fills the paper (its margins are drawn in the page).
    unsafe fn settings_of(webview: &tauri::webview::PlatformWebview, job: &PrintJob) -> windows::core::Result<ICoreWebView2PrintSettings> {
        let (width, height, copies) = job_values(job);
        let environment: ICoreWebView2Environment6 = webview.environment().cast()?;
        let settings = environment.CreatePrintSettings()?;
        settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
        settings.SetPageWidth(width)?;
        settings.SetPageHeight(height)?;
        for set in [ICoreWebView2PrintSettings::SetMarginTop, ICoreWebView2PrintSettings::SetMarginBottom, ICoreWebView2PrintSettings::SetMarginLeft, ICoreWebView2PrintSettings::SetMarginRight] {
            set(&settings, 0.0)?;
        }
        settings.SetScaleFactor(1.0)?;
        settings.SetShouldPrintBackgrounds(true)?;
        settings.SetShouldPrintHeaderAndFooter(false)?;
        let more: ICoreWebView2PrintSettings2 = settings.cast()?;
        more.SetCopies(copies)?;
        more.SetColorMode(if job.gray { COREWEBVIEW2_PRINT_COLOR_MODE_GRAYSCALE } else { COREWEBVIEW2_PRINT_COLOR_MODE_COLOR })?;
        if !job.printer.is_empty() {
            more.SetPrinterName(PCWSTR(HSTRING::from(job.printer.as_str()).as_ptr()))?;
        }
        Ok(settings)
    }

    /// Sends the window's print view to the printer. The answer arrives on the window's thread:
    /// this waits on a worker, never on that thread.
    pub async fn print(window: &WebviewWindow, job: PrintJob) -> Result<(), String> {
        let (sender, receiver) = mpsc::channel::<Result<(), String>>();
        let start = sender.clone();
        window
            .with_webview(move |webview| unsafe {
                let begin = (|| -> windows::core::Result<()> {
                    let core: ICoreWebView2_16 = webview.controller().CoreWebView2()?.cast()?;
                    let settings = settings_of(&webview, &job)?;
                    let done = sender.clone();
                    let handler = PrintCompletedHandler::create(Box::new(move |result, status| {
                        let answer = match (result, status) {
                            (Ok(()), COREWEBVIEW2_PRINT_STATUS_SUCCEEDED) => Ok(()),
                            (Ok(()), COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE) => Err("printer-unavailable".to_string()),
                            (Ok(()), _) => Err("print-failed".to_string()),
                            (Err(error), _) => Err(error.to_string()),
                        };
                        let _ = done.send(answer);
                        Ok(())
                    }));
                    core.Print(&settings, &handler)
                })();
                if let Err(error) = begin {
                    let _ = start.send(Err(error.to_string()));
                }
            })
            .map_err(|error| error.to_string())?;
        wait(receiver).await
    }

    /// The same page in a PDF file: for file printers (Print to PDF) and for the tests.
    pub async fn print_to_pdf(window: &WebviewWindow, job: PrintJob, path: String) -> Result<(), String> {
        let (sender, receiver) = mpsc::channel::<Result<(), String>>();
        let start = sender.clone();
        window
            .with_webview(move |webview| unsafe {
                let begin = (|| -> windows::core::Result<()> {
                    let core: ICoreWebView2_7 = webview.controller().CoreWebView2()?.cast()?;
                    let settings = settings_of(&webview, &job)?;
                    let done = sender.clone();
                    let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                        let _ = done.send(match result {
                            Ok(()) if ok => Ok(()),
                            Ok(()) => Err("print-failed".to_string()),
                            Err(error) => Err(error.to_string()),
                        });
                        Ok(())
                    }));
                    core.PrintToPdf(PCWSTR(HSTRING::from(path.as_str()).as_ptr()), &settings, &handler)
                })();
                if let Err(error) = begin {
                    let _ = start.send(Err(error.to_string()));
                }
            })
            .map_err(|error| error.to_string())?;
        wait(receiver).await
    }

    async fn wait(receiver: mpsc::Receiver<Result<(), String>>) -> Result<(), String> {
        tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(std::time::Duration::from_secs(120)))
            .await
            .map_err(|error| error.to_string())?
            .map_err(|_| "no-answer".to_string())?
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;

    pub fn printers() -> PrinterList {
        PrinterList::default()
    }

    pub async fn print(_window: &WebviewWindow, _job: PrintJob) -> Result<(), String> {
        Err("direct-unavailable".to_string())
    }

    pub async fn print_to_pdf(_window: &WebviewWindow, _job: PrintJob, _path: String) -> Result<(), String> {
        Err("direct-unavailable".to_string())
    }
}

/// The printers, the default one, and which of them write files.
#[tauri::command]
pub fn list_printers() -> PrinterList {
    platform::printers()
}

/// Prints the print dialog's page (`.print-sheet`) straight to the printer, without the system dialog.
#[tauri::command]
pub async fn print_direct(app: AppHandle, label: String, job: PrintJob) -> Result<(), String> {
    let window = print_window(&app, &label)?;
    platform::print(&window, job).await
}

/// Writes the same page to a PDF file (file printers such as Microsoft Print to PDF, and tests).
#[tauri::command]
pub async fn print_pdf(app: AppHandle, label: String, job: PrintJob, path: String) -> Result<(), String> {
    let window = print_window(&app, &label)?;
    platform::print_to_pdf(&window, job, path).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a4_landscape_in_inches_and_copies_in_range() {
        let job = PrintJob { printer: String::new(), copies: 5000, width_mm: 297.0, height_mm: 210.0, gray: false };
        let (width, height, copies) = job_values(&job);
        assert!((width - 11.692).abs() < 0.001);
        assert!((height - 8.268).abs() < 0.001);
        assert_eq!(copies, 999);
        assert_eq!(job_values(&PrintJob { copies: 0, ..job }).2, 1);
    }

    #[test]
    fn the_page_sends_camel_case_and_defaults() {
        let job: PrintJob = serde_json::from_str(r#"{"widthMm":210,"heightMm":297}"#).unwrap();
        assert_eq!((job.copies, job.printer.as_str(), job.gray), (1, "", false));
        let named: PrintJob = serde_json::from_str(r#"{"printer":"Office","copies":3,"widthMm":102,"heightMm":152,"gray":true}"#).unwrap();
        assert_eq!((named.printer.as_str(), named.copies, named.gray), ("Office", 3, true));
    }

    #[test]
    fn ports_that_ask_for_a_file_name() {
        assert!(is_file_port("PORTPROMPT:"));
        assert!(is_file_port("file:"));
        assert!(is_file_port("LPT1:, FILE:"));
        assert!(!is_file_port("USB001"));
        assert!(!is_file_port(""));
    }

    #[test]
    fn listing_printers_never_fails() {
        let list = platform::printers();
        assert!(list.file_printers.iter().all(|name| list.printers.contains(name)));
        assert_eq!(list.direct, cfg!(windows));
    }
}
