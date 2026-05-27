# MIDI Master GTK

GTK3 기반 MIDI 파일 플레이어 및 오디오 내보내기 도구.  
Linux / macOS 크로스 플랫폼으로 동작하며, Windows 버전(MIDIMasterWinV10)과 동일한 기능을 제공합니다.

## 기능

| 기능 | 설명 |
|------|------|
| MIDI 재생 | FluidSynth + TimGM6mb SoundFont를 이용한 소프트웨어 합성 |
| 피아노 롤 | Cairo로 그린 노트 시각화, 빨간 재생 헤드 |
| 악기 선택 | General MIDI 128가지 악기 |
| 위치 탐색 | 슬라이더 드래그로 임의 위치로 이동 |
| WAV 내보내기 | 44.1 kHz / 16-bit 스테레오 PCM |
| MP3 내보내기 | 192 kbps LAME 인코딩 |
| 템포 지원 | MIDI 파일 내 템포 맵 완전 반영 |

## 의존성

| 라이브러리 | 역할 |
|-----------|------|
| GTK+ 3 | UI 프레임워크 |
| FluidSynth 2.x | MIDI 재생 + SoundFont 합성 |
| libsndfile | WAV 파일 출력 |
| LAME | MP3 인코딩 |

## 빌드 방법

### 1. 의존성 설치

**Linux (Ubuntu/Debian)**
```bash
make deps
```
또는 직접 설치:
```bash
sudo apt-get install libgtk-3-dev libfluidsynth-dev libsndfile1-dev libmp3lame-dev pkg-config
```

**macOS (Homebrew)**
```bash
make deps
```
또는 직접 설치:
```bash
brew install gtk+3 fluid-synth libsndfile lame pkg-config
```

### 2. SoundFont 준비

`SoundFonts/` 디렉터리에 `TimGM6mb.sf2` 파일을 복사하세요.  
MIDIMasterWinV10 빌드 환경이 있으면 Makefile이 자동으로 복사합니다:
```bash
make soundfont
```

### 3. 빌드 및 실행

```bash
make
./midimaster
```

## 소스 구조

```
src/
├── midi_parser.c/h      # MIDI 파일 파싱 (GTK 비의존)
├── midi_player.c/h      # FluidSynth 재생 엔진 (GTK 비의존)
├── audio_exporter.c/h   # WAV / MP3 오프라인 렌더링 (GTK 비의존)
├── piano_roll.c/h       # GTK3 Cairo 피아노 롤 위젯
├── main_window.c/h      # GTK3 메인 윈도우
├── general_midi.h       # GM 128가지 악기 이름
└── main.c               # 진입점
SoundFonts/
└── TimGM6mb.sf2         # General MIDI SoundFont (GPL-2)
Makefile
```

### 아키텍처 원칙

- **코어 모듈** (`midi_parser`, `midi_player`, `audio_exporter`): GTK/GLib 비의존 순수 C.  
  다른 UI 프레임워크에서도 재사용 가능.
- **UI 모듈** (`piano_roll`, `main_window`): GTK3 전용.  
  `main_window.c`가 50ms 타이머로 `midi_player_tick()`을 호출해 재생 상태를 UI에 반영.  
  내보내기 콜백은 `g_idle_add()`로 GTK 메인 스레드에 마샬링.

## 라이선스

- 애플리케이션 코드: MIT
- TimGM6mb.sf2: GPL-2
