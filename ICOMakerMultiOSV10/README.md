# ICOMaker v1.0

다양한 이미지와 도형으로 아이콘을 디자인하고 Windows용 **`.ico`** 파일을 만드는
크로스 플랫폼(Web / Windows / macOS / Linux) 아이콘 제작 도구입니다.

> A cross-platform icon design tool. Draw shapes, add text, import images
> (PNG/JPG/GIF/BMP/WebP/SVG/**TIFF/HEIC/DICOM**…) onto a canvas and export
> multi-resolution `.ico` files.

제작자: **SHKWON** ([knix008@naver.com](mailto:knix008@naver.com)) · License: MIT

---

## 주요 기능

- **아이콘 디자인 캔버스** — 512×512 논리 좌표의 SVG 캔버스에서 직접 디자인
- **그리기 도구**
  - 기본: 선택 / 사각형 / 원·타원 / 선 / 자유 곡선 / 텍스트
  - 도형(18종): 삼각형·직각삼각형·마름모·사다리꼴·평행사변형·오각형·육각형·팔각형·별·십자·갈매기·화살표·하트·번개·초승달·구름·고리·톱니바퀴
  - 입체(5종): 정육면체·원기둥·구·원뿔·피라미드 (면별 음영으로 3D 표현)
- **개체 편집** — 선택·이동·크기 조절·회전, 상하위(z-order) 순서 변경, 복제/삭제
- **속성 & 효과** — 채우기/선 색(각각 20색 파스텔 프리셋), 선 두께, 불투명도, 모서리 둥글기, 글자 크기
- **효과** — 3D 입체(베벨 조명), 그림자, 흐림
- **다양한 입력 포맷** — 브라우저 네이티브(PNG/JPG/GIF/ICO/BMP/WebP/AVIF/SVG) + TIFF·HEIC·DICOM 자동 변환
- **ICO 내보내기** — 크기(16~256px) 다중 선택, 배경(투명/색 + 여백), 전체 투명도
  - 단일 멀티해상도 `.ico` 또는 크기별 개별 `.ico` 파일
- **UI** — 다크/라이트 테마, 한국어/영어, 프레임리스 창(툴바에 최소/최대/닫기), 상단 정보 바 + 하단 상태 바
- **오류 처리** — 상세 내용을 복사할 수 있는 오류 팝업
- **단일 인스턴스** — 이미 실행 중이면 팝업 후 종료

---

## 빠른 시작

```bash
npm install          # 의존성 설치
npm start            # 데스크톱 앱 실행 (Vite + Electron)
```

> **참고:** 일부 환경에서 `ELECTRON_RUN_AS_NODE=1` 이 전역 설정되어 있으면 Electron이
> Node로 실행되어 실패합니다. `scripts/start-electron.mjs` 런처가 이 변수를 제거하고
> 실행하므로 `npm start` 는 정상 동작합니다.

### 웹으로 실행

```bash
npm run web          # http://localhost:5173 (브라우저)
```

---

## 설치 파일 빌드

```bash
npm run build:win    # Windows 설치 파일 (NSIS)
npm run build:mac    # macOS (dmg)
npm run build:linux  # Linux (AppImage, deb)
```

- 빌드 결과는 `release/` 에 생성되며, **완료 후 자동으로 프로젝트 루트에도 복사**됩니다
  (`scripts/copy-installer.js`).
- Windows 설치 시 **바탕화면 / 시작 메뉴 바로가기**를 사용자가 선택할 수 있습니다
  (한/영 이중 언어, `build/installer.nsh`).

---

## npm 스크립트

| 스크립트 | 설명 |
|---|---|
| `npm start` | Vite + Electron 데스크톱 앱 실행 |
| `npm run web` / `npm run dev` | 웹(브라우저) 개발 서버 |
| `npm run build` | 웹 번들 빌드 (`dist/`) |
| `npm run build:win` \| `:mac` \| `:linux` | 플랫폼별 설치 파일 |
| `npm run generate:icons` | `assets/icon.svg` → 앱 아이콘(.ico/.icns/png) 생성 |
| `npm run generate:build-info` | `src/build-info.json` 생성(버전·커밋·빌드시각) |
| `npm run copy:installer` | `release/` 설치 파일을 루트로 복사 |

---

## 기술 스택

- **React 18** + **Vite 5** (plain JSX)
- **Electron 31** (프레임리스, 단일 인스턴스, contextIsolation)
- **i18next** (한국어/영어)
- **sharp** (빌드 시 앱 아이콘 래스터화) · **jszip** (크기별 zip 내보내기)
- 이미지 디코더: **utif**(TIFF) · **heic2any**(HEIC) · **dicom-parser**(DICOM)

자세한 구조는 [Architecture.md](Architecture.md), 사용법은 [UsersGuide.md](UsersGuide.md) 참고.
