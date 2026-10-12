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

/// The most recent still, kept so window and region captures can be saved
/// without sending the image bytes back over IPC.
pub struct LastShot {
    pub id: String,
    pub png: Vec<u8>,
}

pub struct ShotSlot {
    pub seq: u64,
    pub shot: Option<LastShot>,
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
    /// A previous run's size was applied, so start-up measurement must not replace it.
    pub size_restored: AtomicBool,
    pub shots: Mutex<ShotSlot>,
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
            size_restored: AtomicBool::new(false),
            shots: Mutex::new(ShotSlot { seq: 0, shot: None }),
        }
    }
}
