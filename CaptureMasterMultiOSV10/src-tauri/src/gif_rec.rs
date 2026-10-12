// Animated GIF recording. MediaRecorder cannot produce GIF, so a capture
// thread photographs the screen or window and an encoder thread quantizes and
// appends frames to the file. Nothing runs in the page, so a minimized main
// window (throttled timers) does not slow the recording down.

use std::collections::HashMap;
use std::fs::File;
use std::io::BufWriter;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, TrySendError};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use image::RgbaImage;
use serde_json::{json, Value};

/// GIF delays are in 1/100 s and players clamp very short ones, so frames
/// faster than this are not worth taking.
pub const MAX_FPS: u32 = 20;

struct Session {
    stop: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    gone: Arc<AtomicBool>,
    capture: Option<JoinHandle<()>>,
    encoder: Option<JoinHandle<Result<(u32, u32, u64), String>>>,
}

fn sessions() -> &'static Mutex<HashMap<String, Session>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, Session>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

enum Source {
    Screen(xcap::Monitor),
    Window(xcap::Window),
}

impl Source {
    fn open(source_id: &str) -> Result<Source, String> {
        if let Some(id) = source_id.strip_prefix("window:") {
            let id: u32 = id.parse().map_err(|_| format!("Not a window source: {source_id}"))?;
            let win = xcap::Window::all().map_err(|e| e.to_string())?.into_iter().find(|w| w.id().ok() == Some(id));
            return win.map(Source::Window).ok_or_else(|| crate::window_rec::GONE.to_string());
        }
        let want = source_id.trim_start_matches("screen:");
        let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
        let mon = monitors
            .iter()
            .find(|m| !want.is_empty() && m.id().map(|id| id.to_string()).ok().as_deref() == Some(want))
            .or_else(|| monitors.iter().find(|m| m.is_primary().unwrap_or(false)))
            .or(monitors.first())
            .cloned()
            .ok_or_else(|| "No screen is available for capture.".to_string())?;
        Ok(Source::Screen(mon))
    }

    fn grab(&self) -> Option<RgbaImage> {
        let img = match self {
            Source::Screen(m) => m.capture_image().ok(),
            Source::Window(w) => w.capture_image().ok(),
        }?;
        (img.width() > 0 && img.height() > 0).then_some(img)
    }

    fn still_there(&self) -> bool {
        match self {
            Source::Screen(_) => true,
            Source::Window(w) => {
                let id = w.id().ok();
                xcap::Window::all().map(|all| all.iter().any(|x| x.id().ok() == id)).unwrap_or(false)
            }
        }
    }
}

fn even(n: u32) -> u32 {
    n.max(2) & !1
}

/// The frame size: the first frame scaled to fit `max_width`.
fn target_size(w: u32, h: u32, max_width: u32) -> (u32, u32) {
    if w <= max_width {
        return (even(w), even(h));
    }
    let scale = max_width as f64 / w as f64;
    (even(max_width), even((h as f64 * scale).round() as u32))
}

fn fit(img: RgbaImage, size: (u32, u32)) -> RgbaImage {
    if img.dimensions() == size {
        img
    } else {
        // Box-filter downscale: a filtered resize of a full screen costs more than a frame interval.
        // Called through DynamicImage so the code instantiated inside `image` (optimized in dev) runs.
        image::DynamicImage::ImageRgba8(img).thumbnail_exact(size.0, size.1).into_rgba8()
    }
}

/// Starts recording `source_id` ("screen:<id>" or "window:<id>") to `path`.
pub fn start(source_id: &str, path: &str, fps: u32, max_width: u32) -> Result<String, String> {
    // Fail before creating anything when the source cannot be opened.
    Source::open(source_id)?;
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = File::create(path).map_err(|e| e.to_string())?;

    let fps = fps.clamp(1, MAX_FPS);
    let max_width = max_width.max(64);
    let stop = Arc::new(AtomicBool::new(false));
    let paused = Arc::new(AtomicBool::new(false));
    let gone = Arc::new(AtomicBool::new(false));
    let (tx, rx) = sync_channel::<(RgbaImage, Duration)>(4);

    let capture = {
        let (stop, paused, gone, source_id) = (stop.clone(), paused.clone(), gone.clone(), source_id.to_string());
        std::thread::spawn(move || {
            // xcap handles are not Send: the source is opened on this thread.
            let Ok(source) = Source::open(&source_id) else {
                gone.store(true, Ordering::SeqCst);
                return;
            };
            let interval = Duration::from_secs_f64(1.0 / fps as f64);
            let started = Instant::now();
            let mut paused_for = Duration::ZERO;
            let mut misses = 0u32;
            let mut size = None;
            while !stop.load(Ordering::SeqCst) {
                if paused.load(Ordering::SeqCst) {
                    let t = Instant::now();
                    std::thread::sleep(Duration::from_millis(30));
                    paused_for += t.elapsed();
                    continue;
                }
                let t0 = Instant::now();
                match source.grab() {
                    Some(img) => {
                        misses = 0;
                        let size = *size.get_or_insert_with(|| target_size(img.width(), img.height(), max_width));
                        let at = started.elapsed().saturating_sub(paused_for);
                        // A slow encoder drops frames instead of falling behind; delays follow real time.
                        match tx.try_send((fit(img, size), at)) {
                            Ok(()) | Err(TrySendError::Full(_)) => {}
                            Err(TrySendError::Disconnected(_)) => break,
                        }
                    }
                    None => {
                        misses += 1;
                        if misses % 10 == 0 && !source.still_there() {
                            gone.store(true, Ordering::SeqCst);
                            break;
                        }
                    }
                }
                if let Some(rest) = interval.checked_sub(t0.elapsed()) {
                    std::thread::sleep(rest);
                }
            }
        })
    };

    let encoder = std::thread::spawn(move || encode(file, quantize_pool(rx), fps));

    static NEXT: AtomicU64 = AtomicU64::new(1);
    let token = format!("gif{}", NEXT.fetch_add(1, Ordering::SeqCst));
    sessions().lock().map_err(|e| e.to_string())?.insert(
        token.clone(),
        Session { stop, paused, gone, capture: Some(capture), encoder: Some(encoder) },
    );
    Ok(token)
}

/// Colour quantization dominates the cost of a frame and frames are
/// independent, so it runs on several workers; frames come back in order.
fn quantize_pool(rx: Receiver<(RgbaImage, Duration)>) -> Receiver<(gif::Frame<'static>, Duration)> {
    let workers = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).saturating_sub(1).clamp(1, 6);
    let rx = Arc::new(Mutex::new(rx.into_iter().enumerate()));
    let (done_tx, done_rx) = std::sync::mpsc::channel::<(usize, gif::Frame<'static>, Duration)>();
    for _ in 0..workers {
        let (rx, done_tx) = (rx.clone(), done_tx.clone());
        std::thread::spawn(move || loop {
            let next = rx.lock().ok().and_then(|mut it| it.next());
            let Some((seq, (mut img, at))) = next else { break };
            let (w, h) = img.dimensions();
            let frame = gif::Frame::from_rgba_speed(w as u16, h as u16, img.as_mut(), 10);
            if done_tx.send((seq, frame, at)).is_err() {
                break;
            }
        });
    }
    drop(done_tx);
    let (ordered_tx, ordered_rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut waiting = std::collections::BTreeMap::new();
        let mut next = 0usize;
        for (seq, frame, at) in done_rx {
            waiting.insert(seq, (frame, at));
            while let Some(item) = waiting.remove(&next) {
                if ordered_tx.send(item).is_err() {
                    return;
                }
                next += 1;
            }
        }
    });
    ordered_rx
}

/// Each frame is written once the next one arrives, so its delay is known.
fn encode(file: File, rx: Receiver<(gif::Frame<'static>, Duration)>, fps: u32) -> Result<(u32, u32, u64), String> {
    let mut writer: Option<gif::Encoder<BufWriter<File>>> = None;
    let mut file = Some(file);
    let mut pending: Option<(gif::Frame<'static>, Duration)> = None;
    let mut frames = 0u64;
    let nominal = (100 / fps).max(2) as u16;

    let mut put = |writer: &mut Option<gif::Encoder<BufWriter<File>>>, mut frame: gif::Frame<'static>, delay_cs: u16| -> Result<(), String> {
        if writer.is_none() {
            let mut enc = gif::Encoder::new(BufWriter::new(file.take().expect("file")), frame.width, frame.height, &[]).map_err(|e| e.to_string())?;
            enc.set_repeat(gif::Repeat::Infinite).map_err(|e| e.to_string())?;
            *writer = Some(enc);
        }
        frame.delay = delay_cs.max(2);
        writer.as_mut().expect("writer").write_frame(&frame).map_err(|e| e.to_string())?;
        frames += 1;
        Ok(())
    };

    let mut size = (0u32, 0u32);
    for (frame, at) in rx {
        size = (frame.width as u32, frame.height as u32);
        if let Some((prev, prev_at)) = pending.take() {
            let cs = ((at.saturating_sub(prev_at)).as_millis() / 10).clamp(2, u16::MAX as u128) as u16;
            put(&mut writer, prev, cs)?;
        }
        pending = Some((frame, at));
    }
    if let Some((last, _)) = pending.take() {
        put(&mut writer, last, nominal)?;
    }
    drop(put);
    if writer.is_none() {
        return Err("No frame could be captured.".into());
    }
    drop(writer);
    Ok((size.0, size.1, frames))
}

pub fn set_paused(token: &str, paused: bool) -> bool {
    sessions()
        .lock()
        .ok()
        .and_then(|map| map.get(token).map(|s| s.paused.store(paused, Ordering::SeqCst)))
        .is_some()
}

/// Whether the recorded window has disappeared.
pub fn is_gone(token: &str) -> bool {
    sessions().lock().ok().and_then(|map| map.get(token).map(|s| s.gone.load(Ordering::SeqCst))).unwrap_or(true)
}

/// Stops the recording and finishes the file.
pub fn stop(token: &str, path: &str) -> Result<Value, String> {
    let mut session = sessions()
        .lock()
        .map_err(|e| e.to_string())?
        .remove(token)
        .ok_or_else(|| "Recording is not running.".to_string())?;
    session.stop.store(true, Ordering::SeqCst);
    if let Some(h) = session.capture.take() {
        let _ = h.join();
    }
    let (width, height, frames) = session
        .encoder
        .take()
        .map(|h| h.join().map_err(|_| "The GIF encoder stopped unexpectedly.".to_string())?)
        .unwrap_or_else(|| Err("Recording is not running.".into()))?;
    let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    Ok(json!({ "width": width, "height": height, "frames": frames, "bytes": bytes }))
}
