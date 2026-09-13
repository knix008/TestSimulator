// testreport - 시험을 돌리고 구역별로 정리해서 보여 준다.
//
// `go test` 는 패키지 단위로 ok/FAIL 만 찍는다. C++ 판의 test_engine 은
// 구역마다 몇 개가 통과했는지와 전체 요약을 보여 주었는데, 그 쪽이 무엇을
// 얼마나 보고 있는지 한눈에 들어온다. 그래서 `go test -json` 의 결과를 읽어
// 같은 모양으로 정리한다.
//
//	go run ./cmd/testreport              전부 돌리고 요약을 본다
//	go run ./cmd/testreport -v           항목마다 한 줄씩 본다
//	go run ./cmd/testreport -cover       덮은 정도까지 잰다
//	go run ./cmd/testreport -run 낱말    이름이 맞는 것만 돌린다
//	go run ./cmd/testreport ./test/      그 꾸러미만 돌린다
//	go run ./cmd/testreport -summary F   집계를 파일 F 에 한 줄로 더 쓴다 (스크립트용)
//
// test.ps1 과 test.sh, test.bat 이 이것을 부른다.
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
)

// event 는 `go test -json` 이 한 줄에 하나씩 뱉는 알림이다.
type event struct {
	Action  string  `json:"Action"`
	Package string  `json:"Package"`
	Test    string  `json:"Test"`
	Elapsed float64 `json:"Elapsed"`
	Output  string  `json:"Output"`
}

// result 는 항목 하나의 결과다.
type result struct {
	pkg    string
	name   string // 꾸러미 안에서의 온전한 이름 (TestX/구역/항목)
	action string // pass · fail · skip
	detail string // 시험이 t.Log 로 남긴 설명 (있으면)
	output []string
}

// group 은 화면에 묶어서 보여 줄 단위다.
type group struct {
	title      string
	order      int // 보여 줄 차례
	categories []*category
	byName     map[string]*category
}

type category struct {
	name             string
	pass, fail, skip int
}

func main() {
	var (
		verbose = flag.Bool("v", false, "항목마다 한 줄씩 보여 준다")
		cover   = flag.Bool("cover", false, "덮은 정도(coverage)를 잰다")
		run     = flag.String("run", "", "이름이 맞는 시험만 돌린다")
		noColor = flag.Bool("no-color", false, "색을 쓰지 않는다")
		summary = flag.String("summary", "", "집계를 이 파일에 한 줄로 쓴다 (스크립트용)")
	)
	flag.Parse()

	pkgs := flag.Args()
	if len(pkgs) == 0 {
		pkgs = []string{"./..."}
	}

	c := newColors(!*noColor)

	fmt.Printf("%s천지인 회귀 시험%s\n", c.head, c.off)

	results, coverage, err := runTests(pkgs, *run, *cover)
	if err != nil {
		fmt.Fprintf(os.Stderr, "시험을 돌리지 못했습니다: %v\n", err)
		os.Exit(2)
	}

	leaves := onlyLeaves(results)
	groups := collect(leaves)

	report(groups, leaves, coverage, *verbose, c)

	if *summary != "" {
		if err := writeSummary(*summary, leaves); err != nil {
			fmt.Fprintf(os.Stderr, "집계를 쓰지 못했습니다: %v\n", err)
		}
	}

	for _, r := range leaves {
		if r.action == "fail" {
			os.Exit(1)
		}
	}
}

// summaryLine 은 스크립트가 읽기 쉬운 한 줄 집계다. 한글이나 색이 없다.
//
//	total=722 pass=722 fail=0 skip=0 result=PASS
func summaryLine(leaves []result) string {
	var pass, fail, skip int
	for _, r := range leaves {
		switch r.action {
		case "pass":
			pass++
		case "fail":
			fail++
		case "skip":
			skip++
		}
	}
	verdict := "PASS"
	if fail > 0 {
		verdict = "FAIL"
	}
	return fmt.Sprintf("total=%d pass=%d fail=%d skip=%d result=%s",
		pass+fail+skip, pass, fail, skip, verdict)
}

// writeSummary 는 집계 한 줄을 파일에 쓴다. .bat 처럼 화면 출력을 읽기
// 어려운 쪽에서 결과를 가져가는 데 쓴다.
func writeSummary(path string, leaves []result) error {
	return os.WriteFile(path, []byte(summaryLine(leaves)+"\n"), 0o644)
}

// runTests 는 go test 를 돌리고 알림을 모은다.
func runTests(pkgs []string, run string, cover bool) ([]result, map[string]string, error) {
	args := []string{"test", "-json", "-count=1"}
	if run != "" {
		args = append(args, "-run", run)
	}
	if cover {
		args = append(args, "-cover")
	}
	args = append(args, pkgs...)

	cmd := exec.Command("go", args...)
	cmd.Stderr = os.Stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, nil, err
	}

	var (
		results  []result
		index    = map[string]int{} // 꾸러미+이름 -> results 자리
		coverage = map[string]string{}
	)

	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	for sc.Scan() {
		var e event
		if json.Unmarshal(sc.Bytes(), &e) != nil {
			continue // 시험이 직접 찍은 줄. 알림이 아니다.
		}

		// 꾸러미 단위 알림에는 Test 가 없다. 덮은 정도만 챙긴다.
		if e.Test == "" {
			if s := coverPercent(e.Output); s != "" {
				coverage[e.Package] = s
			}
			continue
		}

		key := e.Package + "\x00" + e.Test
		at, seen := index[key]
		if !seen {
			at = len(results)
			index[key] = at
			results = append(results, result{pkg: e.Package, name: e.Test})
		}

		switch e.Action {
		case "pass", "fail", "skip":
			results[at].action = e.Action
		case "output":
			line := strings.TrimRight(e.Output, "\n")
			if !isFailureNote(line) {
				break
			}
			note := strings.TrimSpace(line)
			results[at].output = append(results[at].output, note)

			// 시험이 t.Log 로 남긴 설명을 골라 둔다.
			// 이름만으로는 그 시험이 무엇을 보는지 알 수 없으므로,
			// -v 로 돌릴 때 항목 옆에 함께 보여 준다.
			if results[at].detail == "" {
				if d := afterFileLine(note); d != "" {
					results[at].detail = d
				}
			}
		}
	}

	// 시험이 실패하면 go test 가 1 을 준다. 그것은 잘못이 아니라 결과다.
	_ = cmd.Wait()

	return results, coverage, sc.Err()
}

// coverPercent 는 "coverage: 62.5% of statements" 에서 숫자만 뽑는다.
func coverPercent(out string) string {
	const mark = "coverage: "
	i := strings.Index(out, mark)
	if i < 0 {
		return ""
	}
	rest := out[i+len(mark):]
	if j := strings.Index(rest, " of statements"); j > 0 {
		return rest[:j]
	}
	return ""
}

// isFailureNote 는 실패했을 때 보여 줄 만한 줄인지 본다.
// "--- FAIL" 이나 "=== RUN" 같은 얼개 줄은 버리고 t.Errorf 가 찍은 것만 남긴다.
func isFailureNote(line string) bool {
	t := strings.TrimSpace(line)
	if t == "" {
		return false
	}
	for _, skip := range []string{"=== RUN", "=== PAUSE", "=== CONT", "=== NAME",
		"--- PASS", "--- FAIL", "--- SKIP", "PASS", "FAIL", "ok ", "?   "} {
		if strings.HasPrefix(t, skip) {
			return false
		}
	}
	return true
}

// afterFileLine 은 "cases_test.go:168: 확정  301301 -> 가가" 에서
// 파일과 줄 번호를 떼고 뒷말만 남긴다. 없으면 빈 문자열.
func afterFileLine(note string) string {
	i := strings.Index(note, ".go:")
	if i < 0 {
		return ""
	}
	j := strings.Index(note[i:], ": ")
	if j < 0 {
		return ""
	}
	return strings.TrimSpace(note[i+j+2:])
}

// onlyLeaves 는 하위 항목을 가진 시험(묶음 노릇만 하는 것)을 걸러 낸다.
// 그것까지 세면 같은 항목을 두 번 세게 된다.
func onlyLeaves(all []result) []result {
	parent := map[string]bool{}
	for _, r := range all {
		name := r.name
		for {
			i := strings.LastIndex(name, "/")
			if i < 0 {
				break
			}
			name = name[:i]
			parent[r.pkg+"\x00"+name] = true
		}
	}

	out := make([]result, 0, len(all))
	for _, r := range all {
		if !parent[r.pkg+"\x00"+r.name] {
			out = append(out, r)
		}
	}
	return out
}

// groupTitle 은 꾸러미 이름을 사람이 읽을 이름으로 바꾼다.
func groupTitle(pkg string) string {
	switch {
	case strings.HasSuffix(pkg, "/test"), strings.HasSuffix(pkg, "/internal/engine"):
		return "조합 엔진"
	case strings.HasSuffix(pkg, "/internal/ui"):
		return "화면"
	}
	if i := strings.LastIndex(pkg, "/"); i >= 0 {
		return pkg[i+1:]
	}
	return pkg
}

// groupOf 는 항목을 어느 묶음에 넣을지 고른다.
//
// 같은 꾸러미 안이라도 성격이 다른 것은 갈라 놓는다. 무엇이 원본에서
// 뽑아 온 것이고 무엇이 여기서 쓴 것인지, 어디까지가 창을 만들어 보는
// 시험인지 한눈에 보이는 편이 낫다.
//
// 앞의 숫자는 보여 줄 차례다.
func groupOf(pkg, test string) (int, string) {
	base := groupTitle(pkg)

	switch {
	case strings.HasPrefix(test, "TestCppSuite"), strings.HasPrefix(test, "TestCasesFileShape"):
		return 0, base + " · C++ 원본에서 뽑아 온 자료"
	case base == "조합 엔진":
		return 1, base + " · 자료로 뽑을 수 없는 시험"
	case strings.HasPrefix(test, "TestApp"):
		return 3, base + " · 창까지 만들어 보는 시험"
	case base == "화면":
		return 2, base + " · 부품 시험"
	}
	return 4, base
}

// categoryOf 는 항목이 속할 구역 이름을 고른다.
//
//	TestCppSuite/낱말·문장/안녕  ->  낱말·문장      (세 겹이면 가운데)
//	TestAppSmoke/한글 조합       ->  AppSmoke       (두 겹이면 맨 위)
//	TestEdgeCases               ->  EdgeCases
//
// Go 는 하위 시험 이름의 공백을 밑줄로 바꾸므로 되돌려 놓는다.
func categoryOf(name string) string {
	seg := strings.Split(name, "/")

	var pick string
	if len(seg) >= 3 {
		pick = seg[1]
	} else {
		pick = strings.TrimPrefix(seg[0], "Test")
	}
	return strings.ReplaceAll(pick, "_", " ")
}

// collect 는 결과를 묶음별 · 구역별로 나눈다.
// 구역은 나온 차례를 지키고, 묶음은 groupOf 가 정한 차례로 놓는다.
func collect(leaves []result) []*group {
	var groups []*group
	byTitle := map[string]*group{}

	for _, r := range leaves {
		order, title := groupOf(r.pkg, r.name)

		g, ok := byTitle[title]
		if !ok {
			g = &group{title: title, order: order, byName: map[string]*category{}}
			byTitle[title] = g
			groups = append(groups, g)
		}

		name := categoryOf(r.name)
		cat, ok := g.byName[name]
		if !ok {
			cat = &category{name: name}
			g.byName[name] = cat
			g.categories = append(g.categories, cat)
		}

		switch r.action {
		case "pass":
			cat.pass++
		case "fail":
			cat.fail++
		default:
			cat.skip++
		}
	}

	sort.SliceStable(groups, func(i, j int) bool {
		return groups[i].order < groups[j].order
	})
	return groups
}

// ---------------------------------------------------------------------
// 보여 주기
// ---------------------------------------------------------------------

type colors struct{ head, ok, bad, dim, off string }

func newColors(want bool) colors {
	if !want || os.Getenv("NO_COLOR") != "" {
		return colors{}
	}
	if fi, err := os.Stdout.Stat(); err != nil || fi.Mode()&os.ModeCharDevice == 0 {
		return colors{} // 파일로 넘길 때는 색을 쓰지 않는다
	}
	return colors{
		head: "\033[36m", ok: "\033[32m", bad: "\033[31m",
		dim: "\033[90m", off: "\033[0m",
	}
}

const (
	line = "════════════════════════════════════════════════════════"
	thin = "────────────────────────────────────────────────────────"
)

func report(groups []*group, leaves []result, coverage map[string]string, verbose bool, c colors) {
	if verbose {
		printItems(leaves, c)
	}

	fmt.Printf("\n%s%s%s\n", c.head, line, c.off)
	fmt.Println(" 시험 요약")
	fmt.Printf("%s%s%s\n", c.dim, thin, c.off)

	var pass, fail, skip, cats int

	for _, g := range groups {
		fmt.Printf("\n %s[ %s ]%s\n", c.head, g.title, c.off)

		var gPass, gAll int

		for _, cat := range g.categories {
			n := cat.pass + cat.fail + cat.skip
			cats++
			pass += cat.pass
			fail += cat.fail
			skip += cat.skip
			gPass += cat.pass
			gAll += n

			mark, col := "통과", c.ok
			if cat.fail > 0 {
				mark, col = "실패", c.bad
			} else if cat.pass == 0 {
				mark, col = "건너뜀", c.dim
			}

			fmt.Printf("   %s %4d/%-4d  %s%s%s\n",
				pad(cat.name, 28), cat.pass, n, col, mark, c.off)
		}

		fmt.Printf("   %s%s %4d/%-4d%s\n", c.dim,
			pad(fmt.Sprintf("소계  (구역 %d 개)", len(g.categories)), 28),
			gPass, gAll, c.off)
	}

	total := pass + fail + skip

	fmt.Printf("%s%s%s\n", c.dim, thin, c.off)
	fmt.Printf("   전체 시험 항목   %4d 개   (구역 %d 개)\n", total, cats)

	rate := 100
	if total > 0 {
		rate = pass * 100 / total
	}
	fmt.Printf("   통과             %s%4d 개%s   (%d%%)\n", c.ok, pass, c.off, rate)

	failColor := c.dim
	if fail > 0 {
		failColor = c.bad
	}
	fmt.Printf("   실패             %s%4d 개%s\n", failColor, fail, c.off)
	if skip > 0 {
		fmt.Printf("   건너뜀           %s%4d 개%s\n", c.dim, skip, c.off)
	}

	if len(coverage) > 0 {
		fmt.Printf("%s%s%s\n", c.dim, thin, c.off)
		names := make([]string, 0, len(coverage))
		for k := range coverage {
			names = append(names, k)
		}
		sort.Strings(names)
		for _, k := range names {
			fmt.Printf("   덮은 정도  %s %s\n", pad(groupTitle(k), 20), coverage[k])
		}
	}

	if fail > 0 {
		printFailures(leaves, c)
	}

	fmt.Printf("%s%s%s\n", c.dim, thin, c.off)
	if fail == 0 {
		fmt.Printf("   결과   %s PASS %s   %d개 항목 모두 통과\n", c.ok, c.off, total)
	} else {
		fmt.Printf("   결과   %s FAIL %s   %d개 중 %d개 실패\n", c.bad, c.off, total, fail)
	}
	fmt.Printf("%s%s%s\n", c.head, line, c.off)
}

// printItems 는 -v 일 때 항목을 하나씩 찍는다.
func printItems(leaves []result, c colors) {
	last := ""
	for _, r := range leaves {
		if cat := categoryOf(r.name); cat != last {
			fmt.Printf("\n%s[%s]%s\n", c.head, cat, c.off)
			last = cat
		}

		mark, col := "PASS", c.ok
		switch r.action {
		case "fail":
			mark, col = "FAIL", c.bad
		case "skip":
			mark, col = "SKIP", c.dim
		}

		// 시험이 남긴 설명이 있으면 이름 옆에 붙인다.
		// 이름만 보아서는 그 항목이 무엇을 보는지 알 수 없기 때문이다.
		if r.detail == "" {
			fmt.Printf("  %s[%s]%s %s\n", col, mark, c.off, shortName(r.name))
			continue
		}
		fmt.Printf("  %s[%s]%s %s %s%s%s\n", col, mark, c.off,
			pad(shortName(r.name), 18), c.dim, r.detail, c.off)
	}
}

// printFailures 는 실패한 항목과 그 까닭을 모아 보여 준다.
func printFailures(leaves []result, c colors) {
	fmt.Printf("%s%s%s\n", c.dim, thin, c.off)
	fmt.Printf(" %s실패한 항목%s\n", c.bad, c.off)

	for _, r := range leaves {
		if r.action != "fail" {
			continue
		}
		fmt.Printf("   %s%s%s\n", c.bad, strings.ReplaceAll(r.name, "_", " "), c.off)
		for _, note := range r.output {
			fmt.Printf("     %s\n", note)
		}
	}
}

// shortName 은 구역까지는 이미 머리글로 찍었으므로 마지막 조각만 남긴다.
func shortName(name string) string {
	seg := strings.Split(name, "/")
	return strings.ReplaceAll(seg[len(seg)-1], "_", " ")
}

// pad 는 글자 폭을 맞춘다. 한글은 두 칸을 차지한다.
func pad(s string, width int) string {
	w := displayWidth(s)
	if w >= width {
		return s
	}
	return s + strings.Repeat(" ", width-w)
}

// displayWidth 는 터미널에서 차지하는 칸 수를 센다.
func displayWidth(s string) int {
	w := 0
	for _, r := range s {
		if isWide(r) {
			w += 2
		} else {
			w++
		}
	}
	return w
}

// isWide 는 두 칸을 차지하는 글자인지 본다(한글 · 한자 · 가나 · 전각 기호).
func isWide(r rune) bool {
	switch {
	case r >= 0x1100 && r <= 0x115F, // 한글 자모
		r >= 0x2E80 && r <= 0xA4CF, // 한자 · 가나 · 호환 자모
		r >= 0xAC00 && r <= 0xD7A3, // 한글 음절
		r >= 0xF900 && r <= 0xFAFF, // 한자 호환
		r >= 0xFE30 && r <= 0xFE6F,
		r >= 0xFF00 && r <= 0xFF60, // 전각
		r >= 0xFFE0 && r <= 0xFFE6:
		return true
	}
	return false
}
