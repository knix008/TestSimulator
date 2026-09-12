"""font.py - 내장 글꼴 등록.

시스템 한글 글꼴에 기대지 않고 **Noto Sans KR 을 함께 배포한다.** 완성형
11172자를 모두 담고 있어야 `갂 갃` 같은 글자도 그려진다. 글꼴이 없는
컴퓨터에서도 화면이 같아진다.

가변 글꼴 `NotoSansKR[wght].ttf` 를 그대로 넣으면 안 된다. 그 글꼴은
`wght` 축의 **기본값이 100(Thin)** 이라서 글자가 아주 가늘게, 흐릿하게
나온다. 그래서 400 과 700 으로 미리 뽑아 둔 두 벌을 넣는다.

    python -m fontTools.varLib.instancer -o NotoSansKR-Regular.ttf NotoSansKR[wght].ttf wght=400
    python -m fontTools.varLib.instancer -o NotoSansKR-Bold.ttf    NotoSansKR[wght].ttf wght=700

쓰는 차례가 정해져 있다.

    prepare()   QApplication 을 만들기 **전에**. 글꼴 폴더를 Qt 에 알려 준다.
    install()   QApplication 을 만든 **뒤에**. 글꼴을 등록하고 기본 글꼴로 삼는다.

Qt 는 더 이상 글꼴을 함께 배포하지 않는다. 그래서 `offscreen` 처럼
운영체제 글꼴을 쓰지 않는 화면 갈래로 돌리면 "Cannot find font directory"
라고 나무란다. 우리는 글꼴을 들고 있으므로 `prepare()` 가 QT_QPA_FONTDIR
를 그 폴더로 가리킨다.
"""

from __future__ import annotations

import os
import sys

# 등록되는 글꼴 가족의 이름이다. 두 파일(400 · 700)이 한 가족으로 묶인다.
FAMILY = "Noto Sans KR"

_FONT_FILES = ("NotoSansKR-Regular.ttf", "NotoSansKR-Bold.ttf")

_installed = False


def assets_dir():
    """아이콘과 글꼴이 있는 폴더다.

    PyInstaller 로 묶였으면 풀어 놓은 임시 폴더의 assets/ 이고, 소스로 돌면
    저장소 루트의 assets/ 이다.
    """
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return os.path.join(base, "assets")
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(root, "assets")


def fonts_dir():
    return os.path.join(assets_dir(), "fonts")


def icon_path():
    """창과 작업 표시줄에 쓰는 아이콘이다. Windows 는 .ico, 그 밖에는 .png 다."""
    ico = os.path.join(assets_dir(), "chunjiin.ico")
    if sys.platform == "win32" and os.path.isfile(ico):
        return ico
    return os.path.join(assets_dir(), "chunjiin.png")


def prepare():
    """QApplication 을 만들기 전에 부른다. Qt 에 글꼴 폴더를 알려 준다."""
    os.environ.setdefault("QT_QPA_FONTDIR", fonts_dir())


def install():
    """QApplication 을 만든 뒤에 부른다. 내장 글꼴을 등록하고 기본 글꼴로 삼는다.

    두 번 불러도 한 번만 등록한다. 등록에 실패하면(파일이 없으면) 시스템
    글꼴로 그대로 간다. 글자가 안 나오는 것보다 낫다.
    """
    global _installed
    from PySide6.QtGui import QFont, QFontDatabase
    from PySide6.QtWidgets import QApplication

    app = QApplication.instance()
    if app is None:
        raise RuntimeError("font.install() 은 QApplication 을 만든 뒤에 불러야 한다")

    if not _installed:
        ok = False
        for name in _FONT_FILES:
            path = os.path.join(fonts_dir(), name)
            if os.path.isfile(path) and QFontDatabase.addApplicationFont(path) >= 0:
                ok = True
        _installed = True
        if not ok:
            return False

    base = QFont(FAMILY, 10)
    base.setStyleStrategy(QFont.StyleStrategy.PreferAntialias)
    app.setFont(base)
    return True


def font(size, bold=False):
    """내장 글꼴로 QFont 를 만든다. `size` 는 픽셀이다."""
    from PySide6.QtGui import QFont

    f = QFont(FAMILY)
    f.setPixelSize(int(size))
    f.setWeight(QFont.Weight.Bold if bold else QFont.Weight.Normal)
    return f


def window_icon():
    """창 아이콘이다. 파일이 없으면 빈 아이콘이다."""
    from PySide6.QtGui import QIcon

    path = icon_path()
    return QIcon(path) if os.path.isfile(path) else QIcon()


__all__ = ["FAMILY", "assets_dir", "font", "fonts_dir", "icon_path", "install", "prepare", "window_icon"]
