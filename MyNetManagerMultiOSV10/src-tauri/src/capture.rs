//! Live capture commands (libpcap / Npcap loaded at run time). The pcap core is `capture/pcap.rs`
//! (no Tauri); this file keeps the per-window capture table and the Tauri commands.
//!
//! ───────────────────────── INTEGRATION (what lib.rs / Cargo.toml need)
//!
//! Cargo.toml:
//!   [dependencies]
//!   libloading = "0.8"
//!   serde = { version = "1", features = ["derive"] }          # already there
//!   tauri = { version = "2", ... }                            # already there (uses tauri::ipc::Channel)
//!   [target.'cfg(windows)'.dependencies]
//!   windows = { version = "0.62", features = [ ...existing...,
//!       "Win32_NetworkManagement_IpHelper", "Win32_NetworkManagement_Ndis", "Win32_Networking_WinSock" ] }
//!   (no Linux / macOS specific dependencies; Win32_System_LibraryLoader is not needed: Packet.dll is
//!   pre-loaded and wpcap.dll is loaded with LOAD_WITH_ALTERED_SEARCH_PATH through libloading)
//!
//! lib.rs:
//!   pub mod capture;                                          (or `mod capture;`)
//!   .manage(capture::CaptureState::default())
//!   tauri::generate_handler![ ...,
//!       capture::capture_backend,
//!       capture::capture_interfaces,
//!       capture::capture_check_filter,
//!       capture::capture_start,
//!       capture::capture_stop,
//!       capture::capture_stats,
//!       capture::capture_reset,
//!   ]
//!   Optional, so a closed window never leaves a capture running:
//!   .on_window_event(|window, event| if let tauri::WindowEvent::Destroyed = event {
//!       window.state::<capture::CaptureState>().stop_window(window.label());
//!   })
//!
//! Capabilities: none beyond `core:default` (the app's own commands are not permission-gated without
//! an app manifest; `capture-stopped` is received with `core:event:default`, Channels need nothing).
//!
//! ───────────────────────── page contract (ARCHITECTURE.md "Live capture")
//!
//! invoke('capture_backend')                          → { available, library, version, error, code, adminOnly, elevated, needsPrompt }
//!   needsPrompt: Npcap is for administrators only and this process is not elevated. The first capture_start
//!   then shows a Windows UAC prompt (NpcapHelper.exe) and waits until it is answered; until a capture was
//!   started, the interface list comes from the Windows adapter table so start-up never touches the driver.
//! invoke('capture_interfaces')                       → [{ name, description, friendly, addresses, loopback, up, running, wireless, linktype }]
//! invoke('capture_check_filter', { linktype, filter }) → { ok, error }
//! invoke('capture_start', { options: { iface, snaplen, promisc, filter, bufferMb, timeoutMs, monitor }, onPackets: Channel })
//!                                                    → { id, linktype, snaplen, nanosecond, warning }
//!   onPackets receives ArrayBuffers: [u32 count] then per packet [u32 sec][u32 nsec][u32 caplen][u32 len][caplen bytes], LE,
//!   about every 100 ms or 512 KiB.
//! invoke('capture_stop', { id }) / invoke('capture_stats', { id }) → { recv, drop, ifdrop }
//! invoke('capture_reset')   stops every capture started by the calling window (a reloaded page calls it first)
//! event 'capture-stopped' { id, error, code } to the starting window when a capture ends on its own.
//! Errors reject with { code, message }; codes: no_library, permission, no_such_device, activate_failed,
//! filter_invalid, rfmon_unsupported, iface_not_up, findalldevs_failed, capture_error, not_found, invalid_argument, internal.

mod pcap;

pub use pcap::{BackendInfo, CaptureError, FilterCheck, Interface, StartOptions, Stats};

use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, Webview};

struct Entry {
    capture: Arc<pcap::LiveCapture>,
    window: String,
}

#[derive(Default)]
struct Table {
    live: HashMap<u32, Entry>,
    /// Final statistics of captures that ended on their own, until the page stops them.
    ended: HashMap<u32, Stats>,
}

/// Running captures, one per id. Managed with `.manage(CaptureState::default())`.
#[derive(Default)]
pub struct CaptureState {
    next_id: AtomicU32,
    table: Mutex<Table>,
}

impl CaptureState {
    fn table(&self) -> std::sync::MutexGuard<'_, Table> {
        self.table.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn take_where(&self, keep: impl Fn(&Entry) -> bool) -> Vec<Entry> {
        let mut t = self.table();
        let ids: Vec<u32> = t.live.iter().filter(|(_, e)| !keep(e)).map(|(id, _)| *id).collect();
        ids.into_iter().filter_map(|id| t.live.remove(&id)).collect()
    }

    /// Stops the captures of a window without blocking the caller (the threads finish in the background).
    pub fn stop_window(&self, label: &str) {
        stop_in_background(self.take_where(|e| e.window != label));
    }

    /// Stops every capture without blocking the caller.
    pub fn stop_all(&self) {
        stop_in_background(self.take_where(|_| false));
    }
}

fn stop_in_background(entries: Vec<Entry>) {
    if entries.is_empty() {
        return;
    }
    for e in &entries {
        e.capture.request_stop();
    }
    std::thread::spawn(move || {
        for e in entries {
            e.capture.stop();
        }
    });
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, CaptureError> + Send + 'static) -> Result<T, CaptureError> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| CaptureError::new("internal", e.to_string()))?
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Started {
    pub id: u32,
    pub linktype: i32,
    pub snaplen: i32,
    /// Timestamps carry real nanoseconds (otherwise microseconds × 1000).
    pub nanosecond: bool,
    /// Activation warning (e.g. promiscuous mode not supported).
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct StoppedEvent {
    id: u32,
    error: Option<String>,
    code: Option<String>,
}

#[tauri::command]
pub async fn capture_backend() -> Result<BackendInfo, CaptureError> {
    blocking(|| Ok(pcap::backend_info())).await
}

#[tauri::command]
pub async fn capture_interfaces() -> Result<Vec<Interface>, CaptureError> {
    blocking(pcap::interfaces).await
}

#[tauri::command]
pub async fn capture_check_filter(linktype: i32, filter: String) -> Result<FilterCheck, CaptureError> {
    blocking(move || pcap::check_filter(linktype, &filter)).await
}

#[tauri::command]
pub async fn capture_start<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    state: State<'_, CaptureState>,
    options: StartOptions,
    on_packets: Channel<InvokeResponseBody>,
) -> Result<Started, CaptureError> {
    let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let window = webview.label().to_string();
    let end_app = app.clone();
    let end_window = window.clone();
    let on_batch: pcap::BatchSink = Box::new(move |batch| on_packets.send(InvokeResponseBody::Raw(batch)).is_ok());
    let on_end: pcap::EndSink = Box::new(move |requested, error, stats| {
        if requested {
            return;
        }
        let state = end_app.state::<CaptureState>();
        let entry = {
            let mut t = state.table();
            t.ended.insert(id, stats);
            t.live.remove(&id)
        };
        // Dropping the last handle here is fine: `stop()` does not join its own thread.
        drop(entry);
        let payload = StoppedEvent {
            id,
            code: error.as_ref().map(|e| e.code.to_string()),
            error: Some(error.map(|e| e.message).unwrap_or_else(|| "capture ended".into())),
        };
        let _ = end_app.emit_to(end_window.as_str(), "capture-stopped", payload);
    });
    let capture = blocking(move || pcap::start(&options, on_batch, on_end)).await?;
    let capture = Arc::new(capture);
    let started = Started { id, linktype: capture.linktype, snaplen: capture.snaplen, nanosecond: capture.nanosecond, warning: capture.warning.clone() };
    {
        let mut t = state.table();
        // It may already have failed (interface gone right away): then it is in `ended`.
        if !t.ended.contains_key(&id) {
            t.live.insert(id, Entry { capture, window });
        }
    }
    Ok(started)
}

#[tauri::command]
pub async fn capture_stop(state: State<'_, CaptureState>, id: u32) -> Result<Stats, CaptureError> {
    let (entry, ended) = {
        let mut t = state.table();
        (t.live.remove(&id), t.ended.remove(&id))
    };
    match (entry, ended) {
        (Some(entry), _) => blocking(move || Ok(entry.capture.stop())).await,
        (None, Some(stats)) => Ok(stats),
        (None, None) => Err(CaptureError::new(pcap::E_NOT_FOUND, format!("no capture {id}"))),
    }
}

#[tauri::command]
pub async fn capture_stats(state: State<'_, CaptureState>, id: u32) -> Result<Stats, CaptureError> {
    let t = state.table();
    if let Some(e) = t.live.get(&id) {
        return Ok(e.capture.stats());
    }
    t.ended.get(&id).copied().ok_or_else(|| CaptureError::new(pcap::E_NOT_FOUND, format!("no capture {id}")))
}

/// Stops every capture the calling window started (a reloaded page has lost its channels).
#[tauri::command]
pub async fn capture_reset<R: Runtime>(webview: Webview<R>, state: State<'_, CaptureState>) -> Result<(), CaptureError> {
    state.stop_window(webview.label());
    Ok(())
}
