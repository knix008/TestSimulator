// Thumbnail cache — one folder per source directory:
//   <userData>/ThumbCache/<sha1(dir)>/index.json   { v, dir, entries: { name: { size, mtimeMs, w, h, tw, th, file } } }
//   <userData>/ThumbCache/<sha1(dir)>/<sha1(name)>.jpg
// The same layout and names the Node host used, so its cache stays valid. An entry is
// served again only while the source's size and mtime still match; nothing is ever
// written into the user's own folders.
//
// thumb-make decodes and downsizes here (no image bytes cross to the page); formats the
// image crate does not read (AVIF, SVG, HEIC, BMP, ICO, DICOM …) answer { unsupported }
// and the page's own decoders take them. thumb-cache-build warms whole folders on one
// background thread and keeps going after the user moves on.

use super::{error, file_url, ms_since_epoch, node_basename, node_dirname, node_extname, node_join, node_resolve, path_key, sha1_hex};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

const CACHE_VERSION: u32 = 1;
const THUMB_SIZE: u32 = 256;
const THUMB_EXTS: &[&str] = &[".jpg", ".jpeg", ".jfif", ".png", ".webp", ".gif", ".tif", ".tiff"];

#[derive(Clone, Serialize, Deserialize)]
struct Entry {
    size: u64,
    #[serde(rename = "mtimeMs")]
    mtime_ms: f64,
    file: String,
    #[serde(default)]
    w: u32,
    #[serde(default)]
    h: u32,
    #[serde(default)]
    tw: u32,
    #[serde(default)]
    th: u32,
}

struct Index {
    dir: String,
    folder: PathBuf,
    entries: BTreeMap<String, Entry>,
    /// When the index has to be written (batched: a folder being filled saves once it goes quiet)
    save_at: Option<Instant>,
}

static INDEXES: Mutex<Option<HashMap<String, Arc<Mutex<Index>>>>> = Mutex::new(None);

fn root() -> PathBuf {
    super::user_data_dir().join("ThumbCache")
}

fn file_name_for(name: &str) -> String {
    let n = if cfg!(windows) { name.to_lowercase() } else { name.to_string() };
    format!("{}.jpg", &sha1_hex(&n)[..24])
}

fn index_for(dir: &str) -> Arc<Mutex<Index>> {
    let key = sha1_hex(&path_key(dir));
    let mut guard = INDEXES.lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    if let Some(idx) = map.get(&key) {
        return idx.clone();
    }
    let folder = root().join(&key);
    let entries = std::fs::read_to_string(folder.join("index.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .filter(|v| v.get("v").and_then(Value::as_u64) == Some(u64::from(CACHE_VERSION)))
        .and_then(|v| v.get("entries").cloned())
        .and_then(|e| serde_json::from_value::<BTreeMap<String, Entry>>(e).ok())
        .unwrap_or_default();
    let idx = Arc::new(Mutex::new(Index { dir: node_resolve(dir), folder, entries, save_at: None }));
    map.insert(key, idx.clone());
    idx
}

fn index_json(idx: &Index) -> String {
    json!({ "v": CACHE_VERSION, "dir": idx.dir, "entries": idx.entries }).to_string()
}

fn write_index(idx: &Index) {
    let _ = std::fs::create_dir_all(&idx.folder);
    let tmp = idx.folder.join("index.json.tmp");
    if std::fs::write(&tmp, index_json(idx)).is_ok() {
        let _ = std::fs::rename(&tmp, idx.folder.join("index.json"));
    }
}

/// One thread writes indexes a second after their last change.
fn schedule_save(idx: &Arc<Mutex<Index>>) {
    idx.lock().unwrap().save_at = Some(Instant::now() + Duration::from_secs(1));
    static SAVER: std::sync::Once = std::sync::Once::new();
    SAVER.call_once(|| {
        std::thread::spawn(|| loop {
            std::thread::sleep(Duration::from_millis(250));
            let list: Vec<_> = INDEXES.lock().unwrap().as_ref().map(|m| m.values().cloned().collect()).unwrap_or_default();
            for idx in list {
                let mut g = idx.lock().unwrap();
                if g.save_at.is_some_and(|t| Instant::now() >= t) {
                    g.save_at = None;
                    write_index(&g);
                }
            }
        });
    });
}

/// On quit, write whatever is still waiting so the work is not lost.
pub fn flush_all() {
    let list: Vec<_> = INDEXES.lock().unwrap().as_ref().map(|m| m.values().cloned().collect()).unwrap_or_default();
    for idx in list {
        let mut g = idx.lock().unwrap();
        if g.save_at.take().is_some() {
            write_index(&g);
        }
    }
}

fn entry_url(idx: &Index, ent: &Entry) -> Value {
    let url = file_url(&idx.folder.join(&ent.file)).unwrap_or_default();
    json!({ "url": format!("{url}?v={}", ent.mtime_ms.round() as i64), "w": ent.w, "h": ent.h, "tw": ent.tw, "th": ent.th })
}

fn source_stat(path: &str) -> std::io::Result<(u64, f64)> {
    let st = std::fs::metadata(path)?;
    Ok((st.len(), st.modified().map(ms_since_epoch).unwrap_or(0.0)))
}

fn fresh(ent: &Entry, (size, mtime): (u64, f64)) -> bool {
    ent.size == size && (mtime - ent.mtime_ms).abs() < 1.0
}

/// Everything still valid for one directory: { name: { url, w, h, tw, th } }
pub fn cache_load(dir: &str) -> Value {
    let idx = index_for(dir);
    let mut out = Map::new();
    let mut stale = Vec::new();
    {
        let g = idx.lock().unwrap();
        for (name, ent) in &g.entries {
            match source_stat(&node_join(&[g.dir.clone(), name.clone()])) {
                Ok(st) if fresh(ent, st) => {
                    out.insert(name.clone(), entry_url(&g, ent));
                }
                _ => stale.push(name.clone()),
            }
        }
    }
    if !stale.is_empty() {
        {
            let mut g = idx.lock().unwrap();
            for name in &stale {
                if let Some(ent) = g.entries.remove(name) {
                    let _ = std::fs::remove_file(g.folder.join(ent.file));
                }
            }
        }
        schedule_save(&idx);
    }
    Value::Object(out)
}

fn store(path: &str, st: (u64, f64), jpeg: &[u8], dims: [u32; 4]) -> std::io::Result<Value> {
    let idx = index_for(&node_dirname(path));
    let name = node_basename(path);
    let value = {
        let mut g = idx.lock().unwrap();
        let file = file_name_for(&name);
        std::fs::create_dir_all(&g.folder)?;
        std::fs::write(g.folder.join(&file), jpeg)?;
        let [w, h, tw, th] = dims;
        let ent = Entry { size: st.0, mtime_ms: st.1, file, w, h, tw, th };
        let v = entry_url(&g, &ent);
        g.entries.insert(name, ent);
        v
    };
    schedule_save(&idx);
    Ok(value)
}

/// Store one thumbnail the page made (JPEG bytes) for `path`.
pub fn cache_put(path: &str, bytes: &Value, meta: &Value) -> Value {
    let Some(jpeg) = super::arg_bytes(bytes).filter(|b| !b.is_empty()) else {
        return error("empty");
    };
    let st = match source_stat(path) {
        Ok(st) => st,
        Err(e) => return error(e),
    };
    let dim = |k: &str| meta.get(k).and_then(Value::as_f64).map(|v| v as u32).unwrap_or(0);
    store(path, st, &jpeg, [dim("w"), dim("h"), dim("tw"), dim("th")]).unwrap_or_else(error)
}

// ── Thumbnails made here ──

/// One lock per file being made, so two requests for it make it once.
static MAKING: Mutex<Option<HashMap<String, Arc<Mutex<()>>>>> = Mutex::new(None);

fn supported(path: &str) -> bool {
    THUMB_EXTS.contains(&node_extname(path).to_lowercase().as_str())
}

/// One thumbnail (cached on disk); None when this format is not read here or it fails.
fn make(path: &str) -> Option<Value> {
    if !supported(path) {
        return None;
    }
    let key = path_key(path);
    let lock = MAKING.lock().unwrap().get_or_insert_with(HashMap::new).entry(key.clone()).or_default().clone();
    let result = {
        let _making = lock.lock().unwrap();
        make_locked(path)
    };
    if let Some(map) = MAKING.lock().unwrap().as_mut() {
        if map.get(&key).is_some_and(|l| Arc::strong_count(l) <= 2) {
            map.remove(&key);
        }
    }
    result
}

fn make_locked(path: &str) -> Option<Value> {
    let st = source_stat(path).ok()?;
    {
        let idx = index_for(&node_dirname(path));
        let g = idx.lock().unwrap();
        if let Some(have) = g.entries.get(&node_basename(path)) {
            // An index entry without its file is made again
            if fresh(have, st) && g.folder.join(&have.file).is_file() {
                return Some(entry_url(&g, have));
            }
        }
    }
    let (jpeg, dims) = render(path).ok()?;
    store(path, st, &jpeg, dims).ok()
}

/// Decode, turn upright (EXIF orientation, as the page's decoders do), fit in 256 × 256
/// without enlarging, flatten onto white, JPEG 76. Returns the bytes and [w, h, tw, th]
/// (w / h of the upright picture).
pub(crate) fn render(path: &str) -> Result<(Vec<u8>, [u32; 4]), String> {
    let img = super::imaging::decode_upright(path)?;
    let (w, h) = (img.width(), img.height());
    let small = if w > THUMB_SIZE || h > THUMB_SIZE { img.thumbnail(THUMB_SIZE, THUMB_SIZE) } else { img };
    let rgb = super::imaging::flatten_on_white(&small);
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 76)
        .encode_image(&rgb)
        .map_err(|e| e.to_string())?;
    Ok((jpeg, [w, h, rgb.width(), rgb.height()]))
}

pub fn make_json(path: &str) -> Value {
    make(path).unwrap_or_else(|| json!({ "unsupported": true }))
}

// ── Background build of whole folders, one file at a time ──

struct BuildQueue {
    dirs: VecDeque<String>,
    building: bool,
    /// A folder just opened went to the front while another was being built
    preempt: bool,
}

static QUEUE: Mutex<BuildQueue> = Mutex::new(BuildQueue { dirs: VecDeque::new(), building: false, preempt: false });
static WAKE: Condvar = Condvar::new();

/// Warm `dirs` (one path or a list) in the background. front: true = the folder just opened.
pub fn build(dirs: &Value, opts: &Value) -> Value {
    let list: Vec<String> = match dirs {
        Value::String(s) => vec![s.clone()],
        Value::Array(a) => a.iter().filter_map(Value::as_str).map(str::to_string).collect(),
        _ => Vec::new(),
    };
    let front = opts.get("front").and_then(Value::as_bool).unwrap_or(false);
    let mut q = QUEUE.lock().unwrap();
    for dir in list.into_iter().filter(|d| !d.is_empty()) {
        let key = path_key(&dir);
        q.dirs.retain(|d| path_key(d) != key);
        if front {
            q.dirs.push_front(dir);
            if q.building {
                q.preempt = true;
            }
        } else {
            q.dirs.push_back(dir);
        }
    }
    let queued = q.dirs.len();
    drop(q);
    start_builder();
    WAKE.notify_one();
    json!({ "queued": queued })
}

fn start_builder() {
    static BUILDER: std::sync::Once = std::sync::Once::new();
    BUILDER.call_once(|| {
        std::thread::spawn(|| loop {
            let dir = {
                let mut q = QUEUE.lock().unwrap();
                while q.dirs.is_empty() {
                    q.building = false;
                    q = WAKE.wait(q).unwrap();
                }
                q.building = true;
                q.dirs.pop_front().unwrap()
            };
            let Ok(names) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in names.flatten() {
                if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    continue;
                }
                let path = node_join(&[dir.clone(), entry.file_name().to_string_lossy().into_owned()]);
                if !supported(&path) {
                    continue;
                }
                let _ = make(&path);
                // The user opened another folder: build that first, finish this one afterwards
                // (what is already done is skipped quickly by the fresh-entry check).
                let mut q = QUEUE.lock().unwrap();
                if q.preempt {
                    q.preempt = false;
                    q.dirs.push_back(dir.clone());
                    break;
                }
            }
        });
    });
}

pub fn stats() -> Value {
    let (mut bytes, mut files, mut folders) = (0u64, 0u64, 0u64);
    if let Ok(dirs) = std::fs::read_dir(root()) {
        for d in dirs.flatten() {
            if !d.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            folders += 1;
            if let Ok(names) = std::fs::read_dir(d.path()) {
                for n in names.flatten() {
                    if let Ok(m) = n.metadata() {
                        bytes += m.len();
                        if n.file_name().to_string_lossy().ends_with(".jpg") {
                            files += 1;
                        }
                    }
                }
            }
        }
    }
    json!({ "bytes": bytes, "files": files, "folders": folders })
}

pub fn clear() -> Value {
    if let Some(map) = INDEXES.lock().unwrap().as_mut() {
        map.clear();
    }
    match std::fs::remove_dir_all(root()) {
        Ok(()) => json!({ "success": true }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({ "success": true }),
        Err(e) => error(e),
    }
}
