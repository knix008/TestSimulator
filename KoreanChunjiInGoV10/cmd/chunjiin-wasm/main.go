//go:build js && wasm

// chunjiin-wasm - 웹 판이 쓰는 조합 엔진.
//
// 데스크톱 판과 똑같은 internal/engine 을 브라우저에서 쓸 수 있게 감싼 것이다.
// 화면은 web/ 아래의 HTML 과 CSS 가 그리고, 조합은 전부 여기로 넘어온다.
// 그래서 웹과 데스크톱의 조합 결과가 어긋날 수 없다.
//
// 자바스크립트에서 쓰는 법
//
//	chunjiin.key(3)          키패드 3번을 누른다
//	chunjiin.space()         띄어쓰기
//	chunjiin.state()         지금 상태를 객체로 받는다
//
// 모든 함수는 처리를 마친 뒤의 상태 객체를 돌려준다. 그래서 부른 쪽은
// 따로 state() 를 다시 부르지 않고 그 값으로 화면을 그리면 된다.
package main

import (
	"syscall/js"

	"github.com/knix008/chunjiin/internal/engine"
)

var state = engine.New()

func main() {
	js.Global().Set("chunjiin", api())

	// 준비가 끝났음을 화면 쪽에 알린다.
	if ready := js.Global().Get("onChunjiinReady"); ready.Type() == js.TypeFunction {
		ready.Invoke()
	}

	// 브라우저 탭이 살아 있는 동안 계속 돈다.
	select {}
}

// api 는 자바스크립트가 부를 함수들을 모아 돌려준다.
func api() js.Value {
	m := map[string]any{
		"key":           wrap(func(a []js.Value) { state.Key(argInt(a, 0)) }),
		"space":         wrap(func([]js.Value) { state.Space() }),
		"backspace":     wrap(func([]js.Value) { state.Backspace() }),
		"del":           wrap(func([]js.Value) { state.Delete() }),
		"enter":         wrap(func([]js.Value) { state.InsertChar('\n') }),
		"commit":        wrap(func([]js.Value) { state.Commit() }),
		"clear":         wrap(func([]js.Value) { state.Clear() }),
		"reset":         wrap(func([]js.Value) { state.Reset() }),
		"moveCursor":    wrap(func(a []js.Value) { state.MoveCursor(argInt(a, 0)) }),
		"setCursor":     wrap(func(a []js.Value) { state.SetCursor(argInt(a, 0)) }),
		"insertText":    wrap(func(a []js.Value) { state.InsertString(argString(a, 0)) }),
		"setText":       wrap(func(a []js.Value) { state.SetText(argString(a, 0)) }),
		"setMode":       wrap(func(a []js.Value) { state.SetMode(engine.InputMode(argInt(a, 0))) }),
		"cycleMode":     wrap(func([]js.Value) { state.CycleMode() }),
		"breakMultitap": wrap(func([]js.Value) { state.BreakMultitap() }),
		"state":         wrap(func([]js.Value) {}),
	}
	return js.ValueOf(m)
}

// wrap 은 동작 하나를 자바스크립트 함수로 만든다.
// 어떤 동작이든 끝나면 지금 상태를 돌려준다.
func wrap(fn func([]js.Value)) js.Func {
	return js.FuncOf(func(_ js.Value, args []js.Value) any {
		fn(args)
		return snapshot()
	})
}

func argInt(args []js.Value, i int) int {
	if i >= len(args) || args[i].Type() != js.TypeNumber {
		return 0
	}
	return args[i].Int()
}

func argString(args []js.Value, i int) string {
	if i >= len(args) || args[i].Type() != js.TypeString {
		return ""
	}
	return args[i].String()
}

// snapshot 은 화면을 그리는 데 필요한 것을 모두 담은 객체다.
func snapshot() map[string]any {
	labels := make([]any, engine.KeyCount)
	roles := make([]any, engine.KeyCount)
	for i := 0; i < engine.KeyCount; i++ {
		labels[i] = state.KeyLabel(i)
		roles[i] = roleName(state.KeyRoleOf(i))
	}

	modes := make([]any, engine.ModeCount)
	for i := range engine.ModeNames {
		modes[i] = engine.ModeNames[i]
	}

	return map[string]any{
		"text":        state.Text(),
		"cursor":      state.CursorPos,
		"length":      state.Len(),
		"mode":        int(state.NowMode),
		"modeName":    state.ModeName(),
		"modeNames":   modes,
		"composition": state.CompositionText(),
		"composing":   state.Hangul.FlagWriting,
		"labels":      labels,
		"roles":       roles,
	}
}

// roleName 은 키 역할을 CSS 클래스로 쓸 이름으로 바꾼다.
func roleName(r engine.KeyRole) string {
	switch r {
	case engine.RoleVowel:
		return "vowel"
	case engine.RoleMod:
		return "mod"
	default:
		return "cons"
	}
}
