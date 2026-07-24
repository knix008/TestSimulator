# 3D Architecture Viewer

건축 도면(DXF / IFC / 이미지 / 3D 모델)을 3D 공간으로 변환하는 멀티플랫폼 뷰어입니다.  
React + Three.js 기반으로 브라우저와 Electron 데스크톱 앱을 모두 지원합니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **DXF 파싱** | AutoCAD DXF 파일에서 벽·레이어를 추출해 3D 씬으로 변환 |
| **IFC 파싱** | BIM 표준 IFC(2x3 / IFC4) 파일에서 IfcWall 요소 추출 |
| **이미지 → 벽 감지** | PNG/JPG 평면도 이미지에서 Sobel+Hough로 벽 선분 자동 감지 |
| **3D 모델 로드** | OBJ / glTF / GLB 파일 직접 뷰 |
| **AI 깊이 추정** | ONNX-web(브라우저) 또는 Python 서버 경유 깊이 맵 생성 |
| **레이어 제어** | DXF/IFC 레이어별 개별 On/Off |
| **조명 제어** | 환경광·태양광·보조광 세기/색상 실시간 조정, 태양 위치 드래그 |
| **다크/라이트 테마** | 시스템 테마와 무관하게 앱 내 전환 |
| **한국어 / 영어** | 런타임 언어 전환 |
| **스크린샷** | 현재 3D 뷰를 PNG로 저장 |

---

## 지원 파일 형식

| 형식 | 확장자 | 비고 |
|------|--------|------|
| AutoCAD 도면 | `.dxf` | LWPOLYLINE, LINE, POLYLINE 지원 |
| BIM 표준 | `.ifc` | IFC2X3, IFC4 |
| 3D 모델 | `.obj` `.gltf` `.glb` | 머티리얼 포함 |
| 평면도 이미지 | `.jpg` `.jpeg` `.png` `.bmp` `.webp` `.svg` | 자동 벽 감지 |

---

## 기술 스택

```
React 18          UI 컴포넌트
Three.js 0.165    3D 렌더링 (WebGL)
Electron 31       크로스플랫폼 데스크톱 앱
onnxruntime-web   브라우저 내 AI 추론 (WebAssembly)
Vite 5            빌드 도구
Flask (Python)    GPU 기반 AI 서버 (선택)
```

---

## 빠른 시작

### 사전 요구사항

- Node.js 18 이상
- npm 9 이상

### 개발 서버 (웹 브라우저)

```bash
npm install
npm run dev
# http://localhost:5173 접속
```

### Electron 데스크톱 앱 (개발)

```bash
npm install
npm start
```

### 프로덕션 빌드

```bash
# 웹 빌드
npm run build

# Electron 설치 파일 (Windows .exe / macOS .dmg / Linux .AppImage)
npm run electron:build
npm run electron:build:win
npm run electron:build:mac
npm run electron:build:linux
```

---

## AI Python 서버 설정 (선택)

GPU 기반 고정밀 깊이 추정이 필요한 경우에만 필요합니다.  
브라우저 ONNX-web 모델(Depth Anything V2 Small, MiDaS)은 서버 없이 동작합니다.

```bash
# Windows
python\setup_python.bat

# macOS / Linux
bash python/setup_python.sh

# 서버 실행
python python/ai_server.py
# → http://127.0.0.1:5001
```

---

## 프로젝트 구조

```
3DArchitectureMultiOSV10/
├── src/
│   ├── App.jsx              # 루트 컴포넌트 · 상태 관리
│   ├── App.css              # 전역 스타일
│   ├── i18n.js              # 한국어/영어 번역 테이블
│   ├── components/          # UI 컴포넌트
│   │   ├── Viewer3D.jsx     # Three.js 3D 뷰포트
│   │   ├── SidePanel.jsx    # 좌측 설정 패널
│   │   ├── RightPanel.jsx   # 우측 속성 패널
│   │   ├── Toolbar.jsx      # 상단 툴바
│   │   ├── FileDropZone.jsx # 드래그&드롭 영역
│   │   ├── ModelManagerModal.jsx  # AI 모델 관리
│   │   └── SettingsModal.jsx      # 슬라이더 범위 설정
│   └── core/                # 비즈니스 로직
│       ├── buildGeometry.js  # Three.js 씬 구성
│       ├── dxfParser.js      # DXF 파싱
│       ├── ifcParser.js      # IFC 파싱
│       ├── imageParser.js    # 이미지 벽 감지 (Sobel+Hough)
│       ├── modelCatalog.js   # AI 모델 목록
│       ├── modelStore.js     # IndexedDB 모델 캐시
│       ├── onnxRunner.js     # ONNX-web 추론
│       └── aiClient.js       # Python AI 서버 REST 클라이언트
├── electron/
│   ├── main.js              # Electron 메인 프로세스
│   └── preload.js           # 컨텍스트 브릿지
├── python/
│   ├── ai_server.py         # Flask AI REST 서버
│   ├── requirements.txt     # Python 패키지 목록
│   ├── setup_python.bat     # Windows 환경 설정
│   └── setup_python.sh      # macOS/Linux 환경 설정
├── docs/                    # 문서
│   ├── README.md
│   ├── UsersGuide.md
│   └── Architecture.md
└── assets/                  # 아이콘 등 정적 자산
```

---

## 라이선스

MIT License
