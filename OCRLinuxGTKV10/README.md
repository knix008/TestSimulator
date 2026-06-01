# OCRLinuxGTKV10

GTK 3 기반 **한글/영문 OCR** 프로그램 (Linux / macOS, C/C++)

**EasyOCR 전용 Python** — RapidOCR/PaddleOCR/Tesseract는 Python 없이 실행됩니다.

## 주요 기능

- **4종 OCR 엔진** — RapidOCR / PaddleOCR ONNX / EasyOCR / Tesseract
- **한국어 + 영어** — 한글·영문 혼합 문서 인식
- **이미지 + PDF** — PNG, JPEG, BMP, TIFF, GIF, WebP, PDF (페이지별 ◀▶ 이동)
- **전처리 모드** — 자동 / 손글씨 / 없음 (다중 패스 + 최적 결과 선택)
- **OCR 버튼 색상** — 비활성(회색) / 대기(파랑) / 진행중(주황) 3단계 표시
- **결과** — 복사, 텍스트 저장, 박스 이미지, 모두 저장, 지우기
- **설정 자동 저장** — 엔진, 전처리, 마지막 폴더
- **드래그 앤 드롭**, 단축키 (`Ctrl+O`, `F5`, `Ctrl+S`)

## 시스템 요구사항

| 항목 | 내용 |
|------|------|
| OS | Linux (Ubuntu 20.04+, Fedora, Arch) / macOS 12+ |
| GTK | 3.x |
| 컴파일러 | gcc + g++ (C11 / C++17) |
| 주요 라이브러리 | GLib/GIO, Cairo, Tesseract, Leptonica, Poppler, json-glib, libcurl, OpenCV 4+ |
| 추론 엔진 | ONNX Runtime 1.20 (make 시 자동 다운로드) |
| Python | EasyOCR 엔진 전용 (첫 실행 시 venv 자동 설치) |

## 빌드 및 실행

```sh
# 빌드 (시스템 패키지 + ONNX Runtime + 모델 자동 준비 후 컴파일)
make

# 실행
./myocr
```

`make` 단계에서 자동으로 수행되는 작업:
1. 시스템 패키지 확인 및 설치 (미설치 시 `sudo apt` 등 — 최초 1회)
2. ONNX Runtime v1.20.1 다운로드 → `third_party/onnxruntime/`
3. ONNX 모델 다운로드 → `models/`
4. 소스 컴파일 + 링크

패키지만 따로 설치하려면: `make deps`

### 추가 명령어

```sh
make clean          # 빌드 산출물 제거 (모델/ORT 유지)
make clean-models   # 다운로드된 모델만 제거
make NO_COLOR=1     # 색상 없이 빌드
make test-ocr       # OCR 엔진 스모크 테스트 (samples/Test01.png)
```

### 데스크톱 메뉴 등록 (Linux 선택)

```sh
cp myocr.desktop ~/.local/share/applications/
cp assets/myocr.png ~/.local/share/icons/hicolor/256x256/apps/myocr.png
gtk-update-icon-cache ~/.local/share/icons/hicolor 2>/dev/null || true
```

## OCR 엔진

| 엔진 | 모델 / 방식 | Python | 특징 |
|------|------------|--------|------|
| **RapidOCR** (권장) | PP-OCRv4 det + PP-OCRv1 Korean rec · ONNX RT | ✗ | 빠른 파이프라인 |
| **PaddleOCR ONNX** | PP-OCRv4 det + PP-OCRv1 Korean rec + CLS · ONNX RT | ✗ | 각도 보정 포함 |
| **EasyOCR** | ko+en · Python subprocess | ✓ | 첫 실행 시 venv + 모델 자동 설치 |
| **Tesseract** | tessdata_best kor+eng · libtesseract | ✗ | LSTM, 자동 다운로드 |

- ONNX 모델: [huggingface.co/SWHL/RapidOCR](https://huggingface.co/SWHL/RapidOCR) (빌드 시 자동 다운로드)
- EasyOCR Python 패키지: 첫 OCR 실행 시 venv에 자동 설치
- Tesseract 언어 데이터: 첫 사용 시 자동 다운로드

## 데이터 경로

| 항목 | 경로 |
|------|------|
| 사용자 설정 | `~/.config/OCRLinuxGTKV10/settings.json` |
| Tesseract 데이터 | `~/.local/share/OCRLinuxGTKV10/engines/tesseract/` |
| 빌드 모델 (번들) | `models/rapidocr/`, `models/paddle_onnx/` |
| ONNX Runtime | `third_party/onnxruntime/` |

## 프로젝트 구조

```
OCRLinuxGTKV10/
├── include/
│   ├── app/          # 앱 코어 API
│   ├── gtk/          # GTK UI
│   ├── image/        # 로더, PDF, 전처리
│   ├── ocr/          # 엔진, 다운로드, 경로
│   └── util/         # 설정, 결과 저장
├── src/
│   ├── app/
│   ├── gtk/
│   ├── image/
│   ├── ocr/
│   │   ├── providers/    # rapid_provider, paddle_onnx_provider, tesseract_provider
│   │   └── rapid_engine.cpp  # ONNX Runtime 추론 (DBNet + CRNN + CTC)
│   ├── util/
│   └── tools/        # ocr_smoke_test
├── assets/           # 앱 아이콘
├── samples/          # 테스트 이미지
├── models/           # 빌드 시 다운로드 (gitignore)
├── third_party/      # ONNX Runtime (gitignore)
├── Makefile
└── README.md
```

## 참고

- 이미지 전처리: Leptonica 기반 (대비 정규화, 역극성 보정, 기울기 보정)
- ONNX 추론: ONNX Runtime C API + OpenCV (이미지 처리)
- macOS: Homebrew의 OpenCV, GTK+3 사용
