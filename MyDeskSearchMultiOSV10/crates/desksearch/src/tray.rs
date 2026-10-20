use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex, Once};

use eframe::egui;
use tray_icon::menu::{Icon, IconMenuItem, Menu, MenuEvent};
use tray_icon::{Icon as TrayIconImage, TrayIcon, TrayIconBuilder, TrayIconEvent};

pub struct Tray {
    _icon: TrayIcon,
    actions: Receiver<TrayAction>,
    show: IconMenuItem,
    hide: IconMenuItem,
    settings: IconMenuItem,
    exit: IconMenuItem,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayAction {
    Show,
    Hide,
    Settings,
    Exit,
}

impl Tray {
    pub fn install(language: &str, ctx: &egui::Context) -> tray_icon::Result<Self> {
        let show = IconMenuItem::with_id(
            "show",
            label(language, "Tray_ShowWindow"),
            true,
            Some(show_icon()),
            None,
        );
        let hide = IconMenuItem::with_id(
            "hide",
            label(language, "Menu_Hide"),
            true,
            Some(hide_icon()),
            None,
        );
        let settings = IconMenuItem::with_id(
            "settings",
            label(language, "Menu_Settings"),
            true,
            Some(settings_icon()),
            None,
        );
        let exit = IconMenuItem::with_id(
            "exit",
            label(language, "Menu_Exit"),
            true,
            Some(exit_icon()),
            None,
        );
        let menu = Menu::new();
        let _ = menu.append(&show);
        let _ = menu.append(&hide);
        let _ = menu.append(&settings);
        let _ = menu.append(&exit);
        let icon = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_tooltip(format!("MyDeskSearch {}", desksearch_core::VERSION))
            .with_icon(app_icon())
            .build()?;
        let (sender, actions) = mpsc::channel();
        install_menu_watcher(sender, ctx.clone());
        Ok(Self {
            _icon: icon,
            actions,
            show,
            hide,
            settings,
            exit,
        })
    }

    pub fn set_language(&self, language: &str) {
        self.show.set_text(label(language, "Tray_ShowWindow"));
        self.hide.set_text(label(language, "Menu_Hide"));
        self.settings.set_text(label(language, "Menu_Settings"));
        self.exit.set_text(label(language, "Menu_Exit"));
    }

    pub fn poll(&self) -> Vec<TrayAction> {
        let mut actions = Vec::new();
        while let Ok(next) = self.actions.try_recv() {
            actions.push(next);
        }
        while let Ok(event) = TrayIconEvent::receiver().try_recv() {
            let show = match event {
                TrayIconEvent::DoubleClick {
                    button: tray_icon::MouseButton::Left,
                    ..
                } => true,
                TrayIconEvent::Click {
                    button: tray_icon::MouseButton::Left,
                    button_state: tray_icon::MouseButtonState::Up,
                    ..
                } => true,
                _ => false,
            };
            if show {
                actions.push(TrayAction::Show);
            }
        }
        actions
    }
}

fn install_menu_watcher(sender: Sender<TrayAction>, ctx: egui::Context) {
    static SLOT: Mutex<Option<(Sender<TrayAction>, egui::Context)>> = Mutex::new(None);
    static START: Once = Once::new();
    if let Ok(mut slot) = SLOT.lock() {
        *slot = Some((sender, ctx));
    }
    START.call_once(|| {
        MenuEvent::set_event_handler(Some(|event: MenuEvent| {
            let action = match event.id.0.as_str() {
                "show" => TrayAction::Show,
                "hide" => TrayAction::Hide,
                "settings" => TrayAction::Settings,
                "exit" => TrayAction::Exit,
                _ => return,
            };
            if action == TrayAction::Exit {
                exit_immediately();
            }
            let Ok(slot) = SLOT.lock() else {
                return;
            };
            let Some((sender, ctx)) = slot.as_ref() else {
                return;
            };
            let sender = sender.clone();
            let ctx = ctx.clone();
            drop(slot);
            let _ = sender.send(action);
            apply_root_now(action);
            ctx.request_repaint_of(egui::ViewportId::ROOT);
        }));
    });
}

type WindowFn = Arc<dyn Fn() + Send + Sync>;

static SHOW_WINDOW: Mutex<Option<WindowFn>> = Mutex::new(None);
static HIDE_WINDOW: Mutex<Option<WindowFn>> = Mutex::new(None);

pub fn remember_root_window(frame: &eframe::Frame) {
    if SHOW_WINDOW
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(|_| ()))
        .is_some()
    {
        return;
    }
    let Some(window) = frame.winit_window().cloned() else {
        return;
    };
    let show = window.clone();
    let hide = window;
    if let Ok(mut slot) = SHOW_WINDOW.lock() {
        *slot = Some(Arc::new(move || {
            show.set_minimized(false);
            show.set_visible(true);
            let _ = show.focus_window();
            show.request_redraw();
        }));
    }
    if let Ok(mut slot) = HIDE_WINDOW.lock() {
        *slot = Some(Arc::new(move || {
            hide.set_visible(false);
        }));
    }
}

fn apply_root_now(action: TrayAction) {
    let callback = match action {
        TrayAction::Show | TrayAction::Settings => SHOW_WINDOW.lock().ok().and_then(|slot| slot.clone()),
        TrayAction::Hide => HIDE_WINDOW.lock().ok().and_then(|slot| slot.clone()),
        TrayAction::Exit => None,
    };
    if let Some(callback) = callback {
        callback();
    }
}

pub fn exit_immediately() -> ! {
    #[cfg(windows)]
    unsafe {
        TerminateProcess(GetCurrentProcess(), 0);
    }
    std::process::exit(0);
}

#[cfg(windows)]
unsafe extern "system" {
    fn GetCurrentProcess() -> *mut core::ffi::c_void;
    fn TerminateProcess(process: *mut core::ffi::c_void, exit_code: u32) -> i32;
}

fn label(language: &str, key: &str) -> String {
    desksearch_core::locale::t(language, key)
}

fn app_icon() -> TrayIconImage {
    let rgba = crate::app_icon::render(32);
    TrayIconImage::from_rgba(rgba, 32, 32).expect("tray icon")
}

fn show_icon() -> Icon {
    glyph(16, |x, y| {
        let dx = x as i32 - 6;
        let dy = y as i32 - 6;
        let distance = dx * dx + dy * dy;
        let ring = (8..=18).contains(&distance);
        let handle = x >= 10 && y >= 10 && (x as i32 - y as i32).abs() <= 1 && x < 15;
        if ring || handle {
            [37, 99, 235, 255]
        } else {
            [0, 0, 0, 0]
        }
    })
    .into_menu()
}

fn hide_icon() -> Icon {
    glyph(16, |x, y| {
        let bar = (6..=8).contains(&y) && (2..=13).contains(&x);
        if bar {
            [71, 85, 105, 255]
        } else {
            [0, 0, 0, 0]
        }
    })
    .into_menu()
}

fn settings_icon() -> Icon {
    glyph(16, |x, y| {
        let dx = x as i32 - 7;
        let dy = y as i32 - 7;
        let distance = dx * dx + dy * dy;
        let body = (6..=16).contains(&distance);
        let tooth = (dx.abs() <= 1 && (4..=7).contains(&dy.abs()))
            || (dy.abs() <= 1 && (4..=7).contains(&dx.abs()));
        if body || tooth {
            [37, 99, 235, 255]
        } else {
            [0, 0, 0, 0]
        }
    })
    .into_menu()
}

fn exit_icon() -> Icon {
    glyph(16, |x, y| {
        let inside = (3..=12).contains(&x) && (3..=12).contains(&y);
        let slash = (x as i32 - y as i32).abs() <= 1;
        let backslash = (x as i32 - (15 - y as i32)).abs() <= 1;
        if inside && (slash || backslash) {
            [220, 38, 38, 255]
        } else {
            [0, 0, 0, 0]
        }
    })
    .into_menu()
}

struct RgbaIcon {
    rgba: Vec<u8>,
    size: u32,
}

fn glyph(size: u32, pixel: impl Fn(u32, u32) -> [u8; 4]) -> RgbaIcon {
    let mut rgba = Vec::with_capacity((size * size * 4) as usize);
    for y in 0..size {
        for x in 0..size {
            rgba.extend_from_slice(&pixel(x, y));
        }
    }
    RgbaIcon { rgba, size }
}

impl RgbaIcon {
    fn into_menu(self) -> Icon {
        Icon::from_rgba(self.rgba, self.size, self.size).expect("menu icon")
    }
}
