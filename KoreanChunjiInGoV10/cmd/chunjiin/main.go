// chunjiin - 천지인 한글 입력기 (데스크톱).
//
// Windows / macOS / Linux 에서 같은 코드로 돈다.
// 조합 엔진은 internal/engine 에 있고 화면은 internal/ui 에 있다.
package main

import "github.com/knix008/chunjiin/internal/ui"

func main() {
	ui.New().Run()
}
