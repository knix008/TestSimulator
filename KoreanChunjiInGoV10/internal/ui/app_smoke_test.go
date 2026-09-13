// app_smoke_test.go - 창까지 만들어 보는 시험.
//
// KoreanChunjiinJavaV10 의 AppSmokeTest.java 에 해당한다. 엔진 시험은 화면
// 없이 오토마타만 보고, ui_test.go 는 색표·배치처럼 따로 떼어 볼 수 있는
// 것만 본다. 여기서는 실제로 창과 단추를 만들어 화면 쪽 배선을 확인한다.
//
// Java 판은 java.awt.Robot 으로 진짜 키를 눌러야 해서 화면이 없는 자리에서는
// 건너뛰었다. Go 판은 Fyne 의 시험용 드라이버(test.NewApp)를 쓰므로 화면이
// 없어도 그대로 돈다. 그래서 건너뛸 일이 없다.
//
//	go test -run TestAppSmoke -v ./internal/ui/
package ui

import (
	"strings"
	"testing"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/test"

	"github.com/knix008/chunjiin/internal/engine"
)

// keyNameOf 는 키패드 번호를 물리 키 이름으로 되돌린다.
// hangulKeyOf 의 반대이고, 사람이 치는 것과 같은 길로 넣기 위해 쓴다.
var keyNameOf = [engine.KeyCount]fyne.KeyName{
	fyne.Key1, fyne.Key2, fyne.Key3,
	fyne.Key4, fyne.Key5, fyne.Key6,
	fyne.Key7, fyne.Key8, fyne.Key9,
	fyne.KeyMinus, fyne.Key0, fyne.KeyEqual,
}

// newSmokeApp 은 창까지 만든 앱을 준비한다.
func newSmokeApp(t *testing.T) *App {
	t.Helper()

	useTempConfig(t) // 실제 사용자 설정을 건드리지 않는다

	a := newApp(test.NewApp())

	// 시작 언어를 못박는다.
	//
	// 설정 파일이 없으면 LoadSettings 가 운영체제 언어를 따라간다.
	// 그대로 두면 기계마다 시험 결과가 달라진다(한국어 기계에서는
	// 통과하고 영어 기계에서는 "Latin abc" 가 나와 실패한다).
	a.set.Language = string(LangKO)
	a.txt = T(LangKO)

	a.start()

	// 연타 시계가 시험 도중에 끼어들지 않게 아주 길게 잡는다.
	// 순환을 끊어야 하는 자리에서는 시계가 부르는 것과 같은
	// breakMultitap() 을 직접 부른다.
	a.set.MultitapMs = 60 * 60 * 1000

	t.Cleanup(func() {
		if a.tapTimer != nil {
			a.tapTimer.Stop()
		}
	})
	return a
}

// press 는 물리 키를 하나 누른다. 사람이 키보드를 치는 것과 같은 길이다.
func (a *App) press(t *testing.T, name fyne.KeyName) {
	t.Helper()
	if !a.handleKey(&fyne.KeyEvent{Name: name}) {
		t.Errorf("키 %q 가 처리되지 않았다", name)
	}
}

// typeSeq 는 엔진 시험과 같은 문법의 키 시퀀스를 화면을 통해 넣는다.
//
//	0~9 a b  키패드           |  연타 순환 끊기 (시계가 하는 일)
//	_        스페이스         <  백스페이스
//	/        줄바꿈           !  조합 확정 (Esc)
func (a *App) typeSeq(t *testing.T, seq string) {
	t.Helper()

	for _, c := range seq {
		switch {
		case c >= '0' && c <= '9':
			a.press(t, keyNameOf[c-'0'])
		case c == 'a':
			a.press(t, keyNameOf[10])
		case c == 'b':
			a.press(t, keyNameOf[11])
		case c == '_':
			a.press(t, fyne.KeySpace)
		case c == '<':
			a.press(t, fyne.KeyBackspace)
		case c == '/':
			a.press(t, fyne.KeyReturn)
		case c == '!':
			a.press(t, fyne.KeyEscape)
		case c == '|':
			// 시계가 시간이 다 되어 부르는 것과 같다.
			a.breakMultitap()
		default:
			t.Fatalf("모르는 시퀀스 글자: %q", c)
		}
	}
}

// text 는 편집칸에 실제로 보이는 글자다.
// 엔진 버퍼가 아니라 화면을 읽어서, 둘이 어긋나면 걸리게 한다.
func (a *App) text() string { return a.editor.Text }

// check 는 값을 견주고, 무엇을 보았는지 남긴다.
// 남긴 줄은 -v 로 돌릴 때 항목 옆에 나온다.
func check(t *testing.T, name, got, want string) {
	t.Helper()
	if got != want {
		t.Errorf("%s: %q, 기대: %q", name, got, want)
		return
	}
	t.Logf("%s = %s", name, quoteShort(want))
}

// quoteShort 는 값이 눈에 잘 보이게 다듬는다.
// 줄바꿈은 보이는 \n 으로 바꾸고, 빈 값은 빈칸이라고 적는다.
func quoteShort(v string) string {
	if v == "" {
		return "(빈칸)"
	}
	return strings.ReplaceAll(v, "\n", `\n`)
}

// ---------------------------------------------------------------------

func TestAppSmoke(t *testing.T) {
	a := newSmokeApp(t)

	t.Run("창이 만들어진다", func(t *testing.T) {
		if a.win == nil {
			t.Fatal("창이 없다")
		}
		if a.win.Content() == nil {
			t.Fatal("창에 내용이 없다")
		}
		if a.editor == nil || a.status == nil || a.toolbar == nil {
			t.Fatal("화면 부품이 덜 만들어졌다")
		}
		for i, b := range a.keys {
			if b == nil {
				t.Fatalf("키패드 %d 번 단추가 없다", i)
			}
		}
		for i, b := range a.fns {
			if b == nil {
				t.Fatalf("기능 %d 번 단추가 없다", i)
			}
		}
		for i, b := range a.tools {
			if b == nil {
				t.Fatalf("툴바 %d 번 단추가 없다", i)
			}
		}
	})

	t.Run("시작 상태", func(t *testing.T) {
		check(t, "모드", a.txt.ModeNames[a.state.NowMode], "한글")
		check(t, "편집칸", a.text(), "")
		if !a.set.ShowToolbar || a.toolbar.Hidden {
			t.Error("툴바가 보여야 한다")
		}
		if !a.set.ShowStatus || a.statusBox.Hidden {
			t.Error("상태줄이 보여야 한다")
		}
	})

	// 물리 키보드로 친 글자가 화면에 그대로 나오는지.
	t.Run("한글 조합", func(t *testing.T) {
		a.doClear()
		a.typeSeq(t, "77014|32|44")
		check(t, "한글", a.text(), "한글")
	})

	t.Run("아래아 표시", func(t *testing.T) {
		a.doClear()
		a.typeSeq(t, "31")
		check(t, "ㄱ·", a.text(), "ㄱㆍ")
		a.typeSeq(t, "1")
		check(t, "ㄱ‥", a.text(), "ㄱㆎ")
	})

	t.Run("겹받침 병합", func(t *testing.T) {
		a.doClear()
		a.typeSeq(t, "aa01477")
		check(t, "많", a.text(), "많")
	})

	// 키패드 단추를 눌러도 같은 결과가 나와야 한다.
	t.Run("단추 누르기", func(t *testing.T) {
		a.doClear()
		test.Tap(a.keys[3]) // ㄱ
		test.Tap(a.keys[0]) // ㅣ
		test.Tap(a.keys[1]) // ·  -> ㅏ
		check(t, "가", a.text(), "가")

		test.Tap(a.fns[fnSpace])
		test.Tap(a.keys[4]) // ㄴ
		test.Tap(a.keys[0])
		test.Tap(a.keys[1])
		check(t, "가 나", a.text(), "가 나")

		// 조합 중이면 낱자 단위로 되돌린다. 나 = ㄴ+ㅏ 이므로 ㅏ 가 ㅣ 로 간다.
		test.Tap(a.fns[fnBackspace])
		check(t, "지우기", a.text(), "가 니")
	})

	t.Run("커서와 편집", func(t *testing.T) {
		a.doClear()
		a.typeSeq(t, "301401")
		a.press(t, fyne.KeyBackspace)
		check(t, "백스페이스", a.text(), "가니")

		a.press(t, fyne.KeyHome)
		a.typeSeq(t, "701")
		check(t, "맨 앞 삽입", a.text(), "사가니")

		a.press(t, fyne.KeyEnd)
		a.press(t, fyne.KeySpace)
		a.press(t, fyne.KeyReturn)
		a.typeSeq(t, "301")
		check(t, "공백·줄바꿈", a.text(), "사가니 \n가")
	})

	t.Run("커서 자리", func(t *testing.T) {
		a.doClear()
		a.typeSeq(t, "301401")

		row, col := a.editor.CursorRow, a.editor.CursorColumn
		if want := flatPosOf(a.text(), row, col); want != a.state.CursorPos {
			t.Errorf("화면 커서 (%d,%d)=%d 인데 엔진은 %d", row, col, want, a.state.CursorPos)
		}
	})

	t.Run("모드 순환", func(t *testing.T) {
		a.doClear()
		want := []string{"영문 abc", "영문 ABC", "숫자 123", "기호 !@#", "한글"}
		for i, w := range want {
			a.press(t, fyne.KeyF2)
			check(t, "F2 "+w, a.txt.ModeNames[a.state.NowMode], w)
			_ = i
		}
	})

	// 영문 모드에서는 물리 키보드로 그냥 친다.
	t.Run("영문 직접 입력", func(t *testing.T) {
		a.doClear()
		a.press(t, fyne.KeyF2) // 영문 abc
		a.typeRune('h')
		a.typeRune('i')
		check(t, "hi", a.text(), "hi")

		a.press(t, fyne.KeyF2)
		a.press(t, fyne.KeyF2)
		a.press(t, fyne.KeyF2)
		a.press(t, fyne.KeyF2) // 한글로 돌아온다
		check(t, "모드", a.txt.ModeNames[a.state.NowMode], "한글")
	})

	t.Run("키 라벨이 모드를 따라간다", func(t *testing.T) {
		a.doClear()
		check(t, "한글 키3", a.keys[3].Label, "ㄱㅋ")

		a.press(t, fyne.KeyF2)
		check(t, "영소 키3", a.keys[3].Label, "jkl")

		a.press(t, fyne.KeyF2)
		check(t, "영대 키3", a.keys[3].Label, "JKL")

		a.press(t, fyne.KeyF2)
		a.press(t, fyne.KeyF2)
		a.press(t, fyne.KeyF2) // 한글
		check(t, "돌아옴", a.keys[3].Label, "ㄱㅋ")
	})

	t.Run("테마 한 바퀴", func(t *testing.T) {
		first := a.set.Theme
		for i := 0; i < len(Palettes); i++ {
			before := a.set.Theme
			a.press(t, fyne.KeyF3)
			if a.set.Theme == before {
				t.Fatalf("F3 를 눌렀는데 테마가 그대로다 (%d)", before)
			}
			if a.pal != &Palettes[a.set.Theme] {
				t.Error("팔레트가 설정을 따라가지 않았다")
			}
		}
		if a.set.Theme != first {
			t.Errorf("한 바퀴 뒤 테마가 %d, 기대: %d", a.set.Theme, first)
		}
	})

	t.Run("상태줄", func(t *testing.T) {
		a.doClear()
		a.typeSeq(t, "301")
		check(t, "상태줄", a.status.Text, "한글    조합 ㄱ + ㅏ + -    1자")
	})

	t.Run("복사", func(t *testing.T) {
		a.doClear()
		a.typeSeq(t, "701301401")
		a.doCopy()
		check(t, "클립보드", a.fyneApp.Clipboard().Content(), "사가나")
	})

	t.Run("붙여넣기", func(t *testing.T) {
		a.doClear()
		a.fyneApp.Clipboard().SetContent("안녕하세요")
		a.doPaste()
		check(t, "편집칸", a.text(), "안녕하세요")
	})

	t.Run("전체 지우기", func(t *testing.T) {
		a.typeSeq(t, "301")
		a.doClear()
		check(t, "빈 편집칸", a.text(), "")
		if a.state.CursorPos != 0 {
			t.Errorf("커서가 %d, 기대: 0", a.state.CursorPos)
		}
	})
}

// TestAppWindows 는 딸린 창들이 열리고 닫히는지, 닫은 뒤에도 키가 통하는지 본다.
//
// Java 판이 잡아낸 결함이 여기 있다. 대화상자를 닫으면 초점이 편집칸으로
// 돌아오지 않아 키가 통째로 무시되는 일이 있었다.
func TestAppWindows(t *testing.T) {
	a := newSmokeApp(t)

	cases := []struct {
		name string
		open func()
		win  func() fyne.Window
	}{
		{"사용법", a.showHelp, func() fyne.Window { return a.helpWin }},
		{"설정", a.openSettings, func() fyne.Window { return a.settingsWin }},
		{"프로그램 정보", a.showAbout, func() fyne.Window { return a.aboutWin }},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if c.win() != nil {
				t.Fatal("열기 전인데 이미 창이 있다")
			}

			c.open()
			w := c.win()
			if w == nil {
				t.Fatal("창이 열리지 않았다")
			}
			if w.Content() == nil {
				t.Error("창에 내용이 없다")
			}

			// 두 번 열어도 창은 하나뿐이어야 한다.
			c.open()
			if c.win() != w {
				t.Error("두 번째로 열었더니 창이 새로 생겼다")
			}

			w.Close()
			if c.win() != nil {
				t.Error("닫았는데 손잡이가 남아 있다")
			}

			// 닫은 뒤에도 키가 통해야 한다.
			a.doClear()
			a.typeSeq(t, "301")
			check(t, "닫은 뒤 입력", a.text(), "가")
		})
	}
}

// TestAppFileWindows 는 파일 열기·저장이 제 창에 뜨는지 본다.
//
// 본 창 안에 겹쳐 띄우면 좁은 본 창에 갇혀 파일 목록이 잘린다.
// 그래서 설정·정보 창과 마찬가지로 따로 띄운 창 위에 얹는다.
func TestAppFileWindows(t *testing.T) {
	a := newSmokeApp(t)

	for _, c := range []struct {
		name string
		open func()
	}{
		{"열기", a.doOpen},
		{"저장", a.doSave},
	} {
		t.Run(c.name, func(t *testing.T) {
			if a.fileWin != nil {
				t.Fatal("열기 전인데 이미 파일 창이 있다")
			}

			c.open()
			if a.fileWin == nil {
				t.Fatal("파일 창이 따로 뜨지 않았다")
			}
			if a.fileWin == a.win {
				t.Error("본 창에 얹혔다")
			}

			// 두 번 불러도 창은 하나뿐이어야 한다.
			w := a.fileWin
			c.open()
			if a.fileWin != w {
				t.Error("두 번째로 열었더니 창이 새로 생겼다")
			}

			a.fileWin.Close()
			a.fileWin = nil

			// 닫은 뒤에도 키가 통해야 한다.
			a.doClear()
			a.typeSeq(t, "301")
			check(t, "닫은 뒤 입력", a.text(), "가")
		})
	}
}

// TestAppLanguageSwitch 는 언어를 바꾸면 화면 글자가 모두 따라가는지 본다.
func TestAppLanguageSwitch(t *testing.T) {
	a := newSmokeApp(t)

	a.setLanguage(LangEN)

	check(t, "창 제목", a.txt.AppTitle, "Chunjiin Hangul Keyboard")
	check(t, "모드 단추", a.fns[fnMode].Label, "Mode")
	check(t, "스페이스 단추", a.fns[fnSpace].Label, "Space")
	check(t, "툴바 설명", a.tools[0].Tip, "New (Ctrl+N)")

	// 아이콘을 그리는 자리는 글자가 없어야 한다.
	if a.fns[fnEnter].Label != "" || a.fns[fnBackspace].Label != "" {
		t.Error("아이콘 단추에 글자가 붙었다")
	}
	if a.fns[fnEnter].Icon == nil || a.fns[fnBackspace].Icon == nil {
		t.Error("아이콘 단추에 그림이 없다")
	}

	a.doClear()
	a.typeSeq(t, "301")
	if got := a.status.Text; !strings.HasPrefix(got, "Hangul") {
		t.Errorf("상태줄이 영어가 아니다: %q", got)
	}

	a.setLanguage(LangKO)
	check(t, "되돌림", a.fns[fnMode].Label, "모드")

	// 조합 규칙은 언어와 상관없이 같아야 한다.
	a.doClear()
	a.typeSeq(t, "77014|32|44")
	check(t, "한글", a.text(), "한글")
}

// TestAppToolbarActions 는 툴바 단추를 눌러 이어진 동작이 도는지 본다.
func TestAppToolbarActions(t *testing.T) {
	a := newSmokeApp(t)

	a.doClear()
	a.typeSeq(t, "301")

	// 복사 단추 (4번째)
	test.Tap(a.tools[3])
	check(t, "복사", a.fyneApp.Clipboard().Content(), "가")

	// 전체 지우기 단추 (6번째)
	test.Tap(a.tools[5])
	check(t, "전체 지우기", a.text(), "")

	// 입력 모드 전환 단추 (7번째)
	test.Tap(a.tools[6])
	check(t, "모드", a.txt.ModeNames[a.state.NowMode], "영문 abc")

	// 테마 전환 단추 (8번째)
	before := a.set.Theme
	test.Tap(a.tools[7])
	if a.set.Theme == before {
		t.Error("테마 단추를 눌렀는데 그대로다")
	}

	// 언어 전환 단추 (9번째)
	lang := a.set.Language
	test.Tap(a.tools[8])
	if a.set.Language == lang {
		t.Error("언어 단추를 눌렀는데 그대로다")
	}
}

// TestAppTooltipLayer 는 툴팁이 마우스를 가로채지 않는지 본다.
//
// 예전에는 widget.PopUp 으로 띄웠는데, 그것이 캔버스 전체의 마우스 이벤트를
// 가로채서 버튼이 MouseOut -> 툴팁 사라짐 -> MouseIn 을 되풀이하며
// 깜빡거렸다. 그래서 툴팁을 이루는 조각이 마우스를 받지 않는지 확인한다.
func TestAppTooltipLayer(t *testing.T) {
	a := newSmokeApp(t)

	if a.tipLayer == nil {
		t.Fatal("툴팁 층이 없다")
	}

	for i, o := range a.tipLayer.Objects {
		if _, bad := o.(fyne.Tappable); bad {
			t.Errorf("툴팁 조각 %d 가 누름을 가로챈다", i)
		}
		if _, bad := o.(fyne.Focusable); bad {
			t.Errorf("툴팁 조각 %d 가 초점을 가져간다", i)
		}
	}

	// 처음에는 숨어 있어야 한다.
	if !a.tipLayer.Hidden {
		t.Error("툴팁이 처음부터 떠 있다")
	}

	a.ShowTip("저장 (Ctrl+S)", a.tools[2])
	if a.tipLayer.Hidden {
		t.Error("ShowTip 뒤에도 툴팁이 숨어 있다")
	}
	check(t, "툴팁 글", a.tipText.Text, "저장 (Ctrl+S)")

	a.HideTip()
	if !a.tipLayer.Hidden {
		t.Error("HideTip 뒤에도 툴팁이 떠 있다")
	}
}

// TestAppFileRoundTrip 은 저장할 내용과 연 내용이 같은지 본다.
// 파일 고르기 창은 띄울 수 없으므로 그 앞뒤의 변환만 확인한다.
func TestAppFileRoundTrip(t *testing.T) {
	a := newSmokeApp(t)

	a.doClear()
	a.typeSeq(t, "77014|32|44")
	a.state.Commit()

	saved := append(utf8BOM, []byte(a.state.Text())...)

	a.doClear()
	a.state.SetText(string(trimBOM(saved)))
	a.refresh()

	check(t, "열기 결과", a.text(), "한글")
}

// trimBOM 은 doOpen 이 하는 것과 같이 바이트 순서 표시를 떼어 낸다.
func trimBOM(b []byte) []byte {
	if len(b) >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF {
		return b[3:]
	}
	return b
}
