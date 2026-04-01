# Yolo26Detection1.0

[Ultralytics YOLO26](https://docs.ultralytics.com/models/yolo26/) Detect 모델을 **ONNX**로보낸 뒤, **C# (WinForms + ONNX Runtime + OpenCvSharp)** 으로 이미지·동영상 객체 검출을 수행하는 예제 프로젝트입니다.

## 필요 환경

| 구분 | 요구 사항 |
|------|-----------|
| 앱 실행 | Windows, [.NET Framework 4.7.2](https://dotnet.microsoft.com/download/dotnet-framework) 이상, [Visual C++ 재배포 가능 패키지](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist) (OnnxRuntime용) |
| 빌드 | [.NET SDK](https://dotnet.microsoft.com/download) (SDK 스타일 프로젝트) 또는 Visual Studio |
| ONNX 생성 | Python 3.x, `pip install -r requirements.txt` |

## ONNX 모델 준비

1. 저장소 루트(이 폴더)에서:

   ```bash
   pip install -r requirements.txt
   python python/download_and_export_onnx.py
   ```

2. `models/` 아래에 `yolo26n.pt`(없으면 자동 다운로드)와 `yolo26n.onnx`가 생성됩니다.

3. **C# 앱은 기본적으로 e2e(one-to-one) 보내기**를 가정합니다. `export` 시 `--no-end2end`를 쓰면 출력 텐서 형식이 달라져 현재 코드와 맞지 않습니다.

4. 다른 크기: `--model yolo26s.pt` 등 ([Detect 계열](https://docs.ultralytics.com/models/yolo26/) `yolo26n` ~ `yolo26x`).

Windows에서 배치 파일을 쓰려면:

```bat
download_and_export_onnx.bat
```

## 빌드 및 실행

```bash
dotnet restore
dotnet build -c Debug
```

실행 파일: `bin\Debug\net472\Yolo26Detection1.0.exe`

프로젝트는 **`PlatformTarget` = x64** 로 설정되어 있습니다. `onnxruntime.dll`이 exe와 같은 폴더에 복사되어야 하며, 비어 있으면 `NativeMethods` 초기화 오류가 납니다.

빌드 시 `models\` 내용이 출력 폴더로 복사되므로, 위 스크립트로 만든 `yolo26n.onnx`가 있으면 실행 디렉터리 기준 경로가 맞습니다.

## 앱 사용 방법

1. **ONNX 경로**를 입력하거나 **찾기**로 선택합니다.
2. **모델 로드**를 눌러 추론 세션을 만듭니다. (첫 로드 전에는 검출 버튼이 비활성입니다.)
3. **신뢰도 임계**를 조정한 뒤 **이미지 검출** 또는 **동영상 검출**을 사용합니다.
4. ONNX 경로 텍스트를 바꾸면 이전 세션이 무효화되므로 **모델 로드**를 다시 눌러야 합니다.
5. 검출 후 **결과 화면 배율** 슬라이더로 확대·축소하고, 회색 영역 안에서 **스크롤**로 이동할 수 있습니다. 진행률은 하단 **ProgressBar**에 표시됩니다.

## ONNX IR 버전 / NuGet

최신 PyTorch·Ultralytics가 보내는 ONNX는 **IR 버전 10**일 수 있습니다. **Microsoft.ML.OnnxRuntime 1.19.x**는 IR 9까지만 지원하므로, 이 프로젝트는 **1.20 이상(현재 1.24.4)** 을 사용합니다. 오류 메시지에 `Unsupported model IR version`이 나오면 NuGet 복원·재빌드와 패키지 버전을 확인하세요.

## 문제 해결

- **`NativeMethods` / `AccessViolationException`**: (1) 출력 폴더에 **`onnxruntime.dll`이 없음** — `PlatformTarget`이 비어 있으면 NuGet이 네이티브 DLL을 복사하지 않을 수 있어, 이 프로젝트는 **x64**로 고정했습니다. `bin\Debug\net472\`에 `onnxruntime.dll`이 있는지 확인하세요. (2) Visual C++ 재배포 패키지(x64) 미설치. (3) 과거에는 백그라운드에서 세션을 만들 때도 문제가 될 수 있어, **모델 로드는 UI 스레드**에서 수행합니다.

## 프로젝트 구조 (요약)

| 경로 | 설명 |
|------|------|
| `Yolo26Detection1.0.cs` | 메인 폼, 모델 로드·검출 UI |
| `Yolo26OnnxDetector.cs` | Letterbox, ONNX 추론, e2e 출력 `(1,300,6)` 후처리 |
| `CocoNames.cs` | COCO 80 클래스 이름 |
| `python/yolo26_detect.py` | PyTorch 가중치 다운로드·검출(선택) |
| `python/download_and_export_onnx.py` | 다운로드 + ONNX 보내기 |
| `python/export_onnx.py` | 위 스크립트 호환 진입점 |
| `models/` | `.pt` / `.onnx` 저장 (대용량은 `.gitignore` 대상) |

## 참고

- 모델·학습·보내기: [Ultralytics 문서](https://docs.ultralytics.com/)
- 입력 이름 `images`, 출력 `output0`, 형식 `[1, 300, 6]` (`x1, y1, x2, y2, conf, class`).
