# OCRLinuxGTKV10

GTK 3 기반 **한글/영문 OCR** 프로그램 (Linux / macOS, C + Python)

Windows용 [OCRWinV10](../OCRWinV10)과 동일하게 **PaddleOCR · EasyOCR · Tesseract** 3종 엔진을 지원합니다.

## 주요 기능

- **3종 OCR 엔진** — PaddleOCR(권장) / EasyOCR / Tesseract
- **한국어 + 영어** — 한글·영문 혼합 문서 인식
- **이미지 + PDF** — PNG, JPEG, BMP, TIFF, GIF, WebP, PDF (페이지별 ◀▶ 이동)
- **전처리 모드** — 자동 / 손글씨 / 없음 (다중 패스 + 최적 결과 선택)
- **UI 레이아웃** — 상단: 입력 | 결과(박스) **동일 크기**, 하단: **행별** 인식 결과 목록
- **진행 표시**
  - 모델·엔진 **최초 설치**: 별도 팝업 + 프로그레스 바
  - **OCR 실행**: 하단 상태바 + 프로그레스 바 + 단계별 메시지
- **결과** — 복사, 텍스트 저장, 박스 이미지, 모두 저장, 지우기
- **설정 자동 저장** — 창 크기·위치, 분할 위치, 엔진, 전처리, 마지막 폴더
- **드래그 앤 드롭**, 단축키 (`Ctrl+O`, `F5`, `Ctrl+S`)

## 시스템 요구사항

- GTK 3, GLib/GIO, Cairo
- Tesseract (libtesseract), Leptonica, Poppler, json-glib, libcurl
- Python 3 (PaddleOCR / EasyOCR 사용 시, 앱이 venv를 자동 생성)

## 빌드 및 실행

```sh
make deps   # 최초 1회 — OS 패키지 설치 (apt/dnf/pacman/brew)
make
./myocr
```

빌드 시 `assets/myocr.png` 아이콘이 생성되며 실행 파일 옆에 `myocr.png`로 복사됩니다. 독/작업 표시줄에 아이콘이 표시됩니다.

데스크톱 메뉴 등록 (선택):

```sh
cp myocr.desktop ~/.local/share/applications/
cp assets/myocr.png ~/.local/share/icons/hicolor/256x256/apps/myocr.png
gtk-update-icon-cache ~/.local/share/icons/hicolor 2>/dev/null || true
```

색상 없이 빌드:

```sh
make NO_COLOR=1
```

정리:

```sh
make clean
```

OCR 엔진 스모크 테스트 (GUI 없음):

```sh
make test-ocr
```

Python OCR 패키지는 **첫 OCR 실행 시** venv에 자동 설치됩니다. 수동 설치가 필요하면:

```sh
python3 -m pip install -r scripts/requirements.txt
```

## 사용법

1. **파일 열기** — `열기` 또는 드래그 앤 드롭 (`Ctrl+O`)
2. **OCR 엔진** — PaddleOCR(권장) 등 선택
3. **전처리** — `자동` / `손글씨` / `없음`
4. **OCR 실행** — `F5` (미설치 엔진은 설치 팝업, OCR 중에는 상태바 진행률 표시)
5. **결과** — 복사, 텍스트 저장 (`Ctrl+S`), 박스 이미지, 모두 저장, 지우기

## OCR 엔진

| 엔진 | 설치 | 비고 |
|------|------|------|
| PaddleOCR | 모델 자동 다운로드 + Python venv | 한·영 V5, 권장 |
| EasyOCR | Python venv + 모델 자동 다운로드 | ko+en |
| Tesseract | tessdata 자동 다운로드 | kor+eng, 네이티브 C API |

Windows 전용 **Windows OCR**은 Linux/macOS에서 사용할 수 없습니다.

## 데이터 경로

| 항목 | 경로 |
|------|------|
| 사용자 설정 | `~/.config/OCRLinuxGTKV10/settings.json` |
| 엔진/모델 캐시 | `~/.local/share/OCRLinuxGTKV10/engines/` |
| Python venv | `~/.local/share/OCRLinuxGTKV10/engines/venv/` |

## 프로젝트 구조

```
OCRLinuxGTKV10/
├── include/
│   ├── app/          # 앱 코어 API (GTK 비의존)
│   ├── gtk/          # GTK UI
│   ├── image/        # 로더, PDF, 전처리
│   ├── ocr/          # 엔진, 다운로드, 스코어링
│   └── util/         # 설정, 결과 저장
├── src/              # .c 소스 (include/와 대응)
│   ├── app/
│   ├── gtk/
│   ├── image/
│   ├── ocr/
│   │   └── providers/
│   ├── util/
│   └── tools/        # ocr_smoke_test
├── scripts/          # Paddle/EasyOCR Python 브리지
├── Makefile
└── README.md
```

### 레이어

| 레이어 | GTK | 역할 |
|--------|-----|------|
| `app/`, `ocr/`, `image/`, `util/` | 없음 | OCR·파일·설정 |
| `gtk/` | 있음 | UI·이벤트·진행 표시 |

## 참고

- 전처리는 Leptonica 기반이며, Windows 버전(OpenCV)과 세부 알고리즘이 다를 수 있습니다.
- PaddleOCR는 2.x API를 사용합니다 (`scripts/requirements.txt` 참고).
