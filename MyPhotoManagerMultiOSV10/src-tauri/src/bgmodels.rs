//! Downloaded background-removal models (REMBG 1 / REMBG 2).
//! The files come from the rembg release and are stored under the app data folder.

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProgress {
    pub id: String,
    pub phase: String,
    pub received: u64,
    pub total: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub installed: bool,
    pub bytes: u64,
    pub path: String,
}

struct Spec {
    id: &'static str,
    file: &'static str,
    url: &'static str,
}

const SPECS: &[Spec] = &[
    Spec {
        id: "rembg1",
        file: "u2net.onnx",
        url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
    },
    Spec {
        id: "rembg2",
        file: "isnet-general-use.onnx",
        url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
    },
];

fn spec(id: &str) -> Result<&'static Spec, String> {
    SPECS.iter().find(|item| item.id == id).ok_or_else(|| {
        crate::tr!(
            "알 수 없는 배경 제거 모델입니다.",
            "Unknown background-removal model."
        )
    })
}

pub fn model_file(dir: &Path, id: &str) -> Result<PathBuf, String> {
    Ok(dir.join(spec(id)?.file))
}

static CANCEL: Mutex<Vec<String>> = Mutex::new(Vec::new());

pub fn cancel(id: &str) {
    let mut guard = CANCEL.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if !guard.iter().any(|item| item == id) {
        guard.push(id.to_string());
    }
}

fn take_cancel(id: &str) -> bool {
    let mut guard = CANCEL.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(index) = guard.iter().position(|item| item == id) {
        guard.remove(index);
        true
    } else {
        false
    }
}

pub fn info(dir: &Path, id: &str) -> Result<ModelInfo, String> {
    let path = model_file(dir, id)?;
    let bytes = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
    let installed = bytes > 1_000_000;
    Ok(ModelInfo {
        installed,
        bytes: if installed { bytes } else { 0 },
        path: if installed { path.to_string_lossy().into_owned() } else { String::new() },
    })
}

pub async fn download(app: AppHandle, dir: PathBuf, id: String) -> Result<(), String> {
    let model = spec(&id)?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let dest = dir.join(model.file);
    if std::fs::metadata(&dest).map(|meta| meta.len() > 1_000_000).unwrap_or(false) {
        let len = std::fs::metadata(&dest).map(|meta| meta.len()).unwrap_or(0);
        let _ = app.emit(
            "bg-model-progress",
            ModelProgress { id: id.clone(), phase: "ready".into(), received: len, total: len },
        );
        return Ok(());
    }
    let part = dir.join(format!("{}.part", model.file));
    let client = reqwest::Client::builder()
        .user_agent("MyPhotoManager/1.0")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client.get(model.url).send().await.map_err(|error| {
        crate::tr!(
            "모델을 내려받지 못했습니다: {}",
            "Could not download the model: {}",
            error.to_string()
        )
    })?;
    let status = response.status();
    if !status.is_success() {
        return Err(crate::tr!(
            "모델을 내려받지 못했습니다 (HTTP {}).",
            "Could not download the model (HTTP {}).",
            status.as_u16()
        ));
    }
    let total = response.content_length().unwrap_or(0);
    let mut file = File::create(&part).map_err(|error| error.to_string())?;
    let mut received = 0u64;
    let mut stream = response.bytes_stream();
    let mut last = Instant::now() - Duration::from_secs(1);
    while let Some(item) = stream.next().await {
        if take_cancel(&id) {
            drop(file);
            let _ = std::fs::remove_file(&part);
            return Err("cancelled".into());
        }
        let chunk = item.map_err(|error| {
            crate::tr!(
                "모델을 내려받지 못했습니다: {}",
                "Could not download the model: {}",
                error.to_string()
            )
        })?;
        file.write_all(&chunk).map_err(|error| error.to_string())?;
        received += chunk.len() as u64;
        if last.elapsed() >= Duration::from_millis(100) || (total > 0 && received >= total) {
            last = Instant::now();
            let _ = app.emit(
                "bg-model-progress",
                ModelProgress {
                    id: id.clone(),
                    phase: "download".into(),
                    received,
                    total: if total > 0 { total } else { received },
                },
            );
        }
    }
    file.sync_all().ok();
    drop(file);
    if total > 0 && received + 1024 < total {
        let _ = std::fs::remove_file(&part);
        return Err(crate::tr!(
            "내려받기가 끝나기 전에 끊겼습니다.",
            "The download stopped before the file was complete."
        ));
    }
    std::fs::rename(&part, &dest).map_err(|error| error.to_string())?;
    let _ = app.emit(
        "bg-model-progress",
        ModelProgress { id, phase: "install".into(), received, total: if total > 0 { total } else { received } },
    );
    Ok(())
}

pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    let path = model_file(dir, id)?;
    let part = dir.join(format!("{}.part", spec(id)?.file));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    if part.exists() {
        let _ = std::fs::remove_file(part);
    }
    Ok(())
}

pub fn read(dir: &Path, id: &str) -> Result<Vec<u8>, String> {
    std::fs::read(model_file(dir, id)?).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::spec;

    #[test]
    fn names_the_rembg_models() {
        assert!(spec("nope").is_err());
        assert_eq!(spec("rembg1").unwrap().file, "u2net.onnx");
        assert_eq!(spec("rembg2").unwrap().file, "isnet-general-use.onnx");
    }
}
