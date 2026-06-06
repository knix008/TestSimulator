# MyDiagramWinV10

C# WinForms 기반의 간단한 다이어그램 편집기입니다. 도형/연결선을 배치하고, 선택한 도형의 **크기/색/글꼴/테두리** 등의 속성을 우측 패널에서 편집할 수 있으며, 조직도 등 **템플릿**으로 빠르게 시작할 수 있습니다.

## 실행 환경

- Windows 10/11
- .NET 10 SDK
- Visual Studio (권장) 또는 `dotnet` CLI

## 빌드/실행

### Visual Studio

- `MyDiagramWinV10.sln` 열기
- `MyDiagramWinV10` 프로젝트를 시작 프로젝트로 설정
- 실행(F5)

### dotnet CLI

```bash
dotnet build .\MyDiagramWinV10.csproj -c Release
dotnet run --project .\MyDiagramWinV10.csproj -c Release
```

## 화면 구성

- **좌측**: 도형/연결선 도구 패널
- **가운데**: 캔버스
- **우측**: 속성 패널 (선택한 도형/연결선의 속성 편집)

## 기본 사용법

- **도형 생성**: 좌측에서 도형 선택 → 캔버스에서 드래그
- **선택/이동**: 좌측에서 **선택** 도구 → 도형 클릭 후 드래그
- **크기 변경**
  - 도형 선택 후 **핸들 드래그**
  - 또는 우측 속성 패널의 **너비/높이** 숫자 입력
- **연결선 생성**: 좌측에서 연결선 선택 → 시작 도형 클릭 → 끝 도형 클릭

## 템플릿

`파일 → 템플릿`에서 다음 템플릿으로 새 프로젝트를 시작할 수 있습니다.

- 조직도 (기본 3단)
- 조직도 (부서형)
- 조직도 (프로젝트팀)
- 플로우차트 (기본)
- 순차 프로세스
- 네트워크 (기본)

## 단축키

- **Ctrl + 휠**: 확대/축소
- **Ctrl + 0**: 100%로 재설정
- **Space + 드래그**: 화면 이동(패닝)
- **Ctrl + Z / Ctrl + Y**: 실행취소 / 다시실행
- **Delete**: 선택 항목 삭제
- **Esc**: 선택 도구로 전환
- **Ctrl + 3**: 3D 보기

## 저장/내보내기

- 프로젝트 파일: `.mdg` (JSON, Windows 파일 형식 미등록)
- 내보내기: PNG/JPG/BMP 이미지, SVG, PDF

## 설치 파일(MSI)

Release 빌드 시 MSI가 생성됩니다.

- `bin\Release\installer\MyDiagramWinV10_Setup.msi`

