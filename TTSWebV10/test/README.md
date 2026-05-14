# 테스트 데이터

웹 UI의 **파일 업로드**나 `POST /api/tts` 호출에 쓸 수 있는 샘플입니다. 오프라인 엔진은 **WAV**만 반환합니다.

## `inputs/` (텍스트 파일)

| 파일 | 용도 |
|------|------|
| `korean_short.txt` | 짧은 한국어 한 줄 |
| `korean_paragraph.txt` | 여러 문단·줄바꿈 |
| `english_short.txt` | 짧은 영어 |
| `symbols_and_quotes.txt` | `&`, `<`, 따옴표 등 이스케이프 확인용 |

## `fixtures/` (JSON 본문)

| 파일 | 용도 |
|------|------|
| `tts-request-ko.json` | 한국어 + `voice: "0"` |
| `tts-request-en.json` | 영어 + 속도·크기 비영값 |

서버가 떠 있고 **모델이 설치된 상태**에서 예시(curl, Windows):

```bat
mkdir test\output 2>nul
curl -X POST http://localhost:3847/api/tts -H "Content-Type: application/json" --data-binary "@test\fixtures\tts-request-ko.json" -o test\output\sample.wav
```

모델이 없으면 503과 JSON 오류가 반환됩니다. 모델 설치는 상위 `models/README.md`를 참고하세요.
