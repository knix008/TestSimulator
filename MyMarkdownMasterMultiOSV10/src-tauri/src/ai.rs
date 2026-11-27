//! HTTP proxy for the AI assistants (src/ai/client.js on the desktop).
//!
//! The web view cannot call most AI APIs directly (CORS), so the desktop app sends the request
//! here. A streamed response comes back as UTF-8 text chunks through the `ai-chunk` event
//! (`{ op, seq, text }`); the command itself resolves with the status, the full body (an error
//! response, or a response that was not streamed) and how many chunks were sent, so the page
//! knows when it has every chunk. `ai_cancel(op)` stops a request at once.
//!
//! Nothing here is platform-specific: reqwest with rustls on Windows, macOS and Linux.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use futures_util::future::{AbortHandle, Abortable};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// One HTTP request built by src/ai/providers.js.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub url: String,
    #[serde(default = "default_method")]
    pub method: String,
    /// `[[name, value], …]` (an array keeps repeated names and their order).
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: String,
    /// A successful response is sent in `ai-chunk` events instead of in `body`.
    #[serde(default)]
    pub stream: bool,
}

fn default_method() -> String {
    "POST".into()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub status: u16,
    /// The whole body: for a non-2xx status, or when the request was not streamed.
    pub body: String,
    /// How many `ai-chunk` events were sent for this request.
    pub chunks: u32,
}

#[derive(Clone, Serialize)]
struct AiChunk<'a> {
    op: &'a str,
    seq: u32,
    text: String,
}

fn requests() -> &'static Mutex<HashMap<String, AbortHandle>> {
    static MAP: OnceLock<Mutex<HashMap<String, AbortHandle>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(client) = CLIENT.get() {
        return Ok(client);
    }
    let built = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .user_agent(concat!("MyMarkdownMaster/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(CLIENT.get_or_init(|| built))
}

/// Removes the request's abort handle however the request ends.
struct Registered(String);
impl Drop for Registered {
    fn drop(&mut self) {
        if let Ok(mut map) = requests().lock() {
            map.remove(&self.0);
        }
    }
}

/// Joins bytes into UTF-8 text when a character is split across two chunks.
#[derive(Default)]
pub struct Utf8Joiner {
    pending: Vec<u8>,
}

impl Utf8Joiner {
    /// The text that is complete so far; an unfinished character waits for the next chunk.
    /// Bytes that can never be UTF-8 become U+FFFD.
    pub fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut out = String::new();
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(text) => {
                    out.push_str(text);
                    self.pending.clear();
                    return out;
                }
                Err(error) => {
                    let valid = error.valid_up_to();
                    // The first `valid` bytes were just checked.
                    out.push_str(std::str::from_utf8(&self.pending[..valid]).unwrap_or_default());
                    match error.error_len() {
                        None => {
                            // An incomplete character at the end: keep it for the next chunk.
                            self.pending.drain(..valid);
                            return out;
                        }
                        Some(len) => {
                            out.push('\u{FFFD}');
                            self.pending.drain(..valid + len);
                        }
                    }
                }
            }
        }
    }

    /// Whatever is left at the end of the stream (an unfinished character becomes U+FFFD).
    pub fn finish(&mut self) -> String {
        let rest = String::from_utf8_lossy(&self.pending).into_owned();
        self.pending.clear();
        rest
    }
}

fn error_text(error: &reqwest::Error) -> String {
    let mut text = error.to_string();
    let mut source = std::error::Error::source(error);
    while let Some(inner) = source {
        let part = inner.to_string();
        if !text.contains(&part) {
            text.push_str(": ");
            text.push_str(&part);
        }
        source = inner.source();
    }
    if error.is_connect() {
        format!("connect: {text}")
    } else if error.is_timeout() {
        format!("timeout: {text}")
    } else {
        text
    }
}

async fn run(app: AppHandle, request: AiRequest, op: String) -> Result<AiResponse, String> {
    let method = reqwest::Method::from_bytes(request.method.to_ascii_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut builder = client()?.request(method.clone(), &request.url);
    for (name, value) in &request.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    if method != reqwest::Method::GET && method != reqwest::Method::HEAD {
        builder = builder.body(request.body);
    }
    let response = builder.send().await.map_err(|e| error_text(&e))?;
    let status = response.status().as_u16();
    if !response.status().is_success() || !request.stream {
        let body = response.text().await.map_err(|e| error_text(&e))?;
        return Ok(AiResponse { status, body, chunks: 0 });
    }
    let mut joiner = Utf8Joiner::default();
    let mut seq: u32 = 0;
    let mut stream = response.bytes_stream();
    let send = |seq: u32, text: String| app.emit("ai-chunk", AiChunk { op: &op, seq, text }).map_err(|e| e.to_string());
    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| error_text(&e))?;
        let text = joiner.push(&bytes);
        if !text.is_empty() {
            send(seq, text)?;
            seq += 1;
        }
    }
    let rest = joiner.finish();
    if !rest.is_empty() {
        send(seq, rest)?;
        seq += 1;
    }
    Ok(AiResponse { status, body: String::new(), chunks: seq })
}

/// Sends one AI API request. `op` names it for `ai-chunk` events and `ai_cancel`.
#[tauri::command]
pub async fn ai_request(app: AppHandle, request: AiRequest, op: String) -> Result<AiResponse, String> {
    let (handle, registration) = AbortHandle::new_pair();
    {
        let mut map = requests().lock().map_err(|e| e.to_string())?;
        if let Some(previous) = map.insert(op.clone(), handle) {
            previous.abort();
        }
    }
    let _registered = Registered(op.clone());
    match Abortable::new(run(app, request, op), registration).await {
        Ok(result) => result,
        Err(_) => Err("cancelled".into()),
    }
}

/// Stops a running `ai_request`. Unknown or finished ops are ignored.
#[tauri::command]
pub fn ai_cancel(op: String) -> bool {
    let handle = requests().lock().ok().and_then(|mut map| map.remove(&op));
    match handle {
        Some(handle) => {
            handle.abort();
            true
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn join(chunks: &[&[u8]]) -> (Vec<String>, String) {
        let mut joiner = Utf8Joiner::default();
        let parts: Vec<String> = chunks.iter().map(|chunk| joiner.push(chunk)).collect();
        let rest = joiner.finish();
        (parts, rest)
    }

    #[test]
    fn ascii_passes_through() {
        let (parts, rest) = join(&[b"data: {}\n", b"\n"]);
        assert_eq!(parts, vec!["data: {}\n", "\n"]);
        assert_eq!(rest, "");
    }

    #[test]
    fn korean_split_inside_a_character() {
        let text = "안녕하세요 world";
        let bytes = text.as_bytes();
        // Cut at every position: the joined result is always the original text.
        for cut in 0..=bytes.len() {
            let (parts, rest) = join(&[&bytes[..cut], &bytes[cut..]]);
            assert_eq!(parts.concat() + &rest, text, "cut at {cut}");
        }
    }

    #[test]
    fn four_byte_character_split_into_single_bytes() {
        let text = "a😀b";
        let chunks: Vec<&[u8]> = text.as_bytes().chunks(1).collect();
        let (parts, rest) = join(&chunks);
        assert_eq!(parts.concat() + &rest, text);
        // Nothing is emitted for the first three bytes of the emoji.
        assert_eq!(parts[1], "");
        assert_eq!(parts[4], "😀");
    }

    #[test]
    fn invalid_bytes_become_replacement() {
        let (parts, rest) = join(&[b"ok\xFFgo"]);
        assert_eq!(parts.concat() + &rest, "ok\u{FFFD}go");
    }

    #[test]
    fn unfinished_character_at_end_is_replaced() {
        let euro = "€".as_bytes();
        let (parts, rest) = join(&[b"x", &euro[..2]]);
        assert_eq!(parts.concat(), "x");
        assert_eq!(rest, "\u{FFFD}");
    }

    #[test]
    fn cancel_of_unknown_op_is_false() {
        assert!(!ai_cancel("nothing".into()));
    }

    #[test]
    fn request_deserializes_header_pairs() {
        let request: AiRequest = serde_json::from_str(r#"{"url":"http://x","headers":[["a","1"],["b","2"]],"body":"{}","stream":true}"#).unwrap();
        assert_eq!(request.method, "POST");
        assert_eq!(request.headers, vec![("a".to_string(), "1".to_string()), ("b".to_string(), "2".to_string())]);
        assert!(request.stream);
    }
}
