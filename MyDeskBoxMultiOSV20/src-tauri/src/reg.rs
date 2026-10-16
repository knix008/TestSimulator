// Windows 레지스트리 몇 가지. Electron 판은 reg.exe 를 불렀다. 여기서는 바로 읽고 쓴다.

use windows::core::PCWSTR;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY, HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, REG_DWORD, REG_SZ,
    REG_VALUE_TYPE, RRF_RT_REG_DWORD, RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ, RRF_NOEXPAND,
};

pub const HKCU: HKEY = HKEY_CURRENT_USER;
pub const HKCR: HKEY = HKEY_CLASSES_ROOT;

pub fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

// 글 값. REG_EXPAND_SZ 는 펼치지 않고 그대로 준다 (Electron 판 reg query 와 같다).
pub fn read_string(root: HKEY, key: &str, name: &str) -> Option<String> {
    let k = wide(key);
    let n = wide(name);
    let flags = RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ | RRF_NOEXPAND;
    let mut size: u32 = 0;
    unsafe {
        let got = RegGetValueW(root, PCWSTR(k.as_ptr()), PCWSTR(n.as_ptr()), flags, None, None, Some(&mut size));
        if got != ERROR_SUCCESS || size == 0 {
            return None;
        }
        let mut buf = vec![0u16; (size as usize).div_ceil(2) + 1];
        let mut kind = REG_VALUE_TYPE(0);
        let got = RegGetValueW(
            root,
            PCWSTR(k.as_ptr()),
            PCWSTR(n.as_ptr()),
            flags,
            Some(&mut kind),
            Some(buf.as_mut_ptr() as *mut _),
            Some(&mut size),
        );
        if got != ERROR_SUCCESS {
            return None;
        }
        let end = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..end]))
    }
}

pub fn read_dword(root: HKEY, key: &str, name: &str) -> Option<u32> {
    let k = wide(key);
    let n = wide(name);
    let mut value: u32 = 0;
    let mut size: u32 = 4;
    let got = unsafe {
        RegGetValueW(
            root,
            PCWSTR(k.as_ptr()),
            PCWSTR(n.as_ptr()),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut value as *mut u32 as *mut _),
            Some(&mut size),
        )
    };
    (got == ERROR_SUCCESS).then_some(value)
}

pub fn write_dword(root: HKEY, key: &str, name: &str, value: u32) -> bool {
    let k = wide(key);
    let n = wide(name);
    let got = unsafe {
        RegSetKeyValueW(root, PCWSTR(k.as_ptr()), PCWSTR(n.as_ptr()), REG_DWORD.0, Some(&value as *const u32 as *const _), 4)
    };
    got == ERROR_SUCCESS
}

pub fn write_string(root: HKEY, key: &str, name: &str, value: &str) -> bool {
    let k = wide(key);
    let n = wide(name);
    let v = wide(value);
    let got = unsafe {
        RegSetKeyValueW(
            root,
            PCWSTR(k.as_ptr()),
            PCWSTR(n.as_ptr()),
            REG_SZ.0,
            Some(v.as_ptr() as *const _),
            (v.len() * 2) as u32,
        )
    };
    got == ERROR_SUCCESS
}

pub fn delete_value(root: HKEY, key: &str, name: &str) -> bool {
    let k = wide(key);
    let n = wide(name);
    unsafe { RegDeleteKeyValueW(root, PCWSTR(k.as_ptr()), PCWSTR(n.as_ptr())) == ERROR_SUCCESS }
}
