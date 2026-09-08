// keybutton.go - 직접 그리는 키패드 버튼.
//
// C++ 판은 BS_OWNERDRAW 로 RoundRect 를 그리고 WM_MOUSEMOVE / WM_MOUSELEAVE
// 로 호버 상태를 들고 있었다. 같은 일을 Fyne 커스텀 위젯으로 한다.
// 역할(자음 / 모음 / 문장부호 / 기능 / 모드 / 툴바)마다 색이 다르다.
package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/driver/desktop"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// KeyButton 은 눌리는 사각 버튼 하나다.
type KeyButton struct {
	widget.BaseWidget

	Label    string
	Role     BtnRole
	OnTapped func()

	// Icon 이 있으면 글자 대신 그림을 그린다.
	// ↵ 와 ⌫ 는 내장 글꼴에 없어서 글자로는 그릴 수 없다(icons.go 참고).
	Icon     fyne.Resource
	IconSize float32

	// Hint 는 마우스를 올렸을 때 상태줄에 띄울 설명이다. 비어 있으면 띄우지 않는다.
	Hint   string
	OnHint func(string) // 상태줄에 알리는 통로. nil 이면 아무것도 하지 않는다.

	Radius   float32
	TextSize float32
	Bold     bool
	MinW     float32
	MinH     float32

	pal     *Palette
	hovered bool
	pressed bool
}

var (
	_ fyne.Tappable      = (*KeyButton)(nil)
	_ desktop.Hoverable  = (*KeyButton)(nil)
	_ fyne.Widget        = (*KeyButton)(nil)
	_ desktop.Cursorable = (*KeyButton)(nil)
)

// NewKeyButton 은 버튼을 만든다. pal 은 테마가 바뀔 때 SetPalette 로 갈아 끼운다.
func NewKeyButton(label string, role BtnRole, pal *Palette, tapped func()) *KeyButton {
	b := &KeyButton{
		Label:    label,
		Role:     role,
		OnTapped: tapped,
		Radius:   12,
		TextSize: 17,
		IconSize: 20,
		pal:      pal,
		MinW:     44,
		MinH:     40,
	}
	b.ExtendBaseWidget(b)
	return b
}

// SetPalette 는 테마가 바뀌었을 때 색을 갈아 끼운다.
func (b *KeyButton) SetPalette(pal *Palette) {
	b.pal = pal
	b.Refresh()
}

// SetLabel 은 라벨을 바꾼다. 모드가 바뀔 때마다 12키가 이걸 부른다.
func (b *KeyButton) SetLabel(label string) {
	if b.Label == label {
		return
	}
	b.Label = label
	b.Refresh()
}

// SetRole 은 역할(색)을 바꾼다.
func (b *KeyButton) SetRole(role BtnRole) {
	if b.Role == role {
		return
	}
	b.Role = role
	b.Refresh()
}

func (b *KeyButton) Tapped(*fyne.PointEvent) {
	if b.OnTapped != nil {
		b.OnTapped()
	}
}

func (b *KeyButton) MouseIn(*desktop.MouseEvent) {
	b.hovered = true
	if b.OnHint != nil && b.Hint != "" {
		b.OnHint(b.Hint)
	}
	b.Refresh()
}

func (b *KeyButton) MouseMoved(*desktop.MouseEvent) {}

func (b *KeyButton) MouseOut() {
	b.hovered = false
	if b.OnHint != nil && b.Hint != "" {
		b.OnHint("")
	}
	b.Refresh()
}

func (b *KeyButton) MouseDown(*desktop.MouseEvent) {
	b.pressed = true
	b.Refresh()
}

func (b *KeyButton) MouseUp(*desktop.MouseEvent) {
	b.pressed = false
	b.Refresh()
}

func (b *KeyButton) Cursor() desktop.Cursor { return desktop.DefaultCursor }

// fill 은 지금 상태(기본 / 호버 / 눌림)에 맞는 배경색이다.
func (b *KeyButton) fill() color.Color {
	c := b.pal.Role[b.Role]
	switch {
	case b.pressed:
		return c[ColorPress]
	case b.hovered:
		return c[ColorHover]
	default:
		return c[ColorBase]
	}
}

func (b *KeyButton) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(b.fill())
	bg.CornerRadius = b.Radius
	bg.StrokeWidth = 1
	bg.StrokeColor = b.pal.Role[b.Role][ColorBorder]

	txt := canvas.NewText(b.Label, b.pal.Role[b.Role][ColorText])
	txt.Alignment = fyne.TextAlignCenter
	txt.TextSize = b.TextSize
	txt.TextStyle = fyne.TextStyle{Bold: b.Bold}
	txt.FontSource = fontFor(b.Bold)

	r := &keyRenderer{btn: b, bg: bg, txt: txt}
	if b.Icon != nil {
		r.img = canvas.NewImageFromResource(b.tintedIcon())
		r.img.FillMode = canvas.ImageFillContain
		txt.Hide()
	}
	return r
}

// tintedIcon 은 아이콘을 이 버튼의 글자색으로 물들인다.
// 역할마다 글자색이 다르므로 테마 기본색에 맡길 수 없다.
func (b *KeyButton) tintedIcon() fyne.Resource {
	if b.Icon == nil {
		return nil
	}
	return theme.NewColoredResource(b.Icon, "")
}

type keyRenderer struct {
	btn *KeyButton
	bg  *canvas.Rectangle
	txt *canvas.Text
	img *canvas.Image // 아이콘 버튼일 때만 있다
}

func (r *keyRenderer) Layout(size fyne.Size) {
	r.bg.Resize(size)
	r.bg.Move(fyne.NewPos(0, 0))

	if r.img != nil {
		s := r.btn.IconSize
		r.img.Resize(fyne.NewSize(s, s))
		r.img.Move(fyne.NewPos((size.Width-s)/2, (size.Height-s)/2))
		return
	}

	th := r.txt.MinSize().Height
	r.txt.Resize(fyne.NewSize(size.Width, th))
	r.txt.Move(fyne.NewPos(0, (size.Height-th)/2))
}

func (r *keyRenderer) MinSize() fyne.Size {
	var w, h float32
	if r.img != nil {
		w, h = r.btn.IconSize+12, r.btn.IconSize+10
	} else {
		m := r.txt.MinSize()
		w, h = m.Width+12, m.Height+10
	}
	if w < r.btn.MinW {
		w = r.btn.MinW
	}
	if h < r.btn.MinH {
		h = r.btn.MinH
	}
	return fyne.NewSize(w, h)
}

func (r *keyRenderer) Refresh() {
	c := r.btn.pal.Role[r.btn.Role]

	r.bg.FillColor = r.btn.fill()
	r.bg.StrokeColor = c[ColorBorder]
	r.bg.CornerRadius = r.btn.Radius
	r.bg.Refresh()

	if r.img != nil {
		r.img.Resource = r.btn.tintedIcon()
		r.img.Refresh()
		return
	}

	r.txt.Text = r.btn.Label
	r.txt.Color = c[ColorText]
	r.txt.TextSize = r.btn.TextSize
	r.txt.TextStyle = fyne.TextStyle{Bold: r.btn.Bold}
	r.txt.FontSource = fontFor(r.btn.Bold)
	r.txt.Refresh()
}

func (r *keyRenderer) Objects() []fyne.CanvasObject {
	if r.img != nil {
		return []fyne.CanvasObject{r.bg, r.img}
	}
	return []fyne.CanvasObject{r.bg, r.txt}
}

func (r *keyRenderer) Destroy() {}
