// Package test 는 천지인 조합 엔진의 회귀 시험을 모아 둔 곳이다.
//
// 기대값을 손으로 옮겨 적지 않는다. KoreanChunJiInC++/tests/test_engine.c 에서
// 뽑아 cases.tsv 에 적어 둔 것을 읽어 돈다. 원본이 고쳐지면 아래를 다시
// 돌려 자료를 갱신한다.
//
//	go generate ./test/
//
// C 코드에서도 계산으로 만들어지는 항목(영문 26자 전수, 라벨-입력 일치)과
// 원본 함수를 직접 부르는 항목은 자료로 옮길 수 없어 engine_test.go 에 둔다.
//
// 화면 쪽 시험은 여기 없다. Go 는 패키지 안의 비공개 이름을 그 패키지의
// 시험만 볼 수 있어서, internal/ui 의 색표·배치·창 시험은 그 폴더에 있어야
// 한다. 엔진은 공개 API 만으로 다 볼 수 있으므로 이리로 모았다.
package test

//go:generate go run ../cmd/gen-testcases

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/knix008/chunjiin/internal/engine"
)

const casesFile = "cases.tsv"

// caseRow 는 cases.tsv 의 한 줄이다.
type caseRow struct {
	kind    string
	section string
	name    string
	seq     string
	want    string
	cursor  int
	hasCur  bool
}

// runKeys 는 키 시퀀스 문자열을 그대로 실행한다.
//
//	0~9   키 0~9            a  키 10 (ㅇㅁ)      b  키 11 (? !)
//	_     스페이스          <  백스페이스        |  연타 순환 끊기
//	!     조합 확정         ~  전체 지우기       /  줄바꿈
//	[ ]   커서 왼쪽/오른쪽  {  맨 앞으로         }  맨 뒤로
//	H E U N S              모드: 한글/영소/영대/숫자/기호
//	M     모드 순환
//
// 그 밖의 문자(공백 등)는 무시하므로 긴 시퀀스를 띄어 읽기 좋게 적어도 된다.
func runKeys(s *engine.State, seq string) {
	for _, c := range seq {
		switch c {
		case 'a':
			s.Key(10)
		case 'b':
			s.Key(11)
		case '_':
			s.Space()
		case '<':
			s.Backspace()
		case '|':
			s.BreakMultitap()
		case '!':
			s.Commit()
		case '~':
			s.Clear()
		case '/':
			s.InsertChar('\n')
		case '[':
			s.MoveCursor(-1)
		case ']':
			s.MoveCursor(1)
		case '{':
			s.SetCursor(0)
		case '}':
			s.SetCursor(s.Len())
		case 'H':
			s.SetMode(engine.ModeHangul)
		case 'E':
			s.SetMode(engine.ModeEnglish)
		case 'U':
			s.SetMode(engine.ModeUpperEnglish)
		case 'N':
			s.SetMode(engine.ModeNumber)
		case 'S':
			s.SetMode(engine.ModeSpecial)
		case 'M':
			s.CycleMode()
		default:
			if c >= '0' && c <= '9' {
				s.Key(int(c - '0'))
			}
		}
	}
}

// loadCases 는 뽑아 둔 시험 자료를 읽는다.
func loadCases(t *testing.T) []caseRow {
	t.Helper()

	f, err := os.Open(casesFile)
	if err != nil {
		t.Fatalf("시험 자료를 열지 못했다: %v\n"+
			"  go generate ./test/ 로 다시 만드세요.", err)
	}
	defer f.Close()

	var rows []caseRow
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for line := 1; sc.Scan(); line++ {
		text := sc.Text()
		if text == "" || strings.HasPrefix(text, "#") {
			continue
		}

		fields := strings.Split(text, "\t")
		if len(fields) < 5 {
			t.Fatalf("%s:%d 칸이 모자라다: %q", casesFile, line, text)
		}

		unq := func(s string) string {
			v, err := strconv.Unquote(s)
			if err != nil {
				t.Fatalf("%s:%d 문자열을 풀지 못했다: %q", casesFile, line, s)
			}
			return v
		}

		r := caseRow{
			kind:    fields[0],
			section: fields[1],
			name:    unq(fields[2]),
			seq:     unq(fields[3]),
			want:    unq(fields[4]),
		}
		if len(fields) >= 6 {
			n, err := strconv.Atoi(fields[5])
			if err != nil {
				t.Fatalf("%s:%d 커서 위치를 읽지 못했다: %q", casesFile, line, fields[5])
			}
			r.cursor, r.hasCur = n, true
		}
		rows = append(rows, r)
	}
	if err := sc.Err(); err != nil {
		t.Fatalf("시험 자료를 읽다 실패했다: %v", err)
	}
	if len(rows) == 0 {
		t.Fatal("시험 자료가 비었다")
	}
	return rows
}

// run 은 한 항목을 돌리고 결과를 견준다.
func (r caseRow) run(t *testing.T) {
	t.Helper()

	s := engine.New()
	runKeys(s, r.seq)

	switch r.kind {
	case "expect":
		// 확정한 뒤 버퍼를 비교한다.
		s.Commit()
		if got := s.Text(); got != r.want {
			t.Errorf("%q -> %q, 기대: %q", r.seq, got, r.want)
		}

	case "live":
		// 확정하지 않고, 조합 중인 모습 그대로 비교한다.
		if got := s.Text(); got != r.want {
			t.Errorf("%q -> %q, 기대: %q (조합 중)", r.seq, got, r.want)
		}

	case "cursor":
		if got := s.Text(); got != r.want || s.CursorPos != r.cursor {
			t.Errorf("%q -> %q @%d, 기대: %q @%d",
				r.seq, got, s.CursorPos, r.want, r.cursor)
		}

	case "comp":
		if got := s.CompositionText(); got != r.want {
			t.Errorf("%q -> %q, 기대: %q", r.seq, got, r.want)
		}

	case "mode":
		if got := s.ModeName(); got != r.want {
			t.Errorf("%q -> %q, 기대: %q", r.seq, got, r.want)
		}

	default:
		t.Fatalf("모르는 종류: %q", r.kind)
	}
}

// TestCppSuite 는 C++ 판에서 뽑아 온 항목을 구역별로 돌린다.
func TestCppSuite(t *testing.T) {
	rows := loadCases(t)

	// 구역을 원본에 나온 차례대로 묶는다.
	var order []string
	group := map[string][]caseRow{}
	for _, r := range rows {
		if _, seen := group[r.section]; !seen {
			order = append(order, r.section)
		}
		group[r.section] = append(group[r.section], r)
	}

	for _, section := range order {
		t.Run(section, func(t *testing.T) {
			for _, r := range group[section] {
				t.Run(r.name, r.run)
			}
		})
	}

	t.Logf("%d 구역 %d 항목", len(order), len(rows))
}

// TestCasesFileShape 는 뽑아 온 자료 자체가 성한지 본다.
// 뽑아내는 프로그램이 조용히 망가지면 시험이 통째로 비어도 통과해 버린다.
func TestCasesFileShape(t *testing.T) {
	rows := loadCases(t)

	// C++ 판에서 뽑아 올 수 있는 항목 수. 원본이 늘거나 줄면 이 값도 고친다.
	const wantCount = 430

	if len(rows) != wantCount {
		t.Errorf("항목이 %d 개, 기대: %d 개 "+
			"(원본이 바뀌었다면 go generate 뒤 이 값을 고치세요)",
			len(rows), wantCount)
	}

	kinds := map[string]int{}
	for i, r := range rows {
		kinds[r.kind]++

		if r.section == "" {
			t.Errorf("%d 번째 항목에 구역이 없다: %+v", i, r)
		}
		if r.name == "" {
			t.Errorf("%d 번째 항목에 이름이 없다: %+v", i, r)
		}
		if r.kind == "cursor" && !r.hasCur {
			t.Errorf("%d 번째 cursor 항목에 커서 위치가 없다: %+v", i, r)
		}
	}

	// 다섯 가지 비교 축이 모두 들어 있어야 한다.
	for _, k := range []string{"expect", "live", "cursor", "comp", "mode"} {
		if kinds[k] == 0 {
			t.Errorf("%q 종류의 항목이 하나도 없다", k)
		}
	}
	t.Logf("종류별 개수: %v", kinds)
}
