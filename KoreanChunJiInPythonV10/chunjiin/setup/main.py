"""main.py - 천지인 한글 입력기 설치 프로그램.

C++ 판 installer/setup.c 와 같은 생각이다. 앱을 자기 안에 품고 있다가
설치 폴더에 푼다. 관리자 권한이 필요 없고, 다른 설치 도구를 깔지 않아도 된다.

    chunjiin-setup                       설치 창을 띄운다
    chunjiin-setup --uninstall           제거 창을 띄운다
    chunjiin-setup --silent --target D   창 없이 그 자리에 설치한다
    chunjiin-setup --silent --clean --target D       기존 파일을 다 지우고 설치한다
    chunjiin-setup --silent --uninstall --target D   창 없이 제거한다

설치할 때 설치 프로그램 자신을 설치 폴더에 uninstall.exe 로 복사해 둔다.
`설정 > 앱 > 제거` 가 그것을 띄우면 자기가 설치 폴더 안에서 돈다는 것을
알아보고 제거 창으로 연다.

품고 있는 실행 파일은 PyInstaller 가 `--add-data dist/chunjiin` 으로
`payload` 자리에 넣어 준다(scripts/pyinstaller_build.py). 소스로 돌 때는
저장소의 dist/ 를 본다. 없으면 설치 단추가 눌리지 않고, 무엇을 해야 하는지
알려 준다.
"""

from __future__ import annotations

import argparse
import io
import os
import sys

from chunjiin.setup import installer as inst

WINDOW_W, WINDOW_H = 560, 360


def payload_path(where=None):
    """품은 앱의 자리다. 파일 하나(한 파일 묶음)거나 폴더(한 폴더 묶음)다. 없으면 None 이다."""
    if where is None:
        base = getattr(sys, "_MEIPASS", None)
        if base:
            where = os.path.join(base, "payload")
        else:
            root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            dist = os.path.join(root, "dist")
            for cand in (os.path.join(dist, inst.exe_name()), os.path.join(dist, "chunjiin")):
                if os.path.exists(cand):
                    return cand
            return None
    return where if os.path.exists(where) else None


NO_PAYLOAD = "설치할 실행 파일이 들어 있지 않습니다.\nscripts/package.ps1 (또는 package.sh) 로 다시 빌드하세요."
DEFERRED = "제거를 마쳤습니다. 이 창을 닫으면 남은 파일이 지워집니다."


# ---------------------------------------------------------------------
# 창 없이
# ---------------------------------------------------------------------


def run_silent(target, remove, clean=False):
    """창 없이 설치하거나 제거한다. 결과는 돌려주는 값과 표준 출력이다."""
    target = target or inst.default_target()
    try:
        if remove:
            deferred = inst.uninstall(target)
            print(("제거를 마쳤습니다. 프로그램이 끝나면 폴더가 지워집니다. " if deferred else "제거를 마쳤습니다. ") + target)
        else:
            payload = payload_path()
            if not payload:
                print(NO_PAYLOAD, file=sys.stderr)
                return 2
            inst.install(target, payload, clean=clean)
            print(f"설치를 마쳤습니다. {target}")
    except inst.InstallError as e:
        print(f"실패: {e}", file=sys.stderr)
        return 1
    return 0


# ---------------------------------------------------------------------
# 창
# ---------------------------------------------------------------------


def run_gui(target, remove):
    from PySide6.QtCore import Qt
    from PySide6.QtGui import QGuiApplication
    from PySide6.QtWidgets import (
        QApplication,
        QDialog,
        QFileDialog,
        QFrame,
        QHBoxLayout,
        QLabel,
        QLineEdit,
        QMessageBox,
        QPushButton,
        QVBoxLayout,
    )

    from chunjiin.ui import font as fontmod
    from chunjiin.ui.theme import PALETTES, stylesheet_for

    fontmod.prepare()
    app = QApplication.instance() or QApplication(sys.argv)
    fontmod.install()
    app.setStyleSheet(stylesheet_for(PALETTES[0]))
    app.setWindowIcon(fontmod.window_icon())

    class Setup(QDialog):
        """설치 창이자 제거 창이다. `remove` 면 제거 쪽으로 연다."""

        def __init__(self, target, remove):
            super().__init__()
            self.remove_mode = remove
            self.setWindowTitle("천지인 한글 입력기 " + ("제거" if remove else "설치"))
            self.setWindowIcon(fontmod.window_icon())
            self.setFixedSize(WINDOW_W, WINDOW_H)
            self.payload = payload_path()
            self.busy = False

            body = QVBoxLayout(self)
            body.setContentsMargins(20, 16, 20, 14)
            body.setSpacing(8)

            head = QLabel(f"천지인 한글 입력기  {inst.VERSION}")
            head.setFont(fontmod.font(17, bold=True))
            body.addWidget(head)
            intro = QLabel(
                "이 컴퓨터에서 천지인 한글 입력기를 지웁니다.\n설치 폴더와 시작 메뉴 바로 가기, 앱 목록 등록이 함께 없어집니다."
                if remove
                else "12키 천지인 자판으로 한글을 조합하는 프로그램입니다.\n관리자 권한 없이 아래 폴더에 설치됩니다."
            )
            intro.setFont(fontmod.font(14))
            body.addWidget(intro)
            body.addWidget(self._line())

            lab = QLabel("설치 폴더")
            lab.setFont(fontmod.font(13, bold=True))
            body.addWidget(lab)
            row = QHBoxLayout()
            self.target = QLineEdit(target or inst.default_target())
            self.target.setFont(fontmod.font(14))
            self.target.setReadOnly(remove)
            self.target.textChanged.connect(self._sync)
            row.addWidget(self.target, 1)
            self.browse = QPushButton("찾기…")
            self.browse.clicked.connect(self._browse)
            self.browse.setVisible(not remove)
            row.addWidget(self.browse)
            body.addLayout(row)
            body.addWidget(self._line())

            btns = QHBoxLayout()
            self.install_btn = QPushButton("설치")
            self.install_btn.clicked.connect(self._install)
            self.install_btn.setVisible(not remove)
            self.remove_btn = QPushButton("제거")
            self.remove_btn.clicked.connect(self._remove)
            self.close_btn = QPushButton("닫기")
            self.close_btn.clicked.connect(self.close)
            btns.addWidget(self.install_btn)
            btns.addWidget(self.remove_btn)
            btns.addStretch(1)
            btns.addWidget(self.close_btn)
            body.addLayout(btns)

            self.status = QLabel("")
            self.status.setFont(fontmod.font(13))
            self.status.setWordWrap(True)
            self.status.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            body.addWidget(self.status, 1, Qt.AlignmentFlag.AlignTop)

            if remove:
                if not inst.is_installed(self.target.text().strip()):
                    self._say("이 폴더에는 설치되어 있지 않습니다.", True)
            elif not self.payload:
                self._say(NO_PAYLOAD, True)
            elif inst.is_installed(self.target.text().strip()):
                self._say("이미 설치되어 있습니다. 설치를 누르면 기존 파일을 어떻게 할지 묻습니다.", False)
            self._sync()
            (self.remove_btn if remove else self.install_btn).setDefault(True)

        @staticmethod
        def _line():
            f = QFrame()
            f.setFrameShape(QFrame.Shape.NoFrame)
            f.setProperty("divider", True)
            f.setFixedHeight(1)
            return f

        def _say(self, msg, failed):
            self.status.setText(msg)
            self.status.setStyleSheet("color: #D93025;" if failed else "")
            QApplication.processEvents()

        def _sync(self, *_):
            t = self.target.text().strip()
            self.install_btn.setEnabled(not self.busy and bool(self.payload) and bool(t))
            self.remove_btn.setEnabled(not self.busy and inst.is_installed(t))
            self.browse.setEnabled(not self.busy)
            self.close_btn.setEnabled(not self.busy)

        def _set_busy(self, on, msg=""):
            """오래 걸리는 일 동안 단추를 잠그고 모래시계를 보인다. 창이 멎은 것처럼 보이지 않게."""
            self.busy = on
            if on:
                QGuiApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
                self._say(msg, False)
            else:
                QGuiApplication.restoreOverrideCursor()
            self._sync()
            QApplication.processEvents()

        def _browse(self):
            d = QFileDialog.getExistingDirectory(self, "설치 폴더")
            if d:
                self.target.setText(os.path.join(d, inst.APP_NAME))

        def _ask(self, title, text, buttons, danger=None):
            """단추 몇 개를 주고 하나를 고르게 한다. 고른 단추의 글자를 돌려준다. 닫으면 None 이다."""
            box = QMessageBox(self)
            box.setWindowTitle(title)
            box.setText(text)
            made = {}
            for label in buttons:
                role = (
                    QMessageBox.ButtonRole.DestructiveRole
                    if label == danger
                    else QMessageBox.ButtonRole.RejectRole
                    if label == buttons[-1]
                    else QMessageBox.ButtonRole.AcceptRole
                )
                made[label] = box.addButton(label, role)
            box.setDefaultButton(made[buttons[-1]])
            box.exec()
            for label, b in made.items():
                if box.clickedButton() is b:
                    return label
            return None

        def _install(self):
            t = self.target.text().strip()
            clean = False
            if inst.is_installed(t):
                # 이미 있으면 어떻게 할지 사용자가 고른다. 덮어쓰기는 같은 이름의
                # 파일만 갈아 끼우고, 지우고 설치는 폴더를 통째로 비운 뒤 놓는다.
                choice = self._ask(
                    "이미 설치되어 있습니다",
                    f"이 폴더에 이미 설치되어 있습니다.\n\n{t}\n\n기존 파일을 어떻게 할까요?",
                    ("기존 파일을 모두 지우고 설치", "덮어쓰기", "그만두기"),
                    danger="기존 파일을 모두 지우고 설치",
                )
                if choice in (None, "그만두기"):
                    return
                clean = choice.startswith("기존 파일")

            self._set_busy(True, "기존 파일을 지우는 중…" if clean else "설치하는 중…")
            try:
                inst.install(t, self.payload, clean=clean)
                self._say(f"설치를 마쳤습니다.\n{t}", False)
            except inst.InstallError as e:
                self._say(f"실패: {e}", True)
            finally:
                self._set_busy(False)

        def _remove(self):
            t = self.target.text().strip()
            # 제거는 되돌릴 수 없으므로 한 번 더 묻는다.
            choice = self._ask("제거", f"설치한 파일을 모두 지울까요?\n\n{t}", ("지우기", "그만두기"), danger="지우기")
            if choice != "지우기":
                return
            self._set_busy(True, "제거하는 중…")
            try:
                deferred = inst.uninstall(t)
            except inst.InstallError as e:
                self._set_busy(False)
                self._say(f"실패: {e}", True)
                return
            self._set_busy(False)
            if deferred:
                # 제거기 자신이 그 폴더에 있어 지금은 못 지운다. 창을 닫으면 지워진다.
                self._say(DEFERRED, False)
                self.install_btn.setEnabled(False)
                self.remove_btn.setEnabled(False)
                QMessageBox.information(self, "제거", DEFERRED)
                self.close()
            else:
                self._say("제거를 마쳤습니다.", False)

    w = Setup(target, remove)
    w.show()
    return app.exec()


def _ensure_streams():
    """창 모드로 묶인 실행 파일은 표준 출력이 없다(None). 그대로 두면 argparse 가 죽는다."""
    for name in ("stdout", "stderr"):
        if getattr(sys, name) is None:
            setattr(sys, name, io.StringIO())


def main(argv=None):
    _ensure_streams()
    ap = argparse.ArgumentParser(prog="chunjiin-setup", description="천지인 한글 입력기 설치 프로그램")
    ap.add_argument("--uninstall", action="store_true", help="제거한다")
    ap.add_argument("--silent", action="store_true", help="창 없이 한다")
    ap.add_argument("--clean", action="store_true", help="설치할 때 기존 파일을 모두 지우고 놓는다 (창 없이 할 때)")
    ap.add_argument("--target", help=f"설치 폴더 (기본 {inst.default_target()})")
    args = ap.parse_args(argv)

    target, remove = args.target, args.uninstall
    # 설치 폴더 안의 제거기로 띄워졌으면(설정 > 앱 > 제거) 그 폴더를 지우는 창으로 연다.
    own = inst.own_install_dir()
    if own and not target:
        target, remove = own, True

    if args.silent:
        return run_silent(target, remove, args.clean)
    return run_gui(target, remove)


__all__ = ["DEFERRED", "NO_PAYLOAD", "main", "payload_path", "run_gui", "run_silent"]
