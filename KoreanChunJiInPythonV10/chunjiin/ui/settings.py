"""settings.py - 설정 저장.

C++ 판은 HKCU\\Software\\Chunjiin 에 DWORD 로 넣었다. 레지스트리는 Windows
에만 있으므로 여기서는 JSON 파일 하나로 바꾼다. **칸 이름과 값은 Rust
판과 같다.** 테마 번호 · 글꼴 크기 · 연타 시간 · 시작 모드 · 언어 코드가
모두 같으므로 두 판을 번갈아 써도 설정이 그대로 이어진다.

    Windows  %AppData%\\Chunjiin\\settings.json
    macOS    ~/Library/Application Support/Chunjiin/settings.json
    Linux    ~/.config/Chunjiin/settings.json

경로를 만드는 함수는 갈아 끼울 수 있게 두었다(`set_settings_path`).
시험이 그것을 임시 폴더로 돌려세우기 위해서다. 환경 변수를 건드리는
것만으로는 운영체제마다 다른 설정 폴더를 확실히 돌려세울 수 없어, 실제
사용자 설정을 덮어쓸 위험이 있었다.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass

from chunjiin.engine import MODE_COUNT
from chunjiin.ui.lang import LANGS, Lang, detect_lang
from chunjiin.ui.theme import PALETTES

# 처음 실행하거나 "기본값" 을 눌렀을 때의 설정이다.
DEFAULT_THEME = 0
DEFAULT_FONT_SIZE = 21
DEFAULT_MULTITAP_MS = 800

# 설정 창에 나오는 글꼴 크기 목록이다.
FONT_CHOICES = (16, 18, 21, 24, 28, 32)

# 연타 유지 시간 목록이다(밀리초).
TAP_CHOICES = (400, 600, 800, 1000, 1500, 2000)

# JSON 칸 이름 <-> 속성 이름. Rust 판과 같은 이름이다.
_FIELDS = (
    ("theme", "theme"),
    ("fontSize", "font_size"),
    ("multitapMs", "multitap_ms"),
    ("startMode", "start_mode"),
    ("showToolbar", "show_toolbar"),
    ("showStatus", "show_status"),
    ("language", "language"),
)


@dataclass
class Settings:
    """설정 창에서 바꿀 수 있는 값들이다."""

    theme: int = DEFAULT_THEME  # PALETTES 의 번호
    font_size: int = DEFAULT_FONT_SIZE  # 편집 영역 글꼴 크기
    multitap_ms: int = DEFAULT_MULTITAP_MS  # 연타 순환이 유지되는 시간(밀리초)
    start_mode: int = 0  # 시작할 때의 입력 모드
    show_toolbar: bool = True
    show_status: bool = True
    language: str = Lang.KO  # 화면 언어 ("ko" 또는 "en")

    def lang(self):
        """지금 언어다."""
        return Lang.from_code(self.language)

    def normalize(self):
        """파일이 손상되었거나 손으로 고쳐졌을 때를 대비해 값을 다듬는다."""
        self.theme = _clamp(_int(self.theme, DEFAULT_THEME), 0, len(PALETTES) - 1)
        self.font_size = _clamp(_int(self.font_size, DEFAULT_FONT_SIZE), FONT_CHOICES[0], FONT_CHOICES[-1])
        self.multitap_ms = _clamp(_int(self.multitap_ms, DEFAULT_MULTITAP_MS), TAP_CHOICES[0], TAP_CHOICES[-1])
        self.start_mode = _clamp(_int(self.start_mode, 0), 0, MODE_COUNT - 1)
        self.show_toolbar = bool(self.show_toolbar)
        self.show_status = bool(self.show_status)
        if self.language not in LANGS:
            self.language = Lang.KO
        return self

    def to_json(self):
        return {key: getattr(self, attr) for key, attr in _FIELDS}

    @staticmethod
    def from_json(raw):
        """JSON 객체에서 만든다. 모르는 칸은 버리고 없는 칸은 기본값이다."""
        s = Settings()
        if isinstance(raw, dict):
            for key, attr in _FIELDS:
                if key in raw:
                    setattr(s, attr, raw[key])
        return s.normalize()

    def save(self):
        """설정을 파일에 쓴다. 실패해도 프로그램은 그대로 돌아간다(OSError 를 낸다)."""
        path = settings_path()
        if not path:
            raise OSError("설정 폴더를 찾지 못했습니다")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_json(), f, ensure_ascii=False, indent=2)
            f.write("\n")


def _int(v, default):
    if isinstance(v, bool):
        return default
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def load_settings():
    """설정을 읽는다.

    파일이 없거나 읽을 수 없으면 기본값을 주되, 언어만은 운영체제 설정을 따른다.
    """
    fallback = Settings(language=detect_lang())

    path = settings_path()
    if not path:
        return fallback
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, ValueError):
        return fallback
    return Settings.from_json(raw)


# ---------------------------------------------------------------------
# 설정 파일의 자리
# ---------------------------------------------------------------------

# 시험이 갈아 끼울 수 있게 덮어쓸 수 있는 자리로 둔다.
_override = None


def set_settings_path(path):
    """설정 파일의 자리를 바꾼다. None 이면 되돌린다. 시험에서만 쓴다."""
    global _override
    _override = path


def config_dir():
    """운영체제의 설정 폴더다. 꾸러미를 쓰지 않고 직접 찾는다. 모르면 None 이다."""
    if sys.platform == "win32":
        base = os.environ.get("APPDATA")
        return base or None
    if sys.platform == "darwin":
        home = os.environ.get("HOME")
        return os.path.join(home, "Library", "Application Support") if home else None
    xdg = os.environ.get("XDG_CONFIG_HOME")
    if xdg:
        return xdg
    home = os.environ.get("HOME")
    return os.path.join(home, ".config") if home else None


def settings_path():
    """설정 파일의 자리다. 모르면 None 이다."""
    if _override:
        return _override
    base = config_dir()
    return os.path.join(base, "Chunjiin", "settings.json") if base else None


def settings_location():
    """프로그램 정보 창에 보여 줄 설정 파일 경로다."""
    return settings_path() or "(알 수 없음)"


# ---------------------------------------------------------------------
# 설정 창의 목록 글자
# ---------------------------------------------------------------------


def unit_labels(choices, default, unit, mark):
    """"21 px  (기본)" 같은 목록을 만든다."""
    return [f"{v} {unit}" + (f"  {mark}" if v == default else "") for v in choices]


def tap_labels(unit, mark):
    """"0.8 초  (기본)" 같은 목록을 만든다."""
    return [
        f"{v / 1000:.1f} {unit}" + (f"  {mark}" if v == DEFAULT_MULTITAP_MS else "")
        for v in TAP_CHOICES
    ]


def index_in(choices, v):
    """목록에서 값의 자리를 찾는다. 없으면 0 이다."""
    try:
        return list(choices).index(v)
    except ValueError:
        return 0


__all__ = [
    "DEFAULT_FONT_SIZE",
    "DEFAULT_MULTITAP_MS",
    "DEFAULT_THEME",
    "FONT_CHOICES",
    "TAP_CHOICES",
    "Settings",
    "config_dir",
    "index_in",
    "load_settings",
    "set_settings_path",
    "settings_location",
    "settings_path",
    "tap_labels",
    "unit_labels",
]
