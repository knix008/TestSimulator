# My3DObjects — 구조

(MyStableFast3D 에서 이름을 바꾸고 SPAR3D · TRELLIS 와 3D 프린트용 저장을 더했습니다. 모델: Stable Fast 3D(SF3D) · SPAR3D · TripoSR · TRELLIS · Hunyuan3D.
식별자 `com.shkwon.my3dobjects`, 개발 서버 5196, 엔진 기본 포트 57660 으로 MyStableFast3D 와 겹치지 않습니다.)

## 한눈에

```
┌──────────────── 화면 (React + three.js, src/) ────────────────┐
│ Toolbar · StartScreen · InputPanel · ViewerPane · RightPanel  │
│ LogPanel · StatusBar · SettingsDialog · AboutDialog           │
│ PrintDialog(종이) · Print3DDialog(3D 프린터, lib/print3d.js)  │
│         │ lib/engine.js (HTTP)        │ window.desktopAPI     │
└─────────┼─────────────────────────────┼───────────────────────┘
          │                             │ (데스크톱만)
          ▼                             ▼
┌────────────── 엔진 (Python) ───┐  ┌──── Tauri 호스트 (Rust) ────┐
│ my3dobjects.server  HTTP API        │◀─│ engine.rs: uv 받기, venv,   │
│ my3dobjects.installer 자동 설치      │  │   python -m my3dobjects 실행/감시 │
│ my3dobjects.models  SF3D · SPAR3D · │  │ lib.rs: 창, 파일, 대화상자,  │
│   TripoSR · TRELLIS · Hunyuan3D     │  │                             │
│ my3dobjects.pipeline 장치 · 단계     │  │   클립보드, 설정, 팝아웃     │
│ my3dobjects.raster  PyTorch 래스터   │  └─────────────────────────────┘
└────────────────────────────────┘
   웹 버전: scripts/engine.mjs 가 엔진을 같은 방법으로 띄움
```

화면은 웹과 데스크톱이 같은 코드입니다. 차이는 `lib/platform.js` 한 곳(파일 열기 · 저장 · 클립보드 · 설정 저장)과
엔진 주소를 아는 방법(데스크톱은 호스트가 알려 주고, 웹은 설정의 주소)뿐입니다.

## 엔진

### 시작

데스크톱(`src-tauri/src/engine.rs`)과 웹(`scripts/engine.mjs`)이 같은 순서로 띄웁니다.

1. `<엔진 폴더>/bin/uv` — 없으면 GitHub 릴리스에서 받아 풉니다(Windows zip, 그 밖 tar.gz). uv 0.13.1 고정.
2. `uv venv --python 3.11 <엔진 폴더>/venv` — uv 가 Python 을 직접 받습니다(`UV_PYTHON_INSTALL_DIR=<엔진>/python`, `only-managed`).
3. `venv/python -m my3dobjects --home <엔진> --port <포트> --uv <uv> --parent-pid <앱 PID>`
   - 표준 라이브러리만으로 시작해 바로 HTTP 를 엽니다. `MY3DOBJECTS_LISTENING <port>` 한 줄로 실행기에 알립니다.
   - 부모 프로세스가 끝나면 스스로 끝납니다(Windows `WaitForSingleObject`, 그 밖 `kill(pid, 0)` 폴링).
     **stdin 감시는 쓰지 않습니다**: Windows 에서 파이프를 읽고 있는 스레드가 있으면 다른 스레드의 GetFileType/isatty 가
     GIL 을 쥔 채 멈춰, PyTorch 를 불러오는 순간 엔진 전체가 굳었습니다.
   - 종료 코드 75 = 다시 시작해 달라(엔진 다시 설치 후).

엔진 폴더: Windows `%LOCALAPPDATA%\My3DObjects\engine`, macOS `~/Library/Application Support/My3DObjects/engine`,
Linux `~/.local/share/My3DObjects/engine`. `MY3DOBJECTS_ENGINE_HOME` 으로 바꿉니다(시험용). 데스크톱과 웹이 같은 폴더를 씁니다.

### 설치 (`installer.py`)

| 단계 | 내용 |
| --- | --- |
| torch | `nvidia-smi` 로 GPU 확인 → `cuda`(cu128 인덱스) · `cpu`(cpu 인덱스) · `default`(PyPI: Apple Silicon, Linux ARM) · `mac-intel`(2.2.2). torch 2.8.0 / torchvision 0.23.0 |
| packages | SF3D requirements 의 고정 버전(transformers 4.42.3, open_clip 2.24.0, trimesh 4.4.1, numpy 1.26.4, huggingface-hub 0.23.4, rembg 2.0.57 …) |
| optional | gpytoolbox · pynanoinstantmeshes (실패해도 리메시만 꺼짐) |
| bgmodel | rembg u2net (`U2NET_HOME=<엔진>/u2net`) |
| 모델별 source | GitHub 고정 커밋 zip → `<엔진>/models/<id>/src`. `extra_sources` 도 함께: TRELLIS 의 FlexiCubes(서브모듈이라 zip 에 없음 → `src/trellis/representations/mesh/flexicubes`), SPAR3D 의 AlphaCLIP(`models/spar3d/alpha_clip`). 모델 전용 pip 패키지(`packages`)는 기본 패키지 버전을 바꾸지 못하게 constraints 로 설치 |
| 모델별 weights | Hugging Face 캐시에 있으면 그대로(네트워크 없이), 없으면 받기. 받는 동안 바이트 진행률. 약관 동의가 필요한 모델에 토큰이 없으면 `needs-token`. 이어서 `fetch_extras`: TRELLIS 의 DINOv2(torch.hub → `models/trellis/torch-hub`), SPAR3D 의 CLIP ViT-L/14@336px(`models/spar3d/clip`) — 첫 변환이 네트워크를 기다리지 않게 |
| 모델별 verify | import 확인과 장치 보고 |

끝난 단계는 `install-state.json` 에 기록되어 중단되면 이어서 합니다. 레시피(`RECIPE`)가 바뀌면 처음부터.
설치 중에도 HTTP 는 열려 있어 화면이 `/api/health` 의 단계 · 진행률과 `/api/logs` 를 보여 줍니다.

### 컴파일 없는 SF3D

SF3D 는 `texture_baker`, `uv_unwrapper` 두 C++/CUDA 확장을 설치 때 컴파일해야 합니다(Windows 는 Visual Studio).
자동 설치를 위해 그 세 연산자를 PyTorch 로 다시 구현해 같은 이름으로 등록합니다(`my3dobjects/raster.py`, `torch.library`):

- `texture_baker_cpp::rasterize` — 삼각형마다 경계 상자 안의 픽셀 후보를 텐서로 펼쳐 무게 중심 좌표 판정(baker.cpp 와 같은 표본점 · 규칙). 픽셀당 한 삼각형만 쓰도록 승자를 정합니다. 후보 수를 묶음으로 나눠 메모리를 제한.
- `texture_baker_cpp::interpolate` — 픽셀별 속성 보간.
- `UVUnwrapper::assign_faces_uv_to_atlas_index` — 같은 큐브 면 그룹에서 UV 가 겹치는 면을 1024² 표본 격자로 찾아, 축 방향으로 뒤에 있는 면을 다음 슬롯(+6, 최대 12)으로 옮깁니다(unwrapper.cpp 규칙).

`shims/texture_baker`, `shims/uv_unwrapper` 패키지가 이 연산자를 쓰는 upstream Python 코드(unwrap.py)를 그대로 불러옵니다.
SPAR3D 도 같은 두 확장을 쓰므로 같은 shim 을 씁니다(`uv_unwrapper` 는 `MY3DOBJECTS_SF3D_SRC` 또는 `MY3DOBJECTS_SPAR3D_SRC` 의 unwrap.py).
TripoSR 의 `torchmcubes` 는 scikit-image marching cubes 로 대체합니다.
DINOv2 · CLIP 은 설정만으로 만들어 1.8 GB 의 사전 학습 가중치를 받지 않습니다(`model.safetensors` 가 덮어씀; SPAR3D 는 체크포인트에
인코더 가중치가 있는지 먼저 확인).

### SPAR3D

SF3D 의 후속(같은 코드 바탕): 작은 확산 모델이 물체 전체의 색 점 구름(512점)을 먼저 만들고, 그 점 구름과 이미지로 메시를 만듭니다.
`models/spar3d.py` 는 SF3D 어댑터를 물려받고 다음을 더합니다.

- `transparent_background`(SPAR3D 자체 배경 제거기)는 import 만 되므로 `shims/spar3d` 의 대체 모듈로 막습니다(엔진이 rembg 로 지움).
- AlphaCLIP 은 `from pkg_resources import packaging` 을 하는데 엔진 venv 에는 setuptools 가 없어 `packaging` 을 담은 대체 모듈을 끼웁니다.
- 남은 GPU 메모리가 11 GB 미만이면 SPAR3D 자체의 **low-VRAM 모드**(점 확산 · 본체 · 추정기를 번갈아 GPU 에 올림, 약 7 GB)로 불러옵니다.
  이 모드는 실행마다 부품을 새로 만들므로 진행 단계는 블록 hook 이 아니라 메서드(`forward_pdiff_cond`, `triplane_to_meshes` …)로 보고합니다.
- 옵션: SF3D 와 같은 텍스처 · 리메시에 점 구름 확산의 `guidanceScale`(3) · `seed`.

### TRELLIS (컴파일 없는 희소 3D)

TRELLIS 는 두 개의 rectified-flow 트랜스포머(희소 구조 16³ → 64³ 점유, 구조화 잠재)와 디코더로 이루어집니다. 원래는 xformers 또는
flash-attn(희소 attention), spconv(희소 합성곱), kaolin · nvdiffrast · diff-gaussian-rasterization(메시 · 가우시안 · 텍스처)이 필요합니다.
여기서는 **메시 디코더만** 쓰고(정점 색 메시), 나머지를 `shims/trellis` 의 순수 PyTorch 로 대신합니다.

| 원래 | 대체 | 방법 |
| --- | --- | --- |
| xformers `memory_efficient_attention` + `BlockDiagonalMask` | `shims/trellis/xformers` | 패킹된 여러 시퀀스를 패딩 배치로 풀어 `scaled_dot_product_attention`(키 패딩 마스크), 다시 패킹 |
| spconv `SubMConv3d` | `shims/trellis/spconv` | 정렬한 선형 키 + `searchsorted` 로 k³ 이웃 표를 만들고 오프셋마다 gather + 행렬곱. 가중치 배치는 spconv 2 의 (out, k, k, k, in) 그대로. `indice_key` 로 이웃 표 재사용 |
| kaolin `check_tensor` | `shims/trellis/kaolin` | 같은 의미의 모양 · 형 검사 |
| open3d · utils3d · plyfile | 각 대체 모듈 | import 만 됨(텍스트 파이프라인 · 가우시안 PLY 용), 쓰면 오류 |

환경 변수로 백엔드를 고정합니다: `SPARSE_BACKEND=spconv`, `SPARSE_ATTN_BACKEND=xformers`(대체 모듈), `ATTN_BACKEND=sdpa`, `XFORMERS_DISABLED=1`(DINOv2).
그 밖의 패치: `SparseFeatures2Mesh` 가 격자를 `"cuda"` 에 만드는 것을 CPU 에 만들고 특징이 있는 장치로 옮기게, DINOv2 를
`torch.hub.load("facebookresearch/dinov2:main", …)` 로(가지 이름이 없으면 매번 GitHub 에 기본 가지를 묻습니다),
`convert_to_fp16/32` 가 가중치만 바꾸고 `dtype` 은 그대로 두는 것을 맞춤(GPU fp16, CPU fp32).
`pipeline.json` 의 가우시안 · 래디언스 필드 디코더는 받지도 불러오지도 않습니다(약 0.5 GB 절약).
결과는 Z 위 좌표라 TRELLIS 자체 GLB 내보내기와 같이 (x, y, z) → (x, z, −y) 로 Y 위로 돌리고(`faces_front`), 1 단위 크기로 맞춥니다.
대체 모듈의 정확성은 `engine/tests/test_shims.py`(dense conv3d · softmax attention 과 비교), 전체 흐름은 `test_trellis_tiny.py`
(설치된 TRELLIS 코드 + 작은 무작위 가중치, CPU)로 확인합니다.

### 변환 (`pipeline.py`)

- 한 번에 한 모델만 메모리에. 모델을 바꾸면 내리고(`empty_cache`) 새로 불러옵니다.
- 장치: CUDA → MPS → CPU. GPU 에서 실패(메모리 · 드라이버 오류)하면 CPU 로 옮겨 **같은 작업을 다시** 합니다(`job.fallback`).
- 단계 보고: 모델의 함수(`get_scene_codes`, `triplane_to_meshes`, `unwrap_uv`, `rasterize` …)를 감싸 단계를 바꾸고, 트랜스포머 블록의
  forward pre-hook 으로 모델 단계 안의 진행률과 **취소 지점**을 만듭니다.
- 결과는 SF3D · SPAR3D · TripoSR 모두 −Z 를 바라보므로 Y 축 180° 돌려 glTF 관례(+Z 정면)로 맞춥니다. 이미 +Z 를 보는 모델(Hunyuan3D,
  TRELLIS)은 `faces_front = True`. GLB 로 보냅니다.

### HTTP API (`server.py`)

`GET /api/health · /api/logs?after= · /api/models · /api/jobs · /api/jobs/<id> · /api/jobs/<id>/result.glb | input.png | result-obj.zip`,
`POST /api/config {hfToken, device, model} · /api/models/<id>/install · /api/install/retry · /api/reinstall · /api/jobs?<옵션> (본문=이미지) · /api/jobs/<id>/cancel`.
모든 출처 허용(CORS, Private Network Access). 기본 127.0.0.1.

## 3D 화면 (`lib/viewer3d.js`)

- **무한 격자**: 2×2 평면을 카메라 xz 로 옮기고 `uDistance` 배 확대한 셰이더. 큰 칸과 `uDivisions`(기본 5) 로 나눈 작은 칸을 `fwidth` 로
  선을 그리고 거리에 따라 흐리게. 큰 칸 크기는 자동(모델 크기의 0.8 배를 1·2·5×10ⁿ 로 올림) 또는 설정.
- **좌표축 · 눈금자**: 선 · 원뿔 · 점선 + CSS2DRenderer 글자. 눈금자는 작은 칸마다 눈금, 큰 칸마다 길이, 높이 눈금자는 모델 뒤 모서리.
  뷰는 `isolation: isolate` 로 글자 층의 z-index 가 시작 화면 위로 새지 않게 합니다.
- **광원**: 설정의 광원 목록 → three.js 광원 + 손잡이(공, 고리, 조준 점선). 공을 누르면 선택하고 그 자리에서 TransformControls 를
  `XYZ` 축으로 바로 끌기 시작합니다. 위치는 **모델 크기 단위**(`sceneScale`)로 저장해 어떤 크기의 모델에서도 같은 자리.
  끄는 동안 `onLightMove` 로 설정에 기록.
- 재질 모드는 메시마다 원래 재질을 기억하고 바꿔 끼우며, 저장(`exportRoot`)은 원래 재질과 회전 · 배율로 합니다.

## 3D 형식 (`lib/formats.js`)

three.js 로더/익스포터를 형식별로 지연 로드합니다. OBJ 의 `mtllib`, MTL 의 `map_*`, .gltf 의 `uri`, DAE 의 `init_from` 을 읽어
함께 쓰는 파일을 찾고(데스크톱은 같은 폴더, 웹은 함께 선택한 파일), LoadingManager URL 변환으로 blob URL 을 넘깁니다.

## 3D 프린트용 저장 (`lib/print3d.js`, `Print3DDialog.jsx`)

화면에 보이는 모델(`exportRoot`, 회전 · 배율 포함)을 `collectMeshes(root, { sampleTexture })` 로 월드 좌표 메시 목록으로 모으고
(텍스처가 있으면 정점 UV 의 텍셀을 캔버스로 읽어 정점 색으로), `preparePrint` 가 다음 순서로 처리합니다.

1. **합치기 · 용접** — 모든 메시를 하나로, 대각선의 10⁻⁶ 이내 정점은 하나로(UV 이음매에서 갈라진 정점이 닫힘). 색은 평균.
   한쪽 꼭짓점이 겹친 삼각형 · 같은 삼각형 반복은 지웁니다.
2. **검사** — 모서리마다 쓰인 횟수: 1 = 열린 모서리, 3 이상 = non-manifold, 같은 방향 두 번 = 감는 방향 불일치.
3. **구멍 메우기**(선택) — 열린 모서리를 이어 고리를 찾고, 고리 중심에 정점을 더해 부채꼴로 막습니다(이웃 삼각형과 반대 방향으로 감음).
4. **방향 통일** — 두 삼각형이 공유하는 모서리를 따라 너비 우선으로 이웃을 맞추고, 부호 있는 부피가 음수면 전체를 뒤집습니다.
5. **놓기** — Y 위 → Z 위 `(x, y, z) → (x, −z, y)`(앞면 +Z → 프린터 앞 −Y), 높이 또는 가장 긴 변을 지정 mm 로, X/Y 가운데 · 바닥 Z = 0.

보고: 크기(mm) · 삼각형 · 수밀 여부 · 열린/non-manifold 모서리 · 부피 · 꽉 찬 PLA 무게(1.24 g/cm³) · 고친 것.
쓰기: 3MF 는 기존 `write3MF`(단위 millimeter, 정점 색은 `m:colorgroup`), STL 은 `writeBinarySTL`(삼각형마다 법선).
대화 상자는 크기 · 기준 · 구멍 메우기가 바뀔 때 다시 계산하고(120 ms 지연), 설정은 `settings.print3d` 에 저장합니다.
`test/print3d.test.js` 가 이음매 있는 정육면체 · 구멍 · 뒤집힌 면 · 안팎 뒤집힘 · 축 변환 · 크기 · 3MF/STL 내용을 확인합니다.

## 데스크톱 호스트 (`src-tauri`)

V20 의 호스트에서 전자책 기능(PDF, 폴더 트리)을 빼고 엔진 실행기를 더했습니다. 창은 **테두리 없는 창**(`decorations(false)` + 그림자)이고
툴바가 제목 표시줄입니다: Windows 는 `app-region: drag`(WebView2 비클라이언트 영역), 다른 OS 는 `win_start_dragging`.
최소화 · 최대화 · 닫기는 `WindowControls.jsx` → `win_*` 명령, 최대화 상태는 Resized 때 `maximized` 이벤트로 알리고, 최소 크기는
보이지 않는 테두리(`frame_extra`)를 더해 겁니다. 오른쪽 아래 `ResizeGrip` 은 최대화 중 숨깁니다.
설정 · 정보 · 컨텍스트 메뉴는 V20 처럼 팝아웃 창(`popout.rs`), 사용 설명서는 별도 창.
인쇄(`print.rs`, V20 에서 가져옴)는 화면이 합성한 A4 PNG 장들을 받아 Windows 는 GDI, macOS · Linux 는 CUPS `lp` 로 보냅니다.
NSIS 제거 시 엔진(수 GB)과 설정을 지울지 따로 묻습니다(`windows/hooks.nsh`).

## 인쇄 (`lib/print.js`, `PrintDialog.jsx`)

배치(`view` · `views4` · `views6` · `sheets`)마다 방향 목록이 있고, `viewer3d.capture({direction, width, height, white, helpers})` 로
방향별 그림을 오프스크린으로 찍어 `composeSheets` 가 A4(150 dpi) 장에 머리말과 함께 붙입니다. 미리 보기도 같은 장을 씁니다.
데스크톱은 `framePages`(개수 + 길이 + PNG 바이트)로 호스트에 넘기고, 웹은 `print-html.js` 로 숨은 iframe 에서 브라우저 인쇄.

## 시작 화면 · 튜토리얼 · 예제

- 시작 화면 카드(`lib/startlayout.js`: hero · how · recent · engine · formats · bg)는 끌기 · 크기 바꾸기 결과를 `startLayout` 에 저장하고
  보드 폭이 바뀌면 안으로 당깁니다. 배경은 V20 의 `lib/startbg.js`(21종 캔버스 애니메이션).
- 튜토리얼(`Tutorial.jsx`, `lib/tutorialSteps.js`)은 단계마다 대상 선택자 · 설명 · 동작(`image:` · `model:` · `tab:` · `menu:` · `print` …)을 갖고,
  동작은 App 의 `tourApi` 가 실제 화면에서 실행합니다. 진행 위치 `tutorialIndex`, 시작 때 묻기 `tutorialAsk`.
- 예제는 `samples/`(git 에 포함)를 `scripts/sync-samples.mjs` 가 `public/samples` 로 복사하고 `lib/samples.js` 가 `index.json` 을 읽습니다.
  그림 44장 중 39장은 TRELLIS.2 · TripoSR 저장소의 공개 예제(MIT, 원본 1024 px 이상)로 `make-samples.mjs` 의 `PHOTOS` 목록이 등록합니다
  (`npm run samples:index` 는 브라우저 없이 목록만 갱신).

## 설정

`lib/settings.js` 하나의 객체(모양 · 레이아웃 · 변환 · 장면 `view` · 광원 `lights` · 3D 프린트 `print3d` · 최근 파일)를 localStorage 와
`%APPDATA%\My3DObjects\settings.json` 에 저장. 알 수 없는 키는 버리고 값은 범위로 자릅니다. 엔진 쪽 설정(장치 · 모델 · 토큰)은
`<엔진>/engine-prefs.json`, `hf-token`.
