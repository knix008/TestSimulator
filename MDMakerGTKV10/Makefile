CC      = gcc
CFLAGS  = -Wall -Wextra -O2 -std=c11 -D_POSIX_C_SOURCE=200809L
TARGET  = midimaster
SRCDIR  = src
SRCS    = $(wildcard $(SRCDIR)/*.c)

UNAME_S := $(shell uname -s)

ifeq ($(UNAME_S), Linux)
    PKG_DEPS  = gtk+-3.0 fluidsynth sndfile
    LAME_LIBS = -lmp3lame
    DEPS_CMD  = sudo apt-get install -y \
                    libgtk-3-dev libfluidsynth-dev libsndfile1-dev \
                    libmp3lame-dev pkg-config
endif

ifeq ($(UNAME_S), Darwin)
    BREW_PREFIX := $(shell brew --prefix 2>/dev/null || echo /opt/homebrew)
    PKG_DEPS     = gtk+-3.0 fluidsynth sndfile
    CFLAGS      += -I$(BREW_PREFIX)/include
    LAME_LIBS    = -L$(BREW_PREFIX)/lib -lmp3lame
    DEPS_CMD     = brew install gtk+3 fluid-synth libsndfile lame pkg-config
endif

PKG_CFLAGS  := $(shell pkg-config --cflags $(PKG_DEPS) 2>/dev/null)
PKG_LDFLAGS := $(shell pkg-config --libs   $(PKG_DEPS) 2>/dev/null)

CFLAGS  += $(PKG_CFLAGS)
LDFLAGS  = $(PKG_LDFLAGS) $(LAME_LIBS) -lm

SOUNDFONT_SRC = ../MIDIMasterWinV10/MIDIMasterWinV10/SoundFonts/TimGM6mb.sf2
SOUNDFONT_DST = SoundFonts/TimGM6mb.sf2

.PHONY: all deps soundfont clean

all: soundfont $(TARGET)

deps:
	@echo "==> 의존성 패키지 설치 중..."
	$(DEPS_CMD)
	@echo "==> 완료. 'make' 를 실행하여 빌드하세요."

soundfont:
	@mkdir -p SoundFonts
	@if [ ! -f "$(SOUNDFONT_DST)" ]; then \
		if [ -f "$(SOUNDFONT_SRC)" ]; then \
			cp "$(SOUNDFONT_SRC)" "$(SOUNDFONT_DST)" && \
			echo "==> SoundFont 복사 완료."; \
		else \
			echo "==> 경고: $(SOUNDFONT_SRC) 에서 SoundFont를 찾을 수 없습니다."; \
			echo "==> TimGM6mb.sf2 를 $(SOUNDFONT_DST) 에 수동으로 복사하세요."; \
		fi; \
	fi

$(TARGET): $(SRCS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)
	@echo "==> 빌드 완료: ./$(TARGET)"

clean:
	rm -f $(TARGET)
	@echo "==> 정리 완료."
