# data

MyTrainer 에서 가져오거나 학습된 모델로 실행해 볼 수 있는 파일입니다 (`npm run data` 로 다시 만듭니다).
Files to import into MyTrainer or to run trained models on (rebuilt with `npm run data`).

| 폴더 / Folder | 내용 / Contents | 쓰는 곳 / Use |
|---|---|---|
| `csv/` | student-pass.csv (분류 / classification), house-prices.csv (회귀 / regression) | 데이터 › CSV 가져오기 / Data › Import CSV |
| `images/objects/` | 집·나무·자동차·해·배·물고기 컬러 그림 / colour pictures | 데이터 › 그림 폴더 가져오기 / Import picture folder |
| `images/digits/`, `images/letters/`, `images/hangul/` | 숫자·영문자·한글 자음 손글씨풍 그림 / hand-drawn-style characters | 그림 폴더 가져오기 / Import picture folder |
| `audio/speech/` | yes·no·up·down·left·right 음성(WAV) / spoken keywords | 데이터 › 음성 폴더 가져오기 / Import sound folder |
| `audio/kws-ko/` | 한국어 키워드 출근·퇴근·경비·해제·unknown, 기본 화자 10명(M1–M5, F1–F5)의 WAV (`npm run data:kws`) / Korean keywords, the 10 built-in Supertonic voices | 음성 폴더 가져오기 / Import sound folder |
| `audio/kws-ko-attend/` | 한국어 키워드 출근·퇴근·외출·복귀·unknown, 기본 화자 10명의 WAV (`npm run data:kws-attend`) / Korean attendance keywords, the 10 built-in voices | 음성 폴더 가져오기 / Import sound folder |
| `predict/` | 새 입력: 흰 바탕 그림, WAV, 정답 없는 CSV, 문장, `kws-ko/`·`kws-ko-attend/` 키워드·비슷한 말 몇 개 / new inputs, `kws-ko/`·`kws-ko-attend/` a few keyword and look-alike clips | 테스트 › 입력 데이터 선택해서 실행 / Test › Run on data you choose |

하위 폴더 이름이 클래스(정답)입니다. / Sub-folder names are the classes.
