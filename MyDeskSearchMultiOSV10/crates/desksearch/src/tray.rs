use tray_icon::menu::{Icon, IconMenuItem, Menu, MenuEvent};
use tray_icon::{Icon as TrayIconImage, TrayIcon, TrayIconBuilder, TrayIconEvent};

pub struct Tray {
    _icon: TrayIcon,
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
        Ok(Self {
            _icon: icon,
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
        while let Ok(event) = TrayIconEvent::receiver().try_recv() {
            if matches!(
                event,
                TrayIconEvent::DoubleClick { .. } | TrayIconEvent::Click { .. }
            ) {
                return Some(TrayAction::Show);
            }
        }
        match MenuEvent::receiver().try_recv() {
            Ok(event) => match event.id.0.as_str() {
                "show" => Some(TrayAction::Show),
                "hide" => Some(TrayAction::Hide),
                "settings" => Some(TrayAction::Settings),
                "exit" => Some(TrayAction::Exit),
                _ => None,
            },
            Err(_) => None,
        }
    }
}

fn label(language: &str, key: &str) -> String {
    desksearch_core::locale::t(language, key)
}

fn app_icon() -> TrayIconImage {
    glyph(32, |x, y| {
        let center = 15.5;
        let dx = x as f32 - center;
        let dy = y as f32 - center;
        let distance = (dx * dx + dy * dy).sqrt();
        let ring = distance < 11.0 && distance > 6.5;
        let handle = dx > 4.0 && dy > 4.0 && (dy - dx).abs() < 2.2 && distance < 16.0;
        if ring || handle {
            [40, 110, 220, 255]
        } else {
            [0, 0, 0, 0]
        }
    })
    .into_tray()
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

    fn into_tray(self) -> TrayIconImage {
        TrayIconImage::from_rgba(self.rgba, self.size, self.size).expect("tray icon")
    }
}
