// engine_test.go - 자료로 뽑아 올 수 없는 엔진 시험.
//
// 기대값이 표로 적혀 있는 항목은 C++ 원본에서 뽑아 cases.tsv 에 두고
// cases_test.go 가 돌린다. 여기 남은 것은 C 쪽에서도 계산으로
// 만들어지거나(영문 26자 전수, 라벨-입력 일치) 원본 함수를 직접 부르는
// 시험이라 자료로 옮길 수 없다.
package test

import (
	"strconv"
	"strings"
	"testing"

	"github.com/knix008/chunjiin/internal/engine"
)

// ---------------------------------------------------------------------
// 영문 26자 전수
// ---------------------------------------------------------------------

// TestEnglishAlphabet 은 알파벳 26자를 소문자·대문자로 모두 눌러 본다.
// 키 0~8 에 세 글자씩. i 번째 키를 (j+1) 번 누르면 그 키의 j 번째 글자다.
func TestEnglishAlphabet(t *testing.T) {
	sets := []string{"abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwx", "yz"}

	for _, upper := range []bool{false, true} {
		mode := "E"
		if upper {
			mode = "U"
		}
		for key, set := range sets {
			for i := 0; i < len(set); i++ {
				seq := mode + strings.Repeat(string(rune('0'+key)), i+1)
				want := set[i : i+1]
				if upper {
					want = strings.ToUpper(want)
				}

				t.Run(want, func(t *testing.T) {
					s := engine.New()
					runKeys(s, seq)
					s.Commit()
					if got := s.Text(); got != want {
						t.Errorf("%q -> %q, 기대: %q", seq, got, want)
						return
					}
					t.Logf("%s -> %s", seq, want)
				})
			}
		}
	}
}

// ---------------------------------------------------------------------
// 라벨 - 입력 일치
// ---------------------------------------------------------------------

// TestKeyLabels 는 버튼에 적힌 글자와 실제로 들어가는 글자가 맞는지 본다.
// 키를 한 번 눌렀을 때 나오는 문자는 라벨의 첫 글자여야 한다.
// (배열을 바꿨을 때 라벨만 그대로 남는 실수를 막는다)
func TestKeyLabels(t *testing.T) {
	modes := []struct {
		name string
		seq  string
	}{
		{"한글", "H"}, {"영소", "E"}, {"영대", "U"}, {"숫자", "N"}, {"기호", "S"},
	}

	for _, m := range modes {
		for key := 0; key < engine.KeyCount; key++ {
			name := m.name + " 키" + strconv.Itoa(key)
			t.Run(name, func(t *testing.T) {
				s := engine.New()
				runKeys(s, m.seq)
				label := s.KeyLabel(key)
				if label == "" {
					t.Fatalf("라벨이 비어 있다")
				}
				want := string([]rune(label)[0])
				// 아래아 키는 화면 라벨만 한글 폭 자모(ㆍ) 를 쓴다.
				// 엔진 버퍼는 C++ 원본과 같이 · 를 둔다.
				if want == "ㆍ" {
					want = "·"
				}

				s.Key(key)
				s.Commit()
				if got := s.Text(); got != want {
					t.Errorf("라벨 %q 인데 입력은 %q, 기대: %q", label, got, want)
					return
				}
				t.Logf("라벨 %s -> %s", label, want)
			})
		}
	}
}

// ---------------------------------------------------------------------
// 표시 API 경계
// ---------------------------------------------------------------------

// TestDisplayAPI 는 표시용 API 의 경계를 본다.
func TestDisplayAPI(t *testing.T) {
	s := engine.New()

	t.Run("라벨 -1", func(t *testing.T) {
		if got := s.KeyLabel(-1); got != "" {
			t.Errorf("KeyLabel(-1) = %q, 기대: 빈 문자열", got)
		}
	})
	t.Run("라벨 12", func(t *testing.T) {
		if got := s.KeyLabel(engine.KeyCount); got != "" {
			t.Errorf("KeyLabel(%d) = %q, 기대: 빈 문자열", engine.KeyCount, got)
		}
	})
	t.Run("라벨 빈칸 없음", func(t *testing.T) {
		for m := engine.ModeHangul; m < engine.ModeCount; m++ {
			st := engine.New()
			st.SetMode(m)
			for k := 0; k < engine.KeyCount; k++ {
				if st.KeyLabel(k) == "" {
					t.Errorf("%s 모드 키%d 라벨이 비었다", st.ModeName(), k)
				}
			}
		}
	})
	t.Run("역할 구분", func(t *testing.T) {
		st := engine.New()
		for _, c := range []struct {
			key  int
			want engine.KeyRole
		}{
			{0, engine.RoleVowel}, {1, engine.RoleVowel}, {2, engine.RoleVowel},
			{3, engine.RoleCons}, {9, engine.RoleMod}, {11, engine.RoleMod},
		} {
			if got := st.KeyRoleOf(c.key); got != c.want {
				t.Errorf("키%d 역할 = %v, 기대: %v", c.key, got, c.want)
			}
		}
		// 한글 모드가 아니면 12키가 모두 같은 색이다
		st.SetMode(engine.ModeNumber)
		for k := 0; k < engine.KeyCount; k++ {
			if st.KeyRoleOf(k) != engine.RoleCons {
				t.Errorf("숫자 모드 키%d 는 RoleCons 이어야 한다", k)
			}
		}
	})
	t.Run("상태줄", func(t *testing.T) {
		st := engine.New()
		runKeys(st, "301")
		want := "한글    조합 ㄱ + ㅏ + -    1자"
		if got := st.StatusText(); got != want {
			t.Errorf("StatusText() = %q, 기대: %q", got, want)
		}
	})
	t.Run("모드 이름 5개", func(t *testing.T) {
		for m := engine.ModeHangul; m < engine.ModeCount; m++ {
			if engine.ModeNames[m] == "" {
				t.Errorf("모드 %d 이름이 비었다", m)
			}
		}
	})
}

// ---------------------------------------------------------------------
// 원본 chunjiin.c 함수 직접 확인
// ---------------------------------------------------------------------

func TestCheckDouble(t *testing.T) {
	pairs := []struct{ a, b, want string }{
		{"ㄱ", "ㅅ", "ㄳ"}, {"ㄴ", "ㅈ", "ㄵ"}, {"ㄴ", "ㅎ", "ㄶ"},
		{"ㄹ", "ㄱ", "ㄺ"}, {"ㄹ", "ㅁ", "ㄻ"}, {"ㄹ", "ㅂ", "ㄼ"},
		{"ㄹ", "ㅅ", "ㄽ"}, {"ㄹ", "ㅌ", "ㄾ"}, {"ㄹ", "ㅍ", "ㄿ"},
		{"ㄹ", "ㅎ", "ㅀ"}, {"ㅂ", "ㅅ", "ㅄ"},
		{"ㄱ", "ㄱ", ""}, {"ㄴ", "ㅅ", ""}, {"ㄹ", "ㄴ", ""},
		{"ㅁ", "ㅅ", ""}, {"ㅅ", "ㅅ", ""}, {"ㅇ", "ㄱ", ""},
	}
	for _, p := range pairs {
		t.Run(p.a+"+"+p.b, func(t *testing.T) {
			got := engine.CheckDouble(p.a, p.b)
			if got != p.want {
				t.Errorf("CheckDouble(%q, %q) = %q, 기대: %q", p.a, p.b, got, p.want)
				return
			}
			if got == "" {
				t.Logf("%s + %s -> 겹받침 아님", p.a, p.b)
			} else {
				t.Logf("%s + %s -> %s", p.a, p.b, got)
			}
		})
	}
}

func TestGetUnicode(t *testing.T) {
	cases := []struct {
		name            string
		cho, jung, jong string
		want            rune
	}{
		{"빈 상태", "", "", "", 0},
		{"초성만 ㄱ", "ㄱ", "", "", 0x3131},
		{"초성만 ㅎ", "ㅎ", "", "", 0x314E},
		{"중성만 ㅏ", "", "ㅏ", "", 0x314F},
		{"중성만 ㅣ", "", "ㅣ", "", 0x3163},
		{"아래아 중간", "ㄱ", "·", "", 0x3131},
		{"가", "ㄱ", "ㅏ", "", 0xAC00},
		{"간", "ㄱ", "ㅏ", "ㄴ", 0xAC04},
		{"힣", "ㅎ", "ㅣ", "ㅎ", 0xD7A3},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := engine.HangulState{Chosung: c.cho, Jungsung: c.jung, Jongsung: c.jong}
			got := engine.GetUnicode(&h, c.jong)
			if got != c.want {
				t.Errorf("GetUnicode = U+%04X, 기대: U+%04X", got, c.want)
				return
			}
			t.Logf("%s+%s+%s -> U+%04X", dash(c.cho), dash(c.jung), dash(c.jong), got)
		})
	}
}

// dash 는 빈 자리를 - 로 보여 준다.
func dash(v string) string {
	if v == "" {
		return "-"
	}
	return v
}

// TestTextUTF8 은 원본 wchar_to_utf8() 자리를 대신하는 Text() 를 본다.
func TestTextUTF8(t *testing.T) {
	cases := []struct{ name, src string }{
		{"빈 문자열", ""},
		{"ASCII", "A"},
		{"한 글자", "가"},
		{"여러 글자", "가나다"},
		{"섞임", "a가1!"},
		{"낱자", "ㄱㅏ"},
		{"줄바꿈", "가\n나"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := engine.New()
			s.InsertString(c.src)
			if got := s.Text(); got != c.src {
				t.Errorf("Text() = %q, 기대: %q", got, c.src)
			}
			if s.Len() != len([]rune(c.src)) {
				t.Errorf("Len() = %d, 기대: %d", s.Len(), len([]rune(c.src)))
			}
		})
	}
}

// ---------------------------------------------------------------------
// 경계 · 예외
// ---------------------------------------------------------------------

func TestEdgeCases(t *testing.T) {
	t.Run("범위밖 키", func(t *testing.T) {
		s := engine.New()
		s.Key(-1)
		s.Key(12)
		s.Key(99)
		if got := s.Text(); got != "" {
			t.Errorf("범위 밖 키가 입력되었다: %q", got)
		}
	})

	t.Run("버퍼 한계", func(t *testing.T) {
		s := engine.New()
		for i := 0; i < engine.MaxTextLen+100; i++ {
			s.InsertChar('x')
		}
		if s.Len() != engine.MaxTextLen-1 {
			t.Errorf("Len() = %d, 기대: %d", s.Len(), engine.MaxTextLen-1)
		}
		if s.CursorPos > engine.MaxTextLen-1 {
			t.Errorf("CursorPos = %d, 기대: <= %d", s.CursorPos, engine.MaxTextLen-1)
		}
	})

	t.Run("빈 상태 조작", func(t *testing.T) {
		s := engine.New()
		s.Commit()
		s.Backspace()
		s.MoveCursor(-5)
		s.MoveCursor(5)
		s.Commit()
		if s.Text() != "" || s.CursorPos != 0 {
			t.Errorf("빈 상태가 더럽혀졌다: %q @%d", s.Text(), s.CursorPos)
		}
	})

	t.Run("Reset", func(t *testing.T) {
		s := engine.New()
		runKeys(s, "301477")
		s.Reset()
		if s.Text() != "" || s.CursorPos != 0 || s.ComposeLen != 0 ||
			s.LastKey != -1 || s.PrevMergeable {
			t.Errorf("Reset 이 확장 필드를 지우지 않았다: %+v", s)
		}
	})

	t.Run("Delete", func(t *testing.T) {
		s := engine.New()
		runKeys(s, "301401{")
		s.Delete()
		if got := s.Text(); got != "나" {
			t.Errorf("Delete 후 %q, 기대: %q", got, "나")
		}
	})

	t.Run("SetText", func(t *testing.T) {
		s := engine.New()
		runKeys(s, "301")
		s.SetText("안녕하세요\r\n반갑습니다")
		want := "안녕하세요\n반갑습니다"
		if got := s.Text(); got != want {
			t.Errorf("SetText 후 %q, 기대: %q", got, want)
		}
		if s.CursorPos != s.Len() {
			t.Errorf("커서가 끝에 있어야 한다: @%d / %d", s.CursorPos, s.Len())
		}
	})
}
