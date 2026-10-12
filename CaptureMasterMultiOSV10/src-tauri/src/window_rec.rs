// Frames of one window for recording. A thread owns the xcap window and
// photographs it at the requested rate; the page pulls the latest frame,
// paints it on a canvas and records that canvas with MediaRecorder.
//
// The page waits inside `next_frame` instead of on a timer, so recording keeps
// its pace while the main window is minimized (hidden pages throttle timers).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

pub const GONE: &str = "window-gone";

struct Frame {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

struct Feed {
    frame: Mutex<Option<Frame>>,
    ready: Condvar,
    stop: AtomicBool,
    gone: AtomicBool,
}

fn feeds() -> &'static Mutex<HashMap<String, Arc<Feed>>> {
    static FEEDS: OnceLock<Mutex<HashMap<String, Arc<Feed>>>> = OnceLock::new();
    FEEDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn window_id(source_id: &str) -> Result<u32, String> {
    source_id
        .trim_start_matches("window:")
        .parse::<u32>()
        .map_err(|_| format!("Not a window source: {source_id}"))
}

fn find_window(id: u32) -> Option<xcap::Window> {
    xcap::Window::all().ok()?.into_iter().find(|w| w.id().ok() == Some(id))
}

pub fn start(source_id: &str, fps: u32) -> Result<String, String> {
    let id = window_id(source_id)?;
    if find_window(id).is_none() {
        return Err(GONE.into());
    }
    static NEXT: AtomicU64 = AtomicU64::new(1);
    let token = format!("wf{}", NEXT.fetch_add(1, Ordering::SeqCst));
    let feed = Arc::new(Feed {
        frame: Mutex::new(None),
        ready: Condvar::new(),
        stop: AtomicBool::new(false),
        gone: AtomicBool::new(false),
    });
    feeds().lock().map_err(|e| e.to_string())?.insert(token.clone(), feed.clone());

    let interval = Duration::from_secs_f64(1.0 / fps.clamp(1, 60) as f64);
    std::thread::spawn(move || {
        let Some(win) = find_window(id) else {
            feed.gone.store(true, Ordering::SeqCst);
            feed.ready.notify_all();
            return;
        };
        let mut misses = 0u32;
        while !feed.stop.load(Ordering::SeqCst) {
            let t0 = Instant::now();
            match win.capture_image() {
                Ok(img) if img.width() > 0 && img.height() > 0 => {
                    misses = 0;
                    let frame = Frame { width: img.width(), height: img.height(), rgba: img.into_raw() };
                    if let Ok(mut slot) = feed.frame.lock() {
                        *slot = Some(frame);
                    }
                    feed.ready.notify_all();
                }
                _ => {
                    // Minimized windows fail for a while; a closed one never comes back.
                    misses += 1;
                    if misses % 10 == 0 && find_window(id).is_none() {
                        feed.gone.store(true, Ordering::SeqCst);
                        feed.ready.notify_all();
                        break;
                    }
                }
            }
            if let Some(rest) = interval.checked_sub(t0.elapsed()) {
                std::thread::sleep(rest);
            }
        }
    });
    Ok(token)
}

/// Waits up to `timeout_ms` for a frame newer than the last one handed out.
/// Returns `width, height` as little-endian u32 followed by RGBA pixels, or
/// an empty buffer when no new frame arrived in time.
pub fn next_frame(token: &str, timeout_ms: u64) -> Result<Vec<u8>, String> {
    let feed = feeds()
        .lock()
        .map_err(|e| e.to_string())?
        .get(token)
        .cloned()
        .ok_or_else(|| GONE.to_string())?;
    let deadline = Instant::now() + Duration::from_millis(timeout_ms.clamp(1, 5000));
    let mut slot = feed.frame.lock().map_err(|e| e.to_string())?;
    loop {
        if let Some(frame) = slot.take() {
            let mut out = Vec::with_capacity(8 + frame.rgba.len());
            out.extend_from_slice(&frame.width.to_le_bytes());
            out.extend_from_slice(&frame.height.to_le_bytes());
            out.extend_from_slice(&frame.rgba);
            return Ok(out);
        }
        if feed.gone.load(Ordering::SeqCst) {
            return Err(GONE.into());
        }
        let now = Instant::now();
        if now >= deadline || feed.stop.load(Ordering::SeqCst) {
            return Ok(Vec::new());
        }
        slot = feed.ready.wait_timeout(slot, deadline - now).map_err(|e| e.to_string())?.0;
    }
}

pub fn stop(token: &str) {
    let feed = feeds().lock().ok().and_then(|mut map| map.remove(token));
    if let Some(feed) = feed {
        feed.stop.store(true, Ordering::SeqCst);
        feed.ready.notify_all();
    }
}
