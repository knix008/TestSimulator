# Sherpa-ONNX VITS 모델 (로컬 전용)

합성은 **인터넷 없이** 이 폴더의 파일만 사용합니다. 아래 아카이브를 내려받아 압축을 풀면, 그 안의 **`vits-mimic3-ko_KO-kss_low`** 폴더 전체를 이 디렉터리 아래에 두면 됩니다.

## 자동 설치(권장)

프로젝트 루트에서:

```bash
npm run download-model
```

이미 모델이 있으면 건너뜁니다. 다시 받으려면:

```bash
npm run download-model -- --force
```

> 이 단계만 **인터넷**이 필요합니다(GitHub 릴리스). 합성 실행(`npm start`) 자체는 오프라인입니다.  
> Windows 10 이상에는 `tar`가 포함되어 있어야 합니다.

최종 경로 예:

```text
TTSWebV10/models/vits-mimic3-ko_KO-kss_low/ko_KO-kss_low.onnx
TTSWebV10/models/vits-mimic3-ko_KO-kss_low/tokens.txt
TTSWebV10/models/vits-mimic3-ko_KO-kss_low/espeak-ng-data/...
```

다른 위치에 모델을 두었으면 환경 변수로 **모델 폴더 전체 경로**를 지정합니다.

```text
TTSWEBV10_MODEL_DIR=C:\경로\vits-mimic3-ko_KO-kss_low
```

## 수동 다운로드 (스크립트를 쓰지 않을 때)

Sherpa-ONNX 릴리스의 TTS 모델 패키지입니다.

- [vits-mimic3-ko_KO-kss_low.tar.bz2](https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-mimic3-ko_KO-kss_low.tar.bz2)

Windows PowerShell 예(프로젝트 루트에서 `models`로 풀기):

```powershell
New-Item -ItemType Directory -Force models | Out-Null
Invoke-WebRequest -Uri "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-mimic3-ko_KO-kss_low.tar.bz2" -OutFile "models\vits-mimic3-ko_KO-kss_low.tar.bz2"
tar -xf "models\vits-mimic3-ko_KO-kss_low.tar.bz2" -C models
```

압축을 푼 뒤 `models\vits-mimic3-ko_KO-kss_low\` 안에 위 세 가지가 있으면 됩니다.

## 선택 환경 변수

| 변수 | 설명 |
|------|------|
| `TTSWEBV10_MODEL_DIR` | `vits-mimic3-ko_KO-kss_low` 폴더의 절대 경로 |
| `TTSWEBV10_NUM_THREADS` | ONNX 스레드 수 (기본: CPU 코어 수, 최대 8) |
| `TTSWEBV10_DEBUG` | `1`이면 Sherpa 디버그 로그 |
