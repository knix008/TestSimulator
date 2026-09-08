// icons.go - Fyne 기본 아이콘에 없는 것들.
//
// 언어(지구본) · 줄바꿈 · 지우기 세 가지를 직접 그린다.
// Fyne 이 들고 있는 아이콘 중에는 이에 해당하는 것이 없고, 글꼴로 그리려
// 해도 ↵(U+21B5) 와 ⌫(U+232B) 는 Noto Sans KR 에 들어 있지 않아서
// 버튼이 빈칸으로 나온다.
//
// 색은 theme.NewThemedResource 가 갈아 끼운다. 그것이 fill 값을 바꾸므로
// 선이 아니라 채운 도형으로 그린다. Fyne 기본 아이콘들과 같은 방식이다.
package ui

import "fyne.io/fyne/v2"

// svgIcon 은 24x24 자리에 그린 단색 SVG 를 자원으로 만든다.
func svgIcon(name, body string) *fyne.StaticResource {
	return &fyne.StaticResource{
		StaticName: name,
		StaticContent: []byte(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000000">` +
				body + `</svg>`),
	}
}

// iconLanguage 는 툴바의 언어 전환 단추에 쓰는 지구본이다.
//
// 테두리만 남는 도형은 "바깥 윤곽 + 반대 방향으로 감은 안쪽 윤곽" 으로
// 만든다. 채우기 규칙이 서로 지워 주어서 가운데가 비고 테두리만 남는다.
// 굵게 채운 도형으로 그리면 18픽셀 크기에서 원반처럼 뭉개진다.
var iconLanguage = svgIcon("language.svg",
	// 바깥 원 (가운데를 도려내 테두리만 남긴다)
	`<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 1.7a8.3 8.3 0 1 1 0 16.6 8.3 8.3 0 0 1 0-16.6z"/>`+
		// 적도
		`<path d="M2.4 11.25h19.2v1.5H2.4z"/>`+
		// 위·아래 위도선
		`<path d="M4.6 6.6h14.8v1.4H4.6zM4.6 16h14.8v1.4H4.6z"/>`+
		// 세로 경도선 (가운데)
		`<path d="M11.25 2.4h1.5v19.2h-1.5z"/>`+
		// 휘어 보이는 경도선 (타원 테두리)
		`<path d="M12 2a5 10 0 1 0 0 20 5 10 0 0 0 0-20zm0 1.7a3.4 8.3 0 1 1 0 16.6 3.4 8.3 0 0 1 0-16.6z"/>`)

// iconEnter 는 줄바꿈 단추의 꺾인 화살표(↵)다.
var iconEnter = svgIcon("enter.svg",
	// 오른쪽 위에서 내려와 왼쪽으로 꺾이는 선
	`<path d="M18.4 4.5h2v9.1H6.9v-2h11.5z"/>`+
		// 왼쪽 끝의 화살촉
		`<path d="M9.6 6.9l1.4 1.5-4.2 4.2 4.2 4.2-1.4 1.5-5.7-5.7z"/>`)

// iconBackspace 는 지우기 단추(⌫)다.
var iconBackspace = svgIcon("backspace.svg",
	// 왼쪽이 뾰족한 상자 (테두리만)
	`<path d="M9 4.4h11.3c1 0 1.9.8 1.9 1.9v11.4c0 1-.8 1.9-1.9 1.9H9c-.5 0-1-.2-1.4-.6l-6-6.4a1.9 1.9 0 0 1 0-2.6l6-6.4c.4-.4.9-.6 1.4-.6zm0 2L3.3 12.5 9 18.6h11.3V6.4z"/>`+
		// 가운데 X
		`<path d="M11.9 9l1.4-1.4 2.5 2.5 2.5-2.5L19.7 9l-2.5 2.5 2.5 2.5-1.4 1.4-2.5-2.5-2.5 2.5-1.4-1.4 2.5-2.5z"/>`)
