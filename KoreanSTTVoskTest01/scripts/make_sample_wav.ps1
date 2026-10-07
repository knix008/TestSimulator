<#
scripts/make_sample_wav.ps1

종단 시험용 한국어 음원(tests\data\sample-ko.wav, 16kHz 모노 16비트)을 Windows
SAPI 로 만든다. 저장소에 이미 들어 있으므로 보통 실행할 필요는 없다.

사용법:
  .\scripts\make_sample_wav.ps1
  .\scripts\make_sample_wav.ps1 -Text "원하는 문장"
#>
[CmdletBinding()]
param(
    [string]$Text = '안녕하세요. 오늘 날씨가 참 좋습니다. 음성 인식 시험입니다.',
    [string]$OutFile
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutFile) { $OutFile = Join-Path $root 'tests\data\sample-ko.wav' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null

Add-Type -AssemblyName System.Speech

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $korean = $synth.GetInstalledVoices() |
        Where-Object { $_.VoiceInfo.Culture.Name -eq 'ko-KR' } |
        Select-Object -First 1
    if (-not $korean) {
        throw "한국어 TTS 음성이 없습니다. 설정 > 시간 및 언어 > 음성에서 한국어 음성을 추가하세요."
    }

    $synth.SelectVoice($korean.VoiceInfo.Name)
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
        16000,
        [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
        [System.Speech.AudioFormat.AudioChannel]::Mono)
    $synth.SetOutputToWaveFile($OutFile, $format)
    $synth.Rate = -1
    $synth.Speak($Text)
    $synth.SetOutputToNull()
    Write-Host "==> 만들었습니다: $OutFile ($($korean.VoiceInfo.Name))" -ForegroundColor Cyan
} finally {
    $synth.Dispose()
}
