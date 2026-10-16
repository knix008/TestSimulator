//! A serious failure has to be readable and copyable. The console is not
//! enough: a dock that failed has no window the user is looking at, and a
//! native message box will not let them select the text.
//!
//! Panics anywhere in the app, and errors the pages report, open a small window
//! (`src/renderer/error.html`) holding the full text with a Copy button. A
//! repeat of the same text within a few seconds is dropped, and a second error
//! while one is showing waits its turn.

use crate::{bridge, i18n};
use serde_json::json;
use std::{
  sync::Mutex,
  time::{Duration, Instant},
};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

const MAX_CHARS: usize = 16000;
const DEDUPE: Duration = Duration::from_secs(4);

#[derive(Default)]
struct Reports {
  showing: Option<String>,
  queue: Vec<String>,
  last: Option<(String, Instant)>,
  count: u32,
}

static REPORTS: Mutex<Option<Reports>> = Mutex::new(None);
static APP: Mutex<Option<AppHandle>> = Mutex::new(None);

/// One block of text the popup can show and the user can copy.
pub fn describe(text: &str) -> String {
  let text = text.trim();
  if text.chars().count() <= MAX_CHARS {
    return text.to_string();
  }
  let cut: String = text.chars().take(MAX_CHARS).collect();
  format!("{cut}\n\n…")
}

pub fn install(app: &AppHandle) {
  *APP.lock().unwrap() = Some(app.clone());
  let previous = std::panic::take_hook();
  std::panic::set_hook(Box::new(move |info| {
    previous(info);
    let place = info.location().map(|l| format!(" at {}:{}", l.file(), l.line())).unwrap_or_default();
    let message = info
      .payload()
      .downcast_ref::<&str>()
      .map(|s| s.to_string())
      .or_else(|| info.payload().downcast_ref::<String>().cloned())
      .unwrap_or_else(|| "panic".into());
    let thread = std::thread::current().name().unwrap_or("unnamed").to_string();
    let trace = std::backtrace::Backtrace::force_capture();
    report(&format!("panicked{place} (thread '{thread}'):\n{message}\n\n{trace}"));
  }));
}

pub fn report(error: &str) {
  let text = describe(error);
  if text.is_empty() {
    return;
  }
  let open = {
    let mut guard = REPORTS.lock().unwrap();
    let r = guard.get_or_insert_with(Reports::default);
    if let Some((last, at)) = &r.last {
      if *last == text && at.elapsed() < DEDUPE {
        return;
      }
    }
    r.last = Some((text.clone(), Instant::now()));
    if r.showing.is_some() {
      r.queue.push(text);
      return;
    }
    r.count += 1;
    let label = format!("error-{}", r.count);
    r.showing = Some(label.clone());
    (label, text)
  };
  // Never from the panicking thread itself, which may be the UI thread:
  // making a window there would wait on the very loop it is blocking.
  let _ = std::thread::Builder::new().name("error-report".into()).spawn(move || present(open.0, open.1));
}

fn present(label: String, text: String) {
  let Some(app) = APP.lock().unwrap().clone() else { return };
  let locale = i18n::resolve("auto", &i18n::system_locale());
  let t = |key: &str| i18n::translate(locale, key, &[]);
  let payload = json!({
    "text": text, "title": t("error.title"), "hint": t("error.hint"),
    "copy": t("error.copy"), "copied": t("error.copied"), "close": t("error.close"),
  });
  bridge::post(&app, &label, "error:show", payload);

  let built = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("renderer/error.html".into()))
    .title(t("error.title"))
    .inner_size(560.0, 420.0)
    .minimizable(false)
    .maximizable(false)
    .always_on_top(true)
    .build();
  if let Err(err) = built {
    eprintln!("[error] could not open the report window: {err}");
    finished(&label);
  }
}

/// The report window closed: show the next one, if any.
pub fn finished(label: &str) {
  bridge::drop_window(label);
  let next = {
    let mut guard = REPORTS.lock().unwrap();
    let r = guard.get_or_insert_with(Reports::default);
    if r.showing.as_deref() != Some(label) {
      return;
    }
    r.showing = None;
    if r.queue.is_empty() {
      None
    } else {
      Some(r.queue.remove(0))
    }
  };
  if let Some(text) = next {
    // Clear the dedupe so the queued one is not mistaken for a repeat.
    if let Some(r) = REPORTS.lock().unwrap().as_mut() {
      r.last = None;
    }
    report(&text);
  }
}

pub fn is_error_window(label: &str) -> bool {
  label.starts_with("error-")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn keeps_a_plain_message_and_drops_an_empty_one() {
    assert_eq!(describe("renderer gone"), "renderer gone");
    assert_eq!(describe("   "), "");
  }

  #[test]
  fn does_not_hand_the_popup_an_unbounded_string() {
    let text = describe(&"x".repeat(20000));
    assert!(text.chars().count() < 20000);
    assert!(text.ends_with('…'));
  }
}
