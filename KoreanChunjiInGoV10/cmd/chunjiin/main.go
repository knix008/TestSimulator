// chunjiin - 천지인 한글 입력기 (데스크톱).
//
// Windows / macOS / Linux 에서 같은 코드로 돈다.
// 조합 엔진은 internal/engine 에 있고 화면은 internal/ui 에 있다.
//
// Windows 탐색기·작업 표시줄 아이콘은 rsrc_windows_amd64.syso 가 담당한다.
// scripts/embed-win-icon.ps1 또는 아래 generate 로 만든다.
package main

//go:generate go run github.com/tc-hib/go-winres@v0.3.3 simply --icon ../../assets/chunjiin.ico --arch amd64 --manifest gui --product-name 천지인 한글 입력기 --file-description 천지인 한글 입력기 --original-filename chunjiin.exe --product-version 1.0.0.0 --file-version 1.0.0.0

import "github.com/knix008/chunjiin/internal/ui"

func main() {
	ui.New().Run()
}
