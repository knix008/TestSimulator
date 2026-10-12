// Printing a dialog's own page with the settings chosen in the app.
//
// The print dialog lays the sheets out itself (and shows them as the
// preview), so its webview prints exactly that page through WebView2's Print
// / PrintToPdf APIs — no second system print dialog.

use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintOptions {
    /// Printer name; empty for the system default.
    #[serde(default)]
    pub printer: String,
    pub copies: u32,
    /// The sheet as laid out (a landscape sheet is wider than tall).
    pub width_mm: f64,
    pub height_mm: f64,
    pub grayscale: bool,
    /// "one", "long" or "short" (edge to flip on).
    #[serde(default)]
    pub duplex: String,
    /// Writes a PDF here instead of printing.
    pub pdf_path: Option<String>,
}

#[cfg(windows)]
pub fn list_printers() -> Value {
    use windows::Win32::Graphics::Printing::{EnumPrintersW, GetDefaultPrinterW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W};
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut names = Vec::new();
    unsafe {
        let (mut needed, mut count) = (0u32, 0u32);
        let _ = EnumPrintersW(flags, None, 4, None, &mut needed, &mut count);
        if needed > 0 {
            // u64 storage keeps the PRINTER_INFO_4W records aligned.
            let mut buf = vec![0u64; (needed as usize).div_ceil(8)];
            let bytes = std::slice::from_raw_parts_mut(buf.as_mut_ptr() as *mut u8, needed as usize);
            if EnumPrintersW(flags, None, 4, Some(bytes), &mut needed, &mut count).is_ok() {
                let infos = std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_4W, count as usize);
                names.extend(infos.iter().filter_map(|i| i.pPrinterName.to_string().ok()));
            }
        }
    }
    let default = unsafe {
        let mut len = 0u32;
        let _ = GetDefaultPrinterW(None, &mut len);
        let mut buf = vec![0u16; len.max(1) as usize];
        if GetDefaultPrinterW(Some(windows::core::PWSTR(buf.as_mut_ptr())), &mut len).as_bool() {
            String::from_utf16_lossy(&buf[..len.saturating_sub(1) as usize])
        } else {
            String::new()
        }
    };
    json!({ "printers": names, "default": default, "direct": true })
}

#[cfg(not(windows))]
pub fn list_printers() -> Value {
    json!({ "printers": [], "default": "", "direct": false })
}

#[cfg(windows)]
pub fn print(webview: &tauri::Webview, opts: PrintOptions) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let fail = tx.clone();
    webview
        .with_webview(move |pw| {
            if let Err(e) = unsafe { start(pw.controller(), &opts, tx) } {
                let _ = fail.send(Err(e));
            }
        })
        .map_err(|e| e.to_string())?;
    // A printer driver can take a while to spool; the dialog shows progress meanwhile.
    rx.recv_timeout(std::time::Duration::from_secs(600)).map_err(|_| "Printing did not finish.".to_string())?
}

#[cfg(windows)]
unsafe fn start(
    controller: webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
    opts: &PrintOptions,
    tx: std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{PrintCompletedHandler, PrintToPdfCompletedHandler};
    use windows_core::{Interface, HSTRING};
    let err = |e: windows_core::Error| e.message().to_string();

    let core = controller.CoreWebView2().map_err(err)?;
    let env = core.cast::<ICoreWebView2_2>().map_err(err)?.Environment().map_err(err)?;
    let env = env.cast::<ICoreWebView2Environment6>().map_err(|_| "This WebView2 runtime cannot print directly.".to_string())?;
    let settings = env.CreatePrintSettings().map_err(err)?;

    // WebView2 takes the paper upright plus an orientation.
    let landscape = opts.width_mm > opts.height_mm;
    let (short, long) = if landscape { (opts.height_mm, opts.width_mm) } else { (opts.width_mm, opts.height_mm) };
    settings
        .SetOrientation(if landscape { COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE } else { COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT })
        .map_err(err)?;
    settings.SetPageWidth(short / 25.4).map_err(err)?;
    settings.SetPageHeight(long / 25.4).map_err(err)?;
    // The page draws its own margins.
    settings.SetMarginTop(0.0).map_err(err)?;
    settings.SetMarginBottom(0.0).map_err(err)?;
    settings.SetMarginLeft(0.0).map_err(err)?;
    settings.SetMarginRight(0.0).map_err(err)?;
    settings.SetScaleFactor(1.0).map_err(err)?;
    settings.SetShouldPrintBackgrounds(true).map_err(err)?;
    settings.SetShouldPrintHeaderAndFooter(false).map_err(err)?;

    if let Ok(more) = settings.cast::<ICoreWebView2PrintSettings2>() {
        more.SetMediaSize(COREWEBVIEW2_PRINT_MEDIA_SIZE_CUSTOM).map_err(err)?;
        more.SetCopies(opts.copies.clamp(1, 999) as i32).map_err(err)?;
        more.SetColorMode(if opts.grayscale { COREWEBVIEW2_PRINT_COLOR_MODE_GRAYSCALE } else { COREWEBVIEW2_PRINT_COLOR_MODE_COLOR }).map_err(err)?;
        let duplex = match opts.duplex.as_str() {
            "long" => COREWEBVIEW2_PRINT_DUPLEX_TWO_SIDED_LONG_EDGE,
            "short" => COREWEBVIEW2_PRINT_DUPLEX_TWO_SIDED_SHORT_EDGE,
            _ => COREWEBVIEW2_PRINT_DUPLEX_ONE_SIDED,
        };
        more.SetDuplex(duplex).map_err(err)?;
        if !opts.printer.is_empty() && opts.pdf_path.is_none() {
            more.SetPrinterName(&HSTRING::from(opts.printer.as_str())).map_err(err)?;
        }
    }

    if let Some(path) = &opts.pdf_path {
        let core7 = core.cast::<ICoreWebView2_7>().map_err(err)?;
        let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
            let _ = tx.send(match result {
                Err(e) => Err(e.message().to_string()),
                Ok(()) if !ok => Err("The PDF could not be written.".into()),
                Ok(()) => Ok(()),
            });
            Ok(())
        }));
        core7.PrintToPdf(&HSTRING::from(path.as_str()), &settings, &handler).map_err(err)?;
    } else {
        let core16 = core.cast::<ICoreWebView2_16>().map_err(|_| "This WebView2 runtime cannot print directly.".to_string())?;
        let handler = PrintCompletedHandler::create(Box::new(move |result, status| {
            let _ = tx.send(match result {
                Err(e) => Err(e.message().to_string()),
                Ok(()) if status == COREWEBVIEW2_PRINT_STATUS_SUCCEEDED => Ok(()),
                Ok(()) if status == COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE => Err("The printer is not available.".into()),
                Ok(()) => Err("Printing failed.".into()),
            });
            Ok(())
        }));
        core16.Print(&settings, &handler).map_err(err)?;
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn print(_webview: &tauri::Webview, _opts: PrintOptions) -> Result<(), String> {
    Err("unsupported".into())
}
