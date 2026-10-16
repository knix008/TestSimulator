// 트레이로 끝내지 않는 길 (Electron 판 main.js 의 process.on('exit'), SIGINT, 로그아웃).
//
// 그때도 파일이 박스 폴더에 남아 있으면 바탕화면이 빈 채로 남는다. 그래서 모두 같은 되돌리기를 지난다.
//  - 로그아웃·시스템 종료 : 숨은 창이 WM_ENDSESSION 을 받는다 (이 창은 트레이 메뉴의 주인도 된다).
//  - Ctrl+C (개발 실행)   : 콘솔 처리기.

use std::sync::OnceLock;

use crate::host::Shared;

static HOST: OnceLock<Shared> = OnceLock::new();

pub fn attach(sh: Shared) {
    let _ = HOST.set(sh);
}

fn restore_now() {
    if let Some(sh) = HOST.get() {
        crate::app::restore_desktop(sh);
    }
}

#[cfg(windows)]
mod imp {
    use super::restore_now;
    use windows::core::{w, BOOL};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Console::{SetConsoleCtrlHandler, CTRL_BREAK_EVENT, CTRL_CLOSE_EVENT, CTRL_C_EVENT, CTRL_LOGOFF_EVENT, CTRL_SHUTDOWN_EVENT};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, RegisterClassW, WM_ENDSESSION, WM_QUERYENDSESSION, WNDCLASSW, WS_EX_TOOLWINDOW, WS_POPUP,
    };

    unsafe extern "system" fn proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        match msg {
            WM_QUERYENDSESSION => LRESULT(1),
            WM_ENDSESSION => {
                if w.0 != 0 {
                    restore_now();
                }
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, w, l),
        }
    }

    // 메인 스레드에서 부른다. 보이지 않는 맨 위 창이어야 시스템 종료 알림을 받는다.
    pub fn owner_window() -> u64 {
        unsafe {
            let Ok(module) = GetModuleHandleW(None) else { return 0 };
            let class = WNDCLASSW { lpfnWndProc: Some(proc), hInstance: module.into(), lpszClassName: w!("MyDeskBoxSession"), ..Default::default() };
            RegisterClassW(&class);
            let hwnd = CreateWindowExW(WS_EX_TOOLWINDOW, w!("MyDeskBoxSession"), w!("MyDeskBox"), WS_POPUP, 0, 0, 0, 0, None, None, Some(module.into()), None);
            hwnd.map(|h| h.0 as isize as u64).unwrap_or(0)
        }
    }

    unsafe extern "system" fn console(kind: u32) -> BOOL {
        if [CTRL_C_EVENT, CTRL_BREAK_EVENT, CTRL_CLOSE_EVENT, CTRL_LOGOFF_EVENT, CTRL_SHUTDOWN_EVENT].contains(&kind) {
            restore_now();
            std::process::exit(0);
        }
        BOOL(0)
    }

    pub fn watch_console() {
        unsafe {
            let _ = SetConsoleCtrlHandler(Some(console), true);
        }
    }
}

#[cfg(windows)]
pub use imp::{owner_window, watch_console};

#[cfg(not(windows))]
pub fn owner_window() -> u64 {
    0
}

// SIGINT·SIGTERM·SIGHUP 을 받는 스레드. 다른 스레드를 만들기 전(main 맨 앞)에 불러야
// 모든 스레드가 그 신호를 막아 두고, 이 스레드 하나만 sigwait 로 받는다.
#[cfg(not(windows))]
pub fn watch_console() {
    unsafe {
        let mut set: libc::sigset_t = std::mem::zeroed();
        libc::sigemptyset(&mut set);
        for sig in [libc::SIGINT, libc::SIGTERM, libc::SIGHUP] {
            libc::sigaddset(&mut set, sig);
        }
        libc::pthread_sigmask(libc::SIG_BLOCK, &set, std::ptr::null_mut());
        let wait = set;
        std::thread::spawn(move || {
            let mut got: libc::c_int = 0;
            if libc::sigwait(&wait, &mut got) == 0 {
                restore_now();
                std::process::exit(0);
            }
        });
    }
}
