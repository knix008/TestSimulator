# 3DViewerV10

WinForms 기반 3D 파일 뷰어 프로젝트입니다.

## 주요 기능

- 디렉토리 트리 탐색
- 지원 포맷 3D 파일 목록 표시 (확장자별 아이콘)
- 3D 모델 로드 및 표시
- 마우스 회전/이동/줌
- 좌측 상단 줌 비율 표시
- 마지막 실행 디렉토리 자동 복원

## 지원 포맷

- `.obj`, `.stl`, `.3ds`, `.lwo`, `.off`
- `.fbx`, `.dae`, `.ply`, `.glb`, `.gltf`

## 실행 방법

```bash
dotnet run --project "Viewer3DWinForms/Viewer3DWinForms.csproj"
```

## 빌드 방법

```bash
dotnet build "Viewer3DWinForms/Viewer3DWinForms.csproj"
```

## 프로젝트 구조

- `Viewer3DWinForms/` : WinForms 애플리케이션 소스
- `.gitignore` : Git 제외 규칙
- `README.md` : 프로젝트 안내 문서

## 참고 사항

- 일부 포맷의 색상/텍스처는 모델의 UV 및 텍스처 경로 설정에 따라 표시됩니다.
- 텍스처 파일은 모델 파일에서 참조 가능한 경로에 있어야 합니다.
