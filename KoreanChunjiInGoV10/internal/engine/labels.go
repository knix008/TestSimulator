// labels.go - 화면에 보여 줄 문자열들. input.c 의 표시용 구역에 대응한다.
//
// 라벨 배열과 입력 배열(engMap, specialMap ...)의 순서가 어긋나면 버튼에
// 적힌 글자와 실제 입력되는 글자가 달라진다. engine_test.go 의 TestKeyLabels
// 가 다섯 모드 12키를 전수 확인한다.
package engine

import "strings"

var labelHangul = [KeyCount]string{
	"ㅣ", "·", "ㅡ",
	"ㄱㅋ", "ㄴㄹ", "ㄷㅌ",
	"ㅂㅍ", "ㅅㅎ", "ㅈㅊ",
	". ,", "ㅇㅁ", "? !",
}

// engMap 과 같은 순서: 알파벳이 0~8번(3x3), 기호가 9~11번
var labelLower = [KeyCount]string{
	"abc", "def", "ghi",
	"jkl", "mno", "pqr",
	"stu", "vwx", "yz",
	". , ?", "! ' \"", "- : @",
}

var labelUpper = [KeyCount]string{
	"ABC", "DEF", "GHI",
	"JKL", "MNO", "PQR",
	"STU", "VWX", "YZ",
	". , ?", "! ' \"", "- : @",
}

var labelNumber = [KeyCount]string{
	"1", "2", "3", "4", "5", "6",
	"7", "8", "9", "*", "0", "#",
}

// specialMap 과 같은 순서
var labelSpecial = [KeyCount]string{
	". , :", "? ! ;", "' \" `",
	"- _ ~", "+ = *", "/ \\ |",
	"( ) &", "[ ] ^", "{ } %",
	"< > #", "@ $ ₩", "※ … ・",
}

// KeyLabel 은 현재 모드에서 키 인덱스(0~11)에 표시할 라벨이다.
func (s *State) KeyLabel(key int) string {
	if key < 0 || key >= KeyCount {
		return ""
	}
	switch s.NowMode {
	case ModeHangul:
		return labelHangul[key]
	case ModeEnglish:
		return labelLower[key]
	case ModeUpperEnglish:
		return labelUpper[key]
	case ModeNumber:
		return labelNumber[key]
	default:
		return labelSpecial[key]
	}
}

// ModeNames 는 다섯 모드의 이름이다(메뉴·설정 창에서 쓴다).
var ModeNames = [ModeCount]string{
	"한글", "영문 abc", "영문 ABC", "숫자 123", "기호 !@#",
}

// ModeName 은 현재 모드 이름이다.
func (s *State) ModeName() string { return ModeNames[s.NowMode] }

// KeyRole 은 키의 역할이다. GUI 가 색을 고를 때 쓴다.
type KeyRole int

const (
	RoleCons  KeyRole = iota // 자음 · 일반 키
	RoleVowel                // ㅣ · ㅡ
	RoleMod                  // 문장부호
)

// KeyRoleOf 는 키패드 버튼의 역할을 돌려준다.
// 한글 모드가 아니면 12키를 모두 같은 색으로 그린다.
func (s *State) KeyRoleOf(key int) KeyRole {
	if s.NowMode != ModeHangul {
		return RoleCons
	}
	switch {
	case isVowelKey(key):
		return RoleVowel
	case key == keyPunct1 || key == keyPunct2:
		return RoleMod
	default:
		return RoleCons
	}
}

// CompositionText 는 조합 중인 낱자 상태를 사람이 읽을 수 있는 문자열로
// 만든다(상태 표시줄용). 조합 중이 아니면 빈 문자열이다.
func (s *State) CompositionText() string {
	h := &s.Hangul

	if s.NowMode != ModeHangul {
		if s.Engnum != 0 && s.FlagEngdelete {
			return string(s.Engnum)
		}
		return ""
	}

	if h.Chosung == "" && h.Jungsung == "" && h.Jongsung == "" {
		return ""
	}

	dash := func(v string) string {
		if v == "" {
			return "-"
		}
		return v
	}

	var b strings.Builder
	b.WriteString(dash(h.Chosung))
	b.WriteString(" + ")
	b.WriteString(dash(h.Jungsung))
	b.WriteString(" + ")
	b.WriteString(dash(h.Jongsung))
	b.WriteString(h.Jongsung2)
	return b.String()
}

// StatusText 는 상태줄 한 줄이다. "한글    조합 ㄱ + ㅏ + -    3자" 꼴.
func (s *State) StatusText() string {
	comp := s.CompositionText()
	if comp == "" {
		comp = "–"
	}
	return s.ModeName() + "    조합 " + comp + "    " + itoa(s.Len()) + "자"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
