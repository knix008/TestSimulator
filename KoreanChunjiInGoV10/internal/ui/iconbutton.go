// iconbutton.go - 툴바 아이콘 버튼.
//
// Fyne 의 widget.Toolbar 는 툴팁을 띄우지 못하고 색도 테마에 맡겨야 해서
// 직접 만든다.
//
// 툴팁은 이 위젯이 직접 그리지 않고 tipHost(창)에게 맡긴다.
// 예전에는 widget.PopUp 으로 띄웠는데, PopUp 은 Tappable 이고
// Canvas.Overlays() 에 올라가서 캔버스 전체의 마우스 이벤트를 가로챈다.
// 그러면 버튼이 MouseOut 을 받아 툴팁을 지우고, 툴팁이 사라지면 다시
// MouseIn 이 들어와 띄우기를 되풀이해서 마우스를 조금만 움직여도
// 깜빡거렸다. 지금은 마우스를 가로채지 않는 층에 그린다.
package ui

import (
	"image/color"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/driver/desktop"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// tipDelay 는 마우스를 올린 뒤 툴팁이 뜨기까지 기다리는 시간이다.
// 지나가다 스치는 것만으로 툴팁이 번쩍이지 않게 조금 늦춘다.
const tipDelay = 450 * time.Millisecond

// tipHost 는 툴팁을 그려 주는 쪽이다. 창(App)이 이를 맡는다.
type tipHost interface {
	ShowTip(text string, owner fyne.CanvasObject)
	HideTip()
}

// IconButton 은 아이콘 하나짜리 툴바 버튼이다.
type IconButton struct {
	widget.BaseWidget

	Icon     fyne.Resource
	Tip      string
	OnTapped func()

	pal      *Palette
	host     tipHost
	hovered  bool
	pressed  bool
	tipTimer *time.Timer
}

var (
	_ fyne.Tappable     = (*IconButton)(nil)
	_ desktop.Hoverable = (*IconButton)(nil)
)

const (
	toolBtnSize = 32
	toolIconPad = 7
)

// NewIconButton 은 툴바 버튼을 만든다.
// host 가 nil 이면 툴팁 없이 버튼으로만 동작한다.
func NewIconButton(icon fyne.Resource, tip string, pal *Palette, host tipHost, tapped func()) *IconButton {
	b := &IconButton{Icon: icon, Tip: tip, OnTapped: tapped, pal: pal, host: host}
	b.ExtendBaseWidget(b)
	return b
}

// SetPalette 는 테마가 바뀌었을 때 색을 갈아 끼운다.
func (b *IconButton) SetPalette(pal *Palette) {
	b.pal = pal
	b.Refresh()
}

// SetTip 은 툴팁 글을 바꾼다(언어를 바꿀 때 쓴다).
func (b *IconButton) SetTip(tip string) { b.Tip = tip }

func (b *IconButton) Tapped(*fyne.PointEvent) {
	b.cancelTip()
	if b.OnTapped != nil {
		b.OnTapped()
	}
}

func (b *IconButton) MouseIn(*desktop.MouseEvent) {
	b.hovered = true
	b.scheduleTip()
	b.Refresh()
}

// MouseMoved 는 아무것도 하지 않는다.
// 버튼 안에서 움직이는 동안 툴팁은 그대로 떠 있어야 한다.
func (b *IconButton) MouseMoved(*desktop.MouseEvent) {}

func (b *IconButton) MouseOut() {
	b.hovered = false
	b.cancelTip()
	b.Refresh()
}

func (b *IconButton) MouseDown(*desktop.MouseEvent) {
	b.pressed = true
	b.Refresh()
}

func (b *IconButton) MouseUp(*desktop.MouseEvent) {
	b.pressed = false
	b.Refresh()
}

// scheduleTip 은 잠시 뒤에 툴팁을 띄우도록 예약한다.
func (b *IconButton) scheduleTip() {
	if b.host == nil || b.Tip == "" {
		return
	}
	b.stopTimer()

	b.tipTimer = time.AfterFunc(tipDelay, func() {
		fyne.Do(func() {
			// 기다리는 사이에 마우스가 떠났으면 띄우지 않는다.
			if b.hovered {
				b.host.ShowTip(b.Tip, b)
			}
		})
	})
}

// cancelTip 은 예약을 지우고 떠 있는 툴팁도 내린다.
func (b *IconButton) cancelTip() {
	b.stopTimer()
	if b.host != nil {
		b.host.HideTip()
	}
}

func (b *IconButton) stopTimer() {
	if b.tipTimer != nil {
		b.tipTimer.Stop()
		b.tipTimer = nil
	}
}

// fill 은 지금 상태(기본 / 호버 / 눌림)에 맞는 배경색이다.
func (b *IconButton) fill() color.Color {
	c := b.pal.Role[RoleTool]
	switch {
	case b.pressed:
		return c[ColorPress]
	case b.hovered:
		return c[ColorHover]
	default:
		return c[ColorBase]
	}
}

func (b *IconButton) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(b.fill())
	bg.CornerRadius = 6

	img := canvas.NewImageFromResource(themedIcon(b.Icon))
	img.FillMode = canvas.ImageFillContain

	return &iconRenderer{btn: b, bg: bg, img: img}
}

type iconRenderer struct {
	btn *IconButton
	bg  *canvas.Rectangle
	img *canvas.Image
}

func (r *iconRenderer) Layout(size fyne.Size) {
	r.bg.Resize(size)
	r.bg.Move(fyne.NewPos(0, 0))

	r.img.Resize(fyne.NewSize(size.Width-toolIconPad*2, size.Height-toolIconPad*2))
	r.img.Move(fyne.NewPos(toolIconPad, toolIconPad))
}

func (r *iconRenderer) MinSize() fyne.Size {
	return fyne.NewSize(toolBtnSize, toolBtnSize)
}

func (r *iconRenderer) Refresh() {
	r.bg.FillColor = r.btn.fill()
	r.bg.Refresh()

	r.img.Resource = themedIcon(r.btn.Icon)
	r.img.Refresh()
}

func (r *iconRenderer) Objects() []fyne.CanvasObject {
	return []fyne.CanvasObject{r.bg, r.img}
}

func (r *iconRenderer) Destroy() { r.btn.cancelTip() }

// themedIcon 은 아이콘을 테마 글자색으로 물들인다.
// Fyne 의 기본 아이콘은 단색 SVG 라 색만 갈아 끼우면 된다.
func themedIcon(res fyne.Resource) fyne.Resource {
	if res == nil {
		return nil
	}
	return theme.NewThemedResource(res)
}
