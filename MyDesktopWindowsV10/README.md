# MyDesktop — Stardock Fences 방식 데스크톱 펜스

바탕화면 위에 반투명 컨테이너("펜스")를 올려 아이콘을 묶어두는 WPF(.NET 10) 앱입니다.
[Xstoudi/Palisades](https://github.com/Xstoudi/Palisades)를 참고했고, 그쪽이 다루지 않는
Fences 고유 동작(바탕화면 z-order 고정, 롤업, 우클릭 드래그 생성, 포털, 빠른 숨김)까지 구현했습니다.

## 빌드와 실행

```powershell
.\build.ps1                     # Debug 빌드
.\build.ps1 -Release            # Release 빌드
.\build.ps1 -Release -Clean     # 중간 산출물 지우고 빌드
.\build.ps1 -Release -Publish   # .\publish 에 단일 exe (약 275KB, 프레임워크 의존)
.\build.ps1 -Installer          # .msi 를 무조건 다시 만듦
.\build.ps1 -NoInstaller        # 컴파일만, .msi 는 그대로 둠

.\run.ps1                       # 빌드한 뒤 실행 (이미 떠 있으면 재시작)
.\run.ps1 -NoBuild              # 빌드 없이 실행
.\run.ps1 -Release              # Release로 빌드해 실행
.\run.ps1 -Stop                 # 종료
.\run.ps1 -Reset                # 저장된 배치를 .bak 으로 치우고 첫 실행처럼 시작
```

실행 정책 때문에 `.ps1` 이 막히면 `build.cmd` / `run.cmd` 를 대신 쓰거나 더블클릭하면 됩니다
(같은 인자를 그대로 받습니다). 공용 함수는 `common.ps1` 에 있습니다.

**빌드할 때마다 프로젝트 루트에 최신 `.msi` 가 남습니다.** 패키징은 자체 포함 런타임 130MB 를 다시
게시하는 일이라 매 컴파일에 얹기엔 느리므로, 루트의 설치 파일이 모든 소스보다 새로우면 건너뜁니다.
빠른 반복에는 `run.ps1` 을 쓰면 됩니다 — 컴파일하고 실행만 합니다.

설치 파일을 만들려면 WiX 도구가 필요합니다: `dotnet tool install --global wix`

- 코드를 고치려면 [ARCHITECTURE.md](ARCHITECTURE.md)
- 쓰는 방법은 [UsersGuide.md](UsersGuide.md)

두 스크립트 모두 **떠 있는 인스턴스를 먼저 강제 종료**합니다. 단일 인스턴스 앱이라 두 번째 실행이
조용히 죽고, 실행 중이면 exe 가 잠겨 빌드도 실패하기 때문입니다. 강제 종료는 앱의 정리 코드를
건너뛰므로, 스크립트가 **바탕화면 아이콘이 숨겨진 상태면 직접 되돌려 놓습니다.**

창이 없는 트레이 앱입니다. 트레이 아이콘 우클릭으로 전체 메뉴, 더블클릭으로 설정 창이 열립니다.
설정은 `%LOCALAPPDATA%\MyDesktop\fences.json`에 자동 저장됩니다.

## 구현된 Fences 동작

| 동작 | 설명 |
| --- | --- |
| 바탕화면에 붙는 펜스 창 | 모든 앱 창 아래, 배경화면 위. Alt+Tab·작업 표시줄에 안 뜸 |
| 첫 실행 마법사 | 바탕화면 내용을 Programs / Folders / Documents 펜스로 자동 분류 |
| 우클릭 드래그로 생성 | 빈 바탕화면에서 우클릭 드래그 → 그 사각형이 새 펜스가 되고 바로 이름 편집 |
| 빠른 숨김 | 빈 바탕화면 더블클릭 → 모든 펜스 숨김/복원 |
| 롤업 | 제목 표시줄 더블클릭(또는 ▲ 버튼) → 제목만 남기고 접힘 |
| 이동·크기 조절 | 제목 표시줄 드래그, 8방향 가장자리 핸들. 그리드·화면 가장자리·다른 펜스에 자석처럼 붙음 |
| 드래그 앤 드롭 | 탐색기/바탕화면에서 끌어다 놓기, 펜스 사이 이동, 펜스 안에서 순서 변경 |
| 폴더 포털 | 펜스를 폴더에 연결하면 그 폴더 내용을 실시간으로 비춤(FileSystemWatcher) |
| 정렬 | 수동 / 이름 / 종류 / 수정한 날짜 (이름 정렬은 탐색기와 같은 `StrCmpLogicalW`) |
| 외형 | 펜스 색·강조색·투명도·아이콘 크기(24~96)·레이블 표시 |
| 잠금 | 모든 펜스의 이동·크기 조절·이름 변경 잠금 |
| **바탕화면을 직접 그림** | 셸 아이콘 층을 끄고 MyDesktop이 휴지통·펜스 밖 항목을 그림. 그래서 펜스에 든 항목은 바탕화면에 안 보이고, 파일은 Desktop 폴더에 그대로 남아 탐색기에서는 보임. 종료 시 셸 아이콘 복원 |
| 시작 프로그램 등록 | HKCU Run 키 |

## 구조

```
build.ps1 / run.ps1      빌드·실행 스크립트 (common.ps1 에 공용 함수, *.cmd 는 래퍼)
App.xaml.cs              부트스트랩, 단일 인스턴스, 트레이 메뉴
Interop/
  NativeMethods.cs       P/Invoke 선언
  DesktopAnchor.cs       펜스를 배경화면 바로 위에 고정하는 z-order 로직
  DesktopMouseHook.cs    WH_MOUSE_LL — 우클릭 드래그 / 바탕화면 더블클릭
  DesktopIcons.cs        셸 아이콘 표시 토글 (탐색기 메뉴와 동일한 WM_COMMAND 0x7402)
  DisplayScale.cs        물리 픽셀 ↔ DIP 변환
  TrayIcon.cs            Shell_NotifyIcon 기반 트레이 (WinForms 의존 없음, TaskbarCreated 재등록)
  ShellContextMenu.cs    셸이 항목·바탕화면에 내주는 메뉴를 그대로 띄움
Models/WorkspaceData.cs  저장 모델 (설정 / 펜스 / 항목)
Services/
  FenceManager.cs        펜스·창·포털 수명 주기, 데스크톱 제스처 연결
  WorkspaceStore.cs      JSON 저장/로드 (600ms 디바운스, 원자적 교체, 구버전 마이그레이션)
  ShellIconService.cs    SHGetFileInfo + IImageList로 48px 셸 아이콘 추출
  DesktopLayer.cs        펜스 밖 항목 + 셸 항목(휴지통 등) 목록
  PortalSync.cs          폴더 → 펜스 미러링
  Diagnostics.cs         제스처/실행 추적 로그
  FenceSorting.cs        정렬 규칙
  StartupRegistration.cs 시작 프로그램 등록 (사용자별 Run 키, 설치 시 선택을 첫 실행에 반영)
Views/
  MenuStyles.xaml        MyDesktop이 직접 만드는 메뉴(트레이·펜스)의 외형, Windows 앱 테마를 따름
  FenceWindow.xaml       펜스 본체
  DesktopLayerWindow.xaml  MyDesktop이 그리는 바탕화면 (펜스 아래, 배경화면 위)
  LassoWindow.xaml       우클릭 드래그 고무줄
  SettingsWindow.xaml    설정/관리 창
```

### z-order를 잡는 방법

`HWND_BOTTOM`만 쓰면 창이 셸의 바탕화면 창(Progman)보다 **아래**로 내려가 안 보입니다.
그래서 펜스를 맨 아래로 내린 뒤 **바탕화면 창을 그 펜스 바로 아래로 한 칸 더 밀어냅니다**
(`DesktopAnchor.Sink`). `WM_WINDOWPOSCHANGING`에서 매번 다시 적용하므로 펜스를 클릭해
활성화돼도 다른 앱 위로 올라오지 않고, 탐색기 재시작이나 배경화면 변경에 대비해 4초마다
한 번씩 다시 확인합니다.

### 원본은 하나, 자리만 옮긴다

**펜스에 든 항목은 바탕화면에 안 보이지만, 탐색기에서는 그대로 보여야 한다** — 이것이 핵심
요구사항이고, 파일을 옮기지 않고 달성합니다.

정품 Fences는 셸의 아이콘 그리기를 가로챕니다. MyDesktop도 같은 길을 택했습니다:

1. 셸의 바탕화면 아이콘 층을 끕니다(탐색기 "보기 ▸ 바탕 화면 아이콘 표시"와 동일한 토글이라
   아이콘 배치가 보존되고 되돌릴 수 있습니다).
2. `DesktopLayerWindow`가 펜스보다 한 층 아래, 배경화면 바로 위에 전면 투명 창으로 앉아
   **휴지통 등 셸 항목 + 어느 펜스에도 안 든 Desktop 폴더 항목**을 직접 그립니다.
3. 어떤 항목이 펜스에 들어가면 그 순간 이 층에서 빠집니다. 파일은 `%USERPROFILE%\Desktop`에
   그대로 있으므로 탐색기에는 계속 보입니다.

셸의 아이콘 목록(`SysListView32`)에 있는 항목을 옮기거나 지우는 일은 하지 않습니다 — 아이콘
배치를 망가뜨리기 쉬운 영역이라 피했습니다.

## 그 밖의 파일 취급 규칙

- **"펜스에서 빼기"는 목록에서만 뺍니다.** 파일은 건드리지 않습니다.
- **"삭제"와 `Delete` 키는 파일을 휴지통으로 보냅니다.** `FOF_ALLOWUNDO` 를 준
  `SHFileOperation` 이라 탐색기에서 지운 것과 똑같이 되돌릴 수 있습니다. 위의 "빼기"와는
  다른 동작이라 메뉴에서도 구분선을 사이에 두고 떨어뜨려 놓았습니다.
- 펜스 사이 드래그는 파일을 건드리지 않고 참조만 옮깁니다.
- 펜스 항목을 바탕화면으로 끌어내면 펜스에서 빠지고 바탕화면 층에 나타납니다.
- 포털 펜스에 탐색기에서 파일을 끌어다 놓으면 같은 볼륨이면 이동, 다른 볼륨이면 복사합니다
  (탐색기와 같은 규칙).
- **MyDesktop은 파일을 옮기지 않습니다.** 펜스에 넣는 것은 그 항목을 바탕화면 층에서 빼고
  펜스에 그린다는 뜻일 뿐, `%USERPROFILE%\Desktop`의 파일은 그대로입니다. 한때 파일을 펜스
  폴더로 옮기는 설정이 있었으나, 요구사항과 어긋나고 실제로 파일을 잃을 뻔해 코드에서 제거했습니다.
- 프로세스가 강제 종료되면 셸 아이콘이 꺼진 채 남을 수 있습니다. `run.ps1 -Stop` 이 이를
  감지해 되돌려 놓고, 탐색기 우클릭 → 보기 → 바탕 화면 아이콘 표시로도 복구됩니다.

## 문제가 생기면

제스처와 실행 경로는 `%LOCALAPPDATA%\MyDesktop\diagnostics.log` 에 흔적을 남깁니다
(훅 설치 여부, 우클릭 드래그 좌표, 더블클릭과 실행 결과). 마우스 훅은 조용히 실패하는 유일한
부분이라 일부러 기록을 남깁니다.

## 계측으로 확인한 것

- 빌드: 경고 0, 오류 0 (.NET 10.0.400)
- z-order: 펜스 271/273/275 → 바탕화면 층 277 → Progman 279. 창을 활성화해도 유지
- 롤업: 250px → 34px → 250px (UI Automation으로 버튼 호출)
- 우클릭 드래그: `760,620 → 990,770` 전체 경로가 잡히고 펜스가 3개 → 4개
- 빠른 숨김: 빈 바탕화면 더블클릭으로 3 → 0 → 3
- 바탕화면 층: 펜스에 든 26개는 안 그림, 휴지통만 표시. 바탕화면에 파일을 추가하면 1 → 2,
  지우면 다시 1
- 더블클릭 실행: 항목에서 새 프로세스가 뜸
- 셸 아이콘 끄기/복원 왕복, `fences.json` 자동 저장

### 지나온 함정

- `HWND_BOTTOM`만으로는 배경화면 뒤로 숨음 → 바탕화면 창을 한 칸 더 내림
- 펜스가 전체 화면을 덮는 바탕화면 레이어 **아래**로 깔리면, 레이어가 거의 투명해 보이기는 그대로인
  채 입력만 샘 — 더블클릭이 바탕화면 제스처로 잡혀 펜스가 숨고, 우클릭은 바탕화면 메뉴가 뜸.
  `hwndInsertAfter` 는 "그 창 **뒤로**"라 레이어를 지정하면 더 나빠짐 → `WM_WINDOWPOSCHANGED` 에서
  **레이어를 다시 맨 아래로** 내리고, 그래도 레이어가 받은 우클릭은 해당 펜스에 넘김
- 칸 점유를 `Rect.IntersectsWith`로 물으면 **변만 닿아도 겹침**이라 모든 아이콘이 이웃과 충돌로
  판정됨 → 옆자리에 떨어뜨린 아이콘이 원래 자리로 되돌아감. 자리 계산은 칸 좌표로
- `SHBindToParent`의 자식 PIDL은 전체 PIDL **내부 포인터** → 전체를 먼저 해제하면 셸 메뉴를 만드는
  `GetUIObjectOf`에서 액세스 위반. `ILClone` 후 해제
- 편집기 터미널에서 띄우면 `ELECTRON_RUN_AS_NODE=1` 을 물려받고, 그것을 **펜스에서 실행한 앱이 또
  물려받아** Electron 앱이 창 없이 즉시 종료됨(오류도 로그도 없음) → `App.OnStartup` 에서 지움
- 훅에서 `WM_MOUSEMOVE`를 삼키면 **커서가 얼어붙어** 사각형을 그릴 수 없음 → 통과시킴
- 오른쪽 버튼 down 은 통과시키고 up 만 삼켰더니, 탐색기가 **마우스 캡처를 놓지 않아** 시스템
  전체가 멈춘 것처럼 보임 → down/up 을 **대칭으로** 삼키고, 드래그가 아니었으면 `SendInput`
  으로 클릭을 되돌려 줌 (자세한 내용은 [ARCHITECTURE.md](ARCHITECTURE.md) §5.2)
- `ListBoxItem`이 마우스 다운을 `Handled`로 표시 → `ListBox.MouseDoubleClick` 대신 Preview에서 처리
- 바탕화면 판정에 `SysListView32` 같은 클래스명만 보면 파일 대화상자와 다른 앱의 데스크톱
  위젯까지 걸림 → 창 클래스와 최상위 클래스를 **둘 다** 확인
