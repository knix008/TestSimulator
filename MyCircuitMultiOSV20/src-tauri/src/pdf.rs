// Print → Save as PDF: the page lays out its .print-area sheets, then WebView2
// prints the window's print view straight into a PDF file (no dialog besides
// the Save dialog). Windows only; the macOS and Linux webviews have no
// equivalent, so the page offers just Print… there.

use std::path::Path;

/// Paper (portrait width × height, inches) for the names the print dialog uses.
pub fn paper_inches(name: &str) -> (f64, f64) {
  let mm = match name {
    "A3" => (297.0, 420.0),
    "A5" => (148.0, 210.0),
    "Letter" => (215.9, 279.4),
    "Legal" => (215.9, 355.6),
    "Tabloid" => (279.4, 431.8),
    _ => (210.0, 297.0),
  };
  (mm.0 / 25.4, mm.1 / 25.4)
}

#[cfg(windows)]
pub async fn print_to_pdf(window: &tauri::WebviewWindow, path: &Path, paper: &str, landscape: bool) -> Result<(), String> {
  use std::os::windows::ffi::OsStrExt;
  use std::sync::mpsc;
  use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
  };
  use webview2_com::PrintToPdfCompletedHandler;
  use windows_core::{Interface, PCWSTR};

  let (tx, rx) = mpsc::channel::<Result<(), String>>();
  let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
  let (width, height) = paper_inches(paper);
  window
    .with_webview(move |webview| {
      let start = || -> windows_core::Result<()> {
        unsafe {
          let core = webview.controller().CoreWebView2()?;
          let core7: ICoreWebView2_7 = core.cast()?;
          let env6: ICoreWebView2Environment6 = webview.environment().cast()?;
          let settings = env6.CreatePrintSettings()?;
          settings.SetOrientation(if landscape { COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE } else { COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT })?;
          settings.SetPageWidth(width)?;
          settings.SetPageHeight(height)?;
          // The sheets carry their own @page margins.
          settings.SetMarginTop(0.0)?;
          settings.SetMarginBottom(0.0)?;
          settings.SetMarginLeft(0.0)?;
          settings.SetMarginRight(0.0)?;
          settings.SetShouldPrintBackgrounds(true)?;
          settings.SetShouldPrintHeaderAndFooter(false)?;
          let done = tx.clone();
          let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
            let _ = done.send(match result {
              Ok(()) if ok => Ok(()),
              Ok(()) => Err("the PDF could not be written".into()),
              Err(e) => Err(e.to_string()),
            });
            Ok(())
          }));
          core7.PrintToPdf(PCWSTR(wide.as_ptr()), &settings, &handler)
        }
      };
      if let Err(e) = start() {
        let _ = tx.send(Err(e.to_string()));
      }
    })
    .map_err(|e| e.to_string())?;
  tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(std::time::Duration::from_secs(120)))
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "printing to PDF timed out".to_string())?
}

#[cfg(not(windows))]
pub async fn print_to_pdf(_window: &tauri::WebviewWindow, _path: &Path, _paper: &str, _landscape: bool) -> Result<(), String> {
  Err("Save as PDF is only available on Windows".into())
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
}
