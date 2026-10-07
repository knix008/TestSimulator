#!/usr/bin/env bash
# scripts/make_sample_wav.sh
#
# 종단 시험용 한국어 음원(tests/data/sample-ko.wav, 16kHz 모노 16비트)을 만든다.
# OS 에 있는 음성 합성기를 쓴다.
#   Windows : SAPI (PowerShell, 한국어 음성 Heami 등)
#   macOS   : say + afconvert (한국어 음성 Yuna 등)
#   Linux   : espeak-ng (있을 때만)
#
# 저장소에 이미 sample-ko.wav 가 들어 있으므로 보통 실행할 필요는 없다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/tests/data/sample-ko.wav"
TEXT="${1:-안녕하세요. 오늘 날씨가 참 좋습니다. 음성 인식 시험입니다.}"
mkdir -p "$(dirname "$OUT")"

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m경고: %s\033[0m\n' "$*" >&2; }

case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
        say "Windows SAPI 로 음원을 만듭니다"
        powershell -NoProfile -Command "
            Add-Type -AssemblyName System.Speech
            \$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
            \$ko = \$s.GetInstalledVoices() | Where-Object { \$_.VoiceInfo.Culture.Name -eq 'ko-KR' } | Select-Object -First 1
            if (-not \$ko) { Write-Error '한국어 TTS 음성이 설치되어 있지 않습니다'; exit 1 }
            \$s.SelectVoice(\$ko.VoiceInfo.Name)
            \$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
            \$s.SetOutputToWaveFile('$(cygpath -w "$OUT")', \$fmt)
            \$s.Rate = -1
            \$s.Speak('$TEXT')
            \$s.SetOutputToNull(); \$s.Dispose()
        "
        ;;
    Darwin)
        say "macOS say 로 음원을 만듭니다"
        VOICE="$(say -v '?' | awk '$2 ~ /ko_KR/ {print $1; exit}')"
        if [ -z "$VOICE" ]; then
            warn "한국어 음성이 없습니다. 시스템 설정 > 손쉬운 사용 > 음성에서 한국어 음성을 추가하세요."
            exit 1
        fi
        say "음성: $VOICE"
        TMP="$(mktemp -t kstt).aiff"
        /usr/bin/say -v "$VOICE" -o "$TMP" "$TEXT"
        afconvert -f WAVE -d LEI16@16000 -c 1 "$TMP" "$OUT"
        rm -f "$TMP"
        ;;
    *)
        if command -v espeak-ng >/dev/null 2>&1; then
            say "espeak-ng 로 음원을 만듭니다 (합성 품질이 낮아 인식률은 참고용입니다)"
            espeak-ng -v ko -s 140 -w "$OUT" "$TEXT"
            # espeak-ng 는 22050Hz 로 쓸 수 있으나 코어가 16kHz 로 변환해 준다.
        else
            warn "espeak-ng 가 없어 음원을 만들 수 없습니다 (sudo apt install espeak-ng)."
            exit 1
        fi
        ;;
esac

say "만들었습니다: $OUT"
