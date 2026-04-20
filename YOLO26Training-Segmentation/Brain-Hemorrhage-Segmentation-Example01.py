"""
Gradio: 두부 CT 슬라이스 업로드 → **ICH(출혈) 인스턴스 분할** (YOLO segment ONNX).

- 모든 저장 파일(업로드 복사·오버레이·표·메타)은 **`result/`** 에만 둡니다. `sample/`에는 쓰지 않습니다.
- 추론은 **ONNX** + Ultralytics `YOLO("*.onnx", task="segment")` 만 사용합니다.
- ONNX는 UI 드롭다운/경로 입력 또는 `--model` 기본값.

Run from project root:
  .\\venv\\Scripts\\python.exe ich_seg_gradio_app.py
  .\\venv\\Scripts\\python.exe ich_seg_gradio_app.py --model models\\ich_yolo26n_seg.onnx
"""

from __future__ import annotations

import os

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

ort.set_default_logger_severity(3)

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
RESULT_DIR = ROOT / "result"
MODELS_DIR = ROOT / "models"
PREFERRED_ONNX = MODELS_DIR / "ich_yolo26n_seg.onnx"

HEM_ID_TO_NAME: dict[int, str] = {
    0: "출혈",
}

_model: YOLO | None = None
_model_onnx_path: Path | None = None

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
    global _model, _model_onnx_path
    onnx_path = onnx_path.resolve()
    if not onnx_path.is_file():
        raise FileNotFoundError(f"ONNX 파일이 없습니다: {onnx_path}")
    if onnx_path.suffix.lower() != ".onnx":
        raise FileNotFoundError(f"`.onnx` 파일만 사용할 수 있습니다: {onnx_path}")

    if _model is None or _model_onnx_path != onnx_path:
        _model = YOLO(str(onnx_path), task="segment")
        _model_onnx_path = onnx_path
    return _model


def _apply_hemorrhage_names(model: YOLO) -> None:
    names: dict[int, str] = dict(HEM_ID_TO_NAME)
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
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = RESULT_DIR / f"ich_input_{ts}.png"
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    if not cv2.imwrite(str(out), bgr):
        raise OSError(f"이미지 저장 실패: {out}")
    return out


def _empty_seg_df() -> pd.DataFrame:
    return pd.DataFrame(columns=["번호", "클래스", "신뢰도", "x1", "y1", "x2", "y2"])


def _display_class_name(cls_id: int, model: YOLO) -> str:
    if cls_id in HEM_ID_TO_NAME:
        return HEM_ID_TO_NAME[cls_id]
    n = getattr(model, "names", None)
    if isinstance(n, dict):
        raw = n.get(cls_id)
        if raw is not None:
            s = str(raw)
            if not (s.isdigit() and int(s) == cls_id):
                return s
    return f"class_{cls_id}"


def run_segment(
    rgb: np.ndarray | None,
    conf: float,
    onnx_selection: str | None,
) -> tuple[np.ndarray | None, pd.DataFrame, str]:
    empty_df = _empty_seg_df()
    if rgb is None:
        return None, empty_df, "이미지 파일을 직접 선택하거나 업로드한 뒤 다시 시도하세요."

    try:
        onnx_path = parse_onnx_selection(onnx_selection)
    except FileNotFoundError as e:
        return None, empty_df, str(e)

    path = save_upload_to_result(rgb)

    try:
        model = get_model(onnx_path)
    except FileNotFoundError as e:
        return None, empty_df, str(e)

    _apply_hemorrhage_names(model)

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

    seg_df = pd.DataFrame(rows) if rows else empty_df

    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    stem = path.stem
    overlay_path = RESULT_DIR / f"{stem}_seg_overlay.png"
    csv_path = RESULT_DIR / f"{stem}_instances.csv"
    meta_path = RESULT_DIR / f"{stem}_meta.json"
    if not cv2.imwrite(str(overlay_path), plotted_bgr):
        raise OSError(f"결과 이미지 저장 실패: {overlay_path}")
    seg_df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    meta_path.write_text(
        json.dumps(
            {
                "task": "segment",
                "input_image": str(path),
                "onnx_model": str(onnx_path),
                "confidence_threshold": float(conf),
                "instance_count": len(rows),
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
        f"- 백엔드: ONNX (YOLO **segment**)",
        f"- 사용 모델: `{onnx_path}`",
        f"- 클래스 표기: **{HEM_ID_TO_NAME}**",
        f"- ONNX 메타 `names`(참고): `{names_raw}`",
        f"- **이 입력에서 검출된 인스턴스 수:** {len(rows)}",
        "",
    ]
    if not rows:
        lines.append("분할 인스턴스가 없습니다. `confidence` 슬라이더를 낮춰 보세요.")
    else:
        lines.append("분할 시각화는 오른쪽 **분할 결과** 패널에 표시됩니다 (마스크·윤곽).")
    lines.extend(
        [
            "",
            f"- **`result/` 저장:**",
            f"  - `{path.name}` — 업로드 복사본",
            f"  - `{overlay_path.name}` — 마스크 오버레이",
            f"  - `{csv_path.name}` — 인스턴스 표 (박스 좌표)",
            f"  - `{meta_path.name}` — 메타데이터",
        ]
    )

    return out_rgb, seg_df, "\n".join(lines)


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

    with gr.Blocks(title="Brain CT ICH — YOLO segment 테스트") as demo:
        gr.Markdown(
            "**두부 CT 슬라이스**(PNG 등)를 왼쪽에 올리면 ONNX **세그멘테이션** 모델로 출혈 영역을 추론합니다. "
            "결과 파일은 모두 **`result/`** 에만 저장됩니다. "
            "오른쪽에는 마스크·윤곽이 그려진 **분할 결과**가 표시됩니다. "
            "각 이미지 패널에서 **휠**로 확대·축소, **드래그**로 이동, **더블클릭**으로 초기화합니다."
        )
        with gr.Row():
            onnx_dd = gr.Dropdown(
                label="ONNX 모델 (.onnx, segment)",
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
                    label="분할 결과 (마스크 오버레이)",
                    interactive=False,
                    buttons=["download", "fullscreen"],
                    height=520,
                )
        conf = gr.Slider(
            0.001,
            0.95,
            value=0.15,
            step=0.005,
            label="confidence 최소값 (ICH 슬라이스는 낮은 값에서도 마스크가 잡힐 수 있음)",
        )
        btn = gr.Button("저장 후 분할", variant="primary")
        seg_table = gr.DataFrame(
            label="인스턴스 상세 (박스 좌표, 입력 파일 기준)",
            interactive=False,
        )
        log = gr.Markdown(label="요약")

        btn.click(
            fn=run_segment,
            inputs=[inp, conf, onnx_dd],
            outputs=[out_img, seg_table, log],
        )
    return demo


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        type=Path,
        default=None,
        help="UI에서 ONNX 드롭다운 초기값으로 쓸 .onnx 경로",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7860)
    parser.add_argument("--share", action="store_true", help="Gradio 공유 링크 생성")
    args = parser.parse_args()

    choices = _onnx_dropdown_choices(args.model)
    if not choices:
        print(
            f"경고: `{MODELS_DIR}` 아래에 .onnx가 없습니다. "
            "세그 파이프라인으로 export하거나 `--model`로 ONNX 경로를 지정하세요."
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
