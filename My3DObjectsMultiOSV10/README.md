# My3DObjects

**사진 한 장을 3D 물체로** 바꾸는 다중 플랫폼 프로그램입니다. **Stable Fast 3D** · **SPAR3D**(Stability AI), **TripoSR**(Tripo AI · Stability AI),
**TRELLIS**(Microsoft), **Hunyuan3D**(Tencent)를 **이 컴퓨터에서 직접** 실행하며 — **GPU가 있으면 GPU, 없으면 CPU** — 결과와 여러 형식의 3D 파일을
무한 격자 · 좌표축 · 눈금자 · 움직이는 광원이 있는 3D 화면에서 보고 **GLB · glTF · OBJ · STL · PLY · USDZ · 3MF · AMF · DAE · VRML · VTK · PCD · XYZ** 로
바꿔 저장합니다. **3D 프린터로 바로 뽑을 수 있게** mm 단위 · Z 위쪽 · 바닥에 놓기 · 구멍 메우기를 거친 **3MF(색 포함) · STL** 로도 내보냅니다.
버전 **1.0.0**. 하나의 코드베이스로 **웹 브라우저 · Windows · macOS · Linux** 에서 동작하며, 데스크톱 앱은 **Tauri 2**(Rust + 운영체제 웹뷰),
화면은 **React + three.js**, 변환 엔진은 **Python(PyTorch)** 입니다. 화면 스타일은 MyEBookReader V20 을 따릅니다.
(MyStableFast3D 에서 이름을 바꾸고 모델과 3D 프린트 기능을 더한 프로그램입니다.)

제작자: **SHKWON(knix008@naver.com)**

---

## 주요 기능

| 기능 | 설명 |
| --- | --- |
| 이미지 → 3D | 이미지를 열고(끌어다 놓기 가능) **[3D로 변환]**. 배경 자동 제거 → 모델 계산 → 메시 → UV 펼치기 → 텍스처 굽기 단계와 진행률이 보이고 취소할 수 있습니다 |
| 모델 선택 | 툴바의 **모델 드롭다운** (아래 표). Hunyuan3D 는 2.1 · 2.0 · 2.0 Turbo · 2.0 mini · mini Turbo 중 **버전 선택**(버전마다 옵션 따로; 지역 제한 라이선스라 처음 고를 때 동의 창). 모델은 등록 구조(`engine/my3dobjects/models/`)라 다른 모델을 추가할 수 있습니다. 처음 쓰는 모델은 자동 설치 |
| GPU / CPU | CUDA → Apple MPS → CPU 자동 선택. **GPU에서 실패하면 CPU로 자동 재변환**. 설정에서 GPU · CPU 고정 가능 |
| 자동 설치 | 첫 실행에 uv · Python 3.11 · PyTorch(GPU 유무에 맞는 판) · 라이브러리 · 배경 제거 모델 · 모델 코드와 가중치를 스스로 설치. **C++ 컴파일러가 필요 없습니다** — SF3D · SPAR3D 의 컴파일 확장, TRELLIS 의 xformers · spconv · kaolin 을 순수 PyTorch 코드(`engine/shims/`)로 대체 |
| **3D 프린트용 저장** | 파일 메뉴 · 내보내기 메뉴 · 오른쪽 클릭 · **Ctrl+Shift+P**. 크기(mm, 높이 또는 가장 긴 변 기준) · 3MF/STL · 구멍 메우기 · 색(3MF). 화면 그대로(회전 · 배율 포함)를 **Z 위쪽 · 앞면 −Y · 바닥 가운데**에 놓고, 정점 용접 · 잘못된 면 제거 · 구멍 메우기 · 면 방향 통일 · 안팎 바로잡기를 한 뒤 **수밀(watertight) 여부 · 크기 · 부피 · 최대 무게(PLA)** 를 보여 줍니다. PrusaSlicer · Bambu Studio · OrcaSlicer · Cura 가 바로 엽니다 |
| 로컬 우선 | 기본은 이 컴퓨터의 엔진. **유료 Stability AI API 는 기본 꺼짐** — 설정 → 엔진에서 확인 후 키를 넣어야만 사용. 다른 컴퓨터의 엔진(GPU 서버)에도 연결 가능 |
| 3D 화면 | **5×5 로 나뉜 무한 바닥 격자**(멀어질수록 흐려짐), **X · Y · Z 좌표축**(음의 방향 점선), **눈금자**(작은 칸 눈금, 큰 칸마다 길이, 높이 눈금자), 경계 상자와 치수, 방향 큐브, 화면 맞춤 · 7방향 보기 · 자동 회전 |
| 광원 | 태양광 · 점광원 · 스포트라이트 · 하늘광 · 주변광. **3D 화면에서 광원을 마우스로 끌어 이동**(축 · 평면 손잡이), 색 · 세기 · 그림자 · 각도 설정, 추가 · 삭제. 배치는 저장됩니다 |
| 우측 설정 패널 | 변환 · 장면(격자 · 축 · 눈금자 · 단위 · 배경 · 환경광 · 톤 매핑 · 노출 · 그림자) · 광원 · 재질(원래 · 점토 · 법선 · 정점 색, 와이어프레임 · 플랫 · 양면) · 모델(정보 · 회전 · 배율) · 카메라(시야각 · 방향 · 자동 회전) |
| 3D 파일 | **열기**: GLB · glTF · OBJ(+MTL · 텍스처) · STL · PLY · FBX · DAE · 3MF · 3DS · USDZ/USDA/USDC · VRML · VTK · AMF · PCD · XYZ · KMZ · LWO. **저장**: GLB · glTF · OBJ · STL(바이너리/ASCII) · PLY · USDZ · 3MF · AMF · DAE · VRML · VTK · PCD · XYZ, 회전 · 배율 적용 |
| 로그 패널 | 하단 패널에 설치 · 모델 불러오기 · 변환의 모든 단계. 출처 · 수준 필터, 찾기, 복사, 파일로 저장 |
| 시작 화면 | 열기 버튼 · 사용 순서 · 최근 파일과 예제 · 엔진 상태와 모델 · 지원 형식. 카드는 끌어 옮기고 크기를 바꾸며(12열 격자에 맞춤 · 놓일 자리 실루엣 · 겹치는 카드는 아래로 밀림) [자동 정렬] 로 되돌립니다. **배경 21종**(움직임 · 속도 · 투명도 · 자동 바꾸기). 시작 화면에서는 좌우 · 하단 패널과 그 버튼이 꺼집니다 |
| 저장 · 내보내기 · 인쇄 | **저장**(Ctrl+S, GLB) · **내보내기**(Ctrl+Shift+S, 형식 선택 · PNG) · **3D 프린트용 저장**(Ctrl+Shift+P). **인쇄**(Ctrl+P, 종이): 한 방향 · 4방향 · 6방향 · 방향별 한 장, 정보 머리말 · 흰 배경 · 보조선, 프린터 · 매수 · 방향, 미리 보기 (Windows GDI · CUPS `lp` · 웹은 브라우저 인쇄) |
| 예제 | `samples/` — 변환용 이미지 44개(직접 만든 5개 + TRELLIS.2 · TripoSR 공개 예제 39개, MIT), 3D 파일 6형식(GLB · glTF · OBJ+MTL · STL · PLY · USDZ), 변환 결과 2개. 시작 화면과 파일 메뉴에서 바로 엽니다 |
| 튜토리얼 | 8장 33단계를 실제 화면에서 따라 하는 학습. 시작할 때 할지 묻고("다음 시작 때 묻기"), 설정 → 화면에서도 켜고 끄며 이어서 할 수 있습니다 |
| 컨텍스트 메뉴 | 3D 화면 · 입력 이미지 · 기록 · 로그에서 오른쪽 클릭, 모든 항목에 아이콘 |
| 사용 설명서 | `doc/Guide.html` · `Guide.en.html` — 앱의 [사용 설명서] 버튼이 테마에 맞춰 별도 창으로 엽니다 |
| 모양 | 테마 40종 + 사용자 정의, 한국어 / English, 글꼴 설정. **제목 표시줄 없이** 툴바가 제목 표시줄 역할(끌어 창 이동, 두 번 눌러 최대화) — 왼쪽에 프로그램 아이콘 · 이름 · 버전(폭이 모자라면 아이콘만), 오른쪽 끝에 테마 · 언어 · 도움말 · 설정 · 정보 · 최소화 · 최대화 · 닫기 |

## 모델

| 모델 | 만든 곳 | 결과 | 가중치 | 라이선스 | 비고 |
| --- | --- | --- | --- | --- | --- |
| **Stable Fast 3D** | Stability AI | UV + PBR 텍스처 메시 | 4 GB | Stability AI Community License (HF 동의 · 토큰) | GPU 약 1초 |
| **SPAR3D** | Stability AI | UV + PBR 텍스처 메시 | 3.6 GB (+ CLIP 0.9 GB) | Stability AI Community License (HF 동의 · 토큰) | 점 구름을 먼저 만들어 뒷면이 더 정확. GPU 메모리 11 GB 미만이면 저메모리 모드(약 7 GB) |
| **TripoSR** | Tripo AI · Stability AI | 정점 색 메시 | 1.7 GB | MIT | 가볍고 CPU 로도 쓸 만함 |
| **TRELLIS** | Microsoft | 정점 색 메시 | 2.7 GB (+ DINOv2 1.2 GB) | MIT | 1.1B 대형 모델, 가장 정교한 편. GPU 메모리 12 GB 이상 권장, CPU 는 몇 분 |
| **Hunyuan3D** 2.1 · 2.0 · Turbo · mini | Tencent | 색 없는 형상 | 3.8–7.4 GB | Tencent Hunyuan 3D Community License (EU · 영국 · 한국 제외) | 버전 선택 |

TRELLIS 는 메시 디코더만 씁니다(가우시안 · 래디언스 필드 디코더와 텍스처 굽기는 CUDA 전용 컴파일 렌더러가 필요해 빼고, 정점 색 메시로 냅니다).

## 빠른 시작

```bash
npm install            # 의존성 (처음 한 번)
npm start              # 데스크톱 앱 (Tauri dev) — 엔진을 스스로 띄우고 설치
npm run web            # 웹 버전: http://localhost:5196 + 엔진 http://127.0.0.1:57660
npm run engine         # 엔진만 (--port, --host, --home)
```

설치 파일은 `npm run build:win`(Windows NSIS) · `build:mac`(DMG) · `build:linux`(AppImage · deb) 로 만들고, 만든 파일은 프로젝트 루트로 복사됩니다.
macOS · Linux 설치 파일은 해당 OS(또는 CI)에서 빌드합니다.

```bash
npm run clean          # 빌드 결과 지우기: dist · src-tauri/target · src-tauri/gen · public/doc · public/samples ·
                       #   build-info.json · Vite/Vitest 캐시 · __pycache__ · 루트로 복사된 설치 파일
npm run clean:all      # 위 + node_modules (다음 실행 때 자동 재설치)
npm run clean:dry      # 지울 목록과 크기만 보여 주고 아무것도 지우지 않음
```

git 이 추적하는 파일과 엔진 폴더(`%LOCALAPPDATA%\My3DObjects\engine` — venv · 모델 가중치)는 건드리지 않습니다.
MyStableFast3D 와 함께 설치해도 서로 겹치지 않습니다 — 식별자 `com.shkwon.my3dobjects`, 데이터 폴더 `My3DObjects`, 개발 서버 5196, 엔진 57660.

## 요구 사항

| | 최소 | 권장 |
| --- | --- | --- |
| OS | Windows 10 · macOS 11 · Ubuntu 22.04 급 | |
| 메모리 | 8 GB (CPU 변환은 빠듯) | 16 GB 이상 (TRELLIS 는 32 GB) |
| GPU | 없어도 됨 (CPU) | NVIDIA 8 GB VRAM 이상 (CUDA 12.8 드라이버; TRELLIS 12 GB+), Apple Silicon |
| 디스크 | 엔진 약 4 GB + 모델마다 2–7 GB | |
| 네트워크 | 첫 설치에만 (PyPI · download.pytorch.org · github.com · huggingface.co · dl.fbaipublicfiles.com · openaipublic) | |

Stable Fast 3D · SPAR3D 가중치는 Hugging Face 에서 약관 동의가 필요합니다(토큰). TripoSR · TRELLIS 는 필요 없습니다.

## 측정 (RTX 4070 노트북 · 16스레드 CPU)

| 모델 | GPU | CPU |
| --- | --- | --- |
| Stable Fast 3D (텍스처 1024 / 512) | 약 1.5 초 | 약 30 초 |
| TripoSR (메시 256 / 192) | 약 6 초 | 약 20 초 |

모델을 메모리에 처음 올릴 때 10–20 초가 더 걸립니다. SPAR3D · TRELLIS 는 아직 이 PC 에서 실제 변환을 재지 않았습니다.

## 3D 프린팅

1. 이미지를 변환하거나 3D 파일을 엽니다. 필요하면 우측 **모델** 탭에서 돌리거나(눕히기 등) 키웁니다.
2. **파일 → 3D 프린트용 저장**(Ctrl+Shift+P).
3. 크기(mm)와 기준(높이 / 가장 긴 변), 형식(3MF / STL), 구멍 메우기 · 색을 고릅니다. 오른쪽 **프린트 점검**에 결과 크기 · 수밀 여부 · 고친 것 · 부피 · 최대 무게가 바로 나옵니다.
4. 저장한 파일을 슬라이서에서 엽니다. 3MF 는 단위(mm)와 색을 담고, STL 은 mm 로 읽힙니다. 닫히지 않은 메시는 슬라이서의 수리 기능으로 마저 고칩니다.

## 테스트

```bash
npm test               # JS(vitest) + 엔진(Python unittest) + Rust(cargo test)
npm run smoke          # 웹 e2e: 헤드리스 Edge/Chrome + 실행 중인 엔진 (시작 화면 · 변환 · 격자 · 광원 끌기 · 형식 왕복 · OBJ+MTL ·
                       #   3D 프린트 저장 · 인쇄 미리 보기 · 메뉴 아이콘 · 튜토리얼 전 단계 · 설정). ENGINE_URL 로 엔진 지정
npm run smoke:print3d  # 3D 프린트용 저장: 파일 · 내보내기 · 오른쪽 클릭 메뉴와 Ctrl+Shift+P (dev 서버만 필요)
npm run guide:images   # 사용 설명서 그림 다시 찍기 (한국어 · 영어, dev 서버와 엔진 필요;
                       #   GUIDE_ONLY=print3d 는 엔진 없이 3D 프린트 창 그림만)
npm run samples        # samples/ 다시 만들기 (dev 서버 · Edge 필요)
npm run samples:index  # 브라우저 없이 index.json 갱신 (공개 예제 그림 등록, 빠진 mug.obj 다시 쓰기)
```

엔진 테스트 중 `test_shims.py` 는 TRELLIS 용 대체 모듈을 기준 계산과 비교합니다(희소 합성곱 ↔ dense conv3d, 블록 대각 attention ↔ softmax).
`test_trellis_tiny.py` 는 TRELLIS 가 설치된 뒤 실제 TRELLIS 코드를 작은 무작위 가중치로 CPU 에서 끝까지 돌립니다(설치 전에는 건너뜀).

## 폴더

```
src/                React 화면 (App.jsx, components/, lib/)
  lib/viewer3d.js   3D 화면: 무한 격자 셰이더, 좌표축, 눈금자, 광원 손잡이(TransformControls), 카메라
  lib/formats.js    3D 형식 읽기 · 저장 (three.js 로더 · 익스포터), 함께 쓰는 파일(MTL, .bin, 텍스처) 찾기
  lib/print3d.js    3D 프린트용: mm · Z 위 · 바닥, 용접 · 구멍 메우기 · 방향, 수밀 검사, 3MF · STL
  lib/engine.js     엔진 · 원격 엔진 · Stability API 클라이언트
  lib/print.js      종이 인쇄 배치 · 방향별 캡처 · A4 장 합성
  lib/tutorialSteps.js  튜토리얼 장 · 단계 · 동작
src-tauri/          Tauri 호스트 (lib.rs 창 · 파일 · 대화상자, engine.rs 엔진 실행기, print.rs 인쇄)
samples/            예제 이미지 · 3D 파일 · 변환 결과 (index.json)
engine/             Python 엔진 (my3dobjects: HTTP API · 설치기 · 모델 등록 · 순수 PyTorch 래스터라이저)
  shims/            컴파일 확장 대체: texture_baker · uv_unwrapper · torchmcubes, trellis/(xformers · spconv · kaolin …), spar3d/
scripts/            engine.mjs(웹용 실행기) · web.mjs · 빌드 · 아이콘 · 설명서 그림 · 예제
doc/                사용 설명서 (Guide.html, Guide.en.html, images/)
test/               vitest 단위 테스트, e2e/ 스모크
```

자세한 구조는 [Architecture.md](Architecture.md), 사용법은 [UsersGuide.md](UsersGuide.md) 와 `doc/Guide.html` 을 보세요.

## 라이선스

MIT. 모델은 포함되어 있지 않으며 처음 사용할 때 내려받고 각자의 라이선스를 따릅니다 —
Stable Fast 3D · SPAR3D: Stability AI Community License, TripoSR · TRELLIS: MIT, Hunyuan3D: Tencent Hunyuan 3D Community License.
예제 그림 39개는 TRELLIS.2 · TripoSR 저장소의 공개 예제(MIT)입니다. [NOTICE.md](NOTICE.md), [LICENSE-MODELS.md](LICENSE-MODELS.md).
