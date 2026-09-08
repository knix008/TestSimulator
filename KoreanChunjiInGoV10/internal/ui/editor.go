// editor.go - 편집 영역.
//
// 엔진의 버퍼가 원본이고 이 위젯은 그것을 비추기만 한다. 그래서 위젯이
// 스스로 글자를 받지 못하게 TypedRune / TypedKey / TypedShortcut 을 모두
// 가로채 엔진으로 넘긴다. C++ 판이 읽기 전용 EDIT 컨트롤을 서브클래스해서
// 하던 일과 같다.
package ui

import (
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/driver/desktop"
	"fyne.io/fyne/v2/widget"
)

// Editor 는 엔진에 매인 여러 줄 입력칸이다.
type Editor struct {
	widget.Entry

	app *App

	// swallow 는 TypedKey 가 이미 처리한 입력의 TypedRune 을 버리기 위한 것이다.
	// Fyne 은 찍히는 문자에 대해 두 가지를 모두 부르므로 한쪽만 받아야 한다.
	swallow bool

	// syncing 이 참이면 지금 화면을 엔진에서 다시 그리는 중이다.
	// 이때 일어나는 커서 변화는 엔진으로 되돌리지 않는다.
	syncing bool
}

func newEditor(app *App) *Editor {
	e := &Editor{app: app}
	e.MultiLine = true
	e.Wrapping = fyne.TextWrapWord
	e.ExtendBaseWidget(e)
	return e
}

// TypedRune 은 물리 키보드로 찍은 문자를 받는다.
// 한글 모드에서는 키패드에 대응하는 키만 TypedKey 가 처리하므로 여기서는
// 아무것도 넣지 않는다. 영문·숫자·기호 모드에서는 그대로 타이핑된다.
func (e *Editor) TypedRune(r rune) {
	if e.swallow {
		e.swallow = false
		return
	}
	e.app.typeRune(r)
}

func (e *Editor) TypedKey(k *fyne.KeyEvent) {
	if e.app.handleKey(k) {
		e.swallow = true
		return
	}
	e.swallow = false
	// 그 밖의 키는 무시한다. Entry 기본 동작(직접 편집)으로 넘기지 않는다.
}

// TypedShortcut 은 Ctrl 조합을 엔진 쪽 동작으로 돌린다.
//
// 편집 영역이 초점을 갖고 있으면 Fyne 은 단축키를 여기로 먼저 보낸다.
// 그래서 메뉴에 적어 둔 Ctrl+N / Ctrl+O / Ctrl+S 도 여기서 받아야 한다.
func (e *Editor) TypedShortcut(s fyne.Shortcut) {
	switch s.(type) {
	case *fyne.ShortcutCopy, *fyne.ShortcutCut:
		e.app.doCopy()
		return
	case *fyne.ShortcutPaste:
		e.app.doPaste()
		return
	case *fyne.ShortcutSelectAll:
		e.Entry.TypedShortcut(s)
		return
	}

	ks, ok := s.(fyne.KeyboardShortcut)
	if !ok || ks.Mod() != fyne.KeyModifierShortcutDefault {
		return
	}
	switch ks.Key() {
	case fyne.KeyN:
		e.app.doNew()
	case fyne.KeyO:
		e.app.doOpen()
	case fyne.KeyS:
		e.app.doSave()
	}
}

// MouseUp 은 마우스로 찍은 자리를 엔진 커서에 반영한다.
func (e *Editor) MouseUp(ev *desktop.MouseEvent) {
	e.Entry.MouseUp(ev)
	if !e.syncing {
		e.app.cursorFromWidget()
	}
}

// KeyDown 은 Entry 의 기본 처리를 막기 위해 비워 둔다.
func (e *Editor) KeyDown(*fyne.KeyEvent) {}

// KeyUp 은 Entry 의 기본 처리를 막기 위해 비워 둔다.
func (e *Editor) KeyUp(*fyne.KeyEvent) {}

// ---------------------------------------------------------------------
// 커서 위치 변환
//
// 엔진은 커서를 "버퍼 앞에서 몇 번째 글자" 하나로 들고 있고,
// Entry 는 (줄, 칸) 두 값으로 들고 있다. 그 사이를 옮긴다.
// ---------------------------------------------------------------------

// rowColOf 는 평평한 글자 위치를 (줄, 칸) 으로 바꾼다.
func rowColOf(text string, pos int) (int, int) {
	row, col := 0, 0
	for i, ch := range []rune(text) {
		if i >= pos {
			break
		}
		if ch == '\n' {
			row++
			col = 0
		} else {
			col++
		}
	}
	return row, col
}

// flatPosOf 는 (줄, 칸) 을 평평한 글자 위치로 바꾼다.
func flatPosOf(text string, row, col int) int {
	lines := strings.Split(text, "\n")
	if row >= len(lines) {
		row = len(lines) - 1
	}
	if row < 0 {
		row = 0
	}

	pos := 0
	for i := 0; i < row; i++ {
		pos += len([]rune(lines[i])) + 1 // 줄바꿈 한 칸
	}

	n := len([]rune(lines[row]))
	if col > n {
		col = n
	}
	if col < 0 {
		col = 0
	}
	return pos + col
}
