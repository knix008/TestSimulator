// ui_test.go - 화면 계층 시험.
//
// 창을 띄우지 않고 확인할 수 있는 것만 본다. 색표, 설정 저장, 배치 계산,
// 커서 위치 변환, 물리 키 대응처럼 표로 정리되는 것들이다.
package ui

import (
	"bytes"
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"golang.org/x/image/font/sfnt"

	"github.com/knix008/chunjiin/assets"
	"github.com/knix008/chunjiin/internal/engine"
)

// ---------------------------------------------------------------------
// 테마
// ---------------------------------------------------------------------

func TestHex(t *testing.T) {
	cases := []struct {
		in      string
		r, g, b uint8
	}{
		{"000000", 0x00, 0x00, 0x00},
		{"FFFFFF", 0xFF, 0xFF, 0xFF},
		{"3F62E8", 0x3F, 0x62, 0xE8},
		{"f6f7fa", 0xF6, 0xF7, 0xFA},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			r, g, b, a := hex(c.in).RGBA()
			gotR, gotG, gotB, gotA := uint8(r>>8), uint8(g>>8), uint8(b>>8), uint8(a>>8)
			if gotR != c.r || gotG != c.g || gotB != c.b || gotA != 0xFF {
				t.Errorf("hex(%q) = %02X%02X%02X alpha %02X, 기대: %02X%02X%02X alpha FF",
					c.in, gotR, gotG, gotB, gotA, c.r, c.g, c.b)
			}
		})
	}
}

// TestPalettes 는 테마 4종이 빠짐없이 채워져 있는지 본다.
// 색을 한 칸이라도 빠뜨리면 그 자리가 nil 이 되어 그릴 때 죽는다.
func TestPalettes(t *testing.T) {
	if len(Palettes) != 4 {
		t.Fatalf("테마가 %d 종, 기대: 4 종", len(Palettes))
	}

	wantNames := []string{"라이트", "다크", "세피아", "고대비"}
	for i, p := range Palettes {
		t.Run(p.Name, func(t *testing.T) {
			if p.Name != wantNames[i] {
				t.Errorf("이름 %q, 기대: %q", p.Name, wantNames[i])
			}
			for _, c := range []struct {
				name string
				col  interface{}
			}{
				{"Wnd", p.Wnd}, {"Card", p.Card}, {"Border", p.Border},
				{"Text", p.Text}, {"Muted", p.Muted},
			} {
				if c.col == nil {
					t.Errorf("%s 색이 비었다", c.name)
				}
			}
			for role := BtnRole(0); role < RoleCount; role++ {
				for slot := 0; slot < 5; slot++ {
					if p.Role[role][slot] == nil {
						t.Errorf("역할 %d 의 %d 번째 색이 비었다", role, slot)
					}
				}
			}
		})
	}
}

func TestThemeNames(t *testing.T) {
	names := ThemeNames()
	if len(names) != len(Palettes) {
		t.Fatalf("이름 %d 개, 테마 %d 종", len(names), len(Palettes))
	}
	for i, n := range names {
		if n != Palettes[i].Name {
			t.Errorf("%d 번째 이름 %q, 기대: %q", i, n, Palettes[i].Name)
		}
	}
}

// TestThemeColors 는 Fyne 테마가 어떤 색 이름에도 nil 을 주지 않는지 본다.
func TestThemeColors(t *testing.T) {
	names := []fyne.ThemeColorName{
		"background", "foreground", "button", "disabled", "placeholder",
		"primary", "hover", "pressed", "focus", "selection", "shadow",
		"scrollbar", "separator", "inputBackground", "inputBorder",
		"menuBackground", "overlayBackground", "error", "success", "warning",
	}
	for _, p := range Palettes {
		th := newTheme(p, 14)
		for _, n := range names {
			if th.Color(n, 0) == nil {
				t.Errorf("%s 테마의 %q 색이 nil", p.Name, n)
			}
		}
		if th.Font(fyne.TextStyle{}) == nil {
			t.Errorf("%s 테마의 글꼴이 nil", p.Name)
		}
		if th.Size("text") != 14 {
			t.Errorf("%s 테마의 글자 크기 %v, 기대: 14", p.Name, th.Size("text"))
		}
	}
}

// ---------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------

// useTempConfig 는 설정 파일이 시험 중에만 임시 폴더로 가게 한다.
// 실제 사용자 설정을 건드리면 안 되므로 경로 함수를 통째로 갈아 끼운다.
func useTempConfig(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	saved := settingsPath
	settingsPath = func() (string, error) {
		return filepath.Join(dir, "Chunjiin", "settings.json"), nil
	}
	t.Cleanup(func() { settingsPath = saved })
	return dir
}

func TestSettingsRoundTrip(t *testing.T) {
	useTempConfig(t)

	want := Settings{
		Theme:       2,
		FontSize:    28,
		MultitapMs:  1500,
		StartMode:   int(engine.ModeSpecial),
		ShowToolbar: false,
		ShowStatus:  true,
		Language:    string(LangEN),
	}
	if err := want.Save(); err != nil {
		t.Fatalf("저장 실패: %v", err)
	}

	got := LoadSettings()
	if got != want {
		t.Errorf("읽은 설정 %+v, 기대: %+v", got, want)
	}
}

// TestSettingsMissingFile 은 파일이 없을 때 기본값이 오는지 본다.
// 언어만은 운영체제 설정을 따르므로 따로 비교한다.
func TestSettingsMissingFile(t *testing.T) {
	useTempConfig(t)

	want := Defaults
	want.Language = string(DetectLang())
	if got := LoadSettings(); got != want {
		t.Errorf("파일이 없을 때 %+v, 기대: %+v", got, want)
	}
}

func TestSettingsBrokenFile(t *testing.T) {
	useTempConfig(t)

	path, err := settingsPath()
	if err != nil {
		t.Fatalf("경로를 얻지 못했다: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{ 이건 JSON 이 아니다"), 0o644); err != nil {
		t.Fatal(err)
	}

	want := Defaults
	want.Language = string(DetectLang())
	if got := LoadSettings(); got != want {
		t.Errorf("깨진 파일에서 %+v, 기대: %+v", got, want)
	}
}

// TestSettingsNormalize 는 범위를 벗어난 값이 다듬어지는지 본다.
// 사람이 손으로 고친 설정 파일이 프로그램을 죽이면 안 된다.
func TestSettingsNormalize(t *testing.T) {
	cases := []struct {
		name string
		in   Settings
		want Settings
	}{
		{
			"너무 큰 값",
			Settings{Theme: 99, FontSize: 999, MultitapMs: 99999, StartMode: 99},
			Settings{Theme: len(Palettes) - 1, FontSize: 32, MultitapMs: 2000,
				StartMode: int(engine.ModeCount) - 1, Language: string(LangKO)},
		},
		{
			"음수",
			Settings{Theme: -5, FontSize: -1, MultitapMs: -1, StartMode: -3},
			Settings{Theme: 0, FontSize: 16, MultitapMs: 400, StartMode: 0,
				Language: string(LangKO)},
		},
		{
			"모르는 언어",
			Settings{Theme: 0, FontSize: 21, MultitapMs: 800, StartMode: 0, Language: "fr"},
			Settings{Theme: 0, FontSize: 21, MultitapMs: 800, StartMode: 0,
				Language: string(LangKO)},
		},
		{
			"영어는 그대로",
			Settings{Theme: 0, FontSize: 21, MultitapMs: 800, StartMode: 0, Language: "en"},
			Settings{Theme: 0, FontSize: 21, MultitapMs: 800, StartMode: 0,
				Language: string(LangEN)},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := c.in
			got.normalize()
			if got != c.want {
				t.Errorf("normalize -> %+v, 기대: %+v", got, c.want)
			}
		})
	}
}

// TestSettingsChoices 는 기본값이 고를 수 있는 목록 안에 있는지 본다.
// 목록에 없는 기본값을 두면 설정 창이 엉뚱한 항목을 고른 채로 열린다.
func TestSettingsChoices(t *testing.T) {
	if indexIn(FontChoices, Defaults.FontSize) == 0 && FontChoices[0] != Defaults.FontSize {
		t.Errorf("기본 글꼴 크기 %d 가 목록 %v 에 없다", Defaults.FontSize, FontChoices)
	}
	if indexIn(TapChoices, Defaults.MultitapMs) == 0 && TapChoices[0] != Defaults.MultitapMs {
		t.Errorf("기본 연타 시간 %d 가 목록 %v 에 없다", Defaults.MultitapMs, TapChoices)
	}
	if Defaults.Theme < 0 || Defaults.Theme >= len(Palettes) {
		t.Errorf("기본 테마 번호 %d 가 범위 밖", Defaults.Theme)
	}
}

// ---------------------------------------------------------------------
// 배치
// ---------------------------------------------------------------------

// stubs 는 배치 시험용 자리 채우개다.
func stubs(n int) []fyne.CanvasObject {
	out := make([]fyne.CanvasObject, n)
	for i := range out {
		r := canvas.NewRectangle(nil)
		r.SetMinSize(fyne.NewSize(10, 10))
		out[i] = r
	}
	return out
}

// TestWeightedRow 는 기능 버튼 줄의 폭이 비율대로 나뉘는지 본다.
// 반올림 오차가 쌓이면 마지막 버튼이 오른쪽 끝에 닿지 않는다.
func TestWeightedRow(t *testing.T) {
	const width, gap = 350, 6

	objs := stubs(fnCount)
	l := newWeightedRow(gap, fnWeight...)
	l.Layout(objs, fyne.NewSize(width, 40))

	// 첫 칸은 왼쪽 끝에서 시작하고, 마지막 칸은 오른쪽 끝에서 끝나야 한다.
	if x := objs[0].Position().X; x != 0 {
		t.Errorf("첫 칸이 %v 에서 시작, 기대: 0", x)
	}
	last := objs[fnCount-1]
	if end := last.Position().X + last.Size().Width; end < width-0.01 || end > width+0.01 {
		t.Errorf("마지막 칸이 %v 에서 끝남, 기대: %v", end, width)
	}

	// 칸 사이 간격은 정확히 gap 이어야 한다.
	for i := 0; i+1 < fnCount; i++ {
		end := objs[i].Position().X + objs[i].Size().Width
		next := objs[i+1].Position().X
		if d := next - end; d < gap-0.01 || d > gap+0.01 {
			t.Errorf("%d-%d 칸 사이 간격 %v, 기대: %v", i, i+1, d, gap)
		}
	}

	// 폭은 비율을 따라야 한다. 비율이 큰 칸이 더 넓다.
	span := float32(width - gap*(fnCount-1))
	for i, w := range fnWeight {
		want := span * float32(w) / 35
		if got := objs[i].Size().Width; got < want-1 || got > want+1 {
			t.Errorf("%d 번 칸 폭 %v, 기대: 약 %v (비율 %d/35)", i, got, want, w)
		}
	}
}

func TestEqualRow(t *testing.T) {
	const width, gap = 300, 6

	objs := stubs(3)
	newEqualRow(gap, 3).Layout(objs, fyne.NewSize(width, 40))

	want := float32(width-gap*2) / 3
	for i, o := range objs {
		if got := o.Size().Width; got < want-1 || got > want+1 {
			t.Errorf("%d 번 칸 폭 %v, 기대: 약 %v", i, got, want)
		}
	}
	last := objs[2]
	if end := last.Position().X + last.Size().Width; end < width-0.01 || end > width+0.01 {
		t.Errorf("마지막 칸이 %v 에서 끝남, 기대: %v", end, width)
	}
}

func TestVGrid(t *testing.T) {
	const height, gap = 300, 6

	objs := stubs(5)
	newVGrid(gap).Layout(objs, fyne.NewSize(200, height))

	last := objs[4]
	if end := last.Position().Y + last.Size().Height; end < height-0.01 || end > height+0.01 {
		t.Errorf("마지막 행이 %v 에서 끝남, 기대: %v", end, height)
	}
	for i := 0; i+1 < 5; i++ {
		end := objs[i].Position().Y + objs[i].Size().Height
		if d := objs[i+1].Position().Y - end; d < gap-0.01 || d > gap+0.01 {
			t.Errorf("%d-%d 행 사이 간격 %v, 기대: %v", i, i+1, d, gap)
		}
	}
}

// TestFnTables 는 기능 버튼 표들의 길이가 서로 맞는지 본다.
// 하나만 고치고 나머지를 잊으면 여기서 걸린다.
func TestFnTables(t *testing.T) {
	for _, l := range Langs {
		if n := len(T(l.Code).FnLabels); n != fnCount {
			t.Errorf("%s: 라벨 %d 개, 기대: %d 개", l.Code, n, fnCount)
		}
		if n := len(T(l.Code).FnHints); n != fnCount {
			t.Errorf("%s: 설명 %d 개, 기대: %d 개", l.Code, n, fnCount)
		}
		if n := len(T(l.Code).Tips); n != toolCount {
			t.Errorf("%s: 툴바 설명 %d 개, 기대: %d 개", l.Code, n, toolCount)
		}
	}
	if len(fnWeight) != fnCount {
		t.Errorf("비율 %d 개, 기대: %d 개", len(fnWeight), fnCount)
	}

	sum := 0
	for _, w := range fnWeight {
		if w <= 0 {
			t.Errorf("비율에 0 이하가 있다: %v", fnWeight)
		}
		sum += w
	}
	if sum != 35 {
		t.Errorf("비율 합이 %d, 기대: 35", sum)
	}
}

// ---------------------------------------------------------------------
// 커서 위치 변환
// ---------------------------------------------------------------------

func TestRowColOf(t *testing.T) {
	cases := []struct {
		name     string
		text     string
		pos      int
		row, col int
	}{
		{"빈 문자열", "", 0, 0, 0},
		{"한 줄 처음", "가나다", 0, 0, 0},
		{"한 줄 중간", "가나다", 2, 0, 2},
		{"한 줄 끝", "가나다", 3, 0, 3},
		{"줄바꿈 앞", "가나\n다라", 2, 0, 2},
		{"줄바꿈 뒤", "가나\n다라", 3, 1, 0},
		{"둘째 줄 중간", "가나\n다라", 4, 1, 1},
		{"셋째 줄", "가\n나\n다", 4, 2, 0},
		{"빈 줄 사이", "가\n\n나", 2, 1, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			row, col := rowColOf(c.text, c.pos)
			if row != c.row || col != c.col {
				t.Errorf("rowColOf(%q, %d) = (%d, %d), 기대: (%d, %d)",
					c.text, c.pos, row, col, c.row, c.col)
			}
		})
	}
}

// TestCursorRoundTrip 은 두 표현 사이를 오갔을 때 제자리로 오는지 본다.
func TestCursorRoundTrip(t *testing.T) {
	texts := []string{
		"", "가", "가나다", "가나\n다라", "가\n\n나", "안녕하세요\n반갑습니다\n",
		"a가1!\nㄱㅏ",
	}
	for _, text := range texts {
		t.Run(text, func(t *testing.T) {
			for pos := 0; pos <= len([]rune(text)); pos++ {
				row, col := rowColOf(text, pos)
				if got := flatPosOf(text, row, col); got != pos {
					t.Errorf("%d -> (%d,%d) -> %d", pos, row, col, got)
				}
			}
		})
	}
}

// TestFlatPosClamp 는 범위를 넘는 (줄, 칸) 이 안전하게 잘리는지 본다.
func TestFlatPosClamp(t *testing.T) {
	const text = "가나\n다라"
	cases := []struct {
		name     string
		row, col int
		want     int
	}{
		{"음수 줄", -1, 0, 0},
		{"음수 칸", 0, -5, 0},
		{"넘치는 칸", 0, 99, 2},
		{"넘치는 줄", 99, 0, 3},
		{"둘 다 넘침", 99, 99, 5},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := flatPosOf(text, c.row, c.col); got != c.want {
				t.Errorf("flatPosOf(%q, %d, %d) = %d, 기대: %d",
					text, c.row, c.col, got, c.want)
			}
		})
	}
}

// ---------------------------------------------------------------------
// 물리 키보드
// ---------------------------------------------------------------------

// TestHangulKeyOf 는 숫자열이 키패드에 제대로 대응하는지 본다.
//
//	1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
//	4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !
func TestHangulKeyOf(t *testing.T) {
	want := map[fyne.KeyName]int{
		fyne.Key1: 0, fyne.Key2: 1, fyne.Key3: 2,
		fyne.Key4: 3, fyne.Key5: 4, fyne.Key6: 5,
		fyne.Key7: 6, fyne.Key8: 7, fyne.Key9: 8,
		fyne.KeyMinus: 9, fyne.Key0: 10, fyne.KeyEqual: 11,
	}
	for name, key := range want {
		if got := hangulKeyOf(name); got != key {
			t.Errorf("hangulKeyOf(%q) = %d, 기대: %d", name, got, key)
		}
	}

	// 12 개 키가 하나도 겹치지 않고 0~11 을 모두 덮어야 한다.
	seen := make(map[int]bool)
	for _, key := range want {
		if seen[key] {
			t.Errorf("키 %d 가 두 번 대응된다", key)
		}
		seen[key] = true
	}
	for k := 0; k < engine.KeyCount; k++ {
		if !seen[k] {
			t.Errorf("키 %d 에 대응하는 물리 키가 없다", k)
		}
	}

	// 대응이 없는 키는 -1 이다.
	for _, name := range []fyne.KeyName{fyne.KeyA, fyne.KeySpace, fyne.KeyF1} {
		if got := hangulKeyOf(name); got != -1 {
			t.Errorf("hangulKeyOf(%q) = %d, 기대: -1", name, got)
		}
	}
}

// TestKeyLabelMatchesPhysicalKey 는 숫자열로 친 글자가 그 자리 버튼에
// 적힌 글자와 같은지 본다. 화면과 키보드가 어긋나면 여기서 걸린다.
func TestKeyLabelMatchesPhysicalKey(t *testing.T) {
	names := []fyne.KeyName{
		fyne.Key1, fyne.Key2, fyne.Key3, fyne.Key4, fyne.Key5, fyne.Key6,
		fyne.Key7, fyne.Key8, fyne.Key9, fyne.KeyMinus, fyne.Key0, fyne.KeyEqual,
	}
	for _, name := range names {
		key := hangulKeyOf(name)
		t.Run(string(name), func(t *testing.T) {
			s := engine.New()
			label := s.KeyLabel(key)
			s.Key(key)
			s.Commit()

			want := string([]rune(label)[0])
			if got := s.Text(); got != want {
				t.Errorf("%q 키(=키패드 %d, 라벨 %q) -> %q, 기대: %q",
					name, key, label, got, want)
			}
		})
	}
}

// ---------------------------------------------------------------------
// 역할 대응
// ---------------------------------------------------------------------

func TestUIRole(t *testing.T) {
	cases := []struct {
		in   engine.KeyRole
		want BtnRole
	}{
		{engine.RoleVowel, RoleVowel},
		{engine.RoleMod, RoleMod},
		{engine.RoleCons, RoleCons},
	}
	for _, c := range cases {
		if got := uiRole(c.in); got != c.want {
			t.Errorf("uiRole(%v) = %v, 기대: %v", c.in, got, c.want)
		}
	}
}

// TestKeyRoleCoverage 는 한글 모드 12키의 역할이 자판과 맞는지 본다.
func TestKeyRoleCoverage(t *testing.T) {
	s := engine.New()
	want := []BtnRole{
		RoleVowel, RoleVowel, RoleVowel, // ㅣ · ㅡ
		RoleCons, RoleCons, RoleCons, // ㄱㅋ ㄴㄹ ㄷㅌ
		RoleCons, RoleCons, RoleCons, // ㅂㅍ ㅅㅎ ㅈㅊ
		RoleMod, RoleCons, RoleMod, // . ,  ㅇㅁ  ? !
	}
	for i, w := range want {
		if got := uiRole(s.KeyRoleOf(i)); got != w {
			t.Errorf("키%d(%q) 역할 %v, 기대: %v", i, s.KeyLabel(i), got, w)
		}
	}
}

// ---------------------------------------------------------------------
// 도움말
// ---------------------------------------------------------------------

// TestHelpText 는 두 언어의 도움말이 비어 있지 않고
// 자판 그림과 단축키 안내를 담고 있는지 본다.
func TestHelpText(t *testing.T) {
	must := map[Lang][]string{
		LangKO: {"키패드", "모음", "자음", "물리 키보드", "설정"},
		LangEN: {"Keypad", "Vowels", "Consonants", "Physical keyboard", "Settings"},
	}
	for _, l := range Langs {
		t.Run(string(l.Code), func(t *testing.T) {
			help := T(l.Code).Help
			if len(help) < 500 {
				t.Errorf("도움말이 너무 짧다: %d 바이트", len(help))
			}
			want := append([]string{"ㄱㅋ", "ㅅㅎ", "F1", "Ctrl+S"}, must[l.Code]...)
			for _, w := range want {
				if !strings.Contains(help, w) {
					t.Errorf("도움말에 %q 가 없다", w)
				}
			}
		})
	}
}

// ---------------------------------------------------------------------
// 언어
// ---------------------------------------------------------------------

// TestLangTablesComplete 는 두 언어의 글자 표에 빈 칸이 없는지 본다.
// 항목을 하나 빠뜨리면 화면에 빈 라벨이 나오므로 전수로 확인한다.
func TestLangTablesComplete(t *testing.T) {
	for _, l := range Langs {
		t.Run(string(l.Code), func(t *testing.T) {
			s := T(l.Code)
			v := reflect.ValueOf(*s)
			ty := v.Type()

			for i := 0; i < v.NumField(); i++ {
				name := ty.Field(i).Name
				switch f := v.Field(i); f.Kind() {
				case reflect.String:
					if f.String() == "" {
						t.Errorf("%s 가 비었다", name)
					}
				case reflect.Array:
					for j := 0; j < f.Len(); j++ {
						// 아이콘을 그리는 기능 버튼은 라벨이 비어 있는 것이 맞다.
						if name == "FnLabels" && fnIcons[j] != nil {
							continue
						}
						if f.Index(j).String() == "" {
							t.Errorf("%s[%d] 가 비었다", name, j)
						}
					}
				}
			}
		})
	}
}

// TestLangDiffer 는 두 언어가 실제로 다른 글자를 쓰는지 본다.
// 영어 표를 만들다 한국어를 그대로 두면 여기서 걸린다.
func TestLangDiffer(t *testing.T) {
	ko, en := T(LangKO), T(LangEN)

	same := []struct {
		name string
		a, b string
	}{
		{"AppTitle", ko.AppTitle, en.AppTitle},
		{"MenuFile", ko.MenuFile, en.MenuFile},
		{"New", ko.New, en.New},
		{"Help", ko.Help, en.Help},
		{"ModeNames[0]", ko.ModeNames[0], en.ModeNames[0]},
		{"FnLabels[0]", ko.FnLabels[0], en.FnLabels[0]},
		{"Tips[0]", ko.Tips[0], en.Tips[0]},
	}
	for _, c := range same {
		if c.a == c.b {
			t.Errorf("%s 가 두 언어에서 같다: %q", c.name, c.a)
		}
	}
}

// TestUnknownLangFallsBack 은 모르는 언어를 물으면 한국어가 오는지 본다.
func TestUnknownLangFallsBack(t *testing.T) {
	if T(Lang("fr")) != T(LangKO) {
		t.Error("모르는 언어가 한국어로 떨어지지 않는다")
	}
}

// TestThemeNamesFor 는 테마 이름이 언어마다 갖춰져 있는지 본다.
func TestThemeNamesFor(t *testing.T) {
	for _, l := range Langs {
		names := ThemeNamesFor(l.Code)
		if len(names) != len(Palettes) {
			t.Errorf("%s: 이름 %d 개, 테마 %d 종", l.Code, len(names), len(Palettes))
		}
		for i, n := range names {
			if n == "" {
				t.Errorf("%s: %d 번째 테마 이름이 비었다", l.Code, i)
			}
		}
	}
}

// TestFnLabelGlyphs 는 기능 버튼 라벨의 글자가 내장 글꼴에 있는지 본다.
//
// 버튼은 FontSource 로 글꼴을 못박으므로 대체 글꼴이 끼어들지 않는다.
// 글꼴에 없는 글자를 라벨로 쓰면 버튼이 빈칸으로 나온다.
// (↵ U+21B5 와 ⌫ U+232B 가 Noto Sans KR 에 없어서 실제로 겪은 일이다)
func TestFnLabelGlyphs(t *testing.T) {
	for _, l := range Langs {
		for i, label := range T(l.Code).FnLabels {
			if fnIcons[i] != nil {
				continue // 아이콘을 그리는 자리라 라벨이 비어 있다
			}
			if label == "" {
				t.Errorf("%s: 기능 버튼 %d 에 라벨도 아이콘도 없다", l.Code, i)
				continue
			}
			for _, r := range label {
				t.Run(string(l.Code)+" "+string(r), func(t *testing.T) {
					if !fontHasRune(t, r) {
						t.Errorf("%q (U+%04X) 가 내장 글꼴에 없다", string(r), r)
					}
				})
			}
		}
	}
}

// fontHasRune 은 내장한 글꼴의 cmap 에 그 글자가 있는지 본다.
func fontHasRune(t *testing.T, r rune) bool {
	t.Helper()

	face, err := sfnt.Parse(assets.FontRegular.Content())
	if err != nil {
		t.Fatalf("글꼴을 읽지 못했다: %v", err)
	}
	idx, err := face.GlyphIndex(&sfnt.Buffer{}, r)
	if err != nil {
		t.Fatalf("글리프를 찾지 못했다: %v", err)
	}
	return idx != 0
}

// TestFnIcons 는 기능 버튼이 글자든 그림이든 하나는 갖는지 본다.
// 둘 다 없으면 빈 단추가 나온다.
func TestFnIcons(t *testing.T) {
	if len(fnIcons) != fnCount {
		t.Fatalf("아이콘 %d 개, 기대: %d 개", len(fnIcons), fnCount)
	}

	for _, l := range Langs {
		labels := T(l.Code).FnLabels
		for i := 0; i < fnCount; i++ {
			if fnIcons[i] == nil && labels[i] == "" {
				t.Errorf("%s: 기능 버튼 %d 에 글자도 그림도 없다", l.Code, i)
			}
			if fnIcons[i] != nil && labels[i] != "" {
				t.Errorf("%s: 기능 버튼 %d 에 그림과 글자가 둘 다 있다 (%q)",
					l.Code, i, labels[i])
			}
		}
	}
}

// TestSvgIconsParse 는 직접 그린 아이콘이 온전한 SVG 인지 본다.
// 망가진 SVG 는 그리는 자리에서 조용히 빈칸이 되므로 여기서 잡는다.
func TestSvgIconsParse(t *testing.T) {
	icons := map[string]fyne.Resource{
		"language":  iconLanguage,
		"enter":     iconEnter,
		"backspace": iconBackspace,
	}
	for name, res := range icons {
		t.Run(name, func(t *testing.T) {
			if res == nil {
				t.Fatal("아이콘이 nil 이다")
			}
			body := string(res.Content())
			if !strings.HasPrefix(body, "<svg") || !strings.HasSuffix(body, "</svg>") {
				t.Errorf("SVG 가 아니다: %.40s...", body)
			}
			if !strings.Contains(body, "viewBox=") {
				t.Error("viewBox 가 없다")
			}
			if !strings.Contains(body, "fill=") {
				t.Error("fill 이 없다. 그러면 테마 색으로 물들지 않는다")
			}
			// 태그가 제대로 닫혔는지 끝까지 훑어 본다.
			dec := xml.NewDecoder(bytes.NewReader(res.Content()))
			for {
				_, err := dec.Token()
				if err == io.EOF {
					break
				}
				if err != nil {
					t.Errorf("XML 로 읽히지 않는다: %v", err)
					break
				}
			}
		})
	}
}

// TestTipPosition 은 툴팁 상자가 창 밖으로 나가지 않는지 본다.
func TestTipPosition(t *testing.T) {
	canvasSize := fyne.NewSize(400, 700)
	ownerSize := fyne.NewSize(32, 32)
	tip := fyne.NewSize(160, 26)

	cases := []struct {
		name  string
		owner fyne.Position
	}{
		{"왼쪽 위", fyne.NewPos(8, 8)},
		{"오른쪽 끝", fyne.NewPos(360, 8)},
		{"왼쪽 밖", fyne.NewPos(-20, 8)},
		{"아래쪽 끝", fyne.NewPos(100, 660)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := tipPosition(c.owner, ownerSize, tip, canvasSize)

			if p.X < 0 || p.X+tip.Width > canvasSize.Width {
				t.Errorf("가로로 창을 벗어난다: x=%v, 폭=%v, 창=%v",
					p.X, tip.Width, canvasSize.Width)
			}
			if p.Y < 0 || p.Y+tip.Height > canvasSize.Height {
				t.Errorf("세로로 창을 벗어난다: y=%v, 높이=%v, 창=%v",
					p.Y, tip.Height, canvasSize.Height)
			}
		})
	}
}

// TestOverlayColorsTranslucent 는 호버·눌림·초점 색이 반투명인지 본다.
//
// Fyne 은 이 색들을 단추 배경 "위에 덮어" 그린다. 불투명하면 파란
// 기본 단추가 통째로 가려져서, 마우스를 올렸을 때 오히려 잘 안 보인다.
func TestOverlayColorsTranslucent(t *testing.T) {
	names := []fyne.ThemeColorName{"hover", "pressed", "focus"}

	for _, p := range Palettes {
		th := newTheme(p, 14)
		for _, n := range names {
			_, _, _, alpha := th.Color(n, 0).RGBA()
			if alpha>>8 > 0x60 {
				t.Errorf("%s 테마의 %q 가 너무 진하다 (알파 %d). 덮개는 옅어야 한다",
					p.Name, n, alpha>>8)
			}
			if alpha == 0 {
				t.Errorf("%s 테마의 %q 가 완전히 투명하다", p.Name, n)
			}
		}
	}
}
