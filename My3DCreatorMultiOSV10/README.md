# Omni3D Studio (My3DCreatorMultiOS)

> **Universal Cross-Platform 3D Creator & CAD Suite**  
> Designed for **Web, Windows, macOS, and Linux** using **Rust & TypeScript (React 18 / Three.js / WebGPU)**.

---

## 🌟 7개 3D 소프트웨어 패러다임 통합 모듈

Omni3D Studio는 서로 다른 7가지 3D 제작 워크플로우를 단일 스튜디오 UI에서 전환하며 작업할 수 있도록 설계되었습니다:

| 모드 | 참조 도구 | 기반 기술 | 특징 |
| :--- | :--- | :--- | :--- |
| **Mesh & Sculpt** | **Blender** | B-Mesh, Half-Edge, SubD | 점/선/면 편집, 압출(Extrude), 인셋, 스컬프팅 브러시(Grab, Smooth, Inflate) |
| **Interactive 3D** | **Spline** | Rapier3D 물리 엔진, State Machine | 마우스 호버/클릭 인터랙션, 실시간 중력/반발 물리 시뮬레이션, 웹 임베드 코드 생성 |
| **Box & Voxel** | **Blockbench** | 큐브 계층 구조, 픽셀 텍스처 | 마인크래프트/로우폴리 본(Bone) 구조, 16색 픽셀 팔레트, 실시간 UV 매핑 |
| **Parametric CAD** | **FreeCAD** | 2D 제약조건 솔버, Feature Tree | XY/XZ/YZ 스케치 평면, 직사각형/원/선 스케치, Pad(돌출) 파라메트릭 히스토리 트리 |
| **Code CAD** | **OpenSCAD** | Rust SCAD Parser, CSG Boolean | 실시간 코드 에디터, `cube()`, `sphere()`, `translate()`, 불리언 실시간 3D 렌더링 |
| **Liquid Clay** | **Womp** | SDF (Signed Distance Field) | WebGL/WebGPU 실시간 레이마칭, `smin` 기반 부드러운 점토/액체 블렌딩, 점토 재질 |
| **AI Studio** | **Meshy** | AI 3D Diffusion / Neural Mesh | Text-to-3D, Image-to-3D 프롬프트 입력 및 실시간 AI 3D 메시/텍스처 생성 파이프라인 |

---

## 🏗️ 아키텍처 구조

```
My3DCreatorMultiOSV10/
├── Cargo.toml                       # Cargo Workspace 루트
├── package.json                     # 프론트엔드 및 스크립트 설정
├── vite.config.ts                   # Vite + React 번들러 설정
├── crates/
│   ├── engine-core/                 # Rust 고성능 기하학/수학 연산 코어
│   │   ├── src/lib.rs
│   │   ├── src/types.rs             # Vec3, MeshData, BoundingBox
│   │   ├── src/scad.rs              # OpenSCAD AST 파서 및 노드 트리
│   │   ├── src/sdf.rs               # Womp SDF 거리 함수 및 smin/smax 블렌딩 연산
│   │   ├── src/voxel.rs             # Blockbench 큐브 및 UV 메셔
│   │   ├── src/csg.rs               # 불리언 Solid CSG 엔진
│   │   └── src/cad.rs               # 2D 스케치 및 PartDesign Pad 연산
│   └── engine-wasm/                 # WebAssembly 브라우저 바인딩
│       └── src/lib.rs
├── src-tauri/                       # Tauri v2 크로스 플랫폼 데스크톱 래퍼
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/main.rs
└── src/                             # 모던 React + TypeScript UI
    ├── components/
    │   ├── layout/                  # 헤더, 인스펙터, 하단 타임라인/상태바
    │   ├── viewport/                # Three.js 3D 뷰포트 (오르빗, 기즈모, SDF 셰이더)
    │   └── modes/                   # 7개 전용 모드별 패널 컴포넌트
    ├── core/                        # SCAD 파서, SDF 레이마칭 셰이더, 복셀 생성기
    └── types/                       # 전역 타입 정의
```

---

## 🚀 실행 및 멀티 OS 설치 파일 빌드

### 1. 단일 명령어로 모든 OS용 설치 파일 빌드 및 루트 복사
빌드 스크립트를 실행하면 **Windows, macOS, Linux용 설치 파일들이 빌드되어 프로젝트 루트 디렉토리에 자동으로 복사**됩니다:

```bash
# npm 스크립트 실행
npm run build:installers

# 또는 PowerShell (Windows)
./build.ps1

# 또는 Shell Script (Linux / macOS)
./build.sh
```

#### 루트 디렉토리에 생성되는 설치 파일 목록:
| 플랫폼 | 생성되는 설치 파일명 | 용도 및 형식 |
| :--- | :--- | :--- |
| **Windows** | `Omni3D-Studio-Setup-x64.exe` | **Windows 전용 자동 설치 마법사 실행 파일** |
| **Windows** | `Omni3D-Studio-Windows-x64.zip` | Windows 포터블 무설치 압축 패키지 |
| **Linux** | `Omni3D-Studio-Linux-x86_64.AppImage` | **Linux 범용 더블클릭 실행 패키지 (AppImage)** |
| **Linux** | `omni3d-studio_0.1.0_amd64.deb` | Ubuntu/Debian용 DEB 설치 패키지 (`dpkg -i`) |
| **Linux** | `Omni3D-Studio-Linux-x86_64.tar.gz` | Linux x86_64 바이너리 압축 배포 파일 |
| **macOS** | `Omni3D-Studio-macOS-Universal.dmg` | **macOS 전용 Apple 디스크 이미지 (.dmg) 설치 파일** |
| **macOS** | `Omni3D-Studio-macOS-Universal.zip` | macOS `Omni3D Studio.app` 애플리케이션 번들 |

---

### 2. 웹(Web) 개발 모드 실행
```bash
# 의존성 설치 (최초 1회)
npm install

# 로컬 개발 서버 실행 (http://localhost:3000)
npm run dev
```

### 2. 웹(Web / PWA) 프로덕션 빌드
```bash
npm run build
```
빌드된 결과물은 `dist/` 폴더에 생성되며, Vercel / Netlify / GitHub Pages 등 모든 정적 호스팅에 즉시 배포할 수 있습니다.

### 3. Rust 코어 검증 및 빌드
```bash
cargo check
cargo build
.\target\debug\my-3d-creator.exe
```

### 4. 데스크톱 앱 (Windows, macOS, Linux) 패키징
Tauri v2를 통해 각 OS별 네이티브 설치 파일(.msi / .dmg / .deb)을 생성합니다:
```bash
npm run tauri build
```

---

## 🎨 주요 뷰포트 기능
- **3D 카메라 조작**:
  - 오르빗(회전): 마우스 우클릭 드래그 또는 `Alt + 좌클릭 드래그`
  - 팬(이동): 마우스 휠 클릭 드래그 또는 `Shift + 좌클릭 드래그`
  - 줌(확대/축소): 마우스 휠 스크롤
- **오브젝트 선택 & 아웃라이너**: 클릭하여 선택, 우측 인스펙터에서 Position, Scale, Color, Roughness, Metalness 실시간 편집.
- **다양한 포맷 내보내기**: OBJ (Blender용), SCAD (OpenSCAD 코드용), STL (3D 프린터용), JSON 씬 데이터 지원.
