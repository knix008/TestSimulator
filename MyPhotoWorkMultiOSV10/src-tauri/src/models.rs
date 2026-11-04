// The neural network weights: fetched once, on request, into the user's data folder,
// and read from there after. Progress goes to every window, since the Neural Models
// dialog and the editor both show it.
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct Downloads(Mutex<HashMap<String, Arc<AtomicBool>>>);

fn models_dir() -> PathBuf {
    crate::data_dir().join("models")
}

/// Every folder a model may already be in. New downloads go to the first; the others
/// are where earlier builds of the app put theirs, which are used rather than fetched
/// again. A run with its own data folder (MPW_DATA_DIR) sees only that one.
fn model_roots() -> Vec<PathBuf> {
    let mut roots = vec![models_dir()];
    if std::env::var_os("MPW_DATA_DIR").is_none() {
        if let Some(parent) = crate::data_dir().parent() {
            roots.push(parent.join(crate::LEGACY_DEV_FOLDER).join("models"));
        }
    }
    roots
}

/// The models in these folders, each once. A half-downloaded file does not count.
pub fn models_in(roots: &[PathBuf]) -> Vec<String> {
    let mut ids: Vec<String> = roots
        .iter()
        .filter_map(|root| std::fs::read_dir(root).ok())
        .flatten()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.metadata().map(|m| m.is_file() && m.len() > 0).unwrap_or(false))
        .filter_map(|entry| entry.file_name().to_str().map(String::from))
        .filter(|name| name.ends_with(".onnx") && !name.ends_with(".part.onnx"))
        .map(|name| name.trim_end_matches(".onnx").to_string())
        .collect();
    ids.sort();
    ids.dedup();
    ids
}

/// Where a model already is, in the first folder that holds a whole copy.
pub fn find_model(roots: &[PathBuf], id: &str) -> Option<PathBuf> {
    if !valid_id(id) {
        return None;
    }
    roots.iter().map(|root| root.join(format!("{id}.onnx"))).find(|path| path.metadata().map(|m| m.is_file() && m.len() > 0).unwrap_or(false))
}

/// An id becomes a file name, so it may not contain anything that leaves the folder.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn model_path(id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("bad model id".into());
    }
    Ok(models_dir().join(format!("{id}.onnx")))
}

#[tauri::command]
pub async fn models_list() -> Vec<String> {
    models_in(&model_roots())
}

/// Raw bytes rather than JSON: a model runs to hundreds of megabytes.
#[tauri::command]
pub async fn models_read(id: String) -> Result<tauri::ipc::Response, String> {
    let path = find_model(&model_roots(), &id).ok_or_else(|| format!("model {id} is not downloaded"))?;
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn models_remove(id: String) -> Result<(), String> {
    model_path(&id)?;
    // From every folder, or it would still be listed afterwards.
    for root in model_roots() {
        match std::fs::remove_file(root.join(format!("{id}.onnx"))) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
            _ => {}
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn models_cancel(app: AppHandle, id: String) {
    if let Some(flag) = app.state::<Downloads>().0.lock().unwrap_or_else(|e| e.into_inner()).get(&id) {
        flag.store(true, Ordering::SeqCst);
    }
}

fn fetch(app: &AppHandle, id: &str, url: &str, bytes: u64, cancel: &AtomicBool) -> Result<u64, String> {
    let target = model_path(id)?;
    let partial = models_dir().join(format!("{id}.part.onnx"));
    std::fs::create_dir_all(models_dir()).map_err(|e| e.to_string())?;
    let result = (|| -> Result<u64, String> {
        let response = ureq::get(url).call().map_err(|e| e.to_string())?;
        let total = response.header("content-length").and_then(|v| v.parse::<u64>().ok()).unwrap_or(bytes);
        let mut reader = response.into_reader();
        let mut file = std::fs::File::create(&partial).map_err(|e| e.to_string())?;
        let mut buffer = vec![0u8; 256 * 1024];
        let mut received = 0u64;
        let mut last = Instant::now();
        loop {
            if cancel.load(Ordering::SeqCst) {
                return Err("canceled".into());
            }
            let n = reader.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            file.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
            received += n as u64;
            if last.elapsed() > Duration::from_millis(150) {
                last = Instant::now();
                let _ = app.emit("models:progress", json!({ "id": id, "received": received, "total": total, "done": false }));
            }
        }
        drop(file);
        std::fs::rename(&partial, &target).map_err(|e| e.to_string())?;
        let _ = app.emit("models:progress", json!({ "id": id, "received": received, "total": total, "done": true }));
        Ok(received)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&partial);
    }
    result
}

#[tauri::command]
pub async fn models_download(app: AppHandle, id: String, url: String, bytes: u64) -> serde_json::Value {
    // Already here: what was downloaded once is not fetched again.
    if let Some(size) = find_model(&model_roots(), &id).and_then(|path| path.metadata().ok()).map(|meta| meta.len()) {
        let _ = app.emit("models:progress", json!({ "id": id, "received": size, "total": size, "done": true }));
        return json!({ "ok": true });
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let state = app.state::<Downloads>();
        let mut active = state.0.lock().unwrap_or_else(|e| e.into_inner());
        if active.contains_key(&id) {
            return json!({ "ok": false, "message": "already downloading" });
        }
        active.insert(id.clone(), cancel.clone());
    }
    let result = {
        let (app, id, url, cancel) = (app.clone(), id.clone(), url, cancel);
        tauri::async_runtime::spawn_blocking(move || fetch(&app, &id, &url, bytes, &cancel))
            .await
            .unwrap_or_else(|e| Err(e.to_string()))
    };
    app.state::<Downloads>().0.lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
    match result {
        Ok(_) => json!({ "ok": true }),
        Err(message) => {
            let _ = app.emit("models:progress", json!({ "id": id, "received": 0, "total": 0, "done": true, "error": message }));
            json!({ "ok": false, "message": message })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mpw-models-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_model_from_an_earlier_build_is_found_and_listed_once() {
        let (new, old) = (scratch("new"), scratch("old"));
        std::fs::write(old.join("u2netp.onnx"), b"weights").unwrap();
        std::fs::write(old.join("lama.onnx"), b"old").unwrap();
        std::fs::write(new.join("lama.onnx"), b"new").unwrap();
        let roots = vec![new.clone(), old.clone()];
        assert_eq!(models_in(&roots), vec!["lama".to_string(), "u2netp".to_string()]);
        assert_eq!(find_model(&roots, "u2netp"), Some(old.join("u2netp.onnx")));
        assert_eq!(find_model(&roots, "lama"), Some(new.join("lama.onnx")), "the current folder wins");
        assert_eq!(find_model(&roots, "isnet"), None);
        std::fs::remove_dir_all(&new).unwrap();
        std::fs::remove_dir_all(&old).unwrap();
    }

    #[test]
    fn a_partial_or_empty_download_is_not_a_model() {
        let dir = scratch("partial");
        std::fs::write(dir.join("isnet.part.onnx"), b"half").unwrap();
        std::fs::write(dir.join("lama.onnx"), b"").unwrap();
        let roots = vec![dir.clone()];
        assert!(models_in(&roots).is_empty());
        assert_eq!(find_model(&roots, "lama"), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn an_id_cannot_leave_the_models_folder() {
        assert!(valid_id("u2net_human-seg"));
        assert!(!valid_id("../secret"));
        assert!(!valid_id("a/b"));
        assert!(!valid_id("a.b"));
        assert!(!valid_id(""));
        assert!(model_path("..\\x").is_err());
    }
}
