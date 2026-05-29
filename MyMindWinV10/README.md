# MyMind — Mind Map Application

WPF 기반 마인드맵 데스크톱 애플리케이션 (.NET 10)

## 요구 환경

- Windows 10/11
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Visual Studio 2022 이상 (또는 `dotnet CLI`)

## 빌드 및 실행

```bash
cd MyMindWin
dotnet run
```

또는 솔루션 파일(`MyMindWin.sln`)을 Visual Studio에서 열고 F5 실행.

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

### 레이아웃
| 버튼 | 설명 |
|------|------|
| `⊣⊢ Tree` | 수평 트리 레이아웃 (루트 → 오른쪽 확장) |
| `⊛ Radial` | 방사형 레이아웃 (루트 중심, 사방 확장) |

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
| 노드 더블클릭 | 인라인 텍스트 편집 |
| 캔버스 드래그 | 뷰 이동 (Pan) |
| 마우스 휠 | 마우스 위치 기준 확대/축소 |
| 중간 버튼 드래그 | 뷰 이동 (Pan) |

### 뷰 컨트롤
| 버튼 | 동작 |
|------|------|
| `🔍+` / `🔍-` | 단계 확대/축소 |
| `⌖ Reset` | 전체 노드가 보이도록 뷰 초기화 |

---

## 파일 형식

`.mmap` — JSON 기반 마인드맵 파일.

```json
{
  "id": "...",
  "text": "Main Topic",
  "isExpanded": true,
  "children": [
    {
      "id": "...",
      "text": "Branch 1",
      "children": []
    }
  ]
}
```

---

## 프로젝트 구조

```
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
