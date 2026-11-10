"""My3DObjects engine: a local HTTP service around Stable Fast 3D.

The desktop app (src-tauri/src/engine.rs) and the web launcher
(scripts/engine.mjs) both start it the same way, with the virtual
environment's own Python:

    python -m my3dobjects --home <engine dir> --port <port> --uv <uv binary>

Only the standard library is needed to start. Everything SF3D needs (PyTorch,
the model code, the weights) is installed by the service itself on its first
run (installer.py), while it already answers /api/health and /api/logs, so the
app can show the installation in its log panel.
"""

__version__ = "1.0.0"
