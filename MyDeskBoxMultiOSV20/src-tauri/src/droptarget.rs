// 박스 창이 끌려 오는 것을 받는 자리. wry 가 걸어 둔 것을 이것으로 바꿔 건다.
//
// wry 의 것은 파일 목록(CF_HDROP)이 있을 때만 '복사'로 답하고, 그 밖에는 '놓을 수 없음'으로 둔다.
// 내놓는 쪽이 복사를 허락하지 않아도 '복사'라 답해 역시 '놓을 수 없음'이 된다.
// 그런데 바탕화면에서 끌어 온 것은 감시 스레드가 손을 뗀 자리를 보고 옮기므로 실제로는 들어간다.
// 그래서 여러 개를 끌어 오면 커서는 못 놓는다고 보이는데 옮겨지고 있었다.
//
// 박스에 놓는 것은 언제나 옮기는 일이다. 파일이든 휴지통 같은 셸 항목이든 '옮기기'로 답한다.
// 페이지에는 Tauri 와 같은 이름과 모양으로 알린다 (bridge.js 의 onFileDrag 가 그대로 받는다).
// 놓은 뒤에는 '아무것도 안 함'으로 답한다. 옮기는 일은 우리가 한다. '옮기기'로 답하면
// 내놓은 쪽(탐색기)이 원본을 지우려 들 수 있다.

use windows::core::{implement, Ref, Result};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, POINTL, TRUE};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::System::Com::{CoCreateInstance, IDataObject, CLSCTX_INPROC_SERVER, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL};
use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
use windows::Win32::System::Ole::{
    IDropTarget, IDropTarget_Impl, OleInitialize, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop, CF_HDROP, DROPEFFECT, DROPEFFECT_COPY,
    DROPEFFECT_LINK, DROPEFFECT_MOVE, DROPEFFECT_NONE,
};
use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
use windows::Win32::UI::Shell::{CLSID_DragDropHelper, DragQueryFileW, IDropTargetHelper, HDROP};
use windows::Win32::UI::WindowsAndMessaging::EnumChildWindows;

use crate::reg::wide;

pub enum Event {
    Enter(Vec<String>, (f64, f64)),
    Over((f64, f64)),
    Drop(Vec<String>, (f64, f64)),
    Leave,
}

// 커서에 보일 일. 받을 수 있으면 허락된 것 가운데 옮기기, 복사, 바로 가기 순으로 고른다.
pub fn effect_for(allowed: u32, accepts: bool) -> u32 {
    if !accepts {
        return DROPEFFECT_NONE.0;
    }
    [DROPEFFECT_MOVE.0, DROPEFFECT_COPY.0, DROPEFFECT_LINK.0]
        .into_iter()
        .find(|e| allowed & e != 0)
        .unwrap_or(DROPEFFECT_NONE.0)
}

#[implement(IDropTarget)]
struct Target {
    hwnd: HWND,
    accepts: std::cell::Cell<bool>,
    helper: Option<IDropTargetHelper>,
    send: Box<dyn Fn(Event)>,
}

fn format(cf: u16) -> FORMATETC {
    FORMATETC { cfFormat: cf, ptd: std::ptr::null_mut(), dwAspect: DVASPECT_CONTENT.0, lindex: -1, tymed: TYMED_HGLOBAL.0 as u32 }
}

// 바탕화면의 휴지통처럼 파일이 아닌 셸 항목은 파일 목록 없이 이것만 싣고 온다.
fn shell_list_format() -> u16 {
    let name = wide("Shell IDList Array");
    unsafe { RegisterClipboardFormatW(windows::core::PCWSTR(name.as_ptr())) as u16 }
}

fn has(data: &IDataObject, cf: u16) -> bool {
    unsafe { data.QueryGetData(&format(cf)).is_ok() }
}

fn files_of(data: &IDataObject) -> Vec<String> {
    let mut out = Vec::new();
    unsafe {
        let Ok(mut medium) = data.GetData(&format(CF_HDROP.0)) else { return out };
        let drop = HDROP(medium.u.hGlobal.0);
        let count = DragQueryFileW(drop, 0xFFFF_FFFF, None);
        for index in 0..count {
            let chars = DragQueryFileW(drop, index, None) as usize;
            let mut buf = vec![0u16; chars + 1];
            let wrote = DragQueryFileW(drop, index, Some(&mut buf)) as usize;
            out.push(String::from_utf16_lossy(&buf[..wrote]));
        }
        ReleaseStgMedium(&mut medium);
    }
    out
}

impl Target {
    fn client(&self, pt: &POINTL) -> (f64, f64) {
        let mut p = POINT { x: pt.x, y: pt.y };
        unsafe {
            let _ = ScreenToClient(self.hwnd, &mut p);
        }
        (p.x as f64, p.y as f64)
    }

    fn answer(&self, effect: *mut DROPEFFECT) {
        if effect.is_null() {
            return;
        }
        unsafe { *effect = DROPEFFECT(effect_for((*effect).0, self.accepts.get())) };
    }
}

impl IDropTarget_Impl for Target_Impl {
    fn DragEnter(&self, data: Ref<'_, IDataObject>, _keys: MODIFIERKEYS_FLAGS, pt: &POINTL, effect: *mut DROPEFFECT) -> Result<()> {
        let data = data.ok()?;
        let accepts = has(data, CF_HDROP.0) || has(data, shell_list_format());
        self.accepts.set(accepts);
        self.answer(effect);
        if let Some(helper) = &self.helper {
            let mut p = POINT { x: pt.x, y: pt.y };
            unsafe {
                let _ = helper.DragEnter(self.hwnd, data, &mut p, *effect);
            }
        }
        if accepts {
            (self.send)(Event::Enter(files_of(data), self.client(pt)));
        }
        Ok(())
    }

    fn DragOver(&self, _keys: MODIFIERKEYS_FLAGS, pt: &POINTL, effect: *mut DROPEFFECT) -> Result<()> {
        self.answer(effect);
        if let Some(helper) = &self.helper {
            let mut p = POINT { x: pt.x, y: pt.y };
            unsafe {
                let _ = helper.DragOver(&mut p, *effect);
            }
        }
        if self.accepts.get() {
            (self.send)(Event::Over(self.client(pt)));
        }
        Ok(())
    }

    fn DragLeave(&self) -> Result<()> {
        if let Some(helper) = &self.helper {
            unsafe {
                let _ = helper.DragLeave();
            }
        }
        if self.accepts.replace(false) {
            (self.send)(Event::Leave);
        }
        Ok(())
    }

    fn Drop(&self, data: Ref<'_, IDataObject>, _keys: MODIFIERKEYS_FLAGS, pt: &POINTL, effect: *mut DROPEFFECT) -> Result<()> {
        let data = data.ok()?;
        if let Some(helper) = &self.helper {
            let mut p = POINT { x: pt.x, y: pt.y };
            unsafe {
                let _ = helper.Drop(data, &mut p, *effect);
            }
        }
        if !effect.is_null() {
            unsafe { *effect = DROPEFFECT_NONE };
        }
        if self.accepts.replace(false) {
            (self.send)(Event::Drop(files_of(data), self.client(pt)));
        }
        Ok(())
    }
}

unsafe extern "system" fn collect(child: HWND, list: LPARAM) -> windows::core::BOOL {
    (*(list.0 as *mut Vec<HWND>)).push(child);
    TRUE
}

// wry 가 건 것을 걷고 우리 것을 건다. wry 처럼 자식 창에도 건다. 창을 만든 메인 스레드에서 부른다.
pub fn install(hwnd: HWND, send: Box<dyn Fn(Event)>) {
    unsafe {
        let _ = OleInitialize(None);
        let helper = CoCreateInstance::<_, IDropTargetHelper>(&CLSID_DragDropHelper, None, CLSCTX_INPROC_SERVER).ok();
        let target: IDropTarget = Target { hwnd, accepts: std::cell::Cell::new(false), helper, send }.into();
        let mut list: Vec<HWND> = vec![hwnd];
        let _ = EnumChildWindows(Some(hwnd), Some(collect), LPARAM(&mut list as *mut Vec<HWND> as isize));
        for one in list {
            let _ = RevokeDragDrop(one);
            // 등록이 참조를 쥐고 있다. 창이 사라질 때 운영체제가 놓는다.
            let _ = RegisterDragDrop(one, &target);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: u32 = 1 | 2 | 4;

    #[test]
    fn a_box_answers_move_whenever_it_can() {
        assert_eq!(effect_for(ALL, true), DROPEFFECT_MOVE.0);
        assert_eq!(effect_for(DROPEFFECT_MOVE.0, true), DROPEFFECT_MOVE.0);
    }

    #[test]
    fn it_never_answers_an_effect_the_source_forbids() {
        assert_eq!(effect_for(DROPEFFECT_COPY.0 | DROPEFFECT_LINK.0, true), DROPEFFECT_COPY.0);
        assert_eq!(effect_for(DROPEFFECT_LINK.0, true), DROPEFFECT_LINK.0);
        assert_eq!(effect_for(0, true), DROPEFFECT_NONE.0);
    }

    #[test]
    fn data_it_cannot_read_is_refused() {
        assert_eq!(effect_for(ALL, false), DROPEFFECT_NONE.0);
    }
}
