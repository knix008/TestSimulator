#!/usr/bin/env python3
"""
AI Server for 3D Architecture Viewer
- Flask REST API on localhost:5001
- ONNX Runtime for depth estimation
- PyQt5 system tray (optional)
"""
import sys
import os
import json
import base64
import threading
import urllib.request
import urllib.error
from io import BytesIO
from pathlib import Path

# ── Optional dependencies ──────────────────────────────────
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    print('[AI] numpy not found. Install: pip install numpy', flush=True)

try:
    import onnxruntime as ort
    HAS_ONNX = True
except ImportError:
    HAS_ONNX = False
    print('[AI] onnxruntime not found. Install: pip install onnxruntime', flush=True)

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print('[AI] Pillow not found. Install: pip install Pillow', flush=True)

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
    HAS_FLASK = True
except ImportError:
    HAS_FLASK = False
    print('[AI] flask not found. Install: pip install flask flask-cors', flush=True)

# PyQt detection (try v5 then v6)
HAS_PYQT = False
try:
    from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QMenu, QAction
    from PyQt5.QtGui import QIcon, QPixmap, QPainter, QColor, QFont
    from PyQt5.QtCore import Qt
    HAS_PYQT = True
    QT_VER = 5
except ImportError:
    try:
        from PyQt6.QtWidgets import QApplication, QSystemTrayIcon, QMenu, QAction
        from PyQt6.QtGui import QIcon, QPixmap, QPainter, QColor, QFont
        from PyQt6.QtCore import Qt
        HAS_PYQT = True
        QT_VER = 6
    except ImportError:
        QT_VER = 0

# ── Configuration ──────────────────────────────────────────
PORT = 5001
MODELS_DIR = Path(os.path.expanduser('~')) / '.3darch' / 'models'
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Python 서버에서만 실행하는 모델 (대형 · GPU 지원)
# 소형 ONNX 모델(Depth Anything V2 Small, MiDaS v2.1 Small)은
# 브라우저에서 onnxruntime-web으로 직접 실행하므로 여기에 포함하지 않습니다.
AVAILABLE_MODELS = {
    'depth-anything-v2-base': {
        'name': 'Depth Anything V2 Base',
        'name_ko': 'Depth Anything V2 기본',
        'description': 'Higher-accuracy depth map · Python server (CUDA GPU supported)',
        'description_ko': '고정밀 깊이 맵 · Python 서버 실행 (CUDA GPU 지원)',
        'url': 'https://huggingface.co/onnx-community/depth-anything-v2-base/resolve/main/onnx/model.onnx',
        'filename': 'depth_anything_v2_base.onnx',
        'size_mb': 390,
        'task': 'depth',
        'input_size': [518, 518],
        'mean': [0.485, 0.456, 0.406],
        'std':  [0.229, 0.224, 0.225],
        'input_name': 'pixel_values',
    },
    'depth-anything-v2-large': {
        'name': 'Depth Anything V2 Large',
        'name_ko': 'Depth Anything V2 대형',
        'description': 'Highest-accuracy depth map · Python server + GPU required',
        'description_ko': '최고 정밀도 깊이 맵 · Python 서버 + GPU 필요',
        'url': 'https://huggingface.co/onnx-community/depth-anything-v2-large/resolve/main/onnx/model.onnx',
        'filename': 'depth_anything_v2_large.onnx',
        'size_mb': 1340,
        'task': 'depth',
        'input_size': [518, 518],
        'mean': [0.485, 0.456, 0.406],
        'std':  [0.229, 0.224, 0.225],
        'input_name': 'pixel_values',
    },
}

# Runtime state
sessions = {}           # modelId -> ort.InferenceSession
download_progress = {}  # modelId -> float 0.0–1.0 or -1.0 (error)


# ── Download helper ────────────────────────────────────────
def _download_model(mid):
    info = AVAILABLE_MODELS[mid]
    fpath = MODELS_DIR / info['filename']
    url = info['url']
    download_progress[mid] = 0.0
    try:
        def reporthook(count, block_size, total_size):
            if total_size > 0:
                download_progress[mid] = min(1.0, count * block_size / total_size)
        urllib.request.urlretrieve(url, str(fpath), reporthook=reporthook)
        download_progress[mid] = 1.0
        print(f'[AI] Downloaded {mid}', flush=True)
    except Exception as exc:
        print(f'[AI] Download error {mid}: {exc}', flush=True)
        if fpath.exists():
            fpath.unlink()
        download_progress[mid] = -1.0


# ── Flask app ──────────────────────────────────────────────
if not HAS_FLASK:
    sys.exit(1)

flask_app = Flask(__name__)
CORS(flask_app)


@flask_app.route('/api/status')
def api_status():
    return jsonify({
        'ok': True,
        'port': PORT,
        'numpy': HAS_NUMPY,
        'onnx': HAS_ONNX,
        'pil': HAS_PIL,
        'models_dir': str(MODELS_DIR),
    })


@flask_app.route('/api/models')
def api_models():
    result = []
    for mid, info in AVAILABLE_MODELS.items():
        fpath = MODELS_DIR / info['filename']
        prog = download_progress.get(mid)
        result.append({
            'id': mid,
            'name': info['name'],
            'name_ko': info['name_ko'],
            'description':    info.get('description', ''),
            'description_ko': info.get('description_ko', info.get('description', '')),
            'size_mb': info['size_mb'],
            'task': info['task'],
            'runtime': 'python-api',
            'downloaded': fpath.exists(),
            'loaded': mid in sessions,
            'download_progress': prog,
        })
    return jsonify(result)


@flask_app.route('/api/models/download', methods=['POST'])
def api_download():
    mid = (request.json or {}).get('id')
    if mid not in AVAILABLE_MODELS:
        return jsonify({'error': 'Unknown model'}), 404
    info = AVAILABLE_MODELS[mid]
    fpath = MODELS_DIR / info['filename']
    if fpath.exists():
        return jsonify({'ok': True, 'already_exists': True})
    prog = download_progress.get(mid)
    if prog is not None and 0 <= prog < 1:
        return jsonify({'ok': True, 'already_downloading': True})
    t = threading.Thread(target=_download_model, args=(mid,), daemon=True)
    t.start()
    return jsonify({'ok': True, 'downloading': True})


@flask_app.route('/api/models/load', methods=['POST'])
def api_load():
    mid = (request.json or {}).get('id')
    if mid not in AVAILABLE_MODELS:
        return jsonify({'error': 'Unknown model'}), 404
    if mid in sessions:
        return jsonify({'ok': True, 'already_loaded': True})
    info = AVAILABLE_MODELS[mid]
    fpath = MODELS_DIR / info['filename']
    if not fpath.exists():
        return jsonify({'error': 'Model not downloaded yet'}), 400
    if not HAS_ONNX:
        return jsonify({'error': 'onnxruntime not installed'}), 500
    try:
        providers = ort.get_available_providers()
        sess = ort.InferenceSession(str(fpath), providers=providers)
        sessions[mid] = sess
        print(f'[AI] Loaded {mid} via {providers[0]}', flush=True)
        return jsonify({'ok': True, 'provider': providers[0]})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@flask_app.route('/api/models/unload', methods=['POST'])
def api_unload():
    mid = (request.json or {}).get('id')
    if mid in sessions:
        del sessions[mid]
    return jsonify({'ok': True})


@flask_app.route('/api/models/delete', methods=['POST'])
def api_delete():
    mid = (request.json or {}).get('id')
    if mid not in AVAILABLE_MODELS:
        return jsonify({'error': 'Unknown model'}), 404
    info = AVAILABLE_MODELS[mid]
    fpath = MODELS_DIR / info['filename']
    if mid in sessions:
        del sessions[mid]
    if fpath.exists():
        fpath.unlink()
    download_progress.pop(mid, None)
    return jsonify({'ok': True})


@flask_app.route('/api/infer', methods=['POST'])
def api_infer():
    if not all([HAS_NUMPY, HAS_ONNX, HAS_PIL]):
        missing = [n for n, h in [('numpy', HAS_NUMPY), ('onnxruntime', HAS_ONNX), ('Pillow', HAS_PIL)] if not h]
        return jsonify({'error': f'Missing packages: {", ".join(missing)}'}), 500

    data = request.json or {}
    mid = data.get('model_id', 'depth-anything-v2-small')
    image_b64 = data.get('image', '')

    if mid not in sessions:
        return jsonify({'error': 'Model not loaded. Call /api/models/load first.'}), 400

    # Decode input image
    try:
        raw = image_b64.split(',', 1)[-1] if ',' in image_b64 else image_b64
        img = Image.open(BytesIO(base64.b64decode(raw))).convert('RGB')
    except Exception as exc:
        return jsonify({'error': f'Invalid image: {exc}'}), 400

    info = AVAILABLE_MODELS.get(mid, {})
    in_h, in_w = info.get('input_size', [518, 518])
    mean = np.array(info.get('mean', [0.485, 0.456, 0.406]), dtype=np.float32)
    std  = np.array(info.get('std',  [0.229, 0.224, 0.225]), dtype=np.float32)

    orig_w, orig_h = img.size

    # Preprocess
    img_r = img.resize((in_w, in_h), Image.BILINEAR)
    x = np.array(img_r, dtype=np.float32) / 255.0
    x = (x - mean) / std
    x = x.transpose(2, 0, 1)[np.newaxis]  # (1, 3, H, W)

    # Inference
    sess = sessions[mid]
    input_name = sess.get_inputs()[0].name
    try:
        outputs = sess.run(None, {input_name: x})
    except Exception as exc:
        return jsonify({'error': f'Inference error: {exc}'}), 500

    # Post-process: collapse to 2D grayscale
    depth = outputs[0]
    while depth.ndim > 2:
        depth = depth[0]

    dmin, dmax = float(depth.min()), float(depth.max())
    if dmax > dmin:
        depth_norm = ((depth - dmin) / (dmax - dmin) * 255).astype(np.uint8)
    else:
        depth_norm = np.zeros_like(depth, dtype=np.uint8)

    # Resize to original resolution and return
    depth_img = Image.fromarray(depth_norm).resize((orig_w, orig_h), Image.BILINEAR)
    buf = BytesIO()
    depth_img.save(buf, format='PNG')
    depth_b64 = base64.b64encode(buf.getvalue()).decode()

    return jsonify({
        'ok': True,
        'depth_map': f'data:image/png;base64,{depth_b64}',
        'width': orig_w,
        'height': orig_h,
        'model_id': mid,
    })


def run_flask():
    print(f'[AI] Flask server starting on port {PORT}', flush=True)
    flask_app.run(host='127.0.0.1', port=PORT, debug=False, use_reloader=False)


# ── PyQt5/6 system tray ────────────────────────────────────
def run_with_tray():
    qt_app = QApplication(sys.argv)
    qt_app.setQuitOnLastWindowClosed(False)

    # Build a simple 16×16 "AI" icon
    pix = QPixmap(16, 16)
    pix.fill(Qt.transparent if QT_VER == 5 else Qt.GlobalColor.transparent)
    p = QPainter(pix)
    p.setRenderHint(QPainter.Antialiasing if QT_VER == 5 else QPainter.RenderHint.Antialiasing)
    p.setBrush(QColor('#4a9eff'))
    p.setPen(Qt.NoPen if QT_VER == 5 else Qt.PenStyle.NoPen)
    p.drawEllipse(0, 0, 15, 15)
    p.setPen(QColor('#ffffff'))
    p.setFont(QFont('Arial', 6, QFont.Bold if QT_VER == 5 else QFont.Weight.Bold))
    p.drawText(pix.rect(), Qt.AlignCenter if QT_VER == 5 else Qt.AlignmentFlag.AlignCenter, 'AI')
    p.end()

    tray = QSystemTrayIcon(QIcon(pix), qt_app)
    tray.setToolTip(f'3D Arch AI Server · port {PORT}')

    menu = QMenu()
    act_quit = QAction('서버 종료', None)
    act_quit.triggered.connect(qt_app.quit)
    menu.addAction(act_quit)
    tray.setContextMenu(menu)
    tray.show()

    # Flask in background
    ft = threading.Thread(target=run_flask, daemon=True)
    ft.start()

    if QT_VER == 5:
        tray.showMessage('AI 서버 시작', f'포트 {PORT}에서 실행 중', QSystemTrayIcon.Information, 2000)
        sys.exit(qt_app.exec_())
    else:
        tray.showMessage('AI 서버 시작', f'포트 {PORT}에서 실행 중',
                         QSystemTrayIcon.MessageIcon.Information, 2000)
        sys.exit(qt_app.exec())


if __name__ == '__main__':
    if HAS_PYQT and os.environ.get('DISPLAY', '1') and sys.platform != 'linux':
        try:
            run_with_tray()
        except Exception:
            run_flask()
    elif HAS_PYQT and sys.platform == 'linux' and os.environ.get('DISPLAY'):
        try:
            run_with_tray()
        except Exception:
            run_flask()
    else:
        run_flask()
