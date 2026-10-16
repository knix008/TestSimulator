// 켜 있는 동안 바탕화면을 지켜본다 (Electron 판 main.js 의 watchDrag, watchDoubleClick, watchDesktop, sweep).
//
//  - 바탕화면에서 사각형을 끌면 박스를 만들지 묻는다. 아이콘을 박스 위로 끌어 놓으면 담는다.
//  - 바탕화면 빈 곳을 두 번 누르면 박스를 감추거나 보인다.
//  - 바탕화면 폴더가 바뀌면 곧바로 박스를 맞춘다.
//  - 3초마다 한 번, 끌고 있지 않으면 박스를 맞추고 가린 아이콘을 밀어낸다.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::host::{self, Incoming, Shared};

pub struct Watch {
    stops: Vec<Arc<AtomicBool>>,
}

impl Watch {
    pub fn stop(&self) {
        for s in &self.stops {
            s.store(true, Ordering::SeqCst);
        }
    }
}

static RUNNING: std::sync::Mutex<Option<Watch>> = std::sync::Mutex::new(None);

pub fn keep(watch: Watch) {
    *RUNNING.lock().unwrap_or_else(|e| e.into_inner()) = Some(watch);
}

// 끝낼 때. 되돌리는 동안 바탕화면에서 끌어 온 것을 다시 담지 않게 먼저 멈춘다.
pub fn stop_all() {
    if let Some(w) = RUNNING.lock().unwrap_or_else(|e| e.into_inner()).take() {
        w.stop();
    }
}

pub fn start(sh: &Shared, #[cfg(windows)] desk: Arc<crate::desktop::windows::WinDesktop>) -> Watch {
    let mut stops = Vec::new();
    #[cfg(windows)]
    {
        use crate::desktop::windows::{watch_double_click, watch_drag, DragHooks};
        let (a, b, c, d, e) = (sh.clone(), sh.clone(), sh.clone(), sh.clone(), sh.clone());
        let hooks = DragHooks {
            on_rect: Box::new(move |rect| {
                let sh = a.clone();
                tauri::async_runtime::spawn(async move {
                    host::offer_fence(&sh, rect.x, rect.y, rect.width, rect.height).await;
                });
            }),
            on_settle: Box::new(move || host::lock(&b).refresh_icons()),
            on_drop: Box::new(move |items, dip| {
                let entries = items.into_iter().map(|e| Incoming::named(e.name, e.path)).collect();
                host::lock(&c).accept_desktop_drop(entries, dip);
            }),
            on_hover: Box::new(move |hit| {
                let mut h = host::lock(&d);
                match hit {
                    Some((item, at)) => h.hover_incoming(&item.path, at.x, at.y),
                    None => h.clear_hover(),
                }
            }),
            // 바탕화면을 누르면 박스 안에서 골라 둔 표시를 거둔다.
            on_press: Box::new(move || host::lock(&e).clear_picks(None)),
        };
        stops.push(watch_drag(desk.clone(), hooks));
        let t = sh.clone();
        stops.push(watch_double_click(desk, Box::new(move || host::lock(&t).toggle_hidden())));
    }
    stops.push(watch_folders(sh));
    stops.push(sweep(sh));
    Watch { stops }
}

// 바탕화면 폴더가 바뀌면 박스를 맞춘다. 몰아서 오는 알림은 400ms 를 기다렸다 한 번에 다룬다.
fn watch_folders(sh: &Shared) -> Arc<AtomicBool> {
    use notify::{RecursiveMode, Watcher};
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    let dirs = host::lock(sh).desk.desktop_directories();
    let shared = sh.clone();
    std::thread::Builder::new()
        .name("desk-folder".into())
        .spawn(move || {
            let (tx, rx) = std::sync::mpsc::channel();
            let Ok(mut watcher) = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
                if res.is_ok() {
                    let _ = tx.send(());
                }
            }) else {
                return;
            };
            for dir in &dirs {
                // 감시할 수 없는 폴더는 주기적인 확인에 맡긴다.
                let _ = watcher.watch(std::path::Path::new(dir), RecursiveMode::NonRecursive);
            }
            let mut due: Option<Instant> = None;
            while !flag.load(Ordering::SeqCst) {
                match rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(()) => due = Some(Instant::now() + Duration::from_millis(400)),
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                    Err(_) => break,
                }
                if due.map(|d| Instant::now() >= d).unwrap_or(false) {
                    due = None;
                    host::lock(&shared).refresh_icons();
                }
            }
            drop(watcher);
        })
        .ok();
    stop
}

fn sweep(sh: &Shared) -> Arc<AtomicBool> {
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    let shared = sh.clone();
    std::thread::Builder::new()
        .name("desk-sweep".into())
        .spawn(move || {
            while !flag.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_secs(3));
                if flag.load(Ordering::SeqCst) {
                    break;
                }
                let mut h = host::lock(&shared);
                if !h.desk.mouse_down() {
                    h.refresh_icons();
                }
            }
        })
        .ok();
    stop
}
