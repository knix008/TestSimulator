// Any number of copies of the program may run at once. Each opens its own
// calculator, stepped down and right from the ones already on screen, or a
// new copy would land exactly on top of the last and look like nothing opened.

use tauri::{PhysicalPosition, WebviewWindow};

const STEP: f64 = 32.0;
// After this many the windows start again from the centre.
const CYCLE: u32 = 8;

fn step_px(window: &WebviewWindow) -> i32 {
    (STEP * window.scale_factor().unwrap_or(1.0)).round() as i32
}

/// The first step from the centre that no other copy's calculator sits on.
/// Called on the main window while it is still hidden and centred.
pub fn free_step(window: &WebviewWindow) -> u32 {
    let Ok(centre) = window.outer_position() else {
        return 0;
    };
    let step = step_px(window);
    let taken = other_calculators();
    (0..CYCLE)
        .find(|&k| {
            let x = centre.x + step * k as i32;
            let y = centre.y + step * k as i32;
            !taken.iter().any(|&(ox, oy)| (ox - x).abs() < step / 2 && (oy - y).abs() < step / 2)
        })
        .unwrap_or(taken.len() as u32 % CYCLE)
}

pub fn shift(window: &WebviewWindow, steps: u32) {
    if steps == 0 {
        return;
    }
    let Ok(position) = window.outer_position() else {
        return;
    };
    let offset = step_px(window) * steps as i32;
    let _ = window.set_position(PhysicalPosition::new(position.x + offset, position.y + offset));
}

/// Top-left corners of the calculators other copies have on screen.
#[cfg(windows)]
fn other_calculators() -> Vec<(i32, i32)> {
    use std::sync::Mutex;
    #[repr(C)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(callback: extern "system" fn(isize, isize) -> i32, param: isize) -> i32;
        fn IsWindowVisible(hwnd: isize) -> i32;
        fn GetWindowTextW(hwnd: isize, text: *mut u16, max: i32) -> i32;
        fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
        fn GetWindowRect(hwnd: isize, rect: *mut Rect) -> i32;
    }
    static FOUND: Mutex<Vec<(i32, i32)>> = Mutex::new(Vec::new());
    extern "system" fn visit(hwnd: isize, _: isize) -> i32 {
        unsafe {
            if IsWindowVisible(hwnd) == 0 {
                return 1;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == std::process::id() {
                return 1;
            }
            let mut text = [0u16; 64];
            let len = GetWindowTextW(hwnd, text.as_mut_ptr(), text.len() as i32);
            if len <= 0 || String::from_utf16_lossy(&text[..len as usize]) != "MyCalc 10.0" {
                return 1;
            }
            let mut rect = Rect { left: 0, top: 0, right: 0, bottom: 0 };
            if GetWindowRect(hwnd, &mut rect) != 0 {
                if let Ok(mut found) = FOUND.lock() {
                    found.push((rect.left, rect.top));
                }
            }
        }
        1
    }
    let Ok(mut found) = FOUND.lock() else {
        return Vec::new();
    };
    found.clear();
    drop(found);
    unsafe { EnumWindows(visit, 0) };
    FOUND.lock().map(|found| found.clone()).unwrap_or_default()
}

#[cfg(not(windows))]
fn other_calculators() -> Vec<(i32, i32)> {
    Vec::new()
}
