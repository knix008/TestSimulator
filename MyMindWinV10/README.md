# MyMind — Mind Map Application

WPF 기반 마인드맵 데스크톱 애플리케이션 (.NET 10)

## 요구 환경

- Windows 10/11
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Visual Studio 2022/2026 이상 (또는 `dotnet CLI`)
- MSI 빌드: [WiX Toolset v7](https://wixtoolset.org/) (`global.json`에 SDK 고정). Visual Studio에서는 [HeatWave for VS](https://marketplace.visualstudio.com/items?itemName=FireGiant.FireGiantHeatWaveDev17) 설치를 권장합니다.

## 빌드 및 실행

```bash
cd MyMindWin
dotnet run
```

또는 솔루션 파일(`MyMindWin.slnx`)을 Visual Studio에서 열고 F5 실행.

### MSI 설치 패키지 (Release)

Visual Studio 2026에서 **Release** 구성으로 빌드하면 WiX 기반 MSI가 자동 생성됩니다. **Debug** 구성에서는 MSI가 만들어지지 않습니다.

```bash
dotnet build -c Release MyMindWin/MyMindWin.csproj
```

**MSI 출력 경로**: `bin/Release/installer/MyMindWin_Setup.msi`

설치 UI(**기능 선택** 단계)에서 **바탕화면 바로가기**·**시작 메뉴 바로가기** 설치 여부를 각각 선택할 수 있습니다(기본값: 모두 설치).

`daemon_hammer.ico`가 다음에 표시됩니다.
- 설치 마법사 UI
- 바탕화면·시작 메뉴 바로가기
- Windows **설정 → 앱 → 설치된 앱**(프로그램 추가/제거)
- 설치된 `MyMindWin.exe` 파일 아이콘

---

## 화면 구성

```
┌─────────────────┬──────────────────────────────────────────┐
│  좌측: 구조 패널 │         우측: 마인드맵 캔버스              │
│  (TreeView)     │   (GDI+ 렌더링 / 줌·팬 지원)              │
│                 │                                          │
│ ▶ Main Topic    │          ┌── Idea 1 ──┬── Detail A       │
│   ▶ Idea 1      │ [루트] ──┤            └── Detail B       │
│   ▶ Idea 2      │          └── Idea 2 ──┬── Detail C       │
│     ▶ Detail C  │                       └── Detail D       │
└─────────────────┴──────────────────────────────────────────┘
```

---

## 주요 기능

### 레이아웃 / 정렬
| 메뉴·버튼 | 설명 |
|------|------|
| **정렬 → 트리 (수평)** / `⊣⊢ Tree` | 수평 트리로 전환 후 **자동 정렬** |
| **정렬 → 방사형** / `⊛ Radial` | 방사형으로 전환 후 **자동 정렬** |
| **정렬 → 현재 뷰 자동 정렬** / `⇅ 정렬` (`F5`) | 현재 뷰(Tree/Radial) 기준으로 노드 재배치 |
| **보기 → 화면 맞춤** / `⌖ 맞춤` (`F4`) | 줌·스크롤만 전체 맞춤 (위치 유지) |

### 노드 도형
| 도형 | 설명 |
|------|------|
| 둥근 사각형 | 기본 형태 |
| 사각형 | 직각 모서리 |
| 알약형 | 캡슐 형태 |
| 타원 | 타원/원형 |
| 마름모 | 다이아몬드 |

툴바 **도형** 콤보박스 또는 **도형** 메뉴에서 선택한 노드의 모양을 변경합니다. `.mmap` 파일에 `shape` 필드로 저장됩니다.

### 키보드 단축키
| 키 | 동작 |
|----|------|
| `Tab` | 자식 노드 추가 |
| `Enter` | 형제 노드 추가 |
| `Delete` | 선택 노드 삭제 |
| `F2` | 노드 이름 편집 |
| `Space` | 하위 노드 접기/펼치기 |
| `Ctrl+N` | 새 문서 |
| `Ctrl+O` | 파일 열기 |
| `Ctrl+S` | 저장 |
| `Ctrl+Shift+S` | 다른 이름으로 저장 |

### 마우스 조작
| 조작 | 동작 |
|------|------|
| 노드 클릭 | 노드 선택 (좌측 트리와 동기화) |
| 노드 드래그 | 노드 이동 (하위 노드 함께 이동) |
| 노드 더블클릭 | 인라인 텍스트 편집 |
| 빈 캔버스 드래그 | 뷰 이동 (Pan) |
| Ctrl + 마우스 휠 | 마우스 위치 기준 확대/축소 |
| 마우스 휠 | 캔버스 스크롤 (가로/세로) |
| 중간 버튼 드래그 | 뷰 이동 (Pan) |

### 뷰 컨트롤
| 버튼 | 동작 |
|------|------|
| `🔍+` / `🔍-` | 단계 확대/축소 |
| `⌖ Reset` | 전체 노드가 보이도록 뷰 초기화 |

---

## 파일 형식

`.mmap` — JSON 기반 마인드맵 파일. **노드 위치(x, y)**·**레이아웃(tree/radial)**·**접기 상태**·**색상**이 저장됩니다.

**파일 아이콘**: 중앙 노드에서 가지가 뻗는 마인드맵 문서 형태(`installer/assets/mmap_file.ico`). MSI 설치 시 `.mmap` 확장자와 연결되어 탐색기·바탕화면에서 표시됩니다. 아이콘 재생성: `python installer/assets/create_mmap_icon.py`

```json
{
  "version": 1,
  "layout": "tree",
  "root": {
    "id": "...",
    "text": "Main Topic",
    "isExpanded": true,
    "x": 80,
    "y": 120,
    "colorIndex": -1,
    "shape": "rounded",
    "children": [
      {
        "id": "...",
        "text": "Branch 1",
        "x": 280,
        "y": 80,
        "colorIndex": 0,
        "children": []
      }
    ]
  }
}
```

- **저장**: `Ctrl+S` 또는 툴바 Save — 드래그로 옮긴 위치가 그대로 기록됩니다.
- **열기**: `Ctrl+O` 또는 툴바 Open — 저장된 좌표·레이아웃으로 복원됩니다.
- 이전 버전(루트 노드만 있는 JSON) 파일도 열 수 있습니다.

---

## 프로젝트 구조

```
installer/
├── Package.wxs                 WiX 설치 패키지 정의
├── MyMindWin.Installer.wixproj
└── assets/                     라이선스·아이콘
MyMindWin/
├── Models/
│   └── MindMapNode.cs          # 데이터 모델 (JSON 직렬화)
├── ViewModels/
│   ├── RelayCommand.cs          # ICommand 구현
│   ├── NodeViewModel.cs         # 노드 + 레이아웃 프로퍼티
│   └── MainViewModel.cs         # 전체 로직, 명령, 레이아웃 엔진
├── Controls/
│   ├── MindMapCanvasControl.xaml      # 캔버스 UI
│   └── MindMapCanvasControl.xaml.cs  # WPF 렌더링, 줌/팬 엔진
├── MainWindow.xaml              # 메인 창 레이아웃
└── MainWindow.xaml.cs           # 트리↔캔버스 동기화
```
