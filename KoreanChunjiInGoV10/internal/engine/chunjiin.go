// Package engine 은 천지인(千地人) 한글 조합 엔진이다.
//
// KoreanChunJiInC++ 의 src/chunjiin.c(원본, 수정 금지) 와 src/input.c(오토마타)
// 를 순수 Go 로 옮긴 것이다. 외부 의존이 없고 GOOS 를 가리지 않으므로
// 데스크톱 GUI(Fyne)와 웹(WASM)이 같은 코드를 쓴다.
//
// 이 파일은 chunjiin.c 에 대응한다.
//
//	GetUnicode   - 초성·중성·종성 -> 한글 음절 코드포인트
//	CheckDouble  - 두 자음이 겹받침을 이루는지
//	deleteChar   - 커서 앞 한 칸 삭제
//	초기화 함수들
package engine

// 편집 버퍼에 담을 수 있는 최대 문자 수.
// 원본이 널 종료 배열이라 4096 중 한 칸을 널에 썼으므로 그대로 4095 로 맞춘다.
const MaxTextLen = 4096

// KeyCount 는 천지인 키패드의 키 개수다(0 ~ 11).
const KeyCount = 12

// InputMode 는 입력 모드다.
type InputMode int

const (
	ModeHangul       InputMode = iota // 한글 (천지인)
	ModeEnglish                       // 영문 소문자
	ModeUpperEnglish                  // 영문 대문자
	ModeNumber                        // 숫자
	ModeSpecial                       // 기호
	ModeCount
)

// JamoSlot 은 조합 중인 낱자가 마지막으로 들어간 자리다.
type JamoSlot int

const (
	SlotNone JamoSlot = iota
	SlotChosung
	SlotJungsung
	SlotJongsung
	SlotJongsung2
)

// HangulState 는 조합 중인 한 음절의 상태다.
//
// Jungsung 에는 완성 모음뿐 아니라 중간 상태인 "·"(아래아 1개), "‥"(아래아 2개)
// 도 들어간다. GetUnicode 가 이 두 값을 "아직 모음이 아님"으로 취급한다.
type HangulState struct {
	Chosung   string
	Jungsung  string
	Jongsung  string
	Jongsung2 string // 겹받침의 두 번째 자음

	Step        JamoSlot // 마지막으로 채워진 자리
	FlagWriting bool     // true 면 TextBuffer[CursorPos-1] 이 조합 중인 글자

	FlagDotused   bool // 아래아(·)로 시작한 모음인지
	FlagDoubled   bool // 현재 자음이 쌍자음으로 바뀐 상태인지
	FlagAddcursor bool // 직전 입력에서 음절이 확정되었는지
	FlagSpace     bool // 직전 입력이 공백이었는지
}

// State 는 입력기 전체 상태다.
type State struct {
	Hangul HangulState

	NowMode InputMode

	Engnum         rune // 영문/숫자/기호 모드에서 조합 중인 문자
	FlagInitengnum bool // Engnum 이 화면에 반영되어 있는지
	FlagEngdelete  bool // 다음 입력이 덮어쓰기(멀티탭 연타)인지

	TextBuffer []rune
	CursorPos  int // 삽입 위치. 조합 중이면 조합 글자는 CursorPos-1

	// 아래는 chunjiin.c 가 쓰지 않는 확장 필드다.
	LastKey    int // 직전에 눌린 키 인덱스, 없으면 -1
	TapCount   int // 같은 키 연타 위치
	ComposeLen int // 조합 중인 글자가 차지하는 칸 수 (0~2)

	// 겹받침 되돌려 붙이기용.
	// 받침 뒤에 온 자음이 겹받침을 이루지 못해 새 음절로 떨어져 나갔을 때,
	// 바로 앞 음절을 기억해 둔다. 그 자음을 연타해서 겹받침이 되는 자음으로
	// 바뀌면 앞 음절로 도로 합친다. (만 + ㅅ -> 만ㅅ -> 많)
	PrevSyllable  HangulState
	PrevMergeable bool
}

// clampCursor 는 커서를 유효 범위로 보정한다.
func (s *State) clampCursor() {
	if s.CursorPos < 0 {
		s.CursorPos = 0
	}
	if s.CursorPos > MaxTextLen-1 {
		s.CursorPos = MaxTextLen - 1
	}
	if s.CursorPos > len(s.TextBuffer) {
		s.CursorPos = len(s.TextBuffer)
	}
}

// Text 는 현재 편집 버퍼를 문자열로 돌려준다.
// 원본의 wchar_to_utf8() 자리를 대신한다. Go 문자열은 이미 UTF-8 이다.
func (s *State) Text() string { return string(s.TextBuffer) }

// Len 은 편집 버퍼의 글자 수다(바이트 수가 아니다).
func (s *State) Len() int { return len(s.TextBuffer) }

// ---------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------

func chunjiinInit(s *State) {
	hangulInit(&s.Hangul)
	s.NowMode = ModeHangul
	initEngnum(s)
	s.TextBuffer = s.TextBuffer[:0]
	s.CursorPos = 0
	s.clampCursor()
}

func hangulInit(h *HangulState) { *h = HangulState{} }

func initEngnum(s *State) {
	s.Engnum = 0
	s.FlagInitengnum = false
	s.FlagEngdelete = false
}

// ---------------------------------------------------------------------
// 입력 처리 - 원본 chunjiin_process_input()
// ---------------------------------------------------------------------

// Key 는 키패드 키(0~11) 하나를 처리한다.
func (s *State) Key(input int) {
	if input < 0 || input > 11 {
		return
	}

	switch s.NowMode {
	case ModeHangul:
		hangulMake(s, input)
		writeHangul(s)
	case ModeEnglish, ModeUpperEnglish:
		engMake(s, input)
		writeEngnum(s)
	case ModeNumber:
		numMake(s, input)
		writeEngnum(s)
	default: // ModeSpecial
		specialMake(s, input)
		writeEngnum(s)
	}
}

// ---------------------------------------------------------------------
// 텍스트 조작
// ---------------------------------------------------------------------

// deleteChar 는 커서 앞의 한 칸을 지운다. 원본 delete_char() 와 같다.
func deleteChar(s *State) {
	if s.CursorPos <= 0 {
		return
	}
	i := s.CursorPos - 1
	s.TextBuffer = append(s.TextBuffer[:i], s.TextBuffer[i+1:]...)
	s.CursorPos--
	s.clampCursor()
}

// textInsert 는 커서 위치에 한 글자를 끼워 넣는다.
func textInsert(s *State, ch rune) {
	if len(s.TextBuffer) >= MaxTextLen-1 {
		return
	}
	if s.CursorPos > len(s.TextBuffer) {
		s.CursorPos = len(s.TextBuffer)
	}
	if s.CursorPos < 0 {
		s.CursorPos = 0
	}
	s.TextBuffer = append(s.TextBuffer, 0)
	copy(s.TextBuffer[s.CursorPos+1:], s.TextBuffer[s.CursorPos:])
	s.TextBuffer[s.CursorPos] = ch
	s.CursorPos++
	s.clampCursor()
}

// ---------------------------------------------------------------------
// 유니코드 조합 - 원본 get_unicode()
// ---------------------------------------------------------------------

// 홀로 보여 줄 때 쓰는 호환 자모
var (
	compatCho = []rune{
		0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142,
		0x3143, 0x3145, 0x3146, 0x3147, 0x3148, 0x3149, 0x314A, 0x314B,
		0x314C, 0x314D, 0x314E,
	}
	compatJung = []rune{
		0x314F, 0x3150, 0x3151, 0x3152, 0x3153, 0x3154, 0x3155, 0x3156,
		0x3157, 0x3158, 0x3159, 0x315A, 0x315B, 0x315C, 0x315D, 0x315E,
		0x315F, 0x3160, 0x3161, 0x3162, 0x3163,
	}
	compatJong = []rune{
		0, 0x3131, 0x3132, 0x3133, 0x3134, 0x3135, 0x3136, 0x3137, 0x3139,
		0x313A, 0x313B, 0x313C, 0x313D, 0x313E, 0x313F, 0x3140, 0x3141, 0x3142,
		0x3144, 0x3145, 0x3146, 0x3147, 0x3148, 0x314A, 0x314B, 0x314C, 0x314D, 0x314E,
	}
)

// 원본의 if/else 사슬을 표로 바꾼 것이다. 사슬 끝의 기본값(ㅎ/ㅣ/ㅎ)도 그대로 둔다.
var (
	choOrder = []string{
		"ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
		"ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
	}
	jungOrder = []string{
		"ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
		"ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
	}
	jongOrder = []string{
		"", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
		"ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
		"ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
	}
)

func indexOf(list []string, v string, fallback int) int {
	for i, s := range list {
		if s == v {
			return i
		}
	}
	return fallback
}

// GetUnicode 는 조합 상태를 화면에 찍을 코드포인트 하나로 만든다.
// 아직 글자가 되지 못했으면 0 을 돌려준다. 원본 get_unicode() 와 같다.
//
// 주의: 초성이 비어 있으면 cho 가 18(=ㅎ)로 떨어진다. 그래서 초성 없이
// 종성만 채우면 엉뚱한 글자가 나온다. 오토마타가 그 상태를 만들지 않는다.
func GetUnicode(h *HangulState, realJong string) rune {
	if h.Chosung == "" {
		if h.Jungsung == "" || h.Jungsung == "·" || h.Jungsung == "‥" {
			return 0
		}
	}

	cho := indexOf(choOrder, h.Chosung, 18) // 없으면 ㅎ

	if h.Jungsung == "" && h.Jongsung == "" {
		return compatCho[cho]
	}
	if h.Jungsung == "·" || h.Jungsung == "‥" {
		return compatCho[cho]
	}

	jung := indexOf(jungOrder, h.Jungsung, 20) // 없으면 ㅣ

	if h.Chosung == "" && h.Jongsung == "" {
		return compatJung[jung]
	}

	jong := indexOf(jongOrder, realJong, 27) // 없으면 ㅎ
	if realJong == "" {
		jong = 0
	}

	if h.Chosung == "" && h.Jungsung == "" {
		return compatJong[jong]
	}

	return rune(44032 + cho*588 + jung*28 + jong)
}

// 겹받침 표. 원본 check_double() 과 같다.
var doubleJong = map[string]map[string]string{
	"ㄱ": {"ㅅ": "ㄳ"},
	"ㄴ": {"ㅈ": "ㄵ", "ㅎ": "ㄶ"},
	"ㄹ": {"ㄱ": "ㄺ", "ㅁ": "ㄻ", "ㅂ": "ㄼ", "ㅅ": "ㄽ", "ㅌ": "ㄾ", "ㅍ": "ㄿ", "ㅎ": "ㅀ"},
	"ㅂ": {"ㅅ": "ㅄ"},
}

// CheckDouble 은 jong 뒤에 jong2 가 붙어 겹받침이 되는지 본다.
// 되지 않으면 빈 문자열을 돌려준다.
func CheckDouble(jong, jong2 string) string {
	if m, ok := doubleJong[jong]; ok {
		return m[jong2]
	}
	return ""
}
