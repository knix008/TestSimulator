# MIDI Master GTK V10

Linux / macOS용 MIDI 플레이어 (GTK 3). [MIDIMasterWinV10](../MIDIMasterWinV10)과 동일한 핵심 기능을 제공합니다.

- **악보**: Cairo + Pango — MIDI 이벤트를 직접 파싱하여 그랜드스태프(피아노 악보) 렌더링
- **재생**: FluidSynth + TimGM6mb SoundFont
- **보내기**: WAV / MP3 (LAME, 선택)

## 빠른 시작

```bash
cd MIDIMasterGTKV10
make              # 의존성 검사·자동 설치 + 컴파일
./midimaster      # 또는 make run
```

의존성만 확인·설치:

```bash
make check-deps       # 설치 여부 검사
make install-deps     # apt/dnf/pacman/brew + GdkPixbuf 캐시 갱신
```

자동 패키지 설치를 끄려면:

```bash
MIDIMaster_AUTO_INSTALL=0 make
```

## 요구 사항

| 항목 | 용도 |
|------|------|
| build-essential, pkg-config | 빌드 도구 |
| GTK 3, GdkPixbuf, Cairo, Pango | UI·악보 렌더링 |
| librsvg2-dev | SVG 악보 폰트 렌더링 (헤더 필요) |
| librsvg2-common | GdkPixbuf SVG 로더 |
| FluidSynth | MIDI 재생·합성 |
| libsndfile | WAV 보내기 |
| libmp3lame-dev (선택) | MP3 보내기 |

SoundFont는 `../MIDIMasterWinV10/.../TimGM6mb.sf2`에서 `make` 시 `SoundFonts/`로 자동 복사됩니다.  
형제 프로젝트가 없으면 `SoundFonts/TimGM6mb.sf2`를 직접 넣으세요.

## 프로젝트 구조

```
MIDIMasterGTKV10/
├── Makefile
├── midimaster.desktop
├── README.md
├── include/                 # 공개 헤더 (GTK 제외 코어)
│   └── gtk/                 # GTK·GdkPixbuf 전용 헤더
├── source/
│   ├── main.c               # gtk_init, 메인 루프
│   ├── score_verovio.c      # MIDI 파싱 + Cairo 악보 렌더러
│   ├── midi_player.c        # FluidSynth 재생
│   ├── midi_file.c          # MIDI 메타데이터
│   ├── audio_export.c       # WAV/MP3 보내기
│   ├── general_midi.c       # GM 악기 이름 목록
│   ├── paths.c              # 경로 유틸리티
│   └── gtk/                 # GTK UI·SVG 래스터
│       ├── main_window.c    # 메인 창, 파일 열기, 악보 로드 스레드
│       ├── score_view.c     # 악보 표시·플레이헤드 (세로 스크롤)
│       ├── svg_raster.c     # librsvg → Cairo
│       └── app_icon.c
├── scripts/
│   ├── check-deps.sh        # 의존성 검사
│   └── install-deps.sh      # 패키지 자동 설치
├── samples/                 # 테스트용 MIDI
├── tests/
│   └── test_audio_export.c  # WAV/MP3 보내기 단위 테스트
└── SoundFonts/              # TimGM6mb.sf2 (make 시 복사, git 제외)
```

## 사용법

1. **파일 → 열기**로 `.mid` / `.midi` 선택
2. 악보가 자동으로 파싱·렌더링됩니다 (진행 표시줄 확인)
3. 악보는 시스템 단위로 **세로 스크롤** (위→아래)로 표시됩니다
4. GM 악기 선택 후 **재생**
5. 재생 중 빨간 세로선(플레이헤드)이 현재 위치를 표시하며 자동 스크롤
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
| `make info` | 플랫폼·MP3 지원 여부 출력 |

## 문제 해결

### `make` 시 librsvg-2.0 오류

```bash
make install-deps
# 또는 직접:
sudo apt install librsvg2-dev
```

### 악보 글리프가 비어 있거나 깨질 때

```bash
sudo apt install librsvg2-common
sudo gdk-pixbuf-query-loaders --update-cache
```

### 창 크기를 바꾸면 악보가 다시 레이아웃됩니다

정상 동작입니다. 너비 변화가 48px 이상이면 악보를 새 너비로 재렌더링합니다.

## Git에서 제외하는 항목

`.gitignore`에 의해 제외됩니다:

- `build/`, `midimaster`, 테스트 바이너리
- `SoundFonts/*.sf2` (용량 큼, `make`로 복사)
- 프로젝트 루트의 `*.wav`, `*.mp3` (보내기 결과)
- Python `__pycache__` 등

`samples/*.mid` 는 저장소에 포함됩니다.

## 라이선스 참고

- TimGM6mb.sf2: 배포 조건 확인
- FluidSynth, LAME: 각 라이선스 고지 필요
