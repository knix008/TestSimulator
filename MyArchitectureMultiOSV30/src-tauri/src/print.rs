// Printing. The page lays out its .print-area sheets itself; here WebView2
// prints the window's print view either straight into a PDF file (Save as
// PDF) or straight to the printer chosen in the page's own print window
// (no second system dialog). The printer list comes from the spooler.
// Windows only; the macOS and Linux webviews have no equivalent, so there the
// page opens the system print dialog and writes PDFs itself (io/pdfwrite.js).

use serde::Deserialize;
#[cfg(windows)]
use std::path::Path;

/// Paper (portrait width × height, inches) for the names the print window uses.
pub fn paper_inches(name: &str) -> (f64, f64) {
  let mm = match name {
    "A0" => (841.0, 1189.0),
    "A1" => (594.0, 841.0),
    "A2" => (420.0, 594.0),
    "A3" => (297.0, 420.0),
    "A5" => (148.0, 210.0),
    "Letter" => (215.9, 279.4),
    "Legal" => (215.9, 355.6),
    "Tabloid" => (279.4, 431.8),
    _ => (210.0, 297.0),
  };
  (mm.0 / 25.4, mm.1 / 25.4)
}

/// The paper as the page names it: "A4", { width, height } in inches (Save as
/// PDF) or { width, height } in microns (printing, as Electron took it).
#[derive(Deserialize, Clone, Debug)]
#[serde(untagged)]
pub enum PageSize {
  Named(String),
  Size { width: f64, height: f64 },
}

/// Width × height in inches, as the sheet will lie on the paper.
pub fn page_inches(size: Option<&PageSize>, landscape: bool, microns: bool) -> (f64, f64) {
  let (w, h) = match size {
    Some(PageSize::Size { width, height }) if *width > 0.0 && *height > 0.0 => {
      let k = if microns { 25_400.0 } else { 1.0 };
      return (width / k, height / k);
    }
    Some(PageSize::Named(name)) => paper_inches(name),
    _ => paper_inches("A4"),
  };
  if landscape { (h, w) } else { (w, h) }
}

#[derive(Deserialize, Default, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct SheetJob {
  pub device_name: Option<String>,
  pub copies: Option<f64>,
  pub landscape: bool,
  pub page_size: Option<PageSize>,
  pub color: Option<bool>,
}

pub fn copies(job: &SheetJob) -> i32 {
  job.copies.filter(|c| c.is_finite()).map(|c| c.round() as i32).unwrap_or(1).clamp(1, 99)
}

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Printer {
  pub name: String,
  pub display_name: String,
  pub is_default: bool,
}

#[cfg(windows)]
mod win {
  use super::*;
  use std::sync::mpsc;
  use webview2_com::Microsoft::Web::WebView2::Win32::*;
  use webview2_com::{PrintCompletedHandler, PrintToPdfCompletedHandler};
  use windows_core::{Interface, PCWSTR};

  fn wide(s: &std::ffi::OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    s.encode_wide().chain(Some(0)).collect()
  }

  /// Settings shared by both jobs: the paper, no margins (the sheets carry
  /// their own), backgrounds, no browser header and footer.
  unsafe fn base_settings(env: &ICoreWebView2Environment, width: f64, height: f64) -> windows_core::Result<ICoreWebView2PrintSettings> {
    let env6: ICoreWebView2Environment6 = env.cast()?;
    let settings = env6.CreatePrintSettings()?;
    let landscape = width > height;
    settings.SetOrientation(if landscape { COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE } else { COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT })?;
    // Page width/height are always portrait; the orientation turns them.
    settings.SetPageWidth(width.min(height))?;
    settings.SetPageHeight(width.max(height))?;
    settings.SetMarginTop(0.0)?;
    settings.SetMarginBottom(0.0)?;
    settings.SetMarginLeft(0.0)?;
    settings.SetMarginRight(0.0)?;
    settings.SetShouldPrintBackgrounds(true)?;
    settings.SetShouldPrintHeaderAndFooter(false)?;
    Ok(settings)
  }

  async fn wait(rx: mpsc::Receiver<Result<(), String>>, what: &'static str) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(std::time::Duration::from_secs(180)))
      .await
      .map_err(|e| e.to_string())?
      .map_err(|_| format!("{what} timed out"))?
  }

  pub async fn print_to_pdf(window: &tauri::WebviewWindow, path: &Path, width: f64, height: f64) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let file = wide(path.as_os_str());
    window
      .with_webview(move |webview| {
        let start = || -> windows_core::Result<()> {
          unsafe {
            let core7: ICoreWebView2_7 = webview.controller().CoreWebView2()?.cast()?;
            let settings = base_settings(&webview.environment(), width, height)?;
            let done = tx.clone();
            let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
              let _ = done.send(match result {
                Ok(()) if ok => Ok(()),
                Ok(()) => Err("the PDF could not be written".into()),
                Err(e) => Err(e.to_string()),
              });
              Ok(())
            }));
            core7.PrintToPdf(PCWSTR(file.as_ptr()), &settings, &handler)
          }
        };
        if let Err(e) = start() {
          let _ = tx.send(Err(e.to_string()));
        }
      })
      .map_err(|e| e.to_string())?;
    wait(rx, "printing to PDF").await
  }

  pub async fn print_sheets(window: &tauri::WebviewWindow, job: &SheetJob) -> Result<(), String> {
    let (width, height) = page_inches(job.page_size.as_ref(), job.landscape, true);
    let printer = job.device_name.clone().filter(|n| !n.is_empty()).map(|n| wide(std::ffi::OsStr::new(&n)));
    let copies = copies(job);
    let grey = job.color == Some(false);
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    window
      .with_webview(move |webview| {
        let start = || -> windows_core::Result<()> {
          unsafe {
            let core16: ICoreWebView2_16 = webview.controller().CoreWebView2()?.cast()?;
            let settings = base_settings(&webview.environment(), width, height)?;
            let s2: ICoreWebView2PrintSettings2 = settings.cast()?;
            s2.SetMediaSize(COREWEBVIEW2_PRINT_MEDIA_SIZE_CUSTOM)?;
            s2.SetCopies(copies)?;
            s2.SetColorMode(if grey { COREWEBVIEW2_PRINT_COLOR_MODE_GRAYSCALE } else { COREWEBVIEW2_PRINT_COLOR_MODE_COLOR })?;
            if let Some(name) = &printer {
              s2.SetPrinterName(PCWSTR(name.as_ptr()))?;
            }
            let done = tx.clone();
            let handler = PrintCompletedHandler::create(Box::new(move |result, status| {
              let _ = done.send(match result {
                Ok(()) if status == COREWEBVIEW2_PRINT_STATUS_SUCCEEDED => Ok(()),
                Ok(()) if status == COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE => Err("the printer is not available".into()),
                Ok(()) => Err("the printer did not accept the job".into()),
                Err(e) => Err(e.to_string()),
              });
              Ok(())
            }));
            core16.Print(&settings, &handler)
          }
        };
        if let Err(e) = start() {
          let _ = tx.send(Err(e.to_string()));
        }
      })
      .map_err(|e| e.to_string())?;
    wait(rx, "printing").await
  }

  #[repr(C)]
  struct PrinterInfo4 {
    name: *const u16,
    server: *const u16,
    attributes: u32,
  }

  #[link(name = "winspool")]
  extern "system" {
    fn EnumPrintersW(flags: u32, name: *const u16, level: u32, buf: *mut u8, size: u32, needed: *mut u32, returned: *mut u32) -> i32;
    fn GetDefaultPrinterW(buf: *mut u16, size: *mut u32) -> i32;
  }

  unsafe fn from_wide(p: *const u16) -> String {
    if p.is_null() {
      return String::new();
    }
    let mut n = 0;
    while *p.add(n) != 0 {
      n += 1;
    }
    String::from_utf16_lossy(std::slice::from_raw_parts(p, n))
  }

  pub fn default_printer() -> String {
    unsafe {
      let mut size = 0u32;
      GetDefaultPrinterW(std::ptr::null_mut(), &mut size);
      if size == 0 {
        return String::new();
      }
      let mut buf = vec![0u16; size as usize];
      if GetDefaultPrinterW(buf.as_mut_ptr(), &mut size) == 0 {
        return String::new();
      }
      from_wide(buf.as_ptr())
    }
  }

  /// Local printers and network connections (level 4 is the fast listing).
  pub fn printer_names() -> Vec<String> {
    const PRINTER_ENUM_LOCAL: u32 = 2;
    const PRINTER_ENUM_CONNECTIONS: u32 = 4;
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    unsafe {
      let (mut needed, mut count) = (0u32, 0u32);
      EnumPrintersW(flags, std::ptr::null(), 4, std::ptr::null_mut(), 0, &mut needed, &mut count);
      if needed == 0 {
        return Vec::new();
      }
      // u64 storage keeps the structs aligned.
      let mut buf = vec![0u64; (needed as usize).div_ceil(8)];
      if EnumPrintersW(flags, std::ptr::null(), 4, buf.as_mut_ptr().cast(), needed, &mut needed, &mut count) == 0 {
        return Vec::new();
      }
      let infos = std::slice::from_raw_parts(buf.as_ptr().cast::<PrinterInfo4>(), count as usize);
      infos.iter().map(|i| from_wide(i.name)).filter(|n| !n.is_empty()).collect()
    }
  }
}

#[cfg(windows)]
pub use win::{print_sheets, print_to_pdf};

/// → [{ name, displayName, isDefault }], the default first as the spooler lists it.
pub fn list_printers() -> Vec<Printer> {
  #[cfg(windows)]
  {
    let def = win::default_printer();
    return mark_default(win::printer_names(), &def);
  }
  #[cfg(not(windows))]
  Vec::new()
}

pub fn mark_default(names: Vec<String>, def: &str) -> Vec<Printer> {
  names
    .into_iter()
    .map(|name| Printer { display_name: name.clone(), is_default: !def.is_empty() && name == def, name })
    .collect()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn paper_sizes_are_portrait_inches() {
    let (w, h) = paper_inches("A4");
    assert!((w - 8.27).abs() < 0.01 && (h - 11.69).abs() < 0.01);
    let (w, h) = paper_inches("Letter");
    assert!((w - 8.5).abs() < 0.01 && (h - 11.0).abs() < 0.01);
    assert_eq!(paper_inches("unknown"), paper_inches("A4"));
  }

  #[test]
  fn page_sizes_follow_the_page() {
    // Named sizes turn with the landscape flag.
    let (w, h) = page_inches(Some(&PageSize::Named("A3".into())), true, true);
    assert!(w > h && (w - 16.54).abs() < 0.01);
    // Microns (printing) and inches (PDF) are already oriented.
    let (w, h) = page_inches(Some(&PageSize::Size { width: 420_000.0, height: 297_000.0 }), false, true);
    assert!((w - 16.54).abs() < 0.01 && (h - 11.69).abs() < 0.01);
    let (w, h) = page_inches(Some(&PageSize::Size { width: 11.0, height: 8.5 }), false, false);
    assert_eq!((w, h), (11.0, 8.5));
    assert_eq!(page_inches(None, false, true), paper_inches("A4"));
  }

  #[test]
  fn page_size_reads_both_shapes() {
    let n: PageSize = serde_json::from_str("\"A1\"").unwrap();
    assert!(matches!(n, PageSize::Named(ref s) if s == "A1"));
    let s: PageSize = serde_json::from_str(r#"{"width":1,"height":2}"#).unwrap();
    assert!(matches!(s, PageSize::Size { width, height } if width == 1.0 && height == 2.0));
  }

  #[test]
  fn copies_are_kept_in_range() {
    let job = |c: Option<f64>| SheetJob { copies: c, ..Default::default() };
    assert_eq!(copies(&job(None)), 1);
    assert_eq!(copies(&job(Some(3.4))), 3);
    assert_eq!(copies(&job(Some(0.0))), 1);
    assert_eq!(copies(&job(Some(500.0))), 99);
    assert_eq!(copies(&job(Some(f64::NAN))), 1);
  }

  #[test]
  fn the_default_printer_is_marked() {
    let list = mark_default(vec!["A".into(), "B".into()], "B");
    assert_eq!(list.iter().filter(|p| p.is_default).count(), 1);
    assert!(list[1].is_default);
    assert!(mark_default(vec!["A".into()], "").iter().all(|p| !p.is_default));
  }
}
