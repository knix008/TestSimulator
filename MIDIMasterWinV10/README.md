# MIDI Master Win V10

Windows용 MIDI 파일 플레이어. C# / WinForms (.NET 8) 기반.

MIDI 재생, 오선보 악보 표시, General MIDI 악기 선택, SoundFont 합성 기반 WAV/MP3 보내기를 지원합니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| MIDI 재생 | Windows MIDI 출력 장치로 재생 (재생 / 일시정지 / 정지 / 위치 이동) |
| 악보 표시 | [MidiSheetMusic](https://github.com/madavid/MidiSheetMusic) v2.6 엔진 기반 오선보 (음표·쉼표·마디·빔·조표) |
| 재생 위치 표시 | 빨간 세로선 플레이헤드, 재생 중 악보 자동 스크롤 |
| 악기 선택 | General MIDI 128종 악기 — 재생·보내기에 동일 적용 (드럼 채널 제외) |
| WAV 보내기 | MeltySynth + TimGM6mb SoundFont로 실제 악기 음색 합성 |
| MP3 보내기 | 동일 합성 결과를 LAME으로 MP3 인코딩 |
| 악보 줄 너비 | 창(악보 패널) 너비에 맞춰 한 줄 길이 자동 조정 |

## 개발 환경

- .NET 8 (`net8.0-windows`)
- Windows 10 이상
- WinForms
- Visual Studio 2022 / 2026 (솔루션: `MIDIMasterWinV10.slnx`)

### 빌드 전 준비

`SheetMusicLib`는 로컬에 있는 **MidiSheetMusic v2.6** 소스를 링크합니다. 아래 경로에 원본이 있어야 합니다.

```
../MidiSheetMusic(v2.6)/MidiSheetMusic/MidiSheetMusic-2.6-win-src(Revised)/
```

`SoundFonts/TimGM6mb.sf2`는 저장소에 포함되어 있으며, 빌드 시 출력 폴더로 복사됩니다.

## NuGet 패키지

| 패키지 | 용도 |
|--------|------|
| [NAudio](https://github.com/naudio/NAudio) 2.2.1 | MIDI 파일 파싱·재생 |
| [NAudio.Lame](https://github.com/Corey-M/NAudio.Lame) 2.1.0 | MP3 인코딩 |
| [MeltySynth](https://github.com/sinshu/meltysynth) 2.4.1 | SoundFont MIDI 합성 (WAV/MP3 보내기) |

서드파티 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참고하세요.

## 프로젝트 구조

```
MIDIMasterWinV10/                      # 솔루션 루트
├── MIDIMasterWinV10/                  # 메인 WinForms 앱
│   ├── Constants/
│   │   └── GeneralMidi.cs             # GM 128종 악기명
│   ├── Core/
│   │   ├── AudioExporter.cs           # WAV / MP3 보내기
│   │   ├── MidiParser.cs              # MIDI 파싱 (MidiFileInfo)
│   │   ├── MidiPlayer.cs              # Windows MIDI 재생
│   │   ├── SoundFontPaths.cs          # SoundFont 경로
│   │   ├── SoundFontRenderer.cs       # MeltySynth 오프라인 렌더
│   │   └── SheetMusicRenderer.cs      # (레거시, 미사용)
│   ├── Models/
│   │   ├── MidiTrackInfo.cs
│   │   └── NoteEvent.cs
│   ├── SoundFonts/
│   │   └── TimGM6mb.sf2               # GM SoundFont (~6 MB)
│   ├── ErrorDialog.cs
│   ├── MidiForm.cs / MidiForm.Designer.cs
│   └── Program.cs
├── SheetMusicLib/                     # MidiSheetMusic 래퍼 (GPL-2.0)
│   ├── SheetMusic.Playhead.partial.cs
│   ├── SheetMusic.Layout.partial.cs
│   └── Staff.Playhead.partial.cs
├── MIDIMasterWinV10Setup/            # WiX v7 MSI 설치 프로젝트
├── ParseTest/                         # 로컬 파싱 테스트 (솔루션 미포함)
├── THIRD_PARTY_NOTICES.md
└── MIDIMasterWinV10.slnx
```

## 빌드 및 실행

```bash
cd MIDIMasterWinV10
dotnet build MIDIMasterWinV10.slnx
dotnet run --project MIDIMasterWinV10/MIDIMasterWinV10.csproj
```

## MSI 설치 파일

Visual Studio에서 **Release**로 솔루션을 빌드하면 WiX MSI가 생성됩니다.

- 출력: `MIDIMasterWinV10Setup/bin/Release/MIDIMasterWinV10Setup.msi`
- 바탕화면·시작 메뉴 바로가기 선택 가능
- WiX Toolset 7.0.0

## 사용 방법

1. **파일 > 열기** (Ctrl+O)로 `.mid` / `.midi` 파일을 엽니다.
2. 악보 패널에 오선보가 표시됩니다. 창 너비에 맞춰 여러 줄로 배치됩니다.
3. **악기** 콤보박스에서 GM 악기를 선택합니다.
4. **▶ 재생**으로 연주합니다. **⏸ 일시정지** 후 다시 재생하면 이어서 재생됩니다.
5. 재생 중 빨간 플레이헤드가 현재 위치를 표시하고, 필요 시 악보가 스크롤됩니다.
6. **파일 > WAV로 보내기** 또는 **MP3로 보내기**로 오디오 파일을 저장합니다.

## 재생 vs 보내기 음질

| 구분 | 방식 |
|------|------|
| **스피커 재생** | Windows MIDI 출력 장치 (시스템/드라이버에 따라 음색 차이) |
| **WAV / MP3** | MeltySynth + TimGM6mb SoundFont 합성, UI에서 선택한 악기가 멜로디 채널에 적용 |

보내기 시 드럼(MIDI 채널 10)은 GM 드럼 키트로 렌더링됩니다.

## 참고 사항

- NAudio MIDI 채널 번호는 **1-based**(1~16)이며, 채널 **10**이 드럼입니다. MeltySynth 내부는 0-based이며 채널 **9**가 드럼입니다.
- `SoundFonts/TimGM6mb.sf2`가 없으면 WAV/MP3 보내기가 실패합니다. 빌드 출력의 `SoundFonts` 폴더를 확인하세요.
- 악보 엔진(MidiSheetMusic) 포함 배포 시 GPL v2 의무가 적용될 수 있습니다. 자세한 내용은 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참고하세요.
