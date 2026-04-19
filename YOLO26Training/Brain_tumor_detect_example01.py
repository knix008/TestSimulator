"""
Gradio: upload a (positive) brain MRI image → **모든 파일(업로드 복사·오버레이·표·메타)은 `result/`에만** 저장합니다. `sample/`에는 쓰지 않습니다.

검출은 **ONNX** 모델만 사용합니다 (Ultralytics `YOLO("*.onnx", task="detect")`).
**ONNX 파일은 UI에서 선택**하거나(목록/직접 경로), 실행 시 `--model`로 기본값을 줄 수 있습니다.
입력 이미지와 검출 결과 이미지를 **분리**해 표시하며, 각 패널에서 **휠**로 확대·축소, **드래그**로 이동, **더블클릭**으로 뷰를 초기화합니다.

Run from project root:
  .\\venv\\Scripts\\python.exe Brain_tumor_detect_example01.py
  .\\venv\\Scripts\\python.exe Brain_tumor_detect_example01.py --model path\\to\\model.onnx

Positive 테스트 샘플(저장소 `sample/`):
  - `scripts/sync_positive_train_samples.py`로 **학습(train) 라벨 class 1(positive)** 이미지를 복사해 둡니다.
  - 기본 파일명: `sample_positive_train_01.*`, `sample_positive_train_02.*`
"""

from __future__ import annotations

import os

# ONNX Runtime stderr (e.g. MemcpyTransformer). Must use ORT_* name; see onnxruntime logging docs.
os.environ.setdefault("ORT_LOG_SEVERITY_LEVEL", "3")

import argparse
import json
import textwrap
from datetime import datetime
from pathlib import Path

import cv2
import gradio as gr
import numpy as np
import pandas as pd
import onnxruntime as ort

ort.set_default_logger_severity(3)  # 0=verbose … 3=error (hides warning-level Memcpy messages)

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
RESULT_DIR = ROOT / "result"
MODELS_DIR = ROOT / "models"
PREFERRED_ONNX = MODELS_DIR / "brain_tumor_yolo26n.onnx"

# Ultralytics brain-tumor YAML: class 0 = negative, 1 = positive → UI·plot 에는 한글 표기 사용.
# https://docs.ultralytics.com/datasets/detect/brain-tumor/
BRAIN_TUMOR_ID_TO_NAME: dict[int, str] = {
    0: "종양 음성",
    1: "종양 양성",
}
_LEGACY_EN_LABELS = {"negative": "종양 음성", "positive": "종양 양성"}

_model: YOLO | None = None
_model_onnx_path: Path | None = None

# 각 이미지 패널(.brain-zoom-panel): 휠 확대/축소, 드래그 이동(translate), 더블클릭 초기화
_IMAGE_PAN_ZOOM_JS = textwrap.dedent(
    """
    (() => {
      function getState(panel) {
        if (!panel._brainView) panel._brainView = { scale: 1, tx: 0, ty: 0 };
        return panel._brainView;
      }
      function syncSrc(panel, img) {
        const src = img.getAttribute("src") || "";
        if (panel._brainSrc !== src) {
          panel._brainSrc = src;
          panel._brainView = { scale: 1, tx: 0, ty: 0 };
        }
      }
      function apply(panel, img) {
        const st = getState(panel);
        img.style.transform = "translate(" + st.tx + "px," + st.ty + "px) scale(" + st.scale + ")";
        img.style.transformOrigin = "center center";
      }
      function onWheel(e) {
        const panel = e.target.closest(".brain-zoom-panel");
        if (!panel) return;
        const img = panel.querySelector("img");
        if (!img || !img.getAttribute("src")) return;
        e.preventDefault();
        e.stopPropagation();
        syncSrc(panel, img);
        const st = getState(panel);
        const step = e.deltaY > 0 ? -0.12 : 0.12;
        st.scale = Math.min(10, Math.max(0.12, st.scale + step));
        apply(panel, img);
      }
      let drag = null;
      function onMove(e) {
        if (!drag) return;
        const { panel, img, startX, startY, ox, oy } = drag;
        const st = getState(panel);
        st.tx = ox + (e.clientX - startX);
        st.ty = oy + (e.clientY - startY);
        apply(panel, img);
      }
      function onUp() {
        if (!drag) return;
        drag.panel.classList.remove("brain-pan-dragging");
        drag = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }
      function onDown(e) {
        if (e.button !== 0) return;
        const panel = e.target.closest(".brain-zoom-panel");
        if (!panel) return;
        const img = panel.querySelector("img");
        if (!img || !img.getAttribute("src")) return;
        /* Gradio ImagePreview wraps the image in a full-size <button>; do not treat every button as UI chrome. */
        if (e.target.closest(".icon-button-wrapper, a.download-link")) return;
        syncSrc(panel, img);
        e.preventDefault();
        img.draggable = false;
        const st = getState(panel);
        drag = {
          panel,
          img,
          startX: e.clientX,
          startY: e.clientY,
          ox: st.tx,
          oy: st.ty,
        };
        panel.classList.add("brain-pan-dragging");
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }
      function onDblClick(e) {
        const panel = e.target.closest(".brain-zoom-panel");
        if (!panel) return;
        const img = panel.querySelector("img");
        if (!img || !img.getAttribute("src")) return;
        panel._brainView = { scale: 1, tx: 0, ty: 0 };
        apply(panel, img);
      }
      window.addEventListener("wheel", onWheel, { capture: true, passive: false });
      window.addEventListener("mousedown", onDown, { capture: true });
      window.addEventListener("dblclick", onDblClick, { capture: true });
    })();
    """
)


def _onnx_files_in_models_dir() -> list[Path]:
    if not MODELS_DIR.is_dir():
        return []
    return sorted(MODELS_DIR.glob("*.onnx"))


def _onnx_dropdown_choices(*extra: Path | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for p in extra:
        if p is None:
            continue
        try:
            r = p.expanduser().resolve()
        except OSError:
            continue
        if r.is_file() and r.suffix.lower() == ".onnx":
            s = str(r)
            if s not in seen:
                seen.add(s)
                out.append(s)
    for p in _onnx_files_in_models_dir():
        s = str(p.resolve())
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _default_onnx_value(cli: Path | None) -> str | None:
    if cli is not None:
        c = cli.expanduser().resolve()
        if c.is_file() and c.suffix.lower() == ".onnx":
            return str(c)
    if PREFERRED_ONNX.is_file():
        return str(PREFERRED_ONNX.resolve())
    files = _onnx_files_in_models_dir()
    return str(files[0].resolve()) if files else None


def get_model(onnx_path: Path) -> YOLO:
    """선택된 ONNX 경로가 바뀌면 모델을 다시 로드합니다."""
    global _model, _model_onnx_path
    onnx_path = onnx_path.resolve()
    if not onnx_path.is_file():
        raise FileNotFoundError(f"ONNX 파일이 없습니다: {onnx_path}")
    if onnx_path.suffix.lower() != ".onnx":
        raise FileNotFoundError(f"`.onnx` 파일만 사용할 수 있습니다: {onnx_path}")

    if _model is None or _model_onnx_path != onnx_path:
        _model = YOLO(str(onnx_path), task="detect")
        _model_onnx_path = onnx_path
    return _model


def _apply_brain_tumor_korean_names(model: YOLO) -> None:
    """`predict` / `plot` 에서 박스 라벨이 한글로 나오도록 `names` 를 맞춥니다."""
    names: dict[int, str] = dict(BRAIN_TUMOR_ID_TO_NAME)
    try:
        model.names = names
        return
    except (AttributeError, TypeError, ValueError):
        pass
    inner = getattr(model, "model", None)
    if inner is not None and hasattr(inner, "names"):
        try:
            inner.names = names
        except (AttributeError, TypeError, ValueError):
            pass


def parse_onnx_selection(selection: str | None) -> Path:
    if selection is None or not str(selection).strip():
        raise FileNotFoundError("`ONNX 모델`에서 사용할 .onnx를 선택하거나 전체 경로를 입력하세요.")
    p = Path(str(selection).strip()).expanduser()
    if not p.is_absolute():
        p = (ROOT / p).resolve()
    else:
        p = p.resolve()
    if not p.is_file():
        raise FileNotFoundError(f"ONNX 파일을 찾을 수 없습니다: {p}")
    if p.suffix.lower() != ".onnx":
        raise FileNotFoundError(f"확장자는 `.onnx`여야 합니다: {p}")
    return p


def save_upload_to_result(rgb: np.ndarray) -> Path:
    """추론 입력용 업로드 복사본만 `result/`에 저장 (`sample/`에는 저장하지 않음)."""
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = RESULT_DIR / f"positive_{ts}.png"
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    if not cv2.imwrite(str(out), bgr):
        raise OSError(f"이미지 저장 실패: {out}")
    return out


def _empty_detection_df() -> pd.DataFrame:
    return pd.DataFrame(
        columns=["번호", "클래스", "신뢰도", "x1", "y1", "x2", "y2"],
    )


def _display_class_name(cls_id: int, model: YOLO) -> str:
    """박스·표에 쓸 사람이 읽는 클래스 이름 (0/1 숫자 표기 방지)."""
    if cls_id in BRAIN_TUMOR_ID_TO_NAME:
        return BRAIN_TUMOR_ID_TO_NAME[cls_id]
    n = getattr(model, "names", None)
    if isinstance(n, dict):
        raw = n.get(cls_id)
        if raw is not None:
            s = str(raw)
            if s in _LEGACY_EN_LABELS:
                return _LEGACY_EN_LABELS[s]
            if not (s.isdigit() and int(s) == cls_id):
                return s
    return f"class_{cls_id}"


def run_detect(
    rgb: np.ndarray | None,
    conf: float,
    onnx_selection: str | None,
) -> tuple[np.ndarray | None, pd.DataFrame, str]:
    """검출 오버레이 이미지(YOLO plot) + 표 + 요약 마크다운."""
    empty_df = _empty_detection_df()
    if rgb is None:
        return None, empty_df, "이미지를 업로드한 뒤 다시 시도하세요."

    try:
        onnx_path = parse_onnx_selection(onnx_selection)
    except FileNotFoundError as e:
        return None, empty_df, str(e)

    path = save_upload_to_result(rgb)

    try:
        model = get_model(onnx_path)
    except FileNotFoundError as e:
        return None, empty_df, str(e)

    _apply_brain_tumor_korean_names(model)

    results = model.predict(
        source=str(path),
        conf=float(conf),
        save=False,
        verbose=False,
    )
    r = results[0]

    plotted_bgr = r.plot()
    out_rgb = cv2.cvtColor(plotted_bgr, cv2.COLOR_BGR2RGB)

    rows: list[dict[str, object]] = []
    if r.boxes is not None and len(r.boxes):
        for i, box in enumerate(r.boxes):
            cls_id = int(box.cls[0])
            name = _display_class_name(cls_id, model)
            cf = float(box.conf[0])
            x1, y1, x2, y2 = (int(round(v)) for v in box.xyxy[0].tolist())
            rows.append(
                {
                    "번호": i + 1,
                    "클래스": name,
                    "신뢰도": round(cf, 4),
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                }
            )

    det_df = pd.DataFrame(rows) if rows else empty_df

    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    stem = path.stem
    overlay_path = RESULT_DIR / f"{stem}_overlay.png"
    csv_path = RESULT_DIR / f"{stem}_detections.csv"
    meta_path = RESULT_DIR / f"{stem}_meta.json"
    if not cv2.imwrite(str(overlay_path), plotted_bgr):
        raise OSError(f"결과 이미지 저장 실패: {overlay_path}")
    det_df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    meta_path.write_text(
        json.dumps(
            {
                "input_image": str(path),
                "onnx_model": str(onnx_path),
                "confidence_threshold": float(conf),
                "detection_count": len(rows),
                "saved_overlay": str(overlay_path),
                "saved_csv": str(csv_path),
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    try:
        names_raw = dict(model.names) if model.names is not None else {}
    except (TypeError, ValueError):
        names_raw = getattr(model, "names", None)
    lines = [
        f"**입력 파일** `{path.name}` (저장 경로: `{path}`)",
        "",
        f"- 백엔드: ONNX",
        f"- 사용 모델: `{onnx_path}`",
        f"- 박스·표 클래스 표기: **{BRAIN_TUMOR_ID_TO_NAME}** (0=종양 음성, 1=종양 양성)",
        f"- ONNX 메타 `names`(참고): `{names_raw}`",
        f"- **이 입력에서 검출된 건수:** {len(rows)}",
        "",
    ]
    if not rows:
        lines.append("검출된 박스가 없습니다. `confidence` 슬라이더를 낮춰 보세요.")
    else:
        lines.append("검출 시각화는 오른쪽 **검출 결과** 패널에 표시됩니다.")
    lines.extend(
        [
            "",
            f"- **결과 디렉터리 (`result/`):**",
            f"  - `{path.name}` — 추론 입력으로 저장한 업로드 복사본",
            f"  - `{overlay_path.name}` — 박스 오버레이",
            f"  - `{csv_path.name}` — 검출 표",
            f"  - `{meta_path.name}` — ONNX 경로·conf·건수",
        ]
    )

    return out_rgb, det_df, "\n".join(lines)


def _refresh_onnx_dropdown():
    ch = _onnx_dropdown_choices()
    return gr.update(choices=ch if ch else [])


def _zoom_panel_css() -> str:
    return """
    .brain-zoom-panel {
        overflow: hidden !important;
        max-height: 85vh;
        align-self: flex-start;
        display: flex !important;
        align-items: center;
        justify-content: center;
        cursor: grab;
        user-select: none;
    }
    .brain-zoom-panel.brain-pan-dragging {
        cursor: grabbing !important;
    }
    .brain-zoom-panel img {
        display: block;
        margin: 0 auto;
        max-width: none !important;
        transition: transform 0.05s ease-out;
        user-select: none;
        -webkit-user-drag: none;
    }
    """


def build_ui(cli_model: Path | None) -> gr.Blocks:
    choices = _onnx_dropdown_choices(cli_model)
    default_val = _default_onnx_value(cli_model)
    if default_val and default_val not in choices:
        choices = [default_val] + choices

    with gr.Blocks(title="Brain tumor YOLO 검출 테스트") as demo:
        gr.Markdown(
            "**Positive(변이) 이미지**를 왼쪽에 올리면 ONNX로 검출합니다. "
            "업로드 복사본·오버레이·CSV·JSON은 모두 **`result/`** 에만 저장됩니다 (`sample/`에는 결과를 쓰지 않음). "
            "**오른쪽**에 박스·라벨(**종양 음성** / **종양 양성**)이 그려진 결과가 나옵니다. "
            "아래 **ONNX 모델**에서 `models` 폴더의 파일을 고르거나, **전체 경로**를 직접 입력할 수 있습니다. "
            "각 이미지 패널에서 **휠**로 확대·축소, **드래그**로 이동, **더블클릭**으로 보기를 초기화합니다."
        )
        with gr.Row():
            onnx_dd = gr.Dropdown(
                label="ONNX 모델 (.onnx)",
                choices=choices if choices else [],
                value=default_val,
                allow_custom_value=True,
                filterable=True,
            )
            refresh_onnx = gr.Button("ONNX 목록 새로고침")
        refresh_onnx.click(fn=_refresh_onnx_dropdown, outputs=onnx_dd)

        with gr.Row(equal_height=False):
            with gr.Column(elem_classes=["brain-zoom-panel"], scale=1):
                inp = gr.Image(
                    type="numpy",
                    label="입력 (원본)",
                    sources=["upload"],
                    buttons=["download", "fullscreen"],
                    height=520,
                )
            with gr.Column(elem_classes=["brain-zoom-panel"], scale=1):
                out_img = gr.Image(
                    type="numpy",
                    label="검출 결과 (박스 오버레이)",
                    interactive=False,
                    buttons=["download", "fullscreen"],
                    height=520,
                )
        conf = gr.Slider(0.05, 0.95, value=0.25, step=0.05, label="confidence 최소값")
        btn = gr.Button("저장 후 검출", variant="primary")
        det_table = gr.DataFrame(
            label="검출 상세 (입력 파일 기준 좌표)",
            interactive=False,
        )
        log = gr.Markdown(label="요약")

        btn.click(
            fn=run_detect,
            inputs=[inp, conf, onnx_dd],
            outputs=[out_img, det_table, log],
        )
    return demo


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        type=Path,
        default=None,
        help="UI에서 ONNX 드롭다운의 초기값으로 쓸 .onnx 경로 (파일이 있어야 반영됨)",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7860)
    parser.add_argument("--share", action="store_true", help="Gradio 공유 링크 생성")
    args = parser.parse_args()

    choices = _onnx_dropdown_choices(args.model)
    if not choices:
        print(
            f"경고: `{MODELS_DIR}` 아래에 .onnx가 없습니다. "
            "파이프라인으로 export하거나 `--model`로 유효한 ONNX 경로를 지정하세요. "
            "UI는 열리지만, 드롭다운에 경로를 직접 입력해야 할 수 있습니다."
        )
    elif args.model is not None:
        mp = args.model.expanduser().resolve()
        if not mp.is_file():
            print(f"경고: --model 경로를 찾을 수 없습니다: {mp}")

    demo = build_ui(cli_model=args.model)
    demo.launch(
        server_name=args.host,
        server_port=args.port,
        share=args.share,
        css=_zoom_panel_css(),
        js=_IMAGE_PAN_ZOOM_JS,
        inbrowser=True,
    )


if __name__ == "__main__":
    main()
