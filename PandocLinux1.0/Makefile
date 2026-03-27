# PandocLinux Makefile (macOS/Linux)

# 기본 설정
target = pandoc-linux
src = main.c
# OS별 GTK3 pkg-config 경로

# OS별 타겟명
ifeq ($(shell uname), Darwin)
target = pandoc_macos
else
target = pandoc_linux
endif

ifeq ($(shell uname), Darwin)
	PKG_CONFIG_PATH := /opt/homebrew/lib/pkgconfig:/usr/local/lib/pkgconfig:$(PKG_CONFIG_PATH)
	export PKG_CONFIG_PATH
endif

# GTK3 및 스레드 라이브러리
CFLAGS   := $(shell pkg-config --cflags gtk+-3.0) -std=c11 -Wall -O2
LDFLAGS  := $(shell pkg-config --libs gtk+-3.0) -lpthread


all: info $(target)

info:
	@echo "======================================="
	@echo "[1/3] PandocLinux 빌드 시작"
	@echo "  OS: $(shell uname)"
	@echo "  CC: $(CC)"
	@echo "======================================="

$(target): $(src)
	@echo "[2/3] 컴파일 중: $^"
	@$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS) 2>&1 || (echo "컴파일 오류! 자세한 내용은 make VERBOSE=1로 확인하세요." && false)
	@echo "[3/3] 빌드 완료: $@"

clean:
	rm -f $(target)
	rm -f *.pdf *.docx *.html *.epub *.odt *.txt *.tex

.PHONY: all clean
