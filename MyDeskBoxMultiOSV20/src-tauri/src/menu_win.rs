// Windows 팝업 메뉴. 그림·체크·라디오·단축키 글을 Electron 메뉴처럼 함께 보여 준다.
// (Tauri 의 메뉴는 라디오 항목에 그림을 붙일 수 없다. 테마 고르기에는 그 색 조각이 보여야 한다.)
//
// 메인 스레드에서만 부른다. TrackPopupMenu 는 그 스레드의 창을 주인으로 받는다.

use std::ffi::c_void;

use windows::core::PWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::{CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HBITMAP, HGDIOBJ};
use windows::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
use windows::Win32::UI::WindowsAndMessaging::{
    CreatePopupMenu, DestroyMenu, GetCursorPos, InsertMenuItemW, PostMessageW, SetForegroundWindow, TrackPopupMenu, HMENU,
    MENUITEMINFOW, MFS_CHECKED, MFS_DISABLED, MFT_RADIOCHECK, MFT_SEPARATOR, MFT_STRING, MIIM_BITMAP, MIIM_FTYPE, MIIM_ID,
    MIIM_STATE, MIIM_STRING, MIIM_SUBMENU, SM_CXSMICON, TPM_NONOTIFY, TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_NULL,
};

use crate::image::Picture;
use crate::ui::{Action, MenuIcon, MenuItem};

struct Built {
    actions: Vec<Action>,
    bitmaps: Vec<HBITMAP>,
    menus: Vec<HMENU>,
}

// 곱한 알파의 32비트 DIB. 메뉴는 이것을 투명하게 그린다.
fn bitmap(pic: &Picture) -> Option<HBITMAP> {
    let info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: pic.width as i32,
            biHeight: -(pic.height as i32),
            biPlanes: 1,
            biBitCount: 32,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bits: *mut c_void = std::ptr::null_mut();
    unsafe {
        let bmp = CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
        let out = std::slice::from_raw_parts_mut(bits as *mut u8, (pic.width * pic.height * 4) as usize);
        for (dst, src) in out.chunks_exact_mut(4).zip(pic.rgba.chunks_exact(4)) {
            let a = src[3] as u32;
            dst[0] = (src[2] as u32 * a / 255) as u8;
            dst[1] = (src[1] as u32 * a / 255) as u8;
            dst[2] = (src[0] as u32 * a / 255) as u8;
            dst[3] = src[3];
        }
        Some(bmp)
    }
}

fn add(menu: HMENU, at: u32, items: &[MenuItem], built: &mut Built, icon: &dyn Fn(&MenuIcon) -> Option<Picture>) {
    let mut pos = at;
    for item in items {
        let mut info = MENUITEMINFOW { cbSize: std::mem::size_of::<MENUITEMINFOW>() as u32, ..Default::default() };
        let mut text: Vec<u16>;
        if let MenuItem::Separator = item {
            info.fMask = MIIM_FTYPE;
            info.fType = MFT_SEPARATOR;
            unsafe {
                let _ = InsertMenuItemW(menu, pos, true, &info);
            }
            pos += 1;
            continue;
        }
        let (label, pic_icon) = match item {
            MenuItem::Action { label, icon, accel, .. } => {
                (if accel.is_empty() { label.clone() } else { format!("{label}\t{accel}") }, icon)
            }
            MenuItem::Check { label, icon, .. } | MenuItem::Radio { label, icon, .. } | MenuItem::Sub { label, icon, .. } => {
                (label.clone(), icon)
            }
            MenuItem::Separator => unreachable!(),
        };
        // 메뉴 글에서 & 는 밑줄 표시다. 글자 그대로 보이게 한다.
        text = label.replace('&', "&&").encode_utf16().chain(std::iter::once(0)).collect();
        info.fMask = MIIM_FTYPE | MIIM_STRING | MIIM_STATE | MIIM_ID;
        info.fType = MFT_STRING;
        info.dwTypeData = PWSTR(text.as_mut_ptr());
        info.cch = (text.len() - 1) as u32;
        if let Some(pic) = icon(pic_icon) {
            if let Some(bmp) = bitmap(&pic) {
                info.fMask |= MIIM_BITMAP;
                info.hbmpItem = bmp;
                built.bitmaps.push(bmp);
            }
        }
        match item {
            MenuItem::Action { enabled, action, .. } => {
                if !enabled {
                    info.fState = MFS_DISABLED;
                }
                built.actions.push(action.clone());
                info.wID = built.actions.len() as u32;
            }
            MenuItem::Check { checked, action, .. } => {
                if *checked {
                    info.fState = MFS_CHECKED;
                }
                built.actions.push(action.clone());
                info.wID = built.actions.len() as u32;
            }
            MenuItem::Radio { checked, action, .. } => {
                info.fType |= MFT_RADIOCHECK;
                if *checked {
                    info.fState = MFS_CHECKED;
                }
                built.actions.push(action.clone());
                info.wID = built.actions.len() as u32;
            }
            MenuItem::Sub { items, .. } => {
                let sub = unsafe { CreatePopupMenu() };
                if let Ok(sub) = sub {
                    built.menus.push(sub);
                    add(sub, 0, items, built, icon);
                    info.fMask |= MIIM_SUBMENU;
                    info.hSubMenu = sub;
                }
            }
            MenuItem::Separator => {}
        }
        unsafe {
            let _ = InsertMenuItemW(menu, pos, true, &info);
        }
        pos += 1;
    }
}

// 메뉴 그림 크기. 화면 배율을 따른다.
pub fn icon_size(owner: HWND) -> u32 {
    unsafe {
        let dpi = GetDpiForWindow(owner);
        let n = GetSystemMetricsForDpi(SM_CXSMICON, if dpi == 0 { 96 } else { dpi });
        if n <= 0 {
            16
        } else {
            n as u32
        }
    }
}

// 커서 자리에 메뉴를 띄우고, 고른 일을 돌려준다. 아무것도 고르지 않으면 None.
pub fn popup(owner: HWND, items: &[MenuItem], icon: &dyn Fn(&MenuIcon) -> Option<Picture>) -> Option<Action> {
    unsafe {
        let menu = CreatePopupMenu().ok()?;
        let mut built = Built { actions: vec![], bitmaps: vec![], menus: vec![] };
        add(menu, 0, items, &mut built, icon);
        let mut at = POINT::default();
        let _ = GetCursorPos(&mut at);
        // 트레이 메뉴는 주인 창을 앞으로 가져와야 바깥을 누를 때 닫힌다.
        let _ = SetForegroundWindow(owner);
        let picked = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_NONOTIFY, at.x, at.y, Some(0), owner, None);
        let _ = PostMessageW(Some(owner), WM_NULL, WPARAM(0), LPARAM(0));
        // 아래 메뉴는 위 메뉴와 함께 지워진다.
        let _ = DestroyMenu(menu);
        for bmp in built.bitmaps {
            let _ = DeleteObject(HGDIOBJ(bmp.0));
        }
        let id = picked.0 as usize;
        if id == 0 {
            return None;
        }
        built.actions.get(id - 1).cloned()
    }
}
