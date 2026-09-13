// Package fonts 는 데스크톱 앱에 넣는 Noto Sans KR 글꼴이다.
//
// 설치 프로그램은 이 패키지를 가져오지 않는다. 아이콘만 쓰는
// assets 패키지와 갈라 두어, 설치 실행 파일이 글꼴 12MB 를
// 한 번 더 품지 않게 한다.
package fonts

import (
	_ "embed"

	"fyne.io/fyne/v2"
)

//go:embed NotoSansKR-Regular.ttf
var regular []byte

//go:embed NotoSansKR-Bold.ttf
var bold []byte

// Regular 는 본문 글꼴이다 (Noto Sans KR 400, SIL OFL 1.1).
var Regular = &fyne.StaticResource{
	StaticName:    "NotoSansKR-Regular.ttf",
	StaticContent: regular,
}

// Bold 는 버튼 라벨과 강조에 쓰는 굵은 글꼴이다 (Noto Sans KR 700).
var Bold = &fyne.StaticResource{
	StaticName:    "NotoSansKR-Bold.ttf",
	StaticContent: bold,
}
