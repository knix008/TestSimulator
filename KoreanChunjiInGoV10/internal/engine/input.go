// input.go - 천지인 입력 오토마타. KoreanChunJiInC++ 의 src/input.c 이식.
//
// 키 배열 (인덱스 0~11, 3열 4행)
//
//	ㅣ     ·      ㅡ        0  1  2
//	ㄱㅋ   ㄴㄹ   ㄷㅌ      3  4  5
//	ㅂㅍ   ㅅㅎ   ㅈㅊ      6  7  8
//	. ,    ㅇㅁ   ? !       9  10 11
//
// 자음 키는 연타하면 순환한다(ㄱ→ㅋ→ㄲ→ㄱ...).
// 거센소리·된소리가 모두 순환에 들어 있으므로 획추가/쌍자음 키는 두지 않고,
// 그 자리에 문장부호 키를 둔다.
package engine

const (
	keyI      = 0  // ㅣ
	keyDot    = 1  // 아래아
	keyEu     = 2  // ㅡ
	keyPunct1 = 9  // . ,
	keyPunct2 = 11 // ? !
)

// consCycle 은 자음 키의 순환 목록이다. 자음 키가 아니면 비어 있다.
var consCycle = [KeyCount][]string{
	nil,             // 0  ㅣ
	nil,             // 1  아래아
	nil,             // 2  ㅡ
	{"ㄱ", "ㅋ", "ㄲ"}, // 3
	{"ㄴ", "ㄹ"},      // 4
	{"ㄷ", "ㅌ", "ㄸ"}, // 5
	{"ㅂ", "ㅍ", "ㅃ"}, // 6
	{"ㅅ", "ㅎ", "ㅆ"}, // 7
	{"ㅈ", "ㅊ", "ㅉ"}, // 8
	nil,             // 9  . ,
	{"ㅇ", "ㅁ"},      // 10
	nil,             // 11 ? !
}

// vowelRule 은 모음 전이표의 한 줄이다.
// from 상태에서 ㅣ / 아래아 / ㅡ 키를 눌렀을 때의 다음 상태를 담는다.
// noVowel 이면 그 조합은 존재하지 않으므로 현재 음절을 확정하고
// 새 음절을 시작한다. prev 는 백스페이스로 한 단계 되돌릴 때의 상태다.
type vowelRule struct {
	from  string
	byI   string
	byDot string
	byEu  string
	prev  string
}

// noVowel 은 그런 조합이 없다는 표시다(원본의 NULL).
const noVowel = "-"

var vowelRules = []vowelRule{
	//  from    ㅣ        아래아     ㅡ         prev
	{"", "ㅣ", "·", "ㅡ", ""},
	{"·", "ㅓ", "‥", "ㅗ", ""},
	{"‥", "ㅕ", "·", "ㅛ", "·"},
	{"ㅣ", noVowel, "ㅏ", noVowel, ""},
	{"ㅡ", "ㅢ", "ㅜ", noVowel, ""},
	{"ㅏ", "ㅐ", "ㅑ", noVowel, "ㅣ"},
	{"ㅑ", "ㅒ", "ㅏ", noVowel, "ㅏ"},
	{"ㅓ", "ㅔ", "ㅕ", noVowel, "·"},
	{"ㅕ", "ㅖ", "ㅓ", noVowel, "ㅓ"},
	{"ㅗ", "ㅚ", "ㅛ", noVowel, "·"},
	{"ㅛ", noVowel, "ㅗ", noVowel, "ㅗ"},
	{"ㅜ", "ㅟ", "ㅠ", noVowel, "ㅡ"},
	{"ㅠ", "ㅝ", "ㅜ", noVowel, "ㅜ"},
	{"ㅚ", noVowel, "ㅘ", noVowel, "ㅗ"},
	{"ㅘ", "ㅙ", noVowel, noVowel, "ㅚ"},
	{"ㅝ", "ㅞ", noVowel, noVowel, "ㅠ"},
	{"ㅐ", noVowel, noVowel, noVowel, "ㅏ"},
	{"ㅒ", noVowel, noVowel, noVowel, "ㅑ"},
	{"ㅔ", noVowel, noVowel, noVowel, "ㅓ"},
	{"ㅖ", noVowel, noVowel, noVowel, "ㅕ"},
	{"ㅙ", noVowel, noVowel, noVowel, "ㅘ"},
	{"ㅞ", noVowel, noVowel, noVowel, "ㅝ"},
	{"ㅟ", noVowel, noVowel, noVowel, "ㅜ"},
	{"ㅢ", noVowel, noVowel, noVowel, "ㅡ"},
}

// validJong 은 받침으로 쓸 수 있는 자음이다 (ㄸ ㅃ ㅉ 은 불가).
var validJong = map[string]bool{
	"ㄱ": true, "ㄲ": true, "ㄴ": true, "ㄷ": true, "ㄹ": true, "ㅁ": true,
	"ㅂ": true, "ㅅ": true, "ㅆ": true, "ㅇ": true, "ㅈ": true, "ㅊ": true,
	"ㅋ": true, "ㅌ": true, "ㅍ": true, "ㅎ": true,
}

// ---------------------------------------------------------------------
// 작은 도우미들
// ---------------------------------------------------------------------

func isDotState(jung string) bool { return jung == "·" || jung == "‥" }

func isValidJong(c string) bool { return c != "" && validJong[c] }

// canCombineJong 은 jong + c 가 겹받침을 이루는지 본다.
func canCombineJong(jong, c string) bool { return CheckDouble(jong, c) != "" }

func findVowelRule(jung string) *vowelRule {
	for i := range vowelRules {
		if vowelRules[i].from == jung {
			return &vowelRules[i]
		}
	}
	return nil
}

// vowelNext 는 모음 전이 결과를 돌려준다. 불가능하면 ok 가 false 다.
func vowelNext(jung string, key int) (string, bool) {
	r := findVowelRule(jung)
	if r == nil {
		return "", false
	}
	var v string
	switch key {
	case keyI:
		v = r.byI
	case keyDot:
		v = r.byDot
	case keyEu:
		v = r.byEu
	default:
		return "", false
	}
	if v == noVowel {
		return "", false
	}
	return v, true
}

func vowelPrev(jung string) string {
	if r := findVowelRule(jung); r != nil {
		return r.prev
	}
	return ""
}

func cycleLen(key int) int { return len(consCycle[key]) }

func isConsKey(key int) bool {
	return key >= 0 && key < KeyCount && len(consCycle[key]) > 0
}

func isVowelKey(key int) bool { return key == keyI || key == keyDot || key == keyEu }

// consSlot 은 지금 조합에서 "마지막으로 채워진 자음 자리"를 읽는다.
// ok 가 false 면 자음 자리가 아니다.
func consSlot(h *HangulState) (string, bool) {
	switch h.Step {
	case SlotChosung:
		return h.Chosung, true
	case SlotJongsung:
		return h.Jongsung, true
	case SlotJongsung2:
		return h.Jongsung2, true
	}
	return "", false
}

func setConsSlot(h *HangulState, v string) {
	switch h.Step {
	case SlotChosung:
		h.Chosung = v
	case SlotJongsung:
		h.Jongsung = v
	case SlotJongsung2:
		h.Jongsung2 = v
	}
}

// ---------------------------------------------------------------------
// 화면 출력 - 조합 중인 글자는 CursorPos-1 자리에서 계속 갱신된다
// ---------------------------------------------------------------------

// composeDisplay 는 조합 중인 상태를 화면에 보여줄 문자열로 만든다. 최대 2칸.
//
// 아래아만 찍힌 중간 상태에서는 GetUnicode 가 0 을 돌려주므로 아무것도
// 보이지 않는다. 그래서 이때는 초성(있으면)과 아래아를 직접 이어
// "ㄱ·", "·", "‥" 처럼 눈에 보이게 만든다.
func composeDisplay(h *HangulState) []rune {
	out := make([]rune, 0, 2)

	if isDotState(h.Jungsung) {
		if h.Chosung != "" {
			// 초성 홀로일 때의 호환 자모를 얻으려고 중성을 잠시 비운다
			saved := h.Jungsung
			h.Jungsung = ""
			code := GetUnicode(h, "")
			h.Jungsung = saved
			if code != 0 {
				out = append(out, code)
			}
		}
		out = append(out, []rune(h.Jungsung)[0]) // 아래아 한 개 또는 두 개
		return out
	}

	realJong := ""
	if h.Jongsung2 != "" {
		realJong = CheckDouble(h.Jongsung, h.Jongsung2)
		if realJong == "" {
			realJong = h.Jongsung
		}
	} else if h.Jongsung != "" {
		realJong = h.Jongsung
	}

	if code := GetUnicode(h, realJong); code != 0 {
		out = append(out, code)
	}
	return out
}

// writeHangul 은 조합 중인 글자를 화면에 반영한다.
// 직전에 그려 둔 ComposeLen 칸을 지우고 새로 그린다.
func writeHangul(s *State) {
	shown := composeDisplay(&s.Hangul)

	for s.ComposeLen > 0 {
		deleteChar(s)
		s.ComposeLen--
	}
	for _, ch := range shown {
		before := len(s.TextBuffer)
		textInsert(s, ch)
		if len(s.TextBuffer) > before {
			s.ComposeLen++
		}
	}
	s.Hangul.FlagWriting = s.ComposeLen > 0
}

func writeEngnum(s *State) {
	if s.Engnum == 0 {
		return
	}

	if s.FlagEngdelete && s.CursorPos > 0 {
		s.TextBuffer[s.CursorPos-1] = s.Engnum
	} else {
		textInsert(s, s.Engnum)
	}
	s.FlagEngdelete = true
	s.FlagInitengnum = true
}

// ---------------------------------------------------------------------
// 음절 확정
// ---------------------------------------------------------------------

// commitAndStart 는 현재 조합을 버퍼에 반영하고 새 음절을 시작할 수 있는
// 상태로 만든다.
//
// 아직 모음이 되지 못한 아래아도 그대로 둔다. 사용자가 그걸 남길 생각이었는지
// 아닌지 알 수 없으므로 임의로 지우지 않는다.
func commitAndStart(s *State) {
	writeHangul(s)
	hangulInit(&s.Hangul) // FlagWriting = false -> 다음 글자는 새로 삽입
	s.Hangul.FlagAddcursor = true
	s.ComposeLen = 0 // 이미 찍힌 칸은 확정 글자가 된다
	s.PrevMergeable = false
	s.LastKey = -1
	s.TapCount = 0
}

// Commit 은 조합 중인 글자를 확정한다(더 이상 수정되지 않게 만든다).
func (s *State) Commit() {
	if s.NowMode == ModeHangul {
		if s.Hangul.FlagWriting {
			writeHangul(s)
		}
		hangulInit(&s.Hangul)
		s.ComposeLen = 0
	} else {
		initEngnum(s)
	}
	s.PrevMergeable = false
	s.LastKey = -1
	s.TapCount = 0
}

// ---------------------------------------------------------------------
// 한글 오토마타
// ---------------------------------------------------------------------

// startWithChosung 은 자음 c 를 새 음절의 초성으로 삼는다.
// mergeable 이면 방금 확정한 음절을 기억해 둔다. 같은 키를 한 번 더 눌러
// 겹받침이 되는 자음이 나오면 tryMergeJong 이 도로 합친다.
func startWithChosung(s *State, c string, key int, mergeable bool) {
	previous := s.Hangul

	commitAndStart(s)
	if mergeable {
		s.PrevSyllable = previous
		s.PrevMergeable = true
	}
	s.Hangul.Chosung = c
	s.Hangul.Step = SlotChosung
	s.LastKey = key
	s.TapCount = 0
}

// tryMergeJong 은 떨어져 나온 초성을 앞 음절의 겹받침으로 되돌린다.
// 성공하면 조합 영역이 앞 칸까지 넓어지고, 이어지는 writeHangul 이
// 두 칸을 지우고 합쳐진 한 글자를 그린다.
func tryMergeJong(s *State, key int) bool {
	h := &s.Hangul
	prev := &s.PrevSyllable
	n := cycleLen(key)

	if h.Step != SlotChosung || h.Jungsung != "" {
		return false
	}
	if prev.Jongsung == "" || prev.Jongsung2 != "" {
		return false
	}

	for i := 1; i <= n; i++ {
		idx := (s.TapCount + i) % n
		cand := consCycle[key][idx]

		if !canCombineJong(prev.Jongsung, cand) {
			continue
		}

		s.ComposeLen++ // 앞 칸(확정된 음절)도 다시 그린다
		s.Hangul = *prev
		s.Hangul.Jongsung2 = cand
		s.Hangul.Step = SlotJongsung2
		s.Hangul.FlagWriting = true
		s.TapCount = idx
		return true
	}
	return false
}

// cycleConsonant 는 같은 자음 키 연타 시 현재 자리에서 다음 후보로 순환한다.
func cycleConsonant(s *State, key int) bool {
	h := &s.Hangul
	slot, ok := consSlot(h)
	n := cycleLen(key)

	if !ok || slot == "" || n == 0 {
		return false
	}

	// 다음 후보부터 한 바퀴 돌면서 이 자리에 넣을 수 있는 것을 찾는다
	for i := 1; i <= n; i++ {
		idx := (s.TapCount + i) % n
		cand := consCycle[key][idx]

		if n > 1 && cand == slot {
			continue
		}
		if h.Step == SlotJongsung && !isValidJong(cand) {
			continue
		}
		if h.Step == SlotJongsung2 && !canCombineJong(h.Jongsung, cand) {
			continue
		}

		setConsSlot(h, cand)
		s.TapCount = idx
		h.FlagDoubled = idx == 2 // 순환 3번째 자리는 항상 된소리
		return true
	}
	return false
}

func hangulConsonant(s *State, key int) {
	h := &s.Hangul
	c := consCycle[key][0]
	mergeable := s.PrevMergeable

	s.PrevMergeable = false

	if s.LastKey == key {
		if mergeable && tryMergeJong(s, key) {
			return
		}
		if cycleConsonant(s, key) {
			return
		}
	}

	if h.Chosung == "" && h.Jungsung == "" {
		// 빈 음절 -> 초성
		h.Chosung = c
		h.Step = SlotChosung
		s.LastKey = key
		s.TapCount = 0
		return
	}

	if h.Jungsung == "" || isDotState(h.Jungsung) {
		// 초성만 있거나 아래아만 찍힌 상태 -> 앞을 확정하고 새 음절
		startWithChosung(s, c, key, false)
		return
	}

	if h.Chosung == "" {
		// 모음만 있던 상태 -> 앞을 확정하고 새 음절
		startWithChosung(s, c, key, false)
		return
	}

	if h.Jongsung == "" {
		if isValidJong(c) {
			h.Jongsung = c
			h.Step = SlotJongsung
			s.LastKey = key
			s.TapCount = 0
		} else {
			startWithChosung(s, c, key, false)
		}
		return
	}

	if h.Jongsung2 == "" && canCombineJong(h.Jongsung, c) {
		h.Jongsung2 = c
		h.Step = SlotJongsung2
		s.LastKey = key
		s.TapCount = 0
		return
	}

	// 받침 뒤에 붙지 못한 자음 -> 새 음절.
	// 겹받침으로 되돌아올 수 있게 기억해 둔다.
	startWithChosung(s, c, key, h.Jongsung2 == "")
}

func hangulVowel(s *State, key int) {
	h := &s.Hangul

	s.PrevMergeable = false

	// 받침이 있으면 연음: 마지막 자음을 새 음절의 초성으로 넘긴다
	if h.Jongsung != "" {
		var moved string

		if h.Jongsung2 != "" {
			moved = h.Jongsung2
			h.Jongsung2 = ""
		} else {
			moved = h.Jongsung
			h.Jongsung = ""
		}

		commitAndStart(s) // 받침을 뺀 모습으로 앞 글자 확정
		h.Chosung = moved
		h.Step = SlotChosung
	}

	next, ok := vowelNext(h.Jungsung, key)
	if !ok {
		// 이어질 수 없는 모음 조합 -> 앞을 확정하고 새 음절의 중성으로
		commitAndStart(s)
		next, ok = vowelNext("", key)
		if !ok {
			return
		}
	}

	h.Jungsung = next
	h.Step = SlotJungsung
	h.FlagDotused = isDotState(next)
	s.LastKey = key
	s.TapCount = 0
}

// punctSet 은 문장부호 키 (9 = ". ,", 11 = "? !") 의 순환 목록이다.
var punctSet = [2][]rune{[]rune(".,"), []rune("?!")}

func hangulPunct(s *State, key int) {
	set := punctSet[0]
	if key == keyPunct2 {
		set = punctSet[1]
	}
	n := len(set)
	idx := 0

	s.PrevMergeable = false

	if s.LastKey == key && !s.Hangul.FlagWriting && s.CursorPos > 0 {
		idx = (s.TapCount + 1) % n
		s.TextBuffer[s.CursorPos-1] = set[idx]
	} else {
		commitAndStart(s)       // 조합 중인 글자를 확정하고
		textInsert(s, set[idx]) // 부호를 새로 넣는다
	}
	s.LastKey = key
	s.TapCount = idx
}

func hangulMake(s *State, input int) {
	if input < 0 || input >= KeyCount {
		return
	}

	s.Hangul.FlagSpace = false
	s.Hangul.FlagAddcursor = false

	switch {
	case isVowelKey(input):
		hangulVowel(s, input)
	case isConsKey(input):
		hangulConsonant(s, input)
	case input == keyPunct1 || input == keyPunct2:
		hangulPunct(s, input)
	}
}

// ---------------------------------------------------------------------
// 영문 / 숫자 / 기호
// ---------------------------------------------------------------------

// engMap 은 영문 배열이다.
// 한 키에 세 글자까지만 둔다. 그래서 알파벳 26자가 위 3x3 (0~8번) 을 채우고,
// 마지막 줄 세 키(9~11)가 자주 쓰는 기호를 맡는다.
// 나머지 기호는 기호 모드에서 넣는다.
// 띄어쓰기는 스페이스 버튼과 스페이스바가 따로 있으므로 키패드에 두지 않는다.
//
//	abc   def   ghi
//	jkl   mno   pqr
//	stu   vwx   yz
//	.,?   !'"   -:@
var engMap = [KeyCount]string{
	"abc", "def", "ghi",
	"jkl", "mno", "pqr",
	"stu", "vwx", "yz",
	".,?", "!'\"", "-:@",
}

// numMap 은 키마다 숫자 하나씩이다. 순환하지 않는다.
var numMap = []rune("123456789*0#")

// specialMap 은 기호 모드다. 한 키에 세 개씩, 12키로 36개를 덮는다.
// 영문 모드에 넣지 못한 기호는 모두 여기에 있다.
var specialMap = [KeyCount]string{
	".,:", "?!;", "'\"`",
	"-_~", "+=*", "/\\|",
	"()&", "[]^", "{}%",
	"<>#", "@$₩", "※…・",
}

// multitapMake 는 휴대전화식 멀티탭이다. 같은 키를 연달아 누르면 목록을 돈다.
func multitapMake(s *State, input int, set string, toUpper bool) {
	runes := []rune(set)
	n := len(runes)
	if n == 0 {
		return
	}

	if s.LastKey == input && s.FlagEngdelete {
		s.TapCount = (s.TapCount + 1) % n
	} else {
		s.TapCount = 0
		s.FlagEngdelete = false // 새 문자로 삽입
	}

	c := runes[s.TapCount]
	if toUpper && c >= 'a' && c <= 'z' {
		c = c - 'a' + 'A'
	}
	s.Engnum = c
	s.LastKey = input
}

func engMake(s *State, input int) {
	if input < 0 || input >= KeyCount {
		return
	}
	multitapMake(s, input, engMap[input], s.NowMode == ModeUpperEnglish)
}

func specialMake(s *State, input int) {
	if input < 0 || input >= KeyCount {
		return
	}
	multitapMake(s, input, specialMap[input], false)
}

func numMake(s *State, input int) {
	if input < 0 || input >= KeyCount {
		return
	}
	s.Engnum = numMap[input]
	s.FlagEngdelete = false
	s.LastKey = -1
	s.TapCount = 0
}

// ---------------------------------------------------------------------
// GUI 용 편집 API
// ---------------------------------------------------------------------

// New 는 초기화된 입력기 상태를 만든다. 새 상태는 항상 이걸로 시작한다.
func New() *State {
	s := &State{TextBuffer: make([]rune, 0, 256)}
	s.Reset()
	return s
}

// Reset 은 원본 chunjiin_init() 에 더해 확장 필드까지 초기화한다.
func (s *State) Reset() {
	chunjiinInit(s)
	s.LastKey = -1
	s.TapCount = 0
	s.ComposeLen = 0
	s.PrevMergeable = false
	hangulInit(&s.PrevSyllable)
}

// Clear 는 모드를 유지한 채 전체를 지운다.
func (s *State) Clear() {
	mode := s.NowMode
	s.Reset()
	s.NowMode = mode
}

// InsertChar 는 임의의 문자를 커서 위치에 그대로 넣는다
// (공백, 줄바꿈, 물리 키보드 직접 입력).
func (s *State) InsertChar(ch rune) {
	s.Commit()
	textInsert(s, ch)
}

// InsertString 은 여러 글자를 차례로 넣는다(붙여넣기, 파일 열기).
// 캐리지 리턴은 버린다.
func (s *State) InsertString(text string) {
	for _, ch := range text {
		if ch == '\r' {
			continue
		}
		s.InsertChar(ch)
	}
}

// Space 는 조합을 확정한 뒤 공백을 넣는다.
func (s *State) Space() {
	s.InsertChar(' ')
	s.Hangul.FlagSpace = true
}

// Backspace 는 조합 중이면 낱자 단위로 되돌리고, 아니면 글자를 지운다.
func (s *State) Backspace() {
	h := &s.Hangul

	if s.NowMode == ModeHangul && h.FlagWriting {
		switch {
		case h.Jongsung2 != "":
			h.Jongsung2 = ""
			h.Step = SlotJongsung
		case h.Jongsung != "":
			h.Jongsung = ""
			if h.Jungsung == "" {
				h.Step = SlotChosung
			} else {
				h.Step = SlotJungsung
			}
		case h.Jungsung != "":
			h.Jungsung = vowelPrev(h.Jungsung)
			switch {
			case h.Jungsung != "":
				h.Step = SlotJungsung
			case h.Chosung != "":
				h.Step = SlotChosung
			default:
				h.Step = SlotNone
			}
		case h.Chosung != "":
			h.Chosung = ""
			h.Step = SlotNone
		}

		writeHangul(s)

		if h.Chosung == "" && h.Jungsung == "" && h.Jongsung == "" {
			hangulInit(&s.Hangul)
		}
		s.PrevMergeable = false
		s.LastKey = -1
		s.TapCount = 0
		return
	}

	s.Commit()
	deleteChar(s)
}

// Delete 는 커서 뒤의 한 글자를 지운다.
func (s *State) Delete() {
	if s.CursorPos < len(s.TextBuffer) {
		s.MoveCursor(1)
		s.Backspace()
	}
}

// MoveCursor 는 커서를 delta 만큼 옮긴다. 조합은 확정된다.
func (s *State) MoveCursor(delta int) {
	s.Commit()
	s.CursorPos += delta
	if s.CursorPos < 0 {
		s.CursorPos = 0
	}
	if s.CursorPos > len(s.TextBuffer) {
		s.CursorPos = len(s.TextBuffer)
	}
	s.clampCursor()
}

// SetCursor 는 커서를 절대 위치로 옮긴다. 조합은 확정된다.
func (s *State) SetCursor(pos int) {
	s.Commit()
	switch {
	case pos < 0:
		s.CursorPos = 0
	case pos > len(s.TextBuffer):
		s.CursorPos = len(s.TextBuffer)
	default:
		s.CursorPos = pos
	}
	s.clampCursor()
}

// SetMode 는 입력 모드를 바꾼다. 조합은 확정된다.
func (s *State) SetMode(mode InputMode) {
	if mode < 0 || mode >= ModeCount {
		return
	}
	s.Commit()
	s.NowMode = mode
	initEngnum(s)
	s.LastKey = -1
	s.TapCount = 0
}

// CycleMode 는 한글 -> 영소 -> 영대 -> 숫자 -> 기호 -> 한글 순으로 돈다.
func (s *State) CycleMode() { s.SetMode((s.NowMode + 1) % ModeCount) }

// BreakMultitap 은 연타 순환을 끊는다.
// "안녕"처럼 같은 키(ㄴ)가 연달아 필요한 경우, 이 호출 이후의 같은 키는
// 순환(ㄴ→ㄹ)이 아니라 새 자음 입력으로 처리된다. 조합 자체는 유지된다.
func (s *State) BreakMultitap() {
	s.LastKey = -1
	s.TapCount = 0
	if s.NowMode != ModeHangul {
		s.FlagEngdelete = false
	}
}

// SetText 는 버퍼를 통째로 갈아 끼우고 커서를 끝으로 보낸다(파일 열기용).
func (s *State) SetText(text string) {
	s.Clear()
	s.InsertString(text)
}
