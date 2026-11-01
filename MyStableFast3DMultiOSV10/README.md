# MyStableFast3D

**사진 한 장을 3D 모델로** 바꾸는 다중 플랫폼 프로그램입니다. **Stable Fast 3D**(Stability AI)와 **TripoSR**(Tripo AI · Stability AI)를
**이 컴퓨터에서 직접** 실행하며 — **GPU가 있으면 GPU, 없으면 CPU** — 결과와 여러 형식의 3D 파일을 무한 격자 · 좌표축 · 눈금자 · 움직이는 광원이 있는
3D 화면에서 보고 **GLB · glTF · OBJ · STL · PLY · USDZ** 로 바꿔 저장합니다.
버전 **1.0.0**. 하나의 코드베이스로 **웹 브라우저 · Windows · macOS · Linux** 에서 동작하며, 데스크톱 앱은 **Tauri 2**(Rust + 운영체제 웹뷰),
화면은 **React + three.js**, 변환 엔진은 **Python(PyTorch)** 입니다. 화면 스타일은 MyEBookReader V20 을 따릅니다.

제작자: **SHKWON(knix008@naver.com)** · Powered by Stability AI

---

## 주요 기능

| 기능 | 설명 |
| --- | --- |
| 이미지 → 3D | 이미지를 열고(끌어다 놓기 가능) **[3D로 변환]**. 배경 자동 제거 → 모델 계산 → 메시 → UV 펼치기 → 텍스처 굽기 단계와 진행률이 보이고 취소할 수 있습니다 |
| 모델 선택 | 툴바의 **모델 드롭다운**: **Stable Fast 3D**(PBR 텍스처 메시) · **TripoSR**(정점 색 메시). 모델은 등록 구조(`engine/mysf3d/models/`)라 다른 모델을 추가할 수 있습니다. 처음 쓰는 모델은 자동 설치 |
| GPU / CPU | CUDA → Apple MPS → CPU 자동 선택. **GPU에서 실패하면 CPU로 자동 재변환**. 설정에서 GPU · CPU 고정 가능 |
| 자동 설치 | 첫 실행에 uv · Python 3.11 · PyTorch(GPU 유무에 맞는 판) · 라이브러리 · 배경 제거 모델 · 모델 코드와 가중치를 스스로 설치. **C++ 컴파일러가 필요 없습니다** — SF3D 의 컴파일 확장을 PyTorch 코드로 대체 |
| 로컬 우선 | 기본은 이 컴퓨터의 엔진. **유료 Stability AI API 는 기본 꺼짐** — 설정 → 엔진에서 확인 후 키를 넣어야만 사용. 다른 컴퓨터의 엔진(GPU 서버)에도 연결 가능 |
| 3D 화면 | **5×5 로 나뉜 무한 바닥 격자**(멀어질수록 흐려짐), **X · Y · Z 좌표축**(음의 방향 점선), **눈금자**(작은 칸 눈금, 큰 칸마다 길이, 높이 눈금자), 경계 상자와 치수, 방향 큐브, 화면 맞춤 · 7방향 보기 · 자동 회전 |
| 광원 | 태양광 · 점광원 · 스포트라이트 · 하늘광 · 주변광. **3D 화면에서 광원을 마우스로 끌어 이동**(축 · 평면 손잡이), 색 · 세기 · 그림자 · 각도 설정, 추가 · 삭제. 배치는 저장됩니다 |
| 우측 설정 패널 | 변환 · 장면(격자 · 축 · 눈금자 · 단위 · 배경 · 환경광 · 톤 매핑 · 노출 · 그림자) · 광원 · 재질(원래 · 점토 · 법선 · 정점 색, 와이어프레임 · 플랫 · 양면) · 모델(정보 · 회전 · 배율) · 카메라(시야각 · 방향 · 자동 회전) |
| 3D 파일 | **열기**: GLB · glTF · OBJ(+MTL · 텍스처) · STL · PLY · FBX · DAE · 3MF · 3DS · USDZ/USDA/USDC · VRML · VTK · AMF · PCD · XYZ · KMZ · LWO. **저장**: GLB · glTF · OBJ · STL(바이너리/ASCII) · PLY · USDZ, 회전 · 배율 적용 |
| 로그 패널 | 하단 패널에 설치 · 모델 불러오기 · 변환의 모든 단계. 출처 · 수준 필터, 찾기, 복사, 파일로 저장 |
| 시작 화면 | 열기 버튼 · 사용 순서 · 최근 파일 · 엔진 상태와 모델 · 지원 형식 |
| 사용 설명서 | `doc/Guide.html` · `Guide.en.html` — 앱의 [사용 설명서] 버튼이 테마에 맞춰 별도 창으로 엽니다 |
| 모양 | 테마 40종 + 사용자 정의, 한국어 / English, 글꼴 설정. OS 기본 제목 표시줄, 툴바 오른쪽 끝에 테마 · 언어 · 설명서 · 설정 · 정보 |

## 빠른 시작

```bash
npm install            # 의존성 (처음 한 번)
npm start              # 데스크톱 앱 (Tauri dev) — 엔진을 스스로 띄우고 설치
npm run web            # 웹 버전: http://localhost:5195 + 엔진 http://127.0.0.1:57650
npm run engine         # 엔진만 (--port, --host, --home)
```

설치 파일은 `npm run build:win`(Windows NSIS) · `build:mac`(DMG) · `build:linux`(AppImage · deb) 로 만들고, 만든 파일은 프로젝트 루트로 복사됩니다.
macOS · Linux 설치 파일은 해당 OS(또는 CI)에서 빌드합니다.

## 요구 사항

| | 최소 | 권장 |
| --- | --- | --- |
| OS | Windows 10 · macOS 11 · Ubuntu 22.04 급 | |
| 메모리 | 8 GB (CPU 변환은 빠듯) | 16 GB 이상 |
| GPU | 없어도 됨 (CPU) | NVIDIA 6 GB VRAM 이상 (CUDA 12.8 드라이버), Apple Silicon |
| 디스크 | 엔진 약 4 GB + 모델 가중치 2–6 GB | |
| 네트워크 | 첫 설치에만 (PyPI · download.pytorch.org · github.com · huggingface.co) | |

Stable Fast 3D 가중치는 Hugging Face 에서 약관 동의가 필요합니다(토큰). TripoSR 은 필요 없습니다.

## 측정 (RTX 4070 노트북 · 16스레드 CPU)

| 모델 | GPU | CPU |
| --- | --- | --- |
| Stable Fast 3D (텍스처 1024 / 512) | 약 1.5 초 | 약 30 초 |
| TripoSR (메시 256 / 192) | 약 6 초 | 약 20 초 |

모델을 메모리에 처음 올릴 때 10–20 초가 더 걸립니다.

## 테스트

```bash
npm test               # JS(vitest) + 엔진(Python unittest) + Rust(cargo test)
npm run smoke          # 웹 e2e: 헤드리스 Edge/Chrome + 실행 중인 엔진 (시작 화면 · 변환 · 격자 · 광원 끌기 · 형식 왕복 · OBJ+MTL · 설정)
npm run guide:images   # 사용 설명서 그림 다시 찍기 (한국어 · 영어)
```

## 폴더

```
src/                React 화면 (App.jsx, components/, lib/)
  lib/viewer3d.js   3D 화면: 무한 격자 셰이더, 좌표축, 눈금자, 광원 손잡이(TransformControls), 카메라
  lib/formats.js    3D 형식 읽기 · 저장 (three.js 로더 · 익스포터), 함께 쓰는 파일(MTL, .bin, 텍스처) 찾기
  lib/engine.js     엔진 · 원격 엔진 · Stability API 클라이언트
src-tauri/          Tauri 호스트 (lib.rs 창 · 파일 · 대화상자, engine.rs 엔진 실행기)
engine/             Python 엔진 (mysf3d: HTTP API · 설치기 · 모델 등록 · 순수 PyTorch 래스터라이저, shims/)
scripts/            engine.mjs(웹용 실행기) · web.mjs · 빌드 · 아이콘 · 설명서 그림
doc/                사용 설명서 (Guide.html, Guide.en.html, images/)
test/               vitest 단위 테스트, e2e/ 스모크
```

자세한 구조는 [Architecture.md](Architecture.md), 사용법은 [UsersGuide.md](UsersGuide.md) 와 `doc/Guide.html` 을 보세요.

## 라이선스

MIT. 모델은 포함되어 있지 않으며 처음 사용할 때 내려받고 각자의 라이선스를 따릅니다 —
Stable Fast 3D: Stability AI Community License, TripoSR: MIT. [NOTICE.md](NOTICE.md), [LICENSE-MODELS.md](LICENSE-MODELS.md).
