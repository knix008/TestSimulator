use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, Once};

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
    pub fn install(language: &str) -> tray_icon::Result<Self> {
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
        install_menu_watcher(sender);
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

    pub fn poll(&self) -> Option<TrayAction> {
        let mut action = None;
        while let Ok(next) = self.actions.try_recv() {
            if next == TrayAction::Exit {
                exit_immediately();
            }
            action = Some(next);
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
            if show && action.is_none() {
                action = Some(TrayAction::Show);
            }
        }
        action
    }
}

fn install_menu_watcher(sender: Sender<TrayAction>) {
    static SENDER: Mutex<Option<Sender<TrayAction>>> = Mutex::new(None);
    static START: Once = Once::new();
    if let Ok(mut slot) = SENDER.lock() {
        *slot = Some(sender);
    }
    START.call_once(|| {
        std::thread::Builder::new()
            .name("mydesksearch-tray".to_string())
            .spawn(|| {
                while let Ok(event) = MenuEvent::receiver().recv() {
                    if event.id.0 == "exit" {
                        exit_immediately();
                    }
                    let Ok(slot) = SENDER.lock() else {
                        continue;
                    };
                    let Some(sender) = slot.as_ref() else {
                        continue;
                    };
                    let action = match event.id.0.as_str() {
                        "show" => TrayAction::Show,
                        "hide" => TrayAction::Hide,
                        "settings" => TrayAction::Settings,
                        _ => continue,
                    };
                    let _ = sender.send(action);
                }
            })
            .ok();
    });
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
