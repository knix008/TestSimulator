// 박스의 파일을 다른 프로그램으로 끌어 넘긴다 (Electron 의 webContents.startDrag).
//
// 탐색기와 같은 셸 데이터 객체를 넘긴다. 받는 쪽이 복사하든, 옮기든, 바로가기를 만들든
// 그 쪽이 고른다. 손을 뗄 때까지 돌아오지 않는다. 메인 스레드에서 부른다.

use std::ffi::c_void;

use windows::core::{implement, Interface, PCWSTR};
use windows::Win32::Foundation::{DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS, HWND, POINT, SIZE};
use windows::Win32::Graphics::Gdi::{CreateDIBSection, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS};
use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, IDataObject, CLSCTX_INPROC_SERVER};
use windows::Win32::System::Ole::{DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_LINK, DROPEFFECT_MOVE};
use windows::Win32::System::SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS};
use windows::Win32::UI::Shell::Common::ITEMIDLIST;
use windows::Win32::UI::Shell::{
    BHID_DataObject, CLSID_DragDropHelper, IDragSourceHelper, IShellItemArray, SHCreateShellItemArrayFromIDLists, SHParseDisplayName,
    SHDRAGIMAGE,
};

use crate::image::Picture;
use crate::reg::wide;

#[implement(IDropSource)]
struct Source;

impl IDropSource_Impl for Source_Impl {
    fn QueryContinueDrag(&self, escape: windows::core::BOOL, keys: MODIFIERKEYS_FLAGS) -> windows::core::HRESULT {
        if escape.as_bool() {
            return DRAGDROP_S_CANCEL;
        }
        if keys & MK_LBUTTON == MODIFIERKEYS_FLAGS(0) {
            return DRAGDROP_S_DROP;
        }
        windows::core::HRESULT(0)
    }

    fn GiveFeedback(&self, _effect: DROPEFFECT) -> windows::core::HRESULT {
        DRAGDROP_S_USEDEFAULTCURSORS
    }
}

fn data_object(files: &[String]) -> Option<IDataObject> {
    unsafe {
        let mut pidls: Vec<*mut ITEMIDLIST> = Vec::new();
        for f in files {
            let w = wide(&f.replace('/', "\\"));
            let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
            if SHParseDisplayName(PCWSTR(w.as_ptr()), None, &mut pidl, 0, None).is_ok() && !pidl.is_null() {
                pidls.push(pidl);
            }
        }
        if pidls.is_empty() {
            return None;
        }
        let list: Vec<*const ITEMIDLIST> = pidls.iter().map(|p| *p as *const ITEMIDLIST).collect();
        let array: Option<IShellItemArray> = SHCreateShellItemArrayFromIDLists(&list).ok();
        for p in pidls {
            CoTaskMemFree(Some(p as *const c_void));
        }
        let array = array?;
        array.BindToHandler(None, &BHID_DataObject).ok()
    }
}

// 끄는 동안 커서 밑에 보일 그림. 셸은 아래에서 위로 쌓인, 곱한 알파의 비트맵을 받는다.
fn drag_image(pic: &Picture) -> Option<SHDRAGIMAGE> {
    let info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: pic.width as i32,
            biHeight: pic.height as i32,
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
        let row = (pic.width * 4) as usize;
        for y in 0..pic.height as usize {
            let src = &pic.rgba[y * row..(y + 1) * row];
            let dst = &mut out[(pic.height as usize - 1 - y) * row..(pic.height as usize - y) * row];
            for (d, s) in dst.chunks_exact_mut(4).zip(src.chunks_exact(4)) {
                let a = s[3] as u32;
                d[0] = (s[2] as u32 * a / 255) as u8;
                d[1] = (s[1] as u32 * a / 255) as u8;
                d[2] = (s[0] as u32 * a / 255) as u8;
                d[3] = s[3];
            }
        }
        Some(SHDRAGIMAGE {
            sizeDragImage: SIZE { cx: pic.width as i32, cy: pic.height as i32 },
            ptOffset: POINT { x: pic.width as i32 / 2, y: pic.height as i32 / 2 },
            hbmpDragImage: bmp,
            crColorKey: windows::Win32::Foundation::COLORREF(0xffff_ffff),
        })
    }
}

// 끌어 넘긴다. 운영체제가 끌기를 받아들였으면 참 (놓았든 그만두었든).
pub fn start(_owner: HWND, files: &[String], icon: Option<&Picture>) -> bool {
    unsafe {
        let _ = OleInitialize(None);
        let Some(data) = data_object(files) else { return false };
        if let Some(pic) = icon {
            if let Ok(helper) = CoCreateInstance::<_, IDragSourceHelper>(&CLSID_DragDropHelper, None, CLSCTX_INPROC_SERVER) {
                if let Some(image) = drag_image(pic) {
                    let _ = helper.InitializeFromBitmap(&image, &data);
                }
            }
        }
        let source: IDropSource = Source.into();
        let mut effect = DROPEFFECT(0);
        let hr = DoDragDrop(&data, &source, DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK, &mut effect);
        let _ = data.as_raw();
        hr == DRAGDROP_S_DROP || hr == DRAGDROP_S_CANCEL
    }
}
