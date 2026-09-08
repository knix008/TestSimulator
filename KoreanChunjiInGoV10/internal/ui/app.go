// app.go - 데스크톱 창 조립.
//
//	메뉴 - 툴바 - 편집 영역 - 상태줄 - 천지인 키패드
//
// 엔진 버퍼가 원본이고 화면은 그것을 비춘다. 어떤 동작이든 엔진을 건드린 뒤
// refresh() 한 번을 부르면 화면 전체가 맞춰진다.
package ui

import (
	"bytes"
	"fmt"
	"io"
	"runtime"
	"strconv"
	"time"

	"fyne.io/fyne/v2"
	fyneapp "fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/driver/desktop"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/storage"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"github.com/knix008/chunjiin/assets"
	"github.com/knix008/chunjiin/internal/engine"
)

// Version 은 프로그램 판 번호다. 빌드할 때 -ldflags 로 덮어쓸 수 있다.
var Version = "1.0"

// 기능 버튼
const fnCount = 6

const (
	fnMode = iota
	fnLeft
	fnSpace
	fnRight
	fnEnter
	fnBackspace
)

// keyHeight 는 키패드 버튼 한 칸의 최소 높이다.
// 손가락으로 누르기 좋게 넉넉히 잡는다.
const keyHeight = 54

// fnIcons 는 기능 버튼에 글자 대신 그릴 그림이다. nil 이면 글자를 쓴다.
// 줄바꿈(↵)과 지우기(⌫)는 내장 글꼴에 없는 글자라 그림으로 그린다.
var fnIcons = [fnCount]fyne.Resource{
	nil, nil, nil, nil, iconEnter, iconBackspace,
}

// fnWeight 는 기능 버튼의 폭 비율이다(합 35).
var fnWeight = []int{7, 4, 10, 4, 4, 6}

// toolCount 는 툴바 버튼 수다. Strings.Tips 의 길이와 같아야 한다.
const toolCount = 11

// App 은 창 하나와 그에 매인 엔진 상태다.
type App struct {
	fyneApp fyne.App
	win     fyne.Window
	state   *engine.State
	set     Settings
	pal     *Palette
	txt     *Strings

	editor    *Editor
	editorBox *container.ThemeOverride
	status    *canvas.Text
	statusBox *fyne.Container
	keys      [engine.KeyCount]*KeyButton
	fns       [fnCount]*KeyButton
	tools     [toolCount]*IconButton
	toolbar   *fyne.Container
	root      *fyne.Container
	bg        *canvas.Rectangle

	// 툴팁은 오버레이가 아니라 화면 맨 위 층에 그린다.
	// 오버레이로 띄우면 마우스를 가로채서 깜빡거린다(iconbutton.go 참고).
	tipLayer *fyne.Container
	tipBG    *canvas.Rectangle
	tipText  *canvas.Text

	tapTimer    *time.Timer
	helpWin     fyne.Window
	settingsWin fyne.Window
	aboutWin    fyne.Window
	fileWin     fyne.Window
}

// New 는 앱을 만든다. Run 을 불러야 창이 뜬다.
func New() *App {
	return newApp(fyneapp.NewWithID("com.knix008.chunjiin"))
}

// newApp 은 쓸 Fyne 앱을 받아 상태를 꾸린다.
// 시험이 test.NewApp() 을 넣어 창 없이 화면을 만들 수 있게 나눠 두었다.
func newApp(fyneApp fyne.App) *App {
	a := &App{
		fyneApp: fyneApp,
		state:   engine.New(),
		set:     LoadSettings(),
	}
	a.pal = &Palettes[a.set.Theme]
	a.txt = T(Lang(a.set.Language))
	a.state.SetMode(engine.InputMode(a.set.StartMode))
	return a
}

// start 는 창과 그 안의 화면을 만든다. 아직 띄우지는 않는다.
func (a *App) start() {
	a.fyneApp.SetIcon(assets.Icon)
	a.win = a.fyneApp.NewWindow(a.txt.AppTitle)
	a.win.SetIcon(assets.Icon)

	a.build()
	a.applyTheme()
	a.refresh()

	a.win.Resize(fyne.NewSize(420, 760))
	a.win.SetMaster()
	a.win.CenterOnScreen()
}

// Run 은 창을 띄우고 이벤트 고리를 돈다. 창이 닫히면 돌아온다.
func (a *App) Run() {
	a.start()
	a.win.ShowAndRun()
}

// ---------------------------------------------------------------------
// 화면 만들기
// ---------------------------------------------------------------------

func (a *App) build() {
	a.bg = canvas.NewRectangle(a.pal.Wnd)

	a.editor = newEditor(a)
	a.editorBox = container.NewThemeOverride(a.editor, newTheme(*a.pal, float32(a.set.FontSize)))

	a.status = canvas.NewText("", a.pal.Muted)
	a.status.TextSize = 13
	a.status.TextStyle = fyne.TextStyle{Bold: true}
	a.status.FontSource = fontFor(true)
	a.statusBox = container.NewPadded(a.status)

	a.toolbar = a.buildToolbar()
	a.win.SetMainMenu(a.buildMenu())

	body := container.NewBorder(
		a.toolbar, nil, nil, nil,
		container.NewBorder(nil, a.statusBox, nil, nil, a.editorBox),
	)

	a.root = container.NewStack(
		a.bg,
		container.NewPadded(
			container.NewBorder(nil, a.buildKeypad(), nil, nil, body),
		),
		a.buildTipLayer(),
	)

	a.win.SetContent(a.root)
	a.win.SetCloseIntercept(func() {
		for _, sub := range []fyne.Window{a.helpWin, a.settingsWin, a.aboutWin, a.fileWin} {
			if sub != nil {
				sub.Close()
			}
		}
		a.win.Close()
	})
}

// buildToolbar 는 툴바를 만든다.
// 구분선은 두지 않고, 마지막 "프로그램 정보" 만 오른쪽 끝으로 민다.
func (a *App) buildToolbar() *fyne.Container {
	icons := [toolCount]fyne.Resource{
		theme.DocumentCreateIcon(), theme.FolderOpenIcon(), theme.DocumentSaveIcon(),
		theme.ContentCopyIcon(), theme.ContentPasteIcon(), theme.DeleteIcon(),
		theme.ViewRefreshIcon(), theme.ColorPaletteIcon(), iconLanguage,
		theme.SettingsIcon(), theme.InfoIcon(),
	}
	actions := [toolCount]func(){
		a.doNew, a.doOpen, a.doSave,
		a.doCopy, a.doPaste, a.doClear,
		a.cycleMode, a.cycleTheme, a.cycleLanguage,
		a.openSettings, a.showAbout,
	}

	items := make([]fyne.CanvasObject, 0, toolCount+1)
	for i := 0; i < toolCount; i++ {
		b := NewIconButton(icons[i], a.txt.Tips[i], a.pal, a, actions[i])
		a.tools[i] = b

		// 마지막 버튼(프로그램 정보) 앞에 늘어나는 빈칸을 두어 오른쪽에 붙인다.
		if i == toolCount-1 {
			items = append(items, layout.NewSpacer())
		}
		items = append(items, b)
	}
	return container.NewHBox(items...)
}

// buildKeypad 은 5행을 만든다. 위 4행은 3열 균등, 마지막 행은 비율이다.
func (a *App) buildKeypad() fyne.CanvasObject {
	const gap = 6

	rows := make([]fyne.CanvasObject, 0, 5)

	for r := 0; r < 4; r++ {
		cells := make([]fyne.CanvasObject, 0, 3)
		for c := 0; c < 3; c++ {
			i := r*3 + c
			key := i
			b := NewKeyButton("", RoleCons, a.pal, func() { a.doKey(key) })
			b.TextSize = 19
			b.Bold = true
			b.MinW = 40
			b.MinH = keyHeight
			b.OnHint = a.showHint
			a.keys[i] = b
			cells = append(cells, b)
		}
		rows = append(rows, container.New(newEqualRow(gap, 3), cells...))
	}

	fnActions := [fnCount]func(){
		a.cycleMode,
		func() { a.state.MoveCursor(-1); a.refresh() },
		func() { a.state.Space(); a.refresh() },
		func() { a.state.MoveCursor(1); a.refresh() },
		func() { a.state.InsertChar('\n'); a.refresh() },
		func() { a.state.Backspace(); a.refresh() },
	}

	fnCells := make([]fyne.CanvasObject, 0, fnCount)
	for i := 0; i < fnCount; i++ {
		role := RoleFn
		if i == fnMode {
			role = RolePrimary
		}
		b := NewKeyButton(a.txt.FnLabels[i], role, a.pal, fnActions[i])
		b.TextSize = 16
		b.Bold = true
		b.Icon = fnIcons[i]
		b.IconSize = 21
		b.MinW = 28
		b.MinH = keyHeight
		b.Hint = a.txt.FnHints[i]
		b.OnHint = a.showHint
		a.fns[i] = b
		fnCells = append(fnCells, b)
	}
	rows = append(rows, container.New(newWeightedRow(gap, fnWeight...), fnCells...))

	return container.NewPadded(container.New(newVGrid(gap), rows...))
}

// ctrl 은 Ctrl(맥에서는 Cmd) 조합 단축키를 만든다.
func ctrl(key fyne.KeyName) fyne.Shortcut {
	return &desktop.CustomShortcut{KeyName: key, Modifier: fyne.KeyModifierShortcutDefault}
}

// item 은 아이콘과 라벨을 함께 가진 메뉴 항목을 만든다.
// 메뉴 항목은 하나도 빠짐없이 아이콘을 갖는다.
func item(label string, icon fyne.Resource, sc fyne.Shortcut, action func()) *fyne.MenuItem {
	m := fyne.NewMenuItem(label, action)
	m.Icon = icon
	m.Shortcut = sc
	return m
}

// radioIcon 은 고른 항목에는 채운 동그라미, 나머지에는 빈 동그라미를 준다.
func radioIcon(selected bool) fyne.Resource {
	if selected {
		return theme.RadioButtonCheckedIcon()
	}
	return theme.RadioButtonIcon()
}

// eyeIcon 은 보임/숨김 상태를 나타낸다.
func eyeIcon(shown bool) fyne.Resource {
	if shown {
		return theme.VisibilityIcon()
	}
	return theme.VisibilityOffIcon()
}

func (a *App) buildMenu() *fyne.MainMenu {
	t := a.txt

	file := fyne.NewMenu(t.MenuFile,
		item(t.New, theme.DocumentCreateIcon(), ctrl(fyne.KeyN), a.doNew),
		item(t.Open, theme.FolderOpenIcon(), ctrl(fyne.KeyO), a.doOpen),
		item(t.Save, theme.DocumentSaveIcon(), ctrl(fyne.KeyS), a.doSave),
		fyne.NewMenuItemSeparator(),
		item(t.Quit, theme.LogoutIcon(), nil, func() { a.win.Close() }),
	)

	edit := fyne.NewMenu(t.MenuEdit,
		item(t.Copy, theme.ContentCopyIcon(), ctrl(fyne.KeyC), a.doCopy),
		item(t.Paste, theme.ContentPasteIcon(), ctrl(fyne.KeyV), a.doPaste),
		fyne.NewMenuItemSeparator(),
		item(t.ClearAll, theme.DeleteIcon(), nil, a.doClear),
	)

	// 입력 모드: 지금 쓰는 모드만 채워진 동그라미로 보인다.
	modeItems := make([]*fyne.MenuItem, 0, int(engine.ModeCount)+2)
	for i := 0; i < int(engine.ModeCount); i++ {
		m := engine.InputMode(i)
		modeItems = append(modeItems,
			item(t.ModeNames[i], radioIcon(m == a.state.NowMode), nil, func() {
				a.state.SetMode(m)
				a.rebuildMenu()
				a.refresh()
			}))
	}
	modeItems = append(modeItems, fyne.NewMenuItemSeparator())
	modeItems = append(modeItems, item(t.NextMode, theme.ViewRefreshIcon(), nil, a.cycleMode))
	mode := fyne.NewMenu(t.MenuInput, modeItems...)

	themeNames := ThemeNamesFor(Lang(a.set.Language))
	themeItems := make([]*fyne.MenuItem, 0, len(Palettes)+2)
	for i := range Palettes {
		n := i
		themeItems = append(themeItems,
			item(themeNames[i], radioIcon(n == a.set.Theme), nil, func() {
				a.set.Theme = n
				a.saveAndApply()
				a.rebuildMenu()
			}))
	}
	themeItems = append(themeItems, fyne.NewMenuItemSeparator())
	themeItems = append(themeItems, item(t.NextTheme, theme.ColorPaletteIcon(), nil, a.cycleTheme))

	langItems := make([]*fyne.MenuItem, 0, len(Langs))
	for _, l := range Langs {
		code := l.Code
		langItems = append(langItems,
			item(l.Name, radioIcon(string(code) == a.set.Language), nil, func() {
				a.setLanguage(code)
			}))
	}

	conf := fyne.NewMenu(t.MenuConfig,
		&fyne.MenuItem{
			Label:     t.Theme,
			Icon:      theme.ColorPaletteIcon(),
			ChildMenu: fyne.NewMenu("", themeItems...),
		},
		&fyne.MenuItem{
			Label:     t.Language,
			Icon:      theme.AccountIcon(),
			ChildMenu: fyne.NewMenu("", langItems...),
		},
		fyne.NewMenuItemSeparator(),
		item(t.ShowToolbar, eyeIcon(a.set.ShowToolbar), nil, func() {
			a.set.ShowToolbar = !a.set.ShowToolbar
			a.saveAndApply()
			a.rebuildMenu()
		}),
		item(t.ShowStatus, eyeIcon(a.set.ShowStatus), nil, func() {
			a.set.ShowStatus = !a.set.ShowStatus
			a.saveAndApply()
			a.rebuildMenu()
		}),
		fyne.NewMenuItemSeparator(),
		item(t.SettingsDots, theme.SettingsIcon(), nil, a.openSettings),
	)

	help := fyne.NewMenu(t.MenuHelp,
		item(t.Usage, theme.HelpIcon(), nil, a.showHelp),
		item(t.AboutItem, theme.InfoIcon(), nil, a.showAbout),
	)

	return fyne.NewMainMenu(file, edit, mode, conf, help)
}

// rebuildMenu 는 메뉴를 다시 만든다.
// 고른 항목 표시나 언어가 바뀌었을 때 부른다.
func (a *App) rebuildMenu() { a.win.SetMainMenu(a.buildMenu()) }

// ---------------------------------------------------------------------
// 툴팁
//
// 오버레이(widget.PopUp)로 띄우면 그것이 캔버스 전체의 마우스 이벤트를
// 가로채서, 버튼이 MouseOut -> 툴팁 사라짐 -> MouseIn 을 되풀이하며
// 깜빡거린다. 그래서 마우스를 가로채지 않는 평범한 그림 조각으로
// 화면 맨 위 층에 그린다.
// ---------------------------------------------------------------------

const (
	tipPad    = 7 // 글자와 상자 사이 여백
	tipGap    = 4 // 버튼과 툴팁 사이 틈
	tipMargin = 4 // 창 가장자리에서 띄우는 최소 거리
)

// buildTipLayer 는 툴팁을 그릴 층을 만든다.
// 배치를 두지 않으므로 자식의 자리는 우리가 직접 정한다.
func (a *App) buildTipLayer() fyne.CanvasObject {
	a.tipBG = canvas.NewRectangle(a.pal.Card)
	a.tipBG.CornerRadius = 5
	a.tipBG.StrokeWidth = 1
	a.tipBG.StrokeColor = a.pal.Border

	a.tipText = canvas.NewText("", a.pal.Role[RoleTool][ColorText])
	a.tipText.TextSize = 12
	a.tipText.TextStyle = fyne.TextStyle{Bold: true}
	a.tipText.FontSource = fontFor(true)

	a.tipLayer = container.NewWithoutLayout(a.tipBG, a.tipText)
	a.tipLayer.Hide()
	return a.tipLayer
}

// ShowTip 은 owner 바로 아래에 설명 상자를 띄운다.
func (a *App) ShowTip(text string, owner fyne.CanvasObject) {
	if a.tipLayer == nil || text == "" {
		return
	}

	a.tipText.Text = text
	a.tipText.Color = a.pal.Role[RoleTool][ColorText]
	a.tipText.Refresh()

	inner := a.tipText.MinSize()
	box := fyne.NewSize(inner.Width+tipPad*2, inner.Height+tipPad)

	// 자리를 툴팁 층 기준으로 바꾼다.
	//
	// AbsolutePositionForObject 는 캔버스 맨 위(메뉴 표시줄 포함) 기준
	// 좌표를 준다. 툴팁 층은 그보다 아래에서 시작하므로, 그 값을 그대로
	// 쓰면 메뉴 표시줄 높이만큼 아래로 밀려서 단추와 멀리 떨어진다.
	drv := fyne.CurrentApp().Driver()
	base := drv.AbsolutePositionForObject(a.tipLayer)
	at := drv.AbsolutePositionForObject(owner)
	rel := fyne.NewPos(at.X-base.X, at.Y-base.Y)

	pos := tipPosition(rel, owner.Size(), box, a.tipLayer.Size())

	a.tipBG.FillColor = a.pal.Card
	a.tipBG.StrokeColor = a.pal.Border
	a.tipBG.Move(pos)
	a.tipBG.Resize(box)
	a.tipBG.Refresh()

	a.tipText.Move(fyne.NewPos(pos.X+tipPad, pos.Y+(box.Height-inner.Height)/2))
	a.tipText.Resize(inner)

	a.tipLayer.Show()
	a.tipLayer.Refresh()
}

// HideTip 은 떠 있는 툴팁을 내린다.
func (a *App) HideTip() {
	if a.tipLayer != nil {
		a.tipLayer.Hide()
	}
}

// tipPosition 은 툴팁 상자를 놓을 자리를 고른다.
//
// 버튼 바로 아래에 왼쪽을 맞춰 놓되, 창 밖으로 나가면 안쪽으로 당긴다.
// 아래에 자리가 없으면 버튼 위에 놓는다.
func tipPosition(owner fyne.Position, ownerSize, tip, canvas fyne.Size) fyne.Position {
	x := owner.X
	if right := x + tip.Width; right > canvas.Width-tipMargin {
		x = canvas.Width - tipMargin - tip.Width
	}
	if x < tipMargin {
		x = tipMargin
	}

	y := owner.Y + ownerSize.Height + tipGap
	if y+tip.Height > canvas.Height-tipMargin {
		y = owner.Y - tipGap - tip.Height
	}
	if y < tipMargin {
		y = tipMargin
	}
	return fyne.NewPos(x, y)
}

// ---------------------------------------------------------------------
// 화면 갱신
// ---------------------------------------------------------------------

// refresh 는 엔진 상태를 화면 전체에 반영한다.
func (a *App) refresh() {
	text := a.state.Text()

	a.editor.syncing = true
	if a.editor.Text != text {
		a.editor.SetText(text)
	}
	a.editor.CursorRow, a.editor.CursorColumn = rowColOf(text, a.state.CursorPos)
	a.editor.Refresh()
	a.editor.syncing = false

	a.status.Text = a.statusText()
	a.status.Color = a.pal.Muted
	a.status.Refresh()

	for i := 0; i < engine.KeyCount; i++ {
		a.keys[i].SetLabel(a.state.KeyLabel(i))
		a.keys[i].SetRole(uiRole(a.state.KeyRoleOf(i)))
	}

	a.focusEditor()
}

// focusEditor 는 편집 영역에 초점을 되돌린다.
//
// 키패드 버튼은 초점을 받지 않는 위젯이라, 누르면 Fyne 이 편집 영역의 초점을
// 풀어 버린다. 그러면 깜박이는 커서가 사라져서 어디에 글자가 들어갈지 알 수
// 없다. 그래서 무엇을 하든 끝에 초점을 도로 가져온다.
//
// 대화 상자가 떠 있을 때는 건드리지 않는다. 그 창의 입력칸에서 초점을
// 빼앗으면 안 되기 때문이다.
func (a *App) focusEditor() {
	if a.win == nil {
		return
	}
	c := a.win.Canvas()
	if c == nil || len(c.Overlays().List()) > 0 {
		return
	}
	if c.Focused() != a.editor {
		c.Focus(a.editor)
	}
}

// statusText 는 상태줄 한 줄이다. "한글    조합 ㄱ + ㅏ + -    3자" 꼴.
func (a *App) statusText() string {
	comp := a.state.CompositionText()
	if comp == "" {
		comp = a.txt.StatusNone
	}
	return a.txt.ModeNames[a.state.NowMode] + "    " +
		a.txt.StatusComposing + " " + comp + "    " +
		strconv.Itoa(a.state.Len()) + a.txt.StatusChars
}

// uiRole 은 엔진이 알려 준 키 역할을 화면 역할로 바꾼다.
func uiRole(r engine.KeyRole) BtnRole {
	switch r {
	case engine.RoleVowel:
		return RoleVowel
	case engine.RoleMod:
		return RoleMod
	default:
		return RoleCons
	}
}

// showHint 는 버튼에 마우스를 올렸을 때 상태줄에 설명을 띄운다.
// 빈 문자열이면 원래 상태줄로 되돌린다.
func (a *App) showHint(hint string) {
	if hint == "" {
		a.status.Text = a.statusText()
	} else {
		a.status.Text = hint
	}
	a.status.Refresh()
}

// cursorFromWidget 은 마우스로 찍은 자리를 엔진 커서에 반영한다.
func (a *App) cursorFromWidget() {
	pos := flatPosOf(a.editor.Text, a.editor.CursorRow, a.editor.CursorColumn)
	a.state.SetCursor(pos)
	a.refresh()
}

// ---------------------------------------------------------------------
// 입력
// ---------------------------------------------------------------------

// doKey 는 키패드 키 하나를 누른 것으로 처리한다.
func (a *App) doKey(i int) {
	a.state.Key(i)
	a.refresh()
	a.restartTapTimer()
}

// restartTapTimer 는 연타 순환 시간을 다시 잰다.
// 정해 둔 시간이 지나면 같은 키를 다시 눌러도 순환하지 않고 새 글자가 된다.
func (a *App) restartTapTimer() {
	if a.tapTimer != nil {
		a.tapTimer.Stop()
	}
	a.tapTimer = time.AfterFunc(time.Duration(a.set.MultitapMs)*time.Millisecond, func() {
		fyne.Do(a.breakMultitap)
	})
}

// breakMultitap 은 연타 순환을 끊는다. 시간이 다 되면 시계가 이것을 부른다.
// 조합 중인 글자는 그대로 두고 "다음 같은 키는 새 글자" 라고만 표시한다.
func (a *App) breakMultitap() {
	a.state.BreakMultitap()
	a.refresh()
}

// typeRune 은 물리 키보드로 찍은 문자를 넣는다.
// 한글 모드에서는 키패드 대응 키만 받으므로 여기로 오지 않는다.
func (a *App) typeRune(r rune) {
	if a.state.NowMode == engine.ModeHangul {
		return
	}
	if r < 32 || r == 127 {
		return
	}
	a.state.InsertChar(r)
	a.refresh()
}

// hangulKeyOf 는 한글 모드에서 숫자열을 키패드에 대응시킨다. 없으면 -1.
//
//	1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
//	4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !
func hangulKeyOf(name fyne.KeyName) int {
	switch name {
	case fyne.Key1:
		return 0
	case fyne.Key2:
		return 1
	case fyne.Key3:
		return 2
	case fyne.Key4:
		return 3
	case fyne.Key5:
		return 4
	case fyne.Key6:
		return 5
	case fyne.Key7:
		return 6
	case fyne.Key8:
		return 7
	case fyne.Key9:
		return 8
	case fyne.KeyMinus:
		return 9
	case fyne.Key0:
		return 10
	case fyne.KeyEqual:
		return 11
	}
	return -1
}

// handleKey 는 물리 키를 처리한다. 처리했으면 true 를 준다.
func (a *App) handleKey(k *fyne.KeyEvent) bool {
	if a.state.NowMode == engine.ModeHangul {
		if key := hangulKeyOf(k.Name); key >= 0 {
			a.doKey(key)
			return true
		}
	}

	switch k.Name {
	case fyne.KeySpace:
		a.state.Space()
	case fyne.KeyBackspace:
		a.state.Backspace()
	case fyne.KeyReturn, fyne.KeyEnter:
		a.state.InsertChar('\n')
	case fyne.KeyLeft:
		a.state.MoveCursor(-1)
	case fyne.KeyRight:
		a.state.MoveCursor(1)
	case fyne.KeyHome:
		a.state.SetCursor(0)
	case fyne.KeyEnd:
		a.state.SetCursor(a.state.Len())
	case fyne.KeyDelete:
		a.state.Delete()
	case fyne.KeyEscape:
		a.state.Commit()
	case fyne.KeyF1:
		a.showHelp()
		return true
	case fyne.KeyF2:
		a.cycleMode()
		return true
	case fyne.KeyF3:
		a.cycleTheme()
		return true
	case fyne.KeyF4:
		a.openSettings()
		return true
	default:
		return false
	}

	a.refresh()
	return true
}

// ---------------------------------------------------------------------
// 명령
// ---------------------------------------------------------------------

func (a *App) doNew() {
	a.state.Clear()
	a.refresh()
}

func (a *App) doClear() {
	a.state.Clear()
	a.refresh()
}

func (a *App) cycleMode() {
	a.state.CycleMode()
	a.rebuildMenu()
	a.refresh()
}

func (a *App) cycleTheme() {
	a.set.Theme = (a.set.Theme + 1) % len(Palettes)
	a.saveAndApply()
	a.rebuildMenu()
}

// cycleLanguage 는 다음 언어로 넘어간다. 툴바의 지구본 단추가 부른다.
func (a *App) cycleLanguage() {
	at := 0
	for i, l := range Langs {
		if string(l.Code) == a.set.Language {
			at = i
		}
	}
	a.setLanguage(Langs[(at+1)%len(Langs)].Code)
}

func (a *App) doCopy() {
	a.state.Commit()
	a.fyneApp.Clipboard().SetContent(a.state.Text())
	a.refresh()
}

func (a *App) doPaste() {
	a.state.InsertString(a.fyneApp.Clipboard().Content())
	a.refresh()
}

// utf8BOM 은 C++ 판이 저장할 때 붙이던 바이트 순서 표시다.
// 메모장이 UTF-8 로 알아보게 하려고 그대로 붙인다.
var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

// fileWindow 는 파일 고르기 창을 담을 빈 창을 만든다.
//
// dialog.ShowFileOpen 은 넘겨준 창 안에 겹쳐 뜬다. 본 창에 얹으면
// 좁은 본 창에 갇혀 목록이 잘리므로, 설정·정보 창과 마찬가지로
// 따로 띄운 창 위에 얹는다.
func (a *App) fileWindow(title string) fyne.Window {
	w := a.fyneApp.NewWindow(title)
	w.SetIcon(assets.Icon)
	w.SetContent(container.NewStack(canvas.NewRectangle(a.pal.Wnd)))
	w.Resize(fyne.NewSize(780, 560))
	w.CenterOnScreen()
	w.Show()
	w.RequestFocus()
	return w
}

func (a *App) doOpen() {
	if a.fileWin != nil {
		a.fileWin.RequestFocus()
		return
	}

	host := a.fileWindow(a.txt.Open)
	a.fileWin = host

	done := func() {
		if a.fileWin == nil {
			return // 이미 치웠다
		}
		a.fileWin = nil
		host.Close()
		a.focusEditor()
	}

	d := dialog.NewFileOpen(func(r fyne.URIReadCloser, err error) {
		defer done()
		if err != nil || r == nil {
			return
		}
		defer r.Close()

		data, err := io.ReadAll(io.LimitReader(r, engine.MaxTextLen*4))
		if err != nil {
			a.showError(a.txt.ErrOpen, err)
			return
		}
		a.state.SetText(string(bytes.TrimPrefix(data, utf8BOM)))
		a.refresh()
	}, host)

	d.SetFilter(textFilter)
	host.SetCloseIntercept(done)

	// Resize 는 Show 뒤에 부른다. FileDialog 는 Show 할 때 속을 만들기
	// 때문에, 그 전에 크기를 물으면 없는 것을 건드려 죽는다.
	d.Show()
	d.Resize(fyne.NewSize(740, 500))
}

func (a *App) doSave() {
	a.state.Commit()
	a.refresh()

	if a.fileWin != nil {
		a.fileWin.RequestFocus()
		return
	}

	host := a.fileWindow(a.txt.Save)
	a.fileWin = host

	done := func() {
		if a.fileWin == nil {
			return // 이미 치웠다
		}
		a.fileWin = nil
		host.Close()
		a.focusEditor()
	}

	d := dialog.NewFileSave(func(w fyne.URIWriteCloser, err error) {
		defer done()
		if err != nil || w == nil {
			return
		}
		defer w.Close()

		if _, err := w.Write(append(utf8BOM, []byte(a.state.Text())...)); err != nil {
			a.showError(a.txt.ErrSave, err)
		}
	}, host)

	d.SetFilter(textFilter)
	d.SetFileName("chunjiin.txt")
	host.SetCloseIntercept(done)

	// Resize 는 Show 뒤에 부른다(doOpen 의 설명을 보라).
	d.Show()
	d.Resize(fyne.NewSize(740, 500))
}

// textFilter 는 파일 고르기 창에서 텍스트 파일만 보이게 한다.
var textFilter = storage.NewExtensionFileFilter([]string{".txt"})

// showError 는 잘못된 일을 본 창 위에 알린다.
func (a *App) showError(what string, err error) {
	dialog.ShowError(fmt.Errorf("%s: %w", what, err), a.win)
}

// ---------------------------------------------------------------------
// 테마 · 언어 · 설정
// ---------------------------------------------------------------------

// setLanguage 는 화면 언어를 바꾸고 모든 글자를 새로 붙인다.
func (a *App) setLanguage(l Lang) {
	a.set.Language = string(l)
	a.txt = T(l)

	a.win.SetTitle(a.txt.AppTitle)
	for i := 0; i < fnCount; i++ {
		if fnIcons[i] == nil {
			a.fns[i].SetLabel(a.txt.FnLabels[i])
		}
		a.fns[i].Hint = a.txt.FnHints[i]
	}
	for i := 0; i < toolCount; i++ {
		a.tools[i].SetTip(a.txt.Tips[i])
	}
	if a.helpWin != nil {
		a.helpWin.Close()
	}

	a.rebuildMenu()
	a.saveAndApply()
}

// saveAndApply 는 바뀐 설정을 저장하고 화면에 적용한다.
func (a *App) saveAndApply() {
	_ = a.set.Save()
	a.applyTheme()
}

// applyTheme 은 색 · 글꼴 · 툴바와 상태줄 표시를 지금 설정에 맞춘다.
func (a *App) applyTheme() {
	a.pal = &Palettes[a.set.Theme]

	a.fyneApp.Settings().SetTheme(newTheme(*a.pal, 14))
	a.editorBox.Theme = newTheme(*a.pal, float32(a.set.FontSize))

	a.bg.FillColor = a.pal.Wnd
	a.bg.Refresh()

	for _, b := range a.keys {
		if b != nil {
			b.SetPalette(a.pal)
		}
	}
	for _, b := range a.fns {
		if b != nil {
			b.SetPalette(a.pal)
		}
	}
	for _, b := range a.tools {
		if b != nil {
			b.SetPalette(a.pal)
		}
	}

	if a.tipBG != nil {
		a.tipBG.FillColor = a.pal.Card
		a.tipBG.StrokeColor = a.pal.Border
		a.tipText.Color = a.pal.Role[RoleTool][ColorText]
	}
	a.HideTip()

	if a.set.ShowToolbar {
		a.toolbar.Show()
	} else {
		a.toolbar.Hide()
	}
	if a.set.ShowStatus {
		a.statusBox.Show()
	} else {
		a.statusBox.Hide()
	}

	a.editorBox.Refresh()
	a.root.Refresh()
	a.refresh()
}

// dialogHeader 는 창 안쪽 맨 위에 놓는 "아이콘 + 제목" 줄이다.
//
// 제목 표시줄에도 아이콘과 제목이 함께 나오지만, 운영체제마다 제목
// 표시줄 모양이 다르므로 창 안에도 한 줄을 둔다.
func dialogHeader(icon fyne.Resource, title string) fyne.CanvasObject {
	img := canvas.NewImageFromResource(theme.NewThemedResource(icon))
	img.FillMode = canvas.ImageFillContain
	img.SetMinSize(fyne.NewSize(22, 22))

	label := widget.NewLabelWithStyle(title, fyne.TextAlignLeading,
		fyne.TextStyle{Bold: true})

	return container.NewVBox(
		container.NewHBox(img, label),
		widget.NewSeparator(),
	)
}

// openSettings 는 설정 창을 연다.
//
// 대화 상자가 아니라 독립된 창이다. C++ 판도 그랬다. 그래야 제목
// 표시줄에 아이콘과 제목이 함께 나오고, 본문이 잘리거나 스크롤이
// 생기지 않을 만큼 높이를 넉넉히 줄 수 있다.
//
// 고르는 즉시 적용해서 미리 보여 주고, 취소하면 열기 전으로 되돌린다.
func (a *App) openSettings() {
	if a.settingsWin != nil {
		a.settingsWin.RequestFocus()
		return
	}

	backup := a.set
	t := a.txt

	themeSel := widget.NewSelect(ThemeNamesFor(Lang(a.set.Language)), nil)
	themeSel.OnChanged = func(string) {
		a.set.Theme = themeSel.SelectedIndex()
		a.applyTheme()
	}
	themeSel.SetSelectedIndex(a.set.Theme)

	fontSel := widget.NewSelect(unitLabels(FontChoices, Defaults.FontSize, t.UnitPx, t.MarkDefault), nil)
	fontSel.OnChanged = func(string) {
		a.set.FontSize = FontChoices[fontSel.SelectedIndex()]
		a.applyTheme()
	}
	fontSel.SetSelectedIndex(indexIn(FontChoices, a.set.FontSize))

	tapSel := widget.NewSelect(tapLabels(t), nil)
	tapSel.OnChanged = func(string) { a.set.MultitapMs = TapChoices[tapSel.SelectedIndex()] }
	tapSel.SetSelectedIndex(indexIn(TapChoices, a.set.MultitapMs))

	modeSel := widget.NewSelect(t.ModeNames[:], nil)
	modeSel.OnChanged = func(string) { a.set.StartMode = modeSel.SelectedIndex() }
	modeSel.SetSelectedIndex(a.set.StartMode)

	langNames := make([]string, len(Langs))
	langAt := 0
	for i, l := range Langs {
		langNames[i] = l.Name
		if string(l.Code) == a.set.Language {
			langAt = i
		}
	}
	langSel := widget.NewSelect(langNames, nil)
	langSel.OnChanged = func(string) { a.setLanguage(Langs[langSel.SelectedIndex()].Code) }
	langSel.SetSelectedIndex(langAt)

	toolbarChk := widget.NewCheck(t.ShowToolbar, func(v bool) {
		a.set.ShowToolbar = v
		a.applyTheme()
	})
	toolbarChk.SetChecked(a.set.ShowToolbar)

	statusChk := widget.NewCheck(t.ShowStatus, func(v bool) {
		a.set.ShowStatus = v
		a.applyTheme()
	})
	statusChk.SetChecked(a.set.ShowStatus)

	// widget.Form 은 이름 칸의 폭을 가장 긴 이름에 맞춰 잡고 값 칸을
	// 나머지 폭에 채운다. 그래서 좌우로도 상하로도 줄이 맞는다.
	form := widget.NewForm(
		widget.NewFormItem(t.SetTheme, themeSel),
		widget.NewFormItem(t.SetLanguage, langSel),
		widget.NewFormItem(t.SetFontSize, fontSel),
		widget.NewFormItem(t.SetTapTime, tapSel),
		widget.NewFormItem(t.SetStartMode, modeSel),
		widget.NewFormItem("", toolbarChk),
		widget.NewFormItem("", statusChk),
	)

	w := a.fyneApp.NewWindow(t.SetTitle)
	w.SetIcon(assets.Icon)

	close := func(save bool) {
		if save {
			_ = a.set.Save()
		} else {
			a.set = backup
			a.txt = T(Lang(a.set.Language))
			a.applyTheme()
			a.rebuildMenu()
		}
		w.Close()
	}

	reset := widget.NewButton(t.SetDefault, func() {
		lang := a.set.Language // 언어는 기본값 단추로 되돌리지 않는다
		a.set = Defaults
		a.set.Language = lang
		a.applyTheme()

		themeSel.SetSelectedIndex(a.set.Theme)
		fontSel.SetSelectedIndex(indexIn(FontChoices, a.set.FontSize))
		tapSel.SetSelectedIndex(indexIn(TapChoices, a.set.MultitapMs))
		modeSel.SetSelectedIndex(a.set.StartMode)
		toolbarChk.SetChecked(a.set.ShowToolbar)
		statusChk.SetChecked(a.set.ShowStatus)
	})

	cancel := widget.NewButton(t.SetCancel, func() { close(false) })

	ok := widget.NewButton(t.SetOK, func() { close(true) })
	ok.Importance = widget.HighImportance

	buttons := container.NewHBox(reset, layout.NewSpacer(), cancel, ok)

	w.SetContent(container.NewPadded(container.NewBorder(
		dialogHeader(theme.SettingsIcon(), t.SetTitle),
		container.NewVBox(widget.NewSeparator(), buttons),
		nil, nil,
		container.NewVBox(form),
	)))

	// 창을 닫는 x 단추는 "취소" 와 같게 다룬다.
	w.SetCloseIntercept(func() { close(false) })
	w.SetOnClosed(func() {
		a.settingsWin = nil
		a.focusEditor()
	})

	w.Resize(fyne.NewSize(440, 470))
	w.CenterOnScreen()

	a.settingsWin = w
	w.Show()
	w.RequestFocus() // 본 창 뒤에 가려지지 않게 앞으로 가져온다
}

func indexIn(list []int, v int) int {
	for i, x := range list {
		if x == v {
			return i
		}
	}
	return 0
}

// unitLabels 는 "21 px  (기본)" 같은 목록을 만든다.
func unitLabels(list []int, def int, unit, mark string) []string {
	out := make([]string, len(list))
	for i, v := range list {
		out[i] = fmt.Sprintf("%d %s", v, unit)
		if v == def {
			out[i] += "  " + mark
		}
	}
	return out
}

func tapLabels(t *Strings) []string {
	out := make([]string, len(TapChoices))
	for i, v := range TapChoices {
		out[i] = fmt.Sprintf("%.1f %s", float64(v)/1000, t.UnitSec)
		if v == Defaults.MultitapMs {
			out[i] += "  " + t.MarkDefault
		}
	}
	return out
}

// ---------------------------------------------------------------------
// 도움말 · 정보
// ---------------------------------------------------------------------

func (a *App) showHelp() {
	if a.helpWin != nil {
		a.helpWin.RequestFocus()
		return
	}

	w := a.fyneApp.NewWindow(a.txt.HelpTitle)
	w.SetIcon(assets.Icon)

	body := widget.NewLabel(a.txt.Help)
	w.SetContent(container.NewScroll(container.NewPadded(body)))
	w.Resize(fyne.NewSize(640, 660))
	w.SetOnClosed(func() {
		a.helpWin = nil
		a.focusEditor()
	})

	a.helpWin = w
	w.Show()
	w.RequestFocus() // 본 창 뒤에 가려지지 않게 앞으로 가져온다
}

func (a *App) showAbout() {
	if a.aboutWin != nil {
		a.aboutWin.RequestFocus()
		return
	}

	t := a.txt
	themeNames := ThemeNamesFor(Lang(a.set.Language))

	head := widget.NewLabelWithStyle(t.AppTitle+"   "+Version,
		fyne.TextAlignLeading, fyne.TextStyle{Bold: true})

	intro := widget.NewLabel(t.AboutBody)
	intro.Wrapping = fyne.TextWrapWord

	// 값이 길면 줄을 접는다. 창이 좁아도 옆으로 삐져나가지 않는다.
	value := func(s string) *widget.Label {
		l := widget.NewLabel(s)
		l.Wrapping = fyne.TextWrapWord
		return l
	}

	form := widget.NewForm(
		widget.NewFormItem(t.AboutAuthor, value("SHKWON  (knix008@naver.com)")),
		widget.NewFormItem(t.AboutEngine, value("KoreanChunJiInC++ : chunjiin.c / input.c")),
		widget.NewFormItem(t.AboutBuild,
			value(runtime.Version()+"  ·  "+runtime.GOOS+"/"+runtime.GOARCH)),
		widget.NewFormItem(t.AboutFont, value("Noto Sans KR (SIL OFL 1.1)")),
		widget.NewFormItem(t.AboutTheme, value(themeNames[a.set.Theme])),
		widget.NewFormItem(t.AboutSettings, value(SettingsLocation())),
	)

	w := a.fyneApp.NewWindow(t.AboutTitle)
	w.SetIcon(assets.Icon)

	closeBtn := widget.NewButton(t.Close, func() { w.Close() })
	closeBtn.Importance = widget.HighImportance

	w.SetContent(container.NewPadded(container.NewBorder(
		dialogHeader(theme.InfoIcon(), t.AboutTitle),
		container.NewVBox(widget.NewSeparator(),
			container.NewHBox(layout.NewSpacer(), closeBtn)),
		nil, nil,
		container.NewVBox(head, intro, form),
	)))

	w.SetOnClosed(func() {
		a.aboutWin = nil
		a.focusEditor()
	})

	w.Resize(fyne.NewSize(470, 470))
	w.CenterOnScreen()

	a.aboutWin = w
	w.Show()
	w.RequestFocus() // 본 창 뒤에 가려지지 않게 앞으로 가져온다
}

// ---------------------------------------------------------------------
// 작은 배치들
// ---------------------------------------------------------------------

// vGrid 는 자식들을 세로로 균등하게 나눈다(키패드 5행).
type vGrid struct{ gap float32 }

func newVGrid(gap float32) fyne.Layout { return &vGrid{gap: gap} }

func (l *vGrid) Layout(objects []fyne.CanvasObject, size fyne.Size) {
	n := len(objects)
	if n == 0 {
		return
	}
	span := size.Height - l.gap*float32(n-1)
	if span < 0 {
		span = 0
	}
	for i, o := range objects {
		y0 := l.gap*float32(i) + span*float32(i)/float32(n)
		y1 := l.gap*float32(i) + span*float32(i+1)/float32(n)
		o.Move(fyne.NewPos(0, y0))
		o.Resize(fyne.NewSize(size.Width, y1-y0))
	}
}

func (l *vGrid) MinSize(objects []fyne.CanvasObject) fyne.Size {
	var w, h float32
	for _, o := range objects {
		m := o.MinSize()
		if m.Width > w {
			w = m.Width
		}
		if m.Height > h {
			h = m.Height
		}
	}
	return fyne.NewSize(w, h*float32(len(objects))+l.gap*float32(len(objects)-1))
}
