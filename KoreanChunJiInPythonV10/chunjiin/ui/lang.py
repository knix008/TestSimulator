"""lang.py - 화면에 나오는 글자들. 한국어와 영어 두 벌이다.

`Strings` 라는 dataclass 하나에 화면에 나오는 모든 글자가 들어 있다.
칸이 정해져 있으므로 항목을 하나 빠뜨리면 만들 때 바로 터진다.
tests/test_ui.py 의 `언어표` 시험이 두 언어의 모든 칸이 비지 않았는지
전수로 본다. 새 언어를 넣으려면 `_TABLES` 에 한 벌을 더 적으면 된다.
"""

from __future__ import annotations

import locale
import os
from dataclasses import dataclass, fields

from chunjiin.ui.help import HELP_EN, HELP_KO

# 기능 버튼 수다.
FN_COUNT = 6

# 툴바 버튼 수다. `Strings.tips` 의 길이와 같아야 한다.
TOOL_COUNT = 11


class Lang:
    """화면에 쓰는 언어다. 값은 설정 파일에 저장되는 코드다."""

    KO = "ko"
    EN = "en"

    _NAMES = {KO: "한국어", EN: "English"}

    @staticmethod
    def from_code(code):
        """코드를 언어로 바꾼다. 모르는 코드는 한국어다."""
        return Lang.EN if code == Lang.EN else Lang.KO

    @staticmethod
    def name(code):
        """설정 창과 메뉴에 나오는 이름이다."""
        return Lang._NAMES[Lang.from_code(code)]

    @staticmethod
    def next(code):
        """다음 언어다. 툴바의 지구본 단추가 쓴다."""
        return Lang.EN if Lang.from_code(code) == Lang.KO else Lang.KO


# 고를 수 있는 언어다.
LANGS = (Lang.KO, Lang.EN)


@dataclass(frozen=True)
class Strings:
    """화면에 쓰는 모든 글자다."""

    app_title: str
    help_title: str
    about_title: str

    menu_file: str
    menu_edit: str
    menu_input: str
    menu_config: str
    menu_help: str

    new: str
    open: str
    save: str
    quit: str
    copy: str
    paste: str
    clear_all: str
    next_mode: str
    theme: str
    next_theme: str
    language: str
    show_toolbar: str
    show_status: str
    settings_dots: str
    usage: str
    about_item: str

    # 설정 창
    set_title: str
    set_ok: str
    set_cancel: str
    set_default: str
    set_theme: str
    set_font_size: str
    set_tap_time: str
    set_start_mode: str
    set_language: str
    unit_px: str
    unit_sec: str
    mark_default: str

    # 상태줄
    status_composing: str
    status_chars: str
    status_none: str

    mode_names: tuple  # 모드 이름 5개
    theme_names: tuple  # 테마 이름 4개

    # 기능 버튼과 그 설명. fn_labels 가 빈 칸이면 그 자리는 글자 대신
    # 그림을 그린다(줄바꿈 · 지우기. icons.py 와 app.py 의 FN_ICONS 를 보라).
    fn_labels: tuple
    fn_hints: tuple

    tips: tuple  # 툴바 설명 11개

    # 대화 상자
    err_open: str
    err_save: str
    close: str
    file_filter: str

    # 프로그램 정보
    about_body: str
    about_author: str
    about_engine: str
    about_build: str
    about_platform: str
    about_font: str
    about_theme: str
    about_settings: str

    help: str


def string_fields():
    """`Strings` 의 칸 이름들이다. 시험이 전수로 훑을 때 쓴다."""
    return [f.name for f in fields(Strings)]


_KO = Strings(
    app_title="천지인 한글 입력기",
    help_title="천지인 한글 입력기 - 사용법",
    about_title="프로그램 정보",

    menu_file="파일",
    menu_edit="편집",
    menu_input="입력",
    menu_config="설정",
    menu_help="도움말",

    new="새로 만들기",
    open="열기...",
    save="저장...",
    quit="끝내기",
    copy="복사",
    paste="붙여넣기",
    clear_all="전체 지우기",
    next_mode="다음 모드",
    theme="테마",
    next_theme="다음 테마",
    language="언어",
    show_toolbar="툴바 보이기",
    show_status="상태줄 보이기",
    settings_dots="설정...",
    usage="사용법",
    about_item="정보",

    set_title="설정",
    set_ok="확인",
    set_cancel="취소",
    set_default="기본값",
    set_theme="테마",
    set_font_size="글꼴 크기",
    set_tap_time="연타 유지 시간",
    set_start_mode="시작 입력 모드",
    set_language="언어",
    unit_px="px",
    unit_sec="초",
    mark_default="(기본)",

    status_composing="조합",
    status_chars="자",
    status_none="–",

    mode_names=("한글", "영문 abc", "영문 ABC", "숫자 123", "기호 !@#"),
    theme_names=("라이트", "다크", "세피아", "고대비"),

    fn_labels=("모드", "←", "스페이스", "→", "", ""),
    fn_hints=(
        "입력 모드 전환 (F2)",
        "커서 왼쪽 (←)",
        "띄어쓰기 (Space)",
        "커서 오른쪽 (→) · 연타 순환 끊기",
        "줄바꿈 (Enter)",
        "지우기 (Backspace)",
    ),

    tips=(
        "새로 만들기 (Ctrl+N)",
        "열기 (Ctrl+O)",
        "저장 (Ctrl+S)",
        "복사 (Ctrl+C)",
        "붙여넣기 (Ctrl+V)",
        "전체 지우기",
        "입력 모드 전환 (F2)",
        "테마 전환 (F3)",
        "언어 전환 (한국어 / English)",
        "설정... (F4)",
        "프로그램 정보",
    ),

    err_open="파일을 열 수 없습니다",
    err_save="파일을 저장할 수 없습니다",
    close="닫기",
    file_filter="텍스트 파일 (*.txt);;모든 파일 (*)",

    about_body="12키 천지인 자판으로 한글을 조합합니다.",
    about_author="만든이",
    about_engine="조합 엔진",
    about_build="빌드",
    about_platform="플랫폼",
    about_font="글꼴",
    about_theme="현재 테마",
    about_settings="설정 저장 위치",

    help=HELP_KO,
)

_EN = Strings(
    app_title="Chunjiin Hangul Keyboard",
    help_title="Chunjiin Hangul Keyboard - Guide",
    about_title="About",

    menu_file="File",
    menu_edit="Edit",
    menu_input="Input",
    menu_config="Settings",
    menu_help="Help",

    new="New",
    open="Open...",
    save="Save...",
    quit="Quit",
    copy="Copy",
    paste="Paste",
    clear_all="Clear all",
    next_mode="Next mode",
    theme="Theme",
    next_theme="Next theme",
    language="Language",
    show_toolbar="Show toolbar",
    show_status="Show status bar",
    settings_dots="Preferences...",
    usage="Guide",
    about_item="About",

    set_title="Settings",
    set_ok="OK",
    set_cancel="Cancel",
    set_default="Defaults",
    set_theme="Theme",
    set_font_size="Font size",
    set_tap_time="Multi-tap window",
    set_start_mode="Start mode",
    set_language="Language",
    unit_px="px",
    unit_sec="s",
    mark_default="(default)",

    status_composing="Composing",
    status_chars="chars",
    status_none="–",

    mode_names=("Hangul", "Latin abc", "Latin ABC", "Digits 123", "Symbols !@#"),
    theme_names=("Light", "Dark", "Sepia", "High contrast"),

    fn_labels=("Mode", "←", "Space", "→", "", ""),
    fn_hints=(
        "Switch input mode (F2)",
        "Cursor left (←)",
        "Space",
        "Cursor right (→) · end multi-tap",
        "New line (Enter)",
        "Delete (Backspace)",
    ),

    tips=(
        "New (Ctrl+N)",
        "Open (Ctrl+O)",
        "Save (Ctrl+S)",
        "Copy (Ctrl+C)",
        "Paste (Ctrl+V)",
        "Clear all",
        "Switch input mode (F2)",
        "Switch theme (F3)",
        "Switch language (한국어 / English)",
        "Preferences... (F4)",
        "About",
    ),

    err_open="Could not open the file",
    err_save="Could not save the file",
    close="Close",
    file_filter="Text files (*.txt);;All files (*)",

    about_body="Types Hangul with the 12-key Chunjiin layout.",
    about_author="Author",
    about_engine="Engine",
    about_build="Build",
    about_platform="Platform",
    about_font="Font",
    about_theme="Theme",
    about_settings="Settings file",

    help=HELP_EN,
)

_TABLES = {Lang.KO: _KO, Lang.EN: _EN}


def strings_for(code):
    """지금 언어의 글자 묶음을 돌려준다."""
    return _TABLES[Lang.from_code(code)]


def detect_lang():
    """운영체제의 언어 설정을 보고 처음 쓸 언어를 고른다.

    한국어로 보이면 한국어, 그 밖에는 영어다. 환경 변수가 먼저고, Windows
    처럼 그것이 없으면 로캘을 본다. 그것도 모르면 한국어로 시작한다.
    """
    for key in ("LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"):
        v = os.environ.get(key, "").lower()
        if v:
            return Lang.KO if v.startswith("ko") else Lang.EN
    try:
        loc = locale.getlocale()[0] or ""
    except ValueError:
        loc = ""
    if loc:
        return Lang.KO if loc.lower().startswith(("ko", "korean")) else Lang.EN
    return Lang.KO


__all__ = ["FN_COUNT", "LANGS", "TOOL_COUNT", "Lang", "Strings", "detect_lang", "string_fields", "strings_for"]
