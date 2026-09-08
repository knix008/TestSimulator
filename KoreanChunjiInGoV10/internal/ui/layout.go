// layout.go - 키패드 배치.
//
// 위 4행은 3열 균등, 마지막 행은 기능 버튼 6개를 비율로 나눈다.
// x 좌표를 누적 비율로 계산해서 반올림 오차가 쌓이지 않게 한다
// (C++ 판 relayout() 과 같은 방식이다).
package ui

import "fyne.io/fyne/v2"

// weightedRow 는 자식들을 가로로 비율만큼 나눠 놓는 배치다.
type weightedRow struct {
	weights []int
	gap     float32
	sum     int
}

var _ fyne.Layout = (*weightedRow)(nil)

// newWeightedRow 는 비율 배치를 만든다. 비율의 개수는 자식 수와 같아야 한다.
func newWeightedRow(gap float32, weights ...int) *weightedRow {
	sum := 0
	for _, w := range weights {
		sum += w
	}
	if sum == 0 {
		sum = 1
	}
	return &weightedRow{weights: weights, gap: gap, sum: sum}
}

// newEqualRow 는 n 칸을 균등하게 나누는 배치다.
func newEqualRow(gap float32, n int) *weightedRow {
	w := make([]int, n)
	for i := range w {
		w[i] = 1
	}
	return newWeightedRow(gap, w...)
}

func (l *weightedRow) Layout(objects []fyne.CanvasObject, size fyne.Size) {
	n := len(objects)
	if n == 0 {
		return
	}

	span := size.Width - l.gap*float32(n-1)
	if span < 0 {
		span = 0
	}

	cum := 0
	for i, o := range objects {
		w := 1
		if i < len(l.weights) {
			w = l.weights[i]
		}

		x0 := l.gap*float32(i) + span*float32(cum)/float32(l.sum)
		x1 := l.gap*float32(i) + span*float32(cum+w)/float32(l.sum)
		cum += w

		o.Move(fyne.NewPos(x0, 0))
		o.Resize(fyne.NewSize(x1-x0, size.Height))
	}
}

func (l *weightedRow) MinSize(objects []fyne.CanvasObject) fyne.Size {
	n := len(objects)
	if n == 0 {
		return fyne.NewSize(0, 0)
	}

	// 가장 넓은 칸이 자기 최소 폭을 갖도록 전체 폭을 되짚어 계산한다.
	var need, h float32
	for i, o := range objects {
		m := o.MinSize()
		if m.Height > h {
			h = m.Height
		}

		w := 1
		if i < len(l.weights) {
			w = l.weights[i]
		}
		if per := m.Width * float32(l.sum) / float32(w); per > need {
			need = per
		}
	}
	return fyne.NewSize(need+l.gap*float32(n-1), h)
}
