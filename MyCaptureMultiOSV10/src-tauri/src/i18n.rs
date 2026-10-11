//! Language of the messages the backend sends to the UI (errors, window titles).
//! The UI calls `set_language` whenever the user switches Korean ↔ English.

use std::sync::atomic::{AtomicBool, Ordering};

static ENGLISH: AtomicBool = AtomicBool::new(false);

pub fn set_english(english: bool) {
    ENGLISH.store(english, Ordering::Relaxed);
}

pub fn english() -> bool {
    ENGLISH.load(Ordering::Relaxed)
}

/// `tr!("한국어 {x}", "English {x}")` formats the message in the current language.
#[macro_export]
macro_rules! tr {
    ($ko:literal, $en:literal $(, $arg:expr)* $(,)?) => {
        if $crate::i18n::english() { format!($en $(, $arg)*) } else { format!($ko $(, $arg)*) }
    };
}
