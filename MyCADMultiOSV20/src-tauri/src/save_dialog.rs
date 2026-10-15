//! The Windows Save dialog with MyCAD's options in it.
//!
//! Windows reserves an area under "Save as type" for file properties (author,
//! tags) that MyCAD does not use; on some Windows builds it is a large empty
//! block that cannot be removed. MyCAD fills it with its own save options
//! (IFileDialogCustomize: a labelled group of check boxes and drop-down lists)
//! and reads them back with the chosen path. Other systems use the plain
//! dialog (tauri-plugin-dialog) from the page.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Deserialize)]
pub struct Filter {
    pub name: String,
    pub extensions: Vec<String>,
}

/// A control in the options group. Ids are the page's names for the values.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Control {
    Check { id: String, label: String, checked: bool },
    Combo { id: String, label: String, items: Vec<(String, String)>, selected: String },
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Choice {
    pub path: String,
    /// Check boxes: true/false; drop-down lists: the chosen item's id.
    pub values: BTreeMap<String, serde_json::Value>,
}

/// The `*.ext;*.EXT` pattern of a filter (every extension, both cases for the dialog's display).
pub fn spec_of(filter: &Filter) -> String {
    filter.extensions.iter().map(|e| format!("*.{e}")).collect::<Vec<_>>().join(";")
}

/// Splits a suggested path into (folder, file name); either may be empty.
pub fn split_default(path: &str) -> (String, String) {
    let normal = path.replace('/', "\\");
    match normal.rfind('\\') {
        Some(i) => (normal[..i].to_string(), normal[i + 1..].to_string()),
        None => (String::new(), normal),
    }
}

/// Shows the dialog (blocking: run it off the main thread). `owner` is the HWND of the
/// window it belongs to. Ok(None) when cancelled.
#[cfg(target_os = "windows")]
pub fn show(owner: isize, title: Option<String>, default_path: Option<String>, filters: Vec<Filter>, group: String, controls: Vec<Control>) -> Result<Option<Choice>, String> {
    use windows::core::{Interface, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{ERROR_CANCELLED, HWND};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{FileSaveDialog, IFileDialogCustomize, IFileSaveDialog, IShellItem, SHCreateItemFromParsingName, FOS_FORCEFILESYSTEM, FOS_OVERWRITEPROMPT, FOS_PATHMUSTEXIST, SIGDN_FILESYSPATH};

    struct Com;
    impl Drop for Com {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let error = |e: windows::core::Error| e.message().to_string();
    unsafe {
        let init = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        let _com = if init.is_ok() { Some(Com) } else { None };
        let dialog: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER).map_err(error)?;
        dialog.SetOptions(dialog.GetOptions().map_err(error)? | FOS_OVERWRITEPROMPT | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST).map_err(error)?;
        if let Some(title) = &title {
            dialog.SetTitle(&HSTRING::from(title.as_str())).map_err(error)?;
        }
        // File types (the strings must outlive SetFileTypes).
        let names: Vec<HSTRING> = filters.iter().map(|f| HSTRING::from(f.name.as_str())).collect();
        let specs: Vec<HSTRING> = filters.iter().map(|f| HSTRING::from(spec_of(f))).collect();
        let list: Vec<COMDLG_FILTERSPEC> = names.iter().zip(&specs).map(|(n, s)| COMDLG_FILTERSPEC { pszName: PCWSTR(n.as_ptr()), pszSpec: PCWSTR(s.as_ptr()) }).collect();
        if !list.is_empty() {
            dialog.SetFileTypes(&list).map_err(error)?;
            dialog.SetFileTypeIndex(1).map_err(error)?;
            if let Some(ext) = filters.first().and_then(|f| f.extensions.first()) {
                dialog.SetDefaultExtension(&HSTRING::from(ext.as_str())).map_err(error)?;
            }
        }
        let (folder, name) = split_default(default_path.as_deref().unwrap_or(""));
        if !folder.is_empty() {
            if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(folder.as_str()), None) {
                let _ = dialog.SetFolder(&item);
            }
        }
        if !name.is_empty() {
            dialog.SetFileName(&HSTRING::from(name.as_str())).map_err(error)?;
        }
        // MyCAD's options, in the area under "Save as type".
        let custom: IFileDialogCustomize = dialog.cast().map_err(error)?;
        const GROUP: u32 = 1000;
        let ids: Vec<u32> = (0..controls.len() as u32).map(|i| GROUP + 1 + i * 100).collect();
        if !controls.is_empty() {
            custom.StartVisualGroup(GROUP, &HSTRING::from(group.as_str())).map_err(error)?;
            for (control, &id) in controls.iter().zip(&ids) {
                match control {
                    Control::Check { label, checked, .. } => custom.AddCheckButton(id, &HSTRING::from(label.as_str()), *checked).map_err(error)?,
                    Control::Combo { label, items, selected, .. } => {
                        // A drop-down list has no label of its own: a text before it.
                        custom.AddText(id + 99, &HSTRING::from(label.as_str())).map_err(error)?;
                        custom.AddComboBox(id).map_err(error)?;
                        for (k, (_, text)) in items.iter().enumerate() {
                            custom.AddControlItem(id, k as u32, &HSTRING::from(text.as_str())).map_err(error)?;
                        }
                        let index = items.iter().position(|(item, _)| item == selected).unwrap_or(0);
                        custom.SetSelectedControlItem(id, index as u32).map_err(error)?;
                    }
                }
            }
            custom.EndVisualGroup().map_err(error)?;
        }
        let owner = if owner == 0 { None } else { Some(HWND(owner as *mut core::ffi::c_void)) };
        if let Err(e) = dialog.Show(owner) {
            if e.code() == ERROR_CANCELLED.to_hresult() {
                return Ok(None);
            }
            return Err(error(e));
        }
        let item = dialog.GetResult().map_err(error)?;
        let raw = item.GetDisplayName(SIGDN_FILESYSPATH).map_err(error)?;
        let path = raw.to_string().map_err(|e| e.to_string());
        CoTaskMemFree(Some(raw.0 as *const core::ffi::c_void));
        let mut values = BTreeMap::new();
        for (control, &id) in controls.iter().zip(&ids) {
            match control {
                Control::Check { id: key, .. } => {
                    values.insert(key.clone(), serde_json::Value::Bool(custom.GetCheckButtonState(id).map_err(error)?.as_bool()));
                }
                Control::Combo { id: key, items, .. } => {
                    let index = custom.GetSelectedControlItem(id).map_err(error)? as usize;
                    values.insert(key.clone(), serde_json::Value::String(items.get(index).map(|(item, _)| item.clone()).unwrap_or_default()));
                }
            }
        }
        Ok(Some(Choice { path: path?, values }))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn show(_owner: isize, _title: Option<String>, _default_path: Option<String>, _filters: Vec<Filter>, _group: String, _controls: Vec<Control>) -> Result<Option<Choice>, String> {
    Err("the Save dialog with options is Windows only".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patterns_and_default_paths() {
        assert_eq!(spec_of(&Filter { name: "STEP".into(), extensions: vec!["step".into(), "stp".into()] }), "*.step;*.stp");
        assert_eq!(split_default("C:/work/plans/house.mcad"), ("C:\\work\\plans".to_string(), "house.mcad".to_string()));
        assert_eq!(split_default("house.mcad"), (String::new(), "house.mcad".to_string()));
    }

    #[test]
    fn controls_from_the_page() {
        let list: Vec<Control> = serde_json::from_str(r#"[{"type":"check","id":"backup","label":"Backup","checked":true},{"type":"combo","id":"v","label":"Version","items":[["a","A"],["b","B"]],"selected":"b"}]"#).unwrap();
        assert!(matches!(&list[0], Control::Check { id, checked: true, .. } if id == "backup"));
        assert!(matches!(&list[1], Control::Combo { items, selected, .. } if items.len() == 2 && selected == "b"));
    }
}
