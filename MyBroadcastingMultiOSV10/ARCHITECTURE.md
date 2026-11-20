# MyBroadcasting — Architecture

## 1. Shape

One web front end runs in every window (main, popups, document viewer, render window, projectors) in the
desktop app (Tauri 2, WebView2 / WKWebView / WebKitGTK) and in a browser. The broadcasting itself happens in
the page: WebGL 2 composes the picture, Web Audio mixes the sound, WebCodecs encodes, mediabunny muxes.
The Rust side does what a page cannot: write files at positions, run FFmpeg, read system numbers and the
front window's title, listen on a WebSocket port, open projector windows on monitors, register global hotkeys.

```text
 sources (capture streams, <video>, pictures, canvases) ─► compositor (WebGL 2) ─► program texture
        │                                                      │  scenes, groups, nested scenes, filters,
        │                                                      │  item show/hide and scene transitions
        │                                                      ├─► displays (preview, program, multiview, projectors)
        │                                                      └─► output canvas ─► VideoEncoderHub (WebCodecs)
        └─► AudioMixer (Web Audio): filters, volume, balance, mono, mute/PTT, meters ─► tracks 1–6 ─► AudioEncoderHub
                                                      packets ─► Recording · ReplayBuffer · StreamOutput (Matroska ─► FFmpeg)
                                                      canvas + track 1 ─► WhipOutput (WebRTC)
```

## 2. Modules

| Module | Contract |
| --- | --- |
| `bc/catalog.js` | Types with the ids of the common scene-file layout (`image_source`, `chroma_key_filter_v2`, `fade_transition` …) and their fields. Forms, defaults, clamping and the tests come from here. |
| `bc/model.js` | The scene collection (§3). Pure functions; every edit goes through `Studio.change()` for Undo. |
| `bc/transform.js` | Item geometry: position = alignment point; scale on the cropped size; rotation about the alignment point; negative scale flips; bounds fit the source in a box. Snapping, handle resizing, Alt-crop. |
| `bc/features.js` | The feature list (§7). |
| `bc/compat/scenejson.js`, `bc/compat/wire.js` | Scene files in the common JSON layout ↔ our collection; the few byte-exact names that layout and the remote-control protocol need, kept in one place. |
| `bc/engine/gl.js` | Textures, pooled render targets, item drawing (crop UV, bicubic / Lanczos sampling, blend modes) and the shader passes of filters and transitions. Colours are premultiplied everywhere. |
| `bc/engine/compositor.js` | `Engine`: runtimes per source, frame loop (worker timer at the output FPS, so it runs in the background), program / preview / transitions, displays, screenshots, item geometry. |
| `bc/engine/sources.js` | One runtime per source: `element`, `width`, `height`, `version` (bumped on change), `audio` (MediaStream or element), `tick()`, `control()` for media, `setActive` / `setShowing`. |
| `bc/engine/audio.js`, `worklets.js` | `AudioMixer`: per-source chain, track buses, monitor bus, meters, the encoder tap; worklets for dynamics, spectral noise suppression and the tap. |
| `bc/engine/outputs.js` | `VideoEncoderHub` / `AudioEncoderHub` (one per configuration, shared), `Recording` (pause, split at keyframes, chapters, tracks), `ReplayBuffer` (keyframe-aligned ring), `StreamOutput` (delay, reconnect, drop on backlog). |
| `studio/accounts.js` | Account connection with the user's own Client ID: Twitch device code, YouTube authorization code + PKCE (127.0.0.1 redirect); HTTPS through `src-tauri/src/accounts.rs` (only the services' hosts). |
| `src-tauri/src/browser_source.rs` | Browser sources as real pages (Windows): a hidden, muted WebView2 window per source; DevTools screencast PNG frames (transparent) → `browser-frame`; Interact sends DevTools input events. |
| `src-tauri/src/vcam.rs`, `native/vcam` | The virtual camera device: softcam (MIT, DirectShow) built as `mybroadcasting-vcam.dll`; registered with regsvr32 as administrator after the user agrees; the page sends JPEG frames, decoded with zune-jpeg and handed to the DLL. |
| `bc/engine/viewers.js` | Direct viewing: `ViewerHost` gives each admitted viewer its own WebRTC connection with the program picture and track sound; who may watch (access code, most viewers), addresses, ICE servers. The viewer page is `server/viewer.html`; the signalling server is `src-tauri/src/viewers.rs` (desktop: page and `/ws` on one port, every interface) or `server/viewers.mjs` (web: `/ws` for viewers, `/host` for this computer only). |
| `bc/engine/whip.js` | WHIP output; `ProjectorHost` / `connectProjector` (local WebRTC over BroadcastChannel). |
| `bc/platform.js` | Files (paths, `asset:` in IndexedDB, `sample:`), recording sinks, the stream transport (desktop FFmpeg via Rust, web relay), remux, stats, hotkeys, projectors. |
| `studio/studio.js` | `Studio`: the open collection and profile, engine, mixer, outputs, Undo, collections, profiles, hotkey actions. Events: `changed`, `program`, `preview`, `selection`, `outputs`, `log`, `profile`, `collections`. |
| `studio/*` | panels, workspace (preview editing), property forms, settings tabs, reports, tools, the WebSocket remote-control protocol (version 5). |
| `app.js` | The window: commands, menus, toolbar, panels, start page, popups, tutorial — MySketchBook's shell. |

## 3. Data

```text
collection = { version, name, sources: { id: Source }, scenes: [Scene], current, preview,
               transitions: [Transition], transition, duration, quick: [{ id, transition, duration }] }
Source     = { id, type, name, settings, filters: [Filter], audio: Audio|null, hotkeys, global? }
Audio      = { volume (multiplier), muted, monitor: off|monitorOnly|both, balance 0…1, sync (ms), tracks[6], mono, ptt, ptm, hidden }
Scene      = { id, name, items: [Item] (first drawn first), override: { transition, duration } | null, filters }
Item       = { id, source (source or scene id), visible, locked, transform, blend, scaleFilter, show, hide, children?, collapsed? }
transform  = { x, y, rot, sx, sy, align, crop: { l, t, r, b }, bounds: { type, w, h, align, crop } }
```

Collections are kept in localStorage (`mybroadcasting.collection.<name>`, list in `mybroadcasting.collections.v1`),
profiles in `mybroadcasting.profiles.v1`, tool settings in `mybroadcasting.tools.v1`. Files the web build is
given are stored in IndexedDB and referred to as `asset:<id>`. A new installation resets preferences but keeps
collections and profiles.

## 4. Frames

The worker ticker posts at the output FPS. Each tick: sources `tick()`; the program is drawn at the base size
(a transition draws both scenes and mixes them); in studio mode the preview too; displays copy their part of
the GL canvas into their 2D canvases (letterboxed); finally the program is scaled to the output size with the
downscale filter and left in the GL canvas, where the encoders take a `VideoFrame`. Lagged frames (a tick that
came late) and skipped frames (encoder queue full) are counted for the stats.

## 5. Outputs

Encoders are shared by configuration ("same as stream"). A sink waits for a keyframe; adding a sink asks
for one. Recording files are written by a `StreamTarget` whose writes go to `rec_write` (desktop: raw IPC body,
headers `x-id` / `x-pos`) or to the browser (File System Access folder, else a download). Chapters are kept in a
side file and embedded by FFmpeg on remux. The stream is append-only Matroska; FFmpeg copies the video and
re-encodes Opus audio to AAC for FLV. Desktop: `stream_open` / `stream_write` / `stream_close`; web: the relay
(`server/relay.mjs`, the same FFmpeg arguments, `server/ffargs.mjs`).

## 6. Windows

Popups are OS windows on the desktop (`popup-<kind>`), frames on the web. Projectors are `projector-<n>`
windows (`index.html?projector=<which>`) that receive their picture over a local peer connection; the
virtual camera is such a window with `vcam=1`. Global hotkeys use `tauri-plugin-global-shortcut`; the remote
control server is `src-tauri/src/remote.rs` (text frames only, the protocol is `studio/wsproto.js`).

## 7. Features and tests

`src/bc/features.js` lists every feature with an id, both names and how it works here: `full`, `adapted`
(through the engine's own means: share pickers, Web Audio, speech recognition), `external` (FFmpeg) or
`unsupported` (VST 2.x plug-ins: cannot run in a web engine — the filter passes sound through and is listed
as a problem). Tests name features with `[F:<id>]`; `npm test`'s **features** stage lists every feature and
fails for one without a passing test. Unit tests cover the pure parts with real muxing of fake packets; the
web E2E suite checks the real app by its pixels, levels and files; the desktop suite checks the native parts.
