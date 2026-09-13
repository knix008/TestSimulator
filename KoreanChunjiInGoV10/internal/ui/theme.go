// theme.go - 테마 4종과 Fyne 테마 구현.
//
// 색은 KoreanChunJiInC++ 의 src/main.c THEMES[] 표를 그대로 옮긴 것이다.
// 창 배경·카드·테두리·글자·흐린 글자와, 버튼 역할마다 다섯 가지 색
// (기본 · 호버 · 눌림 · 테두리 · 글자) 을 갖는다.
package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"

	"github.com/knix008/chunjiin/assets/fonts"
)

// BtnRole 은 버튼의 역할이다. 역할마다 색이 다르다.
type BtnRole int

const (
	RoleCons    BtnRole = iota // 자음 · 일반 키
	RoleVowel                  // ㅣ · ㅡ
	RoleMod                    // 문장부호
	RoleFn                     // 기능 버튼
	RolePrimary                // 모드 전환
	RoleTool                   // 툴바
	RoleCount
)

// 역할별 색의 자리
const (
	ColorBase   = 0 // 기본
	ColorHover  = 1 // 호버
	ColorPress  = 2 // 눌림
	ColorBorder = 3 // 테두리
	ColorText   = 4 // 글자
)

// Palette 는 테마 하나의 색 묶음이다.
type Palette struct {
	Name string
	Dark bool

	Wnd    color.Color // 창 배경
	Card   color.Color // 편집 영역 배경
	Border color.Color
	Text   color.Color
	Muted  color.Color // 흐린 글자 (상태줄)

	Role [RoleCount][5]color.Color
}

// hex 는 "RRGGBB" 를 색으로 바꾼다. 표를 눈으로 확인하기 쉬우라고 쓴다.
func hex(s string) color.Color {
	v := uint32(0)
	for _, c := range s {
		v <<= 4
		switch {
		case c >= '0' && c <= '9':
			v |= uint32(c - '0')
		case c >= 'a' && c <= 'f':
			v |= uint32(c-'a') + 10
		case c >= 'A' && c <= 'F':
			v |= uint32(c-'A') + 10
		}
	}
	return color.NRGBA{R: uint8(v >> 16), G: uint8(v >> 8), B: uint8(v), A: 0xFF}
}

// roles 는 여섯 역할의 색을 순서대로 받는다.
// 각 역할은 { 기본, 호버, 눌림, 테두리, 글자 } 다섯 개다.
func roles(rows ...[5]string) [RoleCount][5]color.Color {
	var out [RoleCount][5]color.Color
	for i, r := range rows {
		for j, s := range r {
			out[i][j] = hex(s)
		}
	}
	return out
}

// Palettes 는 테마 4종이다. 설정에 저장되는 것은 이 차례의 번호다.
var Palettes = []Palette{
	{
		Name: "라이트", Dark: false,
		Wnd: hex("F6F7FA"), Card: hex("FFFFFF"), Border: hex("DFE3EA"),
		Text: hex("1F2328"), Muted: hex("6B7280"),
		Role: roles(
			//        기본      호버      눌림      테두리    글자
			[5]string{"FFFFFF", "F2F5FF", "E3EAFD", "DFE3EA", "1F2328"}, // 자음
			[5]string{"EDF2FF", "E3EBFF", "D6E1FD", "D3DEFB", "2749C9"}, // 모음
			[5]string{"F1F3F7", "E9ECF2", "DFE3EB", "E0E4EB", "4A5162"}, // 부호
			[5]string{"F1F3F7", "E9ECF2", "DFE3EB", "E0E4EB", "333842"}, // 기능
			[5]string{"3F62E8", "3557DD", "2C4AC9", "3557DD", "FFFFFF"}, // 모드
			[5]string{"F6F7FA", "E7ECF8", "D9E1F5", "F6F7FA", "3B4250"}, // 툴바
		),
	},
	{
		Name: "다크", Dark: true,
		Wnd: hex("1E1F22"), Card: hex("17181B"), Border: hex("33363D"),
		Text: hex("E6E8EB"), Muted: hex("9AA1AC"),
		Role: roles(
			[5]string{"24262B", "2C2F36", "363A43", "383B43", "E6E8EB"},
			[5]string{"21304F", "27395E", "2E446F", "33456B", "A9C4FF"},
			[5]string{"1D1F24", "24262B", "2B2E35", "303339", "B7BDC7"},
			[5]string{"1D1F24", "24262B", "2B2E35", "303339", "DDE1E7"},
			[5]string{"3F62E8", "4A6DF0", "3455CE", "4A6DF0", "FFFFFF"},
			[5]string{"1E1F22", "2A2D34", "343840", "1E1F22", "D5D9E0"},
		),
	},
	{
		Name: "세피아", Dark: false,
		Wnd: hex("F3EADA"), Card: hex("FBF3E6"), Border: hex("DCCDB4"),
		Text: hex("4A3B28"), Muted: hex("8A755A"),
		Role: roles(
			[5]string{"FBF3E6", "F6EAD6", "EEDCC0", "DCCDB4", "4A3B28"},
			[5]string{"F3E3C6", "EEDAB6", "E6CEA2", "D9C09B", "8A5A22"},
			[5]string{"EFE4D0", "E9DAC2", "E0CDAF", "D7C6AA", "5A4A34"},
			[5]string{"EFE4D0", "E9DAC2", "E0CDAF", "D7C6AA", "4A3B28"},
			[5]string{"A9713C", "96632F", "855427", "96632F", "FFF8EC"},
			[5]string{"F3EADA", "EADCC4", "E0CEB0", "F3EADA", "5A4A34"},
		),
	},
	{
		Name: "고대비", Dark: true,
		Wnd: hex("000000"), Card: hex("000000"), Border: hex("FFFFFF"),
		Text: hex("FFFFFF"), Muted: hex("FFFF00"),
		Role: roles(
			[5]string{"000000", "222222", "444444", "FFFFFF", "FFFFFF"},
			[5]string{"000000", "222222", "444444", "FFFF00", "FFFF00"},
			[5]string{"000000", "222222", "444444", "00FF00", "00FF00"},
			[5]string{"000000", "222222", "444444", "FFFFFF", "FFFFFF"},
			[5]string{"FFFF00", "FFEA00", "E6D200", "FFFF00", "000000"},
			[5]string{"000000", "333333", "555555", "000000", "FFFF00"},
		),
	},
}

// overlay 는 버튼 배경 위에 덮을 반투명한 색이다.
//
// 밝은 테마에서는 검정을, 어두운 테마에서는 흰색을 옅게 얹는다.
// 아래에 무슨 색이 있든 "조금 눌린 느낌" 이 고르게 나온다.
func (p Palette) overlay(alpha uint8) color.Color {
	if p.Dark {
		return color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFF, A: alpha}
	}
	return color.NRGBA{A: alpha}
}

// ThemeNames 는 설정 창과 메뉴에 쓰는 테마 이름 목록이다.
func ThemeNames() []string {
	out := make([]string, len(Palettes))
	for i, p := range Palettes {
		out[i] = p.Name
	}
	return out
}

// ---------------------------------------------------------------------
// Fyne 테마
// ---------------------------------------------------------------------

// appTheme 은 Palette 를 Fyne 테마로 감싼 것이다.
// 키패드 버튼은 직접 그리므로(keybutton.go) 여기서 정하는 색은
// 메뉴 · 대화 상자 · 스크롤바처럼 Fyne 이 그리는 부분에만 쓰인다.
type appTheme struct {
	pal      Palette
	fontSize float32
}

var _ fyne.Theme = (*appTheme)(nil)

func newTheme(pal Palette, fontSize float32) *appTheme {
	return &appTheme{pal: pal, fontSize: fontSize}
}

// Color 는 팔레트만으로 모든 색을 낸다.
//
// 모르는 이름을 Fyne 기본 테마로 넘기지 않는다. 기본 테마의 Color 는
// fyne.CurrentApp() 을 거치므로 앱이 뜨기 전이나 시험 중에는 죽는다.
// 정하지 않은 이름은 글자색으로 떨어뜨린다.
func (t *appTheme) Color(name fyne.ThemeColorName, _ fyne.ThemeVariant) color.Color {
	p := t.pal

	switch name {
	case theme.ColorNameBackground:
		return p.Wnd
	case theme.ColorNameForeground:
		return p.Text
	case theme.ColorNameDisabled, theme.ColorNamePlaceHolder:
		return p.Muted
	case theme.ColorNameButton, theme.ColorNameDisabledButton:
		return p.Role[RoleFn][ColorBase]
	case theme.ColorNameInputBackground, theme.ColorNameHeaderBackground,
		theme.ColorNameOverlayBackground, theme.ColorNameMenuBackground:
		return p.Card
	case theme.ColorNameInputBorder, theme.ColorNameSeparator:
		return p.Border
	case theme.ColorNamePrimary, theme.ColorNameSelection, theme.ColorNameHyperlink:
		return p.Role[RolePrimary][ColorBase]
	case theme.ColorNameForegroundOnPrimary:
		return p.Role[RolePrimary][ColorText]

	// 아래 셋은 Fyne 이 버튼 배경 "위에 덮어" 그리는 색이다.
	// 불투명한 색을 주면 파란 기본 단추(확인 등)가 통째로 가려져
	// 마우스를 올렸을 때 오히려 잘 안 보인다. 그래서 반투명으로 준다.
	case theme.ColorNameHover:
		return p.overlay(0x18)
	case theme.ColorNamePressed:
		return p.overlay(0x2E)
	case theme.ColorNameFocus:
		return p.overlay(0x22)
	case theme.ColorNameScrollBar:
		return p.Muted
	case theme.ColorNameScrollBarBackground:
		return p.Border
	case theme.ColorNameShadow:
		if p.Dark {
			return color.NRGBA{A: 0x99}
		}
		return color.NRGBA{A: 0x33}
	case theme.ColorNameError:
		if p.Dark {
			return hex("FF6B6B")
		}
		return hex("D93025")
	case theme.ColorNameSuccess:
		if p.Dark {
			return hex("5BD69A")
		}
		return hex("14804A")
	case theme.ColorNameWarning:
		if p.Dark {
			return hex("F5C451")
		}
		return hex("B4690E")
	case theme.ColorNameForegroundOnError, theme.ColorNameForegroundOnSuccess,
		theme.ColorNameForegroundOnWarning:
		return hex("FFFFFF")
	}

	return p.Text
}

// Font 는 굵기에 따라 두 벌 중 하나를 돌려준다.
// 고정폭도 같은 글꼴을 쓴다. Fyne 기본 고정폭 글꼴에는 한글이 없어서
// 도움말 같은 곳에서 네모가 나오기 때문이다.
func (t *appTheme) Font(style fyne.TextStyle) fyne.Resource {
	if style.Bold {
		return fonts.Bold
	}
	return fonts.Regular
}

// Icon 은 Fyne 이 들고 있는 기본 아이콘을 그대로 쓴다.
// 아이콘 조회는 앱 상태를 거치지 않으므로 넘겨도 안전하다.
func (t *appTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(name)
}

func (t *appTheme) Size(name fyne.ThemeSizeName) float32 {
	switch name {
	case theme.SizeNameText:
		return t.fontSize
	case theme.SizeNameInputRadius, theme.SizeNameSelectionRadius:
		return 8
	}
	return theme.DefaultTheme().Size(name)
}
