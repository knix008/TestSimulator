// Package assets 는 창 아이콘처럼 가벼운 자원을 담는다.
//
// 한글 글꼴은 assets/fonts 에 따로 두었다. 설치 프로그램은 아이콘만
// 쓰므로 글꼴을 여기에 두면 설치 실행 파일이 12MB 더 커지고 켜지는
// 데도 오래 걸린다.
package assets

import (
	_ "embed"

	"fyne.io/fyne/v2"
)

//go:embed chunjiin.png
var iconPNG []byte

// Icon 은 떠 있는 창에 쓰는 아이콘이다.
// Windows 탐색기·바로 가기가 보는 .exe 아이콘은 이 PNG 가 아니라
// scripts/embed-win-icon.ps1 이 만드는 rsrc_windows_amd64.syso 다.
var Icon = &fyne.StaticResource{
	StaticName:    "chunjiin.png",
	StaticContent: iconPNG,
}
