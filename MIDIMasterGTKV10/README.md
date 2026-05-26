# MIDI Master GTK V10

Linux / macOS용 MIDI 플레이어 (GTK 3). [MIDIMasterWinV10](../MIDIMasterWinV10)과 동일한 핵심 기능을 제공합니다.

- **악보**: [Verovio](https://www.verovio.org/) — MIDI → MusicXML → SVG 오선보
- **재생**: FluidSynth + TimGM6mb SoundFont
- **보내기**: WAV / MP3 (LAME, 선택)

## 빠른 시작

```bash
cd MIDIMasterGTKV10
make              # 의존성 검사·자동 설치 + Verovio 빌드 + 컴파일
./midimaster      # 또는 make run
```

`make setup`은 `make install-deps` 후 빌드합니다.

의존성만 확인·설치:

```bash
make check-deps       # 설치 여부 검사
make install-deps     # apt/dnf/pacman/brew + pip music21 + GdkPixbuf 캐시 갱신
```

자동 패키지 설치를 끄려면:

```bash
MIDIMaster_AUTO_INSTALL=0 make
```

## 요구 사항

| 항목 | 용도 |
|------|------|
| build-essential, g++, cmake, git | 빌드 도구 |
| GTK 3, GdkPixbuf, Cairo | UI·악보 SVG 표시 |
| FluidSynth | MIDI 재생·합성 |
| librsvg2-common | GdkPixbuf SVG 로더 (악보 SMuFL 글리프) |
| libsndfile | WAV 보내기 |
| libxml2, pango, curl, openssl | Verovio 빌드 |
| python3 + music21 | MIDI → MusicXML 변환 |
| libmp3lame-dev (선택) | MP3 보내기 |

SoundFont는 `../MIDIMasterWinV10/.../TimGM6mb.sf2`에서 `make` 시 `SoundFonts/`로 자동 복사됩니다.  
형제 프로젝트가 없으면 `SoundFonts/TimGM6mb.sf2`를 직접 넣으세요.

## 프로젝트 구조

```
MIDIMasterGTKV10/
├── Makefile
├── midimaster.desktop
├── README.md
├── include/                 # 공개 헤더
├── source/
│   ├── main.c
│   ├── main_window.c        # GTK UI, 파일 열기, 악보 로드 스레드
│   ├── score_verovio.c      # Verovio + MIDI→MusicXML
│   ├── score_view.c         # 악보 표시·플레이헤드
│   ├── midi_player.c        # FluidSynth 재생
│   ├── midi_file.c          # MIDI 메타데이터
│   ├── audio_export.c       # WAV/MP3 보내기
│   ├── general_midi.c
│   └── paths.c
├── scripts/
│   ├── build-verovio.sh     # Verovio 클론·빌드
│   ├── check-deps.sh
│   ├── install-deps.sh
│   ├── midi-to-musicxml.py
│   └── strip_musicxml_titles.py
├── samples/                 # 테스트용 MIDI (저장소에 포함)
├── tests/
│   └── test_audio_export.c
├── SoundFonts/              # TimGM6mb.sf2 (make 시 복사, git 제외)
└── third_party/
    ├── verovio/             # make 시 클론·빌드 (git 제외)
    └── nanosvg/
```

## 사용법

1. **파일 → 열기**로 `.mid` / `.midi` 선택
2. 악보 변환·레이아웃 중 **진행 대화상자**가 표시됩니다 (긴 곡은 수십 초 걸릴 수 있음)
3. Verovio 악보가 상단 패널에 표시됩니다
4. GM 악기 선택 후 **재생**
5. 재생 중 빨간 세로선(플레이헤드)과 자동 스크롤
6. **WAV/MP3로 보내기**로 오디오 저장

`samples/` 에 있는 MIDI로 바로 시험할 수 있습니다.

## make 타겟

| 명령 | 설명 |
|------|------|
| `make` / `make all` | 의존성 확인 후 빌드 (기본) |
| `make run` | `./midimaster` 실행 |
| `make test-export` | WAV/MP3 보내기 단위 테스트 |
| `make install-desktop` | `~/.local/share/applications`에 `.desktop` 등록 (Linux) |
| `make clean` | `build/`, `midimaster` 제거 |
| `make distclean` | `clean` + `third_party/verovio` 제거 |
| `make info` | Verovio 경로·MP3 지원 여부 출력 |

## 문제 해결

### MIDI 열기 / 악보 로드가 느리거나 멈춘 것처럼 보일 때

- 첫 로드 시 **MIDI→MusicXML**(music21)과 **Verovio 레이아웃·SVG 래스터화**가 순서대로 실행됩니다.
- 진행 표시가 갱신되면 정상 동작 중입니다. 페이지가 많은 곡은 시간이 더 걸립니다.
- 창 크기를 바꾸면 악보가 다시 레이아웃됩니다.

### `music21` / MusicXML 변환 오류

```bash
pip install --user music21
# 또는
make install-deps
```

### 악보 글리프가 비어 있거나 깨질 때

```bash
# Debian/Ubuntu
sudo apt install librsvg2-common
sudo gdk-pixbuf-query-loaders --update-cache
```

### Verovio 빌드 실패

```bash
make distclean
make
```

`third_party/verovio`는 저장소에 포함되지 않으며, `scripts/build-verovio.sh`가 태그 `version-4.3.1`을 클론해 빌드합니다.

### 프로세스가 `Killed` 되거나 메모리 부족

- 매우 긴 악보(페이지 수 많음)는 SVG 합성 시 메모리를 많이 씁니다.
- 다른 대용량 앱을 닫거나, 더 짧은 MIDI로 시험해 보세요.

## Git에서 제외하는 항목

`.gitignore`에 의해 제외됩니다:

- `build/`, `midimaster`, 테스트 바이너리
- `third_party/verovio/` (클론·빌드 결과)
- `SoundFonts/*.sf2` (용량 큼, `make`로 복사)
- 프로젝트 루트의 `*.wav`, `*.mp3` (보내기 결과)
- Python `__pycache__` 등

`samples/*.mid` 는 저장소에 포함할 수 있습니다.

## 라이선스 참고

- Verovio: LGPL v3
- TimGM6mb.sf2: 배포 조건 확인
- FluidSynth, LAME: 각 라이선스 고지 필요
