# MIDI Master Win V10

Windows용 MIDI 파일 플레이어. C# / WinForms (.NET 8) 기반.

## 주요 기능

| 기능 | 설명 |
|------|------|
| MIDI 재생 | Windows MIDI 출력 장치를 통한 MIDI 파일 재생 (재생 / 일시정지 / 정지 / 위치 이동) |
| 악보 표시 | 높은음자리표 + 낮은음자리표 오선보에 음표 헤드 + 기둥으로 전체 음표 표시 |
| 악기 선택 | General MIDI 128종 악기 중 선택 가능 |
| WAV 내보내기 | MIDI 노트를 사인파 합성으로 WAV 파일 저장 |
| MP3 내보내기 | WAV를 LAME 인코더로 MP3 변환 저장 |
| 오류 대화상자 | 오류 내용을 선택·복사할 수 있는 ErrorDialog |

## 개발 환경

- .NET 8 (`net8.0-windows`)
- WinForms
- Visual Studio 2026 (VS 디자이너 호환)

## NuGet 패키지

- [NAudio](https://github.com/naudio/NAudio) 2.2.1 — MIDI 파일 파싱, 재생
- [NAudio.Lame](https://github.com/Corey-M/NAudio.Lame) 2.1.0 — MP3 인코딩

## 프로젝트 구조

```
MIDIMasterWinV10/                   # 솔루션 루트
├── MIDIMasterWinV10/               # 메인 앱 프로젝트
│   ├── Constants/
│   │   └── GeneralMidi.cs          # GM 128종 악기명 정의
│   ├── Core/
│   │   ├── AudioExporter.cs        # WAV / MP3 내보내기
│   │   ├── MidiParser.cs           # MIDI 파일 파싱 + MidiFileInfo 모델
│   │   ├── MidiPlayer.cs           # MIDI 재생 엔진 (일시정지/재개 포함)
│   │   └── SheetMusicRenderer.cs   # GDI+ 악보 렌더러 (음표 헤드 + 기둥)
│   ├── Models/
│   │   ├── MidiTrackInfo.cs
│   │   └── NoteEvent.cs
│   ├── ErrorDialog.cs              # 오류 내용 복사 가능한 대화상자
│   ├── MidiForm.cs                 # 메인 폼 로직
│   ├── MidiForm.Designer.cs        # VS 디자이너 파일
│   └── Program.cs
├── MIDIMasterWinV10Setup/          # WiX v7 MSI 설치 프로젝트
│   ├── Package.wxs
│   ├── License.rtf
│   └── MIDIMasterWinV10Setup.wixproj
└── MIDIMasterWinV10.slnx           # 솔루션 파일
```

## 빌드

```bash
dotnet build
dotnet run --project MIDIMasterWinV10
```

## MSI 설치 파일 생성

Visual Studio 2026에서 **Release** 모드로 솔루션 빌드 시 MSI 파일이 자동 생성됩니다.

- 설치 시 **바탕화면** 및 **시작 메뉴** 바로가기를 선택적으로 생성 가능
- 바로가기 아이콘: `daemon_hammer.ico`
- WiX Toolset v7.0.0 사용

## 사용 방법

1. **파일 > 열기** (Ctrl+O) 로 `.mid` / `.midi` 파일을 엽니다.
2. 악보 패널에 전체 음표가 오선보 형태로 표시됩니다.
3. 악기 드롭다운에서 원하는 악기를 선택합니다.
4. **▶ 재생** 버튼으로 재생합니다. 재생 중 **⏸ 일시정지** 후 다시 **▶ 재생**하면 이어서 재생됩니다.
5. 악보 패널에서 **마우스 휠**로 시간축 확대/축소가 가능합니다.
6. **파일 > WAV / MP3로 내보내기** 로 오디오 파일을 저장합니다.

## 악보 표시 동작

- 파일을 열면 **전체 음표**가 한 화면에 들어오도록 기본 줌이 설정됩니다.
- 마우스 휠 위로 스크롤: 확대 (더 적은 구간 표시)
- 마우스 휠 아래로 스크롤: 축소 (더 많은 구간 표시)
- 재생 중에는 재생 헤드가 화면의 좌측 25% 위치에 유지되도록 자동 스크롤됩니다.

## 참고 사항

- WAV/MP3 내보내기는 사인파 기반 단순 합성입니다. 실제 악기 음색을 원하면 SoundFont 기반 합성기(예: FluidSynth) 연동이 필요합니다.
- MIDI 채널 10번(드럼 채널)은 악보 표시 및 내보내기 시 제외됩니다.
- NAudio 채널 번호는 1-based(1~16)이며, 채널 10이 드럼입니다.
