# YOLO26V10

Windows Forms 기반 YOLO26 추론 도구입니다.  
현재 작업 타입: Segmentation / Detection / Pose / Classify / OBB

## 요구 사항

- Windows x64
- .NET SDK 10.x 이상
- (모델 변환 시) Python 3 + `ultralytics`

Python 준비 예시:

```powershell
py -3 -m pip install -r tools\requirements-export.txt
```

## 빌드

### 앱만 빌드

```powershell
dotnet build YOLO26V10.csproj -c Release
```

### 솔루션 빌드 (앱 + Installer)

```powershell
dotnet build YOLO26V10.sln -c Release
```

생성물:

- 앱: `bin\Release\net472\YOLO26V10.exe`
- 설치 파일(MSI): `bin\Release\installer\YOLO26V10_Setup.msi`

## 실행

```powershell
.\bin\Release\net472\YOLO26V10.exe
```

## 모델 준비/재시도 정책

- 앱에서 `모델 준비` 또는 다운로드 다이얼로그를 통해 `.pt` 다운로드 + ONNX 변환을 수행합니다.
- 실패 시 `다시 시도`를 선택하면 해당 모델의 로컬 `.pt`, `.pt.part`, `.onnx`를 정리한 뒤 처음부터 다시 진행합니다.
- 다운로드는 `.part` 임시 파일에 받고 완료 후 최종 파일로 이동합니다.

## Installer 동작

- 설치 범위: per-machine
- 설치 경로: `Program Files\YOLO26V10\app`
- 바탕화면/시작 메뉴 바로가기를 생성합니다.

## 참고

- Release 빌드 중 파일 잠금 오류가 나면 실행 중인 `YOLO26V10.exe`를 종료한 뒤 다시 빌드하세요.
- `dotnet build ... -p:SkipInstaller=true`로 MSI 생성 단계를 건너뛸 수 있습니다.
