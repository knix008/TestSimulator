// The page server `tauri dev` loads (devUrl http://localhost:5236): the project
// folder itself, served live by scripts/serve.mjs, so an edit under src/ or
// style/ shows after a reload (Ctrl+R) without rebuilding anything.
process.env.PORT = process.env.PORT || "5236";
process.env.STRICT_PORT = "1";
await import("./serve.mjs");
