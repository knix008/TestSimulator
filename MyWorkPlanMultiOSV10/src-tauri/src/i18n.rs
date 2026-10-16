//! Backend messages follow the UI language (set by the front end at start-up
//! and whenever the user switches language).
use std::sync::atomic::{AtomicBool, Ordering};

static ENGLISH: AtomicBool = AtomicBool::new(false);

pub fn set_english(english: bool) {
    ENGLISH.store(english, Ordering::Relaxed);
}

pub fn english() -> bool {
    ENGLISH.load(Ordering::Relaxed)
}

/// `tr!("한국어 {x}", "English {x}")` — formats the message in the current UI language.
#[macro_export]
macro_rules! tr {
    ($ko:literal, $en:literal $(, $arg:expr)* $(,)?) => {
        if $crate::i18n::english() { format!($en $(, $arg)*) } else { format!($ko $(, $arg)*) }
    };
}
