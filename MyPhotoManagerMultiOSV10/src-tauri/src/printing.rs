//! Printing without the browser's print preview: the page shows only the
//! prepared sheets (one per paper page), and WebView2 sends them straight to
//! the chosen printer with the chosen settings (Windows). Tests set
//! MYPHOTO_FAKE_PRINT=<file.pdf> to get the same pages as a PDF instead of paper.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Printer {
    pub name: String,
    pub default: bool,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PrintOptions {
    /// "" = the system's default printer.
    pub printer: String,
    pub copies: u32,
    pub landscape: bool,
    /// Paper size in inches.
    pub page_width: f64,
    pub page_height: f64,
    pub color: bool,
    /// "none" | "long" | "short"
    pub duplex: String,
}

/// Installed printers (the default one marked).
#[cfg(windows)]
pub fn printers() -> Vec<Printer> {
    use windows_sys::Win32::Graphics::Printing::{EnumPrintersW, GetDefaultPrinterW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W};
    let text = |ptr: *const u16| -> String {
        if ptr.is_null() {
            return String::new();
        }
        let mut len = 0;
        unsafe {
            while *ptr.add(len) != 0 {
                len += 1;
            }
            String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
        }
    };
    let mut default = String::new();
    unsafe {
        let mut size = 0u32;
        GetDefaultPrinterW(std::ptr::null_mut(), &mut size);
        if size > 0 {
            let mut buffer = vec![0u16; size as usize];
            if GetDefaultPrinterW(buffer.as_mut_ptr(), &mut size) != 0 {
                default = text(buffer.as_ptr());
            }
        }
    }
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed = 0u32;
    let mut count = 0u32;
    unsafe {
        EnumPrintersW(flags, std::ptr::null(), 4, std::ptr::null_mut(), 0, &mut needed, &mut count);
    }
    if needed == 0 {
        return Vec::new();
    }
    let mut buffer = vec![0u8; needed as usize];
    let ok = unsafe { EnumPrintersW(flags, std::ptr::null(), 4, buffer.as_mut_ptr(), needed, &mut needed, &mut count) };
    if ok == 0 {
        return Vec::new();
    }
    let infos = unsafe { std::slice::from_raw_parts(buffer.as_ptr() as *const PRINTER_INFO_4W, count as usize) };
    let mut out: Vec<Printer> = infos.iter().map(|info| text(info.pPrinterName)).filter(|name| !name.is_empty()).map(|name| Printer { default: name == default, name }).collect();
    out.sort_by(|a, b| b.default.cmp(&a.default).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    out
}

#[cfg(not(windows))]
pub fn printers() -> Vec<Printer> {
    Vec::new()
}

/// Prints the window's current page with `options`, without any dialog.
#[cfg(windows)]
pub fn print_direct(window: &tauri::WebviewWindow, options: PrintOptions) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{PrintCompletedHandler, PrintToPdfCompletedHandler};
    use windows_core::{Interface, HSTRING};

    let fake_pdf = std::env::var("MYPHOTO_FAKE_PRINT").ok();
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let tx_outer = tx.clone();
    window
        .with_webview(move |webview| {
            let run = || -> windows_core::Result<()> {
                unsafe {
                    let core = webview.controller().CoreWebView2()?;
                    let environment: ICoreWebView2Environment6 = webview.environment().cast()?;
                    let settings = environment.CreatePrintSettings()?;
                    settings.SetOrientation(if options.landscape { COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE } else { COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT })?;
                    // The sheets are drawn to the paper size with their own margins.
                    let (w, h) = if options.landscape { (options.page_height, options.page_width) } else { (options.page_width, options.page_height) };
                    settings.SetPageWidth(w)?;
                    settings.SetPageHeight(h)?;
                    settings.SetMarginTop(0.0)?;
                    settings.SetMarginBottom(0.0)?;
                    settings.SetMarginLeft(0.0)?;
                    settings.SetMarginRight(0.0)?;
                    settings.SetScaleFactor(1.0)?;
                    settings.SetShouldPrintBackgrounds(true)?;
                    settings.SetShouldPrintHeaderAndFooter(false)?;
                    if let Ok(more) = settings.cast::<ICoreWebView2PrintSettings2>() {
                        more.SetCopies(options.copies.clamp(1, 999) as i32)?;
                        more.SetColorMode(if options.color { COREWEBVIEW2_PRINT_COLOR_MODE_COLOR } else { COREWEBVIEW2_PRINT_COLOR_MODE_GRAYSCALE })?;
                        more.SetDuplex(match options.duplex.as_str() {
                            "long" => COREWEBVIEW2_PRINT_DUPLEX_TWO_SIDED_LONG_EDGE,
                            "short" => COREWEBVIEW2_PRINT_DUPLEX_TWO_SIDED_SHORT_EDGE,
                            _ => COREWEBVIEW2_PRINT_DUPLEX_ONE_SIDED,
                        })?;
                        if !options.printer.is_empty() {
                            more.SetPrinterName(&HSTRING::from(options.printer.as_str()))?;
                        }
                    }
                    let tx = tx.clone();
                    if let Some(path) = &fake_pdf {
                        let core7: ICoreWebView2_7 = core.cast()?;
                        let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                            let _ = tx.send(match (result, ok) {
                                (Ok(()), true) => Ok(()),
                                (Err(error), _) => Err(error.message()),
                                _ => Err("PDF not written".into()),
                            });
                            Ok(())
                        }));
                        core7.PrintToPdf(&HSTRING::from(path.as_str()), &settings, &handler)?;
                    } else {
                        let core16: ICoreWebView2_16 = core.cast()?;
                        let handler = PrintCompletedHandler::create(Box::new(move |result, status| {
                            let _ = tx.send(match result {
                                Err(error) => Err(error.message()),
                                Ok(()) if status == COREWEBVIEW2_PRINT_STATUS_SUCCEEDED => Ok(()),
                                Ok(()) if status == COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE => Err("printer unavailable".into()),
                                Ok(()) => Err("printing failed".into()),
                            });
                            Ok(())
                        }));
                        core16.Print(&settings, &handler)?;
                    }
                }
                Ok(())
            };
            if let Err(error) = run() {
                let _ = tx_outer.send(Err(error.message()));
            }
        })
        .map_err(|error| error.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(600)).map_err(|_| "printing timed out".to_string())?
}

#[cfg(not(windows))]
pub fn print_direct(window: &tauri::WebviewWindow, _options: PrintOptions) -> Result<(), String> {
    window.print().map_err(|error| error.to_string())
}
