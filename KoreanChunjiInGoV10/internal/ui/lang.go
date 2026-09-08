// lang.go - 화면에 나오는 글자들. 한국어와 영어 두 벌이다.
//
// 표를 구조체로 두었으므로 항목을 하나 빠뜨리면 컴파일이 되지 않는다.
// 새 언어를 넣으려면 texts 에 한 줄 더 적으면 된다.
package ui

import (
	"os"
	"strings"
)

// Lang 은 화면에 쓰는 언어다.
type Lang string

const (
	LangKO Lang = "ko"
	LangEN Lang = "en"
)

// Langs 는 고를 수 있는 언어와 그 이름이다(설정 창과 메뉴에 쓴다).
var Langs = []struct {
	Code Lang
	Name string
}{
	{LangKO, "한국어"},
	{LangEN, "English"},
}

// Strings 는 화면에 쓰는 모든 글자다.
type Strings struct {
	AppTitle   string
	HelpTitle  string
	AboutTitle string

	MenuFile, MenuEdit, MenuInput, MenuConfig, MenuHelp string

	New, Open, Save, Quit          string
	Copy, Paste, ClearAll          string
	NextMode                       string
	Theme, NextTheme               string
	Language                       string
	ShowToolbar, ShowStatus        string
	SettingsDots, Usage, AboutItem string

	// 설정 창
	SetTitle, SetOK, SetCancel, SetDefault          string
	SetTheme, SetFontSize, SetTapTime, SetStartMode string
	SetLanguage                                     string
	UnitPx, UnitSec, MarkDefault                    string

	// 상태줄
	StatusComposing, StatusChars, StatusNone string

	// 모드 이름
	ModeNames [5]string

	// 기능 버튼과 그 설명.
	// FnLabels 가 빈 칸이면 그 자리는 글자 대신 아이콘을 그린다
	// (줄바꿈 · 지우기. icons.go 와 app.go 의 fnIcons 를 보라).
	FnLabels [6]string
	FnHints  [6]string

	// 툴바 설명
	Tips [toolCount]string

	// 대화 상자
	ErrOpen, ErrSave, Close string

	// 프로그램 정보
	AboutBody                                           string
	AboutAuthor, AboutEngine, AboutBuild                string
	AboutPlatform, AboutFont, AboutTheme, AboutSettings string

	Help string
}

// T 는 지금 언어의 글자 묶음을 돌려준다.
func T(l Lang) *Strings {
	if s, ok := texts[l]; ok {
		return s
	}
	return texts[LangKO]
}

// DetectLang 은 운영체제의 언어 설정을 보고 처음 쓸 언어를 고른다.
// 한국어로 보이면 한국어, 그 밖에는 영어다.
func DetectLang() Lang {
	for _, key := range []string{"LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"} {
		v := strings.ToLower(os.Getenv(key))
		if v == "" {
			continue
		}
		if strings.HasPrefix(v, "ko") {
			return LangKO
		}
		return LangEN
	}
	// Windows 에는 위 환경 변수가 없다. 그때는 한국어로 시작한다.
	return LangKO
}

var texts = map[Lang]*Strings{
	LangKO: {
		AppTitle:   "천지인 한글 입력기",
		HelpTitle:  "천지인 한글 입력기 - 사용법",
		AboutTitle: "프로그램 정보",

		MenuFile: "파일", MenuEdit: "편집", MenuInput: "입력",
		MenuConfig: "설정", MenuHelp: "도움말",

		New: "새로 만들기", Open: "열기...", Save: "저장...", Quit: "끝내기",
		Copy: "복사", Paste: "붙여넣기", ClearAll: "전체 지우기",
		NextMode: "다음 모드",
		Theme:    "테마", NextTheme: "다음 테마",
		Language:    "언어",
		ShowToolbar: "툴바 보이기", ShowStatus: "상태줄 보이기",
		SettingsDots: "설정...", Usage: "사용법", AboutItem: "정보",

		SetTitle: "설정", SetOK: "확인", SetCancel: "취소", SetDefault: "기본값",
		SetTheme: "테마", SetFontSize: "글꼴 크기", SetTapTime: "연타 유지 시간",
		SetStartMode: "시작 입력 모드", SetLanguage: "언어",
		UnitPx: "px", UnitSec: "초", MarkDefault: "(기본)",

		StatusComposing: "조합", StatusChars: "자", StatusNone: "–",

		ModeNames: [5]string{"한글", "영문 abc", "영문 ABC", "숫자 123", "기호 !@#"},

		FnLabels: [6]string{"모드", "←", "스페이스", "→", "", ""},
		FnHints: [6]string{
			"입력 모드 전환 (F2)", "커서 왼쪽 (←)", "띄어쓰기 (Space)",
			"커서 오른쪽 (→) · 연타 순환 끊기", "줄바꿈 (Enter)", "지우기 (Backspace)",
		},

		Tips: [toolCount]string{
			"새로 만들기 (Ctrl+N)", "열기 (Ctrl+O)", "저장 (Ctrl+S)",
			"복사 (Ctrl+C)", "붙여넣기 (Ctrl+V)", "전체 지우기",
			"입력 모드 전환 (F2)", "테마 전환 (F3)", "언어 전환 (한국어 / English)",
			"설정... (F4)", "프로그램 정보",
		},

		ErrOpen: "파일을 열 수 없습니다", ErrSave: "파일을 저장할 수 없습니다",
		Close: "닫기",

		AboutBody:   "12키 천지인 자판으로 한글을 조합합니다.",
		AboutAuthor: "만든이", AboutEngine: "조합 엔진", AboutBuild: "빌드",
		AboutPlatform: "플랫폼", AboutFont: "글꼴", AboutTheme: "현재 테마",
		AboutSettings: "설정 저장 위치",

		Help: helpKO,
	},

	LangEN: {
		AppTitle:   "Chunjiin Hangul Keyboard",
		HelpTitle:  "Chunjiin Hangul Keyboard - Guide",
		AboutTitle: "About",

		MenuFile: "File", MenuEdit: "Edit", MenuInput: "Input",
		MenuConfig: "Settings", MenuHelp: "Help",

		New: "New", Open: "Open...", Save: "Save...", Quit: "Quit",
		Copy: "Copy", Paste: "Paste", ClearAll: "Clear all",
		NextMode: "Next mode",
		Theme:    "Theme", NextTheme: "Next theme",
		Language:    "Language",
		ShowToolbar: "Show toolbar", ShowStatus: "Show status bar",
		SettingsDots: "Preferences...", Usage: "Guide", AboutItem: "About",

		SetTitle: "Settings", SetOK: "OK", SetCancel: "Cancel", SetDefault: "Defaults",
		SetTheme: "Theme", SetFontSize: "Font size", SetTapTime: "Multi-tap window",
		SetStartMode: "Start mode", SetLanguage: "Language",
		UnitPx: "px", UnitSec: "s", MarkDefault: "(default)",

		StatusComposing: "Composing", StatusChars: "chars", StatusNone: "–",

		ModeNames: [5]string{"Hangul", "Latin abc", "Latin ABC", "Digits 123", "Symbols !@#"},

		FnLabels: [6]string{"Mode", "←", "Space", "→", "", ""},
		FnHints: [6]string{
			"Switch input mode (F2)", "Cursor left (←)", "Space",
			"Cursor right (→) · end multi-tap", "New line (Enter)", "Delete (Backspace)",
		},

		Tips: [toolCount]string{
			"New (Ctrl+N)", "Open (Ctrl+O)", "Save (Ctrl+S)",
			"Copy (Ctrl+C)", "Paste (Ctrl+V)", "Clear all",
			"Switch input mode (F2)", "Switch theme (F3)",
			"Switch language (한국어 / English)", "Preferences... (F4)", "About",
		},

		ErrOpen: "Could not open the file", ErrSave: "Could not save the file",
		Close: "Close",

		AboutBody:   "Types Hangul with the 12-key Chunjiin layout.",
		AboutAuthor: "Author", AboutEngine: "Engine", AboutBuild: "Build",
		AboutPlatform: "Platform", AboutFont: "Font", AboutTheme: "Theme",
		AboutSettings: "Settings file",

		Help: helpEN,
	},
}

// ThemeNamesFor 는 테마 이름을 언어에 맞게 돌려준다.
func ThemeNamesFor(l Lang) []string {
	if l != LangEN {
		return ThemeNames()
	}
	return []string{"Light", "Dark", "Sepia", "High contrast"}
}
