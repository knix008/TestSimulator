use serde::Deserialize;
use serde::Serialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintOptions {
    device_name: Option<String>,
    copies: Option<f64>,
    paper: Option<String>,
    landscape: Option<bool>,
    width: Option<f64>,
    height: Option<f64>,
    margins: Option<PrintMargins>,
    color: Option<bool>,
}

#[derive(Deserialize)]
struct PrintMargins {
    top: Option<f64>,
    bottom: Option<f64>,
    left: Option<f64>,
    right: Option<f64>,
}

#[derive(Serialize)]
pub struct PrintOutcome {
    pub success: bool,
    #[serde(rename = "failureReason")]
    pub failure_reason: String,
}

#[derive(Serialize)]
pub struct PrinterInfo {
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
}

pub fn list_printers() -> Vec<PrinterInfo> {
    #[cfg(windows)]
    {
        windows_printers()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

pub fn print_page(window: &tauri::WebviewWindow, options: PrintOptions) -> PrintOutcome {
    #[cfg(windows)]
    {
        print_with_settings(window, options)
    }
    #[cfg(not(windows))]
    {
        let _ = options;
        let _ = window.eval("window.print()");
        PrintOutcome {
            success: true,
            failure_reason: String::new(),
        }
    }
}

#[cfg(windows)]
fn windows_printers() -> Vec<PrinterInfo> {
    use windows::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
        PRINTER_INFO_4W,
    };
    use windows::core::PCWSTR;

    let default = default_printer();
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed = 0u32;
    let mut returned = 0u32;
    let _ = unsafe {
        EnumPrintersW(
            flags,
            PCWSTR::null(),
            4,
            None,
            &mut needed,
            &mut returned,
        )
    };
    if needed == 0 {
        return Vec::new();
    }
    let mut buffer = vec![0u8; needed as usize];
    let listed = unsafe {
        EnumPrintersW(
            flags,
            PCWSTR::null(),
            4,
            Some(&mut buffer),
            &mut needed,
            &mut returned,
        )
    };
    if listed.is_err() {
        return Vec::new();
    }
    let infos = unsafe {
        std::slice::from_raw_parts(buffer.as_ptr() as *const PRINTER_INFO_4W, returned as usize)
    };
    let mut printers = Vec::new();
    for info in infos {
        if info.pPrinterName.0.is_null() {
            continue;
        }
        let name = unsafe { info.pPrinterName.to_string() }.unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        printers.push(PrinterInfo {
            is_default: name == default,
            display_name: name.clone(),
            name,
        });
    }
    printers
}

#[cfg(windows)]
fn default_printer() -> String {
    use windows::Win32::Graphics::Printing::GetDefaultPrinterW;
    use windows::core::PWSTR;

    let mut chars = 0u32;
    let _ = unsafe { GetDefaultPrinterW(None, &mut chars) };
    if chars == 0 {
        return String::new();
    }
    let mut buffer = vec![0u16; chars as usize];
    let ok = unsafe { GetDefaultPrinterW(Some(PWSTR(buffer.as_mut_ptr())), &mut chars) };
    if !ok.as_bool() {
        return String::new();
    }
    let end = buffer.iter().position(|unit| *unit == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

#[cfg(windows)]
fn print_with_settings(window: &tauri::WebviewWindow, options: PrintOptions) -> PrintOutcome {
    let (tx, rx) = std::sync::mpsc::channel();
    let started = window.with_webview(move |platform| {
        let tx = tx.clone();
        if let Err(reason) = begin_print(&platform, &options, tx.clone()) {
            let _ = tx.send(PrintOutcome {
                success: false,
                failure_reason: reason,
            });
        }
    });
    if started.is_err() {
        return PrintOutcome {
            success: false,
            failure_reason: "print failed".into(),
        };
    }
    rx.recv_timeout(std::time::Duration::from_secs(180))
        .unwrap_or(PrintOutcome {
            success: false,
            failure_reason: "print failed".into(),
        })
}

#[cfg(windows)]
fn begin_print(
    platform: &tauri::webview::PlatformWebview,
    options: &PrintOptions,
    tx: std::sync::mpsc::Sender<PrintOutcome>,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2PrintSettings2, ICoreWebView2_16,
        COREWEBVIEW2_PRINT_COLOR_MODE_COLOR, COREWEBVIEW2_PRINT_COLOR_MODE_GRAYSCALE,
        COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
        COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE, COREWEBVIEW2_PRINT_STATUS_SUCCEEDED,
    };
    use webview2_com::PrintCompletedHandler;
    use windows::core::{Interface, PCWSTR};

    let core = unsafe { platform.controller().CoreWebView2() }.map_err(|err| err.to_string())?;
    let webview = core
        .cast::<ICoreWebView2_16>()
        .map_err(|err| err.to_string())?;
    let environment = platform
        .environment()
        .cast::<ICoreWebView2Environment6>()
        .map_err(|err| err.to_string())?;
    let settings = unsafe { environment.CreatePrintSettings() }.map_err(|err| err.to_string())?;
    let settings2 = settings
        .cast::<ICoreWebView2PrintSettings2>()
        .map_err(|err| err.to_string())?;

    let (width, height, landscape) = paper_size(options);
    let orientation = if landscape {
        COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE
    } else {
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT
    };
    unsafe {
        settings
            .SetOrientation(orientation)
            .map_err(|err| err.to_string())?;
        settings
            .SetPageWidth(width)
            .map_err(|err| err.to_string())?;
        settings
            .SetPageHeight(height)
            .map_err(|err| err.to_string())?;
        settings
            .SetScaleFactor(1.0)
            .map_err(|err| err.to_string())?;
        settings
            .SetShouldPrintBackgrounds(true)
            .map_err(|err| err.to_string())?;
        settings
            .SetShouldPrintHeaderAndFooter(false)
            .map_err(|err| err.to_string())?;
        settings
            .SetHeaderTitle(PCWSTR::null())
            .map_err(|err| err.to_string())?;
        settings
            .SetFooterUri(PCWSTR::null())
            .map_err(|err| err.to_string())?;
        let margins = options.margins.as_ref();
        settings
            .SetMarginTop(margin_inches(margins.and_then(|side| side.top)))
            .map_err(|err| err.to_string())?;
        settings
            .SetMarginBottom(margin_inches(margins.and_then(|side| side.bottom)))
            .map_err(|err| err.to_string())?;
        settings
            .SetMarginLeft(margin_inches(margins.and_then(|side| side.left)))
            .map_err(|err| err.to_string())?;
        settings
            .SetMarginRight(margin_inches(margins.and_then(|side| side.right)))
            .map_err(|err| err.to_string())?;
        let copies = options
            .copies
            .unwrap_or(1.0)
            .round()
            .clamp(1.0, 99.0) as i32;
        settings2
            .SetCopies(copies)
            .map_err(|err| err.to_string())?;
        let color = if options.color == Some(false) {
            COREWEBVIEW2_PRINT_COLOR_MODE_GRAYSCALE
        } else {
            COREWEBVIEW2_PRINT_COLOR_MODE_COLOR
        };
        settings2
            .SetColorMode(color)
            .map_err(|err| err.to_string())?;
        if let Some(name) = printer_name(options) {
            let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
            settings2
                .SetPrinterName(PCWSTR(wide.as_ptr()))
                .map_err(|err| err.to_string())?;
        }
    }

    let handler = PrintCompletedHandler::create(Box::new(move |error, status| {
        let outcome = if error.is_ok() && status == COREWEBVIEW2_PRINT_STATUS_SUCCEEDED {
            PrintOutcome {
                success: true,
                failure_reason: String::new(),
            }
        } else if status == COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE {
            PrintOutcome {
                success: false,
                failure_reason: "printer unavailable".into(),
            }
        } else {
            PrintOutcome {
                success: false,
                failure_reason: "print failed".into(),
            }
        };
        let _ = tx.send(outcome);
        Ok(())
    }));
    unsafe { webview.Print(&settings2, &handler) }.map_err(|err| err.to_string())
}

#[cfg(windows)]
fn printer_name(options: &PrintOptions) -> Option<String> {
    let requested = options.device_name.as_deref().unwrap_or("").trim();
    if requested.is_empty() {
        return None;
    }
    let known = list_printers().into_iter().any(|printer| printer.name == requested);
    known.then(|| requested.to_string())
}

#[cfg(windows)]
fn paper_size(options: &PrintOptions) -> (f64, f64, bool) {
    let paper = options.paper.as_deref().unwrap_or("");
    let named = match paper {
        "A3" => Some((11.6929133858, 16.5354330709)),
        "A4" => Some((8.2677165354, 11.6929133858)),
        "A5" => Some((5.8267716535, 8.2677165354)),
        "Letter" => Some((8.5, 11.0)),
        "Legal" => Some((8.5, 14.0)),
        _ => None,
    };
    if let Some((width, height)) = named {
        return (width, height, options.landscape.unwrap_or(false));
    }
    let width = options.width.unwrap_or(0.0).round();
    let height = options.height.unwrap_or(0.0).round();
    if (80_000.0..=600_000.0).contains(&width) && (80_000.0..=600_000.0).contains(&height) {
        (width / 25_400.0, height / 25_400.0, false)
    } else {
        (8.2677165354, 11.6929133858, false)
    }
}

#[cfg(windows)]
fn margin_inches(microns: Option<f64>) -> f64 {
    let microns = microns.unwrap_or(0.0).round().clamp(0.0, 40_000.0);
    microns / 25_400.0
}
