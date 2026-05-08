# 3DViewerV10

WinForms + WPF 기반 3D 파일 뷰어입니다.

## 주요 기능

- 디렉토리 트리 탐색 및 파일 목록 표시 (확장자별 아이콘)
- 3D 모델 로드 및 뷰포트 표시
- 마우스 조작: 좌클릭 드래그 회전 / 우클릭 드래그 이동 / 휠 줌
- 좌측 상단 줌 비율 오버레이
- 우측 상단 **조명 설정 패널** — 환경광·발광 슬라이더 실시간 조정
- GLB/glTF 텍스처 정상 표시 (UV 방향 보정, 내장 이미지 직접 디코딩)
- 파일 이름 바꾸기 / 삭제 (컨텍스트 메뉴)
- 마지막 실행 디렉토리 자동 복원

## 지원 포맷

| 포맷 | 로더 |
|------|------|
| `.glb`, `.gltf` | SharpGLTF (텍스처 포함) |
| `.fbx`, `.dae`, `.ply` | AssimpNet |
| `.obj`, `.stl`, `.3ds`, `.lwo`, `.off` | HelixToolkit |

## 빌드 및 실행

```bash
# 개발 실행
dotnet run --project Viewer3DWinForms/Viewer3DWinForms.csproj

# Release 빌드
dotnet build Viewer3DWinForms/Viewer3DWinForms.csproj -c Release
```

## 설치 파일 만들기

### 사전 준비 (최초 1회)

[Inno Setup 6](https://jrsoftware.org/isinfo.php) 를 설치합니다 (무료).

### Visual Studio에서 (권장)

1. `Viewer3DWinForms` 프로젝트 우클릭 → **게시(Publish)**
2. `Release_win-x64` 프로필 선택 후 **게시** 클릭
3. 자동으로 두 파일이 생성됩니다:
   - `publish/win-x64/Viewer3DWinForms.exe` — .NET 런타임 내장 단일 실행 파일
   - `publish/Viewer3DWinForms_Setup_1.0.0.exe` — Windows 설치 마법사

> Inno Setup이 설치되지 않은 경우 단일 EXE만 생성되고 경고가 표시됩니다.

### CLI에서

```bash
dotnet publish Viewer3DWinForms/Viewer3DWinForms.csproj \
  -c Release -r win-x64 --self-contained \
  -p:PublishSingleFile=true -p:PublishReadyToRun=true \
  -o publish/win-x64
```

## 프로젝트 구조

```
3DViewerV10/
├── Viewer3DWinForms/
│   ├── ThreeDViewerForm.cs          # 메인 폼 로직
│   ├── ThreeDViewerForm.Designer.cs # UI 레이아웃
│   ├── GltfSceneLoader.cs           # GLB/glTF 로더
│   ├── TextureBrushQuality.cs       # WPF 텍스처 품질 설정
│   └── Properties/PublishProfiles/  # 게시 프로필
├── 3DViewerV10.sln
├── .gitignore
└── README.md
```

## 의존성

- [SharpGLTF.Toolkit](https://github.com/vpenades/SharpGLTF) 1.0.5
- [HelixToolkit.Wpf](https://github.com/helix-toolkit/helix-toolkit) 3.1.2
- [AssimpNet](https://github.com/assimp/assimp-net) 4.1.0
