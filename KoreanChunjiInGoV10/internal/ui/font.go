// font.go - 글꼴 고르기.
//
// canvas.Text 는 테마를 거쳐 글꼴을 찾는데, 그 경로는 글꼴 캐시를 타므로
// 굵기가 제때 반영되지 않는 일이 있다. 직접 그리는 버튼과 상태줄은
// FontSource 로 글꼴을 못박아서 늘 같은 굵기로 나오게 한다.
package ui

import (
	"fyne.io/fyne/v2"

	"github.com/knix008/chunjiin/assets"
)

// fontFor 는 굵기에 맞는 글꼴 자원을 돌려준다.
func fontFor(bold bool) fyne.Resource {
	if bold {
		return assets.FontBold
	}
	return assets.FontRegular
}
