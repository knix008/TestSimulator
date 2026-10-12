use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::Instant;

pub struct DialogSlot {
    pub name: String,
    pub label: String,
    pub payload: Value,
    pub submitted: bool,
}

pub struct AppState {
    pub quitting: AtomicBool,
    pub pending_open: Mutex<Option<String>>,
    pub pending_install: AtomicBool,
    pub dialogs: Mutex<HashMap<String, DialogSlot>>,
    pub hidden: Mutex<Vec<String>>,
    pub recordings: Mutex<HashMap<String, File>>,
    pub min_size: Mutex<(f64, f64)>,
    pub born: Instant,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            quitting: AtomicBool::new(false),
            pending_open: Mutex::new(None),
            pending_install: AtomicBool::new(false),
            dialogs: Mutex::new(HashMap::new()),
            hidden: Mutex::new(Vec::new()),
            recordings: Mutex::new(HashMap::new()),
            min_size: Mutex::new((960.0, 600.0)),
            born: Instant::now(),
        }
    }
}
