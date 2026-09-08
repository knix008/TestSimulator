// settings.go - 설정 저장.
//
// C++ 판은 HKCU\Software\Chunjiin 에 DWORD 로 넣었다. 레지스트리는 Windows
// 에만 있으므로 여기서는 JSON 파일 하나로 바꾼다.
//
//	Windows  %AppData%\Chunjiin\settings.json
//	macOS    ~/Library/Application Support/Chunjiin/settings.json
//	Linux    ~/.config/Chunjiin/settings.json
package ui

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/knix008/chunjiin/internal/engine"
)

// Settings 는 설정 창에서 바꿀 수 있는 값들이다.
type Settings struct {
	Theme       int  `json:"theme"`       // Palettes 의 번호
	FontSize    int  `json:"fontSize"`    // 편집 영역 글꼴 크기
	MultitapMs  int  `json:"multitapMs"`  // 연타 순환이 유지되는 시간
	StartMode   int  `json:"startMode"`   // 시작할 때의 입력 모드
	ShowToolbar bool `json:"showToolbar"` //
	ShowStatus  bool `json:"showStatus"`  //

	// Language 는 화면 언어다 ("ko" 또는 "en").
	Language string `json:"language"`
}

// Defaults 는 처음 실행하거나 "기본값" 을 눌렀을 때의 설정이다.
var Defaults = Settings{
	Theme:       0,
	FontSize:    21,
	MultitapMs:  800,
	StartMode:   int(engine.ModeHangul),
	ShowToolbar: true,
	ShowStatus:  true,
	Language:    string(LangKO),
}

// FontChoices 는 설정 창에 나오는 글꼴 크기 목록이다.
var FontChoices = []int{16, 18, 21, 24, 28, 32}

// TapChoices 는 연타 유지 시간 목록이다(밀리초).
var TapChoices = []int{400, 600, 800, 1000, 1500, 2000}

func clampInt(v, lo, hi int) int {
	switch {
	case v < lo:
		return lo
	case v > hi:
		return hi
	default:
		return v
	}
}

// normalize 는 파일이 손상되었거나 손으로 고쳐졌을 때를 대비해 값을 다듬는다.
func (s *Settings) normalize() {
	s.Theme = clampInt(s.Theme, 0, len(Palettes)-1)
	s.FontSize = clampInt(s.FontSize, FontChoices[0], FontChoices[len(FontChoices)-1])
	s.MultitapMs = clampInt(s.MultitapMs, TapChoices[0], TapChoices[len(TapChoices)-1])
	s.StartMode = clampInt(s.StartMode, 0, int(engine.ModeCount)-1)

	known := false
	for _, l := range Langs {
		if s.Language == string(l.Code) {
			known = true
		}
	}
	if !known {
		s.Language = string(LangKO)
	}
}

// settingsPath 는 설정 파일의 자리다.
//
// 시험에서 갈아 끼울 수 있게 변수로 둔다. 환경 변수를 건드리는 것만으로는
// 운영체제마다 다른 os.UserConfigDir 를 확실히 돌려세울 수 없어서,
// 실제 사용자 설정을 덮어쓸 위험이 있다.
var settingsPath = func() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Chunjiin", "settings.json"), nil
}

// LoadSettings 는 설정을 읽는다.
// 파일이 없거나 읽을 수 없으면 기본값을 주되, 언어만은 운영체제 설정을 따른다.
func LoadSettings() Settings {
	s := Defaults
	s.Language = string(DetectLang())

	fallback := s

	path, err := settingsPath()
	if err != nil {
		return s
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return s
	}
	if json.Unmarshal(data, &s) != nil {
		return fallback
	}
	s.normalize()
	return s
}

// Save 는 설정을 파일에 쓴다. 실패해도 프로그램은 그대로 돌아간다.
func (s Settings) Save() error {
	path, err := settingsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

// SettingsLocation 은 프로그램 정보 창에 보여 줄 설정 파일 경로다.
func SettingsLocation() string {
	if p, err := settingsPath(); err == nil {
		return p
	}
	return "(알 수 없음)"
}
