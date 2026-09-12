"""app.py - 데스크톱 창 조립.

    메뉴 - 툴바 - 편집 영역 - 상태줄 - 천지인 키패드

엔진 버퍼가 원본이고 화면은 그것을 비춘다. 화면은 조합 상태를 하나도
들고 있지 않다. 무엇을 하든 마지막에 `refresh()` 하나만 부르면 화면이
엔진과 같아진다. 그래서 어긋날 자리가 없다.

편집 영역은 `QPlainTextEdit` 을 쓰되 **직접 타이핑하지 못하게** 막는다.
읽기 전용으로 두지 않는 까닭은, 그렇게 하면 Qt 가 깜박이는 막대를
감추기 때문이다. 편집은 열어 두고 이벤트를 우리가 먼저 받는다.

앱을 만드는 길은 `run()` 하나다. 글꼴 등록은 첫 창을 만들기 전에 끝나야
하므로 거기서 한다.
"""

from __future__ import annotations

import sys

from PySide6.QtCore import QEvent, Qt, QTimer
from PySide6.QtGui import QAction, QActionGroup, QKeySequence
from PySide6.QtWidgets import (
    QApplication,
    QFileDialog,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from chunjiin import __version__ as VERSION
from chunjiin.engine import MAX_TEXT_LEN, MODE_COUNT, InputMode, State
from chunjiin.ui import font as fontmod
from chunjiin.ui.dialogs import AboutDialog, HelpDialog, SettingsDialog
from chunjiin.ui.icons import Icon
from chunjiin.ui.lang import FN_COUNT, LANGS, Lang, strings_for
from chunjiin.ui.layout import (
    TOOL_GAP,
    TOOL_SIZE,
    TOOL_TAIL_GAP,
    TOOLBAR_MIN_W,
    toolbar_metrics,
    toolbar_slot_x,
)
from chunjiin.ui.settings import Settings, load_settings
from chunjiin.ui.theme import palette_at, stylesheet_for, ui_role
from chunjiin.ui.widgets import Keypad, Toolbar

__all__ = [
    "FN_ICONS",
    "MIN_WINDOW_H",
    "MIN_WINDOW_W",
    "TOOL_GAP",
    "TOOL_SIZE",
    "TOOL_TAIL_GAP",
    "VERSION",
    "WINDOW_H",
    "WINDOW_W",
    "App",
    "Editor",
    "main",
    "run",
    "toolbar_metrics",
    "toolbar_slot_x",
]

# 기능 버튼의 자리.
FN_MODE, FN_LEFT, FN_SPACE, FN_RIGHT, FN_ENTER, FN_BACKSPACE = range(FN_COUNT)

# 기능 버튼에 글자 대신 그릴 그림이다. None 이면 글자를 쓴다.
# 줄바꿈(↵)과 지우기(⌫)는 내장 글꼴에 없는 글자라 그림으로 그린다.
FN_ICONS = (None, None, None, None, Icon.ENTER, Icon.BACKSPACE)

# 툴바를 감싸는 판의 좌우 여백이다. 이만큼을 더해야 툴바가 실제로 다 보인다.
PANEL_PAD = 20.0

# 창의 최소 폭. 이보다 좁아지면 툴바 버튼이 가려진다. 툴바가 정한다.
MIN_WINDOW_W = TOOLBAR_MIN_W + PANEL_PAD
# 창의 최소 높이. 편집칸이 아주 납작해지지 않을 만큼만 잡는다.
MIN_WINDOW_H = 560.0

# 창을 처음 띄울 때의 크기다. 폭은 최소 폭에 그대로 맞춘다. 툴바가 다
# 보이는 가장 좁은 폭이고, 그보다 넓혀 봐야 편집칸 양옆만 비기 때문이다.
WINDOW_W = MIN_WINDOW_W
WINDOW_H = 760.0

# 메모장이 UTF-8 로 알아보게 하려고 저장할 때 붙이는 바이트 순서 표시다.
UTF8_BOM = b"\xef\xbb\xbf"

# 한글 모드에서 숫자열을 키패드에 대응시킨다.
#
#     1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
#     4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !
HANGUL_KEYS = {
    Qt.Key.Key_1: 0, Qt.Key.Key_2: 1, Qt.Key.Key_3: 2,
    Qt.Key.Key_4: 3, Qt.Key.Key_5: 4, Qt.Key.Key_6: 5,
    Qt.Key.Key_7: 6, Qt.Key.Key_8: 7, Qt.Key.Key_9: 8,
    Qt.Key.Key_Minus: 9, Qt.Key.Key_0: 10, Qt.Key.Key_Equal: 11,
}


# ---------------------------------------------------------------------
# 엔진 글자 위치 <-> Qt 글자 위치
#
# 엔진은 코드포인트 하나를 한 칸으로 세고 Qt 는 UTF-16 단위로 센다.
# 한글은 둘이 같지만, 이모지처럼 BMP 밖의 글자는 Qt 에서 두 칸이다.
# ---------------------------------------------------------------------


def _unit_of(text, pos):
    """코드포인트 위치를 UTF-16 단위 위치로 바꾼다."""
    return sum(2 if ord(c) > 0xFFFF else 1 for c in text[:pos])


def _char_of(text, unit):
    """UTF-16 단위 위치를 코드포인트 위치로 바꾼다."""
    n = 0
    for i, c in enumerate(text):
        if n >= unit:
            return i
        n += 2 if ord(c) > 0xFFFF else 1
    return len(text)


class Editor(QPlainTextEdit):
    """편집 영역이다. 직접 타이핑하지 못하고, 찍은 자리만 엔진 커서로 되돌린다.

    - keyPressEvent 는 창(App)이 먼저 받으므로 여기 오는 키는 없다.
      혹시 오더라도 삼킨다.
    - inputMethodEvent 를 삼킨다. 그러지 않으면 운영체제의 한글 IME 가
      끼어들어 우리 엔진과 두 겹으로 조합한다.
    - 붙여넣기(insertFromMimeData)도 엔진을 거친다.
    """

    def __init__(self, app, parent=None):
        super().__init__(parent)
        self._app = app
        self.setAttribute(Qt.WidgetAttribute.WA_InputMethodEnabled, False)
        self.setUndoRedoEnabled(False)
        self.setLineWrapMode(QPlainTextEdit.LineWrapMode.WidgetWidth)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
        self.setAcceptDrops(False)

    def keyPressEvent(self, e):
        if not self._app.handle_key(e):
            e.ignore()

    def inputMethodEvent(self, e):
        e.accept()

    def insertFromMimeData(self, source):
        if source.hasText():
            self._app.insert_text(source.text())

    def mouseReleaseEvent(self, e):
        super().mouseReleaseEvent(e)
        self._app.on_editor_click()


class App(QMainWindow):
    """창 하나와 그에 매인 엔진 상태다."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.set = load_settings()
        self.state = State()
        self.state.set_mode_index(self.set.start_mode)
        self.txt = strings_for(self.set.lang())
        self.pal = palette_at(self.set.theme)

        self.setWindowIcon(fontmod.window_icon())
        self.setMinimumSize(int(MIN_WINDOW_W), int(MIN_WINDOW_H))

        # 연타 순환을 끊는 시계다. 엔진에는 시계가 없다. 끊으라고 하면 끊을 뿐이다.
        self.tap_timer = QTimer(self)
        self.tap_timer.setSingleShot(True)
        self.tap_timer.timeout.connect(self._break_multitap)

        self._build()
        self._build_menus()
        self.apply_theme()
        self.refresh()

        # 키패드 버튼은 초점을 받지 않지만, 그래도 새는 경우를 위해
        # 창이 활성일 때의 키를 우리가 먼저 본다.
        QApplication.instance().installEventFilter(self)
        self.editor.setFocus()

    # -----------------------------------------------------------------
    # 화면 만들기
    # -----------------------------------------------------------------

    def _build(self):
        root = QWidget(self)
        box = QVBoxLayout(root)
        box.setContentsMargins(8, 4, 8, 8)
        box.setSpacing(6)

        self.toolbar = Toolbar(root)
        self.toolbar.tool_pressed.connect(self.run_tool)
        box.addWidget(self.toolbar)

        self.editor = Editor(self, root)
        self.editor.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        box.addWidget(self.editor, 1)

        self.status = QLabel(root)
        self.status.setProperty("muted", True)
        self.status.setFont(fontmod.font(13, bold=True))
        self.status.setContentsMargins(6, 0, 6, 0)
        box.addWidget(self.status)

        self.keypad = Keypad(FN_ICONS, root)
        self.keypad.key_pressed.connect(self.do_key)
        self.keypad.fn_pressed.connect(self.run_fn)
        box.addWidget(self.keypad)

        self.setCentralWidget(root)

    def _action(self, menu, text, slot, shortcut=None, checkable=False, checked=False):
        a = QAction(text, self)
        if shortcut:
            a.setShortcut(QKeySequence(shortcut))
        if checkable:
            a.setCheckable(True)
            a.setChecked(checked)
            a.toggled.connect(slot)
        else:
            a.triggered.connect(slot)
        menu.addAction(a)
        self._actions.append(a)
        return a

    def _build_menus(self):
        """메뉴를 (다시) 만든다. 언어가 바뀌면 통째로 새로 만든다."""
        t = self.txt
        bar = self.menuBar()
        bar.clear()
        # 옛 동작을 지운다. 남겨 두면 단축키가 두 겹으로 걸려 "ambiguous" 가 된다.
        for a in getattr(self, "_actions", ()):
            a.setParent(None)
            a.deleteLater()
        self._actions = []

        m = bar.addMenu(t.menu_file)
        self._action(m, t.new, self.do_new, "Ctrl+N")
        self._action(m, t.open, self.do_open, "Ctrl+O")
        self._action(m, t.save, self.do_save, "Ctrl+S")
        m.addSeparator()
        self._action(m, t.quit, self.close, "Ctrl+Q")

        m = bar.addMenu(t.menu_edit)
        self._action(m, t.copy, self.do_copy, "Ctrl+C")
        self._action(m, t.paste, self.do_paste, "Ctrl+V")
        m.addSeparator()
        self._action(m, t.clear_all, self.do_new)

        # 입력 모드: 지금 쓰는 모드만 채워진 동그라미로 보인다.
        m = bar.addMenu(t.menu_input)
        self._mode_actions = []
        group = QActionGroup(self)
        for i in range(MODE_COUNT):
            a = self._action(m, t.mode_names[i], lambda on, i=i: on and self.set_mode(i), checkable=True)
            group.addAction(a)
            self._mode_actions.append(a)
        m.addSeparator()
        self._action(m, t.next_mode, self.cycle_mode, "F2")

        m = bar.addMenu(t.menu_config)
        sub = m.addMenu(t.theme)
        self._theme_actions = []
        group = QActionGroup(self)
        for i, name in enumerate(t.theme_names):
            a = self._action(sub, name, lambda on, i=i: on and self.set_theme(i), checkable=True)
            group.addAction(a)
            self._theme_actions.append(a)
        sub.addSeparator()
        self._action(sub, t.next_theme, self.cycle_theme, "F3")
        sub = m.addMenu(t.language)
        self._lang_actions = []
        group = QActionGroup(self)
        for code in LANGS:
            a = self._action(sub, Lang.name(code), lambda on, c=code: on and self.set_language(c), checkable=True)
            group.addAction(a)
            self._lang_actions.append(a)
        m.addSeparator()
        self._toolbar_action = self._action(m, t.show_toolbar, self._toggle_toolbar, checkable=True, checked=self.set.show_toolbar)
        self._status_action = self._action(m, t.show_status, self._toggle_status, checkable=True, checked=self.set.show_status)
        m.addSeparator()
        self._action(m, t.settings_dots, self.open_settings, "F4")

        m = bar.addMenu(t.menu_help)
        self._action(m, t.usage, self.open_help, "F1")
        self._action(m, t.about_item, self.open_about)

    # -----------------------------------------------------------------
    # 겉모습
    # -----------------------------------------------------------------

    def apply_theme(self):
        """색 · 글꼴 크기 · 언어를 지금 설정에 맞춘다."""
        self.pal = palette_at(self.set.theme)
        self.txt = strings_for(self.set.lang())

        QApplication.instance().setStyleSheet(stylesheet_for(self.pal))
        self.keypad.set_palette(self.pal)
        self.toolbar.set_palette(self.pal)
        self.toolbar.set_tips(self.txt.tips)

        f = fontmod.font(self.set.font_size)
        self.editor.setFont(f)
        self.editor.document().setDefaultFont(f)
        self.status.setStyleSheet(f"color: {self.pal.muted};")

        self.toolbar.setVisible(self.set.show_toolbar)
        self.status.setVisible(self.set.show_status)
        self.setWindowTitle(self.txt.app_title)
        self.refresh()

    def refresh(self):
        """편집칸의 글과 커서, 12키의 라벨과 색, 상태줄, 모드 표시를 한꺼번에 엔진에서 읽어 옮긴다."""
        s = self.state
        t = self.txt

        text = s.text()
        ed = self.editor
        if ed.toPlainText() != text:
            ed.blockSignals(True)
            ed.setPlainText(text)
            ed.blockSignals(False)
        cur = ed.textCursor()
        cur.setPosition(_unit_of(text, s.cursor_pos))
        ed.setTextCursor(cur)
        ed.ensureCursorVisible()

        for i, b in enumerate(self.keypad.keys):
            b.set_face(text=s.key_label(i))
            b.set_role(ui_role(s.key_role_of(i)))
        for i, b in enumerate(self.keypad.fns):
            b.set_face(text=t.fn_labels[i], icon=FN_ICONS[i])
            b.setToolTip(t.fn_hints[i])

        comp = s.composition_text() or t.status_none
        self.status.setText(
            f"{t.mode_names[s.now_mode.index]}    {t.status_composing} {comp}    {len(s)}{t.status_chars}"
        )

        # 메뉴의 동그라미를 엔진에 맞춘다. 신호를 막지 않으면 체크가 다시
        # set_mode() 를 불러 refresh() 와 서로 돌게 된다.
        for actions, at in (
            (self._mode_actions, s.now_mode.index),
            (self._theme_actions, self.set.theme),
            (self._lang_actions, LANGS.index(self.set.language)),
        ):
            for i, a in enumerate(actions):
                a.blockSignals(True)
                a.setChecked(i == at)
                a.blockSignals(False)

    def _save(self):
        try:
            self.set.save()
        except OSError:
            pass  # 설정을 못 써도 프로그램은 그대로 돌아간다

    # -----------------------------------------------------------------
    # 명령
    # -----------------------------------------------------------------

    def do_new(self):
        self.state.clear()
        self.refresh()

    def cycle_mode(self):
        self.state.cycle_mode()
        self.refresh()

    def set_mode(self, i):
        self.state.set_mode_index(i)
        self.refresh()

    def set_theme(self, i):
        self.set.theme = max(0, min(len(self.txt.theme_names) - 1, int(i)))
        self._save()
        self.apply_theme()

    def cycle_theme(self):
        self.set_theme((self.set.theme + 1) % len(self.txt.theme_names))

    def set_language(self, code):
        self.set.language = Lang.from_code(code)
        self._save()
        self._build_menus()
        self.apply_theme()

    def cycle_language(self):
        self.set_language(Lang.next(self.set.language))

    def _toggle_toolbar(self, on):
        self.set.show_toolbar = bool(on)
        self._save()
        self.toolbar.setVisible(self.set.show_toolbar)

    def _toggle_status(self, on):
        self.set.show_status = bool(on)
        self._save()
        self.status.setVisible(self.set.show_status)

    def do_copy(self):
        self.state.commit()
        QApplication.clipboard().setText(self.state.text())
        self.refresh()

    def do_paste(self):
        self.insert_text(QApplication.clipboard().text())

    def insert_text(self, text):
        if text:
            self.state.insert_str(text)
            self.refresh()

    def do_open(self):
        path, _ = QFileDialog.getOpenFileName(self, self.txt.open, "chunjiin.txt", self.txt.file_filter)
        if not path:
            return
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError as e:
            self._error(f"{self.txt.err_open}: {e}")
            return
        if data.startswith(UTF8_BOM):
            data = data[len(UTF8_BOM) :]
        text = data.decode("utf-8", errors="replace")
        # 버퍼가 담을 수 있는 만큼만 읽는다.
        self.state.set_text(text[: MAX_TEXT_LEN - 1])
        self.refresh()

    def do_save(self):
        self.state.commit()
        self.refresh()
        path, _ = QFileDialog.getSaveFileName(self, self.txt.save, "chunjiin.txt", self.txt.file_filter)
        if not path:
            return
        try:
            with open(path, "wb") as f:
                f.write(UTF8_BOM + self.state.text().encode("utf-8"))
        except OSError as e:
            self._error(f"{self.txt.err_save}: {e}")

    def _error(self, msg):
        QMessageBox.warning(self, self.txt.app_title, msg)

    # -----------------------------------------------------------------
    # 입력
    # -----------------------------------------------------------------

    def do_key(self, i):
        """키패드 키 하나를 누른 것으로 처리하고 연타 시계를 다시 잰다."""
        self.state.key(int(i))
        self.restart_tap_timer()
        self.refresh()

    def restart_tap_timer(self):
        """정해 둔 시간이 지나면 연타 순환을 끊는다. 그래야 "안녕" 을 칠 수 있다."""
        self.tap_timer.start(int(self.set.multitap_ms))

    def _break_multitap(self):
        # 조합 중인 글자는 그대로 두고 "다음 같은 키는 새 글자" 라고만 한다.
        self.state.break_multitap()
        self.refresh()

    def run_fn(self, i):
        s = self.state
        if i == FN_MODE:
            s.cycle_mode()
        elif i == FN_LEFT:
            s.move_cursor(-1)
        elif i == FN_SPACE:
            s.space()
        elif i == FN_RIGHT:
            s.move_cursor(1)
        elif i == FN_ENTER:
            s.insert_char("\n")
        elif i == FN_BACKSPACE:
            s.backspace()
        self.refresh()

    def run_tool(self, i):
        (
            self.do_new, self.do_open, self.do_save, self.do_copy, self.do_paste,
            self.do_new, self.cycle_mode, self.cycle_theme, self.cycle_language,
            self.open_settings, self.open_about,
        )[i]()

    def on_editor_click(self):
        """마우스로 찍은 자리를 엔진 커서로 되돌린다. 이때만 엔진이 입력칸을 따라간다."""
        unit = self.editor.textCursor().position()
        self.state.set_cursor(_char_of(self.state.text(), unit))
        self.refresh()

    def eventFilter(self, obj, e):
        # 창이 활성이고 팝업(메뉴)이나 대화 상자가 없을 때만 키를 가로챈다.
        if (
            e.type() == QEvent.Type.KeyPress
            and QApplication.activeWindow() is self
            and QApplication.activePopupWidget() is None
            and QApplication.activeModalWidget() is None
        ):
            if self.handle_key(e):
                return True
        return super().eventFilter(obj, e)

    def handle_key(self, e):
        """물리 키 하나를 엔진 쪽 동작으로 돌린다. 처리했으면 참이다."""
        mods = e.modifiers()
        if mods & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.AltModifier | Qt.KeyboardModifier.MetaModifier):
            return False  # 단축키는 메뉴의 QAction 이 맡는다
        key = e.key()
        s = self.state

        if s.now_mode == InputMode.HANGUL and key in HANGUL_KEYS and not (mods & Qt.KeyboardModifier.ShiftModifier):
            self.do_key(HANGUL_KEYS[key])
            return True

        table = {
            Qt.Key.Key_Space: s.space,
            Qt.Key.Key_Backspace: s.backspace,
            Qt.Key.Key_Return: lambda: s.insert_char("\n"),
            Qt.Key.Key_Enter: lambda: s.insert_char("\n"),
            Qt.Key.Key_Left: lambda: s.move_cursor(-1),
            Qt.Key.Key_Right: lambda: s.move_cursor(1),
            Qt.Key.Key_Home: lambda: s.set_cursor(0),
            Qt.Key.Key_End: lambda: s.set_cursor(len(s)),
            Qt.Key.Key_Delete: s.delete,
            Qt.Key.Key_Escape: s.commit,
        }
        fn = table.get(key)
        if fn is not None:
            fn()
            self.refresh()
            return True

        if key in (Qt.Key.Key_F1, Qt.Key.Key_F2, Qt.Key.Key_F3, Qt.Key.Key_F4):
            return False  # 메뉴 단축키가 맡는다

        # 영문·숫자·기호 모드에서는 물리 키보드로 그냥 타이핑해도 된다.
        text = e.text()
        if s.now_mode != InputMode.HANGUL and text and text >= " " and text != "\x7f":
            s.insert_str(text)
            self.refresh()
            return True
        if s.now_mode == InputMode.HANGUL and text and text.isprintable():
            return True  # 한글 모드에서는 키패드에 대응하는 키만 받는다. 나머지는 삼킨다.
        return False

    # -----------------------------------------------------------------
    # 딸린 창들
    # -----------------------------------------------------------------

    def _show(self, dialog):
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, True)
        dialog.finished.connect(lambda *_: self.editor.setFocus())
        dialog.adjustSize()
        dialog.show()
        return dialog

    def open_help(self):
        self._show(HelpDialog(self.txt, None, self))

    def open_about(self):
        self._show(AboutDialog(self.txt, VERSION, self.txt.theme_names[self.set.theme], None, self))

    def open_settings(self):
        def preview(s):
            self.set = Settings(**s.__dict__)
            self._build_menus()
            self.apply_theme()

        def done(s, ok):
            preview(s)
            if ok:
                self._save()

        self._show(SettingsDialog(self.set, self.txt, preview, done, self))

    def closeEvent(self, e):
        self.tap_timer.stop()
        QApplication.instance().removeEventFilter(self)
        super().closeEvent(e)


def run(argv=None):
    """창을 띄우고 이벤트 고리를 돈다. 창이 닫히면 돌아온다. 앱을 만드는 길은 이것 하나다."""
    fontmod.prepare()  # QApplication 을 만들기 전에
    app = QApplication.instance() or QApplication(argv if argv is not None else sys.argv)
    app.setApplicationName("chunjiin")
    app.setWindowIcon(fontmod.window_icon())
    fontmod.install()  # QApplication 을 만든 뒤에

    w = App()
    w.resize(int(WINDOW_W), int(WINDOW_H))
    w.show()
    return app.exec()


def main(argv=None):
    return run(argv)
