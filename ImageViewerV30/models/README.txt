이 디렉토리는 rembg 공식 ONNX 모델을 저장합니다.

공식 프로젝트: https://github.com/danielgatis/rembg

## 사용 방식

앱은 **rembg ONNX** (Microsoft.ML.OnnxRuntime)로 배경을 제거합니다.
rembg `BaseSession`과 동일한 전처리·후처리를 사용합니다 (투명 영역 → 검정 배경 합성).

편집기 **배경** 탭에서 모델을 선택할 수 있습니다.

**로컬에 모델이 없으면** 배경 제거 시 GitHub에서 **자동 다운로드**합니다.

## 지원 모델

| 모델 | 파일 | 용도 |
|------|------|------|
| **u2net (기본)** | `u2net.onnx` | 권장, 경량·안정 (~176MB, 320×320) |
| RMBG 2.0 (rembg2) | `bria-rmbg-2.0.onnx` | 고품질 (~1GB, 1024×1024) |

배경 제거 결과가 이상하면 **u2net**을 먼저 사용해 보세요.

### 다운로드 URL

- u2net: https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
- RMBG 2.0: https://github.com/danielgatis/rembg/releases/download/v0.0.0/bria-rmbg-2.0.onnx

설치 경로: `{실행폴더}\models\`

## 수동 설치

위 URL에서 ONNX 파일을 받아 이 폴더에 복사해도 됩니다.
다운로드 후 checksum(MD5/SHA256) 검증을 수행합니다.
