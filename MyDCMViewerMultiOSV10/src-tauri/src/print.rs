// Printing straight to a printer chosen in the app's own print dialog — no
// second, system print window. The renderer sends the selected pages as JPEGs
// (the print layout drawn by the page); each becomes one sheet, scaled to fit the printable area
// and centred.
//   Windows:       GDI — a printer DC with the chosen orientation, one page per image
//   macOS / Linux: CUPS `lp` with the same files
use serde::Serialize;

/// What print_pages returns when the user cancelled a dialog the printer
/// driver opened itself ("Print to PDF" asks for a file name). Not an error.
pub const CANCELLED: &str = "PRINT_CANCELLED";

#[derive(Debug, Default, Serialize, PartialEq, Eq)]
pub struct Printers {
  pub printers: Vec<String>,
  pub default: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Job {
  pub printer: String,
  pub copies: u32,
  pub landscape: bool,
  pub title: String,
}

/// The frame the renderer sends: u32 LE page count, a u32 LE length per page,
/// then the pages back to back.
pub fn split_pages(body: &[u8]) -> Result<Vec<&[u8]>, String> {
  let rd = |at: usize| -> Result<usize, String> {
    body
      .get(at..at + 4)
      .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize)
      .ok_or_else(|| "Print data is cut short".to_string())
  };
  let count = rd(0)?;
  if count == 0 || count > 10_000 {
    return Err("There are no pages to print.".into());
  }
  let mut lens = Vec::with_capacity(count);
  for i in 0..count {
    lens.push(rd(4 + i * 4)?);
  }
  let mut at = 4 + count * 4;
  let mut out = Vec::with_capacity(count);
  for len in lens {
    let page = body.get(at..at + len).ok_or("Print data is cut short")?;
    out.push(page);
    at += len;
  }
  Ok(out)
}

/// Where an image of `iw`×`ih` lands on a printable area of `pw`×`ph`:
/// as large as fits, aspect kept, centred. (x, y, w, h)
pub fn fit_rect(iw: u32, ih: u32, pw: i32, ph: i32) -> (i32, i32, i32, i32) {
  if iw == 0 || ih == 0 || pw <= 0 || ph <= 0 {
    return (0, 0, pw.max(0), ph.max(0));
  }
  let s = (pw as f64 / iw as f64).min(ph as f64 / ih as f64);
  let w = (iw as f64 * s).round() as i32;
  let h = (ih as f64 * s).round() as i32;
  ((pw - w) / 2, (ph - h) / 2, w, h)
}

pub fn clamp_copies(n: u32) -> u32 {
  n.clamp(1, 99)
}

// ── Windows ─────────────────────────────────────────────────
#[cfg(windows)]
mod platform {
  use super::{fit_rect, Job, Printers, CANCELLED};
  use windows::core::{HSTRING, PCWSTR, PWSTR};
  use windows::Win32::Foundation::{GetLastError, ERROR_CANCELLED};
  use windows::Win32::Graphics::Gdi::{
    CreateDCW, DeleteDC, GetDeviceCaps, SetBrushOrgEx, SetStretchBltMode, StretchDIBits, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, DEVMODEW, DIB_RGB_COLORS, DM_ORIENTATION, HALFTONE, HORZRES, SRCCOPY, VERTRES,
  };
  use windows::Win32::Graphics::Printing::{
    ClosePrinter, DocumentPropertiesW, EnumPrintersW, GetDefaultPrinterW, OpenPrinterW, PRINTER_ENUM_CONNECTIONS,
    PRINTER_ENUM_LOCAL, PRINTER_HANDLE, PRINTER_INFO_4W,
  };
  use windows::Win32::Storage::Xps::{EndDoc, EndPage, StartDocW, StartPage, DOCINFOW};

  const DM_IN_BUFFER: u32 = 8;
  const DM_OUT_BUFFER: u32 = 2;

  pub fn list() -> Printers {
    let mut out = Printers::default();
    unsafe {
      let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
      let (mut needed, mut count) = (0u32, 0u32);
      let _ = EnumPrintersW(flags, PCWSTR::null(), 4, None, &mut needed, &mut count);
      if needed > 0 {
        let mut buf = vec![0u8; needed as usize];
        if EnumPrintersW(flags, PCWSTR::null(), 4, Some(&mut buf), &mut needed, &mut count).is_ok() {
          let infos = std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_4W, count as usize);
          for info in infos {
            if let Ok(name) = info.pPrinterName.to_string() {
              if !name.is_empty() && !out.printers.contains(&name) {
                out.printers.push(name);
              }
            }
          }
        }
      }
      let mut len = 0u32;
      let _ = GetDefaultPrinterW(None, &mut len);
      if len > 0 {
        let mut buf = vec![0u16; len as usize];
        if GetDefaultPrinterW(Some(PWSTR(buf.as_mut_ptr())), &mut len).as_bool() {
          let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
          out.default = Some(String::from_utf16_lossy(&buf[..end]));
        }
      }
    }
    out
  }

  /// The printer's own settings with our orientation laid over them.
  unsafe fn devmode(name: &HSTRING, landscape: bool) -> Option<Vec<u8>> {
    let mut h = PRINTER_HANDLE::default();
    OpenPrinterW(name, &mut h, None).ok()?;
    let size = DocumentPropertiesW(None, h, name, None, None, 0);
    let result = if size > 0 {
      let mut buf = vec![0u8; size as usize];
      let dm = buf.as_mut_ptr() as *mut DEVMODEW;
      if DocumentPropertiesW(None, h, name, Some(dm), None, DM_OUT_BUFFER) >= 0 {
        (*dm).Anonymous1.Anonymous1.dmOrientation = if landscape { 2 } else { 1 };
        (*dm).dmFields |= DM_ORIENTATION;
        let _ = DocumentPropertiesW(None, h, name, Some(dm), Some(dm), DM_IN_BUFFER | DM_OUT_BUFFER);
        Some(buf)
      } else {
        None
      }
    } else {
      None
    };
    let _ = ClosePrinter(h);
    result
  }

  pub fn print(job: &Job, pages: &[image::RgbImage]) -> Result<(), String> {
    unsafe {
      let name = HSTRING::from(job.printer.as_str());
      let dm = devmode(&name, job.landscape);
      let dm_ptr = dm.as_ref().map(|b| b.as_ptr() as *const DEVMODEW);
      let hdc = CreateDCW(PCWSTR::null(), &name, PCWSTR::null(), dm_ptr);
      if hdc.is_invalid() {
        return Err(format!("Could not open the printer \"{}\".", job.printer));
      }
      let title = HSTRING::from(if job.title.is_empty() { "MyDCMViewer" } else { job.title.as_str() });
      let info = DOCINFOW {
        cbSize: std::mem::size_of::<DOCINFOW>() as i32,
        lpszDocName: PCWSTR(title.as_ptr()),
        ..Default::default()
      };
      let result = (|| {
        if StartDocW(hdc, &info) <= 0 {
          if GetLastError() == ERROR_CANCELLED {
            return Err(CANCELLED.into());
          }
          return Err(format!("The printer \"{}\" did not accept the job.", job.printer));
        }
        let pw = GetDeviceCaps(Some(hdc), HORZRES);
        let ph = GetDeviceCaps(Some(hdc), VERTRES);
        // Copies are printed as whole sets (collated); not every driver honours dmCopies.
        for _ in 0..job.copies {
          for img in pages {
            if StartPage(hdc) <= 0 {
              let _ = EndDoc(hdc);
              return Err("The printer stopped accepting pages.".into());
            }
            draw(hdc, img, pw, ph);
            EndPage(hdc);
          }
        }
        EndDoc(hdc);
        Ok(())
      })();
      let _ = DeleteDC(hdc);
      result
    }
  }

  unsafe fn draw(hdc: windows::Win32::Graphics::Gdi::HDC, img: &image::RgbImage, pw: i32, ph: i32) {
    let (iw, ih) = img.dimensions();
    // 24-bit BGR rows, each padded to 4 bytes, top-down (negative height).
    let stride = ((iw as usize * 3) + 3) & !3;
    let mut bits = vec![0u8; stride * ih as usize];
    for (y, row) in img.rows().enumerate() {
      let line = &mut bits[y * stride..y * stride + iw as usize * 3];
      for (x, p) in row.enumerate() {
        line[x * 3] = p[2];
        line[x * 3 + 1] = p[1];
        line[x * 3 + 2] = p[0];
      }
    }
    let bmi = BITMAPINFO {
      bmiHeader: BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: iw as i32,
        biHeight: -(ih as i32),
        biPlanes: 1,
        biBitCount: 24,
        biCompression: BI_RGB.0,
        ..Default::default()
      },
      ..Default::default()
    };
    let (x, y, w, h) = fit_rect(iw, ih, pw, ph);
    SetStretchBltMode(hdc, HALFTONE);
    let _ = SetBrushOrgEx(hdc, 0, 0, None);
    StretchDIBits(
      hdc, x, y, w, h, 0, 0, iw as i32, ih as i32,
      Some(bits.as_ptr() as *const _), &bmi, DIB_RGB_COLORS, SRCCOPY,
    );
  }
}

// ── macOS / Linux (CUPS) ────────────────────────────────────
#[cfg(not(windows))]
mod platform {
  use super::{Job, Printers};
  use std::process::Command;

  pub fn list() -> Printers {
    let mut out = Printers::default();
    if let Ok(o) = Command::new("lpstat").arg("-a").output() {
      for line in String::from_utf8_lossy(&o.stdout).lines() {
        if let Some(name) = line.split_whitespace().next() {
          if !out.printers.iter().any(|p| p == name) {
            out.printers.push(name.to_string());
          }
        }
      }
    }
    if let Ok(o) = Command::new("lpstat").arg("-d").output() {
      let text = String::from_utf8_lossy(&o.stdout);
      if let Some(name) = text.split(':').nth(1).map(str::trim).filter(|s| !s.is_empty()) {
        out.default = Some(name.to_string());
      }
    }
    out
  }

  pub fn print_files(job: &Job, files: &[std::path::PathBuf]) -> Result<(), String> {
    let mut cmd = Command::new("lp");
    cmd.arg("-d").arg(&job.printer)
      .arg("-n").arg(job.copies.to_string())
      .arg("-o").arg("collate=true")
      .arg("-o").arg("fit-to-page")
      .arg("-o").arg(if job.landscape { "orientation-requested=4" } else { "orientation-requested=3" });
    if !job.title.is_empty() {
      cmd.arg("-t").arg(&job.title);
    }
    let o = cmd.args(files).output().map_err(|e| format!("lp: {e}"))?;
    if o.status.success() {
      Ok(())
    } else {
      Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
    }
  }
}

pub fn list_printers() -> Printers {
  platform::list()
}

pub fn print_pages(job: &Job, pages: &[&[u8]]) -> Result<usize, String> {
  if job.printer.trim().is_empty() {
    return Err("No printer was chosen.".into());
  }
  #[cfg(windows)]
  {
    let mut imgs = Vec::with_capacity(pages.len());
    for (i, p) in pages.iter().enumerate() {
      let img = image::load_from_memory(p).map_err(|e| format!("Page {} could not be read: {e}", i + 1))?;
      imgs.push(img.to_rgb8());
    }
    platform::print(job, &imgs)?;
  }
  #[cfg(not(windows))]
  {
    let dir = std::env::temp_dir().join(format!("mydcmviewer-print-{}", std::process::id()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut files = Vec::with_capacity(pages.len());
    for (i, p) in pages.iter().enumerate() {
      let f = dir.join(format!("p{i:05}.jpg"));
      std::fs::write(&f, p).map_err(|e| e.to_string())?;
      files.push(f);
    }
    let r = platform::print_files(job, &files);
    let _ = std::fs::remove_dir_all(&dir);
    r?;
  }
  Ok(pages.len())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn frame(pages: &[&[u8]]) -> Vec<u8> {
    let mut v = (pages.len() as u32).to_le_bytes().to_vec();
    for p in pages {
      v.extend_from_slice(&(p.len() as u32).to_le_bytes());
    }
    for p in pages {
      v.extend_from_slice(p);
    }
    v
  }

  #[test]
  fn splits_the_page_frame() {
    let body = frame(&[b"abc", b"", b"de"]);
    let pages = split_pages(&body).unwrap();
    assert_eq!(pages, vec![&b"abc"[..], &b""[..], &b"de"[..]]);
    assert!(split_pages(&frame(&[])).is_err());
    assert!(split_pages(&body[..body.len() - 1]).is_err());
    assert!(split_pages(&[1, 0]).is_err());
  }

  #[test]
  fn fits_and_centres_the_page() {
    // A portrait page on a portrait sheet fills the height or the width.
    assert_eq!(fit_rect(100, 200, 1000, 1000), (250, 0, 500, 1000));
    assert_eq!(fit_rect(200, 100, 1000, 1000), (0, 250, 1000, 500));
    assert_eq!(fit_rect(0, 10, 50, 50), (0, 0, 50, 50));
  }

  #[test]
  fn copies_are_clamped() {
    assert_eq!(clamp_copies(0), 1);
    assert_eq!(clamp_copies(5), 5);
    assert_eq!(clamp_copies(500), 99);
  }

  #[test]
  fn lists_printers_without_failing() {
    let p = list_printers();
    if let Some(d) = &p.default {
      assert!(!d.is_empty());
    }
  }
}
