// report_test.go - 시험 보고기 자체의 시험.
//
// 보고기가 조용히 망가지면 "0개 중 0개 통과" 같은 헛된 요약이 나오고,
// 그것을 보고 다 잘 돌아간다고 믿게 된다. 그래서 세는 방식과 묶는 방식을
// 따로 확인해 둔다.
package main

import "testing"

func TestCategoryOf(t *testing.T) {
	cases := []struct{ name, want string }{
		// 세 겹이면 가운데(구역 이름)를 쓴다
		{"TestCppSuite/낱말·문장/안녕", "낱말·문장"},
		{"TestCppSuite/모음_전이표_전수/빈칸+ㅣ", "모음 전이표 전수"},
		// 두 겹이면 맨 위 이름에서 Test 를 뗀다
		{"TestAppSmoke/한글_조합", "AppSmoke"},
		{"TestDisplayAPI/라벨_-1", "DisplayAPI"},
		// 한 겹이면 그것만
		{"TestEdgeCases", "EdgeCases"},
		{"TestFnIcons", "FnIcons"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := categoryOf(c.name); got != c.want {
				t.Errorf("categoryOf(%q) = %q, 기대: %q", c.name, got, c.want)
			}
		})
	}
}

// TestOnlyLeaves 는 묶음 노릇만 하는 시험이 걸러지는지 본다.
// 그것까지 세면 같은 항목을 두 번 세게 된다.
func TestOnlyLeaves(t *testing.T) {
	all := []result{
		{pkg: "p", name: "TestCppSuite"},      // 묶음
		{pkg: "p", name: "TestCppSuite/구역"},   // 묶음
		{pkg: "p", name: "TestCppSuite/구역/가"}, // 항목
		{pkg: "p", name: "TestCppSuite/구역/나"}, // 항목
		{pkg: "p", name: "TestEdgeCases"},     // 항목 (하위가 없다)
		{pkg: "q", name: "TestCppSuite/구역/가"}, // 다른 꾸러미의 항목
	}

	leaves := onlyLeaves(all)

	want := []string{
		"TestCppSuite/구역/가",
		"TestCppSuite/구역/나",
		"TestEdgeCases",
		"TestCppSuite/구역/가",
	}
	if len(leaves) != len(want) {
		t.Fatalf("항목이 %d 개, 기대: %d 개  (%+v)", len(leaves), len(want), leaves)
	}
	for i, w := range want {
		if leaves[i].name != w {
			t.Errorf("%d 번째 %q, 기대: %q", i, leaves[i].name, w)
		}
	}
}

// TestCollectGroups 는 묶음이 갈리고 차례가 지켜지는지 본다.
func TestCollectGroups(t *testing.T) {
	leaves := []result{
		{pkg: "x/internal/ui", name: "TestPalettes/라이트", action: "pass"},
		{pkg: "x/test", name: "TestCppSuite/연음/가나", action: "pass"},
		{pkg: "x/internal/ui", name: "TestAppSmoke/한글", action: "pass"},
		{pkg: "x/test", name: "TestEdgeCases/Reset", action: "fail"},
		{pkg: "x/test", name: "TestCppSuite/연음/악아", action: "pass"},
	}

	groups := collect(leaves)

	wantTitles := []string{
		"조합 엔진 · C++ 원본에서 뽑아 온 자료",
		"조합 엔진 · 자료로 뽑을 수 없는 시험",
		"화면 · 부품 시험",
		"화면 · 창까지 만들어 보는 시험",
	}
	if len(groups) != len(wantTitles) {
		t.Fatalf("묶음이 %d 개, 기대: %d 개", len(groups), len(wantTitles))
	}
	for i, w := range wantTitles {
		if groups[i].title != w {
			t.Errorf("%d 번째 묶음 %q, 기대: %q", i, groups[i].title, w)
		}
	}

	// 한 구역에 두 항목이 모여야 한다.
	cpp := groups[0]
	if len(cpp.categories) != 1 || cpp.categories[0].name != "연음" {
		t.Fatalf("구역이 잘못 묶였다: %+v", cpp.categories)
	}
	if cpp.categories[0].pass != 2 {
		t.Errorf("통과 %d 개, 기대: 2 개", cpp.categories[0].pass)
	}

	// 실패도 제대로 세야 한다.
	if got := groups[1].categories[0].fail; got != 1 {
		t.Errorf("실패 %d 개, 기대: 1 개", got)
	}
}

func TestCoverPercent(t *testing.T) {
	cases := []struct{ in, want string }{
		{"coverage: 62.5% of statements\n", "62.5%"},
		{"ok  \tpkg\t0.5s\tcoverage: 100.0% of statements\n", "100.0%"},
		{"ok  \tpkg\t0.5s\n", ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := coverPercent(c.in); got != c.want {
			t.Errorf("coverPercent(%q) = %q, 기대: %q", c.in, got, c.want)
		}
	}
}

// TestIsFailureNote 는 실패 까닭만 남고 얼개 줄은 걸러지는지 본다.
func TestIsFailureNote(t *testing.T) {
	drop := []string{
		"=== RUN   TestX", "--- PASS: TestX (0.00s)", "--- FAIL: TestX (0.00s)",
		"PASS", "FAIL", "ok  \tpkg\t0.4s", "?   \tpkg\t[no test files]", "   ",
	}
	for _, line := range drop {
		if isFailureNote(line) {
			t.Errorf("걸러야 할 줄이 남았다: %q", line)
		}
	}

	keep := []string{
		`    cases_test.go:154: "301477" -> "간ㅎ", 기대: "갆"`,
		"    app_smoke_test.go:140: 모드: \"Latin abc\", 기대: \"한글\"",
	}
	for _, line := range keep {
		if !isFailureNote(line) {
			t.Errorf("남겨야 할 줄이 걸러졌다: %q", line)
		}
	}
}

// TestPadWidth 는 한글이 두 칸을 차지하는 것을 셈에 넣는지 본다.
// 이것이 틀리면 구역 이름이 길이에 따라 들쭉날쭉해진다.
func TestPadWidth(t *testing.T) {
	cases := []struct {
		in    string
		width int
	}{
		{"연음", 10},
		{"모음 전이표 전수", 28},
		{"EnglishAlphabet", 28},
		{"편집·커서", 20},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			got := pad(c.in, c.width)
			if w := displayWidth(got); w != c.width {
				t.Errorf("pad(%q, %d) 의 폭이 %d", c.in, c.width, w)
			}
		})
	}

	// 자리보다 긴 이름은 자르지 않는다. 잘라 버리면 무엇인지 알 수 없다.
	long := "아주아주아주아주 긴 구역 이름"
	if got := pad(long, 4); got != long {
		t.Errorf("긴 이름이 바뀌었다: %q", got)
	}
}

func TestDisplayWidth(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"", 0},
		{"abc", 3},
		{"한글", 4},
		{"a한b", 4},
		{"ㄱㅋ", 4}, // 호환 자모도 두 칸
		{"·", 1},  // 가운뎃점은 한 칸
	}
	for _, c := range cases {
		if got := displayWidth(c.in); got != c.want {
			t.Errorf("displayWidth(%q) = %d, 기대: %d", c.in, got, c.want)
		}
	}
}

// TestGroupTitle 은 꾸러미 이름이 사람이 읽을 이름으로 바뀌는지 본다.
func TestGroupTitle(t *testing.T) {
	cases := []struct{ pkg, want string }{
		{"github.com/knix008/chunjiin/test", "조합 엔진"},
		{"github.com/knix008/chunjiin/internal/engine", "조합 엔진"},
		{"github.com/knix008/chunjiin/internal/ui", "화면"},
		{"github.com/knix008/chunjiin/cmd/testreport", "testreport"},
		{"단독", "단독"},
	}
	for _, c := range cases {
		if got := groupTitle(c.pkg); got != c.want {
			t.Errorf("groupTitle(%q) = %q, 기대: %q", c.pkg, got, c.want)
		}
	}
}
