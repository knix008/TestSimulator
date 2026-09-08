// Package assets 는 실행 파일에 박아 넣는 자원을 담는다.
//
// 아이콘은 KoreanChunJiInC++ 의 것을 그대로 쓴다.
//
// 글꼴은 Noto Sans KR 다. Fyne 의 기본 글꼴에는 한글이 없어서 이것을 넣지
// 않으면 데스크톱 판에서 한글이 네모로 나온다. 완성형 11172자를 모두 담고
// 있어야 갂 갃 같은 글자도 그려진다.
//
// 배포본은 가변 글꼴이 아니라 굵기를 고정한 두 벌이다. 가변 글꼴
// NotoSansKR[wght].ttf 는 wght 축의 기본값이 100(Thin) 이라서 그대로 쓰면
// 글자가 아주 가늘게, 흐릿하게 나온다. 그래서 400 과 700 으로 미리 뽑아 둔다.
//
//	python -m fontTools.varLib.instancer -o NotoSansKR-Regular.ttf NotoSansKR[wght].ttf wght=400
//	python -m fontTools.varLib.instancer -o NotoSansKR-Bold.ttf    NotoSansKR[wght].ttf wght=700
//
// 웹 판은 브라우저의 시스템 글꼴을 쓰므로 이 글꼴을 내려받지 않는다.
package assets

import (
	_ "embed"

	"fyne.io/fyne/v2"
)

//go:embed fonts/NotoSansKR-Regular.ttf
var notoRegular []byte

//go:embed fonts/NotoSansKR-Bold.ttf
var notoBold []byte

//go:embed chunjiin.png
var iconPNG []byte

// FontRegular 는 본문 글꼴이다 (Noto Sans KR 400, SIL OFL 1.1).
var FontRegular = &fyne.StaticResource{
	StaticName:    "NotoSansKR-Regular.ttf",
	StaticContent: notoRegular,
}

// FontBold 는 버튼 라벨과 강조에 쓰는 굵은 글꼴이다 (Noto Sans KR 700).
var FontBold = &fyne.StaticResource{
	StaticName:    "NotoSansKR-Bold.ttf",
	StaticContent: notoBold,
}

// Icon 은 창과 작업 표시줄에 쓰는 아이콘이다.
var Icon = &fyne.StaticResource{
	StaticName:    "chunjiin.png",
	StaticContent: iconPNG,
}
