# TTS Web V10

**오프라인** 웹 TTS입니다. 브라우저에서 텍스트를 입력하거나 파일을 올리면, 서버가 **Sherpa-ONNX**로 음성을 만들고 **WAV**로 돌려줍니다. 파형·재생·**WAV·MP3 저장**을 지원합니다(MP3는 서버에서 `lamejs`로 WAV를 변환). Microsoft Edge TTS 등 **외부 음성 API는 사용하지 않습니다.**

## 필요 사항

- **Node.js** 18 이상 (권장: 20+)
- **CPU** (기본 ONNX EP는 `cpu`)
- **모델 파일** — `npm run download-model` 또는 `models/README.md` 수동 절차. 없으면 서버는 뜨지만 `/api/tts`는 503입니다.

## 설치 및 실행

```bash
cd TTSWebV10
npm install
npm run download-model
npm start
```

`download-model`은 GitHub에서 ONNX 패키지를 받아 `models/vits-mimic3-ko_KO-kss_low/`에 풉니다(이 단계만 네트워크 필요). 이미 받았다면 이 명령은 건너뜁니다.

브라우저: [http://localhost:3847](http://localhost:3847)

포트 변경:

```powershell
$env:PORT = "8080"; npm start
```

## 동작 요약

| 구분 | 내용 |
|------|------|
| 엔진 | `sherpa-onnx-node` (로컬 ONNX 추론) |
| 네트워크 | 런타임에 외부 음성 서비스 호출 **없음** |
| 출력 | 합성: `audio/wav` (`POST /api/tts`). 저장: WAV 그대로, MP3는 `POST /api/wav-to-mp3` |
| 음성 목록 | 모델의 화자 수(`sid`)에 따라 로컬에서만 생성 |
| GUI | **재생** 시 문장·음성 옵션이 바뀌었을 때만 합성 후 재생. 텍스트는 재생 중 **읽은 구간(현재 글자까지) 흰 바탕·검은 글자** 오버레이·자동 스크롤(문자 비율 근사). **저장**은 형식(WAV/MP3) 선택 후 한 번에 다운로드. |
| 파라미터 | 속도(`ratePercent` → Sherpa `speed`), 피치(`pitchHz` → 합성 후 리샘플), 크기(`volumePercent` → 게인), 화자 `sid` |

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/health` | 모델 로드 가능 여부 JSON |
| `GET` | `/api/voices` | `{ ok, voices[] }` 또는 503 |
| `POST` | `/api/tts` | JSON → WAV 바이너리 |
| `POST` | `/api/tts-from-file` | multipart `file` → WAV |
| `POST` | `/api/wav-to-mp3` | 요청 본문 = WAV 바이너리 → `audio/mpeg` |

`POST /api/tts` 본문 예:

```json
{
  "text": "안녕하세요",
  "voice": "0",
  "ratePercent": 0,
  "pitchHz": 0,
  "volumePercent": 0
}
```

`voice`는 화자 인덱스 문자열(기본 한 화자 모델이면 `"0"`).

## 라이선스

- 앱 `package.json`의 **license** 필드(기본 **ISC**).
- **`sherpa-onnx-node`**: **Apache-2.0** (및 플랫폼별 optional 바이너리 패키지).
- **VITS 모델**: 배포본의 라이선스·출처를 모델과 함께 확인하세요.
- **`lamejs`** (MP3 인코딩): **LGPL-3.0** ([npm/lamejs](https://www.npmjs.com/package/lamejs)). Node에서는 패키지의 `lame.all.js` 번들을 `vm`으로 로드해 사용합니다(`require('lamejs')` 모듈 그래프는 Node에서 깨지는 경우가 있습니다).

## 디렉터리

```
TTSWebV10/
  server.js          # Express
  sherpa-tts.mjs     # Sherpa 초기화·합성
  wav-to-mp3.mjs     # WAV PCM → MP3 (lamejs)
  public/            # 정적 UI
  models/README.md   # 모델 배치 방법
  test/              # 샘플 입력·fixture
```
