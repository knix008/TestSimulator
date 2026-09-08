// gen-testcases - C++ 판의 회귀 시험 자료를 뽑아 온다.
//
// 참고하는 원본은 KoreanChunJiInC++/tests/test_engine.c 다. 기대값을 손으로
// 옮겨 적으면 원본이 고쳐졌을 때 조용히 어긋나므로, 그 파일에서 직접 읽어
// test/cases.tsv 로 적어 둔다. test 폴더의 시험이 그것을 읽어 돈다.
// 뽑아낸 결과는 저장소에 함께 두므로, C++ 판이 없는 곳에서도 시험은
// 그대로 돌아간다.
//
//	go run ./cmd/gen-testcases                       기본 경로에서 뽑는다
//	go run ./cmd/gen-testcases -src <경로> -out <경로>
//
// 뽑아 오는 것
//   - expect / expect_live / expect_cursor / expect_comp / expect_mode 호출
//   - 함수 안에 표로 적어 둔 { "이름", "키", L"기대" } 꼴의 줄
//   - 모음 전이표 { "이름", "키", L"+ㅣ", L"+·", L"+ㅡ" } (세 항목으로 편다)
//
// 뽑지 않는 것 (C 코드에서 계산으로 만들어지므로 Go 쪽에 그대로 둔다)
//   - 영문 26자 전수, 라벨-입력 일치, 원본 함수 직접 호출, 경계·예외
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// 종류 이름. cases.tsv 의 첫 칸에 들어간다.
const (
	kindExpect = "expect" // 확정한 뒤 버퍼를 비교
	kindLive   = "live"   // 확정하지 않고 조합 중인 화면을 비교
	kindCursor = "cursor" // 버퍼와 커서 위치를 함께 비교
	kindComp   = "comp"   // 상태줄 조합 문자열을 비교
	kindMode   = "mode"   // 모드 이름을 비교
)

type testCase struct {
	kind    string
	section string
	name    string
	seq     string
	want    string
	cursor  int
	hasCur  bool
}

var (
	reFunc    = regexp.MustCompile(`^static void (test_\w+)\(`)
	reSection = regexp.MustCompile(`section\("((?:[^"\\]|\\.)*)"\)`)

	// expect("이름", "키", L"기대")  /  expect_cursor("이름", "키", L"기대", 3)
	reCall = regexp.MustCompile(
		`\bexpect(_live|_cursor|_comp|_mode)?\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*L"((?:[^"\\]|\\.)*)"\s*(?:,\s*(-?\d+)\s*)?\)`)

	// { "이름", "키", L"기대" }  또는  { "이름", "키", L"a", L"b", L"c" }
	reRow = regexp.MustCompile(
		`\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*((?:L"(?:[^"\\]|\\.)*"\s*,?\s*)+)\}`)
	reWide = regexp.MustCompile(`L"((?:[^"\\]|\\.)*)"`)

	// 파일 바깥에 놓인 표.  static const VowelStep VOWEL_STEPS[] = {
	reTable = regexp.MustCompile(`^static const \w+ (\w+)\[\]`)
	reIdent = regexp.MustCompile(`\b([A-Z][A-Z0-9_]{2,})\b`)
)

// 모음 전이표를 펼 때 쓰는 키와 이름표. C 쪽 test_vowel_table() 과 같다.
var (
	vowelKeys  = []string{"0", "1", "2"}
	vowelMarks = []string{"+ㅣ", "+·", "+ㅡ"}
)

func main() {
	var src, out string
	flag.StringVar(&src, "src",
		filepath.FromSlash("../KoreanChunJiInC++/tests/test_engine.c"),
		"참고할 C++ 시험 파일")
	flag.StringVar(&out, "out",
		filepath.FromSlash("test/cases.tsv"),
		"뽑아낸 자료를 적을 파일")
	flag.Parse()

	data, err := os.ReadFile(src)
	if err != nil {
		fatal("원본 시험 파일을 읽지 못했습니다: %v", err)
	}

	cases, sections := parse(string(data))
	if len(cases) == 0 {
		fatal("뽑아낸 항목이 없습니다. %s 의 모습이 바뀌었는지 보세요.", src)
	}

	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		fatal("폴더를 만들지 못했습니다: %v", err)
	}
	if err := os.WriteFile(out, []byte(render(src, cases)), 0o644); err != nil {
		fatal("자료를 쓰지 못했습니다: %v", err)
	}

	fmt.Printf("%s\n  -> %s\n  %d 구역 %d 항목\n", src, out, len(sections), len(cases))
	for _, s := range sections {
		fmt.Printf("     %-24s %3d\n", s.name, s.count)
	}
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "gen-testcases: "+format+"\n", args...)
	os.Exit(1)
}

type sectionCount struct {
	name  string
	count int
}

// parse 는 C 시험 파일에서 항목을 뽑아낸다.
//
// 표로 적어 둔 줄은 함수 맨 앞에 오고 section() 호출은 그 뒤에 오므로,
// 먼저 함수마다 구역 이름을 모아 둔 다음 다시 훑으며 항목을 만든다.
func parse(src string) ([]testCase, []sectionCount) {
	lines := strings.Split(src, "\n")

	// 1차: 함수마다 구역 이름과, 그 함수가 이름을 대는 표를 모은다.
	sectionOf := map[string]string{}
	usedBy := map[string]string{} // 표 이름 -> 그 표를 쓰는 함수
	fn := ""
	for _, line := range lines {
		if m := reFunc.FindStringSubmatch(line); m != nil {
			fn = m[1]
			continue
		}
		if fn == "" {
			continue
		}
		if m := reSection.FindStringSubmatch(line); m != nil {
			if _, seen := sectionOf[fn]; !seen {
				sectionOf[fn] = unquote(m[1])
			}
		}
		for _, m := range reIdent.FindAllStringSubmatch(line, -1) {
			if _, seen := usedBy[m[1]]; !seen {
				usedBy[m[1]] = fn
			}
		}
	}

	// 2차: 항목 모으기.
	//
	// 표는 함수 안에도 있고 파일 바깥에도 있다(VOWEL_STEPS).
	// 바깥에 있는 표는 그 표를 쓰는 함수의 구역에 넣는다.
	var cases []testCase
	fn = ""
	table := ""
	for _, line := range lines {
		if m := reFunc.FindStringSubmatch(line); m != nil {
			fn, table = m[1], ""
			continue
		}
		if m := reTable.FindStringSubmatch(line); m != nil {
			fn, table = "", m[1]
			continue
		}

		section := sectionOf[fn]
		if table != "" {
			section = sectionOf[usedBy[table]]
		}
		if section == "" {
			continue
		}

		for _, m := range reCall.FindAllStringSubmatch(line, -1) {
			c := testCase{
				kind:    kindOf(m[1]),
				section: section,
				name:    unquote(m[2]),
				seq:     unquote(m[3]),
				want:    unquote(m[4]),
			}
			if m[5] != "" {
				n, err := strconv.Atoi(m[5])
				if err != nil {
					fatal("커서 위치를 읽지 못했습니다: %q", m[5])
				}
				c.cursor, c.hasCur = n, true
			}
			cases = append(cases, c)
		}

		for _, m := range reRow.FindAllStringSubmatch(line, -1) {
			name, seq := unquote(m[1]), unquote(m[2])

			var wants []string
			for _, w := range reWide.FindAllStringSubmatch(m[3], -1) {
				wants = append(wants, unquote(w[1]))
			}

			switch len(wants) {
			case 1:
				// { "이름", "키", L"기대" }
				cases = append(cases, testCase{
					kind: kindExpect, section: section,
					name: name, seq: seq, want: wants[0],
				})
			case 3:
				// 모음 전이표: 한 줄이 세 항목이 된다
				for i, w := range wants {
					cases = append(cases, testCase{
						kind: kindExpect, section: section,
						name: name + vowelMarks[i],
						seq:  seq + vowelKeys[i],
						want: w,
					})
				}
			default:
				fatal("모르는 표 모양입니다(기대값 %d 개): %s", len(wants), line)
			}
		}
	}

	// 구역별 개수 (나온 차례를 지킨다)
	var order []string
	count := map[string]int{}
	for _, c := range cases {
		if _, seen := count[c.section]; !seen {
			order = append(order, c.section)
		}
		count[c.section]++
	}
	stats := make([]sectionCount, 0, len(order))
	for _, s := range order {
		stats = append(stats, sectionCount{s, count[s]})
	}
	return cases, stats
}

func kindOf(suffix string) string {
	switch suffix {
	case "_live":
		return kindLive
	case "_cursor":
		return kindCursor
	case "_comp":
		return kindComp
	case "_mode":
		return kindMode
	default:
		return kindExpect
	}
}

// unquote 는 C 문자열의 이스케이프를 푼다.
// Go 와 C 의 이스케이프가 우리가 쓰는 범위에서는 같으므로 그대로 쓴다.
func unquote(s string) string {
	v, err := strconv.Unquote(`"` + s + `"`)
	if err != nil {
		fatal("문자열을 풀지 못했습니다: %q (%v)", s, err)
	}
	return v
}

// render 는 cases.tsv 본문을 만든다.
func render(src string, cases []testCase) string {
	var b strings.Builder

	b.WriteString("# 천지인 오토마타 회귀 시험 자료\n")
	b.WriteString("#\n")
	b.WriteString("# 이 파일은 손으로 고치지 않는다. 아래 명령으로 다시 만든다.\n")
	b.WriteString("#   go generate ./test/\n")
	b.WriteString("#\n")
	b.WriteString("# 뽑아 온 곳: " + filepath.ToSlash(src) + "\n")
	b.WriteString("#\n")
	b.WriteString("# 칸 차례: 종류 · 구역 · 이름 · 키 시퀀스 · 기대값 · (커서)\n")
	b.WriteString("# 값은 Go 문자열 리터럴로 적는다(따옴표 포함).\n")
	b.WriteString("#\n")
	b.WriteString("# 종류\n")
	b.WriteString("#   expect  확정한 뒤 버퍼를 비교\n")
	b.WriteString("#   live    확정하지 않고 조합 중인 화면을 비교\n")
	b.WriteString("#   cursor  버퍼와 커서 위치를 함께 비교\n")
	b.WriteString("#   comp    상태줄 조합 문자열을 비교\n")
	b.WriteString("#   mode    모드 이름을 비교\n")
	b.WriteString("\n")

	for _, c := range cases {
		fields := []string{
			c.kind,
			c.section,
			strconv.Quote(c.name),
			strconv.Quote(c.seq),
			strconv.Quote(c.want),
		}
		if c.hasCur {
			fields = append(fields, strconv.Itoa(c.cursor))
		}
		b.WriteString(strings.Join(fields, "\t"))
		b.WriteByte('\n')
	}
	return b.String()
}
